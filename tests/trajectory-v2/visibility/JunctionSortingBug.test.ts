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
import {
  isEndpoint,
  isHitPoint,
  isOriginPoint,
} from "@/trajectory-v2/geometry/SourcePoint";
import { type SurfaceChain, createRicochetChain, createSingleSurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";
import { isJunctionPoint } from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
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
function makeSingleChain(id: string, start: Vector2, end: Vector2, canReflect: boolean): SurfaceChain {
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
  return [
    // Ceiling - IMPORTANT for the bug
    makeSingleChain("ceiling-0", { x: 0, y: 80 }, { x: 1280, y: 80 }, true),
    // Floor
    makeSingleChain("floor-0", { x: 0, y: 700 }, { x: 1280, y: 700 }, false),
    // Left wall
    makeSingleChain("left-wall-0", { x: 20, y: 700 }, { x: 20, y: 80 }, true),
    // Right wall
    makeSingleChain("right-wall-0", { x: 1260, y: 80 }, { x: 1260, y: 700 }, false),
    // Platform
    makeSingleChain("platform-0", { x: 50, y: 620 }, { x: 200, y: 620 }, false),
    // Mirror surfaces
    makeSingleChain("mirror-left-0", { x: 250, y: 550 }, { x: 250, y: 150 }, true),
    makeSingleChain("mirror-right-0", { x: 550, y: 150 }, { x: 550, y: 550 }, true),
    // Pyramid surfaces
    makeSingleChain("pyramid-1-0", { x: 1030, y: 500 }, { x: 1070, y: 500 }, true),
    makeSingleChain("pyramid-2-0", { x: 1015, y: 460 }, { x: 1085, y: 460 }, true),
    makeSingleChain("pyramid-3-0", { x: 1000, y: 420 }, { x: 1100, y: 420 }, true),
    makeSingleChain("pyramid-4-0", { x: 985, y: 380 }, { x: 1115, y: 380 }, true),
    // Grid surfaces (all from bug report)
    makeSingleChain("grid-0-0-0", { x: 885, y: 200 }, { x: 915, y: 200 }, true),
    makeSingleChain("grid-0-1-0", { x: 935, y: 200 }, { x: 965, y: 200 }, true),
    makeSingleChain("grid-0-2-0", { x: 1010.6066017177982, y: 189.3933982822018 }, { x: 989.3933982822018, y: 210.6066017177982 }, true),
    makeSingleChain("grid-0-3-0", { x: 1039.3933982822018, y: 189.3933982822018 }, { x: 1060.6066017177982, y: 210.6066017177982 }, true),
    makeSingleChain("grid-1-0-0", { x: 900, y: 235 }, { x: 900, y: 265 }, true),
    makeSingleChain("grid-1-1-0", { x: 939.3933982822018, y: 239.3933982822018 }, { x: 960.6066017177982, y: 260.6066017177982 }, true),
    makeSingleChain("grid-1-2-0", { x: 985, y: 250 }, { x: 1015, y: 250 }, true),
    makeSingleChain("grid-1-3-0", { x: 1060.6066017177982, y: 260.6066017177982 }, { x: 1039.3933982822018, y: 239.3933982822018 }, true),
    makeSingleChain("grid-2-0-0", { x: 915, y: 300 }, { x: 885, y: 300 }, true),
    makeSingleChain("grid-2-1-0", { x: 960.6066017177982, y: 310.6066017177982 }, { x: 939.3933982822018, y: 289.3933982822018 }, true),
    makeSingleChain("grid-2-2-0", { x: 1000, y: 315 }, { x: 1000, y: 285 }, true),
    makeSingleChain("grid-2-3-0", { x: 1060.6066017177982, y: 289.3933982822018 }, { x: 1039.3933982822018, y: 310.6066017177982 }, true),
    makeSingleChain("grid-3-0-0", { x: 889.3933982822018, y: 339.3933982822018 }, { x: 910.6066017177982, y: 360.6066017177982 }, true),
    makeSingleChain("grid-3-1-0", { x: 939.3933982822018, y: 339.3933982822018 }, { x: 960.6066017177982, y: 360.6066017177982 }, true),
    makeSingleChain("grid-3-2-0", { x: 1000, y: 365 }, { x: 1000, y: 335 }, true),
    makeSingleChain("grid-3-3-0", { x: 1050, y: 365 }, { x: 1050, y: 335 }, true),
  ];
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
    it("should reproduce the black triangle bug", () => {
      const chains = getAllChains();

      const source = createFullCone(PLAYER);
      const sourcePoints = projectConeV2(source, chains, SCREEN_BOUNDS);
      const polygon = toVector2Array(sourcePoints);

      console.log("=== Visibility Polygon ===");
      console.log(`Total vertices: ${polygon.length}`);
      console.log("All vertices:");
      for (let i = 0; i < polygon.length; i++) {
        const v = polygon[i];
        if (v) console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
      }

      // Find vertices near the apex (850, 250)
      const nearApex = polygon.filter(
        (v) => Math.abs(v.x - CHAIN3_APEX.x) < 1 && Math.abs(v.y - CHAIN3_APEX.y) < 1
      );
      console.log(`Vertices near apex (850, 250): ${nearApex.length}`);
      for (const v of nearApex) {
        console.log(`  (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
      }

      // Find vertices on the ceiling (y ≈ 80)
      const onCeiling = polygon.filter((v) => Math.abs(v.y - 80) < 1);
      console.log(`Vertices on ceiling (y ≈ 80): ${onCeiling.length}`);
      for (const v of onCeiling) {
        console.log(`  (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
      }

      // Check for the problematic sequence
      // Look for: ceiling → apex → ceiling pattern
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

      // The bug should manifest as a spike pattern
      // This test confirms the bug exists
      expect(foundSpike).toBe(true);
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

    it("should identify if apex is sorted AFTER its continuation (the bug)", () => {
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

      if (apexIndex >= 0 && ceilingHitIndex >= 0) {
        const apexPoint = sourcePoints[apexIndex];
        const ceilingPoint = sourcePoints[ceilingHitIndex];
        if (!apexPoint || !ceilingPoint) return;
        const apexXY = apexPoint.computeXY();
        const ceilingXY = ceilingPoint.computeXY();

        const apexDist = Math.hypot(apexXY.x - PLAYER.x, apexXY.y - PLAYER.y);
        const ceilingDist = Math.hypot(ceilingXY.x - PLAYER.x, ceilingXY.y - PLAYER.y);

        console.log(`\nApex point: (${apexXY.x.toFixed(2)}, ${apexXY.y.toFixed(2)}) dist=${apexDist.toFixed(2)}`);
        console.log(`Ceiling point: (${ceilingXY.x.toFixed(2)}, ${ceilingXY.y.toFixed(2)}) dist=${ceilingDist.toFixed(2)}`);

        // Check if they're on the same ray
        const toApex = { x: apexXY.x - PLAYER.x, y: apexXY.y - PLAYER.y };
        const toCeiling = { x: ceilingXY.x - PLAYER.x, y: ceilingXY.y - PLAYER.y };
        const cross = toApex.x * toCeiling.y - toApex.y * toCeiling.x;
        const relativeCross = Math.abs(cross) / (apexDist * ceilingDist);

        console.log(`Cross product (relative): ${relativeCross.toFixed(6)}`);

        if (relativeCross < 0.01) {
          console.log("\n>>> CONFIRMED: Points are on the same ray <<<");
          console.log(`Apex is at index ${apexIndex}, ceiling is at index ${ceilingHitIndex}`);

          // For CCW traversal, the closer point (apex) should come BEFORE the farther point (ceiling)
          // in the direction of traversal.
          // If ceiling comes before apex in the array, that's the bug.
          const n = sourcePoints.length;

          // Calculate the "forward" distance in CCW order
          const forwardFromCeilingToApex = (apexIndex - ceilingHitIndex + n) % n;
          const forwardFromApexToCeiling = (ceilingHitIndex - apexIndex + n) % n;

          console.log(`Forward distance ceiling→apex: ${forwardFromCeilingToApex}`);
          console.log(`Forward distance apex→ceiling: ${forwardFromApexToCeiling}`);

          // If ceiling→apex is smaller (1 step), then ceiling is sorted BEFORE apex
          // This would be the bug: far point before near point
          if (forwardFromCeilingToApex < forwardFromApexToCeiling) {
            console.log("\n>>> BUG CONFIRMED: Ceiling (far) is sorted BEFORE apex (near) <<<");
            console.log("The shadow boundary ordering for junctions is inverted!");
          } else {
            console.log("\n>>> Apex (near) is correctly sorted BEFORE ceiling (far) <<<");
          }
        }
      }

      // Assert that we found both points
      expect(apexIndex).toBeGreaterThanOrEqual(0);
    });

    it("HYPOTHESIS TEST: proves the sorting order is inverted for junction pairs", () => {
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

      // THE BUG: Ceiling (far) comes BEFORE apex (near) in sorted order
      // In CCW traversal, the near point should come before the far point
      const n = sourcePoints.length;
      const forwardFromCeilingToApex = (apexIndex - ceilingHitIndex + n) % n;
      const forwardFromApexToCeiling = (ceilingHitIndex - apexIndex + n) % n;

      // If ceiling→apex distance is 1, then ceiling is immediately before apex
      // This means ceiling (far) is sorted BEFORE apex (near) - THE BUG!
      const ceilingBeforeApex = forwardFromCeilingToApex < forwardFromApexToCeiling;

      console.log("\n=== HYPOTHESIS VERIFICATION ===");
      console.log(`Ceiling index: ${ceilingHitIndex}, Apex index: ${apexIndex}`);
      console.log(`Ceiling distance: ${ceilingDist.toFixed(2)}, Apex distance: ${apexDist.toFixed(2)}`);
      console.log(`Ceiling is ${(ceilingDist / apexDist).toFixed(1)}x farther than apex`);
      console.log(`Ceiling comes before apex in sorted order: ${ceilingBeforeApex}`);

      if (ceilingBeforeApex) {
        console.log("\n>>> HYPOTHESIS CONFIRMED <<<");
        console.log("The sorting code at ConeProjectionV2.ts lines 304-321 returns");
        console.log("'continuation before junction' but for CCW traversal, the");
        console.log("junction (near point) should come FIRST, then continuation (far point).");
        console.log("");
        console.log("ROOT CAUSE: handleCollinearPoints() at lines 304-311 has:");
        console.log("  if (jp1 && isHitPoint(p2)) return 1;  // p2 before p1");
        console.log("  if (jp2 && isHitPoint(p1)) return -1; // p1 before p2");
        console.log("");
        console.log("This puts continuation BEFORE junction, but it should be AFTER.");
      }

      // Assert the bug exists (this test documents the bug, not fixes it)
      expect(ceilingBeforeApex).toBe(true);
    });
  });
});

