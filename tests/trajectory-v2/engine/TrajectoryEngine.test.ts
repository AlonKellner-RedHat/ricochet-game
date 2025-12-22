/**
 * TrajectoryEngine Tests
 *
 * Tests for the main engine implementation including caching.
 */

import { describe, expect, it, vi } from "vitest";
import { TrajectoryEngine } from "@/trajectory-v2/engine/TrajectoryEngine";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// Helper to create a mock surface with normal pointing toward a target point
function createMockSurface(
  id: string,
  start: Vector2,
  end: Vector2,
  towardPoint?: Vector2
): Surface {
  // Calculate normal pointing toward target if provided
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const perpX = -dy / len;
  const perpY = dx / len;
  
  let normalX = perpX;
  let normalY = perpY;
  
  if (towardPoint) {
    const toTarget = { x: towardPoint.x - midX, y: towardPoint.y - midY };
    const dot = perpX * toTarget.x + perpY * toTarget.y;
    normalX = dot >= 0 ? perpX : -perpX;
    normalY = dot >= 0 ? perpY : -perpY;
  }

  return {
    id,
    segment: { start, end },
    surfaceType: "ricochet",
    onArrowHit: () => ({ type: "reflect" }),
    isPlannable: () => true,
    getVisualProperties: () => ({ color: 0xffffff, lineWidth: 2, alpha: 1 }),
    getNormal: () => ({ x: normalX, y: normalY }),
    canReflectFrom: () => true,
  };
}

describe("TrajectoryEngine", () => {
  describe("basic operations", () => {
    it("should create an engine", () => {
      const engine = new TrajectoryEngine();
      expect(engine).toBeDefined();
    });

    it("should set player position", () => {
      const engine = new TrajectoryEngine();
      engine.setPlayer({ x: 100, y: 200 });

      const images = engine.getPlayerImages();
      expect(images.original).toEqual({ x: 100, y: 200 });
    });

    it("should set cursor position", () => {
      const engine = new TrajectoryEngine();
      engine.setCursor({ x: 300, y: 400 });

      const images = engine.getCursorImages();
      expect(images.original).toEqual({ x: 300, y: 400 });
    });
  });

  describe("path calculation", () => {
    it("should calculate direct path with no surfaces", () => {
      const engine = new TrajectoryEngine();
      engine.setPlayer({ x: 0, y: 0 });
      engine.setCursor({ x: 100, y: 0 });

      const planned = engine.getPlannedPath();
      expect(planned.points).toHaveLength(2);
      expect(planned.reachedCursor).toBe(true);
    });

    it("should calculate path through planned surface", () => {
      const engine = new TrajectoryEngine();
      const player = { x: 0, y: 0 };
      const cursor = { x: 100, y: 0 };
      
      // Surface at y=50, normal pointing UP (toward player and cursor at y=0)
      const surface = createMockSurface(
        "s1",
        { x: -50, y: 50 },
        { x: 150, y: 50 },
        player // Normal toward player
      );

      engine.setPlayer(player);
      engine.setCursor(cursor);
      engine.setPlannedSurfaces([surface]);
      engine.setAllSurfaces([surface]);

      const planned = engine.getPlannedPath();
      expect(planned.points).toHaveLength(3);
      expect(planned.hitInfo).toHaveLength(1);
      expect(planned.hitInfo[0].point.y).toBeCloseTo(50);
    });

    it("should calculate alignment between paths", () => {
      const engine = new TrajectoryEngine();
      const player = { x: 0, y: 0 };
      const cursor = { x: 100, y: 0 };
      
      const surface = createMockSurface(
        "s1",
        { x: -50, y: 50 },
        { x: 150, y: 50 },
        player // Normal toward player
      );

      engine.setPlayer(player);
      engine.setCursor(cursor);
      engine.setPlannedSurfaces([surface]);
      engine.setAllSurfaces([surface]);

      const alignment = engine.getAlignment();
      expect(alignment.isFullyAligned).toBe(true);
    });

    it("should detect cursor not reachable with obstruction", () => {
      const engine = new TrajectoryEngine();
      const wall = createMockSurface(
        "wall",
        { x: 50, y: -50 },
        { x: 50, y: 50 }
      );

      engine.setPlayer({ x: 0, y: 0 });
      engine.setCursor({ x: 100, y: 0 });
      engine.setAllSurfaces([wall]);

      expect(engine.isCursorReachable()).toBe(false);
    });
  });

  describe("caching", () => {
    it("should not recalculate if inputs unchanged", () => {
      const engine = new TrajectoryEngine();
      engine.setPlayer({ x: 0, y: 0 });
      engine.setCursor({ x: 100, y: 0 });

      const path1 = engine.getPlannedPath();
      const path2 = engine.getPlannedPath();

      // Should return same object (cached)
      expect(path1).toBe(path2);
    });

    it("should recalculate when player changes", () => {
      const engine = new TrajectoryEngine();
      engine.setPlayer({ x: 0, y: 0 });
      engine.setCursor({ x: 100, y: 0 });

      const path1 = engine.getPlannedPath();

      engine.setPlayer({ x: 10, y: 0 });
      const path2 = engine.getPlannedPath();

      expect(path1).not.toBe(path2);
    });

    it("should recalculate when cursor changes", () => {
      const engine = new TrajectoryEngine();
      engine.setPlayer({ x: 0, y: 0 });
      engine.setCursor({ x: 100, y: 0 });

      const path1 = engine.getPlannedPath();

      engine.setCursor({ x: 110, y: 0 });
      const path2 = engine.getPlannedPath();

      expect(path1).not.toBe(path2);
    });

    it("should not recalculate if set to same position", () => {
      const engine = new TrajectoryEngine();
      engine.setPlayer({ x: 0, y: 0 });
      engine.setCursor({ x: 100, y: 0 });

      const path1 = engine.getPlannedPath();

      engine.setPlayer({ x: 0, y: 0 }); // Same position
      const path2 = engine.getPlannedPath();

      expect(path1).toBe(path2);
    });
  });

  describe("events", () => {
    it("should notify subscribers on invalidateAll", () => {
      const engine = new TrajectoryEngine();
      engine.setPlayer({ x: 0, y: 0 });
      engine.setCursor({ x: 100, y: 0 });

      const callback = vi.fn();
      engine.onResultsChanged(callback);

      engine.invalidateAll();

      expect(callback).toHaveBeenCalled();
    });

    it("should unsubscribe correctly", () => {
      const engine = new TrajectoryEngine();
      engine.setPlayer({ x: 0, y: 0 });
      engine.setCursor({ x: 100, y: 0 });

      const callback = vi.fn();
      const unsubscribe = engine.onResultsChanged(callback);

      unsubscribe();
      engine.invalidateAll();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("getResults", () => {
    it("should return all results in one call", () => {
      const engine = new TrajectoryEngine();
      const surface = createMockSurface(
        "s1",
        { x: -50, y: 50 },
        { x: 150, y: 50 }
      );

      engine.setPlayer({ x: 0, y: 0 });
      engine.setCursor({ x: 100, y: 0 });
      engine.setPlannedSurfaces([surface]);
      engine.setAllSurfaces([surface]);

      const results = engine.getResults();

      expect(results.playerImages).toBeDefined();
      expect(results.cursorImages).toBeDefined();
      expect(results.plannedPath).toBeDefined();
      expect(results.actualPath).toBeDefined();
      expect(results.alignment).toBeDefined();
    });
  });

  describe("shader uniforms", () => {
    it("should return shader uniforms", () => {
      const engine = new TrajectoryEngine();
      const surface = createMockSurface(
        "s1",
        { x: 0, y: 50 },
        { x: 100, y: 50 }
      );

      engine.setPlayer({ x: 50, y: 0 });
      engine.setCursor({ x: 50, y: 100 });
      engine.setPlannedSurfaces([surface]);
      engine.setAllSurfaces([surface]);

      const uniforms = engine.getShaderUniforms();

      expect(uniforms.player).toEqual({ x: 50, y: 0 });
      expect(uniforms.playerImages).toHaveLength(1);
      expect(uniforms.surfaces).toHaveLength(1);
      expect(uniforms.plannedSurfaceCount).toBe(1);
    });
  });

  describe("dispose", () => {
    it("should clean up on dispose", () => {
      const engine = new TrajectoryEngine();
      engine.setPlayer({ x: 0, y: 0 });
      engine.setCursor({ x: 100, y: 0 });

      const callback = vi.fn();
      engine.onResultsChanged(callback);

      engine.dispose();
      engine.invalidateAll();

      expect(callback).not.toHaveBeenCalled();
    });
  });
});

