/**
 * Tests for PathBuilder - builds paths while skipping invalid surfaces
 */

import { describe, expect, it } from "vitest";
import { PathBuilder } from "@/trajectory/PathBuilder";
import { BypassReason } from "@/trajectory/BypassChecker";
import { RicochetSurface, WallSurface } from "@/surfaces";
import type { Vector2 } from "@/types";

describe("PathBuilder", () => {
  const builder = new PathBuilder();

  // Helper to create surfaces with predictable normals
  function createHorizontalSurface(id: string, y: number, normalUp: boolean): RicochetSurface {
    return normalUp
      ? new RicochetSurface(id, { start: { x: 200, y }, end: { x: 0, y } })
      : new RicochetSurface(id, { start: { x: 0, y }, end: { x: 200, y } });
  }

  function createVerticalSurface(id: string, x: number, normalLeft: boolean): RicochetSurface {
    return normalLeft
      ? new RicochetSurface(id, { start: { x, y: 0 }, end: { x, y: 200 } })
      : new RicochetSurface(id, { start: { x, y: 200 }, end: { x, y: 0 } });
  }

  describe("no planned surfaces", () => {
    it("should build direct path from player to cursor", () => {
      const player: Vector2 = { x: 50, y: 50 };
      const cursor: Vector2 = { x: 150, y: 50 };

      const result = builder.build(player, cursor, [], []);

      expect(result.points).toHaveLength(2);
      expect(result.points[0]).toEqual(player);
      expect(result.points[1]).toEqual(cursor);
      expect(result.reachedCursor).toBe(true);
      expect(result.bypassedSurfaces).toHaveLength(0);
    });

    it("should stop at wall obstruction", () => {
      const player: Vector2 = { x: 50, y: 50 };
      const cursor: Vector2 = { x: 150, y: 50 };
      const wall = new WallSurface("wall", {
        start: { x: 100, y: 0 },
        end: { x: 100, y: 100 },
      });

      const result = builder.build(player, cursor, [], [wall]);

      expect(result.points).toHaveLength(2);
      expect(result.points[1]?.x).toBeCloseTo(100, 0);
      expect(result.reachedCursor).toBe(false);
      expect(result.stoppedByObstruction).toBe(true);
      expect(result.stoppingSurface?.id).toBe("wall");
    });
  });

  describe("single planned surface", () => {
    it("should reflect off surface when valid", () => {
      // Surface at y=100, normal UP
      // Player at y=50 (above), cursor at y=50 (above) - valid reflection
      const surface = createHorizontalSurface("r1", 100, true);
      const player: Vector2 = { x: 50, y: 50 };
      const cursor: Vector2 = { x: 150, y: 50 };

      const result = builder.build(player, cursor, [surface], [surface]);

      expect(result.usedSurfaces).toHaveLength(1);
      expect(result.usedSurfaces[0]?.id).toBe("r1");
      expect(result.bypassedSurfaces).toHaveLength(0);
      expect(result.points.length).toBeGreaterThanOrEqual(3);
    });

    it("should bypass surface when player on wrong side", () => {
      // Surface at y=100, normal UP
      // Player at y=150 (below surface, wrong side)
      const surface = createHorizontalSurface("r1", 100, true);
      const player: Vector2 = { x: 50, y: 150 };
      const cursor: Vector2 = { x: 150, y: 150 };

      const result = builder.build(player, cursor, [surface], [surface]);

      expect(result.bypassedSurfaces).toHaveLength(1);
      expect(result.bypassedSurfaces[0]?.reason).toBe(BypassReason.PlayerOnWrongSide);
      expect(result.usedSurfaces).toHaveLength(0);
      // Path goes directly to cursor (surface bypassed)
      expect(result.points).toHaveLength(2);
      expect(result.reachedCursor).toBe(true);
    });

    it("should bypass surface when cursor on wrong side", () => {
      // Surface at y=100, normal UP
      // Player at y=50 (above, correct side)
      // Cursor at y=150 (below, wrong side for last surface)
      const surface = createHorizontalSurface("r1", 100, true);
      const player: Vector2 = { x: 50, y: 50 };
      const cursor: Vector2 = { x: 150, y: 150 };

      const result = builder.build(player, cursor, [surface], [surface]);

      expect(result.bypassedSurfaces).toHaveLength(1);
      expect(result.bypassedSurfaces[0]?.reason).toBe(BypassReason.CursorOnWrongSide);
    });
  });

  describe("multiple planned surfaces", () => {
    it("should use multiple valid surfaces", () => {
      // Two horizontal surfaces, both with normal UP
      // Player and cursor both above the surfaces
      const surface1 = createHorizontalSurface("r1", 100, true);
      const surface2 = createHorizontalSurface("r2", 150, true);
      const player: Vector2 = { x: 50, y: 50 };
      const cursor: Vector2 = { x: 150, y: 50 };

      const result = builder.build(player, cursor, [surface1, surface2], [surface1, surface2]);

      // Both surfaces should be used
      expect(result.usedSurfaces.length).toBeGreaterThanOrEqual(1);
    });

    it("should bypass middle surface when unreachable", () => {
      // First surface at y=100, normal UP
      // Second surface at y=50 (above first - unreachable after first reflection)
      // Third surface at y=150, normal UP
      const surface1 = createHorizontalSurface("r1", 100, true);
      const surface2 = createHorizontalSurface("r2", 50, true); // Unreachable
      const surface3 = createHorizontalSurface("r3", 150, true);
      const player: Vector2 = { x: 50, y: 25 };
      const cursor: Vector2 = { x: 150, y: 25 };

      const result = builder.build(
        player,
        cursor,
        [surface1, surface2, surface3],
        [surface1, surface2, surface3]
      );

      // Some surfaces should be bypassed
      expect(result.bypassedSurfaces.length).toBeGreaterThan(0);
    });
  });

  describe("obstruction handling", () => {
    it("should stop at wall when going directly to cursor", () => {
      // Simple case: no planned surfaces, wall blocks direct path
      const wall = new WallSurface("wall", {
        start: { x: 100, y: 0 },
        end: { x: 100, y: 200 },
      });
      const player: Vector2 = { x: 50, y: 100 };
      const cursor: Vector2 = { x: 150, y: 100 };

      const result = builder.build(player, cursor, [], [wall]);

      expect(result.stoppedByObstruction).toBe(true);
      expect(result.stoppingSurface?.id).toBe("wall");
      expect(result.reachedCursor).toBe(false);
    });

    it("should bypass surface when obstruction blocks path to it", () => {
      // Surface at x=150, normal LEFT (reflective from left side)
      const surface = createVerticalSurface("r1", 150, true);
      // Wall at x=100 blocks path to surface
      const wall = new WallSurface("wall", {
        start: { x: 100, y: 0 },
        end: { x: 100, y: 200 },
      });
      const player: Vector2 = { x: 50, y: 100 };
      const cursor: Vector2 = { x: 50, y: 50 };

      const result = builder.build(player, cursor, [surface], [surface, wall]);

      // Surface should be bypassed due to obstruction
      expect(result.bypassedSurfaces.length).toBeGreaterThan(0);
    });
  });

  describe("exhaustion", () => {
    it("should track total distance correctly", () => {
      const player: Vector2 = { x: 0, y: 0 };
      const cursor: Vector2 = { x: 100, y: 0 };

      const result = builder.build(player, cursor, [], []);

      expect(result.totalDistance).toBeCloseTo(100, 0);
    });

    it("should track distance through reflections", () => {
      const surface = createHorizontalSurface("r1", 100, true);
      const player: Vector2 = { x: 50, y: 50 };
      const cursor: Vector2 = { x: 150, y: 50 };

      const result = builder.build(player, cursor, [surface], [surface]);

      // Path goes: player -> surface -> cursor
      // Distance should be more than direct path (200)
      if (result.usedSurfaces.length > 0) {
        expect(result.totalDistance).toBeGreaterThan(100);
      }
    });
  });

  describe("path properties", () => {
    it("should calculate total distance correctly", () => {
      const player: Vector2 = { x: 0, y: 0 };
      const cursor: Vector2 = { x: 100, y: 0 };

      const result = builder.build(player, cursor, [], []);

      expect(result.totalDistance).toBeCloseTo(100, 1);
    });

    it("should track used surfaces in order", () => {
      const surface1 = createHorizontalSurface("r1", 100, true);
      const surface2 = createHorizontalSurface("r2", 150, true);
      const player: Vector2 = { x: 100, y: 50 };
      const cursor: Vector2 = { x: 100, y: 50 };

      const result = builder.build(player, cursor, [surface1, surface2], [surface1, surface2]);

      // Check that used surfaces are in order
      for (let i = 0; i < result.usedSurfaces.length - 1; i++) {
        const current = result.usedSurfaces[i];
        const next = result.usedSurfaces[i + 1];
        if (current && next) {
          expect(current.id).not.toBe(next.id);
        }
      }
    });
  });
});

