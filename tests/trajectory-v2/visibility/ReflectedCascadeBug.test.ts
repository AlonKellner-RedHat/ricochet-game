/**
 * Test for Reflected Visibility Cascade Bug
 *
 * Issue: A tiny player movement (~0.0001 pixels) causes the reflected visibility
 * polygon to change dramatically from an invalid 11-vertex polygon to a valid
 * 4-vertex polygon.
 *
 * Bug case: Player at (306.7659052704782, 666)
 *   - Reflected origin: (-266.77, 666) - only 1 reflection through room-3
 *   - Polygon has 11 vertices
 *
 * Valid case: Player at (306.76604071216155, 666)
 *   - Reflected origin: (1366.77, -506) - 3 reflections through all surfaces
 *   - Polygon has 4 vertices
 */

import { describe, it, expect } from "vitest";
import {
  createConeThroughWindow,
  createFullCone,
  projectConeV2,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import {
  createMixedChain,
  createRicochetChain,
  createWallChain,
  type SurfaceChain,
} from "@/trajectory-v2/geometry/SurfaceChain";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { isEndpoint, isHitPoint, type SourcePoint } from "@/trajectory-v2/geometry/SourcePoint";
import { isJunctionPoint } from "@/trajectory-v2/geometry/SurfaceChain";

// Bug case player position
const PLAYER_BUG = { x: 306.7659052704782, y: 666 };

// Valid case player position (tiny movement)
const PLAYER_VALID = { x: 306.76604071216155, y: 666 };

// Screen bounds
const SCREEN_BOUNDS = { minX: 0, minY: 0, maxX: 1280, maxY: 720 };

// Planned surfaces (in order)
const PLANNED_SURFACES = [
  {
    id: "room-3",
    start: { x: 20, y: 700 },
    end: { x: 20, y: 80 },
  },
  {
    id: "room-0",
    start: { x: 20, y: 80 },
    end: { x: 1260, y: 80 },
  },
  {
    id: "mirror-right-0",
    start: { x: 550, y: 150 },
    end: { x: 550, y: 550 },
  },
];

// Create chains matching the bug report
function createChains(): SurfaceChain[] {
  // Room chain (closed rectangular)
  const roomChain = createMixedChain(
    "room",
    [
      { x: 20, y: 80 },    // top-left
      { x: 1260, y: 80 },  // top-right
      { x: 1260, y: 700 }, // bottom-right
      { x: 20, y: 700 },   // bottom-left
    ],
    [true, false, false, true], // ceiling reflective, right wall not, floor not, left wall reflective
    true // closed
  );

  // Platform
  const platformChain = createWallChain("platform", [
    { x: 50, y: 620 },
    { x: 200, y: 620 },
  ]);

  // Mirror-left
  const mirrorLeftChain = createRicochetChain("mirror-left", [
    { x: 250, y: 550 },
    { x: 250, y: 150 },
  ]);

  // Mirror-right
  const mirrorRightChain = createRicochetChain("mirror-right", [
    { x: 550, y: 150 },
    { x: 550, y: 550 },
  ]);

  return [roomChain, platformChain, mirrorLeftChain, mirrorRightChain];
}

// Helper to reflect through a surface
function reflectOrigin(origin: Vector2, surface: { start: Vector2; end: Vector2 }): Vector2 {
  return reflectPointThroughLine(origin, surface.start, surface.end);
}

// Helper to extract visible segments on a target surface from source points
function extractVisibleSegments(
  targetSurfaceId: string,
  sourcePoints: readonly SourcePoint[]
): { start: Vector2; end: Vector2 }[] {
  const segments: { start: Vector2; end: Vector2 }[] = [];
  let currentRunStart: Vector2 | null = null;
  let currentRunEnd: Vector2 | null = null;

  for (const sp of sourcePoints) {
    let isOnTarget = false;
    let coords: Vector2 | null = null;

    if (isEndpoint(sp) && sp.surface.id === targetSurfaceId) {
      isOnTarget = true;
      coords = sp.computeXY();
    } else if (isJunctionPoint(sp)) {
      const beforeSurface = sp.getSurfaceBefore();
      const afterSurface = sp.getSurfaceAfter();
      if (beforeSurface?.id === targetSurfaceId || afterSurface?.id === targetSurfaceId) {
        isOnTarget = true;
        coords = sp.computeXY();
      }
    } else if (isHitPoint(sp)) {
      if (sp.hitSurface.id === targetSurfaceId) {
        isOnTarget = true;
        coords = sp.computeXY();
      }
    }

    if (isOnTarget && coords) {
      if (currentRunStart === null) {
        currentRunStart = coords;
      }
      currentRunEnd = coords;
    } else {
      // End of run
      if (currentRunStart !== null && currentRunEnd !== null) {
        if (currentRunStart !== currentRunEnd) {
          segments.push({ start: currentRunStart, end: currentRunEnd });
        }
        currentRunStart = null;
        currentRunEnd = null;
      }
    }
  }

  // Final run
  if (currentRunStart !== null && currentRunEnd !== null && currentRunStart !== currentRunEnd) {
    segments.push({ start: currentRunStart, end: currentRunEnd });
  }

  return segments;
}

// Helper to get source point info
function getSourcePointInfo(sp: SourcePoint): string {
  if (isEndpoint(sp)) {
    return `Endpoint:${sp.surface.id}`;
  } else if (isJunctionPoint(sp)) {
    return `Junction:${sp.getSurfaceBefore()?.id}->${sp.getSurfaceAfter()?.id}`;
  } else if (isHitPoint(sp)) {
    return `HitPoint:${sp.hitSurface.id}(s=${sp.s.toFixed(4)})`;
  }
  return sp.type;
}

// New bug case: light segment reaches junction exactly
const PLAYER_JUNCTION_VALID = { x: 476.56806597506295, y: 227.4098767760181 };
const PLAYER_JUNCTION_INVALID = { x: 476.56806597506295, y: 217.41187677597344 };

// For this case, the planned surfaces are room-0 first, then room-3
const PLANNED_SURFACES_CEILING_FIRST = [
  {
    id: "room-0",
    start: { x: 20, y: 80 },
    end: { x: 1260, y: 80 },
  },
  {
    id: "room-3",
    start: { x: 20, y: 700 },
    end: { x: 20, y: 80 },
  },
];

describe("Reflected Visibility Cascade Bug Investigation", () => {
  describe("Bug Reproduction", () => {
    it("should reproduce the bug case with 11-vertex polygon", () => {
      const chains = createChains();

      console.log("\n=== BUG CASE REPRODUCTION ===");
      console.log(`Player: (${PLAYER_BUG.x}, ${PLAYER_BUG.y})`);

      // Stage 1: Player visibility (full cone)
      const stage1Cone = createFullCone(PLAYER_BUG);
      const stage1Points = projectConeV2(stage1Cone, chains, SCREEN_BOUNDS);
      const stage1Vertices = toVector2Array(stage1Points);

      console.log(`\nStage 1 (Player) vertices: ${stage1Vertices.length}`);

      // Extract visible segments on room-3 (left wall)
      const room3Segments = extractVisibleSegments("room-3", stage1Points);
      console.log(`\nVisible segments on room-3: ${room3Segments.length}`);
      for (const seg of room3Segments) {
        console.log(`  (${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}) -> (${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)})`);
      }

      // Reflect through room-3
      const origin1 = reflectOrigin(PLAYER_BUG, PLANNED_SURFACES[0]!);
      console.log(`\nReflected origin through room-3: (${origin1.x.toFixed(2)}, ${origin1.y.toFixed(2)})`);

      // Expected: origin reflected through x=20 should be at x = 20 - (306.77 - 20) = 20 - 286.77 = -266.77
      expect(origin1.x).toBeCloseTo(-266.77, 0);
      expect(origin1.y).toBeCloseTo(666, 0);

      // Stage 2: Visibility through room-3 window
      if (room3Segments.length > 0) {
        const window = room3Segments[0]!;
        const stage2Cone = createConeThroughWindow(origin1, window.start, window.end);
        const stage2Points = projectConeV2(stage2Cone, chains, SCREEN_BOUNDS, "room-3");
        const stage2Vertices = toVector2Array(stage2Points);

        console.log(`\nStage 2 (room-3 reflection) vertices: ${stage2Vertices.length}`);
        for (let i = 0; i < stage2Vertices.length; i++) {
          const v = stage2Vertices[i]!;
          const sp = stage2Points[i]!;
          console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)}) - ${getSourcePointInfo(sp)}`);
        }

        // Check for vertices on room-0 (ceiling)
        const room0Segments = extractVisibleSegments("room-0", stage2Points);
        console.log(`\nVisible segments on room-0 (ceiling): ${room0Segments.length}`);

        // Check for vertices on mirror-right-0 (should NOT be visible!)
        const mirrorRightSegments = extractVisibleSegments("mirror-right-0", stage2Points);
        console.log(`Visible segments on mirror-right-0: ${mirrorRightSegments.length}`);
        if (mirrorRightSegments.length > 0) {
          console.log("  >>> BUG: mirror-right-0 should NOT be visible from reflected origin!");
        }
      }
    });

    it("should reproduce the valid case with 4-vertex polygon", () => {
      const chains = createChains();

      console.log("\n=== VALID CASE REPRODUCTION ===");
      console.log(`Player: (${PLAYER_VALID.x}, ${PLAYER_VALID.y})`);

      // Stage 1: Player visibility
      const stage1Cone = createFullCone(PLAYER_VALID);
      const stage1Points = projectConeV2(stage1Cone, chains, SCREEN_BOUNDS);

      // Extract visible segments on room-3
      const room3Segments = extractVisibleSegments("room-3", stage1Points);
      console.log(`\nVisible segments on room-3: ${room3Segments.length}`);
      for (const seg of room3Segments) {
        console.log(`  (${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}) -> (${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)})`);
      }

      // Reflect through room-3
      let currentOrigin = reflectOrigin(PLAYER_VALID, PLANNED_SURFACES[0]!);
      console.log(`\nReflected origin through room-3: (${currentOrigin.x.toFixed(2)}, ${currentOrigin.y.toFixed(2)})`);

      // Reflect through room-0
      currentOrigin = reflectOrigin(currentOrigin, PLANNED_SURFACES[1]!);
      console.log(`Reflected origin through room-0: (${currentOrigin.x.toFixed(2)}, ${currentOrigin.y.toFixed(2)})`);

      // Reflect through mirror-right-0
      currentOrigin = reflectOrigin(currentOrigin, PLANNED_SURFACES[2]!);
      console.log(`Reflected origin through mirror-right-0: (${currentOrigin.x.toFixed(2)}, ${currentOrigin.y.toFixed(2)})`);

      // Expected: ~(1366.77, -506)
      expect(currentOrigin.x).toBeCloseTo(1366.77, 0);
      expect(currentOrigin.y).toBeCloseTo(-506, 0);
    });
  });

  describe("Cascade Tracing", () => {
    it("should trace why cascade stops for bug case", () => {
      const chains = createChains();

      console.log("\n=== CASCADE TRACING (BUG CASE) ===");

      // Stage 1: Player visibility
      let currentOrigin = { ...PLAYER_BUG };
      let currentPoints = projectConeV2(createFullCone(currentOrigin), chains, SCREEN_BOUNDS);

      console.log(`Stage 1: Player visibility`);
      console.log(`  Origin: (${currentOrigin.x.toFixed(2)}, ${currentOrigin.y.toFixed(2)})`);
      console.log(`  Source points: ${currentPoints.length}`);

      // Iterate through planned surfaces
      for (let i = 0; i < PLANNED_SURFACES.length; i++) {
        const surface = PLANNED_SURFACES[i]!;
        console.log(`\n--- Attempting Stage ${i + 2}: ${surface.id} ---`);

        // Extract visible segments
        const visibleSegments = extractVisibleSegments(surface.id, currentPoints);
        console.log(`  Visible segments on ${surface.id}: ${visibleSegments.length}`);

        if (visibleSegments.length === 0) {
          console.log(`  >>> CASCADE STOPS: No visible segments on ${surface.id}`);
          console.log(`  >>> This proves Hypothesis 1: extractVisibleSurfaceSegments returns empty`);
          break;
        }

        for (const seg of visibleSegments) {
          console.log(`    Window: (${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}) -> (${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)})`);
        }

        // Reflect origin
        currentOrigin = reflectOrigin(currentOrigin, surface);
        console.log(`  Reflected origin: (${currentOrigin.x.toFixed(2)}, ${currentOrigin.y.toFixed(2)})`);

        // Compute visibility through window
        const window = visibleSegments[0]!;
        const cone = createConeThroughWindow(currentOrigin, window.start, window.end);
        currentPoints = projectConeV2(cone, chainsWithScreen, surface.id);
        console.log(`  Stage ${i + 2} source points: ${currentPoints.length}`);
      }
    });
  });

  describe("Stage 2 Analysis", () => {
    it("should analyze why Stage 2 polygon lacks ceiling points", () => {
      const chains = createChains();

      console.log("\n=== STAGE 2 ANALYSIS ===");

      // Stage 1
      const stage1Points = projectConeV2(createFullCone(PLAYER_BUG), chains, SCREEN_BOUNDS);

      // Extract room-3 window
      const room3Segments = extractVisibleSegments("room-3", stage1Points);
      expect(room3Segments.length).toBeGreaterThan(0);

      const window = room3Segments[0]!;
      console.log(`Window on room-3: (${window.start.x}, ${window.start.y}) -> (${window.end.x}, ${window.end.y})`);

      // Reflect origin through room-3
      const reflectedOrigin = reflectOrigin(PLAYER_BUG, PLANNED_SURFACES[0]!);
      console.log(`Reflected origin: (${reflectedOrigin.x.toFixed(2)}, ${reflectedOrigin.y.toFixed(2)})`);

      // Create cone through window
      const cone = createConeThroughWindow(reflectedOrigin, window.start, window.end);
      console.log(`\nCone properties:`);
      console.log(`  Origin: (${cone.origin.x.toFixed(2)}, ${cone.origin.y.toFixed(2)})`);
      console.log(`  Left boundary: (${cone.leftBoundary.x.toFixed(2)}, ${cone.leftBoundary.y.toFixed(2)})`);
      console.log(`  Right boundary: (${cone.rightBoundary.x.toFixed(2)}, ${cone.rightBoundary.y.toFixed(2)})`);
      if (cone.startLine) {
        console.log(`  Start line: (${cone.startLine.start.x}, ${cone.startLine.start.y}) -> (${cone.startLine.end.x}, ${cone.startLine.end.y})`);
      }

      // Project the cone
      const stage2Points = projectConeV2(cone, chainsWithScreen, "room-3");
      const stage2Vertices = toVector2Array(stage2Points);

      console.log(`\nStage 2 polygon vertices: ${stage2Vertices.length}`);

      // Categorize vertices by surface
      const surfaceCounts: Record<string, number> = {};
      for (const sp of stage2Points) {
        let surfaceId = "unknown";
        if (isEndpoint(sp)) {
          surfaceId = sp.surface.id;
        } else if (isHitPoint(sp)) {
          surfaceId = sp.hitSurface.id;
        } else if (isJunctionPoint(sp)) {
          surfaceId = `junction:${sp.getSurfaceBefore()?.id}/${sp.getSurfaceAfter()?.id}`;
        } else {
          surfaceId = sp.type;
        }
        surfaceCounts[surfaceId] = (surfaceCounts[surfaceId] || 0) + 1;
      }

      console.log(`\nVertices by surface:`);
      for (const [surfaceId, count] of Object.entries(surfaceCounts).sort()) {
        console.log(`  ${surfaceId}: ${count}`);
      }

      // Check if ceiling is included
      const hasCeiling = surfaceCounts["room-0"] !== undefined && surfaceCounts["room-0"] > 0;
      console.log(`\n>>> Has ceiling (room-0) vertices: ${hasCeiling}`);

      if (!hasCeiling) {
        // This proves the bug - the reflected cone doesn't include ceiling
        console.log(`>>> BUG CONFIRMED: Stage 2 polygon has no ceiling vertices`);
        console.log(`>>> Therefore extractVisibleSurfaceSegments("room-0") will return empty`);
        console.log(`>>> And the cascade will stop after room-3 reflection`);
      }

      // Check cone geometry - is the ceiling within the cone?
      console.log(`\n--- Cone Geometry Check ---`);
      const ceilingY = 80;
      const windowTopY = Math.min(window.start.y, window.end.y);
      console.log(`Ceiling Y: ${ceilingY}`);
      console.log(`Window top Y: ${windowTopY}`);
      console.log(`Window includes ceiling? ${windowTopY <= ceilingY}`);
    });
  });

  describe("Hypothesis Tests", () => {
    it("should prove that wrong window causes missing ceiling", () => {
      const chains = createChains();

      console.log("\n=== HYPOTHESIS TEST: WINDOW EXTRACTION ===");

      // Stage 1: Check what portion of room-3 is visible to player
      const stage1Points = projectConeV2(createFullCone(PLAYER_BUG), chains, SCREEN_BOUNDS);

      // Find all room-3 related source points
      console.log(`\nRoom-3 related source points:`);
      for (const sp of stage1Points) {
        let isRoom3 = false;
        if (isEndpoint(sp) && sp.surface.id === "room-3") {
          isRoom3 = true;
        } else if (isHitPoint(sp) && sp.hitSurface.id === "room-3") {
          isRoom3 = true;
        } else if (isJunctionPoint(sp)) {
          const before = sp.getSurfaceBefore();
          const after = sp.getSurfaceAfter();
          if (before?.id === "room-3" || after?.id === "room-3") {
            isRoom3 = true;
          }
        }

        if (isRoom3) {
          const xy = sp.computeXY();
          console.log(`  (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) - ${getSourcePointInfo(sp)}`);
        }
      }

      // Extract the window
      const room3Segments = extractVisibleSegments("room-3", stage1Points);
      console.log(`\nExtracted window segments: ${room3Segments.length}`);
      for (const seg of room3Segments) {
        const minY = Math.min(seg.start.y, seg.end.y);
        const maxY = Math.max(seg.start.y, seg.end.y);
        console.log(`  Y range: ${minY.toFixed(2)} to ${maxY.toFixed(2)}`);
        console.log(`  Includes ceiling junction (y=80)? ${minY <= 80}`);
      }

      // The bug: if the window doesn't extend to y=80, the reflected cone
      // won't be able to see the ceiling
      const windowExtendsToCeiling = room3Segments.some(seg => {
        const minY = Math.min(seg.start.y, seg.end.y);
        return minY <= 80;
      });

      console.log(`\n>>> Window extends to ceiling? ${windowExtendsToCeiling}`);
      if (!windowExtendsToCeiling) {
        console.log(`>>> ROOT CAUSE: Window on room-3 doesn't include the ceiling junction`);
        console.log(`>>> Therefore the reflected cone can't see the ceiling`);
        console.log(`>>> And the cascade stops after room-3`);
      }
    });

    it("should prove ROOT CAUSE: only first window segment is used", () => {
      const chains = createChains();

      console.log("\n=== ROOT CAUSE PROOF ===");

      // Stage 1: Player visibility
      const stage1Points = projectConeV2(createFullCone(PLAYER_BUG), chains, SCREEN_BOUNDS);

      // Extract ALL visible segments on room-3
      const room3Segments = extractVisibleSegments("room-3", stage1Points);
      
      console.log(`\nVisible segments on room-3: ${room3Segments.length}`);
      expect(room3Segments.length).toBe(2); // TWO segments due to mirror-left blocking

      // Segment 1 (lower part): y=614 to y=700
      const segment1 = room3Segments[0]!;
      const seg1MinY = Math.min(segment1.start.y, segment1.end.y);
      const seg1MaxY = Math.max(segment1.start.y, segment1.end.y);
      console.log(`\nSegment 1: y=${seg1MinY.toFixed(2)} to y=${seg1MaxY.toFixed(2)}`);
      console.log(`  Contains ceiling (y=80)? ${seg1MinY <= 80}`);
      expect(seg1MinY).toBeGreaterThan(80); // Does NOT contain ceiling

      // Segment 2 (upper part): y=80 to y=542
      const segment2 = room3Segments[1]!;
      const seg2MinY = Math.min(segment2.start.y, segment2.end.y);
      const seg2MaxY = Math.max(segment2.start.y, segment2.end.y);
      console.log(`\nSegment 2: y=${seg2MinY.toFixed(2)} to y=${seg2MaxY.toFixed(2)}`);
      console.log(`  Contains ceiling (y=80)? ${seg2MinY <= 80}`);
      expect(seg2MinY).toBeLessThanOrEqual(80); // DOES contain ceiling

      console.log("\n>>> ROOT CAUSE IDENTIFIED:");
      console.log(">>> 1. mirror-left-0 blocks part of the left wall, creating TWO visible segments");
      console.log(">>> 2. Segment 1 (y=614-700) is used for reflection, but doesn't include ceiling");
      console.log(">>> 3. Segment 2 (y=80-542) includes ceiling, but is NOT used for reflection");
      console.log(">>> 4. The cascade uses room3Segments[0] which is the WRONG window");
      console.log(">>> 5. To fix: the cascade should use ALL window segments, not just the first");

      // Verify: if we use Segment 2, the ceiling IS visible
      const reflectedOrigin = reflectOrigin(PLAYER_BUG, PLANNED_SURFACES[0]!);
      const coneWithSegment2 = createConeThroughWindow(reflectedOrigin, segment2.start, segment2.end);
      const stage2WithSegment2 = projectConeV2(coneWithSegment2, chains, SCREEN_BOUNDS, "room-3");
      
      // Check for ceiling vertices
      const hasCeiling = stage2WithSegment2.some(sp => {
        if (isHitPoint(sp) && sp.hitSurface.id === "room-0") return true;
        if (isJunctionPoint(sp)) {
          const before = sp.getSurfaceBefore();
          const after = sp.getSurfaceAfter();
          if (before?.id === "room-0" || after?.id === "room-0") return true;
        }
        return false;
      });

      console.log(`\nVerification: Using Segment 2, ceiling visible? ${hasCeiling}`);
      expect(hasCeiling).toBe(true); // Segment 2 DOES see the ceiling!
    });
  });

  describe("Junction Edge Case", () => {
    it("should analyze valid case where light does NOT reach junction", () => {
      const chains = createChains();

      console.log("\n=== JUNCTION VALID CASE (does NOT reach junction) ===");
      console.log(`Player: (${PLAYER_JUNCTION_VALID.x.toFixed(2)}, ${PLAYER_JUNCTION_VALID.y.toFixed(2)})`);

      // Stage 1: Player visibility
      const stage1Points = projectConeV2(createFullCone(PLAYER_JUNCTION_VALID), chains, SCREEN_BOUNDS);
      const stage1Vertices = toVector2Array(stage1Points);

      console.log(`\nStage 1 vertices: ${stage1Vertices.length}`);

      // Find vertices on room-0 (ceiling)
      console.log(`\nRoom-0 (ceiling) related source points:`);
      let hasJunctionOnCeiling = false;
      for (const sp of stage1Points) {
        let isRoom0 = false;
        let isJunction = false;
        if (isEndpoint(sp) && sp.surface.id === "room-0") {
          isRoom0 = true;
        } else if (isHitPoint(sp) && sp.hitSurface.id === "room-0") {
          isRoom0 = true;
        } else if (isJunctionPoint(sp)) {
          const before = sp.getSurfaceBefore();
          const after = sp.getSurfaceAfter();
          if (before?.id === "room-0" || after?.id === "room-0") {
            isRoom0 = true;
            isJunction = true;
            // Check if it's the junction at (20, 80)
            const xy = sp.computeXY();
            if (xy.x === 20 && xy.y === 80) {
              hasJunctionOnCeiling = true;
            }
          }
        }

        if (isRoom0) {
          const xy = sp.computeXY();
          console.log(`  (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) - ${getSourcePointInfo(sp)}${isJunction ? " [JUNCTION]" : ""}`);
        }
      }

      console.log(`\n>>> Light reaches ceiling/left-wall junction (20, 80)? ${hasJunctionOnCeiling}`);

      // Extract visible segments on room-0
      const room0Segments = extractVisibleSegments("room-0", stage1Points);
      console.log(`\nVisible segments on room-0: ${room0Segments.length}`);
      for (const seg of room0Segments) {
        console.log(`  (${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}) -> (${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)})`);
        const reachesJunction = (seg.start.x === 20 && seg.start.y === 80) || (seg.end.x === 20 && seg.end.y === 80);
        console.log(`  Reaches junction? ${reachesJunction}`);
      }

      // Trace cascade
      let currentOrigin = { ...PLAYER_JUNCTION_VALID };
      let currentPoints = stage1Points;

      for (let i = 0; i < PLANNED_SURFACES_CEILING_FIRST.length; i++) {
        const surface = PLANNED_SURFACES_CEILING_FIRST[i]!;
        const visibleSegments = extractVisibleSegments(surface.id, currentPoints);
        console.log(`\n--- Stage ${i + 2}: ${surface.id} ---`);
        console.log(`  Visible segments: ${visibleSegments.length}`);

        if (visibleSegments.length === 0) {
          console.log(`  >>> CASCADE STOPS`);
          break;
        }

        currentOrigin = reflectOrigin(currentOrigin, surface);
        console.log(`  Reflected origin: (${currentOrigin.x.toFixed(2)}, ${currentOrigin.y.toFixed(2)})`);

        const window = visibleSegments[0]!;
        const cone = createConeThroughWindow(currentOrigin, window.start, window.end);
        currentPoints = projectConeV2(cone, chainsWithScreen, surface.id);
        console.log(`  Stage ${i + 2} source points: ${currentPoints.length}`);
      }
    });

    it("should analyze invalid case where light DOES reach junction", () => {
      const chains = createChains();

      console.log("\n=== JUNCTION INVALID CASE (DOES reach junction) ===");
      console.log(`Player: (${PLAYER_JUNCTION_INVALID.x.toFixed(2)}, ${PLAYER_JUNCTION_INVALID.y.toFixed(2)})`);

      // Stage 1: Player visibility
      const stage1Points = projectConeV2(createFullCone(PLAYER_JUNCTION_INVALID), chains, SCREEN_BOUNDS);
      const stage1Vertices = toVector2Array(stage1Points);

      console.log(`\nStage 1 vertices: ${stage1Vertices.length}`);

      // Find vertices on room-0 (ceiling)
      console.log(`\nRoom-0 (ceiling) related source points:`);
      let hasJunctionOnCeiling = false;
      let junctionPoint: SourcePoint | null = null;
      for (const sp of stage1Points) {
        let isRoom0 = false;
        let isJunction = false;
        if (isEndpoint(sp) && sp.surface.id === "room-0") {
          isRoom0 = true;
        } else if (isHitPoint(sp) && sp.hitSurface.id === "room-0") {
          isRoom0 = true;
        } else if (isJunctionPoint(sp)) {
          const before = sp.getSurfaceBefore();
          const after = sp.getSurfaceAfter();
          if (before?.id === "room-0" || after?.id === "room-0") {
            isRoom0 = true;
            isJunction = true;
            const xy = sp.computeXY();
            if (xy.x === 20 && xy.y === 80) {
              hasJunctionOnCeiling = true;
              junctionPoint = sp;
            }
          }
        }

        if (isRoom0) {
          const xy = sp.computeXY();
          console.log(`  (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) - ${getSourcePointInfo(sp)}${isJunction ? " [JUNCTION]" : ""}`);
        }
      }

      console.log(`\n>>> Light reaches ceiling/left-wall junction (20, 80)? ${hasJunctionOnCeiling}`);

      // Extract visible segments on room-0
      const room0Segments = extractVisibleSegments("room-0", stage1Points);
      console.log(`\nVisible segments on room-0: ${room0Segments.length}`);
      for (const seg of room0Segments) {
        console.log(`  (${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}) -> (${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)})`);
        const reachesJunction = (seg.start.x === 20 && seg.start.y === 80) || (seg.end.x === 20 && seg.end.y === 80);
        console.log(`  Reaches junction? ${reachesJunction}`);
      }

      // Trace cascade
      let currentOrigin = { ...PLAYER_JUNCTION_INVALID };
      let currentPoints = stage1Points;

      for (let i = 0; i < PLANNED_SURFACES_CEILING_FIRST.length; i++) {
        const surface = PLANNED_SURFACES_CEILING_FIRST[i]!;
        const visibleSegments = extractVisibleSegments(surface.id, currentPoints);
        console.log(`\n--- Stage ${i + 2}: ${surface.id} ---`);
        console.log(`  Visible segments: ${visibleSegments.length}`);

        if (visibleSegments.length === 0) {
          console.log(`  >>> CASCADE STOPS`);
          break;
        }

        for (const seg of visibleSegments) {
          console.log(`    Window: (${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}) -> (${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)})`);
        }

        currentOrigin = reflectOrigin(currentOrigin, surface);
        console.log(`  Reflected origin: (${currentOrigin.x.toFixed(2)}, ${currentOrigin.y.toFixed(2)})`);

        const window = visibleSegments[0]!;
        const cone = createConeThroughWindow(currentOrigin, window.start, window.end);
        currentPoints = projectConeV2(cone, chainsWithScreen, surface.id);
        console.log(`  Stage ${i + 2} source points: ${currentPoints.length}`);
      }
    });

    it("should prove junction causes segment extraction failure", () => {
      const chains = createChains();

      console.log("\n=== JUNCTION BUG PROOF ===");

      // Stage 1 for invalid case
      const stage1Points = projectConeV2(createFullCone(PLAYER_JUNCTION_INVALID), chains, SCREEN_BOUNDS);

      // Extract room-0 segments
      const room0Segments = extractVisibleSegments("room-0", stage1Points);
      console.log(`\nRoom-0 visible segments: ${room0Segments.length}`);

      // Reflect through room-0
      const origin1 = reflectOrigin(PLAYER_JUNCTION_INVALID, PLANNED_SURFACES_CEILING_FIRST[0]!);
      console.log(`Reflected origin: (${origin1.x.toFixed(2)}, ${origin1.y.toFixed(2)})`);

      // Project cone through room-0 window
      const window = room0Segments[0]!;
      console.log(`Window: (${window.start.x.toFixed(2)}, ${window.start.y.toFixed(2)}) -> (${window.end.x.toFixed(2)}, ${window.end.y.toFixed(2)})`);

      const stage2Cone = createConeThroughWindow(origin1, window.start, window.end);
      const stage2Points = projectConeV2(stage2Cone, chains, SCREEN_BOUNDS, "room-0");

      console.log(`\nStage 2 source points: ${stage2Points.length}`);

      // Find vertices on room-3 (left wall)
      console.log(`\nRoom-3 (left wall) related source points in Stage 2:`);
      for (const sp of stage2Points) {
        let isRoom3 = false;
        if (isEndpoint(sp) && sp.surface.id === "room-3") {
          isRoom3 = true;
        } else if (isHitPoint(sp) && sp.hitSurface.id === "room-3") {
          isRoom3 = true;
        } else if (isJunctionPoint(sp)) {
          const before = sp.getSurfaceBefore();
          const after = sp.getSurfaceAfter();
          if (before?.id === "room-3" || after?.id === "room-3") {
            isRoom3 = true;
          }
        }

        if (isRoom3) {
          const xy = sp.computeXY();
          console.log(`  (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) - ${getSourcePointInfo(sp)}`);
        }
      }

      // Extract room-3 segments from stage 2
      const room3Segments = extractVisibleSegments("room-3", stage2Points);
      console.log(`\nRoom-3 visible segments from Stage 2: ${room3Segments.length}`);

      if (room3Segments.length === 0) {
        console.log(">>> BUG: No visible segments on room-3 from Stage 2");
        console.log(">>> This causes the cascade to stop");
      }

      // Check if the window includes the junction
      const windowIncludesJunction = 
        (window.start.x === 20 && window.start.y === 80) ||
        (window.end.x === 20 && window.end.y === 80);
      console.log(`\n>>> Window includes junction (20, 80)? ${windowIncludesJunction}`);

      if (windowIncludesJunction) {
        console.log(">>> HYPOTHESIS: When the room-0 window reaches the junction,");
        console.log(">>> the reflected cone's left boundary IS the junction point.");
        console.log(">>> But the junction is shared between room-0 and room-3.");
        console.log(">>> The cone might not properly include room-3 because the boundary");
        console.log(">>> is AT the junction, not PAST it.");
      }

      // Check all Stage 2 source points
      console.log("\n--- ALL Stage 2 source points ---");
      for (let i = 0; i < stage2Points.length; i++) {
        const sp = stage2Points[i]!;
        const xy = sp.computeXY();
        console.log(`  ${i}: (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) - ${getSourcePointInfo(sp)}`);
      }

      // Find the junction or origin at (20, 80)
      const junctionOrOrigin = stage2Points.find(sp => {
        const xy = sp.computeXY();
        return xy.x === 20 && xy.y === 80;
      });

      console.log(`\n>>> Point at (20, 80) in Stage 2: ${junctionOrOrigin ? getSourcePointInfo(junctionOrOrigin) : "NOT FOUND"}`);

      if (junctionOrOrigin) {
        console.log(`>>> Type: ${junctionOrOrigin.type}`);
        console.log(">>> This point is the window boundary, so it's an OriginPoint, NOT a JunctionPoint");
        console.log(">>> But extractVisibleSegments checks for JunctionPoint to find room-3 vertices");
        console.log(">>> The OriginPoint at (20, 80) is NOT counted as being on room-3!");
      }
    });

    it("should prove OriginPoint at junction is not recognized as on adjacent surface", () => {
      const chains = createChains();

      console.log("\n=== ROOT CAUSE: OriginPoint vs JunctionPoint ===");

      // Stage 1 for invalid case
      const stage1Points = projectConeV2(createFullCone(PLAYER_JUNCTION_INVALID), chains, SCREEN_BOUNDS);

      // Extract room-0 segments and reflect
      const room0Segments = extractVisibleSegments("room-0", stage1Points);
      const origin1 = reflectOrigin(PLAYER_JUNCTION_INVALID, PLANNED_SURFACES_CEILING_FIRST[0]!);
      const window = room0Segments[0]!;

      // Create the cone - the window boundary at (20, 80) becomes an OriginPoint
      const stage2Cone = createConeThroughWindow(origin1, window.start, window.end);
      const stage2Points = projectConeV2(stage2Cone, chains, SCREEN_BOUNDS, "room-0");

      // Find the OriginPoint at (20, 80)
      const originAt2080 = stage2Points.find(sp => {
        const xy = sp.computeXY();
        return xy.x === 20 && xy.y === 80 && sp.type === "origin";
      });

      console.log(`\nOriginPoint at (20, 80) found: ${originAt2080 !== undefined}`);
      if (originAt2080) {
        console.log(`Type: ${originAt2080.type}`);
      }

      // The problem: extractVisibleSegments only checks:
      // - Endpoint with surface.id === targetSurfaceId
      // - JunctionPoint with before/after surface === targetSurfaceId
      // - HitPoint with hitSurface.id === targetSurfaceId
      // 
      // It does NOT check OriginPoint!
      // OriginPoints represent window boundaries, but when the window boundary
      // is at a junction, it's geometrically on BOTH surfaces.

      console.log("\n>>> ROOT CAUSE IDENTIFIED:");
      console.log(">>> 1. When light reaches the junction at (20, 80), it becomes a window boundary");
      console.log(">>> 2. Window boundaries become OriginPoints in the reflected polygon");
      console.log(">>> 3. extractVisibleSegments does NOT recognize OriginPoints as being on surfaces");
      console.log(">>> 4. The junction is geometrically on room-3, but not detected as such");
      console.log(">>> 5. With only 1 HitPoint on room-3, no segment is formed (needs 2 points)");
      console.log(">>> 6. extractVisibleSegments('room-3') returns empty, cascade stops");

      console.log("\n>>> FIX: extractVisibleSegments should check if OriginPoints are at junction");
      console.log(">>> positions and include them as being on the adjacent surface.");

      // Verify: the single HitPoint on room-3
      const room3Points = stage2Points.filter(sp => {
        if (isHitPoint(sp) && sp.hitSurface.id === "room-3") return true;
        return false;
      });
      console.log(`\nHitPoints on room-3: ${room3Points.length}`);

      // If we manually add the OriginPoint at (20, 80) as being on room-3,
      // we'd have 2 points and could form a segment
      expect(room3Points.length).toBe(1);
      expect(originAt2080).toBeDefined();
    });
  });

  describe("V-Chain Junction Bug", () => {
    // Simpler case: V-chain where junction should be visible but isn't
    const PLAYER_VCHAIN = { x: 776.4435397573859, y: 392.18735055829313 };
    
    // The reported visibility is ALREADY reflected - origin at (723.56, 107.81)
    const REFLECTED_ORIGIN = { x: 723.5564602426141, y: 107.81264944170675 };
    
    // Planned surfaces: chain2-1 first, then chain2-0 (V-shape)
    const CHAIN2_SURFACES = [
      {
        id: "chain2-1",
        start: { x: 750, y: 250 },
        end: { x: 792.4264068711929, y: 292.42640687119285 },
      },
      {
        id: "chain2-0",
        start: { x: 707.5735931288071, y: 292.42640687119285 },
        end: { x: 750, y: 250 },
      },
    ];
    
    // Junction at (750, 250)
    const JUNCTION = { x: 750, y: 250 };

    it("should analyze the REFLECTED visibility polygon directly", () => {
      const chains = createChains();

      console.log("\n=== V-CHAIN JUNCTION BUG ===");
      console.log(`Player: (${PLAYER_VCHAIN.x.toFixed(2)}, ${PLAYER_VCHAIN.y.toFixed(2)})`);
      console.log(`Reflected origin: (${REFLECTED_ORIGIN.x.toFixed(2)}, ${REFLECTED_ORIGIN.y.toFixed(2)})`);
      console.log(`Junction: (${JUNCTION.x}, ${JUNCTION.y})`);

      // The user's JSON shows the visibility FROM the reflected origin
      // with a cone through chain2-1
      
      // First, verify the reflected origin calculation
      const calculatedOrigin = reflectOrigin(PLAYER_VCHAIN, CHAIN2_SURFACES[0]!);
      console.log(`\nCalculated reflected origin: (${calculatedOrigin.x.toFixed(2)}, ${calculatedOrigin.y.toFixed(2)})`);
      console.log(`Matches reported: ${Math.abs(calculatedOrigin.x - REFLECTED_ORIGIN.x) < 1 && Math.abs(calculatedOrigin.y - REFLECTED_ORIGIN.y) < 1}`);

      // Create the cone from the reflected origin through chain2-1
      // The window should be the entire chain2-1 surface
      const windowStart = CHAIN2_SURFACES[0]!.start; // (750, 250) - junction
      const windowEnd = CHAIN2_SURFACES[0]!.end;     // (792.43, 292.43) - endpoint
      
      console.log(`\nWindow (chain2-1): (${windowStart.x}, ${windowStart.y}) -> (${windowEnd.x.toFixed(2)}, ${windowEnd.y.toFixed(2)})`);

      const cone = createConeThroughWindow(REFLECTED_ORIGIN, windowStart, windowEnd);
      const sourcePoints = projectConeV2(cone, chainsWithScreen, "chain2-1");
      const vertices = toVector2Array(sourcePoints);

      console.log(`\nVisibility polygon vertices: ${vertices.length}`);
      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i]!;
        const sp = sourcePoints[i]!;
        console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)}) - ${getSourcePointInfo(sp)}`);
      }

      // Expected from user's JSON:
      // [0] (740.16, 259.84) - unexpected hitpoint (should be junction at 750, 250)
      // [1] (788.22, 700)
      // [2] (672.29, 700)
      // [3] (707.57, 292.43) - chain2-0 endpoint

      // Check if junction is in the polygon
      const hasJunction = vertices.some(v => 
        Math.abs(v.x - JUNCTION.x) < 0.5 && Math.abs(v.y - JUNCTION.y) < 0.5
      );
      console.log(`\n>>> Junction (750, 250) in polygon? ${hasJunction}`);

      // Check the first vertex - should be junction but isn't
      const firstV = vertices[0];
      if (firstV) {
        const isJunction = Math.abs(firstV.x - 750) < 0.5 && Math.abs(firstV.y - 250) < 0.5;
        console.log(`>>> First vertex is junction? ${isJunction}`);
        console.log(`>>> First vertex: (${firstV.x.toFixed(4)}, ${firstV.y.toFixed(4)})`);

        const firstSP = sourcePoints[0];
        if (firstSP) {
          console.log(`>>> Type: ${firstSP.type} - ${getSourcePointInfo(firstSP)}`);
          if (isHitPoint(firstSP)) {
            console.log(`>>>   Hit surface: ${firstSP.hitSurface.id}`);
            console.log(`>>>   s parameter: ${firstSP.s.toFixed(6)}`);
          }
        }
      }
    });

    it("should investigate why the junction is being hit instead of being a window boundary", () => {
      const chains = createChains();

      console.log("\n=== JUNCTION VS WINDOW BOUNDARY ANALYSIS ===");

      // Create cone directly with the known window
      const windowStart = CHAIN2_SURFACES[0]!.start; // (750, 250) - junction
      const windowEnd = CHAIN2_SURFACES[0]!.end;     // (792.43, 292.43) - endpoint

      const cone = createConeThroughWindow(REFLECTED_ORIGIN, windowStart, windowEnd);
      
      console.log(`Cone properties:`);
      console.log(`  Origin: (${cone.origin.x.toFixed(2)}, ${cone.origin.y.toFixed(2)})`);
      console.log(`  Left boundary: (${cone.leftBoundary.x.toFixed(2)}, ${cone.leftBoundary.y.toFixed(2)})`);
      console.log(`  Right boundary: (${cone.rightBoundary.x.toFixed(2)}, ${cone.rightBoundary.y.toFixed(2)})`);

      // Check if cone boundaries match the junction
      const leftIsJunction = Math.abs(cone.leftBoundary.x - 750) < 0.5 && Math.abs(cone.leftBoundary.y - 250) < 0.5;
      const rightIsJunction = Math.abs(cone.rightBoundary.x - 750) < 0.5 && Math.abs(cone.rightBoundary.y - 250) < 0.5;
      console.log(`\nLeft boundary is junction (750, 250)? ${leftIsJunction}`);
      console.log(`Right boundary is junction (750, 250)? ${rightIsJunction}`);

      // Project the cone
      const sourcePoints = projectConeV2(cone, chainsWithScreen, "chain2-1");

      // Find OriginPoints (window boundaries)
      console.log(`\nOriginPoints in polygon:`);
      for (const sp of sourcePoints) {
        if (sp.type === "origin") {
          const xy = sp.computeXY();
          console.log(`  (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)})`);
        }
      }

      // The junction should appear as an OriginPoint at (750, 250)
      const originAtJunction = sourcePoints.find(sp => {
        if (sp.type === "origin") {
          const xy = sp.computeXY();
          return Math.abs(xy.x - 750) < 0.5 && Math.abs(xy.y - 250) < 0.5;
        }
        return false;
      });

      console.log(`\nOriginPoint at junction (750, 250)? ${originAtJunction ? "YES" : "NO"}`);

      if (!originAtJunction) {
        console.log("\n>>> BUG: The junction should be an OriginPoint (window boundary)");
        console.log(">>> but it's NOT in the polygon");
        console.log(">>> The first vertex is a HitPoint instead");
      }
    });

    it("should trace what the boundary ray hits", () => {
      const chains = createChains();

      console.log("\n=== BOUNDARY RAY TRACE ===");

      // Use the known window directly
      const windowStart = CHAIN2_SURFACES[0]!.start; // (750, 250) - junction
      const windowEnd = CHAIN2_SURFACES[0]!.end;     // (792.43, 292.43) - endpoint
      
      console.log(`Reflected origin: (${REFLECTED_ORIGIN.x.toFixed(4)}, ${REFLECTED_ORIGIN.y.toFixed(4)})`);
      console.log(`Window start (junction): (${windowStart.x}, ${windowStart.y})`);
      console.log(`Window end (endpoint): (${windowEnd.x.toFixed(4)}, ${windowEnd.y.toFixed(4)})`);

      // Create the cone
      const cone = createConeThroughWindow(REFLECTED_ORIGIN, windowStart, windowEnd);
      
      // Ray from origin to junction
      const rayToJunction = {
        x: 750 - REFLECTED_ORIGIN.x,
        y: 250 - REFLECTED_ORIGIN.y
      };
      console.log(`\nRay direction to junction: (${rayToJunction.x.toFixed(4)}, ${rayToJunction.y.toFixed(4)})`);

      // What obstacles are in the way?
      console.log(`\n--- Potential obstacles along ray to junction ---`);
      
      // The adjacent surface chain2-0 ends at the junction
      // chain2-0: (707.57, 292.43) → (750, 250)
      console.log(`\nAdjacent surface chain2-0: (707.57, 292.43) → (750, 250)`);
      console.log(`This surface ENDS at the junction (750, 250)`);
      console.log(`If the boundary ray is cast toward (750, 250), it might hit chain2-0 along the way!`);
      
      // Actually project and see what happens
      const sourcePoints = projectConeV2(cone, chainsWithScreen, "chain2-1");
      const vertices = toVector2Array(sourcePoints);

      console.log(`\n--- Polygon result ---`);
      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i]!;
        const sp = sourcePoints[i]!;
        console.log(`  ${i}: (${v.x.toFixed(4)}, ${v.y.toFixed(4)}) - ${getSourcePointInfo(sp)}`);
        
        if (isHitPoint(sp)) {
          console.log(`      Hit surface: ${sp.hitSurface.id}, s=${sp.s.toFixed(6)}`);
        }
      }

      // Check if the unexpected hit is on chain2-0 (the adjacent surface)
      const unexpectedHit = sourcePoints.find(sp => {
        if (isHitPoint(sp)) {
          const xy = sp.computeXY();
          // Check if this is near but not at the junction
          const distToJunction = Math.sqrt((xy.x - 750) ** 2 + (xy.y - 250) ** 2);
          return distToJunction < 20 && distToJunction > 0.5; // Close but not at junction
        }
        return false;
      });

      if (unexpectedHit && isHitPoint(unexpectedHit)) {
        console.log("\n>>> UNEXPECTED HIT FOUND:");
        console.log(`>>>   Surface: ${unexpectedHit.hitSurface.id}`);
        console.log(`>>>   s parameter: ${unexpectedHit.s.toFixed(6)}`);
        const xy = unexpectedHit.computeXY();
        console.log(`>>>   Location: (${xy.x.toFixed(4)}, ${xy.y.toFixed(4)})`);

        if (unexpectedHit.hitSurface.id === "chain2-0") {
          console.log("\n>>> ROOT CAUSE CONFIRMED:");
          console.log(">>> The boundary ray targeting the junction (750, 250) hits chain2-0!");
          console.log(">>> chain2-0 ends at (750, 250), so the hit is at s close to 1.0");
          console.log(">>> But the hit occurs BEFORE the junction endpoint");
          console.log(">>> ");
          console.log(">>> This is the SAME issue as before:");
          console.log(">>> The window boundary ray hits the ADJACENT surface instead of");
          console.log(">>> terminating at the junction. The adjacent surface should be");
          console.log(">>> excluded from the boundary ray's obstacles (using provenance).");
        }
      }
    });

    it("should check what window the cascade would actually use", () => {
      const chains = createChains();

      console.log("\n=== CASCADE WINDOW EXTRACTION ===");

      // Stage 1: Player visibility
      const stage1Points = projectConeV2(createFullCone(PLAYER_VCHAIN), chains, SCREEN_BOUNDS);
      const stage1Vertices = toVector2Array(stage1Points);

      console.log(`Player: (${PLAYER_VCHAIN.x.toFixed(2)}, ${PLAYER_VCHAIN.y.toFixed(2)})`);
      console.log(`Stage 1 vertices: ${stage1Vertices.length}`);

      // Find all chain2-1 related points in Stage 1
      console.log(`\nAll source points related to chain2-1 or chain2-0:`);
      for (const sp of stage1Points) {
        const xy = sp.computeXY();
        let isRelevant = false;
        
        if (isEndpoint(sp)) {
          if (sp.surface.id.startsWith("chain2")) {
            isRelevant = true;
          }
        } else if (isHitPoint(sp)) {
          if (sp.hitSurface.id.startsWith("chain2")) {
            isRelevant = true;
          }
        } else if (isJunctionPoint(sp)) {
          const before = sp.getSurfaceBefore();
          const after = sp.getSurfaceAfter();
          if (before?.id.startsWith("chain2") || after?.id.startsWith("chain2")) {
            isRelevant = true;
          }
        }

        if (isRelevant) {
          console.log(`  (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) - ${getSourcePointInfo(sp)}`);
        }
      }

      // Extract visible segments on chain2-1
      const chain21Segments = extractVisibleSegments("chain2-1", stage1Points);
      console.log(`\nVisible segments on chain2-1: ${chain21Segments.length}`);
      for (const seg of chain21Segments) {
        console.log(`  (${seg.start.x.toFixed(4)}, ${seg.start.y.toFixed(4)}) -> (${seg.end.x.toFixed(4)}, ${seg.end.y.toFixed(4)})`);
      }

      if (chain21Segments.length === 0) {
        console.log("\n>>> Chain2-1 is NOT visible from player!");
        console.log(">>> The user's reported origin (723.56, 107.81) must come from a DIFFERENT cascade path");
        
        // Maybe the player can see chain2-0, and the cascade goes through both?
        const chain20Segments = extractVisibleSegments("chain2-0", stage1Points);
        console.log(`\nVisible segments on chain2-0: ${chain20Segments.length}`);
        for (const seg of chain20Segments) {
          console.log(`  (${seg.start.x.toFixed(4)}, ${seg.start.y.toFixed(4)}) -> (${seg.end.x.toFixed(4)}, ${seg.end.y.toFixed(4)})`);
        }
      }
    });

    it("should trace the ACTUAL cascade using ValidRegionRenderer logic", () => {
      const chains = createChains();

      console.log("\n=== ACTUAL CASCADE TRACE ===");

      // User's planned surfaces in order: chain2-1 first, then chain2-0
      // But the player might not see chain2-1 directly!
      
      // Stage 1: Player visibility
      const stage1Points = projectConeV2(createFullCone(PLAYER_VCHAIN), chains, SCREEN_BOUNDS);
      
      console.log("Stage 1: Player visibility");

      // Check if player sees chain2-1
      const chain21Segments = extractVisibleSegments("chain2-1", stage1Points);
      console.log(`  Visible on chain2-1: ${chain21Segments.length} segments`);

      // The user's planned order is: chain2-1, then chain2-0
      // So if player doesn't see chain2-1, the cascade should stop or skip
      
      if (chain21Segments.length > 0) {
        const window21 = chain21Segments[0]!;
        console.log(`  Window on chain2-1: (${window21.start.x.toFixed(2)}, ${window21.start.y.toFixed(2)}) -> (${window21.end.x.toFixed(2)}, ${window21.end.y.toFixed(2)})`);

        // Reflect through chain2-1
        const origin21 = reflectOrigin(PLAYER_VCHAIN, CHAIN2_SURFACES[0]!);
        console.log(`  Reflected origin: (${origin21.x.toFixed(2)}, ${origin21.y.toFixed(2)})`);

        // Stage 2
        const cone21 = createConeThroughWindow(origin21, window21.start, window21.end);
        const stage2Points = projectConeV2(cone21, chains, SCREEN_BOUNDS, "chain2-1");
        const stage2Vertices = toVector2Array(stage2Points);

        console.log(`\nStage 2: Through chain2-1`);
        console.log(`  Vertices: ${stage2Vertices.length}`);
        for (let i = 0; i < Math.min(5, stage2Vertices.length); i++) {
          const v = stage2Vertices[i]!;
          const sp = stage2Points[i]!;
          console.log(`    ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)}) - ${getSourcePointInfo(sp)}`);
        }

        // Check if stage 2 sees chain2-0
        const chain20Segments = extractVisibleSegments("chain2-0", stage2Points);
        console.log(`  Visible on chain2-0: ${chain20Segments.length} segments`);
      } else {
        console.log("\n>>> Player cannot see chain2-1 directly!");
        console.log(">>> This explains why the reported origin doesn't match my calculation.");
        console.log(">>> The cascade must be taking a different path.");
      }
    });

    it("should check what the player CAN see", () => {
      const chains = createChains();

      console.log("\n=== WHAT CAN PLAYER SEE? ===");

      // Stage 1: Player visibility
      const stage1Points = projectConeV2(createFullCone(PLAYER_VCHAIN), chains, SCREEN_BOUNDS);
      const stage1Vertices = toVector2Array(stage1Points);

      console.log(`Player: (${PLAYER_VCHAIN.x.toFixed(2)}, ${PLAYER_VCHAIN.y.toFixed(2)})`);
      console.log(`Total vertices: ${stage1Vertices.length}`);

      // Group by surface
      const surfaceCounts: Record<string, number> = {};
      for (const sp of stage1Points) {
        let surfaceId = "unknown";
        if (isEndpoint(sp)) {
          surfaceId = sp.surface.id;
        } else if (isHitPoint(sp)) {
          surfaceId = sp.hitSurface.id;
        } else if (isJunctionPoint(sp)) {
          surfaceId = `junction:${sp.getSurfaceBefore()?.id}/${sp.getSurfaceAfter()?.id}`;
        }
        surfaceCounts[surfaceId] = (surfaceCounts[surfaceId] || 0) + 1;
      }

      console.log(`\nVertices by surface:`);
      for (const [surfaceId, count] of Object.entries(surfaceCounts).sort()) {
        console.log(`  ${surfaceId}: ${count}`);
      }

      // The user's reported polygon has 4 vertices on surfaces:
      // - chain2-1 (hitpoint at 740.16, 259.84)
      // - room-2 (two hitpoints)
      // - chain2-0 (endpoint at 707.57, 292.43)
      // But this is the REFLECTED polygon, not the player's direct visibility

      console.log("\n>>> The user's visibility polygon is from REFLECTED origin (723.56, 107.81)");
      console.log(">>> This is already AFTER reflecting through chain2-1");
      console.log(">>> The bug is in how the reflected polygon is computed");

      // The issue: when using the reported REFLECTED_ORIGIN with the FULL chain2-1 as window,
      // we get the CORRECT polygon with junction at (750, 250)
      // But the user's reported polygon has a HitPoint at (740.16, 259.84) instead
      // This means the actual window used was DIFFERENT from the full chain2-1
    });

    it("should investigate if the window is partial instead of full surface", () => {
      const chains = createChains();

      console.log("\n=== PARTIAL WINDOW INVESTIGATION ===");

      // What if the window extracted from Stage 1 is NOT the full chain2-1?
      // What if it's a partial segment that doesn't include the junction?

      // The user's polygon vertex (740.16, 259.84) is on chain2-1
      // Let's see what happens if the window is from that point to the endpoint
      
      const partialWindowStart = { x: 740.1561805768833, y: 259.8438194231166 };
      const windowEnd = CHAIN2_SURFACES[0]!.end; // (792.43, 292.43)

      console.log(`Testing partial window:`);
      console.log(`  Start: (${partialWindowStart.x.toFixed(4)}, ${partialWindowStart.y.toFixed(4)})`);
      console.log(`  End: (${windowEnd.x.toFixed(4)}, ${windowEnd.y.toFixed(4)})`);

      const cone = createConeThroughWindow(REFLECTED_ORIGIN, partialWindowStart, windowEnd);
      const sourcePoints = projectConeV2(cone, chainsWithScreen, "chain2-1");
      const vertices = toVector2Array(sourcePoints);

      console.log(`\nPolygon with partial window:`);
      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i]!;
        const sp = sourcePoints[i]!;
        console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)}) - ${getSourcePointInfo(sp)}`);
      }

      // Compare with user's expected polygon
      console.log("\n>>> User's expected polygon vertices:");
      console.log(">>>   (740.16, 259.84) - should be junction at (750, 250)");
      console.log(">>>   (788.22, 700)");
      console.log(">>>   (672.29, 700)");
      console.log(">>>   (707.57, 292.43)");
    });

    it("should check if boundary ray to junction is blocked by chain2-0", () => {
      const chains = createChains();

      console.log("\n=== RAY TO JUNCTION BLOCKED BY CHAIN2-0? ===");

      // The cone origin
      const origin = REFLECTED_ORIGIN;
      console.log(`Origin: (${origin.x.toFixed(4)}, ${origin.y.toFixed(4)})`);
      console.log(`Junction target: (750, 250)`);

      // The adjacent surface chain2-0: (707.57, 292.43) → (750, 250)
      const chain20Start = { x: 707.5735931288071, y: 292.42640687119285 };
      const chain20End = { x: 750, y: 250 };
      console.log(`\nchain2-0: (${chain20Start.x.toFixed(2)}, ${chain20Start.y.toFixed(2)}) → (${chain20End.x.toFixed(2)}, ${chain20End.y.toFixed(2)})`);

      // Ray direction from origin to junction
      const rayDir = { x: 750 - origin.x, y: 250 - origin.y };
      console.log(`Ray direction: (${rayDir.x.toFixed(4)}, ${rayDir.y.toFixed(4)})`);

      // Compute ray-segment intersection
      // Ray: origin + t * rayDir
      // Segment: chain20Start + s * (chain20End - chain20Start)
      const segDir = { x: chain20End.x - chain20Start.x, y: chain20End.y - chain20Start.y };
      
      // Cross products for intersection
      const denom = rayDir.x * segDir.y - rayDir.y * segDir.x;
      console.log(`\nDenominator (cross product): ${denom.toFixed(6)}`);

      if (Math.abs(denom) < 1e-10) {
        console.log("Ray and segment are parallel");
      } else {
        const diff = { x: chain20Start.x - origin.x, y: chain20Start.y - origin.y };
        const t = (diff.x * segDir.y - diff.y * segDir.x) / denom;
        const s = (diff.x * rayDir.y - diff.y * rayDir.x) / denom;

        console.log(`\nIntersection parameters:`);
        console.log(`  t (ray): ${t.toFixed(6)} (should be in [0, 1] for ray to junction)`);
        console.log(`  s (segment): ${s.toFixed(6)} (should be in [0, 1] for hit on chain2-0)`);

        if (t > 0 && t < 1 && s > 0 && s < 1) {
          const hitX = origin.x + t * rayDir.x;
          const hitY = origin.y + t * rayDir.y;
          console.log(`\n>>> HIT FOUND at (${hitX.toFixed(4)}, ${hitY.toFixed(4)})`);
          console.log(">>> The ray from origin to junction DOES hit chain2-0!");
          console.log(">>> This is why there's a HitPoint at (740.16, 259.84) instead of the junction");
        } else if (s > 0.99 && s < 1.01 && t > 0 && t < 1.01) {
          console.log("\n>>> Ray hits very close to junction end of chain2-0");
          console.log(">>> This is an edge case where the ray SHOULD reach the junction");
          console.log(">>> but floating point makes it hit chain2-0 just before");
        } else {
          console.log("\n>>> No intersection in valid range");
        }
      }

      // Now check: does projectConeV2 exclude chain2-0 from obstacles when projecting through chain2-1?
      console.log("\n--- Testing projectConeV2 behavior ---");

      // With full window (junction to endpoint)
      const fullCone = createConeThroughWindow(origin, { x: 750, y: 250 }, CHAIN2_SURFACES[0]!.end);
      const fullPolygon = projectConeV2(fullCone, chains, SCREEN_BOUNDS, "chain2-1");

      // Find the boundary point closest to junction
      console.log("\nFull cone polygon (junction as window boundary):");
      for (const sp of fullPolygon) {
        const xy = sp.computeXY();
        const distToJunction = Math.sqrt((xy.x - 750) ** 2 + (xy.y - 250) ** 2);
        if (distToJunction < 20) {
          console.log(`  (${xy.x.toFixed(4)}, ${xy.y.toFixed(4)}) - ${getSourcePointInfo(sp)} [dist=${distToJunction.toFixed(4)}]`);
        }
      }

      // Is there a HitPoint on chain2-0?
      const chain20Hit = fullPolygon.find(sp => {
        if (isHitPoint(sp) && sp.hitSurface.id === "chain2-0") {
          return true;
        }
        return false;
      });

      console.log(`\nHitPoint on chain2-0 in full cone polygon? ${chain20Hit ? "YES" : "NO"}`);
      if (chain20Hit && isHitPoint(chain20Hit)) {
        const xy = chain20Hit.computeXY();
        console.log(`  Location: (${xy.x.toFixed(4)}, ${xy.y.toFixed(4)})`);
        console.log(`  s parameter: ${chain20Hit.s.toFixed(6)}`);
        console.log("\n>>> BUG: chain2-0 should be excluded when projecting through chain2-1!");
        console.log(">>> The junction connects chain2-1 and chain2-0");
        console.log(">>> When the window boundary is at the junction, the adjacent surface");
        console.log(">>> should NOT block the boundary ray");
      }
    });
  });
});

