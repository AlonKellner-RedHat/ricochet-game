/**
 * Tests for directional reflection in trajectory building
 *
 * First Principles:
 * - Arrows can only reflect off the "front" side of a ricochet surface
 * - Approaching from the "back" side causes the arrow to block (stick)
 * - The normal vector defines the front side
 */

import { DualTrajectoryBuilder } from "@/trajectory/DualTrajectoryBuilder";
import { RicochetSurface } from "@/surfaces";
import { describe, expect, it } from "vitest";

describe("Directional Reflection in Trajectory", () => {
  const builder = new DualTrajectoryBuilder();

  describe("actual trajectory physics", () => {
    it("should reflect when approaching ricochet surface from front", () => {
      // Vertical surface at x=100, segment from (100, 0) to (100, 200)
      // Normal points left (x=-1)
      // Arrow going right (x=1) approaches from front (opposite to normal)
      const surface = new RicochetSurface("r1", {
        start: { x: 100, y: 0 },
        end: { x: 100, y: 200 },
      });

      // Verify normal points left
      const normal = surface.getNormal();
      expect(normal.x).toBeLessThan(0);

      // Arrow from left going right should reflect
      const arrowDirection = { x: 1, y: 0 };
      expect(surface.canReflectFrom(arrowDirection)).toBe(true);

      // Build trajectory
      const player = { x: 50, y: 100 };
      const cursor = { x: 150, y: 100 };
      const result = builder.build(player, cursor, [], [surface]);

      // Actual trajectory should have more than 2 points (reflected)
      // The path should go: player → surface hit → reflected direction
      expect(result.actual.points.length).toBeGreaterThan(2);
    });

    it("should block when approaching ricochet surface from back", () => {
      // Vertical surface at x=100, segment from (100, 0) to (100, 200)
      // Normal points left (x=-1)
      // Arrow going left (x=-1) approaches from back (same as normal)
      const surface = new RicochetSurface("r1", {
        start: { x: 100, y: 0 },
        end: { x: 100, y: 200 },
      });

      // Verify normal points left
      const normal = surface.getNormal();
      expect(normal.x).toBeLessThan(0);

      // Arrow from right going left should block
      const arrowDirection = { x: -1, y: 0 };
      expect(surface.canReflectFrom(arrowDirection)).toBe(false);

      // Build trajectory
      const player = { x: 150, y: 100 };
      const cursor = { x: 50, y: 100 };
      const result = builder.build(player, cursor, [], [surface]);

      // Actual trajectory should stop at the surface (like a wall)
      // Points: player → surface hit (and stops)
      expect(result.actual.points.length).toBe(2);
      const hitPoint = result.actual.points[1]!;
      expect(hitPoint.x).toBeCloseTo(100, 0);
      expect(hitPoint.y).toBeCloseTo(100, 0);

      // Should NOT be cursor reachable
      expect(result.isCursorReachable).toBe(false);
    });

    it("should continue through ricochet surface when approaching from reflective side and no plan", () => {
      // Horizontal surface at y=50
      const surface = new RicochetSurface("h1", {
        start: { x: 0, y: 50 },
        end: { x: 200, y: 50 },
      });

      const normal = surface.getNormal();
      console.log("Horizontal surface normal:", normal);

      // Arrow from above going down should reflect if normal points up
      // Arrow from below going up should reflect if normal points down
      const goingDown = { x: 0, y: 1 };
      const goingUp = { x: 0, y: -1 };

      const canReflectFromAbove = surface.canReflectFrom(goingDown);
      const canReflectFromBelow = surface.canReflectFrom(goingUp);

      // One should be true, one should be false
      expect(canReflectFromAbove).not.toBe(canReflectFromBelow);

      // Build trajectories for both directions
      const playerAbove = { x: 100, y: 25 };
      const cursorBelow = { x: 100, y: 75 };

      const resultFromAbove = builder.build(playerAbove, cursorBelow, [], [surface]);

      const playerBelow = { x: 100, y: 75 };
      const cursorAbove = { x: 100, y: 25 };

      const resultFromBelow = builder.build(playerBelow, cursorAbove, [], [surface]);

      // One should be blocked (2 points), one should reflect (3+ points)
      const fromAboveBlocked = resultFromAbove.actual.points.length === 2;
      const fromBelowBlocked = resultFromBelow.actual.points.length === 2;

      expect(fromAboveBlocked).not.toBe(fromBelowBlocked);
    });
  });

  describe("ghost path physics", () => {
    it("ghost path should stop at ricochet surface from blocking side", () => {
      // Surface at x=100, segment from (100, 0) to (100, 200)
      // Normal points left (x = -1)
      const surface = new RicochetSurface("r1", {
        start: { x: 100, y: 0 },
        end: { x: 100, y: 200 },
      });

      // Verify normal points left
      const normal = surface.getNormal();
      expect(normal.x).toBeLessThan(0);

      // Player to the right of surface, cursor closer to surface but still right
      // Ghost path continues LEFT (same direction as normal = blocking side)
      const player = { x: 200, y: 100 };
      const cursor = { x: 150, y: 100 };

      // Arrow going left (x = -1) same direction as normal → should block
      const arrowDirection = { x: -1, y: 0 };
      expect(surface.canReflectFrom(arrowDirection)).toBe(false);

      const result = builder.build(player, cursor, [], [surface]);

      // Ghost path should stop at surface (willStick=true)
      expect(result.actual.ghostPoints.length).toBeGreaterThan(0);
      const ghostEnd = result.actual.ghostPoints[result.actual.ghostPoints.length - 1];
      expect(ghostEnd?.willStick).toBe(true);
    });
  });
});
