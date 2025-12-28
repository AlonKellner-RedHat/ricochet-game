/**
 * Compare Polygon Outputs: ConeProjectionV2 vs SectorPropagation
 *
 * This test compares the existing (working) ConeProjectionV2 implementation
 * with the new SectorPropagation implementation when there's a single
 * reflective surface and no obstructions.
 *
 * They should produce identical (or very similar) polygons.
 */

import { describe, it, expect } from "vitest";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";

// ConeProjectionV2 imports
import {
  createConeThroughWindow,
  projectConeV2,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { preparePolygonForRendering } from "@/trajectory-v2/visibility/RenderingDedup";

// SectorPropagation imports
import {
  propagateThroughSurfaces,
  createFullLightSector,
  trimLightSectorBySurface,
  blockLightSectorsByObstacles,
  isFullLightSector,
  isPointInLightSector,
  type ScreenBounds,
} from "@/trajectory-v2/visibility/SectorPropagation";

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
// Main Comparison Test
// =============================================================================

describe("Compare Polygon Outputs: ConeProjectionV2 vs SectorPropagation", () => {
  // Scenario: Player at (611.4, 666), vertical planned surface at x=850
  // No obstructions between player and surface - only screen boundaries
  const player = { x: 611.413654, y: 666 };
  const plannedSurface = createTestSurface(
    { x: 850, y: 350 },
    { x: 850, y: 500 },
    "ricochet-4"
  );

  // Only screen boundaries and the planned surface (no obstructions)
  const allSurfaces = [
    createTestSurface({ x: 0, y: 700 }, { x: 1280, y: 700 }, "floor", false),
    createTestSurface({ x: 0, y: 80 }, { x: 1280, y: 80 }, "ceiling", false),
    createTestSurface({ x: 20, y: 80 }, { x: 20, y: 700 }, "left-wall", false),
    createTestSurface({ x: 1260, y: 80 }, { x: 1260, y: 700 }, "right-wall", false),
    plannedSurface,
  ];

  it("Step 1 & 2: Run both implementations and capture outputs", () => {
    // === ConeProjectionV2 Implementation ===
    // Reflect player through the planned surface
    const reflectedOrigin = reflectPointThroughLine(
      player,
      plannedSurface.segment.start,
      plannedSurface.segment.end
    );

    // Create cone through window
    const cone = createConeThroughWindow(
      reflectedOrigin,
      plannedSurface.segment.start,
      plannedSurface.segment.end
    );

    // Project cone and get polygon
    const sourcePoints = projectConeV2(
      cone,
      allSurfaces,
      defaultBounds,
      plannedSurface.id // Exclude the window surface
    );
    const conePolygonRaw = toVector2Array(sourcePoints);
    const conePolygon = preparePolygonForRendering(conePolygonRaw);

    // === SectorPropagation Implementation ===
    const propResult = propagateThroughSurfaces(
      player,
      [plannedSurface],
      allSurfaces,
      defaultBounds
    );

    // Get the second stage polygon (after reflection)
    const stage1 = propResult.stages.find((s) => s.surfaceIndex === 0);
    const sectorPolygon = stage1?.polygons[0] ?? [];

    // === Output Comparison ===
    console.log("\n=== ConeProjectionV2 Output ===");
    console.log(`Origin: (${reflectedOrigin.x.toFixed(1)}, ${reflectedOrigin.y.toFixed(1)})`);
    console.log(`Cone boundaries:`);
    console.log(`  Left: (${cone.leftBoundary.x.toFixed(1)}, ${cone.leftBoundary.y.toFixed(1)})`);
    console.log(`  Right: (${cone.rightBoundary.x.toFixed(1)}, ${cone.rightBoundary.y.toFixed(1)})`);
    console.log(`Raw polygon vertices: ${conePolygonRaw.length}`);
    console.log(`Final polygon vertices: ${conePolygon.length}`);

    if (conePolygon.length > 0) {
      console.log("First 10 vertices:");
      for (let i = 0; i < Math.min(10, conePolygon.length); i++) {
        const v = conePolygon[i]!;
        const angle = Math.atan2(v.y - reflectedOrigin.y, v.x - reflectedOrigin.x);
        console.log(`  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)}) angle=${(angle * 180 / Math.PI).toFixed(1)}°`);
      }
    }

    console.log("\n=== SectorPropagation Output ===");
    console.log(`Number of stages: ${propResult.stages.length}`);

    for (const stage of propResult.stages) {
      console.log(`\nStage ${stage.surfaceIndex}:`);
      console.log(`  Origin: (${stage.origin.x.toFixed(1)}, ${stage.origin.y.toFixed(1)})`);
      console.log(`  Sectors: ${stage.sectors.length}`);
      if (stage.sectors.length > 0) {
        const s = stage.sectors[0]!;
        console.log(`    Sector[0] left: (${s.leftBoundary.x.toFixed(1)}, ${s.leftBoundary.y.toFixed(1)})`);
        console.log(`    Sector[0] right: (${s.rightBoundary.x.toFixed(1)}, ${s.rightBoundary.y.toFixed(1)})`);
        console.log(`    Sector[0] startLine: ${s.startLine ? "set" : "NOT set"}`);
      }
      console.log(`  Polygons: ${stage.polygons.length}`);
      for (let p = 0; p < stage.polygons.length; p++) {
        console.log(`    Polygon[${p}]: ${stage.polygons[p]!.length} vertices`);
      }
    }

    if (sectorPolygon.length > 0) {
      console.log("\nStage 1 polygon vertices:");
      for (let i = 0; i < Math.min(10, sectorPolygon.length); i++) {
        const v = sectorPolygon[i]!;
        const angle = Math.atan2(v.y - (stage1?.origin.y ?? 0), v.x - (stage1?.origin.x ?? 0));
        console.log(`  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)}) angle=${(angle * 180 / Math.PI).toFixed(1)}°`);
      }
    }

    // === Comparison ===
    console.log("\n=== Comparison ===");
    console.log(`ConeProjectionV2 vertices: ${conePolygon.length}`);
    console.log(`SectorPropagation stage 1 vertices: ${sectorPolygon.length}`);
    console.log(`Difference: ${conePolygon.length - sectorPolygon.length}`);

    // The ConeProjectionV2 should produce a valid polygon
    expect(conePolygon.length).toBeGreaterThanOrEqual(3);

    // Record this for analysis - we don't assert equality yet
    // Just capture the data for Step 3 analysis
  });

  it("Step 3: Analyze discrepancies - check if origins match", () => {
    const reflectedOrigin = reflectPointThroughLine(
      player,
      plannedSurface.segment.start,
      plannedSurface.segment.end
    );

    const propResult = propagateThroughSurfaces(
      player,
      [plannedSurface],
      allSurfaces,
      defaultBounds
    );

    // Check if stage 1 exists and has the correct origin
    const stage1 = propResult.stages.find((s) => s.surfaceIndex === 0);

    console.log("\n=== Origin Comparison ===");
    console.log(`Expected (reflected player): (${reflectedOrigin.x.toFixed(1)}, ${reflectedOrigin.y.toFixed(1)})`);

    if (stage1) {
      console.log(`SectorPropagation stage 1 origin: (${stage1.origin.x.toFixed(1)}, ${stage1.origin.y.toFixed(1)})`);

      expect(stage1.origin.x).toBeCloseTo(reflectedOrigin.x, 0);
      expect(stage1.origin.y).toBeCloseTo(reflectedOrigin.y, 0);
    } else {
      console.log("SectorPropagation: NO STAGE 1 EXISTS!");
      console.log("This is the problem - propagation stopped before creating stage 1");

      // Log why it might have stopped
      console.log("\nDiagnosing why propagation stopped early...");

      // Check stage 0
      const stage0 = propResult.stages[0];
      if (stage0) {
        console.log(`Stage 0 sectors: ${stage0.sectors.length}`);
        if (stage0.sectors.length > 0) {
          console.log("Stage 0 has sectors, so trimming to surface should work...");
        }
      }

      expect(stage1).toBeDefined();
    }
  });

  it("Step 3b: Diagnose why propagation stops early", () => {
    console.log("\n=== Step-by-step propagation trace ===");

    // Step 1: Create initial full sector
    const initialSector = createFullLightSector(player);
    console.log(`1. Initial sector: full=${isFullLightSector(initialSector)}`);

    // Step 2: Trim to planned surface
    const trimmed = trimLightSectorBySurface(initialSector, plannedSurface);
    console.log(`2. After trim to surface: ${trimmed ? "sector exists" : "NULL"}`);
    if (trimmed) {
      console.log(`   Left: (${trimmed.leftBoundary.x.toFixed(1)}, ${trimmed.leftBoundary.y.toFixed(1)})`);
      console.log(`   Right: (${trimmed.rightBoundary.x.toFixed(1)}, ${trimmed.rightBoundary.y.toFixed(1)})`);
    }

    // Step 3: Block by obstacles
    if (trimmed) {
      const blocked = blockLightSectorsByObstacles(
        [trimmed],
        allSurfaces,
        plannedSurface.id
      );
      console.log(`3. After blocking by obstacles: ${blocked.length} sector(s)`);
      if (blocked.length === 0) {
        console.log("   BLOCKED! This is why propagation stops.");
        console.log("   All light to the surface was blocked by obstacles.");

        // Check which obstacle blocked it - one at a time
        console.log("\n   Testing each surface individually:");
        for (const surface of allSurfaces) {
          if (surface.id === plannedSurface.id) {
            console.log(`   - ${surface.id}: EXCLUDED (target surface)`);
            continue;
          }
          const singleBlock = blockLightSectorsByObstacles([trimmed], [surface]);
          console.log(`   - ${surface.id}: ${singleBlock.length} sector(s) remain`);
          if (singleBlock.length === 0) {
            console.log(`     ^^^ THIS SURFACE FULLY BLOCKS THE SECTOR!`);
            console.log(`     Surface: (${surface.segment.start.x}, ${surface.segment.start.y}) -> (${surface.segment.end.x}, ${surface.segment.end.y})`);
          }
        }

        // Also test blocking progressively with sector details
        console.log("\n   Testing progressive blocking with sector details:");
        let current = [trimmed];
        for (const surface of allSurfaces) {
          if (surface.id === plannedSurface.id) continue;
          const before = current.length;
          const beforeSectors = current.map(s => ({
            left: `(${s.leftBoundary.x.toFixed(0)}, ${s.leftBoundary.y.toFixed(0)})`,
            right: `(${s.rightBoundary.x.toFixed(0)}, ${s.rightBoundary.y.toFixed(0)})`
          }));
          
          current = blockLightSectorsByObstacles(current, [surface]);
          
          const afterSectors = current.map(s => ({
            left: `(${s.leftBoundary.x.toFixed(0)}, ${s.leftBoundary.y.toFixed(0)})`,
            right: `(${s.rightBoundary.x.toFixed(0)}, ${s.rightBoundary.y.toFixed(0)})`
          }));
          
          console.log(`   ${surface.id}: ${before} -> ${current.length}`);
          if (before !== current.length || before > 0) {
            console.log(`     Before: ${JSON.stringify(beforeSectors)}`);
            console.log(`     After: ${JSON.stringify(afterSectors)}`);
          }
          
          if (current.length === 0) {
            console.log(`   STOPPED at ${surface.id}`);
            break;
          }
        }
      }
    }
  });

  it("Step 4 & 5: HYPOTHESIS - blockLightSectorByObstacle doesn't check distance", () => {
    // HYPOTHESIS: blockLightSectorByObstacle blocks sectors using obstacles
    // that are FARTHER from origin than the sector boundaries.
    // It only checks angular containment, not distance.

    console.log("\n=== HYPOTHESIS TEST ===");
    console.log("Testing: Does blockLightSectorByObstacle incorrectly use far obstacles?");

    // Setup: Simple sector from player to planned surface
    const sector = trimLightSectorBySurface(
      createFullLightSector(player),
      plannedSurface
    )!;

    console.log(`Sector: left=(${sector.leftBoundary.x}, ${sector.leftBoundary.y}), right=(${sector.rightBoundary.x}, ${sector.rightBoundary.y})`);

    // Calculate distances from player
    const distToLeft = Math.sqrt(
      (sector.leftBoundary.x - player.x) ** 2 +
      (sector.leftBoundary.y - player.y) ** 2
    );
    const distToRight = Math.sqrt(
      (sector.rightBoundary.x - player.x) ** 2 +
      (sector.rightBoundary.y - player.y) ** 2
    );

    console.log(`Distance to left boundary: ${distToLeft.toFixed(1)}`);
    console.log(`Distance to right boundary: ${distToRight.toFixed(1)}`);

    // Ceiling endpoint that is FARTHER but angularly INSIDE
    const ceilingCorner = { x: 1280, y: 80 };
    const distToCeiling = Math.sqrt(
      (ceilingCorner.x - player.x) ** 2 +
      (ceilingCorner.y - player.y) ** 2
    );

    console.log(`Distance to ceiling corner (1280, 80): ${distToCeiling.toFixed(1)}`);

    // Check if ceiling corner is angularly inside the sector
    const ceilingInSector = isPointInLightSector(ceilingCorner, sector);
    console.log(`Is ceiling corner angularly inside sector? ${ceilingInSector}`);

    // CONFIRM HYPOTHESIS:
    // 1. Ceiling corner is farther than sector boundaries
    expect(distToCeiling).toBeGreaterThan(distToLeft);
    expect(distToCeiling).toBeGreaterThan(distToRight);
    console.log("CONFIRMED: Ceiling corner is farther than sector boundaries");

    // 2. Ceiling corner is angularly inside the sector
    expect(ceilingInSector).toBe(true);
    console.log("CONFIRMED: Ceiling corner is angularly inside the sector");

    // 3. Blocking with ceiling modifies the sector (BUG!)
    const ceiling = createTestSurface({ x: 0, y: 80 }, { x: 1280, y: 80 }, "ceiling", false);
    const blockedByCeiling = blockLightSectorsByObstacles([sector], [ceiling]);
    
    const sectorChanged = blockedByCeiling.length === 0 || (
      blockedByCeiling.length === 1 && (
        blockedByCeiling[0]!.leftBoundary.x !== sector.leftBoundary.x ||
        blockedByCeiling[0]!.leftBoundary.y !== sector.leftBoundary.y ||
        blockedByCeiling[0]!.rightBoundary.x !== sector.rightBoundary.x ||
        blockedByCeiling[0]!.rightBoundary.y !== sector.rightBoundary.y
      )
    );

    console.log(`After blocking with ceiling, sector changed: ${sectorChanged}`);
    if (blockedByCeiling.length === 1) {
      console.log(`New boundaries: left=(${blockedByCeiling[0]!.leftBoundary.x}, ${blockedByCeiling[0]!.leftBoundary.y}), right=(${blockedByCeiling[0]!.rightBoundary.x}, ${blockedByCeiling[0]!.rightBoundary.y})`);
    }

    // This is the bug - ceiling SHOULD NOT modify the sector because it's farther
    // But currently it DOES modify it (sectorChanged = true)
    console.log("\nHYPOTHESIS RESULT:");
    if (sectorChanged) {
      console.log("BUG CONFIRMED: blockLightSectorByObstacle incorrectly uses");
      console.log("obstacles that are FARTHER than the sector boundaries.");
      console.log("It only checks angular containment, not distance.");
    } else {
      console.log("HYPOTHESIS REJECTED: Sector was not modified by far obstacle.");
    }

    // Assert that the bug exists (this test documents the bug)
    // When we fix the bug, this assertion should be inverted
    expect(sectorChanged).toBe(true); // BUG: currently true, should be false after fix
  });
});

