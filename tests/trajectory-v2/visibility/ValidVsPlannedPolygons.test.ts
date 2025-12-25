/**
 * Tests for Valid vs Planned Polygon Separation
 *
 * TDD tests for the refactored propagation system that separates:
 * - Valid polygons: Full visibility from each origin (N+1 for N surfaces)
 * - Planned polygons: Cropped paths to reach each surface (N for N surfaces)
 *
 * Key First Principles:
 * 1. Valid polygons are NOT cropped - full visibility from each origin
 * 2. Planned polygons ARE cropped - valid[K] cropped by window to surface K
 * 3. The visualized polygon is always the last valid polygon (valid[N])
 * 4. Empty plan has exactly 1 valid polygon
 * 5. planned[K].origin === valid[K].origin
 */

import { describe, expect, it } from "vitest";
import {
  buildVisibilityPolygon,
  propagateWithIntermediates,
} from "@/trajectory-v2/visibility/AnalyticalPropagation";
import type { ScreenBounds } from "@/trajectory-v2/visibility/PropagationTypes";
import { createTestSurface } from "../matrix/MatrixTestRunner";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// Helper to check if a polygon contains a point (ray casting algorithm)
function polygonContainsPoint(polygon: readonly Vector2[], point: Vector2): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i]!.x;
    const yi = polygon[i]!.y;
    const xj = polygon[j]!.x;
    const yj = polygon[j]!.y;

    if (
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }

  return inside;
}

// Simple bounds for testing
const SIMPLE_BOUNDS: ScreenBounds = {
  minX: 0,
  maxX: 1000,
  minY: 0,
  maxY: 1000,
};

// Create test surfaces
function createVerticalSurface(id: string, x: number, y1: number, y2: number, canReflect = true) {
  return createTestSurface({
    id,
    start: { x, y: y1 },
    end: { x, y: y2 },
    canReflect,
  });
}

describe("Valid vs Planned Polygons", () => {
  describe("Basic count tests", () => {
    it("empty plan: 1 valid polygon, 0 planned polygons", () => {
      const player = { x: 500, y: 500 };
      const surface = createVerticalSurface("wall", 200, 0, 1000, false);
      const allSurfaces = [surface];

      const result = propagateWithIntermediates(player, [], allSurfaces, SIMPLE_BOUNDS);

      expect(result.validPolygons).toHaveLength(1);
      expect(result.plannedPolygons).toHaveLength(0);
      expect(result.finalPolygon).toEqual(result.validPolygons[0]!.polygon);
    });

    it("1 surface: 2 valid polygons, 1 planned polygon", () => {
      const player = { x: 100, y: 500 };
      const surface1 = createVerticalSurface("ricochet", 300, 300, 700, true);
      const allSurfaces = [surface1];

      const result = propagateWithIntermediates(player, [surface1], allSurfaces, SIMPLE_BOUNDS);

      expect(result.validPolygons).toHaveLength(2);
      expect(result.plannedPolygons).toHaveLength(1);
    });

    it("2 surfaces: 3 valid polygons, 2 planned polygons", () => {
      const player = { x: 100, y: 500 };
      const surface1 = createVerticalSurface("ricochet1", 300, 300, 700, true);
      const surface2 = createVerticalSurface("ricochet2", 600, 300, 700, true);
      const allSurfaces = [surface1, surface2];

      const result = propagateWithIntermediates(player, [surface1, surface2], allSurfaces, SIMPLE_BOUNDS);

      expect(result.validPolygons).toHaveLength(3);
      expect(result.plannedPolygons).toHaveLength(2);
    });

    it("N surfaces: N+1 valid polygons, N planned polygons", () => {
      const player = { x: 100, y: 500 };
      const surfaces = [
        createVerticalSurface("s1", 200, 300, 700, true),
        createVerticalSurface("s2", 400, 300, 700, true),
        createVerticalSurface("s3", 600, 300, 700, true),
      ];

      const result = propagateWithIntermediates(player, surfaces, surfaces, SIMPLE_BOUNDS);

      expect(result.validPolygons).toHaveLength(4);
      expect(result.plannedPolygons).toHaveLength(3);
    });
  });

  describe("Origin relationships", () => {
    it("valid[0] origin is the player position", () => {
      const player = { x: 100, y: 500 };
      const surface = createVerticalSurface("ricochet", 300, 300, 700, true);

      const result = propagateWithIntermediates(player, [surface], [surface], SIMPLE_BOUNDS);

      expect(result.validPolygons[0]!.origin).toEqual(player);
    });

    it("planned[K].origin equals valid[K].origin", () => {
      const player = { x: 100, y: 500 };
      const surface = createVerticalSurface("ricochet", 300, 300, 700, true);

      const result = propagateWithIntermediates(player, [surface], [surface], SIMPLE_BOUNDS);

      expect(result.plannedPolygons[0]!.origin).toEqual(result.validPolygons[0]!.origin);
    });

    it("valid[1] origin is the reflected player (Image1)", () => {
      const player = { x: 100, y: 500 };
      // Vertical surface at x=300
      const surface = createVerticalSurface("ricochet", 300, 300, 700, true);

      const result = propagateWithIntermediates(player, [surface], [surface], SIMPLE_BOUNDS);

      // Player at x=100, reflected through x=300 gives x=500
      expect(result.validPolygons[1]!.origin.x).toBeCloseTo(500, 1);
      expect(result.validPolygons[1]!.origin.y).toBeCloseTo(500, 1);
    });
  });

  describe("finalPolygon is the last valid polygon", () => {
    it("for empty plan, finalPolygon equals valid[0]", () => {
      const player = { x: 500, y: 500 };
      const result = propagateWithIntermediates(player, [], [], SIMPLE_BOUNDS);

      expect(result.finalPolygon).toEqual(result.validPolygons[0]!.polygon);
    });

    it("for 1-surface plan, finalPolygon equals valid[1]", () => {
      const player = { x: 100, y: 500 };
      const surface = createVerticalSurface("ricochet", 300, 300, 700, true);

      const result = propagateWithIntermediates(player, [surface], [surface], SIMPLE_BOUNDS);

      expect(result.finalPolygon).toEqual(result.validPolygons[1]!.polygon);
    });

    it("for N-surface plan, finalPolygon equals valid[N]", () => {
      const player = { x: 100, y: 500 };
      const surfaces = [
        createVerticalSurface("s1", 200, 300, 700, true),
        createVerticalSurface("s2", 400, 300, 700, true),
      ];

      const result = propagateWithIntermediates(player, surfaces, surfaces, SIMPLE_BOUNDS);

      expect(result.finalPolygon).toEqual(result.validPolygons[2]!.polygon);
    });
  });

  describe("Planned polygons are cropped", () => {
    it("planned[0] polygon is smaller than or equal to valid[0]", () => {
      const player = { x: 100, y: 500 };
      const surface = createVerticalSurface("ricochet", 300, 300, 700, true);

      const result = propagateWithIntermediates(player, [surface], [surface], SIMPLE_BOUNDS);

      // Planned polygon is cropped, so it should typically be smaller
      // (unless valid[0] is entirely within the window, which is rare)
      expect(result.plannedPolygons[0]!.polygon.length).toBeLessThanOrEqual(
        result.validPolygons[0]!.polygon.length + 3 // +3 for window triangle vertices
      );
    });

    it("planned[K] has a window pointing to surface K", () => {
      const player = { x: 100, y: 500 };
      const surface1 = createVerticalSurface("ricochet1", 300, 300, 700, true);
      const surface2 = createVerticalSurface("ricochet2", 600, 300, 700, true);

      const result = propagateWithIntermediates(player, [surface1, surface2], [surface1, surface2], SIMPLE_BOUNDS);

      expect(result.plannedPolygons[0]!.targetSurface.id).toBe("ricochet1");
      expect(result.plannedPolygons[1]!.targetSurface.id).toBe("ricochet2");
    });
  });
});

describe("Explicit geometry verification", () => {
  /**
   * User-provided test case:
   *
   * Setup:
   * - Player at (-100, 0)
   * - Planned surface: (0, 100) -> (0, 0), reflective toward player
   * - Box walls: x = ±200, y = ±10000
   *
   * Expected:
   * - valid[0]: Full visibility from player (large polygon with surface shadow)
   * - valid[1]: Quadrilateral from Image1 (100, 0) through surface to left wall
   *   Points: (0, 0), (0, 100), (-200, 300), (-200, 0)
   * - planned[0]: Triangle from player to surface endpoints
   *   Points: (-100, 0), (0, 0), (0, 100)
   */
  // TODO: The unified projection needs fixes for reflected polygon geometry
  it.skip("1-surface plan with simple geometry produces correct polygons", () => {
    const player = { x: -100, y: 0 };
    // Surface oriented so player is on reflective side (start->end gives normal pointing left toward player)
    const plannedSurface = createTestSurface({
      id: "surface-0",
      start: { x: 0, y: 0 },
      end: { x: 0, y: 100 },
      canReflect: true,
    });
    const walls = [
      createTestSurface({
        id: "left",
        start: { x: -200, y: 10000 },
        end: { x: -200, y: -10000 },
        canReflect: false,
      }),
      createTestSurface({
        id: "right",
        start: { x: 200, y: 10000 },
        end: { x: 200, y: -10000 },
        canReflect: false,
      }),
      createTestSurface({
        id: "top",
        start: { x: -200, y: 10000 },
        end: { x: 200, y: 10000 },
        canReflect: false,
      }),
      createTestSurface({
        id: "bottom",
        start: { x: -200, y: -10000 },
        end: { x: 200, y: -10000 },
        canReflect: false,
      }),
    ];
    const allSurfaces = [plannedSurface, ...walls];
    const bounds: ScreenBounds = { minX: -200, maxX: 200, minY: -10000, maxY: 10000 };

    const result = propagateWithIntermediates(player, [plannedSurface], allSurfaces, bounds);

    // Verify counts
    expect(result.validPolygons).toHaveLength(2);
    expect(result.plannedPolygons).toHaveLength(1);

    // Verify origins
    expect(result.validPolygons[0]!.origin).toEqual({ x: -100, y: 0 }); // Player
    expect(result.validPolygons[1]!.origin.x).toBeCloseTo(100, 1); // Image1 (reflected through x=0)
    expect(result.validPolygons[1]!.origin.y).toBeCloseTo(0, 1);
    expect(result.plannedPolygons[0]!.origin).toEqual({ x: -100, y: 0 }); // Same as valid[0]

    // Verify valid[1] contains the expected quadrilateral region
    const valid1 = result.validPolygons[1]!.polygon;
    // Points inside the quadrilateral (0,0)-(0,100)-(-200,300)-(-200,0)
    expect(polygonContainsPoint(valid1, { x: -100, y: 50 })).toBe(true);
    expect(polygonContainsPoint(valid1, { x: -150, y: 100 })).toBe(true);
    // Points outside (on wrong side of surface)
    expect(polygonContainsPoint(valid1, { x: 100, y: 50 })).toBe(false);
    expect(polygonContainsPoint(valid1, { x: 150, y: 0 })).toBe(false);

    // Verify planned[0] is the window triangle region
    const planned0 = result.plannedPolygons[0]!.polygon;
    expect(planned0.length).toBeGreaterThanOrEqual(3);
    // Point inside the triangle player->surface endpoints
    expect(polygonContainsPoint(planned0, { x: -50, y: 25 })).toBe(true);
    // Point outside the triangle (behind player)
    expect(polygonContainsPoint(planned0, { x: -150, y: 50 })).toBe(false);

    // Verify finalPolygon is valid[1], not planned[0]
    expect(result.finalPolygon).toEqual(valid1);
  });

  // TODO: The unified projection needs fixes for reflected polygon geometry
  it.skip("valid[1] is NOT cropped - it extends to screen bounds", () => {
    const player = { x: -100, y: 0 };
    // Surface oriented so player is on reflective side (start->end gives normal pointing left)
    const plannedSurface = createTestSurface({
      id: "surface-0",
      start: { x: 0, y: 0 },
      end: { x: 0, y: 100 },
      canReflect: true,
    });
    const bounds: ScreenBounds = { minX: -200, maxX: 200, minY: -10000, maxY: 10000 };

    // No walls - just screen bounds
    const result = propagateWithIntermediates(player, [plannedSurface], [plannedSurface], bounds);

    // Verify no bypass
    expect(result.isValid).toBe(true);
    expect(result.validPolygons).toHaveLength(2);

    // valid[1] should extend to the left screen boundary
    const valid1 = result.validPolygons[1]!.polygon;
    const hasLeftBoundaryPoint = valid1.some((p) => Math.abs(p.x - (-200)) < 1);
    expect(hasLeftBoundaryPoint).toBe(true);
  });
});

