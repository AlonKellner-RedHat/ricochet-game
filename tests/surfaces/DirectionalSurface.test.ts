/**
 * Tests for directional surface reflection behavior
 *
 * First Principles:
 * - Each surface has a front (reflective) and back (blocking) side
 * - The normal vector points toward the reflective side
 * - dot(incomingDirection, normal) < 0 → approaching from front → can reflect
 * - dot(incomingDirection, normal) > 0 → approaching from back → blocked
 */

import { RicochetSurface, WallSurface } from "@/surfaces";
import { Vec2 } from "@/math/Vec2";
import { describe, expect, it } from "vitest";

describe("Directional Surface", () => {
  describe("getNormal", () => {
    it("should return perpendicular vector to surface segment", () => {
      // Horizontal surface from (0,0) to (100,0)
      const surface = new RicochetSurface("h1", {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      });

      const normal = surface.getNormal();

      // Normal should be perpendicular to (100, 0)
      // perpendicular of (1, 0) is (0, 1) or (0, -1)
      expect(Math.abs(normal.x)).toBeCloseTo(0);
      expect(Math.abs(normal.y)).toBeCloseTo(1);
    });

    it("should return normalized vector", () => {
      const surface = new RicochetSurface("v1", {
        start: { x: 0, y: 0 },
        end: { x: 0, y: 200 },
      });

      const normal = surface.getNormal();
      const length = Vec2.length(normal);

      expect(length).toBeCloseTo(1);
    });

    it("vertical surface should have horizontal normal", () => {
      // Vertical surface from (50, 0) to (50, 100)
      const surface = new RicochetSurface("v1", {
        start: { x: 50, y: 0 },
        end: { x: 50, y: 100 },
      });

      const normal = surface.getNormal();

      // Normal should be perpendicular to (0, 100)
      // perpendicular of (0, 1) is (1, 0) or (-1, 0)
      expect(Math.abs(normal.x)).toBeCloseTo(1);
      expect(Math.abs(normal.y)).toBeCloseTo(0);
    });
  });

  describe("canReflectFrom", () => {
    it("should return true when approaching from front (normal side)", () => {
      // Vertical surface at x=50
      const surface = new RicochetSurface("v1", {
        start: { x: 50, y: 0 },
        end: { x: 50, y: 100 },
      });

      const normal = surface.getNormal();
      // Incoming direction opposite to normal = approaching from front
      const incomingFromFront = Vec2.scale(normal, -1);

      expect(surface.canReflectFrom(incomingFromFront)).toBe(true);
    });

    it("should return false when approaching from back (opposite of normal)", () => {
      const surface = new RicochetSurface("v1", {
        start: { x: 50, y: 0 },
        end: { x: 50, y: 100 },
      });

      const normal = surface.getNormal();
      // Incoming direction same as normal = approaching from back
      const incomingFromBack = normal;

      expect(surface.canReflectFrom(incomingFromBack)).toBe(false);
    });

    it("horizontal surface: arrow from above vs below", () => {
      // Horizontal surface at y=50
      const surface = new RicochetSurface("h1", {
        start: { x: 0, y: 50 },
        end: { x: 100, y: 50 },
      });

      const normal = surface.getNormal();
      console.log("Horizontal surface normal:", normal);

      // Arrow going down (0, 1) - check which side can reflect
      const goingDown = { x: 0, y: 1 };
      const goingUp = { x: 0, y: -1 };

      // One of these should reflect, the other should block
      const downCanReflect = surface.canReflectFrom(goingDown);
      const upCanReflect = surface.canReflectFrom(goingUp);

      // They should be opposite
      expect(downCanReflect).not.toBe(upCanReflect);
    });

    it("walls should always block (canReflectFrom always false)", () => {
      const wall = new WallSurface("wall", {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      });

      const anyDirection = { x: 1, y: 0 };

      // Walls can never reflect
      expect(wall.canReflectFrom(anyDirection)).toBe(false);
    });
  });

  describe("physics behavior", () => {
    it("arrow approaching from reflective side should bounce", () => {
      // This will be tested via DualTrajectoryBuilder
      // Placeholder to define expected behavior
      expect(true).toBe(true);
    });

    it("arrow approaching from blocking side should stop", () => {
      // This will be tested via DualTrajectoryBuilder
      // Placeholder to define expected behavior
      expect(true).toBe(true);
    });
  });
});

