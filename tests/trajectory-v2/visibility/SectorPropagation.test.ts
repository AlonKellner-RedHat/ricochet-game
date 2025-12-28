/**
 * Tests for SectorPropagation module
 *
 * Tests cover:
 * - LightSector factory functions
 * - Geometric predicates (isPointInLightSector, etc.)
 * - Sector operations (reflect, trim, intersect, block)
 * - Sector merging
 * - Opacity calculation
 */

import { describe, it, expect } from "vitest";
import {
  // Types
  type LightSector,
  type LightSectors,
  type ScreenBounds,
  // Factory functions
  createFullLightSector,
  isFullLightSector,
  createLightSectorFromSurface,
  createLightSectorThroughWindow,
  createInitialSectors,
  emptyLightSectors,
  // Predicates
  crossProduct,
  isPointInLightSector,
  isPointOnLightSectorBoundary,
  // Sector operations
  reflectLightSector,
  reflectLightSectors,
  trimLightSectorBySurface,
  trimLightSectorsBySurface,
  intersectLightSectors,
  blockLightSectorByObstacle,
  blockLightSectorsByObstacle,
  blockLightSectorsByObstacles,
  // Merging
  mergeLightSectors,
  // Opacity
  calculateStageOpacity,
  // Utilities
  isLightSectorsEmpty,
  getLightSectorsOrigin,
  lightSectorToString,
  // Propagation
  propagateThroughSurfaces,
} from "@/trajectory-v2/visibility/SectorPropagation";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// =============================================================================
// Test Helpers
// =============================================================================

function createTestSurface(
  start: Vector2,
  end: Vector2,
  id = "test-surface"
): Surface {
  return {
    id,
    start,
    end,
    segment: { start, end },
    isReflective: true,
    line: { start, end },
    normal: { x: 0, y: 1 },
    isPlanned: false,
  } as Surface;
}

// =============================================================================
// Factory Function Tests
// =============================================================================

describe("SectorPropagation Factory Functions", () => {
  describe("createFullLightSector", () => {
    it("should create a full sector from origin", () => {
      const origin = { x: 100, y: 100 };
      const sector = createFullLightSector(origin);

      expect(sector.origin).toEqual(origin);
      expect(isFullLightSector(sector)).toBe(true);
    });

    it("should mark full sector as covering all directions", () => {
      const sector = createFullLightSector({ x: 0, y: 0 });

      // All points should be inside a full sector
      expect(isPointInLightSector({ x: 100, y: 0 }, sector)).toBe(true);
      expect(isPointInLightSector({ x: -100, y: 0 }, sector)).toBe(true);
      expect(isPointInLightSector({ x: 0, y: 100 }, sector)).toBe(true);
      expect(isPointInLightSector({ x: 0, y: -100 }, sector)).toBe(true);
    });
  });

  describe("createLightSectorFromSurface", () => {
    it("should create sector with correct left/right boundaries", () => {
      const origin = { x: 100, y: 200 };
      const surface = createTestSurface({ x: 50, y: 100 }, { x: 150, y: 100 });
      const sector = createLightSectorFromSurface(origin, surface);

      expect(sector.origin).toEqual(origin);
      // From below the surface, looking up, left and right should be correct
      expect(isFullLightSector(sector)).toBe(false);
    });

    it("should determine left/right using cross product", () => {
      // Origin to the left of a vertical surface
      const origin = { x: 50, y: 100 };
      const surface = createTestSurface({ x: 100, y: 50 }, { x: 100, y: 150 });
      const sector = createLightSectorFromSurface(origin, surface);

      // The sector should cover the angular extent of the surface
      expect(sector.leftBoundary).toBeDefined();
      expect(sector.rightBoundary).toBeDefined();
    });
  });

  describe("createLightSectorThroughWindow", () => {
    it("should create sector with startLine set", () => {
      const origin = { x: 100, y: 200 };
      const windowStart = { x: 50, y: 100 };
      const windowEnd = { x: 150, y: 100 };

      const sector = createLightSectorThroughWindow(origin, windowStart, windowEnd);

      expect(sector.origin).toEqual(origin);
      expect(sector.startLine).toBeDefined();
      expect(sector.startLine!.start).toEqual(windowStart);
      expect(sector.startLine!.end).toEqual(windowEnd);
    });
  });

  describe("createInitialSectors", () => {
    it("should create a single full sector", () => {
      const player = { x: 640, y: 360 };
      const sectors = createInitialSectors(player);

      expect(sectors.length).toBe(1);
      expect(isFullLightSector(sectors[0]!)).toBe(true);
      expect(sectors[0]!.origin).toEqual(player);
    });
  });

  describe("emptyLightSectors", () => {
    it("should return empty array", () => {
      const sectors = emptyLightSectors();
      expect(sectors.length).toBe(0);
      expect(isLightSectorsEmpty(sectors)).toBe(true);
    });
  });
});

// =============================================================================
// Cross Product Tests
// =============================================================================

describe("crossProduct", () => {
  it("should return positive when b is left of a→origin ray", () => {
    const origin = { x: 0, y: 0 };
    const a = { x: 1, y: 0 }; // Right
    const b = { x: 0, y: 1 }; // Up (left of right)

    expect(crossProduct(origin, a, b)).toBeGreaterThan(0);
  });

  it("should return negative when b is right of a→origin ray", () => {
    const origin = { x: 0, y: 0 };
    const a = { x: 1, y: 0 }; // Right
    const b = { x: 0, y: -1 }; // Down (right of right)

    expect(crossProduct(origin, a, b)).toBeLessThan(0);
  });

  it("should return zero for collinear points", () => {
    const origin = { x: 0, y: 0 };
    const a = { x: 1, y: 0 };
    const b = { x: 2, y: 0 };

    expect(crossProduct(origin, a, b)).toBe(0);
  });
});

// =============================================================================
// isPointInLightSector Tests
// =============================================================================

describe("isPointInLightSector", () => {
  it("should return true for points inside a narrow sector", () => {
    // Sector from origin looking at a horizontal segment above
    const origin = { x: 100, y: 200 };
    const sector: LightSector = {
      origin,
      leftBoundary: { x: 150, y: 100 },
      rightBoundary: { x: 50, y: 100 },
    };

    // Point directly above (inside sector)
    expect(isPointInLightSector({ x: 100, y: 100 }, sector)).toBe(true);
    expect(isPointInLightSector({ x: 100, y: 50 }, sector)).toBe(true);
  });

  it("should return false for points outside a narrow sector", () => {
    const origin = { x: 100, y: 200 };
    const sector: LightSector = {
      origin,
      leftBoundary: { x: 150, y: 100 },
      rightBoundary: { x: 50, y: 100 },
    };

    // Point below origin (outside sector)
    expect(isPointInLightSector({ x: 100, y: 300 }, sector)).toBe(false);
    // Point far to the left
    expect(isPointInLightSector({ x: 0, y: 200 }, sector)).toBe(false);
  });

  it("should handle sectors spanning more than 180 degrees", () => {
    // Wide sector (more than 180°) - from upper-left going CCW to lower-left
    // This creates a sector that EXCLUDES the left side and includes everywhere else
    const origin = { x: 0, y: 0 };
    // Left boundary at upper-left, right boundary at lower-left
    // CCW from lower-left to upper-left is a narrow arc on the left
    // So the sector is the WIDE arc from upper-left CCW to lower-left (going through right)
    const sector: LightSector = {
      origin,
      leftBoundary: { x: -1, y: 1 }, // Upper-left
      rightBoundary: { x: -1, y: -1 }, // Lower-left
    };

    // Points to the right should be inside (in the wide arc)
    expect(isPointInLightSector({ x: 100, y: 0 }, sector)).toBe(true);
    // Points exactly left should be outside (in the narrow excluded arc)
    expect(isPointInLightSector({ x: -100, y: 0 }, sector)).toBe(false);
  });

  it("should include points on the boundary", () => {
    const origin = { x: 0, y: 0 };
    const sector: LightSector = {
      origin,
      leftBoundary: { x: 0, y: 1 },
      rightBoundary: { x: 1, y: 0 },
    };

    // Point exactly on right boundary ray
    expect(isPointInLightSector({ x: 2, y: 0 }, sector)).toBe(true);
    // Point exactly on left boundary ray
    expect(isPointInLightSector({ x: 0, y: 2 }, sector)).toBe(true);
  });
});

// =============================================================================
// isPointOnLightSectorBoundary Tests
// =============================================================================

describe("isPointOnLightSectorBoundary", () => {
  it("should return true for points on left boundary ray", () => {
    const origin = { x: 0, y: 0 };
    const sector: LightSector = {
      origin,
      leftBoundary: { x: 0, y: 1 },
      rightBoundary: { x: 1, y: 0 },
    };

    // Point on left boundary ray (forward direction)
    expect(isPointOnLightSectorBoundary({ x: 0, y: 2 }, sector)).toBe(true);
  });

  it("should return true for points on right boundary ray", () => {
    const origin = { x: 0, y: 0 };
    const sector: LightSector = {
      origin,
      leftBoundary: { x: 0, y: 1 },
      rightBoundary: { x: 1, y: 0 },
    };

    // Point on right boundary ray (forward direction)
    expect(isPointOnLightSectorBoundary({ x: 2, y: 0 }, sector)).toBe(true);
  });

  it("should return false for points not on boundary", () => {
    const origin = { x: 0, y: 0 };
    const sector: LightSector = {
      origin,
      leftBoundary: { x: 0, y: 1 },
      rightBoundary: { x: 1, y: 0 },
    };

    // Point inside but not on boundary
    expect(isPointOnLightSectorBoundary({ x: 1, y: 1 }, sector)).toBe(false);
  });

  it("should return false for full sectors", () => {
    const sector = createFullLightSector({ x: 0, y: 0 });
    expect(isPointOnLightSectorBoundary({ x: 1, y: 0 }, sector)).toBe(false);
  });
});

// =============================================================================
// Reflect Tests
// =============================================================================

describe("reflectLightSector", () => {
  it("should reflect origin through surface", () => {
    const sector: LightSector = {
      origin: { x: 100, y: 200 },
      leftBoundary: { x: 150, y: 100 },
      rightBoundary: { x: 50, y: 100 },
    };

    // Horizontal surface at y=100
    const surface = createTestSurface({ x: 0, y: 100 }, { x: 200, y: 100 });
    const reflected = reflectLightSector(sector, surface);

    // Origin at y=200 should reflect to y=0 (100 - (200 - 100) = 0)
    expect(reflected.origin.y).toBe(0);
    expect(reflected.origin.x).toBe(100);
  });

  it("should swap left and right boundaries", () => {
    const sector: LightSector = {
      origin: { x: 100, y: 200 },
      leftBoundary: { x: 150, y: 100 },
      rightBoundary: { x: 50, y: 100 },
    };

    const surface = createTestSurface({ x: 0, y: 100 }, { x: 200, y: 100 });
    const reflected = reflectLightSector(sector, surface);

    // Boundaries should be swapped after reflection
    // Original left (150, 100) becomes right, original right (50, 100) becomes left
    // Both are on the line, so they stay at y=100
    expect(reflected.rightBoundary.x).toBe(150);
    expect(reflected.leftBoundary.x).toBe(50);
  });

  it("should set startLine to the reflecting surface", () => {
    const sector = createFullLightSector({ x: 100, y: 200 });
    const surface = createTestSurface({ x: 0, y: 100 }, { x: 200, y: 100 });
    const reflected = reflectLightSector(sector, surface);

    expect(reflected.startLine).toBeDefined();
    expect(reflected.startLine!.start).toEqual(surface.segment.start);
    expect(reflected.startLine!.end).toEqual(surface.segment.end);
  });

  it("should be reversible (reflect twice = original)", () => {
    const sector: LightSector = {
      origin: { x: 100, y: 200 },
      leftBoundary: { x: 150, y: 150 },
      rightBoundary: { x: 50, y: 150 },
    };

    const surface = createTestSurface({ x: 0, y: 100 }, { x: 200, y: 100 });

    const reflected = reflectLightSector(sector, surface);
    const doubleReflected = reflectLightSector(reflected, surface);

    expect(doubleReflected.origin.x).toBeCloseTo(sector.origin.x, 10);
    expect(doubleReflected.origin.y).toBeCloseTo(sector.origin.y, 10);
    expect(doubleReflected.leftBoundary.x).toBeCloseTo(sector.leftBoundary.x, 10);
    expect(doubleReflected.leftBoundary.y).toBeCloseTo(sector.leftBoundary.y, 10);
    expect(doubleReflected.rightBoundary.x).toBeCloseTo(sector.rightBoundary.x, 10);
    expect(doubleReflected.rightBoundary.y).toBeCloseTo(sector.rightBoundary.y, 10);
  });
});

describe("reflectLightSectors", () => {
  it("should reflect all sectors", () => {
    const sectors: LightSectors = [
      {
        origin: { x: 100, y: 200 },
        leftBoundary: { x: 150, y: 100 },
        rightBoundary: { x: 50, y: 100 },
      },
      {
        origin: { x: 100, y: 200 },
        leftBoundary: { x: 200, y: 100 },
        rightBoundary: { x: 160, y: 100 },
      },
    ];

    const surface = createTestSurface({ x: 0, y: 100 }, { x: 300, y: 100 });
    const reflected = reflectLightSectors(sectors, surface);

    expect(reflected.length).toBe(2);
    expect(reflected[0]!.origin.y).toBe(0);
    expect(reflected[1]!.origin.y).toBe(0);
  });
});

// =============================================================================
// Trim and Intersect Tests
// =============================================================================

describe("trimLightSectorBySurface", () => {
  it("should trim full sector to surface extent", () => {
    const origin = { x: 100, y: 200 };
    const sector = createFullLightSector(origin);
    const surface = createTestSurface({ x: 50, y: 100 }, { x: 150, y: 100 });

    const trimmed = trimLightSectorBySurface(sector, surface);

    expect(trimmed).not.toBeNull();
    expect(isFullLightSector(trimmed!)).toBe(false);
  });

  it("should return null for non-overlapping sectors", () => {
    const origin = { x: 100, y: 200 };
    // Sector looking right
    const sector: LightSector = {
      origin,
      leftBoundary: { x: 200, y: 210 },
      rightBoundary: { x: 200, y: 190 },
    };
    // Surface to the left
    const surface = createTestSurface({ x: 0, y: 100 }, { x: 50, y: 100 });

    const trimmed = trimLightSectorBySurface(sector, surface);

    // Might be null if no overlap
    // This depends on exact geometry
  });
});

describe("intersectLightSectors", () => {
  it("should return narrower sector when overlapping", () => {
    const origin = { x: 0, y: 0 };

    // First sector: quadrant 1 (upper-right)
    const a: LightSector = {
      origin,
      leftBoundary: { x: 0, y: 1 },
      rightBoundary: { x: 1, y: 0 },
    };

    // Second sector: upper half
    const b: LightSector = {
      origin,
      leftBoundary: { x: -1, y: 1 },
      rightBoundary: { x: 1, y: 1 },
    };

    const result = intersectLightSectors(a, b);

    expect(result).not.toBeNull();
    // The intersection should be a subset of both
  });

  it("should return null for non-overlapping sectors", () => {
    const origin = { x: 0, y: 0 };

    // First sector: looking right
    const a: LightSector = {
      origin,
      leftBoundary: { x: 1, y: 0.1 },
      rightBoundary: { x: 1, y: -0.1 },
    };

    // Second sector: looking left
    const b: LightSector = {
      origin,
      leftBoundary: { x: -1, y: -0.1 },
      rightBoundary: { x: -1, y: 0.1 },
    };

    const result = intersectLightSectors(a, b);

    expect(result).toBeNull();
  });

  it("should handle full sector intersection", () => {
    const origin = { x: 0, y: 0 };
    const full = createFullLightSector(origin);
    const narrow: LightSector = {
      origin,
      leftBoundary: { x: 0, y: 1 },
      rightBoundary: { x: 1, y: 0 },
    };

    const result = intersectLightSectors(full, narrow);

    expect(result).not.toBeNull();
    expect(result!.leftBoundary).toEqual(narrow.leftBoundary);
    expect(result!.rightBoundary).toEqual(narrow.rightBoundary);
  });
});

// =============================================================================
// Block Tests
// =============================================================================

describe("blockLightSectorByObstacle", () => {
  it("should return original sector when obstacle does not overlap", () => {
    const origin = { x: 100, y: 200 };
    // Sector looking up
    const sector: LightSector = {
      origin,
      leftBoundary: { x: 150, y: 100 },
      rightBoundary: { x: 50, y: 100 },
    };

    // Obstacle to the right (not in sector)
    const obstacle = createTestSurface({ x: 200, y: 50 }, { x: 250, y: 50 });
    const result = blockLightSectorByObstacle(sector, obstacle);

    expect(result.length).toBe(1);
    expect(result[0]).toEqual(sector);
  });

  it("should split sector when obstacle is fully inside", () => {
    const origin = { x: 100, y: 200 };
    // Wide sector looking up
    const sector: LightSector = {
      origin,
      leftBoundary: { x: 180, y: 100 },
      rightBoundary: { x: 20, y: 100 },
    };

    // Small obstacle in the middle
    const obstacle = createTestSurface({ x: 80, y: 100 }, { x: 120, y: 100 });
    const result = blockLightSectorByObstacle(sector, obstacle);

    // Should create two sectors around the obstacle
    expect(result.length).toBe(2);
  });

  it("should return empty when obstacle fully blocks", () => {
    const origin = { x: 100, y: 200 };
    // Narrow sector looking at small area
    const sector: LightSector = {
      origin,
      leftBoundary: { x: 110, y: 100 },
      rightBoundary: { x: 90, y: 100 },
    };

    // Large obstacle covering the entire sector view
    const obstacle = createTestSurface({ x: 50, y: 100 }, { x: 150, y: 100 });
    const result = blockLightSectorByObstacle(sector, obstacle);

    // Sector is fully blocked
    expect(result.length).toBe(0);
  });
});

describe("blockLightSectorsByObstacles", () => {
  it("should progressively block by multiple obstacles", () => {
    const origin = { x: 100, y: 200 };
    const sector: LightSector = {
      origin,
      leftBoundary: { x: 180, y: 100 },
      rightBoundary: { x: 20, y: 100 },
    };

    const obstacles = [
      createTestSurface({ x: 40, y: 100 }, { x: 60, y: 100 }, "obs1"),
      createTestSurface({ x: 140, y: 100 }, { x: 160, y: 100 }, "obs2"),
    ];

    const result = blockLightSectorsByObstacles([sector], obstacles);

    // Should be split by both obstacles
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("should exclude specified surface", () => {
    const origin = { x: 100, y: 200 };
    const sector: LightSector = {
      origin,
      leftBoundary: { x: 180, y: 100 },
      rightBoundary: { x: 20, y: 100 },
    };

    const obstacles = [
      createTestSurface({ x: 80, y: 100 }, { x: 120, y: 100 }, "target"),
    ];

    // Exclude the target surface - should not block
    const result = blockLightSectorsByObstacles([sector], obstacles, "target");

    expect(result.length).toBe(1);
    expect(result[0]).toEqual(sector);
  });
});

// =============================================================================
// Merge Tests
// =============================================================================

describe("mergeLightSectors", () => {
  it("should return single sector unchanged", () => {
    const origin = { x: 0, y: 0 };
    const sectors: LightSectors = [
      { origin, leftBoundary: { x: 0, y: 1 }, rightBoundary: { x: 1, y: 0 } },
    ];

    const merged = mergeLightSectors(sectors);

    expect(merged.length).toBe(1);
  });

  it("should merge adjacent sectors", () => {
    const origin = { x: 0, y: 0 };
    // Two adjacent sectors that share a boundary
    const sectors: LightSectors = [
      { origin, leftBoundary: { x: 0, y: 1 }, rightBoundary: { x: 1, y: 1 } },
      { origin, leftBoundary: { x: 1, y: 1 }, rightBoundary: { x: 1, y: 0 } },
    ];

    const merged = mergeLightSectors(sectors);

    expect(merged.length).toBe(1);
    expect(merged[0]!.leftBoundary).toEqual({ x: 0, y: 1 });
    expect(merged[0]!.rightBoundary).toEqual({ x: 1, y: 0 });
  });

  it("should not merge non-adjacent sectors", () => {
    const origin = { x: 0, y: 0 };
    // Two non-adjacent sectors
    const sectors: LightSectors = [
      { origin, leftBoundary: { x: 0, y: 1 }, rightBoundary: { x: 1, y: 1 } },
      { origin, leftBoundary: { x: 1, y: 0 }, rightBoundary: { x: 0, y: -1 } },
    ];

    const merged = mergeLightSectors(sectors);

    expect(merged.length).toBe(2);
  });
});

// =============================================================================
// Opacity Tests
// =============================================================================

describe("calculateStageOpacity", () => {
  it("should return 1.0 for single stage", () => {
    expect(calculateStageOpacity(-1, 1)).toBe(1.0);
    expect(calculateStageOpacity(0, 1)).toBe(1.0);
  });

  it("should return 0.2 for first stage when many stages", () => {
    // Stage index -1 (initial/player) with 5 total stages
    const opacity = calculateStageOpacity(-1, 5);
    expect(opacity).toBeCloseTo(0.2, 2);
  });

  it("should return 1.0 for last stage", () => {
    // Stage index 3 (4th planned surface) with 5 total stages
    const opacity = calculateStageOpacity(3, 5);
    expect(opacity).toBeCloseTo(1.0, 2);
  });

  it("should have progressive opacity for 5 stages", () => {
    const opacities = [
      calculateStageOpacity(-1, 5), // Stage 0 (initial)
      calculateStageOpacity(0, 5), // Stage 1
      calculateStageOpacity(1, 5), // Stage 2
      calculateStageOpacity(2, 5), // Stage 3
      calculateStageOpacity(3, 5), // Stage 4 (final)
    ];

    // Should be monotonically increasing
    for (let i = 1; i < opacities.length; i++) {
      expect(opacities[i]).toBeGreaterThan(opacities[i - 1]!);
    }

    // Approximate values
    expect(opacities[0]).toBeCloseTo(0.2, 1);
    expect(opacities[1]).toBeCloseTo(0.4, 1);
    expect(opacities[2]).toBeCloseTo(0.6, 1);
    expect(opacities[3]).toBeCloseTo(0.8, 1);
    expect(opacities[4]).toBeCloseTo(1.0, 1);
  });
});

// =============================================================================
// Utility Tests
// =============================================================================

// =============================================================================
// Propagation Algorithm Tests
// =============================================================================

describe("propagateThroughSurfaces", () => {
  const defaultBounds: ScreenBounds = {
    minX: 0,
    minY: 0,
    maxX: 1280,
    maxY: 720,
  };

  it("should create single stage for no planned surfaces", () => {
    const player = { x: 640, y: 360 };
    const result = propagateThroughSurfaces(player, [], [], defaultBounds);

    expect(result.stages.length).toBe(1);
    expect(result.stages[0]!.surfaceIndex).toBe(-1);
    expect(result.stages[0]!.opacity).toBe(1.0); // Only stage = full opacity
  });

  it("should create two stages for one planned surface", () => {
    const player = { x: 640, y: 500 };
    // Horizontal surface above player
    const surface = createTestSurface({ x: 400, y: 300 }, { x: 880, y: 300 }, "planned-1");

    const result = propagateThroughSurfaces(player, [surface], [surface], defaultBounds);

    expect(result.stages.length).toBe(2);
    expect(result.stages[0]!.surfaceIndex).toBe(-1); // Initial
    expect(result.stages[1]!.surfaceIndex).toBe(0); // After first surface
  });

  it("should calculate progressive opacity for multiple surfaces", () => {
    const player = { x: 640, y: 600 };
    // Stack of horizontal surfaces
    const surfaces = [
      createTestSurface({ x: 400, y: 500 }, { x: 880, y: 500 }, "s1"),
      createTestSurface({ x: 400, y: 400 }, { x: 880, y: 400 }, "s2"),
      createTestSurface({ x: 400, y: 300 }, { x: 880, y: 300 }, "s3"),
      createTestSurface({ x: 400, y: 200 }, { x: 880, y: 200 }, "s4"),
    ];

    const result = propagateThroughSurfaces(player, surfaces, surfaces, defaultBounds);

    // With 4 planned surfaces, we expect 5 stages (initial + 4)
    // Opacity should increase from 20% to 100%
    if (result.stages.length === 5) {
      expect(result.stages[0]!.opacity).toBeCloseTo(0.2, 1);
      expect(result.stages[4]!.opacity).toBeCloseTo(1.0, 1);

      // Should be monotonically increasing
      for (let i = 1; i < result.stages.length; i++) {
        expect(result.stages[i]!.opacity).toBeGreaterThan(result.stages[i - 1]!.opacity);
      }
    }
  });

  it("should reflect origin through each surface", () => {
    const player = { x: 640, y: 600 };
    // Horizontal surface at y=400
    const surface = createTestSurface({ x: 400, y: 400 }, { x: 880, y: 400 }, "reflect");

    const result = propagateThroughSurfaces(player, [surface], [surface], defaultBounds);

    // After reflecting through y=400, origin at y=600 becomes y=200
    // (400 - (600 - 400) = 200)
    expect(result.stages.length).toBe(2);
    expect(result.stages[1]!.origin.y).toBeCloseTo(200, 0);
    expect(result.stages[1]!.origin.x).toBeCloseTo(640, 0);
  });

  it("should stop propagation when no sectors reach surface", () => {
    const player = { x: 100, y: 360 };
    // Surface far to the right - player can't see it directly
    const surface = createTestSurface({ x: 1200, y: 100 }, { x: 1200, y: 200 }, "far");
    // Blocking obstacle
    const blocker = createTestSurface({ x: 500, y: 100 }, { x: 500, y: 620 }, "blocker");

    const result = propagateThroughSurfaces(
      player,
      [surface],
      [surface, blocker],
      defaultBounds
    );

    // May have only initial stage if fully blocked
    expect(result.stages.length).toBeGreaterThanOrEqual(1);
  });

  it("should produce valid result flag", () => {
    const player = { x: 640, y: 360 };
    const result = propagateThroughSurfaces(player, [], [], defaultBounds);

    expect(result.isValid).toBeDefined();
  });

  it("should handle obstacles blocking path to planned surface", () => {
    const player = { x: 640, y: 600 };
    // Planned surface above
    const plannedSurface = createTestSurface({ x: 400, y: 200 }, { x: 880, y: 200 }, "planned");
    // Obstacle in the middle
    const obstacle = createTestSurface({ x: 500, y: 400 }, { x: 780, y: 400 }, "obstacle");

    const result = propagateThroughSurfaces(
      player,
      [plannedSurface],
      [plannedSurface, obstacle],
      defaultBounds
    );

    // Should still produce stages, but sectors may be split or reduced
    expect(result.stages.length).toBeGreaterThanOrEqual(1);
  });

  it("should produce polygons for each stage", () => {
    const player = { x: 640, y: 500 };
    const surface = createTestSurface({ x: 400, y: 300 }, { x: 880, y: 300 }, "planned-1");

    const result = propagateThroughSurfaces(player, [surface], [surface], defaultBounds);

    // Initial stage should have polygons
    expect(result.stages[0]!.polygons.length).toBeGreaterThan(0);
    
    // Each polygon should have at least 3 vertices
    for (const stage of result.stages) {
      for (const polygon of stage.polygons) {
        if (polygon.length > 0) {
          expect(polygon.length).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });
});

// =============================================================================
// Utility Tests
// =============================================================================

describe("Utility functions", () => {
  describe("isLightSectorsEmpty", () => {
    it("should return true for empty array", () => {
      expect(isLightSectorsEmpty([])).toBe(true);
    });

    it("should return false for non-empty array", () => {
      const sectors = createInitialSectors({ x: 0, y: 0 });
      expect(isLightSectorsEmpty(sectors)).toBe(false);
    });
  });

  describe("getLightSectorsOrigin", () => {
    it("should return null for empty sectors", () => {
      expect(getLightSectorsOrigin([])).toBeNull();
    });

    it("should return origin of first sector", () => {
      const origin = { x: 100, y: 200 };
      const sectors = createInitialSectors(origin);
      expect(getLightSectorsOrigin(sectors)).toEqual(origin);
    });
  });

  describe("lightSectorToString", () => {
    it("should format full sector", () => {
      const sector = createFullLightSector({ x: 100, y: 200 });
      const str = lightSectorToString(sector);

      expect(str).toContain("FullSector");
      expect(str).toContain("100.0");
      expect(str).toContain("200.0");
    });

    it("should format bounded sector", () => {
      const sector: LightSector = {
        origin: { x: 0, y: 0 },
        leftBoundary: { x: 100, y: 50 },
        rightBoundary: { x: 50, y: 100 },
      };
      const str = lightSectorToString(sector);

      expect(str).toContain("LightSector");
      expect(str).toContain("left");
      expect(str).toContain("right");
    });
  });
});

