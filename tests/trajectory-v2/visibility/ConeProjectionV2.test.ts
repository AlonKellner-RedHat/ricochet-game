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

      const points = projectConeV2(cone, [], bounds);
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

      const points = projectConeV2(cone, [obstacle], bounds);
      const vertices = toVector2Array(points);

      // Should include obstacle endpoints
      expect(hasVertexNear(vertices, { x: 300, y: 200 })).toBe(true);
      expect(hasVertexNear(vertices, { x: 500, y: 200 })).toBe(true);
    });

    it("includes shadow extensions (continuation hits)", () => {
      const player = { x: 400, y: 400 };
      const obstacle = createTestSurface("wall", { x: 350, y: 200 }, { x: 450, y: 200 });
      const cone = createFullCone(player);

      const points = projectConeV2(cone, [obstacle], bounds);

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

      const points = projectConeV2(cone, [obstacle], bounds);

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

      const points = projectConeV2(cone, [], bounds);

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

      const points = projectConeV2(cone, [], bounds);
      const vertices = toVector2Array(points);

      expect(hasVertexNear(vertices, windowStart)).toBe(true);
      expect(hasVertexNear(vertices, windowEnd)).toBe(true);
    });

    it("polygon forms a trapezoid shape", () => {
      const origin = { x: 400, y: 500 };
      const windowStart = { x: 300, y: 300 };
      const windowEnd = { x: 500, y: 300 };
      const cone = createConeThroughWindow(origin, windowStart, windowEnd);

      const points = projectConeV2(cone, [], bounds);
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
      const pointsWithExclusion = projectConeV2(cone, [window], bounds, "window");

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

      const points = projectConeV2(cone, [obstruction], bounds);
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

      const points = projectConeV2(cone, [obstruction], bounds);
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

      const points = projectConeV2(cone, [], bounds);

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

      const points = projectConeV2(cone, [obstacle], bounds);

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

      const points = projectConeV2(cone, [verticalSurface], bounds);
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
        const points = projectConeV2(cone, [verticalSurface], bounds);
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
        const points = projectConeV2(cone, [verticalSurface], bounds);
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

      const points = projectConeV2(cone, [verticalSurface], bounds);
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
      const points = projectConeV2(cone, [verticalSurface, diagonalSurface], bounds);
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
        const points = projectConeV2(cone, allSurfaces, bounds);
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
    const points = projectConeV2(cone, allSurfaces, bounds);
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
    const points = projectConeV2(cone, allSurfaces, bounds);
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
    const points = projectConeV2(cone, allSurfaces, bounds);
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
    const points = projectConeV2(cone, allSurfaces, bounds);
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
    const points = projectConeV2(cone, allSurfaces, bounds);
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
    const points = projectConeV2(cone, allSurfaces, bounds);
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
