/**
 * Test for the cone boundary ArcHitPoint bug.
 * 
 * Issue: When a windowed cone has boundary rays that exceed the range limit,
 * the boundary hits should be converted to ArcHitPoints. Previously, the
 * castRayToTarget function for cone boundaries did not respect range limits.
 */

import { describe, it, expect } from "vitest";
import { 
  createConeThroughWindow, 
  projectConeV2, 
  type RangeLimitConfig 
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { createSingleSurfaceChain, type SurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { 
  isArcHitPoint, 
  isOriginPoint,
  isHitPoint,
  isEndpoint,
  isArcIntersectionPoint,
  isArcJunctionPoint,
  type SourcePoint,
} from "@/trajectory-v2/geometry/SourcePoint";
import { isJunctionPoint } from "@/trajectory-v2/geometry/SurfaceChain";
import { createRangeLimitPair } from "@/trajectory-v2/obstacles/RangeLimit";
import type { Surface } from "@/surfaces/Surface";

// Create a mock surface
function createMockSurface(
  id: string, 
  start: { x: number; y: number }, 
  end: { x: number; y: number },
  canReflect = true
): Surface {
  return {
    id,
    segment: { start, end },
    canReflectFrom: () => canReflect,
    getNormal: () => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      return { x: -dy / len, y: dx / len };
    },
    isValidReflectionPoint: () => true,
  } as Surface;
}

const SCREEN_BOUNDS = { minX: 0, minY: 0, maxX: 1280, maxY: 720 };

describe("Cone Boundary ArcHitPoint Bug", () => {
  // User's scenario
  const PLAYER = { x: 187.85, y: 586 };
  const REFLECTED_ORIGIN = { x: 912.15, y: 586 };
  const RANGE_LIMIT_RADIUS = 480;
  
  // Visible window portion (from Stage 1)
  const WINDOW_START = { x: 550, y: 376.23 }; // HitPoint from Stage 1
  const WINDOW_END = { x: 550, y: 550 }; // Endpoint
  
  it("should create ArcHitPoint for left boundary ray when it exceeds range limit", () => {
    console.log("=== CONE BOUNDARY RANGE LIMIT TEST ===");
    
    // Create just the window surface
    const windowSurface = createMockSurface("mirror-right-0", { x: 550, y: 150 }, { x: 550, y: 550 });
    const windowChain = createSingleSurfaceChain(windowSurface);
    const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
    const allChains: SurfaceChain[] = [windowChain, screenChain];
    
    // Stage 2 uses reflected origin as range limit center
    const rangeLimitPair = createRangeLimitPair(RANGE_LIMIT_RADIUS, "horizontal");
    const rangeLimit: RangeLimitConfig = {
      pair: rangeLimitPair,
      center: REFLECTED_ORIGIN, // Stage 2 uses reflected origin
    };
    
    console.log("Origin:", REFLECTED_ORIGIN);
    console.log("Window:", WINDOW_START, "to", WINDOW_END);
    console.log("Range limit center:", rangeLimit.center);
    console.log("Range limit radius:", RANGE_LIMIT_RADIUS);
    
    // Create cone through the visible window portion
    const cone = createConeThroughWindow(
      REFLECTED_ORIGIN,
      WINDOW_START,
      WINDOW_END
    );
    
    console.log("Cone left boundary:", cone.leftBoundary);
    console.log("Cone right boundary:", cone.rightBoundary);
    
    const sourcePoints = projectConeV2(
      cone,
      allChains,
      "mirror-right-0", // Exclude window
      undefined,
      undefined,
      rangeLimit
    );
    
    console.log("\nTotal vertices:", sourcePoints.length);
    
    const arcHitPoints: SourcePoint[] = [];
    for (const sp of sourcePoints) {
      const xy = sp.computeXY();
      let type = "unknown";
      let extra = "";
      
      if (isOriginPoint(sp)) type = "origin";
      else if (isArcHitPoint(sp)) {
        type = "arc_hit";
        extra = ` provenance=${sp.raySource?.getKey() ?? "none"}`;
        arcHitPoints.push(sp);
      }
      else if (isArcIntersectionPoint(sp)) type = "arc_intersection";
      else if (isArcJunctionPoint(sp)) type = "arc_junction";
      else if (isJunctionPoint(sp)) type = "junction";
      else if (isHitPoint(sp)) {
        type = "hit_point";
        extra = ` surface=${sp.hitSurface?.id}`;
      }
      else if (isEndpoint(sp)) type = "endpoint";
      
      console.log(`  ${type}: (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)})${extra}`);
    }
    
    console.log("\nArcHitPoints:", arcHitPoints.length);
    
    // With the fix, we should have ArcHitPoints for BOTH cone boundaries
    // (continuation from window end AND continuation from window start)
    expect(arcHitPoints.length).toBeGreaterThanOrEqual(2);
    
    // Check provenance - should have arc hits from both window boundaries
    const provenances = arcHitPoints.map(ah => 
      isArcHitPoint(ah) ? ah.raySource?.getKey() : null
    );
    console.log("ArcHitPoint provenances:", provenances);
  });

  it("should include ArcHitPoints for both cone boundaries in user scenario", () => {
    console.log("\n=== USER SCENARIO WITH BLOCKING ===");
    
    // Create all relevant surfaces
    const surfaces: Surface[] = [
      createMockSurface("room-0", { x: 20, y: 80 }, { x: 1260, y: 80 }),
      createMockSurface("room-1", { x: 1260, y: 80 }, { x: 1260, y: 700 }, false),
      createMockSurface("room-2", { x: 1260, y: 700 }, { x: 20, y: 700 }, false),
      createMockSurface("room-3", { x: 20, y: 700 }, { x: 20, y: 80 }),
      createMockSurface("mirror-left-0", { x: 250, y: 550 }, { x: 250, y: 150 }),
      createMockSurface("mirror-right-0", { x: 550, y: 150 }, { x: 550, y: 550 }),
    ];
    
    const chains: SurfaceChain[] = surfaces.map(s => createSingleSurfaceChain(s));
    const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
    chains.push(screenChain);
    
    const rangeLimitPair = createRangeLimitPair(RANGE_LIMIT_RADIUS, "horizontal");
    const rangeLimit: RangeLimitConfig = {
      pair: rangeLimitPair,
      center: REFLECTED_ORIGIN,
    };
    
    // Simulate partial window visibility (as if blocked by mirror-left-0)
    // The actual window start would be around y=376 (a HitPoint)
    const cone = createConeThroughWindow(
      REFLECTED_ORIGIN,
      WINDOW_START, // Simulated partial window
      WINDOW_END
    );
    
    const sourcePoints = projectConeV2(
      cone,
      chains,
      "mirror-right-0",
      undefined,
      undefined,
      rangeLimit
    );
    
    console.log("Total vertices:", sourcePoints.length);
    
    const arcHitPoints = sourcePoints.filter(isArcHitPoint);
    console.log("ArcHitPoints:", arcHitPoints.length);
    
    for (const ah of arcHitPoints) {
      const xy = ah.computeXY();
      console.log(`  arc_hit at (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) from ${ah.raySource?.getKey()}`);
    }
    
    // Both boundaries should produce arc hits
    expect(arcHitPoints.length).toBeGreaterThanOrEqual(2);
  });
});
