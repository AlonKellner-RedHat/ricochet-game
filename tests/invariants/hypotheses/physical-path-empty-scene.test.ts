/**
 * Hypothesis Test: Physical Path Invariant Failures in Empty Sequences
 *
 * Category A Investigation: Physical-only failures with no planned surfaces
 *
 * Target Case: `parallel-mirrors/empty` at player=(345,205), cursor=(109,205)
 *
 * The physical path invariant verifies that an independent physical trace
 * equals `merged + physicalDivergent` from the joint calculation.
 *
 * In empty sequences (no planned surfaces), there should be no divergence,
 * so `merged` should equal the independent physical trace.
 */

import { describe, it, expect } from "vitest";
import { getSceneById } from "@/debug/debugScenes";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { calculateFullTrajectory } from "@/trajectory-v2/engine/FullTrajectoryCalculator";
import { createPhysicalStrategy } from "@/trajectory-v2/engine/HitDetectionStrategy";
import { createRayPropagator } from "@/trajectory-v2/engine/RayPropagator";
import { createReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import { traceWithStrategy, type TraceSegment } from "@/trajectory-v2/engine/TracePath";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

const SCREEN_BOUNDS = { minX: 0, maxX: 1280, minY: 0, maxY: 720 };

describe("Physical Path Empty Scene Investigation (Category A)", () => {
  const scene = getSceneById("parallel-mirrors")!;
  const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
  const allChains = [...scene.chains, screenChain];
  const allSurfaces = allChains.flatMap((c) => c.getSurfaces());

  // Failing case from invariant test output
  const player: Vector2 = { x: 345, y: 205 };
  const cursor: Vector2 = { x: 109, y: 205 };

  describe("Phase 1: Reproduce the failure", () => {
    it("should reproduce the physical path mismatch", () => {
      const cache = createReflectionCache();

      // Run joint calculation (empty planned surfaces)
      const fullResult = calculateFullTrajectory(
        player,
        cursor,
        [], // empty planned surfaces
        allSurfaces,
        cache
      );

      // Build expected path: merged + physicalDivergent
      const expectedSegments = [...fullResult.merged, ...fullResult.physicalDivergent];

      // Run independent physical trace with same initial ray
      // In empty sequence, preReflectedCursor = cursor
      const propagator = createRayPropagator(player, cursor, cache);
      const physicalStrategy = createPhysicalStrategy(allSurfaces);

      const purePhysicalTrace = traceWithStrategy(propagator, physicalStrategy, {});

      console.log("\n=== PHYSICAL PATH COMPARISON ===");
      console.log(`Player: (${player.x}, ${player.y})`);
      console.log(`Cursor: (${cursor.x}, ${cursor.y})`);
      console.log(`Expected segments (joint calc): ${expectedSegments.length}`);
      console.log(`Actual segments (independent): ${purePhysicalTrace.segments.length}`);

      console.log("\n--- Expected Path ---");
      expectedSegments.forEach((seg, i) => {
        console.log(`  [${i}]: (${seg.start.x.toFixed(1)}, ${seg.start.y.toFixed(1)}) -> (${seg.end.x.toFixed(1)}, ${seg.end.y.toFixed(1)}) | surface: ${seg.surface?.id ?? "null"}`);
      });

      console.log("\n--- Actual Path ---");
      purePhysicalTrace.segments.forEach((seg, i) => {
        console.log(`  [${i}]: (${seg.start.x.toFixed(1)}, ${seg.start.y.toFixed(1)}) -> (${seg.end.x.toFixed(1)}, ${seg.end.y.toFixed(1)}) | surface: ${seg.surface?.id ?? "null"}`);
      });

      // Find first divergence point
      const minLen = Math.min(expectedSegments.length, purePhysicalTrace.segments.length);
      let firstDivergenceIndex = -1;
      for (let i = 0; i < minLen; i++) {
        const exp = expectedSegments[i]!;
        const act = purePhysicalTrace.segments[i]!;
        const endsDiffer = Math.abs(exp.end.x - act.end.x) > 1 || Math.abs(exp.end.y - act.end.y) > 1;
        if (endsDiffer) {
          firstDivergenceIndex = i;
          break;
        }
      }

      if (firstDivergenceIndex === -1 && expectedSegments.length !== purePhysicalTrace.segments.length) {
        firstDivergenceIndex = minLen; // Divergence at segment count
      }

      console.log(`\n=== DIVERGENCE ANALYSIS ===`);
      if (firstDivergenceIndex === -1) {
        console.log("No divergence found - paths match!");
      } else {
        console.log(`First divergence at segment index: ${firstDivergenceIndex}`);
        if (firstDivergenceIndex < minLen) {
          const exp = expectedSegments[firstDivergenceIndex]!;
          const act = purePhysicalTrace.segments[firstDivergenceIndex]!;
          console.log(`  Expected: (${exp.start.x.toFixed(1)}, ${exp.start.y.toFixed(1)}) -> (${exp.end.x.toFixed(1)}, ${exp.end.y.toFixed(1)})`);
          console.log(`  Actual:   (${act.start.x.toFixed(1)}, ${act.start.y.toFixed(1)}) -> (${act.end.x.toFixed(1)}, ${act.end.y.toFixed(1)})`);
        } else {
          console.log(`  Segment count differs: expected ${expectedSegments.length}, actual ${purePhysicalTrace.segments.length}`);
        }
      }

      // Assert that we can reproduce the failure
      const pathsDiffer = expectedSegments.length !== purePhysicalTrace.segments.length || firstDivergenceIndex !== -1;
      console.log(`\nPaths differ: ${pathsDiffer}`);

      // This test is diagnostic - we expect it to show the mismatch
      expect(pathsDiffer).toBe(true);
    });
  });

  describe("Phase 2: Identify divergence cause", () => {
    it("should check if cursor splitting affects the joint calculation", () => {
      const cache = createReflectionCache();

      // Run joint calculation
      const fullResult = calculateFullTrajectory(
        player,
        cursor,
        [],
        allSurfaces,
        cache
      );

      console.log("\n=== CURSOR SPLITTING ANALYSIS ===");
      console.log(`isFullyAligned: ${fullResult.isFullyAligned}`);
      console.log(`divergencePoint: ${fullResult.divergencePoint ? `(${fullResult.divergencePoint.x}, ${fullResult.divergencePoint.y})` : "null"}`);

      // Check if any merged segment ends at cursor
      const cursorOnMerged = fullResult.merged.some(
        (seg) => Math.abs(seg.end.x - cursor.x) < 1 && Math.abs(seg.end.y - cursor.y) < 1
      );
      console.log(`Cursor is endpoint of merged segment: ${cursorOnMerged}`);

      // Check if cursor is on the path
      for (let i = 0; i < fullResult.merged.length; i++) {
        const seg = fullResult.merged[i]!;
        const isOnSegment = isPointOnSegment(cursor, seg.start, seg.end);
        if (isOnSegment) {
          console.log(`Cursor is ON merged segment [${i}]`);
        }
      }

      // HYPOTHESIS: The joint calculation may split segments at the cursor,
      // creating extra waypoints that the independent trace doesn't have
      expect(fullResult.merged.length).toBeGreaterThan(0);
    });

    it("should check maxReflections handling with parallel mirrors", () => {
      const cache = createReflectionCache();

      // The parallel mirrors are at x=300 and x=600
      // Player at (345, 205) is between them
      // Cursor at (109, 205) is to the left of the left mirror
      // Ray from player toward cursor will hit left mirror, then bounce...

      console.log("\n=== PARALLEL MIRRORS GEOMETRY ===");
      console.log("Left mirror: x=300, y=[200-500]");
      console.log("Right mirror: x=600, y=[200-500]");
      console.log(`Player: (${player.x}, ${player.y}) - between mirrors`);
      console.log(`Cursor: (${cursor.x}, ${cursor.y}) - left of left mirror`);

      // Run joint calculation with default maxReflections (10)
      const fullResult = calculateFullTrajectory(
        player,
        cursor,
        [],
        allSurfaces,
        cache
      );

      console.log(`\nJoint calc merged segments: ${fullResult.merged.length}`);
      console.log(`Joint calc physicalDivergent segments: ${fullResult.physicalDivergent.length}`);
      console.log(`Total expected: ${fullResult.merged.length + fullResult.physicalDivergent.length}`);

      // Run independent trace with explicit maxReflections=10
      const propagator = createRayPropagator(player, cursor, cache);
      const physicalStrategy = createPhysicalStrategy(allSurfaces);

      const trace10 = traceWithStrategy(propagator, physicalStrategy, {});

      console.log(`\nIndependent trace (maxReflections=10): ${trace10.segments.length} segments`);

      // HYPOTHESIS: maxReflections is handled differently
      // The joint calculation and independent trace should have the same count
      // if both use maxReflections=10
    });
  });

  describe("Phase 2.5: Investigate divergence in empty sequence", () => {
    it("should explain why divergence occurs with no planned surfaces", () => {
      const cache = createReflectionCache();

      // Run joint calculation
      const fullResult = calculateFullTrajectory(
        player,
        cursor,
        [], // No planned surfaces
        allSurfaces,
        cache
      );

      console.log("\n=== EMPTY SEQUENCE DIVERGENCE ANALYSIS ===");
      console.log(`isFullyAligned: ${fullResult.isFullyAligned}`);
      console.log(`divergencePoint: ${fullResult.divergencePoint ? `(${fullResult.divergencePoint.x}, ${fullResult.divergencePoint.y})` : "null"}`);
      console.log(`merged segments: ${fullResult.merged.length}`);
      console.log(`physicalDivergent segments: ${fullResult.physicalDivergent.length}`);
      console.log(`plannedToCursor segments: ${fullResult.plannedToCursor.length}`);
      console.log(`physicalFromCursor segments: ${fullResult.physicalFromCursor.length}`);

      // The divergence point is at (300, 205) - the left mirror
      // This means physical and planned strategies disagreed at the left mirror
      
      // HYPOTHESIS: With no planned surfaces, the planned strategy
      // (createOrderedPlannedStrategy) returns NO hits (empty planned surfaces).
      // But the physical strategy returns a hit on the left mirror.
      // This causes "divergence" because:
      // - Physical: hits left mirror, can reflect
      // - Planned: no hit (no planned surfaces to check)
      // They disagree, so divergence occurs!

      console.log("\n*** HYPOTHESIS ***");
      console.log("With empty plannedSurfaces, createOrderedPlannedStrategy returns NO hits.");
      console.log("Physical hits the left mirror, but planned sees nothing.");
      console.log("This is treated as 'divergence' even though there are no planned surfaces.");
      console.log("");
      console.log("ROOT CAUSE: The MergedPathCalculator detects 'divergence' when:");
      console.log("  - Physical hits a surface, but planned doesn't (or vice versa)");
      console.log("This is correct behavior for the joint calculation, but the");
      console.log("physical-path-invariant assumes divergence only happens with planned surfaces.");
      console.log("");
      console.log("The invariant compares `merged + physicalDivergent` (11 segments)");
      console.log("against an independent physical trace (10 segments).");
      console.log("But the independent trace doesn't know about the 'divergence' point,");
      console.log("so it counts reflections differently.");

      // Prove the hypothesis by checking the segment counts
      const totalExpected = fullResult.merged.length + fullResult.physicalDivergent.length;
      expect(totalExpected).toBe(11);
      expect(fullResult.merged.length).toBe(1);
      expect(fullResult.physicalDivergent.length).toBe(10);
    });

    it("should check how independent trace counts reflections", () => {
      const cache = createReflectionCache();

      // Independent trace
      const propagator = createRayPropagator(player, cursor, cache);
      const physicalStrategy = createPhysicalStrategy(allSurfaces);

      const trace = traceWithStrategy(propagator, physicalStrategy, {});

      console.log("\n=== REFLECTION COUNT ANALYSIS ===");
      console.log(`Independent trace segments: ${trace.segments.length}`);

      // The first segment goes from player to left mirror
      // Then maxReflections=10 means 10 more bounces
      // Total segments = 1 (initial) + 10 (reflections) = 11?
      // But we only see 10 segments...

      // Let's check if the first segment is counted as a reflection
      for (let i = 0; i < trace.segments.length; i++) {
        const seg = trace.segments[i]!;
        console.log(`  [${i}]: ${seg.surface?.id ?? "null"} (canReflect: ${seg.canReflect})`);
      }

      console.log("\n*** KEY INSIGHT ***");
      console.log("The independent trace starts counting reflections from segment 0.");
      console.log("With maxReflections=10, it produces 10 segments.");
      console.log("But the joint calculation produces 11 segments (1 merged + 10 physicalDivergent).");
      console.log("");
      console.log("THE MISMATCH: The joint calculation counts the 'divergence point' segment");
      console.log("as part of merged, and THEN starts physicalDivergent with a fresh reflection count.");
      console.log("So physicalDivergent gets 10 more reflections, for a total of 11 segments.");
    });
  });

  describe("Phase 3: Prove root cause", () => {
    it("should identify if cursor causes segment splitting in merged path", () => {
      const cache = createReflectionCache();

      // Run joint calculation
      const fullResult = calculateFullTrajectory(
        player,
        cursor,
        [],
        allSurfaces,
        cache
      );

      // Check merged segments for cursor-induced splits
      console.log("\n=== SEGMENT SPLIT ANALYSIS ===");

      let cursorSplitFound = false;
      for (let i = 0; i < fullResult.merged.length; i++) {
        const seg = fullResult.merged[i]!;
        
        // Check if segment ends at cursor (split point)
        const endsAtCursor = Math.abs(seg.end.x - cursor.x) < 1 && Math.abs(seg.end.y - cursor.y) < 1;
        
        // Check if next segment starts at cursor
        const nextSeg = fullResult.merged[i + 1];
        const nextStartsAtCursor = nextSeg && 
          Math.abs(nextSeg.start.x - cursor.x) < 1 && 
          Math.abs(nextSeg.start.y - cursor.y) < 1;

        if (endsAtCursor || nextStartsAtCursor) {
          console.log(`Cursor split at segment [${i}]: ends at cursor = ${endsAtCursor}`);
          cursorSplitFound = true;
        }
      }

      if (cursorSplitFound) {
        console.log("\n*** ROOT CAUSE IDENTIFIED ***");
        console.log("The joint calculation splits segments at the cursor position,");
        console.log("creating an extra waypoint that the independent trace doesn't have.");
      } else {
        console.log("No cursor-induced split found in merged path.");
      }

      // Run independent trace for comparison
      const propagator = createRayPropagator(player, cursor, cache);
      const physicalStrategy = createPhysicalStrategy(allSurfaces);
      const trace = traceWithStrategy(propagator, physicalStrategy, {});

      // Check if cursor is ON any segment in independent trace
      let cursorOnIndependentSegment = false;
      for (let i = 0; i < trace.segments.length; i++) {
        const seg = trace.segments[i]!;
        if (isPointOnSegment(cursor, seg.start, seg.end)) {
          console.log(`\nCursor is ON independent segment [${i}]`);
          console.log(`  Segment: (${seg.start.x.toFixed(1)}, ${seg.start.y.toFixed(1)}) -> (${seg.end.x.toFixed(1)}, ${seg.end.y.toFixed(1)})`);
          cursorOnIndependentSegment = true;
        }
      }

      console.log(`\n=== ROOT CAUSE PROOF ===`);
      console.log(`Cursor split in joint calc: ${cursorSplitFound}`);
      console.log(`Cursor on independent segment: ${cursorOnIndependentSegment}`);
      
      if (cursorSplitFound && cursorOnIndependentSegment) {
        console.log("\n*** CONFIRMED: Cursor splitting causes waypoint mismatch ***");
        console.log("The joint calculation (MergedPathCalculator) checks if cursor is on");
        console.log("each segment and splits the segment there, adding an extra waypoint.");
        console.log("The independent trace (traceWithStrategy) doesn't split at cursor");
        console.log("because it wasn't given the stopAtCursor option.");
      }

      // This is the diagnostic assertion
      expect(true).toBe(true); // Diagnostic test, not a pass/fail assertion
    });

    it("PROVEN: Empty sequence causes divergence which adds extra segment", () => {
      const cache = createReflectionCache();

      // Run joint calculation with empty planned surfaces
      const fullResult = calculateFullTrajectory(
        player,
        cursor,
        [],
        allSurfaces,
        cache
      );

      // Run independent trace
      const propagator = createRayPropagator(player, cursor, cache);
      const physicalStrategy = createPhysicalStrategy(allSurfaces);
      const trace = traceWithStrategy(propagator, physicalStrategy, {});

      console.log("\n========================================");
      console.log("  CATEGORY A ROOT CAUSE: PROVEN");
      console.log("========================================");
      console.log("");
      console.log("ISSUE: Physical path invariant fails in empty sequences");
      console.log("");
      console.log("ROOT CAUSE:");
      console.log("  1. With empty plannedSurfaces, createOrderedPlannedStrategy");
      console.log("     returns NO hits (it only checks planned surfaces).");
      console.log("");
      console.log("  2. MergedPathCalculator detects 'divergence' when physical");
      console.log("     hits a surface but planned doesn't.");
      console.log("");
      console.log("  3. This creates:");
      console.log(`     - merged: ${fullResult.merged.length} segment (before divergence)`);
      console.log(`     - physicalDivergent: ${fullResult.physicalDivergent.length} segments (with fresh maxReflections)`);
      console.log(`     - Total: ${fullResult.merged.length + fullResult.physicalDivergent.length} segments`);
      console.log("");
      console.log("  4. Independent trace has only ONE maxReflections budget:");
      console.log(`     - Total: ${trace.segments.length} segments`);
      console.log("");
      console.log("MISMATCH: 11 vs 10 segments due to double-counting reflections.");
      console.log("");
      console.log("BUG LOCATION: physical-path-invariant.ts");
      console.log("  The invariant compares `merged + physicalDivergent` against");
      console.log("  an independent trace. But when divergence occurs, the joint");
      console.log("  calculation resets maxReflections for physicalDivergent,");
      console.log("  leading to more total segments than the independent trace.");
      console.log("");
      console.log("RECOMMENDED FIX:");
      console.log("  Option A: For empty sequences (no planned surfaces), skip the");
      console.log("            invariant check since 'divergence' is artificial.");
      console.log("  Option B: Make the independent trace aware of the divergence");
      console.log("            point and use continueFromPosition with fresh count.");
      console.log("========================================");

      // Prove the specific values
      expect(fullResult.isFullyAligned).toBe(false); // Divergence detected
      expect(fullResult.merged.length).toBe(1);
      expect(fullResult.physicalDivergent.length).toBe(10);
      expect(trace.segments.length).toBe(10);

      // The mismatch
      const expectedTotal = fullResult.merged.length + fullResult.physicalDivergent.length;
      const actualTotal = trace.segments.length;
      expect(expectedTotal).toBe(11);
      expect(actualTotal).toBe(10);
      expect(expectedTotal).not.toBe(actualTotal); // PROVEN: they differ
    });
  });
});

/**
 * Check if a point lies on a line segment (approximately).
 */
function isPointOnSegment(point: Vector2, start: Vector2, end: Vector2): boolean {
  const tolerance = 2;

  // Check if point is collinear with segment
  const crossProduct =
    (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y);

  if (Math.abs(crossProduct) > tolerance * 10) {
    return false; // Not collinear
  }

  // Check if point is within segment bounds (with tolerance)
  const minX = Math.min(start.x, end.x) - tolerance;
  const maxX = Math.max(start.x, end.x) + tolerance;
  const minY = Math.min(start.y, end.y) - tolerance;
  const maxY = Math.max(start.y, end.y) + tolerance;

  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
}
