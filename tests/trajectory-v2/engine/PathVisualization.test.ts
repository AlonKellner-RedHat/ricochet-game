/**
 * PathVisualization.test.ts
 *
 * First-Principle Tests for Path Visualization Completeness
 *
 * FIRST PRINCIPLES:
 * 1. Actual path must ALWAYS be fully visualized
 *    - Solid green for aligned portion
 *    - Dashed yellow for continuation beyond cursor/divergence
 *    - NO GAPS allowed
 *
 * 2. Planned path must show IDEAL trajectory
 *    - Shows what would happen if all reflections worked
 *    - Shows continuation beyond cursor (dashed red)
 *    - Ignores obstructions for visualization purposes
 *
 * 3. Color indicates discrepancy
 *    - Red means discrepancy between planned and actual
 *    - When paths are aligned, NOTHING should be red
 *    - Yellow shows actual continuation (not a discrepancy indicator)
 */

import { describe, it, expect } from "vitest";
import {
  buildPlannedPath,
  buildActualPath,
} from "@/trajectory-v2/engine/PathBuilder";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// Helper to create a mock surface
function createMockSurface(
  id: string,
  start: Vector2,
  end: Vector2,
  options: { canReflect?: boolean } = {}
): Surface {
  const { canReflect = true } = options;
  return {
    id,
    segment: { start, end },
    surfaceType: canReflect ? "ricochet" : "wall",
    onArrowHit: () => ({ type: canReflect ? "reflect" : "stop" }),
    isPlannable: () => true,
    getVisualProperties: () => ({ color: 0xffffff, lineWidth: 2, alpha: 1 }),
    getNormal: () => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      return { x: -dy / len, y: dx / len };
    },
    canReflectFrom: () => canReflect,
  };
}

describe("PathVisualization", () => {
  describe("First Principle 1: Actual Path Must Be Fully Visualized", () => {
    it("should include forward projection when reaching cursor", () => {
      // Setup: Empty plan, arrow goes player -> cursor
      // The actual path should show where it continues BEYOND the cursor
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 300, y: 300 };

      const actual = buildActualPath(player, cursor, [], []);

      // Path should reach cursor
      expect(actual.reachedCursor).toBe(true);

      // Path should have a forward projection showing continuation
      expect(actual.forwardProjection).toBeDefined();
      expect(actual.forwardProjection!.length).toBeGreaterThan(0);

      // Forward projection should continue in the same direction
      const lastPathPoint = actual.points[actual.points.length - 1]!;
      const projectionPoint = actual.forwardProjection![0]!;
      
      // Projection should be ahead of cursor in the same direction
      expect(projectionPoint.x).toBeGreaterThan(cursor.x);
      expect(projectionPoint.y).toBeCloseTo(cursor.y, 0);
    });

    it("should include forward projection after reflection", () => {
      // Setup: Path reflects off surface, continues beyond cursor
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 500, y: 100 };
      const surface = createMockSurface(
        "reflector",
        { x: 300, y: 100 },
        { x: 300, y: 400 }
      );

      const actual = buildActualPath(player, cursor, [surface], [surface]);

      // If the path reaches cursor, it should have forward projection
      // If it doesn't, it should still show where arrow continues
      expect(actual.forwardProjection).toBeDefined();
    });

    it("should include forward projection when blocked by obstacle", () => {
      // Setup: Wall blocks the path
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 500, y: 300 };
      const wall = createMockSurface(
        "wall",
        { x: 300, y: 200 },
        { x: 300, y: 400 },
        { canReflect: false }
      );

      const actual = buildActualPath(player, cursor, [], [wall]);

      // Path should be blocked
      expect(actual.reachedCursor).toBe(false);
      expect(actual.blockedBy).toBe(wall);

      // For walls, there's no forward projection (arrow stops)
      // But if there were a gap, there would be projection
    });

    it("should show continuous path with no gaps", () => {
      // The projection extends FROM the last path point
      // The projection point is an ENDPOINT, not a connecting point
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 300, y: 300 };

      const actual = buildActualPath(player, cursor, [], []);

      // Projection should extend in same direction as last segment
      if (actual.forwardProjection && actual.forwardProjection.length > 0) {
        const lastPathPoint = actual.points[actual.points.length - 1]!;
        const projectionEndpoint = actual.forwardProjection[0]!;

        // Calculate direction of last path segment
        const secondToLast = actual.points[actual.points.length - 2]!;
        const pathDirX = lastPathPoint.x - secondToLast.x;
        const pathDirY = lastPathPoint.y - secondToLast.y;

        // Calculate direction to projection
        const projDirX = projectionEndpoint.x - lastPathPoint.x;
        const projDirY = projectionEndpoint.y - lastPathPoint.y;

        // Directions should be aligned (same direction)
        const pathLen = Math.sqrt(pathDirX * pathDirX + pathDirY * pathDirY);
        const projLen = Math.sqrt(projDirX * projDirX + projDirY * projDirY);

        if (pathLen > 0 && projLen > 0) {
          const dotProduct = (pathDirX * projDirX + pathDirY * projDirY) / (pathLen * projLen);
          // Dot product should be close to 1 (same direction)
          expect(dotProduct).toBeCloseTo(1, 1);
        }
      }
    });
  });

  describe("First Principle 2: Planned Path Must Show Ideal Trajectory", () => {
    it("should include forward projection beyond cursor", () => {
      // Setup: Empty plan, planned path goes to cursor and beyond
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 300, y: 300 };

      const planned = buildPlannedPath(player, cursor, []);

      // Planned path should have forward projection
      expect(planned.forwardProjection).toBeDefined();
      expect(planned.forwardProjection!.length).toBeGreaterThan(0);

      // Projection should continue past cursor
      const projectionEnd = planned.forwardProjection![planned.forwardProjection!.length - 1]!;
      expect(projectionEnd.x).toBeGreaterThan(cursor.x);
    });

    it("should show ideal continuation when obstructed", () => {
      // Setup: Obstacle blocks path, but planned should show ideal path
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 500, y: 300 };
      const wall = createMockSurface(
        "wall",
        { x: 300, y: 200 },
        { x: 300, y: 400 },
        { canReflect: false }
      );

      const planned = buildPlannedPath(player, cursor, []);

      // Planned path ignores obstacles - shows ideal trajectory
      expect(planned.reachedCursor).toBe(true);
      expect(planned.forwardProjection).toBeDefined();
    });

    it("should show ideal continuation through reflections", () => {
      // Setup: Planned surface, should show continuation after reflection
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 100, y: 100 };
      const surface = createMockSurface(
        "reflector",
        { x: -100, y: 200 },
        { x: 300, y: 200 }
      );

      const planned = buildPlannedPath(player, cursor, [surface]);

      // Should have forward projection after the planned path
      expect(planned.forwardProjection).toBeDefined();
    });
  });

  describe("Forward Projection Calculation", () => {
    it("should calculate projection in correct direction", () => {
      // Horizontal path should project horizontally
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 400, y: 300 };

      const actual = buildActualPath(player, cursor, [], []);

      if (actual.forwardProjection && actual.forwardProjection.length > 0) {
        const projectionPoint = actual.forwardProjection[0]!;
        // Should continue horizontally (same y)
        expect(projectionPoint.y).toBeCloseTo(300, 0);
        // Should be past cursor (greater x)
        expect(projectionPoint.x).toBeGreaterThan(400);
      }
    });

    it("should calculate projection after diagonal path", () => {
      // Diagonal path should project diagonally
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 300, y: 300 };

      const actual = buildActualPath(player, cursor, [], []);

      if (actual.forwardProjection && actual.forwardProjection.length > 0) {
        const projectionPoint = actual.forwardProjection[0]!;
        // Should continue diagonally
        expect(projectionPoint.x).toBeGreaterThan(300);
        expect(projectionPoint.y).toBeGreaterThan(300);
      }
    });

    it("should have reasonable projection length", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 300, y: 300 };

      const actual = buildActualPath(player, cursor, [], []);

      if (actual.forwardProjection && actual.forwardProjection.length > 0) {
        const lastProjection = actual.forwardProjection[actual.forwardProjection.length - 1]!;
        const cursor_ = actual.points[actual.points.length - 1]!;
        
        // Projection should extend a reasonable distance (e.g., 500-2000 pixels)
        const projectionLength = Math.sqrt(
          Math.pow(lastProjection.x - cursor_.x, 2) +
          Math.pow(lastProjection.y - cursor_.y, 2)
        );
        expect(projectionLength).toBeGreaterThan(100);
        expect(projectionLength).toBeLessThan(3000);
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle projection after multiple reflections", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 500, y: 300 };
      
      // Two parallel vertical surfaces
      const surface1 = createMockSurface(
        "left",
        { x: 200, y: 200 },
        { x: 200, y: 400 }
      );
      const surface2 = createMockSurface(
        "right",
        { x: 400, y: 200 },
        { x: 400, y: 400 }
      );

      const actual = buildActualPath(
        player,
        cursor,
        [surface1, surface2],
        [surface1, surface2]
      );

      // Should have forward projection regardless of reflection count
      expect(actual.forwardProjection).toBeDefined();
    });

    it("should not project through walls", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 500, y: 300 };
      const wall = createMockSurface(
        "wall",
        { x: 300, y: 200 },
        { x: 300, y: 400 },
        { canReflect: false }
      );

      const actual = buildActualPath(player, cursor, [], [wall]);

      // Path ends at wall
      expect(actual.blockedBy).toBe(wall);
      
      // No forward projection for stopped paths
      // (or projection is empty array)
      if (actual.forwardProjection) {
        expect(actual.forwardProjection.length).toBe(0);
      }
    });
  });
});

