import { RicochetSurface, WallSurface } from "@/surfaces";
import { TrajectoryCalculator } from "@/trajectory/TrajectoryCalculator";
import type { Vector2 } from "@/types";
import { beforeEach, describe, expect, it } from "vitest";

describe("TrajectoryCalculator", () => {
  let calculator: TrajectoryCalculator;

  beforeEach(() => {
    calculator = new TrajectoryCalculator();
  });

  function createRicochet(id: string, start: Vector2, end: Vector2): RicochetSurface {
    return new RicochetSurface(id, { start, end });
  }

  function createWall(id: string, start: Vector2, end: Vector2): WallSurface {
    return new WallSurface(id, { start, end });
  }

  describe("straight path with no surfaces", () => {
    it("should return straight line to max distance", () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 100, y: 0 };

      const result = calculator.calculate(origin, aimPoint, [], [], 200);

      expect(result.status).toBe("valid");
      expect(result.points).toHaveLength(2); // Origin and endpoint
      expect(result.points[0]?.position).toEqual(origin);
      expect(result.points[1]?.position.x).toBeCloseTo(200);
    });
  });

  describe("hitting a wall", () => {
    it("should stop at wall surface", () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 100, y: 0 };
      const wall = createWall("wall1", { x: 50, y: -10 }, { x: 50, y: 10 });

      const result = calculator.calculate(origin, aimPoint, [], [wall], 200);

      expect(result.status).toBe("valid");
      expect(result.points).toHaveLength(2);
      expect(result.points[1]?.position.x).toBeCloseTo(50);
      expect(result.points[1]?.surfaceId).toBe("wall1");
    });
  });

  describe("single ricochet", () => {
    it("should reflect off ricochet surface", () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 10, y: 10 }; // 45° angle down-right
      const ricochet = createRicochet("r1", { x: 0, y: 50 }, { x: 100, y: 50 }); // Horizontal

      const result = calculator.calculate(origin, aimPoint, [ricochet], [ricochet], 200);

      expect(result.status).toBe("valid");
      expect(result.points.length).toBeGreaterThanOrEqual(2);

      // Find the ricochet hit
      const ricochetHit = result.points.find((p) => p.surfaceId === "r1");
      expect(ricochetHit).toBeDefined();
      expect(ricochetHit?.isPlanned).toBe(true);
    });

    it("should calculate correct reflection angle", () => {
      const origin = { x: 50, y: 0 };
      const aimPoint = { x: 50, y: 100 }; // Straight down
      const ricochet = createRicochet("r1", { x: 0, y: 50 }, { x: 100, y: 50 }); // Horizontal

      const result = calculator.calculate(origin, aimPoint, [ricochet], [ricochet], 200);

      expect(result.status).toBe("valid");
      expect(result.points.length).toBeGreaterThanOrEqual(3);

      // After hitting horizontal surface going straight down, should go straight up
      const hitPoint = result.points[1]?.position;
      const endPoint = result.points[2]?.position;

      expect(hitPoint?.y).toBeCloseTo(50);
      expect(endPoint?.y).toBeLessThan(hitPoint?.y ?? 0); // Moving up
    });
  });

  describe("multiple ricochets", () => {
    it("should handle chain of planned ricochets", () => {
      const origin = { x: 0, y: 50 };
      const aimPoint = { x: 100, y: 50 }; // Horizontal right

      // Create surfaces that form a zigzag path
      // r1: vertical wall at x=100, will bounce ray back left
      const r1 = createRicochet("r1", { x: 100, y: 0 }, { x: 100, y: 100 });
      // r2: vertical wall at x=0, will catch the bounced ray
      const r2 = createRicochet("r2", { x: 0, y: 0 }, { x: 0, y: 100 });

      const result = calculator.calculate(origin, aimPoint, [r1, r2], [r1, r2], 500);

      // Should hit both planned surfaces
      const plannedHits = result.points.filter((p) => p.isPlanned);
      expect(plannedHits.length).toBe(2);
    });
  });

  describe("validation failures", () => {
    it("should report missed_surface when planned surface not hit", () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 1, y: 0 }; // Horizontal, won't hit the ricochet
      const ricochet = createRicochet("r1", { x: 50, y: 100 }, { x: 100, y: 100 }); // Too high

      const result = calculator.calculate(origin, aimPoint, [ricochet], [ricochet], 200);

      expect(result.status).toBe("missed_surface");
      expect(result.failedAtPlanIndex).toBe(0);
    });

    it("should report hit_obstacle when wall blocks planned path", () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 1, y: 1 }; // Diagonal

      const wall = createWall("wall1", { x: 30, y: 0 }, { x: 30, y: 50 });
      const ricochet = createRicochet("r1", { x: 0, y: 50 }, { x: 100, y: 50 });

      const result = calculator.calculate(origin, aimPoint, [ricochet], [wall, ricochet], 200);

      expect(result.status).toBe("hit_obstacle");
      expect(result.failedAtPlanIndex).toBe(0);
    });
  });

  describe("total distance calculation", () => {
    it("should track total path distance", () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 1, y: 0 }; // Horizontal
      const wall = createWall("wall1", { x: 100, y: -10 }, { x: 100, y: 10 });

      const result = calculator.calculate(origin, aimPoint, [], [wall], 200);

      expect(result.totalDistance).toBeCloseTo(100);
    });

    it("should sum distance across bounces", () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 0, y: 1 }; // Straight down

      const ricochet = createRicochet("r1", { x: -50, y: 50 }, { x: 50, y: 50 });
      const wall = createWall("wall1", { x: -50, y: 0 }, { x: 50, y: 0 }); // Back at origin height

      const result = calculator.calculate(origin, aimPoint, [ricochet], [ricochet, wall], 200);

      // Should travel 50 down, then 50 up = 100 total
      expect(result.totalDistance).toBeCloseTo(100);
    });
  });

  describe("empty plan", () => {
    it("should be valid with no planned surfaces", () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 100, y: 0 };
      const ricochet = createRicochet("r1", { x: 50, y: -10 }, { x: 50, y: 10 });

      const result = calculator.calculate(origin, aimPoint, [], [ricochet], 200);

      expect(result.status).toBe("valid");
      // Still bounces, just not planned
      expect(result.points.length).toBeGreaterThan(2);
    });
  });
});
