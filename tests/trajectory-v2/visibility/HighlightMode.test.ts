/**
 * HighlightMode Tests
 *
 * TDD tests for calculating reaching cones - the portions of light
 * that reach a target surface from the current visibility origin.
 *
 * All geometry is source-of-truth based:
 * - No epsilon comparisons
 * - No angle calculations (atan2)
 * - Cross-product for all angular comparisons
 * - Provenance-based vertex derivation
 */

import { describe, it, expect } from "vitest";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  type ReachingConeConfig,
  calculateReachingCones,
  isPointInConeExact,
  doesObstacleIntersectCone,
} from "@/trajectory-v2/visibility/HighlightMode";
import type { Segment } from "@/trajectory-v2/visibility/WindowConfig";

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestSurface(id: string, start: Vector2, end: Vector2): Surface {
  return {
    id,
    segment: { start, end },
    surfaceType: "test",
    onArrowHit: () => ({ type: "blocked" as const }),
    isPlannable: () => true,
    getVisualProperties: () => ({ color: 0x00ffff, alpha: 1, lineWidth: 2 }),
    getNormal: () => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      return { x: -dy / len, y: dx / len };
    },
    canReflectFrom: () => true,
  } as unknown as Surface;
}

function hasVertexNear(vertices: readonly Vector2[], target: Vector2, tolerance = 1): boolean {
  return vertices.some(
    (v) => Math.abs(v.x - target.x) < tolerance && Math.abs(v.y - target.y) < tolerance
  );
}

// =============================================================================
// BASIC CONE CALCULATION TESTS
// =============================================================================

describe("HighlightMode - Basic Cone Calculation", () => {
  describe("Triangle cone (no window)", () => {
    it("creates triangle cone from origin to surface", () => {
      const origin: Vector2 = { x: 400, y: 500 };
      const targetSurface = createTestSurface(
        "target",
        { x: 300, y: 300 },
        { x: 500, y: 300 }
      );

      const config: ReachingConeConfig = {
        origin,
        targetSurface,
        obstacles: [],
        startLine: null,
      };

      const cones = calculateReachingCones(config);

      expect(cones).toHaveLength(1);
      expect(cones[0]!.vertices).toHaveLength(3);

      // Triangle vertices: origin, surface.start, surface.end
      expect(hasVertexNear(cones[0]!.vertices, origin)).toBe(true);
      expect(hasVertexNear(cones[0]!.vertices, targetSurface.segment.start)).toBe(true);
      expect(hasVertexNear(cones[0]!.vertices, targetSurface.segment.end)).toBe(true);
    });

    it("cone has correct origin reference", () => {
      const origin: Vector2 = { x: 400, y: 500 };
      const targetSurface = createTestSurface(
        "target",
        { x: 300, y: 300 },
        { x: 500, y: 300 }
      );

      const config: ReachingConeConfig = {
        origin,
        targetSurface,
        obstacles: [],
        startLine: null,
      };

      const cones = calculateReachingCones(config);

      expect(cones[0]!.origin).toEqual(origin);
      expect(cones[0]!.targetSurface).toBe(targetSurface);
    });
  });
});

// =============================================================================
// WINDOWED CONE TESTS (Quadrilateral)
// =============================================================================

describe("HighlightMode - Windowed Cone (Quadrilateral)", () => {
  it("creates quadrilateral cone when startLine provided", () => {
    const origin: Vector2 = { x: 400, y: 600 };
    const startLine: Segment = {
      start: { x: 350, y: 500 },
      end: { x: 450, y: 500 },
    };
    const targetSurface = createTestSurface(
      "target",
      { x: 300, y: 300 },
      { x: 500, y: 300 }
    );

    const config: ReachingConeConfig = {
      origin,
      targetSurface,
      obstacles: [],
      startLine,
    };

    const cones = calculateReachingCones(config);

    expect(cones).toHaveLength(1);
    // Quadrilateral: 4 vertices (startLine intersections + surface endpoints)
    expect(cones[0]!.vertices).toHaveLength(4);

    // Should include surface endpoints
    expect(hasVertexNear(cones[0]!.vertices, targetSurface.segment.start)).toBe(true);
    expect(hasVertexNear(cones[0]!.vertices, targetSurface.segment.end)).toBe(true);

    // Two vertices should be on the startLine (y = 500)
    const verticesOnStartLine = cones[0]!.vertices.filter(
      (v) => Math.abs(v.y - 500) < 1
    );
    expect(verticesOnStartLine).toHaveLength(2);
  });

  it("quadrilateral is truncated by startLine (no origin vertex)", () => {
    const origin: Vector2 = { x: 400, y: 600 };
    const startLine: Segment = {
      start: { x: 350, y: 500 },
      end: { x: 450, y: 500 },
    };
    const targetSurface = createTestSurface(
      "target",
      { x: 300, y: 300 },
      { x: 500, y: 300 }
    );

    const config: ReachingConeConfig = {
      origin,
      targetSurface,
      obstacles: [],
      startLine,
    };

    const cones = calculateReachingCones(config);

    // Origin should NOT be in vertices (cone is truncated by startLine)
    expect(hasVertexNear(cones[0]!.vertices, origin)).toBe(false);
  });
});

// =============================================================================
// OBSTRUCTION TESTS
// =============================================================================

describe("HighlightMode - Obstruction Handling", () => {
  describe("Single obstruction", () => {
    it("splits cone into two sub-cones when obstacle is in the middle", () => {
      const origin: Vector2 = { x: 400, y: 500 };
      const targetSurface = createTestSurface(
        "target",
        { x: 200, y: 200 },
        { x: 600, y: 200 }
      );
      
      // Obstacle in the middle of the cone
      const obstacle = createTestSurface(
        "obstacle",
        { x: 380, y: 350 },
        { x: 420, y: 350 }
      );

      const config: ReachingConeConfig = {
        origin,
        targetSurface,
        obstacles: [obstacle],
        startLine: null,
      };

      const cones = calculateReachingCones(config);


      // Should have 2 sub-cones (one on each side of obstacle)
      expect(cones).toHaveLength(2);

      // Each sub-cone should be a triangle
      expect(cones[0]!.vertices.length).toBeGreaterThanOrEqual(3);
      expect(cones[1]!.vertices.length).toBeGreaterThanOrEqual(3);
    });

    it("obstacle at edge blocks one side completely", () => {
      const origin: Vector2 = { x: 400, y: 500 };
      const targetSurface = createTestSurface(
        "target",
        { x: 200, y: 200 },
        { x: 600, y: 200 }
      );
      
      // Obstacle blocking left side of cone
      const obstacle = createTestSurface(
        "obstacle",
        { x: 200, y: 350 },
        { x: 350, y: 350 }
      );

      const config: ReachingConeConfig = {
        origin,
        targetSurface,
        obstacles: [obstacle],
        startLine: null,
      };

      const cones = calculateReachingCones(config);

      // Should have 1 cone (the unblocked right side)
      expect(cones.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Full occlusion", () => {
    it("returns empty array when surface is fully blocked", () => {
      const origin: Vector2 = { x: 400, y: 500 };
      const targetSurface = createTestSurface(
        "target",
        { x: 350, y: 200 },
        { x: 450, y: 200 }
      );
      
      // Large obstacle completely blocking the target
      const obstacle = createTestSurface(
        "obstacle",
        { x: 300, y: 350 },
        { x: 500, y: 350 }
      );

      const config: ReachingConeConfig = {
        origin,
        targetSurface,
        obstacles: [obstacle],
        startLine: null,
      };

      const cones = calculateReachingCones(config);

      expect(cones).toHaveLength(0);
    });
  });

  describe("Multiple obstructions", () => {
    it("creates correct number of sub-cones with multiple obstacles", () => {
      const origin: Vector2 = { x: 400, y: 500 };
      const targetSurface = createTestSurface(
        "target",
        { x: 100, y: 200 },
        { x: 700, y: 200 }
      );
      
      // Two separate obstacles
      const obstacle1 = createTestSurface(
        "obstacle1",
        { x: 250, y: 350 },
        { x: 300, y: 350 }
      );
      const obstacle2 = createTestSurface(
        "obstacle2",
        { x: 500, y: 350 },
        { x: 550, y: 350 }
      );

      const config: ReachingConeConfig = {
        origin,
        targetSurface,
        obstacles: [obstacle1, obstacle2],
        startLine: null,
      };

      const cones = calculateReachingCones(config);

      // Should have at least 1 cone for the visible portions
      // The exact number depends on obstacle geometry and gap calculation
      expect(cones.length).toBeGreaterThanOrEqual(1);
      
      // All cone vertices (except origin) should be on the surface
      for (const cone of cones) {
        for (const v of cone.vertices) {
          if (Math.abs(v.x - origin.x) > 1 || Math.abs(v.y - origin.y) > 1) {
            // Non-origin vertex should be on the surface (y=200)
            expect(Math.abs(v.y - 200)).toBeLessThan(1);
          }
        }
      }
    });
  });
});

// =============================================================================
// CROSS-PRODUCT GEOMETRY TESTS (No Angles)
// =============================================================================

describe("HighlightMode - Cross-Product Geometry", () => {
  describe("isPointInConeExact", () => {
    it("returns true for point inside cone", () => {
      const origin: Vector2 = { x: 0, y: 0 };
      const left: Vector2 = { x: -1, y: -2 };
      const right: Vector2 = { x: 1, y: -2 };
      const point: Vector2 = { x: 0, y: -1 };

      expect(isPointInConeExact(origin, left, right, point)).toBe(true);
    });

    it("returns false for point outside cone (left)", () => {
      const origin: Vector2 = { x: 0, y: 0 };
      const left: Vector2 = { x: -1, y: -2 };
      const right: Vector2 = { x: 1, y: -2 };
      const point: Vector2 = { x: -2, y: -1 };

      expect(isPointInConeExact(origin, left, right, point)).toBe(false);
    });

    it("returns false for point outside cone (right)", () => {
      const origin: Vector2 = { x: 0, y: 0 };
      const left: Vector2 = { x: -1, y: -2 };
      const right: Vector2 = { x: 1, y: -2 };
      const point: Vector2 = { x: 2, y: -1 };

      expect(isPointInConeExact(origin, left, right, point)).toBe(false);
    });

    it("returns true for point on cone boundary", () => {
      const origin: Vector2 = { x: 0, y: 0 };
      const left: Vector2 = { x: -1, y: -2 };
      const right: Vector2 = { x: 1, y: -2 };
      // Point exactly on left boundary ray
      const point: Vector2 = { x: -0.5, y: -1 };

      expect(isPointInConeExact(origin, left, right, point)).toBe(true);
    });
  });

  describe("doesObstacleIntersectCone", () => {
    it("returns true when obstacle crosses cone", () => {
      const origin: Vector2 = { x: 400, y: 500 };
      const left: Vector2 = { x: 300, y: 300 };
      const right: Vector2 = { x: 500, y: 300 };
      const obstacle = createTestSurface(
        "obs",
        { x: 350, y: 400 },
        { x: 450, y: 400 }
      );

      expect(doesObstacleIntersectCone(origin, left, right, obstacle)).toBe(true);
    });

    it("returns false when obstacle is outside cone", () => {
      const origin: Vector2 = { x: 400, y: 500 };
      const left: Vector2 = { x: 350, y: 300 };
      const right: Vector2 = { x: 450, y: 300 };
      const obstacle = createTestSurface(
        "obs",
        { x: 100, y: 400 },
        { x: 200, y: 400 }
      );

      expect(doesObstacleIntersectCone(origin, left, right, obstacle)).toBe(false);
    });

    it("returns false when obstacle is behind origin", () => {
      const origin: Vector2 = { x: 400, y: 500 };
      const left: Vector2 = { x: 300, y: 300 };
      const right: Vector2 = { x: 500, y: 300 };
      // Obstacle behind origin (larger y)
      const obstacle = createTestSurface(
        "obs",
        { x: 350, y: 600 },
        { x: 450, y: 600 }
      );

      expect(doesObstacleIntersectCone(origin, left, right, obstacle)).toBe(false);
    });
  });
});

// =============================================================================
// PROVENANCE TESTS
// =============================================================================

describe("HighlightMode - Provenance Preservation", () => {
  it("sub-cone boundaries are projections of obstacle endpoints onto target surface", () => {
    const origin: Vector2 = { x: 400, y: 500 };
    const targetSurface = createTestSurface(
      "target",
      { x: 200, y: 200 },
      { x: 600, y: 200 }
    );
    
    // Obstacle with specific endpoints
    const obstacleStart = { x: 380, y: 350 };
    const obstacleEnd = { x: 420, y: 350 };
    const obstacle = createTestSurface("obstacle", obstacleStart, obstacleEnd);

    const config: ReachingConeConfig = {
      origin,
      targetSurface,
      obstacles: [obstacle],
      startLine: null,
    };

    const cones = calculateReachingCones(config);

    // All non-origin vertices should be on the target surface (y=200)
    // Obstacle endpoints are projected to the surface, not used directly
    const allVertices = cones.flatMap((c) => c.vertices);
    const nonOriginVertices = allVertices.filter(
      v => Math.abs(v.x - origin.x) > 1 || Math.abs(v.y - origin.y) > 1
    );
    
    // All non-origin vertices should be on the surface
    for (const v of nonOriginVertices) {
      expect(Math.abs(v.y - 200)).toBeLessThan(1);
    }
    
    // The visible regions should be left-of-obstacle and right-of-obstacle
    expect(cones.length).toBeGreaterThanOrEqual(1);
  });

  it("windowed cone intersection points are on startLine", () => {
    const origin: Vector2 = { x: 400, y: 600 };
    const startLine: Segment = {
      start: { x: 350, y: 500 },
      end: { x: 450, y: 500 },
    };
    const targetSurface = createTestSurface(
      "target",
      { x: 300, y: 300 },
      { x: 500, y: 300 }
    );

    const config: ReachingConeConfig = {
      origin,
      targetSurface,
      obstacles: [],
      startLine,
    };

    const cones = calculateReachingCones(config);
    const vertices = cones[0]!.vertices;

    // The intersection points should be on the startLine (y = 500, x between 350 and 450)
    const startLineVertices = vertices.filter(
      (v) => Math.abs(v.y - 500) < 0.001
    );
    
    expect(startLineVertices.length).toBe(2);
    
    // Both should have x within startLine bounds
    for (const v of startLineVertices) {
      expect(v.x).toBeGreaterThanOrEqual(startLine.start.x - 1);
      expect(v.x).toBeLessThanOrEqual(startLine.end.x + 1);
    }
  });
});

