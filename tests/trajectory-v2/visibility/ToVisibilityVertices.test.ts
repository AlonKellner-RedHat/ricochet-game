/**
 * Tests for toVisibilityVertices converter.
 *
 * TDD: Tests written first, then implementation.
 */

import { describe, it, expect } from "vitest";
import { toVisibilityVertices } from "@/trajectory-v2/visibility/VisibilityVertexConverter";
import {
  OriginPoint,
  RangeLimitPoint,
  startOf,
  endOf,
} from "@/trajectory-v2/geometry/SourcePoint";
import { createMockSurface } from "@test/helpers/surfaceHelpers";

describe("toVisibilityVertices", () => {
  describe("source detection", () => {
    it("should mark RangeLimitPoint as 'range_limit' source", () => {
      const points = [
        new RangeLimitPoint({ x: 100, y: 0 }),
        new RangeLimitPoint({ x: 0, y: 100 }),
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
        new RangeLimitPoint({ x: 123, y: 456 }),
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
        new RangeLimitPoint({ x: 0, y: 100 }),
        startOf(screenSurface),
        endOf(obstacle),
        new OriginPoint({ x: 50, y: 50 }),
        new RangeLimitPoint({ x: 100, y: 0 }),
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
});
