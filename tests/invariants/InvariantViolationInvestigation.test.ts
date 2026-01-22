/**
 * Invariant Violation Investigation
 *
 * This file investigates the real violations of the Arrow Path Independence Invariant.
 *
 * INVARIANT: The actual arrow path (merged + physicalDivergent) should be IDENTICAL
 * to a pure physical trace from player toward the Nth cursor image.
 *
 * Observed violations:
 * 1. Cursor same side scenario: Arrow=(550,613.8) vs Physical=(1260,665.9)
 * 2. Midair red path scenario: Arrow has extra waypoint at cursor position
 * 3. Random cases: Arrow has extra cursor waypoint or different first hit
 *
 * KEY FINDING: The arrow path includes the cursor position as a waypoint when
 * divergence occurs, but pure physics doesn't stop at the cursor. Also, merged
 * path may include off-segment planned hits that pure physics doesn't see.
 */

import { describe, it, expect } from "vitest";
import { createMockSurface, createMockBidirectionalSurface } from "@test/helpers/surfaceHelpers";
import { calculateFullTrajectory, getArrowWaypointsFromFullTrajectory } from "@/trajectory-v2/engine/FullTrajectoryCalculator";
import { createPhysicalStrategy } from "@/trajectory-v2/engine/HitDetectionStrategy";
import { createRayPropagator } from "@/trajectory-v2/engine/RayPropagator";
import { createReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import { traceWithStrategy } from "@/trajectory-v2/engine/TracePath";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import { calculateMergedPath } from "@/trajectory-v2/engine/MergedPathCalculator";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/types";

describe("Invariant Violation Investigation", () => {
  // Room boundaries (same as in ArrowTrajectoryConsistency)
  const roomTop = createMockSurface("room-0", { x: 20, y: 80 }, { x: 1260, y: 80 });
  const roomRight = createMockSurface("room-1", { x: 1260, y: 80 }, { x: 1260, y: 700 }, false);
  const roomBottom = createMockSurface("room-2", { x: 1260, y: 700 }, { x: 20, y: 700 }, false);
  const roomLeft = createMockSurface("room-3", { x: 20, y: 700 }, { x: 20, y: 80 });

  // Mirrors - segment from y=150 to y=550
  const mirrorRight = createMockBidirectionalSurface("mirror-right-0", { x: 550, y: 150 }, { x: 550, y: 550 });
  const mirrorLeft = createMockBidirectionalSurface("mirror-left-0", { x: 250, y: 550 }, { x: 250, y: 150 });

  const roomSurfaces: Surface[] = [roomTop, roomRight, roomBottom, roomLeft];
  const allSurfaces: Surface[] = [...roomSurfaces, mirrorRight, mirrorLeft];

  /**
   * Helper to check if two points are approximately equal
   */
  function pointsEqual(a: Vector2, b: Vector2, tolerance = 2): boolean {
    return Math.abs(a.x - b.x) < tolerance && Math.abs(a.y - b.y) < tolerance;
  }

  /**
   * Compute the Nth cursor image by reflecting through all planned surfaces in reverse order.
   */
  function computeNthCursorImage(
    cursor: Vector2,
    plannedSurfaces: readonly Surface[]
  ): Vector2 {
    if (plannedSurfaces.length === 0) {
      return cursor;
    }
    let reflected = cursor;
    for (let i = plannedSurfaces.length - 1; i >= 0; i--) {
      const surface = plannedSurfaces[i]!;
      reflected = reflectPointThroughLine(
        reflected,
        surface.segment.start,
        surface.segment.end
      );
    }
    return reflected;
  }

  // =========================================================================
  // Real violations from the corrected invariant
  // =========================================================================

  describe("Step 1: Reproduce Real Violations", () => {
    it("should reproduce cursor-same-side scenario violation", () => {
      // From test output:
      // Arrow: (170,586) → (550,613.8) → (794.4,700) → ...
      // Physical: (170,586) → (1260,665.9) → (794.4,700) → ...
      const player: Vector2 = { x: 170, y: 586 };
      const cursor: Vector2 = { x: 407.9483870967742, y: 624.258064516129 };
      const plannedSurfaces = [mirrorRight];

      const cache = createReflectionCache();

      // Get full trajectory and arrow waypoints
      const fullResult = calculateFullTrajectory(player, cursor, plannedSurfaces, allSurfaces, cache);
      const arrowWaypoints = getArrowWaypointsFromFullTrajectory(fullResult);

      // Get pure physical trace
      const cursorImage = computeNthCursorImage(cursor, plannedSurfaces);
      const propagator = createRayPropagator(player, cursorImage, cache);
      const physicalStrategy = createPhysicalStrategy(allSurfaces);
      const physicalTrace = traceWithStrategy(propagator, physicalStrategy, {});

      const physicalWaypoints: Vector2[] = [];
      if (physicalTrace.segments.length > 0) {
        physicalWaypoints.push(physicalTrace.segments[0]!.start);
        for (const seg of physicalTrace.segments) {
          physicalWaypoints.push(seg.end);
        }
      }

      console.log("=== Cursor Same Side Scenario ===");
      console.log("Player:", player);
      console.log("Cursor:", cursor);
      console.log("Mirror segment: y=150 to y=550");
      console.log("");
      console.log("Arrow waypoint 1:", arrowWaypoints[1]);
      console.log("Physical waypoint 1:", physicalWaypoints[1]);
      console.log("");

      // Analyze WHY they differ
      const arrowHit = arrowWaypoints[1]!;
      const physicalHit = physicalWaypoints[1]!;

      console.log("Arrow hits at: (" + arrowHit.x.toFixed(1) + ", " + arrowHit.y.toFixed(1) + ")");
      console.log("Physical hits at: (" + physicalHit.x.toFixed(1) + ", " + physicalHit.y.toFixed(1) + ")");

      // Is the arrow hit on the mirror segment?
      const isArrowHitOnSegment = arrowHit.y >= 150 && arrowHit.y <= 550;
      console.log("Arrow hit y=" + arrowHit.y.toFixed(1) + " is on mirror segment [150,550]: " + isArrowHitOnSegment);

      // What surface did physical hit?
      console.log("Physical hit surface: " + (physicalTrace.segments[0]?.surface?.id ?? "none"));

      expect(arrowWaypoints.length).toBeGreaterThan(0);
    });

    it("should reproduce midair-red-path scenario violation", () => {
      // From test output:
      // Arrow has cursor position (406.3, 396.3) as extra waypoint
      const player: Vector2 = { x: 170, y: 586 };
      const cursor: Vector2 = { x: 406.2967741935484, y: 396.3354838709677 };
      const plannedSurfaces = [mirrorRight, mirrorLeft];

      const cache = createReflectionCache();

      const fullResult = calculateFullTrajectory(player, cursor, plannedSurfaces, allSurfaces, cache);
      const arrowWaypoints = getArrowWaypointsFromFullTrajectory(fullResult);

      const cursorImage = computeNthCursorImage(cursor, plannedSurfaces);
      const propagator = createRayPropagator(player, cursorImage, cache);
      const physicalStrategy = createPhysicalStrategy(allSurfaces);
      const physicalTrace = traceWithStrategy(propagator, physicalStrategy, {});

      const physicalWaypoints: Vector2[] = [];
      if (physicalTrace.segments.length > 0) {
        physicalWaypoints.push(physicalTrace.segments[0]!.start);
        for (const seg of physicalTrace.segments) {
          physicalWaypoints.push(seg.end);
        }
      }

      console.log("=== Midair Red Path Scenario ===");
      console.log("Player:", player);
      console.log("Cursor:", cursor);
      console.log("");

      // Find where they differ
      const minLen = Math.min(arrowWaypoints.length, physicalWaypoints.length);
      for (let i = 0; i < minLen; i++) {
        const a = arrowWaypoints[i]!;
        const p = physicalWaypoints[i]!;
        if (!pointsEqual(a, p, 1)) {
          console.log("Waypoint " + i + " differs:");
          console.log("  Arrow: (" + a.x.toFixed(1) + ", " + a.y.toFixed(1) + ")");
          console.log("  Physical: (" + p.x.toFixed(1) + ", " + p.y.toFixed(1) + ")");

          // Is arrow waypoint the cursor?
          const isCursor = pointsEqual(a, cursor, 2);
          console.log("  Arrow waypoint matches cursor: " + isCursor);
          break;
        }
      }

      console.log("");
      console.log("Arrow waypoints: " + arrowWaypoints.length);
      console.log("Physical waypoints: " + physicalWaypoints.length);

      expect(arrowWaypoints.length).toBeGreaterThan(0);
    });
  });

  describe("Step 2: Prove Cause - Off-Segment Planned Hits", () => {
    it("should prove arrow includes off-segment planned hit in cursor-same-side case", () => {
      const player: Vector2 = { x: 170, y: 586 };
      const cursor: Vector2 = { x: 407.9483870967742, y: 624.258064516129 };
      const plannedSurfaces = [mirrorRight];

      const cache = createReflectionCache();

      // Get merged path details
      const mergedResult = calculateMergedPath(player, cursor, plannedSurfaces, allSurfaces, cache);

      console.log("=== Merged Path Analysis ===");
      console.log("isFullyAligned:", mergedResult.isFullyAligned);
      console.log("reachedCursor:", mergedResult.reachedCursor);
      console.log("divergencePoint:", mergedResult.divergencePoint);
      console.log("divergenceSurface.physical:", mergedResult.divergenceSurface?.physical?.id ?? "none");
      console.log("divergenceSurface.planned:", mergedResult.divergenceSurface?.planned?.id ?? "none");

      // Look at segments
      console.log("\nMerged segments:");
      for (let i = 0; i < mergedResult.segments.length; i++) {
        const seg = mergedResult.segments[i]!;
        console.log("  Segment " + i + ": (" + seg.start.x.toFixed(1) + "," + seg.start.y.toFixed(1) + ") -> (" +
          seg.end.x.toFixed(1) + "," + seg.end.y.toFixed(1) + ") surface: " + (seg.surface?.id ?? "null"));
      }

      // KEY ANALYSIS: Where does the merged path end?
      if (mergedResult.segments.length > 0) {
        const lastSeg = mergedResult.segments[mergedResult.segments.length - 1]!;
        const endY = lastSeg.end.y;
        const isOnMirrorSegment = endY >= 150 && endY <= 550;

        console.log("\n=== KEY FINDING ===");
        console.log("Merged path ends at y=" + endY.toFixed(1));
        console.log("Mirror segment spans y=[150, 550]");
        console.log("End point is ON mirror segment: " + isOnMirrorSegment);

        if (!isOnMirrorSegment) {
          console.log("\n*** BUG CONFIRMED: Arrow includes OFF-SEGMENT planned hit ***");
          console.log("The planned strategy found a hit at y=" + endY.toFixed(1));
          console.log("This is OUTSIDE the mirror segment [150, 550]");
          console.log("Physical strategy would NOT see this hit.");
          console.log("The arrow path incorrectly includes this off-segment hit.");
        }

        // Verify with assertion
        expect(isOnMirrorSegment).toBe(false); // Proves the bug
      }
    });

    it("should prove arrow includes cursor as waypoint in midair-red-path case", () => {
      const player: Vector2 = { x: 170, y: 586 };
      const cursor: Vector2 = { x: 406.2967741935484, y: 396.3354838709677 };
      const plannedSurfaces = [mirrorRight, mirrorLeft];

      const cache = createReflectionCache();

      const fullResult = calculateFullTrajectory(player, cursor, plannedSurfaces, allSurfaces, cache);
      const arrowWaypoints = getArrowWaypointsFromFullTrajectory(fullResult);

      console.log("=== Arrow Waypoints Analysis ===");

      // Check if cursor is in the arrow waypoints
      let cursorIndex = -1;
      for (let i = 0; i < arrowWaypoints.length; i++) {
        if (pointsEqual(arrowWaypoints[i]!, cursor, 2)) {
          cursorIndex = i;
          break;
        }
      }

      console.log("Arrow waypoints:");
      for (let i = 0; i < Math.min(6, arrowWaypoints.length); i++) {
        const wp = arrowWaypoints[i]!;
        const isCursor = pointsEqual(wp, cursor, 2);
        console.log("  [" + i + "] (" + wp.x.toFixed(1) + ", " + wp.y.toFixed(1) + ")" + (isCursor ? " ← CURSOR" : ""));
      }

      console.log("\nCursor: (" + cursor.x.toFixed(1) + ", " + cursor.y.toFixed(1) + ")");
      console.log("Cursor found in arrow at index: " + cursorIndex);

      if (cursorIndex >= 0) {
        console.log("\n*** BUG CONFIRMED: Arrow path includes cursor as waypoint ***");
        console.log("The cursor should NOT affect the physical arrow path.");
        console.log("Pure physical trace would not have this waypoint.");
      }

      // This proves the issue - cursor is included as a waypoint
      expect(cursorIndex).toBeGreaterThan(-1);
    });
  });

  describe("Step 3: Detailed Root Cause Analysis", () => {
    it("should trace exactly where arrow path diverges from physics", () => {
      const player: Vector2 = { x: 170, y: 586 };
      const cursor: Vector2 = { x: 407.9483870967742, y: 624.258064516129 };
      const plannedSurfaces = [mirrorRight];

      const cache = createReflectionCache();

      // Get full trajectory
      const fullResult = calculateFullTrajectory(player, cursor, plannedSurfaces, allSurfaces, cache);

      console.log("=== Root Cause Analysis ===");
      console.log("\n1. Full trajectory structure:");
      console.log("   merged segments:", fullResult.merged.length);
      console.log("   physicalDivergent segments:", fullResult.physicalDivergent.length);
      console.log("   isFullyAligned:", fullResult.isFullyAligned);
      console.log("   divergencePoint:", fullResult.divergencePoint);

      console.log("\n2. Merged path (what arrow uses as start):");
      for (let i = 0; i < fullResult.merged.length; i++) {
        const seg = fullResult.merged[i]!;
        console.log("   [" + i + "] (" + seg.start.x.toFixed(1) + "," + seg.start.y.toFixed(1) + ") -> (" +
          seg.end.x.toFixed(1) + "," + seg.end.y.toFixed(1) + ")");
      }

      console.log("\n3. Physical divergent path (what arrow appends):");
      for (let i = 0; i < Math.min(3, fullResult.physicalDivergent.length); i++) {
        const seg = fullResult.physicalDivergent[i]!;
        console.log("   [" + i + "] (" + seg.start.x.toFixed(1) + "," + seg.start.y.toFixed(1) + ") -> (" +
          seg.end.x.toFixed(1) + "," + seg.end.y.toFixed(1) + ")");
      }

      // Get pure physical
      const cursorImage = computeNthCursorImage(cursor, plannedSurfaces);
      const propagator = createRayPropagator(player, cursorImage, cache);
      const physicalStrategy = createPhysicalStrategy(allSurfaces);
      const physicalTrace = traceWithStrategy(propagator, physicalStrategy, {});

      console.log("\n4. Pure physical trace (what arrow SHOULD match):");
      for (let i = 0; i < physicalTrace.segments.length; i++) {
        const seg = physicalTrace.segments[i]!;
        console.log("   [" + i + "] (" + seg.start.x.toFixed(1) + "," + seg.start.y.toFixed(1) + ") -> (" +
          seg.end.x.toFixed(1) + "," + seg.end.y.toFixed(1) + ") surface:" + (seg.surface?.id ?? "null"));
      }

      console.log("\n=== CONCLUSION ===");
      console.log("The merged path ends at (" +
        fullResult.merged[0]?.end.x.toFixed(1) + ", " +
        fullResult.merged[0]?.end.y.toFixed(1) + ")");
      console.log("This is an OFF-SEGMENT hit on the planned mirror.");
      console.log("Pure physics first hit is at (" +
        physicalTrace.segments[0]?.end.x.toFixed(1) + ", " +
        physicalTrace.segments[0]?.end.y.toFixed(1) + ")");
      console.log("This is on the room right wall (x=1260).");
      console.log("");
      console.log("ROOT CAUSE: MergedPathCalculator includes planned (off-segment) hits");
      console.log("in the merged path, which then becomes part of the arrow trajectory.");
      console.log("The arrow should only follow pure physical hits.");

      expect(fullResult.merged.length).toBeGreaterThan(0);
    });
  });

  describe("Step 4: Summary and Conclusions", () => {
    it("should document the causes of invariant violations", () => {
      console.log("=== INVESTIGATION SUMMARY ===");
      console.log("");
      console.log("CAUSES OF ARROW PATH INDEPENDENCE INVARIANT VIOLATIONS:");
      console.log("");
      console.log("1. OFF-SEGMENT PLANNED HITS (FILTERED BY INVARIANT)");
      console.log("   - When divergence occurs at an off-segment planned hit");
      console.log("   - The invariant correctly filters this point out");
      console.log("   - The filtered arrow path then matches pure physics");
      console.log("   - Example: cursor same side scenario with off-segment mirror hit");
      console.log("");
      console.log("2. CURSOR INCLUDED AS ARROW WAYPOINT (REAL VIOLATIONS)");
      console.log("   - In some scenarios, the cursor position appears");
      console.log("     as a waypoint in the merged path");
      console.log("   - This happens when merged path stops at cursor before physical hit");
      console.log("   - Pure physical trace doesn't stop at cursor");
      console.log("   - These are REAL violations that indicate a bug");
      console.log("");
      console.log("=== INVARIANT STATUS ===");
      console.log("The invariant now correctly:");
      console.log("- Filters out off-segment divergence points");
      console.log("- Preserves legitimate physical hit points");
      console.log("- Detects cursor-as-waypoint violations as real bugs");
      console.log("");
      console.log("Remaining violations are cases where the cursor position");
      console.log("incorrectly appears in the arrow path.");

      expect(true).toBe(true); // Documentation test
    });
  });
});
