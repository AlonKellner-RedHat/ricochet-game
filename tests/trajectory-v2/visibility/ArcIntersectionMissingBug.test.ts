/**
 * ArcIntersectionPoint Provenance Tests
 *
 * These tests verify the correct provenance-based behavior for ArcIntersectionPoints:
 * 
 * 1. ArcIntersectionPoints on EXCLUDED surfaces (window) should NOT be recomputed
 *    - They come from the caller via leftBoundarySource/rightBoundarySource
 *    - This prevents floating-point duplicates that cause "Collinear points without PreComputedPairs" errors
 * 
 * 2. ArcIntersectionPoints on NON-excluded surfaces ARE computed
 *    - These are normal ray targets for visibility polygon construction
 * 
 * Key insight: ArcIntersectionPoint is BOTH:
 * 1. On the surface (belongs to surface.id)
 * 2. On the arc (where surface crosses range limit circle)
 *
 * It should be counted for BOTH:
 * - Arc edge rendering (source = "range_limit")  
 * - Light reaching segments (isOnSurface = true)
 * 
 * But when excluded, it should NOT be recomputed - it comes from provenance.
 */

import { describe, it, expect } from "vitest";
import {
  projectConeV2,
  createConeThroughWindow,
  createFullCone,
  isPointInCone,
  type RangeLimitConfig,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import {
  isArcIntersectionPoint,
  ArcIntersectionPoint,
  isEndpoint,
  isOriginPoint,
  type SourcePoint,
} from "@/trajectory-v2/geometry/SourcePoint";
import { createRangeLimitPair } from "@/trajectory-v2/obstacles/RangeLimit";
import {
  createWallChain,
  createSingleSurfaceChain,
  type SurfaceChain,
} from "@/trajectory-v2/geometry/SurfaceChain";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import type { Surface, Vector2 } from "@/trajectory-v2/geometry/types";

// Screen bounds from bug report
const SCREEN_BOUNDS = { minX: 0, minY: 0, maxX: 1280, maxY: 720 };

describe("ArcIntersection Provenance Behavior", () => {
  describe("Provenance Propagation (Excluded Surfaces)", () => {
    it("should NOT recompute ArcIntersectionPoint when window surface is excluded", () => {
      // With provenance propagation, excluded surfaces should NOT have 
      // ArcIntersectionPoints recomputed. They come from the caller.

      const reflectedOrigin: Vector2 = { x: 890.56, y: 586 };

      const windowSurface: Surface = {
        id: "mirror-right-0",
        segment: { start: { x: 550, y: 150 }, end: { x: 550, y: 550 } },
        canReflect: true,
      };

      const cone = createConeThroughWindow(
        reflectedOrigin,
        windowSurface.segment.start,
        windowSurface.segment.end
      );

      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const windowChain = createSingleSurfaceChain(windowSurface);

      const radius = 400;
      const rangeLimit: RangeLimitConfig = {
        pair: createRangeLimitPair(radius, "horizontal"),
        center: reflectedOrigin,
      };

      // Project with window surface EXCLUDED
      const vertices = projectConeV2(
        cone,
        [screenChain, windowChain],
        windowSurface.id, // EXCLUDE the window
        undefined,
        undefined,
        rangeLimit
      );

      console.log("Total vertices:", vertices.length);
      console.log("Vertex types:", vertices.map((v) => v.type));

      // Find ArcIntersectionPoints on the window
      const windowArcIntersections = vertices.filter(
        (v) => isArcIntersectionPoint(v) && v.surface.id === "mirror-right-0"
      );

      console.log("Window ArcIntersectionPoints:", windowArcIntersections.length);

      // With provenance propagation, excluded surfaces should have 0 recomputed ArcIntersectionPoints
      // They should come from the caller via leftBoundarySource/rightBoundarySource
      expect(windowArcIntersections.length).toBe(0);
    });
  });

  describe("Non-Excluded Surfaces", () => {
    it("should compute ArcIntersectionPoint for non-excluded surfaces", () => {
      // ArcIntersectionPoints ARE computed for surfaces that are NOT excluded

      const reflectedOrigin: Vector2 = { x: 890.56, y: 586 };
      const windowSurface: Surface = {
        id: "mirror-right-0",
        segment: { start: { x: 550, y: 150 }, end: { x: 550, y: 550 } },
        canReflect: true,
      };

      const radius = 400;
      const rangeLimit: RangeLimitConfig = {
        pair: createRangeLimitPair(radius, "horizontal"),
        center: reflectedOrigin,
      };

      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const windowChain = createSingleSurfaceChain(windowSurface);

      // Full cone from origin - no window filtering
      const fullCone = createFullCone(reflectedOrigin);

      // NO exclusion - should compute ArcIntersectionPoints for window
      const vertices = projectConeV2(
        fullCone,
        [screenChain, windowChain],
        undefined, // No exclusion
        undefined,
        undefined,
        rangeLimit
      );

      const arcIntersections = vertices.filter(isArcIntersectionPoint);
      const windowArcIntersections = arcIntersections.filter(
        (ai) => ai.surface.id === "mirror-right-0"
      );

      console.log("\n=== FULL CONE TEST (NO EXCLUSION) ===");
      console.log("Total vertices:", vertices.length);
      console.log("ArcIntersectionPoints:", arcIntersections.length);
      console.log("Window ArcIntersectionPoints:", windowArcIntersections.length);
      for (const ai of windowArcIntersections) {
        console.log("  Window intersection at:", ai.computeXY());
      }

      // Without exclusion, ArcIntersectionPoints SHOULD be computed
      expect(windowArcIntersections.length).toBeGreaterThan(0);
    });
  });

  describe("Cone Geometry", () => {
    it("should verify isPointInCone returns true for ArcIntersectionPoint on window", () => {
      const reflectedOrigin: Vector2 = { x: 890.56, y: 586 };
      const windowSurface: Surface = {
        id: "mirror-right-0",
        segment: { start: { x: 550, y: 150 }, end: { x: 550, y: 550 } },
        canReflect: true,
      };

      const cone = createConeThroughWindow(
        reflectedOrigin,
        windowSurface.segment.start,
        windowSurface.segment.end
      );

      // Calculate where the range limit circle intersects the window surface
      // Origin at (890.56, 586), window line at x=550
      // With radius 400: y = 586 ± sqrt(400^2 - 340.56^2) = 586 ± 209.8
      const intersectionY = 586 - Math.sqrt(400 * 400 - 340.56 * 340.56);
      const intersectionPoint: Vector2 = { x: 550, y: intersectionY };

      console.log("\n=== CONE FILTERING TEST ===");
      console.log("Intersection point:", intersectionPoint);
      console.log("Cone origin:", cone.origin);
      console.log("Window start:", windowSurface.segment.start);
      console.log("Window end:", windowSurface.segment.end);

      const inCone = isPointInCone(intersectionPoint, cone);
      console.log("Is intersection point in cone?", inCone);

      // The intersection point on the window surface should be in the cone
      expect(inCone).toBe(true);
    });
  });

  describe("Provenance Flow", () => {
    it("should reuse propagated ArcIntersectionPoint when passed as boundary source", () => {
      // This tests the full provenance flow: 
      // Stage 1 creates ArcIntersectionPoint -> Stage 2 reuses it

      const reflectedOrigin: Vector2 = { x: 890.56, y: 586 };
      const windowSurface: Surface = {
        id: "mirror-right-0",
        segment: { start: { x: 550, y: 150 }, end: { x: 550, y: 550 } },
        canReflect: true,
      };

      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const windowChain = createSingleSurfaceChain(windowSurface);

      const radius = 400;
      const rangeLimit: RangeLimitConfig = {
        pair: createRangeLimitPair(radius, "horizontal"),
        center: reflectedOrigin,
      };

      // Simulate Stage 1: compute ArcIntersectionPoint on window (no exclusion)
      const fullCone = createFullCone(reflectedOrigin);
      const stage1Vertices = projectConeV2(
        fullCone,
        [screenChain, windowChain],
        undefined, // No exclusion in Stage 1
        undefined,
        undefined,
        rangeLimit
      );

      const stage1WindowArcIntersections = stage1Vertices.filter(
        (v) => isArcIntersectionPoint(v) && v.surface.id === "mirror-right-0"
      ) as ArcIntersectionPoint[];

      console.log("\n=== PROVENANCE FLOW TEST ===");
      console.log("Stage 1 window ArcIntersections:", stage1WindowArcIntersections.length);

      // Simulate Stage 2: use the ArcIntersectionPoint as window boundary
      if (stage1WindowArcIntersections.length > 0) {
        const arcIntersection = stage1WindowArcIntersections[0]!;
        const arcIntersectionPos = arcIntersection.computeXY();

        console.log("Passing ArcIntersection to Stage 2:", arcIntersectionPos);

        // Create cone with ArcIntersectionPoint as boundary source
        const stage2Cone = createConeThroughWindow(
          reflectedOrigin,
          arcIntersectionPos, // Use ArcIntersection position as window boundary
          windowSurface.segment.end,
          arcIntersection, // Pass as provenance!
          undefined
        );

        const stage2Vertices = projectConeV2(
          stage2Cone,
          [screenChain, windowChain],
          windowSurface.id, // EXCLUDE window in Stage 2
          undefined,
          undefined,
          rangeLimit
        );

        // The propagated ArcIntersectionPoint will be in vertices (added as leftWindowOrigin)
        // The key is that NO NEW ArcIntersectionPoints are COMPUTED for the window
        const stage2WindowArcIntersections = stage2Vertices.filter(
          (v) => isArcIntersectionPoint(v) && v.surface.id === "mirror-right-0"
        );

        console.log("Stage 2 window ArcIntersections (total):", stage2WindowArcIntersections.length);

        // The only one present should be the propagated one (same object reference)
        if (stage2WindowArcIntersections.length > 0) {
          console.log("Checking if it's the same object...");
          const isSameObject = stage2WindowArcIntersections.some(
            (v) => v === arcIntersection
          );
          console.log("Is same object?", isSameObject);
          
          // All ArcIntersectionPoints on window should be the propagated one (not recomputed)
          expect(isSameObject).toBe(true);
        }
      }
    });

    it("should NOT create floating-point duplicates that cause collinear errors", () => {
      // This test ensures the fix prevents the original bug:
      // Two ArcIntersectionPoints with nearly identical t values

      const reflectedOrigin: Vector2 = { x: 890.56, y: 586 };
      const windowSurface: Surface = {
        id: "mirror-right-0",
        segment: { start: { x: 550, y: 150 }, end: { x: 550, y: 550 } },
        canReflect: true,
      };

      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const windowChain = createSingleSurfaceChain(windowSurface);

      const radius = 400;
      const rangeLimit: RangeLimitConfig = {
        pair: createRangeLimitPair(radius, "horizontal"),
        center: reflectedOrigin,
      };

      // Create ArcIntersectionPoint with specific t value
      const t = 0.20733910461035285;
      const arcIntersection = new ArcIntersectionPoint(windowSurface, t, "range_limit");
      const arcPos = arcIntersection.computeXY();

      console.log("\n=== COLLINEAR PREVENTION TEST ===");
      console.log("Original t:", t);
      console.log("Original position:", arcPos);

      // Create cone using this as boundary
      const cone = createConeThroughWindow(
        reflectedOrigin,
        arcPos,
        windowSurface.segment.end,
        arcIntersection,
        undefined
      );

      // This should NOT throw "Collinear points without PreComputedPairs"
      expect(() => {
        projectConeV2(
          cone,
          [screenChain, windowChain],
          windowSurface.id,
          undefined,
          undefined,
          rangeLimit
        );
      }).not.toThrow();

      console.log("No collinear error - provenance propagation working!");
    });
  });

  describe("With Blocking Obstacles", () => {
    it("should NOT recompute ArcIntersectionPoint on excluded window even with obstacles", () => {
      const reflectedOrigin: Vector2 = { x: 890.56, y: 586 };
      const windowSurface: Surface = {
        id: "mirror-right-0",
        segment: { start: { x: 550, y: 150 }, end: { x: 550, y: 550 } },
        canReflect: true,
      };

      // Add a blocking obstacle between origin and window
      const blockingObstacle: Surface = {
        id: "platform-0",
        segment: { start: { x: 650, y: 500 }, end: { x: 750, y: 500 } },
        canReflect: false,
      };

      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const windowChain = createSingleSurfaceChain(windowSurface);
      const obstacleChain = createSingleSurfaceChain(blockingObstacle);

      const radius = 400;
      const rangeLimit: RangeLimitConfig = {
        pair: createRangeLimitPair(radius, "horizontal"),
        center: reflectedOrigin,
      };

      const cone = createConeThroughWindow(
        reflectedOrigin,
        windowSurface.segment.start,
        windowSurface.segment.end
      );

      const vertices = projectConeV2(
        cone,
        [screenChain, windowChain, obstacleChain],
        windowSurface.id, // EXCLUDE window
        undefined,
        undefined,
        rangeLimit
      );

      console.log("\n=== WITH BLOCKING OBSTACLE ===");
      console.log("Vertices:");
      for (const v of vertices) {
        const xy = v.computeXY();
        console.log(`  ${v.type} at (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)})`);
      }

      // Window ArcIntersections should NOT be recomputed (excluded)
      const windowArcIntersections = vertices.filter(
        (v) => isArcIntersectionPoint(v) && v.surface.id === "mirror-right-0"
      );
      console.log("Window ArcIntersections:", windowArcIntersections.length);

      expect(windowArcIntersections.length).toBe(0);
    });
  });

  describe("Exclusion Comparison", () => {
    it("should show difference between excluded and non-excluded behavior", () => {
      const reflectedOrigin: Vector2 = { x: 890.56, y: 586 };
      const windowSurface: Surface = {
        id: "mirror-right-0",
        segment: { start: { x: 550, y: 150 }, end: { x: 550, y: 550 } },
        canReflect: true,
      };

      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const windowChain = createSingleSurfaceChain(windowSurface);

      const radius = 400;
      const rangeLimit: RangeLimitConfig = {
        pair: createRangeLimitPair(radius, "horizontal"),
        center: reflectedOrigin,
      };

      const cone = createConeThroughWindow(
        reflectedOrigin,
        windowSurface.segment.start,
        windowSurface.segment.end
      );

      // Run WITHOUT excluding the window surface
      const verticesWithWindow = projectConeV2(
        cone,
        [screenChain, windowChain],
        undefined, // NO exclusion
        undefined,
        undefined,
        rangeLimit
      );

      // Run WITH excluding the window surface
      const verticesExcluded = projectConeV2(
        cone,
        [screenChain, windowChain],
        windowSurface.id, // EXCLUDE window
        undefined,
        undefined,
        rangeLimit
      );

      console.log("\n=== EXCLUSION COMPARISON ===");
      console.log("Without exclusion:", verticesWithWindow.length, "vertices");
      console.log("With exclusion:", verticesExcluded.length, "vertices");

      const arcIntWith = verticesWithWindow.filter(
        (v) => isArcIntersectionPoint(v) && v.surface.id === "mirror-right-0"
      );
      const arcIntExcl = verticesExcluded.filter(
        (v) => isArcIntersectionPoint(v) && v.surface.id === "mirror-right-0"
      );

      console.log("Window ArcIntersections without exclusion:", arcIntWith.length);
      console.log("Window ArcIntersections with exclusion:", arcIntExcl.length);

      // With exclusion: 0 recomputed (provenance propagation)
      // Without exclusion: >0 computed
      expect(arcIntWith.length).toBeGreaterThan(0);
      expect(arcIntExcl.length).toBe(0);
    });
  });
});
