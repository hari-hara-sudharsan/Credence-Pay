// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface ITrustReceiptRegistry {
    function issueReceipt(
        address entity,
        string calldata actionType,
        int256 trustImpact,
        bytes32 proofHash
    ) external returns (uint256);
}

/**
 * @title CreditPassportV2
 * @notice Standard ERC721 registry representing verifiable credit passport credentials.
 */
contract CreditPassportV2 is ERC721URIStorage, Ownable {
    uint256 public nextTokenId;

    struct Passport {
        bytes32 passportHash;
        bytes32 attestationHash;
        address wallet;
        string metadataURI;
        uint256 issuedAt;
        uint256 expiresAt;
        bool revoked;
        string entityType;
        uint256 trustScore;
        string financialTier;
        uint256 lastUpdated;
    }

    // Storage Mappings
    mapping(bytes32 => Passport) public passports;
    mapping(address => bytes32) public walletPassports;      // wallet -> active passport hash
    mapping(bytes32 => uint256) public passportTokens;       // passport hash -> tokenId
    mapping(uint256 => bytes32) public tokenPassports;       // tokenId -> passport hash

    // Events
    event PassportMinted(bytes32 indexed passportHash, address indexed wallet, uint256 indexed tokenId);
    event PassportRefreshed(bytes32 indexed oldPassportHash, bytes32 indexed newPassportHash, address indexed wallet);
    event PassportRevoked(bytes32 indexed passportHash);
    event TrustReceiptCallFailed(address indexed entity, string actionType);

    constructor() ERC721("Credence Credit Passport V2", "CCPv2") Ownable(msg.sender) {}

    address public trustReceiptRegistry;

    function setTrustReceiptRegistry(address _registry) external onlyOwner {
        trustReceiptRegistry = _registry;
    }

    /**
     * @notice Mints a new Credit Passport V2 representing a verifiable financial credential.
     */
    function mintPassport(
        bytes32 passportHash,
        bytes32 attestationHash,
        address wallet,
        string calldata metadataURI,
        uint256 expiresAt,
        string calldata entityType,
        uint256 trustScore,
        string calldata financialTier
    ) external returns (uint256) {
        require(passports[passportHash].wallet == address(0), "Passport already minted");
        require(wallet != address(0), "Invalid wallet address");
        require(expiresAt > block.timestamp, "Expiry must be in the future");

        uint256 tokenId = nextTokenId;
        nextTokenId++;

        // Mint standard ERC721 token
        _mint(wallet, tokenId);
        _setTokenURI(tokenId, metadataURI);

        // Save credential metadata
        passports[passportHash] = Passport({
            passportHash: passportHash,
            attestationHash: attestationHash,
            wallet: wallet,
            metadataURI: metadataURI,
            issuedAt: block.timestamp,
            expiresAt: expiresAt,
            revoked: false,
            entityType: entityType,
            trustScore: trustScore,
            financialTier: financialTier,
            lastUpdated: block.timestamp
        });

        walletPassports[wallet] = passportHash;
        passportTokens[passportHash] = tokenId;
        tokenPassports[tokenId] = passportHash;

        if (trustReceiptRegistry != address(0)) {
            try ITrustReceiptRegistry(trustReceiptRegistry).issueReceipt(
                wallet,
                "PASSPORT_CREATED",
                50,
                passportHash
            ) returns (uint256) {
                // Success
            } catch {
                emit TrustReceiptCallFailed(wallet, "PASSPORT_CREATED");
            }
        }

        emit PassportMinted(passportHash, wallet, tokenId);
        return tokenId;
    }

    /**
     * @notice Refreshes credit parameters, deactivating the old credential reference and mapping the new one.
     */
    function refreshPassport(
        bytes32 oldPassportHash,
        bytes32 newPassportHash,
        string calldata newMetadataURI,
        uint256 newExpiresAt,
        string calldata entityType,
        uint256 trustScore,
        string calldata financialTier
    ) external {
        Passport storage oldPassport = passports[oldPassportHash];
        require(oldPassport.wallet != address(0), "Old passport not found");
        require(!oldPassport.revoked, "Old passport is revoked");
        require(passports[newPassportHash].wallet == address(0), "New passport already exists");
        require(newExpiresAt > block.timestamp, "New expiry must be in the future");

        address wallet = oldPassport.wallet;
        uint256 tokenId = passportTokens[oldPassportHash];

        // Update token URI
        _setTokenURI(tokenId, newMetadataURI);

        // Deactivate old hash reference
        oldPassport.revoked = true;

        // Register new hash record
        passports[newPassportHash] = Passport({
            passportHash: newPassportHash,
            attestationHash: oldPassport.attestationHash,
            wallet: wallet,
            metadataURI: newMetadataURI,
            issuedAt: block.timestamp,
            expiresAt: newExpiresAt,
            revoked: false,
            entityType: entityType,
            trustScore: trustScore,
            financialTier: financialTier,
            lastUpdated: block.timestamp
        });

        walletPassports[wallet] = newPassportHash;
        passportTokens[newPassportHash] = tokenId;
        tokenPassports[tokenId] = newPassportHash;

        emit PassportRefreshed(oldPassportHash, newPassportHash, wallet);
    }

    /**
     * @notice Revokes a credit passport credential.
     */
    function revokePassport(bytes32 passportHash) external {
        Passport storage passport = passports[passportHash];
        require(passport.wallet != address(0), "Passport not found");
        require(!passport.revoked, "Passport already revoked");

        passport.revoked = true;
        emit PassportRevoked(passportHash);
    }

    /**
     * @notice Verifies whether a credit passport credential is valid.
     */
    function verifyPassport(bytes32 passportHash)
        external
        view
        returns (
            bool exists,
            bool verified,
            bool revoked,
            bool expired,
            string memory metadataURI
        )
    {
        Passport memory passport = passports[passportHash];
        exists = (passport.wallet != address(0));
        if (exists) {
            revoked = passport.revoked;
            expired = (block.timestamp > passport.expiresAt);
            verified = (!revoked && !expired);
            metadataURI = passport.metadataURI;
        } else {
            revoked = false;
            expired = false;
            verified = false;
            metadataURI = "";
        }
    }

    /**
     * @notice Retrieves detailed immutable metadata for a passport.
     */
    function getPassport(bytes32 passportHash) external view returns (Passport memory) {
        require(passports[passportHash].wallet != address(0), "Passport not found");
        return passports[passportHash];
    }
}
