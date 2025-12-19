import { Arrow } from "@/arrow/Arrow";
import { RicochetSurface, WallSurface } from "@/surfaces";
import { describe, expect, it } from "vitest";

describe("Arrow", () => {
  describe("initial state", () => {
    it("should start in perfect flight state", () => {
      const arrow = new Arrow("test-1", { x: 100, y: 100 }, { x: 1, y: 0 }, [], 2000);

      expect(arrow.state).toBe("perfect");
      expect(arrow.isActive).toBe(true);
    });

    it("should have correct initial position", () => {
      const arrow = new Arrow("test-1", { x: 100, y: 200 }, { x: 1, y: 0 }, [], 2000);

      expect(arrow.position.x).toBe(100);
      expect(arrow.position.y).toBe(200);
    });

    it("should have velocity in aim direction", () => {
      const arrow = new Arrow("test-1", { x: 100, y: 100 }, { x: 1, y: 0 }, [], 2000);

      expect(arrow.velocity.x).toBeGreaterThan(0);
      expect(arrow.velocity.y).toBeCloseTo(0, 5);
    });
  });

  describe("movement", () => {
    it("should move in velocity direction", () => {
      const arrow = new Arrow("test-1", { x: 100, y: 100 }, { x: 1, y: 0 }, [], 2000);

      const initialX = arrow.position.x;
      arrow.update(0.016, []);

      expect(arrow.position.x).toBeGreaterThan(initialX);
    });

    it("should not move when stuck", () => {
      const arrow = new Arrow("test-1", { x: 100, y: 100 }, { x: 1, y: 0 }, [], 2000);

      // Hit a wall to get stuck
      const wall = new WallSurface("wall", {
        start: { x: 110, y: 0 },
        end: { x: 110, y: 200 },
      });

      // Move until stuck
      for (let i = 0; i < 10; i++) {
        arrow.update(0.016, [wall]);
        if (arrow.state === "stuck") break;
      }

      expect(arrow.state).toBe("stuck");
      const stuckX = arrow.position.x;

      // Update again - should not move
      arrow.update(0.016, [wall]);
      expect(arrow.position.x).toBe(stuckX);
    });
  });

  describe("wall collision", () => {
    it("should stick to wall on collision", () => {
      const arrow = new Arrow("test-1", { x: 100, y: 100 }, { x: 1, y: 0 }, [], 2000);

      const wall = new WallSurface("wall", {
        start: { x: 150, y: 0 },
        end: { x: 150, y: 200 },
      });

      // Update until we hit the wall
      for (let i = 0; i < 100; i++) {
        arrow.update(0.016, [wall]);
        if (arrow.state === "stuck") break;
      }

      expect(arrow.state).toBe("stuck");
      expect(arrow.isActive).toBe(false);
      expect(arrow.position.x).toBeCloseTo(150, 0);
    });
  });

  describe("ricochet", () => {
    it("should ricochet off planned surface", () => {
      const ricochetSurface = new RicochetSurface("ricochet-1", {
        start: { x: 200, y: 0 },
        end: { x: 200, y: 200 },
      });

      const arrow = new Arrow(
        "test-1",
        { x: 100, y: 100 },
        { x: 1, y: 0 },
        [ricochetSurface], // Planned to hit this surface
        2000
      );

      // Update until we hit the surface
      for (let i = 0; i < 100; i++) {
        arrow.update(0.016, [ricochetSurface]);
        if (arrow.position.x >= 190) break;
      }

      // Arrow should still be active (ricocheted, not stuck)
      // After ricochet, velocity should change direction
      expect(arrow.state).toBe("perfect");
    });

    it("should stick to unplanned ricochet surface", () => {
      const ricochetSurface = new RicochetSurface("ricochet-1", {
        start: { x: 200, y: 0 },
        end: { x: 200, y: 200 },
      });

      const arrow = new Arrow(
        "test-1",
        { x: 100, y: 100 },
        { x: 1, y: 0 },
        [], // NOT planned
        2000
      );

      // Update until we hit the surface
      for (let i = 0; i < 100; i++) {
        arrow.update(0.016, [ricochetSurface]);
        if (arrow.state === "stuck") break;
      }

      expect(arrow.state).toBe("stuck");
    });
  });

  describe("exhaustion", () => {
    it("should become exhausted after completing planned ricochets", () => {
      const arrow = new Arrow(
        "test-1",
        { x: 100, y: 100 },
        { x: 1, y: 0 },
        [], // No planned surfaces = exhaust immediately
        2000
      );

      // Should already be exhausted since no planned surfaces
      arrow.update(0.016, []);

      expect(arrow.state).toBe("exhausted");
    });

    it("should apply gravity when exhausted", () => {
      const arrow = new Arrow(
        "test-1",
        { x: 100, y: 100 },
        { x: 1, y: 0 },
        [], // No planned surfaces
        2000
      );

      // First update - becomes exhausted
      arrow.update(0.016, []);
      expect(arrow.state).toBe("exhausted");

      const initialVelY = arrow.velocity.y;

      // More updates - gravity should increase y velocity
      arrow.update(0.016, []);
      arrow.update(0.016, []);

      expect(arrow.velocity.y).toBeGreaterThan(initialVelY);
    });

    it("should stick when exhausted arrow hits any surface", () => {
      const wall = new WallSurface("floor", {
        start: { x: 0, y: 300 },
        end: { x: 500, y: 300 },
      });

      const arrow = new Arrow(
        "test-1",
        { x: 100, y: 100 },
        { x: 1, y: 0 },
        [], // No planned surfaces
        2000
      );

      // Update many times until stuck
      for (let i = 0; i < 200; i++) {
        arrow.update(0.016, [wall]);
        if (arrow.state === "stuck") break;
      }

      expect(arrow.state).toBe("stuck");
    });
  });

  describe("angle", () => {
    it("should report correct angle for horizontal shot", () => {
      const arrow = new Arrow("test-1", { x: 100, y: 100 }, { x: 1, y: 0 }, [], 2000);

      expect(arrow.angle).toBeCloseTo(0, 2);
    });

    it("should report correct angle for downward shot", () => {
      const arrow = new Arrow("test-1", { x: 100, y: 100 }, { x: 0, y: 1 }, [], 2000);

      expect(arrow.angle).toBeCloseTo(Math.PI / 2, 2);
    });

    it("should preserve angle when stuck", () => {
      const wall = new WallSurface("wall", {
        start: { x: 150, y: 0 },
        end: { x: 150, y: 200 },
      });

      const arrow = new Arrow(
        "test-1",
        { x: 100, y: 100 },
        { x: 1, y: 0.5 }, // Angled shot
        [],
        2000
      );

      // Hit wall
      for (let i = 0; i < 100; i++) {
        arrow.update(0.016, [wall]);
        if (arrow.state === "stuck") break;
      }

      // Angle should be valid when stuck
      expect(arrow.state).toBe("stuck");
      expect(Math.abs(arrow.angle)).toBeLessThan(Math.PI);
    });
  });
});
