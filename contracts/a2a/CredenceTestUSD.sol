// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title CredenceTestUSD (cUSD)
/// @notice Testnet-only 6-decimal dollar with EIP-3009 `transferWithAuthorization`,
///         the same authorisation scheme HSP uses for USDC. It lets the Credence
///         sandbox rail execute real on-chain agent payments before HSP access is granted.
///         Not money: anyone can claim from the faucet.
contract CredenceTestUSD is ERC20, EIP712, Ownable {
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    uint256 public constant FAUCET_AMOUNT = 100e6;
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    mapping(address => mapping(bytes32 => bool)) public authorizationState;
    mapping(address => uint256) public lastFaucet;

    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);

    error AuthorizationNotYetValid();
    error AuthorizationExpired();
    error AuthorizationUsedAlready();
    error InvalidSignature();
    error FaucetCooldown();

    constructor(address owner_) ERC20("Credence Test USD", "cUSD") EIP712("Credence Test USD", "1") Ownable(owner_) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function faucet() external {
        if (block.timestamp < lastFaucet[msg.sender] + FAUCET_COOLDOWN) revert FaucetCooldown();
        lastFaucet[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (block.timestamp <= validAfter) revert AuthorizationNotYetValid();
        if (block.timestamp >= validBefore) revert AuthorizationExpired();
        if (authorizationState[from][nonce]) revert AuthorizationUsedAlready();

        bytes32 structHash = keccak256(abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce));
        if (ECDSA.recover(_hashTypedDataV4(structHash), v, r, s) != from) revert InvalidSignature();

        authorizationState[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
        _transfer(from, to, value);
    }
}
