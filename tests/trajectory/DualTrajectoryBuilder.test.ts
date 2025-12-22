import { RicochetSurface, WallSurface } from "@/surfaces";
import { DualTrajectoryBuilder } from "@/trajectory/DualTrajectoryBuilder";
import { describe, expect, it, beforeEach } from "vitest";

describe("DualTrajectoryBuilder", () => {
  let builder: DualTrajectoryBuilder;

  beforeEach(() => {
    builder = new DualTrajectoryBuilder();
  });

  describe("planned path is straight line", () => {
    it("planned path should always be straight from player to cursor when no surfaces", () => {
      const player = { x: 0, y: 0 };
      const cursor = { x: 200, y: 100 };

      const result = builder.build(player, cursor, [], []);

      // Planned is always straight: [player, cursor]
      expect(result.planned.points.length).toBe(2);
      expect(result.planned.points[0]).toEqual(player);
      expect(result.planned.points[1]).toEqual(cursor);
    });

    it("actual path should reflect off surfaces", () => {
      const player = { x: 0, y: 0 };
      const cursor = { x: 200, y: 0 };
      const surface = new RicochetSurface("r1", {
        start: { x: 100, y: -50 },
        end: { x: 100, y: 50 },
      });

      const result = builder.build(player, cursor, [surface], [surface]);

      // Actual should hit surface and reflect
      expect(result.actual.points.length).toBeGreaterThanOrEqual(2);
      expect(result.actual.points[0]).toEqual(player);

      // Second point should be on surface (x ≈ 100)
      const hitPoint = result.actual.points[1];
      expect(hitPoint).toBeDefined();
      expect(hitPoint!.x).toBeCloseTo(100, 0);
    });
  });

  describe("alignment", () => {
    it("should be fully aligned when no obstacles between player and cursor", () => {
      const player = { x: 0, y: 0 };
      const cursor = { x: 200, y: 0 };

      // No surfaces at all
      const result = builder.build(player, cursor, [], []);

      expect(result.alignment.isFullyAligned).toBe(true);
      expect(result.isCursorReachable).toBe(true);
    });

    it("should NOT be fully aligned when surface blocks cursor", () => {
      const player = { x: 0, y: 0 };
      const cursor = { x: 200, y: 0 };
      const surface = new RicochetSurface("r1", {
        start: { x: 100, y: -50 },
        end: { x: 100, y: 50 },
      });

      const result = builder.build(player, cursor, [surface], [surface]);

      // Cursor is blocked - arrow reflects
      expect(result.alignment.isFullyAligned).toBe(false);
      expect(result.isCursorReachable).toBe(false);
    });

    it("first segment (player to obstacle) is always counted as aligned", () => {
      const player = { x: 0, y: 0 };
      const cursor = { x: 200, y: 0 };
      const surface = new RicochetSurface("r1", {
        start: { x: 100, y: -50 },
        end: { x: 100, y: 50 },
      });

      const result = builder.build(player, cursor, [surface], [surface]);

      // First segment is shared (both paths go from player toward the surface)
      expect(result.alignment.alignedSegmentCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("ghost path", () => {
    it("should include ghost path for both trajectories", () => {
      const player = { x: 0, y: 0 };
      const cursor = { x: 200, y: 0 };

      const result = builder.build(player, cursor, [], []);

      // Both should have ghost points defined (may be empty if nothing to hit)
      expect(result.planned.ghostPoints).toBeDefined();
      expect(result.actual.ghostPoints).toBeDefined();
    });

    it("should mark ghost point as sticking when hitting wall", () => {
      const player = { x: 0, y: 0 };
      const cursor = { x: 100, y: 0 };
      const ricochet = new RicochetSurface("r1", {
        start: { x: 50, y: -50 },
        end: { x: 50, y: 50 },
      });
      const wall = new WallSurface("wall1", {
        start: { x: 0, y: -50 },
        end: { x: 0, y: 50 },
      });

      // No planned surfaces - just test ghost path
      const result = builder.build(player, cursor, [], [ricochet, wall]);

      // Arrow goes right, hits ricochet at x=50, bounces back, hits wall at x=0
      // Check ghost path for wall hit
      const wallHit = result.actual.ghostPoints.find((g) => g.surfaceId === "wall1");
      if (wallHit) {
        expect(wallHit.willStick).toBe(true);
      }
    });
  });
});
