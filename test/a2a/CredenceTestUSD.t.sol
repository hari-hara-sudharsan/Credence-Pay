// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CredenceTestUSD} from "../../contracts/a2a/CredenceTestUSD.sol";

contract CredenceTestUSDTest is Test {
    CredenceTestUSD token;
    uint256 payerKey = 0xA11CE;
    address payer;
    address merchant = address(0xCAFE);
    address relayer = address(0xBEEF);

    function setUp() public {
        vm.warp(1_800_000_000);
        token = new CredenceTestUSD(address(this));
        payer = vm.addr(payerKey);
        token.mint(payer, 10e6);
    }

    function _sign(uint256 value, uint256 validBefore, bytes32 nonce, uint256 key) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(abi.encode(token.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(), payer, merchant, value, 0, validBefore, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        return vm.sign(key, digest);
    }

    function test_RelayerExecutesSignedAuthorization() public {
        (uint8 v, bytes32 r, bytes32 s) = _sign(1e6, 1_800_000_600, keccak256("n1"), payerKey);
        vm.prank(relayer);
        token.transferWithAuthorization(payer, merchant, 1e6, 0, 1_800_000_600, keccak256("n1"), v, r, s);
        assertEq(token.balanceOf(merchant), 1e6);
        assertEq(token.balanceOf(payer), 9e6);
    }

    function test_ReplayRejected() public {
        (uint8 v, bytes32 r, bytes32 s) = _sign(1e6, 1_800_000_600, keccak256("n1"), payerKey);
        token.transferWithAuthorization(payer, merchant, 1e6, 0, 1_800_000_600, keccak256("n1"), v, r, s);
        vm.expectRevert(CredenceTestUSD.AuthorizationUsedAlready.selector);
        token.transferWithAuthorization(payer, merchant, 1e6, 0, 1_800_000_600, keccak256("n1"), v, r, s);
    }

    function test_ExpiredRejected() public {
        (uint8 v, bytes32 r, bytes32 s) = _sign(1e6, 1_800_000_000, keccak256("n2"), payerKey);
        vm.expectRevert(CredenceTestUSD.AuthorizationExpired.selector);
        token.transferWithAuthorization(payer, merchant, 1e6, 0, 1_800_000_000, keccak256("n2"), v, r, s);
    }

    function test_WrongSignerRejected() public {
        (uint8 v, bytes32 r, bytes32 s) = _sign(1e6, 1_800_000_600, keccak256("n3"), 0xB0B);
        vm.expectRevert(CredenceTestUSD.InvalidSignature.selector);
        token.transferWithAuthorization(payer, merchant, 1e6, 0, 1_800_000_600, keccak256("n3"), v, r, s);
    }

    function test_FaucetCooldown() public {
        vm.prank(merchant);
        token.faucet();
        assertEq(token.balanceOf(merchant), 100e6);
        vm.prank(merchant);
        vm.expectRevert(CredenceTestUSD.FaucetCooldown.selector);
        token.faucet();
    }
}
