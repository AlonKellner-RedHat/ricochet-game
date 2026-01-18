/**
 * Tests for ArcSectionBuilder - Converts visibility vertices to polygon edges.
 *
 * The builder detects consecutive "range_limit" vertices and creates ArcEdge
 * entries for them, while other consecutive vertices become LineEdge entries.
 */

import { describe, it, expect } from "vitest";
import {
  buildPolygonEdges,
  type ArcConfig,
} from "@/trajectory-v2/visibility/ArcSectionBuilder";
import { createVisibilityVertex, type VisibilityVertex } from "@/trajectory-v2/visibility/VisibilityVertex";
import { isLineEdge, isArcEdge } from "@/trajectory-v2/visibility/PolygonEdge";
import type { Vector2 } from "@/types";

describe("ArcSectionBuilder", () => {
  const arcConfig: ArcConfig = {
    center: { x: 0, y: 0 },
    radius: 100,
  };

  describe("buildPolygonEdges", () => {
    it("should create line edges for all surface vertices", () => {
      const vertices: VisibilityVertex[] = [
        createVisibilityVertex({ x: 0, y: 0 }, "surface"),
        createVisibilityVertex({ x: 100, y: 0 }, "surface"),
        createVisibilityVertex({ x: 100, y: 100 }, "surface"),
        createVisibilityVertex({ x: 0, y: 100 }, "surface"),
      ];

      const edges = buildPolygonEdges(vertices, arcConfig);

      expect(edges).toHaveLength(4); // 4 vertices = 4 edges (closed polygon)
      expect(edges.every(isLineEdge)).toBe(true);
    });

    it("should create arc edge for consecutive range_limit vertices", () => {
      // Vertices: surface, range_limit, range_limit, surface
      // Should create: line, arc, line, line (closing)
      const vertices: VisibilityVertex[] = [
        createVisibilityVertex({ x: 50, y: 0 }, "surface"),
        createVisibilityVertex({ x: 100, y: 0 }, "range_limit"), // On circle
        createVisibilityVertex({ x: 0, y: 100 }, "range_limit"), // On circle
        createVisibilityVertex({ x: 0, y: 50 }, "surface"),
      ];

      const edges = buildPolygonEdges(vertices, arcConfig);

      expect(edges).toHaveLength(4);
      expect(isLineEdge(edges[0]!)).toBe(true);  // surface -> range_limit
      expect(isArcEdge(edges[1]!)).toBe(true);   // range_limit -> range_limit (ARC)
      expect(isLineEdge(edges[2]!)).toBe(true);  // range_limit -> surface
      expect(isLineEdge(edges[3]!)).toBe(true);  // surface -> surface (closing)
    });

    it("should set correct arc properties", () => {
      const vertices: VisibilityVertex[] = [
        createVisibilityVertex({ x: 100, y: 0 }, "range_limit"),
        createVisibilityVertex({ x: 0, y: 100 }, "range_limit"),
      ];

      const edges = buildPolygonEdges(vertices, arcConfig);

      expect(edges).toHaveLength(2);
      
      // First edge should be arc (range_limit -> range_limit)
      expect(isArcEdge(edges[0]!)).toBe(true);
      if (isArcEdge(edges[0]!)) {
        expect(edges[0].center).toEqual(arcConfig.center);
        expect(edges[0].radius).toBe(arcConfig.radius);
        expect(edges[0].from).toEqual({ x: 100, y: 0 });
        expect(edges[0].to).toEqual({ x: 0, y: 100 });
      }

      // Second edge (closing) is also arc
      expect(isArcEdge(edges[1]!)).toBe(true);
    });

    it("should handle mixed vertex sources correctly", () => {
      const vertices: VisibilityVertex[] = [
        createVisibilityVertex({ x: 0, y: 0 }, "surface"),
        createVisibilityVertex({ x: 100, y: 0 }, "range_limit"),
        createVisibilityVertex({ x: 100, y: 100 }, "screen"),
        createVisibilityVertex({ x: 0, y: 100 }, "range_limit"),
      ];

      const edges = buildPolygonEdges(vertices, arcConfig);

      expect(edges).toHaveLength(4);
      expect(isLineEdge(edges[0]!)).toBe(true);  // surface -> range_limit
      expect(isLineEdge(edges[1]!)).toBe(true);  // range_limit -> screen (NOT consecutive range_limit)
      expect(isLineEdge(edges[2]!)).toBe(true);  // screen -> range_limit
      expect(isLineEdge(edges[3]!)).toBe(true);  // range_limit -> surface (closing, NOT consecutive range_limit)
    });

    it("should handle all range_limit vertices (full circle visible)", () => {
      // All vertices are on the range limit (rare but possible)
      const vertices: VisibilityVertex[] = [
        createVisibilityVertex({ x: 100, y: 0 }, "range_limit"),
        createVisibilityVertex({ x: 0, y: 100 }, "range_limit"),
        createVisibilityVertex({ x: -100, y: 0 }, "range_limit"),
        createVisibilityVertex({ x: 0, y: -100 }, "range_limit"),
      ];

      const edges = buildPolygonEdges(vertices, arcConfig);

      expect(edges).toHaveLength(4);
      expect(edges.every(isArcEdge)).toBe(true); // All arcs
    });

    it("should return empty for insufficient vertices", () => {
      const vertices: VisibilityVertex[] = [
        createVisibilityVertex({ x: 0, y: 0 }, "surface"),
      ];

      const edges = buildPolygonEdges(vertices, arcConfig);

      expect(edges).toHaveLength(0);
    });

    it("should handle two vertices", () => {
      const vertices: VisibilityVertex[] = [
        createVisibilityVertex({ x: 0, y: 0 }, "surface"),
        createVisibilityVertex({ x: 100, y: 0 }, "surface"),
      ];

      const edges = buildPolygonEdges(vertices, arcConfig);

      expect(edges).toHaveLength(2); // 2 edges for closed polygon
      expect(edges.every(isLineEdge)).toBe(true);
    });
  });
});
