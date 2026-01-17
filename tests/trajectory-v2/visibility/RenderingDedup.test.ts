/**
 * RenderingDedup Tests
 *
 * Tests for exact-equality deduplication and provenance-based consecutive hit removal.
 *
 * IMPORTANT: The deduplication is now PROVENANCE-BASED (no tolerance/epsilon).
 * - Consecutive HitPoints on the same surface are collapsed to first and last
 * - Endpoints, JunctionPoints, and OriginPoints are always preserved
 */

import { describe, it, expect } from "vitest";
import {
  dedupeForRendering,
  dedupeConsecutiveHits,
  preparePolygonForRendering,
  VISUAL_TOLERANCE_PIXELS,
} from "@/trajectory-v2/visibility/RenderingDedup";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { HitPoint, Endpoint, OriginPoint } from "@/trajectory-v2/geometry/SourcePoint";
import type { Surface } from "@/surfaces/Surface";

// Helper to create a mock surface
function createMockSurface(id: string): Surface {
  return {
    id,
    segment: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
    surfaceType: "wall",
    onArrowHit: () => ({ type: "blocked" }),
    isPlannable: () => false,
    getVisualProperties: () => ({ color: 0, alpha: 1, lineWidth: 1 }),
    getNormal: () => ({ x: 0, y: 1 }),
    canReflectFrom: () => false,
  } as Surface;
}

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

  describe("dedupeConsecutiveHits()", () => {
    const surfaceA = createMockSurface("surface-A");
    const surfaceB = createMockSurface("surface-B");

    it("keeps first and last of consecutive HitPoints on same surface", () => {
      const ray = { source: { x: 0, y: 0 }, target: { x: 100, y: 0 } };
      const points = [
        new HitPoint(ray, surfaceA, 0.1, 0.1), // First of run
        new HitPoint(ray, surfaceA, 0.2, 0.2), // Middle - removed
        new HitPoint(ray, surfaceA, 0.3, 0.3), // Middle - removed
        new HitPoint(ray, surfaceA, 0.4, 0.4), // Last of run
      ];

      const result = dedupeConsecutiveHits(points);

      expect(result.length).toBe(2);
      expect(result[0]).toBe(points[0]); // First
      expect(result[1]).toBe(points[3]); // Last
    });

    it("keeps all points when surfaces differ", () => {
      const ray = { source: { x: 0, y: 0 }, target: { x: 100, y: 0 } };
      const points = [
        new HitPoint(ray, surfaceA, 0.1, 0.1),
        new HitPoint(ray, surfaceB, 0.2, 0.2), // Different surface - start new run
        new HitPoint(ray, surfaceA, 0.3, 0.3), // Different surface - start new run
      ];

      const result = dedupeConsecutiveHits(points);

      // Each hit is on a different surface (or starts a new run), all kept
      expect(result.length).toBe(3);
    });

    it("merges Endpoints with HitPoints on same surface", () => {
      const ray = { source: { x: 0, y: 0 }, target: { x: 100, y: 0 } };
      const points = [
        new HitPoint(ray, surfaceA, 0.1, 0.1),
        new Endpoint(surfaceA, "start"), // Same surface as HitPoints
        new HitPoint(ray, surfaceA, 0.3, 0.3),
      ];

      const result = dedupeConsecutiveHits(points);

      // All points on same surface - merged to first and last
      expect(result.length).toBe(2);
      expect(result[0]).toBe(points[0]); // First HitPoint
      expect(result[1]).toBe(points[2]); // Last HitPoint
    });

    it("always keeps OriginPoints", () => {
      const ray = { source: { x: 0, y: 0 }, target: { x: 100, y: 0 } };
      const points = [
        new HitPoint(ray, surfaceA, 0.1, 0.1),
        new OriginPoint({ x: 50, y: 50 }), // OriginPoint - always kept
        new HitPoint(ray, surfaceA, 0.3, 0.3),
      ];

      const result = dedupeConsecutiveHits(points);

      // OriginPoint breaks the run and is always kept
      expect(result.length).toBe(3);
      expect(result[1]).toBeInstanceOf(OriginPoint);
    });

    it("handles empty array", () => {
      const result = dedupeConsecutiveHits([]);
      expect(result).toEqual([]);
    });

    it("handles single point", () => {
      const ray = { source: { x: 0, y: 0 }, target: { x: 100, y: 0 } };
      const point = new HitPoint(ray, surfaceA, 0.1, 0.1);
      const result = dedupeConsecutiveHits([point]);
      expect(result.length).toBe(1);
    });

    it("handles mixed point types with surface grouping", () => {
      const ray = { source: { x: 0, y: 0 }, target: { x: 100, y: 0 } };
      const points = [
        new Endpoint(surfaceA, "start"),    // First on surfaceA
        new HitPoint(ray, surfaceA, 0.1, 0.1), // Middle - removed
        new HitPoint(ray, surfaceA, 0.2, 0.2), // Middle - removed
        new HitPoint(ray, surfaceA, 0.3, 0.3), // Middle - removed
        new Endpoint(surfaceA, "end"),      // Last on surfaceA
        new HitPoint(ray, surfaceB, 0.4, 0.4), // Different surface - kept
      ];

      const result = dedupeConsecutiveHits(points);

      // All surfaceA points merged to first and last, surfaceB kept
      expect(result.length).toBe(3);
      expect(result[0]).toBeInstanceOf(Endpoint); // First of surfaceA run
      expect(result[1]).toBeInstanceOf(Endpoint); // Last of surfaceA run
      expect(result[2]).toBeInstanceOf(HitPoint); // surfaceB (different surface)
    });
  });

  describe("preparePolygonForRendering()", () => {
    const surface = createMockSurface("test-surface");

    it("returns Vector2 array", () => {
      const ray = { source: { x: 0, y: 0 }, target: { x: 100, y: 0 } };
      const points = [
        new HitPoint(ray, surface, 0.1, 0.1),
        new HitPoint(ray, surface, 0.2, 0.2),
      ];

      const result = preparePolygonForRendering(points);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(typeof result[0].x).toBe("number");
      expect(typeof result[0].y).toBe("number");
    });

    it("removes consecutive hits on same surface", () => {
      const ray = { source: { x: 0, y: 0 }, target: { x: 100, y: 0 } };
      const points = [
        new HitPoint(ray, surface, 0.1, 0.1),
        new HitPoint(ray, surface, 0.2, 0.2),
        new HitPoint(ray, surface, 0.3, 0.3),
        new HitPoint(ray, surface, 0.4, 0.4),
      ];

      const result = preparePolygonForRendering(points);

      // Only first and last kept
      expect(result.length).toBe(2);
    });

    it("preserves endpoints", () => {
      const endpoint = new Endpoint(surface, "start");
      const result = preparePolygonForRendering([endpoint]);

      expect(result.length).toBe(1);
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
