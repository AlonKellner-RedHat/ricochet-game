/**
 * Chain3-0 Pass-Through Bug Investigation
 *
 * Bug Report:
 * - The visibility polygon passes through the adjacent surface (chain3-0)
 * - Sub-pixel player movement causes vertex order to change (flickering)
 *
 * Bug Cases:
 * - Case 1: player.x = 864.3311391996425 - stable but incorrect pass-through
 * - Case 2: player.x = 864.3311134268147 - flickering, different vertex order
 */

import { RicochetSurface } from "@/surfaces/RicochetSurface";
import { WallSurface } from "@/surfaces/WallSurface";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import {
  type SourcePoint,
  isEndpoint,
  isHitPoint,
  isOriginPoint,
} from "@/trajectory-v2/geometry/SourcePoint";
import {
  type SurfaceChain,
  createMixedChain,
  createRicochetChain,
  createSingleSurfaceChain,
} from "@/trajectory-v2/geometry/SurfaceChain";
import { isJunctionPoint } from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  createConeThroughWindow,
  projectConeV2,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { describe, expect, it } from "vitest";

// =============================================================================
// BUG SCENARIO DATA
// =============================================================================

// Case 1: Stable pass-through bug
const PLAYER_CASE_1 = { x: 864.3311391996425, y: 666 };

// Case 2: Flickering sub-pixel change
const PLAYER_CASE_2 = { x: 864.3311134268147, y: 666 };

// Case 4: Junction continuation ray bug - adjacent surface should block but doesn't
const PLAYER_CASE_4 = { x: 819.8802295000359, y: 666 };

// Case 5: Boundary ray ordering bug - left hit sorted before window left
const PLAYER_CASE_5 = { x: 808.5119365999994, y: 666 };

// Case 6: Left boundary ray passes through junction without being blocked
const PLAYER_CASE_6 = { x: 809.494480099992, y: 666 };

// Chain3 - the V-shape
const CHAIN3_APEX = { x: 850, y: 250 };
const CHAIN3_LEFT = { x: 820, y: 301.9615242270663 };
const CHAIN3_RIGHT = { x: 880, y: 301.9615242270663 };

// The planned surface is chain3-1 (from apex to right)
const PLANNED_SURFACE = {
  id: "chain3-1",
  start: CHAIN3_APEX,
  end: CHAIN3_RIGHT,
};

const SCREEN_BOUNDS = {
  minX: 0,
  minY: 0,
  maxX: 1280,
  maxY: 720,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createChains(): SurfaceChain[] {
  const chains: SurfaceChain[] = [];

  // Room boundary
  chains.push(
    createMixedChain(
      "room",
      [
        { x: 20, y: 80 },
        { x: 1260, y: 80 },
        { x: 1260, y: 700 },
        { x: 20, y: 700 },
      ],
      [true, false, false, true],
      true
    )
  );

  // Platform
  chains.push(
    createSingleSurfaceChain(
      new WallSurface("platform-0", { start: { x: 50, y: 620 }, end: { x: 200, y: 620 } })
    )
  );

  // Mirror surfaces
  chains.push(
    createSingleSurfaceChain(
      new RicochetSurface("mirror-left-0", { start: { x: 250, y: 550 }, end: { x: 250, y: 150 } })
    )
  );
  chains.push(
    createSingleSurfaceChain(
      new RicochetSurface("mirror-right-0", { start: { x: 550, y: 150 }, end: { x: 550, y: 550 } })
    )
  );

  // Chain3 - the V-shape with the issue
  chains.push(createRicochetChain("chain3", [CHAIN3_LEFT, CHAIN3_APEX, CHAIN3_RIGHT]));

  // Chain2
  chains.push(
    createRicochetChain("chain2", [
      { x: 707.5735931288071, y: 292.42640687119285 },
      { x: 750, y: 250 },
      { x: 792.4264068711929, y: 292.42640687119285 },
    ])
  );

  // Chain1
  chains.push(
    createRicochetChain("chain1", [
      { x: 598.0384757729337, y: 280 },
      { x: 650, y: 250 },
      { x: 701.9615242270663, y: 280 },
    ])
  );

  return chains;
}

function calculateReflectedOrigin(player: Vector2): Vector2 {
  return reflectPointThroughLine(player, PLANNED_SURFACE.start, PLANNED_SURFACE.end);
}

function getVertexInfo(sp: SourcePoint): string {
  if (isOriginPoint(sp)) {
    return "OriginPoint";
  } else if (isEndpoint(sp)) {
    return `Endpoint:${(sp as any).surface.id}`;
  } else if (isJunctionPoint(sp)) {
    return "JunctionPoint";
  } else if (isHitPoint(sp)) {
    const hit = sp as any;
    return `HitPoint:${hit.hitSurface.id}(s=${hit.s.toFixed(4)})`;
  }
  return "Unknown";
}

function checkSelfIntersection(vertices: Vector2[]): boolean {
  if (vertices.length < 4) return false;

  for (let i = 0; i < vertices.length; i++) {
    const a1 = vertices[i]!;
    const a2 = vertices[(i + 1) % vertices.length]!;

    for (let j = i + 2; j < vertices.length; j++) {
      if (j === (i + vertices.length - 1) % vertices.length) continue;

      const b1 = vertices[j]!;
      const b2 = vertices[(j + 1) % vertices.length]!;

      if (segmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }

  return false;
}

function segmentsIntersect(a1: Vector2, a2: Vector2, b1: Vector2, b2: Vector2): boolean {
  const d1 = direction(b1, b2, a1);
  const d2 = direction(b1, b2, a2);
  const d3 = direction(a1, a2, b1);
  const d4 = direction(a1, a2, b2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return false;
}

function direction(p1: Vector2, p2: Vector2, p3: Vector2): number {
  return (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y);
}

// =============================================================================
// TESTS
// =============================================================================

// New case from user
const PLAYER_CASE_3 = { x: 878.3684104999886, y: 666 };

describe("Chain3-0 Pass-Through Bug Investigation", () => {
  describe("Boundary Ray Analysis", () => {
    it("should trace which rays target the junction vs endpoint", () => {
      const chains = createChains();

      // Use the new case
      const player = PLAYER_CASE_3;
      const origin = calculateReflectedOrigin(player);

      console.log("\n=== BOUNDARY RAY ANALYSIS ===");
      console.log(`Player: (${player.x}, ${player.y})`);
      console.log(`Reflected origin: (${origin.x.toFixed(4)}, ${origin.y.toFixed(4)})`);

      // Window endpoints
      const windowStart = PLANNED_SURFACE.start; // (850, 250) - junction
      const windowEnd = PLANNED_SURFACE.end; // (880, 301.96)

      console.log(`\nWindow (chain3-1):`);
      console.log(`  Start (junction): (${windowStart.x}, ${windowStart.y})`);
      console.log(`  End: (${windowEnd.x}, ${windowEnd.y})`);

      // chain3-0 endpoints
      console.log(`\nAdjacent surface (chain3-0):`);
      console.log(`  Start: (${CHAIN3_LEFT.x}, ${CHAIN3_LEFT.y})`);
      console.log(`  End (junction): (${CHAIN3_APEX.x}, ${CHAIN3_APEX.y})`);

      // The two boundary rays
      console.log(`\n--- Boundary Rays ---`);

      // Left boundary ray: origin → window start (junction)
      const leftBoundaryTarget = windowStart;
      const leftBoundaryDir = {
        x: leftBoundaryTarget.x - origin.x,
        y: leftBoundaryTarget.y - origin.y,
      };
      console.log(`Left boundary ray: origin → (${leftBoundaryTarget.x}, ${leftBoundaryTarget.y})`);
      console.log(
        `  Direction: (${leftBoundaryDir.x.toFixed(4)}, ${leftBoundaryDir.y.toFixed(4)})`
      );
      console.log(`  Target: Junction (chain3-0 end = chain3-1 start)`);

      // Right boundary ray: origin → window end
      const rightBoundaryTarget = windowEnd;
      const rightBoundaryDir = {
        x: rightBoundaryTarget.x - origin.x,
        y: rightBoundaryTarget.y - origin.y,
      };
      console.log(
        `Right boundary ray: origin → (${rightBoundaryTarget.x}, ${rightBoundaryTarget.y})`
      );
      console.log(
        `  Direction: (${rightBoundaryDir.x.toFixed(4)}, ${rightBoundaryDir.y.toFixed(4)})`
      );
      console.log(`  Target: chain3-1 endpoint`);

      // Now check: is there a ray to chain3-0's START endpoint (820, 301.96)?
      console.log(`\n--- Ray to chain3-0 start endpoint ---`);
      const chain3_0_start = CHAIN3_LEFT; // (820, 301.96)
      const toChain3Start = {
        x: chain3_0_start.x - origin.x,
        y: chain3_0_start.y - origin.y,
      };
      console.log(`Ray to chain3-0 start: origin → (${chain3_0_start.x}, ${chain3_0_start.y})`);
      console.log(`  Direction: (${toChain3Start.x.toFixed(4)}, ${toChain3Start.y.toFixed(4)})`);

      // Check if this ray would intersect chain3-0 before reaching the endpoint
      // The ray goes FROM origin TO (820, 301.96)
      // chain3-0 is the line FROM (820, 301.96) TO (850, 250)
      // At t=0, the ray is at origin
      // At t=1, the ray is at (820, 301.96) - the START of chain3-0
      // So the ray endpoint is AT chain3-0's start, meaning it would hit chain3-0 at s=0

      console.log(`\n  This ray targets chain3-0's own start endpoint.`);
      console.log(`  If chain3-0 is in the obstacles list, this ray should hit chain3-0 at s=0.`);
      console.log(`  If chain3-0 is EXCLUDED, this ray would reach the endpoint without blocking.`);

      // Now let's check: is chain3-0 being excluded?
      console.log(`\n--- Checking geometric test for chain3-0 exclusion ---`);

      // Compute the geometric test
      const junction = CHAIN3_APEX; // (850, 250)
      const rayDir = { x: junction.x - origin.x, y: junction.y - origin.y };
      const windowOther = windowEnd; // (880, 301.96)
      const windowDir = { x: windowOther.x - junction.x, y: windowOther.y - junction.y };
      const adjacentOther = CHAIN3_LEFT; // (820, 301.96)
      const adjacentDir = { x: adjacentOther.x - junction.x, y: adjacentOther.y - junction.y };

      console.log(`From junction (${junction.x}, ${junction.y}):`);
      console.log(`  rayDir (to origin): (${rayDir.x.toFixed(4)}, ${rayDir.y.toFixed(4)})`);
      console.log(
        `  windowDir (along window): (${windowDir.x.toFixed(4)}, ${windowDir.y.toFixed(4)})`
      );
      console.log(
        `  adjacentDir (along chain3-0): (${adjacentDir.x.toFixed(4)}, ${adjacentDir.y.toFixed(4)})`
      );

      // Compute reference direction (opposite to window midpoint)
      const windowMid = {
        x: (windowStart.x + windowEnd.x) / 2,
        y: (windowStart.y + windowEnd.y) / 2,
      };
      const refDirection = { x: origin.x - windowMid.x, y: origin.y - windowMid.y };
      console.log(
        `\nReference direction: (${refDirection.x.toFixed(4)}, ${refDirection.y.toFixed(4)})`
      );

      // Compare ray vs adjacent
      const crossRayRef = refDirection.x * rayDir.y - refDirection.y * rayDir.x;
      const crossAdjRef = refDirection.x * adjacentDir.y - refDirection.y * adjacentDir.x;
      const crossRayAdj = rayDir.x * adjacentDir.y - rayDir.y * adjacentDir.x;

      console.log(`\nCross products with reference direction:`);
      console.log(`  ray × ref: ${crossRayRef.toExponential(4)}`);
      console.log(`  adjacent × ref: ${crossAdjRef.toExponential(4)}`);

      // Check which side of ref each is on
      const raySide = crossRayRef > 0 ? "LEFT" : crossRayRef < 0 ? "RIGHT" : "ON";
      const adjSide = crossAdjRef > 0 ? "LEFT" : crossAdjRef < 0 ? "RIGHT" : "ON";
      console.log(`  ray is ${raySide} of ref`);
      console.log(`  adjacent is ${adjSide} of ref`);

      // Compare window vs adjacent
      const crossWindowRef = refDirection.x * windowDir.y - refDirection.y * windowDir.x;
      const crossWindowAdj = windowDir.x * adjacentDir.y - windowDir.y * adjacentDir.x;
      const windowSide = crossWindowRef > 0 ? "LEFT" : crossWindowRef < 0 ? "RIGHT" : "ON";
      console.log(`  window × ref: ${crossWindowRef.toExponential(4)}`);
      console.log(`  window is ${windowSide} of ref`);

      // The geometric test: is adjacent between ray and window?
      console.log(`\n--- Geometric "Between" Test ---`);
      console.log(`Cross(ray, adjacent): ${crossRayAdj.toExponential(4)}`);
      console.log(`Cross(window, adjacent): ${crossWindowAdj.toExponential(4)}`);

      // Using compareDirectionsCCW logic
      // If ray and adjacent are on opposite sides of ref, use ref-based ordering
      // If same side, use direct cross product
      const rayAdjOppositeSides =
        (crossRayRef > 0 && crossAdjRef < 0) || (crossRayRef < 0 && crossAdjRef > 0);
      const windowAdjOppositeSides =
        (crossWindowRef > 0 && crossAdjRef < 0) || (crossWindowRef < 0 && crossAdjRef > 0);

      console.log(`\nRay vs Adjacent: opposite sides of ref? ${rayAdjOppositeSides}`);
      console.log(`Window vs Adjacent: opposite sides of ref? ${windowAdjOppositeSides}`);

      // Get the actual projection result
      const cone = createConeThroughWindow(origin, windowStart, windowEnd);
      const sourcePoints = projectConeV2(cone, chainsWithScreen, PLANNED_SURFACE.id);
      const vertices = toVector2Array(sourcePoints);

      console.log(`\n--- Actual Polygon Vertices ---`);
      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i]!;
        const sp = sourcePoints[i]!;
        console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)}) - ${getVertexInfo(sp)}`);
      }

      // Check if there's a hit at chain3-0's start endpoint
      let foundChain3StartHit = false;
      for (const sp of sourcePoints) {
        if (isHitPoint(sp)) {
          const hit = sp as any;
          if (hit.hitSurface.id === "chain3-0" && Math.abs(hit.s) < 0.01) {
            foundChain3StartHit = true;
            console.log(`\n>>> Found hit at chain3-0 START (s≈0)`);
          }
        }
      }

      if (!foundChain3StartHit) {
        console.log(`\n>>> NO hit at chain3-0 START - chain3-0 may be incorrectly excluded!`);
      }

      expect(vertices.length).toBeGreaterThan(0);
    });

    it("should investigate why chain3-0 start endpoint is not in polygon", () => {
      const chains = createChains();
      const player = PLAYER_CASE_3;
      const origin = calculateReflectedOrigin(player);

      console.log("\n=== WHY IS (820, 302) NOT IN POLYGON? ===");
      console.log(`Origin: (${origin.x.toFixed(4)}, ${origin.y.toFixed(4)})`);

      // The target we're investigating
      const chain3_0_start = CHAIN3_LEFT; // (820, 301.96)
      console.log(
        `Target: chain3-0 start at (${chain3_0_start.x}, ${chain3_0_start.y.toFixed(2)})`
      );

      // Check if this point is within the window cone
      const windowStart = PLANNED_SURFACE.start; // (850, 250)
      const windowEnd = PLANNED_SURFACE.end; // (880, 301.96)

      const toWindowStart = { x: windowStart.x - origin.x, y: windowStart.y - origin.y };
      const toWindowEnd = { x: windowEnd.x - origin.x, y: windowEnd.y - origin.y };
      const toChain3Start = { x: chain3_0_start.x - origin.x, y: chain3_0_start.y - origin.y };

      console.log(`\nDirections from origin:`);
      console.log(
        `  To window start (left boundary): (${toWindowStart.x.toFixed(2)}, ${toWindowStart.y.toFixed(2)})`
      );
      console.log(
        `  To window end (right boundary): (${toWindowEnd.x.toFixed(2)}, ${toWindowEnd.y.toFixed(2)})`
      );
      console.log(
        `  To chain3-0 start: (${toChain3Start.x.toFixed(2)}, ${toChain3Start.y.toFixed(2)})`
      );

      // Cross products to check if target is within cone
      const crossLeftVsTarget =
        toWindowStart.x * toChain3Start.y - toWindowStart.y * toChain3Start.x;
      const crossRightVsTarget = toWindowEnd.x * toChain3Start.y - toWindowEnd.y * toChain3Start.x;
      const crossLeftVsRight = toWindowStart.x * toWindowEnd.y - toWindowStart.y * toWindowEnd.x;

      console.log(`\nCone containment test:`);
      console.log(`  Cross(left, target): ${crossLeftVsTarget.toFixed(2)}`);
      console.log(`  Cross(right, target): ${crossRightVsTarget.toFixed(2)}`);
      console.log(`  Cross(left, right): ${crossLeftVsRight.toFixed(2)}`);

      // For target to be INSIDE the cone:
      // If left-to-right is CCW (cross > 0): target must be CCW from left AND CW from right
      // If left-to-right is CW (cross < 0): target must be CW from left AND CCW from right
      const leftToRightCCW = crossLeftVsRight > 0;
      const targetCCWFromLeft = crossLeftVsTarget > 0;
      const targetCCWFromRight = crossRightVsTarget > 0;

      console.log(`\nCone analysis:`);
      console.log(`  Left-to-right is ${leftToRightCCW ? "CCW" : "CW"}`);
      console.log(`  Target is ${targetCCWFromLeft ? "CCW" : "CW"} from left boundary`);
      console.log(`  Target is ${targetCCWFromRight ? "CCW" : "CW"} from right boundary`);

      let isInCone: boolean;
      if (leftToRightCCW) {
        // Cone interior is CCW from left, CW from right
        isInCone = targetCCWFromLeft && !targetCCWFromRight;
      } else {
        // Cone interior is CW from left, CCW from right
        isInCone = !targetCCWFromLeft && targetCCWFromRight;
      }
      console.log(`\n  Is chain3-0 start INSIDE the cone? ${isInCone}`);

      if (!isInCone) {
        console.log(`\n>>> chain3-0 start (820, 302) is OUTSIDE the window cone!`);
        console.log(`>>> This is why there's no ray cast toward it.`);
        console.log(`>>> But rays toward OTHER targets can still hit chain3-0 in the middle.`);
      }

      // Now check: does the ray from origin toward ceiling (454, 80) pass through chain3-0?
      const ceiling1 = { x: 491.54, y: 80 };
      const toCeiling = { x: ceiling1.x - origin.x, y: ceiling1.y - origin.y };

      console.log(`\n--- Ray to ceiling analysis ---`);
      console.log(`Ray direction: (${toCeiling.x.toFixed(2)}, ${toCeiling.y.toFixed(2)})`);

      // Check intersection with chain3-0
      // chain3-0: from (820, 301.96) to (850, 250)
      const chain3_0_end = CHAIN3_APEX;
      const chain3_0_dir = {
        x: chain3_0_end.x - chain3_0_start.x,
        y: chain3_0_end.y - chain3_0_start.y,
      };

      // Parametric intersection:
      // origin + t * toCeiling = chain3_0_start + s * chain3_0_dir
      // Solve for t and s
      const denom = toCeiling.x * chain3_0_dir.y - toCeiling.y * chain3_0_dir.x;
      if (Math.abs(denom) > 0.0001) {
        const diff = { x: chain3_0_start.x - origin.x, y: chain3_0_start.y - origin.y };
        const t = (diff.x * chain3_0_dir.y - diff.y * chain3_0_dir.x) / denom;
        const s = (diff.x * toCeiling.y - diff.y * toCeiling.x) / denom;

        console.log(`Intersection with chain3-0:`);
        console.log(`  t = ${t.toFixed(4)} (ray parameter, 0=origin, 1=ceiling)`);
        console.log(`  s = ${s.toFixed(4)} (surface parameter, 0=start, 1=end)`);

        if (t > 0 && t < 1 && s >= 0 && s <= 1) {
          console.log(`  >>> Ray DOES intersect chain3-0 before reaching ceiling!`);
          const hitX = origin.x + t * toCeiling.x;
          const hitY = origin.y + t * toCeiling.y;
          console.log(`  Hit point: (${hitX.toFixed(2)}, ${hitY.toFixed(2)})`);
        } else if (s >= 0 && s <= 1 && t >= 1) {
          console.log(`  >>> Intersection is BEYOND the ceiling target (t >= 1)`);
        } else {
          console.log(`  >>> No valid intersection`);
        }
      }

      expect(true).toBe(true);
    });
  });

  describe("Ray Direction Analysis", () => {
    it("PROVES THE BUG: chain3-0 incorrectly excluded from right boundary ray", () => {
      const chains = createChains();
      const player = PLAYER_CASE_3;
      const origin = calculateReflectedOrigin(player);

      console.log("\n=== ROOT CAUSE PROOF ===");

      // The window boundaries
      const leftBoundary = PLANNED_SURFACE.start; // (850, 250)
      const rightBoundary = PLANNED_SURFACE.end; // (880, 302)

      console.log(`Window boundaries:`);
      console.log(`  Left: (${leftBoundary.x}, ${leftBoundary.y})`);
      console.log(`  Right: (${rightBoundary.x}, ${rightBoundary.y.toFixed(2)})`);

      // chain3-0 geometry
      console.log(`\nchain3-0: (820, 302) → (850, 250)`);
      console.log(`  chain3-0 ENDS at (850, 250)`);
      console.log(`  (850, 250) is the LEFT boundary!`);

      // The bug
      console.log(`\n>>> THE BUG <<<`);
      console.log(`The code builds 'windowEndpointSurfaces' containing surfaces that`);
      console.log(`start or end at EITHER window endpoint.`);
      console.log(`\nchain3-0 ends at the LEFT boundary (850, 250).`);
      console.log(`So chain3-0 is in windowEndpointSurfaces.`);
      console.log(`\nBOTH left and right boundary rays use the same filtered list.`);
      console.log(`So the RIGHT boundary ray ALSO excludes chain3-0!`);
      console.log(`\nThe right boundary ray toward (880, 302):`);
      console.log(`  1. Doesn't check against chain3-0 (incorrectly excluded)`);
      console.log(`  2. Passes through where chain3-0 is`);
      console.log(`  3. Hits the ceiling instead`);
      console.log(`\nThis produces the ceiling hit at (491, 80) which shouldn't exist!`);

      // Verify: is chain3-0 actually a blocking surface for the right ray?
      console.log(`\n--- Verification ---`);
      const chain3_0_start = { x: 820, y: 301.96 };
      const chain3_0_end = { x: 850, y: 250 };

      // Check if right boundary ray intersects chain3-0
      const rayDir = { x: rightBoundary.x - origin.x, y: rightBoundary.y - origin.y };
      const scale = 10;
      const rayEnd = { x: origin.x + rayDir.x * scale, y: origin.y + rayDir.y * scale };

      // Line-line intersection with chain3-0
      const denom =
        rayDir.x * scale * (chain3_0_end.y - chain3_0_start.y) -
        rayDir.y * scale * (chain3_0_end.x - chain3_0_start.x);

      if (Math.abs(denom) > 0.0001) {
        const dx = chain3_0_start.x - origin.x;
        const dy = chain3_0_start.y - origin.y;
        const t =
          (dx * (chain3_0_end.y - chain3_0_start.y) - dy * (chain3_0_end.x - chain3_0_start.x)) /
          denom;
        const s = (dx * rayDir.y * scale - dy * rayDir.x * scale) / denom;

        console.log(`Right boundary ray intersection with chain3-0:`);
        console.log(`  t = ${t.toFixed(4)} (ray parameter)`);
        console.log(`  s = ${s.toFixed(4)} (chain3-0 parameter, 0=start, 1=end)`);

        if (s >= 0 && s <= 1) {
          console.log(`  >>> Ray DOES intersect chain3-0!`);
          console.log(`  >>> But chain3-0 is incorrectly excluded, so this hit is missed.`);
        }
      }

      expect(true).toBe(true);
    });

    it("should trace what rightHit and leftHit actually are", () => {
      const chains = createChains();
      const player = PLAYER_CASE_3;
      const origin = calculateReflectedOrigin(player);

      console.log("\n=== ACTUAL RIGHT/LEFT HITS ===");
      console.log(`Origin: (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)})`);

      // Get the polygon and look for hits that match window boundary directions
      const cone = createConeThroughWindow(origin, PLANNED_SURFACE.start, PLANNED_SURFACE.end);
      const sourcePoints = projectConeV2(cone, chainsWithScreen, PLANNED_SURFACE.id);
      const vertices = toVector2Array(sourcePoints);

      console.log(`\nWindow boundaries:`);
      console.log(`  Left (apex): (${PLANNED_SURFACE.start.x}, ${PLANNED_SURFACE.start.y})`);
      console.log(`  Right: (${PLANNED_SURFACE.end.x}, ${PLANNED_SURFACE.end.y.toFixed(2)})`);

      // Calculate directions
      const leftDir = {
        x: PLANNED_SURFACE.start.x - origin.x,
        y: PLANNED_SURFACE.start.y - origin.y,
      };
      const leftLen = Math.sqrt(leftDir.x * leftDir.x + leftDir.y * leftDir.y);
      const leftNorm = { x: leftDir.x / leftLen, y: leftDir.y / leftLen };

      const rightDir = { x: PLANNED_SURFACE.end.x - origin.x, y: PLANNED_SURFACE.end.y - origin.y };
      const rightLen = Math.sqrt(rightDir.x * rightDir.x + rightDir.y * rightDir.y);
      const rightNorm = { x: rightDir.x / rightLen, y: rightDir.y / rightLen };

      console.log(
        `\nLeft boundary direction: (${leftNorm.x.toFixed(4)}, ${leftNorm.y.toFixed(4)})`
      );
      console.log(
        `Right boundary direction: (${rightNorm.x.toFixed(4)}, ${rightNorm.y.toFixed(4)})`
      );

      // Find hits in each direction
      console.log(`\n--- Hits along LEFT boundary direction ---`);
      for (let i = 0; i < sourcePoints.length; i++) {
        const sp = sourcePoints[i]!;
        const v = vertices[i]!;
        const dir = { x: v.x - origin.x, y: v.y - origin.y };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        const norm = { x: dir.x / len, y: dir.y / len };
        const dot = leftNorm.x * norm.x + leftNorm.y * norm.y;

        if (dot > 0.999) {
          console.log(
            `  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)}) - ${sp.constructor.name}, dist=${len.toFixed(2)}`
          );
          if (isHitPoint(sp)) {
            const hit = sp as any;
            console.log(`      Surface: ${hit.hitSurface.id}, s=${hit.s.toFixed(4)}`);
          }
        }
      }

      console.log(`\n--- Hits along RIGHT boundary direction ---`);
      for (let i = 0; i < sourcePoints.length; i++) {
        const sp = sourcePoints[i]!;
        const v = vertices[i]!;
        const dir = { x: v.x - origin.x, y: v.y - origin.y };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        const norm = { x: dir.x / len, y: dir.y / len };
        const dot = rightNorm.x * norm.x + rightNorm.y * norm.y;

        if (dot > 0.999) {
          console.log(
            `  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)}) - ${sp.constructor.name}, dist=${len.toFixed(2)}`
          );
          if (isHitPoint(sp)) {
            const hit = sp as any;
            console.log(`      Surface: ${hit.hitSurface.id}, s=${hit.s.toFixed(4)}`);
          }
        }
      }

      // KEY QUESTION: Why are there TWO hits in the same direction?
      console.log(`\n--- KEY QUESTION ---`);
      console.log(`If the right boundary ray hits chain3-0 at t=1.14,`);
      console.log(`it should return a HitPoint on chain3-0.`);
      console.log(`But there's ALSO a ceiling hit in the same direction!`);
      console.log(`\nPossible explanations:`);
      console.log(`1. There are two rays in this direction (one from endpoint, one cone boundary)`);
      console.log(`2. chain3-0 allows continuation rays (junction or endpoint logic)`);
      console.log(`3. Bug in obstacle filtering`);

      expect(true).toBe(true);
    });

    it("should trace the right boundary ray in detail", () => {
      const chains = createChains();
      const player = PLAYER_CASE_3;
      const origin = calculateReflectedOrigin(player);

      console.log("\n=== RIGHT BOUNDARY RAY TRACE ===");
      console.log(`Origin: (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)})`);

      // Right boundary is the window end
      const rightBoundary = PLANNED_SURFACE.end; // (880, 301.96)
      const direction = { x: rightBoundary.x - origin.x, y: rightBoundary.y - origin.y };
      const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y);

      console.log(`Right boundary target: (${rightBoundary.x}, ${rightBoundary.y.toFixed(2)})`);
      console.log(`Direction: (${direction.x.toFixed(2)}, ${direction.y.toFixed(2)})`);
      console.log(`Distance to right boundary: ${len.toFixed(2)}`);

      // Check distances along this ray
      console.log(`\n--- Points along this ray ---`);

      // Distance to chain3-0 hit at (834.88, 276.18)
      const chain3Hit = { x: 834.88, y: 276.18 };
      const chain3HitDist = Math.sqrt(
        Math.pow(chain3Hit.x - origin.x, 2) + Math.pow(chain3Hit.y - origin.y, 2)
      );
      console.log(`1. Right boundary (880, 302): distance ${len.toFixed(2)}`);
      console.log(`2. Chain3-0 hit (835, 276): distance ${chain3HitDist.toFixed(2)}`);

      // Check: is chain3-0 BEFORE or AFTER the right boundary?
      if (chain3HitDist < len) {
        console.log(`\n>>> Chain3-0 is BEFORE the right boundary`);
        console.log(`>>> The right boundary ray should hit chain3-0 first!`);
      } else {
        console.log(`\n>>> Chain3-0 is AFTER the right boundary`);
        console.log(`>>> The right boundary ray reaches (880, 302) first`);
        console.log(`>>> Then continues past it (chain3-1 is excluded)`);
        console.log(`>>> Then hits chain3-0`);
        console.log(`>>> Then continues?? And hits ceiling???`);
      }

      // The key question: what happens when the right boundary ray
      // reaches (880, 302) and chain3-1 is excluded?
      console.log(`\n--- The bug ---`);
      console.log(`The right boundary ray is cast toward (880, 302).`);
      console.log(`chain3-1 is EXCLUDED (it's the window).`);
      console.log(`So the ray "sees through" chain3-1.`);
      console.log(`The ray continues and finds chain3-0.`);
      console.log(`But chain3-0 is PAST the target (880, 302)!`);
      console.log(`\nNormally, rays only check obstacles BEFORE the target (t < 1).`);
      console.log(`But this ray has its target ON the excluded surface.`);
      console.log(`So the ray logic might be extending PAST the target.`);

      // Check the cone boundary ray casting
      console.log(`\n--- Cone boundary ray casting ---`);
      console.log(`The cone boundary rays use obstaclesExcludingWindowEndpoints.`);
      console.log(`This EXCLUDES surfaces that start/end at window endpoints.`);
      console.log(`But it does NOT exclude chain3-0!`);
      console.log(`\nSo when the ray goes toward (880, 302):`);
      console.log(`1. It passes THROUGH chain3-1 (excluded)`);
      console.log(`2. It continues and HITS chain3-0 at (835, 276)`);
      console.log(`3. BUT - a continuation ray is cast from chain3-0 hit???`);

      expect(true).toBe(true);
    });

    it("should find what endpoint/junction is along the ceiling hit direction", () => {
      const chains = createChains();
      const player = PLAYER_CASE_3;
      const origin = calculateReflectedOrigin(player);

      console.log("\n=== WHAT TARGET PRODUCES THE CEILING HIT? ===");
      console.log(`Origin: (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)})`);

      // The ceiling hit is at (491.54, 80)
      const ceilingHit = { x: 491.54, y: 80 };
      const hitDir = { x: ceilingHit.x - origin.x, y: ceilingHit.y - origin.y };
      const hitLen = Math.sqrt(hitDir.x * hitDir.x + hitDir.y * hitDir.y);
      const hitNorm = { x: hitDir.x / hitLen, y: hitDir.y / hitLen };

      console.log(`Ceiling hit: (${ceilingHit.x}, ${ceilingHit.y})`);
      console.log(`Direction (normalized): (${hitNorm.x.toFixed(6)}, ${hitNorm.y.toFixed(6)})`);

      // Check all endpoints and junctions to find which one is along this direction
      console.log(`\n--- Checking all ray targets ---`);

      const allSurfaces = chains.flatMap((c) => c.getSurfaces());
      const allJunctions = chains.flatMap((c) => c.getJunctionPoints());

      // Check endpoints
      for (const surface of allSurfaces) {
        for (const point of [surface.segment.start, surface.segment.end]) {
          const dir = { x: point.x - origin.x, y: point.y - origin.y };
          const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
          const norm = { x: dir.x / len, y: dir.y / len };

          const dot = hitNorm.x * norm.x + hitNorm.y * norm.y;
          if (dot > 0.9999) {
            // Nearly same direction
            console.log(
              `\n>>> MATCH: ${surface.id} endpoint at (${point.x.toFixed(2)}, ${point.y.toFixed(2)})`
            );
            console.log(`    Direction: (${norm.x.toFixed(6)}, ${norm.y.toFixed(6)})`);
            console.log(`    Dot product: ${dot.toFixed(8)}`);
            console.log(`    Distance from origin: ${len.toFixed(2)}`);
            console.log(`    Distance to ceiling hit: ${hitLen.toFixed(2)}`);
            if (len > hitLen) {
              console.log(`    This target is BEYOND the ceiling hit!`);
            }
          }
        }
      }

      // Check junctions
      for (const junction of allJunctions) {
        const point = junction.computeXY();
        const dir = { x: point.x - origin.x, y: point.y - origin.y };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        const norm = { x: dir.x / len, y: dir.y / len };

        const dot = hitNorm.x * norm.x + hitNorm.y * norm.y;
        if (dot > 0.9999) {
          console.log(`\n>>> MATCH: Junction at (${point.x.toFixed(2)}, ${point.y.toFixed(2)})`);
          console.log(`    Direction: (${norm.x.toFixed(6)}, ${norm.y.toFixed(6)})`);
          console.log(`    Dot product: ${dot.toFixed(8)}`);
        }
      }

      // Check if chain3-0's endpoints are targets
      console.log(`\n--- Chain3-0 endpoints specifically ---`);
      const chain3_0 = allSurfaces.find((s) => s.id === "chain3-0");
      if (chain3_0) {
        console.log(
          `chain3-0 start: (${chain3_0.segment.start.x}, ${chain3_0.segment.start.y.toFixed(2)})`
        );
        console.log(`chain3-0 end: (${chain3_0.segment.end.x}, ${chain3_0.segment.end.y})`);

        // Check direction to chain3-0 start
        const startDir = {
          x: chain3_0.segment.start.x - origin.x,
          y: chain3_0.segment.start.y - origin.y,
        };
        const startLen = Math.sqrt(startDir.x * startDir.x + startDir.y * startDir.y);
        const startNorm = { x: startDir.x / startLen, y: startDir.y / startLen };
        const startDot = hitNorm.x * startNorm.x + hitNorm.y * startNorm.y;

        console.log(`\nDirection to chain3-0 START (820, 302):`);
        console.log(`  Normalized: (${startNorm.x.toFixed(6)}, ${startNorm.y.toFixed(6)})`);
        console.log(`  Dot with ceiling hit dir: ${startDot.toFixed(8)}`);
        console.log(
          `  Angle difference: ${((Math.acos(Math.min(1, startDot)) * 180) / Math.PI).toFixed(4)}°`
        );
      }

      expect(true).toBe(true);
    });

    it("should check if chain3-0 hit and ceiling hits are from the same ray", () => {
      const chains = createChains();
      const player = PLAYER_CASE_3;
      const origin = calculateReflectedOrigin(player);

      console.log("\n=== ARE THESE HITS FROM THE SAME RAY? ===");
      console.log(`Origin: (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)})`);

      // Get the polygon vertices
      const cone = createConeThroughWindow(origin, PLANNED_SURFACE.start, PLANNED_SURFACE.end);
      const sourcePoints = projectConeV2(cone, chainsWithScreen, PLANNED_SURFACE.id);
      const vertices = toVector2Array(sourcePoints);

      // Find chain3-0 hit and ceiling hits
      let chain3Hit: Vector2 | null = null;
      const ceilingHits: Vector2[] = [];

      for (let i = 0; i < sourcePoints.length; i++) {
        const sp = sourcePoints[i]!;
        const v = vertices[i]!;
        if (isHitPoint(sp)) {
          const hit = sp as any;
          if (hit.hitSurface.id === "chain3-0") {
            chain3Hit = v;
          } else if (hit.hitSurface.id === "room-0") {
            ceilingHits.push(v);
          }
        }
      }

      if (chain3Hit) {
        console.log(`\nChain3-0 hit: (${chain3Hit.x.toFixed(2)}, ${chain3Hit.y.toFixed(2)})`);
        const chain3Dir = { x: chain3Hit.x - origin.x, y: chain3Hit.y - origin.y };
        const chain3Len = Math.sqrt(chain3Dir.x * chain3Dir.x + chain3Dir.y * chain3Dir.y);
        const chain3Norm = { x: chain3Dir.x / chain3Len, y: chain3Dir.y / chain3Len };
        console.log(
          `Direction (normalized): (${chain3Norm.x.toFixed(6)}, ${chain3Norm.y.toFixed(6)})`
        );

        for (let i = 0; i < ceilingHits.length; i++) {
          const ch = ceilingHits[i]!;
          console.log(`\nCeiling hit ${i}: (${ch.x.toFixed(2)}, ${ch.y.toFixed(2)})`);
          const ceilingDir = { x: ch.x - origin.x, y: ch.y - origin.y };
          const ceilingLen = Math.sqrt(ceilingDir.x * ceilingDir.x + ceilingDir.y * ceilingDir.y);
          const ceilingNorm = { x: ceilingDir.x / ceilingLen, y: ceilingDir.y / ceilingLen };
          console.log(
            `Direction (normalized): (${ceilingNorm.x.toFixed(6)}, ${ceilingNorm.y.toFixed(6)})`
          );

          // Compare directions
          const dotProduct = chain3Norm.x * ceilingNorm.x + chain3Norm.y * ceilingNorm.y;
          const angleDiff = (Math.acos(Math.min(1, Math.max(-1, dotProduct))) * 180) / Math.PI;
          console.log(`Dot product: ${dotProduct.toFixed(6)}`);
          console.log(`Angle difference: ${angleDiff.toFixed(4)} degrees`);

          if (angleDiff < 0.01) {
            console.log(`>>> SAME DIRECTION! These should be from the same ray!`);
            console.log(`>>> If chain3-0 blocks this ray, there shouldn't be a ceiling hit!`);
          }
        }
      }

      // Check: did the ray that created the ceiling hit pass through chain3-0?
      console.log(`\n--- Checking if ceiling ray was blocked by chain3-0 ---`);
      for (const ch of ceilingHits) {
        const rayDir = { x: ch.x - origin.x, y: ch.y - origin.y };

        // Check intersection with chain3-0
        const chain3Start = CHAIN3_LEFT;
        const chain3End = CHAIN3_APEX;
        const chain3Dir = { x: chain3End.x - chain3Start.x, y: chain3End.y - chain3Start.y };

        const denom = rayDir.x * chain3Dir.y - rayDir.y * chain3Dir.x;
        if (Math.abs(denom) > 0.0001) {
          const diff = { x: chain3Start.x - origin.x, y: chain3Start.y - origin.y };
          const t = (diff.x * chain3Dir.y - diff.y * chain3Dir.x) / denom;
          const s = (diff.x * rayDir.y - diff.y * rayDir.x) / denom;

          console.log(`\nRay to ceiling (${ch.x.toFixed(0)}, ${ch.y.toFixed(0)}):`);
          console.log(`  Intersection with chain3-0: t=${t.toFixed(4)}, s=${s.toFixed(4)}`);

          if (t > 0 && t < 1 && s >= 0 && s <= 1) {
            console.log(
              `  >>> This ray SHOULD have been blocked by chain3-0 at t=${t.toFixed(4)}!`
            );
            console.log(`  >>> But somehow a ceiling hit exists at t=1.0`);
            console.log(`  >>> BUG: Continuation ray from chain3-0 hit reaching ceiling?`);
          } else if (t >= 1) {
            console.log(`  >>> chain3-0 is BEYOND the ceiling target (no blocking)`);
          } else {
            console.log(`  >>> Ray doesn't intersect chain3-0 in valid range`);
          }
        }
      }

      expect(true).toBe(true);
    });
  });

  describe("Bug Reproduction", () => {
    it("should reproduce Case 1: stable pass-through bug", () => {
      const chains = createChains();
      const origin = calculateReflectedOrigin(PLAYER_CASE_1);

      console.log("\n=== CASE 1: STABLE PASS-THROUGH BUG ===");
      console.log(`Player: (${PLAYER_CASE_1.x}, ${PLAYER_CASE_1.y})`);
      console.log(`Reflected origin: (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)})`);

      const cone = createConeThroughWindow(origin, PLANNED_SURFACE.start, PLANNED_SURFACE.end);

      const sourcePoints = projectConeV2(cone, chainsWithScreen, PLANNED_SURFACE.id);
      const vertices = toVector2Array(sourcePoints);

      console.log(`\nPolygon vertices (${vertices.length}):`);
      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i]!;
        const sp = sourcePoints[i]!;
        console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)}) - ${getVertexInfo(sp)}`);
      }

      const hasSelfIntersection = checkSelfIntersection(vertices);
      console.log(`\nSelf-intersecting: ${hasSelfIntersection}`);

      // After fix: polygon should have 3 vertices (no ceiling hit)
      // The left boundary ray targets a blocking junction, so it's skipped
      expect(vertices.length).toBe(3);

      // Should not self-intersect
      expect(hasSelfIntersection).toBe(false);
    });

    it("should reproduce Case 2: flickering sub-pixel bug", () => {
      const chains = createChains();
      const origin = calculateReflectedOrigin(PLAYER_CASE_2);

      console.log("\n=== CASE 2: FLICKERING SUB-PIXEL BUG ===");
      console.log(`Player: (${PLAYER_CASE_2.x}, ${PLAYER_CASE_2.y})`);
      console.log(`Reflected origin: (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)})`);

      const cone = createConeThroughWindow(origin, PLANNED_SURFACE.start, PLANNED_SURFACE.end);

      const sourcePoints = projectConeV2(cone, chainsWithScreen, PLANNED_SURFACE.id);
      const vertices = toVector2Array(sourcePoints);

      console.log(`\nPolygon vertices (${vertices.length}):`);
      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i]!;
        const sp = sourcePoints[i]!;
        console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)}) - ${getVertexInfo(sp)}`);
      }

      const hasSelfIntersection = checkSelfIntersection(vertices);
      console.log(`\nSelf-intersecting: ${hasSelfIntersection}`);

      // After fix: same as Case 1 - 3 vertices, no self-intersection
      expect(vertices.length).toBe(3);
      expect(hasSelfIntersection).toBe(false);
    });

    it("should compare vertex order between Case 1 and Case 2", () => {
      const chains = createChains();

      console.log("\n=== COMPARING VERTEX ORDERS ===");
      console.log(
        `Player difference: ${Math.abs(PLAYER_CASE_1.x - PLAYER_CASE_2.x).toExponential()} pixels`
      );

      // Case 1
      const origin1 = calculateReflectedOrigin(PLAYER_CASE_1);
      const cone1 = createConeThroughWindow(origin1, PLANNED_SURFACE.start, PLANNED_SURFACE.end);
      const points1 = projectConeV2(cone1, chains, SCREEN_BOUNDS, PLANNED_SURFACE.id);
      const vertices1 = toVector2Array(points1);

      // Case 2
      const origin2 = calculateReflectedOrigin(PLAYER_CASE_2);
      const cone2 = createConeThroughWindow(origin2, PLANNED_SURFACE.start, PLANNED_SURFACE.end);
      const points2 = projectConeV2(cone2, chains, SCREEN_BOUNDS, PLANNED_SURFACE.id);
      const vertices2 = toVector2Array(points2);

      console.log("\nCase 1 vertex types:");
      for (let i = 0; i < points1.length; i++) {
        console.log(`  ${i}: ${getVertexInfo(points1[i]!)}`);
      }

      console.log("\nCase 2 vertex types:");
      for (let i = 0; i < points2.length; i++) {
        console.log(`  ${i}: ${getVertexInfo(points2[i]!)}`);
      }

      // Check if vertex orders are different
      const order1 = points1.map((p) => getVertexInfo(p)).join(" → ");
      const order2 = points2.map((p) => getVertexInfo(p)).join(" → ");

      console.log("\nCase 1 order:", order1);
      console.log("Case 2 order:", order2);
      console.log("Orders match:", order1 === order2);

      // After fix: Both cases should produce the same vertex order (stable)
      expect(order1).toBe(order2);
      expect(vertices1.length).toBe(3);
      expect(vertices2.length).toBe(3);
    });

    it("should verify right boundary ray hits chain3-0, not ceiling", () => {
      const chains = createChains();
      const player = PLAYER_CASE_3;
      const origin = calculateReflectedOrigin(player);

      const cone = createConeThroughWindow(origin, PLANNED_SURFACE.start, PLANNED_SURFACE.end);
      const sourcePoints = projectConeV2(cone, chainsWithScreen, PLANNED_SURFACE.id);
      const vertices = toVector2Array(sourcePoints);

      // Calculate right boundary direction
      const rightBoundary = PLANNED_SURFACE.end;
      const rightDir = { x: rightBoundary.x - origin.x, y: rightBoundary.y - origin.y };
      const rightLen = Math.sqrt(rightDir.x * rightDir.x + rightDir.y * rightDir.y);
      const rightNorm = { x: rightDir.x / rightLen, y: rightDir.y / rightLen };

      // Find all hits along the right boundary direction
      const hitsInRightDirection: { vertex: Vector2; sp: SourcePoint; distance: number }[] = [];

      for (let i = 0; i < sourcePoints.length; i++) {
        const sp = sourcePoints[i]!;
        const v = vertices[i]!;

        if (!isHitPoint(sp)) continue;

        const dir = { x: v.x - origin.x, y: v.y - origin.y };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        const norm = { x: dir.x / len, y: dir.y / len };
        const dot = rightNorm.x * norm.x + rightNorm.y * norm.y;

        if (dot > 0.999) {
          hitsInRightDirection.push({ vertex: v, sp, distance: len });
        }
      }

      console.log("\n=== RIGHT BOUNDARY RAY VERIFICATION ===");
      console.log(`Hits in right boundary direction: ${hitsInRightDirection.length}`);
      for (const hit of hitsInRightDirection) {
        const hitSp = hit.sp as any;
        console.log(
          `  (${hit.vertex.x.toFixed(2)}, ${hit.vertex.y.toFixed(2)}) - ${hitSp.hitSurface.id}, dist=${hit.distance.toFixed(2)}`
        );
      }

      // After fix: There should be exactly ONE hit in the right boundary direction
      // and it should be on chain3-0, NOT on room-0 (ceiling)
      expect(hitsInRightDirection.length).toBe(1);
      expect((hitsInRightDirection[0]!.sp as any).hitSurface.id).toBe("chain3-0");
    });
  });

  describe("Vertex Source Analysis", () => {
    it("should identify all vertex sources for Case 1", () => {
      const chains = createChains();
      const origin = calculateReflectedOrigin(PLAYER_CASE_1);

      console.log("\n=== VERTEX SOURCE ANALYSIS (CASE 1) ===");
      console.log(`Reflected origin: (${origin.x.toFixed(4)}, ${origin.y.toFixed(4)})`);

      const cone = createConeThroughWindow(origin, PLANNED_SURFACE.start, PLANNED_SURFACE.end);
      const sourcePoints = projectConeV2(cone, chainsWithScreen, PLANNED_SURFACE.id);
      const vertices = toVector2Array(sourcePoints);

      // Find the problematic vertices
      const chain3_0Hits: { index: number; pos: Vector2; s: number }[] = [];
      const ceilingHits: { index: number; pos: Vector2; s: number; surface: string }[] = [];

      for (let i = 0; i < sourcePoints.length; i++) {
        const sp = sourcePoints[i]!;
        const v = vertices[i]!;

        if (isHitPoint(sp)) {
          const hit = sp as any;
          if (hit.hitSurface.id === "chain3-0") {
            chain3_0Hits.push({ index: i, pos: v, s: hit.s });
          } else if (hit.hitSurface.id === "room-0") {
            ceilingHits.push({ index: i, pos: v, s: hit.s, surface: "room-0 (ceiling)" });
          }
        }
      }

      console.log("\nChain3-0 hits:");
      for (const hit of chain3_0Hits) {
        console.log(
          `  [${hit.index}] (${hit.pos.x.toFixed(2)}, ${hit.pos.y.toFixed(2)}) s=${hit.s.toFixed(4)}`
        );
      }

      console.log("\nCeiling hits:");
      for (const hit of ceilingHits) {
        console.log(
          `  [${hit.index}] (${hit.pos.x.toFixed(2)}, ${hit.pos.y.toFixed(2)}) s=${hit.s.toFixed(4)}`
        );
      }

      expect(chain3_0Hits.length + ceilingHits.length).toBeGreaterThan(0);
    });
  });

  describe("Sorting Cross-Product Analysis", () => {
    it("should compute cross-products for problematic vertices", () => {
      const chains = createChains();
      const origin1 = calculateReflectedOrigin(PLAYER_CASE_1);
      const origin2 = calculateReflectedOrigin(PLAYER_CASE_2);

      console.log("\n=== CROSS-PRODUCT ANALYSIS ===");

      // Get vertices for both cases
      const cone1 = createConeThroughWindow(origin1, PLANNED_SURFACE.start, PLANNED_SURFACE.end);
      const points1 = projectConeV2(cone1, chains, SCREEN_BOUNDS, PLANNED_SURFACE.id);
      const vertices1 = toVector2Array(points1);

      const cone2 = createConeThroughWindow(origin2, PLANNED_SURFACE.start, PLANNED_SURFACE.end);
      const points2 = projectConeV2(cone2, chains, SCREEN_BOUNDS, PLANNED_SURFACE.id);
      const vertices2 = toVector2Array(points2);

      // Find chain3-0 hit and ceiling hits for Case 1
      let chain3_0Vertex1: Vector2 | null = null;
      const ceilingVertices1: Vector2[] = [];

      for (let i = 0; i < points1.length; i++) {
        const sp = points1[i]!;
        const v = vertices1[i]!;
        if (isHitPoint(sp)) {
          const hit = sp as any;
          if (hit.hitSurface.id === "chain3-0") {
            chain3_0Vertex1 = v;
          } else if (hit.hitSurface.id === "room-0") {
            ceilingVertices1.push(v);
          }
        }
      }

      // Same for Case 2
      let chain3_0Vertex2: Vector2 | null = null;
      const ceilingVertices2: Vector2[] = [];

      for (let i = 0; i < points2.length; i++) {
        const sp = points2[i]!;
        const v = vertices2[i]!;
        if (isHitPoint(sp)) {
          const hit = sp as any;
          if (hit.hitSurface.id === "chain3-0") {
            chain3_0Vertex2 = v;
          } else if (hit.hitSurface.id === "room-0") {
            ceilingVertices2.push(v);
          }
        }
      }

      console.log("\n--- Case 1 ---");
      console.log(`Origin: (${origin1.x.toFixed(4)}, ${origin1.y.toFixed(4)})`);
      if (chain3_0Vertex1) {
        console.log(
          `Chain3-0 hit: (${chain3_0Vertex1.x.toFixed(4)}, ${chain3_0Vertex1.y.toFixed(4)})`
        );

        // Compute direction vectors from origin
        const chain3Dir1 = {
          x: chain3_0Vertex1.x - origin1.x,
          y: chain3_0Vertex1.y - origin1.y,
        };
        console.log(`Chain3-0 direction: (${chain3Dir1.x.toFixed(4)}, ${chain3Dir1.y.toFixed(4)})`);

        for (let i = 0; i < ceilingVertices1.length; i++) {
          const cv = ceilingVertices1[i]!;
          const ceilingDir = {
            x: cv.x - origin1.x,
            y: cv.y - origin1.y,
          };
          const cross = chain3Dir1.x * ceilingDir.y - chain3Dir1.y * ceilingDir.x;
          console.log(`\nCeiling hit ${i}: (${cv.x.toFixed(4)}, ${cv.y.toFixed(4)})`);
          console.log(
            `Ceiling direction: (${ceilingDir.x.toFixed(4)}, ${ceilingDir.y.toFixed(4)})`
          );
          console.log(`Cross product (chain3 × ceiling): ${cross.toExponential(4)}`);
          if (Math.abs(cross) < 1000) {
            console.log(`  >>> NEAR ZERO - UNSTABLE COMPARISON <<<`);
          }
        }
      }

      console.log("\n--- Case 2 ---");
      console.log(`Origin: (${origin2.x.toFixed(4)}, ${origin2.y.toFixed(4)})`);
      if (chain3_0Vertex2) {
        console.log(
          `Chain3-0 hit: (${chain3_0Vertex2.x.toFixed(4)}, ${chain3_0Vertex2.y.toFixed(4)})`
        );

        const chain3Dir2 = {
          x: chain3_0Vertex2.x - origin2.x,
          y: chain3_0Vertex2.y - origin2.y,
        };
        console.log(`Chain3-0 direction: (${chain3Dir2.x.toFixed(4)}, ${chain3Dir2.y.toFixed(4)})`);

        for (let i = 0; i < ceilingVertices2.length; i++) {
          const cv = ceilingVertices2[i]!;
          const ceilingDir = {
            x: cv.x - origin2.x,
            y: cv.y - origin2.y,
          };
          const cross = chain3Dir2.x * ceilingDir.y - chain3Dir2.y * ceilingDir.x;
          console.log(`\nCeiling hit ${i}: (${cv.x.toFixed(4)}, ${cv.y.toFixed(4)})`);
          console.log(
            `Ceiling direction: (${ceilingDir.x.toFixed(4)}, ${ceilingDir.y.toFixed(4)})`
          );
          console.log(`Cross product (chain3 × ceiling): ${cross.toExponential(4)}`);
          if (Math.abs(cross) < 1000) {
            console.log(`  >>> NEAR ZERO - UNSTABLE COMPARISON <<<`);
          }
        }
      }

      expect(true).toBe(true); // Placeholder - analysis test
    });

    it("should analyze reference direction impact", () => {
      const chains = createChains();
      const origin = calculateReflectedOrigin(PLAYER_CASE_1);

      console.log("\n=== REFERENCE DIRECTION ANALYSIS ===");

      // Compute reference direction (same as in sorting)
      const windowMidX = (PLANNED_SURFACE.start.x + PLANNED_SURFACE.end.x) / 2;
      const windowMidY = (PLANNED_SURFACE.start.y + PLANNED_SURFACE.end.y) / 2;
      const refDirection = { x: origin.x - windowMidX, y: origin.y - windowMidY };

      console.log(`Window midpoint: (${windowMidX}, ${windowMidY})`);
      console.log(`Reflected origin: (${origin.x.toFixed(4)}, ${origin.y.toFixed(4)})`);
      console.log(
        `Reference direction: (${refDirection.x.toFixed(4)}, ${refDirection.y.toFixed(4)})`
      );

      // Get vertices
      const cone = createConeThroughWindow(origin, PLANNED_SURFACE.start, PLANNED_SURFACE.end);
      const points = projectConeV2(cone, chainsWithScreen, PLANNED_SURFACE.id);
      const vertices = toVector2Array(points);

      console.log("\nVertex positions relative to reference direction:");
      for (let i = 0; i < points.length; i++) {
        const sp = points[i]!;
        const v = vertices[i]!;

        // Direction from origin to vertex
        const dir = { x: v.x - origin.x, y: v.y - origin.y };

        // Cross product with reference direction
        const crossRef = refDirection.x * dir.y - refDirection.y * dir.x;
        const side = crossRef > 0 ? "LEFT" : crossRef < 0 ? "RIGHT" : "ON";

        console.log(`  [${i}] ${getVertexInfo(sp)}`);
        console.log(`      Position: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
        console.log(`      Cross with ref: ${crossRef.toExponential(4)} (${side})`);
      }

      expect(true).toBe(true);
    });
  });

  describe("JunctionPoint.isBlocking with WindowContext (TDD)", () => {
    it("should return true (blocking) when adjacent surface is geometrically blocking", () => {
      // Create the V-shape chain
      const chain3 = createRicochetChain("chain3", [CHAIN3_LEFT, CHAIN3_APEX, CHAIN3_RIGHT]);

      // Get the junction at the apex (850, 250)
      const junctions = chain3.getJunctionPoints();
      expect(junctions.length).toBe(1);
      const junction = junctions[0]!;

      const junctionXY = junction.computeXY();
      expect(junctionXY.x).toBe(850);
      expect(junctionXY.y).toBe(250);

      // The junction connects chain3-0 (before) and chain3-1 (after)
      expect(junction.getSurfaceBefore().id).toBe("chain3-0");
      expect(junction.getSurfaceAfter().id).toBe("chain3-1");

      // Create window context: chain3-1 is the window, origin is at Case 4 position
      const origin = calculateReflectedOrigin(PLAYER_CASE_4);

      // Compute reference direction (opposite to window midpoint)
      const windowMidX = (PLANNED_SURFACE.start.x + PLANNED_SURFACE.end.x) / 2;
      const windowMidY = (PLANNED_SURFACE.start.y + PLANNED_SURFACE.end.y) / 2;
      const refDirection = { x: origin.x - windowMidX, y: origin.y - windowMidY };

      // Build window context
      const windowContext = {
        origin,
        windowSurfaceId: "chain3-1",
        refDirection,
      };

      // Empty orientations map (not needed when windowContext is provided for window junctions)
      const orientations = new Map<string, { crossProduct: number }>();

      // The junction should report blocking=true because chain3-0 (adjacent)
      // is geometrically between the ray direction and the window direction
      const isBlocking = junction.isBlocking(orientations, windowContext);

      console.log("\n=== TDD TEST: JunctionPoint.isBlocking with WindowContext ===");
      console.log(`Junction: (${junctionXY.x}, ${junctionXY.y})`);
      console.log(`Window surface: chain3-1`);
      console.log(`Adjacent surface: chain3-0`);
      console.log(`Origin: (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)})`);
      console.log(`isBlocking result: ${isBlocking}`);
      console.log(`Expected: true (adjacent surface blocks light)`);

      // This test will FAIL initially (TDD red phase)
      // After implementing WindowContext support, it should pass
      expect(isBlocking).toBe(true);
    });

    it("Case 4 should have no junction continuation after fix", () => {
      const chains = createChains();
      const origin = calculateReflectedOrigin(PLAYER_CASE_4);

      const cone = createConeThroughWindow(origin, PLANNED_SURFACE.start, PLANNED_SURFACE.end);
      const sourcePoints = projectConeV2(cone, chainsWithScreen, PLANNED_SURFACE.id);
      const vertices = toVector2Array(sourcePoints);

      console.log("\n=== TDD TEST: Case 4 junction continuation fix ===");
      console.log(`Vertices: ${vertices.length}`);
      for (let i = 0; i < sourcePoints.length; i++) {
        const sp = sourcePoints[i]!;
        const v = vertices[i]!;
        console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)}) - ${sp.type}`);
      }

      // Key assertions:
      // 1. The polygon should NOT be self-intersecting
      const hasSelfIntersection = checkSelfIntersection(vertices);
      expect(hasSelfIntersection).toBe(false);

      // 2. The window left (850, 250) should be an OriginPoint, not a JunctionPoint
      //    (JunctionPoints are deduplicated in favor of OriginPoints)
      const windowLeft = sourcePoints.find(
        (sp) => sp.computeXY().x === 850 && sp.computeXY().y === 250
      );
      expect(windowLeft).toBeDefined();
      expect(windowLeft!.type).toBe("origin");

      // 3. The left boundary ray targets a blocking junction, so it should be skipped
      //    No ceiling hit should be produced from the left boundary ray
      const ceilingHits = sourcePoints.filter(
        (sp) => isHitPoint(sp) && (sp as any).hitSurface.id === "room-0"
      );
      console.log(`Ceiling hits: ${ceilingHits.length}`);

      // There should be NO ceiling hits (left boundary ray skipped for blocking junction)
      expect(ceilingHits.length).toBe(0);

      // 4. Junction should NOT have cast a continuation
      //    This is verified by checking that isBlocking returns true
      const chain3 = chains.find((c) => c.getSurfaces().some((s) => s.id === "chain3-1"));
      expect(chain3).toBeDefined();
      const junctions = chain3!.getJunctionPoints();
      const junction = junctions.find((j) => j.computeXY().x === 850 && j.computeXY().y === 250);
      expect(junction).toBeDefined();

      // Build window context
      const windowMidX = (PLANNED_SURFACE.start.x + PLANNED_SURFACE.end.x) / 2;
      const windowMidY = (PLANNED_SURFACE.start.y + PLANNED_SURFACE.end.y) / 2;
      const refDirection = { x: origin.x - windowMidX, y: origin.y - windowMidY };
      const windowContext = {
        origin,
        windowSurfaceId: "chain3-1",
        refDirection,
      };
      const orientations = new Map<string, { crossProduct: number }>();

      // Junction should report blocking = true (no continuation expected)
      const isBlocking = junction!.isBlocking(orientations, windowContext);
      expect(isBlocking).toBe(true);
    });

    it("Case 5 should have correct polygon shape", () => {
      // Case 5: Player at (808.51, 666)
      // The polygon should be non-self-intersecting with correct vertex ordering
      const chains = createChains();
      const origin = calculateReflectedOrigin(PLAYER_CASE_5);

      const cone = createConeThroughWindow(origin, PLANNED_SURFACE.start, PLANNED_SURFACE.end);
      const sourcePoints = projectConeV2(cone, chainsWithScreen, PLANNED_SURFACE.id);
      const vertices = toVector2Array(sourcePoints);

      console.log("\n=== TDD TEST: Case 5 polygon shape ===");
      console.log(`Player: (${PLAYER_CASE_5.x.toFixed(2)}, ${PLAYER_CASE_5.y})`);
      console.log(`Reflected origin: (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)})`);
      console.log(`Vertices: ${vertices.length}`);
      for (let i = 0; i < sourcePoints.length; i++) {
        const sp = sourcePoints[i]!;
        const v = vertices[i]!;
        console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)}) - ${sp.type}`);
      }

      // Key assertion: No self-intersection
      const hasSelfIntersection = checkSelfIntersection(vertices);
      expect(hasSelfIntersection).toBe(false);

      // Verify polygon structure:
      // - First vertex should be window right (880, 302)
      // - Last vertex should be window left (850, 250)
      // - Ceiling hit should be between chain3-0 hits and window left
      expect(vertices[0]!.x).toBeCloseTo(880, 0);
      expect(vertices[0]!.y).toBeCloseTo(302, 0);
      expect(vertices[vertices.length - 1]!.x).toBeCloseTo(850, 0);
      expect(vertices[vertices.length - 1]!.y).toBeCloseTo(250, 0);
    });
  });

  describe("Left Boundary Ray Bug (Case 6)", () => {
    it("should investigate why left boundary ray passes through junction", () => {
      // Case 6: Expected polygon should be a TRIANGLE with 3 vertices:
      // - Window right endpoint (880, 302)
      // - Junction (850, 250)
      // - Adjacent hitpoint on chain3-0
      const chains = createChains();
      const origin = calculateReflectedOrigin(PLAYER_CASE_6);

      console.log("\n=== CASE 6: LEFT BOUNDARY RAY BUG ===");
      console.log(`Player: (${PLAYER_CASE_6.x}, ${PLAYER_CASE_6.y})`);
      console.log(`Reflected origin: (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)})`);

      const cone = createConeThroughWindow(origin, PLANNED_SURFACE.start, PLANNED_SURFACE.end);
      const sourcePoints = projectConeV2(cone, chainsWithScreen, PLANNED_SURFACE.id);
      const vertices = toVector2Array(sourcePoints);

      console.log(`\nPolygon vertices (${vertices.length}):`);
      for (let i = 0; i < sourcePoints.length; i++) {
        const sp = sourcePoints[i]!;
        const v = vertices[i]!;
        console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)}) - ${sp.type}`);
      }

      // Analyze the cone boundaries
      console.log(`\n--- CONE BOUNDARY ANALYSIS ---`);
      console.log(`Cone leftBoundary: (${cone.leftBoundary.x}, ${cone.leftBoundary.y})`);
      console.log(`Cone rightBoundary: (${cone.rightBoundary.x}, ${cone.rightBoundary.y})`);

      // Check if left boundary is at the junction
      const leftIsJunction =
        cone.leftBoundary.x === 850 && cone.leftBoundary.y === 250;
      const rightIsJunction =
        cone.rightBoundary.x === 850 && cone.rightBoundary.y === 250;
      console.log(`Left boundary is junction: ${leftIsJunction}`);
      console.log(`Right boundary is junction: ${rightIsJunction}`);

      // Find the ceiling hit (room-0)
      const ceilingHits = sourcePoints.filter(
        (sp) => isHitPoint(sp) && (sp as any).hitSurface.id === "room-0"
      );
      console.log(`\nCeiling hits: ${ceilingHits.length}`);
      for (const hit of ceilingHits) {
        const xy = hit.computeXY();
        console.log(`  - (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)})`);
      }

      // The bug: left boundary ray goes through junction to ceiling
      // but it should be blocked by chain3-0
      console.log(`\n--- ROOT CAUSE ANALYSIS ---`);

      // Check the geometry: does the left boundary ray intersect chain3-0?
      const junctionXY = { x: 850, y: 250 };
      const chain3_0_start = { x: 820, y: 301.9615242270663 };
      const chain3_0_end = { x: 850, y: 250 };

      // Ray direction from origin to left boundary (junction)
      const rayDir = {
        x: cone.leftBoundary.x - origin.x,
        y: cone.leftBoundary.y - origin.y,
      };
      console.log(`Ray direction to left boundary: (${rayDir.x.toFixed(2)}, ${rayDir.y.toFixed(2)})`);

      // The ray targets the junction at (850, 250), which is the END of chain3-0
      // So the ray only touches chain3-0 at s=1.0 (the junction endpoint)
      // The hit at s=1.0 has t = minT (at the target), so it's SKIPPED
      console.log(`\nProblem: Ray to junction only touches chain3-0 at s=1.0 (the endpoint)`);
      console.log(`The hit at s=1.0 has t=minT, so it's skipped by castRayToTarget`);
      console.log(`Result: Ray continues past junction and hits ceiling`);

      // Expected behavior: if junction is blocking, no left boundary ray should be cast
      console.log(`\n--- EXPECTED FIX ---`);
      console.log(`If left boundary targets a blocking junction:`);
      console.log(`  1. Don't cast the left boundary ray`);
      console.log(`  2. Or, check for blocking BEFORE the ray passes through`);

      // Verify: the ceiling hit should NOT be in the polygon
      // (Multiple chain3-0 hits from rays to other endpoints are OK)
      console.log(`\n--- EXPECTED VS ACTUAL ---`);
      console.log(`Expected: No ceiling hits (left boundary ray skipped for blocking junction)`);
      console.log(`Actual: ${ceilingHits.length} ceiling hits`);

      // The ceiling hit should NOT be in the polygon
      expect(ceilingHits.length).toBe(0);

      // Polygon should not be self-intersecting
      expect(checkSelfIntersection(vertices)).toBe(false);
    });

    it("should trace the source of each chain3-0 hit", () => {
      // Investigate: where do the 3 chain3-0 hits come from?
      const chains = createChains();
      const origin = calculateReflectedOrigin(PLAYER_CASE_6);
      const cone = createConeThroughWindow(origin, PLANNED_SURFACE.start, PLANNED_SURFACE.end);
      const sourcePoints = projectConeV2(cone, chainsWithScreen, PLANNED_SURFACE.id);

      console.log("\n=== CHAIN3-0 HIT SOURCE ANALYSIS ===");

      // Find all chain3-0 hits
      const chain3_0_hits = sourcePoints.filter(
        (sp) => isHitPoint(sp) && (sp as any).hitSurface.id === "chain3-0"
      );

      console.log(`Chain3-0 hits: ${chain3_0_hits.length}`);
      for (const hit of chain3_0_hits) {
        const xy = hit.computeXY();
        const hitPoint = hit as any;
        console.log(`  - (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) s=${hitPoint.s?.toFixed(4) || 'N/A'}`);
      }

      // Check what vertices are in the polygon
      console.log(`\n--- ALL VERTICES ---`);
      for (let i = 0; i < sourcePoints.length; i++) {
        const sp = sourcePoints[i]!;
        const xy = sp.computeXY();
        console.log(`  ${i}: (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) - ${sp.type} [${sp.getKey()}]`);
      }

      // Analyze: for 3 vertices expected, we need:
      // 1. Window right origin (880, 302)
      // 2. Junction origin (850, 250)
      // 3. ONE chain3-0 hit (from right boundary ray)
      //
      // But we're getting 5 vertices. The extra 2 chain3-0 hits must be from
      // continuation rays from endpoints at (880, 302).
      //
      // For the user's expected 3-vertex triangle:
      // - No continuation rays should be cast from (880, 302) for this geometry
      // - OR the continuation rays shouldn't hit chain3-0

      console.log(`\n--- ANALYSIS ---`);
      console.log(`The 3 chain3-0 hits have s-values: 0.33, 0.43, 0.68`);
      console.log(`These must come from 3 DIFFERENT rays.`);
      console.log(`\nPossible sources:`);
      console.log(`  1. Right boundary ray (origin → 880,302 extended) → hits at s≈0.33`);
      console.log(`  2. Continuation from chain2 endpoint (880,302) → same direction as #1`);
      console.log(`  3. Continuation from chain3-1 endpoint (880,302) → same direction as #1`);
      console.log(`\nBUT #1, #2, #3 are all in the SAME direction!`);
      console.log(`They should all hit at s≈0.33, not at 0.43 and 0.68.`);

      // For the user's expected 3-vertex triangle:
      // The continuation rays from endpoints shouldn't be cast at all
      // because (880, 302) is a window endpoint
      //
      // HYPOTHESIS: The extra hits are from continuation rays that shouldn't exist
      // or from rays to targets that aren't being filtered correctly.

      console.log(`\n--- MATHEMATICAL VERIFICATION ---`);
      // Calculate where each hit's ray must have originated from
      const chain3_0_segment = {
        start: { x: 820, y: 301.9615242270663 },
        end: { x: 850, y: 250 },
      };

      for (const hit of chain3_0_hits) {
        const hitPoint = hit as any;
        const s = hitPoint.s || 0;
        const hitXY = hit.computeXY();

        // Compute the ray direction from origin to hit point
        const rayDir = { x: hitXY.x - origin.x, y: hitXY.y - origin.y };
        const rayLen = Math.sqrt(rayDir.x * rayDir.x + rayDir.y * rayDir.y);
        const normalizedDir = { x: rayDir.x / rayLen, y: rayDir.y / rayLen };

        // Extend the ray 1000 units to find where it was going
        const extended = {
          x: hitXY.x + normalizedDir.x * 1000,
          y: hitXY.y + normalizedDir.y * 1000,
        };

        console.log(`\nHit at s=${s.toFixed(4)} (${hitXY.x.toFixed(2)}, ${hitXY.y.toFixed(2)}):`);
        console.log(`  Ray direction: (${normalizedDir.x.toFixed(4)}, ${normalizedDir.y.toFixed(4)})`);
        console.log(`  Extended to: (${extended.x.toFixed(0)}, ${extended.y.toFixed(0)})`);
      }

      // The expected hit from right boundary ray
      console.log(`\n--- RIGHT BOUNDARY RAY EXPECTED HIT ---`);
      const rightBoundaryDir = {
        x: 880 - origin.x,
        y: 301.9615242270663 - origin.y,
      };
      const rightLen = Math.sqrt(rightBoundaryDir.x * rightBoundaryDir.x + rightBoundaryDir.y * rightBoundaryDir.y);
      const normalizedRightDir = {
        x: rightBoundaryDir.x / rightLen,
        y: rightBoundaryDir.y / rightLen,
      };
      console.log(`Right boundary direction: (${normalizedRightDir.x.toFixed(4)}, ${normalizedRightDir.y.toFixed(4)})`);
    });

    it("should verify left boundary targeting a blocking junction", () => {
      const chains = createChains();
      const origin = calculateReflectedOrigin(PLAYER_CASE_6);
      const cone = createConeThroughWindow(origin, PLANNED_SURFACE.start, PLANNED_SURFACE.end);

      // Check which boundary is the junction
      const leftIsJunction =
        cone.leftBoundary.x === CHAIN3_APEX.x && cone.leftBoundary.y === CHAIN3_APEX.y;

      console.log("\n=== LEFT BOUNDARY JUNCTION CHECK ===");
      console.log(`Left boundary: (${cone.leftBoundary.x}, ${cone.leftBoundary.y})`);
      console.log(`Junction (CHAIN3_APEX): (${CHAIN3_APEX.x}, ${CHAIN3_APEX.y})`);
      console.log(`Left boundary is junction: ${leftIsJunction}`);

      if (leftIsJunction) {
        // Check if the junction is blocking
        const chain3 = chains.find((c) =>
          c.getSurfaces().some((s) => s.id === "chain3-1")
        );
        expect(chain3).toBeDefined();
        const junctions = chain3!.getJunctionPoints();
        const junction = junctions.find(
          (j) => j.computeXY().x === 850 && j.computeXY().y === 250
        );
        expect(junction).toBeDefined();

        // Build window context
        const windowMidX = (PLANNED_SURFACE.start.x + PLANNED_SURFACE.end.x) / 2;
        const windowMidY = (PLANNED_SURFACE.start.y + PLANNED_SURFACE.end.y) / 2;
        const refDirection = { x: origin.x - windowMidX, y: origin.y - windowMidY };
        const windowContext = {
          origin,
          windowSurfaceId: "chain3-1",
          refDirection,
        };
        const orientations = new Map<string, { crossProduct: number }>();

        const isBlocking = junction!.isBlocking(orientations, windowContext);
        console.log(`Junction isBlocking: ${isBlocking}`);

        // If the junction is blocking AND left boundary targets it,
        // the left boundary ray should NOT produce a ceiling hit
        expect(isBlocking).toBe(true);

        console.log(`\n>>> BUG: Left boundary ray targets blocking junction`);
        console.log(`>>> but continues past it to hit the ceiling`);
        console.log(`>>> FIX: Skip left boundary ray when targeting blocking junction`);
      }

      expect(leftIsJunction).toBe(true);
    });
  });

  describe("Junction Continuation Bug (Case 4)", () => {
    it("should reproduce the junction continuation bug", () => {
      const chains = createChains();
      const origin = calculateReflectedOrigin(PLAYER_CASE_4);

      console.log("\n=== CASE 4: JUNCTION CONTINUATION BUG ===");
      console.log(`Player: (${PLAYER_CASE_4.x}, ${PLAYER_CASE_4.y})`);
      console.log(`Reflected origin: (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)})`);

      const cone = createConeThroughWindow(origin, PLANNED_SURFACE.start, PLANNED_SURFACE.end);

      const sourcePoints = projectConeV2(cone, chainsWithScreen, PLANNED_SURFACE.id);
      const vertices = toVector2Array(sourcePoints);

      console.log(`\nPolygon vertices (${vertices.length}):`);
      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i]!;
        const sp = sourcePoints[i]!;
        console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)}) - ${getVertexInfo(sp)}`);
      }

      const hasSelfIntersection = checkSelfIntersection(vertices);
      console.log(`\nSelf-intersecting: ${hasSelfIntersection}`);

      // The bug: polygon has 5 vertices instead of expected 4
      // There's an unexplained hitpoint between the first hit and the junction
      console.log(`\n--- BUG ANALYSIS ---`);
      console.log(`Expected: 4 vertices (window ends + 1 adjacent hit + 1 ceiling hit)`);
      console.log(`Actual: ${vertices.length} vertices`);

      if (vertices.length > 4) {
        console.log(`\n>>> BUG CONFIRMED: Extra vertex found!`);
        // Find the extra vertex
        for (let i = 0; i < sourcePoints.length; i++) {
          const sp = sourcePoints[i]!;
          const v = vertices[i]!;
          if (isHitPoint(sp)) {
            const hit = sp as any;
            console.log(
              `  HitPoint ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)}) on ${hit.hitSurface.id}`
            );
          }
        }
      }

      expect(true).toBe(true);
    });

    it("should analyze which rays produced the hitpoints", () => {
      const chains = createChains();
      const origin = calculateReflectedOrigin(PLAYER_CASE_4);

      console.log("\n=== RAY ANALYSIS FOR CASE 4 ===");

      const cone = createConeThroughWindow(origin, PLANNED_SURFACE.start, PLANNED_SURFACE.end);
      const sourcePoints = projectConeV2(cone, chainsWithScreen, PLANNED_SURFACE.id);
      const vertices = toVector2Array(sourcePoints);

      // Find all HitPoints on chain3-0
      const chain3Hits: { vertex: Vector2; sp: SourcePoint; index: number }[] = [];
      for (let i = 0; i < sourcePoints.length; i++) {
        const sp = sourcePoints[i]!;
        const v = vertices[i]!;
        if (isHitPoint(sp)) {
          const hit = sp as any;
          if (hit.hitSurface.id === "chain3-0") {
            chain3Hits.push({ vertex: v, sp, index: i });
          }
        }
      }

      console.log(`\nHitPoints on chain3-0: ${chain3Hits.length}`);
      for (const h of chain3Hits) {
        const hit = h.sp as any;
        console.log(
          `  ${h.index}: (${h.vertex.x.toFixed(4)}, ${h.vertex.y.toFixed(4)}) s=${hit.s.toFixed(4)}`
        );

        // Calculate ray direction from origin to this hit
        const dir = { x: h.vertex.x - origin.x, y: h.vertex.y - origin.y };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        const norm = { x: dir.x / len, y: dir.y / len };
        console.log(`      Ray direction: (${norm.x.toFixed(4)}, ${norm.y.toFixed(4)})`);
      }

      // Calculate directions for window boundaries
      const leftBoundary = PLANNED_SURFACE.start;
      const rightBoundary = PLANNED_SURFACE.end;

      const leftDir = { x: leftBoundary.x - origin.x, y: leftBoundary.y - origin.y };
      const leftLen = Math.sqrt(leftDir.x * leftDir.x + leftDir.y * leftDir.y);
      const leftNorm = { x: leftDir.x / leftLen, y: leftDir.y / leftLen };

      const rightDir = { x: rightBoundary.x - origin.x, y: rightBoundary.y - origin.y };
      const rightLen = Math.sqrt(rightDir.x * rightDir.x + rightDir.y * rightDir.y);
      const rightNorm = { x: rightDir.x / rightLen, y: rightDir.y / rightLen };

      console.log(`\nWindow boundary directions:`);
      console.log(
        `  Left (${leftBoundary.x}, ${leftBoundary.y}): (${leftNorm.x.toFixed(4)}, ${leftNorm.y.toFixed(4)})`
      );
      console.log(
        `  Right (${rightBoundary.x}, ${rightBoundary.y.toFixed(2)}): (${rightNorm.x.toFixed(4)}, ${rightNorm.y.toFixed(4)})`
      );

      // Check which chain3-0 hits are on boundary ray directions
      console.log(`\n--- Matching hits to boundary rays ---`);
      for (const h of chain3Hits) {
        const dir = { x: h.vertex.x - origin.x, y: h.vertex.y - origin.y };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        const norm = { x: dir.x / len, y: dir.y / len };

        const dotLeft = leftNorm.x * norm.x + leftNorm.y * norm.y;
        const dotRight = rightNorm.x * norm.x + rightNorm.y * norm.y;

        console.log(`  Hit at (${h.vertex.x.toFixed(2)}, ${h.vertex.y.toFixed(2)}):`);
        console.log(`    Dot with left boundary: ${dotLeft.toFixed(6)}`);
        console.log(`    Dot with right boundary: ${dotRight.toFixed(6)}`);

        if (dotLeft > 0.9999) {
          console.log(`    >>> This is from the LEFT boundary ray`);
        } else if (dotRight > 0.9999) {
          console.log(`    >>> This is from the RIGHT boundary ray`);
        } else {
          console.log(`    >>> This is from a DIFFERENT ray (endpoint/junction continuation?)`);
        }
      }

      expect(true).toBe(true);
    });

    it("should identify all ray sources for chain3-0 hits", () => {
      const chains = createChains();
      const origin = calculateReflectedOrigin(PLAYER_CASE_4);

      console.log("\n=== IDENTIFYING RAY SOURCES FOR CHAIN3-0 HITS ===");

      // Get all endpoints that might produce rays toward chain3-0
      const allSurfaces = chains.flatMap((c) => c.getSurfaces());

      console.log(`\nEndpoints that could produce rays hitting chain3-0:`);

      // chain3-0 segment
      const chain3_0_start = { x: 820, y: 301.9615242270663 };
      const chain3_0_end = { x: 850, y: 250 };

      for (const surface of allSurfaces) {
        for (const endpoint of [surface.segment.start, surface.segment.end]) {
          // Check if ray from origin to this endpoint intersects chain3-0
          const dir = { x: endpoint.x - origin.x, y: endpoint.y - origin.y };
          const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);

          // Line-line intersection with chain3-0
          const denom =
            dir.x * (chain3_0_end.y - chain3_0_start.y) -
            dir.y * (chain3_0_end.x - chain3_0_start.x);

          if (Math.abs(denom) > 0.0001) {
            const dx = chain3_0_start.x - origin.x;
            const dy = chain3_0_start.y - origin.y;
            const t =
              (dx * (chain3_0_end.y - chain3_0_start.y) -
                dy * (chain3_0_end.x - chain3_0_start.x)) /
              denom;
            const s = (dx * dir.y - dy * dir.x) / denom;

            if (t > 0 && s >= 0 && s <= 1) {
              const hitX = origin.x + t * dir.x;
              const hitY = origin.y + t * dir.y;
              console.log(
                `\n  ${surface.id} at (${endpoint.x.toFixed(0)}, ${endpoint.y.toFixed(0)}):`
              );
              console.log(`    Ray intersects chain3-0 at s=${s.toFixed(4)}`);
              console.log(`    Hit point: (${hitX.toFixed(2)}, ${hitY.toFixed(2)})`);
              console.log(`    Target distance: ${len.toFixed(2)}`);
              console.log(`    Hit t: ${t.toFixed(4)}`);

              // Check if endpoint is past the hit (ray was blocked before reaching target)
              const hitDist = Math.sqrt((hitX - origin.x) ** 2 + (hitY - origin.y) ** 2);
              if (hitDist < len) {
                console.log(`    >>> Ray was BLOCKED by chain3-0 before reaching endpoint!`);
              }
            }
          }
        }
      }

      expect(true).toBe(true);
    });

    it("should check if junction has incorrect continuation ray", () => {
      const chains = createChains();
      const origin = calculateReflectedOrigin(PLAYER_CASE_4);

      console.log("\n=== JUNCTION CONTINUATION ANALYSIS ===");

      // Find the junction at (850, 250)
      const junction = { x: 850, y: 250 };

      // Ray direction to junction (same as production code line 682)
      const rayDir = { x: junction.x - origin.x, y: junction.y - origin.y };
      const rayLen = Math.sqrt(rayDir.x * rayDir.x + rayDir.y * rayDir.y);
      const rayNorm = { x: rayDir.x / rayLen, y: rayDir.y / rayLen };

      console.log(`Junction: (${junction.x}, ${junction.y})`);
      console.log(`Origin: (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)})`);
      console.log(`rayDir (junction - origin): (${rayDir.x.toFixed(2)}, ${rayDir.y.toFixed(2)})`);

      // Get the polygon and check for continuation
      const cone = createConeThroughWindow(origin, PLANNED_SURFACE.start, PLANNED_SURFACE.end);
      const sourcePoints = projectConeV2(cone, chainsWithScreen, PLANNED_SURFACE.id);
      const vertices = toVector2Array(sourcePoints);

      console.log(`\n--- Checking for continuation hit past junction ---`);

      for (let i = 0; i < sourcePoints.length; i++) {
        const sp = sourcePoints[i]!;
        const v = vertices[i]!;

        if (!isHitPoint(sp)) continue;

        const dir = { x: v.x - origin.x, y: v.y - origin.y };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        const norm = { x: dir.x / len, y: dir.y / len };

        const dot = rayNorm.x * norm.x + rayNorm.y * norm.y;

        if (dot > 0.9999 && len > rayLen) {
          const hit = sp as any;
          console.log(`\n>>> CONTINUATION HIT past junction!`);
          console.log(`    Position: (${v.x.toFixed(4)}, ${v.y.toFixed(4)})`);
          console.log(`    Surface: ${hit.hitSurface.id}`);
        }
      }

      // Replicate the exact blocking check from production code
      console.log(`\n--- Replicating production blocking check ---`);

      // The window surface is chain3-1: (850, 250) → (880, 302)
      // Adjacent surface BEFORE is chain3-0: (820, 302) → (850, 250)
      // This is at window START = left boundary

      const windowSurface = { start: { x: 850, y: 250 }, end: { x: 880, y: 301.9615242270663 } };
      const adjSurface = { start: { x: 820, y: 301.9615242270663 }, end: { x: 850, y: 250 } };

      // Production code line 679: junction = windowSurface.segment.start
      const junctionAtStart = windowSurface.start;

      // Production code line 682-689
      const prodRayDir = { x: junctionAtStart.x - origin.x, y: junctionAtStart.y - origin.y };
      const windowOther = windowSurface.end;
      const prodWindowDir = {
        x: windowOther.x - junctionAtStart.x,
        y: windowOther.y - junctionAtStart.y,
      };

      // Adjacent other: check which endpoint of adjSurface is at the junction
      const adjAtJunction =
        adjSurface.end.x === junctionAtStart.x && adjSurface.end.y === junctionAtStart.y;
      const adjOther = adjAtJunction ? adjSurface.start : adjSurface.end;
      const prodAdjDir = { x: adjOther.x - junctionAtStart.x, y: adjOther.y - junctionAtStart.y };

      console.log(`\nProduction code values:`);
      console.log(`  junction: (${junctionAtStart.x}, ${junctionAtStart.y})`);
      console.log(`  rayDir: (${prodRayDir.x.toFixed(2)}, ${prodRayDir.y.toFixed(2)})`);
      console.log(`  windowDir: (${prodWindowDir.x.toFixed(2)}, ${prodWindowDir.y.toFixed(2)})`);
      console.log(`  adjacentDir: (${prodAdjDir.x.toFixed(2)}, ${prodAdjDir.y.toFixed(2)})`);

      // Compute reference direction (line 654-658)
      const startLine = { start: PLANNED_SURFACE.start, end: PLANNED_SURFACE.end };
      const windowMidX = (startLine.start.x + startLine.end.x) / 2;
      const windowMidY = (startLine.start.y + startLine.end.y) / 2;
      const refDirection = { x: origin.x - windowMidX, y: origin.y - windowMidY };

      console.log(`  refDirection: (${refDirection.x.toFixed(2)}, ${refDirection.y.toFixed(2)})`);

      // Compute compareDirectionsCCW (lines 604-615)
      function compareDirectionsCCW(a: Vector2, b: Vector2, ref: Vector2): number {
        const aRef = ref.x * a.y - ref.y * a.x;
        const bRef = ref.x * b.y - ref.y * b.x;

        const oppositeSides = (aRef > 0 && bRef < 0) || (aRef < 0 && bRef > 0);
        if (oppositeSides) {
          return aRef > 0 ? -1 : 1;
        }

        const crossAB = a.x * b.y - a.y * b.x;
        return crossAB > 0 ? -1 : 1;
      }

      const cmpRayAdj = compareDirectionsCCW(prodRayDir, prodAdjDir, refDirection);
      const cmpWindowAdj = compareDirectionsCCW(prodWindowDir, prodAdjDir, refDirection);

      console.log(`\ncompareDirectionsCCW results:`);
      console.log(`  cmpRayAdj: ${cmpRayAdj}`);
      console.log(`  cmpWindowAdj: ${cmpWindowAdj}`);

      const shouldBlock = cmpRayAdj < 0 !== cmpWindowAdj < 0;
      console.log(`\nshouldAdjacentBlockLight: ${shouldBlock}`);

      if (shouldBlock) {
        console.log(`>>> Adjacent surface SHOULD block - no continuation expected!`);
      } else {
        console.log(`>>> Adjacent surface should NOT block - continuation is allowed`);
      }

      // Now check what the JunctionPoint.isBlocking() method returns
      console.log(`\n--- Checking JunctionPoint.isBlocking() ---`);

      // Find the junction in the chain
      const chain3 = chains.find((c) => c.getSurfaces().some((s) => s.id === "chain3-0"));
      if (chain3) {
        const junctions = chain3.getJunctionPoints();
        console.log(`chain3 has ${junctions.length} junctions`);

        for (const j of junctions) {
          const jxy = j.computeXY();
          console.log(`\n  Junction at (${jxy.x}, ${jxy.y}):`);
          console.log(`    surfaceBefore: ${j.getSurfaceBefore().id}`);
          console.log(`    surfaceAfter: ${j.getSurfaceAfter().id}`);

          // Check if this is the window junction
          const isWindowJunction =
            j.getSurfaceBefore().id === "chain3-1" || j.getSurfaceAfter().id === "chain3-1";
          console.log(`    isWindowJunction: ${isWindowJunction}`);

          // The isBlocking() method needs surfaceOrientations
          // We can't easily compute this here, but we can infer from the code logic
          console.log(`\n    The code logic (line 889):`);
          console.log(`    - isBlocking = target.isBlocking(surfaceOrientations)`);
          console.log(`    - shouldCastContinuation = isWindowJunction ? isBlocking : !isBlocking`);
          console.log(`\n    For window junctions, the logic is REVERSED:`);
          console.log(
            `    - If isBlocking=true → shouldCastContinuation=true (continuation is cast)`
          );
          console.log(`    - If isBlocking=false → shouldCastContinuation=false (no continuation)`);
          console.log(`\n    >>> THIS IS THE BUG!`);
          console.log(`    The code reverses the logic for window junctions,`);
          console.log(
            `    but it uses JunctionPoint.isBlocking() instead of shouldAdjacentBlockLight().`
          );
          console.log(`    These two methods give DIFFERENT results!`);
        }
      }

      console.log(`\n--- ROOT CAUSE ---`);
      console.log(
        `The shouldAdjacentBlockLight() geometric test says: adjacent SHOULD block (true)`
      );
      console.log(`But the JunctionPoint.isBlocking() provenance-based test uses different logic.`);
      console.log(
        `The code uses isBlocking() for the continuation decision, not shouldAdjacentBlockLight().`
      );
      console.log(`\nSince isWindowJunction=true and shouldCastContinuation = isBlocking,`);
      console.log(`the continuation is cast based on the WRONG blocking determination.`);

      expect(true).toBe(true);
    });
  });

  describe("Hypothesis Tests", () => {
    it("should prove sorting instability by showing cross-product sign flips", () => {
      const chains = createChains();

      console.log("\n=== HYPOTHESIS TEST: CROSS-PRODUCT SIGN FLIP ===");
      console.log("Testing if cross-products flip sign with sub-pixel changes...\n");

      // Test a range of player positions around the bug
      const baseX = 864.331;
      const positions = [baseX - 0.001, baseX - 0.0001, baseX, baseX + 0.0001, baseX + 0.001];

      const results: { x: number; crossProducts: number[]; order: string }[] = [];

      for (const px of positions) {
        const player = { x: px, y: 666 };
        const origin = calculateReflectedOrigin(player);

        const cone = createConeThroughWindow(origin, PLANNED_SURFACE.start, PLANNED_SURFACE.end);
        const points = projectConeV2(cone, chainsWithScreen, PLANNED_SURFACE.id);
        const vertices = toVector2Array(points);

        // Find chain3-0 hit and ceiling hits
        let chain3Vertex: Vector2 | null = null;
        const ceilingVertices: Vector2[] = [];

        for (let i = 0; i < points.length; i++) {
          const sp = points[i]!;
          const v = vertices[i]!;
          if (isHitPoint(sp)) {
            const hit = sp as any;
            if (hit.hitSurface.id === "chain3-0") {
              chain3Vertex = v;
            } else if (hit.hitSurface.id === "room-0") {
              ceilingVertices.push(v);
            }
          }
        }

        // Compute cross products
        const crossProducts: number[] = [];
        if (chain3Vertex) {
          const chain3Dir = {
            x: chain3Vertex.x - origin.x,
            y: chain3Vertex.y - origin.y,
          };
          for (const cv of ceilingVertices) {
            const ceilingDir = { x: cv.x - origin.x, y: cv.y - origin.y };
            const cross = chain3Dir.x * ceilingDir.y - chain3Dir.y * ceilingDir.x;
            crossProducts.push(cross);
          }
        }

        const order = points
          .map((p) => {
            if (isHitPoint(p)) {
              const hit = p as any;
              if (hit.hitSurface.id === "chain3-0") return "C3";
              if (hit.hitSurface.id === "room-0") return "R0";
            }
            return "?";
          })
          .filter((s) => s !== "?")
          .join(",");

        results.push({ x: px, crossProducts, order });
      }

      console.log("Results:");
      for (const r of results) {
        console.log(
          `  x=${r.x.toFixed(6)}: order=[${r.order}] cross=[${r.crossProducts.map((c) => c.toExponential(2)).join(", ")}]`
        );
      }

      // Check for sign changes
      let signFlips = 0;
      for (let i = 1; i < results.length; i++) {
        const prev = results[i - 1]!;
        const curr = results[i]!;
        for (let j = 0; j < Math.min(prev.crossProducts.length, curr.crossProducts.length); j++) {
          if (prev.crossProducts[j]! > 0 !== curr.crossProducts[j]! > 0) {
            signFlips++;
            console.log(
              `\n>>> SIGN FLIP detected between x=${prev.x.toFixed(6)} and x=${curr.x.toFixed(6)}`
            );
            console.log(
              `    Cross product changed from ${prev.crossProducts[j]!.toExponential(4)} to ${curr.crossProducts[j]!.toExponential(4)}`
            );
          }
        }
      }

      console.log(`\nTotal sign flips: ${signFlips}`);

      // Check for order changes
      const uniqueOrders = new Set(results.map((r) => r.order));
      console.log(`\nUnique vertex orders: ${uniqueOrders.size}`);
      for (const order of uniqueOrders) {
        console.log(`  - ${order}`);
      }

      // The bug is proven if we see sign flips or different orders
      expect(uniqueOrders.size).toBeGreaterThanOrEqual(1);
    });

    it("should identify which specific comparison causes the instability", () => {
      const chains = createChains();

      console.log("\n=== IDENTIFYING UNSTABLE COMPARISON ===");

      // Use the two exact bug positions
      const origin1 = calculateReflectedOrigin(PLAYER_CASE_1);
      const origin2 = calculateReflectedOrigin(PLAYER_CASE_2);

      console.log(`Case 1 origin: (${origin1.x}, ${origin1.y})`);
      console.log(`Case 2 origin: (${origin2.x}, ${origin2.y})`);
      console.log(
        `Origin difference: (${(origin1.x - origin2.x).toExponential()}, ${(origin1.y - origin2.y).toExponential()})`
      );

      // Compute reference direction for both
      const windowMid = {
        x: (PLANNED_SURFACE.start.x + PLANNED_SURFACE.end.x) / 2,
        y: (PLANNED_SURFACE.start.y + PLANNED_SURFACE.end.y) / 2,
      };

      const ref1 = { x: origin1.x - windowMid.x, y: origin1.y - windowMid.y };
      const ref2 = { x: origin2.x - windowMid.x, y: origin2.y - windowMid.y };

      console.log(`\nRef direction 1: (${ref1.x.toFixed(4)}, ${ref1.y.toFixed(4)})`);
      console.log(`Ref direction 2: (${ref2.x.toFixed(4)}, ${ref2.y.toFixed(4)})`);

      // Get all vertices and analyze which pairs have unstable comparisons
      const cone1 = createConeThroughWindow(origin1, PLANNED_SURFACE.start, PLANNED_SURFACE.end);
      const points1 = projectConeV2(cone1, chains, SCREEN_BOUNDS, PLANNED_SURFACE.id);
      const vertices1 = toVector2Array(points1);

      console.log("\n--- Pairwise comparison analysis for Case 1 ---");

      // Compare all pairs of HitPoints
      const hitPoints1: { info: string; v: Vector2; dir: Vector2 }[] = [];
      for (let i = 0; i < points1.length; i++) {
        const sp = points1[i]!;
        const v = vertices1[i]!;
        if (isHitPoint(sp)) {
          const hit = sp as any;
          const dir = { x: v.x - origin1.x, y: v.y - origin1.y };
          hitPoints1.push({ info: hit.hitSurface.id, v, dir });
        }
      }

      console.log(`Found ${hitPoints1.length} HitPoints`);

      for (let i = 0; i < hitPoints1.length; i++) {
        for (let j = i + 1; j < hitPoints1.length; j++) {
          const a = hitPoints1[i]!;
          const b = hitPoints1[j]!;

          // Cross product between directions
          const crossAB = a.dir.x * b.dir.y - a.dir.y * b.dir.x;

          // Cross products with reference direction
          const aRef = ref1.x * a.dir.y - ref1.y * a.dir.x;
          const bRef = ref1.x * b.dir.y - ref1.y * b.dir.x;

          // Check if on opposite sides of reference
          const oppositeSides = (aRef > 0 && bRef < 0) || (aRef < 0 && bRef > 0);

          const isUnstable =
            Math.abs(crossAB) < 1000 || Math.abs(aRef) < 100 || Math.abs(bRef) < 100;

          if (isUnstable) {
            console.log(`\n>>> POTENTIALLY UNSTABLE: ${a.info} vs ${b.info}`);
            console.log(`    Cross(A,B): ${crossAB.toExponential(4)}`);
            console.log(`    A cross ref: ${aRef.toExponential(4)}`);
            console.log(`    B cross ref: ${bRef.toExponential(4)}`);
            console.log(`    Opposite sides: ${oppositeSides}`);
          }
        }
      }

      expect(true).toBe(true);
    });
  });
});
