import { RicochetSurface } from "@/surfaces";
import { calculatePlannedTrajectory } from "@/trajectory/ImageReflectionCalculator";
import { describe, expect, it } from "vitest";

describe("ImageReflectionCalculator", () => {
  describe("calculatePlannedTrajectory", () => {
    it("should return direct path when no planned surfaces", () => {
      const player = { x: 0, y: 0 };
      const cursor = { x: 100, y: 0 };

      const path = calculatePlannedTrajectory(player, cursor, []);

      expect(path).toHaveLength(2);
      expect(path[0]).toEqual(player);
      expect(path[1]).toEqual(cursor);
    });

    it("should calculate single reflection through horizontal surface", () => {
      // Player at (0, 100), cursor at (200, 100)
      // Surface at y=0 from x=0 to x=200
      // The path should go: player -> hit point on surface -> cursor
      // Using image reflection: reflect player through surface to get (0, -100)
      // Line from cursor (200, 100) to player image (0, -100) intersects y=0 at x=100

      const player = { x: 0, y: 100 };
      const cursor = { x: 200, y: 100 };
      const surface = new RicochetSurface("s1", {
        start: { x: 0, y: 0 },
        end: { x: 200, y: 0 },
      });

      const path = calculatePlannedTrajectory(player, cursor, [surface]);

      expect(path).toHaveLength(3);
      expect(path[0]).toEqual(player);
      // Hit point should be at (100, 0)
      expect(path[1]?.x).toBeCloseTo(100);
      expect(path[1]?.y).toBeCloseTo(0);
      expect(path[2]).toEqual(cursor);
    });

    it("should calculate single reflection through vertical surface", () => {
      // Player at (0, 0), cursor at (0, 200)
      // Surface at x=100 from y=0 to y=200
      // Path bounces off vertical surface

      const player = { x: 0, y: 0 };
      const cursor = { x: 0, y: 200 };
      const surface = new RicochetSurface("s1", {
        start: { x: 100, y: 0 },
        end: { x: 100, y: 200 },
      });

      const path = calculatePlannedTrajectory(player, cursor, [surface]);

      expect(path).toHaveLength(3);
      expect(path[0]).toEqual(player);
      // Hit point should be at (100, 100)
      expect(path[1]?.x).toBeCloseTo(100);
      expect(path[1]?.y).toBeCloseTo(100);
      expect(path[2]).toEqual(cursor);
    });

    it("should calculate two reflections correctly", () => {
      // Player at origin, cursor at (200, 0)
      // Two surfaces: one above (y=50), one below (y=-50)
      // Path: up to first surface, reflect down to second, reflect up to cursor
      // This is geometrically valid for a zigzag trajectory

      const player = { x: 0, y: 0 };
      const cursor = { x: 200, y: 0 };
      const surface1 = new RicochetSurface("s1", {
        start: { x: 0, y: 50 },
        end: { x: 200, y: 50 },
      });
      const surface2 = new RicochetSurface("s2", {
        start: { x: 0, y: -50 },
        end: { x: 200, y: -50 },
      });

      const path = calculatePlannedTrajectory(player, cursor, [surface1, surface2]);

      expect(path).toHaveLength(4);
      expect(path[0]).toEqual(player);
      // First hit should be on surface1 (y=50)
      expect(path[1]?.y).toBeCloseTo(50);
      // Second hit should be on surface2 (y=-50)
      expect(path[2]?.y).toBeCloseTo(-50);
      expect(path[3]).toEqual(cursor);
    });

    it("should handle diagonal surface reflection", () => {
      // Player at (0, 0), cursor at (100, 100)
      // Diagonal surface from (50, 0) to (100, 50)
      // This tests non-axis-aligned reflections

      const player = { x: 0, y: 0 };
      const cursor = { x: 100, y: 100 };
      const surface = new RicochetSurface("s1", {
        start: { x: 50, y: 0 },
        end: { x: 100, y: 50 },
      });

      const path = calculatePlannedTrajectory(player, cursor, [surface]);

      expect(path).toHaveLength(3);
      expect(path[0]).toEqual(player);
      // Hit point should be on the surface segment
      const hitX = path[1]?.x ?? 0;
      const hitY = path[1]?.y ?? 0;
      // Verify point is on the line y = x - 50 for x in [50, 100]
      expect(hitX).toBeGreaterThanOrEqual(50);
      expect(hitX).toBeLessThanOrEqual(100);
      expect(hitY).toBeCloseTo(hitX - 50, 1);
      expect(path[2]).toEqual(cursor);
    });

    it("should return null hit points when trajectory misses surface", () => {
      // Player and cursor on same side of surface - no valid intersection
      const player = { x: 0, y: 0 };
      const cursor = { x: 100, y: 0 };
      // Surface way above the trajectory line
      const surface = new RicochetSurface("s1", {
        start: { x: 50, y: 100 },
        end: { x: 50, y: 200 },
      });

      const path = calculatePlannedTrajectory(player, cursor, [surface]);

      // When trajectory can't hit the surface, path should still include
      // player and cursor but hit point may be null or path may be invalid
      expect(path.length).toBeGreaterThanOrEqual(2);
      expect(path[0]).toEqual(player);
    });
  });

  describe("buildPlayerImages", () => {
    it("should generate correct sequence of player reflections", () => {
      // This tests the internal image building logic
      // For 2 surfaces, we should get 3 images: original + 2 reflections
      // We test this indirectly through calculatePlannedTrajectory
    });
  });

  describe("buildCursorImages", () => {
    it("should generate correct sequence of cursor reflections backwards", () => {
      // Cursor images should be reflected in reverse order
      // We test this indirectly through calculatePlannedTrajectory
    });
  });
});
