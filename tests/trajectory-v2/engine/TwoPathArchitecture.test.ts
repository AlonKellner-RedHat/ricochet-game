/**
 * Tests for the Two-Path Architecture
 *
 * These tests verify the new architecture components work correctly together.
 */

import { describe, it, expect } from "vitest";
import type { Vector2, LineSegment } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import { calculatePlannedPath } from "@/trajectory-v2/engine/PlannedPathCalculator";
import { findDivergence, type PathForComparison } from "@/trajectory-v2/engine/DivergenceDetector";
import { renderDualPath, type RenderablePath, type DivergenceForRender } from "@/trajectory-v2/engine/DualPathRenderer";

// Test surface factory
function createTestSurface(
  id: string,
  start: Vector2,
  end: Vector2,
  reflective = true
): Surface {
  const segment: LineSegment = { start, end };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const normal = { x: -dy / len, y: dx / len };

  return {
    id,
    segment,
    getNormal: () => normal,
    canReflectFrom: () => reflective,
  };
}

describe("Two-Path Architecture Integration", () => {
  describe("End-to-End Flow", () => {
    it("should calculate planned path, find divergence, and render", () => {
      const player = { x: 100, y: 100 };
      const cursor = { x: 200, y: 100 };

      // 1. Calculate planned path
      const planned = calculatePlannedPath(player, cursor, []);

      expect(planned.waypoints.length).toBe(2);
      expect(planned.waypoints[0]).toEqual(player);
      expect(planned.waypoints[1]).toEqual(cursor);

      // 2. Simulate actual path (same as planned for this simple case)
      const actualWaypoints = [player, cursor];

      // 3. Find divergence
      const actualForComparison: PathForComparison = { waypoints: actualWaypoints };
      const plannedForComparison: PathForComparison = { waypoints: planned.waypoints };
      const divergence = findDivergence(actualForComparison, plannedForComparison);

      expect(divergence.isAligned).toBe(true);

      // 4. Create renderable paths
      const actualRenderable: RenderablePath = {
        waypoints: actualWaypoints,
        cursorIndex: 0,
        cursorT: 1,
      };

      const plannedRenderable: RenderablePath = {
        waypoints: planned.waypoints,
        cursorIndex: 0,
        cursorT: 1,
      };

      // 5. Render
      const segments = renderDualPath(actualRenderable, plannedRenderable, divergence, cursor);

      expect(segments.length).toBeGreaterThan(0);
      // All segments should be green when aligned
      const redSegments = segments.filter(s => s.color === "red");
      expect(redSegments.length).toBe(0);
    });

    it("should show red when paths diverge", () => {
      const player = { x: 100, y: 100 };
      const cursor = { x: 300, y: 100 };

      // Planned path with reflection
      const surface = createTestSurface(
        "surface1",
        { x: 200, y: 0 },
        { x: 200, y: 200 }
      );

      // 1. Calculate planned path (reflects off surface)
      const planned = calculatePlannedPath(player, cursor, [surface]);

      // 2. Simulate actual path (blocked before reaching surface)
      const actualWaypoints = [player, { x: 150, y: 100 }]; // Stopped early

      // 3. Find divergence
      const actualForComparison: PathForComparison = { waypoints: actualWaypoints };
      const plannedForComparison: PathForComparison = { waypoints: planned.waypoints };
      const divergence = findDivergence(actualForComparison, plannedForComparison);

      expect(divergence.isAligned).toBe(false);

      // 4. Create renderable paths
      const actualRenderable: RenderablePath = {
        waypoints: actualWaypoints,
        cursorIndex: -1, // Cursor not on actual path
        cursorT: 0,
      };

      const plannedRenderable: RenderablePath = {
        waypoints: planned.waypoints,
        cursorIndex: planned.cursorIndex,
        cursorT: planned.cursorT,
      };

      // 5. Render
      const segments = renderDualPath(actualRenderable, plannedRenderable, divergence, cursor);

      // Should have red segments (planned path after divergence)
      const redSegments = segments.filter(s => s.color === "red");
      expect(redSegments.length).toBeGreaterThan(0);

      // Should have yellow segments (actual path after divergence)
      const yellowSegments = segments.filter(s => s.color === "yellow");
      expect(yellowSegments.length).toBeGreaterThan(0);
    });
  });

  describe("First Principle: No Red When Aligned (C6)", () => {
    it("should have no red segments when paths are aligned", () => {
      const player = { x: 0, y: 0 };
      const cursor = { x: 100, y: 0 };

      const planned = calculatePlannedPath(player, cursor, []);
      const actualWaypoints = planned.waypoints.slice();

      const divergence = findDivergence(
        { waypoints: actualWaypoints },
        { waypoints: planned.waypoints }
      );

      const segments = renderDualPath(
        { waypoints: actualWaypoints, cursorIndex: 0, cursorT: 1 },
        { waypoints: planned.waypoints, cursorIndex: 0, cursorT: 1 },
        divergence,
        cursor
      );

      const redSegments = segments.filter(s => s.color === "red");
      expect(redSegments.length).toBe(0);
    });
  });

  describe("First Principle: Green Before Divergence (C1)", () => {
    it("should have green segments before divergence point", () => {
      const player = { x: 0, y: 0 };
      const cursor = { x: 200, y: 0 };

      // Planned path: direct line
      const planned = calculatePlannedPath(player, cursor, []);

      // Actual path: diverges at x=100
      const actualWaypoints = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 150, y: 50 }, // Diverges
      ];

      const divergence = findDivergence(
        { waypoints: actualWaypoints },
        { waypoints: planned.waypoints }
      );

      expect(divergence.isAligned).toBe(false);

      const segments = renderDualPath(
        { waypoints: actualWaypoints, cursorIndex: -1, cursorT: 0 },
        { waypoints: planned.waypoints, cursorIndex: 0, cursorT: 1 },
        divergence,
        cursor
      );

      // Should have at least one green segment
      const greenSegments = segments.filter(s => s.color === "green");
      expect(greenSegments.length).toBeGreaterThan(0);
    });
  });
});

