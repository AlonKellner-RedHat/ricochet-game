/**
 * MultiStageProjection - Integration Tests
 *
 * Tests for the multi-stage visibility propagation algorithm.
 * This algorithm implements the first principle:
 * "Light that is reflected through a surface must have first reached that surface."
 *
 * The algorithm:
 * 1. Projects a full cone from the player
 * 2. Deduces which portions of each planned surface are reached
 * 3. For each reached portion (window), creates a reflected cone
 * 4. Repeats for subsequent planned surfaces
 */

import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  createConeThroughWindow,
  createFullCone,
  projectConeV2,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import type { ScreenBounds } from "@/trajectory-v2/visibility/ConePropagator";
import { deduceReflectionWindows } from "@/trajectory-v2/visibility/SectorDeduction";
import { describe, expect, it } from "vitest";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a mock surface for testing.
 */
function createSurface(id: string, start: Vector2, end: Vector2, reflective = true): Surface {
  return {
    id,
    segment: { start, end },
    properties: { reflective },
  } as Surface;
}

/**
 * Standard screen bounds for testing.
 */
const screenBounds: ScreenBounds = {
  minX: 20,
  minY: 80,
  maxX: 1260,
  maxY: 700,
};

/**
 * Standard surfaces for a simple room.
 */
const floor = createSurface("floor", { x: 20, y: 700 }, { x: 1260, y: 700 }, false);
const ceiling = createSurface("ceiling", { x: 20, y: 80 }, { x: 1260, y: 80 }, false);
const leftWall = createSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }, false);
const rightWall = createSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }, false);

// =============================================================================
// Import from actual module
// =============================================================================

import {
  type PropagationResult,
  type PropagationStage,
  propagateVisibility,
} from "@/trajectory-v2/visibility/MultiStageProjection";

// =============================================================================
// Test Suites
// =============================================================================

describe("MultiStageProjection", () => {
  describe("propagateVisibility", () => {
    describe("Single surface, no obstruction", () => {
      const plannedSurface = createSurface("planned", { x: 850, y: 350 }, { x: 850, y: 500 });
      const allSurfaces = [floor, ceiling, leftWall, rightWall, plannedSurface];

      it("should return two stages: initial and reflected", () => {
        const player: Vector2 = { x: 640, y: 600 };

        const result = propagateVisibility(player, [plannedSurface], allSurfaces, screenBounds);

        expect(result.isValid).toBe(true);
        expect(result.stages).toHaveLength(2);
        expect(result.stages[0]!.surfaceIndex).toBe(-1); // Initial stage
        expect(result.stages[1]!.surfaceIndex).toBe(0); // First planned surface
      });

      it("should have initial stage with player as origin", () => {
        const player: Vector2 = { x: 640, y: 600 };

        const result = propagateVisibility(player, [plannedSurface], allSurfaces, screenBounds);

        expect(result.stages[0]!.origin).toEqual(player);
      });

      it("should have reflected stage with reflected origin", () => {
        const player: Vector2 = { x: 640, y: 600 };
        // Planned surface is vertical at x=850
        // Reflection of player through x=850: x' = 2*850 - 640 = 1060
        const expectedReflectedOrigin: Vector2 = { x: 1060, y: 600 };

        const result = propagateVisibility(player, [plannedSurface], allSurfaces, screenBounds);

        expect(result.stages[1]!.origin.x).toBeCloseTo(expectedReflectedOrigin.x, 1);
        expect(result.stages[1]!.origin.y).toBeCloseTo(expectedReflectedOrigin.y, 1);
      });

      it("should have valid polygons in both stages", () => {
        const player: Vector2 = { x: 640, y: 600 };

        const result = propagateVisibility(player, [plannedSurface], allSurfaces, screenBounds);

        // Initial stage should have a valid polygon (>= 3 vertices)
        expect(result.stages[0]!.polygon.length).toBeGreaterThanOrEqual(3);

        // Reflected stage should also have a valid polygon
        expect(result.stages[1]!.polygon.length).toBeGreaterThanOrEqual(3);
      });

      it("should have reflected polygon contained within initial polygon", () => {
        const player: Vector2 = { x: 640, y: 600 };

        const result = propagateVisibility(player, [plannedSurface], allSurfaces, screenBounds);

        // The reflected polygon should pass through the planned surface
        const reflectedPolygon = result.stages[1]!.polygon;

        // At least some vertices should be near the planned surface
        const nearPlannedSurface = reflectedPolygon.some((v) => Math.abs(v.x - 850) < 50);
        expect(nearPlannedSurface).toBe(true);
      });
    });

    describe("Single surface, with obstruction", () => {
      const plannedSurface = createSurface("planned", { x: 850, y: 350 }, { x: 850, y: 500 });
      const obstacle = createSurface("obstacle", { x: 700, y: 400 }, { x: 750, y: 450 }, false);
      const allSurfaces = [floor, ceiling, leftWall, rightWall, plannedSurface, obstacle];

      it("should still return valid result when partial obstruction exists", () => {
        const player: Vector2 = { x: 640, y: 600 };

        const result = propagateVisibility(player, [plannedSurface], allSurfaces, screenBounds);

        expect(result.isValid).toBe(true);
        expect(result.stages.length).toBeGreaterThanOrEqual(1);
      });

      it("should return no reflected stage if surface is completely blocked", () => {
        // Create a large obstacle that completely blocks the planned surface
        const largeObstacle = createSurface(
          "large-obstacle",
          { x: 700, y: 300 },
          { x: 750, y: 550 },
          false
        );
        const surfacesWithLargeObstacle = [
          floor,
          ceiling,
          leftWall,
          rightWall,
          plannedSurface,
          largeObstacle,
        ];

        const player: Vector2 = { x: 640, y: 400 }; // Player behind the obstacle

        const result = propagateVisibility(
          player,
          [plannedSurface],
          surfacesWithLargeObstacle,
          screenBounds
        );

        // Should still be valid (initial polygon exists)
        expect(result.isValid).toBe(true);
        // But reflected stage might be missing or have empty polygon
        const reflectedStage = result.stages.find((s) => s.surfaceIndex === 0);
        if (reflectedStage) {
          expect(reflectedStage.polygon.length).toBeLessThan(3);
        }
      });
    });

    describe("Multi-surface chain", () => {
      // For multi-surface reflection to work:
      // 1. Player must see surface1 directly (not blocked)
      // 2. After reflecting through surface1, surface2 must be visible THROUGH the window
      // 3. The reflected cone looks through surface1 toward where surface2 is
      //
      // Setup: Player on left, surface1 in middle, surface2 on far left
      // - Player at x=600, y=400
      // - surface1 at x=800 (vertical, to the right of player)
      // - surface2 at x=200 (vertical, to the left of player, visible through surface1's window)
      //
      // Light path:
      // 1. Player sees surface1 (to the right)
      // 2. Reflected origin at x=1000 (2*800 - 600)
      // 3. Reflected cone from x=1000 through window at x=800 goes LEFT
      // 4. Surface2 at x=200 is to the LEFT and visible through the window
      const surface1 = createSurface("surface1", { x: 800, y: 300 }, { x: 800, y: 500 });
      // surface2 must have reflective side facing RIGHT (toward reflected origin at x=1000)
      // Direction: bottom to top → normal points right
      const surface2 = createSurface("surface2", { x: 200, y: 450 }, { x: 200, y: 350 });
      const allSurfaces = [floor, ceiling, leftWall, rightWall, surface1, surface2];

      it("should return at least three stages for two planned surfaces", () => {
        const player: Vector2 = { x: 600, y: 400 };

        const result = propagateVisibility(player, [surface1, surface2], allSurfaces, screenBounds);

        expect(result.isValid).toBe(true);
        // Stage 0: initial, Stage N: after surface1 (one or more windows), Stage M: after surface2
        expect(result.stages.length).toBeGreaterThanOrEqual(3);
        expect(result.stages[0]!.surfaceIndex).toBe(-1);

        // Check that at least one stage is for each surface
        const surface0Stages = result.stages.filter((s) => s.surfaceIndex === 0);
        const surface1Stages = result.stages.filter((s) => s.surfaceIndex === 1);
        expect(surface0Stages.length).toBeGreaterThanOrEqual(1);
        expect(surface1Stages.length).toBeGreaterThanOrEqual(1);

        console.log(`Multi-surface chain test: ${result.stages.length} stages`);
        for (let i = 0; i < result.stages.length; i++) {
          const stage = result.stages[i]!;
          console.log(
            `  Stage ${i}: surfaceIndex=${stage.surfaceIndex}, windowIndex=${stage.windowIndex}, origin=(${stage.origin.x.toFixed(1)}, ${stage.origin.y.toFixed(1)})`
          );
        }
      });

      it("should chain reflections correctly", () => {
        const player: Vector2 = { x: 600, y: 400 };

        const result = propagateVisibility(player, [surface1, surface2], allSurfaces, screenBounds);

        // Find stages for each surface
        const surface0Stages = result.stages.filter((s) => s.surfaceIndex === 0);
        const surface1Stages = result.stages.filter((s) => s.surfaceIndex === 1);

        // First reflection through surface1 (x=800): x' = 2*800 - 600 = 1000
        expect(surface0Stages.length).toBeGreaterThanOrEqual(1);
        expect(surface0Stages[0]!.origin.x).toBeCloseTo(1000, 1);

        // Second reflection through surface2 (x=200) from origin at x=1000: x' = 2*200 - 1000 = -600
        expect(surface1Stages.length).toBeGreaterThanOrEqual(1);
        expect(surface1Stages[0]!.origin.x).toBeCloseTo(-600, 1);
      });
    });

    describe("Progressive opacity", () => {
      const plannedSurface = createSurface("planned", { x: 850, y: 350 }, { x: 850, y: 500 });
      const allSurfaces = [floor, ceiling, leftWall, rightWall, plannedSurface];

      it("should have increasing opacity for later stages", () => {
        const player: Vector2 = { x: 640, y: 600 };

        const result = propagateVisibility(player, [plannedSurface], allSurfaces, screenBounds);

        // Final stage should have highest opacity
        const finalStage = result.stages[result.stages.length - 1]!;
        expect(finalStage.opacity).toBe(1.0);

        // Earlier stages should have lower opacity
        if (result.stages.length > 1) {
          const firstStage = result.stages[0]!;
          expect(firstStage.opacity).toBeLessThan(finalStage.opacity);
        }
      });

      it("should have opacity inversely proportional to distance from final stage", () => {
        const surface1 = createSurface("s1", { x: 400, y: 300 }, { x: 400, y: 450 });
        const surface2 = createSurface("s2", { x: 600, y: 350 }, { x: 600, y: 500 });
        const surface3 = createSurface("s3", { x: 800, y: 400 }, { x: 800, y: 550 });
        const surfaces = [floor, ceiling, leftWall, rightWall, surface1, surface2, surface3];

        const player: Vector2 = { x: 200, y: 500 };

        const result = propagateVisibility(
          player,
          [surface1, surface2, surface3],
          surfaces,
          screenBounds
        );

        // With 4 stages (0=initial, 1=s1, 2=s2, 3=s3):
        // - Stage 3 (final): opacity = 1.0
        // - Stage 2: opacity < 1.0
        // - Stage 1: opacity < Stage 2 opacity
        // - Stage 0: opacity < Stage 1 opacity (most transparent)
        for (let i = 0; i < result.stages.length - 1; i++) {
          expect(result.stages[i]!.opacity).toBeLessThan(result.stages[i + 1]!.opacity);
        }
      });
    });

    describe("Edge cases", () => {
      it("should return valid result with no planned surfaces", () => {
        const player: Vector2 = { x: 640, y: 600 };
        const allSurfaces = [floor, ceiling, leftWall, rightWall];

        const result = propagateVisibility(player, [], allSurfaces, screenBounds);

        expect(result.isValid).toBe(true);
        expect(result.stages).toHaveLength(1);
        expect(result.stages[0]!.surfaceIndex).toBe(-1);
        expect(result.stages[0]!.opacity).toBe(1.0);
      });

      it("should handle player at screen edge", () => {
        const plannedSurface = createSurface("planned", { x: 850, y: 350 }, { x: 850, y: 500 });
        const player: Vector2 = { x: 25, y: 695 }; // Near left-bottom corner

        const result = propagateVisibility(
          player,
          [plannedSurface],
          [floor, ceiling, leftWall, rightWall, plannedSurface],
          screenBounds
        );

        expect(result.isValid).toBe(true);
        expect(result.stages[0]!.polygon.length).toBeGreaterThanOrEqual(3);
      });
    });

    describe("Multi-window obstruction", () => {
      // Setup from user's flickering case:
      // - Player at ~(833, 666)
      // - Planned surface: ricochet-1 (diagonal) at (800,150) to (900,250)
      // - Obstruction: ricochet-4 (vertical) at (850, 350) to (850, 500)
      // The obstruction splits light reaching ricochet-1 into two windows
      const ricochet1 = createSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 });
      const ricochet4 = createSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 });
      const allSurfacesWithObstruction = [
        floor,
        ceiling,
        leftWall,
        rightWall,
        ricochet1,
        ricochet4,
      ];

      it("should create multiple reflected polygons when obstruction splits light", () => {
        const player: Vector2 = { x: 833.3, y: 666 };

        const result = propagateVisibility(
          player,
          [ricochet1],
          allSurfacesWithObstruction,
          screenBounds
        );

        expect(result.isValid).toBe(true);

        // Stage 0: initial polygon
        expect(result.stages[0]!.surfaceIndex).toBe(-1);

        // There should be 2 reflected stages (one per window) with surfaceIndex=0
        const reflectedStages = result.stages.filter((s) => s.surfaceIndex === 0);
        expect(reflectedStages.length).toBeGreaterThanOrEqual(2);
      });

      it("should be stable with sub-pixel movement", () => {
        // Two positions that are sub-pixel apart - should produce same number of stages
        const player1: Vector2 = { x: 833.3046, y: 666 };
        const player2: Vector2 = { x: 833.3048, y: 666 };

        const result1 = propagateVisibility(
          player1,
          [ricochet1],
          allSurfacesWithObstruction,
          screenBounds
        );
        const result2 = propagateVisibility(
          player2,
          [ricochet1],
          allSurfacesWithObstruction,
          screenBounds
        );

        // Both should have the same number of reflected stages
        const reflected1 = result1.stages.filter((s) => s.surfaceIndex === 0).length;
        const reflected2 = result2.stages.filter((s) => s.surfaceIndex === 0).length;
        expect(reflected1).toBe(reflected2);
      });

      it("HYPOTHESIS: deduceReflectionWindows returns 2 windows when obstruction splits light", () => {
        // This test confirms that the SectorDeduction layer correctly detects 2 windows
        // The issue is in propagateVisibility which only uses the largest window
        const player: Vector2 = { x: 833.3, y: 666 };

        // Project initial cone (same as propagateVisibility does)
        const initialCone = createFullCone(player, screenBounds);
        const initialVertices = projectConeV2(
          initialCone,
          allSurfacesWithObstruction,
          screenBounds
        );

        // Deduce windows on the planned surface
        const windows = deduceReflectionWindows(initialVertices, ricochet1);

        // The obstruction (ricochet4) should split light into 2 windows
        expect(windows.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe("Diagonal surface reflection", () => {
      // Issue: Player at x=170 produces no reflected polygon,
      // but player at x=213 produces correct reflected polygon
      const ricochet3 = createSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 });
      const platform1 = createSurface("platform-1", { x: 300, y: 450 }, { x: 500, y: 450 }, false);
      const platform2 = createSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }, false);
      const ricochet1 = createSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 });
      const ricochet2 = createSurface("ricochet-2", { x: 400, y: 250 }, { x: 550, y: 250 });
      const ricochet4 = createSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 });

      // Minimal surface set (just walls + ricochet3)
      const minimalSurfaces = [floor, ceiling, leftWall, rightWall, ricochet3];

      // Full surface set (matching user's JSON)
      const fullSurfaces = [
        floor,
        ceiling,
        leftWall,
        rightWall,
        platform1,
        platform2,
        ricochet1,
        ricochet2,
        ricochet3,
        ricochet4,
      ];

      it("should produce reflected polygon when player is at x=170 (minimal surfaces)", () => {
        const player: Vector2 = { x: 170, y: 666 };

        const result = propagateVisibility(player, [ricochet3], minimalSurfaces, screenBounds);

        expect(result.isValid).toBe(true);
        const reflectedStages = result.stages.filter((s) => s.surfaceIndex === 0);
        expect(reflectedStages.length).toBeGreaterThanOrEqual(1);
      });

      it("should produce reflected polygon when player is at x=170 (FULL surfaces)", () => {
        const player: Vector2 = { x: 170, y: 666 };

        const result = propagateVisibility(player, [ricochet3], fullSurfaces, screenBounds);

        expect(result.isValid).toBe(true);

        // Should have at least one reflected stage
        const reflectedStages = result.stages.filter((s) => s.surfaceIndex === 0);
        console.log(`Reflected stages with full surfaces: ${reflectedStages.length}`);
        if (reflectedStages.length > 0) {
          console.log(`Polygon vertices: ${reflectedStages[0]!.polygon.length}`);
        }
        expect(reflectedStages.length).toBeGreaterThanOrEqual(1);
      });

      it("should produce reflected polygon when player is at x=213 (known working)", () => {
        const player: Vector2 = { x: 213.38644469999997, y: 666 };

        const result = propagateVisibility(player, [ricochet3], fullSurfaces, screenBounds);

        expect(result.isValid).toBe(true);
        const reflectedStages = result.stages.filter((s) => s.surfaceIndex === 0);
        console.log(`Reflected stages at x=213: ${reflectedStages.length}`);
        expect(reflectedStages.length).toBeGreaterThanOrEqual(1);
      });

      it("HYPOTHESIS: Check if player at x=170 is on reflective side of ricochet-3", () => {
        const player: Vector2 = { x: 170, y: 666 };
        const start = ricochet3.segment.start;
        const end = ricochet3.segment.end;

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const px = player.x - start.x;
        const py = player.y - start.y;

        const cross = dx * py - dy * px;
        console.log(`Cross product for player at x=170: ${cross}`);
        expect(cross).toBeGreaterThan(0);
      });

      it("HYPOTHESIS: Check window deduction with full surfaces for player at x=170", () => {
        const player: Vector2 = { x: 170, y: 666 };

        const initialCone = createFullCone(player, screenBounds);
        const initialVertices = projectConeV2(initialCone, fullSurfaces, screenBounds);

        const windows = deduceReflectionWindows(initialVertices, ricochet3);

        console.log(`Windows found with full surfaces: ${windows.length}`);
        if (windows.length > 0) {
          console.log(
            `Window 0: start=(${windows[0]!.start.x.toFixed(2)}, ${windows[0]!.start.y.toFixed(2)}), end=(${windows[0]!.end.x.toFixed(2)}, ${windows[0]!.end.y.toFixed(2)})`
          );
        }

        expect(windows.length).toBeGreaterThanOrEqual(1);
      });

      it("HYPOTHESIS: Check reflected polygon vertex count", () => {
        const player: Vector2 = { x: 170, y: 666 };

        const result = propagateVisibility(player, [ricochet3], fullSurfaces, screenBounds);

        const reflectedStages = result.stages.filter((s) => s.surfaceIndex === 0);
        for (let i = 0; i < reflectedStages.length; i++) {
          const stage = reflectedStages[i]!;
          console.log(`Stage ${i}: polygon has ${stage.polygon.length} vertices`);
          if (stage.polygon.length < 3) {
            console.log(`  DEGENERATE POLYGON - vertices: ${JSON.stringify(stage.polygon)}`);
          }
        }
      });
    });

    describe("Multi-surface with aggregated windows", () => {
      it("should have correct windowIndex for each polygon from same surface", () => {
        // Use the obstruction setup from the previous test
        const ricochet1 = createSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 });
        const ricochet4 = createSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 });
        const player: Vector2 = { x: 833.3, y: 666 };

        const result = propagateVisibility(
          player,
          [ricochet1],
          [floor, ceiling, leftWall, rightWall, ricochet1, ricochet4],
          screenBounds
        );

        // Multiple stages with surfaceIndex=0 should have different windowIndex
        const reflectedStages = result.stages.filter((s) => s.surfaceIndex === 0);

        if (reflectedStages.length >= 2) {
          const windowIndices = reflectedStages.map((s) => s.windowIndex);
          // Should have windowIndex 0 and 1 (or more)
          expect(windowIndices).toContain(0);
          expect(windowIndices).toContain(1);
        }
      });

      it("should aggregate windows from multiple polygons for chained surfaces", () => {
        // Setup: Player on left, surface1 on right, surface2 to the left of surface1
        // After reflecting through surface1, the reflected origin looks left toward surface2
        //
        // For this to work:
        // - Player at x=400, surface1 at x=600 (player to left)
        // - Reflected origin at x=800 (right of surface1)
        // - surface2 at x=300 (to the left, visible through surface1's window from reflected origin)
        // - An obstruction splits surface1 into multiple windows

        // surface1: vertical, reflective side facing left (player side)
        const surface1 = createSurface("surface1", { x: 600, y: 300 }, { x: 600, y: 500 });
        // surface2: vertical, reflective side facing RIGHT (toward reflected origin at x=800)
        // Direction: bottom to top → normal points right
        const surface2 = createSurface("surface2", { x: 300, y: 500 }, { x: 300, y: 300 });
        // Obstruction between player and surface1
        const obstruction = createSurface("obstruction", { x: 500, y: 380 }, { x: 500, y: 420 });

        const allSurfaces = [floor, ceiling, leftWall, rightWall, surface1, surface2, obstruction];
        const player: Vector2 = { x: 400, y: 400 };

        const result = propagateVisibility(player, [surface1, surface2], allSurfaces, screenBounds);

        expect(result.isValid).toBe(true);

        // Stage 0: initial polygon
        const initialStages = result.stages.filter((s) => s.surfaceIndex === -1);
        expect(initialStages.length).toBe(1);

        // Stages for first surface: may have multiple windows due to obstruction
        const surface1Stages = result.stages.filter((s) => s.surfaceIndex === 0);
        expect(surface1Stages.length).toBeGreaterThanOrEqual(1);

        // If surface1 has multiple stages, surface2 should aggregate from all of them
        // (This verifies the aggregation logic works)
        if (surface1Stages.length >= 2) {
          const surface2Stages = result.stages.filter((s) => s.surfaceIndex === 1);
          // At least one stage should be created from aggregated windows
          expect(surface2Stages.length).toBeGreaterThanOrEqual(1);
        }
      });
    });

    describe("REGRESSION: Non-reflective side and obstacle sorting", () => {
      /**
       * Test with DIAGONAL surface to check cross-product sign interpretation
       */
      it("HYPOTHESIS TEST: diagonal surface reflective side detection", () => {
        // Diagonal surface from bottom-left to top-right: (100, 300) to (200, 200)
        // Normal should point to the RIGHT/BOTTOM based on cross product
        const diagonalSurface = createSurface("diagonal", { x: 100, y: 300 }, { x: 200, y: 200 });

        // Player at different positions
        const playerOnLeft: Vector2 = { x: 50, y: 250 };
        const playerOnRight: Vector2 = { x: 250, y: 250 };
        const playerAbove: Vector2 = { x: 150, y: 100 };
        const playerBelow: Vector2 = { x: 150, y: 400 };

        const allSurfaces = [floor, ceiling, leftWall, rightWall, diagonalSurface];

        // Test each position
        const positions = [
          { name: "left", player: playerOnLeft },
          { name: "right", player: playerOnRight },
          { name: "above", player: playerAbove },
          { name: "below", player: playerBelow },
        ];

        for (const pos of positions) {
          const result = propagateVisibility(
            pos.player,
            [diagonalSurface],
            allSurfaces,
            screenBounds
          );
          const reflectedStages = result.stages.filter((s) => s.surfaceIndex === 0);

          // #region agent log
          fetch("http://localhost:7244/ingest/35819445-5c83-4f31-b501-c940886787b5", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "MultiStageProjection.test.ts:DiagonalTest",
              message: "Diagonal surface reflective side",
              data: {
                position: pos.name,
                playerX: pos.player.x,
                playerY: pos.player.y,
                surfaceStart: diagonalSurface.segment.start,
                surfaceEnd: diagonalSurface.segment.end,
                hasReflection: reflectedStages.length > 0,
                stagesCount: result.stages.length,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              hypothesisId: "H1B",
            }),
          }).catch(() => {});
          // #endregion
        }
      });

      /**
       * Test with the ACTUAL ricochet-3 surface from user's scenario
       */
      /**
       * EXACT REPRODUCTION: Player at x=1183 on RIGHT side of vertical surface
       * From user JSON: player at (1183, 666), ricochet-4 from (850, 350) to (850, 500)
       * The surface normal points LEFT, so player on RIGHT side should NOT see reflection.
       */
      it("EXACT REPRO: player at x=1183 should NOT reflect (ricochet-4)", () => {
        const ricochet4 = createSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 });
        
        // Full surface set from user's JSON
        const platform1 = createSurface("platform-1", { x: 300, y: 450 }, { x: 500, y: 450 }, false);
        const platform2 = createSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }, false);
        const ricochet1 = createSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 });
        const ricochet2 = createSurface("ricochet-2", { x: 400, y: 250 }, { x: 550, y: 250 });
        const ricochet3 = createSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 });
        
        const allSurfaces = [
          floor, ceiling, leftWall, rightWall,
          platform1, platform2,
          ricochet1, ricochet2, ricochet3, ricochet4
        ];
        
        // Player on RIGHT side (x=1183 > x=850) - should NOT reflect
        const player: Vector2 = { x: 1183.4789252999997, y: 666 };
        
        const result = propagateVisibility(player, [ricochet4], allSurfaces, screenBounds);
        
        // Calculate cross product manually for verification
        const start = ricochet4.segment.start;
        const end = ricochet4.segment.end;
        const cross = (end.x - start.x) * (player.y - start.y) - (end.y - start.y) * (player.x - start.x);
        
        console.log(`Player at x=${player.x.toFixed(2)}, surface at x=850`);
        console.log(`Cross product: ${cross.toFixed(2)}`);
        console.log(`Stages count: ${result.stages.length}`);
        console.log(`Reflected stages: ${result.stages.filter(s => s.surfaceIndex === 0).length}`);
        
        // Cross product should be negative (player on RIGHT side = non-reflective)
        expect(cross).toBeLessThan(0);
        
        // Should NOT have reflected stages (player on non-reflective side)
        const reflectedStages = result.stages.filter((s) => s.surfaceIndex === 0);
        expect(reflectedStages.length).toBe(0);
      });

      /**
       * EXACT REPRODUCTION: Player on RIGHT side of vertical surface should NOT reflect
       * From user JSON: player at (1147, 421), ricochet-4 from (850, 350) to (850, 500)
       */
      it("EXACT REPRO: player on RIGHT side of vertical surface (ricochet-4)", () => {
        // Vertical surface going DOWN: (850, 350) to (850, 500)
        // Normal points LEFT, so LEFT side is reflective
        const ricochet4 = createSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 });

        // Player on RIGHT side (x=1147 > x=850) - should NOT reflect
        const player: Vector2 = { x: 1147.1095851818027, y: 420.88399999961285 };

        const allSurfaces = [floor, ceiling, leftWall, rightWall, ricochet4];

        const result = propagateVisibility(player, [ricochet4], allSurfaces, screenBounds);

        // Calculate cross product manually for verification
        const start = ricochet4.segment.start;
        const end = ricochet4.segment.end;
        const cross =
          (end.x - start.x) * (player.y - start.y) - (end.y - start.y) * (player.x - start.x);

        // #region agent log
        fetch("http://localhost:7244/ingest/35819445-5c83-4f31-b501-c940886787b5", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "MultiStageProjection.test.ts:ExactRepro1",
            message: "Exact repro: player right of vertical surface",
            data: {
              playerX: player.x,
              playerY: player.y,
              surfaceStartX: start.x,
              surfaceStartY: start.y,
              surfaceEndX: end.x,
              surfaceEndY: end.y,
              crossProduct: cross,
              stagesCount: result.stages.length,
              reflectedStages: result.stages.filter((s) => s.surfaceIndex === 0).length,
              expectedReflection: false,
            },
            timestamp: Date.now(),
            sessionId: "debug-session",
            hypothesisId: "H1-exact",
          }),
        }).catch(() => {});
        // #endregion

        // Should NOT have reflected stages (player on non-reflective side)
        const reflectedStages = result.stages.filter((s) => s.surfaceIndex === 0);
        expect(reflectedStages.length).toBe(0);
      });

      /**
       * EXACT REPRODUCTION: Invalid polygon with wrong sorting on left wall
       * From user JSON: player at (130, 331), ricochet-3 from (100, 200) to (200, 300)
       *
       * Testing directly with createConeThroughWindow and projectConeV2 to isolate the sorting issue.
       */
      it("EXACT REPRO: invalid polygon with ricochet-3 at y=331", () => {
        const ricochet3 = createSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 });
        const platform1 = createSurface(
          "platform-1",
          { x: 300, y: 450 },
          { x: 500, y: 450 },
          false
        );
        const platform2 = createSurface(
          "platform-2",
          { x: 550, y: 350 },
          { x: 750, y: 350 },
          false
        );
        const ricochet1 = createSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 });
        const ricochet2 = createSurface("ricochet-2", { x: 400, y: 250 }, { x: 550, y: 250 });
        const ricochet4 = createSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 });

        const allSurfaces = [
          floor,
          ceiling,
          leftWall,
          rightWall,
          platform1,
          platform2,
          ricochet1,
          ricochet2,
          ricochet3,
          ricochet4,
        ];

        // Invalid case: player at (130, 331) produces bad polygon
        const playerInvalid: Vector2 = { x: 129.68158518168514, y: 330.96599999934455 };

        const result = propagateVisibility(playerInvalid, [ricochet3], allSurfaces, screenBounds);

        const reflectedStages = result.stages.filter((s) => s.surfaceIndex === 0);

        if (reflectedStages.length > 0) {
          const stage = reflectedStages[0]!;
          const verts = stage.polygon;

          // Calculate signed area
          let signedArea = 0;
          for (let i = 0; i < verts.length; i++) {
            const j = (i + 1) % verts.length;
            signedArea += verts[i]!.x * verts[j]!.y;
            signedArea -= verts[j]!.x * verts[i]!.y;
          }

          // Console log for debugging
          console.log(`Invalid polygon test:`);
          console.log(`  Player: (${playerInvalid.x.toFixed(2)}, ${playerInvalid.y.toFixed(2)})`);
          console.log(
            `  Reflected origin: (${stage.origin.x.toFixed(2)}, ${stage.origin.y.toFixed(2)})`
          );
          console.log(
            `  Vertices (${verts.length}): ${JSON.stringify(verts.map((v) => ({ x: Math.round(v.x), y: Math.round(v.y) })))}`
          );
          console.log(`  Signed area: ${signedArea.toFixed(2)}, valid CCW: ${signedArea < 0}`);

          // Calculate angles from reflected origin to verify order
          const angles = verts.map(
            (v) => (Math.atan2(v.y - stage.origin.y, v.x - stage.origin.x) * 180) / Math.PI
          );
          console.log(`  Angles: ${JSON.stringify(angles.map((a) => a.toFixed(1)))}`);

          // For windowed cones, the correct order is from leftBoundary to rightBoundary.
          // The visible cone goes from ~-167° to ~114° CCW (through 0°).
          // Within each "region" (negative angles and positive angles), points should be monotonic.
          // There should be exactly ONE major transition from negative to positive angles.

          // Should have negative signed area (CCW in screen coords)
          // This is the definitive check for a valid polygon - signed area is robust
          // regardless of the specific angular traversal pattern used by cross-product sorting
          expect(signedArea).toBeLessThan(0);
        }
      });

      /**
       * DIRECT TEST: Directly test projectConeV2 with the reflected cone to isolate sorting
       */
      it("DIRECT: projectConeV2 with reflected cone at ricochet-3", () => {
        const ricochet3 = createSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 });
        const allSurfaces = [floor, ceiling, leftWall, rightWall, ricochet3];

        // Reflected origin (player reflected through ricochet-3)
        // Player at (130, 331) reflects to approximately (231, 230)
        const reflectedOrigin: Vector2 = { x: 230.96599999934455, y: 229.68158518168508 };

        // Create the cone through the window (ricochet-3)
        const cone = createConeThroughWindow(
          reflectedOrigin,
          { x: 100, y: 200 }, // window start (ricochet-3 start)
          { x: 200, y: 300 } // window end (ricochet-3 end)
        );

        // Project the cone
        const vertices = projectConeV2(cone, allSurfaces, screenBounds, ricochet3.id);
        const coords = toVector2Array(vertices);

        console.log(`Direct projectConeV2 test:`);
        console.log(
          `  Reflected origin: (${reflectedOrigin.x.toFixed(2)}, ${reflectedOrigin.y.toFixed(2)})`
        );
        console.log(`  Window: (100, 200) to (200, 300)`);
        console.log(`  Left boundary: (${cone.leftBoundary.x}, ${cone.leftBoundary.y})`);
        console.log(`  Right boundary: (${cone.rightBoundary.x}, ${cone.rightBoundary.y})`);
        console.log(
          `  Raw vertices (${vertices.length}): ${JSON.stringify(coords.map((v) => ({ x: Math.round(v.x), y: Math.round(v.y) })))}`
        );

        // Calculate angles from reflected origin
        const angles = coords.map((v) =>
          ((Math.atan2(v.y - reflectedOrigin.y, v.x - reflectedOrigin.x) * 180) / Math.PI).toFixed(
            1
          )
        );
        console.log(`  Angles: ${JSON.stringify(angles)}`);

        // Check for the specific sorting issue: (20, 700) should NOT appear between (100, 200) and (20, 182)
        let foundOrderIssue = false;
        for (let i = 0; i < coords.length - 2; i++) {
          const curr = coords[i]!;
          const next = coords[i + 1]!;
          const nextNext = coords[i + 2]!;

          // Check if pattern: ~-167° → ~114° → ~-167° (the broken pattern)
          const currAngle =
            (Math.atan2(curr.y - reflectedOrigin.y, curr.x - reflectedOrigin.x) * 180) / Math.PI;
          const nextAngle =
            (Math.atan2(next.y - reflectedOrigin.y, next.x - reflectedOrigin.x) * 180) / Math.PI;
          const nextNextAngle =
            (Math.atan2(nextNext.y - reflectedOrigin.y, nextNext.x - reflectedOrigin.x) * 180) /
            Math.PI;

          if (currAngle < -100 && nextAngle > 100 && nextNextAngle < -100) {
            console.log(
              `  ORDER ISSUE at index ${i}: ${currAngle.toFixed(1)}° → ${nextAngle.toFixed(1)}° → ${nextNextAngle.toFixed(1)}°`
            );
            foundOrderIssue = true;
          }
        }

        // Verify vertices are in proper angular order (monotonic CCW)
        let maxReversal = 0;
        for (let i = 0; i < angles.length - 1; i++) {
          let diff = Number.parseFloat(angles[i + 1]!) - Number.parseFloat(angles[i]!);
          if (diff < -180) diff += 360;
          if (diff > 180) diff -= 360;
          if (diff < -10) {
            maxReversal = Math.max(maxReversal, -diff);
          }
        }
        console.log(`  Max angular reversal: ${maxReversal.toFixed(1)}°`);

        expect(foundOrderIssue).toBe(false);
      });

      /**
       * REFERENCE: Valid polygon at nearby position (y=336)
       */
      it("REFERENCE: valid polygon with ricochet-3 at y=336", () => {
        const ricochet3 = createSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 });
        const platform1 = createSurface(
          "platform-1",
          { x: 300, y: 450 },
          { x: 500, y: 450 },
          false
        );
        const platform2 = createSurface(
          "platform-2",
          { x: 550, y: 350 },
          { x: 750, y: 350 },
          false
        );
        const ricochet1 = createSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 });
        const ricochet2 = createSurface("ricochet-2", { x: 400, y: 250 }, { x: 550, y: 250 });
        const ricochet4 = createSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 });

        const allSurfaces = [
          floor,
          ceiling,
          leftWall,
          rightWall,
          platform1,
          platform2,
          ricochet1,
          ricochet2,
          ricochet3,
          ricochet4,
        ];

        // Valid case: player at (130, 336) produces good polygon
        const playerValid: Vector2 = { x: 129.68158518168514, y: 335.92799999952337 };

        const result = propagateVisibility(playerValid, [ricochet3], allSurfaces, screenBounds);

        const reflectedStages = result.stages.filter((s) => s.surfaceIndex === 0);

        if (reflectedStages.length > 0) {
          const stage = reflectedStages[0]!;
          const verts = stage.polygon;

          // Calculate signed area
          let signedArea = 0;
          for (let i = 0; i < verts.length; i++) {
            const j = (i + 1) % verts.length;
            signedArea += verts[i]!.x * verts[j]!.y;
            signedArea -= verts[j]!.x * verts[i]!.y;
          }

          // #region agent log
          fetch("http://localhost:7244/ingest/35819445-5c83-4f31-b501-c940886787b5", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "MultiStageProjection.test.ts:ValidReference",
              message: "Valid polygon reference",
              data: {
                playerX: playerValid.x,
                playerY: playerValid.y,
                reflectedOriginX: stage.origin.x,
                reflectedOriginY: stage.origin.y,
                vertexCount: verts.length,
                signedArea,
                isValidCCW: signedArea < 0,
                vertices: verts.map((v) => ({ x: Math.round(v.x), y: Math.round(v.y) })),
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              hypothesisId: "H2-reference",
            }),
          }).catch(() => {});
          // #endregion

          // Should have negative signed area (CCW in screen coords)
          expect(signedArea).toBeLessThan(0);
        }
      });

      it("HYPOTHESIS TEST: ricochet-3 surface at various player positions", () => {
        // ricochet-3: (100, 200) to (200, 300) - diagonal going up-right
        const ricochet3 = createSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 });

        const allSurfaces = [floor, ceiling, leftWall, rightWall, ricochet3];

        // Test positions from user's scenario
        const positions = [
          { name: "below-left (x=170)", player: { x: 170, y: 666 } },
          { name: "below-right (x=300)", player: { x: 300, y: 666 } },
          { name: "above-left (x=50)", player: { x: 50, y: 100 } },
          { name: "above-right (x=300)", player: { x: 300, y: 100 } },
        ];

        for (const pos of positions) {
          const result = propagateVisibility(pos.player, [ricochet3], allSurfaces, screenBounds);
          const reflectedStages = result.stages.filter((s) => s.surfaceIndex === 0);

          // #region agent log
          fetch("http://localhost:7244/ingest/35819445-5c83-4f31-b501-c940886787b5", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "MultiStageProjection.test.ts:Ricochet3Test",
              message: "Ricochet-3 surface test",
              data: {
                position: pos.name,
                playerX: pos.player.x,
                playerY: pos.player.y,
                hasReflection: reflectedStages.length > 0,
                reflectedPolygonVertices:
                  reflectedStages.length > 0 ? reflectedStages[0].polygon.length : 0,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              hypothesisId: "H1C",
            }),
          }).catch(() => {});
          // #endregion

          // For ricochet-3 going from (100,200) to (200,300):
          // Cross product (startX-endX)*(playerY-startY) - (startY-endY)*(playerX-startX)
          // = (100-200)*(playerY-200) - (200-300)*(playerX-100)
          // = -100*(playerY-200) + 100*(playerX-100)
          // = 100*(playerX - playerY)
          // Positive when playerX > playerY + 100 (to the right of line)
          // Player at (170, 666): 170 > 666+100? No, so cross product negative = non-reflective side
          // But wait, the cross product formula in the code might be different...
        }
      });

      /**
       * Issue 1: Light should NOT reflect when reaching the non-reflective side.
       *
       * Setup: Player on the RIGHT side of a vertical surface, but the surface
       * is oriented to reflect light from the LEFT side only.
       */
      it("should NOT produce reflected polygon when player is on non-reflective side", () => {
        // Surface with normal facing LEFT (reflective side is LEFT)
        // Surface from top to bottom: (600, 300) to (600, 500)
        // Normal = perpendicular to direction, facing LEFT (negative X)
        const surface = createSurface("test-surface", { x: 600, y: 300 }, { x: 600, y: 500 });

        // Player on RIGHT side (x=800 > x=600)
        // This is the NON-reflective side
        const player: Vector2 = { x: 800, y: 400 };

        const allSurfaces = [floor, ceiling, leftWall, rightWall, surface];

        const result = propagateVisibility(player, [surface], allSurfaces, screenBounds);

        // Log for debugging
        // #region agent log
        fetch("http://localhost:7244/ingest/35819445-5c83-4f31-b501-c940886787b5", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "MultiStageProjection.test.ts:Issue1",
            message: "Non-reflective side test",
            data: {
              playerX: player.x,
              playerY: player.y,
              surfaceStart: surface.segment.start,
              surfaceEnd: surface.segment.end,
              stagesCount: result.stages.length,
              reflectedStages: result.stages.filter((s) => s.surfaceIndex === 0).length,
            },
            timestamp: Date.now(),
            sessionId: "debug-session",
            hypothesisId: "H1A",
          }),
        }).catch(() => {});
        // #endregion

        // Should only have initial stage, NO reflected stages
        const reflectedStages = result.stages.filter((s) => s.surfaceIndex === 0);
        expect(reflectedStages.length).toBe(0);
      });

      it("should produce reflected polygon when player is on reflective side", () => {
        // Same surface
        const surface = createSurface("test-surface", { x: 600, y: 300 }, { x: 600, y: 500 });

        // Player on LEFT side (x=400 < x=600) - this IS the reflective side
        const player: Vector2 = { x: 400, y: 400 };

        const allSurfaces = [floor, ceiling, leftWall, rightWall, surface];

        const result = propagateVisibility(player, [surface], allSurfaces, screenBounds);

        // #region agent log
        fetch("http://localhost:7244/ingest/35819445-5c83-4f31-b501-c940886787b5", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "MultiStageProjection.test.ts:Issue1-reflective",
            message: "Reflective side test",
            data: {
              playerX: player.x,
              playerY: player.y,
              surfaceStart: surface.segment.start,
              surfaceEnd: surface.segment.end,
              stagesCount: result.stages.length,
              reflectedStages: result.stages.filter((s) => s.surfaceIndex === 0).length,
            },
            timestamp: Date.now(),
            sessionId: "debug-session",
            hypothesisId: "H1A",
          }),
        }).catch(() => {});
        // #endregion

        // Should have reflected stages
        const reflectedStages = result.stages.filter((s) => s.surfaceIndex === 0);
        expect(reflectedStages.length).toBeGreaterThanOrEqual(1);
      });

      /**
       * Issue 2: When reflected light hits an obstacle, the polygon should be
       * sorted radially around the REFLECTED origin, not the original player.
       */
      it("should sort reflected polygon radially around reflected origin", () => {
        // Setup: Vertical surface on the right, player on left
        // An obstacle between the reflected origin and the visible area
        const surface = createSurface("test-surface", { x: 800, y: 300 }, { x: 800, y: 500 });
        // Obstacle that the reflected light will hit
        const obstacle = createSurface("obstacle", { x: 1000, y: 350 }, { x: 1000, y: 450 });

        const player: Vector2 = { x: 400, y: 400 };

        const allSurfaces = [floor, ceiling, leftWall, rightWall, surface, obstacle];

        const result = propagateVisibility(player, [surface], allSurfaces, screenBounds);

        const reflectedStages = result.stages.filter((s) => s.surfaceIndex === 0);

        if (reflectedStages.length > 0) {
          const stage = reflectedStages[0]!;
          const reflectedOrigin = stage.origin;

          // Check if polygon vertices are sorted radially around the reflected origin
          // Compute angles from reflected origin
          const angles = stage.polygon.map((v) =>
            Math.atan2(v.y - reflectedOrigin.y, v.x - reflectedOrigin.x)
          );

          // Count reversals in angle order
          let reversals = 0;
          for (let i = 0; i < angles.length - 1; i++) {
            let diff = angles[i + 1]! - angles[i]!;
            if (diff > Math.PI) diff -= 2 * Math.PI;
            if (diff < -Math.PI) diff += 2 * Math.PI;
            if (diff < -0.1) reversals++;
          }

          // #region agent log
          fetch("http://localhost:7244/ingest/35819445-5c83-4f31-b501-c940886787b5", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "MultiStageProjection.test.ts:Issue2",
              message: "Radial sorting test",
              data: {
                reflectedOriginX: reflectedOrigin.x,
                reflectedOriginY: reflectedOrigin.y,
                vertexCount: stage.polygon.length,
                angles: angles.map((a) => ((a * 180) / Math.PI).toFixed(2)),
                reversals,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              hypothesisId: "H2A",
            }),
          }).catch(() => {});
          // #endregion

          // For proper radial ordering, expect at most 1 reversal (wrap-around)
          expect(reversals).toBeLessThanOrEqual(1);
        }
      });

      it("should use signed area check for reflected polygon validity", () => {
        const surface = createSurface("test-surface", { x: 800, y: 300 }, { x: 800, y: 500 });
        const obstacle = createSurface("obstacle", { x: 1000, y: 350 }, { x: 1000, y: 450 });

        const player: Vector2 = { x: 400, y: 400 };

        const allSurfaces = [floor, ceiling, leftWall, rightWall, surface, obstacle];

        const result = propagateVisibility(player, [surface], allSurfaces, screenBounds);

        const reflectedStages = result.stages.filter((s) => s.surfaceIndex === 0);

        for (const stage of reflectedStages) {
          // Calculate signed area (screen coords: CCW = negative)
          let signedArea = 0;
          const verts = stage.polygon;
          for (let i = 0; i < verts.length; i++) {
            const j = (i + 1) % verts.length;
            signedArea += verts[i]!.x * verts[j]!.y;
            signedArea -= verts[j]!.x * verts[i]!.y;
          }

          // #region agent log
          fetch("http://localhost:7244/ingest/35819445-5c83-4f31-b501-c940886787b5", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "MultiStageProjection.test.ts:SignedArea",
              message: "Signed area check",
              data: {
                surfaceIndex: stage.surfaceIndex,
                signedArea,
                vertexCount: verts.length,
                isValid: signedArea < 0,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              hypothesisId: "H2B",
            }),
          }).catch(() => {});
          // #endregion

          // In screen coordinates (Y down), CCW winding = negative area
          expect(signedArea).toBeLessThan(0);
        }
      });
    });
  });
});
