/**
 * Test for corner leakage issue in visibility polygon.
 *
 * The issue: When casting continuation rays past corners where walls meet,
 * the rays can escape outside the actual game bounds and hit screen boundaries
 * at positions outside the playable area.
 *
 * Example: At corner (20, 80) where left-wall meets ceiling, a continuation ray
 * might hit a screen boundary at (0, 1.87) which is outside the game area.
 */

import { describe, it, expect } from "vitest";
import { createFullCone, projectConeV2, toVector2Array } from "@/trajectory-v2/visibility/ConeProjectionV2";
import type { Surface } from "@/surfaces/Surface";
import { toChains } from "./testHelpers";

// Helper to create a mock surface
function createMockSurface(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
  canReflect = true
): Surface {
  return {
    id,
    segment: { start, end },
    surfaceType: canReflect ? "ricochet" : "wall",
    onArrowHit: () => ({ type: "reflect", velocity: { x: 0, y: 0 } }),
    isPlannable: () => canReflect,
    getVisualProperties: () => ({
      color: 0x00ffff,
      lineWidth: 2,
      alpha: 1,
      glow: false,
    }),
    getNormal: () => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      return { x: -dy / len, y: dx / len };
    },
    canReflectFrom: () => true,
  };
}

describe("Corner Leakage", () => {
  it("should not produce vertices outside game bounds", () => {
    // Setup from user's bug report
    const player = { x: 170, y: 666 };
    const bounds = { minX: 0, minY: 0, maxX: 1280, maxY: 720 };
    
    // Create surfaces matching the user's setup
    const surfaces = [
      createMockSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }, false),
      createMockSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }, false),
      createMockSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }, false),
      createMockSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }, false),
      createMockSurface("platform-1", { x: 300, y: 450 }, { x: 500, y: 450 }, false),
      createMockSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }, false),
      createMockSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 }, true),
      createMockSurface("ricochet-2", { x: 400, y: 250 }, { x: 550, y: 250 }, true),
      createMockSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 }, true),
      createMockSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }, true),
    ];

    // Create full cone from player
    const cone = createFullCone(player);
    
    // Project the cone
    const polygon = projectConeV2(cone, toChains(surfaces), bounds);
    const vertices = toVector2Array(polygon);

    // Debug: Log all vertices
    console.log("Polygon vertices:");
    for (const v of vertices) {
      console.log(`  (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
    }

    // Check for leaking vertices outside game bounds
    // The ACTUAL game area is bounded by walls at x=20, x=1260, y=80, y=700
    // But screen boundaries extend to 0, 1280, 0, 720
    
    // Find any vertices that are outside the game area but inside screen bounds
    const leakingVertices = vertices.filter(v => {
      // Check if outside game walls but inside screen
      const outsideLeftWall = v.x < 20 && v.x >= 0;
      const outsideRightWall = v.x > 1260 && v.x <= 1280;
      const outsideCeiling = v.y < 80 && v.y >= 0;
      const outsideFloor = v.y > 700 && v.y <= 720;
      
      return outsideLeftWall || outsideRightWall || outsideCeiling || outsideFloor;
    });

    console.log("\nLeaking vertices (outside game bounds):");
    for (const v of leakingVertices) {
      console.log(`  (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
    }

    // The problematic vertex from the bug report: (0, 1.87)
    const problematicVertex = vertices.find(v => 
      v.x < 1 && v.y < 10 // Near (0, 0) corner which is outside game area
    );
    
    if (problematicVertex) {
      console.log("\nProblematic vertex found:", problematicVertex);
    }

    // We expect NO vertices outside the game bounds
    expect(leakingVertices.length).toBe(0);
  });

  it("should handle corner where left-wall meets ceiling correctly", () => {
    // Minimal reproduction: just the corner at (20, 80)
    const player = { x: 170, y: 666 };
    const bounds = { minX: 0, minY: 0, maxX: 400, maxY: 720 };
    
    // Only the surfaces that form the corner
    const surfaces = [
      createMockSurface("ceiling", { x: 0, y: 80 }, { x: 400, y: 80 }, false),
      createMockSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }, false),
      createMockSurface("floor", { x: 0, y: 700 }, { x: 400, y: 700 }, false),
    ];

    const cone = createFullCone(player);
    const polygon = projectConeV2(cone, toChains(surfaces), bounds);
    const vertices = toVector2Array(polygon);

    console.log("\nMinimal corner test vertices:");
    for (const v of vertices) {
      console.log(`  (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
    }

    // Check for the specific problematic pattern: 
    // A vertex near (0, ~2) which is the continuation ray going past (20, 80)
    const cornerLeakVertex = vertices.find(v => 
      v.x < 20 && v.y < 80 // Outside both left-wall and ceiling
    );

    if (cornerLeakVertex) {
      console.log("\nCorner leak vertex:", cornerLeakVertex);
    }

    // The polygon should NOT have vertices in the corner region (0-20, 0-80)
    // That region is "behind" the walls
    expect(cornerLeakVertex).toBeUndefined();
  });
});

