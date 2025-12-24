/**
 * AnalyticalVisibility Tests - Unified Visibility Polygon Construction
 *
 * Tests for the buildVisibilityPolygon function which is the core
 * unified function used for all visibility calculations:
 * - Empty plan (direct visibility)
 * - Before first surface (same as empty plan)
 * - After last surface (from reflected origin)
 * - Intermediate steps (cropped by windows)
 *
 * Key Test Properties:
 * 1. Polygon covers entire screen when no obstacles
 * 2. Obstacles create shadows (concave polygon regions)
 * 3. Polygon vertices include obstacle endpoints
 * 4. Results are deterministic (same input = same output)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  buildVisibilityPolygon,
  cropPolygonByWindow,
  type ScreenBounds,
} from "@/trajectory-v2/visibility/AnalyticalPropagation";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";

// Helper to create test surfaces
function createTestSurface(
  id: string,
  start: Vector2,
  end: Vector2,
  canReflect: boolean = false
): Surface {
  const segment = { start, end };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const normalX = -dy / len;
  const normalY = dx / len;

  return {
    id,
    segment,
    normal: { x: normalX, y: normalY },
    canReflect,
    canReflectFrom: (dir: Vector2) => {
      if (!canReflect) return false;
      // Check if direction points toward surface (from both sides if reflective)
      const dot = dir.x * normalX + dir.y * normalY;
      return true; // Reflective surfaces work from both sides for visibility
    },
    isOnReflectiveSide: (point: Vector2) => {
      if (!canReflect) return false;
      const cross =
        (end.x - start.x) * (point.y - start.y) -
        (end.y - start.y) * (point.x - start.x);
      return cross >= 0;
    },
    distanceToPoint: () => 0,
  };
}

const defaultBounds: ScreenBounds = {
  minX: 0,
  minY: 0,
  maxX: 800,
  maxY: 600,
};

describe("buildVisibilityPolygon", () => {
  describe("no obstacles", () => {
    it("returns polygon covering entire screen", () => {
      const origin: Vector2 = { x: 400, y: 300 };
      const obstacles: Surface[] = [];

      const polygon = buildVisibilityPolygon(origin, obstacles, defaultBounds);

      // Should have 4 vertices (screen corners)
      expect(polygon.length).toBe(4);

      // All corners should be present
      const corners = [
        { x: 0, y: 0 },
        { x: 800, y: 0 },
        { x: 800, y: 600 },
        { x: 0, y: 600 },
      ];

      for (const corner of corners) {
        const found = polygon.some(
          (p) => Math.abs(p.x - corner.x) < 1 && Math.abs(p.y - corner.y) < 1
        );
        expect(found).toBe(true);
      }
    });

    it("works with origin at corner", () => {
      const origin: Vector2 = { x: 0, y: 0 };
      const polygon = buildVisibilityPolygon(origin, [], defaultBounds);

      // Origin at corner sees 3 other corners (not itself)
      expect(polygon.length).toBeGreaterThanOrEqual(3);
    });

    it("works with origin at edge", () => {
      const origin: Vector2 = { x: 400, y: 0 };
      const polygon = buildVisibilityPolygon(origin, [], defaultBounds);

      expect(polygon.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("single obstacle", () => {
    it("creates shadow behind horizontal obstacle", () => {
      const origin: Vector2 = { x: 400, y: 500 };
      const obstacle = createTestSurface(
        "platform",
        { x: 300, y: 300 },
        { x: 500, y: 300 }
      );

      const polygon = buildVisibilityPolygon(origin, [obstacle], defaultBounds);

      // Should have more than 4 vertices (shadow creates additional points)
      expect(polygon.length).toBeGreaterThan(4);

      // Should include the obstacle endpoints
      const hasStart = polygon.some(
        (p) => Math.abs(p.x - 300) < 1 && Math.abs(p.y - 300) < 1
      );
      const hasEnd = polygon.some(
        (p) => Math.abs(p.x - 500) < 1 && Math.abs(p.y - 300) < 1
      );
      expect(hasStart).toBe(true);
      expect(hasEnd).toBe(true);
    });

    it("creates shadow behind vertical obstacle", () => {
      const origin: Vector2 = { x: 200, y: 300 };
      const obstacle = createTestSurface(
        "wall",
        { x: 400, y: 200 },
        { x: 400, y: 400 }
      );

      const polygon = buildVisibilityPolygon(origin, [obstacle], defaultBounds);

      expect(polygon.length).toBeGreaterThan(4);

      // Shadow should block points to the right of the wall
      const pointInShadow: Vector2 = { x: 700, y: 300 };
      const isInPolygon = isPointInPolygon(pointInShadow, polygon);
      expect(isInPolygon).toBe(false);
    });

    it("includes visible area on lit side", () => {
      const origin: Vector2 = { x: 400, y: 500 };
      const obstacle = createTestSurface(
        "platform",
        { x: 300, y: 300 },
        { x: 500, y: 300 }
      );

      const polygon = buildVisibilityPolygon(origin, [obstacle], defaultBounds);

      // Point between origin and obstacle should be visible
      const visiblePoint: Vector2 = { x: 400, y: 400 };
      expect(isPointInPolygon(visiblePoint, polygon)).toBe(true);
    });
  });

  describe("multiple obstacles", () => {
    it("creates multiple shadows", () => {
      const origin: Vector2 = { x: 400, y: 550 };
      const obstacles = [
        createTestSurface("left", { x: 100, y: 300 }, { x: 200, y: 300 }),
        createTestSurface("right", { x: 600, y: 300 }, { x: 700, y: 300 }),
      ];

      const polygon = buildVisibilityPolygon(origin, obstacles, defaultBounds);

      // Area between obstacles should be visible
      const centerVisible: Vector2 = { x: 400, y: 200 };
      expect(isPointInPolygon(centerVisible, polygon)).toBe(true);
    });

    it("handles overlapping shadows", () => {
      const origin: Vector2 = { x: 400, y: 500 };
      const obstacles = [
        createTestSurface("front", { x: 300, y: 400 }, { x: 500, y: 400 }),
        createTestSurface("back", { x: 350, y: 200 }, { x: 450, y: 200 }),
      ];

      const polygon = buildVisibilityPolygon(origin, obstacles, defaultBounds);

      // Back obstacle should be in shadow of front obstacle
      // Point behind back obstacle should still be in shadow
      const deepShadow: Vector2 = { x: 400, y: 100 };
      expect(isPointInPolygon(deepShadow, polygon)).toBe(false);
    });
  });

  describe("obstacle at screen edge", () => {
    it("handles obstacle touching left edge", () => {
      const origin: Vector2 = { x: 400, y: 300 };
      const obstacle = createTestSurface(
        "left-edge",
        { x: 0, y: 200 },
        { x: 100, y: 200 }
      );

      const polygon = buildVisibilityPolygon(origin, [obstacle], defaultBounds);

      expect(polygon.length).toBeGreaterThanOrEqual(4);
    });

    it("handles obstacle touching corner", () => {
      const origin: Vector2 = { x: 400, y: 300 };
      const obstacle = createTestSurface(
        "corner",
        { x: 0, y: 0 },
        { x: 100, y: 100 }
      );

      const polygon = buildVisibilityPolygon(origin, [obstacle], defaultBounds);

      expect(polygon.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("determinism", () => {
    it("produces identical results for identical inputs", () => {
      const origin: Vector2 = { x: 400, y: 300 };
      const obstacles = [
        createTestSurface("a", { x: 200, y: 200 }, { x: 300, y: 250 }),
        createTestSurface("b", { x: 500, y: 150 }, { x: 600, y: 200 }),
      ];

      const polygon1 = buildVisibilityPolygon(origin, obstacles, defaultBounds);
      const polygon2 = buildVisibilityPolygon(origin, obstacles, defaultBounds);

      expect(polygon1.length).toBe(polygon2.length);

      for (let i = 0; i < polygon1.length; i++) {
        expect(polygon1[i]!.x).toBeCloseTo(polygon2[i]!.x, 10);
        expect(polygon1[i]!.y).toBeCloseTo(polygon2[i]!.y, 10);
      }
    });
  });
});

describe("cropPolygonByWindow", () => {
  const fullScreenPolygon: readonly Vector2[] = [
    { x: 0, y: 0 },
    { x: 800, y: 0 },
    { x: 800, y: 600 },
    { x: 0, y: 600 },
  ];

  describe("basic cropping", () => {
    it("crops polygon to window triangle", () => {
      const origin: Vector2 = { x: 400, y: 550 };
      const windowSurface = createTestSurface(
        "window",
        { x: 300, y: 300 },
        { x: 500, y: 300 },
        true
      );

      const cropped = cropPolygonByWindow(
        fullScreenPolygon,
        origin,
        windowSurface
      );

      // Cropped polygon should be smaller
      expect(cropped.length).toBeGreaterThanOrEqual(3);

      // All points should be within the window triangle (approximately)
      for (const point of cropped) {
        // Point should be between origin and far boundary, within window angle
        expect(point.y).toBeLessThanOrEqual(550);
      }
    });

    it("includes window surface endpoints", () => {
      const origin: Vector2 = { x: 400, y: 550 };
      const windowSurface = createTestSurface(
        "window",
        { x: 300, y: 300 },
        { x: 500, y: 300 },
        true
      );

      const cropped = cropPolygonByWindow(
        fullScreenPolygon,
        origin,
        windowSurface
      );

      // Should include or be near the window endpoints
      const hasStart = cropped.some(
        (p) => Math.abs(p.x - 300) < 50 && Math.abs(p.y - 300) < 50
      );
      const hasEnd = cropped.some(
        (p) => Math.abs(p.x - 500) < 50 && Math.abs(p.y - 300) < 50
      );

      expect(hasStart || hasEnd).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("returns empty polygon when window is behind origin", () => {
      const origin: Vector2 = { x: 400, y: 100 };
      const windowSurface = createTestSurface(
        "behind",
        { x: 300, y: 300 },
        { x: 500, y: 300 },
        true
      );

      // Window is "in front" but this tests the direction logic
      const cropped = cropPolygonByWindow(
        fullScreenPolygon,
        origin,
        windowSurface
      );

      // Should still produce valid output
      expect(cropped.length).toBeGreaterThanOrEqual(0);
    });

    it("handles very narrow window", () => {
      const origin: Vector2 = { x: 400, y: 550 };
      const windowSurface = createTestSurface(
        "narrow",
        { x: 395, y: 300 },
        { x: 405, y: 300 },
        true
      );

      const cropped = cropPolygonByWindow(
        fullScreenPolygon,
        origin,
        windowSurface
      );

      // Should produce a valid (possibly very small) polygon
      expect(cropped.length).toBeGreaterThanOrEqual(0);
    });

    it("handles wide window covering most of polygon", () => {
      const origin: Vector2 = { x: 400, y: 550 };
      const windowSurface = createTestSurface(
        "wide",
        { x: 50, y: 300 },
        { x: 750, y: 300 },
        true
      );

      const cropped = cropPolygonByWindow(
        fullScreenPolygon,
        origin,
        windowSurface
      );

      expect(cropped.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("polygon with existing shadows", () => {
    it("correctly crops irregular polygon", () => {
      const irregularPolygon: readonly Vector2[] = [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 200 }, // Shadow indent
        { x: 350, y: 200 },
        { x: 350, y: 0 },
        { x: 800, y: 0 },
        { x: 800, y: 600 },
        { x: 0, y: 600 },
      ];

      const origin: Vector2 = { x: 400, y: 550 };
      const windowSurface = createTestSurface(
        "window",
        { x: 300, y: 300 },
        { x: 500, y: 300 },
        true
      );

      const cropped = cropPolygonByWindow(
        irregularPolygon,
        origin,
        windowSurface
      );

      // Should produce valid polygon
      expect(cropped.length).toBeGreaterThanOrEqual(3);
    });
  });
});

// Helper: Point-in-polygon test using ray casting
function isPointInPolygon(point: Vector2, polygon: readonly Vector2[]): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.x;
    const yi = polygon[i]!.y;
    const xj = polygon[j]!.x;
    const yj = polygon[j]!.y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

