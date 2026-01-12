/**
 * ContinuationRay Dedup Debug Test
 *
 * Reproduces the issue where processed and raw polygons have the same vertices
 * in the wall-with-gap scene at position (581, 81).
 */

import { describe, it, expect } from "vitest";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { createFullCone, projectConeV2 } from "@/trajectory-v2/visibility/ConeProjectionV2";
import { dedupeConsecutiveHits } from "@/trajectory-v2/visibility/RenderingDedup";
import {
  createRicochetChain,
  createWallChain,
  isJunctionPoint,
} from "@/trajectory-v2/geometry/SurfaceChain";
import { isEndpoint, isHitPoint, getSurfaceId } from "@/trajectory-v2/geometry/SourcePoint";

const SCREEN_BOUNDS = { minX: 0, maxX: 1280, minY: 0, maxY: 720 };
const PLAYER = { x: 581, y: 81 };

// Wall-with-gap scene
const chains = [
  createRicochetChain("target", [
    { x: 500, y: 200 },
    { x: 700, y: 200 },
  ]),
  createWallChain("wall-left", [
    { x: 300, y: 400 },
    { x: 550, y: 400 },
  ]),
  createWallChain("wall-right", [
    { x: 650, y: 400 },
    { x: 900, y: 400 },
  ]),
];

const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
const allChains = [...chains, screenChain];

describe("ContinuationRay Dedup Issue", () => {
  it("should reproduce the issue: raw and processed have same vertex count", () => {
    const source = createFullCone(PLAYER);
    const sourcePoints = projectConeV2(source, allChains);

    const processedPoints = dedupeConsecutiveHits(sourcePoints);

    console.log("\n=== RAW POLYGON ===");
    console.log(`Total vertices: ${sourcePoints.length}`);
    for (let i = 0; i < sourcePoints.length; i++) {
      const sp = sourcePoints[i];
      if (!sp) continue;
      const xy = sp.computeXY();
      const type = isEndpoint(sp) ? "Endpoint" : isHitPoint(sp) ? "HitPoint" : isJunctionPoint(sp) ? "JunctionPoint" : "OriginPoint";
      const surfaceId = getSurfaceId(sp) ?? "N/A";
      const rayId = sp.continuationRay?.id ?? "none";
      console.log(`  [${i}] ${type}[${surfaceId}] (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) ray=${rayId}`);
    }

    console.log("\n=== PROCESSED POLYGON ===");
    console.log(`Total vertices: ${processedPoints.length}`);
    for (let i = 0; i < processedPoints.length; i++) {
      const sp = processedPoints[i];
      if (!sp) continue;
      const xy = sp.computeXY();
      const type = isEndpoint(sp) ? "Endpoint" : isHitPoint(sp) ? "HitPoint" : isJunctionPoint(sp) ? "JunctionPoint" : "OriginPoint";
      const surfaceId = getSurfaceId(sp) ?? "N/A";
      const rayId = sp.continuationRay?.id ?? "none";
      console.log(`  [${i}] ${type}[${surfaceId}] (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) ray=${rayId}`);
    }

    console.log("\n=== ANALYSIS ===");
    console.log(`Raw: ${sourcePoints.length} vertices`);
    console.log(`Processed: ${processedPoints.length} vertices`);
    
    // This is the issue: they should be different, but they're the same
    // This test documents the bug
    if (processedPoints.length === sourcePoints.length) {
      console.log("\n!!! BUG: No deduplication occurred !!!");
      
      // Let's analyze WHY no deduplication occurred
      console.log("\n=== HYPOTHESIS: continuationRay not assigned ===");
      let pointsWithRay = 0;
      let pointsWithoutRay = 0;
      for (const sp of sourcePoints) {
        if (sp.continuationRay) {
          pointsWithRay++;
        } else {
          pointsWithoutRay++;
        }
      }
      console.log(`Points with continuationRay: ${pointsWithRay}`);
      console.log(`Points without continuationRay: ${pointsWithoutRay}`);
      
      // Check consecutive surface runs
      console.log("\n=== HYPOTHESIS: No consecutive same-surface runs ===");
      let consecutiveSurfaceRuns = 0;
      for (let i = 0; i < sourcePoints.length - 1; i++) {
        const s1 = sourcePoints[i]!;
        const s2 = sourcePoints[i + 1]!;
        const id1 = getSurfaceId(s1);
        const id2 = getSurfaceId(s2);
        if (id1 && id2 && id1 === id2) {
          consecutiveSurfaceRuns++;
          console.log(`  [${i}]-[${i+1}] same surface: ${id1}`);
        }
      }
      console.log(`Total consecutive same-surface pairs: ${consecutiveSurfaceRuns}`);
      
      // Check consecutive ray runs
      console.log("\n=== HYPOTHESIS: No consecutive same-ray runs ===");
      let consecutiveRayRuns = 0;
      for (let i = 0; i < sourcePoints.length - 1; i++) {
        const s1 = sourcePoints[i]!;
        const s2 = sourcePoints[i + 1]!;
        const ray1 = s1.continuationRay?.id;
        const ray2 = s2.continuationRay?.id;
        if (ray1 && ray2 && ray1 === ray2) {
          consecutiveRayRuns++;
          console.log(`  [${i}]-[${i+1}] same ray: ${ray1}`);
        }
      }
      console.log(`Total consecutive same-ray pairs: ${consecutiveRayRuns}`);
    }

    // This is the failing assertion - we EXPECT deduplication to reduce vertices
    expect(processedPoints.length).toBeLessThan(sourcePoints.length);
  });

  it("should verify continuationRay is being assigned", () => {
    const source = createFullCone(PLAYER);
    const sourcePoints = projectConeV2(source, allChains);

    // Count points with and without continuationRay
    const withRay = sourcePoints.filter(sp => sp.continuationRay !== undefined);
    const withoutRay = sourcePoints.filter(sp => sp.continuationRay === undefined);

    console.log("\n=== CONTINUATION RAY ASSIGNMENT ===");
    console.log(`Points with continuationRay: ${withRay.length}`);
    for (const sp of withRay) {
      const xy = sp.computeXY();
      const type = isEndpoint(sp) ? "Endpoint" : isHitPoint(sp) ? "HitPoint" : "Other";
      const surfaceId = getSurfaceId(sp) ?? "N/A";
      console.log(`  ${type}[${surfaceId}] (${xy.x.toFixed(0)}, ${xy.y.toFixed(0)}) ray=${sp.continuationRay!.id}`);
    }

    console.log(`\nPoints without continuationRay: ${withoutRay.length}`);
    for (const sp of withoutRay) {
      const xy = sp.computeXY();
      const type = isEndpoint(sp) ? "Endpoint" : isHitPoint(sp) ? "HitPoint" : "Other";
      const surfaceId = getSurfaceId(sp) ?? "N/A";
      console.log(`  ${type}[${surfaceId}] (${xy.x.toFixed(0)}, ${xy.y.toFixed(0)})`);
    }

    // We expect SOME points to have continuationRay assigned
    expect(withRay.length).toBeGreaterThan(0);
  });

  it("HYPOTHESIS: castContinuationRay does NOT track passed-through endpoints", () => {
    console.log("\n======================================================================");
    console.log("HYPOTHESIS TEST: castContinuationRay missing passed-through tracking");
    console.log("======================================================================");

    const source = createFullCone(PLAYER);
    const sourcePoints = projectConeV2(source, allChains);

    // Find the specific points we care about
    const targetEnd = sourcePoints.find(sp => 
      isEndpoint(sp) && getSurfaceId(sp) === "target-0" && 
      sp.computeXY().x === 700 && sp.computeXY().y === 200
    );
    const wallRightEnd = sourcePoints.find(sp =>
      isEndpoint(sp) && getSurfaceId(sp) === "wall-right-0"
    );
    
    console.log("\nPoints under investigation:");
    console.log(`  Endpoint[target-0] (700, 200): ray=${targetEnd?.continuationRay?.id ?? "NONE"}`);
    console.log(`  Endpoint[wall-right-0] (900, 400): ray=${wallRightEnd?.continuationRay?.id ?? "NONE"}`);

    console.log("\nEXPECTED BEHAVIOR:");
    console.log("  1. Ray from origin to Endpoint[target-0] (700, 200)");
    console.log("  2. Continuation ray from (700, 200) through Endpoint[wall-right-0] (900, 400)");
    console.log("  3. Continuation ray hits screen at ~(1220, 720)");
    console.log("  4. ALL THREE POINTS should share the same continuationRay");

    console.log("\nACTUAL BEHAVIOR:");
    console.log(`  Endpoint[target-0] (700, 200): ray=${targetEnd?.continuationRay?.id ?? "NONE"}`);
    console.log(`  Endpoint[wall-right-0] (900, 400): ray=${wallRightEnd?.continuationRay?.id ?? "NONE"}`);

    console.log("\n======================================================================");
    console.log("ROOT CAUSE IDENTIFIED");
    console.log("======================================================================");
    console.log("\nLOCATION: src/trajectory-v2/visibility/ConeProjectionV2.ts");
    console.log("FUNCTION: castContinuationRay (line ~603)");
    console.log("\nISSUE: The castContinuationRay function does NOT track passed-through");
    console.log("       endpoints. It only returns the final hit, not the endpoints it");
    console.log("       passed through to get there.");
    console.log("\nCOMPARISON:");
    console.log("  castRayToEndpoint: DOES track passedThroughEndpoints (line ~458)");
    console.log("  castContinuationRay: does NOT track passedThroughEndpoints");
    console.log("\nFIX NEEDED:");
    console.log("  castContinuationRay should return a result type that includes");
    console.log("  passedThroughEndpoints, just like castRayToEndpoint does.");
    console.log("======================================================================");

    // FIXED: Both endpoints now share the same continuation ray
    expect(targetEnd?.continuationRay).toBeDefined();
    expect(wallRightEnd?.continuationRay).toBeDefined();
    expect(targetEnd?.continuationRay?.id).toBe(wallRightEnd?.continuationRay?.id);
  });
});
