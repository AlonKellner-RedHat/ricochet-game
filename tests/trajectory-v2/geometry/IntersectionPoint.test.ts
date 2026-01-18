/**
 * Tests for IntersectionPoint - a SourcePoint representing where a surface
 * intersects another shape (range limit circle or another surface).
 */
import { describe, it, expect } from "vitest";
import {
  IntersectionPoint,
  isIntersectionPoint,
  OriginPoint,
  Endpoint,
  startOf,
} from "@/trajectory-v2/geometry/SourcePoint";
import { createMockSurface } from "@test/helpers/surfaceHelpers";

describe("IntersectionPoint", () => {
  describe("construction and computeXY", () => {
    it("should compute position at t=0 (surface start)", () => {
      const surface = createMockSurface("s1", { x: 100, y: 200 }, { x: 300, y: 400 });
      const point = new IntersectionPoint(surface, 0, "range_limit");

      const xy = point.computeXY();
      expect(xy.x).toBe(100);
      expect(xy.y).toBe(200);
    });

    it("should compute position at t=1 (surface end)", () => {
      const surface = createMockSurface("s1", { x: 100, y: 200 }, { x: 300, y: 400 });
      const point = new IntersectionPoint(surface, 1, "range_limit");

      const xy = point.computeXY();
      expect(xy.x).toBe(300);
      expect(xy.y).toBe(400);
    });

    it("should compute position at t=0.5 (midpoint)", () => {
      const surface = createMockSurface("s1", { x: 100, y: 200 }, { x: 300, y: 400 });
      const point = new IntersectionPoint(surface, 0.5, "range_limit");

      const xy = point.computeXY();
      expect(xy.x).toBe(200);
      expect(xy.y).toBe(300);
    });

    it("should compute position at arbitrary t value", () => {
      const surface = createMockSurface("s1", { x: 0, y: 0 }, { x: 100, y: 0 });
      const point = new IntersectionPoint(surface, 0.25, "range_limit");

      const xy = point.computeXY();
      expect(xy.x).toBe(25);
      expect(xy.y).toBe(0);
    });
  });

  describe("type property", () => {
    it("should have type 'intersection'", () => {
      const surface = createMockSurface("s1", { x: 0, y: 0 }, { x: 100, y: 0 });
      const point = new IntersectionPoint(surface, 0.5, "range_limit");

      expect(point.type).toBe("intersection");
    });
  });

  describe("isIntersectionPoint type guard", () => {
    it("should return true for IntersectionPoint", () => {
      const surface = createMockSurface("s1", { x: 0, y: 0 }, { x: 100, y: 0 });
      const point = new IntersectionPoint(surface, 0.5, "range_limit");

      expect(isIntersectionPoint(point)).toBe(true);
    });

    it("should return false for OriginPoint", () => {
      const point = new OriginPoint({ x: 50, y: 50 });

      expect(isIntersectionPoint(point)).toBe(false);
    });

    it("should return false for Endpoint", () => {
      const surface = createMockSurface("s1", { x: 0, y: 0 }, { x: 100, y: 0 });
      const point = startOf(surface);

      expect(isIntersectionPoint(point)).toBe(false);
    });
  });

  describe("isOnSurface", () => {
    it("should return true for its own surface", () => {
      const surface = createMockSurface("s1", { x: 0, y: 0 }, { x: 100, y: 0 });
      const point = new IntersectionPoint(surface, 0.5, "range_limit");

      expect(point.isOnSurface(surface)).toBe(true);
    });

    it("should return false for a different surface", () => {
      const surface1 = createMockSurface("s1", { x: 0, y: 0 }, { x: 100, y: 0 });
      const surface2 = createMockSurface("s2", { x: 0, y: 50 }, { x: 100, y: 50 });
      const point = new IntersectionPoint(surface1, 0.5, "range_limit");

      expect(point.isOnSurface(surface2)).toBe(false);
    });
  });

  describe("equals", () => {
    it("should return true for same surface and t value", () => {
      const surface = createMockSurface("s1", { x: 0, y: 0 }, { x: 100, y: 0 });
      const point1 = new IntersectionPoint(surface, 0.5, "range_limit");
      const point2 = new IntersectionPoint(surface, 0.5, "range_limit");

      expect(point1.equals(point2)).toBe(true);
    });

    it("should return false for different t values", () => {
      const surface = createMockSurface("s1", { x: 0, y: 0 }, { x: 100, y: 0 });
      const point1 = new IntersectionPoint(surface, 0.5, "range_limit");
      const point2 = new IntersectionPoint(surface, 0.6, "range_limit");

      expect(point1.equals(point2)).toBe(false);
    });

    it("should return false for different surfaces", () => {
      const surface1 = createMockSurface("s1", { x: 0, y: 0 }, { x: 100, y: 0 });
      const surface2 = createMockSurface("s2", { x: 0, y: 50 }, { x: 100, y: 50 });
      const point1 = new IntersectionPoint(surface1, 0.5, "range_limit");
      const point2 = new IntersectionPoint(surface2, 0.5, "range_limit");

      expect(point1.equals(point2)).toBe(false);
    });

    it("should return false when compared to Endpoint at same position", () => {
      const surface = createMockSurface("s1", { x: 0, y: 0 }, { x: 100, y: 0 });
      const intersection = new IntersectionPoint(surface, 0, "range_limit");
      const endpoint = startOf(surface);

      expect(intersection.equals(endpoint)).toBe(false);
    });
  });

  describe("getKey", () => {
    it("should return unique key with intersection prefix", () => {
      const surface = createMockSurface("s1", { x: 0, y: 0 }, { x: 100, y: 0 });
      const point = new IntersectionPoint(surface, 0.5, "range_limit");

      const key = point.getKey();
      expect(key).toContain("intersection:");
      expect(key).toContain(surface.id);
      expect(key).toContain("0.5");
    });
  });

  describe("blocking behavior", () => {
    it("should never block (like Endpoint)", () => {
      const surface = createMockSurface("s1", { x: 0, y: 0 }, { x: 100, y: 0 });
      const point = new IntersectionPoint(surface, 0.5, "range_limit");

      expect(point.isBlocking(new Map())).toBe(false);
    });
  });

  describe("getExcludedSurfaceIds", () => {
    it("should exclude its own surface", () => {
      const surface = createMockSurface("s1", { x: 0, y: 0 }, { x: 100, y: 0 });
      const point = new IntersectionPoint(surface, 0.5, "range_limit");

      const excluded = point.getExcludedSurfaceIds();
      expect(excluded).toContain(surface.id);
      expect(excluded).toHaveLength(1);
    });
  });

  describe("intersectionType", () => {
    it("should store range_limit intersection type", () => {
      const surface = createMockSurface("s1", { x: 0, y: 0 }, { x: 100, y: 0 });
      const point = new IntersectionPoint(surface, 0.5, "range_limit");

      expect(point.intersectionType).toBe("range_limit");
    });

    it("should store surface intersection type", () => {
      const surface = createMockSurface("s1", { x: 0, y: 0 }, { x: 100, y: 0 });
      const point = new IntersectionPoint(surface, 0.5, "surface");

      expect(point.intersectionType).toBe("surface");
    });
  });
});
