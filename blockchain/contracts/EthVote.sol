// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./VoterIdentity.sol";

/**
 * @title EthVote
 * @dev Main election contract. Manages multi-elections, candidates, and vote casting.
 *
 * Security model:
 *  - Only verified voters (SBT holders) can vote
 *  - Each wallet can vote ONCE per election
 *  - Votes are stored as encrypted commitments (hash of voteData + nonce)
 *  - Tallies are revealed post-election by admin with decryption keys
 *  - ReentrancyGuard on vote casting
 */
contract EthVote is Ownable, ReentrancyGuard {

    // ─── State ─────────────────────────────────────────────────────────────

    VoterIdentity public immutable voterIdentityContract;

    uint256 private _electionIdCounter;
    uint256 private _candidateIdCounter;

    // electionId => Election
    mapping(uint256 => Election) public elections;

    // electionId => candidateId[]
    mapping(uint256 => uint256[]) public electionCandidates;

    // candidateId => Candidate
    mapping(uint256 => Candidate) public candidates;

    // electionId => wallet => hasVoted
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    // electionId => wallet => voteCommitment (encrypted ballot)
    mapping(uint256 => mapping(address => bytes32)) public voteCommitments;

    // candidateId => voteCount (only updated post-reveal)
    mapping(uint256 => uint256) public voteCounts;

    // ─── Enums & Structs ───────────────────────────────────────────────────

    enum ElectionStatus {
        CREATED,    // Configured, not yet open
        ACTIVE,     // Voting open
        PAUSED,     // Temporarily halted
        CLOSED,     // Voting ended, tallying in progress
        FINALIZED   // Results published
    }

    struct Election {
        uint256 id;
        string title;
        string description;
        string constituency;
        ElectionStatus status;
        uint256 startTime;
        uint256 endTime;
        uint256 totalVotes;
        uint256 createdAt;
        bool resultsPublished;
    }

    struct Candidate {
        uint256 id;
        uint256 electionId;
        address wallet;
        string name;
        string partyName;
        string partySymbolURI;   // IPFS URI
        string manifestoURI;     // IPFS URI
        bool approved;
        uint256 finalVoteCount;  // Set during FINALIZED phase only
    }

    // ─── Events ────────────────────────────────────────────────────────────

    event ElectionCreated(uint256 indexed electionId, string title, uint256 startTime, uint256 endTime);
    event ElectionStatusChanged(uint256 indexed electionId, ElectionStatus oldStatus, ElectionStatus newStatus);
    event CandidateRegistered(uint256 indexed candidateId, uint256 indexed electionId, address wallet, string name);
    event CandidateApproved(uint256 indexed candidateId, uint256 indexed electionId);
    event VoteCast(uint256 indexed electionId, address indexed voter, bytes32 commitment, uint256 timestamp);
    event ResultsPublished(uint256 indexed electionId, uint256 winnerCandidateId, uint256 winnerVotes);

    // ─── Modifiers ─────────────────────────────────────────────────────────

    modifier electionExists(uint256 electionId) {
        require(elections[electionId].id != 0, "EthVote: Election does not exist");
        _;
    }

    modifier onlyActiveElection(uint256 electionId) {
        require(elections[electionId].status == ElectionStatus.ACTIVE, "EthVote: Election is not active");
        require(block.timestamp >= elections[electionId].startTime, "EthVote: Election has not started yet");
        require(block.timestamp <= elections[electionId].endTime, "EthVote: Election has ended");
        _;
    }

    modifier onlyVerifiedVoter() {
        require(
            voterIdentityContract.isVerifiedVoter(msg.sender),
            "EthVote: Caller is not a verified voter"
        );
        _;
    }

    // ─── Constructor ───────────────────────────────────────────────────────

    constructor(address voterIdentityAddress, address initialOwner)
        Ownable()
    {
        require(voterIdentityAddress != address(0), "EthVote: Invalid VoterIdentity address");
        voterIdentityContract = VoterIdentity(voterIdentityAddress);
    }

    // ─── Election Management (Admin) ───────────────────────────────────────

    /**
     * @notice Create a new election
     */
    function createElection(
        string calldata title,
        string calldata description,
        string calldata constituency,
        uint256 startTime,
        uint256 endTime
    ) external onlyOwner returns (uint256) {
        require(startTime > block.timestamp, "EthVote: Start time must be in the future");
        require(endTime > startTime, "EthVote: End time must be after start time");
        require(bytes(title).length > 0, "EthVote: Title cannot be empty");

        _electionIdCounter++;
        uint256 electionId = _electionIdCounter;

        elections[electionId] = Election({
            id: electionId,
            title: title,
            description: description,
            constituency: constituency,
            status: ElectionStatus.CREATED,
            startTime: startTime,
            endTime: endTime,
            totalVotes: 0,
            createdAt: block.timestamp,
            resultsPublished: false
        });

        emit ElectionCreated(electionId, title, startTime, endTime);
        return electionId;
    }

    /**
     * @notice Admin: change election status
     */
    function setElectionStatus(uint256 electionId, ElectionStatus newStatus)
        external onlyOwner electionExists(electionId)
    {
        ElectionStatus oldStatus = elections[electionId].status;

        // Enforce valid transitions
        if (newStatus == ElectionStatus.ACTIVE) {
            require(
                oldStatus == ElectionStatus.CREATED || oldStatus == ElectionStatus.PAUSED,
                "EthVote: Cannot activate from current status"
            );
        } else if (newStatus == ElectionStatus.CLOSED) {
            require(
                oldStatus == ElectionStatus.ACTIVE || oldStatus == ElectionStatus.PAUSED,
                "EthVote: Cannot close from current status"
            );
        }

        elections[electionId].status = newStatus;
        emit ElectionStatusChanged(electionId, oldStatus, newStatus);
    }

    // ─── Candidate Management ──────────────────────────────────────────────

    /**
     * @notice Register as a candidate (requires verified voter identity)
     */
    function registerCandidate(
        uint256 electionId,
        string calldata name,
        string calldata partyName,
        string calldata partySymbolURI,
        string calldata manifestoURI
    ) external electionExists(electionId) onlyVerifiedVoter returns (uint256) {
        require(
            elections[electionId].status == ElectionStatus.CREATED,
            "EthVote: Candidate registration closed"
        );

        _candidateIdCounter++;
        uint256 candidateId = _candidateIdCounter;

        candidates[candidateId] = Candidate({
            id: candidateId,
            electionId: electionId,
            wallet: msg.sender,
            name: name,
            partyName: partyName,
            partySymbolURI: partySymbolURI,
            manifestoURI: manifestoURI,
            approved: false,     // Requires admin approval
            finalVoteCount: 0
        });

        electionCandidates[electionId].push(candidateId);

        emit CandidateRegistered(candidateId, electionId, msg.sender, name);
        return candidateId;
    }

    /**
     * @notice Admin: approve a candidate for the ballot
     */
    function approveCandidate(uint256 candidateId) external onlyOwner {
        require(candidates[candidateId].id != 0, "EthVote: Candidate does not exist");
        candidates[candidateId].approved = true;
        emit CandidateApproved(candidateId, candidates[candidateId].electionId);
    }

    // ─── Vote Casting ──────────────────────────────────────────────────────

    /**
     * @notice Cast an encrypted vote
     * @param electionId Target election
     * @param voteCommitment keccak256(candidateId + voterNonce + salt) — computed off-chain
     *
     * The actual candidateId is revealed post-election for tallying.
     * This prevents on-chain vote correlation during active voting.
     */
    function castVote(
        uint256 electionId,
        bytes32 voteCommitment
    )
        external
        nonReentrant
        electionExists(electionId)
        onlyActiveElection(electionId)
        onlyVerifiedVoter
    {
        require(!hasVoted[electionId][msg.sender], "EthVote: Already voted in this election");
        require(voteCommitment != bytes32(0), "EthVote: Invalid vote commitment");

        hasVoted[electionId][msg.sender] = true;
        voteCommitments[electionId][msg.sender] = voteCommitment;
        elections[electionId].totalVotes++;

        emit VoteCast(electionId, msg.sender, voteCommitment, block.timestamp);
    }

    /**
     * @notice Admin: publish final results after verification
     * @dev Called after off-chain tally verification. Sets final vote counts.
     */
    function publishResults(
        uint256 electionId,
        uint256[] calldata candidateIds,
        uint256[] calldata counts
    ) external onlyOwner electionExists(electionId) {
        require(
            elections[electionId].status == ElectionStatus.CLOSED,
            "EthVote: Election must be closed before publishing results"
        );
        require(candidateIds.length == counts.length, "EthVote: Array length mismatch");
        require(!elections[electionId].resultsPublished, "EthVote: Results already published");

        uint256 winnerVotes = 0;
        uint256 winnerCandidateId = 0;

        for (uint256 i = 0; i < candidateIds.length; i++) {
            candidates[candidateIds[i]].finalVoteCount = counts[i];
            voteCounts[candidateIds[i]] = counts[i];
            if (counts[i] > winnerVotes) {
                winnerVotes = counts[i];
                winnerCandidateId = candidateIds[i];
            }
        }

        elections[electionId].status = ElectionStatus.FINALIZED;
        elections[electionId].resultsPublished = true;

        emit ResultsPublished(electionId, winnerCandidateId, winnerVotes);
    }

    // ─── View Functions ────────────────────────────────────────────────────

    function getElectionCandidates(uint256 electionId)
        external view returns (uint256[] memory)
    {
        return electionCandidates[electionId];
    }

    function getApprovedCandidates(uint256 electionId)
        external view returns (Candidate[] memory)
    {
        uint256[] memory allIds = electionCandidates[electionId];
        uint256 count = 0;
        for (uint256 i = 0; i < allIds.length; i++) {
            if (candidates[allIds[i]].approved) count++;
        }

        Candidate[] memory approved = new Candidate[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < allIds.length; i++) {
            if (candidates[allIds[i]].approved) {
                approved[idx++] = candidates[allIds[i]];
            }
        }
        return approved;
    }

    function totalElections() external view returns (uint256) {
        return _electionIdCounter;
    }
}
