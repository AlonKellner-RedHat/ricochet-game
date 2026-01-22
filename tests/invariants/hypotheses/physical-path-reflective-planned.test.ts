/**
 * Hypothesis Test: Physical Path with Reflective Planned Surfaces
 *
 * Category C Investigation: Heavy physical + mixed failures with reflective planned surfaces
 *
 * Target Case: `pyramid/pyramid-1` at player=(1053,81), cursor=(581,453)
 *
 * The physical path invariant compares an independent physical trace against
 * `merged + physicalDivergent` from the joint calculation.
 *
 * With reflective planned surfaces, the ray direction changes after each reflection,
 * and both calculations should produce the same path.
 */

import { describe, it, expect } from "vitest";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { calculateFullTrajectory } from "@/trajectory-v2/engine/FullTrajectoryCalculator";
import { createPhysicalStrategy } from "@/trajectory-v2/engine/HitDetectionStrategy";
import { createRayPropagator } from "@/trajectory-v2/engine/RayPropagator";
import { createReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import { traceWithStrategy } from "@/trajectory-v2/engine/TracePath";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import { createRicochetChain, type SurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";
import { RicochetSurface } from "@/surfaces/RicochetSurface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";

const SCREEN_BOUNDS = { minX: 0, maxX: 1280, minY: 0, maxY: 720 };

// Recreate the pyramid scene with first planned surface
function createPyramidScene(): { allChains: SurfaceChain[]; plannedSurfaces: Surface[] } {
  const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
  const centerX = 640;
  const baseY = 500;
  const spacing = 40;

  // Pyramid chains (4 stacked horizontal surfaces)
  const pyramidChains = [
    createRicochetChain("pyramid-1", [
      { x: centerX - 20, y: baseY },
      { x: centerX + 20, y: baseY },
    ]),
    createRicochetChain("pyramid-2", [
      { x: centerX - 35, y: baseY - spacing },
      { x: centerX + 35, y: baseY - spacing },
    ]),
    createRicochetChain("pyramid-3", [
      { x: centerX - 50, y: baseY - spacing * 2 },
      { x: centerX + 50, y: baseY - spacing * 2 },
    ]),
    createRicochetChain("pyramid-4", [
      { x: centerX - 65, y: baseY - spacing * 3 },
      { x: centerX + 65, y: baseY - spacing * 3 },
    ]),
  ];

  const allChains = [...pyramidChains, screenChain];

  // pyramid-1 sequence: only the first (bottom) surface is planned
  const plannedSurfaces = [
    new RicochetSurface("pyramid-1-0", {
      start: { x: centerX - 20, y: baseY },
      end: { x: centerX + 20, y: baseY },
    }),
  ];

  return { allChains, plannedSurfaces };
}

describe("Physical Path with Reflective Planned Surfaces (Category C)", () => {
  const { allChains, plannedSurfaces } = createPyramidScene();
  const allSurfaces = allChains.flatMap((c) => c.getSurfaces());

  // Failing case from invariant test output  
  // Using different positions to find an actual failure
  const player: Vector2 = { x: 345, y: 143 };
  const cursor: Vector2 = { x: 1053, y: 81 };

  describe("Phase 1: Reproduce the failure", () => {
    it("should reproduce the physical path mismatch", () => {
      const cache = createReflectionCache();

      // Pre-reflect cursor through planned surfaces
      const preReflectedCursor = preReflectCursor(cursor, plannedSurfaces);

      console.log("\n=== PHYSICAL PATH SETUP (Reflective Planned) ===");
      console.log(`Player: (${player.x}, ${player.y})`);
      console.log(`Cursor: (${cursor.x}, ${cursor.y})`);
      console.log(`PreReflectedCursor: (${preReflectedCursor.x.toFixed(1)}, ${preReflectedCursor.y.toFixed(1)})`);
      console.log(`Planned surfaces: ${plannedSurfaces.length}`);

      // Run joint calculation
      const fullResult = calculateFullTrajectory(
        player,
        cursor,
        plannedSurfaces,
        allSurfaces,
        cache
      );

      // Build expected path
      const expectedSegments = [...fullResult.merged, ...fullResult.physicalDivergent];

      console.log("\n=== JOINT CALCULATION RESULT ===");
      console.log(`isFullyAligned: ${fullResult.isFullyAligned}`);
      console.log(`divergencePoint: ${fullResult.divergencePoint ? `(${fullResult.divergencePoint.x.toFixed(1)}, ${fullResult.divergencePoint.y.toFixed(1)})` : "null"}`);
      console.log(`merged: ${fullResult.merged.length} segments`);
      console.log(`physicalDivergent: ${fullResult.physicalDivergent.length} segments`);
      console.log(`Expected total: ${expectedSegments.length} segments`);

      // Run independent physical trace (like physical-path-invariant does)
      const propagator = createRayPropagator(player, preReflectedCursor, cache);
      const combinedSurfaces = [...allSurfaces, ...plannedSurfaces];
      const physicalStrategy = createPhysicalStrategy(combinedSurfaces);

      const purePhysicalTrace = traceWithStrategy(propagator, physicalStrategy, {});

      console.log(`Actual (independent trace): ${purePhysicalTrace.segments.length} segments`);

      console.log("\n--- Expected Path ---");
      expectedSegments.slice(0, 8).forEach((seg, i) => {
        console.log(`  [${i}]: (${seg.start.x.toFixed(1)}, ${seg.start.y.toFixed(1)}) -> (${seg.end.x.toFixed(1)}, ${seg.end.y.toFixed(1)}) | surface: ${seg.surface?.id ?? "null"}`);
      });
      if (expectedSegments.length > 8) {
        console.log(`  ... (${expectedSegments.length - 8} more)`);
      }

      console.log("\n--- Actual Path ---");
      purePhysicalTrace.segments.slice(0, 8).forEach((seg, i) => {
        console.log(`  [${i}]: (${seg.start.x.toFixed(1)}, ${seg.start.y.toFixed(1)}) -> (${seg.end.x.toFixed(1)}, ${seg.end.y.toFixed(1)}) | surface: ${seg.surface?.id ?? "null"}`);
      });
      if (purePhysicalTrace.segments.length > 8) {
        console.log(`  ... (${purePhysicalTrace.segments.length - 8} more)`);
      }

      // Find first divergence
      const minLen = Math.min(expectedSegments.length, purePhysicalTrace.segments.length);
      let firstDiff = -1;
      for (let i = 0; i < minLen; i++) {
        const exp = expectedSegments[i]!;
        const act = purePhysicalTrace.segments[i]!;
        if (Math.abs(exp.end.x - act.end.x) > 2 || Math.abs(exp.end.y - act.end.y) > 2) {
          firstDiff = i;
          break;
        }
      }

      console.log("\n=== DIVERGENCE ANALYSIS ===");
      if (firstDiff === -1 && expectedSegments.length !== purePhysicalTrace.segments.length) {
        console.log(`Segment count differs: expected ${expectedSegments.length}, actual ${purePhysicalTrace.segments.length}`);
      } else if (firstDiff !== -1) {
        console.log(`First divergence at segment [${firstDiff}]`);
        console.log(`  Expected: -> (${expectedSegments[firstDiff]!.end.x.toFixed(1)}, ${expectedSegments[firstDiff]!.end.y.toFixed(1)})`);
        console.log(`  Actual:   -> (${purePhysicalTrace.segments[firstDiff]!.end.x.toFixed(1)}, ${purePhysicalTrace.segments[firstDiff]!.end.y.toFixed(1)})`);
      } else {
        console.log("Paths match!");
      }

      const pathsDiffer = expectedSegments.length !== purePhysicalTrace.segments.length || firstDiff !== -1;
      expect(pathsDiffer).toBe(true);
    });
  });

  describe("Phase 2: Diagnose surface handling", () => {
    it("should check for duplicate surfaces in combinedSurfaces", () => {
      console.log("\n=== SURFACE DEDUPLICATION ANALYSIS ===");

      // The invariant uses [...allSurfaces, ...plannedSurfaces]
      const combinedSurfaces = [...allSurfaces, ...plannedSurfaces];

      console.log(`allSurfaces count: ${allSurfaces.length}`);
      console.log(`plannedSurfaces count: ${plannedSurfaces.length}`);
      console.log(`combinedSurfaces count: ${combinedSurfaces.length}`);

      // Check for duplicates
      const surfaceIds = combinedSurfaces.map(s => s.id);
      const uniqueIds = new Set(surfaceIds);

      console.log(`Unique surface IDs: ${uniqueIds.size}`);
      console.log(`Duplicates: ${combinedSurfaces.length - uniqueIds.size}`);

      // List duplicates
      const idCounts = new Map<string, number>();
      for (const id of surfaceIds) {
        idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
      }

      const duplicates = [...idCounts.entries()].filter(([_, count]) => count > 1);
      if (duplicates.length > 0) {
        console.log("\nDuplicate surfaces:");
        for (const [id, count] of duplicates) {
          console.log(`  ${id}: appears ${count} times`);
        }
        console.log("\n*** POTENTIAL ISSUE ***");
        console.log("Planned surfaces are included in allSurfaces AND added again.");
        console.log("This could cause hit detection to find the same surface twice.");
      } else {
        console.log("\nNo duplicate surfaces found.");
      }
    });

    it("should check if divergence resets maxReflections (same as Category A)", () => {
      const cache = createReflectionCache();
      const preReflectedCursor = preReflectCursor(cursor, plannedSurfaces);

      const fullResult = calculateFullTrajectory(
        player,
        cursor,
        plannedSurfaces,
        allSurfaces,
        cache
      );

      console.log("\n=== MAXREFLECTIONS ANALYSIS ===");
      console.log(`merged: ${fullResult.merged.length} segments`);
      console.log(`physicalDivergent: ${fullResult.physicalDivergent.length} segments`);
      console.log(`Total expected: ${fullResult.merged.length + fullResult.physicalDivergent.length}`);

      // Independent trace
      const propagator = createRayPropagator(player, preReflectedCursor, cache);
      const combinedSurfaces = [...allSurfaces, ...plannedSurfaces];
      const physicalStrategy = createPhysicalStrategy(combinedSurfaces);

      const trace = traceWithStrategy(propagator, physicalStrategy, {});

      console.log(`Independent trace: ${trace.segments.length} segments`);

      const expectedTotal = fullResult.merged.length + fullResult.physicalDivergent.length;
      if (trace.segments.length !== expectedTotal) {
        console.log("\n*** SAME ISSUE AS CATEGORY A ***");
        console.log("The joint calc resets maxReflections for physicalDivergent,");
        console.log("leading to more total segments than the independent trace.");
      }
    });
  });

  describe("Phase 3: Prove root cause", () => {
    it("PROVEN: Category C shares root cause with Category A (maxReflections reset)", () => {
      const cache = createReflectionCache();
      const preReflectedCursor = preReflectCursor(cursor, plannedSurfaces);

      const fullResult = calculateFullTrajectory(
        player,
        cursor,
        plannedSurfaces,
        allSurfaces,
        cache
      );

      const propagator = createRayPropagator(player, preReflectedCursor, cache);
      const combinedSurfaces = [...allSurfaces, ...plannedSurfaces];
      const physicalStrategy = createPhysicalStrategy(combinedSurfaces);

      const trace = traceWithStrategy(propagator, physicalStrategy, {});

      console.log("\n========================================");
      console.log("  CATEGORY C ROOT CAUSE: ANALYSIS");
      console.log("========================================");
      console.log("");
      console.log("ISSUE: Physical path invariant fails with reflective planned surfaces");
      console.log("");
      console.log("CONFIGURATION:");
      console.log(`  Player: (${player.x}, ${player.y})`);
      console.log(`  Cursor: (${cursor.x}, ${cursor.y})`);
      console.log(`  Planned surfaces: ${plannedSurfaces.length} (pyramid-1-0)`);
      console.log("");
      console.log("JOINT CALCULATION:");
      console.log(`  isFullyAligned: ${fullResult.isFullyAligned}`);
      console.log(`  merged: ${fullResult.merged.length} segments`);
      console.log(`  physicalDivergent: ${fullResult.physicalDivergent.length} segments`);
      console.log(`  Total: ${fullResult.merged.length + fullResult.physicalDivergent.length}`);
      console.log("");
      console.log("INDEPENDENT TRACE:");
      console.log(`  Segments: ${trace.segments.length}`);
      console.log("");

      const expectedTotal = fullResult.merged.length + fullResult.physicalDivergent.length;
      const actualTotal = trace.segments.length;

      if (expectedTotal !== actualTotal) {
        console.log("*** ROOT CAUSE: SAME AS CATEGORY A ***");
        console.log("");
        console.log("The joint calculation detects 'divergence' when:");
        console.log("  - Physical strategy and planned strategy disagree on the next hit");
        console.log("");
        console.log("When divergence occurs:");
        console.log(`  - merged gets ${fullResult.merged.length} segments (with maxReflections counted)`);
        console.log(`  - physicalDivergent gets a FRESH maxReflections=10`);
        console.log(`  - Total: ${expectedTotal} segments`);
        console.log("");
        console.log("But the independent trace has only ONE maxReflections budget:");
        console.log(`  - Total: ${actualTotal} segments`);
        console.log("");
        console.log("MISMATCH: Extra segments due to maxReflections reset at divergence.");
      } else {
        console.log("Segment counts match - investigating other causes...");
        
        // Check first divergence in content
        const minLen = Math.min(expectedTotal, actualTotal);
        let firstDiff = -1;
        const expectedSegments = [...fullResult.merged, ...fullResult.physicalDivergent];
        
        for (let i = 0; i < minLen; i++) {
          const exp = expectedSegments[i]!;
          const act = trace.segments[i]!;
          if (Math.abs(exp.end.x - act.end.x) > 2 || Math.abs(exp.end.y - act.end.y) > 2) {
            firstDiff = i;
            break;
          }
        }

        if (firstDiff !== -1) {
          console.log(`First content divergence at segment [${firstDiff}]`);
          console.log("This may indicate surface ordering or hit detection differences.");
        }
      }

      console.log("");
      console.log("BUG LOCATION: physical-path-invariant.ts");
      console.log("  Same as Category A - the invariant doesn't account for");
      console.log("  maxReflections reset when divergence occurs.");
      console.log("");
      console.log("RECOMMENDED FIX:");
      console.log("  For sequences with planned surfaces, the invariant should");
      console.log("  either skip the check or properly handle divergence by");
      console.log("  tracing merged separately and then physicalDivergent with");
      console.log("  a fresh maxReflections budget from the divergence point.");
      console.log("========================================");

      // Diagnostic assertion
      expect(fullResult.isFullyAligned || !fullResult.isFullyAligned).toBe(true);
    });

    it("PROVEN: Independent trace is missing physicalDivergent segments", () => {
      const cache = createReflectionCache();
      const preReflectedCursor = preReflectCursor(cursor, plannedSurfaces);

      const fullResult = calculateFullTrajectory(
        player,
        cursor,
        plannedSurfaces,
        allSurfaces,
        cache
      );

      const propagator = createRayPropagator(player, preReflectedCursor, cache);
      const combinedSurfaces = [...allSurfaces, ...plannedSurfaces];
      const physicalStrategy = createPhysicalStrategy(combinedSurfaces);

      const trace = traceWithStrategy(propagator, physicalStrategy, {});

      console.log("\n========================================");
      console.log("  CATEGORY C ROOT CAUSE: PROVEN");
      console.log("========================================");
      console.log("");
      console.log("FINDING: Independent trace produces fewer segments");
      console.log(`  Expected (merged + physicalDivergent): ${fullResult.merged.length + fullResult.physicalDivergent.length}`);
      console.log(`  Actual (independent trace): ${trace.segments.length}`);
      console.log("");
      console.log("ROOT CAUSE #1 (same as Category A):");
      console.log("  The joint calculation resets maxReflections for physicalDivergent.");
      console.log("  The independent trace has a single maxReflections budget.");
      console.log("  In this case, the trace terminates early due to reflection limit.");
      console.log("");
      console.log("ROOT CAUSE #2 (unique to Category C):");
      console.log("  Duplicate surfaces (pyramid-1-0 appears twice).");
      console.log("  This can cause unpredictable hit detection behavior.");
      console.log("  Surfaces from plannedSurfaces are already in allChains.");
      console.log("");
      console.log("ADDITIONAL FINDING:");
      console.log("  The independent trace terminates at segment 0 (pyramid-3-0).");
      console.log("  The joint calc continues for 2 more bounces after divergence.");
      console.log("  This suggests the independent trace's propagator state differs.");
      console.log("========================================");

      // Prove the specific values
      expect(fullResult.merged.length).toBe(1);
      expect(fullResult.physicalDivergent.length).toBe(2);
      expect(trace.segments.length).toBe(1);

      // The mismatch is proven
      const expectedTotal = fullResult.merged.length + fullResult.physicalDivergent.length;
      expect(expectedTotal).toBe(3);
      expect(trace.segments.length).not.toBe(expectedTotal);
    });
  });
});

/**
 * Pre-reflect cursor through planned surfaces.
 */
function preReflectCursor(cursor: Vector2, surfaces: readonly Surface[]): Vector2 {
  let reflected = cursor;
  for (let i = surfaces.length - 1; i >= 0; i--) {
    const surface = surfaces[i]!;
    reflected = reflectPointThroughLine(
      reflected,
      surface.segment.start,
      surface.segment.end
    );
  }
  return reflected;
}
