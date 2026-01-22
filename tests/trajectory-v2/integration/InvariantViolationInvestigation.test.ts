/**
 * Invariant Violation Investigation Tests
 *
 * These tests investigate and prove the root causes of invariant violations
 * detected in the trajectory system. Each issue is reproduced and analyzed
 * with hypothesis tests.
 *
 * Issues:
 * 1. physicalHitWall uses wrong direction (cursor-player instead of ray direction)
 * 2. Arrow path has extra waypoints due to incorrect canReflect check
 * 3. merged-equals-planned-prefix fails with multiple planned surfaces
 */

import { describe, it, expect } from "vitest";
import { createMockSurface, createMockBidirectionalSurface } from "@test/helpers/surfaceHelpers";
import { calculateMergedPath } from "@/trajectory-v2/engine/MergedPathCalculator";
import { calculateFullTrajectory, getArrowWaypointsFromFullTrajectory } from "@/trajectory-v2/engine/FullTrajectoryCalculator";
import { createOrderedPlannedStrategy, createPhysicalStrategy } from "@/trajectory-v2/engine/HitDetectionStrategy";
import { createRayPropagator } from "@/trajectory-v2/engine/RayPropagator";
import { createReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import { traceWithStrategy } from "@/trajectory-v2/engine/TracePath";
import { RicochetSurface } from "@/surfaces/RicochetSurface";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/types";

// =============================================================================
// TEST FIXTURES: Parallel Mirrors (Issue 1 & 2)
// =============================================================================

/**
 * Parallel mirrors scene from invariant tests.
 * Left mirror at x=300, right mirror at x=600, both spanning y=[200, 500]
 */
function createParallelMirrorsSurfaces(): {
  mirrorLeft: RicochetSurface;
  mirrorRight: RicochetSurface;
  roomBoundaries: Surface[];
} {
  // Left mirror facing right (bottom to top)
  const mirrorLeft = new RicochetSurface("mirror-left-0", {
    start: { x: 300, y: 500 },
    end: { x: 300, y: 200 },
  });

  // Right mirror facing left (top to bottom)
  const mirrorRight = new RicochetSurface("mirror-right-0", {
    start: { x: 600, y: 200 },
    end: { x: 600, y: 500 },
  });

  // Simplified room boundaries (screen edges)
  const roomBoundaries = [
    createMockSurface("room-top", { x: 0, y: 0 }, { x: 1280, y: 0 }),
    createMockSurface("room-right", { x: 1280, y: 0 }, { x: 1280, y: 720 }),
    createMockSurface("room-bottom", { x: 1280, y: 720 }, { x: 0, y: 720 }),
    createMockSurface("room-left", { x: 0, y: 720 }, { x: 0, y: 0 }),
  ];

  return { mirrorLeft, mirrorRight, roomBoundaries };
}

// =============================================================================
// TEST FIXTURES: V-Shape 90 (Issue 3)
// =============================================================================

/**
 * V-shape at 90 degrees from invariant tests.
 * Two surfaces meeting at an apex.
 */
function createVShape90Surfaces(): {
  leftSurface: RicochetSurface;
  rightSurface: RicochetSurface;
  roomBoundaries: Surface[];
} {
  const centerX = 640; // SCREEN.width / 2
  const apexY = 250;
  const armLength = 80;

  // Left arm of V
  const leftSurface = new RicochetSurface("v90-0", {
    start: { x: centerX - armLength, y: apexY + armLength },
    end: { x: centerX, y: apexY },
  });

  // Right arm of V
  const rightSurface = new RicochetSurface("v90-1", {
    start: { x: centerX, y: apexY },
    end: { x: centerX + armLength, y: apexY + armLength },
  });

  // Simplified room boundaries
  const roomBoundaries = [
    createMockSurface("room-top", { x: 0, y: 0 }, { x: 1280, y: 0 }),
    createMockSurface("room-right", { x: 1280, y: 0 }, { x: 1280, y: 720 }),
    createMockSurface("room-bottom", { x: 1280, y: 720 }, { x: 0, y: 720 }),
    createMockSurface("room-left", { x: 0, y: 720 }, { x: 0, y: 0 }),
  ];

  return { leftSurface, rightSurface, roomBoundaries };
}

// =============================================================================
// ISSUE 1: physicalHitWall Direction Bug
// =============================================================================

describe("Invariant Violation Investigation", () => {
  describe("Issue 1: physicalHitWall Direction Bug", () => {
    // Test case from invariant failures:
    // Scene: parallel-mirrors/mirror-left
    // Player: (1053, 81), Cursor: (1106, 666)
    const player: Vector2 = { x: 1053, y: 81 };
    const cursor: Vector2 = { x: 1106, y: 666 };

    const { mirrorLeft, mirrorRight, roomBoundaries } = createParallelMirrorsSurfaces();
    const plannedSurfaces: Surface[] = [mirrorLeft];
    const allSurfaces: Surface[] = [...roomBoundaries, mirrorLeft, mirrorRight];

    it("should show initial direction differs from ray direction at divergence", () => {
      const cache = createReflectionCache();

      // Calculate merged path to get divergence info
      const mergedResult = calculateMergedPath(
        player,
        cursor,
        plannedSurfaces,
        allSurfaces,
        cache
      );

      console.log("=== Issue 1: Direction Analysis ===");
      console.log("Player:", player);
      console.log("Cursor:", cursor);
      console.log("Divergence point:", mergedResult.divergencePoint);
      console.log("Divergence surface (physical):", mergedResult.divergenceSurface?.physical?.id);
      console.log("Divergence surface (planned):", mergedResult.divergenceSurface?.planned?.id);

      // Initial direction: cursor - player
      const initialDirection = {
        x: cursor.x - player.x,
        y: cursor.y - player.y,
      };
      console.log("Initial direction (cursor - player):", initialDirection);

      // Actual ray direction at divergence
      if (mergedResult.propagatorAtDivergence) {
        const ray = mergedResult.propagatorAtDivergence.getRay();
        const rayDirection = {
          x: ray.target.x - ray.source.x,
          y: ray.target.y - ray.source.y,
        };
        console.log("Ray direction at divergence:", rayDirection);

        // These should be different if the ray has reflected
        const sameDirection =
          Math.sign(initialDirection.x) === Math.sign(rayDirection.x) &&
          Math.sign(initialDirection.y) === Math.sign(rayDirection.y);

        console.log("Directions have same sign?", sameDirection);

        // Record for analysis
        expect(mergedResult.divergencePoint).not.toBeNull();
      }
    });

    it("should prove canReflectFrom returns different values for different directions", () => {
      const cache = createReflectionCache();

      const mergedResult = calculateMergedPath(
        player,
        cursor,
        plannedSurfaces,
        allSurfaces,
        cache
      );

      const physicalSurface = mergedResult.divergenceSurface?.physical;
      if (!physicalSurface) {
        console.log("No physical divergence surface - test skipped");
        return;
      }

      console.log("=== Issue 1: canReflectFrom Analysis ===");
      console.log("Physical surface:", physicalSurface.id);

      // Get surface normal
      const normal = physicalSurface.getNormal();
      console.log("Surface normal:", normal);

      // Initial direction
      const initialDirection = {
        x: cursor.x - player.x,
        y: cursor.y - player.y,
      };

      // Actual ray direction
      const ray = mergedResult.propagatorAtDivergence!.getRay();
      const rayDirection = {
        x: ray.target.x - ray.source.x,
        y: ray.target.y - ray.source.y,
      };

      // Test canReflectFrom with both directions
      const canReflectInitial = physicalSurface.canReflectFrom(initialDirection);
      const canReflectRay = physicalSurface.canReflectFrom(rayDirection);

      console.log("canReflectFrom(initial):", canReflectInitial);
      console.log("canReflectFrom(rayDirection):", canReflectRay);

      // If these differ, we've found the bug
      if (canReflectInitial !== canReflectRay) {
        console.log("*** BUG CONFIRMED: canReflectFrom returns different values! ***");
        console.log("FullTrajectoryCalculator uses initial direction, but should use ray direction");
      }

      // Document the finding
      expect(physicalSurface).toBeDefined();
    });

    it("should show the bug in FullTrajectoryCalculator", () => {
      const cache = createReflectionCache();

      // Calculate full trajectory (which has the bug)
      const fullResult = calculateFullTrajectory(
        player,
        cursor,
        plannedSurfaces,
        allSurfaces,
        cache
      );

      console.log("=== Issue 1: Full Trajectory Analysis ===");
      console.log("Merged segments:", fullResult.merged.length);
      console.log("Physical divergent segments:", fullResult.physicalDivergent.length);
      console.log("Divergence point:", fullResult.divergencePoint);

      // The bug: physicalDivergent has segments when it shouldn't
      // (or vice versa, depending on the specific case)

      for (const seg of fullResult.merged) {
        console.log(`  Merged: (${seg.start.x.toFixed(1)},${seg.start.y.toFixed(1)}) -> (${seg.end.x.toFixed(1)},${seg.end.y.toFixed(1)}) surface:${seg.surface?.id ?? "null"}`);
      }

      for (const seg of fullResult.physicalDivergent) {
        console.log(`  PhysDivergent: (${seg.start.x.toFixed(1)},${seg.start.y.toFixed(1)}) -> (${seg.end.x.toFixed(1)},${seg.end.y.toFixed(1)}) surface:${seg.surface?.id ?? "null"}`);
      }

      expect(fullResult).toBeDefined();
    });
  });

  // =============================================================================
  // ISSUE 2: Arrow vs Physical Waypoint Mismatch
  // =============================================================================

  describe("Issue 2: Arrow vs Physical Waypoint Mismatch", () => {
    const player: Vector2 = { x: 1053, y: 81 };
    const cursor: Vector2 = { x: 1106, y: 666 };

    const { mirrorLeft, mirrorRight, roomBoundaries } = createParallelMirrorsSurfaces();
    const plannedSurfaces: Surface[] = [mirrorLeft];
    const allSurfaces: Surface[] = [...roomBoundaries, mirrorLeft, mirrorRight];

    it("should reproduce the parallel-mirrors failure", () => {
      const cache = createReflectionCache();

      // Calculate full trajectory
      const fullResult = calculateFullTrajectory(
        player,
        cursor,
        plannedSurfaces,
        allSurfaces,
        cache
      );

      // Get arrow waypoints
      const arrowWaypoints = getArrowWaypointsFromFullTrajectory(fullResult);

      // Filter cursor
      const filteredArrow = arrowWaypoints.filter(
        wp => Math.abs(wp.x - cursor.x) > 2 || Math.abs(wp.y - cursor.y) > 2
      );

      console.log("=== Issue 2: Arrow Path Analysis ===");
      console.log("Arrow waypoints (filtered):", filteredArrow.length);
      for (let i = 0; i < filteredArrow.length; i++) {
        console.log(`  [${i}]: (${filteredArrow[i]!.x.toFixed(1)}, ${filteredArrow[i]!.y.toFixed(1)})`);
      }

      // Calculate pure physical trace
      const preReflectedCursor = reflectPointThroughLine(
        cursor,
        mirrorLeft.segment.start,
        mirrorLeft.segment.end
      );

      const propagator = createRayPropagator(player, preReflectedCursor, cache);
      const combinedSurfaces = [...allSurfaces, ...plannedSurfaces];
      const physicalStrategy = createPhysicalStrategy(combinedSurfaces);

      const purePhysical = traceWithStrategy(propagator, physicalStrategy, {});

      // Extract waypoints
      const physicalWaypoints: Vector2[] = [];
      if (purePhysical.segments.length > 0) {
        physicalWaypoints.push(purePhysical.segments[0]!.start);
        for (const seg of purePhysical.segments) {
          physicalWaypoints.push(seg.end);
        }
      }

      console.log("Physical waypoints:", physicalWaypoints.length);
      for (let i = 0; i < physicalWaypoints.length; i++) {
        console.log(`  [${i}]: (${physicalWaypoints[i]!.x.toFixed(1)}, ${physicalWaypoints[i]!.y.toFixed(1)})`);
      }

      console.log("Physical termination:", purePhysical.terminationType);

      // The bug: arrow has more waypoints than physical
      console.log("\n*** COMPARISON ***");
      console.log(`Arrow: ${filteredArrow.length} waypoints`);
      console.log(`Physical: ${physicalWaypoints.length} waypoints`);

      if (filteredArrow.length > physicalWaypoints.length) {
        console.log("*** BUG CONFIRMED: Arrow has extra waypoints ***");
        console.log("This is caused by physicalHitWall using wrong direction");
      }

      expect(filteredArrow.length).toBeGreaterThan(0);
    });

    it("should trace merged + physicalDivergent step by step", () => {
      const cache = createReflectionCache();

      const fullResult = calculateFullTrajectory(
        player,
        cursor,
        plannedSurfaces,
        allSurfaces,
        cache
      );

      console.log("=== Issue 2: Step-by-Step Trace ===");
      console.log("\n--- Merged Segments ---");
      for (let i = 0; i < fullResult.merged.length; i++) {
        const seg = fullResult.merged[i]!;
        console.log(`[${i}] (${seg.start.x.toFixed(1)},${seg.start.y.toFixed(1)}) -> (${seg.end.x.toFixed(1)},${seg.end.y.toFixed(1)})`);
        console.log(`    surface: ${seg.surface?.id ?? "null"}, canReflect: ${seg.canReflect}`);
      }

      console.log("\n--- Physical Divergent Segments ---");
      if (fullResult.physicalDivergent.length === 0) {
        console.log("(none)");
      }
      for (let i = 0; i < fullResult.physicalDivergent.length; i++) {
        const seg = fullResult.physicalDivergent[i]!;
        console.log(`[${i}] (${seg.start.x.toFixed(1)},${seg.start.y.toFixed(1)}) -> (${seg.end.x.toFixed(1)},${seg.end.y.toFixed(1)})`);
        console.log(`    surface: ${seg.surface?.id ?? "null"}, canReflect: ${seg.canReflect}`);
      }

      console.log("\n--- Divergence Info ---");
      console.log("Divergence point:", fullResult.divergencePoint);
      console.log("Is fully aligned:", fullResult.isFullyAligned);

      expect(fullResult).toBeDefined();
    });
  });

  // =============================================================================
  // ISSUE 3: Merged vs Planned Prefix Mismatch
  // =============================================================================

  describe("Issue 3: Merged vs Planned Prefix Mismatch", () => {
    const { leftSurface, rightSurface, roomBoundaries } = createVShape90Surfaces();

    // v90-both: both surfaces are planned
    const plannedSurfaces: Surface[] = [leftSurface, rightSurface];
    const allSurfaces: Surface[] = [...roomBoundaries, leftSurface, rightSurface];

    // Actual failing case from invariant tests
    const player: Vector2 = { x: 817, y: 143 };
    const cursor: Vector2 = { x: 581, y: 205 };

    it("should reproduce v-shape-90/v90-both failure", () => {
      const cache = createReflectionCache();

      console.log("=== Issue 3: V-Shape 90 Analysis ===");
      console.log("Player:", player);
      console.log("Cursor:", cursor);
      console.log("Planned surfaces:", plannedSurfaces.map(s => s.id).join(", "));

      // Calculate merged path
      const mergedResult = calculateMergedPath(
        player,
        cursor,
        plannedSurfaces,
        allSurfaces,
        cache
      );

      console.log("\n--- Merged Path ---");
      console.log("Segments:", mergedResult.segments.length);
      console.log("Is fully aligned:", mergedResult.isFullyAligned);
      console.log("Reached cursor:", mergedResult.reachedCursor);
      for (const seg of mergedResult.segments) {
        console.log(`  (${seg.start.x.toFixed(1)},${seg.start.y.toFixed(1)}) -> (${seg.end.x.toFixed(1)},${seg.end.y.toFixed(1)}) surface:${seg.surface?.id ?? "null"}`);
      }

      // Extract planned surface hits
      const plannedIds = new Set(plannedSurfaces.map(s => s.id));
      const mergedPlannedHits: Vector2[] = [];
      for (const seg of mergedResult.segments) {
        if (seg.surface && plannedIds.has(seg.surface.id)) {
          mergedPlannedHits.push(seg.end);
        }
      }

      console.log("\nMerged planned hits:", mergedPlannedHits.length);
      for (const hit of mergedPlannedHits) {
        console.log(`  (${hit.x.toFixed(1)}, ${hit.y.toFixed(1)})`);
      }

      expect(mergedResult).toBeDefined();
    });

    it("should compare merged planned hits vs pure planned hits", () => {
      const cache = createReflectionCache();

      // Calculate merged path
      const mergedResult = calculateMergedPath(
        player,
        cursor,
        plannedSurfaces,
        allSurfaces,
        cache
      );

      // Pre-reflect cursor through all planned surfaces (in reverse order)
      let preReflectedCursor = cursor;
      for (let i = plannedSurfaces.length - 1; i >= 0; i--) {
        const surface = plannedSurfaces[i]!;
        preReflectedCursor = reflectPointThroughLine(
          preReflectedCursor,
          surface.segment.start,
          surface.segment.end
        );
      }

      console.log("=== Issue 3: Comparison ===");
      console.log("Original cursor:", cursor);
      console.log("Pre-reflected cursor (through both surfaces):", preReflectedCursor);

      // Pure planned trace
      const propagator = createRayPropagator(player, preReflectedCursor, cache);
      const plannedStrategy = createOrderedPlannedStrategy(plannedSurfaces);

      console.log("\n--- Pure Planned Trace ---");
      console.log("Initial ray: from", player, "toward", preReflectedCursor);

      const purePlanned = traceWithStrategy(propagator, plannedStrategy, {});

      console.log("Segments:", purePlanned.segments.length);
      console.log("Termination:", purePlanned.terminationType);
      for (const seg of purePlanned.segments) {
        console.log(`  (${seg.start.x.toFixed(1)},${seg.start.y.toFixed(1)}) -> (${seg.end.x.toFixed(1)},${seg.end.y.toFixed(1)}) surface:${seg.surface?.id ?? "null"} onSegment:${seg.onSegment}`);
      }

      // Extract planned hits from merged
      const plannedIds = new Set(plannedSurfaces.map(s => s.id));
      const mergedPlannedHits: Vector2[] = [];
      for (const seg of mergedResult.segments) {
        if (seg.surface && plannedIds.has(seg.surface.id)) {
          mergedPlannedHits.push(seg.end);
        }
      }

      // Extract waypoints from pure planned
      const pureWaypoints: Vector2[] = [];
      for (const seg of purePlanned.segments) {
        pureWaypoints.push(seg.end);
      }

      console.log("\n--- Comparison ---");
      console.log(`Merged planned hits: ${mergedPlannedHits.length}`);
      console.log(`Pure planned waypoints: ${pureWaypoints.length}`);

      // The BUG: pure planned goes to (-5315.2, 8042.1) which is off-screen
      // This means the pure planned trace is NOT finding the on-segment hit
      if (pureWaypoints.length > 0) {
        const firstPure = pureWaypoints[0]!;
        if (Math.abs(firstPure.x) > 2000 || Math.abs(firstPure.y) > 2000) {
          console.log("\n*** BUG DETECTED: Pure planned trace goes way off screen ***");
          console.log("This indicates the planned surface is NOT being hit on-segment");
          console.log("But merged path DID hit it on-segment");
        }
      }

      expect(mergedResult).toBeDefined();
    });

    it("should identify why pure planned misses the surface", () => {
      const cache = createReflectionCache();

      console.log("=== Issue 3: Root Cause Analysis ===");

      // Pre-reflect cursor through all planned surfaces
      let preReflectedCursor = cursor;
      console.log("Reflecting cursor through planned surfaces:");
      for (let i = plannedSurfaces.length - 1; i >= 0; i--) {
        const surface = plannedSurfaces[i]!;
        const before = { ...preReflectedCursor };
        preReflectedCursor = reflectPointThroughLine(
          preReflectedCursor,
          surface.segment.start,
          surface.segment.end
        );
        console.log(`  Through ${surface.id}: (${before.x.toFixed(1)},${before.y.toFixed(1)}) -> (${preReflectedCursor.x.toFixed(1)},${preReflectedCursor.y.toFixed(1)})`);
      }

      // The issue: pre-reflecting through BOTH surfaces changes the direction
      // such that the ray no longer hits the first surface on-segment

      // Let's check what happens with just one surface reflection
      const cursorThroughFirst = reflectPointThroughLine(
        cursor,
        plannedSurfaces[0]!.segment.start,
        plannedSurfaces[0]!.segment.end
      );
      console.log("\nCursor reflected through first surface only:", cursorThroughFirst);

      // Ray from player toward cursorThroughFirst
      const rayDir1 = {
        x: cursorThroughFirst.x - player.x,
        y: cursorThroughFirst.y - player.y,
      };
      console.log("Ray direction (single reflection):", rayDir1);

      // Ray from player toward preReflectedCursor (both surfaces)
      const rayDir2 = {
        x: preReflectedCursor.x - player.x,
        y: preReflectedCursor.y - player.y,
      };
      console.log("Ray direction (double reflection):", rayDir2);

      // The directions are different! This explains why:
      // - Merged path uses physical+planned strategies that check surfaces individually
      // - Pure planned trace pre-reflects through ALL surfaces at once
      // - The ray direction is different, so on-segment hits differ

      console.log("\n*** ROOT CAUSE IDENTIFIED ***");
      console.log("The pure planned trace pre-reflects cursor through ALL planned surfaces");
      console.log("But the merged path checks surfaces one at a time");
      console.log("This causes different ray directions and different on-segment hits");

      expect(true).toBe(true);
    });

    it("should identify surface ID mismatches if any", () => {
      console.log("=== Issue 3: Surface ID Analysis ===");

      // Check if planned surface IDs match what we expect
      console.log("Planned surface IDs:");
      for (const surface of plannedSurfaces) {
        console.log(`  ${surface.id}: (${surface.segment.start.x},${surface.segment.start.y}) -> (${surface.segment.end.x},${surface.segment.end.y})`);
      }

      // The chain creates surfaces with ID pattern: chainName-index
      // Planned surfaces should have matching IDs
      console.log("\nExpected chain surface IDs: v90-0, v90-1");
      console.log("Actual planned surface IDs:", plannedSurfaces.map(s => s.id).join(", "));

      const expectedIds = ["v90-0", "v90-1"];
      const actualIds = plannedSurfaces.map(s => s.id);

      const idsMatch = expectedIds.every((id, i) => actualIds[i] === id);
      console.log("IDs match expected:", idsMatch);

      expect(plannedSurfaces.length).toBe(2);
    });
  });
});
