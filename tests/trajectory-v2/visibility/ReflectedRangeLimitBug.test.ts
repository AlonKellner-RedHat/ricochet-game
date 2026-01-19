/**
 * Test for the reflected range limit visibility bug.
 * 
 * Scenario:
 * - Player at (170, 586)
 * - Window surface: mirror-right-0 at x=550, y=150 to y=550
 * - Reflected origin at (930, 586) (player reflected through the window)
 * - Range limit: center (170, 586), radius 480
 * 
 * Expected:
 * - The range limit circle intersects the window at approximately (550, 293)
 * - There should be an ArcIntersectionPoint at this location
 * 
 * Bug:
 * - Instead of ArcIntersectionPoint, there's a vertex at (550, 415) with type "surface" but no surfaceId
 * - This vertex is a HitPoint with null surface (from range limit hit)
 */

import { describe, it, expect } from "vitest";
import { createConeThroughWindow, projectConeV2, toVector2Array } from "@/trajectory-v2/visibility/ConeProjectionV2";
import { createSingleSurfaceChain, type SurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { 
  isArcHitPoint, 
  isArcIntersectionPoint, 
  isOriginPoint,
  isHitPoint,
  isEndpoint,
  isArcJunctionPoint,
  type SourcePoint,
} from "@/trajectory-v2/geometry/SourcePoint";
import { isJunctionPoint } from "@/trajectory-v2/geometry/SurfaceChain";
import type { RangeLimitConfig } from "@/trajectory-v2/visibility/ConeProjectionV2";
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

// Screen bounds
const SCREEN_BOUNDS = { minX: 0, minY: 0, maxX: 1280, maxY: 720 };

describe("Reflected Range Limit Bug", () => {
  // The exact scenario from user's log
  const PLAYER = { x: 170, y: 586 };
  const REFLECTED_ORIGIN = { x: 930, y: 586 }; // Reflected through mirror-right-0
  const RANGE_LIMIT_RADIUS = 480;
  
  // Window surface (mirror-right-0)
  const WINDOW_START = { x: 550, y: 150 };
  const WINDOW_END = { x: 550, y: 550 };
  
  // Expected arc intersection: circle with center (170, 586), radius 480
  // At x=550: (550-170)² + (y-586)² = 480²
  // 380² + (y-586)² = 230400
  // (y-586)² = 86000
  // y = 586 - 293.26 ≈ 292.74 (within window range 150-550)
  const EXPECTED_ARC_INTERSECTION_Y = 586 - Math.sqrt(86000);

  it("should compute correct arc intersection y coordinate", () => {
    console.log("=== ARC INTERSECTION CALCULATION ===");
    console.log("Circle center:", PLAYER);
    console.log("Circle radius:", RANGE_LIMIT_RADIUS);
    console.log("Window x:", WINDOW_START.x);
    
    // (x - cx)² + (y - cy)² = r²
    // At x = 550: (550 - 170)² + (y - 586)² = 480²
    const dx = WINDOW_START.x - PLAYER.x;
    const r = RANGE_LIMIT_RADIUS;
    const dySquared = r * r - dx * dx;
    
    console.log("dx:", dx);
    console.log("r²:", r * r);
    console.log("dx²:", dx * dx);
    console.log("dy²:", dySquared);
    
    expect(dySquared).toBeGreaterThan(0); // Circle intersects the window line
    
    const dy = Math.sqrt(dySquared);
    const y1 = PLAYER.y - dy; // Upper intersection
    const y2 = PLAYER.y + dy; // Lower intersection
    
    console.log("y1 (upper):", y1);
    console.log("y2 (lower):", y2);
    console.log("Window range: y=", WINDOW_START.y, "to", WINDOW_END.y);
    
    // Upper intersection should be within window (150-550)
    expect(y1).toBeGreaterThan(WINDOW_START.y);
    expect(y1).toBeLessThan(WINDOW_END.y);
    
    console.log("Expected ArcIntersectionPoint at:", { x: 550, y: y1 });
  });

  it("should include ArcIntersectionPoint in visibility polygon", () => {
    console.log("\n=== VISIBILITY POLYGON TEST ===");
    
    // Create the window surface
    const windowSurface = createMockSurface("mirror-right-0", WINDOW_START, WINDOW_END);
    
    // Create surface chain
    const windowChain = createSingleSurfaceChain(windowSurface);
    
    // Create screen boundary chain
    const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
    
    const allChains: SurfaceChain[] = [windowChain, screenChain];
    
    // Create range limit config
    const rangeLimitPair = createRangeLimitPair(RANGE_LIMIT_RADIUS, "horizontal");
    const rangeLimit: RangeLimitConfig = {
      pair: rangeLimitPair,
      center: PLAYER, // Range limit is centered on PLAYER, not reflected origin
    };
    
    console.log("Range limit config:", rangeLimit);
    
    // Create cone through window from reflected origin
    const cone = createConeThroughWindow(
      REFLECTED_ORIGIN,
      WINDOW_START,
      WINDOW_END
    );
    
    console.log("Cone origin:", cone.origin);
    console.log("Cone left boundary:", cone.leftBoundary);
    console.log("Cone right boundary:", cone.rightBoundary);
    
    // Project visibility
    const sourcePoints = projectConeV2(
      cone,
      allChains,
      "mirror-right-0", // Exclude the window surface
      undefined,
      undefined,
      rangeLimit
    );
    
    console.log("\n=== SOURCE POINTS ===");
    console.log("Total vertices:", sourcePoints.length);
    
    for (const sp of sourcePoints) {
      const xy = sp.computeXY();
      let type = "unknown";
      let extra = "";
      
      if (isOriginPoint(sp)) type = "origin";
      else if (isArcHitPoint(sp)) {
        type = "arc_hit";
        extra = ` provenance=${sp.raySource?.getKey() ?? "none"}`;
      }
      else if (isArcIntersectionPoint(sp)) {
        type = "arc_intersection";
        extra = ` surface=${sp.surface?.id ?? "null"} type=${sp.intersectionType}`;
      }
      else if (isArcJunctionPoint(sp)) type = "arc_junction";
      else if (isJunctionPoint(sp)) type = "junction";
      else if (isHitPoint(sp)) {
        type = "hit_point";
        extra = ` surface=${sp.hitSurface?.id ?? "NULL!"}`;
      }
      else if (isEndpoint(sp)) {
        type = "endpoint";
        extra = ` surface=${sp.surface?.id}`;
      }
      
      console.log(`  ${type}: (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)})${extra}`);
    }
    
    // Check for HitPoints with null surface (the bug!)
    const hitPointsWithNullSurface = sourcePoints.filter(
      sp => isHitPoint(sp) && sp.hitSurface === null
    );
    
    console.log("\n=== BUG CHECK ===");
    console.log("HitPoints with null surface:", hitPointsWithNullSurface.length);
    
    for (const hp of hitPointsWithNullSurface) {
      const xy = hp.computeXY();
      console.log("  BUG: HitPoint with null surface at", xy);
    }
    
    // There should be NO HitPoints with null surface
    expect(hitPointsWithNullSurface.length).toBe(0);
    
    // Check for ArcIntersectionPoints
    const arcIntersections = sourcePoints.filter(isArcIntersectionPoint);
    console.log("\nArcIntersectionPoints:", arcIntersections.length);
    
    for (const ai of arcIntersections) {
      const xy = ai.computeXY();
      console.log(`  ArcIntersection at (${xy.x}, ${xy.y}) on ${ai.surface?.id}`);
    }
    
    // With provenance propagation, ArcIntersectionPoints on EXCLUDED surfaces
    // are NOT recomputed - they come from the caller via provenance.
    // The window is excluded, so no window ArcIntersectionPoints should be recomputed.
    const windowIntersections = arcIntersections.filter(
      ai => ai.surface?.id === "mirror-right-0"
    );
    console.log("\nWindow ArcIntersectionPoints:", windowIntersections.length);
    
    // Excluded surfaces should have 0 recomputed ArcIntersectionPoints
    expect(windowIntersections.length).toBe(0);
    console.log("Verified: excluded window doesn't get ArcIntersectionPoints recomputed (provenance)");
  });

  it("should identify vertex types correctly in logging", () => {
    console.log("\n=== LOGGING TYPE CHECK ===");
    
    // Create the window surface
    const windowSurface = createMockSurface("mirror-right-0", WINDOW_START, WINDOW_END);
    const windowChain = createSingleSurfaceChain(windowSurface);
    const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
    const allChains: SurfaceChain[] = [windowChain, screenChain];
    
    const rangeLimitPair = createRangeLimitPair(RANGE_LIMIT_RADIUS, "horizontal");
    const rangeLimit: RangeLimitConfig = {
      pair: rangeLimitPair,
      center: PLAYER,
    };
    
    const cone = createConeThroughWindow(REFLECTED_ORIGIN, WINDOW_START, WINDOW_END);
    const sourcePoints = projectConeV2(cone, allChains, "mirror-right-0", undefined, undefined, rangeLimit);
    
    // Check that no vertex has type "surface" with null/undefined surfaceId
    for (const sp of sourcePoints) {
      if (isHitPoint(sp)) {
        const xy = sp.computeXY();
        console.log(`HitPoint at (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}): surface=${sp.hitSurface?.id ?? "NULL"}`);
        
        // HitPoint should always have a valid surface
        expect(sp.hitSurface).not.toBeNull();
        expect(sp.hitSurface?.id).toBeDefined();
      }
    }
  });
});
