/**
 * Tests for PolygonEdge - Abstraction for visibility polygon edges.
 *
 * The PolygonEdge interface allows a visibility polygon to be composed of:
 * - LineEdge: Standard straight line segments
 * - ArcEdge: Circular arc sections (for range limit boundaries)
 */

import { describe, it, expect } from "vitest";
import {
  createLineEdge,
  createArcEdge,
  isLineEdge,
  isArcEdge,
  type PolygonEdge,
  type LineEdge,
  type ArcEdge,
} from "@/trajectory-v2/visibility/PolygonEdge";
import type { Vector2 } from "@/types";

describe("PolygonEdge", () => {
  describe("createLineEdge", () => {
    it("should create a line edge with from and to points", () => {
      const from: Vector2 = { x: 0, y: 0 };
      const to: Vector2 = { x: 100, y: 50 };
      
      const edge = createLineEdge(from, to);
      
      expect(edge.type).toBe("line");
      expect(edge.from).toEqual(from);
      expect(edge.to).toEqual(to);
    });

    it("should be identifiable as a line edge", () => {
      const edge = createLineEdge({ x: 0, y: 0 }, { x: 100, y: 100 });
      
      expect(isLineEdge(edge)).toBe(true);
      expect(isArcEdge(edge)).toBe(false);
    });
  });

  describe("createArcEdge", () => {
    it("should create an arc edge with all required properties", () => {
      const from: Vector2 = { x: 100, y: 0 };
      const to: Vector2 = { x: 0, y: 100 };
      const center: Vector2 = { x: 0, y: 0 };
      const radius = 100;
      
      const edge = createArcEdge(from, to, center, radius);
      
      expect(edge.type).toBe("arc");
      expect(edge.from).toEqual(from);
      expect(edge.to).toEqual(to);
      expect(edge.center).toEqual(center);
      expect(edge.radius).toBe(radius);
    });

    it("should be identifiable as an arc edge", () => {
      const edge = createArcEdge(
        { x: 100, y: 0 },
        { x: 0, y: 100 },
        { x: 0, y: 0 },
        100
      );
      
      expect(isArcEdge(edge)).toBe(true);
      expect(isLineEdge(edge)).toBe(false);
    });

    it("should support anticlockwise parameter", () => {
      const edge = createArcEdge(
        { x: 100, y: 0 },
        { x: 0, y: 100 },
        { x: 0, y: 0 },
        100,
        true // anticlockwise
      );
      
      expect(edge.anticlockwise).toBe(true);
    });

    it("should default to clockwise (anticlockwise = false)", () => {
      const edge = createArcEdge(
        { x: 100, y: 0 },
        { x: 0, y: 100 },
        { x: 0, y: 0 },
        100
      );
      
      expect(edge.anticlockwise).toBe(false);
    });
  });

  describe("type guards", () => {
    it("should narrow types correctly with isLineEdge", () => {
      const edge: PolygonEdge = createLineEdge({ x: 0, y: 0 }, { x: 100, y: 100 });
      
      if (isLineEdge(edge)) {
        // TypeScript should narrow this to LineEdge
        const _line: LineEdge = edge;
        expect(_line.type).toBe("line");
      } else {
        throw new Error("Should have been a line edge");
      }
    });

    it("should narrow types correctly with isArcEdge", () => {
      const edge: PolygonEdge = createArcEdge(
        { x: 100, y: 0 },
        { x: 0, y: 100 },
        { x: 0, y: 0 },
        100
      );
      
      if (isArcEdge(edge)) {
        // TypeScript should narrow this to ArcEdge
        const _arc: ArcEdge = edge;
        expect(_arc.center).toBeDefined();
        expect(_arc.radius).toBe(100);
      } else {
        throw new Error("Should have been an arc edge");
      }
    });
  });
});
