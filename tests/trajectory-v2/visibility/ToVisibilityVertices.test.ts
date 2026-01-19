/**
 * Tests for toVisibilityVertices converter.
 *
 * TDD: Tests written first, then implementation.
 */

import { describe, it, expect } from "vitest";
import { toVisibilityVertices } from "@/trajectory-v2/visibility/VisibilityVertexConverter";
import {
  OriginPoint,
  ArcHitPoint,
  ArcIntersectionPoint,
  ArcJunctionPoint,
  startOf,
  endOf,
} from "@/trajectory-v2/geometry/SourcePoint";
import { createMockSurface } from "@test/helpers/surfaceHelpers";

describe("toVisibilityVertices", () => {
  describe("source detection", () => {
    it("should mark ArcHitPoint as 'range_limit' source", () => {
      const points = [
        new ArcHitPoint({ x: 100, y: 0 }),
        new ArcHitPoint({ x: 0, y: 100 }),
      ];
      
      const vertices = toVisibilityVertices(points);
      
      expect(vertices.length).toBe(2);
      expect(vertices[0]!.source).toBe("range_limit");
      expect(vertices[1]!.source).toBe("range_limit");
    });

    it("should mark ArcIntersectionPoint as 'range_limit' source", () => {
      const surface = createMockSurface("test-surface", { x: 0, y: 0 }, { x: 100, y: 0 });
      const points = [
        new ArcIntersectionPoint(surface, 0.5, "range_limit"),
      ];
      
      const vertices = toVisibilityVertices(points);
      
      expect(vertices.length).toBe(1);
      expect(vertices[0]!.source).toBe("range_limit");
    });

    it("should mark ArcJunctionPoint as 'range_limit' source", () => {
      const points = [
        new ArcJunctionPoint({ x: 300, y: 400 }, "top", "bottom", "left"),
        new ArcJunctionPoint({ x: 500, y: 400 }, "top", "bottom", "right"),
      ];
      
      const vertices = toVisibilityVertices(points);
      
      expect(vertices.length).toBe(2);
      expect(vertices[0]!.source).toBe("range_limit");
      expect(vertices[1]!.source).toBe("range_limit");
    });

    it("should mark OriginPoint as 'surface' source by default", () => {
      const points = [
        new OriginPoint({ x: 50, y: 75 }),
      ];
      
      const vertices = toVisibilityVertices(points);
      
      expect(vertices.length).toBe(1);
      expect(vertices[0]!.source).toBe("surface");
    });

    it("should mark screen boundary Endpoint as 'screen' source", () => {
      // Create a screen boundary surface (ID starts with "screen-")
      const screenSurface = createMockSurface(
        "screen-top",
        { x: 0, y: 0 },
        { x: 100, y: 0 }
      );
      
      const endpoint = startOf(screenSurface);
      const vertices = toVisibilityVertices([endpoint]);
      
      expect(vertices.length).toBe(1);
      expect(vertices[0]!.source).toBe("screen");
    });

    it("should mark non-screen Endpoint as 'surface' source", () => {
      const obstacle = createMockSurface(
        "obstacle-1",
        { x: 200, y: 100 },
        { x: 300, y: 100 }
      );
      
      const endpoint = endOf(obstacle);
      const vertices = toVisibilityVertices([endpoint]);
      
      expect(vertices.length).toBe(1);
      expect(vertices[0]!.source).toBe("surface");
    });

    it("should correctly extract positions", () => {
      const points = [
        new ArcHitPoint({ x: 123, y: 456 }),
        new OriginPoint({ x: 789, y: 101 }),
      ];
      
      const vertices = toVisibilityVertices(points);
      
      expect(vertices[0]!.position).toEqual({ x: 123, y: 456 });
      expect(vertices[1]!.position).toEqual({ x: 789, y: 101 });
    });
  });

  describe("mixed point types", () => {
    it("should handle mixed point types correctly", () => {
      const screenSurface = createMockSurface("screen-left", { x: 0, y: 0 }, { x: 100, y: 0 });
      const obstacle = createMockSurface("obstacle-2", { x: 200, y: 100 }, { x: 300, y: 100 });
      
      const points = [
        new ArcHitPoint({ x: 0, y: 100 }),
        startOf(screenSurface),
        endOf(obstacle),
        new OriginPoint({ x: 50, y: 50 }),
        new ArcHitPoint({ x: 100, y: 0 }),
      ];
      
      const vertices = toVisibilityVertices(points);
      
      expect(vertices.length).toBe(5);
      expect(vertices[0]!.source).toBe("range_limit");
      expect(vertices[1]!.source).toBe("screen");
      expect(vertices[2]!.source).toBe("surface");
      expect(vertices[3]!.source).toBe("surface");
      expect(vertices[4]!.source).toBe("range_limit");
    });
  });

  describe("consecutive arc points for arc edges", () => {
    it("should mark all consecutive arc point types as range_limit for arc edge detection", () => {
      const surface = createMockSurface("test-surface", { x: 0, y: 0 }, { x: 100, y: 0 });
      
      // Simulate a sequence that would form an arc edge:
      // ArcJunctionPoint -> ArcHitPoint -> ArcIntersectionPoint -> ArcJunctionPoint
      const points = [
        new ArcJunctionPoint({ x: 300, y: 400 }, "top", "bottom", "left"),
        new ArcHitPoint({ x: 350, y: 350 }),
        new ArcIntersectionPoint(surface, 0.5, "range_limit"),
        new ArcJunctionPoint({ x: 500, y: 400 }, "top", "bottom", "right"),
      ];
      
      const vertices = toVisibilityVertices(points);
      
      // All should be "range_limit" so they form arc edges when consecutive
      expect(vertices.length).toBe(4);
      expect(vertices.every(v => v.source === "range_limit")).toBe(true);
    });

    it("should break arc edge at non-arc points", () => {
      const surface = createMockSurface("test-surface", { x: 0, y: 0 }, { x: 100, y: 0 });
      const obstacle = createMockSurface("obstacle", { x: 200, y: 100 }, { x: 300, y: 100 });
      
      // Arc -> Surface -> Arc should NOT form a continuous arc edge
      const points = [
        new ArcJunctionPoint({ x: 300, y: 400 }, "top", "bottom", "left"),
        endOf(obstacle), // This breaks the arc sequence
        new ArcJunctionPoint({ x: 500, y: 400 }, "top", "bottom", "right"),
      ];
      
      const vertices = toVisibilityVertices(points);
      
      expect(vertices.length).toBe(3);
      expect(vertices[0]!.source).toBe("range_limit");
      expect(vertices[1]!.source).toBe("surface"); // This breaks the arc
      expect(vertices[2]!.source).toBe("range_limit");
    });
  });
});
