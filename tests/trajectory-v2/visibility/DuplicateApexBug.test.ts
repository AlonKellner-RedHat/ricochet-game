/**
 * Duplicate Apex Bug Reproduction Test
 *
 * This test reproduces a pixel-perfect bug where the junction apex (650, 250)
 * appears TWICE in the reflected polygon with slightly different coordinates:
 * - First: (650, 250) - exact
 * - Second: (650, 250.00000000000006) - floating-point error
 *
 * This creates an invalid 5-vertex polygon instead of the correct 4-vertex one.
 *
 * Bug Report:
 * - Buggy player: (1105.6955874, 666) - 5 vertices with duplicate apex
 * - Correct player: (1105.6955179119636, 666) - 4 vertices, no duplicate
 * - Difference: ~0.0000007 in X position
 */

import { describe, it, expect } from "vitest";
import { RicochetSurface } from "@/surfaces/RicochetSurface";
import { createRicochetChain, type SurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";
import {
  createFullCone,
  createConeThroughWindow,
  projectConeV2,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import { isEndpoint, isHitPoint, isOriginPoint, type SourcePoint } from "@/trajectory-v2/geometry/SourcePoint";
import { isJunctionPoint } from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// =============================================================================
// BUG SCENARIO
// =============================================================================

const BUGGY_PLAYER = { x: 1105.6955874, y: 666 };
const CORRECT_PLAYER = { x: 1105.6955179119636, y: 666 };

const CHAIN1_VERTICES = [
  { x: 598.0384757729337, y: 280 },     // left outer endpoint
  { x: 650, y: 250 },                    // apex (junction)
  { x: 701.9615242270663, y: 280 },     // right outer endpoint
];

const CHAIN1_LEFT_SURFACE = new RicochetSurface("chain1-0", {
  start: { x: 598.0384757729337, y: 280 },
  end: { x: 650, y: 250 },
});

const SCREEN_BOUNDS = {
  minX: 0,
  minY: 0,
  maxX: 1280,
  maxY: 720,
};

/**
 * Create the V-shape chain for testing.
 */
function createChain1(): SurfaceChain {
  return createRicochetChain("chain1", CHAIN1_VERTICES);
}

/**
 * Build junction mapping (same as in runner.ts).
 */
function buildJunctionMapping(chains: readonly SurfaceChain[]): Map<string, Set<string>> {
  const pointToSurfaces = new Map<string, Set<string>>();

  for (const chain of chains) {
    const surfaces = chain.getSurfaces();

    for (const surface of surfaces) {
      const startKey = `${surface.segment.start.x},${surface.segment.start.y}`;
      if (!pointToSurfaces.has(startKey)) {
        pointToSurfaces.set(startKey, new Set());
      }
      pointToSurfaces.get(startKey)!.add(surface.id);

      const endKey = `${surface.segment.end.x},${surface.segment.end.y}`;
      if (!pointToSurfaces.has(endKey)) {
        pointToSurfaces.set(endKey, new Set());
      }
      pointToSurfaces.get(endKey)!.add(surface.id);
    }
  }

  return pointToSurfaces;
}

/**
 * Extract visible segments with junction provenance.
 */
function extractVisibleSurfaceSegments(
  targetSurfaceId: string,
  sourcePoints: readonly SourcePoint[],
  chains: readonly SurfaceChain[]
): { start: Vector2; end: Vector2 }[] {
  const segments: { start: Vector2; end: Vector2 }[] = [];
  let currentRunStart: Vector2 | null = null;
  let currentRunEnd: Vector2 | null = null;

  const pointToSurfaces = buildJunctionMapping(chains);

  for (const sp of sourcePoints) {
    let isOnTarget = false;
    let coords: Vector2 | null = null;

    if (isEndpoint(sp) && sp.surface.id === targetSurfaceId) {
      isOnTarget = true;
      coords = sp.computeXY();
    } else if (isHitPoint(sp)) {
      if (sp.hitSurface.id === targetSurfaceId) {
        isOnTarget = true;
        coords = sp.computeXY();
      } else if (sp.s === 0 || sp.s === 1) {
        const hitCoords = sp.computeXY();
        const coordKey = `${hitCoords.x},${hitCoords.y}`;
        const connectedSurfaces = pointToSurfaces.get(coordKey);
        if (connectedSurfaces && connectedSurfaces.has(targetSurfaceId)) {
          isOnTarget = true;
          coords = hitCoords;
        }
      }
    } else if (isJunctionPoint(sp)) {
      const beforeSurface = sp.getSurfaceBefore();
      const afterSurface = sp.getSurfaceAfter();
      if (beforeSurface.id === targetSurfaceId || afterSurface.id === targetSurfaceId) {
        isOnTarget = true;
        coords = sp.computeXY();
      }
    }

    if (isOnTarget && coords) {
      if (currentRunStart === null) {
        currentRunStart = coords;
      }
      currentRunEnd = coords;
    } else {
      if (
        currentRunStart &&
        currentRunEnd &&
        (currentRunStart.x !== currentRunEnd.x || currentRunStart.y !== currentRunEnd.y)
      ) {
        segments.push({ start: currentRunStart, end: currentRunEnd });
      }
      currentRunStart = null;
      currentRunEnd = null;
    }
  }

  if (
    currentRunStart &&
    currentRunEnd &&
    (currentRunStart.x !== currentRunEnd.x || currentRunStart.y !== currentRunEnd.y)
  ) {
    segments.push({ start: currentRunStart, end: currentRunEnd });
  }

  return segments;
}

/**
 * Check if a point is near the apex (650, 250).
 */
function isNearApex(v: Vector2): boolean {
  return Math.abs(v.x - 650) < 1 && Math.abs(v.y - 250) < 1;
}

/**
 * Get detailed source point info for logging.
 */
function getSourcePointInfo(sp: SourcePoint): string {
  const coords = sp.computeXY();
  const coordStr = `(${coords.x.toFixed(15)}, ${coords.y.toFixed(15)})`;
  
  if (isEndpoint(sp)) {
    return `Endpoint on ${sp.surface.id} (which=${sp.which}) at ${coordStr}`;
  } else if (isHitPoint(sp)) {
    return `HitPoint on ${sp.hitSurface.id} (s=${sp.s.toFixed(15)}) at ${coordStr}`;
  } else if (isOriginPoint(sp)) {
    return `OriginPoint at ${coordStr}`;
  } else if (isJunctionPoint(sp)) {
    return `JunctionPoint at ${coordStr}`;
  }
  return `Unknown at ${coordStr}`;
}

describe("Duplicate Apex Bug", () => {
  describe("Stage 0: Player visibility", () => {
    it("should have apex in visibility polygon for both players", () => {
      const chain = createChain1();

      // Test buggy player
      const buggySourcePoints = projectConeV2(
        createFullCone(BUGGY_PLAYER),
        [chain],
        SCREEN_BOUNDS
      );
      const buggyPolygon = toVector2Array(buggySourcePoints);
      const buggyApexCount = buggyPolygon.filter(isNearApex).length;

      console.log("\n=== BUGGY PLAYER Stage 0 ===");
      console.log(`Player: (${BUGGY_PLAYER.x}, ${BUGGY_PLAYER.y})`);
      console.log(`Polygon: ${buggyPolygon.length} vertices`);
      console.log(`Apex (650, 250) count: ${buggyApexCount}`);

      // Test correct player
      const correctSourcePoints = projectConeV2(
        createFullCone(CORRECT_PLAYER),
        [chain],
        SCREEN_BOUNDS
      );
      const correctPolygon = toVector2Array(correctSourcePoints);
      const correctApexCount = correctPolygon.filter(isNearApex).length;

      console.log("\n=== CORRECT PLAYER Stage 0 ===");
      console.log(`Player: (${CORRECT_PLAYER.x}, ${CORRECT_PLAYER.y})`);
      console.log(`Polygon: ${correctPolygon.length} vertices`);
      console.log(`Apex (650, 250) count: ${correctApexCount}`);

      // Both should have apex exactly once in Stage 0
      expect(buggyApexCount).toBe(1);
      expect(correctApexCount).toBe(1);
    });
  });

  describe("Stage 1: Reflection through chain1-0", () => {
    it("should compare reflected polygons for both players", () => {
      const chain = createChain1();
      const surface = CHAIN1_LEFT_SURFACE;

      // Compute Stage 0 for both players
      const buggyStage0 = projectConeV2(
        createFullCone(BUGGY_PLAYER),
        [chain],
        SCREEN_BOUNDS
      );
      const correctStage0 = projectConeV2(
        createFullCone(CORRECT_PLAYER),
        [chain],
        SCREEN_BOUNDS
      );

      // Extract visible segments
      const buggySegments = extractVisibleSurfaceSegments(surface.id, buggyStage0, [chain]);
      const correctSegments = extractVisibleSurfaceSegments(surface.id, correctStage0, [chain]);

      console.log("\n=== BUGGY PLAYER Stage 0 Segments ===");
      buggySegments.forEach((seg, i) =>
        console.log(`  Segment ${i}: (${seg.start.x.toFixed(4)}, ${seg.start.y.toFixed(4)}) → (${seg.end.x.toFixed(4)}, ${seg.end.y.toFixed(4)})`)
      );

      console.log("\n=== CORRECT PLAYER Stage 0 Segments ===");
      correctSegments.forEach((seg, i) =>
        console.log(`  Segment ${i}: (${seg.start.x.toFixed(4)}, ${seg.start.y.toFixed(4)}) → (${seg.end.x.toFixed(4)}, ${seg.end.y.toFixed(4)})`)
      );

      expect(buggySegments.length).toBeGreaterThan(0);
      expect(correctSegments.length).toBeGreaterThan(0);

      // Compute reflected polygons
      const buggyWindow = buggySegments[0]!;
      const buggyReflectedOrigin = reflectPointThroughLine(
        BUGGY_PLAYER,
        surface.segment.start,
        surface.segment.end
      );
      const buggyStage1 = projectConeV2(
        createConeThroughWindow(buggyReflectedOrigin, buggyWindow.start, buggyWindow.end),
        [chain],
        SCREEN_BOUNDS,
        surface.id
      );
      const buggyPolygon = toVector2Array(buggyStage1);

      const correctWindow = correctSegments[0]!;
      const correctReflectedOrigin = reflectPointThroughLine(
        CORRECT_PLAYER,
        surface.segment.start,
        surface.segment.end
      );
      const correctStage1 = projectConeV2(
        createConeThroughWindow(correctReflectedOrigin, correctWindow.start, correctWindow.end),
        [chain],
        SCREEN_BOUNDS,
        surface.id
      );
      const correctPolygon = toVector2Array(correctStage1);

      console.log("\n=== BUGGY PLAYER Stage 1 (Reflected) ===");
      console.log(`Reflected origin: (${buggyReflectedOrigin.x.toFixed(4)}, ${buggyReflectedOrigin.y.toFixed(4)})`);
      console.log(`Polygon: ${buggyPolygon.length} vertices`);
      buggyPolygon.forEach((v, i) =>
        console.log(`  ${i}: (${v.x.toFixed(15)}, ${v.y.toFixed(15)})${isNearApex(v) ? " ← APEX" : ""}`)
      );

      console.log("\n=== CORRECT PLAYER Stage 1 (Reflected) ===");
      console.log(`Reflected origin: (${correctReflectedOrigin.x.toFixed(4)}, ${correctReflectedOrigin.y.toFixed(4)})`);
      console.log(`Polygon: ${correctPolygon.length} vertices`);
      correctPolygon.forEach((v, i) =>
        console.log(`  ${i}: (${v.x.toFixed(15)}, ${v.y.toFixed(15)})${isNearApex(v) ? " ← APEX" : ""}`)
      );

      // Count apex occurrences
      const buggyApexCount = buggyPolygon.filter(isNearApex).length;
      const correctApexCount = correctPolygon.filter(isNearApex).length;

      console.log(`\nBUGGY apex count: ${buggyApexCount}`);
      console.log(`CORRECT apex count: ${correctApexCount}`);

      // THE BUG: Buggy has 2 apexes, correct has 1
      // We're testing what IS happening, not what SHOULD happen
      console.log(`\nBUGGY has duplicate apex: ${buggyApexCount > 1}`);
      console.log(`CORRECT has duplicate apex: ${correctApexCount > 1}`);
    });

    it("should trace source points contributing to apex duplicates", () => {
      const chain = createChain1();
      const surface = CHAIN1_LEFT_SURFACE;

      // Stage 0
      const stage0 = projectConeV2(createFullCone(BUGGY_PLAYER), [chain], SCREEN_BOUNDS);

      // Extract window
      const segments = extractVisibleSurfaceSegments(surface.id, stage0, [chain]);
      if (segments.length === 0) {
        console.log("No segments found - skipping");
        return;
      }

      const window = segments[0]!;
      const reflectedOrigin = reflectPointThroughLine(
        BUGGY_PLAYER,
        surface.segment.start,
        surface.segment.end
      );

      // Stage 1 source points
      const stage1SourcePoints = projectConeV2(
        createConeThroughWindow(reflectedOrigin, window.start, window.end),
        [chain],
        SCREEN_BOUNDS,
        surface.id
      );

      console.log("\n=== BUGGY PLAYER Stage 1 Source Points ===");
      console.log(`Total source points: ${stage1SourcePoints.length}`);

      // Find all source points near apex
      const apexSourcePoints = stage1SourcePoints.filter((sp) => {
        const coords = sp.computeXY();
        return isNearApex(coords);
      });

      console.log(`\nSource points near apex (650, 250): ${apexSourcePoints.length}`);
      apexSourcePoints.forEach((sp, i) => {
        console.log(`  ${i}: ${getSourcePointInfo(sp)}`);
      });

      // Log ALL source points for full analysis
      console.log("\n=== ALL Source Points (for context) ===");
      stage1SourcePoints.forEach((sp, i) => {
        const coords = sp.computeXY();
        const isApex = isNearApex(coords);
        console.log(`  ${i}: ${getSourcePointInfo(sp)}${isApex ? " ← APEX" : ""}`);
      });
    });
  });

  describe("Stage 0: Flickering investigation", () => {
    it("should have consistent apex count across many player positions", () => {
      const chain = createChain1();
      const issues: { player: Vector2; apexCount: number; vertexCount: number }[] = [];

      // Sweep across many player X positions
      for (let x = 1100; x <= 1110; x += 0.1) {
        const player = { x, y: 666 };
        const cone = createFullCone(player);
        const sourcePoints = projectConeV2(cone, chainWithScreen);

        const apexCount = sourcePoints.filter((sp) => {
          const coords = sp.computeXY();
          return Math.abs(coords.x - 650) < 0.1 && Math.abs(coords.y - 250) < 0.1;
        }).length;

        if (apexCount !== 1) {
          issues.push({ player, apexCount, vertexCount: sourcePoints.length });
        }
      }

      if (issues.length > 0) {
        console.log("\n=== FLICKERING ISSUES FOUND ===");
        issues.forEach((issue) => {
          console.log(`  Player (${issue.player.x.toFixed(6)}, ${issue.player.y}): apex=${issue.apexCount}, vertices=${issue.vertexCount}`);
        });
      }

      expect(issues.length).toBe(0);
    });
  });
});

