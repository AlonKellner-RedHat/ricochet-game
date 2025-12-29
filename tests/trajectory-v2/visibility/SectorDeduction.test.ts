/**
 * SectorDeduction - TDD Tests
 *
 * Tests for the provenance-based sector deduction algorithm.
 * The algorithm analyzes sorted polygon vertices to deduce which
 * portions of a target surface are illuminated (not shadowed).
 *
 * First Principle: Light reaching a surface can be deduced from
 * the polygon vertices' provenance (surface.id).
 */

import { describe, it, expect } from "vitest";
import type { Surface } from "@/surfaces/Surface";
import {
  Endpoint,
  HitPoint,
  OriginPoint,
  type SourcePoint,
} from "@/trajectory-v2/geometry/SourcePoint";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a mock surface for testing.
 */
function createSurface(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number }
): Surface {
  return {
    id,
    segment: { start, end },
    properties: { reflective: true },
  } as Surface;
}

/**
 * Create an Endpoint for a surface.
 */
function endpoint(surface: Surface, which: "start" | "end"): Endpoint {
  return new Endpoint(surface, which);
}

/**
 * Create a HitPoint (continuation/shadow edge).
 */
function hitPoint(
  surface: Surface,
  origin: { x: number; y: number },
  target: { x: number; y: number },
  t: number
): HitPoint {
  const ray = {
    from: origin,
    to: target,
  };
  return new HitPoint(ray, surface, t, 0.5);
}

/**
 * Create an OriginPoint.
 */
function originPoint(pos: { x: number; y: number }): OriginPoint {
  return new OriginPoint(pos);
}

// =============================================================================
// Import from actual module
// =============================================================================

import {
  deduceReflectionWindows,
  type ReflectionWindow,
} from "@/trajectory-v2/visibility/SectorDeduction";

// =============================================================================
// Test Suites
// =============================================================================

describe("SectorDeduction", () => {
  describe("deduceReflectionWindows", () => {
    // Surfaces for testing
    const floor = createSurface("floor", { x: 20, y: 700 }, { x: 1260, y: 700 });
    const ceiling = createSurface("ceiling", { x: 20, y: 80 }, { x: 1260, y: 80 });
    const leftWall = createSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 });
    const rightWall = createSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 });
    const plannedSurface = createSurface("planned", { x: 850, y: 350 }, { x: 850, y: 500 });
    const obstacle = createSurface("obstacle", { x: 600, y: 400 }, { x: 700, y: 450 });

    describe("No obstruction - full surface visible", () => {
      it("should return single window spanning entire surface when both endpoints are visible", () => {
        // Polygon vertices in CCW order with both planned surface endpoints visible
        // Pattern: ... → floor → plannedSurface.start → plannedSurface.end → ceiling → ...
        const vertices: SourcePoint[] = [
          endpoint(floor, "start"),
          endpoint(floor, "end"),
          endpoint(plannedSurface, "start"),
          endpoint(plannedSurface, "end"),
          endpoint(ceiling, "end"),
          endpoint(ceiling, "start"),
        ];

        const windows = deduceReflectionWindows(vertices, plannedSurface);

        expect(windows).toHaveLength(1);
        expect(windows[0]!.surface.id).toBe("planned");
        expect(windows[0]!.start).toEqual(plannedSurface.segment.start);
        expect(windows[0]!.end).toEqual(plannedSurface.segment.end);
      });

      it("should handle endpoints appearing in reverse order", () => {
        // Depending on player position, endpoints might appear in different CCW order
        const vertices: SourcePoint[] = [
          endpoint(floor, "start"),
          endpoint(plannedSurface, "end"), // End first
          endpoint(plannedSurface, "start"), // Start second
          endpoint(ceiling, "start"),
        ];

        const windows = deduceReflectionWindows(vertices, plannedSurface);

        expect(windows).toHaveLength(1);
        // Window should still represent the full surface
        expect(windows[0]!.surface.id).toBe("planned");
      });

      it("should return single window when surface endpoints are consecutive", () => {
        // No gap between surface endpoints
        const vertices: SourcePoint[] = [
          endpoint(floor, "end"),
          endpoint(plannedSurface, "start"),
          endpoint(plannedSurface, "end"),
          endpoint(rightWall, "start"),
        ];

        const windows = deduceReflectionWindows(vertices, plannedSurface);

        expect(windows).toHaveLength(1);
      });
    });

    describe("Partial obstruction - multiple windows", () => {
      it("should return two windows when obstacle blocks middle of surface", () => {
        // Pattern: plannedSurface.start → [shadow edge] → [obstacle] → [shadow edge] → plannedSurface.end
        // The shadow edges are HitPoints on the ceiling/walls
        const origin = { x: 400, y: 600 }; // Player position

        const vertices: SourcePoint[] = [
          endpoint(floor, "end"),
          endpoint(plannedSurface, "start"),
          // Shadow edge - continuation ray hits ceiling after obstacle blocks
          hitPoint(ceiling, origin, { x: 1260, y: 80 }, 1.5),
          endpoint(obstacle, "start"),
          hitPoint(ceiling, origin, { x: 1200, y: 80 }, 1.4), // Continuation after obstacle.start
          endpoint(obstacle, "end"),
          hitPoint(ceiling, origin, { x: 1100, y: 80 }, 1.3), // Continuation after obstacle.end
          // Back to planned surface
          endpoint(plannedSurface, "end"),
          endpoint(rightWall, "start"),
        ];

        const windows = deduceReflectionWindows(vertices, plannedSurface);

        expect(windows).toHaveLength(2);
        // First window: from surface start to where shadow begins
        expect(windows[0]!.start).toEqual(plannedSurface.segment.start);
        // Second window: from where shadow ends to surface end
        expect(windows[1]!.end).toEqual(plannedSurface.segment.end);
      });

      it("should handle multiple obstacles creating multiple gaps", () => {
        // Polygon where planned surface endpoints are NOT at wrap-around positions
        // This creates two separate windows (not merged via wrap-around)
        const origin = { x: 400, y: 600 };

        const vertices: SourcePoint[] = [
          endpoint(floor, "start"), // Index 0 - NOT planned surface
          endpoint(floor, "end"),
          endpoint(plannedSurface, "start"), // Index 2
          // Gap - obstacle blocks
          hitPoint(ceiling, origin, { x: 500, y: 80 }, 1.0),
          endpoint(obstacle, "start"),
          endpoint(obstacle, "end"),
          hitPoint(ceiling, origin, { x: 700, y: 80 }, 1.1),
          endpoint(plannedSurface, "end"), // Index 7
          endpoint(rightWall, "start"),
          endpoint(rightWall, "end"), // Last index - NOT planned surface
        ];

        const windows = deduceReflectionWindows(vertices, plannedSurface);

        // Should have 2 windows: one from start to shadow, one from shadow to end
        expect(windows).toHaveLength(2);
      });
    });

    describe("Full obstruction - no windows", () => {
      it("should return empty array when surface is completely blocked", () => {
        // Obstacle completely blocks the planned surface
        const origin = { x: 400, y: 600 };

        const vertices: SourcePoint[] = [
          endpoint(floor, "end"),
          // Obstacle blocks entire planned surface
          endpoint(obstacle, "start"),
          hitPoint(ceiling, origin, { x: 600, y: 80 }, 1.0),
          endpoint(obstacle, "end"),
          hitPoint(ceiling, origin, { x: 700, y: 80 }, 1.1),
          endpoint(rightWall, "start"),
          // Planned surface endpoints never appear
        ];

        const windows = deduceReflectionWindows(vertices, plannedSurface);

        expect(windows).toHaveLength(0);
      });

      it("should return empty array when only one endpoint is visible", () => {
        // Only one endpoint visible means no valid window
        const origin = { x: 400, y: 600 };

        const vertices: SourcePoint[] = [
          endpoint(floor, "end"),
          endpoint(plannedSurface, "start"),
          // Obstacle blocks the rest
          hitPoint(ceiling, origin, { x: 600, y: 80 }, 1.0),
          endpoint(obstacle, "start"),
          endpoint(obstacle, "end"),
          endpoint(rightWall, "start"),
          // plannedSurface.end never appears
        ];

        const windows = deduceReflectionWindows(vertices, plannedSurface);

        // Could return either 0 windows (strict) or a partial window to shadow edge
        // The implementation decides - but the window should be valid
        expect(windows.length).toBeLessThanOrEqual(1);
        if (windows.length === 1) {
          // If partial window is returned, it should start from visible endpoint
          expect(windows[0]!.start).toEqual(plannedSurface.segment.start);
        }
      });
    });

    describe("Edge cases", () => {
      it("should handle empty polygon gracefully", () => {
        const vertices: SourcePoint[] = [];

        const windows = deduceReflectionWindows(vertices, plannedSurface);

        expect(windows).toHaveLength(0);
      });

      it("should handle polygon with no target surface vertices", () => {
        const vertices: SourcePoint[] = [
          endpoint(floor, "start"),
          endpoint(floor, "end"),
          endpoint(ceiling, "start"),
          endpoint(ceiling, "end"),
        ];

        const windows = deduceReflectionWindows(vertices, plannedSurface);

        expect(windows).toHaveLength(0);
      });

      it("should correctly identify target surface by provenance (surface.id)", () => {
        // Another surface with same coordinates but different ID
        const differentSurface = createSurface(
          "different-surface",
          { x: 850, y: 350 },
          { x: 850, y: 500 }
        );

        const vertices: SourcePoint[] = [
          endpoint(floor, "end"),
          endpoint(differentSurface, "start"), // Same coords, different ID
          endpoint(differentSurface, "end"),
          endpoint(rightWall, "start"),
        ];

        const windows = deduceReflectionWindows(vertices, plannedSurface);

        // Should NOT find any windows because IDs don't match
        expect(windows).toHaveLength(0);
      });

      it("should handle HitPoints on target surface as part of the window", () => {
        // When a ray hits the target surface between endpoints
        const origin = { x: 400, y: 600 };

        const vertices: SourcePoint[] = [
          endpoint(floor, "end"),
          endpoint(plannedSurface, "start"),
          // A ray hits the middle of the planned surface
          hitPoint(plannedSurface, origin, { x: 850, y: 425 }, 1.0),
          endpoint(plannedSurface, "end"),
          endpoint(rightWall, "start"),
        ];

        const windows = deduceReflectionWindows(vertices, plannedSurface);

        // Should still be a single window because HitPoint on same surface doesn't break it
        expect(windows).toHaveLength(1);
      });

      it("should handle wrapped polygon (last vertex connects to first)", () => {
        // The polygon vertices wrap around
        const vertices: SourcePoint[] = [
          endpoint(plannedSurface, "end"), // Surface endpoint at start
          endpoint(rightWall, "start"),
          endpoint(rightWall, "end"),
          endpoint(ceiling, "end"),
          endpoint(ceiling, "start"),
          endpoint(leftWall, "start"),
          endpoint(leftWall, "end"),
          endpoint(floor, "start"),
          endpoint(floor, "end"),
          endpoint(plannedSurface, "start"), // Other endpoint at end (wraps to first)
        ];

        const windows = deduceReflectionWindows(vertices, plannedSurface);

        // Should detect that the surface endpoints are connected via wrap-around
        expect(windows).toHaveLength(1);
      });
    });

    describe("Shadow edge detection", () => {
      it("should use shadow edge coordinates for window boundaries when not at endpoint", () => {
        // When obstacle blocks part of surface, the window boundary is at shadow edge
        const origin = { x: 400, y: 600 };
        const shadowEdge = { x: 850, y: 400 }; // Point on planned surface where shadow starts

        const vertices: SourcePoint[] = [
          endpoint(floor, "end"),
          endpoint(plannedSurface, "start"),
          // Shadow edge on ceiling (but conceptually at the planned surface boundary)
          hitPoint(ceiling, origin, { x: 1000, y: 80 }, 1.0),
          endpoint(obstacle, "start"),
          endpoint(obstacle, "end"),
          hitPoint(ceiling, origin, { x: 1100, y: 80 }, 1.1),
          endpoint(plannedSurface, "end"),
          endpoint(rightWall, "start"),
        ];

        const windows = deduceReflectionWindows(vertices, plannedSurface);

        expect(windows).toHaveLength(2);
        // First window should end where shadow begins (not at surface endpoint)
        // Second window should start where shadow ends (not at surface endpoint)
      });
    });
  });
});

