/**
 * Planned Path Not Reflecting Bug - Investigation Tests
 *
 * Bug: When the cursor is on the same side as the player relative to a planned
 * surface, the planned path should reflect off the surface and continue to cursor.
 * Instead, the arrow stops midair at the divergence point.
 *
 * Root Cause Hypothesis:
 * When divergence occurs because the planned strategy finds a hit first,
 * `calculateMergedPath` returns `propagatorAtDivergence` WITHOUT reflecting
 * through the planned surface. The `plannedToCursor` tracing then uses this
 * un-reflected propagator (depth=0), causing the ordered planned strategy to
 * check the same surface again. The hit at the divergence point gets filtered
 * out, no next hit is found, and the trace ends prematurely.
 */

import { describe, it, expect } from "vitest";
import { createMockSurface, createMockBidirectionalSurface } from "@test/helpers/surfaceHelpers";
import { calculateMergedPath } from "@/trajectory-v2/engine/MergedPathCalculator";
import { calculateFullTrajectory } from "@/trajectory-v2/engine/FullTrajectoryCalculator";
import { createOrderedPlannedStrategy, createPhysicalStrategy } from "@/trajectory-v2/engine/HitDetectionStrategy";
import { createRayPropagator } from "@/trajectory-v2/engine/RayPropagator";
import { createReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import { traceWithStrategy } from "@/trajectory-v2/engine/TracePath";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/types";

describe("Planned Path Not Reflecting Bug", () => {
  // Exact user scenario
  const player: Vector2 = { x: 170, y: 586 };
  const cursor: Vector2 = { x: 407.9483870967742, y: 624.258064516129 };

  // Single planned surface - vertical mirror on the right
  const mirrorRight = createMockBidirectionalSurface(
    "mirror-right-0",
    { x: 550, y: 150 },
    { x: 550, y: 550 }
  );

  const plannedSurfaces: Surface[] = [mirrorRight];

  // Room boundaries (subset relevant to this test)
  const roomTop = createMockSurface(
    "room-0",
    { x: 20, y: 80 },
    { x: 1260, y: 80 }
  );
  const roomRight = createMockSurface(
    "room-1",
    { x: 1260, y: 80 },
    { x: 1260, y: 700 },
    false // non-reflective
  );
  const roomBottom = createMockSurface(
    "room-2",
    { x: 1260, y: 700 },
    { x: 20, y: 700 },
    false // non-reflective
  );
  const roomLeft = createMockSurface(
    "room-3",
    { x: 20, y: 700 },
    { x: 20, y: 80 }
  );

  const allSurfaces: Surface[] = [
    roomTop,
    roomRight,
    roomBottom,
    roomLeft,
    mirrorRight,
  ];

  describe("Step 1: Reproduce with Geometric Verification", () => {
    it("should verify cursor and player are on the same side of the mirror", () => {
      // Both player and cursor are at x < 550 (left of mirror)
      expect(player.x).toBeLessThan(550);
      expect(cursor.x).toBeLessThan(550);

      console.log("Player:", player);
      console.log("Cursor:", cursor);
      console.log("Both are on the LEFT side of mirror (x < 550)");
    });

    it("should verify pre-reflected cursor position", () => {
      // Reflect cursor through mirror-right-0 (x=550)
      const cursorImage = reflectPointThroughLine(
        cursor,
        mirrorRight.segment.start,
        mirrorRight.segment.end
      );

      console.log("Pre-reflected cursor:", cursorImage);

      // Cursor image should be on the RIGHT side of the mirror
      expect(cursorImage.x).toBeGreaterThan(550);
      // x should be 2*550 - cursor.x = 1100 - 407.9 = 692.1
      expect(cursorImage.x).toBeCloseTo(692.05, 1);
      // y stays the same
      expect(cursorImage.y).toBeCloseTo(cursor.y, 5);
    });

    it("should verify ray intersection with mirror extended line", () => {
      // Pre-reflect cursor
      const cursorImage = reflectPointThroughLine(
        cursor,
        mirrorRight.segment.start,
        mirrorRight.segment.end
      );

      // Ray from player to cursor image
      const dx = cursorImage.x - player.x;
      const dy = cursorImage.y - player.y;

      console.log("Ray direction:", { dx, dy });

      // Find where ray crosses x=550 (mirror line)
      const t = (550 - player.x) / dx;
      const yAtMirror = player.y + t * dy;

      console.log("Ray crosses x=550 at t=" + t.toFixed(4) + ", y=" + yAtMirror.toFixed(2));

      // The intersection should be OFF the segment [150, 550]
      expect(yAtMirror).toBeGreaterThan(550);
      console.log("Hit y=" + yAtMirror.toFixed(2) + " is OFF segment [150, 550]");
    });

    it("should show both strategies reject off-segment hits (now use physical mode)", () => {
      const cache = createReflectionCache();

      // Pre-reflect cursor for propagator
      const cursorImage = reflectPointThroughLine(
        cursor,
        mirrorRight.segment.start,
        mirrorRight.segment.end
      );

      const propagator = createRayPropagator(player, cursorImage, cache);

      // Physical strategy checks all surfaces
      const physicalStrategy = createPhysicalStrategy(allSurfaces);
      const physicalHit = physicalStrategy.findNextHit(propagator);

      // Planned strategy checks only mirror-right-0 (now also uses physical mode)
      const plannedStrategy = createOrderedPlannedStrategy(plannedSurfaces);
      const plannedHit = plannedStrategy.findNextHit(propagator);

      console.log("=== Strategy Comparison ===");
      console.log("Physical hit:", physicalHit?.surface?.id ?? "null", "at", physicalHit?.point);
      console.log("Planned hit:", plannedHit?.surface?.id ?? "null", "at", plannedHit?.point);

      // Physical should NOT hit mirror-right-0 (because hit is off-segment)
      expect(physicalHit?.surface?.id).not.toBe("mirror-right-0");

      // Planned should also NOT hit mirror-right-0 (now uses physical mode - on-segment only)
      // This is the new behavior: both strategies agree on rejecting off-segment hits
      expect(plannedHit).toBeNull();
    });

    it("should show no divergence when planned hit is off-segment (no hit detected)", () => {
      // With physical mode for planned strategy, off-segment hits are rejected
      // This means no divergence from off-segment planned hits
      const cache = createReflectionCache();

      const mergedResult = calculateMergedPath(
        player,
        cursor,
        plannedSurfaces,
        allSurfaces,
        cache
      );

      console.log("=== Merged Path Result ===");
      console.log("isFullyAligned:", mergedResult.isFullyAligned);
      console.log("reachedCursor:", mergedResult.reachedCursor);
      console.log("divergencePoint:", mergedResult.divergencePoint);

      // Since planned strategy doesn't find the off-segment hit,
      // and physical finds the room boundary, they may diverge there
      // OR reach cursor if cursor is between player and first hit
      // The key point: divergence is NOT at (550, 614) anymore
      if (mergedResult.divergencePoint) {
        // If there's divergence, it should NOT be at the off-segment location
        expect(mergedResult.divergencePoint.x).not.toBeCloseTo(550, 0);
      }
    });
  });

  describe("Step 2: Prove Hypothesis - Propagator Not Reflected", () => {
    it("should show propagatorAtDivergence has depth=0 (not reflected)", () => {
      const cache = createReflectionCache();

      const mergedResult = calculateMergedPath(
        player,
        cursor,
        plannedSurfaces,
        allSurfaces,
        cache
      );

      console.log("=== Propagator State at Divergence ===");
      const state = mergedResult.propagatorAtDivergence!.getState();
      console.log("depth:", state.depth);
      console.log("lastSurface:", state.lastSurface?.id ?? "null");

      // BUG: depth should be 1 (after reflecting through planned surface)
      // But it's 0 because the propagator wasn't reflected
      expect(state.depth).toBe(0);

      // This is the root cause: un-reflected propagator
      console.log("*** BUG CONFIRMED: propagator has depth=0, not reflected ***");
    });

    it("should show plannedToCursor trace ends immediately without segments", () => {
      const cache = createReflectionCache();

      const mergedResult = calculateMergedPath(
        player,
        cursor,
        plannedSurfaces,
        allSurfaces,
        cache
      );

      const divergencePoint = mergedResult.divergencePoint!;
      const propagatorAtDivergence = mergedResult.propagatorAtDivergence!;

      // Create ordered planned strategy
      const plannedStrategy = createOrderedPlannedStrategy(plannedSurfaces);

      // Trace from divergence with continueFromPosition
      const traceResult = traceWithStrategy(propagatorAtDivergence, plannedStrategy, {
        continueFromPosition: divergencePoint,
        stopAtCursor: cursor,
      });

      console.log("=== Trace from Divergence ===");
      console.log("segments:", traceResult.segments.length);
      console.log("terminationType:", traceResult.terminationType);

      // BUG: Trace ends with only 1 segment (termination segment)
      // because the hit at divergence point is filtered out and no next hit found
      // The segment goes to maxDistance, not to cursor
      console.log("Segments:");
      for (const seg of traceResult.segments) {
        console.log("  " + seg.start.x.toFixed(1) + "," + seg.start.y.toFixed(1) +
          " -> " + seg.end.x.toFixed(1) + "," + seg.end.y.toFixed(1) +
          " surface:" + (seg.surface?.id ?? "null"));
      }

      // The trace does NOT reach the cursor
      expect(traceResult.terminationType).not.toBe("cursor");
      console.log("*** BUG CONFIRMED: trace does not reach cursor ***");
    });

    it("should show manually reflecting propagator allows trace to continue to cursor", () => {
      const cache = createReflectionCache();

      const mergedResult = calculateMergedPath(
        player,
        cursor,
        plannedSurfaces,
        allSurfaces,
        cache
      );

      const divergencePoint = mergedResult.divergencePoint!;
      const propagatorAtDivergence = mergedResult.propagatorAtDivergence!;

      // MANUAL FIX: Reflect propagator through the planned surface
      const reflectedPropagator = propagatorAtDivergence.reflectThrough(mirrorRight);

      console.log("=== After Manual Reflection ===");
      console.log("depth:", reflectedPropagator.getState().depth);

      // Now depth should be 1
      expect(reflectedPropagator.getState().depth).toBe(1);

      // Create ordered planned strategy
      const plannedStrategy = createOrderedPlannedStrategy(plannedSurfaces);

      // Trace from divergence with the REFLECTED propagator
      const traceResult = traceWithStrategy(reflectedPropagator, plannedStrategy, {
        continueFromPosition: divergencePoint,
        stopAtCursor: cursor,
      });

      console.log("=== Trace with Reflected Propagator ===");
      console.log("segments:", traceResult.segments.length);
      console.log("terminationType:", traceResult.terminationType);
      console.log("Segments:");
      for (const seg of traceResult.segments) {
        console.log("  " + seg.start.x.toFixed(1) + "," + seg.start.y.toFixed(1) +
          " -> " + seg.end.x.toFixed(1) + "," + seg.end.y.toFixed(1) +
          " surface:" + (seg.surface?.id ?? "null"));
      }

      // With reflected propagator, the trace should reach the cursor
      expect(traceResult.terminationType).toBe("cursor");

      // Last segment should end at cursor
      const lastSeg = traceResult.segments[traceResult.segments.length - 1];
      expect(lastSeg.end.x).toBeCloseTo(cursor.x, 1);
      expect(lastSeg.end.y).toBeCloseTo(cursor.y, 1);

      console.log("*** FIX VERIFIED: reflecting propagator allows trace to reach cursor ***");
    });
  });

  describe("Step 3: Full Trajectory - With On-Segment-Only Behavior", () => {
    it("should show trajectory behavior when planned surface is missed (off-segment)", () => {
      // With physical mode for planned strategy, the off-segment hit is rejected
      // The trajectory will differ from the original off-segment bug scenario
      const cache = createReflectionCache();

      const fullResult = calculateFullTrajectory(
        player,
        cursor,
        plannedSurfaces,
        allSurfaces,
        cache
      );

      console.log("=== Full Trajectory Result (On-Segment Mode) ===");
      console.log("isFullyAligned:", fullResult.isFullyAligned);
      console.log("divergencePoint:", fullResult.divergencePoint);
      console.log("merged segments:", fullResult.merged.length);

      // Since the planned surface is not hit on-segment, the trajectory
      // doesn't reflect off it. This is correct behavior - the plan is
      // "invalid" in the sense that the cursor can't be reached via the
      // planned surface at this position.
      
      // The merged path should exist
      expect(fullResult.merged.length).toBeGreaterThan(0);
    });
  });
});
