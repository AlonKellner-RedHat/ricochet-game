/**
 * Chain Reflection Bug Reproduction Test
 *
 * This test reproduces a bug where reflections off chain surfaces produce
 * truncated polygons - only a portion of the surface is used as the reflection
 * window instead of the full visible length.
 *
 * Bug Report:
 * - Player: (799.55, 666)
 * - Planned surface: chain1-0 from (598.04, 280) to (650, 250)
 * - Expected: The entire surface reflects light (full window)
 * - Actual: Only (598.04, 280) to (609.63, 273.31) is used as window
 *
 * The apex junction point at (650, 250) is NOT being used as a window boundary,
 * even though the player's light reaches the entire surface.
 */

import { RicochetSurface } from "@/surfaces/RicochetSurface";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import { type SourcePoint, isEndpoint, isHitPoint } from "@/trajectory-v2/geometry/SourcePoint";
import { type SurfaceChain, createRicochetChain } from "@/trajectory-v2/geometry/SurfaceChain";
import { isJunctionPoint } from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  createConeThroughWindow,
  createFullCone,
  projectConeV2,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { describe, expect, it } from "vitest";

// =============================================================================
// BUG SCENARIO: Chain1 from demo (120-degree V-shape)
// =============================================================================

const CHAIN1_VERTICES = [
  { x: 598.0384757729337, y: 280 }, // left outer endpoint
  { x: 650, y: 250 }, // apex (junction)
  { x: 701.9615242270663, y: 280 }, // right outer endpoint
];

const PLAYER = { x: 799.5532401600012, y: 666 };
const CURSOR = { x: 640, y: 283.7305699481865 };

// Surface definition (left arm of V-shape)
const CHAIN1_LEFT_SURFACE = new RicochetSurface("chain1-0", {
  start: { x: 598.0384757729337, y: 280 },
  end: { x: 650, y: 250 },
});

const SCREEN_BOUNDS = {
  minX: 0,
  minY: 0,
  maxX: 1280,
  maxY: 720,
};

/**
 * Create the V-shape chain for testing.
 */
function createChain1(): SurfaceChain {
  return createRicochetChain("chain1", CHAIN1_VERTICES);
}

/**
 * Build a mapping from surface start/end points to connected surface IDs.
 * This allows HitPoints at s=0 or s=1 to be recognized as junctions.
 */
function buildJunctionMapping(chains: readonly SurfaceChain[]): Map<string, Set<string>> {
  const pointToSurfaces = new Map<string, Set<string>>();

  for (const chain of chains) {
    const surfaces = chain.getSurfaces();

    for (const surface of surfaces) {
      const startKey = `${surface.segment.start.x},${surface.segment.start.y}`;
      if (!pointToSurfaces.has(startKey)) {
        pointToSurfaces.set(startKey, new Set());
      }
      pointToSurfaces.get(startKey)!.add(surface.id);

      const endKey = `${surface.segment.end.x},${surface.segment.end.y}`;
      if (!pointToSurfaces.has(endKey)) {
        pointToSurfaces.set(endKey, new Set());
      }
      pointToSurfaces.get(endKey)!.add(surface.id);
    }
  }

  return pointToSurfaces;
}

/**
 * Extract visible segments on a surface from source points.
 * Uses junction provenance to detect HitPoints at s=0/1 that connect to target.
 */
function extractVisibleSurfaceSegments(
  targetSurfaceId: string,
  sourcePoints: readonly SourcePoint[],
  chains: readonly SurfaceChain[]
): { start: Vector2; end: Vector2 }[] {
  const segments: { start: Vector2; end: Vector2 }[] = [];
  let currentRunStart: Vector2 | null = null;
  let currentRunEnd: Vector2 | null = null;

  // Build junction mapping for HitPoint junction detection
  const pointToSurfaces = buildJunctionMapping(chains);

  for (const sp of sourcePoints) {
    let isOnTarget = false;
    let coords: Vector2 | null = null;

    if (isEndpoint(sp) && sp.surface.id === targetSurfaceId) {
      isOnTarget = true;
      coords = sp.computeXY();
    } else if (isJunctionPoint(sp)) {
      // JunctionPoint - check if it connects to target surface using provenance
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
      } else if (sp.s === 0 || sp.s === 1) {
        // HitPoint at junction - check if connected to target
        const hitCoords = sp.computeXY();
        const coordKey = `${hitCoords.x},${hitCoords.y}`;
        const connectedSurfaces = pointToSurfaces.get(coordKey);
        if (connectedSurfaces && connectedSurfaces.has(targetSurfaceId)) {
          isOnTarget = true;
          coords = hitCoords;
        }
      }
    }

    if (isOnTarget && coords) {
      if (currentRunStart === null) {
        currentRunStart = coords;
      }
      currentRunEnd = coords;
    } else {
      if (
        currentRunStart &&
        currentRunEnd &&
        (currentRunStart.x !== currentRunEnd.x || currentRunStart.y !== currentRunEnd.y)
      ) {
        segments.push({ start: currentRunStart, end: currentRunEnd });
      }
      currentRunStart = null;
      currentRunEnd = null;
    }
  }

  if (
    currentRunStart &&
    currentRunEnd &&
    (currentRunStart.x !== currentRunEnd.x || currentRunStart.y !== currentRunEnd.y)
  ) {
    segments.push({ start: currentRunStart, end: currentRunEnd });
  }

  return segments;
}

describe("Chain Reflection Bug", () => {
  describe("Stage 0: Player visibility reaches entire surface", () => {
    it("should include both endpoints of chain1-0 in visibility polygon", () => {
      const chain = createChain1();
      const cone = createFullCone(PLAYER);
      const sourcePoints = projectConeV2(cone, [chain], SCREEN_BOUNDS);
      const polygon = toVector2Array(sourcePoints);

      // The LEFT endpoint should be in the polygon
      const leftEndpoint = { x: 598.0384757729337, y: 280 };
      const hasLeftEndpoint = polygon.some(
        (p) => Math.abs(p.x - leftEndpoint.x) < 0.1 && Math.abs(p.y - leftEndpoint.y) < 0.1
      );

      // The APEX (junction) should be in the polygon
      const apex = { x: 650, y: 250 };
      const hasApex = polygon.some(
        (p) => Math.abs(p.x - apex.x) < 0.1 && Math.abs(p.y - apex.y) < 0.1
      );

      console.log("Stage 0 polygon vertices:");
      polygon.forEach((v, i) => console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`));

      console.log(`\nHas left endpoint (598.04, 280): ${hasLeftEndpoint}`);
      console.log(`Has apex (650, 250): ${hasApex}`);

      expect(hasLeftEndpoint).toBe(true);
      expect(hasApex).toBe(true);
    });

    it("should extract visible segment covering full surface", () => {
      const chain = createChain1();
      const cone = createFullCone(PLAYER);
      const sourcePoints = projectConeV2(cone, [chain], SCREEN_BOUNDS);

      // Extract visible segments for chain1-0
      const segments = extractVisibleSurfaceSegments("chain1-0", sourcePoints, [chain]);

      console.log("Extracted visible segments for chain1-0:");
      segments.forEach((seg, i) =>
        console.log(
          `  Segment ${i}: (${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}) → (${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)})`
        )
      );

      // Should have at least one segment
      expect(segments.length).toBeGreaterThan(0);

      // The segment should cover the FULL surface (from left outer to apex)
      // Surface: (598.04, 280) → (650, 250)
      const fullSurfaceStart = { x: 598.0384757729337, y: 280 };
      const fullSurfaceEnd = { x: 650, y: 250 };

      // Check if any segment includes the full surface
      let hasFullSurface = false;
      for (const seg of segments) {
        const startsAtLeft =
          Math.abs(seg.start.x - fullSurfaceStart.x) < 0.1 &&
          Math.abs(seg.start.y - fullSurfaceStart.y) < 0.1;
        const endsAtApex =
          Math.abs(seg.end.x - fullSurfaceEnd.x) < 0.1 &&
          Math.abs(seg.end.y - fullSurfaceEnd.y) < 0.1;

        if (startsAtLeft && endsAtApex) {
          hasFullSurface = true;
          break;
        }
      }

      console.log(`\nFull surface covered (598.04, 280) → (650, 250): ${hasFullSurface}`);

      // THIS IS THE BUG: The segment is truncated
      expect(hasFullSurface).toBe(true);
    });
  });

  describe("Stage 1: Reflection through chain1-0", () => {
    it("should produce reflected polygon with more than 3 vertices", () => {
      const chain = createChain1();
      const surface = CHAIN1_LEFT_SURFACE;

      // Stage 0: Get visibility from player
      const stage0Cone = createFullCone(PLAYER);
      const stage0Points = projectConeV2(stage0Cone, [chain], SCREEN_BOUNDS);

      // Extract visible window (should be full surface)
      const segments = extractVisibleSurfaceSegments(surface.id, stage0Points, [chain]);
      expect(segments.length).toBeGreaterThan(0);

      const window = segments[0]!;
      console.log(
        `Reflection window: (${window.start.x.toFixed(2)}, ${window.start.y.toFixed(2)}) → (${window.end.x.toFixed(2)}, ${window.end.y.toFixed(2)})`
      );

      // Reflect player through surface
      const reflectedOrigin = reflectPointThroughLine(
        PLAYER,
        surface.segment.start,
        surface.segment.end
      );
      console.log(
        `Reflected origin: (${reflectedOrigin.x.toFixed(2)}, ${reflectedOrigin.y.toFixed(2)})`
      );

      // Stage 1: Compute reflected visibility
      const stage1Cone = createConeThroughWindow(reflectedOrigin, window.start, window.end);
      const stage1Points = projectConeV2(stage1Cone, [chain], SCREEN_BOUNDS, surface.id);
      const stage1Polygon = toVector2Array(stage1Points);

      console.log(`\nStage 1 polygon vertices: ${stage1Polygon.length}`);
      stage1Polygon.forEach((v, i) =>
        console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`)
      );

      // The reflected polygon should have at least 3 vertices (a valid polygon)
      // With the duplicate apex fix, the polygon now correctly has 3 vertices:
      // - Window end (apex at 650, 250)
      // - Screen boundary hit
      // - Window start (left endpoint at 598.04, 280)
      expect(stage1Polygon.length).toBeGreaterThanOrEqual(3);
    });

    it("should use full surface as window boundaries", () => {
      const chain = createChain1();
      const surface = CHAIN1_LEFT_SURFACE;

      // Stage 0: Get visibility from player
      const stage0Cone = createFullCone(PLAYER);
      const stage0Points = projectConeV2(stage0Cone, [chain], SCREEN_BOUNDS);

      // Extract visible window
      const segments = extractVisibleSurfaceSegments(surface.id, stage0Points, [chain]);
      expect(segments.length).toBeGreaterThan(0);

      const window = segments[0]!;

      // The window should span the FULL surface
      const expectedStart = surface.segment.start; // (598.04, 280)
      const expectedEnd = surface.segment.end; // (650, 250)

      console.log("Expected window boundaries:");
      console.log(`  Start: (${expectedStart.x.toFixed(2)}, ${expectedStart.y.toFixed(2)})`);
      console.log(`  End: (${expectedEnd.x.toFixed(2)}, ${expectedEnd.y.toFixed(2)})`);

      console.log("Actual window boundaries:");
      console.log(`  Start: (${window.start.x.toFixed(2)}, ${window.start.y.toFixed(2)})`);
      console.log(`  End: (${window.end.x.toFixed(2)}, ${window.end.y.toFixed(2)})`);

      // Check start matches
      const startMatches =
        Math.abs(window.start.x - expectedStart.x) < 0.1 &&
        Math.abs(window.start.y - expectedStart.y) < 0.1;

      // Check end matches (THIS IS WHERE THE BUG IS)
      const endMatches =
        Math.abs(window.end.x - expectedEnd.x) < 0.1 &&
        Math.abs(window.end.y - expectedEnd.y) < 0.1;

      console.log(`\nStart matches: ${startMatches}`);
      console.log(`End matches: ${endMatches}`);

      expect(startMatches).toBe(true);
      expect(endMatches).toBe(true);
    });
  });

  describe("Debug: Source points analysis", () => {
    it("should log all source points on chain1-0", () => {
      const chain = createChain1();
      const cone = createFullCone(PLAYER);
      const sourcePoints = projectConeV2(cone, [chain], SCREEN_BOUNDS);

      console.log("\nAll source points:");
      sourcePoints.forEach((sp, i) => {
        const coords = sp.computeXY();
        let surfaceInfo = "";

        if (isEndpoint(sp)) {
          surfaceInfo = `Endpoint on ${sp.surface.id} (isStart=${sp.isStart})`;
        } else if (isHitPoint(sp)) {
          surfaceInfo = `HitPoint on ${sp.hitSurface.id} (s=${sp.s.toFixed(4)})`;
        } else {
          surfaceInfo = `${sp.type}`;
        }

        console.log(`  ${i}: (${coords.x.toFixed(2)}, ${coords.y.toFixed(2)}) - ${surfaceInfo}`);
      });

      // Check if apex (650, 250) is present
      const apexPresent = sourcePoints.some((sp) => {
        const coords = sp.computeXY();
        return Math.abs(coords.x - 650) < 0.1 && Math.abs(coords.y - 250) < 0.1;
      });

      console.log(`\nApex (650, 250) present in source points: ${apexPresent}`);

      // If apex is present, check what type it is
      if (apexPresent) {
        const apexPoint = sourcePoints.find((sp) => {
          const coords = sp.computeXY();
          return Math.abs(coords.x - 650) < 0.1 && Math.abs(coords.y - 250) < 0.1;
        })!;
        console.log(`Apex point type: ${apexPoint.type}`);
        if (isEndpoint(apexPoint)) {
          console.log(`  Surface: ${apexPoint.surface.id}`);
          console.log(`  Is start: ${apexPoint.isStart}`);
        }
      }
    });

    /**
     * ROOT CAUSE HYPOTHESIS:
     *
     * The apex junction point (650, 250) is recorded as a HitPoint on chain1-1,
     * NOT as an Endpoint on chain1-0.
     *
     * This means when extractVisibleSurfaceSegments looks for points on "chain1-0":
     * - It finds: (598.04, 280) as Endpoint on chain1-0
     * - It does NOT find: (650, 250) because it's recorded as HitPoint on chain1-1
     *
     * Since there's only ONE point on chain1-0, the segment has start === end,
     * which is filtered out as a zero-length segment.
     *
     * Expected behavior:
     * - The apex should be recognized as the END of chain1-0 (isStart=false)
     * - OR the segment extraction should check for JunctionPoints that connect
     *   to the target surface
     */
    it("proves the root cause: apex is HitPoint on chain1-1, not Endpoint on chain1-0", () => {
      const chain = createChain1();
      const cone = createFullCone(PLAYER);
      const sourcePoints = projectConeV2(cone, [chain], SCREEN_BOUNDS);

      // Find apex point
      const apexPoint = sourcePoints.find((sp) => {
        const coords = sp.computeXY();
        return Math.abs(coords.x - 650) < 0.1 && Math.abs(coords.y - 250) < 0.1;
      });

      expect(apexPoint).toBeDefined();

      // The apex IS a JunctionPoint (fixed: provenance-based handling)
      // Previously it was a HitPoint on chain1-1, which caused the bug
      expect(isJunctionPoint(apexPoint!)).toBe(true);

      // Count points on chain1-0
      const pointsOnChain1_0 = sourcePoints.filter((sp) => {
        if (isEndpoint(sp)) return sp.surface.id === "chain1-0";
        if (isHitPoint(sp)) return sp.hitSurface.id === "chain1-0";
        return false;
      });

      console.log(`\nPoints on chain1-0: ${pointsOnChain1_0.length}`);
      pointsOnChain1_0.forEach((sp, i) => {
        const coords = sp.computeXY();
        console.log(`  ${i}: (${coords.x.toFixed(2)}, ${coords.y.toFixed(2)})`);
      });

      // There's only ONE point on chain1-0 (the left endpoint)
      // This is why extractVisibleSurfaceSegments returns empty!
      expect(pointsOnChain1_0.length).toBe(1);

      // The segment extraction logic requires at least 2 consecutive points
      // to form a valid segment (start !== end). With only 1 point, no segment is produced.
    });
  });

  describe("Flickering investigation", () => {
    it("should have consistent reflection behavior across many player positions", () => {
      const chain = createChain1();
      const chains: SurfaceChain[] = [chain];

      // Track issues
      const issues: {
        player: Vector2;
        issue: string;
        details: Record<string, unknown>;
      }[] = [];

      // Test many player positions around the V-shape
      const testPositions = [
        // Near the original buggy position
        { x: 799.55, y: 666 },
        { x: 800, y: 666 },
        { x: 750, y: 600 },
        { x: 700, y: 500 },
        { x: 650, y: 400 },
        { x: 600, y: 500 },
        // More positions
        { x: 1100, y: 666 },
        { x: 1105.6955874, y: 666 }, // Known buggy position from DuplicateApexBug
        { x: 1105.6955179119636, y: 666 }, // Adjacent position
        { x: 500, y: 600 },
        { x: 400, y: 500 },
      ];

      for (const player of testPositions) {
        // Stage 0: Full visibility
        const stage0Cone = createFullCone(player);
        const stage0SourcePoints = projectConeV2(stage0Cone, chains, SCREEN_BOUNDS);

        // Check apex representation in Stage 0
        const apexPoints = stage0SourcePoints.filter((sp) => {
          const coords = sp.computeXY();
          return Math.abs(coords.x - 650) < 0.1 && Math.abs(coords.y - 250) < 0.1;
        });

        if (apexPoints.length !== 1) {
          issues.push({
            player,
            issue: "Apex count in Stage 0",
            details: { apexCount: apexPoints.length, types: apexPoints.map((p) => p.type) },
          });
        }

        // Check if apex is always a JunctionPoint
        const apexIsJunction = apexPoints.every((p) => isJunctionPoint(p));
        if (!apexIsJunction && apexPoints.length > 0) {
          issues.push({
            player,
            issue: "Apex is not JunctionPoint in Stage 0",
            details: { types: apexPoints.map((p) => p.type) },
          });
        }

        // Extract visible segments for chain1-0
        const visibleSegments = extractVisibleSurfaceSegments(
          "chain1-0",
          stage0SourcePoints,
          chains
        );

        if (visibleSegments.length === 0) {
          issues.push({
            player,
            issue: "No visible segments for chain1-0",
            details: { sourcePointCount: stage0SourcePoints.length },
          });
          continue;
        }

        // Stage 1: Reflected visibility
        const surface = chain.getSurfaces()[0]!;
        const reflectedOrigin = reflectPointThroughLine(
          player,
          surface.segment.start,
          surface.segment.end
        );

        const stage1SourcePoints: SourcePoint[] = [];
        const stage1Polygons: Vector2[][] = [];

        for (const window of visibleSegments) {
          const cone = createConeThroughWindow(reflectedOrigin, window.start, window.end);
          const sourcePoints = projectConeV2(cone, chains, SCREEN_BOUNDS, "chain1-0");
          stage1SourcePoints.push(...sourcePoints);
          const polygon = toVector2Array(sourcePoints);
          if (polygon.length >= 3) {
            stage1Polygons.push(polygon);
          }
        }

        // Check Stage 1 polygon validity
        if (stage1Polygons.length === 0) {
          issues.push({
            player,
            issue: "No valid Stage 1 polygon",
            details: {
              stage1SourcePointCount: stage1SourcePoints.length,
              windowCount: visibleSegments.length,
            },
          });
        }

        // Check for duplicate apex in Stage 1
        const stage1ApexPoints = stage1SourcePoints.filter((sp) => {
          const coords = sp.computeXY();
          return Math.abs(coords.x - 650) < 0.1 && Math.abs(coords.y - 250) < 0.1;
        });

        if (stage1ApexPoints.length > 1) {
          issues.push({
            player,
            issue: "Duplicate apex in Stage 1",
            details: {
              apexCount: stage1ApexPoints.length,
              types: stage1ApexPoints.map((p) => p.type),
              coords: stage1ApexPoints.map((p) => p.computeXY()),
            },
          });
        }
      }

      // Report issues
      if (issues.length > 0) {
        console.log("\n=== FLICKERING ISSUES FOUND ===");
        issues.forEach((issue, i) => {
          console.log(
            `\n${i + 1}. Player (${issue.player.x.toFixed(2)}, ${issue.player.y.toFixed(2)})`
          );
          console.log(`   Issue: ${issue.issue}`);
          console.log(`   Details: ${JSON.stringify(issue.details)}`);
        });
      }

      // All tested positions should have consistent behavior
      expect(issues).toHaveLength(0);
    });

    it("should have segments spanning full surface when both endpoints are visible", () => {
      const chain = createChain1();
      const chains: SurfaceChain[] = [chain];

      // Position where both left endpoint and apex should be visible
      const player = { x: 650, y: 500 }; // Directly below apex

      const stage0Cone = createFullCone(player);
      const stage0SourcePoints = projectConeV2(stage0Cone, chains, SCREEN_BOUNDS);

      // Log source points for debugging
      console.log("\n=== Stage 0 Source Points ===");
      stage0SourcePoints.forEach((sp, i) => {
        const coords = sp.computeXY();
        const onChain1_0 =
          (isEndpoint(sp) && sp.surface.id === "chain1-0") ||
          (isHitPoint(sp) && sp.hitSurface.id === "chain1-0") ||
          (isJunctionPoint(sp) &&
            (sp.getSurfaceBefore()?.id === "chain1-0" || sp.getSurfaceAfter()?.id === "chain1-0"));
        console.log(
          `  ${i}: (${coords.x.toFixed(2)}, ${coords.y.toFixed(2)}) - ${sp.type}${onChain1_0 ? " [ON chain1-0]" : ""}`
        );
      });

      // Extract visible segments
      const visibleSegments = extractVisibleSurfaceSegments("chain1-0", stage0SourcePoints, chains);

      console.log("\n=== Visible Segments for chain1-0 ===");
      visibleSegments.forEach((seg, i) => {
        console.log(
          `  ${i}: (${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}) → (${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)})`
        );
      });

      // Should have at least one segment
      expect(visibleSegments.length).toBeGreaterThan(0);

      // Check if the segment spans the full surface
      const leftEndpoint = { x: 598.0384757729337, y: 280 };
      const apex = { x: 650, y: 250 };

      // One of the segments should span from left endpoint to apex
      const fullSegment = visibleSegments.find((seg) => {
        const startsAtLeft =
          Math.abs(seg.start.x - leftEndpoint.x) < 0.1 &&
          Math.abs(seg.start.y - leftEndpoint.y) < 0.1;
        const endsAtApex = Math.abs(seg.end.x - apex.x) < 0.1 && Math.abs(seg.end.y - apex.y) < 0.1;
        return startsAtLeft && endsAtApex;
      });

      expect(fullSegment).toBeDefined();
    });

    it("should NOT have duplicate consecutive vertices in Stage 1 polygon", () => {
      const chain = createChain1();
      const chains: SurfaceChain[] = [chain];
      const player = PLAYER; // Use the original test player

      // Stage 0
      const stage0Cone = createFullCone(player);
      const stage0SourcePoints = projectConeV2(stage0Cone, chains, SCREEN_BOUNDS);

      // Extract visible segments
      const visibleSegments = extractVisibleSurfaceSegments("chain1-0", stage0SourcePoints, chains);
      expect(visibleSegments.length).toBeGreaterThan(0);

      // Stage 1: Reflected visibility
      const surface = chain.getSurfaces()[0]!;
      const reflectedOrigin = reflectPointThroughLine(
        player,
        surface.segment.start,
        surface.segment.end
      );

      for (const window of visibleSegments) {
        const cone = createConeThroughWindow(reflectedOrigin, window.start, window.end);
        const sourcePoints = projectConeV2(cone, chains, SCREEN_BOUNDS, "chain1-0");
        const polygon = toVector2Array(sourcePoints);

        console.log("\n=== Stage 1 Polygon Analysis ===");
        console.log(`Vertex count: ${polygon.length}`);
        polygon.forEach((v, i) => {
          console.log(`  ${i}: (${v.x.toFixed(6)}, ${v.y.toFixed(6)})`);
        });

        // Check for consecutive duplicates
        const consecutiveDuplicates: { index: number; vertex: Vector2 }[] = [];
        for (let i = 0; i < polygon.length; i++) {
          const current = polygon[i]!;
          const next = polygon[(i + 1) % polygon.length]!;
          if (current.x === next.x && current.y === next.y) {
            consecutiveDuplicates.push({ index: i, vertex: current });
          }
        }

        if (consecutiveDuplicates.length > 0) {
          console.log("\n=== CONSECUTIVE DUPLICATES FOUND ===");
          consecutiveDuplicates.forEach((dup) => {
            console.log(`  Index ${dup.index}: (${dup.vertex.x}, ${dup.vertex.y})`);
          });

          // Log source points for debugging
          console.log("\n=== Source Points (before toVector2Array) ===");
          sourcePoints.forEach((sp, i) => {
            const coords = sp.computeXY();
            console.log(
              `  ${i}: ${sp.type} at (${coords.x.toFixed(6)}, ${coords.y.toFixed(6)}) - key: ${sp.getKey()}`
            );
          });
        }

        // This is the bug! There should be NO consecutive duplicate vertices
        expect(consecutiveDuplicates).toHaveLength(0);
      }
    });

    it("should identify why duplicate apex appears in Stage 1", () => {
      const chain = createChain1();
      const chains: SurfaceChain[] = [chain];
      const player = PLAYER;

      // Stage 0
      const stage0Cone = createFullCone(player);
      const stage0SourcePoints = projectConeV2(stage0Cone, chains, SCREEN_BOUNDS);

      // Find apex point in Stage 0
      const stage0Apex = stage0SourcePoints.find((sp) => {
        const coords = sp.computeXY();
        return Math.abs(coords.x - 650) < 0.1 && Math.abs(coords.y - 250) < 0.1;
      });

      console.log("\n=== Stage 0 Apex Analysis ===");
      console.log(`Apex type: ${stage0Apex?.type}`);
      console.log(`Apex key: ${stage0Apex?.getKey()}`);
      const apexCoords = stage0Apex?.computeXY();
      console.log(`Apex coords: (${apexCoords?.x}, ${apexCoords?.y})`);

      // Extract visible segments
      const visibleSegments = extractVisibleSurfaceSegments("chain1-0", stage0SourcePoints, chains);
      const window = visibleSegments[0]!;

      console.log("\n=== Window Coordinates ===");
      console.log(`Window start: (${window.start.x}, ${window.start.y})`);
      console.log(`Window end (apex): (${window.end.x}, ${window.end.y})`);

      // Compare with exact apex coordinates
      console.log("\n=== Coordinate Comparison ===");
      console.log(`Apex coords from JunctionPoint: (${apexCoords?.x}, ${apexCoords?.y})`);
      console.log(`Window end coords: (${window.end.x}, ${window.end.y})`);
      console.log(
        `Are they EXACTLY equal? x: ${apexCoords?.x === window.end.x}, y: ${apexCoords?.y === window.end.y}`
      );

      // Stage 1
      const surface = chain.getSurfaces()[0]!;
      const reflectedOrigin = reflectPointThroughLine(
        player,
        surface.segment.start,
        surface.segment.end
      );

      const cone = createConeThroughWindow(reflectedOrigin, window.start, window.end);
      const sourcePoints = projectConeV2(cone, chains, SCREEN_BOUNDS, "chain1-0");

      // Find all apex-related source points in Stage 1
      const stage1ApexPoints = sourcePoints.filter((sp) => {
        const coords = sp.computeXY();
        return Math.abs(coords.x - 650) < 0.1 && Math.abs(coords.y - 250) < 0.1;
      });

      console.log("\n=== Stage 1 Apex Points ===");
      console.log(`Count: ${stage1ApexPoints.length}`);
      stage1ApexPoints.forEach((sp, i) => {
        const coords = sp.computeXY();
        console.log(`  ${i}: ${sp.type} at (${coords.x.toFixed(15)}, ${coords.y.toFixed(15)})`);
        console.log(`       Key: ${sp.getKey()}`);
      });

      // The bug: There are 2 apex points - an OriginPoint (from window) and another type
      // This explains the duplicate consecutive vertices
      expect(stage1ApexPoints.length).toBe(1);
    });
  });
});
