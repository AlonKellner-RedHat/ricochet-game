/**
 * ConeProjectionV2 Tests
 *
 * Tests the Source-of-Truth based visibility polygon calculation.
 * Verifies that epsilon comparisons are replaced with exact SourcePoint operations.
 */

import type { Surface } from "@/surfaces/Surface";
import type { ScreenBoundsConfig } from "@/trajectory-v2/geometry/ScreenBoundaries";
import {
  Endpoint,
  type HitPoint,
  isEndpoint,
  isHitPoint,
} from "@/trajectory-v2/geometry/SourcePoint";
import { type SurfaceChain, createSingleSurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  createConeThroughWindow,
  createFullCone,
  isPointInCone,
  projectConeV2,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { preparePolygonForRendering } from "@/trajectory-v2/visibility/RenderingDedup";
import { describe, expect, it } from "vitest";

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

/** Wrap an array of surfaces in chains for testing */
function toChains(surfaces: Surface[]): SurfaceChain[] {
  return surfaces.map((s) => createSingleSurfaceChain(s));
}

function hasVertexNear(vertices: Vector2[], target: Vector2, tolerance = 1): boolean {
  return vertices.some(
    (v) => Math.abs(v.x - target.x) < tolerance && Math.abs(v.y - target.y) < tolerance
  );
}

// =============================================================================
// FULL CONE TESTS
// =============================================================================

describe("ConeProjectionV2 - Full 360° Cone", () => {
  const bounds: ScreenBoundsConfig = { minX: 0, maxX: 800, minY: 0, maxY: 600 };

  describe("Empty scene (no obstacles)", () => {
    it("produces polygon with screen corners", () => {
      const player = { x: 400, y: 300 };
      const cone = createFullCone(player);

      const points = projectConeV2(cone, toChains([]), bounds);
      const vertices = toVector2Array(points);

      // Should have 4 screen corners
      expect(vertices.length).toBe(4);
      expect(hasVertexNear(vertices, { x: 0, y: 0 })).toBe(true);
      expect(hasVertexNear(vertices, { x: 800, y: 0 })).toBe(true);
      expect(hasVertexNear(vertices, { x: 800, y: 600 })).toBe(true);
      expect(hasVertexNear(vertices, { x: 0, y: 600 })).toBe(true);
    });
  });

  describe("Single obstacle", () => {
    it("produces polygon with obstacle endpoints", () => {
      const player = { x: 400, y: 400 };
      const obstacle = createTestSurface("wall", { x: 300, y: 200 }, { x: 500, y: 200 });
      const cone = createFullCone(player);

      const points = projectConeV2(cone, toChains([obstacle]), bounds);
      const vertices = toVector2Array(points);

      // Should include obstacle endpoints
      expect(hasVertexNear(vertices, { x: 300, y: 200 })).toBe(true);
      expect(hasVertexNear(vertices, { x: 500, y: 200 })).toBe(true);
    });

    it("includes shadow extensions (continuation hits)", () => {
      const player = { x: 400, y: 400 };
      const obstacle = createTestSurface("wall", { x: 350, y: 200 }, { x: 450, y: 200 });
      const cone = createFullCone(player);

      const points = projectConeV2(cone, toChains([obstacle]), bounds);

      // Count Endpoints and HitPoints
      const endpoints = points.filter(isEndpoint);
      const hitPoints = points.filter(isHitPoint);

      // Should have both obstacle endpoints and continuation hits
      expect(endpoints.length).toBeGreaterThan(0);
      expect(hitPoints.length).toBeGreaterThan(0);
    });
  });

  describe("SourcePoint types are correct", () => {
    it("obstacle endpoints are Endpoint type", () => {
      const player = { x: 400, y: 300 };
      const obstacle = createTestSurface("platform", { x: 300, y: 200 }, { x: 500, y: 200 });
      const cone = createFullCone(player);

      const points = projectConeV2(cone, toChains([obstacle]), bounds);

      // Find points near obstacle endpoints
      const obstaclePoints = points.filter((p) => {
        const xy = p.computeXY();
        return (
          (Math.abs(xy.x - 300) < 1 && Math.abs(xy.y - 200) < 1) ||
          (Math.abs(xy.x - 500) < 1 && Math.abs(xy.y - 200) < 1)
        );
      });

      // All should be Endpoints
      for (const p of obstaclePoints) {
        expect(isEndpoint(p)).toBe(true);
      }
    });

    it("screen corner hits are HitPoints on screen boundaries", () => {
      const player = { x: 400, y: 300 };
      const cone = createFullCone(player);

      const points = projectConeV2(cone, toChains([]), bounds);

      // All corner points should be HitPoints (rays cast to JunctionPoints result in HitPoints)
      const corners = points.filter((p) => {
        const xy = p.computeXY();
        return (xy.x === 0 || xy.x === 800) && (xy.y === 0 || xy.y === 600);
      });

      // With the SurfaceChain refactor, screen corners are JunctionPoints
      // When we cast rays to them, we get HitPoints on screen boundary surfaces
      for (const corner of corners) {
        expect(isHitPoint(corner)).toBe(true);
        if (isHitPoint(corner)) {
          expect(corner.hitSurface.id.startsWith("screen-")).toBe(true);
        }
      }
    });
  });
});

// =============================================================================
// WINDOWED CONE TESTS
// =============================================================================

describe("ConeProjectionV2 - Windowed Cone", () => {
  const bounds: ScreenBoundsConfig = { minX: 0, maxX: 800, minY: 0, maxY: 600 };

  describe("Cone through window", () => {
    it("includes window endpoints in polygon", () => {
      const origin = { x: 400, y: 500 };
      const windowStart = { x: 300, y: 300 };
      const windowEnd = { x: 500, y: 300 };
      const cone = createConeThroughWindow(origin, windowStart, windowEnd);

      const points = projectConeV2(cone, toChains([]), bounds);
      const vertices = toVector2Array(points);

      expect(hasVertexNear(vertices, windowStart)).toBe(true);
      expect(hasVertexNear(vertices, windowEnd)).toBe(true);
    });

    it("polygon forms a trapezoid shape", () => {
      const origin = { x: 400, y: 500 };
      const windowStart = { x: 300, y: 300 };
      const windowEnd = { x: 500, y: 300 };
      const cone = createConeThroughWindow(origin, windowStart, windowEnd);

      const points = projectConeV2(cone, toChains([]), bounds);
      const vertices = toVector2Array(points);

      // Should form a 4-point trapezoid:
      // - Two window endpoints
      // - Two screen boundary hits
      expect(vertices.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("excludeSurfaceId works", () => {
    it("excludes the window surface from obstacles", () => {
      const origin = { x: 400, y: 500 };
      const window = createTestSurface("window", { x: 300, y: 300 }, { x: 500, y: 300 });
      const cone = createConeThroughWindow(origin, window.segment.start, window.segment.end);

      // Without exclusion, the window would block rays
      // With exclusion, rays pass through
      const pointsWithExclusion = projectConeV2(cone, toChains([window]), bounds, "window");

      // Should produce valid polygon
      expect(pointsWithExclusion.length).toBeGreaterThanOrEqual(4);

      // Should NOT have HitPoints on the window surface
      const windowHits = pointsWithExclusion.filter(
        (p) => isHitPoint(p) && (p as HitPoint).hitSurface.id === "window"
      );
      expect(windowHits.length).toBe(0);
    });
  });
});

// =============================================================================
// EXACT MATCHING TESTS (No Epsilons)
// =============================================================================

describe("ConeProjectionV2 - Exact Matching", () => {
  const bounds: ScreenBoundsConfig = { minX: -100, maxX: 100, minY: -100, maxY: 100 };

  describe("Shadow boundary case from user spec", () => {
    /**
     * Setup from user specification:
     * - Box from (-100, -100) to (100, 100)
     * - Obstruction at (-10, 50) to (10, 50)
     * - Player at (0, 0)
     *
     * Expected: 8 vertices including shadow extensions
     */
    it("small obstruction produces correct shadow extensions", () => {
      const player = { x: 0, y: 0 };
      const obstruction = createTestSurface("obs", { x: -10, y: 50 }, { x: 10, y: 50 });
      const cone = createFullCone(player);

      const points = projectConeV2(cone, toChains([obstruction]), bounds);
      const vertices = toVector2Array(points);

      // Expected vertices:
      // Obstacle endpoints: (10, 50), (-10, 50)
      // Shadow extensions: (20, 100), (-20, 100)
      // Screen corners: (100, 100), (100, -100), (-100, -100), (-100, 100)
      expect(hasVertexNear(vertices, { x: 10, y: 50 })).toBe(true);
      expect(hasVertexNear(vertices, { x: -10, y: 50 })).toBe(true);
      expect(hasVertexNear(vertices, { x: 20, y: 100 })).toBe(true);
      expect(hasVertexNear(vertices, { x: -20, y: 100 })).toBe(true);
    });

    /**
     * Setup from user specification:
     * - Box from (-100, -100) to (100, 100)
     * - Obstruction at (-50, 50) to (50, 50)
     * - Player at (0, 0)
     *
     * Expected: 6 vertices (shadow extensions hit corners exactly)
     */
    it("45-degree obstruction produces corner shadow extensions", () => {
      const player = { x: 0, y: 0 };
      const obstruction = createTestSurface("obs", { x: -50, y: 50 }, { x: 50, y: 50 });
      const cone = createFullCone(player);

      const points = projectConeV2(cone, toChains([obstruction]), bounds);
      const vertices = toVector2Array(points);

      // Expected vertices:
      // Obstacle endpoints: (50, 50), (-50, 50)
      // Shadow extensions hit corners exactly: (100, 100), (-100, 100)
      // Other corners: (100, -100), (-100, -100)
      expect(hasVertexNear(vertices, { x: 50, y: 50 })).toBe(true);
      expect(hasVertexNear(vertices, { x: -50, y: 50 })).toBe(true);
      expect(hasVertexNear(vertices, { x: 100, y: 100 })).toBe(true);
      expect(hasVertexNear(vertices, { x: -100, y: 100 })).toBe(true);
    });
  });

  describe("equals() is used for deduplication", () => {
    it("duplicate source points are removed", () => {
      const player = { x: 0, y: 0 };
      const cone = createFullCone(player);

      const points = projectConeV2(cone, toChains([]), bounds);

      // Each point should be unique by equals()
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          expect(points[i]!.equals(points[j]!)).toBe(false);
        }
      }
    });
  });

  describe("No epsilon in endpoint detection", () => {
    it("obstacle endpoint is Endpoint type, not HitPoint with s≈0", () => {
      const player = { x: 0, y: 0 };
      const obstacle = createTestSurface("wall", { x: 50, y: 50 }, { x: 50, y: 100 });
      const cone = createFullCone(player);

      const points = projectConeV2(cone, toChains([obstacle]), bounds);

      // Find a point at the obstacle start - could be Endpoint or HitPoint depending on sort order
      const obstacleStartPoints = points.filter((p) => {
        const xy = p.computeXY();
        return xy.x === 50 && xy.y === 50;
      });

      // At least one point should exist at this location
      expect(obstacleStartPoints.length).toBeGreaterThan(0);

      // At least one of them should be an Endpoint (the actual endpoint, not a HitPoint)
      const hasEndpoint = obstacleStartPoints.some((p) => isEndpoint(p));
      expect(hasEndpoint).toBe(true);
    });
  });
});

// =============================================================================
// ISPOINTINTCONE TESTS
// =============================================================================

describe("isPointInCone", () => {
  it("full cone contains all points", () => {
    const cone = createFullCone({ x: 0, y: 0 });

    expect(isPointInCone({ x: 100, y: 0 }, cone)).toBe(true);
    expect(isPointInCone({ x: -100, y: 0 }, cone)).toBe(true);
    expect(isPointInCone({ x: 0, y: 100 }, cone)).toBe(true);
    expect(isPointInCone({ x: 0, y: -100 }, cone)).toBe(true);
  });

  it("windowed cone only contains points in sector", () => {
    const cone = createConeThroughWindow({ x: 0, y: 0 }, { x: -50, y: 100 }, { x: 50, y: 100 });

    // Point in the cone (above, within angle)
    expect(isPointInCone({ x: 0, y: 100 }, cone)).toBe(true);

    // Point outside the cone (below)
    expect(isPointInCone({ x: 0, y: -100 }, cone)).toBe(false);
  });
});

// =============================================================================
// VERTICAL SURFACE SORTING TESTS (Regression for player directly below)
// =============================================================================

describe("ConeProjectionV2 - Vertical Surface Sorting", () => {
  const bounds: ScreenBoundsConfig = { minX: 0, maxX: 1280, minY: 80, maxY: 700 };

  /**
   * Regression test for the issue where polygon vertices are misordered
   * when the player is directly below a vertical surface.
   *
   * The problem: When player.x ≈ surface.x, the angles to both endpoints
   * of the vertical surface are nearly identical (-π/2), causing unstable sorting.
   *
   * First Principles:
   * - A visibility polygon represents light spreading from the origin
   * - Vertices must be sorted counter-clockwise around the origin
   * - For a vertical surface directly above, the correct order depends on
   *   which side of the surface the light sweeps to first
   */
  describe("Player directly below vertical surface", () => {
    it("sorts vertical surface endpoints correctly when player is directly below", () => {
      // Reproduce the exact scenario from the bug report
      const player = { x: 850.1279643999987, y: 666 };
      const verticalSurface = createTestSurface(
        "ricochet-4",
        { x: 850, y: 350 },
        { x: 850, y: 500 }
      );
      const cone = createFullCone(player);

      const points = projectConeV2(cone, toChains([verticalSurface]), bounds);
      const vertices = toVector2Array(points);

      // Find the two vertices on the vertical surface
      const surfaceVertices = vertices.filter(
        (v) => Math.abs(v.x - 850) < 1 && v.y >= 350 && v.y <= 500
      );

      expect(surfaceVertices.length).toBe(2);

      // Find their indices in the full polygon
      const idx1 = vertices.findIndex((v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 350) < 1);
      const idx2 = vertices.findIndex((v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 500) < 1);

      expect(idx1).toBeGreaterThanOrEqual(0);
      expect(idx2).toBeGreaterThanOrEqual(0);

      // The two surface endpoints should be adjacent in the polygon
      // (either idx1 + 1 == idx2 or idx2 + 1 == idx1, wrapping allowed)
      const n = vertices.length;
      const adjacent = (idx1 + 1) % n === idx2 || (idx2 + 1) % n === idx1;

      expect(adjacent).toBe(true);
    });

    it("produces consistent order regardless of minor player x-position changes", () => {
      // Test that moving player slightly left/right of x=850 produces same relative order
      const verticalSurface = createTestSurface(
        "ricochet-4",
        { x: 850, y: 350 },
        { x: 850, y: 500 }
      );

      const positions = [
        { x: 849.4438279000001, y: 666 }, // Slightly left (working case)
        { x: 850.1279643999987, y: 666 }, // Slightly right (broken case)
        { x: 850.0, y: 666 }, // Exactly at x=850
        { x: 849.9999999, y: 666 }, // Very close left
        { x: 850.0000001, y: 666 }, // Very close right
      ];

      const orders: Array<{ pos: (typeof positions)[0]; order: string }> = [];

      for (const player of positions) {
        const cone = createFullCone(player);
        const points = projectConeV2(cone, toChains([verticalSurface]), bounds);
        const vertices = toVector2Array(points);

        // Find the two surface endpoints
        const idx350 = vertices.findIndex(
          (v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 350) < 1
        );
        const idx500 = vertices.findIndex(
          (v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 500) < 1
        );

        // Determine relative order: which comes first in CCW traversal?
        const order = idx350 < idx500 ? "350-first" : "500-first";
        orders.push({ pos: player, order });
      }

      // All positions should produce adjacent vertices
      for (const { pos } of orders) {
        const cone = createFullCone(pos);
        const points = projectConeV2(cone, toChains([verticalSurface]), bounds);
        const vertices = toVector2Array(points);

        const idx350 = vertices.findIndex(
          (v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 350) < 1
        );
        const idx500 = vertices.findIndex(
          (v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 500) < 1
        );

        const n = vertices.length;
        const adjacent = (idx350 + 1) % n === idx500 || (idx500 + 1) % n === idx350;

        expect(adjacent).toBe(true);
      }
    });

    it("handles exact alignment (player.x === surface.x) without instability", () => {
      // The most degenerate case: player exactly at x=850
      const player = { x: 850, y: 666 };
      const verticalSurface = createTestSurface(
        "ricochet-4",
        { x: 850, y: 350 },
        { x: 850, y: 500 }
      );
      const cone = createFullCone(player);

      const points = projectConeV2(cone, toChains([verticalSurface]), bounds);
      const vertices = toVector2Array(points);

      // Find surface vertices
      const idx350 = vertices.findIndex((v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 350) < 1);
      const idx500 = vertices.findIndex((v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 500) < 1);

      expect(idx350).toBeGreaterThanOrEqual(0);
      expect(idx500).toBeGreaterThanOrEqual(0);

      // They must be adjacent
      const n = vertices.length;
      const adjacent = (idx350 + 1) % n === idx500 || (idx500 + 1) % n === idx350;

      expect(adjacent).toBe(true);
    });

    it("keeps surface endpoints adjacent even with shadow extensions from other surfaces", () => {
      // Exact reproduction of the bug: player nearly below vertical surface,
      // with a diagonal surface nearby that creates a shadow extension
      // The shadow extension was incorrectly being sorted between the surface endpoints
      const player = { x: 850.0104879999998, y: 666 };

      // Vertical surface at x=850
      const verticalSurface = createTestSurface(
        "ricochet-4",
        { x: 850, y: 350 },
        { x: 850, y: 500 }
      );

      // Diagonal surface that creates shadow extension near x=850
      const diagonalSurface = createTestSurface(
        "ricochet-1",
        { x: 800, y: 150 },
        { x: 900, y: 250 }
      );

      const cone = createFullCone(player);
      const points = projectConeV2(cone, toChains([verticalSurface, diagonalSurface]), bounds);
      const vertices = toVector2Array(points);

      // Find the two surface endpoints
      const idx350 = vertices.findIndex((v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 350) < 1);
      const idx500 = vertices.findIndex((v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 500) < 1);

      expect(idx350).toBeGreaterThanOrEqual(0);
      expect(idx500).toBeGreaterThanOrEqual(0);

      // The two surface endpoints MUST be adjacent in the polygon
      // A shadow extension should not appear between them
      const n = vertices.length;
      const adjacent = (idx350 + 1) % n === idx500 || (idx500 + 1) % n === idx350;

      expect(adjacent).toBe(true);
    });

    it("produces stable polygon when player crosses x=850 (no flickering)", () => {
      // This tests for sort stability - the polygon should not flicker/change
      // erratically as the player moves slightly left and right of the surface
      const positions = [849.7, 849.8, 849.9, 850.0, 850.1, 850.2, 850.3];

      // Full demo surfaces (as reported in the bug)
      const allSurfaces = [
        createTestSurface("platform-1", { x: 300, y: 450 }, { x: 500, y: 450 }),
        createTestSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }),
        createTestSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 }),
        createTestSurface("ricochet-2", { x: 400, y: 250 }, { x: 550, y: 250 }),
        createTestSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 }),
        createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }),
      ];

      const results: { x: number; vertexCount: number; endpointsAdjacent: boolean }[] = [];

      for (const x of positions) {
        const player = { x, y: 666 };
        const cone = createFullCone(player);
        const points = projectConeV2(cone, toChains(allSurfaces), bounds);
        const vertices = toVector2Array(points);

        // Find the two surface endpoints
        const idx350 = vertices.findIndex(
          (v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 350) < 1
        );
        const idx500 = vertices.findIndex(
          (v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 500) < 1
        );

        const n = vertices.length;
        const adjacent =
          idx350 >= 0 &&
          idx500 >= 0 &&
          ((idx350 + 1) % n === idx500 || (idx500 + 1) % n === idx350);

        results.push({ x, vertexCount: vertices.length, endpointsAdjacent: adjacent });
      }

      // ALL positions should have endpoints adjacent (stable sorting)
      for (const r of results) {
        expect(r.endpointsAdjacent).toBe(true);
      }

      // Vertex count should be stable (not jumping around)
      const vertexCounts = new Set(results.map((r) => r.vertexCount));
      // Allow at most 2 different vertex counts (left vs right of surface)
      expect(vertexCounts.size).toBeLessThanOrEqual(2);
    });
  });
});

// =============================================================================
// REGRESSION: Player at (849.9997, 517.82) - Two reported issues
// =============================================================================

describe("Regression: player near ricochet-4 at (849.9997, 517.82)", () => {
  const bounds: ScreenBoundsConfig = { minX: 0, maxX: 1280, minY: 80, maxY: 700 };

  // Exact surfaces from the reported state (including room boundaries)
  const allSurfaces = [
    // Room boundaries (these create the spike issue)
    createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }),
    createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }),
    createTestSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }),
    createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }),
    // Game surfaces
    createTestSurface("platform-1", { x: 300, y: 450 }, { x: 500, y: 450 }),
    createTestSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }),
    createTestSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 }),
    createTestSurface("ricochet-2", { x: 400, y: 250 }, { x: 550, y: 250 }),
    createTestSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 }),
    createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }),
  ];

  it("reproduces issue - ricochet-4 endpoints must both exist and be adjacent", () => {
    const player = { x: 849.9997285492858, y: 517.823999181979 };

    const cone = createFullCone(player);
    const points = projectConeV2(cone, toChains(allSurfaces), bounds);
    const vertices = toVector2Array(points);

    // Find ricochet-4 endpoints
    const idx350 = vertices.findIndex((v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 350) < 1);
    const idx500 = vertices.findIndex((v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 500) < 1);

    // Both endpoints must exist
    expect(idx350).toBeGreaterThanOrEqual(0);
    expect(idx500).toBeGreaterThanOrEqual(0);

    // They must be adjacent
    const n = vertices.length;
    const adjacent = (idx350 + 1) % n === idx500 || (idx500 + 1) % n === idx350;

    expect(adjacent).toBe(true);
  });

  it("reproduces issue - no diagonal spike edges crossing the room", () => {
    const player = { x: 849.9997285492858, y: 517.823999181979 };

    const cone = createFullCone(player);
    const points = projectConeV2(cone, toChains(allSurfaces), bounds);
    const vertices = toVector2Array(points);

    // Check for diagonal spike edges that cross the room.
    // Valid long edges: horizontal floor (y=700) or ceiling (y=80)
    // Invalid spike: diagonal edge crossing from one wall to another
    const spikeEdges: { from: number; to: number; desc: string }[] = [];

    for (let i = 0; i < vertices.length; i++) {
      const curr = vertices[i]!;
      const next = vertices[(i + 1) % vertices.length]!;
      const edgeLength = Math.hypot(next.x - curr.x, next.y - curr.y);

      // Long edge (> 800 pixels) that is NOT horizontal (floor or ceiling)
      const isHorizontal = Math.abs(curr.y - next.y) < 10;
      const isLongDiagonal = edgeLength > 800 && !isHorizontal;

      if (isLongDiagonal) {
        spikeEdges.push({
          from: i,
          to: (i + 1) % vertices.length,
          desc:
            `[${i}] (${curr.x.toFixed(0)}, ${curr.y.toFixed(0)}) → ` +
            `[${(i + 1) % vertices.length}] (${next.x.toFixed(0)}, ${next.y.toFixed(0)})`,
        });
        console.log(`SPIKE EDGE: ${spikeEdges[spikeEdges.length - 1]!.desc}`);
      }
    }

    expect(spikeEdges.length).toBe(0);
  });

  it("player at (849.74, 666) - ricochet-4 endpoints must be adjacent", () => {
    // New reported position where issue persists
    const player = { x: 849.7401227999998, y: 666 };

    const cone = createFullCone(player);
    const points = projectConeV2(cone, toChains(allSurfaces), bounds);
    const vertices = toVector2Array(points);

    // Find ricochet-4 endpoints
    const idx350 = vertices.findIndex((v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 350) < 1);
    const idx500 = vertices.findIndex((v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 500) < 1);

    // Both endpoints must exist
    expect(idx350).toBeGreaterThanOrEqual(0);
    expect(idx500).toBeGreaterThanOrEqual(0);

    // They must be adjacent
    const n = vertices.length;
    const adjacent = (idx350 + 1) % n === idx500 || (idx500 + 1) % n === idx350;

    expect(adjacent).toBe(true);
  });

  it("player at (849.74, 666) - no diagonal spike edges", () => {
    const player = { x: 849.7401227999998, y: 666 };

    const cone = createFullCone(player);
    const points = projectConeV2(cone, toChains(allSurfaces), bounds);
    const vertices = toVector2Array(points);

    // Check for diagonal spike edges
    const spikeEdges: string[] = [];

    for (let i = 0; i < vertices.length; i++) {
      const curr = vertices[i]!;
      const next = vertices[(i + 1) % vertices.length]!;
      const edgeLength = Math.hypot(next.x - curr.x, next.y - curr.y);

      const isHorizontal = Math.abs(curr.y - next.y) < 10;
      const isLongDiagonal = edgeLength > 800 && !isHorizontal;

      if (isLongDiagonal) {
        spikeEdges.push(
          `[${i}] (${curr.x.toFixed(0)}, ${curr.y.toFixed(0)}) → ` +
            `[${(i + 1) % vertices.length}] (${next.x.toFixed(0)}, ${next.y.toFixed(0)})`
        );
      }
    }

    expect(spikeEdges.length).toBe(0);
  });

  it("player at x=849.856 (invalid case) - must have BOTH continuation vertices after rendering prep", () => {
    // This is the reported invalid case where a continuation vertex goes missing
    // Test BOTH raw output and after preparePolygonForRendering (what the demo uses)
    const player = { x: 849.8556937473412, y: 666 };

    const cone = createFullCone(player);
    const points = projectConeV2(cone, toChains(allSurfaces), bounds);
    const rawVertices = toVector2Array(points);

    // Apply preparePolygonForRendering to match demo behavior
    const renderedVertices = preparePolygonForRendering(rawVertices);

    // Find ricochet-4 endpoints in rendered output
    const idx350 = renderedVertices.findIndex(
      (v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 350) < 1
    );
    const idx500 = renderedVertices.findIndex(
      (v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 500) < 1
    );

    // Both endpoints must exist
    expect(idx350).toBeGreaterThanOrEqual(0);
    expect(idx500).toBeGreaterThanOrEqual(0);

    // They must be adjacent
    const n = renderedVertices.length;
    const adjacent = (idx350 + 1) % n === idx500 || (idx500 + 1) % n === idx350;
    expect(adjacent).toBe(true);

    // Find continuation hits on ricochet-1 (points near x=850, y=200)
    const continuations = renderedVertices.filter(
      (v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 200) < 50
    );

    // There should be TWO continuation vertices (one for each ricochet-4 endpoint)
    expect(continuations.length).toBe(2);
  });

  it("player at x=849.714 (valid case) - must have BOTH continuation vertices after rendering prep", () => {
    // This is the reported valid case - should have both continuations
    const player = { x: 849.7141437473414, y: 666 };

    const cone = createFullCone(player);
    const points = projectConeV2(cone, toChains(allSurfaces), bounds);
    const rawVertices = toVector2Array(points);

    // Apply preparePolygonForRendering to match demo behavior
    const renderedVertices = preparePolygonForRendering(rawVertices);

    // Find continuation hits on ricochet-1 (points near x=850, y=200)
    const continuations = renderedVertices.filter(
      (v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 200) < 50
    );

    // Should have two continuation vertices
    expect(continuations.length).toBe(2);
  });
});

// =============================================================================
// REFLECTION INSTABILITY: Sub-pixel player movement causes vertex to disappear
// =============================================================================

describe("Reflection visibility instability", () => {
  const bounds: ScreenBoundsConfig = { minX: 0, maxX: 1280, minY: 80, maxY: 700 };

  // All surfaces from the reported state
  const allSurfaces = [
    createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }),
    createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }),
    createTestSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }),
    createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }),
    createTestSurface("platform-1", { x: 300, y: 450 }, { x: 500, y: 450 }),
    createTestSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }),
    createTestSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 }),
    createTestSurface("ricochet-2", { x: 400, y: 250 }, { x: 550, y: 250 }),
    createTestSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 }),
    createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }),
  ];

  // ricochet-4 is the planned surface (window for reflection)
  const ricochet4 = { start: { x: 850, y: 350 }, end: { x: 850, y: 500 } };

  // Helper to reflect a point through a line
  function reflectPoint(point: Vector2, lineStart: Vector2, lineEnd: Vector2): Vector2 {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lineLengthSq = dx * dx + dy * dy;
    if (lineLengthSq < 1e-10) return point;

    const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lineLengthSq;
    const closestX = lineStart.x + t * dx;
    const closestY = lineStart.y + t * dy;

    return {
      x: 2 * closestX - point.x,
      y: 2 * closestY - point.y,
    };
  }

  it("reproduces instability: INVALID case (player x=657.2217077999474)", () => {
    const player = { x: 657.2217077999474, y: 666 };

    // Reflect player through ricochet-4 to get player image
    const reflectedOrigin = reflectPoint(player, ricochet4.start, ricochet4.end);

    // Create windowed cone through ricochet-4 from reflected origin
    const cone = createConeThroughWindow(reflectedOrigin, ricochet4.start, ricochet4.end);
    const points = projectConeV2(cone, toChains(allSurfaces), bounds, "ricochet-4");
    const rawVertices = toVector2Array(points);
    const renderedVertices = preparePolygonForRendering(rawVertices);

    // Check that we have the expected number of vertices
    const platform2Hit = renderedVertices.filter(
      (v) => Math.abs(v.y - 350) < 1 && v.x > 550 && v.x < 750
    );

    // With provenance-based fix: platform-2 hit is now present consistently.
    // Window endpoint rays pass through by identity check, not floating-point intersection.
    expect(platform2Hit.length).toBe(1);
  });

  it("reproduces instability: VALID case (player x=657.221482690353)", () => {
    const player = { x: 657.221482690353, y: 666 };

    // Reflect player through ricochet-4 to get player image
    const reflectedOrigin = reflectPoint(player, ricochet4.start, ricochet4.end);

    // Create windowed cone through ricochet-4 from reflected origin
    const cone = createConeThroughWindow(reflectedOrigin, ricochet4.start, ricochet4.end);
    const points = projectConeV2(cone, toChains(allSurfaces), bounds, "ricochet-4");
    const rawVertices = toVector2Array(points);
    const renderedVertices = preparePolygonForRendering(rawVertices);

    // Check for the platform-2 vertex near (675.8, 350)
    const platform2Hit = renderedVertices.filter(
      (v) => Math.abs(v.y - 350) < 1 && v.x > 550 && v.x < 750
    );

    // Valid case: platform-2 hit is present because s = 0.9999999999999998 <= 1
    expect(platform2Hit.length).toBe(1);
  });

  it("HYPOTHESIS: s > 1 floating point error causes window endpoint to be rejected", () => {
    // This test confirms the root cause: when ray targets window endpoint,
    // intersection s-value floats around 1.0 due to floating point error.
    // When s > 1 (by epsilon), the ray is rejected and the endpoint is not visible.

    // Use exact player positions and calculate reflected origins precisely
    const invalidPlayer = { x: 657.2217077999474, y: 666 };
    const validPlayer = { x: 657.221482690353, y: 666 };

    // Reflect through ricochet-4 at x=850 (vertical line)
    const invalidOrigin = { x: 2 * 850 - invalidPlayer.x, y: invalidPlayer.y };
    const validOrigin = { x: 2 * 850 - validPlayer.x, y: validPlayer.y };

    const windowStart = { x: 850, y: 350 };
    const windowEnd = { x: 850, y: 500 };
    const target = windowEnd;
    const scale = 10;

    // Calculate s for invalid case (line-line intersection formula from GeometryOps)
    const rayEndInvalid = {
      x: invalidOrigin.x + (target.x - invalidOrigin.x) * scale,
      y: invalidOrigin.y + (target.y - invalidOrigin.y) * scale,
    };
    const denomInvalid =
      (invalidOrigin.x - rayEndInvalid.x) * (windowStart.y - windowEnd.y) -
      (invalidOrigin.y - rayEndInvalid.y) * (windowStart.x - windowEnd.x);
    const sInvalid =
      -(
        (invalidOrigin.x - rayEndInvalid.x) * (invalidOrigin.y - windowStart.y) -
        (invalidOrigin.y - rayEndInvalid.y) * (invalidOrigin.x - windowStart.x)
      ) / denomInvalid;

    // Calculate s for valid case
    const rayEndValid = {
      x: validOrigin.x + (target.x - validOrigin.x) * scale,
      y: validOrigin.y + (target.y - validOrigin.y) * scale,
    };
    const denomValid =
      (validOrigin.x - rayEndValid.x) * (windowStart.y - windowEnd.y) -
      (validOrigin.y - rayEndValid.y) * (windowStart.x - windowEnd.x);
    const sValid =
      -(
        (validOrigin.x - rayEndValid.x) * (validOrigin.y - windowStart.y) -
        (validOrigin.y - rayEndValid.y) * (validOrigin.x - windowStart.x)
      ) / denomValid;

    // HYPOTHESIS: floating point errors cause s to deviate from 1.0
    // One case has s > 1 (rejection), the other has s <= 1 (acceptance)
    const invalidRejected = sInvalid > 1;
    const validRejected = sValid > 1;

    // Exactly one should be rejected due to floating point error
    expect(invalidRejected !== validRejected).toBe(true);

    // Both should be essentially equal to 1.0 (difference is ~2e-16)
    expect(Math.abs(sInvalid - 1)).toBeLessThan(1e-10);
    expect(Math.abs(sValid - 1)).toBeLessThan(1e-10);
  });

  it("should have consistent vertex count for sub-pixel player movement", () => {
    // This test verifies stable behavior: sub-pixel player movement should NOT cause flickering.
    // Fixed by provenance-based window endpoint recognition (no floating-point intersection check).

    const positions = [
      657.221482690353, // Valid (s <= 1)
      657.2215, // Invalid (s > 1 due to FP error)
      657.2216,
      657.2217,
      657.2217077999474, // Invalid (s > 1)
      657.2218,
    ];

    const results: { x: number; vertexCount: number; platform2Hits: number }[] = [];

    for (const x of positions) {
      const player = { x, y: 666 };
      const reflectedOrigin = reflectPoint(player, ricochet4.start, ricochet4.end);
      const cone = createConeThroughWindow(reflectedOrigin, ricochet4.start, ricochet4.end);
      const points = projectConeV2(cone, toChains(allSurfaces), bounds, "ricochet-4");
      const rawVertices = toVector2Array(points);
      const renderedVertices = preparePolygonForRendering(rawVertices);

      const platform2Hits = renderedVertices.filter(
        (v) => Math.abs(v.y - 350) < 1 && v.x > 550 && v.x < 750
      ).length;

      results.push({ x, vertexCount: renderedVertices.length, platform2Hits });
    }

    // All positions should have the same number of platform-2 hits
    // When fixed, all should have 1 hit (consistent behavior)
    const hitCounts = new Set(results.map((r) => r.platform2Hits));
    expect(hitCounts.size).toBe(1);
  });
});

// =============================================================================
// OFF-SCREEN ORIGIN: Origin outside screen bounds causes missing vertices
// =============================================================================

describe("Off-screen origin visibility", () => {
  const bounds: ScreenBoundsConfig = { minX: 0, maxX: 1280, minY: 80, maxY: 700 };

  // All surfaces from the reported state
  const allSurfaces = [
    createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }),
    createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }),
    createTestSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }),
    createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }),
    createTestSurface("platform-1", { x: 300, y: 450 }, { x: 500, y: 450 }),
    createTestSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }),
    createTestSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 }),
    createTestSurface("ricochet-2", { x: 400, y: 250 }, { x: 550, y: 250 }),
    createTestSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 }),
    createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }),
  ];

  const ricochet4 = { start: { x: 850, y: 350 }, end: { x: 850, y: 500 } };

  function reflectPoint(point: Vector2, lineStart: Vector2, lineEnd: Vector2): Vector2 {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lineLengthSq = dx * dx + dy * dy;
    if (lineLengthSq < 1e-10) return point;

    const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lineLengthSq;
    const closestX = lineStart.x + t * dx;
    const closestY = lineStart.y + t * dy;

    return {
      x: 2 * closestX - point.x,
      y: 2 * closestY - point.y,
    };
  }

  it("origin outside screen - should still produce window endpoints", () => {
    // When origin is at x=1503 (outside right-wall at x=1260), rays to window
    // endpoints should still work. This tests the provenance-based bypass for
    // blocking checks when targeting window endpoints.
    const player = { x: 196.70562671109835, y: 666 };
    const reflectedOrigin = reflectPoint(player, ricochet4.start, ricochet4.end);

    // Verify origin is outside screen
    expect(reflectedOrigin.x).toBeGreaterThan(1260);

    const cone = createConeThroughWindow(reflectedOrigin, ricochet4.start, ricochet4.end);
    const points = projectConeV2(cone, toChains(allSurfaces), bounds, "ricochet-4");
    const renderedVertices = preparePolygonForRendering(toVector2Array(points));

    // Check for left-wall vertex around y=289 (continuation through window endpoint)
    const leftWallHits = renderedVertices.filter(
      (v) => Math.abs(v.x - 20) < 1 && v.y > 280 && v.y < 300
    );
    expect(leftWallHits.length).toBe(1);

    // Check ricochet-4 endpoints are in source points (not blocked by screen)
    const ricochet4Endpoints = points.filter((p) => {
      if (!("surface" in p)) return false;
      return (p as any).surface?.id === "ricochet-4";
    });
    expect(ricochet4Endpoints.length).toBe(2);
  });

  it("sub-pixel player movement with off-screen origin produces same vertex", () => {
    // Verifies that sub-pixel player changes don't affect visibility when origin is off-screen
    const player = { x: 196.70556931776727, y: 666 };
    const reflectedOrigin = reflectPoint(player, ricochet4.start, ricochet4.end);

    const cone = createConeThroughWindow(reflectedOrigin, ricochet4.start, ricochet4.end);
    const points = projectConeV2(cone, toChains(allSurfaces), bounds, "ricochet-4");
    const renderedVertices = preparePolygonForRendering(toVector2Array(points));

    // Check for left-wall vertex around y=289
    const leftWallHits = renderedVertices.filter(
      (v) => Math.abs(v.x - 20) < 1 && v.y > 280 && v.y < 300
    );
    expect(leftWallHits.length).toBe(1);
  });

  it("should have consistent vertices for off-screen origin", () => {
    // Test both positions and compare
    const positions = [
      { x: 196.70556931776727, y: 666, label: "valid" },
      { x: 196.70562671109835, y: 666, label: "invalid1" },
      { x: 196.05861040000116, y: 666, label: "invalid2" },
    ];

    const results = positions.map(({ x, y, label }) => {
      const player = { x, y };
      const reflectedOrigin = reflectPoint(player, ricochet4.start, ricochet4.end);
      const cone = createConeThroughWindow(reflectedOrigin, ricochet4.start, ricochet4.end);
      const points = projectConeV2(cone, toChains(allSurfaces), bounds, "ricochet-4");
      const rawVertices = toVector2Array(points);
      const renderedVertices = preparePolygonForRendering(rawVertices);

      const leftWallHits = renderedVertices.filter(
        (v) => Math.abs(v.x - 20) < 1 && v.y > 280 && v.y < 300
      ).length;

      return { label, vertexCount: renderedVertices.length, leftWallHits };
    });

    console.log("\n=== CONSISTENCY TEST ===");
    results.forEach((r) =>
      console.log(`${r.label}: vertices=${r.vertexCount}, leftWallHits=${r.leftWallHits}`)
    );

    // All cases should have the same number of left-wall hits near y=289
    const hitCounts = new Set(results.map((r) => r.leftWallHits));
    expect(hitCounts.size).toBe(1);
  });
});

// =============================================================================
// DIAGONAL WINDOW SORTING TESTS
// =============================================================================
describe("ConeProjectionV2 - Diagonal Window Sorting", () => {
  const bounds: ScreenBoundsConfig = { minX: 0, maxX: 1280, minY: 0, maxY: 720 };

  const allSurfaces = [
    createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }),
    createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }),
    createTestSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }),
    createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }),
    createTestSurface("platform-1", { x: 300, y: 450 }, { x: 500, y: 450 }),
    createTestSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }),
    createTestSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 }),
    createTestSurface("ricochet-2", { x: 400, y: 250 }, { x: 550, y: 250 }),
    createTestSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 }),
    createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }),
  ];

  const ricochet1 = { start: { x: 800, y: 150 }, end: { x: 900, y: 250 } };

  function reflectPoint(point: Vector2, lineStart: Vector2, lineEnd: Vector2): Vector2 {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lineLengthSq = dx * dx + dy * dy;
    if (lineLengthSq < 1e-10) return point;

    const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lineLengthSq;
    const closestX = lineStart.x + t * dx;
    const closestY = lineStart.y + t * dy;

    return {
      x: 2 * closestX - point.x,
      y: 2 * closestY - point.y,
    };
  }

  /**
   * Check if the polygon vertices are in proper CCW angular order.
   * For windowed cones, vertices should monotonically increase in angle
   * (with at most one wrap-around at the ±π boundary).
   *
   * A correctly ordered polygon: angles go 170° → 175° → 179° → -177°
   * An incorrectly ordered polygon: angles go -177° → 170° → 175° → ... → -177° → 170°
   */
  function isProperAngularOrder(vertices: Vector2[], origin: Vector2): boolean {
    if (vertices.length < 3) return true;

    const angles = vertices.map((v) => Math.atan2(v.y - origin.y, v.x - origin.x));

    // Count "backwards" jumps - large negative angle changes
    // In proper CCW order, angles should mostly increase (or wrap from +π to -π)
    let backwardJumps = 0;
    for (let i = 0; i < angles.length - 1; i++) {
      const diff = angles[i + 1] - angles[i];
      // Normalize diff to [-π, π]
      let normalizedDiff = diff;
      if (normalizedDiff > Math.PI) normalizedDiff -= 2 * Math.PI;
      if (normalizedDiff < -Math.PI) normalizedDiff += 2 * Math.PI;

      // A significant backward jump (decreasing angle in CCW order)
      if (normalizedDiff < -0.1) {
        // Allow small negative diffs due to floating point
        backwardJumps++;
      }
    }

    // For a windowed cone, we expect at most one wrap-around point
    // (where angle jumps from ~+π to ~-π)
    // The bug causes multiple wrap-arounds due to incorrect ordering
    return backwardJumps <= 1;
  }

  it("INVALID case: origin.y between window endpoints - should NOT self-intersect", () => {
    // Player at y=666, origin.y = 175.76 (BETWEEN window y=150 and y=250)
    const player = { x: 825.7573029149972, y: 666 };
    const reflectedOrigin = reflectPoint(player, ricochet1.start, ricochet1.end);

    // Verify origin.y is between window endpoints
    expect(reflectedOrigin.y).toBeGreaterThan(150);
    expect(reflectedOrigin.y).toBeLessThan(250);

    const cone = createConeThroughWindow(reflectedOrigin, ricochet1.start, ricochet1.end);
    const points = projectConeV2(cone, toChains(allSurfaces), bounds, "ricochet-1");
    const renderedVertices = preparePolygonForRendering(toVector2Array(points));

    // The polygon vertices should be in proper CCW angular order
    expect(isProperAngularOrder(renderedVertices, reflectedOrigin)).toBe(true);
  });

  it("VALID case: origin.y above window - should NOT self-intersect", () => {
    // Player at y=666, origin.y = 141.76 (ABOVE window y=150)
    const player = { x: 791.7565544150048, y: 666 };
    const reflectedOrigin = reflectPoint(player, ricochet1.start, ricochet1.end);

    // Verify origin.y is above window
    expect(reflectedOrigin.y).toBeLessThan(150);

    const cone = createConeThroughWindow(reflectedOrigin, ricochet1.start, ricochet1.end);
    const points = projectConeV2(cone, toChains(allSurfaces), bounds, "ricochet-1");
    const renderedVertices = preparePolygonForRendering(toVector2Array(points));

    // The polygon vertices should be in proper CCW angular order
    expect(isProperAngularOrder(renderedVertices, reflectedOrigin)).toBe(true);
  });

  it("both cases should produce similar vertex counts", () => {
    // Invalid case
    const player1 = { x: 825.7573029149972, y: 666 };
    const origin1 = reflectPoint(player1, ricochet1.start, ricochet1.end);
    const cone1 = createConeThroughWindow(origin1, ricochet1.start, ricochet1.end);
    const vertices1 = preparePolygonForRendering(
      toVector2Array(projectConeV2(cone1, toChains(allSurfaces), bounds, "ricochet-1"))
    );

    // Valid case
    const player2 = { x: 791.7565544150048, y: 666 };
    const origin2 = reflectPoint(player2, ricochet1.start, ricochet1.end);
    const cone2 = createConeThroughWindow(origin2, ricochet1.start, ricochet1.end);
    const vertices2 = preparePolygonForRendering(
      toVector2Array(projectConeV2(cone2, toChains(allSurfaces), bounds, "ricochet-1"))
    );

    // Both should have similar vertex counts (within 2)
    expect(Math.abs(vertices1.length - vertices2.length)).toBeLessThanOrEqual(2);
  });
});

// =============================================================================
// OUT-OF-BOUNDS ORIGIN SPIKE TESTS
// =============================================================================
describe("ConeProjectionV2 - Out-of-Bounds Origin Spike", () => {
  const bounds: ScreenBoundsConfig = { minX: 0, maxX: 1280, minY: 0, maxY: 720 };

  const allSurfaces = [
    createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }),
    createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }),
    createTestSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }),
    createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }),
    createTestSurface("platform-1", { x: 300, y: 450 }, { x: 500, y: 450 }),
    createTestSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }),
    createTestSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 }),
    createTestSurface("ricochet-2", { x: 400, y: 250 }, { x: 550, y: 250 }),
    createTestSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 }),
    createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }),
  ];

  const ricochet1 = { start: { x: 800, y: 150 }, end: { x: 900, y: 250 } };

  function reflectPoint(point: Vector2, lineStart: Vector2, lineEnd: Vector2): Vector2 {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lineLengthSq = dx * dx + dy * dy;
    if (lineLengthSq < 1e-10) return point;

    const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lineLengthSq;
    const closestX = lineStart.x + t * dx;
    const closestY = lineStart.y + t * dy;

    return {
      x: 2 * closestX - point.x,
      y: 2 * closestY - point.y,
    };
  }

  it("INVALID case: origin above ceiling - should NOT include right-wall corner spike", () => {
    // Player position that produces origin.y < ceiling.y (above ceiling)
    const player = { x: 712.7428406502456, y: 666 };
    const reflectedOrigin = reflectPoint(player, ricochet1.start, ricochet1.end);

    // Verify origin is above ceiling (y < 80)
    expect(reflectedOrigin.y).toBeLessThan(80);

    const cone = createConeThroughWindow(reflectedOrigin, ricochet1.start, ricochet1.end);
    const points = projectConeV2(cone, toChains(allSurfaces), bounds, "ricochet-1");
    const renderedVertices = preparePolygonForRendering(toVector2Array(points));

    // The polygon should NOT contain the right-wall corner (1260, 80)
    // because it's between the origin and window, not past the window
    const rightWallCorner = renderedVertices.find(
      (v) => Math.abs(v.x - 1260) < 1 && Math.abs(v.y - 80) < 1
    );
    expect(rightWallCorner).toBeUndefined();
  });

  it("VALID case: origin below ceiling - normal polygon", () => {
    // Player position that produces origin.y > ceiling.y (normal case)
    const player = { x: 763.1890310502434, y: 666 };
    const reflectedOrigin = reflectPoint(player, ricochet1.start, ricochet1.end);

    // Verify origin is below ceiling (y > 80)
    expect(reflectedOrigin.y).toBeGreaterThan(80);

    const cone = createConeThroughWindow(reflectedOrigin, ricochet1.start, ricochet1.end);
    const points = projectConeV2(cone, toChains(allSurfaces), bounds, "ricochet-1");
    const renderedVertices = preparePolygonForRendering(toVector2Array(points));

    // This case should also NOT have the right-wall corner
    const rightWallCorner = renderedVertices.find(
      (v) => Math.abs(v.x - 1260) < 1 && Math.abs(v.y - 80) < 1
    );
    expect(rightWallCorner).toBeUndefined();
  });

  it("should not have spikes crossing the visible region", () => {
    // The invalid case should not have edges crossing from left to right wall
    const player = { x: 712.7428406502456, y: 666 };
    const reflectedOrigin = reflectPoint(player, ricochet1.start, ricochet1.end);

    const cone = createConeThroughWindow(reflectedOrigin, ricochet1.start, ricochet1.end);
    const points = projectConeV2(cone, toChains(allSurfaces), bounds, "ricochet-1");
    const renderedVertices = preparePolygonForRendering(toVector2Array(points));

    // Check for any vertices on the right wall (x > 1200) that aren't window endpoints
    const windowEndpoints = [
      { x: 800, y: 150 },
      { x: 900, y: 250 },
    ];
    const rightSideVertices = renderedVertices.filter((v) => {
      const isWindowEndpoint = windowEndpoints.some(
        (w) => Math.abs(v.x - w.x) < 1 && Math.abs(v.y - w.y) < 1
      );
      return v.x > 1200 && !isWindowEndpoint;
    });

    // There should be no vertices on the right side (except window endpoints)
    expect(rightSideVertices.length).toBe(0);
  });
});

// =============================================================================
// UMBRELLA MODE REFERENCE RAY ALIGNMENT TESTS
// =============================================================================
describe("ConeProjectionV2 - Umbrella Reference Ray Alignment", () => {
  const bounds: ScreenBoundsConfig = { minX: 0, maxX: 1280, minY: 0, maxY: 720 };

  const allSurfaces = [
    createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }),
    createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }),
    createTestSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }),
    createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }),
    createTestSurface("platform-1", { x: 300, y: 450 }, { x: 500, y: 450 }),
    createTestSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }),
    createTestSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 }),
    createTestSurface("ricochet-2", { x: 400, y: 250 }, { x: 550, y: 250 }),
    createTestSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 }),
    createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }),
  ];

  // Umbrella constants (same as GameScene)
  const UMBRELLA_WIDTH = 150;
  const UMBRELLA_HEIGHT = 100;

  function getUmbrellaSegment(player: Vector2): { start: Vector2; end: Vector2 } {
    const halfWidth = UMBRELLA_WIDTH / 2;
    const umbrellaY = player.y - UMBRELLA_HEIGHT;
    return {
      start: { x: player.x - halfWidth, y: umbrellaY },
      end: { x: player.x + halfWidth, y: umbrellaY },
    };
  }

  it("INVALID case: vertex on reference ray should still sort correctly", () => {
    // This player position produces a ceiling vertex exactly on the reference ray
    const player = { x: 796.6096212600031, y: 666 };
    const umbrella = getUmbrellaSegment(player);

    const cone = createConeThroughWindow(player, umbrella.start, umbrella.end);
    const points = projectConeV2(cone, toChains(allSurfaces), bounds);
    const renderedVertices = preparePolygonForRendering(toVector2Array(points));

    // The problematic ceiling vertex around x=1236 should NOT appear early in the polygon
    // In the bug, it appeared at position 2 instead of near the end
    const ceilingVertexNear1236 = renderedVertices.findIndex(
      (v) => Math.abs(v.x - 1236) < 2 && Math.abs(v.y - 80) < 2
    );

    // If this vertex exists, it should be near the end (after position 8)
    // Not at position 2 as in the bug
    if (ceilingVertexNear1236 !== -1) {
      expect(ceilingVertexNear1236).toBeGreaterThan(8);
    }

    // The polygon should be in proper angular order
    // Check that vertices are monotonically ordered by angle (with one wrap-around)
    const angles = renderedVertices.map((v) =>
      Math.atan2(v.y - player.y, v.x - player.x)
    );

    // Count direction reversals (should be at most 1 for proper ordering)
    let reversals = 0;
    for (let i = 0; i < angles.length - 1; i++) {
      let diff = angles[i + 1] - angles[i];
      if (diff > Math.PI) diff -= 2 * Math.PI;
      if (diff < -Math.PI) diff += 2 * Math.PI;
      if (diff < -0.1) reversals++;
    }

    expect(reversals).toBeLessThanOrEqual(1);
  });

  it("VALID case: sub-pixel shift should also sort correctly", () => {
    // This player position is sub-pixel different - vertex NOT on reference ray
    const player = { x: 796.6097575998065, y: 666 };
    const umbrella = getUmbrellaSegment(player);

    const cone = createConeThroughWindow(player, umbrella.start, umbrella.end);
    const points = projectConeV2(cone, toChains(allSurfaces), bounds);
    const renderedVertices = preparePolygonForRendering(toVector2Array(points));

    // Same angular order check
    const angles = renderedVertices.map((v) =>
      Math.atan2(v.y - player.y, v.x - player.x)
    );

    let reversals = 0;
    for (let i = 0; i < angles.length - 1; i++) {
      let diff = angles[i + 1] - angles[i];
      if (diff > Math.PI) diff -= 2 * Math.PI;
      if (diff < -Math.PI) diff += 2 * Math.PI;
      if (diff < -0.1) reversals++;
    }

    expect(reversals).toBeLessThanOrEqual(1);
  });

  it("both cases should produce similar vertex counts", () => {
    const player1 = { x: 796.6096212600031, y: 666 };
    const umbrella1 = getUmbrellaSegment(player1);
    const cone1 = createConeThroughWindow(player1, umbrella1.start, umbrella1.end);
    const vertices1 = preparePolygonForRendering(
      toVector2Array(projectConeV2(cone1, toChains(allSurfaces), bounds))
    );

    const player2 = { x: 796.6097575998065, y: 666 };
    const umbrella2 = getUmbrellaSegment(player2);
    const cone2 = createConeThroughWindow(player2, umbrella2.start, umbrella2.end);
    const vertices2 = preparePolygonForRendering(
      toVector2Array(projectConeV2(cone2, toChains(allSurfaces), bounds))
    );

    // Sub-pixel player change should not significantly affect vertex count
    expect(Math.abs(vertices1.length - vertices2.length)).toBeLessThanOrEqual(1);
  });
});
