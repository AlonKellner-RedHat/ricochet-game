/**
 * Off-Segment Reflection Tests
 *
 * These tests verify that planned surfaces with off-segment reflection points
 * still cause the path to reflect off the extended line.
 *
 * First Principles:
 * - All non-bypassed elements of the plan must apply to the planned path
 * - When a surface is planned but the reflection point is off the segment,
 *   the path must still be reflected off the extended line
 * - All aligned sections of the planned path and the actual path must be
 *   visualized as solid-green
 */

import { describe, it, expect } from "vitest";
import { rayLineIntersect } from "@/trajectory-v2/engine/ValidityChecker";
import { tracePhysicalPath } from "@/trajectory-v2/engine/PathBuilder";
import { evaluateBypass } from "@/trajectory-v2/engine/BypassEvaluator";
import { deriveRender } from "@/trajectory-v2/engine/RenderDeriver";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2, LineSegment } from "@/trajectory-v2/geometry/types";

/**
 * Create a test surface (mock).
 */
function createTestSurface(
  id: string,
  start: Vector2,
  end: Vector2,
  canReflect = true
): Surface {
  const segment: LineSegment = { start, end };
  
  // Calculate normal (perpendicular to segment, pointing "left" of start→end)
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const normal = { x: -dy / len, y: dx / len };
  
  return {
    id,
    segment,
    getNormal: () => normal,
    canReflectFrom: () => canReflect,
  };
}

/**
 * Create a vertical surface at x position, spanning from yStart to yEnd.
 * Normal points LEFT (negative X direction).
 */
function createVerticalSurface(id: string, x: number, yStart: number, yEnd: number): Surface {
  return createTestSurface(
    id,
    { x, y: yStart },
    { x, y: yEnd }
  );
}

/**
 * Create a horizontal surface at y position, spanning from xStart to xEnd.
 * Normal points UP (negative Y direction).
 */
function createHorizontalSurface(id: string, y: number, xStart: number, xEnd: number): Surface {
  return createTestSurface(
    id,
    { x: xStart, y },
    { x: xEnd, y }
  );
}

describe("Off-Segment Reflection", () => {
  describe("rayLineIntersect - Unit Tests", () => {
    it("should find intersection with extended line when off segment", () => {
      // Vertical surface at x=200, segment from y=150 to y=250
      const surface = createVerticalSurface("v1", 200, 150, 250);
      
      // Player at (100, 400), direction toward (300, 500) normalized
      const from: Vector2 = { x: 100, y: 400 };
      const dx = 300 - 100;
      const dy = 500 - 400;
      const len = Math.sqrt(dx * dx + dy * dy);
      const direction: Vector2 = { x: dx / len, y: dy / len };
      
      const result = rayLineIntersect(from, direction, surface);
      
      expect(result).not.toBeNull();
      expect(result!.point.x).toBeCloseTo(200, 0);
      // At x=200: y = 400 + (100/200) * 100 = 450
      expect(result!.point.y).toBeCloseTo(450, 0);
      expect(result!.isOnSegment).toBe(false); // 450 is outside [150, 250]
    });

    it("should find intersection with extended line when on segment", () => {
      // Vertical surface at x=200, segment from y=150 to y=250
      const surface = createVerticalSurface("v1", 200, 150, 250);
      
      // Player at (100, 200), direction toward (300, 200) normalized
      const from: Vector2 = { x: 100, y: 200 };
      const direction: Vector2 = { x: 1, y: 0 }; // Horizontal direction
      
      const result = rayLineIntersect(from, direction, surface);
      
      expect(result).not.toBeNull();
      expect(result!.point.x).toBeCloseTo(200, 0);
      expect(result!.point.y).toBeCloseTo(200, 0);
      expect(result!.isOnSegment).toBe(true); // 200 is inside [150, 250]
    });

    it("should return null for parallel lines", () => {
      // Vertical surface at x=200
      const surface = createVerticalSurface("v1", 200, 150, 250);
      
      // Vertical direction (parallel to surface)
      const from: Vector2 = { x: 100, y: 200 };
      const direction: Vector2 = { x: 0, y: 1 };
      
      const result = rayLineIntersect(from, direction, surface);
      
      expect(result).toBeNull();
    });

    it("should return null for intersection behind ray origin", () => {
      // Vertical surface at x=200
      const surface = createVerticalSurface("v1", 200, 150, 250);
      
      // Direction pointing AWAY from surface
      const from: Vector2 = { x: 300, y: 200 };
      const direction: Vector2 = { x: 1, y: 0 }; // Pointing right, away from x=200
      
      const result = rayLineIntersect(from, direction, surface);
      
      expect(result).toBeNull();
    });
  });

  describe("tracePhysicalPath - Off-Segment Reflection", () => {
    /**
     * Geometry for off-segment reflection:
     * 
     * Player at (100, 400)
     * Cursor at (100, 500) - same side as player
     * Cursor image at (300, 500) - reflected across x=200
     * 
     * Ray from player (100, 400) to cursor_image (300, 500):
     * - Slope = 100/200 = 0.5
     * - At x=200: y = 400 + 0.5 * 100 = 450
     * - Intersection at (200, 450) is OFF segment (y=150-250)
     * 
     * The path should still reflect off the extended line!
     */
    it("should reflect off extended line when hit is off-segment (cursor Y != player Y)", () => {
      const surface = createVerticalSurface("planned1", 200, 150, 250);
      const player: Vector2 = { x: 100, y: 400 };
      const cursor: Vector2 = { x: 100, y: 500 };
      
      const bypassResult = evaluateBypass(player, cursor, [surface], [surface]);
      const path = tracePhysicalPath(
        player,
        cursor,
        bypassResult,
        [surface]
      );
      
      console.log("[Test] Path segments:", path.segments.length);
      console.log("[Test] Path segments:", path.segments.map(s => ({
        start: s.start,
        end: s.end,
        alignment: s.planAlignment,
      })));
      
      // Path should have at least 2 segments (to surface, reflected)
      expect(path.segments.length).toBeGreaterThanOrEqual(2);
      
      // First segment should end near the surface extended line
      const firstSegment = path.segments[0]!;
      expect(firstSegment.end.x).toBeCloseTo(200, 0);
      
      // First segment should be ALIGNED (green), not diverged
      expect(firstSegment.planAlignment).toBe("aligned");
      
      // Path should have reflected (direction changed)
      const secondSegment = path.segments[1];
      if (secondSegment) {
        // After reflection, X should be decreasing (going back left)
        expect(secondSegment.end.x).toBeLessThan(secondSegment.start.x);
      }
    });

    it("should reflect off extended line when hit is off-segment (cursor Y = player Y)", () => {
      const surface = createVerticalSurface("planned1", 200, 150, 250);
      const player: Vector2 = { x: 100, y: 400 };
      const cursor: Vector2 = { x: 100, y: 400 }; // Same Y as player
      
      const bypassResult = evaluateBypass(player, cursor, [surface], [surface]);
      const path = tracePhysicalPath(
        player,
        cursor,
        bypassResult,
        [surface]
      );
      
      console.log("[Test Y=Y] Path segments:", path.segments.length);
      console.log("[Test Y=Y] Path segments:", path.segments.map(s => ({
        start: s.start,
        end: s.end,
        alignment: s.planAlignment,
      })));
      
      // Path should have at least 2 segments
      expect(path.segments.length).toBeGreaterThanOrEqual(2);
      
      // First segment should be ALIGNED (green)
      const firstSegment = path.segments[0]!;
      expect(firstSegment.planAlignment).toBe("aligned");
      
      // First segment should end at the surface extended line
      expect(firstSegment.end.x).toBeCloseTo(200, 0);
    });

    it("should mark off-segment hit in segment properties", () => {
      const surface = createVerticalSurface("planned1", 200, 150, 250);
      const player: Vector2 = { x: 100, y: 400 };
      const cursor: Vector2 = { x: 100, y: 500 };
      
      const bypassResult = evaluateBypass(player, cursor, [surface], [surface]);
      const path = tracePhysicalPath(
        player,
        cursor,
        bypassResult,
        [surface]
      );
      
      // First segment hits the planned surface
      const firstSegment = path.segments[0]!;
      expect(firstSegment.endSurface).toBe(surface);
      
      // The hit should be off-segment
      expect(firstSegment.hitOnSegment).toBe(false);
    });
  });

  describe("deriveRender - Off-Segment Visualization", () => {
    it("should render first segment as green when reflecting off-segment", () => {
      const surface = createVerticalSurface("planned1", 200, 150, 250);
      const player: Vector2 = { x: 100, y: 400 };
      const cursor: Vector2 = { x: 100, y: 500 };
      
      const bypassResult = evaluateBypass(player, cursor, [surface], [surface]);
      const path = tracePhysicalPath(
        player,
        cursor,
        bypassResult,
        [surface]
      );
      
      const renderOutput = deriveRender(path, cursor, [surface]);
      
      console.log("[Render Test] Segments:", renderOutput.segments.map(s => ({
        start: s.start,
        end: s.end,
        style: s.style,
        color: s.color,
      })));
      
      // First segment should be green (aligned with plan)
      const greenSegments = renderOutput.segments.filter(s => s.color === "green");
      expect(greenSegments.length).toBeGreaterThan(0);
      
      // The very first segment should be green
      const firstNonEmptySegment = renderOutput.segments.find(s => {
        const dx = s.end.x - s.start.x;
        const dy = s.end.y - s.start.y;
        return Math.sqrt(dx * dx + dy * dy) > 1;
      });
      
      if (firstNonEmptySegment) {
        expect(firstNonEmptySegment.color).toBe("green");
      }
    });

    it("should NOT render path as straight red line through surface", () => {
      const surface = createVerticalSurface("planned1", 200, 150, 250);
      const player: Vector2 = { x: 100, y: 400 };
      const cursor: Vector2 = { x: 100, y: 500 };
      
      const bypassResult = evaluateBypass(player, cursor, [surface], [surface]);
      const path = tracePhysicalPath(
        player,
        cursor,
        bypassResult,
        [surface]
      );
      
      const renderOutput = deriveRender(path, cursor, [surface]);
      
      // Should NOT be a single straight red line from player to cursor
      // There should be a reflection point
      
      // Check that we don't just have a straight line
      const allPoints = renderOutput.segments.flatMap(s => [s.start, s.end]);
      const uniqueX = new Set(allPoints.map(p => Math.round(p.x)));
      
      // If path reflected, we should have points at different X values
      // (player X, surface X, reflected X)
      expect(uniqueX.size).toBeGreaterThan(1);
    });
  });

  describe("Edge Cases", () => {
    it("should handle horizontal surface with off-segment reflection", () => {
      // Horizontal surface at y=200, segment from x=150 to x=250
      // Normal points DOWN (positive Y), so reflective side is y > 200
      // Player and cursor must be BELOW surface (y > 200) for reflection
      const surface = createHorizontalSurface("h1", 200, 150, 250);
      const player: Vector2 = { x: 300, y: 300 };  // Below surface at y=300
      const cursor: Vector2 = { x: 400, y: 300 };  // Same side, different X
      
      // Cursor image reflected across y=200 would be at (400, 100)
      // Ray from (300, 300) to (400, 100) hits y=200 at some x > 250 = off-segment
      
      const bypassResult = evaluateBypass(player, cursor, [surface], [surface]);
      const path = tracePhysicalPath(
        player,
        cursor,
        bypassResult,
        [surface]
      );
      
      console.log("[Horizontal Test] Path segments:", path.segments.length);
      console.log("[Horizontal Test] Path segments:", path.segments.map(s => ({
        start: s.start,
        end: s.end,
        alignment: s.planAlignment,
      })));
      
      // Path should reflect
      expect(path.segments.length).toBeGreaterThanOrEqual(2);
      
      // First segment should be aligned
      expect(path.segments[0]!.planAlignment).toBe("aligned");
    });

    it("should handle on-segment reflection (baseline)", () => {
      // Vertical surface at x=200, segment from y=100 to y=500
      const surface = createVerticalSurface("v1", 200, 100, 500);
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 100, y: 350 };
      
      const bypassResult = evaluateBypass(player, cursor, [surface], [surface]);
      const path = tracePhysicalPath(
        player,
        cursor,
        bypassResult,
        [surface]
      );
      
      // Path should reflect
      expect(path.segments.length).toBeGreaterThanOrEqual(2);
      
      // First segment should be aligned
      expect(path.segments[0]!.planAlignment).toBe("aligned");
      
      // Hit should be on-segment
      expect(path.segments[0]!.hitOnSegment).toBe(true);
    });
  });
});

