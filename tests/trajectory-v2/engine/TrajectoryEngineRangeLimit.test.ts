/**
 * Tests for TrajectoryEngine Range Limit integration.
 *
 * TDD: Tests written first, then implementation.
 */

import { describe, it, expect } from "vitest";
import { createTrajectoryEngine } from "@/trajectory-v2/engine/TrajectoryEngine";
import { DEFAULT_RANGE_LIMIT_RADIUS } from "@/types";

describe("TrajectoryEngine Range Limit", () => {
  describe("RangeLimitPair creation", () => {
    it("should have a RangeLimitPair in engine results", () => {
      const engine = createTrajectoryEngine();
      const results = engine.getResults();
      
      expect(results.rangeLimitPair).toBeDefined();
    });

    it("should have RangeLimitPair with radius equal to DEFAULT_RANGE_LIMIT_RADIUS", () => {
      const engine = createTrajectoryEngine();
      const results = engine.getResults();
      
      expect(results.rangeLimitPair.radius).toBe(DEFAULT_RANGE_LIMIT_RADIUS);
      expect(results.rangeLimitPair.radius).toBe(480); // 10 * playerHeight (48)
    });

    it("should have horizontal orientation (top/bottom) by default", () => {
      const engine = createTrajectoryEngine();
      const results = engine.getResults();
      
      expect(results.rangeLimitPair.orientation).toBe("horizontal");
      expect(results.rangeLimitPair.first.half).toBe("top");
      expect(results.rangeLimitPair.second.half).toBe("bottom");
    });
  });

  describe("Trajectory limiting", () => {
    it("should limit trajectory distance to 480px when cursor is beyond range", () => {
      const engine = createTrajectoryEngine();
      engine.setPlayer({ x: 400, y: 300 });
      engine.setCursor({ x: 1000, y: 300 }); // 600px away, beyond 480px limit
      engine.setChains([]);
      engine.invalidateAll();
      
      const results = engine.getResults();
      const fullTraj = results.fullTrajectory;
      
      expect(fullTraj).toBeDefined();
      expect(fullTraj.merged.length).toBeGreaterThan(0);
      
      // Last point should be at range limit distance
      const merged = fullTraj.merged;
      const lastEnd = merged[merged.length - 1].end;
      const dist = Math.sqrt((lastEnd.x - 400) ** 2 + (lastEnd.y - 300) ** 2);
      expect(dist).toBeCloseTo(480, 0);
    });

    it("should reach cursor and continue to range limit when cursor is within range", () => {
      const engine = createTrajectoryEngine();
      const player = { x: 400, y: 300 };
      engine.setPlayer(player);
      engine.setCursor({ x: 600, y: 300 }); // 200px away, within 480px limit
      engine.setChains([]);
      engine.invalidateAll();
      
      const results = engine.getResults();
      const fullTraj = results.fullTrajectory;
      
      expect(fullTraj).toBeDefined();
      
      // Trajectory continues past cursor to range limit
      const merged = fullTraj.merged;
      const lastEnd = merged[merged.length - 1].end;
      const dist = Math.sqrt((lastEnd.x - player.x) ** 2 + (lastEnd.y - player.y) ** 2);
      expect(dist).toBeCloseTo(480, 0);
    });
  });
});
