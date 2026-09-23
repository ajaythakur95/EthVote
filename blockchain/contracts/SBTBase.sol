// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SBTBase
 * @dev Soulbound Token base — transfers permanently disabled (EIP-5192).
 */
abstract contract SBTBase is ERC721, Ownable {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);

    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner
    ) ERC721(name_, symbol_) Ownable() {}

    function transferFrom(address, address, uint256) public pure override {
        revert("SBT: Soulbound tokens cannot be transferred");
    }

    function safeTransferFrom(address, address, uint256) public pure override {
        revert("SBT: Soulbound tokens cannot be transferred");
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert("SBT: Soulbound tokens cannot be transferred");
    }

    function approve(address, uint256) public pure override {
        revert("SBT: Approval not allowed on Soulbound tokens");
    }

    function setApprovalForAll(address, bool) public pure override {
        revert("SBT: Approval not allowed on Soulbound tokens");
    }

    /// @dev EIP-5192: All tokens are always locked
    function locked(uint256 tokenId) external view returns (bool) {
        require(_ownerOf(tokenId) != address(0), "SBT: Token does not exist");
        return true;
    }

    function _emitLocked(uint256 tokenId) internal {
        emit Locked(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public view override returns (bool)
    {
        return interfaceId == 0xb45a3c0e || super.supportsInterface(interfaceId);
    }
}
