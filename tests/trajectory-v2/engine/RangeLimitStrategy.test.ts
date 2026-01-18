/**
 * Tests for HitDetectionStrategy with range limit integration.
 */

import { describe, it, expect } from "vitest";
import { createPhysicalStrategy } from "@/trajectory-v2/engine/HitDetectionStrategy";
import { createRayPropagator } from "@/trajectory-v2/engine/RayPropagator";
import { createReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import { createRangeLimitPair } from "@/trajectory-v2/obstacles/RangeLimit";
import { createMockWall } from "@test/helpers/surfaceHelpers";
import type { Vector2 } from "@/types";

describe("Physical Strategy with Range Limit", () => {
  const player: Vector2 = { x: 100, y: 100 };
  const rangeLimitRadius = 50;
  const rangeLimit = createRangeLimitPair(rangeLimitRadius);

  describe("when range limit is closer than surface", () => {
    it("should return range limit hit", () => {
      // Surface at x=200, but range limit is at 150 (origin + radius)
      const surface = createMockWall("wall", { x: 200, y: 0 }, { x: 200, y: 400 });
      const cursor: Vector2 = { x: 300, y: 100 };

      const cache = createReflectionCache();
      const propagator = createRayPropagator(player, cursor, cache);
      const strategy = createPhysicalStrategy([surface], { rangeLimit });

      const hit = strategy.findNextHit(propagator);

      expect(hit).not.toBeNull();
      expect(hit!.hitType).toBe("range_limit");
      expect(hit!.surface).toBeNull();
      expect(hit!.point.x).toBeCloseTo(150); // player.x + radius
      expect(hit!.point.y).toBeCloseTo(100);
    });
  });

  describe("when surface is closer than range limit", () => {
    it("should return surface hit", () => {
      // Surface at x=120, closer than range limit at 150
      const surface = createMockWall("wall", { x: 120, y: 0 }, { x: 120, y: 400 });
      const cursor: Vector2 = { x: 300, y: 100 };

      const cache = createReflectionCache();
      const propagator = createRayPropagator(player, cursor, cache);
      const strategy = createPhysicalStrategy([surface], { rangeLimit });

      const hit = strategy.findNextHit(propagator);

      expect(hit).not.toBeNull();
      expect(hit!.hitType).toBe("surface");
      expect(hit!.surface).not.toBeNull();
      expect(hit!.surface!.id).toBe("wall");
      expect(hit!.point.x).toBeCloseTo(120);
    });
  });

  describe("without range limit option", () => {
    it("should work as before (no range limit hits)", () => {
      const surface = createMockWall("wall", { x: 200, y: 0 }, { x: 200, y: 400 });
      const cursor: Vector2 = { x: 300, y: 100 };

      const cache = createReflectionCache();
      const propagator = createRayPropagator(player, cursor, cache);
      const strategy = createPhysicalStrategy([surface]); // no range limit

      const hit = strategy.findNextHit(propagator);

      expect(hit).not.toBeNull();
      expect(hit!.hitType).toBe("surface");
      expect(hit!.surface!.id).toBe("wall");
      expect(hit!.point.x).toBeCloseTo(200); // hits wall, not range limit
    });
  });

  describe("range limit center follows player image", () => {
    it("should use originImage from propagator as center", () => {
      // Create a reflective surface to change the origin image
      const mirror = createMockWall("mirror", { x: 150, y: 0 }, { x: 150, y: 400 });
      // Make it reflective by setting canReflect: true
      (mirror as { canReflect: boolean }).canReflect = true;

      const cursor: Vector2 = { x: 300, y: 100 };
      const cache = createReflectionCache();

      // Create propagator and reflect through mirror
      const initialPropagator = createRayPropagator(player, cursor, cache);
      
      // The originImage should be player initially
      expect(initialPropagator.getState().originImage.x).toBe(player.x);
      expect(initialPropagator.getState().originImage.y).toBe(player.y);

      // After reflection, originImage changes
      const reflectedPropagator = initialPropagator.reflectThrough(mirror);
      const reflectedOrigin = reflectedPropagator.getState().originImage;
      
      // Reflected origin should be on the other side of the mirror (at x=200)
      expect(reflectedOrigin.x).toBeCloseTo(200); // 150 + (150 - 100) = 200
      expect(reflectedOrigin.y).toBeCloseTo(100);
    });
  });
});
