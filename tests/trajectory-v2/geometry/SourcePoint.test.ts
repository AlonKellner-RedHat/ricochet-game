/**
 * SourcePoint Tests
 *
 * TDD tests for the Source-of-Truth geometry paradigm.
 * Tests exact operations: equals(), computeXY(), isOnSurface()
 */

import { describe, it, expect } from "vitest";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  SourcePoint,
  OriginPoint,
  Endpoint,
  HitPoint,
  isEndpoint,
  isHitPoint,
  isOriginPoint,
  isScreenBoundary,
  startOf,
  endOf,
  endpointsOf,
} from "@/trajectory-v2/geometry/SourcePoint";
import {
  createScreenBoundaries,
  isScreenBoundarySurface,
} from "@/trajectory-v2/geometry/ScreenBoundaries";

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestSurface(
  id: string,
  start: Vector2,
  end: Vector2
): Surface {
  return {
    id,
    segment: { start, end },
    surfaceType: "test",
    onArrowHit: () => ({ type: "blocked" }),
    isPlannable: () => false,
    getVisualProperties: () => ({ color: 0, alpha: 1, lineWidth: 1 }),
    getNormal: () => ({ x: 0, y: 1 }),
    canReflectFrom: () => false,
  } as Surface;
}

// =============================================================================
// ORIGIN POINT TESTS
// =============================================================================

describe("OriginPoint", () => {
  const origin = new OriginPoint({ x: 100, y: 200 });

  describe("computeXY()", () => {
    it("returns the exact source value", () => {
      const xy = origin.computeXY();
      expect(xy.x).toBe(100);
      expect(xy.y).toBe(200);
    });

    it("returns the same object reference", () => {
      // OriginPoint should return the original value, not a copy
      expect(origin.computeXY()).toBe(origin.value);
    });
  });

  describe("equals()", () => {
    it("is equal to another OriginPoint with same coordinates", () => {
      const other = new OriginPoint({ x: 100, y: 200 });
      expect(origin.equals(other)).toBe(true);
    });

    it("is not equal to OriginPoint with different coordinates", () => {
      const other = new OriginPoint({ x: 100, y: 201 });
      expect(origin.equals(other)).toBe(false);
    });

    it("is not equal to different point types", () => {
      const surface = createTestSurface("s1", { x: 0, y: 0 }, { x: 100, y: 200 });
      const endpoint = new Endpoint(surface, "end");
      expect(origin.equals(endpoint)).toBe(false);
    });

    it("uses exact floating-point comparison (no epsilon)", () => {
      const a = new OriginPoint({ x: 0.1 + 0.2, y: 0 }); // 0.30000000000000004
      const b = new OriginPoint({ x: 0.3, y: 0 });
      // These are NOT equal due to floating-point representation
      expect(a.equals(b)).toBe(false);
    });
  });

  describe("isOnSurface()", () => {
    it("always returns false for OriginPoint", () => {
      const surface = createTestSurface("s1", { x: 100, y: 200 }, { x: 300, y: 200 });
      expect(origin.isOnSurface(surface)).toBe(false);
    });
  });

  describe("getKey()", () => {
    it("returns a unique key", () => {
      expect(origin.getKey()).toBe("origin:100,200");
    });
  });

  describe("type guard", () => {
    it("isOriginPoint returns true", () => {
      expect(isOriginPoint(origin)).toBe(true);
    });

    it("isEndpoint returns false", () => {
      expect(isEndpoint(origin)).toBe(false);
    });
  });
});

// =============================================================================
// ENDPOINT TESTS
// =============================================================================

describe("Endpoint", () => {
  const surface = createTestSurface(
    "platform",
    { x: 100, y: 200 },
    { x: 300, y: 200 }
  );
  const startEndpoint = new Endpoint(surface, "start");
  const endEndpoint = new Endpoint(surface, "end");

  describe("computeXY()", () => {
    it("returns surface start for 'start' endpoint", () => {
      const xy = startEndpoint.computeXY();
      expect(xy.x).toBe(100);
      expect(xy.y).toBe(200);
    });

    it("returns surface end for 'end' endpoint", () => {
      const xy = endEndpoint.computeXY();
      expect(xy.x).toBe(300);
      expect(xy.y).toBe(200);
    });

    it("returns exact source coordinates (no computation)", () => {
      expect(startEndpoint.computeXY()).toBe(surface.segment.start);
      expect(endEndpoint.computeXY()).toBe(surface.segment.end);
    });
  });

  describe("equals()", () => {
    it("is equal to another Endpoint with same surface and which", () => {
      const other = new Endpoint(surface, "start");
      expect(startEndpoint.equals(other)).toBe(true);
    });

    it("is not equal if 'which' differs", () => {
      expect(startEndpoint.equals(endEndpoint)).toBe(false);
    });

    it("is not equal if surface differs", () => {
      const otherSurface = createTestSurface(
        "other",
        { x: 100, y: 200 },
        { x: 300, y: 200 }
      );
      const other = new Endpoint(otherSurface, "start");
      expect(startEndpoint.equals(other)).toBe(false);
    });

    it("is not equal to different point types", () => {
      const origin = new OriginPoint({ x: 100, y: 200 });
      expect(startEndpoint.equals(origin)).toBe(false);
    });
  });

  describe("isOnSurface()", () => {
    it("returns true for the same surface", () => {
      expect(startEndpoint.isOnSurface(surface)).toBe(true);
      expect(endEndpoint.isOnSurface(surface)).toBe(true);
    });

    it("returns false for a different surface", () => {
      const other = createTestSurface("other", { x: 0, y: 0 }, { x: 100, y: 0 });
      expect(startEndpoint.isOnSurface(other)).toBe(false);
    });
  });

  describe("getKey()", () => {
    it("returns a unique key based on surface and which", () => {
      expect(startEndpoint.getKey()).toBe("endpoint:platform:start");
      expect(endEndpoint.getKey()).toBe("endpoint:platform:end");
    });
  });

  describe("type guard", () => {
    it("isEndpoint returns true", () => {
      expect(isEndpoint(startEndpoint)).toBe(true);
    });

    it("isOriginPoint returns false", () => {
      expect(isOriginPoint(startEndpoint)).toBe(false);
    });
  });

  describe("helper functions", () => {
    it("startOf creates start endpoint", () => {
      const ep = startOf(surface);
      expect(ep.which).toBe("start");
      expect(ep.surface).toBe(surface);
    });

    it("endOf creates end endpoint", () => {
      const ep = endOf(surface);
      expect(ep.which).toBe("end");
      expect(ep.surface).toBe(surface);
    });

    it("endpointsOf returns both endpoints", () => {
      const [start, end] = endpointsOf(surface);
      expect(start.which).toBe("start");
      expect(end.which).toBe("end");
    });
  });
});

// =============================================================================
// HIT POINT TESTS
// =============================================================================

describe("HitPoint", () => {
  const surface = createTestSurface(
    "wall",
    { x: 0, y: 100 },
    { x: 200, y: 100 }
  );
  const ray = { from: { x: 100, y: 0 }, to: { x: 100, y: 200 } };
  const hitPoint = new HitPoint(ray, surface, 0.5, 0.5);

  describe("computeXY()", () => {
    it("computes point along ray using t parameter", () => {
      const xy = hitPoint.computeXY();
      // Ray from (100,0) to (100,200), t=0.5 means (100, 100)
      expect(xy.x).toBe(100);
      expect(xy.y).toBe(100);
    });

    it("t=0 gives ray origin", () => {
      const hit = new HitPoint(ray, surface, 0, 0.5);
      const xy = hit.computeXY();
      expect(xy.x).toBe(100);
      expect(xy.y).toBe(0);
    });

    it("t=1 gives ray target", () => {
      const hit = new HitPoint(ray, surface, 1, 0.5);
      const xy = hit.computeXY();
      expect(xy.x).toBe(100);
      expect(xy.y).toBe(200);
    });

    it("t>1 extrapolates beyond ray target", () => {
      const hit = new HitPoint(ray, surface, 2, 0.5);
      const xy = hit.computeXY();
      expect(xy.x).toBe(100);
      expect(xy.y).toBe(400);
    });
  });

  describe("equals()", () => {
    it("is equal if same surface and same s (position on surface)", () => {
      // Different ray parameter (t), but same surface position (s)
      const other = new HitPoint(ray, surface, 0.7, 0.5);
      expect(hitPoint.equals(other)).toBe(true);
    });

    it("is not equal if s differs (different position on surface)", () => {
      const other = new HitPoint(ray, surface, 0.5, 0.6);
      expect(hitPoint.equals(other)).toBe(false);
    });

    it("is not equal if surface differs", () => {
      const otherSurface = createTestSurface("other", { x: 0, y: 0 }, { x: 100, y: 0 });
      const other = new HitPoint(ray, otherSurface, 0.5, 0.5);
      expect(hitPoint.equals(other)).toBe(false);
    });

    it("is not equal to different point types", () => {
      const origin = new OriginPoint({ x: 100, y: 100 });
      expect(hitPoint.equals(origin)).toBe(false);
    });
  });

  describe("isOnSurface()", () => {
    it("returns true for the hit surface", () => {
      expect(hitPoint.isOnSurface(surface)).toBe(true);
    });

    it("returns false for a different surface", () => {
      const other = createTestSurface("other", { x: 0, y: 0 }, { x: 100, y: 0 });
      expect(hitPoint.isOnSurface(other)).toBe(false);
    });
  });

  describe("getKey()", () => {
    it("returns a unique key based on surface and t", () => {
      expect(hitPoint.getKey()).toBe("hit:wall:0.5");
    });
  });

  describe("type guard", () => {
    it("isHitPoint returns true", () => {
      expect(isHitPoint(hitPoint)).toBe(true);
    });

    it("isEndpoint returns false", () => {
      expect(isEndpoint(hitPoint)).toBe(false);
    });
  });
});

// =============================================================================
// SCREEN BOUNDARY TESTS
// =============================================================================

describe("Screen Boundaries", () => {
  const bounds = { minX: 0, maxX: 800, minY: 0, maxY: 600 };
  const screenBoundaries = createScreenBoundaries(bounds);

  describe("createScreenBoundaries()", () => {
    it("creates four boundary surfaces", () => {
      expect(screenBoundaries.all.length).toBe(4);
    });

    it("top boundary goes left to right", () => {
      expect(screenBoundaries.top.segment.start).toEqual({ x: 0, y: 0 });
      expect(screenBoundaries.top.segment.end).toEqual({ x: 800, y: 0 });
    });

    it("right boundary goes top to bottom", () => {
      expect(screenBoundaries.right.segment.start).toEqual({ x: 800, y: 0 });
      expect(screenBoundaries.right.segment.end).toEqual({ x: 800, y: 600 });
    });

    it("bottom boundary goes right to left", () => {
      expect(screenBoundaries.bottom.segment.start).toEqual({ x: 800, y: 600 });
      expect(screenBoundaries.bottom.segment.end).toEqual({ x: 0, y: 600 });
    });

    it("left boundary goes bottom to top", () => {
      expect(screenBoundaries.left.segment.start).toEqual({ x: 0, y: 600 });
      expect(screenBoundaries.left.segment.end).toEqual({ x: 0, y: 0 });
    });

    it("boundaries have screen- prefix IDs", () => {
      expect(screenBoundaries.top.id).toBe("screen-top");
      expect(screenBoundaries.right.id).toBe("screen-right");
      expect(screenBoundaries.bottom.id).toBe("screen-bottom");
      expect(screenBoundaries.left.id).toBe("screen-left");
    });
  });

  describe("isScreenBoundarySurface()", () => {
    it("returns true for screen boundaries", () => {
      expect(isScreenBoundarySurface(screenBoundaries.top)).toBe(true);
      expect(isScreenBoundarySurface(screenBoundaries.right)).toBe(true);
    });

    it("returns false for game surfaces", () => {
      const surface = createTestSurface("platform", { x: 0, y: 0 }, { x: 100, y: 0 });
      expect(isScreenBoundarySurface(surface)).toBe(false);
    });
  });

  describe("isScreenBoundary() with SourcePoints", () => {
    it("returns true for Endpoint on screen boundary", () => {
      const ep = new Endpoint(screenBoundaries.top, "start");
      expect(isScreenBoundary(ep)).toBe(true);
    });

    it("returns true for HitPoint on screen boundary", () => {
      const ray = { from: { x: 400, y: 300 }, to: { x: 400, y: -100 } };
      const hit = new HitPoint(ray, screenBoundaries.top, 0.75, 0.5);
      expect(isScreenBoundary(hit)).toBe(true);
    });

    it("returns false for Endpoint on game surface", () => {
      const surface = createTestSurface("platform", { x: 0, y: 0 }, { x: 100, y: 0 });
      const ep = new Endpoint(surface, "start");
      expect(isScreenBoundary(ep)).toBe(false);
    });

    it("returns false for OriginPoint", () => {
      const origin = new OriginPoint({ x: 0, y: 0 });
      expect(isScreenBoundary(origin)).toBe(false);
    });
  });

  describe("Screen corners as Endpoints", () => {
    it("top-left corner is shared by top and left boundaries", () => {
      const topStart = new Endpoint(screenBoundaries.top, "start");
      const leftEnd = new Endpoint(screenBoundaries.left, "end");

      // Same coordinates
      expect(topStart.computeXY()).toEqual({ x: 0, y: 0 });
      expect(leftEnd.computeXY()).toEqual({ x: 0, y: 0 });

      // But not equal (different source definitions)
      expect(topStart.equals(leftEnd)).toBe(false);
    });

    it("top-right corner is shared by top and right boundaries", () => {
      const topEnd = new Endpoint(screenBoundaries.top, "end");
      const rightStart = new Endpoint(screenBoundaries.right, "start");

      expect(topEnd.computeXY()).toEqual({ x: 800, y: 0 });
      expect(rightStart.computeXY()).toEqual({ x: 800, y: 0 });
      expect(topEnd.equals(rightStart)).toBe(false);
    });
  });
});

// =============================================================================
// POLYMORPHISM TESTS
// =============================================================================

describe("SourcePoint Polymorphism", () => {
  const surface = createTestSurface("s1", { x: 0, y: 0 }, { x: 100, y: 0 });
  const ray = { from: { x: 50, y: 50 }, to: { x: 50, y: -50 } };

  const points: SourcePoint[] = [
    new OriginPoint({ x: 50, y: 50 }),
    new Endpoint(surface, "start"),
    new HitPoint(ray, surface, 0.5, 0.5),
  ];

  it("all points have computeXY()", () => {
    for (const point of points) {
      const xy = point.computeXY();
      expect(typeof xy.x).toBe("number");
      expect(typeof xy.y).toBe("number");
    }
  });

  it("all points have equals()", () => {
    for (const point of points) {
      // Each point equals itself
      expect(point.equals(point)).toBe(true);
    }
  });

  it("all points have isOnSurface()", () => {
    for (const point of points) {
      const result = point.isOnSurface(surface);
      expect(typeof result).toBe("boolean");
    }
  });

  it("all points have getKey()", () => {
    for (const point of points) {
      const key = point.getKey();
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    }
  });

  it("all points have type discriminator", () => {
    expect(points[0]!.type).toBe("origin");
    expect(points[1]!.type).toBe("endpoint");
    expect(points[2]!.type).toBe("hit");
  });
});

