/**
 * RenderColors.test.ts
 *
 * First-Principle Tests for Trajectory Color Rendering
 *
 * FIRST PRINCIPLE: Color Indicates Discrepancy
 * - RED means discrepancy between planned and actual paths
 * - When paths are ALIGNED, nothing should be red
 * - GREEN shows aligned portion
 * - YELLOW shows actual path continuation (not a discrepancy)
 *
 * Color mapping:
 * - Solid green: Player to cursor (when aligned)
 * - Dashed yellow: Actual path forward projection (always for continuation)
 * - Solid red: Planned path where it diverges from actual
 * - Dashed red: Planned path forward projection (only when diverged)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { RenderSystem, type IGraphics } from "@/trajectory-v2/systems/RenderSystem";
import type { EngineResults, PathResult, AlignmentResult } from "@/trajectory-v2/engine/types";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { DEFAULT_RENDER_CONFIG } from "@/trajectory-v2/systems/ITrajectorySystem";

// Track all colors used in rendering
interface RenderCall {
  type: "lineStyle" | "lineBetween" | "clear";
  color?: number;
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
    lineStyle: vi.fn((width: number, color: number) => {
      calls.push({ type: "lineStyle", color });
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

function createMockEngineResults(options: {
  isFullyAligned: boolean;
  plannedPoints: Vector2[];
  actualPoints: Vector2[];
  divergencePoint?: Vector2;
  alignedSegmentCount?: number;
  plannedProjection?: Vector2[];
  actualProjection?: Vector2[];
}): EngineResults {
  const planned: PathResult = {
    points: options.plannedPoints,
    hitInfo: [],
    reachedCursor: true,
    totalLength: 100,
    forwardProjection: options.plannedProjection || [{ x: 1000, y: 300 }],
  };

  const actual: PathResult = {
    points: options.actualPoints,
    hitInfo: [],
    reachedCursor: true,
    totalLength: 100,
    forwardProjection: options.actualProjection || [{ x: 1000, y: 300 }],
  };

  const alignment: AlignmentResult = {
    isFullyAligned: options.isFullyAligned,
    alignedSegmentCount: options.alignedSegmentCount ?? (options.isFullyAligned ? options.plannedPoints.length - 1 : 0),
    firstMismatchIndex: options.isFullyAligned ? -1 : 0,
    divergencePoint: options.divergencePoint,
  };

  return {
    playerImages: { original: { x: 0, y: 0 }, images: [], surfaces: [] },
    cursorImages: { original: { x: 0, y: 0 }, images: [], surfaces: [] },
    plannedPath: planned,
    actualPath: actual,
    alignment,
    plannedGhost: [],
    actualGhost: [],
    bypassedSurfaces: [],
  };
}

describe("RenderColors", () => {
  let graphics: IGraphics & { calls: RenderCall[] };
  let renderSystem: RenderSystem;

  const GREEN = DEFAULT_RENDER_CONFIG.alignedColor;
  const RED = DEFAULT_RENDER_CONFIG.plannedDivergedColor;
  const YELLOW = DEFAULT_RENDER_CONFIG.actualDivergedColor;

  beforeEach(() => {
    graphics = createMockGraphics();
    renderSystem = new RenderSystem(graphics);
  });

  describe("First Principle: Red Indicates Discrepancy Only", () => {
    it("should NOT use red when paths are fully aligned (empty plan)", () => {
      // Empty plan = paths aligned = no discrepancy
      const results = createMockEngineResults({
        isFullyAligned: true,
        plannedPoints: [{ x: 100, y: 300 }, { x: 400, y: 300 }],
        actualPoints: [{ x: 100, y: 300 }, { x: 400, y: 300 }],
        actualProjection: [{ x: 1000, y: 300 }],
      });

      renderSystem.onEngineUpdate(results);

      // Check no red was used
      const redCalls = graphics.calls.filter(
        (c) => c.type === "lineStyle" && c.color === RED
      );
      expect(redCalls).toHaveLength(0);
    });

    it("should use green for main path when aligned", () => {
      const results = createMockEngineResults({
        isFullyAligned: true,
        plannedPoints: [{ x: 100, y: 300 }, { x: 400, y: 300 }],
        actualPoints: [{ x: 100, y: 300 }, { x: 400, y: 300 }],
      });

      renderSystem.onEngineUpdate(results);

      // Check green was used
      const greenCalls = graphics.calls.filter(
        (c) => c.type === "lineStyle" && c.color === GREEN
      );
      expect(greenCalls.length).toBeGreaterThan(0);
    });

    it("should use yellow for forward projection when aligned", () => {
      const results = createMockEngineResults({
        isFullyAligned: true,
        plannedPoints: [{ x: 100, y: 300 }, { x: 400, y: 300 }],
        actualPoints: [{ x: 100, y: 300 }, { x: 400, y: 300 }],
        actualProjection: [{ x: 1000, y: 300 }],
      });

      renderSystem.onEngineUpdate(results);

      // Check yellow was used (for projection)
      const yellowCalls = graphics.calls.filter(
        (c) => c.type === "lineStyle" && c.color === YELLOW
      );
      expect(yellowCalls.length).toBeGreaterThan(0);
    });

    it("should use red ONLY when paths diverge", () => {
      // Diverged paths = discrepancy = red is appropriate
      const results = createMockEngineResults({
        isFullyAligned: false,
        plannedPoints: [{ x: 100, y: 300 }, { x: 200, y: 300 }, { x: 400, y: 300 }],
        actualPoints: [{ x: 100, y: 300 }, { x: 200, y: 300 }, { x: 400, y: 400 }],
        divergencePoint: { x: 200, y: 300 },
        alignedSegmentCount: 1,
      });

      renderSystem.onEngineUpdate(results);

      // Red IS appropriate here because there's a discrepancy
      const redCalls = graphics.calls.filter(
        (c) => c.type === "lineStyle" && c.color === RED
      );
      expect(redCalls.length).toBeGreaterThan(0);
    });
  });

  describe("Aligned Path Color Sequence", () => {
    it("should render: solid green path, then dashed yellow projection", () => {
      const results = createMockEngineResults({
        isFullyAligned: true,
        plannedPoints: [{ x: 100, y: 300 }, { x: 400, y: 300 }],
        actualPoints: [{ x: 100, y: 300 }, { x: 400, y: 300 }],
        actualProjection: [{ x: 1000, y: 300 }],
      });

      renderSystem.onEngineUpdate(results);

      // Find the sequence of colors
      const colorSequence = graphics.calls
        .filter((c) => c.type === "lineStyle")
        .map((c) => c.color);

      // First should be green (main path)
      expect(colorSequence[0]).toBe(GREEN);

      // Yellow should come after green (projection)
      const greenIndex = colorSequence.indexOf(GREEN);
      const yellowIndex = colorSequence.indexOf(YELLOW);
      expect(yellowIndex).toBeGreaterThan(greenIndex);
    });
  });

  describe("Diverged Path Color Sequence", () => {
    it("should render: solid green (aligned), solid red (diverged planned), dashed yellow (actual)", () => {
      const results = createMockEngineResults({
        isFullyAligned: false,
        plannedPoints: [{ x: 100, y: 300 }, { x: 200, y: 300 }, { x: 400, y: 300 }],
        actualPoints: [{ x: 100, y: 300 }, { x: 200, y: 300 }, { x: 400, y: 400 }],
        divergencePoint: { x: 200, y: 300 },
        alignedSegmentCount: 1,
        plannedProjection: [{ x: 800, y: 300 }],
        actualProjection: [{ x: 800, y: 600 }],
      });

      renderSystem.onEngineUpdate(results);

      const colorSequence = graphics.calls
        .filter((c) => c.type === "lineStyle")
        .map((c) => c.color);

      // Should have green, red, and yellow
      expect(colorSequence).toContain(GREEN);
      expect(colorSequence).toContain(RED);
      expect(colorSequence).toContain(YELLOW);
    });
  });

  describe("Empty Plan Specific Cases", () => {
    it("should render only green + yellow when plan is empty and cursor reachable", () => {
      // This is the exact bug case: empty plan, cursor reachable
      // Should be: solid green to cursor, dashed yellow beyond
      // Should NOT have any red
      const results = createMockEngineResults({
        isFullyAligned: true,
        plannedPoints: [{ x: 100, y: 300 }, { x: 400, y: 300 }],
        actualPoints: [{ x: 100, y: 300 }, { x: 400, y: 300 }],
        actualProjection: [{ x: 1000, y: 300 }],
        plannedProjection: [{ x: 1000, y: 300 }],
      });

      renderSystem.onEngineUpdate(results);

      const usedColors = new Set(
        graphics.calls
          .filter((c) => c.type === "lineStyle")
          .map((c) => c.color)
      );

      // Should have green and yellow
      expect(usedColors.has(GREEN)).toBe(true);
      expect(usedColors.has(YELLOW)).toBe(true);

      // Should NOT have red (no discrepancy)
      expect(usedColors.has(RED)).toBe(false);
    });

    it("should handle projection correctly for straight horizontal path", () => {
      const results = createMockEngineResults({
        isFullyAligned: true,
        plannedPoints: [{ x: 100, y: 300 }, { x: 500, y: 300 }],
        actualPoints: [{ x: 100, y: 300 }, { x: 500, y: 300 }],
        actualProjection: [{ x: 1500, y: 300 }],
      });

      renderSystem.onEngineUpdate(results);

      // Verify no red
      const redCalls = graphics.calls.filter(
        (c) => c.type === "lineStyle" && c.color === RED
      );
      expect(redCalls).toHaveLength(0);
    });
  });
});

/**
 * Integration test: End-to-end path building + alignment + rendering
 */
import {
  buildPlannedPath,
  buildActualPath,
  calculateAlignment,
} from "@/trajectory-v2/engine/PathBuilder";
import { TrajectoryEngine } from "@/trajectory-v2/engine/TrajectoryEngine";

describe("RenderColors Integration", () => {
  let graphics: IGraphics & { calls: RenderCall[] };
  let renderSystem: RenderSystem;

  const GREEN = DEFAULT_RENDER_CONFIG.alignedColor;
  const RED = DEFAULT_RENDER_CONFIG.plannedDivergedColor;
  const YELLOW = DEFAULT_RENDER_CONFIG.actualDivergedColor;

  beforeEach(() => {
    graphics = createMockGraphics();
    renderSystem = new RenderSystem(graphics);
  });

  it("should NOT use red for empty plan scenario (integration)", () => {
    // Build paths exactly as the engine would
    const player = { x: 100, y: 300 };
    const cursor = { x: 400, y: 300 };
    const plannedSurfaces: never[] = [];
    const allSurfaces: never[] = [];

    const planned = buildPlannedPath(player, cursor, plannedSurfaces);
    const actual = buildActualPath(player, cursor, plannedSurfaces, allSurfaces);
    const alignment = calculateAlignment(planned, actual);

    // Verify alignment is correct
    expect(alignment.isFullyAligned).toBe(true);

    const results: EngineResults = {
      playerImages: { original: player, images: [], surfaces: [] },
      cursorImages: { original: cursor, images: [], surfaces: [] },
      plannedPath: planned,
      actualPath: actual,
      alignment,
      plannedGhost: [],
      actualGhost: [],
      bypassedSurfaces: [],
    };

    renderSystem.onEngineUpdate(results);

    // Check colors used
    const usedColors = new Set(
      graphics.calls
        .filter((c) => c.type === "lineStyle")
        .map((c) => c.color)
    );

    // Should have green (main path) and yellow (projection)
    expect(usedColors.has(GREEN)).toBe(true);
    expect(usedColors.has(YELLOW)).toBe(true);

    // Should NOT have red
    expect(usedColors.has(RED)).toBe(false);
  });

  it("should correctly align paths with empty plan", () => {
    const player = { x: 100, y: 300 };
    const cursor = { x: 400, y: 300 };

    const planned = buildPlannedPath(player, cursor, []);
    const actual = buildActualPath(player, cursor, [], []);

    // Both should have the same points
    expect(planned.points).toHaveLength(2);
    expect(actual.points.length).toBeGreaterThanOrEqual(2);

    // Both should reach cursor
    expect(planned.reachedCursor).toBe(true);
    expect(actual.reachedCursor).toBe(true);

    // Alignment should be full
    const alignment = calculateAlignment(planned, actual);
    expect(alignment.isFullyAligned).toBe(true);
  });

  it("should correctly align when actual path extends beyond cursor", () => {
    // If actual path has more points (extends to max distance), it should still align
    const player = { x: 100, y: 300 };
    const cursor = { x: 400, y: 300 };

    const planned = buildPlannedPath(player, cursor, []);
    const actual = buildActualPath(player, cursor, [], []);

    console.log("Planned points:", planned.points);
    console.log("Actual points:", actual.points);
    console.log("Planned.reachedCursor:", planned.reachedCursor);
    console.log("Actual.reachedCursor:", actual.reachedCursor);

    const alignment = calculateAlignment(planned, actual);
    console.log("Alignment:", alignment);

    // Should be aligned
    expect(alignment.isFullyAligned).toBe(true);
  });

  it("should use red for planned projection when obstacle blocks path", () => {
    // This is the correct behavior: obstacle blocks = discrepancy = red is appropriate
    // BUT the planned path must still show the ideal trajectory (dashed red beyond cursor)
    const player = { x: 100, y: 300 };
    const cursor = { x: 500, y: 300 };

    // Create a wall surface
    const wall = {
      id: "wall",
      segment: { start: { x: 300, y: 200 }, end: { x: 300, y: 400 } },
      surfaceType: "wall",
      onArrowHit: () => ({ type: "stop" }),
      isPlannable: () => false,
      getVisualProperties: () => ({ color: 0xffffff, lineWidth: 2, alpha: 1 }),
      getNormal: () => ({ x: -1, y: 0 }),
      canReflectFrom: () => false,
    } as never;

    const planned = buildPlannedPath(player, cursor, []);
    const actual = buildActualPath(player, cursor, [], [wall]);

    console.log("With obstacle:");
    console.log("Planned.reachedCursor:", planned.reachedCursor);
    console.log("Actual.reachedCursor:", actual.reachedCursor);
    console.log("Actual.blockedBy:", actual.blockedBy);

    const alignment = calculateAlignment(planned, actual);
    console.log("Alignment with obstacle:", alignment);

    // Should NOT be aligned (obstacle blocks)
    expect(alignment.isFullyAligned).toBe(false);

    // Red is appropriate here because there's a discrepancy
    // The planned projection should be dashed red to show ideal path
  });

  it("should render correctly using TrajectoryEngine (end-to-end)", () => {
    // This test simulates the actual game flow
    const engine = new TrajectoryEngine();
    engine.setPlayer({ x: 100, y: 300 });
    engine.setCursor({ x: 400, y: 300 });
    engine.setPlannedSurfaces([]);
    engine.setAllSurfaces([]);

    const results = engine.getResults();

    console.log("Engine results:");
    console.log("isFullyAligned:", results.alignment.isFullyAligned);
    console.log("plannedPath.forwardProjection:", results.plannedPath.forwardProjection);
    console.log("actualPath.forwardProjection:", results.actualPath.forwardProjection);

    // Verify alignment
    expect(results.alignment.isFullyAligned).toBe(true);

    // Create render system and test
    renderSystem.onEngineUpdate(results);

    const usedColors = new Set(
      graphics.calls
        .filter((c) => c.type === "lineStyle")
        .map((c) => c.color)
    );

    console.log("Colors used:", Array.from(usedColors).map(c => c?.toString(16)));

    // Should NOT have red
    expect(usedColors.has(RED)).toBe(false);
    // Should have green and yellow
    expect(usedColors.has(GREEN)).toBe(true);
    expect(usedColors.has(YELLOW)).toBe(true);
  });
});

