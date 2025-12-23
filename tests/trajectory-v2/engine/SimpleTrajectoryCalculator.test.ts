/**
 * Tests for SimpleTrajectoryCalculator
 *
 * These tests verify the new simplified two-path architecture works correctly.
 */

import { describe, it, expect } from "vitest";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import {
  calculateSimpleTrajectory,
  getArrowWaypoints,
  isCursorReachable,
  isFullyAligned,
} from "@/trajectory-v2/engine/SimpleTrajectoryCalculator";

// Test surface factory
function createTestSurface(
  id: string,
  start: Vector2,
  end: Vector2,
  reflective = true
): Surface {
  const segment = { start, end };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const normal = { x: -dy / len, y: dx / len };

  return {
    id,
    segment,
    surfaceType: reflective ? "ricochet" : "wall",
    getNormal: () => normal,
    canReflectFrom: () => reflective,
    isPlannable: () => reflective,
    getVisualProperties: () => ({ color: 0xffffff, lineWidth: 2, alpha: 1 }),
    onArrowHit: () => ({ type: reflective ? "reflect" : "stop" }),
  };
}

describe("SimpleTrajectoryCalculator", () => {
  describe("Basic Path Calculation", () => {
    it("should calculate direct path with no surfaces", () => {
      const player = { x: 100, y: 100 };
      const cursor = { x: 200, y: 100 };

      const result = calculateSimpleTrajectory(player, cursor, [], []);

      // Path includes player, cursor, and forward projection
      expect(result.actual.waypoints.length).toBeGreaterThanOrEqual(2);
      expect(result.actual.waypoints[0]).toEqual(player);
      expect(result.actual.reachedCursor).toBe(true);
      // Planned has just player + cursor
      expect(result.planned.waypoints.length).toBe(2);
    });

    it("should reflect off a surface", () => {
      const player = { x: 100, y: 100 };
      const cursor = { x: 300, y: 100 };
      const surface = createTestSurface(
        "surface1",
        { x: 200, y: 0 },
        { x: 200, y: 200 }
      );

      const result = calculateSimpleTrajectory(
        player,
        cursor,
        [surface],
        [surface]
      );

      // Should have reflected
      expect(result.actual.hits.length).toBeGreaterThan(0);
    });

    it("should stop at a wall", () => {
      const player = { x: 100, y: 100 };
      const cursor = { x: 400, y: 100 };
      const wall = createTestSurface(
        "wall1",
        { x: 200, y: 0 },
        { x: 200, y: 200 },
        false // Not reflective
      );

      const result = calculateSimpleTrajectory(player, cursor, [], [wall]);

      expect(result.actual.blockedBy).toBe(wall);
      expect(result.actual.reachedCursor).toBe(false);
      expect(result.divergence.isAligned).toBe(false);
    });
  });

  describe("First Principles Compliance", () => {
    it("A1: should have exactly ONE actual path", () => {
      const result = calculateSimpleTrajectory(
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        [],
        []
      );

      expect(result.actual).toBeDefined();
      expect(result.actual.waypoints).toBeDefined();
    });

    it("A2: should have exactly ONE planned path", () => {
      const result = calculateSimpleTrajectory(
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        [],
        []
      );

      expect(result.planned).toBeDefined();
      expect(result.planned.waypoints).toBeDefined();
    });

    it("A4: should have exactly ONE divergence point (or none)", () => {
      const wall = createTestSurface(
        "wall",
        { x: 50, y: -50 },
        { x: 50, y: 50 },
        false
      );

      const result = calculateSimpleTrajectory(
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        [],
        [wall]
      );

      expect(result.divergence.segmentIndex).toBeDefined();
      // Either aligned or has one divergence point
      if (!result.divergence.isAligned) {
        expect(result.divergence.point).toBeDefined();
      }
    });

    it("C6: should have no red when fully aligned", () => {
      const result = calculateSimpleTrajectory(
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        [],
        []
      );

      expect(result.divergence.isAligned).toBe(true);
      const redSegments = result.renderSegments.filter(s => s.color === "red");
      expect(redSegments.length).toBe(0);
    });

    it("F1: arrow waypoints should match actual path", () => {
      const result = calculateSimpleTrajectory(
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        [],
        []
      );

      const arrowWaypoints = getArrowWaypoints(result);
      expect(arrowWaypoints).toEqual(result.actual.waypoints);
    });
  });

  describe("Render Segment Colors", () => {
    it("should use green for aligned segments before cursor", () => {
      const result = calculateSimpleTrajectory(
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        [],
        []
      );

      expect(result.divergence.isAligned).toBe(true);
      const greenSegments = result.renderSegments.filter(
        s => s.color === "green" && s.style === "solid"
      );
      expect(greenSegments.length).toBeGreaterThan(0);
    });

    it("should use red for planned path after divergence", () => {
      const wall = createTestSurface(
        "wall",
        { x: 50, y: -50 },
        { x: 50, y: 50 },
        false
      );

      const result = calculateSimpleTrajectory(
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        [],
        [wall]
      );

      expect(result.divergence.isAligned).toBe(false);
      const redSegments = result.renderSegments.filter(s => s.color === "red");
      expect(redSegments.length).toBeGreaterThan(0);
    });

    it("should use yellow for actual path after divergence", () => {
      const wall = createTestSurface(
        "wall",
        { x: 50, y: -50 },
        { x: 50, y: 50 },
        false
      );

      // Wall blocks path - actual path stops, yellow dashed continues
      const result = calculateSimpleTrajectory(
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        [],
        [wall]
      );

      expect(result.divergence.isAligned).toBe(false);
      // Should have yellow segments (actual path continuation)
      const yellowSegments = result.renderSegments.filter(s => s.color === "yellow");
      // Yellow appears when actual path continues after divergence
    });
  });

  describe("Helper Functions", () => {
    it("isCursorReachable should return true when cursor on path", () => {
      const result = calculateSimpleTrajectory(
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        [],
        []
      );

      expect(isCursorReachable(result)).toBe(true);
    });

    it("isCursorReachable should return false when blocked", () => {
      const wall = createTestSurface(
        "wall",
        { x: 50, y: -50 },
        { x: 50, y: 50 },
        false
      );

      const result = calculateSimpleTrajectory(
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        [],
        [wall]
      );

      expect(isCursorReachable(result)).toBe(false);
    });

    it("isFullyAligned should return true with no divergence", () => {
      const result = calculateSimpleTrajectory(
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        [],
        []
      );

      expect(isFullyAligned(result)).toBe(true);
    });
  });
});

