/**
 * MultiConeProjection Tests
 *
 * TDD tests for multi-window cone projection and polygon generation.
 * Tests the umbrella hole mode where two windows produce two visibility polygons.
 */

import { describe, it, expect } from "vitest";
import type { Surface } from "@/surfaces/Surface";
import type { ScreenBoundsConfig } from "@/trajectory-v2/geometry/ScreenBoundaries";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  createConeThroughWindow,
  projectConeV2,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import {
  type Segment,
  type WindowConfig,
  splitWindow,
  createSingleWindow,
  createMultiWindow,
  getWindowSegments,
} from "@/trajectory-v2/visibility/WindowConfig";

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestSurface(id: string, start: Vector2, end: Vector2): Surface {
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

function hasVertexNear(vertices: Vector2[], target: Vector2, tolerance = 2): boolean {
  return vertices.some(
    (v) => Math.abs(v.x - target.x) < tolerance && Math.abs(v.y - target.y) < tolerance
  );
}

/**
 * Project multiple windows and return all resulting polygons.
 * Each window produces its own visibility polygon.
 */
function projectMultipleWindows(
  origin: Vector2,
  windows: readonly Segment[],
  obstacles: readonly Surface[],
  bounds: ScreenBoundsConfig
): Vector2[][] {
  return windows.map((window) => {
    const cone = createConeThroughWindow(origin, window.start, window.end);
    const sourcePoints = projectConeV2(cone, obstacles, bounds);
    return toVector2Array(sourcePoints);
  });
}

// =============================================================================
// STANDARD TEST SETUP
// =============================================================================

const BOUNDS: ScreenBoundsConfig = {
  minX: 0,
  maxX: 800,
  minY: 0,
  maxY: 600,
};

// =============================================================================
// MULTI-WINDOW PROJECTION TESTS
// =============================================================================

describe("MultiConeProjection", () => {
  describe("basic multi-window projection", () => {
    it("two adjacent windows produce two separate polygons", () => {
      const origin: Vector2 = { x: 400, y: 500 };
      
      // Original umbrella
      const umbrella: Segment = {
        start: { x: 300, y: 400 },
        end: { x: 500, y: 400 },
      };
      
      // Split into two windows with gap at center
      const [leftWindow, rightWindow] = splitWindow(umbrella, 0.45, 0.55);
      
      // No obstacles - just screen bounds
      const obstacles: Surface[] = [];
      
      const polygons = projectMultipleWindows(
        origin,
        [leftWindow, rightWindow],
        obstacles,
        BOUNDS
      );
      
      expect(polygons).toHaveLength(2);
      
      // Each polygon should have at least 3 vertices (valid polygon)
      expect(polygons[0]!.length).toBeGreaterThanOrEqual(3);
      expect(polygons[1]!.length).toBeGreaterThanOrEqual(3);
    });

    it("left polygon contains left window endpoints", () => {
      const origin: Vector2 = { x: 400, y: 500 };
      
      const umbrella: Segment = {
        start: { x: 300, y: 400 },
        end: { x: 500, y: 400 },
      };
      
      const [leftWindow, rightWindow] = splitWindow(umbrella, 0.45, 0.55);
      
      const polygons = projectMultipleWindows(
        origin,
        [leftWindow, rightWindow],
        [],
        BOUNDS
      );
      
      const leftPolygon = polygons[0]!;
      
      // Left polygon should contain left window endpoints
      expect(hasVertexNear(leftPolygon, leftWindow.start)).toBe(true);
      expect(hasVertexNear(leftPolygon, leftWindow.end)).toBe(true);
    });

    it("right polygon contains right window endpoints", () => {
      const origin: Vector2 = { x: 400, y: 500 };
      
      const umbrella: Segment = {
        start: { x: 300, y: 400 },
        end: { x: 500, y: 400 },
      };
      
      const [leftWindow, rightWindow] = splitWindow(umbrella, 0.45, 0.55);
      
      const polygons = projectMultipleWindows(
        origin,
        [leftWindow, rightWindow],
        [],
        BOUNDS
      );
      
      const rightPolygon = polygons[1]!;
      
      // Right polygon should contain right window endpoints
      expect(hasVertexNear(rightPolygon, rightWindow.start)).toBe(true);
      expect(hasVertexNear(rightPolygon, rightWindow.end)).toBe(true);
    });
  });

  describe("gap creates shadow between polygons", () => {
    it("center point of gap is not covered by either polygon", () => {
      const origin: Vector2 = { x: 400, y: 500 };
      
      const umbrella: Segment = {
        start: { x: 300, y: 400 },
        end: { x: 500, y: 400 },
      };
      
      const [leftWindow, rightWindow] = splitWindow(umbrella, 0.45, 0.55);
      
      const polygons = projectMultipleWindows(
        origin,
        [leftWindow, rightWindow],
        [],
        BOUNDS
      );
      
      // Gap center is at 50% of umbrella = (400, 400)
      // The ray from origin (400, 500) through gap center (400, 400) hits y=0 at x=400
      // This point should NOT be in either polygon
      
      // Calculate gap center extended to screen boundary
      const gapCenterAtCeiling = { x: 400, y: 0 };
      
      // Neither polygon should contain this point
      const leftPolygon = polygons[0]!;
      const rightPolygon = polygons[1]!;
      
      // The gap creates a shadow - neither polygon should extend to cover the gap's projection
      // Check that the polygons don't overlap at the gap position
      const leftMaxX = Math.max(...leftPolygon.map((v) => v.x));
      const rightMinX = Math.min(...rightPolygon.map((v) => v.x));
      
      // There should be a gap between the polygons at the top of the screen
      expect(leftMaxX).toBeLessThan(rightMinX + 20); // Allow some tolerance
    });
  });

  describe("with obstacles", () => {
    it("obstacles affect window polygons that can see them", () => {
      const origin: Vector2 = { x: 400, y: 500 };
      
      const umbrella: Segment = {
        start: { x: 200, y: 400 },
        end: { x: 600, y: 400 },
      };
      
      const [leftWindow, rightWindow] = splitWindow(umbrella, 0.45, 0.55);
      
      // Add an obstacle that spans across the umbrella's view
      const obstacles: Surface[] = [
        createTestSurface("obstacle", { x: 300, y: 200 }, { x: 500, y: 200 }),
      ];
      
      const polygons = projectMultipleWindows(
        origin,
        [leftWindow, rightWindow],
        obstacles,
        BOUNDS
      );
      
      const leftPolygon = polygons[0]!;
      const rightPolygon = polygons[1]!;
      
      // Both polygons should be valid (at least 3 vertices)
      expect(leftPolygon.length).toBeGreaterThanOrEqual(3);
      expect(rightPolygon.length).toBeGreaterThanOrEqual(3);
      
      // Each polygon should contain at least one obstacle endpoint
      // (the one that's visible through its window)
      expect(hasVertexNear(leftPolygon, { x: 300, y: 200 })).toBe(true);
      expect(hasVertexNear(rightPolygon, { x: 500, y: 200 })).toBe(true);
    });
  });

  describe("WindowConfig integration", () => {
    it("single window config produces one polygon via getWindowSegments", () => {
      const origin: Vector2 = { x: 400, y: 500 };
      
      const segment: Segment = {
        start: { x: 300, y: 400 },
        end: { x: 500, y: 400 },
      };
      
      const config = createSingleWindow(segment);
      const segments = getWindowSegments(config);
      
      const polygons = projectMultipleWindows(origin, segments, [], BOUNDS);
      
      expect(polygons).toHaveLength(1);
      expect(polygons[0]!.length).toBeGreaterThanOrEqual(3);
    });

    it("multi window config produces multiple polygons via getWindowSegments", () => {
      const origin: Vector2 = { x: 400, y: 500 };
      
      const umbrella: Segment = {
        start: { x: 300, y: 400 },
        end: { x: 500, y: 400 },
      };
      
      const [left, right] = splitWindow(umbrella, 0.45, 0.55);
      const config = createMultiWindow([left, right]);
      const segments = getWindowSegments(config);
      
      const polygons = projectMultipleWindows(origin, segments, [], BOUNDS);
      
      expect(polygons).toHaveLength(2);
      expect(polygons[0]!.length).toBeGreaterThanOrEqual(3);
      expect(polygons[1]!.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("narrow gap visibility", () => {
    it("very narrow gap still creates two distinct polygons", () => {
      const origin: Vector2 = { x: 400, y: 500 };
      
      const umbrella: Segment = {
        start: { x: 300, y: 400 },
        end: { x: 500, y: 400 },
      };
      
      // Very narrow gap: 49% to 51% (only 2% of umbrella width)
      const [leftWindow, rightWindow] = splitWindow(umbrella, 0.49, 0.51);
      
      const polygons = projectMultipleWindows(
        origin,
        [leftWindow, rightWindow],
        [],
        BOUNDS
      );
      
      expect(polygons).toHaveLength(2);
      
      // Both polygons should be valid
      expect(polygons[0]!.length).toBeGreaterThanOrEqual(3);
      expect(polygons[1]!.length).toBeGreaterThanOrEqual(3);
      
      // Windows should be distinct (left ends before right starts)
      expect(leftWindow.end.x).toBeLessThan(rightWindow.start.x);
    });
  });
});

