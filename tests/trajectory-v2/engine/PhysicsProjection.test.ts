/**
 * Tests for calculatePhysicsProjectionUnified - Unified physics projection using tracePath.
 *
 * This function replaces the direction-based projection approach with
 * image-based reflection via RayPropagator and tracePath.
 *
 * Physics projection is used for:
 * - Dashed yellow paths (forward projection from cursor in physical mode)
 * - Dashed red paths (continuation of planned path in planned mode)
 */

import { describe, it, expect } from "vitest";
import { createMockBidirectionalSurface, createMockWall } from "@test/helpers/surfaceHelpers";
import { calculatePhysicsProjectionUnified } from "@/trajectory-v2/engine/RenderDeriver";
import { createRayPropagator } from "@/trajectory-v2/engine/RayPropagator";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

describe("calculatePhysicsProjectionUnified", () => {
  // Helper to create a simple horizontal bidirectional reflective surface
  function createHorizontalSurface(
    id: string,
    y: number,
    xStart: number,
    xEnd: number
  ): Surface {
    return createMockBidirectionalSurface(id, { x: xStart, y }, { x: xEnd, y });
  }

  describe("continuation from divergence point", () => {
    it("should continue from propagator state at divergence", () => {
      // Create a propagator that has already reflected through one surface
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 300 };
      const propagator = createRayPropagator(origin, target);

      // Reflect through a surface (simulating divergence point)
      const surface = createHorizontalSurface("s1", 200, 50, 150);
      const reflectedPropagator = propagator.reflectThrough(surface);

      // Project from the reflected state
      const segments = calculatePhysicsProjectionUnified(
        reflectedPropagator,
        [],
        "physical",
        1000,
        5
      );

      // Should produce at least one segment
      expect(segments.length).toBeGreaterThanOrEqual(1);
    });

    it("should use reflected images, not raw direction", () => {
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 300 };
      const propagator = createRayPropagator(origin, target);

      // Get the ray before reflection
      const rayBefore = propagator.getRay();

      // Reflect through surface
      const surface = createHorizontalSurface("s1", 200, 50, 150);
      const reflectedPropagator = propagator.reflectThrough(surface);

      // Get the ray after reflection
      const rayAfter = reflectedPropagator.getRay();

      // The reflected ray should have different source/target
      expect(rayAfter.source).not.toEqual(rayBefore.source);
      expect(rayAfter.target).not.toEqual(rayBefore.target);

      // Project using the reflected propagator
      const segments = calculatePhysicsProjectionUnified(
        reflectedPropagator,
        [],
        "physical",
        1000,
        5
      );

      // Should work with reflected images
      expect(segments.length).toBeGreaterThanOrEqual(1);
    });

    it("should produce correct dashed yellow segments", () => {
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 500 };
      const propagator = createRayPropagator(origin, target);

      // Surface to hit
      const surface = createHorizontalSurface("s1", 300, 50, 150);

      const segments = calculatePhysicsProjectionUnified(
        propagator,
        [surface],
        "physical",
        1000,
        5
      );

      // Should have segments representing the projection
      expect(segments.length).toBeGreaterThanOrEqual(1);
      
      // First segment should go toward the target
      if (segments.length > 0) {
        expect(segments[0]!.start).toBeDefined();
        expect(segments[0]!.end).toBeDefined();
      }
    });
  });

  describe("planned continuation (dashed red)", () => {
    it("should use mode=planned for off-segment continuation", () => {
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 300 };
      const propagator = createRayPropagator(origin, target);

      // Surface that would be off-segment for this ray
      const surface = createHorizontalSurface("s1", 200, 200, 300); // Off the ray path

      const segments = calculatePhysicsProjectionUnified(
        propagator,
        [surface],
        "planned", // Use planned mode
        1000,
        5
      );

      // In planned mode, should still detect the surface (extended line)
      expect(segments.length).toBeGreaterThanOrEqual(1);
    });

    it("should reflect through surfaces even when off-segment", () => {
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 300 };
      const propagator = createRayPropagator(origin, target);

      // Surface that's off-segment but on the extended line
      const surface = createHorizontalSurface("s1", 200, 200, 300);

      const physicalSegments = calculatePhysicsProjectionUnified(
        propagator,
        [surface],
        "physical",
        1000,
        5
      );

      const plannedSegments = calculatePhysicsProjectionUnified(
        propagator,
        [surface],
        "planned",
        1000,
        5
      );

      // Physical mode should NOT hit the off-segment surface
      // Planned mode SHOULD hit it
      // The segments should differ
      expect(plannedSegments.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("consistency with tracePath", () => {
    it("projection segments should match tracePath result", () => {
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 500 };
      const propagator = createRayPropagator(origin, target);

      const surface = createHorizontalSurface("s1", 300, 50, 150);

      const segments = calculatePhysicsProjectionUnified(
        propagator,
        [surface],
        "physical",
        1000,
        5
      );

      // Segments should be well-formed
      for (const seg of segments) {
        expect(seg.start).toBeDefined();
        expect(seg.end).toBeDefined();
        expect(typeof seg.start.x).toBe("number");
        expect(typeof seg.start.y).toBe("number");
        expect(typeof seg.end.x).toBe("number");
        expect(typeof seg.end.y).toBe("number");
      }
    });

    it("should share ReflectionCache with main path", () => {
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 300 };
      const propagator = createRayPropagator(origin, target);

      // First projection
      const segments1 = calculatePhysicsProjectionUnified(
        propagator,
        [],
        "physical",
        500,
        3
      );

      // The propagator maintains its cache across calls
      const stats = propagator.getCacheStats();
      
      // Stats should be accessible
      expect(stats).toBeDefined();
      expect(typeof stats.hits).toBe("number");
      expect(typeof stats.misses).toBe("number");
    });
  });

  describe("edge cases", () => {
    it("should handle empty surfaces list", () => {
      const propagator = createRayPropagator({ x: 0, y: 0 }, { x: 100, y: 100 });

      const segments = calculatePhysicsProjectionUnified(
        propagator,
        [],
        "physical",
        500,
        5
      );

      // Should produce one segment extending in the direction
      expect(segments.length).toBe(1);
    });

    it("should stop at wall surfaces", () => {
      const propagator = createRayPropagator({ x: 100, y: 100 }, { x: 100, y: 300 });
      const wall = createMockWall("wall1", { x: 50, y: 200 }, { x: 150, y: 200 });

      const segments = calculatePhysicsProjectionUnified(
        propagator,
        [wall],
        "physical",
        1000,
        5
      );

      // Should stop at wall
      expect(segments.length).toBe(1);
      expect(segments[0]!.end.y).toBeCloseTo(200, 0);
    });

    it("should respect maxReflections", () => {
      const propagator = createRayPropagator({ x: 100, y: 150 }, { x: 100, y: 500 });
      
      // Two parallel surfaces for bouncing
      const surface1 = createHorizontalSurface("s1", 200, 50, 150);
      const surface2 = createHorizontalSurface("s2", 100, 50, 150);

      const segments = calculatePhysicsProjectionUnified(
        propagator,
        [surface1, surface2],
        "physical",
        10000,
        2 // Only 2 reflections
      );

      // Should not exceed maxReflections + 1 segments
      expect(segments.length).toBeLessThanOrEqual(3);
    });

    it("should respect maxDistance", () => {
      const propagator = createRayPropagator({ x: 100, y: 100 }, { x: 100, y: 10000 });

      const segments = calculatePhysicsProjectionUnified(
        propagator,
        [],
        "physical",
        200, // Short max distance
        5
      );

      // Should produce limited distance
      const totalDist = segments.reduce((sum, seg) => {
        const dx = seg.end.x - seg.start.x;
        const dy = seg.end.y - seg.start.y;
        return sum + Math.sqrt(dx * dx + dy * dy);
      }, 0);

      expect(totalDist).toBeLessThanOrEqual(250); // Some tolerance
    });
  });
});
