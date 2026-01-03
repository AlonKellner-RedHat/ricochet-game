/**
 * Reflected Polygon Sorting Bug Investigation
 *
 * Bug Report:
 * - A sub-pixel change in player Y position (622.53 → 617.53, 5 pixels) causes
 *   the reflected visibility polygon to become self-intersecting.
 *
 * Bug Case:
 * - Player: (277.76, 622.53)
 * - Origin (reflected): (822.24, 622.53)
 * - 8 vertices with ceiling hit (509.67, 80) appearing BEFORE mirror-left hits
 *
 * Working Case:
 * - Player: (277.76, 617.53)
 * - Origin (reflected): (822.24, 617.53)
 * - 7 vertices with ceiling hit (509.24, 80) appearing AFTER mirror-left hits
 *
 * The polygon becomes self-intersecting in the bug case due to incorrect vertex ordering.
 */

import { RicochetSurface } from "@/surfaces/RicochetSurface";
import { WallSurface } from "@/surfaces/WallSurface";
import {
  type SurfaceChain,
  createMixedChain,
  createRicochetChain,
  createSingleSurfaceChain,
} from "@/trajectory-v2/geometry/SurfaceChain";
import { isEndpoint, isHitPoint, isOriginPoint } from "@/trajectory-v2/geometry/SourcePoint";
import { isJunctionPoint } from "@/trajectory-v2/geometry/SurfaceChain";
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

const BUG_PLAYER = { x: 277.76106454150045, y: 622.5344466964987 };
const WORKING_PLAYER = { x: 277.76106454150045, y: 617.5344466964987 };

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
 * Create all the surface chains from the bug report.
 */
function createChains(): SurfaceChain[] {
  const chains: SurfaceChain[] = [];

  // Room boundary: single closed chain with mixed reflectivity
  chains.push(
    createMixedChain(
      "room",
      [
        { x: 20, y: 80 },
        { x: 1260, y: 80 },
        { x: 1260, y: 700 },
        { x: 20, y: 700 },
      ],
      [true, false, false, true],
      true
    )
  );

  // Platform
  chains.push(
    createSingleSurfaceChain(new WallSurface("platform-0", { start: { x: 50, y: 620 }, end: { x: 200, y: 620 } }))
  );

  // Mirror surfaces
  chains.push(
    createSingleSurfaceChain(new RicochetSurface("mirror-left-0", { start: { x: 250, y: 550 }, end: { x: 250, y: 150 } }))
  );
  chains.push(
    createSingleSurfaceChain(new RicochetSurface("mirror-right-0", { start: { x: 550, y: 150 }, end: { x: 550, y: 550 } }))
  );

  // Pyramid surfaces
  chains.push(createSingleSurfaceChain(new RicochetSurface("pyramid-1-0", { start: { x: 1030, y: 500 }, end: { x: 1070, y: 500 } })));
  chains.push(createSingleSurfaceChain(new RicochetSurface("pyramid-2-0", { start: { x: 1015, y: 460 }, end: { x: 1085, y: 460 } })));
  chains.push(createSingleSurfaceChain(new RicochetSurface("pyramid-3-0", { start: { x: 1000, y: 420 }, end: { x: 1100, y: 420 } })));
  chains.push(createSingleSurfaceChain(new RicochetSurface("pyramid-4-0", { start: { x: 985, y: 380 }, end: { x: 1115, y: 380 } })));

  // V-shape chains
  chains.push(
    createRicochetChain("chain1", [
      { x: 598.0384757729337, y: 280 },
      { x: 650, y: 250 },
      { x: 701.9615242270663, y: 280 },
    ])
  );
  chains.push(
    createRicochetChain("chain2", [
      { x: 707.5735931288071, y: 292.42640687119285 },
      { x: 750, y: 250 },
      { x: 792.4264068711929, y: 292.42640687119285 },
    ])
  );
  chains.push(
    createRicochetChain("chain3", [
      { x: 820, y: 301.9615242270663 },
      { x: 850, y: 250 },
      { x: 880, y: 301.9615242270663 },
    ])
  );

  // Grid surfaces (simplified - just the ones that might matter)
  chains.push(createSingleSurfaceChain(new RicochetSurface("grid-0-0-0", { start: { x: 885, y: 200 }, end: { x: 915, y: 200 } })));
  chains.push(createSingleSurfaceChain(new RicochetSurface("grid-0-1-0", { start: { x: 935, y: 200 }, end: { x: 965, y: 200 } })));

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
 * Compute cross product for sorting: (a - origin) × (b - origin)
 */
function crossProduct(origin: Vector2, a: Vector2, b: Vector2): number {
  const ax = a.x - origin.x;
  const ay = a.y - origin.y;
  const bx = b.x - origin.x;
  const by = b.y - origin.y;
  return ax * by - ay * bx;
}

/**
 * Check if polygon edges intersect (self-intersection test).
 */
function checkSelfIntersection(vertices: Vector2[]): { intersects: boolean; details: string[] } {
  const details: string[] = [];
  let intersects = false;

  for (let i = 0; i < vertices.length; i++) {
    const a1 = vertices[i]!;
    const a2 = vertices[(i + 1) % vertices.length]!;

    for (let j = i + 2; j < vertices.length; j++) {
      // Skip adjacent edges
      if (j === (i + vertices.length - 1) % vertices.length) continue;
      if ((j + 1) % vertices.length === i) continue;

      const b1 = vertices[j]!;
      const b2 = vertices[(j + 1) % vertices.length]!;

      // Check if segments intersect
      const d1 = crossProduct(a1, a2, b1);
      const d2 = crossProduct(a1, a2, b2);
      const d3 = crossProduct(b1, b2, a1);
      const d4 = crossProduct(b1, b2, a2);

      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
          ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
        intersects = true;
        details.push(
          `Edge ${i}→${(i + 1) % vertices.length} (${a1.x.toFixed(1)}, ${a1.y.toFixed(1)}) → (${a2.x.toFixed(1)}, ${a2.y.toFixed(1)}) ` +
          `intersects edge ${j}→${(j + 1) % vertices.length} (${b1.x.toFixed(1)}, ${b1.y.toFixed(1)}) → (${b2.x.toFixed(1)}, ${b2.y.toFixed(1)})`
        );
      }
    }
  }

  return { intersects, details };
}

describe("Reflected Polygon Sorting Bug", () => {
  describe("Bug Reproduction", () => {
    it("should reproduce the bug case with player at Y=622.53", () => {
      const player = BUG_PLAYER;
      const chains = createChains();
      const origin = calculateReflectedOrigin(player);

      console.log("\n=== BUG CASE ===");
      console.log(`Player: (${player.x.toFixed(2)}, ${player.y.toFixed(2)})`);
      console.log(`Origin (reflected): (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)})`);

      const mirror = getMirrorRightSurface();
      const cone = createConeThroughWindow(origin, mirror.segment.start, mirror.segment.end);

      const sourcePoints = projectConeV2(cone, chains, SCREEN_BOUNDS, mirror.id);
      const vertices = toVector2Array(sourcePoints);

      console.log(`\nPolygon vertices (${vertices.length}):`);
      vertices.forEach((v, i) => {
        console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
      });

      // Check for self-intersection
      const intersection = checkSelfIntersection(vertices);
      console.log(`\nSelf-intersecting: ${intersection.intersects}`);
      if (intersection.details.length > 0) {
        console.log("Intersection details:");
        intersection.details.forEach(d => console.log(`  ${d}`));
      }

      expect(vertices.length).toBeGreaterThan(0);
    });

    it("should produce correct polygon with player at Y=617.53", () => {
      const player = WORKING_PLAYER;
      const chains = createChains();
      const origin = calculateReflectedOrigin(player);

      console.log("\n=== WORKING CASE ===");
      console.log(`Player: (${player.x.toFixed(2)}, ${player.y.toFixed(2)})`);
      console.log(`Origin (reflected): (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)})`);

      const mirror = getMirrorRightSurface();
      const cone = createConeThroughWindow(origin, mirror.segment.start, mirror.segment.end);

      const sourcePoints = projectConeV2(cone, chains, SCREEN_BOUNDS, mirror.id);
      const vertices = toVector2Array(sourcePoints);

      console.log(`\nPolygon vertices (${vertices.length}):`);
      vertices.forEach((v, i) => {
        console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
      });

      // Check for self-intersection
      const intersection = checkSelfIntersection(vertices);
      console.log(`\nSelf-intersecting: ${intersection.intersects}`);

      expect(vertices.length).toBeGreaterThan(0);
    });
  });

  describe("Vertex Ordering Analysis", () => {
    it("should compare vertex order between bug and working cases", () => {
      const bugOrigin = calculateReflectedOrigin(BUG_PLAYER);
      const workingOrigin = calculateReflectedOrigin(WORKING_PLAYER);
      const chains = createChains();
      const mirror = getMirrorRightSurface();

      const bugCone = createConeThroughWindow(bugOrigin, mirror.segment.start, mirror.segment.end);
      const workingCone = createConeThroughWindow(workingOrigin, mirror.segment.start, mirror.segment.end);

      const bugPoints = projectConeV2(bugCone, chains, SCREEN_BOUNDS, mirror.id);
      const workingPoints = projectConeV2(workingCone, chains, SCREEN_BOUNDS, mirror.id);

      console.log("\n=== SOURCE POINT COMPARISON ===");

      console.log("\nBug case source points:");
      bugPoints.forEach((sp, i) => {
        const xy = sp.computeXY();
        let type = sp.type;
        if (isHitPoint(sp)) {
          type = `hit:${sp.hitSurface?.id}`;
        }
        console.log(`  ${i}: ${type.padEnd(25)} (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)})`);
      });

      console.log("\nWorking case source points:");
      workingPoints.forEach((sp, i) => {
        const xy = sp.computeXY();
        let type = sp.type;
        if (isHitPoint(sp)) {
          type = `hit:${sp.hitSurface?.id}`;
        }
        console.log(`  ${i}: ${type.padEnd(25)} (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)})`);
      });

      // Find ceiling hits
      const bugCeilingHits = bugPoints.filter(sp => {
        const xy = sp.computeXY();
        return Math.abs(xy.y - 80) < 1;
      });
      const workingCeilingHits = workingPoints.filter(sp => {
        const xy = sp.computeXY();
        return Math.abs(xy.y - 80) < 1;
      });

      console.log(`\nBug case ceiling hits: ${bugCeilingHits.length}`);
      console.log(`Working case ceiling hits: ${workingCeilingHits.length}`);
    });

    it("should identify the out-of-order vertices", () => {
      const bugOrigin = calculateReflectedOrigin(BUG_PLAYER);
      const chains = createChains();
      const mirror = getMirrorRightSurface();

      const bugCone = createConeThroughWindow(bugOrigin, mirror.segment.start, mirror.segment.end);
      const bugPoints = projectConeV2(bugCone, chains, SCREEN_BOUNDS, mirror.id);
      const vertices = toVector2Array(bugPoints);

      console.log("\n=== OUT-OF-ORDER VERTEX ANALYSIS ===");
      console.log("Origin:", bugOrigin);

      // Expected order (CCW from window-end): 
      // (550, 550) → mirror-left hits (descending Y) → (250, 150) → ceiling → (550, 150)

      // Find vertices on mirror-left (x ≈ 250)
      const mirrorLeftVertices = vertices
        .map((v, i) => ({ v, i }))
        .filter(({ v }) => Math.abs(v.x - 250) < 1);

      // Find ceiling vertices (y ≈ 80)
      const ceilingVertices = vertices
        .map((v, i) => ({ v, i }))
        .filter(({ v }) => Math.abs(v.y - 80) < 1);

      console.log("\nMirror-left vertices (x ≈ 250):");
      mirrorLeftVertices.forEach(({ v, i }) => {
        console.log(`  Index ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
      });

      console.log("\nCeiling vertices (y ≈ 80):");
      ceilingVertices.forEach(({ v, i }) => {
        console.log(`  Index ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
      });

      // Check if ceiling vertex appears before last mirror-left vertex
      if (ceilingVertices.length > 0 && mirrorLeftVertices.length > 0) {
        const lastMirrorLeftIndex = Math.max(...mirrorLeftVertices.map(v => v.i));
        const firstCeilingIndex = Math.min(...ceilingVertices.map(v => v.i));

        console.log(`\nLast mirror-left index: ${lastMirrorLeftIndex}`);
        console.log(`First ceiling index: ${firstCeilingIndex}`);
        console.log(`Ceiling appears before mirror-left ends: ${firstCeilingIndex < lastMirrorLeftIndex}`);
      }
    });
  });

  describe("Collinear Relationship Analysis", () => {
    it("should check collinearity between key vertices and origin rays", () => {
      const bugOrigin = calculateReflectedOrigin(BUG_PLAYER);
      const workingOrigin = calculateReflectedOrigin(WORKING_PLAYER);

      // Key reference points
      const windowStart = { x: 550, y: 150 };
      const windowEnd = { x: 550, y: 550 };
      const mirrorLeftEnd = { x: 250, y: 150 };

      // Potential problem vertices (from bug report)
      const ceilingHit = { x: 509.67, y: 80 };
      const mirrorLeftHit1 = { x: 250, y: 470.07 };
      const mirrorLeftHit2 = { x: 250, y: 235.54 };
      const mirrorLeftHit3 = { x: 250, y: 189.28 };

      console.log("\n=== COLLINEARITY ANALYSIS ===");
      console.log("Bug origin:", bugOrigin);
      console.log("Working origin:", workingOrigin);

      // Check if ceiling hit is collinear with origin → window-start
      const checkCollinear = (origin: Vector2, name: string) => {
        console.log(`\n--- ${name} ---`);

        // Cross product with window-start ray
        const cpWindowStart = crossProduct(origin, ceilingHit, windowStart);
        console.log(`Ceiling hit vs window-start: ${cpWindowStart.toExponential(4)}`);

        // Cross product with mirror-left-end ray
        const cpMirrorLeft = crossProduct(origin, ceilingHit, mirrorLeftEnd);
        console.log(`Ceiling hit vs mirror-left-end: ${cpMirrorLeft.toExponential(4)}`);

        // Check mirror-left hits vs window-start
        const cp1 = crossProduct(origin, mirrorLeftHit1, windowStart);
        const cp2 = crossProduct(origin, mirrorLeftHit2, windowStart);
        const cp3 = crossProduct(origin, mirrorLeftHit3, windowStart);
        console.log(`Mirror-left 470 vs window-start: ${cp1.toExponential(4)}`);
        console.log(`Mirror-left 235 vs window-start: ${cp2.toExponential(4)}`);
        console.log(`Mirror-left 189 vs window-start: ${cp3.toExponential(4)}`);
      };

      checkCollinear(bugOrigin, "Bug Origin");
      checkCollinear(workingOrigin, "Working Origin");
    });

    it("should find near-collinear vertex pairs", () => {
      const bugOrigin = calculateReflectedOrigin(BUG_PLAYER);
      const chains = createChains();
      const mirror = getMirrorRightSurface();

      const bugCone = createConeThroughWindow(bugOrigin, mirror.segment.start, mirror.segment.end);
      const bugPoints = projectConeV2(bugCone, chains, SCREEN_BOUNDS, mirror.id);

      console.log("\n=== NEAR-COLLINEAR SEARCH ===");
      console.log("Looking for vertex pairs with |cross product| < 1000...\n");

      const nearCollinear: { i: number; j: number; cp: number; a: Vector2; b: Vector2 }[] = [];

      for (let i = 0; i < bugPoints.length; i++) {
        for (let j = i + 1; j < bugPoints.length; j++) {
          const a = bugPoints[i]!.computeXY();
          const b = bugPoints[j]!.computeXY();
          const cp = crossProduct(bugOrigin, a, b);

          if (Math.abs(cp) < 1000) {
            nearCollinear.push({ i, j, cp, a, b });
          }
        }
      }

      nearCollinear.sort((x, y) => Math.abs(x.cp) - Math.abs(y.cp));

      console.log(`Found ${nearCollinear.length} near-collinear pairs:`);
      nearCollinear.slice(0, 10).forEach(({ i, j, cp, a, b }) => {
        const spA = bugPoints[i]!;
        const spB = bugPoints[j]!;
        let typeA = spA.type;
        let typeB = spB.type;
        if (isHitPoint(spA)) typeA = `hit:${spA.hitSurface?.id}`;
        if (isHitPoint(spB)) typeB = `hit:${spB.hitSurface?.id}`;

        console.log(`  [${i}] ${typeA} (${a.x.toFixed(1)}, ${a.y.toFixed(1)}) vs [${j}] ${typeB} (${b.x.toFixed(1)}, ${b.y.toFixed(1)}): cp=${cp.toFixed(2)}`);
      });
    });
  });

  describe("Root Cause Proof", () => {
    it("should prove the sorting instability with cross product sign change", () => {
      const bugOrigin = calculateReflectedOrigin(BUG_PLAYER);
      const workingOrigin = calculateReflectedOrigin(WORKING_PLAYER);

      console.log("\n=== ROOT CAUSE PROOF ===");
      console.log("Bug origin:", bugOrigin);
      console.log("Working origin:", workingOrigin);
      console.log("Origin difference: Y =", workingOrigin.y - bugOrigin.y);

      // Key vertices from the bug report
      const vertices = [
        { name: "window-end", pos: { x: 550, y: 550 } },
        { name: "mirror-left-470", pos: { x: 250, y: 470.07 } },
        { name: "ceiling-509", pos: { x: 509.67, y: 80 } },
        { name: "mirror-left-235", pos: { x: 250, y: 235.54 } },
        { name: "mirror-left-189", pos: { x: 250, y: 189.28 } },
        { name: "mirror-left-150", pos: { x: 250, y: 150 } },
        { name: "ceiling-165", pos: { x: 165.23, y: 80 } },
        { name: "window-start", pos: { x: 550, y: 150 } },
      ];

      console.log("\n--- Cross Product Sign Analysis ---");
      console.log("Looking for sign changes between bug and working cases...\n");

      const signChanges: { a: string; b: string; cpBug: number; cpWorking: number }[] = [];

      for (let i = 0; i < vertices.length; i++) {
        for (let j = i + 1; j < vertices.length; j++) {
          const a = vertices[i]!;
          const b = vertices[j]!;

          const cpBug = crossProduct(bugOrigin, a.pos, b.pos);
          const cpWorking = crossProduct(workingOrigin, a.pos, b.pos);

          const bugSign = cpBug > 0 ? "+" : cpBug < 0 ? "-" : "0";
          const workingSign = cpWorking > 0 ? "+" : cpWorking < 0 ? "-" : "0";

          if (bugSign !== workingSign) {
            signChanges.push({ a: a.name, b: b.name, cpBug, cpWorking });
            console.log(`SIGN CHANGE: ${a.name} vs ${b.name}`);
            console.log(`  Bug: ${cpBug.toExponential(4)} (${bugSign})`);
            console.log(`  Working: ${cpWorking.toExponential(4)} (${workingSign})\n`);
          }
        }
      }

      if (signChanges.length === 0) {
        console.log("No sign changes found between listed vertices.");
        console.log("The instability may involve vertices not in this list.");
      } else {
        console.log(`\nTotal sign changes: ${signChanges.length}`);
      }
    });

    it("should analyze the reference direction cross products", () => {
      const bugOrigin = calculateReflectedOrigin(BUG_PLAYER);
      const workingOrigin = calculateReflectedOrigin(WORKING_PLAYER);

      // Reference direction is toward window-start (550, 150) for windowed cone
      const windowStart = { x: 550, y: 150 };
      const windowEnd = { x: 550, y: 550 };

      // Calculate reference directions
      const bugRefDir = { x: windowStart.x - bugOrigin.x, y: windowStart.y - bugOrigin.y };
      const workingRefDir = { x: windowStart.x - workingOrigin.x, y: windowStart.y - workingOrigin.y };

      console.log("\n=== REFERENCE DIRECTION ANALYSIS ===");
      console.log("Bug ref direction:", bugRefDir);
      console.log("Working ref direction:", workingRefDir);

      // Key vertices to check
      const testVertices = [
        { name: "ceiling-509", pos: { x: 509.67, y: 80 } },
        { name: "mirror-left-235", pos: { x: 250, y: 235.54 } },
        { name: "mirror-left-189", pos: { x: 250, y: 189.28 } },
      ];

      console.log("\n--- Position relative to reference ray ---");

      for (const { name, pos } of testVertices) {
        const bugVec = { x: pos.x - bugOrigin.x, y: pos.y - bugOrigin.y };
        const workingVec = { x: pos.x - workingOrigin.x, y: pos.y - workingOrigin.y };

        // Cross with reference direction
        const bugCross = bugRefDir.x * bugVec.y - bugRefDir.y * bugVec.x;
        const workingCross = workingRefDir.x * workingVec.y - workingRefDir.y * workingVec.x;

        const bugSide = bugCross > 0 ? "LEFT" : bugCross < 0 ? "RIGHT" : "ON";
        const workingSide = workingCross > 0 ? "LEFT" : workingCross < 0 ? "RIGHT" : "ON";

        console.log(`\n${name}:`);
        console.log(`  Bug: ${bugCross.toExponential(4)} (${bugSide} of ref)`);
        console.log(`  Working: ${workingCross.toExponential(4)} (${workingSide} of ref)`);

        if (bugSide !== workingSide) {
          console.log(`  >>> SIDE CHANGE DETECTED <<<`);
        }
      }
    });

    it("should identify the exact vertex causing the instability", () => {
      const bugOrigin = calculateReflectedOrigin(BUG_PLAYER);
      const workingOrigin = calculateReflectedOrigin(WORKING_PLAYER);
      const chains = createChains();
      const mirror = getMirrorRightSurface();

      const bugCone = createConeThroughWindow(bugOrigin, mirror.segment.start, mirror.segment.end);
      const workingCone = createConeThroughWindow(workingOrigin, mirror.segment.start, mirror.segment.end);

      const bugPoints = projectConeV2(bugCone, chains, SCREEN_BOUNDS, mirror.id);
      const workingPoints = projectConeV2(workingCone, chains, SCREEN_BOUNDS, mirror.id);

      console.log("\n=== INSTABILITY IDENTIFICATION ===");

      // Reference direction toward window-start
      const windowStart = { x: 550, y: 150 };
      const bugRefDir = { x: windowStart.x - bugOrigin.x, y: windowStart.y - bugOrigin.y };
      const workingRefDir = { x: windowStart.x - workingOrigin.x, y: windowStart.y - workingOrigin.y };

      console.log("\nSearching for vertices that change sides of reference ray...\n");

      // Check all bug points
      for (let i = 0; i < bugPoints.length; i++) {
        const sp = bugPoints[i]!;
        const pos = sp.computeXY();

        const bugVec = { x: pos.x - bugOrigin.x, y: pos.y - bugOrigin.y };
        const workingVec = { x: pos.x - workingOrigin.x, y: pos.y - workingOrigin.y };

        const bugCross = bugRefDir.x * bugVec.y - bugRefDir.y * bugVec.x;
        const workingCross = workingRefDir.x * workingVec.y - workingRefDir.y * workingVec.x;

        // Check for near-zero or sign change
        const isNearZero = Math.abs(bugCross) < 100 || Math.abs(workingCross) < 100;
        const signChange = (bugCross > 0) !== (workingCross > 0);

        if (isNearZero || signChange) {
          let type = sp.type;
          if (isHitPoint(sp)) type = `hit:${sp.hitSurface?.id}`;

          console.log(`[${i}] ${type} at (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)})`);
          console.log(`  Bug cross: ${bugCross.toExponential(4)}`);
          console.log(`  Working cross: ${workingCross.toExponential(4)}`);
          if (signChange) console.log(`  >>> SIGN CHANGE <<<`);
          if (isNearZero) console.log(`  >>> NEAR ZERO <<<`);
          console.log();
        }
      }
    });
  });
});

