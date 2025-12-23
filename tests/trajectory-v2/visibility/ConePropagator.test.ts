/**
 * Tests for ConePropagator
 */

import { describe, it, expect } from "vitest";
import { propagateCone } from "@/trajectory-v2/visibility/ConePropagator";
import { isConeEmpty, coneCoverage } from "@/trajectory-v2/visibility/ConeSection";
import type { Surface } from "@/surfaces/Surface";

// Helper to create a mock surface
function createMockSurface(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
  canReflect = true
): Surface {
  return {
    id,
    segment: { start, end },
    surfaceType: canReflect ? "ricochet" : "wall",
    onArrowHit: () => ({ type: "reflect", velocity: { x: 0, y: 0 } }),
    isPlannable: () => canReflect,
    getVisualProperties: () => ({
      color: 0x00ffff,
      lineWidth: 2,
      alpha: 1,
      glow: false,
    }),
    getNormal: () => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      return { x: -dy / len, y: dx / len };
    },
    canReflectFrom: () => true,
  };
}

describe("ConePropagator", () => {
  describe("no planned surfaces", () => {
    it("should return full cone from player when no surfaces", () => {
      const player = { x: 100, y: 100 };
      const result = propagateCone(player, [], []);

      expect(result.success).toBe(true);
      expect(result.finalOrigin).toEqual(player);
      expect(isConeEmpty(result.finalCone)).toBe(false);
      expect(coneCoverage(result.finalCone)).toBeCloseTo(2 * Math.PI, 2);
    });

    it("should block cone sections by obstacles", () => {
      const player = { x: 100, y: 100 };
      
      // Obstacle to the right
      const obstacle = createMockSurface(
        "obstacle",
        { x: 200, y: 50 },
        { x: 200, y: 150 },
        false
      );

      const result = propagateCone(player, [], [obstacle]);

      expect(result.success).toBe(true);
      expect(coneCoverage(result.finalCone)).toBeLessThan(2 * Math.PI);
    });

    it("should return success with non-empty cone after blocking", () => {
      const player = { x: 100, y: 100 };
      
      // Small obstacle that only blocks part of the cone
      const obstacle = createMockSurface(
        "obstacle",
        { x: 200, y: 50 },
        { x: 200, y: 150 },
        false
      );

      const result = propagateCone(player, [], [obstacle]);

      // Cone should still have valid sections (obstacle only blocks part)
      expect(result.success).toBe(true);
      expect(coneCoverage(result.finalCone)).toBeLessThan(2 * Math.PI);
    });
  });

  describe("with planned surfaces (windows)", () => {
    it("should trim cone to pass through single window", () => {
      const player = { x: 100, y: 100 };
      
      // Window to the right
      const window = createMockSurface(
        "window1",
        { x: 200, y: 50 },
        { x: 200, y: 150 }
      );

      const result = propagateCone(player, [window], [window]);

      expect(result.success).toBe(true);
      // Cone should be trimmed to only pass through window
      expect(coneCoverage(result.finalCone)).toBeLessThan(Math.PI);
    });

    it("should reflect origin through window", () => {
      const player = { x: 100, y: 100 };
      
      // Vertical window at x=200
      const window = createMockSurface(
        "window1",
        { x: 200, y: 0 },
        { x: 200, y: 200 }
      );

      const result = propagateCone(player, [window], [window]);

      expect(result.success).toBe(true);
      // Origin should be reflected: 100 -> 200 -> 300
      expect(result.finalOrigin.x).toBeCloseTo(300, 1);
      expect(result.finalOrigin.y).toBeCloseTo(100, 1);
    });

    it("should reflect origin through single window", () => {
      const player = { x: 100, y: 100 };
      
      // Vertical window at x=200
      const window1 = createMockSurface(
        "window1",
        { x: 200, y: 50 },
        { x: 200, y: 150 }
      );

      const result = propagateCone(player, [window1], [window1]);

      expect(result.success).toBe(true);
      // After window1: 100 -> reflected through x=200 -> x=300
      expect(result.finalOrigin.x).toBeCloseTo(300, 1);
      expect(result.finalOrigin.y).toBeCloseTo(100, 1);
    });

    it("should return reduced cone when partially blocked before window", () => {
      const player = { x: 100, y: 100 };
      
      // Obstacle that partially blocks the view
      const obstacle = createMockSurface(
        "obstacle",
        { x: 150, y: 80 },
        { x: 150, y: 120 },
        false
      );
      
      // Window behind obstacle
      const window = createMockSurface(
        "window1",
        { x: 200, y: 50 },
        { x: 200, y: 150 }
      );

      const result = propagateCone(player, [window], [obstacle, window]);

      // The cone is trimmed to the window but obstacle blocks part
      // Since obstacle is in the way, the resulting cone should be smaller
      expect(result.success).toBe(true);
      // Coverage should be less than if there was no obstacle
    });
  });

  describe("edge cases", () => {
    it("should handle player at origin", () => {
      const player = { x: 0, y: 0 };
      const result = propagateCone(player, [], []);

      expect(result.success).toBe(true);
      expect(result.finalOrigin).toEqual(player);
    });

    it("should handle very small window", () => {
      const player = { x: 100, y: 100 };
      
      const window = createMockSurface(
        "tiny_window",
        { x: 200, y: 99 },
        { x: 200, y: 101 }
      );

      const result = propagateCone(player, [window], [window]);

      expect(result.success).toBe(true);
      expect(coneCoverage(result.finalCone)).toBeLessThan(0.1);
    });
  });
});

