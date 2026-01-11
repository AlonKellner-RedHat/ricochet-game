/**
 * Pixel-Perfect Sorting Instability Bug Investigation
 *
 * Bug Report:
 * - A ~0.05 pixel change in player X position (224.44 → 224.39) causes
 *   the ceiling hit at (505, 80) to jump from position 2 to position 6
 *   in the sorted polygon.
 *
 * Bug Case:
 * - Player: (224.44358862462, 659.208380273741)
 * - Origin (reflected): (875.55641137538, 659.2083802737408)
 * - Ceiling hit at (505, 80) appears at position 2 (WRONG)
 *
 * Expected Case:
 * - Player: (224.39347862462, 659.208380273741)
 * - Origin (reflected): (875.60652137538, 659.2083802737408)
 * - Ceiling hit at (505, 80) appears at position 6 (CORRECT)
 *
 * This is a CCW sorting instability caused by floating-point precision issues.
 */

import { RicochetSurface } from "@/surfaces/RicochetSurface";
import { WallSurface } from "@/surfaces/WallSurface";
import {
  type SurfaceChain,
  createMixedChain,
  createSingleSurfaceChain,
} from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  createConeThroughWindow,
  projectConeV2,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import { describe, expect, it } from "vitest";

// =============================================================================
// BUG SCENARIO DATA
// =============================================================================

const BUG_PLAYER = { x: 224.44358862462, y: 659.208380273741 };
const EXPECTED_PLAYER = { x: 224.39347862462, y: 659.208380273741 };

const MIRROR_RIGHT = {
  id: "mirror-right-0",
  start: { x: 550, y: 150 },
  end: { x: 550, y: 550 },
};

const SCREEN_BOUNDS = {
  minX: 0,
  minY: 0,
  maxX: 1280,
  maxY: 720,
};

/**
 * Create SurfaceChains from the bug report.
 * Room boundaries are a single closed chain with JunctionPoints at corners.
 */
function createChains(): SurfaceChain[] {
  const chains: SurfaceChain[] = [];

  // Room boundary: single closed chain with mixed reflectivity
  // Vertices in CCW order: top-left → top-right → bottom-right → bottom-left
  // Surfaces: 0=ceiling (reflective), 1=right-wall (non-reflective),
  //           2=floor (non-reflective), 3=left-wall (reflective)
  chains.push(
    createMixedChain(
      "room",
      [
        { x: 20, y: 80 },     // top-left
        { x: 1260, y: 80 },   // top-right
        { x: 1260, y: 700 },  // bottom-right
        { x: 20, y: 700 },    // bottom-left
      ],
      [true, false, false, true], // ceiling, right, floor, left
      true // closed chain
    )
  );

  // Additional surfaces
  chains.push(
    createSingleSurfaceChain(new WallSurface("platform-0", { start: { x: 50, y: 620 }, end: { x: 200, y: 620 } }))
  );
  chains.push(
    createSingleSurfaceChain(new RicochetSurface("mirror-left-0", { start: { x: 250, y: 550 }, end: { x: 250, y: 150 } }))
  );
  chains.push(
    createSingleSurfaceChain(new RicochetSurface("mirror-right-0", { start: { x: 550, y: 150 }, end: { x: 550, y: 550 } }))
  );

  return chains;
}

/**
 * Get the mirror-right surface for reflection.
 */
function getMirrorRightSurface() {
  return new RicochetSurface(MIRROR_RIGHT.id, {
    start: MIRROR_RIGHT.start,
    end: MIRROR_RIGHT.end,
  });
}

/**
 * Calculate the reflected origin through mirror-right.
 */
function calculateReflectedOrigin(player: Vector2): Vector2 {
  const mirror = getMirrorRightSurface();
  return reflectPointThroughLine(
    player,
    mirror.segment.start,
    mirror.segment.end
  );
}

/**
 * Find the index of a vertex at approximately (x, y).
 */
function findVertexIndex(vertices: Vector2[], targetX: number, targetY: number, tolerance = 10): number {
  return vertices.findIndex(
    (v) => Math.abs(v.x - targetX) < tolerance && Math.abs(v.y - targetY) < tolerance
  );
}

/**
 * Compute cross product for sorting: (a - origin) × (b - origin)
 */
function crossProduct(origin: Vector2, a: Vector2, b: Vector2): number {
  const ax = a.x - origin.x;
  const ay = a.y - origin.y;
  const bx = b.x - origin.x;
  const by = b.y - origin.y;
  return ax * by - ay * bx;
}

describe("Pixel-Perfect Sorting Instability Bug", () => {
  describe("Bug Reproduction", () => {
    it("should reproduce the bug case with player at x=224.44", () => {
      const player = BUG_PLAYER;
      const chains = createChains();
      const origin = calculateReflectedOrigin(player);
      
      console.log("\n=== BUG CASE ===");
      console.log(`Player: (${player.x}, ${player.y})`);
      console.log(`Origin (reflected): (${origin.x}, ${origin.y})`);
      
      // Create windowed cone through mirror-right
      const mirror = getMirrorRightSurface();
      const cone = createConeThroughWindow(
        origin,
        mirror.segment.start,
        mirror.segment.end
      );
      
      const sourcePoints = projectConeV2(cone, chainsWithScreen, mirror.id);
      const vertices = toVector2Array(sourcePoints);
      
      console.log(`\nPolygon vertices (${vertices.length}):`);
      vertices.forEach((v, i) => {
        console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
      });
      
      // Find key vertices
      const mirrorRightEndIdx = findVertexIndex(vertices, 550, 550);
      const ceilingHit505Idx = findVertexIndex(vertices, 505, 80);
      const mirrorLeftIdx = findVertexIndex(vertices, 250, 449, 50);
      
      console.log(`\nKey vertex indices:`);
      console.log(`  Mirror-right end (550, 550): ${mirrorRightEndIdx}`);
      console.log(`  Ceiling hit (505, 80): ${ceilingHit505Idx}`);
      console.log(`  Mirror-left hit (250, 449): ${mirrorLeftIdx}`);
      
      // The bug is: ceiling hit at (505, 80) appears before mirror-left vertices
      // Check if this is the case
      const isBuggy = ceilingHit505Idx !== -1 && mirrorLeftIdx !== -1 && ceilingHit505Idx < mirrorLeftIdx;
      console.log(`\nBug present (ceiling before mirror-left): ${isBuggy}`);
      
      expect(ceilingHit505Idx).not.toBe(-1);
    });

    it("should produce correct sorting with player at x=224.39", () => {
      const player = EXPECTED_PLAYER;
      const chains = createChains();
      const origin = calculateReflectedOrigin(player);
      
      console.log("\n=== EXPECTED CASE ===");
      console.log(`Player: (${player.x}, ${player.y})`);
      console.log(`Origin (reflected): (${origin.x}, ${origin.y})`);
      
      // Create windowed cone through mirror-right
      const mirror = getMirrorRightSurface();
      const cone = createConeThroughWindow(
        origin,
        mirror.segment.start,
        mirror.segment.end
      );
      
      const sourcePoints = projectConeV2(cone, chainsWithScreen, mirror.id);
      const vertices = toVector2Array(sourcePoints);
      
      console.log(`\nPolygon vertices (${vertices.length}):`);
      vertices.forEach((v, i) => {
        console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
      });
      
      // Find key vertices
      const mirrorRightEndIdx = findVertexIndex(vertices, 550, 550);
      const ceilingHit505Idx = findVertexIndex(vertices, 505, 80);
      const mirrorLeftIdx = findVertexIndex(vertices, 250, 449, 50);
      
      console.log(`\nKey vertex indices:`);
      console.log(`  Mirror-right end (550, 550): ${mirrorRightEndIdx}`);
      console.log(`  Ceiling hit (505, 80): ${ceilingHit505Idx}`);
      console.log(`  Mirror-left hit (250, 449): ${mirrorLeftIdx}`);
      
      // In the expected case, ceiling hit should come AFTER mirror-left
      const isCorrect = ceilingHit505Idx !== -1 && mirrorLeftIdx !== -1 && ceilingHit505Idx > mirrorLeftIdx;
      console.log(`\nCorrect order (ceiling after mirror-left): ${isCorrect}`);
      
      expect(ceilingHit505Idx).not.toBe(-1);
    });
  });

  describe("Cross Product Analysis", () => {
    it("should analyze cross products between mis-sorted vertices", () => {
      // Test both origins
      const bugOrigin = calculateReflectedOrigin(BUG_PLAYER);
      const expectedOrigin = calculateReflectedOrigin(EXPECTED_PLAYER);
      
      // Key vertices from the bug report
      const ceilingHit505 = { x: 505.24632021172613, y: 80 };
      const mirrorLeft449 = { x: 250, y: 449.3645557655883 };
      const mirrorLeft188 = { x: 250, y: 188.22555911566405 };
      const mirrorLeft150 = { x: 250, y: 150 };
      const ceilingHit164 = { x: 164.00583632827, y: 80 };
      const mirrorRightEnd = { x: 550, y: 550 };
      const mirrorRightStart = { x: 550, y: 150 };
      
      console.log("\n=== CROSS PRODUCT ANALYSIS ===");
      console.log("\nBug Origin:", bugOrigin);
      console.log("Expected Origin:", expectedOrigin);
      console.log("Origin X difference:", expectedOrigin.x - bugOrigin.x);
      
      // Analyze cross products for key comparisons
      const comparisons = [
        { a: ceilingHit505, b: mirrorLeft449, name: "ceiling(505) vs mirror-left(449)" },
        { a: ceilingHit505, b: mirrorLeft188, name: "ceiling(505) vs mirror-left(188)" },
        { a: ceilingHit505, b: mirrorLeft150, name: "ceiling(505) vs mirror-left(150)" },
        { a: ceilingHit505, b: ceilingHit164, name: "ceiling(505) vs ceiling(164)" },
        { a: ceilingHit505, b: mirrorRightEnd, name: "ceiling(505) vs mirror-right-end(550)" },
      ];
      
      console.log("\nCross products (positive = a is CCW from b):");
      console.log("| Comparison | Bug Origin | Expected Origin | Sign Change? |");
      console.log("|------------|------------|-----------------|--------------|");
      
      for (const { a, b, name } of comparisons) {
        const cpBug = crossProduct(bugOrigin, a, b);
        const cpExpected = crossProduct(expectedOrigin, a, b);
        const signChange = (cpBug > 0) !== (cpExpected > 0);
        
        console.log(`| ${name.padEnd(40)} | ${cpBug.toFixed(2).padStart(10)} | ${cpExpected.toFixed(2).padStart(15)} | ${signChange ? "YES <<<" : "no"} |`);
        
        if (signChange) {
          console.log(`\n  >>> SIGN CHANGE DETECTED: ${name}`);
          console.log(`      Bug: ${cpBug > 0 ? "a CCW from b" : "a CW from b"}`);
          console.log(`      Expected: ${cpExpected > 0 ? "a CCW from b" : "a CW from b"}`);
        }
      }
    });

    it("should find the near-zero cross product causing instability", () => {
      const bugOrigin = calculateReflectedOrigin(BUG_PLAYER);
      const expectedOrigin = calculateReflectedOrigin(EXPECTED_PLAYER);
      
      // All vertices from bug report
      const vertices = [
        { pos: { x: 550, y: 550 }, name: "mirror-right-end" },
        { pos: { x: 505.24632021172613, y: 80 }, name: "ceiling-hit-505" },
        { pos: { x: 250, y: 449.3645557655883 }, name: "mirror-left-449" },
        { pos: { x: 250, y: 188.22555911566405 }, name: "mirror-left-188" },
        { pos: { x: 250, y: 150 }, name: "mirror-left-150" },
        { pos: { x: 164.00583632827, y: 80 }, name: "ceiling-hit-164" },
        { pos: { x: 550, y: 150 }, name: "mirror-right-start" },
      ];
      
      console.log("\n=== NEAR-ZERO CROSS PRODUCT SEARCH ===");
      console.log("\nLooking for cross products that change sign between origins...");
      
      const signChanges: { a: string; b: string; cpBug: number; cpExpected: number }[] = [];
      
      for (let i = 0; i < vertices.length; i++) {
        for (let j = i + 1; j < vertices.length; j++) {
          const a = vertices[i]!;
          const b = vertices[j]!;
          
          const cpBug = crossProduct(bugOrigin, a.pos, b.pos);
          const cpExpected = crossProduct(expectedOrigin, a.pos, b.pos);
          
          if ((cpBug > 0) !== (cpExpected > 0)) {
            signChanges.push({
              a: a.name,
              b: b.name,
              cpBug,
              cpExpected,
            });
          }
        }
      }
      
      if (signChanges.length === 0) {
        console.log("\nNo sign changes detected between these vertex pairs.");
        console.log("The instability may be caused by a vertex NOT in the outline.");
      } else {
        console.log(`\nFound ${signChanges.length} sign changes:`);
        for (const change of signChanges) {
          console.log(`\n  ${change.a} vs ${change.b}:`);
          console.log(`    Bug origin cross: ${change.cpBug.toFixed(6)}`);
          console.log(`    Expected cross: ${change.cpExpected.toFixed(6)}`);
        }
      }
      
      // Log the magnitudes to find near-zero values
      console.log("\n=== ALL CROSS PRODUCT MAGNITUDES (Bug Origin) ===");
      const allCrossProducts: { a: string; b: string; cp: number }[] = [];
      
      for (let i = 0; i < vertices.length; i++) {
        for (let j = i + 1; j < vertices.length; j++) {
          const a = vertices[i]!;
          const b = vertices[j]!;
          const cp = crossProduct(bugOrigin, a.pos, b.pos);
          allCrossProducts.push({ a: a.name, b: b.name, cp });
        }
      }
      
      // Sort by absolute value to find near-zero
      allCrossProducts.sort((x, y) => Math.abs(x.cp) - Math.abs(y.cp));
      
      console.log("\nSmallest cross products:");
      for (let i = 0; i < Math.min(5, allCrossProducts.length); i++) {
        const item = allCrossProducts[i]!;
        console.log(`  ${item.a} vs ${item.b}: ${item.cp.toFixed(2)}`);
      }
    });
  });

  describe("Reference Direction Analysis", () => {
    it("should analyze how reference direction affects sorting", () => {
      const bugOrigin = calculateReflectedOrigin(BUG_PLAYER);
      const expectedOrigin = calculateReflectedOrigin(EXPECTED_PLAYER);
      
      // The window is mirror-right: (550, 150) to (550, 550)
      // The cone goes from origin THROUGH this window
      // Reference direction is typically from origin toward window center
      const windowCenter = { x: 550, y: 350 };
      
      const bugRefDir = {
        x: windowCenter.x - bugOrigin.x,
        y: windowCenter.y - bugOrigin.y,
      };
      const expectedRefDir = {
        x: windowCenter.x - expectedOrigin.x,
        y: windowCenter.y - expectedOrigin.y,
      };
      
      console.log("\n=== REFERENCE DIRECTION ANALYSIS ===");
      console.log("\nBug origin:", bugOrigin);
      console.log("Bug ref direction:", bugRefDir);
      console.log("\nExpected origin:", expectedOrigin);
      console.log("Expected ref direction:", expectedRefDir);
      
      // Check if ceiling hit at (505, 80) is on different sides of reference ray
      const ceilingHit505 = { x: 505.24632021172613, y: 80 };
      const vec505Bug = { x: ceilingHit505.x - bugOrigin.x, y: ceilingHit505.y - bugOrigin.y };
      const vec505Expected = { x: ceilingHit505.x - expectedOrigin.x, y: ceilingHit505.y - expectedOrigin.y };
      
      // Cross with reference direction
      const crossRefBug = bugRefDir.x * vec505Bug.y - bugRefDir.y * vec505Bug.x;
      const crossRefExpected = expectedRefDir.x * vec505Expected.y - expectedRefDir.y * vec505Expected.x;
      
      console.log("\nCeiling hit (505, 80) cross with reference direction:");
      console.log(`  Bug: ${crossRefBug.toFixed(2)} (${crossRefBug > 0 ? "left of ref" : "right of ref"})`);
      console.log(`  Expected: ${crossRefExpected.toFixed(2)} (${crossRefExpected > 0 ? "left of ref" : "right of ref"})`);
      
      const sideChange = (crossRefBug > 0) !== (crossRefExpected > 0);
      console.log(`  Side changes: ${sideChange ? "YES - THIS IS THE BUG!" : "no"}`);
    });
  });

  describe("Source Point Tracing", () => {
    it("should trace all source points and find near-collinear pairs", () => {
      const player = BUG_PLAYER;
      const chains = createChains();
      const origin = calculateReflectedOrigin(player);
      
      console.log("\n=== SOURCE POINT TRACING (BUG CASE) ===");
      console.log(`Origin: (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)})`);
      
      // Create windowed cone through mirror-right
      const mirror = getMirrorRightSurface();
      const cone = createConeThroughWindow(
        origin,
        mirror.segment.start,
        mirror.segment.end
      );
      
      const sourcePoints = projectConeV2(cone, chainsWithScreen, mirror.id);
      
      console.log(`\nSource points (${sourcePoints.length}):`);
      sourcePoints.forEach((sp, i) => {
        const xy = sp.computeXY();
        console.log(`  ${i}: ${sp.type.padEnd(10)} (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) key=${sp.getKey()}`);
      });
      
      // Check for duplicates or near-duplicates
      console.log("\n=== CHECKING FOR NEAR-COLLINEAR POINTS ===");
      for (let i = 0; i < sourcePoints.length; i++) {
        for (let j = i + 1; j < sourcePoints.length; j++) {
          const a = sourcePoints[i]!;
          const b = sourcePoints[j]!;
          const aXY = a.computeXY();
          const bXY = b.computeXY();
          
          const cp = crossProduct(origin, aXY, bXY);
          if (Math.abs(cp) < 100) {
            console.log(`  Near-collinear: ${a.type}(${aXY.x.toFixed(1)}, ${aXY.y.toFixed(1)}) vs ${b.type}(${bXY.x.toFixed(1)}, ${bXY.y.toFixed(1)}) cross=${cp.toFixed(2)}`);
          }
        }
      }
    });

    it("should compare source point order between bug and expected cases", () => {
      const bugOrigin = calculateReflectedOrigin(BUG_PLAYER);
      const expectedOrigin = calculateReflectedOrigin(EXPECTED_PLAYER);
      const chains = createChains();
      
      const mirror = getMirrorRightSurface();
      
      const bugCone = createConeThroughWindow(
        bugOrigin,
        mirror.segment.start,
        mirror.segment.end
      );
      const expectedCone = createConeThroughWindow(
        expectedOrigin,
        mirror.segment.start,
        mirror.segment.end
      );
      
      const bugPoints = projectConeV2(bugCone, chains, SCREEN_BOUNDS, mirror.id);
      const expectedPoints = projectConeV2(expectedCone, chains, SCREEN_BOUNDS, mirror.id);
      
      console.log("\n=== SOURCE POINT ORDER COMPARISON ===");
      console.log("\nBug case vertices:");
      bugPoints.forEach((sp, i) => {
        const xy = sp.computeXY();
        console.log(`  ${i}: (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)})`);
      });
      
      console.log("\nExpected case vertices:");
      expectedPoints.forEach((sp, i) => {
        const xy = sp.computeXY();
        console.log(`  ${i}: (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)})`);
      });
      
      // Find the ceiling hit at 505 in both
      const bugCeiling505 = bugPoints.findIndex(sp => {
        const xy = sp.computeXY();
        return Math.abs(xy.x - 505) < 10 && Math.abs(xy.y - 80) < 10;
      });
      const expectedCeiling505 = expectedPoints.findIndex(sp => {
        const xy = sp.computeXY();
        return Math.abs(xy.x - 505) < 10 && Math.abs(xy.y - 80) < 10;
      });
      
      console.log(`\nCeiling(505, 80) index:`);
      console.log(`  Bug case: ${bugCeiling505}`);
      console.log(`  Expected case: ${expectedCeiling505}`);
      console.log(`  Difference: ${Math.abs(bugCeiling505 - expectedCeiling505)} positions`);
      
      expect(bugCeiling505).not.toBe(-1);
      expect(expectedCeiling505).not.toBe(-1);
    });

    it("should analyze the collinear pair: ceiling(505) and window-start(550, 150)", () => {
      const bugOrigin = calculateReflectedOrigin(BUG_PLAYER);
      const expectedOrigin = calculateReflectedOrigin(EXPECTED_PLAYER);
      
      // These two points are collinear from the origin
      const ceiling505 = { x: 505.24632021172613, y: 80 };
      const windowStart = { x: 550, y: 150 };
      
      console.log("\n=== COLLINEAR PAIR ANALYSIS ===");
      console.log("Ceiling(505, 80) and Window-start(550, 150) are collinear from origin");
      
      // Compute exact cross products
      const cpBug = crossProduct(bugOrigin, ceiling505, windowStart);
      const cpExpected = crossProduct(expectedOrigin, ceiling505, windowStart);
      
      console.log(`\nBug origin: (${bugOrigin.x.toFixed(8)}, ${bugOrigin.y.toFixed(8)})`);
      console.log(`Expected origin: (${expectedOrigin.x.toFixed(8)}, ${expectedOrigin.y.toFixed(8)})`);
      console.log(`\nCross products:`);
      console.log(`  Bug: ${cpBug.toExponential(10)}`);
      console.log(`  Expected: ${cpExpected.toExponential(10)}`);
      console.log(`  Sign change: ${(cpBug > 0) !== (cpExpected > 0)}`);
      console.log(`  Bug sign: ${cpBug > 0 ? 'positive' : cpBug < 0 ? 'negative' : 'ZERO'}`);
      console.log(`  Expected sign: ${cpExpected > 0 ? 'positive' : cpExpected < 0 ? 'negative' : 'ZERO'}`);
      
      // Compute distances
      const distCeiling505Bug = Math.sqrt(
        (ceiling505.x - bugOrigin.x) ** 2 + (ceiling505.y - bugOrigin.y) ** 2
      );
      const distWindowStartBug = Math.sqrt(
        (windowStart.x - bugOrigin.x) ** 2 + (windowStart.y - bugOrigin.y) ** 2
      );
      
      console.log(`\nDistances from bug origin:`);
      console.log(`  Ceiling(505, 80): ${distCeiling505Bug.toFixed(2)}`);
      console.log(`  Window-start(550, 150): ${distWindowStartBug.toFixed(2)}`);
      console.log(`  Ceiling is ${distCeiling505Bug < distWindowStartBug ? 'CLOSER' : 'FARTHER'} than window-start`);
      
      // Also check reference direction relationship
      const refDir = { x: 550 - bugOrigin.x, y: 350 - bugOrigin.y }; // toward window center
      const ceilingVec = { x: ceiling505.x - bugOrigin.x, y: ceiling505.y - bugOrigin.y };
      const windowVec = { x: windowStart.x - bugOrigin.x, y: windowStart.y - bugOrigin.y };
      
      const ceilingRefCross = refDir.x * ceilingVec.y - refDir.y * ceilingVec.x;
      const windowRefCross = refDir.x * windowVec.y - refDir.y * windowVec.x;
      
      console.log(`\nReference direction analysis (toward window center):`);
      console.log(`  Ceiling cross with ref: ${ceilingRefCross.toFixed(2)} (${ceilingRefCross > 0 ? 'left' : 'right'} of ref)`);
      console.log(`  Window cross with ref: ${windowRefCross.toFixed(2)} (${windowRefCross > 0 ? 'left' : 'right'} of ref)`);
      console.log(`  Same side: ${(ceilingRefCross > 0) === (windowRefCross > 0)}`);
    });

    it("should verify the exact mechanism of the sorting flip", () => {
      const bugOrigin = calculateReflectedOrigin(BUG_PLAYER);
      
      // All relevant points
      const points = [
        { name: "window-end", pos: { x: 550, y: 550 } },
        { name: "ceiling-505", pos: { x: 505.24632021172613, y: 80 } },
        { name: "mirror-left-449", pos: { x: 250, y: 449.3645557655883 } },
        { name: "window-start", pos: { x: 550, y: 150 } },
      ];
      
      console.log("\n=== SORTING FLIP MECHANISM ===");
      console.log("Origin:", bugOrigin);
      
      // The reference direction (toward window center)
      const refDir = { x: 550 - bugOrigin.x, y: 350 - bugOrigin.y };
      console.log("Reference direction:", refDir);
      
      // Check which side of reference each point is on
      console.log("\nPoint positions relative to reference ray:");
      for (const { name, pos } of points) {
        const vec = { x: pos.x - bugOrigin.x, y: pos.y - bugOrigin.y };
        const crossRef = refDir.x * vec.y - refDir.y * vec.x;
        console.log(`  ${name}: cross=${crossRef.toFixed(2)} (${crossRef > 0 ? 'LEFT' : 'RIGHT'} of ref)`);
      }
      
      // Check pairwise cross products
      console.log("\nPairwise cross products (determines CCW order):");
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const a = points[i]!;
          const b = points[j]!;
          const cp = crossProduct(bugOrigin, a.pos, b.pos);
          const order = cp > 0 ? "a CCW of b" : cp < 0 ? "a CW of b" : "COLLINEAR";
          console.log(`  ${a.name} vs ${b.name}: ${cp.toFixed(2)} (${order})`);
        }
      }
    });

    it("should simulate the sorting comparison function", () => {
      const bugOrigin = calculateReflectedOrigin(BUG_PLAYER);
      const expectedOrigin = calculateReflectedOrigin(EXPECTED_PLAYER);
      
      // Calculate reference direction exactly as the code does:
      // refDirection is toward rightBoundary, which is determined by cross product
      const startLine = { start: { x: 550, y: 150 }, end: { x: 550, y: 550 } };
      
      function calculateRefDirection(origin: Vector2) {
        const startDir = { x: startLine.start.x - origin.x, y: startLine.start.y - origin.y };
        const endDir = { x: startLine.end.x - origin.x, y: startLine.end.y - origin.y };
        const cross = startDir.x * endDir.y - startDir.y * endDir.x;
        const rightBoundary = cross >= 0 ? startLine.end : startLine.start;
        return { x: rightBoundary.x - origin.x, y: rightBoundary.y - origin.y };
      }
      
      const bugRefDir = calculateRefDirection(bugOrigin);
      const expectedRefDir = calculateRefDirection(expectedOrigin);
      
      console.log("\n=== ACTUAL REFERENCE DIRECTIONS ===");
      console.log("Bug refDir:", bugRefDir);
      console.log("Expected refDir:", expectedRefDir);
      
      // Points to compare
      const windowEnd = { x: 550, y: 550 };
      const ceiling505 = { x: 505.24632021172613, y: 80 };
      const mirrorLeft449 = { x: 250, y: 449.3645557655883 };
      const windowStart = { x: 550, y: 150 };
      
      function simulateCompare(origin: Vector2, refDir: Vector2, a: Vector2, b: Vector2, aName: string, bName: string) {
        const aVec = { x: a.x - origin.x, y: a.y - origin.y };
        const bVec = { x: b.x - origin.x, y: b.y - origin.y };
        
        // Cross with reference direction
        const aRef = refDir.x * aVec.y - refDir.y * aVec.x;
        const bRef = refDir.x * bVec.y - refDir.y * bVec.x;
        
        // Check opposite sides
        const oppositeSides = (aRef > 0 && bRef < 0) || (aRef < 0 && bRef > 0);
        
        // FULL PRECISION LOG
        console.log(`  ${aName} vs ${bName}: aRef=${aRef.toExponential(10)}, bRef=${bRef.toExponential(10)}`);
        
        if (oppositeSides) {
          const result = aRef > 0 ? -1 : 1;
          console.log(`    -> oppositeSides=true, result=${result} (${result < 0 ? aName + ' first' : bName + ' first'})`);
          return result;
        }
        
        // Same side: use cross product
        const cross = aVec.x * bVec.y - aVec.y * bVec.x;
        console.log(`    -> sameSide, cross=${cross.toExponential(10)}`);
        if (cross !== 0) {
          const result = cross > 0 ? -1 : 1;
          console.log(`    -> result=${result} (${result < 0 ? aName + ' first' : bName + ' first'})`);
          return result;
        }
        
        // Collinear: use distance
        const aDistSq = aVec.x * aVec.x + aVec.y * aVec.y;
        const bDistSq = bVec.x * bVec.x + bVec.y * bVec.y;
        const result = aDistSq < bDistSq ? -1 : 1;
        console.log(`    -> COLLINEAR! aDist=${Math.sqrt(aDistSq).toFixed(2)}, bDist=${Math.sqrt(bDistSq).toFixed(2)}, result=${result}`);
        return result;
      }
      
      console.log("\n=== SIMULATED COMPARISON RESULTS ===");
      
      console.log("\nBUG CASE comparisons:");
      simulateCompare(bugOrigin, bugRefDir, windowEnd, ceiling505, "window-end", "ceiling-505");
      simulateCompare(bugOrigin, bugRefDir, ceiling505, mirrorLeft449, "ceiling-505", "mirror-left-449");
      simulateCompare(bugOrigin, bugRefDir, windowEnd, mirrorLeft449, "window-end", "mirror-left-449");
      simulateCompare(bugOrigin, bugRefDir, ceiling505, windowStart, "ceiling-505", "window-start");
      
      console.log("\nEXPECTED CASE comparisons:");
      simulateCompare(expectedOrigin, expectedRefDir, windowEnd, ceiling505, "window-end", "ceiling-505");
      simulateCompare(expectedOrigin, expectedRefDir, ceiling505, mirrorLeft449, "ceiling-505", "mirror-left-449");
      simulateCompare(expectedOrigin, expectedRefDir, windowEnd, mirrorLeft449, "window-end", "mirror-left-449");
      simulateCompare(expectedOrigin, expectedRefDir, ceiling505, windowStart, "ceiling-505", "window-start");
    });

    it("PROOF: should demonstrate the floating-point instability", () => {
      const bugOrigin = calculateReflectedOrigin(BUG_PLAYER);
      const expectedOrigin = calculateReflectedOrigin(EXPECTED_PLAYER);
      
      const startLine = { start: { x: 550, y: 150 }, end: { x: 550, y: 550 } };
      const bugRefDir = (() => {
        const startDir = { x: startLine.start.x - bugOrigin.x, y: startLine.start.y - bugOrigin.y };
        const endDir = { x: startLine.end.x - bugOrigin.x, y: startLine.end.y - bugOrigin.y };
        const cross = startDir.x * endDir.y - startDir.y * endDir.x;
        const rightBoundary = cross >= 0 ? startLine.end : startLine.start;
        return { x: rightBoundary.x - bugOrigin.x, y: rightBoundary.y - bugOrigin.y };
      })();
      
      const ceiling505 = { x: 505.24632021172613, y: 80 };
      const ceiling505Vec = { x: ceiling505.x - bugOrigin.x, y: ceiling505.y - bugOrigin.y };
      
      // Calculate the cross product of ceiling-505 with reference direction
      const aRef = bugRefDir.x * ceiling505Vec.y - bugRefDir.y * ceiling505Vec.x;
      
      console.log("\n=== FLOATING-POINT INSTABILITY PROOF ===");
      console.log("\nBug Origin:", bugOrigin);
      console.log("Reference Direction (toward window start):", bugRefDir);
      console.log("\nCeiling-505 position:", ceiling505);
      console.log("Ceiling-505 vector from origin:", ceiling505Vec);
      console.log("\n*** CRITICAL VALUE ***");
      console.log(`  aRef (ceiling-505 cross with refDir) = ${aRef.toExponential(15)}`);
      console.log(`  Magnitude: ${Math.abs(aRef).toExponential(2)}`);
      console.log(`  Is this essentially zero? ${Math.abs(aRef) < 1e-8 ? 'YES' : 'NO'}`);
      console.log(`  But is it treated as positive? ${aRef > 0 ? 'YES' : 'NO'}`);
      
      console.log("\n*** ROOT CAUSE ***");
      console.log("ceiling-505 lies EXACTLY on the ray from origin toward window-start (550, 150).");
      console.log("Due to floating-point rounding, the cross product is 2.9e-11 instead of exactly 0.");
      console.log("This tiny positive value causes oppositeSides=true, putting ceiling-505");
      console.log("on the 'left' side of the reference and sorting it BEFORE mirror-left points.");
      
      console.log("\n*** EXPECTED CASE ***");
      const expectedRefDir = (() => {
        const startDir = { x: startLine.start.x - expectedOrigin.x, y: startLine.start.y - expectedOrigin.y };
        const endDir = { x: startLine.end.x - expectedOrigin.x, y: startLine.end.y - expectedOrigin.y };
        const cross = startDir.x * endDir.y - startDir.y * endDir.x;
        const rightBoundary = cross >= 0 ? startLine.end : startLine.start;
        return { x: rightBoundary.x - expectedOrigin.x, y: rightBoundary.y - expectedOrigin.y };
      })();
      const ceiling505VecExpected = { x: ceiling505.x - expectedOrigin.x, y: ceiling505.y - expectedOrigin.y };
      const aRefExpected = expectedRefDir.x * ceiling505VecExpected.y - expectedRefDir.y * ceiling505VecExpected.x;
      
      console.log(`Expected Origin: (${expectedOrigin.x.toFixed(8)}, ${expectedOrigin.y.toFixed(8)})`);
      console.log(`aRef (expected) = ${aRefExpected.toExponential(15)}`);
      console.log(`When origin moves 0.05 pixels, aRef becomes ${aRefExpected.toFixed(4)}`);
      console.log("This is large enough that ceiling-505 is clearly on the 'left' side.");
      
      console.log("\n*** CONCLUSION ***");
      console.log("The bug occurs because ceiling-505 is EXACTLY collinear with:");
      console.log("  origin → window-start (the reference ray)");
      console.log("When origin.x = 875.556..., aRef = +2.9e-11 (rounding to positive)");
      console.log("When origin.x = 875.606..., aRef = +3.5 (clearly positive)");
      console.log("The sorting uses aRef > 0 to determine if ceiling-505 comes first.");
      console.log("Both cases give the same result (ceiling-505 first), but other comparisons");
      console.log("are affected by similar near-zero values, causing overall sort instability.");
      
      // Verify ceiling-505 is collinear with origin → window-start
      const windowStart = { x: 550, y: 150 };
      const collinearCross = crossProduct(bugOrigin, ceiling505, windowStart);
      console.log(`\n*** COLLINEARITY CHECK ***`);
      console.log(`Cross(origin, ceiling-505, window-start) = ${collinearCross.toExponential(10)}`);
      console.log(`Is collinear? ${Math.abs(collinearCross) < 1e-8 ? 'YES' : 'NO'}`);
      
      expect(Math.abs(aRef)).toBeLessThan(1e-8); // Prove aRef is essentially zero
      expect(aRef).toBeGreaterThan(0); // But treated as positive
    });

    it("should check if ceiling-505 is a continuation ray from window-start endpoint", () => {
      const bugOrigin = calculateReflectedOrigin(BUG_PLAYER);
      const windowStart = { x: 550, y: 150 };
      const ceiling505 = { x: 505.24632021172613, y: 80 };
      
      console.log("\n=== CONTINUATION RAY ANALYSIS ===");
      console.log("Origin:", bugOrigin);
      console.log("Window-start (planned surface endpoint):", windowStart);
      console.log("Ceiling-505 (the problematic hit):", ceiling505);
      
      // Check if origin → window-start → ceiling-505 are collinear
      const collinearCross = crossProduct(bugOrigin, windowStart, ceiling505);
      console.log(`\nCollinearity check (origin → window-start → ceiling-505):`);
      console.log(`  Cross product: ${collinearCross.toExponential(10)}`);
      console.log(`  Is collinear: ${Math.abs(collinearCross) < 1e-8 ? 'YES' : 'NO'}`);
      
      // Check if ceiling-505 is PAST window-start (continuation ray direction)
      const originToWindowStart = {
        x: windowStart.x - bugOrigin.x,
        y: windowStart.y - bugOrigin.y,
      };
      const originToCeiling = {
        x: ceiling505.x - bugOrigin.x,
        y: ceiling505.y - bugOrigin.y,
      };
      
      // If ceiling-505 is the continuation, it should be in the same direction as window-start
      // but FARTHER from origin
      const dotProduct = originToWindowStart.x * originToCeiling.x + originToWindowStart.y * originToCeiling.y;
      const distToWindowStart = Math.sqrt(originToWindowStart.x ** 2 + originToWindowStart.y ** 2);
      const distToCeiling = Math.sqrt(originToCeiling.x ** 2 + originToCeiling.y ** 2);
      
      console.log(`\nDistance analysis:`);
      console.log(`  Distance to window-start: ${distToWindowStart.toFixed(2)}`);
      console.log(`  Distance to ceiling-505: ${distToCeiling.toFixed(2)}`);
      console.log(`  Ceiling is farther: ${distToCeiling > distToWindowStart ? 'YES' : 'NO'}`);
      console.log(`  Dot product (same direction): ${dotProduct.toFixed(2)} (${dotProduct > 0 ? 'SAME direction' : 'OPPOSITE direction'})`);
      
      const isContinuationRay = Math.abs(collinearCross) < 1e-8 && 
                                 distToCeiling > distToWindowStart && 
                                 dotProduct > 0;
      
      console.log(`\n*** CONCLUSION ***`);
      console.log(`Is ceiling-505 the continuation ray from window-start?`);
      console.log(`  - Collinear: ${Math.abs(collinearCross) < 1e-8 ? 'YES' : 'NO'}`);
      console.log(`  - Farther from origin: ${distToCeiling > distToWindowStart ? 'YES' : 'NO'}`);
      console.log(`  - Same direction: ${dotProduct > 0 ? 'YES' : 'NO'}`);
      console.log(`  ANSWER: ${isContinuationRay ? 'YES - ceiling-505 IS the continuation ray!' : 'NO'}`);
      
      if (isContinuationRay) {
        console.log(`\n*** IMPLICATION ***`);
        console.log(`Since ceiling-505 is the continuation of window-start,`);
        console.log(`they should be in the PreComputedPairs collection!`);
        console.log(`If they are, the sorting should use the pre-computed order,`);
        console.log(`NOT the cross-product-based comparison.`);
      }
      
      expect(isContinuationRay).toBe(true);
    });
  });
});




