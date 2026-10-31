// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AgentSpendingPolicy} from "../../contracts/a2a/AgentSpendingPolicy.sol";
import {A2ASettlementRegistry} from "../../contracts/a2a/A2ASettlementRegistry.sol";

contract A2ASettlementTest is Test {
    AgentSpendingPolicy policy;
    A2ASettlementRegistry registry;

    address admin = address(this);
    address human = address(0xA11CE);
    address buyerAgent = address(0xB0B);
    address merchantAgent = address(0xCAFE);
    address otherMerchant = address(0xBEEF);
    address usdc = address(0x054ed45810DbBAb8B27668922D110669c9D88D0a);

    uint128 constant USD = 1e6;

    function setUp() public {
        vm.warp(1_800_000_000);
        policy = new AgentSpendingPolicy(admin);
        registry = new A2ASettlementRegistry(admin, address(policy));
        policy.grantRole(policy.METER_ROLE(), address(registry));

        vm.prank(human);
        policy.setPolicy(buyerAgent, 100 * USD, 20 * USD, 0, false);
        vm.prank(human);
        policy.setMerchantAllowed(buyerAgent, merchantAgent, true);
    }

    function _settle(bytes32 h, uint128 amount) internal {
        registry.recordSettlement(h, buyerAgent, merchantAgent, usdc, amount, keccak256(abi.encode("flow", h)), keccak256(abi.encode("tx", h)));
    }

    // ---------- spending policy ----------

    function test_PolicyAllowsWithinCaps() public view {
        (bool ok,) = policy.checkSpend(buyerAgent, merchantAgent, 10 * USD);
        assertTrue(ok);
    }

    function test_PolicyRejectsUnlistedMerchant() public view {
        (bool ok, string memory reason) = policy.checkSpend(buyerAgent, otherMerchant, 1 * USD);
        assertFalse(ok);
        assertEq(reason, "merchant not allowed");
    }

    function test_PolicyRejectsPerTxCap() public view {
        (bool ok, string memory reason) = policy.checkSpend(buyerAgent, merchantAgent, 21 * USD);
        assertFalse(ok);
        assertEq(reason, "exceeds per-transaction cap");
    }

    function test_PolicyDailyCapAndReset() public {
        for (uint256 i = 0; i < 5; i++) _settle(keccak256(abi.encode(i)), 20 * USD);
        assertEq(policy.spentToday(buyerAgent), 100 * USD);

        (bool ok, string memory reason) = policy.checkSpend(buyerAgent, merchantAgent, 1 * USD);
        assertFalse(ok);
        assertEq(reason, "exceeds daily cap");

        vm.warp(block.timestamp + 1 days);
        assertEq(policy.spentToday(buyerAgent), 0);
        (ok,) = policy.checkSpend(buyerAgent, merchantAgent, 1 * USD);
        assertTrue(ok);
    }

    function test_OwnerCanPauseAgent() public {
        vm.prank(human);
        policy.setPaused(buyerAgent, true);
        (bool ok, string memory reason) = policy.checkSpend(buyerAgent, merchantAgent, 1 * USD);
        assertFalse(ok);
        assertEq(reason, "agent paused by owner");
    }

    function test_OnlyOwnerControlsPolicy() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(AgentSpendingPolicy.AgentAlreadyOwned.selector);
        policy.setPolicy(buyerAgent, type(uint128).max, type(uint128).max, 0, true);

        vm.prank(address(0xDEAD));
        vm.expectRevert(AgentSpendingPolicy.NotAgentOwner.selector);
        policy.setPaused(buyerAgent, false);
    }

    function test_PolicyExpiry() public {
        vm.prank(human);
        policy.setPolicy(buyerAgent, 100 * USD, 20 * USD, uint64(block.timestamp + 1 hours), false);
        vm.warp(block.timestamp + 2 hours);
        (bool ok, string memory reason) = policy.checkSpend(buyerAgent, merchantAgent, 1 * USD);
        assertFalse(ok);
        assertEq(reason, "policy expired");
    }

    function test_RecordSpendRequiresMeterRole() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        policy.recordSpend(buyerAgent, merchantAgent, 1, bytes32(0));
    }

    // ---------- settlement registry ----------

    function test_NewAgentStartsAtBaseAndPrepay() public view {
        assertEq(registry.trustScore(buyerAgent), 500);
        (A2ASettlementRegistry.Terms terms, uint256 limit,) = registry.termsFor(buyerAgent);
        assertEq(uint8(terms), uint8(A2ASettlementRegistry.Terms.PREPAY));
        assertEq(limit, 0);
    }

    function test_PrepaySettlementAnchorsMandateAndRaisesTrust() public {
        bytes32 h = keccak256("mandate-1");
        _settle(h, 5 * USD);

        A2ASettlementRegistry.Mandate memory m = registry.getMandate(h);
        assertEq(m.payer, buyerAgent);
        assertEq(uint8(m.status), uint8(A2ASettlementRegistry.Status.SETTLED));
        assertEq(m.hspFlowId, keccak256(abi.encode("flow", h)));
        assertEq(registry.trustScore(buyerAgent), 515);
        assertEq(registry.totalSettled(), 1);
    }

    function test_DuplicateMandateRejected() public {
        bytes32 h = keccak256("mandate-1");
        _settle(h, 5 * USD);
        vm.expectRevert(A2ASettlementRegistry.MandateNotOpen.selector);
        _settle(h, 5 * USD);
    }

    function test_TrustUnlocksNetThenCreditTerms() public {
        for (uint256 i = 0; i < 5; i++) _settle(keccak256(abi.encode("p", i)), 2 * USD);
        (A2ASettlementRegistry.Terms terms,, uint256 netDays) = registry.termsFor(buyerAgent);
        assertEq(uint8(terms), uint8(A2ASettlementRegistry.Terms.NET)); // 575
        assertEq(netDays, 7);

        vm.warp(block.timestamp + 1 days);
        for (uint256 i = 5; i < 20; i++) {
            if (i % 4 == 0) vm.warp(block.timestamp + 1 days);
            _settle(keccak256(abi.encode("p", i)), 2 * USD);
        }
        (terms,,) = registry.termsFor(buyerAgent);
        assertEq(uint8(terms), uint8(A2ASettlementRegistry.Terms.CREDIT)); // 800
    }

    function test_TabOnTimeSettlement() public {
        bytes32 h = keccak256("tab-1");
        registry.openTab(h, buyerAgent, merchantAgent, usdc, 10 * USD, A2ASettlementRegistry.Terms.NET, uint64(block.timestamp + 7 days));
        assertEq(registry.getStats(buyerAgent).outstanding, 10 * USD);

        vm.warp(block.timestamp + 3 days);
        _settle(h, 0);
        A2ASettlementRegistry.AgentStats memory s = registry.getStats(buyerAgent);
        assertEq(s.outstanding, 0);
        assertEq(s.onTimeCount, 1);
        assertEq(s.settledVolume, 10 * USD);
    }

    function test_LateSettlementPenalised() public {
        bytes32 h = keccak256("tab-late");
        registry.openTab(h, buyerAgent, merchantAgent, usdc, 10 * USD, A2ASettlementRegistry.Terms.NET, uint64(block.timestamp + 1 days));
        vm.warp(block.timestamp + 2 days);
        _settle(h, 0);
        assertEq(registry.getStats(buyerAgent).lateCount, 1);
        assertEq(registry.trustScore(buyerAgent), 461); // 500 + 1 (volume) - 40
    }

    function test_DefaultForcesPrepay() public {
        for (uint256 i = 0; i < 15; i++) _settle(keccak256(abi.encode("d", i)), 1 * USD);
        bytes32 h = keccak256("tab-default");
        registry.openTab(h, buyerAgent, merchantAgent, usdc, 10 * USD, A2ASettlementRegistry.Terms.CREDIT, uint64(block.timestamp + 1 days));

        vm.expectRevert(A2ASettlementRegistry.NotOverdue.selector);
        registry.markDefault(h);

        vm.warp(block.timestamp + 2 days);
        vm.prank(address(0x1234)); // permissionless once overdue
        registry.markDefault(h);

        (A2ASettlementRegistry.Terms terms,,) = registry.termsFor(buyerAgent);
        assertEq(uint8(terms), uint8(A2ASettlementRegistry.Terms.PREPAY));
        assertEq(registry.getStats(buyerAgent).outstanding, 0);
    }

    function test_PolicyViolationIsRecordedNotHidden() public {
        bytes32 h = keccak256("over-cap");
        _settle(h, 50 * USD); // above perTxCap: settlement still anchored, violation emitted
        assertEq(uint8(registry.getMandate(h).status), uint8(A2ASettlementRegistry.Status.SETTLED));
        assertEq(policy.spentToday(buyerAgent), 0);
    }

    function test_OnlySettlerCanRecord() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        _settle(keccak256("x"), 1 * USD);
    }

    function test_InvalidTabTermsRejected() public {
        vm.expectRevert(A2ASettlementRegistry.InvalidTerms.selector);
        registry.openTab(keccak256("t"), buyerAgent, merchantAgent, usdc, 1, A2ASettlementRegistry.Terms.PREPAY, uint64(block.timestamp + 1));
    }

    function testFuzz_ScoreAlwaysInRange(uint8 settles, uint8 lates) public {
        settles = uint8(bound(settles, 0, 40));
        lates = uint8(bound(lates, 0, 10));
        for (uint256 i = 0; i < settles; i++) _settle(keccak256(abi.encode("f", i)), 1 * USD);
        // Track time locally: under via-IR, block.timestamp can be cached across vm.warp.
        uint256 t = 1_800_000_000;
        for (uint256 i = 0; i < lates; i++) {
            bytes32 h = keccak256(abi.encode("l", i));
            registry.openTab(h, buyerAgent, merchantAgent, usdc, 1 * USD, A2ASettlementRegistry.Terms.NET, uint64(t + 1));
            t += 2;
            vm.warp(t);
            _settle(h, 0);
        }
        uint256 score = registry.trustScore(buyerAgent);
        assertGe(score, 300);
        assertLe(score, 900);
    }
}
