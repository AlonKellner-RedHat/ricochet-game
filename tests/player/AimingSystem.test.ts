import { AimingSystem } from "@/player/AimingSystem";
import { RicochetSurface, WallSurface } from "@/surfaces";
import { TrajectoryCalculator } from "@/trajectory/TrajectoryCalculator";
import { beforeEach, describe, expect, it } from "vitest";

describe("AimingSystem", () => {
  let aimingSystem: AimingSystem;
  let trajectoryCalculator: TrajectoryCalculator;

  beforeEach(() => {
    trajectoryCalculator = new TrajectoryCalculator();
    aimingSystem = new AimingSystem(trajectoryCalculator);
  });

  describe("aim direction", () => {
    it("should calculate aim direction from player to mouse", () => {
      const playerPos = { x: 100, y: 100 };
      const mousePos = { x: 200, y: 100 }; // Right of player

      aimingSystem.update(mousePos, playerPos, []);

      const dir = aimingSystem.aimDirection;
      expect(dir.x).toBeCloseTo(1, 5);
      expect(dir.y).toBeCloseTo(0, 5);
    });

    it("should handle diagonal aim", () => {
      const playerPos = { x: 100, y: 100 };
      const mousePos = { x: 200, y: 200 }; // Diagonal

      aimingSystem.update(mousePos, playerPos, []);

      const dir = aimingSystem.aimDirection;
      const sqrt2over2 = Math.SQRT2 / 2;
      expect(dir.x).toBeCloseTo(sqrt2over2, 5);
      expect(dir.y).toBeCloseTo(sqrt2over2, 5);
    });
  });

  describe("surface planning", () => {
    it("should add plannable surface to plan", () => {
      const surface = new RicochetSurface("test", {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      });

      const added = aimingSystem.toggleSurfaceInPlan(surface);

      expect(added).toBe(true);
      expect(aimingSystem.plannedSurfaces.length).toBe(1);
      expect(aimingSystem.isSurfaceInPlan(surface)).toBe(true);
    });

    it("should remove surface from plan on second toggle", () => {
      const surface = new RicochetSurface("test", {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      });

      aimingSystem.toggleSurfaceInPlan(surface);
      const removed = aimingSystem.toggleSurfaceInPlan(surface);

      expect(removed).toBe(false);
      expect(aimingSystem.plannedSurfaces.length).toBe(0);
      expect(aimingSystem.isSurfaceInPlan(surface)).toBe(false);
    });

    it("should not add non-plannable surface", () => {
      const wall = new WallSurface("wall", {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      });

      const added = aimingSystem.toggleSurfaceInPlan(wall);

      expect(added).toBe(false);
      expect(aimingSystem.plannedSurfaces.length).toBe(0);
    });

    it("should return correct plan index", () => {
      const surface1 = new RicochetSurface("s1", {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      });
      const surface2 = new RicochetSurface("s2", {
        start: { x: 200, y: 0 },
        end: { x: 300, y: 0 },
      });

      aimingSystem.toggleSurfaceInPlan(surface1);
      aimingSystem.toggleSurfaceInPlan(surface2);

      expect(aimingSystem.getSurfacePlanIndex(surface1)).toBe(1);
      expect(aimingSystem.getSurfacePlanIndex(surface2)).toBe(2);
    });

    it("should clear all planned surfaces", () => {
      const surface = new RicochetSurface("test", {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      });

      aimingSystem.toggleSurfaceInPlan(surface);
      aimingSystem.clearPlan();

      expect(aimingSystem.plannedSurfaces.length).toBe(0);
    });
  });

  describe("shooting", () => {
    it("should return arrow data when shooting", () => {
      const playerPos = { x: 100, y: 100 };
      const mousePos = { x: 200, y: 100 };

      aimingSystem.update(mousePos, playerPos, []);

      const arrowData = aimingSystem.shoot(playerPos);

      expect(arrowData).not.toBeNull();
      expect(arrowData?.position).toEqual(playerPos);
      expect(arrowData?.direction.x).toBeCloseTo(1, 5);
    });

    it("should clear plan after shooting", () => {
      const surface = new RicochetSurface("test", {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      });

      aimingSystem.toggleSurfaceInPlan(surface);
      aimingSystem.shoot({ x: 100, y: 100 });

      expect(aimingSystem.plannedSurfaces.length).toBe(0);
    });

    it("should include planned surfaces in arrow data", () => {
      const surface = new RicochetSurface("test", {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      });

      aimingSystem.toggleSurfaceInPlan(surface);
      const arrowData = aimingSystem.shoot({ x: 100, y: 100 });

      expect(arrowData?.plannedSurfaces.length).toBe(1);
      expect(arrowData?.plannedSurfaces[0]?.id).toBe("test");
    });

    it("should respect shoot cooldown", () => {
      const playerPos = { x: 100, y: 100 };

      // First shot should work
      const firstShot = aimingSystem.shoot(playerPos);
      expect(firstShot).not.toBeNull();

      // Immediate second shot should fail (cooldown)
      const secondShot = aimingSystem.shoot(playerPos);
      expect(secondShot).toBeNull();
    });
  });

  describe("trajectory calculation", () => {
    it("should update trajectory result on update", () => {
      const playerPos = { x: 100, y: 100 };
      const mousePos = { x: 200, y: 100 };
      const wall = new WallSurface("wall", {
        start: { x: 300, y: 0 },
        end: { x: 300, y: 200 },
      });

      aimingSystem.update(mousePos, playerPos, [wall]);

      const result = aimingSystem.trajectoryResult;
      expect(result.points.length).toBeGreaterThan(0);
    });
  });
});
