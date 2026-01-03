/**
 * Junction Sorting Bug Investigation
 *
 * Bug Report:
 * - Player: (889.04, 269.98)
 * - A black triangle appears connecting the ceiling to the 60-degree V apex at (850, 250)
 * - The visibility polygon goes: ceiling (517.818, 80) → apex (850, 250) → ceiling (878.07, 80)
 * - This creates a triangular spike because the apex and ceiling hit are on the same ray
 *   but are sorted with the far point (ceiling) before the near point (apex)
 *
 * Hypothesis:
 * - The shadow boundary ordering for junction pairs is inverted
 * - The code says "continuation comes FIRST" but for CCW traversal,
 *   the junction (closer point) should come first, then its continuation (farther point)
 */

import { RicochetSurface } from "@/surfaces/RicochetSurface";
import { WallSurface } from "@/surfaces/WallSurface";
import { isEndpoint, isHitPoint, isOriginPoint } from "@/trajectory-v2/geometry/SourcePoint";
import {
  type SurfaceChain,
  createMixedChain,
  createRicochetChain,
  createSingleSurfaceChain,
} from "@/trajectory-v2/geometry/SurfaceChain";
import { isJunctionPoint } from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  computeSurfaceOrientation,
  createFullCone,
  projectConeV2,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { describe, expect, it } from "vitest";

// =============================================================================
// BUG SCENARIO: Chain3 from demo (60-degree V-shape)
// =============================================================================

const PLAYER = { x: 889.0416036756611, y: 269.9802316262268 };
const CHAIN3_APEX = { x: 850, y: 250 };
const CEILING_HIT = { x: 517.8180338935447, y: 80 }; // From bug report

const SCREEN_BOUNDS = {
  minX: 0,
  minY: 0,
  maxX: 1280,
  maxY: 720,
};

/**
 * Create all demo chains for testing.
 * Note: Screen boundaries are handled internally by projectConeV2, not as chains.
 */
function createDemoChains(): SurfaceChain[] {
  const chains: SurfaceChain[] = [];

  // Chain1 (120-degree V)
  chains.push(
    createRicochetChain("chain-41", [
      { x: 598.0384757729337, y: 280 },
      { x: 650, y: 250 },
      { x: 701.9615242270663, y: 280 },
    ])
  );

  // Chain2 (90-degree V)
  chains.push(
    createRicochetChain("chain-42", [
      { x: 707.5735931288071, y: 292.42640687119285 },
      { x: 750, y: 250 },
      { x: 792.4264068711929, y: 292.42640687119285 },
    ])
  );

  // Chain3 (60-degree V) - THE BUG TARGET
  chains.push(
    createRicochetChain("chain-43", [
      { x: 820, y: 301.9615242270663 },
      { x: 850, y: 250 }, // apex
      { x: 880, y: 301.9615242270663 },
    ])
  );

  return chains;
}

/**
 * Helper to create a single-surface chain from coordinates.
 */
function makeSingleChain(
  id: string,
  start: Vector2,
  end: Vector2,
  canReflect: boolean
): SurfaceChain {
  const surface = canReflect
    ? new RicochetSurface(id, { start, end })
    : new WallSurface(id, { start, end });
  return createSingleSurfaceChain(surface);
}

/**
 * Create standalone surfaces as single-surface chains.
 * projectConeV2 only accepts SurfaceChain[], not standalone surfaces.
 */
function createStandaloneSurfaceChains(): SurfaceChain[] {
  const chains: SurfaceChain[] = [];

  // Room boundary: single closed chain with mixed reflectivity
  // Vertices in CCW order: top-left → top-right → bottom-right → bottom-left
  // Surfaces: 0=ceiling (reflective), 1=right-wall (non-reflective),
  //           2=floor (non-reflective), 3=left-wall (reflective)
  chains.push(
    createMixedChain(
      "room",
      [
        { x: 20, y: 80 },     // top-left
        { x: 1260, y: 80 },   // top-right
        { x: 1260, y: 700 },  // bottom-right
        { x: 20, y: 700 },    // bottom-left
      ],
      [true, false, false, true], // ceiling, right, floor, left
      true // closed chain
    )
  );

  // Platform
  chains.push(makeSingleChain("platform-0", { x: 50, y: 620 }, { x: 200, y: 620 }, false));

  // Mirror surfaces
  chains.push(makeSingleChain("mirror-left-0", { x: 250, y: 550 }, { x: 250, y: 150 }, true));
  chains.push(makeSingleChain("mirror-right-0", { x: 550, y: 150 }, { x: 550, y: 550 }, true));

  // Pyramid surfaces
  chains.push(makeSingleChain("pyramid-1-0", { x: 1030, y: 500 }, { x: 1070, y: 500 }, true));
  chains.push(makeSingleChain("pyramid-2-0", { x: 1015, y: 460 }, { x: 1085, y: 460 }, true));
  chains.push(makeSingleChain("pyramid-3-0", { x: 1000, y: 420 }, { x: 1100, y: 420 }, true));
  chains.push(makeSingleChain("pyramid-4-0", { x: 985, y: 380 }, { x: 1115, y: 380 }, true));

  // Grid surfaces (all from bug report)
  chains.push(makeSingleChain("grid-0-0-0", { x: 885, y: 200 }, { x: 915, y: 200 }, true));
  chains.push(makeSingleChain("grid-0-1-0", { x: 935, y: 200 }, { x: 965, y: 200 }, true));
  chains.push(makeSingleChain(
    "grid-0-2-0",
    { x: 1010.6066017177982, y: 189.3933982822018 },
    { x: 989.3933982822018, y: 210.6066017177982 },
    true
  ));
  chains.push(makeSingleChain(
    "grid-0-3-0",
    { x: 1039.3933982822018, y: 189.3933982822018 },
    { x: 1060.6066017177982, y: 210.6066017177982 },
    true
  ));
  chains.push(makeSingleChain("grid-1-0-0", { x: 900, y: 235 }, { x: 900, y: 265 }, true));
  chains.push(makeSingleChain(
    "grid-1-1-0",
    { x: 939.3933982822018, y: 239.3933982822018 },
    { x: 960.6066017177982, y: 260.6066017177982 },
    true
  ));
  chains.push(makeSingleChain("grid-1-2-0", { x: 985, y: 250 }, { x: 1015, y: 250 }, true));
  chains.push(makeSingleChain(
    "grid-1-3-0",
    { x: 1060.6066017177982, y: 260.6066017177982 },
    { x: 1039.3933982822018, y: 239.3933982822018 },
    true
  ));
  chains.push(makeSingleChain("grid-2-0-0", { x: 915, y: 300 }, { x: 885, y: 300 }, true));
  chains.push(makeSingleChain(
    "grid-2-1-0",
    { x: 960.6066017177982, y: 310.6066017177982 },
    { x: 939.3933982822018, y: 289.3933982822018 },
    true
  ));
  chains.push(makeSingleChain("grid-2-2-0", { x: 1000, y: 315 }, { x: 1000, y: 285 }, true));
  chains.push(makeSingleChain(
    "grid-2-3-0",
    { x: 1060.6066017177982, y: 289.3933982822018 },
    { x: 1039.3933982822018, y: 310.6066017177982 },
    true
  ));
  chains.push(makeSingleChain(
    "grid-3-0-0",
    { x: 889.3933982822018, y: 339.3933982822018 },
    { x: 910.6066017177982, y: 360.6066017177982 },
    true
  ));
  chains.push(makeSingleChain(
    "grid-3-1-0",
    { x: 939.3933982822018, y: 339.3933982822018 },
    { x: 960.6066017177982, y: 360.6066017177982 },
    true
  ));
  chains.push(makeSingleChain("grid-3-2-0", { x: 1000, y: 365 }, { x: 1000, y: 335 }, true));
  chains.push(makeSingleChain("grid-3-3-0", { x: 1050, y: 365 }, { x: 1050, y: 335 }, true));

  return chains;
}

/**
 * Get all chains for the demo scene.
 */
function getAllChains(): SurfaceChain[] {
  return [...createDemoChains(), ...createStandaloneSurfaceChains()];
}

describe("Junction Sorting Bug", () => {
  describe("Geometry verification", () => {
    it("should verify apex and ceiling hit are on same ray from player", () => {
      // Calculate vectors from player to each point
      const toApex = { x: CHAIN3_APEX.x - PLAYER.x, y: CHAIN3_APEX.y - PLAYER.y };
      const toCeiling = { x: CEILING_HIT.x - PLAYER.x, y: CEILING_HIT.y - PLAYER.y };

      // Cross product - should be ~0 if collinear
      const cross = toApex.x * toCeiling.y - toApex.y * toCeiling.x;

      console.log("=== Ray Collinearity Check ===");
      console.log(`Player: (${PLAYER.x.toFixed(2)}, ${PLAYER.y.toFixed(2)})`);
      console.log(`Apex: (${CHAIN3_APEX.x}, ${CHAIN3_APEX.y})`);
      console.log(`Ceiling hit: (${CEILING_HIT.x.toFixed(3)}, ${CEILING_HIT.y})`);
      console.log(`Vector to apex: (${toApex.x.toFixed(2)}, ${toApex.y.toFixed(2)})`);
      console.log(`Vector to ceiling: (${toCeiling.x.toFixed(2)}, ${toCeiling.y.toFixed(2)})`);
      console.log(`Cross product: ${cross.toFixed(4)}`);

      // They should be nearly collinear (cross product close to 0 relative to magnitude)
      const apexMag = Math.hypot(toApex.x, toApex.y);
      const ceilingMag = Math.hypot(toCeiling.x, toCeiling.y);
      const relativeCross = Math.abs(cross) / (apexMag * ceilingMag);

      console.log(`Apex distance: ${apexMag.toFixed(2)}`);
      console.log(`Ceiling distance: ${ceilingMag.toFixed(2)}`);
      console.log(`Relative cross: ${relativeCross.toFixed(6)}`);

      // Cross product relative to magnitudes should be very small
      expect(relativeCross).toBeLessThan(0.01); // Should be nearly collinear
    });

    it("should verify apex is CLOSER to player than ceiling hit", () => {
      const apexDist = Math.hypot(CHAIN3_APEX.x - PLAYER.x, CHAIN3_APEX.y - PLAYER.y);
      const ceilingDist = Math.hypot(CEILING_HIT.x - PLAYER.x, CEILING_HIT.y - PLAYER.y);

      console.log("=== Distance Comparison ===");
      console.log(`Apex distance: ${apexDist.toFixed(2)}`);
      console.log(`Ceiling distance: ${ceilingDist.toFixed(2)}`);
      console.log(`Ceiling is ${(ceilingDist / apexDist).toFixed(1)}x farther than apex`);

      expect(apexDist).toBeLessThan(ceilingDist);
    });
  });

  describe("Visibility polygon analysis", () => {
    it("should NO LONGER have the black triangle bug (FIXED)", () => {
      const chains = getAllChains();

      const source = createFullCone(PLAYER);
      const sourcePoints = projectConeV2(source, chains, SCREEN_BOUNDS);
      const polygon = toVector2Array(sourcePoints);

      console.log("=== Visibility Polygon ===");
      console.log(`Total vertices: ${polygon.length}`);

      // Find vertices near the apex (850, 250)
      const nearApex = polygon.filter(
        (v) => Math.abs(v.x - CHAIN3_APEX.x) < 1 && Math.abs(v.y - CHAIN3_APEX.y) < 1
      );
      console.log(`Vertices near apex (850, 250): ${nearApex.length}`);

      // Find vertices on the ceiling (y ≈ 80)
      const onCeiling = polygon.filter((v) => Math.abs(v.y - 80) < 1);
      console.log(`Vertices on ceiling (y ≈ 80): ${onCeiling.length}`);

      // Check for the problematic sequence
      // Look for: ceiling → apex → ceiling pattern (the bug pattern)
      let foundSpike = false;
      for (let i = 0; i < polygon.length; i++) {
        const prev = polygon[(i - 1 + polygon.length) % polygon.length];
        const curr = polygon[i];
        const next = polygon[(i + 1) % polygon.length];

        if (!prev || !curr || !next) continue;

        const prevOnCeiling = Math.abs(prev.y - 80) < 5;
        const currNearApex =
          Math.abs(curr.x - CHAIN3_APEX.x) < 5 && Math.abs(curr.y - CHAIN3_APEX.y) < 5;
        const nextOnCeiling = Math.abs(next.y - 80) < 5;

        if (prevOnCeiling && currNearApex && nextOnCeiling) {
          foundSpike = true;
          console.log("\n=== BLACK TRIANGLE SPIKE DETECTED ===");
          console.log(`  Prev (ceiling): (${prev.x.toFixed(2)}, ${prev.y.toFixed(2)})`);
          console.log(`  Curr (apex): (${curr.x.toFixed(2)}, ${curr.y.toFixed(2)})`);
          console.log(`  Next (ceiling): (${next.x.toFixed(2)}, ${next.y.toFixed(2)})`);
        }
      }

      // FIXED: No more spike pattern
      expect(foundSpike).toBe(false);
      console.log("\n=== NO SPIKE DETECTED (BUG FIXED) ===");
    });

    it("should trace source points around the apex", () => {
      const chains = getAllChains();

      const source = createFullCone(PLAYER);
      const sourcePoints = projectConeV2(source, chains, SCREEN_BOUNDS);

      console.log("=== Source Points Analysis ===");

      // Find the apex junction point
      const apexPoints = sourcePoints.filter((p) => {
        const xy = p.computeXY();
        return Math.abs(xy.x - CHAIN3_APEX.x) < 1 && Math.abs(xy.y - CHAIN3_APEX.y) < 1;
      });

      console.log(`Points near apex (850, 250): ${apexPoints.length}`);
      for (const p of apexPoints) {
        const xy = p.computeXY();
        const type = isJunctionPoint(p)
          ? "junction"
          : isEndpoint(p)
            ? "endpoint"
            : isHitPoint(p)
              ? "hit"
              : isOriginPoint(p)
                ? "origin"
                : "unknown";
        console.log(`  ${type} at (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) key=${p.getKey()}`);
      }

      // Find points near the ceiling hit
      const ceilingPoints = sourcePoints.filter((p) => {
        const xy = p.computeXY();
        return Math.abs(xy.y - 80) < 1 && xy.x > 500 && xy.x < 900;
      });

      console.log(`\nPoints on ceiling (500 < x < 900, y ≈ 80): ${ceilingPoints.length}`);
      for (const p of ceilingPoints) {
        const xy = p.computeXY();
        let type = "unknown";
        if (isJunctionPoint(p)) {
          type = "junction";
        } else if (isEndpoint(p)) {
          type = "endpoint";
        } else if (isHitPoint(p)) {
          type = `hit on ${p.hitSurface?.id}`;
        } else if (isOriginPoint(p)) {
          type = "origin";
        }
        console.log(`  ${type} at (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)})`);
      }

      // The apex should be a JunctionPoint
      const hasJunctionApex = apexPoints.some((p) => isJunctionPoint(p));
      expect(hasJunctionApex).toBe(true);
    });
  });

  describe("Sorting order verification", () => {
    it("should confirm the ceiling hit is the continuation of the apex junction", () => {
      const chains = getAllChains();

      const source = createFullCone(PLAYER);
      const sourcePoints = projectConeV2(source, chains, SCREEN_BOUNDS);

      // Find the apex junction
      const apexPoint = sourcePoints.find((p) => {
        const xy = p.computeXY();
        return Math.abs(xy.x - CHAIN3_APEX.x) < 1 && Math.abs(xy.y - CHAIN3_APEX.y) < 1;
      });

      // Find the ceiling hit at (517.82, 80)
      const ceilingPoint = sourcePoints.find((p) => {
        const xy = p.computeXY();
        return Math.abs(xy.x - 517.818) < 2 && Math.abs(xy.y - 80) < 2;
      });

      console.log("=== Junction-Continuation Relationship ===");

      if (apexPoint && ceilingPoint) {
        console.log(`Apex: ${apexPoint.getKey()}`);
        console.log(`Ceiling hit: ${ceilingPoint.getKey()}`);

        // Check if apex is a JunctionPoint
        const apexIsJunction = isJunctionPoint(apexPoint);
        console.log(`Apex is JunctionPoint: ${apexIsJunction}`);

        // Check if ceiling is a HitPoint (continuation)
        const ceilingIsHit = isHitPoint(ceilingPoint);
        console.log(`Ceiling is HitPoint: ${ceilingIsHit}`);

        // These should be a paired ray (junction + continuation)
        expect(apexIsJunction).toBe(true);
        expect(ceilingIsHit).toBe(true);

        // The bug is that they're not being recognized as a pair,
        // or the pair ordering is inverted
        console.log("\nThe apex junction should have a continuation ray that hits the ceiling.");
        console.log("In handleCollinearPoints(), lines 304-321, junction pairs are sorted with");
        console.log("continuation BEFORE junction, but this is INVERTED for CCW traversal.");
      }
    });

    it("should verify apex is sorted BEFORE its continuation (FIXED)", () => {
      const chains = getAllChains();

      const source = createFullCone(PLAYER);
      const sourcePoints = projectConeV2(source, chains, SCREEN_BOUNDS);

      // Find indices of apex and ceiling points on the same ray
      let apexIndex = -1;
      let ceilingHitIndex = -1;

      for (let i = 0; i < sourcePoints.length; i++) {
        const p = sourcePoints[i];
        if (!p) continue;
        const xy = p.computeXY();

        if (Math.abs(xy.x - CHAIN3_APEX.x) < 1 && Math.abs(xy.y - CHAIN3_APEX.y) < 1) {
          apexIndex = i;
        }

        // Look for the specific ceiling hit around x=517
        if (Math.abs(xy.x - 517.818) < 2 && Math.abs(xy.y - 80) < 2) {
          ceilingHitIndex = i;
        }
      }

      console.log("=== Sorting Order Analysis ===");
      console.log(`Apex index: ${apexIndex}`);
      console.log(`Ceiling hit (517, 80) index: ${ceilingHitIndex}`);

      // Assert that we found both points
      expect(apexIndex).toBeGreaterThanOrEqual(0);
      expect(ceilingHitIndex).toBeGreaterThanOrEqual(0);

      const n = sourcePoints.length;
      const forwardFromApexToCeiling = (ceilingHitIndex - apexIndex + n) % n;
      const forwardFromCeilingToApex = (apexIndex - ceilingHitIndex + n) % n;

      // FIXED: Apex (closer) should now come BEFORE ceiling (farther)
      const apexBeforeCeiling = forwardFromApexToCeiling < forwardFromCeilingToApex;
      console.log(`Apex comes before ceiling: ${apexBeforeCeiling}`);
      expect(apexBeforeCeiling).toBe(true);
    });

    it("VERIFICATION: sorting order is now correct for junction pairs (FIXED)", () => {
      const chains = getAllChains();
      const source = createFullCone(PLAYER);
      const sourcePoints = projectConeV2(source, chains, SCREEN_BOUNDS);

      // Find indices
      let apexIndex = -1;
      let ceilingHitIndex = -1;

      for (let i = 0; i < sourcePoints.length; i++) {
        const p = sourcePoints[i];
        if (!p) continue;
        const xy = p.computeXY();

        if (Math.abs(xy.x - CHAIN3_APEX.x) < 1 && Math.abs(xy.y - CHAIN3_APEX.y) < 1) {
          apexIndex = i;
        }
        if (Math.abs(xy.x - 517.818) < 2 && Math.abs(xy.y - 80) < 2) {
          ceilingHitIndex = i;
        }
      }

      // Both points must be found
      expect(apexIndex).toBeGreaterThanOrEqual(0);
      expect(ceilingHitIndex).toBeGreaterThanOrEqual(0);

      // Verify they're on the same ray (collinear)
      const apexPoint = sourcePoints[apexIndex];
      const ceilingPointHit = sourcePoints[ceilingHitIndex];
      if (!apexPoint || !ceilingPointHit) return;
      const apexXY = apexPoint.computeXY();
      const ceilingXY = ceilingPointHit.computeXY();

      const toApex = { x: apexXY.x - PLAYER.x, y: apexXY.y - PLAYER.y };
      const toCeiling = { x: ceilingXY.x - PLAYER.x, y: ceilingXY.y - PLAYER.y };
      const cross = toApex.x * toCeiling.y - toApex.y * toCeiling.x;
      const apexDist = Math.hypot(toApex.x, toApex.y);
      const ceilingDist = Math.hypot(toCeiling.x, toCeiling.y);
      const relativeCross = Math.abs(cross) / (apexDist * ceilingDist);

      // They should be collinear (same ray)
      expect(relativeCross).toBeLessThan(0.01);

      // Verify apex is CLOSER than ceiling
      expect(apexDist).toBeLessThan(ceilingDist);

      // FIXED: Apex (near) now comes BEFORE ceiling (far) in sorted order
      const n = sourcePoints.length;
      const forwardFromApexToCeiling = (ceilingHitIndex - apexIndex + n) % n;
      const forwardFromCeilingToApex = (apexIndex - ceilingHitIndex + n) % n;

      const apexBeforeCeiling = forwardFromApexToCeiling < forwardFromCeilingToApex;

      console.log("\n=== FIX VERIFICATION ===");
      console.log(`Apex index: ${apexIndex}, Ceiling index: ${ceilingHitIndex}`);
      console.log(
        `Apex distance: ${apexDist.toFixed(2)}, Ceiling distance: ${ceilingDist.toFixed(2)}`
      );
      console.log(`Apex comes before ceiling in sorted order: ${apexBeforeCeiling}`);
      console.log("\n>>> FIX CONFIRMED: Junction (near) comes BEFORE continuation (far) <<<");

      // Assert the fix is working
      expect(apexBeforeCeiling).toBe(true);
    });
  });

  // ===========================================================================
  // MULTI-POSITION TESTS - Phase 1 of Junction Pair Ordering Investigation
  // ===========================================================================

  describe("Multi-position orientation analysis", () => {
    // Test positions relative to chain3 apex (850, 250)
    const POSITIONS = {
      RIGHT: { x: 889.0416036756611, y: 269.9802316262268 }, // Original bug position
      LEFT: { x: 750, y: 270 },
      ABOVE: { x: 850, y: 150 },
      BELOW: { x: 850, y: 400 },
    };

    // Chain3 surfaces for orientation analysis
    const CHAIN3_SURFACES = {
      before: {
        id: "chain-43-0",
        start: { x: 820, y: 301.9615242270663 },
        end: { x: 850, y: 250 }, // apex
      },
      after: {
        id: "chain-43-1",
        start: { x: 850, y: 250 }, // apex
        end: { x: 880, y: 301.9615242270663 },
      },
    };

    /**
     * Test a specific player position for sorting behavior.
     * Returns analysis data about the junction orientation and sorting.
     */
    function analyzePosition(player: Vector2, positionName: string) {
      const chains = getAllChains();
      const source = createFullCone(player);
      const sourcePoints = projectConeV2(source, chains, SCREEN_BOUNDS);
      const polygon = toVector2Array(sourcePoints);

      // Find apex and its continuation in the polygon
      let apexIndex = -1;
      let ceilingHitIndex = -1;
      let ceilingXY: Vector2 | null = null;

      for (let i = 0; i < sourcePoints.length; i++) {
        const p = sourcePoints[i];
        if (!p) continue;
        const xy = p.computeXY();

        // Apex is at (850, 250)
        if (Math.abs(xy.x - CHAIN3_APEX.x) < 1 && Math.abs(xy.y - CHAIN3_APEX.y) < 1) {
          apexIndex = i;
        }

        // Ceiling hit is at y ≈ 80 on the same ray as apex
        if (Math.abs(xy.y - 80) < 2 && isHitPoint(p)) {
          // Check if this is on the same ray as the apex
          const toApex = { x: CHAIN3_APEX.x - player.x, y: CHAIN3_APEX.y - player.y };
          const toPoint = { x: xy.x - player.x, y: xy.y - player.y };
          const cross = toApex.x * toPoint.y - toApex.y * toPoint.x;
          const apexMag = Math.hypot(toApex.x, toApex.y);
          const pointMag = Math.hypot(toPoint.x, toPoint.y);
          const relativeCross = Math.abs(cross) / (apexMag * pointMag);

          if (relativeCross < 0.01) {
            // On the same ray
            ceilingHitIndex = i;
            ceilingXY = xy;
          }
        }
      }

      // Compute surface orientations relative to player
      const beforeSurface = new RicochetSurface(CHAIN3_SURFACES.before.id, {
        start: CHAIN3_SURFACES.before.start,
        end: CHAIN3_SURFACES.before.end,
      });
      const afterSurface = new RicochetSurface(CHAIN3_SURFACES.after.id, {
        start: CHAIN3_SURFACES.after.start,
        end: CHAIN3_SURFACES.after.end,
      });

      const beforeOrientation = computeSurfaceOrientation(beforeSurface, player);
      const afterOrientation = computeSurfaceOrientation(afterSurface, player);

      // Determine if there's a black triangle spike
      let hasSpike = false;
      for (let i = 0; i < polygon.length; i++) {
        const prev = polygon[(i - 1 + polygon.length) % polygon.length];
        const curr = polygon[i];
        const next = polygon[(i + 1) % polygon.length];

        if (!prev || !curr || !next) continue;

        const prevOnCeiling = Math.abs(prev.y - 80) < 5;
        const currNearApex =
          Math.abs(curr.x - CHAIN3_APEX.x) < 5 && Math.abs(curr.y - CHAIN3_APEX.y) < 5;
        const nextOnCeiling = Math.abs(next.y - 80) < 5;

        if (prevOnCeiling && currNearApex && nextOnCeiling) {
          hasSpike = true;
          break;
        }
      }

      // Determine sorting order
      let sortingOrder: "junction-first" | "continuation-first" | "no-continuation" = "no-continuation";
      if (apexIndex >= 0 && ceilingHitIndex >= 0) {
        const n = sourcePoints.length;
        const forwardFromCeilingToApex = (apexIndex - ceilingHitIndex + n) % n;
        const forwardFromApexToCeiling = (ceilingHitIndex - apexIndex + n) % n;

        if (forwardFromCeilingToApex < forwardFromApexToCeiling) {
          sortingOrder = "continuation-first"; // Bug: far point before near point
        } else {
          sortingOrder = "junction-first"; // Correct: near point before far point
        }
      }

      return {
        positionName,
        player,
        apexIndex,
        ceilingHitIndex,
        ceilingXY,
        hasSpike,
        sortingOrder,
        beforeOrientation: {
          firstEndpoint: beforeOrientation.firstEndpoint,
          crossProduct: beforeOrientation.crossProduct,
        },
        afterOrientation: {
          firstEndpoint: afterOrientation.firstEndpoint,
          crossProduct: afterOrientation.crossProduct,
        },
        hasContinuation: ceilingHitIndex >= 0,
      };
    }

    it("should analyze sorting from RIGHT of V (original bug position, now fixed)", () => {
      const result = analyzePosition(POSITIONS.RIGHT, "RIGHT");

      console.log("\n=== POSITION: RIGHT of V ===");
      console.log(`Player: (${result.player.x.toFixed(2)}, ${result.player.y.toFixed(2)})`);
      console.log(`Apex index: ${result.apexIndex}`);
      console.log(`Ceiling hit index: ${result.ceilingHitIndex}`);
      console.log(`Has continuation: ${result.hasContinuation}`);
      console.log(`Sorting order: ${result.sortingOrder}`);
      console.log(`Has spike (bug): ${result.hasSpike}`);
      console.log("Surface orientations:");
      console.log(`  Before surface: firstEndpoint=${result.beforeOrientation.firstEndpoint}, cross=${result.beforeOrientation.crossProduct.toFixed(4)}`);
      console.log(`  After surface: firstEndpoint=${result.afterOrientation.firstEndpoint}, cross=${result.afterOrientation.crossProduct.toFixed(4)}`);

      // FIXED: Junction pairs now use distance-based ordering (junction first)
      expect(result.hasContinuation).toBe(true);
      expect(result.hasSpike).toBe(false); // No more spike!
      expect(result.sortingOrder).toBe("junction-first"); // Correct order
    });

    it("should analyze sorting from LEFT of V", () => {
      const result = analyzePosition(POSITIONS.LEFT, "LEFT");

      console.log("\n=== POSITION: LEFT of V ===");
      console.log(`Player: (${result.player.x.toFixed(2)}, ${result.player.y.toFixed(2)})`);
      console.log(`Apex index: ${result.apexIndex}`);
      console.log(`Ceiling hit index: ${result.ceilingHitIndex}`);
      console.log(`Has continuation: ${result.hasContinuation}`);
      console.log(`Sorting order: ${result.sortingOrder}`);
      console.log(`Has spike (bug): ${result.hasSpike}`);
      console.log("Surface orientations:");
      console.log(`  Before surface: firstEndpoint=${result.beforeOrientation.firstEndpoint}, cross=${result.beforeOrientation.crossProduct.toFixed(4)}`);
      console.log(`  After surface: firstEndpoint=${result.afterOrientation.firstEndpoint}, cross=${result.afterOrientation.crossProduct.toFixed(4)}`);

      // From left, the junction BLOCKS because both surfaces face the same way
      // (opposite of RIGHT position). This is expected behavior.
      // The apex may or may not be found depending on how blocking is handled
      // Key insight: before=CW, after=CCW - opposite of RIGHT position
      expect(result.beforeOrientation.crossProduct).toBeLessThan(0); // CW
      expect(result.afterOrientation.crossProduct).toBeGreaterThan(0); // CCW
    });

    it("should analyze sorting from ABOVE V", () => {
      const result = analyzePosition(POSITIONS.ABOVE, "ABOVE");

      console.log("\n=== POSITION: ABOVE V ===");
      console.log(`Player: (${result.player.x.toFixed(2)}, ${result.player.y.toFixed(2)})`);
      console.log(`Apex index: ${result.apexIndex}`);
      console.log(`Ceiling hit index: ${result.ceilingHitIndex}`);
      console.log(`Has continuation: ${result.hasContinuation}`);
      console.log(`Sorting order: ${result.sortingOrder}`);
      console.log(`Has spike (bug): ${result.hasSpike}`);
      console.log("Surface orientations:");
      console.log(`  Before surface: firstEndpoint=${result.beforeOrientation.firstEndpoint}, cross=${result.beforeOrientation.crossProduct.toFixed(4)}`);
      console.log(`  After surface: firstEndpoint=${result.afterOrientation.firstEndpoint}, cross=${result.afterOrientation.crossProduct.toFixed(4)}`);

      // From above, continuation might not hit ceiling
      expect(result.apexIndex).toBeGreaterThanOrEqual(0);
    });

    it("should analyze sorting from BELOW V", () => {
      const result = analyzePosition(POSITIONS.BELOW, "BELOW");

      console.log("\n=== POSITION: BELOW V ===");
      console.log(`Player: (${result.player.x.toFixed(2)}, ${result.player.y.toFixed(2)})`);
      console.log(`Apex index: ${result.apexIndex}`);
      console.log(`Ceiling hit index: ${result.ceilingHitIndex}`);
      console.log(`Has continuation: ${result.hasContinuation}`);
      console.log(`Sorting order: ${result.sortingOrder}`);
      console.log(`Has spike (bug): ${result.hasSpike}`);
      console.log("Surface orientations:");
      console.log(`  Before surface: firstEndpoint=${result.beforeOrientation.firstEndpoint}, cross=${result.beforeOrientation.crossProduct.toFixed(4)}`);
      console.log(`  After surface: firstEndpoint=${result.afterOrientation.firstEndpoint}, cross=${result.afterOrientation.crossProduct.toFixed(4)}`);

      // From below, the V-shape should block, so no continuation
      // (player can't see through the back of the V)
    });

    it("SUMMARY: compares all positions to identify the correct ordering pattern", () => {
      const allResults = [
        analyzePosition(POSITIONS.RIGHT, "RIGHT"),
        analyzePosition(POSITIONS.LEFT, "LEFT"),
        analyzePosition(POSITIONS.ABOVE, "ABOVE"),
        analyzePosition(POSITIONS.BELOW, "BELOW"),
      ];

      console.log("\n=== MULTI-POSITION SUMMARY ===");
      console.log("| Position | Apex | Ceiling | Continuation | Sorting | Spike | Before Cross | After Cross |");
      console.log("|----------|------|---------|--------------|---------|-------|--------------|-------------|");

      for (const r of allResults) {
        const beforeCross = r.beforeOrientation.crossProduct.toFixed(1);
        const afterCross = r.afterOrientation.crossProduct.toFixed(1);
        console.log(
          `| ${r.positionName.padEnd(8)} | ${String(r.apexIndex).padEnd(4)} | ${String(r.ceilingHitIndex).padEnd(7)} | ${String(r.hasContinuation).padEnd(12)} | ${r.sortingOrder.padEnd(17)} | ${String(r.hasSpike).padEnd(5)} | ${beforeCross.padEnd(12)} | ${afterCross.padEnd(11)} |`
        );
      }

      // Analysis: Look for the pattern
      console.log("\n=== PATTERN ANALYSIS ===");
      for (const r of allResults) {
        if (r.hasContinuation) {
          // Expected: When before surface cross > 0, start comes first (CCW)
          // When after surface cross > 0, start comes first (CCW)
          const beforeCCW = r.beforeOrientation.crossProduct > 0 ? "CCW" : "CW";
          const afterCCW = r.afterOrientation.crossProduct > 0 ? "CCW" : "CW";
          console.log(`${r.positionName}: before=${beforeCCW}, after=${afterCCW}, sorting=${r.sortingOrder}, hasSpike=${r.hasSpike}`);
        }
      }

      // FIXED: No positions should have a spike anymore
      const hasAnySpike = allResults.some((r) => r.hasSpike);
      expect(hasAnySpike).toBe(false);
    });

    it("VERIFIED FIX: junction pairs now use distance-based ordering (closer first)", () => {
      /**
       * INSIGHT FROM ANALYSIS:
       *
       * For junction-continuation pairs, the CORRECT ordering is DISTANCE-BASED:
       * - Junction is CLOSER to origin → junction should come FIRST
       * - Continuation is FARTHER from origin → continuation should come SECOND
       *
       * This is already the default behavior in handleCollinearPoints() for
       * non-paired points (final tiebreaker: "closer first").
       *
       * THE FIX (APPLIED): Inverted the return values for junction pairs:
       *   if (jp1 && isHitPoint(p2)) return -1;  // junction before continuation
       *   if (jp2 && isHitPoint(p1)) return 1;   // junction before continuation
       *
       * This makes junction pairs use the same "closer first" rule as everything else.
       *
       * WHY THIS IS CORRECT:
       * - For pass-through junctions, the junction is where light EXITS the obstacle
       * - The continuation represents where the ray goes AFTER exiting
       * - In CCW traversal, exit points come before their continuations (like endpoints)
       */

      const result = analyzePosition(POSITIONS.RIGHT, "RIGHT");

      // FIXED: Now uses correct distance-based ordering
      expect(result.sortingOrder).toBe("junction-first");
      expect(result.hasSpike).toBe(false);

      console.log("\n=== FIX VERIFIED ===");
      console.log("Sorting order: junction-first (correct!)");
      console.log("Has spike: false (no more black triangle!)");
      console.log("\nFix applied at: ConeProjectionV2.ts handleCollinearPoints()");
    });
  });
});
