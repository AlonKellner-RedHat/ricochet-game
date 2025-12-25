/**
 * ConeProjection Tests
 *
 * TDD tests for the core visibility polygon calculation.
 */
import { describe, it, expect } from "vitest";
import {
  createFullCone,
  createConeThroughWindow,
  isFullCone,
  isPointInCone,
  projectCone,
  type ConeSource,
  type ScreenBounds,
} from "@/trajectory-v2/visibility/ConeProjection";
import { createTestSurface } from "./testHelpers";

// Standard test bounds
const BOUNDS: ScreenBounds = {
  minX: 0,
  maxX: 1000,
  minY: 0,
  maxY: 800,
};

describe("ConeProjection", () => {
  // ===========================================================================
  // CONE CREATION TESTS
  // ===========================================================================

  describe("createFullCone", () => {
    it("creates a 360° cone from a point", () => {
      const origin = { x: 500, y: 400 };
      const cone = createFullCone(origin);

      expect(cone.origin).toEqual(origin);
      expect(isFullCone(cone)).toBe(true);
      expect(cone.startLine).toBeNull();
    });
  });

  describe("createConeThroughWindow", () => {
    it("creates a cone through a horizontal window above origin", () => {
      const origin = { x: 500, y: 500 };
      const windowStart = { x: 400, y: 300 };
      const windowEnd = { x: 600, y: 300 };

      const cone = createConeThroughWindow(origin, windowStart, windowEnd);

      expect(cone.origin).toEqual(origin);
      expect(isFullCone(cone)).toBe(false);
      expect(cone.startLine).not.toBeNull();
      // Window endpoints should be the boundaries
      expect(
        (cone.leftBoundary.x === 400 && cone.rightBoundary.x === 600) ||
        (cone.leftBoundary.x === 600 && cone.rightBoundary.x === 400)
      ).toBe(true);
    });
  });

  describe("isPointInCone", () => {
    it("returns true for any point in a full cone", () => {
      const cone = createFullCone({ x: 500, y: 400 });

      expect(isPointInCone({ x: 0, y: 0 }, cone)).toBe(true);
      expect(isPointInCone({ x: 1000, y: 800 }, cone)).toBe(true);
      expect(isPointInCone({ x: 500, y: 100 }, cone)).toBe(true);
    });

    it("returns true for points within a windowed cone", () => {
      const origin = { x: 500, y: 500 };
      const cone = createConeThroughWindow(origin, { x: 400, y: 300 }, { x: 600, y: 300 });

      // Point directly above origin (in the cone)
      expect(isPointInCone({ x: 500, y: 200 }, cone)).toBe(true);
      // Point slightly left but still in cone
      expect(isPointInCone({ x: 450, y: 200 }, cone)).toBe(true);
    });

    it("returns false for points outside a windowed cone", () => {
      const origin = { x: 500, y: 500 };
      const cone = createConeThroughWindow(origin, { x: 400, y: 300 }, { x: 600, y: 300 });

      // Point below origin (opposite direction of cone)
      expect(isPointInCone({ x: 500, y: 700 }, cone)).toBe(false);
      // Point far to the left (outside cone)
      expect(isPointInCone({ x: 100, y: 300 }, cone)).toBe(false);
    });
  });

  // ===========================================================================
  // 360° CONE PROJECTION TESTS
  // ===========================================================================

  describe("projectCone - full 360°", () => {
    it("creates a polygon matching room boundaries with no obstacles", () => {
      const origin = { x: 500, y: 400 };
      const cone = createFullCone(origin);

      // Empty room - just walls
      const walls = [
        createTestSurface("left-wall", { x: 0, y: 0 }, { x: 0, y: 800 }, false),
        createTestSurface("right-wall", { x: 1000, y: 0 }, { x: 1000, y: 800 }, false),
        createTestSurface("top-wall", { x: 0, y: 0 }, { x: 1000, y: 0 }, false),
        createTestSurface("bottom-wall", { x: 0, y: 800 }, { x: 1000, y: 800 }, false),
      ];

      const polygon = projectCone(cone, walls, BOUNDS);

      // Should have vertices at or near the corners
      expect(polygon.length).toBeGreaterThanOrEqual(4);

      // All vertices should be on boundaries
      for (const v of polygon) {
        const onBoundary =
          Math.abs(v.x - 0) < 2 ||
          Math.abs(v.x - 1000) < 2 ||
          Math.abs(v.y - 0) < 2 ||
          Math.abs(v.y - 800) < 2;
        expect(onBoundary).toBe(true);
      }
    });

    it("creates shadow behind a single obstacle", () => {
      const origin = { x: 500, y: 600 };
      const cone = createFullCone(origin);

      const walls = [
        createTestSurface("left-wall", { x: 0, y: 0 }, { x: 0, y: 800 }, false),
        createTestSurface("right-wall", { x: 1000, y: 0 }, { x: 1000, y: 800 }, false),
        createTestSurface("top-wall", { x: 0, y: 0 }, { x: 1000, y: 0 }, false),
        createTestSurface("bottom-wall", { x: 0, y: 800 }, { x: 1000, y: 800 }, false),
      ];

      const obstacle = createTestSurface("obstacle", { x: 400, y: 300 }, { x: 600, y: 300 }, false);

      const polygon = projectCone(cone, [...walls, obstacle], BOUNDS);

      // Polygon should include the obstacle endpoints
      const hasObstacleStart = polygon.some(
        (v) => Math.abs(v.x - 400) < 2 && Math.abs(v.y - 300) < 2
      );
      const hasObstacleEnd = polygon.some(
        (v) => Math.abs(v.x - 600) < 2 && Math.abs(v.y - 300) < 2
      );
      expect(hasObstacleStart).toBe(true);
      expect(hasObstacleEnd).toBe(true);

      // Point behind the obstacle (in shadow) should NOT be in polygon area
      // We check this by verifying the polygon doesn't extend past the obstacle in its shadow
      const pointsBehind = polygon.filter((v) => v.y < 300 && v.x > 400 && v.x < 600);
      // There should be no polygon vertices in the shadow region
      // (vertices there would be on the top wall, not between 400 and 600)
      for (const v of pointsBehind) {
        // If there's a vertex behind the obstacle, it must be on the top wall
        expect(Math.abs(v.y - 0) < 2).toBe(true);
      }
    });
  });

  // ===========================================================================
  // WINDOWED CONE (UMBRELLA) TESTS
  // ===========================================================================

  describe("projectCone - through window (umbrella)", () => {
    it("creates a polygon only above the umbrella", () => {
      const origin = { x: 500, y: 500 };
      const umbrellaStart = { x: 400, y: 400 };
      const umbrellaEnd = { x: 600, y: 400 };
      const cone = createConeThroughWindow(origin, umbrellaStart, umbrellaEnd);

      const walls = [
        createTestSurface("left-wall", { x: 0, y: 0 }, { x: 0, y: 800 }, false),
        createTestSurface("right-wall", { x: 1000, y: 0 }, { x: 1000, y: 800 }, false),
        createTestSurface("top-wall", { x: 0, y: 0 }, { x: 1000, y: 0 }, false),
        createTestSurface("bottom-wall", { x: 0, y: 800 }, { x: 1000, y: 800 }, false),
      ];

      const polygon = projectCone(cone, walls, BOUNDS);

      expect(polygon.length).toBeGreaterThanOrEqual(3);

      // All vertices should be at y <= 400 (at or above the umbrella)
      // Allow small tolerance for floating point
      for (const v of polygon) {
        expect(v.y).toBeLessThanOrEqual(401);
      }
    });

    it("creates shadow from obstacle above umbrella", () => {
      const origin = { x: 500, y: 500 };
      const umbrellaStart = { x: 400, y: 400 };
      const umbrellaEnd = { x: 600, y: 400 };
      const cone = createConeThroughWindow(origin, umbrellaStart, umbrellaEnd);

      const walls = [
        createTestSurface("left-wall", { x: 0, y: 0 }, { x: 0, y: 800 }, false),
        createTestSurface("right-wall", { x: 1000, y: 0 }, { x: 1000, y: 800 }, false),
        createTestSurface("top-wall", { x: 0, y: 0 }, { x: 1000, y: 0 }, false),
        createTestSurface("bottom-wall", { x: 0, y: 800 }, { x: 1000, y: 800 }, false),
      ];

      // Obstacle above the umbrella
      const obstacle = createTestSurface("obstacle", { x: 450, y: 200 }, { x: 550, y: 200 }, false);

      const polygon = projectCone(cone, [...walls, obstacle], BOUNDS);

      // Should have the obstacle endpoints in the polygon
      const hasObstacleStart = polygon.some(
        (v) => Math.abs(v.x - 450) < 2 && Math.abs(v.y - 200) < 2
      );
      const hasObstacleEnd = polygon.some(
        (v) => Math.abs(v.x - 550) < 2 && Math.abs(v.y - 200) < 2
      );
      expect(hasObstacleStart).toBe(true);
      expect(hasObstacleEnd).toBe(true);
    });

    it("ignores obstacles behind the umbrella (below startLine)", () => {
      const origin = { x: 500, y: 500 };
      const umbrellaStart = { x: 400, y: 400 };
      const umbrellaEnd = { x: 600, y: 400 };
      const cone = createConeThroughWindow(origin, umbrellaStart, umbrellaEnd);

      const walls = [
        createTestSurface("left-wall", { x: 0, y: 0 }, { x: 0, y: 800 }, false),
        createTestSurface("right-wall", { x: 1000, y: 0 }, { x: 1000, y: 800 }, false),
        createTestSurface("top-wall", { x: 0, y: 0 }, { x: 1000, y: 0 }, false),
        createTestSurface("bottom-wall", { x: 0, y: 800 }, { x: 1000, y: 800 }, false),
      ];

      // Obstacle below umbrella (between origin and umbrella)
      const obstacleBelow = createTestSurface(
        "obstacle-below",
        { x: 450, y: 450 },
        { x: 550, y: 450 },
        false
      );

      const polygon = projectCone(cone, [...walls, obstacleBelow], BOUNDS);

      // The obstacle below should NOT block light going up through the umbrella
      // So the polygon should NOT have vertices at y=450
      const hasVertexAtObstacle = polygon.some(
        (v) => Math.abs(v.y - 450) < 2 && v.x > 400 && v.x < 600
      );
      expect(hasVertexAtObstacle).toBe(false);
    });
  });
});

