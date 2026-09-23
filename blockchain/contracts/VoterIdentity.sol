// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SBTBase.sol";

/**
 * @title VoterIdentity
 * @dev Soulbound NFT that creates a 1:1 mapping between a hashed Aadhaar ID
 *      and an Ethereum wallet address. Each citizen can hold exactly ONE SBT.
 *
 * Key design decisions:
 *  - aadhaarHash is keccak256(aadhaarNumber + secret_salt), never stored in plaintext
 *  - tokenURI is stored off-chain (IPFS), metadata contains: name, DOB, constituency
 *  - Admin (ECI backend) is the sole minter via onlyOwner
 *  - Revocation supported for flagged/deceased voters (burns token)
 */
contract VoterIdentity is SBTBase {

    // ─── State ─────────────────────────────────────────────────────────────

    uint256 private _tokenIdCounter;

    // aadhaarHash => tokenId (0 means unminted)
    mapping(bytes32 => uint256) public aadhaarHashToTokenId;

    // wallet address => tokenId (0 means unminted)
    mapping(address => uint256) public walletToTokenId;

    // tokenId => aadhaarHash (for reverse lookup)
    mapping(uint256 => bytes32) public tokenIdToAadhaarHash;

    // tokenId => IPFS metadata URI
    mapping(uint256 => string) private _tokenURIs;

    // tokenId => voter status
    mapping(uint256 => VoterStatus) public voterStatus;

    // ─── Enums & Structs ───────────────────────────────────────────────────

    enum VoterStatus {
        ACTIVE,       // Can vote
        SUSPENDED,    // Temporarily blocked (under review)
        REVOKED       // Permanently removed (fraud / deceased)
    }

    struct VoterRecord {
        uint256 tokenId;
        address wallet;
        bytes32 aadhaarHash;
        VoterStatus status;
        uint256 mintedAt;
        string metadataURI;
    }

    // ─── Events ────────────────────────────────────────────────────────────

    event IdentityMinted(
        uint256 indexed tokenId,
        address indexed wallet,
        bytes32 indexed aadhaarHash,
        uint256 timestamp
    );

    event IdentityRevoked(
        uint256 indexed tokenId,
        address indexed wallet,
        string reason,
        uint256 timestamp
    );

    event StatusUpdated(
        uint256 indexed tokenId,
        VoterStatus oldStatus,
        VoterStatus newStatus
    );

    // ─── Constructor ───────────────────────────────────────────────────────

    constructor(address initialOwner)
        SBTBase("EthVote Voter Identity", "EVID", initialOwner)
    {}

    // ─── Minting ───────────────────────────────────────────────────────────

    /**
     * @notice Mint a Voter Identity SBT. Called by backend after Aadhaar verification.
     * @param to         The voter's wallet address
     * @param aadhaarHash keccak256(aadhaarNumber + appSalt) — privacy preserving
     * @param metadataURI IPFS URI with non-sensitive voter metadata
     */
    function mintIdentity(
        address to,
        bytes32 aadhaarHash,
        string calldata metadataURI
    ) external onlyOwner returns (uint256) {
        require(to != address(0), "VoterIdentity: Invalid wallet address");
        require(aadhaarHash != bytes32(0), "VoterIdentity: Invalid Aadhaar hash");
        require(walletToTokenId[to] == 0, "VoterIdentity: Wallet already has an identity");
        require(aadhaarHashToTokenId[aadhaarHash] == 0, "VoterIdentity: Aadhaar already registered");

        _tokenIdCounter++;
        uint256 newTokenId = _tokenIdCounter;

        _safeMint(to, newTokenId);

        // Store mappings
        aadhaarHashToTokenId[aadhaarHash] = newTokenId;
        walletToTokenId[to] = newTokenId;
        tokenIdToAadhaarHash[newTokenId] = aadhaarHash;
        _tokenURIs[newTokenId] = metadataURI;
        voterStatus[newTokenId] = VoterStatus.ACTIVE;

        // Emit SBT locked event (EIP-5192)
        _emitLocked(newTokenId);

        emit IdentityMinted(newTokenId, to, aadhaarHash, block.timestamp);

        return newTokenId;
    }

    // ─── Status Management ─────────────────────────────────────────────────

    /**
     * @notice Update voter status (Admin only)
     */
    function updateStatus(uint256 tokenId, VoterStatus newStatus)
        external onlyOwner
    {
        require(_ownerOf(tokenId) != address(0), "VoterIdentity: Token does not exist");
        VoterStatus oldStatus = voterStatus[tokenId];
        voterStatus[tokenId] = newStatus;
        emit StatusUpdated(tokenId, oldStatus, newStatus);
    }

    /**
     * @notice Permanently revoke a voter identity (fraud / deceased)
     * @dev Burns the token and cleans up all mappings
     */
    function revokeIdentity(uint256 tokenId, string calldata reason)
        external onlyOwner
    {
        address voter = _ownerOf(tokenId);
        require(voter != address(0), "VoterIdentity: Token does not exist");

        bytes32 aadhaarHash = tokenIdToAadhaarHash[tokenId];

        // Clean mappings before burn
        delete aadhaarHashToTokenId[aadhaarHash];
        delete walletToTokenId[voter];
        delete tokenIdToAadhaarHash[tokenId];
        delete _tokenURIs[tokenId];
        delete voterStatus[tokenId];

        _burn(tokenId);

        emit IdentityRevoked(tokenId, voter, reason, block.timestamp);
    }

    // ─── View Functions ────────────────────────────────────────────────────

    /**
     * @notice Get full voter record by wallet address
     */
    function getVoterByWallet(address wallet)
        external view returns (VoterRecord memory)
    {
        uint256 tokenId = walletToTokenId[wallet];
        require(tokenId != 0, "VoterIdentity: No identity found for wallet");

        return VoterRecord({
            tokenId: tokenId,
            wallet: wallet,
            aadhaarHash: tokenIdToAadhaarHash[tokenId],
            status: voterStatus[tokenId],
            mintedAt: 0, // Stored off-chain for gas savings
            metadataURI: _tokenURIs[tokenId]
        });
    }

    /**
     * @notice Check if a wallet has a valid, active voter identity
     */
    function isVerifiedVoter(address wallet) external view returns (bool) {
        uint256 tokenId = walletToTokenId[wallet];
        if (tokenId == 0) return false;
        return voterStatus[tokenId] == VoterStatus.ACTIVE;
    }

    /**
     * @notice Check if an Aadhaar hash is already registered
     */
    function isAadhaarRegistered(bytes32 aadhaarHash) external view returns (bool) {
        return aadhaarHashToTokenId[aadhaarHash] != 0;
    }

    /**
     * @dev Override tokenURI to use stored IPFS URIs
     */
    function tokenURI(uint256 tokenId)
        public view override returns (string memory)
    {
        require(_ownerOf(tokenId) != address(0), "VoterIdentity: Token does not exist");
        return _tokenURIs[tokenId];
    }

    /**
     * @notice Total voter identities minted
     */
    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }
}
