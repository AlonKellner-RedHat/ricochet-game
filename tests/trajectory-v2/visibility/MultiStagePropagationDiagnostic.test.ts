/**
 * Diagnostic tests for multi-stage propagation issues.
 *
 * Issue 1: Nothing new appears when selecting a surface - first polygon just gets brighter
 * Issue 2: Wrong polygon order causing visual corruption
 */

import { describe, it, expect } from "vitest";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  propagateThroughSurfaces,
  createLightSectorFromSurface,
  trimLightSectorBySurface,
  reflectLightSector,
  isPointInLightSector,
  createFullLightSector,
  type LightSector,
  type ScreenBounds,
} from "@/trajectory-v2/visibility/SectorPropagation";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";

// =============================================================================
// Test Helpers
// =============================================================================

function createTestSurface(
  start: Vector2,
  end: Vector2,
  id: string,
  canReflect = true
): Surface {
  return {
    id,
    start,
    end,
    segment: { start, end },
    isReflective: canReflect,
    line: { start, end },
    normal: { x: 0, y: 1 },
    isPlanned: false,
  } as Surface;
}

const defaultBounds: ScreenBounds = {
  minX: 0,
  minY: 0,
  maxX: 1280,
  maxY: 720,
};

// =============================================================================
// Case 1: Vertical surface at x=850
// =============================================================================

describe("Multi-Stage Propagation Diagnostic - Case 1 (vertical surface)", () => {
  const player = { x: 611.413654, y: 666 };
  const plannedSurface = createTestSurface(
    { x: 850, y: 350 },
    { x: 850, y: 500 },
    "ricochet-4"
  );

  const allSurfaces = [
    createTestSurface({ x: 0, y: 700 }, { x: 1280, y: 700 }, "floor", false),
    createTestSurface({ x: 0, y: 80 }, { x: 1280, y: 80 }, "ceiling", false),
    createTestSurface({ x: 20, y: 80 }, { x: 20, y: 700 }, "left-wall", false),
    createTestSurface({ x: 1260, y: 80 }, { x: 1260, y: 700 }, "right-wall", false),
    plannedSurface,
  ];

  it("should produce two stages for one planned surface", () => {
    const result = propagateThroughSurfaces(
      player,
      [plannedSurface],
      allSurfaces,
      defaultBounds
    );

    console.log("\n=== Case 1: Vertical Surface at x=850 ===");
    console.log(`Player: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
    console.log(`Number of stages: ${result.stages.length}`);

    for (const stage of result.stages) {
      console.log(`\nStage ${stage.surfaceIndex}:`);
      console.log(`  Origin: (${stage.origin.x.toFixed(1)}, ${stage.origin.y.toFixed(1)})`);
      console.log(`  Sectors: ${stage.sectors.length}`);
      console.log(`  Polygons: ${stage.polygons.length}`);
      for (let i = 0; i < stage.polygons.length; i++) {
        console.log(`    Polygon ${i}: ${stage.polygons[i]!.length} vertices`);
      }
      console.log(`  Opacity: ${stage.opacity.toFixed(2)}`);
    }

    expect(result.stages.length).toBe(2);
  });

  it("should reflect player correctly through vertical surface", () => {
    const reflected = reflectPointThroughLine(
      player,
      plannedSurface.segment.start,
      plannedSurface.segment.end
    );

    console.log(`\nReflected player: (${reflected.x.toFixed(1)}, ${reflected.y.toFixed(1)})`);
    // Expected: x = 850 + (850 - 611.4) = 1088.6
    expect(reflected.x).toBeCloseTo(1088.6, 0);
    expect(reflected.y).toBeCloseTo(666, 0);
  });

  it("should create valid sector looking at vertical surface from player", () => {
    const sector = createLightSectorFromSurface(player, plannedSurface);

    console.log("\nSector from player to surface:");
    console.log(`  Origin: (${sector.origin.x.toFixed(1)}, ${sector.origin.y.toFixed(1)})`);
    console.log(`  Left: (${sector.leftBoundary.x.toFixed(1)}, ${sector.leftBoundary.y.toFixed(1)})`);
    console.log(`  Right: (${sector.rightBoundary.x.toFixed(1)}, ${sector.rightBoundary.y.toFixed(1)})`);

    // Check that surface endpoints are the boundaries
    const isTopLeft =
      (sector.leftBoundary.x === 850 && sector.leftBoundary.y === 350) ||
      (sector.leftBoundary.x === 850 && sector.leftBoundary.y === 500);
    expect(isTopLeft).toBe(true);
  });

  it("should trim full sector to surface extent", () => {
    const fullSector = createFullLightSector(player);
    const trimmed = trimLightSectorBySurface(fullSector, plannedSurface);

    console.log("\nTrimmed sector:");
    if (trimmed) {
      console.log(`  Left: (${trimmed.leftBoundary.x.toFixed(1)}, ${trimmed.leftBoundary.y.toFixed(1)})`);
      console.log(`  Right: (${trimmed.rightBoundary.x.toFixed(1)}, ${trimmed.rightBoundary.y.toFixed(1)})`);
    } else {
      console.log("  NULL - no overlap!");
    }

    expect(trimmed).not.toBeNull();
  });

  it("should create reflected sector with correct boundaries", () => {
    const fullSector = createFullLightSector(player);
    const trimmed = trimLightSectorBySurface(fullSector, plannedSurface);
    expect(trimmed).not.toBeNull();

    const reflected = reflectLightSector(trimmed!, plannedSurface);

    console.log("\nReflected sector:");
    console.log(`  Origin: (${reflected.origin.x.toFixed(1)}, ${reflected.origin.y.toFixed(1)})`);
    console.log(`  Left: (${reflected.leftBoundary.x.toFixed(1)}, ${reflected.leftBoundary.y.toFixed(1)})`);
    console.log(`  Right: (${reflected.rightBoundary.x.toFixed(1)}, ${reflected.rightBoundary.y.toFixed(1)})`);
    console.log(`  StartLine: ${reflected.startLine ? "set" : "NOT set"}`);

    // Origin should be reflected player
    expect(reflected.origin.x).toBeCloseTo(1088.6, 0);

    // Boundaries should still be on the surface (they were on the reflection line)
    expect(reflected.leftBoundary.x).toBe(850);
    expect(reflected.rightBoundary.x).toBe(850);

    // StartLine should be set
    expect(reflected.startLine).toBeDefined();
  });

  it("should have critical points inside the reflected sector", () => {
    const fullSector = createFullLightSector(player);
    const trimmed = trimLightSectorBySurface(fullSector, plannedSurface);
    const reflected = reflectLightSector(trimmed!, plannedSurface);

    // Screen corner (20, 80) should be in the reflected sector
    // (it's to the left of the surface, which is where the reflected origin is looking)
    const topLeft = { x: 20, y: 80 };
    const inSector = isPointInLightSector(topLeft, reflected);

    console.log(`\nIs top-left corner (20, 80) in reflected sector? ${inSector}`);

    // This is the key diagnostic - if false, no polygon vertices will be generated!
    expect(inSector).toBe(true);
  });

  it("should produce second stage with valid polygons", () => {
    const result = propagateThroughSurfaces(
      player,
      [plannedSurface],
      allSurfaces,
      defaultBounds
    );

    console.log("\n=== Stage 1 (reflected) polygon vertices ===");
    if (result.stages.length > 1) {
      const stage1 = result.stages[1]!;
      console.log(`Stage 1 has ${stage1.polygons.length} polygon(s)`);

      for (let i = 0; i < stage1.polygons.length; i++) {
        const poly = stage1.polygons[i]!;
        console.log(`\nPolygon ${i}: ${poly.length} vertices`);
        for (let j = 0; j < Math.min(poly.length, 10); j++) {
          console.log(`  [${j}] (${poly[j]!.x.toFixed(1)}, ${poly[j]!.y.toFixed(1)})`);
        }
        if (poly.length > 10) {
          console.log(`  ... and ${poly.length - 10} more`);
        }
      }

      // The second stage SHOULD have at least one polygon with vertices
      expect(stage1.polygons.length).toBeGreaterThan(0);
      expect(stage1.polygons[0]!.length).toBeGreaterThanOrEqual(3);
    }

    expect(result.stages.length).toBe(2);
  });
});

// =============================================================================
// Case 2: Horizontal surface at y=250
// =============================================================================

describe("Multi-Stage Propagation Diagnostic - Case 2 (horizontal surface)", () => {
  const player = { x: 136.627, y: 666 };
  const plannedSurface = createTestSurface(
    { x: 400, y: 250 },
    { x: 550, y: 250 },
    "ricochet-2"
  );

  const allSurfaces = [
    createTestSurface({ x: 0, y: 700 }, { x: 1280, y: 700 }, "floor", false),
    createTestSurface({ x: 0, y: 80 }, { x: 1280, y: 80 }, "ceiling", false),
    createTestSurface({ x: 20, y: 80 }, { x: 20, y: 700 }, "left-wall", false),
    createTestSurface({ x: 1260, y: 80 }, { x: 1260, y: 700 }, "right-wall", false),
    createTestSurface({ x: 300, y: 450 }, { x: 500, y: 450 }, "platform-1", false),
    createTestSurface({ x: 550, y: 350 }, { x: 750, y: 350 }, "platform-2", false),
    plannedSurface,
  ];

  it("should produce two stages for one planned surface", () => {
    const result = propagateThroughSurfaces(
      player,
      [plannedSurface],
      allSurfaces,
      defaultBounds
    );

    console.log("\n=== Case 2: Horizontal Surface at y=250 ===");
    console.log(`Player: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
    console.log(`Number of stages: ${result.stages.length}`);

    for (const stage of result.stages) {
      console.log(`\nStage ${stage.surfaceIndex}:`);
      console.log(`  Origin: (${stage.origin.x.toFixed(1)}, ${stage.origin.y.toFixed(1)})`);
      console.log(`  Sectors: ${stage.sectors.length}`);
      console.log(`  Polygons: ${stage.polygons.length}`);
      for (let i = 0; i < stage.polygons.length; i++) {
        console.log(`    Polygon ${i}: ${stage.polygons[i]!.length} vertices`);
      }
      console.log(`  Opacity: ${stage.opacity.toFixed(2)}`);
    }

    expect(result.stages.length).toBe(2);
  });

  it("should reflect player correctly through horizontal surface", () => {
    const reflected = reflectPointThroughLine(
      player,
      plannedSurface.segment.start,
      plannedSurface.segment.end
    );

    console.log(`\nReflected player: (${reflected.x.toFixed(1)}, ${reflected.y.toFixed(1)})`);
    // Expected: y = 250 - (666 - 250) = 250 - 416 = -166
    expect(reflected.x).toBeCloseTo(136.627, 0);
    expect(reflected.y).toBeCloseTo(-166, 0);
  });

  it("should have critical points inside the reflected sector", () => {
    const fullSector = createFullLightSector(player);
    const trimmed = trimLightSectorBySurface(fullSector, plannedSurface);
    expect(trimmed).not.toBeNull();

    const reflected = reflectLightSector(trimmed!, plannedSurface);

    console.log("\nReflected sector:");
    console.log(`  Origin: (${reflected.origin.x.toFixed(1)}, ${reflected.origin.y.toFixed(1)})`);
    console.log(`  Left: (${reflected.leftBoundary.x.toFixed(1)}, ${reflected.leftBoundary.y.toFixed(1)})`);
    console.log(`  Right: (${reflected.rightBoundary.x.toFixed(1)}, ${reflected.rightBoundary.y.toFixed(1)})`);

    // Floor center (640, 700) should be in the reflected sector
    // (it's below the surface, which is where the reflected origin is looking)
    const floorCenter = { x: 640, y: 700 };
    const inSector = isPointInLightSector(floorCenter, reflected);

    console.log(`Is floor center (640, 700) in reflected sector? ${inSector}`);
    expect(inSector).toBe(true);
  });

  it("should produce polygon with correct vertex ordering", () => {
    const result = propagateThroughSurfaces(
      player,
      [plannedSurface],
      allSurfaces,
      defaultBounds
    );

    if (result.stages.length > 1) {
      const stage1 = result.stages[1]!;

      console.log("\n=== Stage 1 polygon ordering check ===");
      for (const poly of stage1.polygons) {
        if (poly.length < 3) continue;

        // Check for self-intersection by looking at angle progression
        const origin = stage1.origin;
        const angles = poly.map((p) => Math.atan2(p.y - origin.y, p.x - origin.x));

        console.log("\nAngles (degrees):");
        for (let i = 0; i < Math.min(angles.length, 10); i++) {
          console.log(`  [${i}] ${((angles[i]! * 180) / Math.PI).toFixed(2)}°`);
        }

        // Check for large jumps (indicating wrong order)
        let maxJump = 0;
        for (let i = 0; i < angles.length; i++) {
          const next = (i + 1) % angles.length;
          let jump = Math.abs(angles[next]! - angles[i]!);
          if (jump > Math.PI) jump = 2 * Math.PI - jump;
          maxJump = Math.max(maxJump, jump);
        }

        console.log(`Max angular jump: ${((maxJump * 180) / Math.PI).toFixed(2)}°`);

        // A well-ordered polygon shouldn't have jumps > 180° unless it's the wrap-around
        // More than one large jump indicates wrong ordering
      }
    }

    expect(result.stages.length).toBe(2);
  });
});

