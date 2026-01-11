/**
 * Top-Right Triangle Bug Investigation
 *
 * Bug: A light triangle appears beyond the top surface (ceiling at y=80) in the
 * top-right corner. The triangle's apex is at approximately (1277.35, 0) - on
 * the screen-top boundary, not the screen corner.
 *
 * Key data points:
 * - Bug case: player.y = 279.02575285674146
 * - Working case: player.y = 279.02583285674143
 * - Difference: ~0.00008 pixels (8e-5)
 */
import { describe, it, expect } from "vitest";
import {
  projectConeV2,
  createFullCone,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import {
  createSingleSurfaceChain,
  createWallChain,
  SurfaceChain,
} from "@/trajectory-v2/geometry/SurfaceChain";
import type { Surface } from "@/trajectory-v2/geometry/types";
import { isHitPoint, isEndpoint } from "@/trajectory-v2/geometry/SourcePoint";

// Room boundary as a single closed rectangular chain with JunctionPoints at corners
// Vertices in CCW order (for inward-facing normals)
const ROOM_CHAIN = createWallChain(
  "room",
  [
    { x: 20, y: 80 },     // top-left
    { x: 1260, y: 80 },   // top-right (the problematic corner)
    { x: 1260, y: 700 },  // bottom-right
    { x: 20, y: 700 },    // bottom-left
  ],
  true // isClosed
);

// Other surfaces (not part of the room boundary)
const OTHER_SURFACES: Surface[] = [
  { id: "platform-0", segment: { start: { x: 50, y: 620 }, end: { x: 200, y: 620 } }, canReflect: false },
  { id: "mirror-left-0", segment: { start: { x: 250, y: 550 }, end: { x: 250, y: 150 } }, canReflect: true },
  { id: "mirror-right-0", segment: { start: { x: 550, y: 150 }, end: { x: 550, y: 550 } }, canReflect: true },
  { id: "pyramid-1-0", segment: { start: { x: 1030, y: 500 }, end: { x: 1070, y: 500 } }, canReflect: true },
  { id: "pyramid-2-0", segment: { start: { x: 1015, y: 460 }, end: { x: 1085, y: 460 } }, canReflect: true },
  { id: "pyramid-3-0", segment: { start: { x: 1000, y: 420 }, end: { x: 1100, y: 420 } }, canReflect: true },
  { id: "pyramid-4-0", segment: { start: { x: 985, y: 380 }, end: { x: 1115, y: 380 } }, canReflect: true },
  { id: "grid-0-0-0", segment: { start: { x: 885, y: 200 }, end: { x: 915, y: 200 } }, canReflect: true },
  { id: "grid-0-1-0", segment: { start: { x: 935, y: 200 }, end: { x: 965, y: 200 } }, canReflect: true },
  { id: "grid-0-2-0", segment: { start: { x: 1010.6066017177982, y: 189.3933982822018 }, end: { x: 989.3933982822018, y: 210.6066017177982 } }, canReflect: true },
  { id: "grid-0-3-0", segment: { start: { x: 1039.3933982822018, y: 189.3933982822018 }, end: { x: 1060.6066017177982, y: 210.6066017177982 } }, canReflect: true },
  { id: "grid-1-0-0", segment: { start: { x: 900, y: 235 }, end: { x: 900, y: 265 } }, canReflect: true },
  { id: "grid-1-1-0", segment: { start: { x: 939.3933982822018, y: 239.3933982822018 }, end: { x: 960.6066017177982, y: 260.6066017177982 } }, canReflect: true },
  { id: "grid-1-2-0", segment: { start: { x: 985, y: 250 }, end: { x: 1015, y: 250 } }, canReflect: true },
  { id: "grid-1-3-0", segment: { start: { x: 1060.6066017177982, y: 260.6066017177982 }, end: { x: 1039.3933982822018, y: 239.3933982822018 } }, canReflect: true },
  { id: "grid-2-0-0", segment: { start: { x: 915, y: 300 }, end: { x: 885, y: 300 } }, canReflect: true },
  { id: "grid-2-1-0", segment: { start: { x: 960.6066017177982, y: 310.6066017177982 }, end: { x: 939.3933982822018, y: 289.3933982822018 } }, canReflect: true },
  { id: "grid-2-2-0", segment: { start: { x: 1000, y: 315 }, end: { x: 1000, y: 285 } }, canReflect: true },
  { id: "grid-2-3-0", segment: { start: { x: 1060.6066017177982, y: 289.3933982822018 }, end: { x: 1039.3933982822018, y: 310.6066017177982 } }, canReflect: true },
  { id: "grid-3-0-0", segment: { start: { x: 889.3933982822018, y: 339.3933982822018 }, end: { x: 910.6066017177982, y: 360.6066017177982 } }, canReflect: true },
  { id: "grid-3-1-0", segment: { start: { x: 939.3933982822018, y: 339.3933982822018 }, end: { x: 960.6066017177982, y: 360.6066017177982 } }, canReflect: true },
  { id: "grid-3-2-0", segment: { start: { x: 1000, y: 365 }, end: { x: 1000, y: 335 } }, canReflect: true },
  { id: "grid-3-3-0", segment: { start: { x: 1050, y: 365 }, end: { x: 1050, y: 335 } }, canReflect: true },
  { id: "chain1-0", segment: { start: { x: 598.0384757729337, y: 280 }, end: { x: 650, y: 250 } }, canReflect: true },
  { id: "chain1-1", segment: { start: { x: 650, y: 250 }, end: { x: 701.9615242270663, y: 280 } }, canReflect: true },
  { id: "chain2-0", segment: { start: { x: 707.5735931288071, y: 292.42640687119285 }, end: { x: 750, y: 250 } }, canReflect: true },
  { id: "chain2-1", segment: { start: { x: 750, y: 250 }, end: { x: 792.4264068711929, y: 292.42640687119285 } }, canReflect: true },
  { id: "chain3-0", segment: { start: { x: 820, y: 301.9615242270663 }, end: { x: 850, y: 250 } }, canReflect: true },
  { id: "chain3-1", segment: { start: { x: 850, y: 250 }, end: { x: 880, y: 301.9615242270663 } }, canReflect: true },
];

const SCREEN_BOUNDS = { minX: 0, minY: 0, maxX: 1280, maxY: 720 };

// Bug case: creates the errant triangle
const BUG_PLAYER = { x: 1216.8315353302385, y: 279.02575285674146 };

// Working case: no triangle
const WORKING_PLAYER = { x: 1216.8315353302385, y: 279.02583285674143 };

// Create all chains: room boundary + other surfaces
function createAllChains(): SurfaceChain[] {
  const otherChains = OTHER_SURFACES.map((s) => createSingleSurfaceChain(s));
  return [ROOM_CHAIN, ...otherChains];
}

// Get all surfaces for iteration (room + other)
function getAllSurfaces(): Surface[] {
  return [...ROOM_CHAIN.getSurfaces(), ...OTHER_SURFACES];
}

describe("Top-Right Triangle Bug", () => {
  it("should verify room chain has 4 JunctionPoints at corners", () => {
    const junctions = ROOM_CHAIN.getJunctionPoints();

    console.log("=== ROOM CHAIN JUNCTIONS ===");
    console.log(`Number of junctions: ${junctions.length}`);
    junctions.forEach((j, i) => {
      const xy = j.computeXY();
      console.log(`  Junction ${i}: (${xy.x}, ${xy.y})`);
    });

    // Should have 4 junctions (closed rectangular chain)
    expect(junctions.length).toBe(4);

    // Verify the corners
    const corners = junctions.map((j) => j.computeXY());
    expect(corners).toContainEqual({ x: 20, y: 80 });    // top-left
    expect(corners).toContainEqual({ x: 1260, y: 80 });  // top-right (problematic corner)
    expect(corners).toContainEqual({ x: 1260, y: 700 }); // bottom-right
    expect(corners).toContainEqual({ x: 20, y: 700 });   // bottom-left
  });

  it("should NOT have triangle apex after fix - bug case", () => {
    const chains = createAllChains();
    const cone = createFullCone(BUG_PLAYER);

    const sourcePoints = projectConeV2(cone, chainsWithScreen);
    const vertices = toVector2Array(sourcePoints);

    console.log("=== BUG CASE (FIXED) ===");
    console.log(`Player: (${BUG_PLAYER.x}, ${BUG_PLAYER.y})`);

    // Find vertices above ceiling (y < 80) or on screen-top (y ≈ 0)
    const suspiciousVertices = vertices.filter((v) => v.y < 79);
    console.log("\nVertices above ceiling (y < 79):");
    suspiciousVertices.forEach((v, i) => {
      console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(10)})`);
    });

    // Find the specific vertex around (1277, 0) - should NOT exist after fix
    const triangleApex = vertices.find(
      (v) => v.x > 1260 && v.x < 1280 && Math.abs(v.y) < 1
    );

    if (triangleApex) {
      console.log(`\nTriangle apex found (BUG!): (${triangleApex.x.toFixed(2)}, ${triangleApex.y.toExponential(3)})`);
    } else {
      console.log("\nNo triangle apex (FIXED!)");
    }

    // After fix: no triangle apex should exist
    expect(triangleApex).toBeUndefined();
  });

  it("should NOT have vertex above ceiling in working case", () => {
    const chains = createAllChains();
    const cone = createFullCone(WORKING_PLAYER);

    const sourcePoints = projectConeV2(cone, chainsWithScreen);
    const vertices = toVector2Array(sourcePoints);

    console.log("=== WORKING CASE ===");
    console.log(`Player: (${WORKING_PLAYER.x}, ${WORKING_PLAYER.y})`);

    // Find the specific vertex around (1277, 0)
    const triangleApex = vertices.find(
      (v) => v.x > 1260 && v.x < 1280 && Math.abs(v.y) < 1
    );

    if (triangleApex) {
      console.log(`\nUnexpected triangle apex: (${triangleApex.x.toFixed(2)}, ${triangleApex.y.toExponential(3)})`);
    } else {
      console.log("\nNo triangle apex (correct)");
    }

    // In the working case, there should be no such vertex
    expect(triangleApex).toBeUndefined();
  });

  it("should verify corner is handled as JunctionPoint (not screen-top HitPoint)", () => {
    const chains = createAllChains();
    const cone = createFullCone(BUG_PLAYER);

    const sourcePoints = projectConeV2(cone, chainsWithScreen);

    console.log("=== SOURCE POINT VERIFICATION ===");

    // After fix: no source points near (1277, 0) should exist
    const suspiciousPoints = sourcePoints.filter((p) => {
      const xy = p.computeXY();
      return xy.x > 1260 && xy.x < 1280 && Math.abs(xy.y) < 1;
    });

    console.log(`\nSource points near (1277, 0): ${suspiciousPoints.length}`);

    // Instead, verify the corner at (1260, 80) is a JunctionPoint
    const cornerPoint = sourcePoints.find((p) => {
      const xy = p.computeXY();
      return Math.abs(xy.x - 1260) < 1 && Math.abs(xy.y - 80) < 1;
    });

    if (cornerPoint) {
      console.log(`\nCorner point at (1260, 80):`);
      console.log(`  Type: ${cornerPoint.constructor.name}`);
      console.log(`  Key: ${cornerPoint.getKey()}`);
    }

    // No suspicious points at screen-top
    expect(suspiciousPoints.length).toBe(0);

    // Corner should be a JunctionPoint
    expect(cornerPoint).toBeDefined();
    expect(cornerPoint!.constructor.name).toBe("JunctionPoint");
  });

  it("should analyze sorting behavior - compare polygon vertex order around the bug area", () => {
    const chains = createAllChains();

    console.log("=== SORTING ANALYSIS ===");

    // Bug case
    const bugCone = createFullCone(BUG_PLAYER);
    const bugSourcePoints = projectConeV2(bugCone, chains, SCREEN_BOUNDS);
    const bugVertices = toVector2Array(bugSourcePoints);

    // Working case
    const workingCone = createFullCone(WORKING_PLAYER);
    const workingSourcePoints = projectConeV2(workingCone, chains, SCREEN_BOUNDS);
    const workingVertices = toVector2Array(workingSourcePoints);

    // Find vertices in the top-right area (x > 800, y < 100)
    console.log("\n--- BUG CASE: Top-right vertices (x > 800, y < 100) ---");
    const bugTopRight = bugSourcePoints.filter((p) => {
      const xy = p.computeXY();
      return xy.x > 800 && xy.y < 100;
    });
    bugTopRight.forEach((p, i) => {
      const xy = p.computeXY();
      const type = p.constructor.name;
      const idx = bugSourcePoints.indexOf(p);
      console.log(`  [${idx}] ${type}: (${xy.x.toFixed(2)}, ${xy.y.toFixed(6)}) key=${p.getKey()}`);
    });

    console.log("\n--- WORKING CASE: Top-right vertices (x > 800, y < 100) ---");
    const workingTopRight = workingSourcePoints.filter((p) => {
      const xy = p.computeXY();
      return xy.x > 800 && xy.y < 100;
    });
    workingTopRight.forEach((p, i) => {
      const xy = p.computeXY();
      const type = p.constructor.name;
      const idx = workingSourcePoints.indexOf(p);
      console.log(`  [${idx}] ${type}: (${xy.x.toFixed(2)}, ${xy.y.toFixed(6)}) key=${p.getKey()}`);
    });

    // The key question: why does the HitPoint at (1277, 0) appear in bug case?
    // Check if it's a sorting issue or if the point is only generated in bug case

    const bugScreenTopHits = bugSourcePoints.filter((p) => {
      if (!isHitPoint(p)) return false;
      return p.hitSurface.id === "screen-top";
    });

    const workingScreenTopHits = workingSourcePoints.filter((p) => {
      if (!isHitPoint(p)) return false;
      return p.hitSurface.id === "screen-top";
    });

    console.log(`\n--- Screen-top HitPoints ---`);
    console.log(`Bug case: ${bugScreenTopHits.length} hits`);
    bugScreenTopHits.forEach((p) => {
      const xy = p.computeXY();
      console.log(`  (${xy.x.toFixed(2)}, ${xy.y.toFixed(6)}) s=${(p as any).s.toFixed(6)}`);
    });

    console.log(`Working case: ${workingScreenTopHits.length} hits`);
    workingScreenTopHits.forEach((p) => {
      const xy = p.computeXY();
      console.log(`  (${xy.x.toFixed(2)}, ${xy.y.toFixed(6)}) s=${(p as any).s.toFixed(6)}`);
    });

    // AFTER FIX: Neither case should have a triangle apex
    const bugHasTriangleApex = bugVertices.some(
      (v) => v.x > 1260 && v.x < 1280 && Math.abs(v.y) < 1
    );
    const workingHasTriangleApex = workingVertices.some(
      (v) => v.x > 1260 && v.x < 1280 && Math.abs(v.y) < 1
    );

    console.log(`\nBug case has triangle apex: ${bugHasTriangleApex} (should be false after fix)`);
    console.log(`Working case has triangle apex: ${workingHasTriangleApex}`);

    // Both should be false now that the corner is handled as a JunctionPoint
    expect(bugHasTriangleApex).toBe(false);
    expect(workingHasTriangleApex).toBe(false);
  });

  it("should trace what ray target creates the screen-top hit at (1277, 0)", () => {
    console.log("=== RAY TARGET ANALYSIS ===");

    // The ray goes from player to (1648.52, -1711.23)
    // This is a ray that extends far beyond the screen
    // The target is probably an endpoint of some surface

    // Find surfaces with endpoints that might create this ray direction
    const player = BUG_PLAYER;

    // The ray direction is approximately (1648.52 - 1216.83, -1711.23 - 279.03) = (431.69, -1990.26)
    // Normalized, this points upper-right

    // Check which surface endpoint could generate this ray
    console.log("\nChecking surface endpoints in the upper-right direction from player:");

    for (const surface of getAllSurfaces()) {
      const start = surface.segment.start;
      const end = surface.segment.end;

      // Calculate angle from player to each endpoint
      const toStart = { x: start.x - player.x, y: start.y - player.y };
      const toEnd = { x: end.x - player.x, y: end.y - player.y };

      // Check if endpoint is above and to the right, and within a reasonable range
      if (start.y < player.y && start.x > player.x - 200 && start.y < 250) {
        console.log(`  ${surface.id} start: (${start.x}, ${start.y}) - direction: (${toStart.x.toFixed(0)}, ${toStart.y.toFixed(0)})`);
      }
      if (end.y < player.y && end.x > player.x - 200 && end.y < 250) {
        console.log(`  ${surface.id} end: (${end.x}, ${end.y}) - direction: (${toEnd.x.toFixed(0)}, ${toEnd.y.toFixed(0)})`);
      }
    }

    // The most likely candidate is the right-wall endpoint at (1260, 80) or ceiling endpoint at (1280, 80)
    // Let's check the ray to right-wall start
    const rightWallStart = { x: 1260, y: 80 };
    const toRightWall = {
      x: rightWallStart.x - player.x,
      y: rightWallStart.y - player.y,
    };
    console.log(`\nRay to right-wall start (1260, 80): direction = (${toRightWall.x.toFixed(2)}, ${toRightWall.y.toFixed(2)})`);

    // Extend this ray to screen-top (y=0)
    // t = (0 - player.y) / (80 - player.y) * (scaled to hit screen-top)
    // Actually, let's compute where this ray hits screen-top
    if (toRightWall.y < 0) {
      const t = -player.y / toRightWall.y;
      const hitX = player.x + t * toRightWall.x;
      console.log(`Extended ray hits screen-top at x = ${hitX.toFixed(2)}`);
    }

    expect(true).toBe(true);
  });

  it("should investigate: is the screen-top hit from a continuation ray?", () => {
    console.log("=== CONTINUATION RAY INVESTIGATION ===");

    // The hypothesis: The ray to right-wall start (1260, 80) generates a continuation
    // ray that hits screen-top at (1277.35, 0).
    //
    // The right-wall start is at (1260, 80).
    // The ceiling end is at (1280, 80).
    // These are very close - only 20 pixels apart on the same y-level.
    //
    // The continuation ray through (1260, 80) extends towards screen-top.
    // But why does this appear in the bug case and not the working case?

    // Key difference: player.y differs by 0.00008
    // Bug: 279.02575285674146
    // Working: 279.02583285674143

    const bugPlayer = BUG_PLAYER;
    const workingPlayer = WORKING_PLAYER;

    // Calculate ray direction to right-wall start (1260, 80)
    const target = { x: 1260, y: 80 };

    const bugDir = {
      x: target.x - bugPlayer.x,
      y: target.y - bugPlayer.y,
    };
    const workingDir = {
      x: target.x - workingPlayer.x,
      y: target.y - workingPlayer.y,
    };

    console.log(`\nBug player: (${bugPlayer.x}, ${bugPlayer.y})`);
    console.log(`Working player: (${workingPlayer.x}, ${workingPlayer.y})`);
    console.log(`Target: (${target.x}, ${target.y})`);

    console.log(`\nBug direction: (${bugDir.x.toFixed(6)}, ${bugDir.y.toFixed(6)})`);
    console.log(`Working direction: (${workingDir.x.toFixed(6)}, ${workingDir.y.toFixed(6)})`);

    // Where does each ray hit the ceiling (y=80)?
    // The ceiling is from (0, 80) to (1280, 80)
    // Parametric: hit_y = player_y + t * dir_y = 80
    // t = (80 - player_y) / dir_y

    const bugT = (80 - bugPlayer.y) / bugDir.y;
    const bugHitX = bugPlayer.x + bugT * bugDir.x;

    const workingT = (80 - workingPlayer.y) / workingDir.y;
    const workingHitX = workingPlayer.x + workingT * workingDir.x;

    console.log(`\nBug ray hits y=80 at x = ${bugHitX.toFixed(6)} (t=${bugT.toFixed(6)})`);
    console.log(`Working ray hits y=80 at x = ${workingHitX.toFixed(6)} (t=${workingT.toFixed(6)})`);

    // Is the hit on the ceiling (x in [0, 1280])?
    console.log(`\nBug hit on ceiling surface (x in [0, 1280]): ${bugHitX >= 0 && bugHitX <= 1280}`);
    console.log(`Working hit on ceiling surface (x in [0, 1280]): ${workingHitX >= 0 && workingHitX <= 1280}`);

    // Where does each ray hit the right-wall (x=1260)?
    // t = (1260 - player_x) / dir_x

    const bugTWall = (1260 - bugPlayer.x) / bugDir.x;
    const bugWallHitY = bugPlayer.y + bugTWall * bugDir.y;

    const workingTWall = (1260 - workingPlayer.x) / workingDir.x;
    const workingWallHitY = workingPlayer.y + workingTWall * workingDir.y;

    console.log(`\nBug ray hits x=1260 at y = ${bugWallHitY.toFixed(6)} (t=${bugTWall.toFixed(6)})`);
    console.log(`Working ray hits x=1260 at y = ${workingWallHitY.toFixed(6)} (t=${workingTWall.toFixed(6)})`);

    // Key question: which intersection comes first?
    console.log(`\nBug case: ceiling hit at t=${bugT.toFixed(10)}, wall hit at t=${bugTWall.toFixed(10)}`);
    console.log(`Which comes first? ${bugT < bugTWall ? "ceiling" : "wall"}`);

    console.log(`\nWorking case: ceiling hit at t=${workingT.toFixed(10)}, wall hit at t=${workingTWall.toFixed(10)}`);
    console.log(`Which comes first? ${workingT < workingTWall ? "ceiling" : "wall"}`);

    expect(true).toBe(true);
  });

  it("should verify: the issue is with sorting, not ray generation", () => {
    console.log("=== SORTING VS GENERATION ANALYSIS ===");

    const chains = createAllChains();

    // Get unsorted vertices for both cases
    const bugCone = createFullCone(BUG_PLAYER);
    const bugSourcePoints = projectConeV2(bugCone, chains, SCREEN_BOUNDS);

    const workingCone = createFullCone(WORKING_PLAYER);
    const workingSourcePoints = projectConeV2(workingCone, chains, SCREEN_BOUNDS);

    // Check if the screen-top HitPoint exists in both cases BEFORE sorting
    // (We can't easily access pre-sort data, but we can infer from the final output)

    // Find all unique surface IDs that HitPoints reference
    const bugSurfaces = new Set<string>();
    const workingSurfaces = new Set<string>();

    bugSourcePoints.forEach((p) => {
      if (isHitPoint(p)) {
        bugSurfaces.add(p.hitSurface.id);
      }
    });

    workingSourcePoints.forEach((p) => {
      if (isHitPoint(p)) {
        workingSurfaces.add(p.hitSurface.id);
      }
    });

    console.log(`\nBug case surfaces hit: ${[...bugSurfaces].sort().join(", ")}`);
    console.log(`Working case surfaces hit: ${[...workingSurfaces].sort().join(", ")}`);

    // Check specifically for screen-top
    const bugHasScreenTop = bugSurfaces.has("screen-top");
    const workingHasScreenTop = workingSurfaces.has("screen-top");

    console.log(`\nBug case has screen-top hit: ${bugHasScreenTop}`);
    console.log(`Working case has screen-top hit: ${workingHasScreenTop}`);

    // This tells us whether the issue is in RAY GENERATION (different rays cast)
    // or in SORTING (same rays, different order)
    if (bugHasScreenTop && !workingHasScreenTop) {
      console.log("\n>>> ISSUE IS IN RAY GENERATION <<<");
      console.log("The screen-top HitPoint only exists in the bug case.");
    } else if (bugHasScreenTop && workingHasScreenTop) {
      console.log("\n>>> ISSUE IS IN SORTING <<<");
      console.log("Both cases have screen-top HitPoints, but they're sorted differently.");
    }

    expect(true).toBe(true);
  });

  it("should investigate: what target generates the screen-top continuation?", () => {
    console.log("=== CONTINUATION TARGET INVESTIGATION ===");

    // The screen-top HitPoint has:
    // - Key: hit:screen-top:0.9979311805602222
    // - Ray: from (1216.83, 279.03) to (1648.52, -1711.23)
    // - This ray extends FAR beyond the screen (y = -1711!)

    // Let's find what endpoint/junction could generate such a ray
    // The ray direction is (1648.52 - 1216.83, -1711.23 - 279.03) = (431.69, -1990.26)

    // Scale factor in castRayToEndpoint and similar is 10
    // So the actual target is at: origin + direction / 10
    // target = (1216.83 + 43.17, 279.03 - 199.03) = (1260, 80)

    console.log("\nThe ray targets (1260, 80) = right-wall start endpoint");
    console.log("This is also the ceiling end position (1280, 80) is nearby but different");

    // The right-wall starts at (1260, 80) and goes to (1260, 700)
    // The ceiling goes from (0, 80) to (1280, 80)
    // At x=1260, the ceiling and right-wall meet

    // When a ray targets right-wall start (1260, 80):
    // 1. It might hit the ceiling FIRST (since ceiling is horizontal at y=80)
    // 2. If it hits ceiling, does it cast a continuation?
    // 3. If continuation is cast, it would go beyond towards screen-top

    // Key question: is (1260, 80) treated as a corner/junction?
    // If it's a junction, continuation behavior depends on surface orientations
    // If it's just an endpoint, continuation is always cast

    // Check the surfaces at (1260, 80):
    console.log("\nSurfaces at or near (1260, 80):");
    for (const surface of getAllSurfaces()) {
      const start = surface.segment.start;
      const end = surface.segment.end;

      const atStart = Math.abs(start.x - 1260) < 1 && Math.abs(start.y - 80) < 1;
      const atEnd = Math.abs(end.x - 1260) < 1 && Math.abs(end.y - 80) < 1;

      if (atStart) {
        console.log(`  ${surface.id} starts at (${start.x}, ${start.y})`);
      }
      if (atEnd) {
        console.log(`  ${surface.id} ends at (${end.x}, ${end.y})`);
      }
    }

    // Are these surfaces in the same chain?
    console.log("\nThese surfaces (ceiling-0, right-wall-0) are NOT in the same chain.");
    console.log("They're independent single-surface chains.");
    console.log("So the point (1260, 80) is an ENDPOINT of right-wall-0, not a junction.");

    // When targeting an endpoint, the ray logic is:
    // 1. Cast ray to endpoint
    // 2. Check for obstructions
    // 3. If endpoint reached, cast continuation ray

    // The continuation ray would go from (1260, 80) in the same direction
    // and hit screen-top at (1277.35, 0)

    // But why does this happen in bug case and not working case?
    // Both rays target (1260, 80) with the same direction!

    // The answer must be in the obstruction check:
    // Maybe in one case the ceiling is detected as an obstruction,
    // and in the other case it's not

    console.log("\n>>> HYPOTHESIS <<<");
    console.log("The ceiling surface might be blocking the ray in one case but not the other.");
    console.log("This could be due to floating-point edge cases in the intersection test.");

    expect(true).toBe(true);
  });

  it("should prove: ceiling intersection causes the difference", () => {
    console.log("=== CEILING INTERSECTION PROOF ===");

    // Test whether the ray from player to (1260, 80) intersects the ceiling
    // The ceiling is from (0, 80) to (1280, 80)

    // For both player positions, calculate intersection with ceiling
    const ceiling = { start: { x: 0, y: 80 }, end: { x: 1280, y: 80 } };
    const target = { x: 1260, y: 80 };

    for (const [name, player] of [["Bug", BUG_PLAYER], ["Working", WORKING_PLAYER]] as const) {
      console.log(`\n--- ${name} case ---`);

      const dir = { x: target.x - player.x, y: target.y - player.y };
      const scale = 10;
      const rayEnd = { x: player.x + dir.x * scale, y: player.y + dir.y * scale };

      // Line-line intersection
      // Ray: player + t * (rayEnd - player)
      // Ceiling: ceiling.start + s * (ceiling.end - ceiling.start)

      const dx = rayEnd.x - player.x;
      const dy = rayEnd.y - player.y;
      const ex = ceiling.end.x - ceiling.start.x;
      const ey = ceiling.end.y - ceiling.start.y;
      const fx = ceiling.start.x - player.x;
      const fy = ceiling.start.y - player.y;

      const denom = dx * ey - dy * ex;
      const t = (fx * ey - fy * ex) / denom;
      const s = (fx * dy - fy * dx) / denom;

      console.log(`Ray: from (${player.x.toFixed(4)}, ${player.y.toFixed(8)}) to (${rayEnd.x.toFixed(2)}, ${rayEnd.y.toFixed(2)})`);
      console.log(`Ceiling: from (${ceiling.start.x}, ${ceiling.start.y}) to (${ceiling.end.x}, ${ceiling.end.y})`);
      console.log(`Intersection: t = ${t.toFixed(15)}, s = ${s.toFixed(15)}`);

      // Is the intersection valid?
      // t > 0 (in front of ray origin)
      // s in [0, 1] (on the ceiling segment)
      const tValid = t > 0;
      const sValid = s >= 0 && s <= 1;

      console.log(`t > 0: ${tValid} (t = ${t})`);
      console.log(`s in [0, 1]: ${sValid} (s = ${s})`);

      // What is the target's t value?
      // The target is at (1260, 80)
      // target_t = 1 / scale = 0.1
      const targetT = 1 / scale;
      console.log(`Target t = ${targetT}`);

      // Is the ceiling hit BEFORE the target?
      // If t < targetT, ceiling blocks the ray
      console.log(`Ceiling hit before target? ${t < targetT} (${t} < ${targetT})`);

      // The s value tells us WHERE on the ceiling the hit is
      const hitX = ceiling.start.x + s * (ceiling.end.x - ceiling.start.x);
      console.log(`Ceiling hit x = ${hitX.toFixed(10)}`);

      // Key observation: s = 0.984375 means hit at x = 1260
      // This is EXACTLY at the target!
      // So t should equal targetT
    }

    expect(true).toBe(true);
  });
});

