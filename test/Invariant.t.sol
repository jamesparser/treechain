// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Base} from "./Base.t.sol";
import {Params} from "../src/Params.sol";
import {TreeNFT} from "../src/TreeNFT.sol";
import {StakingRewards} from "../src/StakingRewards.sol";
import {VerificationBounty} from "../src/VerificationBounty.sol";

/// @dev Random walk over plant / stake / verify / claim / unstake / time; the invariants must hold throughout.
contract Handler is Test {
    Base public immutable b;
    address[] public actors;
    uint256 public salt;

    constructor(Base b_, address[] memory actors_) {
        b = b_;
        actors = actors_;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function plant(uint256 actorSeed, int32 dLat, int32 dLon) external {
        dLat = int32(bound(dLat, -3000, 3000));
        dLon = int32(bound(dLon, -3000, 3000));
        TreeNFT nft = b.nft(); // resolve BEFORE vm.prank (a prank only covers the next call)
        bytes32 photo = keccak256(abi.encode(++salt));
        vm.prank(_actor(actorSeed));
        try nft.plant(11_562_200 + dLat, 104_916_000 + dLon, photo, "ipfs://x") {} catch {}
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 0, 2 * Params.PRODUCTION_PERIOD));
    }

    function stake(uint256, uint256 idSeed) external {
        TreeNFT nft = b.nft();
        address staking = address(b.staking());
        uint256 n = nft.totalSupply();
        if (n == 0) return;
        uint256 id = nft.tokenByIndex(idSeed % n);
        address owner = nft.ownerOf(id);
        vm.prank(owner);
        try nft.safeTransferFrom(owner, staking, id) {} catch {}
    }

    function verify(uint256 actorSeed, uint256 idSeed, bool alive) external {
        TreeNFT nft = b.nft();
        VerificationBounty bounty = b.bounty();
        uint256 n = nft.totalSupply();
        if (n == 0) return;
        uint256 id = nft.tokenByIndex(idSeed % n);
        TreeNFT.Tree memory t = nft.getTree(id);
        bytes32 photo = keccak256(abi.encode(++salt));
        // dead reports are rare so trees live long enough to exercise the full chain
        bool verdict = alive || salt % 7 != 0;
        vm.prank(_actor(actorSeed));
        try bounty.verify(id, t.latE6, t.lonE6, photo, "ipfs://e", verdict) {} catch {}
    }

    function claim(uint256 idSeed) external {
        TreeNFT nft = b.nft();
        StakingRewards staking = b.staking();
        uint256 n = nft.totalSupply();
        if (n == 0) return;
        uint256 id = nft.tokenByIndex(idSeed % n);
        (address staker,,) = staking.stakes(id);
        if (staker == address(0)) return;
        vm.prank(staker);
        try staking.claim(id) {} catch {}
    }

    function unstake(uint256 idSeed) external {
        TreeNFT nft = b.nft();
        StakingRewards staking = b.staking();
        uint256 n = nft.totalSupply();
        if (n == 0) return;
        uint256 id = nft.tokenByIndex(idSeed % n);
        (address staker,,) = staking.stakes(id);
        if (staker == address(0)) return;
        vm.prank(staker);
        try staking.unstake(id) {} catch {}
    }
}

contract InvariantTest is Base {
    Handler internal handler;

    function setUp() public override {
        super.setUp();
        address[] memory actors = new address[](4);
        actors[0] = alice;
        actors[1] = bob;
        actors[2] = carol;
        actors[3] = biz;
        handler = new Handler(this, actors);
        targetContract(address(handler));
    }

    /// no matter what happens, total supply never exceeds 1.00 $Tree per planted tree
    function invariant_supplyNeverExceedsOnePerTree() public view {
        assertLe(token.totalSupply(), nft.totalSupply() * Params.TOTAL_PER_TREE);
    }

    /// the team gets exactly 0.05 per tree, never more
    function invariant_teamShareIsExact() public view {
        assertEq(token.balanceOf(team), nft.totalSupply() * Params.TEAM);
    }

    /// no tree ever has more than 10 checks, and verifier pay is bounded by 0.45 per tree
    function invariant_verifierPayBounded() public view {
        uint256 n = nft.totalSupply();
        uint256 checks;
        for (uint256 i = 0; i < n; i++) {
            uint8 c = nft.getTree(nft.tokenByIndex(i)).checks;
            assertLe(c, Params.MAX_CHECKS);
            checks += c;
        }
        uint256 paid = token.balanceOf(bob) + token.balanceOf(carol) + token.balanceOf(biz) + token.balanceOf(alice);
        // alice/bob/carol/biz also hold planter shares, so check the upper bound on the total they could hold
        assertLe(paid, n * (Params.PLANTER_UPFRONT + Params.PLANTER_STAKING) + checks * Params.VERIFIER_PER_CHECK);
    }

    /// no two trees are ever closer than 15 m (independent equirectangular check at this latitude)
    function invariant_noTwoTreesWithin15m() public view {
        uint256 n = nft.totalSupply();
        if (n > 12) n = 12; // keep the O(n^2) check cheap
        for (uint256 i = 0; i < n; i++) {
            TreeNFT.Tree memory a = nft.getTree(nft.tokenByIndex(i));
            for (uint256 j = i + 1; j < n; j++) {
                TreeNFT.Tree memory c = nft.getTree(nft.tokenByIndex(j));
                uint256 dLat = uint256(a.latE6 > c.latE6 ? int256(a.latE6) - c.latE6 : int256(c.latE6) - a.latE6);
                uint256 dLon = uint256(a.lonE6 > c.lonE6 ? int256(a.lonE6) - c.lonE6 : int256(c.lonE6) - a.lonE6);
                uint256 latMm = dLat * 111_195 / 1000; // 1e-6 deg of latitude = 111.195 mm
                uint256 lonMm = dLon * 10_893 / 100; // x cos(11.56 deg) = 108.93 mm
                assertGe(latMm * latMm + lonMm * lonMm, 14_800 * 14_800);
            }
        }
    }
}

/// @dev Guards against vacuous invariants: proves the handler's actions really do plant, verify, stake and mint.
contract HandlerSanityTest is Base {
    function test_handlerPathsReallyExecute() public {
        address[] memory actors = new address[](4);
        actors[0] = alice;
        actors[1] = bob;
        actors[2] = carol;
        actors[3] = biz;
        Handler h = new Handler(this, actors);

        h.plant(0, 0, 0); // alice plants
        assertEq(nft.totalSupply(), 1, "plant works");
        h.stake(0, 0);
        assertEq(nft.ownerOf(1), address(staking), "stake works");
        h.warp(PERIOD); // exactly one period
        h.verify(1, 0, true); // bob verifies (salt chosen so it is not a dead report)
        assertGt(token.balanceOf(bob), 0, "verify pays");
        h.claim(0);
        assertGt(token.balanceOf(alice), 0.25e18, "claim streams");
        assertGt(token.totalSupply(), 0.30e18);
    }
}
