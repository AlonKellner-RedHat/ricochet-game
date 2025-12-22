/**
 * Tests for directional surface validation
 *
 * First Principles:
 * - Planned surfaces are directional - reflection only from the front side
 * - When a planned hit approaches from the back side, it should be bypassed
 * - Directional validation is handled by BypassChecker, not ImageReflectionCalculator
 *
 * NOTE: ImageReflectionCalculator only computes geometric trajectories.
 * For directional validation, use BypassChecker.checkPlayerSide().
 */

import { BypassChecker } from "@/trajectory/BypassChecker";
import { RicochetSurface } from "@/surfaces";
import { describe, expect, it } from "vitest";

describe("Surface Directional Validation", () => {
  const checker = new BypassChecker();

  describe("single surface direction", () => {
    it("should NOT bypass when player is on reflective side", () => {
      // Vertical surface at x=100
      // Normal points left (x < 0)
      // Player at left (x=50) - on the normal side (reflective)
      const surface = new RicochetSurface("r1", {
        start: { x: 100, y: 0 },
        end: { x: 100, y: 200 },
      });

      // Verify normal points left
      const normal = surface.getNormal();
      expect(normal.x).toBeLessThan(0);

      // Player on the left - on reflective side
      const player = { x: 50, y: 50 };

      const result = checker.checkPlayerSide(player, surface);

      // Should NOT bypass (player can reflect off this surface)
      expect(result.shouldBypass).toBe(false);
    });

    it("should bypass when player is on blocking side", () => {
      // Vertical surface at x=100
      // Normal points left (x < 0)
      // Player at right (x=150) - on the opposite side of normal (blocking)
      const surface = new RicochetSurface("r1", {
        start: { x: 100, y: 0 },
        end: { x: 100, y: 200 },
      });

      // Verify normal points left
      const normal = surface.getNormal();
      expect(normal.x).toBeLessThan(0);

      // Player on the right - on blocking side
      const player = { x: 150, y: 50 };

      const result = checker.checkPlayerSide(player, surface);

      // Should bypass (player cannot reflect off this surface)
      expect(result.shouldBypass).toBe(true);
    });
  });

  describe("direction determination", () => {
    it("should correctly identify arrow direction toward surface", () => {
      // Horizontal surface at y=100
      const surface = new RicochetSurface("h1", {
        start: { x: 0, y: 100 },
        end: { x: 200, y: 100 },
      });

      const normal = surface.getNormal();
      console.log("Horizontal surface normal:", normal);

      // Test canReflectFrom with different directions
      const goingDown = { x: 0, y: 1 };
      const goingUp = { x: 0, y: -1 };

      const canReflectFromAbove = surface.canReflectFrom(goingDown);
      const canReflectFromBelow = surface.canReflectFrom(goingUp);

      // One should be true, one should be false (directional)
      expect(canReflectFromAbove).not.toBe(canReflectFromBelow);
    });
  });
});
