// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title AgentSpendingPolicy
/// @notice A human owner delegates bounded spending authority to an AI agent.
///         The payment agent must pass `checkSpend` before it signs a Payment
///         Mandate, and every settled payment is metered through `recordSpend`.
///         This keeps a human in control of autonomous agent payments.
contract AgentSpendingPolicy is AccessControl {
    bytes32 public constant METER_ROLE = keccak256("METER_ROLE");

    struct Policy {
        address owner;
        uint128 dailyCap;       // token base units (USDC/USDT: 6 decimals)
        uint128 perTxCap;
        uint64 expiresAt;
        bool anyMerchant;       // if false, only allow-listed merchants
        bool paused;
    }

    struct DailySpend {
        uint64 day;
        uint128 spent;
    }

    mapping(address => Policy) public policies;
    mapping(address => DailySpend) public dailySpend;
    mapping(address => mapping(address => bool)) public merchantAllowed;

    event AgentRegistered(address indexed agent, address indexed owner, uint128 dailyCap, uint128 perTxCap, uint64 expiresAt, bool anyMerchant);
    event MerchantAllowed(address indexed agent, address indexed merchant, bool allowed);
    event AgentPaused(address indexed agent, bool paused);
    event SpendRecorded(address indexed agent, address indexed merchant, uint256 amount, bytes32 indexed mandateHash, uint256 spentToday);

    error NotAgentOwner();
    error AgentAlreadyOwned();
    error SpendRejected(string reason);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    modifier onlyAgentOwner(address agent) {
        if (policies[agent].owner != msg.sender) revert NotAgentOwner();
        _;
    }

    /// @notice Register (or update) an agent's policy. The first caller becomes the owner.
    function setPolicy(
        address agent,
        uint128 dailyCap,
        uint128 perTxCap,
        uint64 expiresAt,
        bool anyMerchant
    ) external {
        Policy storage p = policies[agent];
        if (p.owner != address(0) && p.owner != msg.sender) revert AgentAlreadyOwned();
        p.owner = msg.sender;
        p.dailyCap = dailyCap;
        p.perTxCap = perTxCap;
        p.expiresAt = expiresAt;
        p.anyMerchant = anyMerchant;
        emit AgentRegistered(agent, msg.sender, dailyCap, perTxCap, expiresAt, anyMerchant);
    }

    function setMerchantAllowed(address agent, address merchant, bool allowed) external onlyAgentOwner(agent) {
        merchantAllowed[agent][merchant] = allowed;
        emit MerchantAllowed(agent, merchant, allowed);
    }

    function setPaused(address agent, bool paused) external onlyAgentOwner(agent) {
        policies[agent].paused = paused;
        emit AgentPaused(agent, paused);
    }

    /// @notice Amount the agent has spent in the current UTC day.
    function spentToday(address agent) public view returns (uint128) {
        DailySpend memory d = dailySpend[agent];
        return d.day == _today() ? d.spent : 0;
    }

    /// @notice Pre-flight check the payment agent runs before signing a mandate.
    function checkSpend(address agent, address merchant, uint256 amount)
        public
        view
        returns (bool ok, string memory reason)
    {
        Policy memory p = policies[agent];
        if (p.owner == address(0)) return (false, "agent not registered");
        if (p.paused) return (false, "agent paused by owner");
        if (p.expiresAt != 0 && block.timestamp > p.expiresAt) return (false, "policy expired");
        if (!p.anyMerchant && !merchantAllowed[agent][merchant]) return (false, "merchant not allowed");
        if (amount > p.perTxCap) return (false, "exceeds per-transaction cap");
        if (uint256(spentToday(agent)) + amount > p.dailyCap) return (false, "exceeds daily cap");
        return (true, "");
    }

    /// @notice Meter a settled payment against the agent's daily cap.
    function recordSpend(address agent, address merchant, uint256 amount, bytes32 mandateHash)
        external
        onlyRole(METER_ROLE)
    {
        (bool ok, string memory reason) = checkSpend(agent, merchant, amount);
        if (!ok) revert SpendRejected(reason);

        uint64 today = _today();
        DailySpend storage d = dailySpend[agent];
        if (d.day != today) {
            d.day = today;
            d.spent = 0;
        }
        d.spent += uint128(amount);
        emit SpendRecorded(agent, merchant, amount, mandateHash, d.spent);
    }

    function _today() internal view returns (uint64) {
        return uint64(block.timestamp / 1 days);
    }
}
