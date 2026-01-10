/**
 * Tests for SourceSegment Provenance Preservation
 *
 * Verifies that JunctionPoint, Endpoint, and HitPoint provenance is preserved
 * through the reflection cascade, enabling correct segment extraction on
 * adjacent surfaces.
 */

import { describe, it, expect } from "vitest";
import {
  createConeThroughWindow,
  createFullCone,
  projectConeV2,
  toVector2Array,
  type SourceSegment,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import {
  createMixedChain,
  createRicochetChain,
  createWallChain,
  isJunctionPoint,
  type SurfaceChain,
} from "@/trajectory-v2/geometry/SurfaceChain";
import {
  isEndpoint,
  isHitPoint,
  type SourcePoint,
} from "@/trajectory-v2/geometry/SourcePoint";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// Screen bounds
const SCREEN_BOUNDS = { minX: 0, minY: 0, maxX: 1280, maxY: 720 };

// V-chain (chain2) for testing junction provenance
// chain2-0: (707.57, 292.43) → (750, 250)
// chain2-1: (750, 250) → (792.43, 292.43)
// Junction at (750, 250)
function createVChain(): SurfaceChain {
  return createRicochetChain("chain2", [
    { x: 707.5735931288071, y: 292.42640687119285 },
    { x: 750, y: 250 },
    { x: 792.4264068711929, y: 292.42640687119285 },
  ]);
}

// Room chain for testing
function createRoomChain(): SurfaceChain {
  return createMixedChain(
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
}

// Helper to extract segment info from source points
function extractSourceSegments(
  targetSurfaceId: string,
  sourcePoints: readonly SourcePoint[]
): SourceSegment[] {
  const segments: SourceSegment[] = [];
  let currentRunStart: Vector2 | null = null;
  let currentRunEnd: Vector2 | null = null;
  let currentRunStartSource: SourcePoint | undefined = undefined;
  let currentRunEndSource: SourcePoint | undefined = undefined;

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
        currentRunStartSource = sp;
      }
      currentRunEnd = coords;
      currentRunEndSource = sp;
    } else {
      if (
        currentRunStart &&
        currentRunEnd &&
        (currentRunStart.x !== currentRunEnd.x || currentRunStart.y !== currentRunEnd.y)
      ) {
        segments.push({
          start: currentRunStart,
          end: currentRunEnd,
          startSource: currentRunStartSource,
          endSource: currentRunEndSource,
        });
      }
      currentRunStart = null;
      currentRunEnd = null;
      currentRunStartSource = undefined;
      currentRunEndSource = undefined;
    }
  }

  if (
    currentRunStart &&
    currentRunEnd &&
    (currentRunStart.x !== currentRunEnd.x || currentRunStart.y !== currentRunEnd.y)
  ) {
    segments.push({
      start: currentRunStart,
      end: currentRunEnd,
      startSource: currentRunStartSource,
      endSource: currentRunEndSource,
    });
  }

  return segments;
}

describe("createConeThroughWindow with SourcePoints", () => {
  it("should accept optional SourcePoint parameters for boundaries", () => {
    const vChain = createVChain();
    const roomChain = createRoomChain();
    const chains = [roomChain, vChain];

    // Get the junction point from the chain
    const junctionPoints = vChain.getJunctionPoints();
    expect(junctionPoints.length).toBe(1);
    const junction = junctionPoints[0]!;
    const junctionXY = junction.computeXY();

    console.log("\n=== createConeThroughWindow with SourcePoints ===");
    console.log(`Junction: (${junctionXY.x}, ${junctionXY.y})`);

    // Create cone with SourcePoints for boundaries
    const origin = { x: 750, y: 400 };
    const windowStart = { x: 750, y: 250 }; // junction
    const windowEnd = { x: 792.4264068711929, y: 292.42640687119285 }; // endpoint

    const cone = createConeThroughWindow(origin, windowStart, windowEnd, junction);

    console.log(`Cone leftBoundarySource: ${cone.leftBoundarySource?.type}`);
    console.log(`Cone rightBoundarySource: ${cone.rightBoundarySource?.type}`);

    // The junction should be preserved as a boundary source
    const hasJunctionSource = 
      (cone.leftBoundarySource && isJunctionPoint(cone.leftBoundarySource)) ||
      (cone.rightBoundarySource && isJunctionPoint(cone.rightBoundarySource));

    expect(hasJunctionSource).toBe(true);
  });

  it("should work without SourcePoints (backward compatibility)", () => {
    const origin = { x: 750, y: 400 };
    const windowStart = { x: 750, y: 250 };
    const windowEnd = { x: 792.4264068711929, y: 292.42640687119285 };

    // Call without SourcePoints
    const cone = createConeThroughWindow(origin, windowStart, windowEnd);

    // Should still work
    expect(cone.origin).toEqual(origin);
    expect(cone.startLine).toBeDefined();
    expect(cone.leftBoundarySource).toBeUndefined();
    expect(cone.rightBoundarySource).toBeUndefined();
  });
});

describe("projectConeV2 preserves SourcePoint provenance", () => {
  it("should preserve JunctionPoint in polygon when provided via ConeSource", () => {
    const vChain = createVChain();
    const roomChain = createRoomChain();
    const chains = [roomChain, vChain];

    // Get the junction point from the chain
    const junctionPoints = vChain.getJunctionPoints();
    expect(junctionPoints.length).toBe(1);
    const junction = junctionPoints[0]!;
    const junctionXY = junction.computeXY();

    // Get the endpoint from chain2-1
    const surfaces = vChain.getSurfaces();
    const chain21 = surfaces.find(s => s.id === "chain2-1")!;
    const endpointXY = chain21.segment.end;

    console.log("\n=== projectConeV2 preserves JunctionPoint ===");
    console.log(`Junction: (${junctionXY.x}, ${junctionXY.y})`);
    console.log(`Endpoint: (${endpointXY.x.toFixed(2)}, ${endpointXY.y.toFixed(2)})`);

    // Create cone with JunctionPoint as a boundary source
    const origin = { x: 750, y: 400 };
    const cone = createConeThroughWindow(
      origin,
      junctionXY,    // windowStart = junction
      endpointXY,    // windowEnd = endpoint
      junction       // windowStartSource = JunctionPoint
    );

    console.log(`Cone leftBoundarySource: ${cone.leftBoundarySource?.type}`);
    console.log(`Cone rightBoundarySource: ${cone.rightBoundarySource?.type}`);

    // Project the cone
    const sourcePoints = projectConeV2(cone, chains, SCREEN_BOUNDS, "chain2-1");

    console.log(`\nPolygon source points: ${sourcePoints.length}`);
    for (const sp of sourcePoints) {
      const xy = sp.computeXY();
      console.log(`  (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) - ${sp.type}`);
    }

    // Find the JunctionPoint in the polygon
    const junctionInPolygon = sourcePoints.find(sp => isJunctionPoint(sp));

    console.log(`\nJunctionPoint preserved in polygon: ${junctionInPolygon !== undefined}`);

    // The JunctionPoint should be in the polygon (not replaced by OriginPoint)
    expect(junctionInPolygon).toBeDefined();
    expect(isJunctionPoint(junctionInPolygon!)).toBe(true);

    // Verify it's at the right position
    const jpXY = junctionInPolygon!.computeXY();
    expect(jpXY.x).toBeCloseTo(750, 1);
    expect(jpXY.y).toBeCloseTo(250, 1);
  });

  it("should still work without SourcePoints (creates OriginPoints)", () => {
    const vChain = createVChain();
    const roomChain = createRoomChain();
    const chains = [roomChain, vChain];

    // Create cone WITHOUT SourcePoints
    const origin = { x: 750, y: 400 };
    const windowStart = { x: 750, y: 250 };
    const windowEnd = { x: 792.4264068711929, y: 292.42640687119285 };
    const cone = createConeThroughWindow(origin, windowStart, windowEnd);

    // Project the cone
    const sourcePoints = projectConeV2(cone, chains, SCREEN_BOUNDS, "chain2-1");

    console.log("\n=== projectConeV2 without SourcePoints ===");
    console.log(`Polygon source points: ${sourcePoints.length}`);

    // Should have OriginPoints at window boundaries
    const originPoints = sourcePoints.filter(sp => sp.type === "origin");
    console.log(`OriginPoints in polygon: ${originPoints.length}`);

    // Should have 2 OriginPoints (window boundaries)
    expect(originPoints.length).toBe(2);
  });
});

describe("SourceSegment Provenance Preservation", () => {
  describe("extractSourceSegments preserves JunctionPoint provenance", () => {
    it("should preserve JunctionPoint when extracting segments on V-chain", () => {
      const vChain = createVChain();
      const roomChain = createRoomChain();
      const chains = [roomChain, vChain];

      // Player position that can see the V-chain junction
      const player = { x: 750, y: 400 };

      // Get player visibility
      const cone = createFullCone(player);
      const sourcePoints = projectConeV2(cone, chains, SCREEN_BOUNDS);

      // Extract segments on chain2-0
      const chain20Segments = extractSourceSegments("chain2-0", sourcePoints);

      console.log("\n=== V-Chain Segment Extraction ===");
      console.log(`Segments on chain2-0: ${chain20Segments.length}`);
      for (const seg of chain20Segments) {
        console.log(`  Start: (${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}) - ${seg.startSource?.type}`);
        console.log(`  End: (${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)}) - ${seg.endSource?.type}`);
      }

      // At least one segment should exist
      expect(chain20Segments.length).toBeGreaterThan(0);

      // Check if any segment has JunctionPoint provenance
      const hasJunctionProvenance = chain20Segments.some(
        seg => seg.startSource && isJunctionPoint(seg.startSource) ||
               seg.endSource && isJunctionPoint(seg.endSource)
      );

      console.log(`\nHas JunctionPoint provenance: ${hasJunctionProvenance}`);

      // The junction at (750, 250) should be preserved
      const junctionSegment = chain20Segments.find(seg => {
        const endIsJunction = seg.endSource && isJunctionPoint(seg.endSource);
        if (endIsJunction) {
          const xy = seg.endSource!.computeXY();
          return Math.abs(xy.x - 750) < 0.01 && Math.abs(xy.y - 250) < 0.01;
        }
        return false;
      });

      expect(junctionSegment).toBeDefined();
      expect(junctionSegment?.endSource).toBeDefined();
      expect(isJunctionPoint(junctionSegment!.endSource!)).toBe(true);
    });

    it("should preserve Endpoint provenance when extracting segments", () => {
      const vChain = createVChain();
      const roomChain = createRoomChain();
      const chains = [roomChain, vChain];

      // Player position that can see the V-chain endpoint
      const player = { x: 750, y: 400 };

      // Get player visibility
      const cone = createFullCone(player);
      const sourcePoints = projectConeV2(cone, chains, SCREEN_BOUNDS);

      // Extract segments on chain2-0
      const chain20Segments = extractSourceSegments("chain2-0", sourcePoints);

      // The start of chain2-0 (707.57, 292.43) should be an Endpoint
      const endpointSegment = chain20Segments.find(seg => {
        if (seg.startSource && isEndpoint(seg.startSource)) {
          const xy = seg.startSource.computeXY();
          return Math.abs(xy.x - 707.57) < 0.5 && Math.abs(xy.y - 292.43) < 0.5;
        }
        return false;
      });

      console.log("\n=== Endpoint Provenance ===");
      if (endpointSegment) {
        console.log(`Found Endpoint at start of segment`);
        console.log(`  Type: ${endpointSegment.startSource?.type}`);
      }

      expect(endpointSegment).toBeDefined();
      expect(endpointSegment?.startSource).toBeDefined();
      expect(isEndpoint(endpointSegment!.startSource!)).toBe(true);
    });

    it("should include HitPoints in segment runs", () => {
      const vChain = createVChain();
      const roomChain = createRoomChain();
      const chains = [roomChain, vChain];

      // Player position where ray hits chain2 at a non-endpoint
      const player = { x: 600, y: 400 };

      // Get player visibility
      const cone = createFullCone(player);
      const sourcePoints = projectConeV2(cone, chains, SCREEN_BOUNDS);

      // Find HitPoints on chain2
      const hitPoints = sourcePoints.filter(sp => 
        isHitPoint(sp) && sp.hitSurface.id.startsWith("chain2")
      );

      console.log("\n=== HitPoint in Segments ===");
      console.log(`HitPoints on chain2: ${hitPoints.length}`);

      // Extract segments - HitPoints should contribute to segment runs
      // even if they're not at the boundaries
      const chain21Segments = extractSourceSegments("chain2-1", sourcePoints);
      
      console.log(`Segments on chain2-1: ${chain21Segments.length}`);
      for (const seg of chain21Segments) {
        console.log(`  Start: (${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}) - ${seg.startSource?.type}`);
        console.log(`  End: (${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)}) - ${seg.endSource?.type}`);
      }

      // The key test: segment extraction should produce valid segments
      // that cover the visible portion of the surface
      expect(chain21Segments.length).toBeGreaterThan(0);
    });
  });

  describe("JunctionPoint recognized on both adjacent surfaces", () => {
    it("should recognize junction on chain2-0 (before surface)", () => {
      const vChain = createVChain();
      const roomChain = createRoomChain();
      const chains = [roomChain, vChain];

      const player = { x: 750, y: 400 };
      const cone = createFullCone(player);
      const sourcePoints = projectConeV2(cone, chains, SCREEN_BOUNDS);

      // Find the junction at (750, 250)
      const junctionPoint = sourcePoints.find(sp => {
        if (isJunctionPoint(sp)) {
          const xy = sp.computeXY();
          return Math.abs(xy.x - 750) < 0.01 && Math.abs(xy.y - 250) < 0.01;
        }
        return false;
      });

      expect(junctionPoint).toBeDefined();
      expect(isJunctionPoint(junctionPoint!)).toBe(true);

      // Verify junction is on chain2-0
      if (isJunctionPoint(junctionPoint!)) {
        const beforeSurface = junctionPoint.getSurfaceBefore();
        const afterSurface = junctionPoint.getSurfaceAfter();

        console.log("\n=== Junction Surface Connections ===");
        console.log(`Before: ${beforeSurface?.id}`);
        console.log(`After: ${afterSurface?.id}`);

        const isOnChain20 = beforeSurface?.id === "chain2-0" || afterSurface?.id === "chain2-0";
        const isOnChain21 = beforeSurface?.id === "chain2-1" || afterSurface?.id === "chain2-1";

        expect(isOnChain20).toBe(true);
        expect(isOnChain21).toBe(true);
      }
    });

    it("should include junction in segments for BOTH adjacent surfaces", () => {
      const vChain = createVChain();
      const roomChain = createRoomChain();
      const chains = [roomChain, vChain];

      const player = { x: 750, y: 400 };
      const cone = createFullCone(player);
      const sourcePoints = projectConeV2(cone, chains, SCREEN_BOUNDS);

      // Extract segments on both surfaces
      const chain20Segments = extractSourceSegments("chain2-0", sourcePoints);
      const chain21Segments = extractSourceSegments("chain2-1", sourcePoints);

      console.log("\n=== Junction in Both Surfaces ===");
      console.log(`Segments on chain2-0: ${chain20Segments.length}`);
      console.log(`Segments on chain2-1: ${chain21Segments.length}`);

      // Junction should be found in segments for both surfaces
      const junctionInChain20 = chain20Segments.some(seg => {
        if (seg.endSource && isJunctionPoint(seg.endSource)) {
          const xy = seg.endSource.computeXY();
          return Math.abs(xy.x - 750) < 0.01 && Math.abs(xy.y - 250) < 0.01;
        }
        return false;
      });

      const junctionInChain21 = chain21Segments.some(seg => {
        if (seg.startSource && isJunctionPoint(seg.startSource)) {
          const xy = seg.startSource.computeXY();
          return Math.abs(xy.x - 750) < 0.01 && Math.abs(xy.y - 250) < 0.01;
        }
        return false;
      });

      console.log(`Junction in chain2-0 segments: ${junctionInChain20}`);
      console.log(`Junction in chain2-1 segments: ${junctionInChain21}`);

      expect(junctionInChain20).toBe(true);
      expect(junctionInChain21).toBe(true);
    });
  });
});

