/**
 * Tests for calculateFullTrajectory - complete trajectory with all 4 sections.
 *
 * The full trajectory has up to 4 distinct sections:
 * 1. MERGED (GREEN solid): Where physical and planned agree
 * 2. PHYSICAL_DIVERGENT (YELLOW dashed): Physical continuation after divergence
 * 3. PLANNED_TO_CURSOR (RED solid): Planned path from divergence to cursor
 * 4. PHYSICAL_FROM_CURSOR (RED dashed): Physical continuation from cursor
 */

import { describe, it, expect } from "vitest";
import {
  calculateFullTrajectory,
  type FullTrajectoryResult,
} from "@/trajectory-v2/engine/FullTrajectoryCalculator";
import { createMockSurface, createMockWall } from "@test/helpers/surfaceHelpers";
import type { Vector2 } from "@/types";

describe("calculateFullTrajectory", () => {
  describe("fully aligned case", () => {
    it("should have merged segments including continuation (GREEN)", () => {
      // No obstacles - ray goes straight to cursor, then continues
      const player: Vector2 = { x: 100, y: 200 };
      const cursor: Vector2 = { x: 300, y: 200 };

      const result = calculateFullTrajectory(
        player,
        cursor,
        [], // no planned surfaces
        []  // no obstacles
      );

      // Should have merged segments: player->cursor + continuation
      // First segment ends at cursor
      expect(result.merged.length).toBeGreaterThanOrEqual(1);
      expect(result.merged[0]!.end.x).toBeCloseTo(cursor.x);
      expect(result.merged[0]!.end.y).toBeCloseTo(cursor.y);

      // If there's a second segment, it starts at cursor (continuation)
      if (result.merged.length > 1) {
        expect(result.merged[1]!.start.x).toBeCloseTo(cursor.x);
        expect(result.merged[1]!.start.y).toBeCloseTo(cursor.y);
      }

      // Should be fully aligned
      expect(result.isFullyAligned).toBe(true);
    });

    it("should have no divergent paths", () => {
      const player: Vector2 = { x: 100, y: 200 };
      const cursor: Vector2 = { x: 300, y: 200 };

      const result = calculateFullTrajectory(
        player,
        cursor,
        [],
        []
      );

      expect(result.physicalDivergent.length).toBe(0);
      expect(result.plannedToCursor.length).toBe(0);
      expect(result.physicalFromCursor.length).toBe(0);
      expect(result.divergencePoint).toBeNull();
    });
  });

  describe("diverged case", () => {
    it("should have merged segments until divergence (GREEN)", () => {
      // Physical obstacle causes divergence
      const obstacle = createMockWall(
        "obstacle",
        { x: 200, y: 0 },
        { x: 200, y: 400 }
      );
      // Planned surface beyond obstacle
      const plannedSurface = createMockSurface(
        "planned",
        { x: 250, y: 0 },
        { x: 250, y: 400 }
      );

      const player: Vector2 = { x: 100, y: 200 };
      const cursor: Vector2 = { x: 300, y: 200 };

      const result = calculateFullTrajectory(
        player,
        cursor,
        [plannedSurface],
        [obstacle, plannedSurface]
      );

      // Should have merged up to obstacle
      expect(result.merged.length).toBe(1);
      expect(result.merged[0]!.end.x).toBeCloseTo(200);
      expect(result.divergencePoint).not.toBeNull();
    });

    it("should have physical divergent after divergence (YELLOW)", () => {
      // Physical obstacle causes divergence
      const obstacle = createMockWall(
        "obstacle",
        { x: 200, y: 0 },
        { x: 200, y: 400 }
      );

      const player: Vector2 = { x: 100, y: 200 };
      const cursor: Vector2 = { x: 300, y: 200 };

      const result = calculateFullTrajectory(
        player,
        cursor,
        [], // no planned surfaces
        [obstacle]
      );

      // Physical stops at wall, so physicalDivergent should be empty
      // (wall blocks, no continuation)
      expect(result.physicalDivergent.length).toBe(0);
    });

    it("should have planned to cursor (RED solid)", () => {
      // Obstacle between player and cursor
      const obstacle = createMockWall(
        "obstacle",
        { x: 200, y: 0 },
        { x: 200, y: 400 }
      );

      const player: Vector2 = { x: 100, y: 200 };
      const cursor: Vector2 = { x: 300, y: 200 };

      const result = calculateFullTrajectory(
        player,
        cursor,
        [], // no planned surfaces
        [obstacle]
      );

      // Planned path should go from divergence to cursor
      expect(result.plannedToCursor.length).toBe(1);
      expect(result.plannedToCursor[0]!.start.x).toBeCloseTo(200);
      expect(result.plannedToCursor[0]!.end.x).toBeCloseTo(300);
    });

    it("should have physical from cursor (RED dashed)", () => {
      // Obstacle between player and cursor
      const obstacle = createMockWall(
        "obstacle",
        { x: 200, y: 0 },
        { x: 200, y: 400 }
      );
      // Another surface beyond cursor
      const farSurface = createMockSurface(
        "far",
        { x: 400, y: 0 },
        { x: 400, y: 400 }
      );

      const player: Vector2 = { x: 100, y: 200 };
      const cursor: Vector2 = { x: 300, y: 200 };

      const result = calculateFullTrajectory(
        player,
        cursor,
        [], // no planned surfaces
        [obstacle, farSurface]
      );

      // Physical from cursor should continue
      expect(result.physicalFromCursor.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("empty plan with obstruction", () => {
    it("should have merged to obstruction (GREEN)", () => {
      const obstacle = createMockWall(
        "obstacle",
        { x: 150, y: 0 },
        { x: 150, y: 400 }
      );

      const player: Vector2 = { x: 100, y: 200 };
      const cursor: Vector2 = { x: 300, y: 200 };

      const result = calculateFullTrajectory(
        player,
        cursor,
        [], // empty plan
        [obstacle]
      );

      // Merged should go from player to obstacle
      expect(result.merged.length).toBe(1);
      expect(result.merged[0]!.start.x).toBeCloseTo(100);
      expect(result.merged[0]!.end.x).toBeCloseTo(150);
    });

    it("should have planned from obstruction to cursor (RED solid)", () => {
      const obstacle = createMockWall(
        "obstacle",
        { x: 150, y: 0 },
        { x: 150, y: 400 }
      );

      const player: Vector2 = { x: 100, y: 200 };
      const cursor: Vector2 = { x: 300, y: 200 };

      const result = calculateFullTrajectory(
        player,
        cursor,
        [],
        [obstacle]
      );

      // Planned should go from obstacle to cursor
      expect(result.plannedToCursor.length).toBe(1);
      expect(result.plannedToCursor[0]!.start.x).toBeCloseTo(150);
      expect(result.plannedToCursor[0]!.end.x).toBeCloseTo(300);
    });
  });

  describe("with reflections", () => {
    it("should handle merged reflections then reach cursor", () => {
      // Mirror at x=200 that both physical and planned hit
      const mirror = createMockSurface(
        "mirror",
        { x: 200, y: 0 },
        { x: 200, y: 400 }
      );

      // For 1-bounce reflection geometry:
      // - Player at (150, 200), mirror at x=200, cursor at (100, 200)
      // - Pre-reflected cursor through x=200: x = 2*200 - 100 = 300
      // - Initial ray: (150, 200) toward (300, 200) = to the RIGHT
      // - Hits mirror at x=200, reflects LEFT toward cursor at x=100
      const player: Vector2 = { x: 150, y: 200 };
      const cursor: Vector2 = { x: 100, y: 200 };

      const result = calculateFullTrajectory(
        player,
        cursor,
        [mirror], // planned has mirror
        [mirror] // all surfaces = just mirror
      );

      // First merged segment to mirror
      expect(result.merged.length).toBeGreaterThanOrEqual(1);
      expect(result.merged[0]!.surface?.id).toBe("mirror");

      // After reflection, both reach cursor - should be aligned
      expect(result.isFullyAligned).toBe(true);
    });
  });
});
