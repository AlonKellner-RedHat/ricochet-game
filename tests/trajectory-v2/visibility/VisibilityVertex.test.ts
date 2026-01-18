/**
 * Tests for VisibilityVertex - Vertex with source provenance for visibility polygons.
 *
 * Each vertex tracks where it came from:
 * - "surface": Hit a surface boundary
 * - "screen": Hit screen/room boundary
 * - "range_limit": Hit range limit circle
 *
 * This provenance enables arc detection: consecutive "range_limit" vertices
 * form arc edges rather than line edges.
 */

import { describe, it, expect } from "vitest";
import {
  createVisibilityVertex,
  type VisibilityVertex,
  type VertexSource,
} from "@/trajectory-v2/visibility/VisibilityVertex";
import type { Vector2 } from "@/types";

describe("VisibilityVertex", () => {
  describe("createVisibilityVertex", () => {
    it("should create a vertex with surface source", () => {
      const position: Vector2 = { x: 100, y: 50 };
      
      const vertex = createVisibilityVertex(position, "surface");
      
      expect(vertex.position).toEqual(position);
      expect(vertex.source).toBe("surface");
    });

    it("should create a vertex with screen source", () => {
      const position: Vector2 = { x: 0, y: 200 };
      
      const vertex = createVisibilityVertex(position, "screen");
      
      expect(vertex.position).toEqual(position);
      expect(vertex.source).toBe("screen");
    });

    it("should create a vertex with range_limit source", () => {
      const position: Vector2 = { x: 480, y: 0 };
      
      const vertex = createVisibilityVertex(position, "range_limit");
      
      expect(vertex.position).toEqual(position);
      expect(vertex.source).toBe("range_limit");
    });
  });

  describe("vertex equality", () => {
    it("should have equal positions for same coordinates", () => {
      const v1 = createVisibilityVertex({ x: 100, y: 100 }, "surface");
      const v2 = createVisibilityVertex({ x: 100, y: 100 }, "range_limit");
      
      // Positions are equal, but sources differ
      expect(v1.position).toEqual(v2.position);
      expect(v1.source).not.toBe(v2.source);
    });
  });

  describe("source type", () => {
    it("should support all three source types", () => {
      const sources: VertexSource[] = ["surface", "screen", "range_limit"];
      
      for (const source of sources) {
        const vertex = createVisibilityVertex({ x: 0, y: 0 }, source);
        expect(vertex.source).toBe(source);
      }
    });
  });
});
