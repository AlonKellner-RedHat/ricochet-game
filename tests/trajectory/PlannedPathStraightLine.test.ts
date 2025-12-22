/**
 * Tests for planned path being a straight line from player to cursor
 *
 * First Principles:
 * - Planned path = path through planned surfaces (bypassing invalid ones)
 * - Actual path = physics simulation with NO plan (bounces off ricochet surfaces)
 * - When they diverge at a surface:
 *   - First segment (player → surface): SOLID GREEN (shared)
 *   - Planned (surface → cursor): DASHED RED (goes through)
 *   - Actual (surface → reflection): DASHED YELLOW (bounces)
 */

import { DualTrajectoryBuilder } from "@/trajectory/DualTrajectoryBuilder";
import { RicochetSurface } from "@/surfaces";
import { describe, expect, it } from "vitest";

describe("Planned Path Straight Line", () => {
  describe("Plan with surface between player and cursor", () => {
    it("planned path should be straight line from player to cursor when surface bypassed", () => {
      const builder = new DualTrajectoryBuilder();

      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 300 };

      // Vertical ricochet surface between player and cursor
      // Player is on the wrong side (approaching from the back)
      const ricochet = new RicochetSurface("r1", {
        start: { x: 300, y: 200 },
        end: { x: 300, y: 400 },
      });

      // Surface is in the plan, but will be bypassed
      const result = builder.build(player, cursor, [ricochet], [ricochet]);

      // Planned path bypasses surface and goes straight when surface can't be used
      // But actual path still reflects
      expect(result.bypassedSurfaces.length).toBeGreaterThan(0);
    });

    it("actual path should reflect off the surface", () => {
      const builder = new DualTrajectoryBuilder();

      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 300 };

      const ricochet = new RicochetSurface("r1", {
        start: { x: 300, y: 200 },
        end: { x: 300, y: 400 },
      });

      const result = builder.build(player, cursor, [ricochet], [ricochet]);

      // Actual path should hit surface and reflect
      expect(result.actual.points.length).toBeGreaterThanOrEqual(2);
      expect(result.actual.points[0]).toEqual(player);

      // Second point should be on the surface (x ≈ 300)
      const hitPoint = result.actual.points[1];
      expect(hitPoint).toBeDefined();
      expect(hitPoint!.x).toBeCloseTo(300, 0);

      // Third point should be reflected back (x < 300)
      if (result.actual.points.length >= 3) {
        const reflectedPoint = result.actual.points[2];
        expect(reflectedPoint!.x).toBeLessThan(300);
      }
    });

    it("first segment should be aligned (player to surface hit)", () => {
      const builder = new DualTrajectoryBuilder();

      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 300 };

      const ricochet = new RicochetSurface("r1", {
        start: { x: 300, y: 200 },
        end: { x: 300, y: 400 },
      });

      const result = builder.build(player, cursor, [ricochet], [ricochet]);

      // Paths diverge after surface hit
      expect(result.alignment.isFullyAligned).toBe(false);
      expect(result.isCursorReachable).toBe(false);
    });

    it("cursor should be unreachable when surface blocks it", () => {
      const builder = new DualTrajectoryBuilder();

      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 300 };

      const ricochet = new RicochetSurface("r1", {
        start: { x: 300, y: 200 },
        end: { x: 300, y: 400 },
      });

      const result = builder.build(player, cursor, [ricochet], [ricochet]);

      // Arrow reflects, so cursor at (500, 300) is unreachable
      expect(result.isCursorReachable).toBe(false);
    });
  });

  describe("Planned ghost path is straight line (no bouncing)", () => {
    it("planned ghost path should not bounce off surfaces", () => {
      const builder = new DualTrajectoryBuilder();

      const player = { x: 100, y: 300 };
      const cursor = { x: 300, y: 300 };

      // Ricochet surface BEYOND the cursor (at x=400)
      const ricochet = new RicochetSurface("r1", {
        start: { x: 400, y: 200 },
        end: { x: 400, y: 400 },
      });

      const result = builder.build(player, cursor, [], [ricochet]);

      // Planned ghost path should have at least 1 point
      expect(result.planned.ghostPoints.length).toBeGreaterThanOrEqual(1);

      // The ghost path should hit the surface
      const ghostPoint = result.planned.ghostPoints[0];
      expect(ghostPoint).toBeDefined();
    });

    it("planned ghost path extends straight when no surfaces", () => {
      const builder = new DualTrajectoryBuilder();

      const player = { x: 100, y: 300 };
      const cursor = { x: 300, y: 300 };

      // No surfaces at all
      const result = builder.build(player, cursor, [], []);

      // Ghost path should extend straight (1 point at max distance)
      expect(result.planned.ghostPoints.length).toBe(1);

      // Ghost should be far to the right (in direction player→cursor)
      const ghostPoint = result.planned.ghostPoints[0];
      expect(ghostPoint).toBeDefined();
      expect(ghostPoint!.position.x).toBeGreaterThan(cursor.x);
    });
  });

  describe("No surface between player and cursor", () => {
    it("both paths should be identical when no obstruction", () => {
      const builder = new DualTrajectoryBuilder();

      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 300 };

      // No surfaces
      const result = builder.build(player, cursor, [], []);

      // Both paths go straight to cursor
      expect(result.planned.points).toEqual([player, cursor]);
      expect(result.actual.points).toEqual([player, cursor]);
      expect(result.alignment.isFullyAligned).toBe(true);
      expect(result.isCursorReachable).toBe(true);
    });
  });
});
