/**
 * Tests for HitDetectionStrategy interface and implementations.
 *
 * The strategy pattern abstracts hit detection logic, allowing the same
 * outer tracing loop to work with different hit detection rules:
 * - PhysicalStrategy: Only on-segment hits, uses all surfaces
 * - PlannedStrategy: Extended line hits, uses only planned surfaces
 */

import { describe, it, expect } from "vitest";
import {
  createPhysicalStrategy,
  createPlannedStrategy,
  type HitDetectionStrategy,
  type StrategyHitResult,
} from "@/trajectory-v2/engine/HitDetectionStrategy";
import { createRayPropagator } from "@/trajectory-v2/engine/RayPropagator";
import { createMockSurface, createMockWall } from "@test/helpers/surfaceHelpers";
import type { Vector2 } from "@/types";

describe("HitDetectionStrategy", () => {
  describe("PhysicalStrategy", () => {
    it("should only return on-segment hits", () => {
      // Surface that's off to the side - ray would hit extended line but not segment
      const surface = createMockSurface(
        "surface",
        { x: 200, y: 50 },
        { x: 200, y: 150 }
      );

      // Ray goes toward x=200 but misses the segment (y: 50-150)
      const propagator = createRayPropagator(
        { x: 100, y: 200 }, // origin
        { x: 300, y: 200 }  // target - hits extended line at y=200, outside segment
      );

      const strategy = createPhysicalStrategy([surface]);
      const hit = strategy.findNextHit(propagator);

      // Should be null because the hit is off-segment
      expect(hit).toBeNull();
    });

    it("should return on-segment hits", () => {
      const surface = createMockSurface(
        "surface",
        { x: 200, y: 0 },
        { x: 200, y: 400 }
      );

      const propagator = createRayPropagator(
        { x: 100, y: 200 },
        { x: 300, y: 200 } // hits at (200, 200) which is on segment
      );

      const strategy = createPhysicalStrategy([surface]);
      const hit = strategy.findNextHit(propagator);

      expect(hit).not.toBeNull();
      expect(hit!.onSegment).toBe(true);
      expect(hit!.point.x).toBeCloseTo(200);
      expect(hit!.point.y).toBeCloseTo(200);
    });

    it("should check canReflectFrom for reflection eligibility", () => {
      // Surface facing away from the ray
      const surface = createMockSurface(
        "surface",
        { x: 200, y: 400 }, // note: reversed direction
        { x: 200, y: 0 }
      );

      const propagator = createRayPropagator(
        { x: 100, y: 200 },
        { x: 300, y: 200 }
      );

      const strategy = createPhysicalStrategy([surface]);
      const hit = strategy.findNextHit(propagator);

      expect(hit).not.toBeNull();
      // canReflect should be false because ray is hitting from back side
      expect(hit!.canReflect).toBe(false);
    });

    it("should use all surfaces for hit detection", () => {
      const surface1 = createMockSurface(
        "surface1",
        { x: 150, y: 0 },
        { x: 150, y: 400 }
      );
      const surface2 = createMockSurface(
        "surface2",
        { x: 250, y: 0 },
        { x: 250, y: 400 }
      );

      const propagator = createRayPropagator(
        { x: 100, y: 200 },
        { x: 300, y: 200 }
      );

      const strategy = createPhysicalStrategy([surface1, surface2]);
      const hit = strategy.findNextHit(propagator);

      // Should hit the closer surface (surface1 at x=150)
      expect(hit).not.toBeNull();
      expect(hit!.surface.id).toBe("surface1");
      expect(hit!.point.x).toBeCloseTo(150);
    });

    it("should use startLine from propagator state after reflection", () => {
      // Parallel mirrors setup: player between mirrors
      // After hitting mirror2 at x=200, ray reflects back toward mirror1 at x=100
      const mirror1 = createMockSurface(
        "mirror1",
        { x: 100, y: 0 },
        { x: 100, y: 400 }
      );
      const mirror2 = createMockSurface(
        "mirror2",
        { x: 200, y: 400 }, // reversed so it reflects from right side
        { x: 200, y: 0 }
      );

      // Player between mirrors, cursor to the right
      const propagator = createRayPropagator(
        { x: 150, y: 200 }, // origin between mirrors
        { x: 300, y: 200 }  // target to the right
      );

      const strategy = createPhysicalStrategy([mirror1, mirror2]);

      // First hit: mirror2 at x=200
      const hit1 = strategy.findNextHit(propagator);
      expect(hit1).not.toBeNull();
      expect(hit1!.surface.id).toBe("mirror2");

      // Reflect through mirror2
      const reflectedPropagator = propagator.reflectThrough(hit1!.surface);

      // After reflection:
      // - Origin image: (250, 200) - reflected through x=200
      // - Target image: (100, 200) - reflected through x=200
      // - Ray goes leftward, should hit mirror1 at x=100
      // - mirror2 should be excluded due to startLine
      const hit2 = strategy.findNextHit(reflectedPropagator);
      expect(hit2).not.toBeNull();
      expect(hit2!.surface.id).toBe("mirror1");
    });

    it("should return mode as 'physical'", () => {
      const strategy = createPhysicalStrategy([]);
      expect(strategy.mode).toBe("physical");
    });
  });

  describe("PlannedStrategy", () => {
    it("should reject off-segment hits (uses physical mode)", () => {
      // Surface that's off to the side
      const surface = createMockSurface(
        "surface",
        { x: 200, y: 50 },
        { x: 200, y: 150 }
      );

      // Ray would hit extended line at y=200 but not the segment
      const propagator = createRayPropagator(
        { x: 100, y: 200 },
        { x: 300, y: 200 }
      );

      const strategy = createPlannedStrategy([surface]);
      const hit = strategy.findNextHit(propagator);

      // Should return null (off-segment hit rejected in physical mode)
      expect(hit).toBeNull();
    });

    it("should only use planned surfaces", () => {
      const plannedSurface = createMockSurface(
        "planned",
        { x: 250, y: 0 },
        { x: 250, y: 400 }
      );
      const nonPlannedSurface = createMockSurface(
        "not-planned",
        { x: 150, y: 0 },
        { x: 150, y: 400 }
      );

      const propagator = createRayPropagator(
        { x: 100, y: 200 },
        { x: 300, y: 200 }
      );

      // Only pass planned surfaces to the strategy
      const strategy = createPlannedStrategy([plannedSurface]);
      const hit = strategy.findNextHit(propagator);

      // Should hit planned surface, ignoring the closer non-planned surface
      expect(hit).not.toBeNull();
      expect(hit!.surface.id).toBe("planned");
      expect(hit!.point.x).toBeCloseTo(250);
    });

    it("should always allow reflection on planned surfaces (canReflect true)", () => {
      // Even a wall should be considered reflective in planned mode
      const wall = createMockWall(
        "wall",
        { x: 200, y: 0 },
        { x: 200, y: 400 }
      );

      const propagator = createRayPropagator(
        { x: 100, y: 200 },
        { x: 300, y: 200 }
      );

      const strategy = createPlannedStrategy([wall]);
      const hit = strategy.findNextHit(propagator);

      expect(hit).not.toBeNull();
      // In planned mode, surfaces are always considered reflective
      expect(hit!.canReflect).toBe(true);
    });

    it("should return mode as 'physical' (on-segment only)", () => {
      // Planned strategy now uses physical mode for on-segment-only detection
      const strategy = createPlannedStrategy([]);
      expect(strategy.mode).toBe("physical");
    });

    it("should use startLine from propagator state after reflection", () => {
      // Parallel mirrors setup: player between mirrors
      const mirror1 = createMockSurface(
        "mirror1",
        { x: 100, y: 0 },
        { x: 100, y: 400 }
      );
      const mirror2 = createMockSurface(
        "mirror2",
        { x: 200, y: 400 },
        { x: 200, y: 0 }
      );

      // Player between mirrors, cursor to the right
      const propagator = createRayPropagator(
        { x: 150, y: 200 },
        { x: 300, y: 200 }
      );

      const strategy = createPlannedStrategy([mirror1, mirror2]);

      // First hit: mirror2
      const hit1 = strategy.findNextHit(propagator);
      expect(hit1!.surface.id).toBe("mirror2");

      // Reflect
      const reflectedPropagator = propagator.reflectThrough(hit1!.surface);

      // Next hit should skip mirror2 due to startLine
      const hit2 = strategy.findNextHit(reflectedPropagator);
      expect(hit2).not.toBeNull();
      expect(hit2!.surface.id).toBe("mirror1");
    });
  });

  describe("Strategy Comparison", () => {
    it("should return same result for on-segment hits", () => {
      const surface = createMockSurface(
        "surface",
        { x: 200, y: 0 },
        { x: 200, y: 400 }
      );

      const propagator = createRayPropagator(
        { x: 100, y: 200 },
        { x: 300, y: 200 }
      );

      const physicalStrategy = createPhysicalStrategy([surface]);
      const plannedStrategy = createPlannedStrategy([surface]);

      const physicalHit = physicalStrategy.findNextHit(propagator);
      const plannedHit = plannedStrategy.findNextHit(propagator);

      // Both should hit the same surface at the same point
      expect(physicalHit).not.toBeNull();
      expect(plannedHit).not.toBeNull();
      expect(physicalHit!.surface.id).toBe(plannedHit!.surface.id);
      expect(physicalHit!.point.x).toBeCloseTo(plannedHit!.point.x);
      expect(physicalHit!.point.y).toBeCloseTo(plannedHit!.point.y);
    });

    it("should behave identically for off-segment (both return null)", () => {
      // Both strategies now use physical mode (on-segment only)
      const surface = createMockSurface(
        "surface",
        { x: 200, y: 50 },
        { x: 200, y: 150 }
      );

      const propagator = createRayPropagator(
        { x: 100, y: 200 },
        { x: 300, y: 200 }
      );

      const physicalStrategy = createPhysicalStrategy([surface]);
      const plannedStrategy = createPlannedStrategy([surface]);

      const physicalHit = physicalStrategy.findNextHit(propagator);
      const plannedHit = plannedStrategy.findNextHit(propagator);

      // Both reject off-segment hits
      expect(physicalHit).toBeNull();
      expect(plannedHit).toBeNull();
    });
  });
});
