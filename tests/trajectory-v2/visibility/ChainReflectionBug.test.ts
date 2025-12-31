/**
 * Chain Reflection Bug Reproduction Test
 *
 * This test reproduces a bug where reflections off chain surfaces produce
 * truncated polygons - only a portion of the surface is used as the reflection
 * window instead of the full visible length.
 *
 * Bug Report:
 * - Player: (799.55, 666)
 * - Planned surface: chain1-0 from (598.04, 280) to (650, 250)
 * - Expected: The entire surface reflects light (full window)
 * - Actual: Only (598.04, 280) to (609.63, 273.31) is used as window
 *
 * The apex junction point at (650, 250) is NOT being used as a window boundary,
 * even though the player's light reaches the entire surface.
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
import { isEndpoint, isHitPoint, type SourcePoint } from "@/trajectory-v2/geometry/SourcePoint";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// =============================================================================
// BUG SCENARIO: Chain1 from demo (120-degree V-shape)
// =============================================================================

const CHAIN1_VERTICES = [
  { x: 598.0384757729337, y: 280 },     // left outer endpoint
  { x: 650, y: 250 },                    // apex (junction)
  { x: 701.9615242270663, y: 280 },     // right outer endpoint
];

const PLAYER = { x: 799.5532401600012, y: 666 };
const CURSOR = { x: 640, y: 283.7305699481865 };

// Surface definition (left arm of V-shape)
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
 * Extract visible segments on a surface from source points.
 * This mirrors the logic in ValidRegionRenderer.extractVisibleSurfaceSegments.
 */
function extractVisibleSurfaceSegments(
  targetSurfaceId: string,
  sourcePoints: readonly SourcePoint[]
): { start: Vector2; end: Vector2 }[] {
  const segments: { start: Vector2; end: Vector2 }[] = [];
  let currentRunStart: Vector2 | null = null;
  let currentRunEnd: Vector2 | null = null;

  for (const sp of sourcePoints) {
    let isOnTarget = false;
    let coords: Vector2 | null = null;

    if (isEndpoint(sp) && sp.surface.id === targetSurfaceId) {
      isOnTarget = true;
      coords = sp.computeXY();
    } else if (isHitPoint(sp) && sp.hitSurface.id === targetSurfaceId) {
      isOnTarget = true;
      coords = sp.computeXY();
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

describe("Chain Reflection Bug", () => {
  describe("Stage 0: Player visibility reaches entire surface", () => {
    it("should include both endpoints of chain1-0 in visibility polygon", () => {
      const chain = createChain1();
      const cone = createFullCone(PLAYER);
      const sourcePoints = projectConeV2(cone, [chain], SCREEN_BOUNDS);
      const polygon = toVector2Array(sourcePoints);

      // The LEFT endpoint should be in the polygon
      const leftEndpoint = { x: 598.0384757729337, y: 280 };
      const hasLeftEndpoint = polygon.some(
        (p) => Math.abs(p.x - leftEndpoint.x) < 0.1 && Math.abs(p.y - leftEndpoint.y) < 0.1
      );

      // The APEX (junction) should be in the polygon
      const apex = { x: 650, y: 250 };
      const hasApex = polygon.some(
        (p) => Math.abs(p.x - apex.x) < 0.1 && Math.abs(p.y - apex.y) < 0.1
      );

      console.log("Stage 0 polygon vertices:");
      polygon.forEach((v, i) => console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`));

      console.log(`\nHas left endpoint (598.04, 280): ${hasLeftEndpoint}`);
      console.log(`Has apex (650, 250): ${hasApex}`);

      expect(hasLeftEndpoint).toBe(true);
      expect(hasApex).toBe(true);
    });

    it("should extract visible segment covering full surface", () => {
      const chain = createChain1();
      const cone = createFullCone(PLAYER);
      const sourcePoints = projectConeV2(cone, [chain], SCREEN_BOUNDS);

      // Extract visible segments for chain1-0
      const segments = extractVisibleSurfaceSegments("chain1-0", sourcePoints);

      console.log("Extracted visible segments for chain1-0:");
      segments.forEach((seg, i) =>
        console.log(
          `  Segment ${i}: (${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}) → (${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)})`
        )
      );

      // Should have at least one segment
      expect(segments.length).toBeGreaterThan(0);

      // The segment should cover the FULL surface (from left outer to apex)
      // Surface: (598.04, 280) → (650, 250)
      const fullSurfaceStart = { x: 598.0384757729337, y: 280 };
      const fullSurfaceEnd = { x: 650, y: 250 };

      // Check if any segment includes the full surface
      let hasFullSurface = false;
      for (const seg of segments) {
        const startsAtLeft =
          Math.abs(seg.start.x - fullSurfaceStart.x) < 0.1 &&
          Math.abs(seg.start.y - fullSurfaceStart.y) < 0.1;
        const endsAtApex =
          Math.abs(seg.end.x - fullSurfaceEnd.x) < 0.1 &&
          Math.abs(seg.end.y - fullSurfaceEnd.y) < 0.1;

        if (startsAtLeft && endsAtApex) {
          hasFullSurface = true;
          break;
        }
      }

      console.log(`\nFull surface covered (598.04, 280) → (650, 250): ${hasFullSurface}`);

      // THIS IS THE BUG: The segment is truncated
      expect(hasFullSurface).toBe(true);
    });
  });

  describe("Stage 1: Reflection through chain1-0", () => {
    it("should produce reflected polygon with more than 3 vertices", () => {
      const chain = createChain1();
      const surface = CHAIN1_LEFT_SURFACE;

      // Stage 0: Get visibility from player
      const stage0Cone = createFullCone(PLAYER);
      const stage0Points = projectConeV2(stage0Cone, [chain], SCREEN_BOUNDS);

      // Extract visible window (should be full surface)
      const segments = extractVisibleSurfaceSegments(surface.id, stage0Points);
      expect(segments.length).toBeGreaterThan(0);

      const window = segments[0]!;
      console.log(
        `Reflection window: (${window.start.x.toFixed(2)}, ${window.start.y.toFixed(2)}) → (${window.end.x.toFixed(2)}, ${window.end.y.toFixed(2)})`
      );

      // Reflect player through surface
      const reflectedOrigin = reflectPointThroughLine(
        PLAYER,
        surface.segment.start,
        surface.segment.end
      );
      console.log(`Reflected origin: (${reflectedOrigin.x.toFixed(2)}, ${reflectedOrigin.y.toFixed(2)})`);

      // Stage 1: Compute reflected visibility
      const stage1Cone = createConeThroughWindow(reflectedOrigin, window.start, window.end);
      const stage1Points = projectConeV2(stage1Cone, [chain], SCREEN_BOUNDS, surface.id);
      const stage1Polygon = toVector2Array(stage1Points);

      console.log(`\nStage 1 polygon vertices: ${stage1Polygon.length}`);
      stage1Polygon.forEach((v, i) =>
        console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`)
      );

      // The reflected polygon should have more than 3 vertices
      // (window start, window end, and at least some screen boundary points)
      // If it only has 3, the window was truncated
      expect(stage1Polygon.length).toBeGreaterThan(3);
    });

    it("should use full surface as window boundaries", () => {
      const chain = createChain1();
      const surface = CHAIN1_LEFT_SURFACE;

      // Stage 0: Get visibility from player
      const stage0Cone = createFullCone(PLAYER);
      const stage0Points = projectConeV2(stage0Cone, [chain], SCREEN_BOUNDS);

      // Extract visible window
      const segments = extractVisibleSurfaceSegments(surface.id, stage0Points);
      expect(segments.length).toBeGreaterThan(0);

      const window = segments[0]!;

      // The window should span the FULL surface
      const expectedStart = surface.segment.start; // (598.04, 280)
      const expectedEnd = surface.segment.end; // (650, 250)

      console.log("Expected window boundaries:");
      console.log(`  Start: (${expectedStart.x.toFixed(2)}, ${expectedStart.y.toFixed(2)})`);
      console.log(`  End: (${expectedEnd.x.toFixed(2)}, ${expectedEnd.y.toFixed(2)})`);

      console.log("Actual window boundaries:");
      console.log(`  Start: (${window.start.x.toFixed(2)}, ${window.start.y.toFixed(2)})`);
      console.log(`  End: (${window.end.x.toFixed(2)}, ${window.end.y.toFixed(2)})`);

      // Check start matches
      const startMatches =
        Math.abs(window.start.x - expectedStart.x) < 0.1 &&
        Math.abs(window.start.y - expectedStart.y) < 0.1;

      // Check end matches (THIS IS WHERE THE BUG IS)
      const endMatches =
        Math.abs(window.end.x - expectedEnd.x) < 0.1 &&
        Math.abs(window.end.y - expectedEnd.y) < 0.1;

      console.log(`\nStart matches: ${startMatches}`);
      console.log(`End matches: ${endMatches}`);

      expect(startMatches).toBe(true);
      expect(endMatches).toBe(true);
    });
  });

  describe("Debug: Source points analysis", () => {
    it("should log all source points on chain1-0", () => {
      const chain = createChain1();
      const cone = createFullCone(PLAYER);
      const sourcePoints = projectConeV2(cone, [chain], SCREEN_BOUNDS);

      console.log("\nAll source points:");
      sourcePoints.forEach((sp, i) => {
        const coords = sp.computeXY();
        let surfaceInfo = "";

        if (isEndpoint(sp)) {
          surfaceInfo = `Endpoint on ${sp.surface.id} (isStart=${sp.isStart})`;
        } else if (isHitPoint(sp)) {
          surfaceInfo = `HitPoint on ${sp.hitSurface.id} (s=${sp.s.toFixed(4)})`;
        } else {
          surfaceInfo = `${sp.type}`;
        }

        console.log(`  ${i}: (${coords.x.toFixed(2)}, ${coords.y.toFixed(2)}) - ${surfaceInfo}`);
      });

      // Check if apex (650, 250) is present
      const apexPresent = sourcePoints.some((sp) => {
        const coords = sp.computeXY();
        return Math.abs(coords.x - 650) < 0.1 && Math.abs(coords.y - 250) < 0.1;
      });

      console.log(`\nApex (650, 250) present in source points: ${apexPresent}`);

      // If apex is present, check what type it is
      if (apexPresent) {
        const apexPoint = sourcePoints.find((sp) => {
          const coords = sp.computeXY();
          return Math.abs(coords.x - 650) < 0.1 && Math.abs(coords.y - 250) < 0.1;
        })!;
        console.log(`Apex point type: ${apexPoint.type}`);
        if (isEndpoint(apexPoint)) {
          console.log(`  Surface: ${apexPoint.surface.id}`);
          console.log(`  Is start: ${apexPoint.isStart}`);
        }
      }
    });

    /**
     * ROOT CAUSE HYPOTHESIS:
     *
     * The apex junction point (650, 250) is recorded as a HitPoint on chain1-1,
     * NOT as an Endpoint on chain1-0.
     *
     * This means when extractVisibleSurfaceSegments looks for points on "chain1-0":
     * - It finds: (598.04, 280) as Endpoint on chain1-0
     * - It does NOT find: (650, 250) because it's recorded as HitPoint on chain1-1
     *
     * Since there's only ONE point on chain1-0, the segment has start === end,
     * which is filtered out as a zero-length segment.
     *
     * Expected behavior:
     * - The apex should be recognized as the END of chain1-0 (isStart=false)
     * - OR the segment extraction should check for JunctionPoints that connect
     *   to the target surface
     */
    it("proves the root cause: apex is HitPoint on chain1-1, not Endpoint on chain1-0", () => {
      const chain = createChain1();
      const cone = createFullCone(PLAYER);
      const sourcePoints = projectConeV2(cone, [chain], SCREEN_BOUNDS);

      // Find apex point
      const apexPoint = sourcePoints.find((sp) => {
        const coords = sp.computeXY();
        return Math.abs(coords.x - 650) < 0.1 && Math.abs(coords.y - 250) < 0.1;
      });

      expect(apexPoint).toBeDefined();

      // The apex IS a HitPoint (not an Endpoint)
      expect(isHitPoint(apexPoint!)).toBe(true);

      // And it's associated with chain1-1, not chain1-0
      if (isHitPoint(apexPoint!)) {
        expect(apexPoint!.hitSurface.id).toBe("chain1-1");
        expect(apexPoint!.s).toBe(0); // s=0 means start of chain1-1
      }

      // Count points on chain1-0
      const pointsOnChain1_0 = sourcePoints.filter((sp) => {
        if (isEndpoint(sp)) return sp.surface.id === "chain1-0";
        if (isHitPoint(sp)) return sp.hitSurface.id === "chain1-0";
        return false;
      });

      console.log(`\nPoints on chain1-0: ${pointsOnChain1_0.length}`);
      pointsOnChain1_0.forEach((sp, i) => {
        const coords = sp.computeXY();
        console.log(`  ${i}: (${coords.x.toFixed(2)}, ${coords.y.toFixed(2)})`);
      });

      // There's only ONE point on chain1-0 (the left endpoint)
      // This is why extractVisibleSurfaceSegments returns empty!
      expect(pointsOnChain1_0.length).toBe(1);

      // The segment extraction logic requires at least 2 consecutive points
      // to form a valid segment (start !== end). With only 1 point, no segment is produced.
    });
  });
});


