/**
 * Tests for BypassChecker - determines when a planned surface should be bypassed
 *
 * Bypass Rules:
 * 1. Player on wrong side → Skip surface (can't reach reflective side)
 * 2. Reflection point on wrong side of NEXT surface → Skip next surface
 * 3. Obstruction between current point and surface → Skip surface
 * 4. Cursor on wrong side (for last surface) → Skip surface
 * 5. Path length exceeded → Treat as obstruction, stop
 */

import { describe, expect, it } from "vitest";
import { BypassChecker, BypassReason } from "@/trajectory/BypassChecker";
import { RicochetSurface, WallSurface } from "@/surfaces";
import type { Surface } from "@/surfaces";
import type { Vector2 } from "@/types";

describe("BypassChecker", () => {
  const checker = new BypassChecker();

  // Helper to create surfaces with predictable normals
  // Segment (0,0) to (100,0) has normal pointing DOWN (0, 1)
  // Segment (100,0) to (0,0) has normal pointing UP (0, -1)
  function createHorizontalSurface(id: string, y: number, normalUp: boolean): RicochetSurface {
    return normalUp
      ? new RicochetSurface(id, { start: { x: 100, y }, end: { x: 0, y } })
      : new RicochetSurface(id, { start: { x: 0, y }, end: { x: 100, y } });
  }

  function createVerticalSurface(id: string, x: number, normalLeft: boolean): RicochetSurface {
    return normalLeft
      ? new RicochetSurface(id, { start: { x, y: 0 }, end: { x, y: 100 } })
      : new RicochetSurface(id, { start: { x, y: 100 }, end: { x, y: 0 } });
  }

  describe("Rule 1: Player on wrong side", () => {
    it("should NOT bypass when player is on reflective side", () => {
      // Surface at y=50, normal pointing UP
      // Player at y=0 (above surface, on normal side)
      const surface = createHorizontalSurface("r1", 50, true);
      const player: Vector2 = { x: 50, y: 0 };

      const result = checker.checkPlayerSide(player, surface);

      expect(result.shouldBypass).toBe(false);
    });

    it("should bypass when player is on blocking side", () => {
      // Surface at y=50, normal pointing UP
      // Player at y=100 (below surface, opposite of normal)
      const surface = createHorizontalSurface("r1", 50, true);
      const player: Vector2 = { x: 50, y: 100 };

      const result = checker.checkPlayerSide(player, surface);

      expect(result.shouldBypass).toBe(true);
      expect(result.reason).toBe(BypassReason.PlayerOnWrongSide);
    });
  });

  describe("Rule 2: Reflection point on wrong side of next surface", () => {
    it("should NOT bypass when reflection point can reach next surface", () => {
      // First surface at y=50, normal UP
      // Second surface at y=100, normal UP
      // Reflection at (50, 50) should be able to reach second surface from above
      const surface1 = createHorizontalSurface("r1", 50, true);
      const surface2 = createHorizontalSurface("r2", 100, true);
      const reflectionPoint: Vector2 = { x: 50, y: 50 };

      const result = checker.checkReflectionReachesNext(reflectionPoint, surface1, surface2);

      expect(result.shouldBypass).toBe(false);
    });

    it("should bypass next surface when reflection point is on wrong side", () => {
      // First surface at y=50, normal UP
      // Second surface at y=25, normal UP (above the first surface!)
      // Reflection at (50, 50) can't reach second surface from reflective side
      const surface1 = createHorizontalSurface("r1", 50, true);
      const surface2 = createHorizontalSurface("r2", 25, true);
      const reflectionPoint: Vector2 = { x: 50, y: 50 };

      const result = checker.checkReflectionReachesNext(reflectionPoint, surface1, surface2);

      expect(result.shouldBypass).toBe(true);
      expect(result.reason).toBe(BypassReason.ReflectionOnWrongSide);
    });
  });

  describe("Rule 3: Obstruction between current point and surface", () => {
    it("should NOT bypass when path is clear", () => {
      const surface = createHorizontalSurface("r1", 100, true);
      const currentPoint: Vector2 = { x: 50, y: 0 };
      const targetPoint: Vector2 = { x: 50, y: 100 };
      const allSurfaces: Surface[] = [surface];

      const result = checker.checkObstruction(currentPoint, targetPoint, surface, allSurfaces);

      expect(result.shouldBypass).toBe(false);
    });

    it("should bypass when wall blocks the path", () => {
      const targetSurface = createHorizontalSurface("r1", 100, true);
      const wall = new WallSurface("wall", { start: { x: 0, y: 50 }, end: { x: 100, y: 50 } });
      const currentPoint: Vector2 = { x: 50, y: 0 };
      const targetPoint: Vector2 = { x: 50, y: 100 };
      const allSurfaces: Surface[] = [targetSurface, wall];

      const result = checker.checkObstruction(currentPoint, targetPoint, targetSurface, allSurfaces);

      expect(result.shouldBypass).toBe(true);
      expect(result.reason).toBe(BypassReason.Obstructed);
      expect(result.obstructingSurface?.id).toBe("wall");
    });

    it("should bypass when ricochet surface blocks from wrong side", () => {
      const targetSurface = createHorizontalSurface("target", 100, true);
      // Blocker at y=50, normal pointing DOWN (arrow coming from above hits blocking side)
      const blocker = createHorizontalSurface("blocker", 50, false);
      const currentPoint: Vector2 = { x: 50, y: 0 };
      const targetPoint: Vector2 = { x: 50, y: 100 };
      const allSurfaces: Surface[] = [targetSurface, blocker];

      const result = checker.checkObstruction(currentPoint, targetPoint, targetSurface, allSurfaces);

      expect(result.shouldBypass).toBe(true);
      expect(result.reason).toBe(BypassReason.Obstructed);
    });
  });

  describe("Rule 4: Cursor on wrong side of last surface", () => {
    it("should NOT bypass when cursor is on correct side for reflection", () => {
      // Surface at y=50, normal UP
      // Cursor at y=0 (above surface, same side as player would need to be)
      const surface = createHorizontalSurface("r1", 50, true);
      const cursor: Vector2 = { x: 50, y: 0 };

      const result = checker.checkCursorSide(cursor, surface);

      expect(result.shouldBypass).toBe(false);
    });

    it("should bypass when cursor is on wrong side", () => {
      // Surface at y=50, normal UP
      // Cursor at y=100 (below surface)
      // For a reflection to work, cursor needs to be reachable after bounce
      const surface = createHorizontalSurface("r1", 50, true);
      const cursor: Vector2 = { x: 50, y: 100 };

      const result = checker.checkCursorSide(cursor, surface);

      expect(result.shouldBypass).toBe(true);
      expect(result.reason).toBe(BypassReason.CursorOnWrongSide);
    });
  });

  describe("Rule 5: Path length exceeded", () => {
    it("should NOT bypass when within exhaustion limit", () => {
      const currentDistance = 5000;
      const exhaustionLimit = 10000;

      const result = checker.checkExhaustion(currentDistance, exhaustionLimit);

      expect(result.shouldBypass).toBe(false);
    });

    it("should bypass when path length exceeded", () => {
      const currentDistance = 12000;
      const exhaustionLimit = 10000;

      const result = checker.checkExhaustion(currentDistance, exhaustionLimit);

      expect(result.shouldBypass).toBe(true);
      expect(result.reason).toBe(BypassReason.Exhausted);
    });
  });

  describe("Combined check", () => {
    it("should return first applicable bypass reason", () => {
      // Surface with player on wrong side - should fail immediately
      const surface = createHorizontalSurface("r1", 50, true);
      const player: Vector2 = { x: 50, y: 100 }; // Wrong side
      const cursor: Vector2 = { x: 50, y: 0 };

      const result = checker.shouldBypassSurface({
        surface,
        player,
        cursor,
        currentPoint: player,
        currentDistance: 0,
        exhaustionLimit: 10000,
        allSurfaces: [surface],
        isLastSurface: true,
        nextSurface: null,
      });

      expect(result.shouldBypass).toBe(true);
      expect(result.reason).toBe(BypassReason.PlayerOnWrongSide);
    });
  });
});

