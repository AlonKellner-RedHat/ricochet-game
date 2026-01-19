/**
 * BulkApplyRangeLimitRemoval.test.ts
 *
 * Tests for the removal of bulk applyRangeLimit conversion.
 * 
 * Per the plan: ArcHitPoints should ONLY be created by applyRangeLimitToContinuation
 * when continuation rays exceed the range limit. The bulk applyRangeLimit that
 * converts all vertices beyond range to ArcHitPoints should be removed.
 *
 * Instead, vertices beyond range should be filtered out (they're unreachable).
 */

import { describe, expect, it } from "vitest";
import {
  projectConeV2,
  createFullCone,
  type RangeLimitConfig,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import {
  createSingleSurfaceChain,
  type SurfaceChain,
} from "@/trajectory-v2/geometry/SurfaceChain";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { createRangeLimitPair } from "@/trajectory-v2/obstacles/RangeLimit";
import { isArcHitPoint, ArcHitPoint } from "@/trajectory-v2/geometry/SourcePoint";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestSurface(id: string, start: Vector2, end: Vector2): Surface {
  return {
    id,
    segment: { start, end },
    surfaceType: "test",
    onArrowHit: () => ({ type: "blocked" }),
    isPlannable: () => false,
    getVisualProperties: () => ({ color: 0, alpha: 1, lineWidth: 1 }),
    getNormal: () => ({ x: 0, y: 1 }),
    canReflectFrom: () => true,
  } as Surface;
}

function toChains(surfaces: Surface[]): SurfaceChain[] {
  return surfaces.map((s) => createSingleSurfaceChain(s));
}

// =============================================================================
// TEST CASES
// =============================================================================

describe("Bulk applyRangeLimit Removal", () => {
  const SCREEN_BOUNDS = { minX: 0, maxX: 800, minY: 0, maxY: 600 };
  const ORIGIN: Vector2 = { x: 400, y: 300 };
  const RANGE_LIMIT_RADIUS = 100; // Small radius to ensure some endpoints are beyond

  describe("ArcHitPoint provenance", () => {
    it("all ArcHitPoints should have raySource provenance (from continuation rays)", () => {
      // Create a surface that extends beyond the range limit
      // The endpoint beyond range should NOT become an ArcHitPoint via bulk conversion
      const surface = createTestSurface(
        "test-surface",
        { x: 390, y: 290 }, // Start within range (~14 units from origin)
        { x: 600, y: 300 } // End far beyond range (~200 units from origin)
      );

      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const obstacleChains = toChains([surface]);
      const allChains = [screenChain, ...obstacleChains];

      const rangeLimit: RangeLimitConfig = {
        pair: createRangeLimitPair(RANGE_LIMIT_RADIUS),
        center: ORIGIN,
      };

      const cone = createFullCone(ORIGIN);
      const polygon = projectConeV2(
        cone,
        allChains,
        undefined,
        undefined,
        undefined,
        rangeLimit
      );

      // Get all ArcHitPoints from the polygon
      const arcHitPoints = polygon.filter(isArcHitPoint);

      console.log("Total vertices:", polygon.length);
      console.log("ArcHitPoints:", arcHitPoints.length);

      for (const ahp of arcHitPoints) {
        console.log("  ArcHitPoint key:", ahp.getKey());
        console.log("  Has raySource:", !!ahp.raySource);
      }

      // ASSERTION: All ArcHitPoints should have raySource (provenance from continuation rays)
      // If bulk applyRangeLimit is still creating ArcHitPoints, some will lack raySource
      for (const ahp of arcHitPoints) {
        expect(
          ahp.raySource,
          `ArcHitPoint ${ahp.getKey()} should have raySource provenance`
        ).toBeDefined();
      }
    });

    it("should not create ArcHitPoints without raySource (coordinate-based keys)", () => {
      const surface = createTestSurface(
        "test-surface",
        { x: 420, y: 320 }, // Beyond range (~28 units from origin)
        { x: 500, y: 400 } // Also beyond range
      );

      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const obstacleChains = toChains([surface]);
      const allChains = [screenChain, ...obstacleChains];

      const rangeLimit: RangeLimitConfig = {
        pair: createRangeLimitPair(RANGE_LIMIT_RADIUS),
        center: ORIGIN,
      };

      const cone = createFullCone(ORIGIN);
      const polygon = projectConeV2(
        cone,
        allChains,
        undefined,
        undefined,
        undefined,
        rangeLimit
      );

      const arcHitPoints = polygon.filter(isArcHitPoint);

      // Check for coordinate-based keys (which indicate no raySource provenance)
      const coordinateBasedAHPs = arcHitPoints.filter((ahp) => {
        const key = ahp.getKey();
        // Coordinate-based keys don't have "ray:" in them
        return !key.includes(":ray:");
      });

      console.log("ArcHitPoints with coordinate-based keys:", coordinateBasedAHPs.length);
      for (const ahp of coordinateBasedAHPs) {
        console.log("  Key:", ahp.getKey());
      }

      // ASSERTION: No ArcHitPoints should have coordinate-based keys
      expect(coordinateBasedAHPs.length).toBe(0);
    });
  });

  describe("Vertex filtering beyond range", () => {
    it("should not include unreachable endpoints beyond range limit", () => {
      // Create a surface entirely beyond the range limit
      // Its endpoints should be filtered out, not converted to ArcHitPoints
      const surface = createTestSurface(
        "far-surface",
        { x: 600, y: 300 }, // ~200 units from origin
        { x: 700, y: 300 } // ~300 units from origin
      );

      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const obstacleChains = toChains([surface]);
      const allChains = [screenChain, ...obstacleChains];

      const rangeLimit: RangeLimitConfig = {
        pair: createRangeLimitPair(RANGE_LIMIT_RADIUS),
        center: ORIGIN,
      };

      const cone = createFullCone(ORIGIN);
      const polygon = projectConeV2(
        cone,
        allChains,
        undefined,
        undefined,
        undefined,
        rangeLimit
      );

      // Check that no vertex from the far surface appears in the polygon
      for (const vertex of polygon) {
        const xy = vertex.computeXY();
        const distFromOrigin = Math.sqrt(
          (xy.x - ORIGIN.x) ** 2 + (xy.y - ORIGIN.y) ** 2
        );

        // Vertices should either be:
        // 1. Within or on the range limit
        // 2. ArcHitPoints with proper provenance (which are on the circle)
        if (distFromOrigin > RANGE_LIMIT_RADIUS + 0.01) {
          // If beyond range, it must be an ArcHitPoint with provenance
          if (isArcHitPoint(vertex)) {
            expect(vertex.raySource).toBeDefined();
          } else {
            throw new Error(
              `Vertex at distance ${distFromOrigin} should not be in polygon: ${vertex.getKey()}`
            );
          }
        }
      }
    });
  });
});
