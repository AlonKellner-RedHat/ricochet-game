/**
 * Tests for visibility polygon including surface-circle intersection points.
 *
 * When a surface segment crosses the range limit circle, the intersection
 * should be added as a ray target and included in the visibility polygon.
 */
import { describe, it, expect } from "vitest";
import { projectConeV2, createFullCone } from "@/trajectory-v2/visibility/ConeProjectionV2";
import { SurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { createRangeLimitPair } from "@/trajectory-v2/obstacles/RangeLimit";
import { isIntersectionPoint } from "@/trajectory-v2/geometry/SourcePoint";
import { WallSurface } from "@/surfaces/WallSurface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

describe("ConeProjectionV2 with Surface-Circle Intersections", () => {
  // Screen bounds
  const bounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  const screenChain = createScreenBoundaryChain(bounds);

  // Surface factory for test chains
  const surfaceFactory = (index: number, start: Vector2, end: Vector2) =>
    new WallSurface(`test-surface-${index}`, { start, end });

  describe("intersection point detection", () => {
    it("should add IntersectionPoint when surface crosses range limit circle", () => {
      const player = { x: 400, y: 300 };

      // Surface that crosses the range limit circle
      // Range limit radius = 100, centered at player
      // Surface from (350, 100) to (350, 500) - vertical line that crosses circle
      const obstacleChain = new SurfaceChain({
        vertices: [
          { x: 350, y: 100 },
          { x: 350, y: 500 },
        ],
        isClosed: false,
        surfaceFactory,
      });

      const allChains = [screenChain, obstacleChain];

      const rangeLimitPair = createRangeLimitPair(100);
      const rangeLimit = { pair: rangeLimitPair, center: player };

      const result = projectConeV2(
        createFullCone(player),
        allChains,
        undefined,
        undefined,
        undefined,
        rangeLimit
      );

      // Should include IntersectionPoints where surface crosses range limit
      const intersectionPoints = result.filter(isIntersectionPoint);
      expect(intersectionPoints.length).toBeGreaterThan(0);
    });

    it("should NOT add IntersectionPoint for surface entirely outside circle", () => {
      const player = { x: 400, y: 300 };

      // Surface entirely outside the range limit circle (radius 100)
      const obstacleChain = new SurfaceChain({
        vertices: [
          { x: 600, y: 100 },
          { x: 600, y: 500 },
        ],
        isClosed: false,
        surfaceFactory,
      });

      const allChains = [screenChain, obstacleChain];

      const rangeLimitPair = createRangeLimitPair(100);
      const rangeLimit = { pair: rangeLimitPair, center: player };

      const result = projectConeV2(
        createFullCone(player),
        allChains,
        undefined,
        undefined,
        undefined,
        rangeLimit
      );

      // Should NOT include IntersectionPoints for surfaces outside
      const intersectionPoints = result.filter(isIntersectionPoint);
      expect(intersectionPoints).toHaveLength(0);
    });

    it("should NOT add IntersectionPoint for surface entirely inside circle", () => {
      const player = { x: 400, y: 300 };

      // Surface entirely inside the range limit circle (radius 100)
      const obstacleChain = new SurfaceChain({
        vertices: [
          { x: 390, y: 290 },
          { x: 410, y: 310 },
        ],
        isClosed: false,
        surfaceFactory,
      });

      const allChains = [screenChain, obstacleChain];

      const rangeLimitPair = createRangeLimitPair(100);
      const rangeLimit = { pair: rangeLimitPair, center: player };

      const result = projectConeV2(
        createFullCone(player),
        allChains,
        undefined,
        undefined,
        undefined,
        rangeLimit
      );

      // Should NOT include IntersectionPoints for surfaces inside
      const intersectionPoints = result.filter(isIntersectionPoint);
      expect(intersectionPoints).toHaveLength(0);
    });

    it("should NOT add IntersectionPoint at t=0 or t=1 (covered by Endpoint)", () => {
      const player = { x: 400, y: 300 };

      // Surface that starts exactly on circle boundary
      // Endpoint at (500, 300) is exactly 100 units from player
      const obstacleChain = new SurfaceChain({
        vertices: [
          { x: 500, y: 300 }, // On circle
          { x: 600, y: 300 }, // Outside circle
        ],
        isClosed: false,
        surfaceFactory,
      });

      const allChains = [screenChain, obstacleChain];

      const rangeLimitPair = createRangeLimitPair(100);
      const rangeLimit = { pair: rangeLimitPair, center: player };

      const result = projectConeV2(
        createFullCone(player),
        allChains,
        undefined,
        undefined,
        undefined,
        rangeLimit
      );

      // Should NOT include IntersectionPoint at t=0 (that's an Endpoint)
      const intersectionPoints = result.filter(isIntersectionPoint);
      // If intersection is at exactly t=0 or t=1, it should be covered by Endpoint
      for (const ip of intersectionPoints) {
        expect(ip.t).not.toBe(0);
        expect(ip.t).not.toBe(1);
      }
    });
  });

  describe("no range limit", () => {
    it("should not create IntersectionPoints when rangeLimit is not provided", () => {
      const player = { x: 400, y: 300 };

      const obstacleChain = new SurfaceChain({
        vertices: [
          { x: 350, y: 100 },
          { x: 350, y: 500 },
        ],
        isClosed: false,
        surfaceFactory,
      });

      const allChains = [screenChain, obstacleChain];

      // No range limit
      const result = projectConeV2(
        createFullCone(player),
        allChains
      );

      // Should NOT include any IntersectionPoints
      const intersectionPoints = result.filter(isIntersectionPoint);
      expect(intersectionPoints).toHaveLength(0);
    });
  });
});
