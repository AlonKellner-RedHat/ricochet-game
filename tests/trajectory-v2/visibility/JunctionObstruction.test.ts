/**
 * Test for junction ray obstruction issue.
 *
 * Issue: Junction rays bypass obstructions - when a ray is cast to a junction point,
 * it should be blocked if there's an obstacle between the origin and the junction.
 */

import { describe, it, expect } from "vitest";
import {
  createFullCone,
  projectConeV2,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { SurfaceChain, createRicochetChain, createWallChain } from "@/trajectory-v2/geometry/SurfaceChain";

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
  };
}

const SCREEN_BOUNDS = {
  minX: 0,
  maxX: 1280,
  minY: 0,
  maxY: 720,
};

// =============================================================================
// JUNCTION OBSTRUCTION TESTS
// =============================================================================

describe("Junction Point Obstruction", () => {
  /**
   * Test case: A V-shape junction with an obstacle blocking the junction from the player.
   * 
   * Setup:
   * - Player at bottom center
   * - V-shape with apex at center (junction point)
   * - Wall between player and apex
   * 
   * Expected: The junction point should NOT be in the polygon because it's blocked.
   */
  it("should NOT include obstructed junction in polygon", () => {
    const player = { x: 640, y: 600 };

    // V-shape chain with apex (junction) at (640, 300)
    const vShape = new SurfaceChain({
      vertices: [
        { x: 540, y: 400 }, // left bottom
        { x: 640, y: 300 }, // apex (junction)
        { x: 740, y: 400 }, // right bottom
      ],
      isClosed: false,
      surfaceFactory: (index, start, end) => createTestSurface(`v-${index}`, start, end),
    });

    // Wall blocking the apex from the player
    const blockingWall = createWallChain("blocking", [{ x: 500, y: 450 }, { x: 780, y: 450 }]);

    const chains = [vShape, blockingWall];
    const cone = createFullCone(player);
    const polygon = projectConeV2(cone, chainsWithScreen);
    const vertices = toVector2Array(polygon);

    // The apex junction (640, 300) should NOT be in the polygon
    // because the blocking wall at y=450 is between player (y=600) and apex (y=300)
    const hasApex = vertices.some(
      (v) => Math.abs(v.x - 640) < 1 && Math.abs(v.y - 300) < 1
    );

    expect(hasApex).toBe(false);
  });

  /**
   * Test case: V-shape junction visible (not blocked)
   * 
   * Setup:
   * - Player at position where apex is visible (no blocking wall)
   * 
   * Expected: The junction point SHOULD be in the polygon.
   */
  it("should include visible junction in polygon", () => {
    const player = { x: 640, y: 600 };

    // V-shape chain with apex (junction) at (640, 300)
    const vShape = new SurfaceChain({
      vertices: [
        { x: 540, y: 400 }, // left bottom
        { x: 640, y: 300 }, // apex (junction)
        { x: 740, y: 400 }, // right bottom
      ],
      isClosed: false,
      surfaceFactory: (index, start, end) => createTestSurface(`v-${index}`, start, end),
    });

    // No blocking wall - apex should be visible
    const chains = [vShape];
    const cone = createFullCone(player);
    const polygon = projectConeV2(cone, chainsWithScreen);
    const vertices = toVector2Array(polygon);

    // The apex junction (640, 300) SHOULD be in the polygon (it's visible)
    const hasApex = vertices.some(
      (v) => Math.abs(v.x - 640) < 1 && Math.abs(v.y - 300) < 1
    );

    expect(hasApex).toBe(true);
  });

  /**
   * Test case: Junction blocked by another surface chain
   */
  it("should respect obstruction by other surface chains", () => {
    const player = { x: 100, y: 360 }; // Left side of screen

    // V-shape on the right side
    const vShape = new SurfaceChain({
      vertices: [
        { x: 800, y: 200 },
        { x: 900, y: 300 }, // junction
        { x: 800, y: 400 },
      ],
      isClosed: false,
      surfaceFactory: (index, start, end) => createTestSurface(`v-${index}`, start, end),
    });

    // Vertical wall blocking the junction
    const blockingWall = createWallChain("blocking", [{ x: 500, y: 100 }, { x: 500, y: 600 }]);

    const chains = [vShape, blockingWall];
    const cone = createFullCone(player);
    const polygon = projectConeV2(cone, chainsWithScreen);
    const vertices = toVector2Array(polygon);

    // The junction (900, 300) should NOT be visible from player (100, 360)
    // because the wall at x=500 blocks it
    const hasJunction = vertices.some(
      (v) => Math.abs(v.x - 900) < 1 && Math.abs(v.y - 300) < 1
    );

    expect(hasJunction).toBe(false);
  });
});

