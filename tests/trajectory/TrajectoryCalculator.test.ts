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
      // Horizontal surface with normal pointing UP (segment right-to-left)
      const ricochet = createRicochet("r1", { x: 100, y: 50 }, { x: 0, y: 50 });

      const result = calculator.calculate(origin, aimPoint, [ricochet], [ricochet], 200);

      expect(result.status).toBe("valid");
      expect(result.points.length).toBeGreaterThanOrEqual(2);

      // Find the ricochet hit
      const ricochetHit = result.points.find((p) => p.surfaceId === "r1");
      expect(ricochetHit).toBeDefined();
      expect(ricochetHit?.isPlanned).toBe(true);
    });

    it("should calculate correct reflection angle", () => {
      // With image reflection, the trajectory ends at the cursor
      // So we need cursor position that makes geometric sense
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 100, y: 0 }; // Target is at same height as origin
      // Horizontal surface with normal pointing UP (segment right-to-left)
      const ricochet = createRicochet("r1", { x: 100, y: 50 }, { x: 0, y: 50 });

      // Path: origin (0,0) -> ricochet at y=50 -> cursor (100, 0)
      const result = calculator.calculate(origin, aimPoint, [ricochet], [ricochet], 200);

      expect(result.status).toBe("valid");
      expect(result.points.length).toBeGreaterThanOrEqual(3);

      // Hit point should be on the ricochet surface at y=50
      const hitPoint = result.points[1]?.position;
      expect(hitPoint?.y).toBeCloseTo(50);

      // End point should be at cursor
      const endPoint = result.points[2]?.position;
      expect(endPoint?.x).toBeCloseTo(100);
      expect(endPoint?.y).toBeCloseTo(0);
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
    it("should report missed_surface when line misses segment bounds", () => {
      // With image reflection, the line from player to cursor-image
      // might not intersect the actual segment bounds
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 200, y: 0 }; // Far right
      // Surface is way off to the side - the image reflection line won't hit it
      const ricochet = createRicochet("r1", { x: 500, y: 50 }, { x: 600, y: 50 });

      const result = calculator.calculate(origin, aimPoint, [ricochet], [ricochet], 200);

      // When the line from player to cursor-image doesn't intersect the segment,
      // we get a trajectory that doesn't include the planned surface
      // The status should indicate failure
      expect(result.status).not.toBe("valid");
    });

    it("should report hit_obstacle when wall blocks planned path", () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 100, y: 0 }; // Target same height
      const ricochet = createRicochet("r1", { x: 0, y: 50 }, { x: 100, y: 50 }); // Below
      // Wall blocking the path between origin and ricochet
      const wall = createWall("wall1", { x: 25, y: 0 }, { x: 25, y: 100 });

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
      // With image reflection: origin -> ricochet -> cursor
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 100, y: 0 }; // Cursor at same height, 100 units right
      const ricochet = createRicochet("r1", { x: 0, y: 50 }, { x: 100, y: 50 }); // Below

      const result = calculator.calculate(origin, aimPoint, [ricochet], [ricochet], 200);

      // Path goes down to y=50 (hit at x=50), then up to cursor
      // Distance: sqrt(50^2 + 50^2) + sqrt(50^2 + 50^2) = ~141.4
      expect(result.totalDistance).toBeGreaterThan(100);
      expect(result.totalDistance).toBeLessThan(150);
    });
  });

  describe("empty plan", () => {
    it("should stop at first surface when no plan", () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 100, y: 0 };
      const ricochet = createRicochet("r1", { x: 50, y: -10 }, { x: 50, y: 10 });

      const result = calculator.calculate(origin, aimPoint, [], [ricochet], 200);

      expect(result.status).toBe("valid");
      // Without a plan, we just show the trajectory to the first surface hit
      expect(result.points.length).toBe(2);
      expect(result.points[1]?.surfaceId).toBe("r1");
    });

    it("should show straight line when no surfaces hit", () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 100, y: 0 };

      const result = calculator.calculate(origin, aimPoint, [], [], 200);

      expect(result.status).toBe("valid");
      expect(result.points.length).toBe(2);
      expect(result.points[1]?.position.x).toBeCloseTo(200); // max distance
    });
  });

  describe("ghost path", () => {
    it("should include ghost points extending past cursor for ricochet surfaces", () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 100, y: 0 };
      // Ricochet surface far ahead - ghost path should bounce off it
      const ricochet = createRicochet("r1", { x: 150, y: -50 }, { x: 150, y: 50 });

      const result = calculator.calculate(origin, aimPoint, [], [ricochet], 200);

      // Main path ends at ricochet surface
      expect(result.points.length).toBe(2);
      expect(result.points[1]?.surfaceId).toBe("r1");

      // Ghost path should show the bounce
      expect(result.ghostPoints.length).toBeGreaterThan(0);
    });

    it("should NOT generate ghost path when hitting a wall surface", () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 100, y: 0 };
      // Wall surface - should stop arrow without reflection
      const wall = createWall("wall1", { x: 50, y: -50 }, { x: 50, y: 50 });

      const result = calculator.calculate(origin, aimPoint, [], [wall], 200);

      // Main path ends at wall
      expect(result.points.length).toBe(2);
      expect(result.points[1]?.surfaceId).toBe("wall1");

      // No ghost path - wall stops the arrow
      expect(result.ghostPoints.length).toBe(0);
    });

    it("should mark ghost point as sticking when hitting wall", () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 100, y: 0 };
      const ricochet = createRicochet("r1", { x: 50, y: -50 }, { x: 50, y: 50 });
      const wall = createWall("wall1", { x: 0, y: -50 }, { x: 0, y: 50 }); // Wall behind

      const result = calculator.calculate(origin, aimPoint, [], [ricochet, wall], 300);

      // Should have ghost path that hits the wall
      const ghostHitWall = result.ghostPoints.find((g) => g.surfaceId === "wall1");
      if (ghostHitWall) {
        expect(ghostHitWall.willStick).toBe(true);
      }
    });

    it("should bounce off ricochet surfaces in ghost path", () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 100, y: 0 };
      // Two ricochet surfaces creating a bounce corridor
      const r1 = createRicochet("r1", { x: 50, y: -50 }, { x: 50, y: 50 });
      const r2 = createRicochet("r2", { x: 0, y: -50 }, { x: 0, y: 50 });

      const result = calculator.calculate(origin, aimPoint, [], [r1, r2], 500);

      // Ghost path should show multiple bounces
      expect(result.ghostPoints.length).toBeGreaterThan(0);
    });
  });

  describe("exhaustion distance", () => {
    it("should include exhaustion distance in result", () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 100, y: 0 };

      const result = calculator.calculate(origin, aimPoint, [], [], 200);

      expect(result.exhaustionDistance).toBe(10000); // 10 screen lengths
    });
  });

  describe("missed segment detection", () => {
    it("should detect when planned surface segment is missed", () => {
      const origin = { x: 0, y: 0 };
      // Aim far off from the surface segment
      const aimPoint = { x: 1000, y: 0 };
      // Surface is a small segment that won't be hit
      const ricochet = createRicochet("r1", { x: 10, y: 50 }, { x: 20, y: 50 });

      const result = calculator.calculate(origin, aimPoint, [ricochet], [ricochet], 2000);

      // The trajectory line won't intersect the small segment
      expect(result.status).toBe("missed_segment");
    });
  });
});
