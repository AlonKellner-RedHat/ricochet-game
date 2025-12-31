/**
 * Test for pixel-perfect sorting bug with pyramid surfaces.
 * 
 * The issue: At player.x = 1090.885, the left endpoint (1030, 500) of pyramid-1
 * is missing from the polygon. At player.x = 1090.797, it's present.
 */
import { describe, it, expect } from "vitest";
import {
  createFullCone,
  projectConeV2,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { createRicochetChain } from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

const SCREEN = { minX: 0, maxX: 1280, minY: 0, maxY: 720 };

describe("Pyramid Sorting Bug - Missing Endpoint", () => {
  // Pyramid surfaces (stacked horizontal surfaces, shortest at bottom)
  const pyramid1 = createRicochetChain("pyramid-1", [
    { x: 1030, y: 500 },
    { x: 1070, y: 500 },
  ]);
  const pyramid2 = createRicochetChain("pyramid-2", [
    { x: 1015, y: 460 },
    { x: 1085, y: 460 },
  ]);
  const pyramid3 = createRicochetChain("pyramid-3", [
    { x: 1000, y: 420 },
    { x: 1100, y: 420 },
  ]);
  const pyramid4 = createRicochetChain("pyramid-4", [
    { x: 985, y: 380 },
    { x: 1115, y: 380 },
  ]);
  
  // Grid row 3 surfaces (closest to pyramid)
  const grid30 = createRicochetChain("grid-3-0", [
    { x: 889.3933982822018, y: 339.3933982822018 },
    { x: 910.6066017177982, y: 360.6066017177982 },
  ]);
  const grid31 = createRicochetChain("grid-3-1", [
    { x: 939.3933982822018, y: 339.3933982822018 },
    { x: 960.6066017177982, y: 360.6066017177982 },
  ]);
  const grid32 = createRicochetChain("grid-3-2", [
    { x: 1000, y: 365 },
    { x: 1000, y: 335 },
  ]);
  const grid33 = createRicochetChain("grid-3-3", [
    { x: 1050, y: 365 },
    { x: 1050, y: 335 },
  ]);
  
  // V-shape chains
  const chain1 = createRicochetChain("chain1", [
    { x: 598.0384757729337, y: 280 },
    { x: 650, y: 250 },
    { x: 701.9615242270663, y: 280 },
  ]);
  const chain2 = createRicochetChain("chain2", [
    { x: 707.5735931288071, y: 292.42640687119285 },
    { x: 750, y: 250 },
    { x: 792.4264068711929, y: 292.42640687119285 },
  ]);
  const chain3 = createRicochetChain("chain3", [
    { x: 820, y: 301.9615242270663 },
    { x: 850, y: 250 },
    { x: 880, y: 301.9615242270663 },
  ]);
  
  // More grid surfaces
  const grid20 = createRicochetChain("grid-2-0", [
    { x: 915, y: 300 },
    { x: 885, y: 300 },
  ]);
  const grid10 = createRicochetChain("grid-1-0", [
    { x: 900, y: 235 },
    { x: 900, y: 265 },
  ]);
  
  // Mirrors
  const mirrorLeft = createRicochetChain("mirror-left", [
    { x: 250, y: 550 },
    { x: 250, y: 150 },
  ]);
  const mirrorRight = createRicochetChain("mirror-right", [
    { x: 550, y: 150 },
    { x: 550, y: 550 },
  ]);
  
  const pyramidOnly = [pyramid1, pyramid2, pyramid3, pyramid4];
  const allChains = [
    ...pyramidOnly, 
    grid30, grid31, grid32, grid33,
    grid20, grid10,
    chain1, chain2, chain3,
    mirrorLeft, mirrorRight,
  ];

  it("should include (1030, 500) at BUGGY player position", () => {
    // Buggy player position
    const player = { x: 1090.8850699188959, y: 666 };
    const cone = createFullCone(player);
    const points = projectConeV2(cone, allChains, SCREEN);
    const vertices = toVector2Array(points);
    
    console.log("BUGGY player position:", player);
    console.log("Polygon vertices around pyramid-1:");
    vertices.forEach((v, i) => {
      if (v.y >= 380 && v.y <= 510) {
        console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
      }
    });
    
    // Find the left endpoint of pyramid-1 at (1030, 500)
    const pyramid1LeftIdx = vertices.findIndex(v => 
      Math.abs(v.x - 1030) < 1 && Math.abs(v.y - 500) < 1
    );
    
    console.log(`Pyramid-1 left endpoint (1030, 500) at index: ${pyramid1LeftIdx}`);
    
    // This endpoint MUST exist in the polygon
    expect(pyramid1LeftIdx).toBeGreaterThanOrEqual(0);
  });

  it("should include (1030, 500) at CORRECT player position", () => {
    // Correct player position
    const player = { x: 1090.7970816001189, y: 666 };
    const cone = createFullCone(player);
    const points = projectConeV2(cone, allChains, SCREEN);
    const vertices = toVector2Array(points);
    
    console.log("CORRECT player position:", player);
    console.log("Polygon vertices around pyramid-1:");
    vertices.forEach((v, i) => {
      if (v.y >= 380 && v.y <= 510) {
        console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
      }
    });
    
    // Find the left endpoint of pyramid-1 at (1030, 500)
    const pyramid1LeftIdx = vertices.findIndex(v => 
      Math.abs(v.x - 1030) < 1 && Math.abs(v.y - 500) < 1
    );
    
    console.log(`Pyramid-1 left endpoint (1030, 500) at index: ${pyramid1LeftIdx}`);
    
    // This endpoint should exist
    expect(pyramid1LeftIdx).toBeGreaterThanOrEqual(0);
  });

  it("should produce identical pyramid region for both positions", () => {
    const buggyPlayer = { x: 1090.8850699188959, y: 666 };
    const correctPlayer = { x: 1090.7970816001189, y: 666 };
    
    const buggyVertices = toVector2Array(projectConeV2(createFullCone(buggyPlayer), allChains, SCREEN));
    const correctVertices = toVector2Array(projectConeV2(createFullCone(correctPlayer), allChains, SCREEN));
    
    // Extract vertices in pyramid region (y between 380 and 500)
    const buggyPyramid = buggyVertices.filter(v => v.y >= 380 && v.y <= 510);
    const correctPyramid = correctVertices.filter(v => v.y >= 380 && v.y <= 510);
    
    console.log("Buggy pyramid vertices:", buggyPyramid.map(v => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)})`));
    console.log("Correct pyramid vertices:", correctPyramid.map(v => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)})`));
    
    // Both should have the same number of vertices in the pyramid region
    // (small differences in hit points are OK, but structural vertices should match)
    const buggyEndpoints = buggyPyramid.filter(v => 
      [985, 1000, 1015, 1030, 1070, 1085, 1100, 1115].some(x => Math.abs(v.x - x) < 1)
    );
    const correctEndpoints = correctPyramid.filter(v => 
      [985, 1000, 1015, 1030, 1070, 1085, 1100, 1115].some(x => Math.abs(v.x - x) < 1)
    );
    
    console.log("Buggy endpoints:", buggyEndpoints.map(v => `(${v.x.toFixed(0)}, ${v.y.toFixed(0)})`));
    console.log("Correct endpoints:", correctEndpoints.map(v => `(${v.x.toFixed(0)}, ${v.y.toFixed(0)})`));
    
    // Should have same endpoints
    expect(buggyEndpoints.length).toBe(correctEndpoints.length);
  });
});
