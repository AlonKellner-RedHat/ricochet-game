/**
 * Midair Red Path Bug - Regression Tests
 *
 * This file contains regression tests for a bug that was fixed.
 *
 * Original Bug: The trajectory path became red at a "midair" position (no physical
 * obstacle) when the cursor was in a valid visible area.
 *
 * Root cause was: MergedPathCalculator's planned strategy found the closest hit among
 * ALL planned surfaces (ignoring order), instead of respecting surface order.
 *
 * Fix: createOrderedPlannedStrategy uses the propagator's depth to only check the
 * NEXT planned surface in order (provenance over geometry).
 *
 * These tests verify the fix works correctly and prevent regression.
 */

import { describe, it, expect } from "vitest";
import { createMockSurface, createMockBidirectionalSurface } from "@test/helpers/surfaceHelpers";
import { calculatePlannedPath } from "@/trajectory-v2/engine/PlannedPathCalculator";
import { calculateMergedPath } from "@/trajectory-v2/engine/MergedPathCalculator";
import { calculateFullTrajectory } from "@/trajectory-v2/engine/FullTrajectoryCalculator";
import { createPlannedStrategy, createPhysicalStrategy } from "@/trajectory-v2/engine/HitDetectionStrategy";
import { createRayPropagator } from "@/trajectory-v2/engine/RayPropagator";
import { createReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/types";

describe("Midair Red Path Bug", () => {
  // Exact data from user's scenario
  const player: Vector2 = { x: 170, y: 586 };
  const cursor: Vector2 = { x: 406.2967741935484, y: 396.3354838709677 };

  // The two planned mirrors - note the ORDER: right first, then left
  // This is "reversed" relative to their physical proximity to the player
  const mirrorRight = createMockBidirectionalSurface(
    "mirror-right-0",
    { x: 550, y: 150 },
    { x: 550, y: 550 }
  );

  const mirrorLeft = createMockBidirectionalSurface(
    "mirror-left-0",
    { x: 250, y: 550 },
    { x: 250, y: 150 }
  );

  // Planned surfaces in the user's order: right first, then left
  const plannedSurfaces: Surface[] = [mirrorRight, mirrorLeft];

  // All surfaces in the scene (room boundaries + obstacles + planned mirrors)
  const allSurfaces: Surface[] = [
    createMockSurface("room-0", { x: 20, y: 80 }, { x: 1260, y: 80 }, { canReflect: true }),
    createMockSurface("room-1", { x: 1260, y: 80 }, { x: 1260, y: 700 }, { canReflect: false }),
    createMockSurface("room-2", { x: 1260, y: 700 }, { x: 20, y: 700 }, { canReflect: false }),
    createMockSurface("room-3", { x: 20, y: 700 }, { x: 20, y: 80 }, { canReflect: true }),
    createMockSurface("platform-0", { x: 50, y: 620 }, { x: 200, y: 620 }, { canReflect: false }),
    mirrorLeft,
    mirrorRight,
  ];

  describe("Regression: Verify Bug is Fixed", () => {
    it("should NOT diverge at midair position (bug is fixed)", () => {
      const cache = createReflectionCache();

      // Calculate the full trajectory
      const result = calculateFullTrajectory(
        player,
        cursor,
        plannedSurfaces,
        allSurfaces,
        cache
      );

      console.log("=== Full Trajectory Result ===");
      console.log("isFullyAligned:", result.isFullyAligned);
      console.log("divergencePoint:", result.divergencePoint);
      console.log("merged segments:", result.merged.length);
      console.log("plannedToCursor segments:", result.plannedToCursor.length);

      // Log merged segments
      console.log("\n=== Merged Segments ===");
      for (const seg of result.merged) {
        console.log(
          "  (" + seg.start.x.toFixed(1) + ", " + seg.start.y.toFixed(1) + ") -> " +
            "(" + seg.end.x.toFixed(1) + ", " + seg.end.y.toFixed(1) + ") " +
            "surface: " + (seg.surface?.id ?? "null") + ", onSegment: " + seg.onSegment
        );
      }

      // FIXED: Path should now be fully aligned (no divergence)
      expect(result.isFullyAligned).toBe(true);
      expect(result.divergencePoint).toBeNull();
      expect(result.plannedToCursor.length).toBe(0);

      // First merged segment should hit mirror-right-0 (the correct first surface)
      expect(result.merged.length).toBeGreaterThanOrEqual(3);
      expect(result.merged[0]?.surface?.id).toBe("mirror-right-0");
      expect(result.merged[1]?.surface?.id).toBe("mirror-left-0");
    });

    it("should calculate pre-reflected cursor correctly", () => {
      // Verify the pre-reflected cursor calculation
      // Cursor is reflected backward through surfaces in reverse order:
      // First through mirror-left-0 (the last planned surface)
      // Then through mirror-right-0 (the first planned surface)

      // Reflect cursor through mirror-left-0 (x=250)
      const cursorImage1 = reflectPointThroughLine(
        cursor,
        mirrorLeft.segment.start,
        mirrorLeft.segment.end
      );
      console.log("Cursor image after mirror-left-0:", cursorImage1);

      // Expected: x = 2*250 - 406.3 = 93.7
      expect(cursorImage1.x).toBeCloseTo(93.7, 0);
      expect(cursorImage1.y).toBeCloseTo(cursor.y, 1);

      // Reflect through mirror-right-0 (x=550)
      const cursorImage2 = reflectPointThroughLine(
        cursorImage1,
        mirrorRight.segment.start,
        mirrorRight.segment.end
      );
      console.log("Cursor image after mirror-right-0:", cursorImage2);

      // Expected: x = 2*550 - 93.7 = 1006.3
      expect(cursorImage2.x).toBeCloseTo(1006.3, 0);
      expect(cursorImage2.y).toBeCloseTo(cursor.y, 1);
    });

    it("should verify ray geometry: where ray crosses each mirror line", () => {
      // Calculate pre-reflected cursor
      const cursorImage1 = reflectPointThroughLine(
        cursor,
        mirrorLeft.segment.start,
        mirrorLeft.segment.end
      );
      const preReflectedCursor = reflectPointThroughLine(
        cursorImage1,
        mirrorRight.segment.start,
        mirrorRight.segment.end
      );

      console.log("Pre-reflected cursor:", preReflectedCursor);

      // Ray from player toward pre-reflected cursor
      const dx = preReflectedCursor.x - player.x;
      const dy = preReflectedCursor.y - player.y;

      console.log(`Ray direction: (${dx.toFixed(2)}, ${dy.toFixed(2)})`);

      // Where does ray cross x=250 (mirror-left-0)?
      const t250 = (250 - player.x) / dx;
      const y250 = player.y + t250 * dy;
      console.log(`Ray crosses x=250 at t=${t250.toFixed(4)}, y=${y250.toFixed(2)}`);

      // Where does ray cross x=550 (mirror-right-0)?
      const t550 = (550 - player.x) / dx;
      const y550 = player.y + t550 * dy;
      console.log(`Ray crosses x=550 at t=${t550.toFixed(4)}, y=${y550.toFixed(2)}`);

      // The ray crosses x=250 FIRST (smaller t), but OFF-SEGMENT
      expect(t250).toBeLessThan(t550);

      // y at x=250 is OFF the mirror-left-0 segment [150, 550]
      const isOn250Segment = y250 >= 150 && y250 <= 550;
      console.log(`y=${y250.toFixed(2)} is on mirror-left-0 segment [150,550]: ${isOn250Segment}`);
      expect(isOn250Segment).toBe(false); // BUG CONDITION: off-segment

      // y at x=550 IS ON the mirror-right-0 segment [150, 550]
      const isOn550Segment = y550 >= 150 && y550 <= 550;
      console.log(`y=${y550.toFixed(2)} is on mirror-right-0 segment [150,550]: ${isOn550Segment}`);
      expect(isOn550Segment).toBe(true);
    });
  });

  describe("Hypothesis 1: Planned Strategy Finds Closest Hit (Ignores Order)", () => {
    it("should show planned strategy returns mirror-left-0 (wrong surface) first", () => {
      const cache = createReflectionCache();

      // Pre-reflect cursor through planned surfaces (in reverse order)
      const cursorImage1 = reflectPointThroughLine(
        cursor,
        mirrorLeft.segment.start,
        mirrorLeft.segment.end
      );
      const preReflectedCursor = reflectPointThroughLine(
        cursorImage1,
        mirrorRight.segment.start,
        mirrorRight.segment.end
      );

      // Create propagator with pre-reflected cursor (like MergedPathCalculator does)
      const propagator = createRayPropagator(player, preReflectedCursor, cache);

      // Create planned strategy
      const plannedStrategy = createPlannedStrategy(plannedSurfaces);

      // Find next hit using planned strategy
      const plannedHit = plannedStrategy.findNextHit(propagator);

      console.log("=== Planned Strategy Hit ===");
      console.log("Hit surface:", plannedHit?.surface?.id);
      console.log("Hit point:", plannedHit?.point);
      console.log("On segment:", plannedHit?.onSegment);

      // BUG: Planned strategy returns mirror-left-0 (the SECOND planned surface)
      // because it's the closest extended-line hit, ignoring the planned order
      expect(plannedHit).not.toBeNull();
      expect(plannedHit?.surface?.id).toBe("mirror-left-0"); // WRONG! Should be mirror-right-0
      expect(plannedHit?.onSegment).toBe(false); // It's on the extended line, not segment
    });

    it("should show physical strategy correctly returns mirror-right-0 first", () => {
      const cache = createReflectionCache();

      // Pre-reflect cursor (same as above)
      const cursorImage1 = reflectPointThroughLine(
        cursor,
        mirrorLeft.segment.start,
        mirrorLeft.segment.end
      );
      const preReflectedCursor = reflectPointThroughLine(
        cursorImage1,
        mirrorRight.segment.start,
        mirrorRight.segment.end
      );

      const propagator = createRayPropagator(player, preReflectedCursor, cache);

      // Create physical strategy with all surfaces
      const physicalStrategy = createPhysicalStrategy(allSurfaces);

      // Find next hit using physical strategy
      const physicalHit = physicalStrategy.findNextHit(propagator);

      console.log("=== Physical Strategy Hit ===");
      console.log("Hit surface:", physicalHit?.surface?.id);
      console.log("Hit point:", physicalHit?.point);
      console.log("On segment:", physicalHit?.onSegment);

      // Physical strategy correctly returns mirror-right-0 (on-segment hit)
      expect(physicalHit).not.toBeNull();
      expect(physicalHit?.surface?.id).toBe("mirror-right-0");
      expect(physicalHit?.onSegment).toBe(true);
    });
  });

  describe("Regression: MergedPath Now Respects Surface Order", () => {
    it("should be fully aligned with no divergence", () => {
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
      console.log("divergenceSurface.physical:", mergedResult.divergenceSurface?.physical?.id);
      console.log("divergenceSurface.planned:", mergedResult.divergenceSurface?.planned?.id);

      // FIXED: Should be fully aligned (no divergence)
      expect(mergedResult.isFullyAligned).toBe(true);
      expect(mergedResult.reachedCursor).toBe(true);

      // No divergence point
      expect(mergedResult.divergencePoint).toBeNull();
      expect(mergedResult.divergenceSurface).toBeNull();
    });
  });

  describe("Hypothesis 3: PlannedPathCalculator Differs from MergedPath Planned Hits", () => {
    it("should show PlannedPathCalculator hits surfaces in correct order", () => {
      // Calculate planned path using the correct ImageChain approach
      const plannedPath = calculatePlannedPath(player, cursor, plannedSurfaces);

      console.log("=== PlannedPathCalculator Result ===");
      console.log("Waypoints:", plannedPath.waypoints);
      console.log("Hits:");
      for (const hit of plannedPath.hits) {
        console.log(`  Surface: ${hit.surface.id}, Point: (${hit.point.x.toFixed(1)}, ${hit.point.y.toFixed(1)}), On segment: ${hit.onSegment}`);
      }

      // PlannedPathCalculator should hit surfaces IN ORDER
      expect(plannedPath.hits.length).toBe(2);
      expect(plannedPath.hits[0]?.surface.id).toBe("mirror-right-0"); // First in plan
      expect(plannedPath.hits[1]?.surface.id).toBe("mirror-left-0"); // Second in plan

      // First hit should be on mirror-right-0 at approximately (550, 500)
      expect(plannedPath.hits[0]?.point.x).toBeCloseTo(550, 0);
      expect(plannedPath.hits[0]?.point.y).toBeGreaterThan(150);
      expect(plannedPath.hits[0]?.point.y).toBeLessThan(550);
      expect(plannedPath.hits[0]?.onSegment).toBe(true);

      // Second hit should be on mirror-left-0 at approximately (250, ~430)
      expect(plannedPath.hits[1]?.point.x).toBeCloseTo(250, 0);
      expect(plannedPath.hits[1]?.point.y).toBeGreaterThan(150);
      expect(plannedPath.hits[1]?.point.y).toBeLessThan(550);
      expect(plannedPath.hits[1]?.onSegment).toBe(true);
    });

    it("should show MergedPath and PlannedPath now agree (bug fixed)", () => {
      const cache = createReflectionCache();

      const plannedPath = calculatePlannedPath(player, cursor, plannedSurfaces);
      const mergedResult = calculateMergedPath(
        player,
        cursor,
        plannedSurfaces,
        allSurfaces,
        cache
      );

      console.log("=== Comparison ===");
      console.log("PlannedPath first hit surface:", plannedPath.hits[0]?.surface.id);
      console.log("PlannedPath first hit point:", plannedPath.hits[0]?.point);
      console.log("MergedPath isFullyAligned:", mergedResult.isFullyAligned);
      console.log("MergedPath divergence point:", mergedResult.divergencePoint);

      const plannedFirstSurface = plannedPath.hits[0]?.surface.id;

      // PlannedPathCalculator correctly identifies mirror-right-0 as first hit
      expect(plannedFirstSurface).toBe("mirror-right-0");

      // FIXED: MergedPath now agrees with PlannedPath (no divergence)
      expect(mergedResult.isFullyAligned).toBe(true);
      expect(mergedResult.divergencePoint).toBeNull();

      // The first merged segment should hit mirror-right-0 (same as PlannedPath)
      expect(mergedResult.segments.length).toBeGreaterThanOrEqual(2);
      expect(mergedResult.segments[0]?.surface?.id).toBe("mirror-right-0");
      expect(mergedResult.segments[1]?.surface?.id).toBe("mirror-left-0");
    });
  });
});
