/**
 * RenderingDedup Tests
 *
 * Tests for tolerance-based visual deduplication.
 * These are the ONLY tolerance comparisons in the system.
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
    it("removes points within tolerance", () => {
      const vertices: Vector2[] = [
        { x: 0, y: 0 },
        { x: 0.1, y: 0.1 }, // Too close to first
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];

      const result = dedupeForRendering(vertices, VISUAL_TOLERANCE_PIXELS);

      expect(result.length).toBe(4); // One duplicate removed
      expect(result[0]).toEqual({ x: 0, y: 0 });
      expect(result[1]).toEqual({ x: 100, y: 0 });
    });

    it("keeps points exactly at tolerance distance", () => {
      const vertices: Vector2[] = [
        { x: 0, y: 0 },
        { x: 0.5, y: 0 }, // Exactly at tolerance
        { x: 100, y: 0 },
      ];

      const result = dedupeForRendering(vertices, 0.5);

      // Points at exactly tolerance distance should be kept
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
        { x: 0.1, y: 0.1 }, // Duplicate of first
        { x: 50, y: 0 }, // Collinear with 0,0 and 100,0
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];

      const result = preparePolygonForRendering(vertices);

      // Should remove duplicate AND collinear point
      expect(result.length).toBeLessThanOrEqual(4);
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

