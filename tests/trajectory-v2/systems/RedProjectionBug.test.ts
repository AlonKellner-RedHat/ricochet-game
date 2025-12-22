/**
 * RedProjectionBug.test.ts
 *
 * Tests to reproduce and verify the fix for:
 * - When plan is empty and scene has no surfaces
 * - Forward projection should be dashed YELLOW, not dashed RED
 *
 * FIRST PRINCIPLE: Red indicates discrepancy only.
 * When paths are aligned, nothing should be red.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { RenderSystem, type IGraphics } from "@/trajectory-v2/systems/RenderSystem";
import { TrajectoryEngine } from "@/trajectory-v2/engine/TrajectoryEngine";
import { SystemCoordinator } from "@/trajectory-v2/coordinator/SystemCoordinator";
import {
  buildPlannedPath,
  buildActualPath,
  calculateAlignment,
} from "@/trajectory-v2/engine/PathBuilder";
import type { EngineResults, PathResult, AlignmentResult } from "@/trajectory-v2/engine/types";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { DEFAULT_RENDER_CONFIG } from "@/trajectory-v2/systems/ITrajectorySystem";

// Track all render calls
interface RenderCall {
  type: "lineStyle" | "lineBetween" | "clear";
  color?: number;
  width?: number;
  alpha?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

function createMockGraphics(): IGraphics & { calls: RenderCall[] } {
  const calls: RenderCall[] = [];
  return {
    calls,
    clear: vi.fn(() => calls.push({ type: "clear" })),
    lineStyle: vi.fn((width: number, color: number, alpha?: number) => {
      calls.push({ type: "lineStyle", color, width, alpha });
    }),
    lineBetween: vi.fn((x1: number, y1: number, x2: number, y2: number) => {
      calls.push({ type: "lineBetween", x1, y1, x2, y2 });
    }),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    strokePath: vi.fn(),
  };
}

const GREEN = DEFAULT_RENDER_CONFIG.alignedColor;      // 0x00ff00
const RED = DEFAULT_RENDER_CONFIG.plannedDivergedColor; // 0xff0000
const YELLOW = DEFAULT_RENDER_CONFIG.actualDivergedColor; // 0xffff00

describe("RedProjectionBug", () => {
  let graphics: IGraphics & { calls: RenderCall[] };
  let renderSystem: RenderSystem;

  beforeEach(() => {
    graphics = createMockGraphics();
    renderSystem = new RenderSystem(graphics);
  });

  describe("Bug Reproduction: Empty scene, empty plan", () => {
    it("should NOT use red when scene is empty and plan is empty", () => {
      // This test reproduces the exact bug scenario
      const engine = new TrajectoryEngine();
      engine.setPlayer({ x: 100, y: 300 });
      engine.setCursor({ x: 400, y: 300 });
      engine.setPlannedSurfaces([]); // Empty plan
      engine.setAllSurfaces([]);     // NO surfaces in scene

      const results = engine.getResults();

      // Log all relevant data for debugging
      console.log("=== BUG REPRODUCTION TEST ===");
      console.log("Player:", { x: 100, y: 300 });
      console.log("Cursor:", { x: 400, y: 300 });
      console.log("Planned surfaces:", 0);
      console.log("All surfaces:", 0);
      console.log("");
      console.log("Planned path points:", results.plannedPath.points);
      console.log("Actual path points:", results.actualPath.points);
      console.log("Planned reachedCursor:", results.plannedPath.reachedCursor);
      console.log("Actual reachedCursor:", results.actualPath.reachedCursor);
      console.log("Planned forwardProjection:", results.plannedPath.forwardProjection);
      console.log("Actual forwardProjection:", results.actualPath.forwardProjection);
      console.log("");
      console.log("Alignment:", results.alignment);
      console.log("=== END DEBUG ===");

      // Verify alignment is correct
      expect(results.alignment.isFullyAligned).toBe(true);

      // Render and check colors
      renderSystem.onEngineUpdate(results);

      // Log all render calls
      console.log("=== RENDER CALLS ===");
      graphics.calls.forEach((call, i) => {
        if (call.type === "lineStyle") {
          const colorName = call.color === GREEN ? "GREEN" :
                           call.color === RED ? "RED" :
                           call.color === YELLOW ? "YELLOW" :
                           `0x${call.color?.toString(16)}`;
          console.log(`${i}: lineStyle(${call.width}, ${colorName}, ${call.alpha})`);
        } else if (call.type === "lineBetween") {
          console.log(`${i}: lineBetween(${call.x1}, ${call.y1}, ${call.x2}, ${call.y2})`);
        } else {
          console.log(`${i}: ${call.type}`);
        }
      });
      console.log("=== END RENDER CALLS ===");

      // MUST NOT have red
      const redCalls = graphics.calls.filter(c => c.type === "lineStyle" && c.color === RED);
      expect(redCalls).toHaveLength(0);

      // Should have green (aligned path)
      const greenCalls = graphics.calls.filter(c => c.type === "lineStyle" && c.color === GREEN);
      expect(greenCalls.length).toBeGreaterThan(0);

      // Should have yellow (forward projection)
      const yellowCalls = graphics.calls.filter(c => c.type === "lineStyle" && c.color === YELLOW);
      expect(yellowCalls.length).toBeGreaterThan(0);
    });

    it("should have correct EngineResults structure", () => {
      const engine = new TrajectoryEngine();
      engine.setPlayer({ x: 100, y: 300 });
      engine.setCursor({ x: 400, y: 300 });
      engine.setPlannedSurfaces([]);
      engine.setAllSurfaces([]);

      const results = engine.getResults();

      // Check all required fields exist
      expect(results).toHaveProperty("playerImages");
      expect(results).toHaveProperty("cursorImages");
      expect(results).toHaveProperty("plannedPath");
      expect(results).toHaveProperty("actualPath");
      expect(results).toHaveProperty("alignment");
      expect(results).toHaveProperty("plannedGhost");
      expect(results).toHaveProperty("actualGhost");

      // Check paths have forwardProjection
      expect(results.plannedPath).toHaveProperty("forwardProjection");
      expect(results.actualPath).toHaveProperty("forwardProjection");
    });
  });

  describe("PathBuilder verification", () => {
    it("should build correct paths for empty scene", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 400, y: 300 };

      const planned = buildPlannedPath(player, cursor, []);
      const actual = buildActualPath(player, cursor, [], []);

      console.log("=== PATH BUILDER TEST ===");
      console.log("Planned points:", planned.points);
      console.log("Planned reachedCursor:", planned.reachedCursor);
      console.log("Planned forwardProjection:", planned.forwardProjection);
      console.log("");
      console.log("Actual points:", actual.points);
      console.log("Actual reachedCursor:", actual.reachedCursor);
      console.log("Actual forwardProjection:", actual.forwardProjection);
      console.log("=== END PATH BUILDER TEST ===");

      // Planned path should be [player, cursor]
      expect(planned.points).toHaveLength(2);
      expect(planned.points[0]).toEqual(player);
      expect(planned.points[1]).toEqual(cursor);
      expect(planned.reachedCursor).toBe(true);
      expect(planned.forwardProjection).toBeDefined();
      expect(planned.forwardProjection!.length).toBeGreaterThan(0);

      // Actual path should also be [player, cursor]
      expect(actual.points).toHaveLength(2);
      expect(actual.points[0]).toEqual(player);
      expect(actual.points[1]).toEqual(cursor);
      expect(actual.reachedCursor).toBe(true);
      expect(actual.forwardProjection).toBeDefined();
      expect(actual.forwardProjection!.length).toBeGreaterThan(0);
    });

    it("should calculate correct alignment for empty scene", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 400, y: 300 };

      const planned = buildPlannedPath(player, cursor, []);
      const actual = buildActualPath(player, cursor, [], []);
      const alignment = calculateAlignment(planned, actual);

      console.log("=== ALIGNMENT TEST ===");
      console.log("Alignment:", alignment);
      console.log("=== END ALIGNMENT TEST ===");

      expect(alignment.isFullyAligned).toBe(true);
      expect(alignment.alignedSegmentCount).toBe(1);
      expect(alignment.firstMismatchIndex).toBe(-1);
      expect(alignment.divergencePoint).toBeUndefined();
    });
  });

  describe("RenderSystem verification", () => {
    it("should call renderAlignedPath when isFullyAligned is true", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 400, y: 300 };

      const planned = buildPlannedPath(player, cursor, []);
      const actual = buildActualPath(player, cursor, [], []);
      const alignment = calculateAlignment(planned, actual);

      // Manually construct EngineResults
      const results: EngineResults = {
        playerImages: { original: player, images: [], surfaces: [] },
        cursorImages: { original: cursor, images: [], surfaces: [] },
        plannedPath: planned,
        actualPath: actual,
        alignment,
        plannedGhost: [],
        actualGhost: [],
      };

      console.log("=== RENDER SYSTEM TEST ===");
      console.log("isFullyAligned:", alignment.isFullyAligned);

      renderSystem.onEngineUpdate(results);

      // Log colors used
      const colorsUsed = graphics.calls
        .filter(c => c.type === "lineStyle")
        .map(c => {
          const colorName = c.color === GREEN ? "GREEN" :
                           c.color === RED ? "RED" :
                           c.color === YELLOW ? "YELLOW" :
                           `0x${c.color?.toString(16)}`;
          return colorName;
        });
      console.log("Colors used:", colorsUsed);
      console.log("=== END RENDER SYSTEM TEST ===");

      // Verify: GREEN for aligned path, YELLOW for projection
      const usedColorSet = new Set(
        graphics.calls.filter(c => c.type === "lineStyle").map(c => c.color)
      );

      expect(usedColorSet.has(GREEN)).toBe(true);
      expect(usedColorSet.has(YELLOW)).toBe(true);
      expect(usedColorSet.has(RED)).toBe(false);
    });
  });

  describe("SystemCoordinator integration", () => {
    it("should pass correct results through coordinator to render system", () => {
      const engine = new TrajectoryEngine();
      const coordinator = new SystemCoordinator(engine);

      // Register render system
      coordinator.registerSystem(renderSystem, 0);

      // Set up empty scene
      engine.setPlayer({ x: 100, y: 300 });
      engine.setCursor({ x: 400, y: 300 });
      engine.setPlannedSurfaces([]);
      engine.setAllSurfaces([]);

      // Force calculation and update
      engine.invalidateAll();
      coordinator.update(0.016); // One frame

      console.log("=== COORDINATOR TEST ===");
      const colorsUsed = graphics.calls
        .filter(c => c.type === "lineStyle")
        .map(c => {
          const colorName = c.color === GREEN ? "GREEN" :
                           c.color === RED ? "RED" :
                           c.color === YELLOW ? "YELLOW" :
                           `0x${c.color?.toString(16)}`;
          return colorName;
        });
      console.log("Colors used via coordinator:", colorsUsed);
      console.log("=== END COORDINATOR TEST ===");

      // Verify no red
      const redCalls = graphics.calls.filter(c => c.type === "lineStyle" && c.color === RED);
      expect(redCalls).toHaveLength(0);

      // Clean up
      coordinator.dispose();
    });
  });

  describe("Game Scene Simulation", () => {
    it("should test with walls similar to the demo scene", () => {
      // Simulate the actual game scene setup
      const player: Vector2 = { x: 150, y: 450 };
      const cursor: Vector2 = { x: 400, y: 300 }; // Somewhere in the middle

      // Create wall surfaces similar to demo
      const width = 1024;
      const height = 768;

      const walls = [
        // Floor
        {
          id: "floor",
          segment: { start: { x: 0, y: height - 20 }, end: { x: width, y: height - 20 } },
          surfaceType: "wall" as const,
          onArrowHit: () => ({ type: "stop" as const }),
          isPlannable: () => false,
          getVisualProperties: () => ({ color: 0x666666, lineWidth: 2, alpha: 1 }),
          getNormal: () => ({ x: 0, y: -1 }),
          canReflectFrom: () => false,
        },
        // Ceiling
        {
          id: "ceiling",
          segment: { start: { x: 0, y: 80 }, end: { x: width, y: 80 } },
          surfaceType: "wall" as const,
          onArrowHit: () => ({ type: "stop" as const }),
          isPlannable: () => false,
          getVisualProperties: () => ({ color: 0x666666, lineWidth: 2, alpha: 1 }),
          getNormal: () => ({ x: 0, y: 1 }),
          canReflectFrom: () => false,
        },
        // Left wall
        {
          id: "left-wall",
          segment: { start: { x: 20, y: 80 }, end: { x: 20, y: height - 20 } },
          surfaceType: "wall" as const,
          onArrowHit: () => ({ type: "stop" as const }),
          isPlannable: () => false,
          getVisualProperties: () => ({ color: 0x666666, lineWidth: 2, alpha: 1 }),
          getNormal: () => ({ x: 1, y: 0 }),
          canReflectFrom: () => false,
        },
        // Right wall
        {
          id: "right-wall",
          segment: { start: { x: width - 20, y: 80 }, end: { x: width - 20, y: height - 20 } },
          surfaceType: "wall" as const,
          onArrowHit: () => ({ type: "stop" as const }),
          isPlannable: () => false,
          getVisualProperties: () => ({ color: 0x666666, lineWidth: 2, alpha: 1 }),
          getNormal: () => ({ x: -1, y: 0 }),
          canReflectFrom: () => false,
        },
      ] as never[];

      const engine = new TrajectoryEngine();
      engine.setPlayer(player);
      engine.setCursor(cursor);
      engine.setPlannedSurfaces([]); // Empty plan
      engine.setAllSurfaces(walls);

      const results = engine.getResults();

      console.log("=== GAME SCENE SIMULATION ===");
      console.log("Player:", player);
      console.log("Cursor:", cursor);
      console.log("All surfaces:", walls.length);
      console.log("");
      console.log("Planned path points:", results.plannedPath.points);
      console.log("Actual path points:", results.actualPath.points);
      console.log("Planned reachedCursor:", results.plannedPath.reachedCursor);
      console.log("Actual reachedCursor:", results.actualPath.reachedCursor);
      console.log("Actual blockedBy:", results.actualPath.blockedBy);
      console.log("");
      console.log("Alignment:", results.alignment);
      console.log("=== END GAME SCENE SIMULATION ===");

      // Clear graphics and render
      graphics.calls.length = 0;
      renderSystem.onEngineUpdate(results);

      const colorsUsed = graphics.calls
        .filter(c => c.type === "lineStyle")
        .map(c => {
          const colorName = c.color === GREEN ? "GREEN" :
                           c.color === RED ? "RED" :
                           c.color === YELLOW ? "YELLOW" :
                           `0x${c.color?.toString(16)}`;
          return colorName;
        });
      console.log("Colors used:", colorsUsed);

      // With empty plan and cursor not blocked by walls,
      // if paths are aligned, no red should be used
      if (results.alignment.isFullyAligned) {
        const redCalls = graphics.calls.filter(c => c.type === "lineStyle" && c.color === RED);
        expect(redCalls).toHaveLength(0);
      } else {
        // If not aligned, red IS expected
        console.log("PATHS NOT ALIGNED - red is expected in this case");
        console.log("Divergence point:", results.alignment.divergencePoint);
      }
    });
  });
});

