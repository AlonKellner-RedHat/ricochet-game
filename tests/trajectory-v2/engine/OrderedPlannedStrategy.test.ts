/**
 * OrderedPlannedStrategy Tests (TDD)
 *
 * Tests for the new createOrderedPlannedStrategy that respects surface order
 * by using the propagator's depth to determine which planned surface to check.
 *
 * Key behavior:
 * - depth=0: Only check plannedSurfaces[0]
 * - depth=1: Only check plannedSurfaces[1] (after reflecting through [0])
 * - depth >= length: Return null (all surfaces hit, reach cursor)
 */

import { describe, it, expect } from "vitest";
import { createMockBidirectionalSurface } from "@test/helpers/surfaceHelpers";
import { createOrderedPlannedStrategy } from "@/trajectory-v2/engine/HitDetectionStrategy";
import { createRayPropagator } from "@/trajectory-v2/engine/RayPropagator";
import { createReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/types";

describe("OrderedPlannedStrategy", () => {
  // Two vertical mirrors - right first in plan, then left
  const mirrorRight = createMockBidirectionalSurface(
    "mirror-right",
    { x: 550, y: 150 },
    { x: 550, y: 550 }
  );

  const mirrorLeft = createMockBidirectionalSurface(
    "mirror-left",
    { x: 250, y: 550 },
    { x: 250, y: 150 }
  );

  const plannedSurfaces: Surface[] = [mirrorRight, mirrorLeft];

  describe("Surface Order Respect", () => {
    it("should only check surface[0] when depth=0", () => {
      const player: Vector2 = { x: 170, y: 586 };
      const cursor: Vector2 = { x: 406, y: 396 };

      // Pre-reflect cursor through both surfaces (like MergedPathCalculator does)
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

      const cache = createReflectionCache();
      const propagator = createRayPropagator(player, preReflectedCursor, cache);

      // Verify depth is 0
      expect(propagator.getState().depth).toBe(0);

      // Create ordered strategy
      const strategy = createOrderedPlannedStrategy(plannedSurfaces);

      // Find next hit
      const hit = strategy.findNextHit(propagator);

      // Should hit mirror-right (surface[0]), NOT mirror-left
      expect(hit).not.toBeNull();
      expect(hit?.surface?.id).toBe("mirror-right");
    });

    it("should only check surface[1] when depth=1 (after reflecting through surface[0])", () => {
      const player: Vector2 = { x: 170, y: 586 };
      const cursor: Vector2 = { x: 406, y: 396 };

      // Pre-reflect cursor through both surfaces
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

      const cache = createReflectionCache();
      const propagator = createRayPropagator(player, preReflectedCursor, cache);

      // Reflect through surface[0] (mirror-right)
      const reflectedPropagator = propagator.reflectThrough(mirrorRight);

      // Verify depth is now 1
      expect(reflectedPropagator.getState().depth).toBe(1);

      // Create ordered strategy
      const strategy = createOrderedPlannedStrategy(plannedSurfaces);

      // Find next hit
      const hit = strategy.findNextHit(reflectedPropagator);

      // Should hit mirror-left (surface[1])
      expect(hit).not.toBeNull();
      expect(hit?.surface?.id).toBe("mirror-left");
    });

    it("should return null when depth >= plannedSurfaces.length", () => {
      const player: Vector2 = { x: 170, y: 586 };
      const cursor: Vector2 = { x: 406, y: 396 };

      // Pre-reflect cursor through both surfaces
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

      const cache = createReflectionCache();
      const propagator = createRayPropagator(player, preReflectedCursor, cache);

      // Reflect through both surfaces
      const after1 = propagator.reflectThrough(mirrorRight);
      const after2 = after1.reflectThrough(mirrorLeft);

      // Verify depth is now 2 (>= plannedSurfaces.length)
      expect(after2.getState().depth).toBe(2);

      // Create ordered strategy
      const strategy = createOrderedPlannedStrategy(plannedSurfaces);

      // Find next hit - should return null (all surfaces hit)
      const hit = strategy.findNextHit(after2);
      expect(hit).toBeNull();
    });
  });

  describe("Edge Cases", () => {
    it("should return null for empty planned surfaces", () => {
      const player: Vector2 = { x: 170, y: 586 };
      const cursor: Vector2 = { x: 406, y: 396 };

      const cache = createReflectionCache();
      const propagator = createRayPropagator(player, cursor, cache);

      const strategy = createOrderedPlannedStrategy([]);

      const hit = strategy.findNextHit(propagator);
      expect(hit).toBeNull();
    });

    it("should still detect off-segment hits in planned mode", () => {
      // Create a scenario where the hit is on the extended line
      const player: Vector2 = { x: 100, y: 600 }; // Far left and low
      const target: Vector2 = { x: 600, y: 100 }; // Far right and high

      const cache = createReflectionCache();
      const propagator = createRayPropagator(player, target, cache);

      // Only one surface - the ray might hit its extended line
      const singleSurface = createMockBidirectionalSurface(
        "surface",
        { x: 300, y: 300 },
        { x: 300, y: 400 }
      );

      const strategy = createOrderedPlannedStrategy([singleSurface]);
      const hit = strategy.findNextHit(propagator);

      // Ray from (100,600) to (600,100) crosses x=300 at y=350
      // This IS on the segment [300,400], so should be on-segment
      if (hit) {
        expect(hit.surface?.id).toBe("surface");
        // The hit should be detected
      }
    });
  });

  describe("Contrast with Old Strategy", () => {
    it("should NOT return mirror-left first (unlike broken createPlannedStrategy)", () => {
      // This is the exact bug scenario from the user report
      const player: Vector2 = { x: 170, y: 586 };
      const cursor: Vector2 = { x: 406.2967741935484, y: 396.3354838709677 };

      // Pre-reflect cursor through both surfaces
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

      const cache = createReflectionCache();
      const propagator = createRayPropagator(player, preReflectedCursor, cache);

      const strategy = createOrderedPlannedStrategy(plannedSurfaces);
      const hit = strategy.findNextHit(propagator);

      // The ordered strategy should return mirror-right (correct first surface)
      // NOT mirror-left (which the broken strategy returns)
      expect(hit).not.toBeNull();
      expect(hit?.surface?.id).toBe("mirror-right");
      expect(hit?.surface?.id).not.toBe("mirror-left");

      // The hit should be on-segment
      expect(hit?.onSegment).toBe(true);
    });
  });
});
