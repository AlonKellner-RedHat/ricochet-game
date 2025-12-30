/**
 * RenderingDedup Tests
 *
 * Tests for exact-equality deduplication and collinear point removal.
 * 
 * IMPORTANT: The deduplication is now EXACT (no tolerance/epsilon).
 * This prevents bugs where geometrically distinct vertices from different
 * sources are incorrectly merged, which was causing visibility polygon errors.
 */

import { describe, it, expect } from "vitest";
import {
  dedupeForRendering,
  removeCollinearPoints,
  preparePolygonForRendering,
  VISUAL_TOLERANCE_PIXELS,
} from "@/trajectory-v2/visibility/RenderingDedup";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

describe("RenderingDedup", () => {
  describe("dedupeForRendering()", () => {
    it("removes only exact duplicate points", () => {
      // Near-duplicates are NOT removed (provenance-safe behavior)
      const vertices: Vector2[] = [
        { x: 0, y: 0 },
        { x: 0.1, y: 0.1 }, // Different coordinates - NOT removed
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];

      const result = dedupeForRendering(vertices);

      // All vertices are kept because none are exact duplicates
      expect(result.length).toBe(5);
      expect(result[0]).toEqual({ x: 0, y: 0 });
      expect(result[1]).toEqual({ x: 0.1, y: 0.1 }); // Preserved!
    });

    it("removes exact duplicates", () => {
      const vertices: Vector2[] = [
        { x: 0, y: 0 },
        { x: 0, y: 0 }, // Exact duplicate - removed
        { x: 100, y: 0 },
      ];

      const result = dedupeForRendering(vertices);

      expect(result.length).toBe(2);
      expect(result[0]).toEqual({ x: 0, y: 0 });
      expect(result[1]).toEqual({ x: 100, y: 0 });
    });

    it("keeps distinct points regardless of distance", () => {
      const vertices: Vector2[] = [
        { x: 0, y: 0 },
        { x: 0.5, y: 0 }, // Close but distinct
        { x: 100, y: 0 },
      ];

      const result = dedupeForRendering(vertices);

      // All points are kept because they have different coordinates
      expect(result.length).toBe(3);
    });

    it("handles empty array", () => {
      const result = dedupeForRendering([]);
      expect(result).toEqual([]);
    });

    it("handles single point", () => {
      const result = dedupeForRendering([{ x: 0, y: 0 }]);
      expect(result).toEqual([{ x: 0, y: 0 }]);
    });

    it("handles two points", () => {
      const result = dedupeForRendering([
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ]);
      expect(result.length).toBe(2);
    });
  });

  describe("removeCollinearPoints()", () => {
    it("removes points on a straight line", () => {
      const vertices: Vector2[] = [
        { x: 0, y: 0 },
        { x: 50, y: 0 }, // Collinear with prev and next
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];

      const result = removeCollinearPoints(vertices, 0.001);

      // Middle point on bottom edge should be removed
      expect(result.length).toBe(4);
      expect(result).not.toContainEqual({ x: 50, y: 0 });
    });

    it("keeps corner points", () => {
      const vertices: Vector2[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];

      const result = removeCollinearPoints(vertices);

      // All corners should be kept
      expect(result.length).toBe(4);
    });

    it("handles triangle (minimum polygon)", () => {
      const vertices: Vector2[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 100 },
      ];

      const result = removeCollinearPoints(vertices);

      // Triangles are returned as-is
      expect(result.length).toBe(3);
    });

    it("preserves near-collinear points with large tolerance", () => {
      const vertices: Vector2[] = [
        { x: 0, y: 0 },
        { x: 50, y: 1 }, // Slightly off the line
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];

      // With large tolerance, the slightly off point should be removed
      const result = removeCollinearPoints(vertices, 100);
      expect(result.length).toBe(4);

      // With small tolerance, it should be kept
      const result2 = removeCollinearPoints(vertices, 0.5);
      expect(result2.length).toBe(5);
    });
  });

  describe("preparePolygonForRendering()", () => {
    it("applies both dedup and collinear removal", () => {
      const vertices: Vector2[] = [
        { x: 0, y: 0 },
        { x: 0, y: 0 }, // Exact duplicate - removed
        { x: 50, y: 0 }, // Collinear with 0,0 and 100,0 - removed by collinear pass
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];

      const result = preparePolygonForRendering(vertices);

      // Should remove exact duplicate AND collinear point
      expect(result.length).toBeLessThanOrEqual(4);
    });

    it("preserves near-duplicate vertices from different sources", () => {
      // This is the critical case that caused the pixel-perfect bug!
      // A computed hit point at (1000.46, 420) and a window endpoint at (1000, 420)
      // are geometrically distinct and must BOTH be preserved
      const vertices: Vector2[] = [
        { x: 1000.4628791048536, y: 420 }, // Computed hit point
        { x: 898.7, y: 700 },
        { x: 897.7, y: 700 },
        { x: 1000, y: 420 }, // Window endpoint (0.46px away from first)
      ];

      const result = preparePolygonForRendering(vertices);

      // Both (1000.46, 420) and (1000, 420) must be preserved
      expect(result.length).toBe(4);
      expect(result.some((v) => v.x === 1000.4628791048536 && v.y === 420)).toBe(
        true
      );
      expect(result.some((v) => v.x === 1000 && v.y === 420)).toBe(true);
    });

    it("produces a valid renderable polygon", () => {
      // Complex polygon with duplicates and collinear points
      const vertices: Vector2[] = [
        { x: 0, y: 0 },
        { x: 25, y: 0 },
        { x: 50, y: 0 },
        { x: 75, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 100, y: 100 },
        { x: 50, y: 100 },
        { x: 0, y: 100 },
        { x: 0, y: 50 },
      ];

      const result = preparePolygonForRendering(vertices);

      // Should reduce to 4 corners
      expect(result.length).toBe(4);
    });
  });

  describe("VISUAL_TOLERANCE_PIXELS constant", () => {
    it("is defined and reasonable", () => {
      expect(VISUAL_TOLERANCE_PIXELS).toBeDefined();
      expect(VISUAL_TOLERANCE_PIXELS).toBeGreaterThan(0);
      expect(VISUAL_TOLERANCE_PIXELS).toBeLessThan(10); // Should be sub-pixel
    });
  });
});

