/**
 * Systems Tests
 *
 * Tests for RenderSystem, AimingSystem, ArrowSystem, and SystemCoordinator.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { RenderSystem, type IGraphics } from "@/trajectory-v2/systems/RenderSystem";
import { AimingSystem } from "@/trajectory-v2/systems/AimingSystem";
import { ArrowSystem } from "@/trajectory-v2/systems/ArrowSystem";
import { SystemCoordinator } from "@/trajectory-v2/coordinator/SystemCoordinator";
import { TrajectoryEngine } from "@/trajectory-v2/engine/TrajectoryEngine";
import type { EngineResults } from "@/trajectory-v2/engine/types";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// Helper to create mock graphics
function createMockGraphics(): IGraphics {
  return {
    clear: vi.fn(),
    lineStyle: vi.fn(),
    lineBetween: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    strokePath: vi.fn(),
  };
}

// Helper to create a mock surface
function createMockSurface(id: string, start: Vector2, end: Vector2): Surface {
  return {
    id,
    segment: { start, end },
    surfaceType: "ricochet",
    onArrowHit: () => ({ type: "reflect" }),
    isPlannable: () => true,
    getVisualProperties: () => ({ color: 0xffffff, lineWidth: 2, alpha: 1 }),
    getNormal: () => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      return { x: -dy / len, y: dx / len };
    },
    canReflectFrom: () => true,
  };
}

// Helper to create mock engine results
function createMockResults(overrides: Partial<EngineResults> = {}): EngineResults {
  return {
    playerImages: { original: { x: 0, y: 0 }, images: [], surfaces: [] },
    cursorImages: { original: { x: 100, y: 0 }, images: [], surfaces: [] },
    plannedPath: {
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      hitInfo: [],
      reachedCursor: true,
      totalLength: 100,
    },
    actualPath: {
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      hitInfo: [],
      reachedCursor: true,
      totalLength: 100,
    },
    alignment: {
      isFullyAligned: true,
      alignedSegmentCount: 1,
      firstMismatchIndex: -1,
    },
    plannedGhost: [],
    actualGhost: [],
    ...overrides,
  };
}

describe("RenderSystem", () => {
  let graphics: IGraphics;
  let renderSystem: RenderSystem;

  beforeEach(() => {
    graphics = createMockGraphics();
    renderSystem = new RenderSystem(graphics);
  });

  it("should clear graphics on engine update", () => {
    const results = createMockResults();
    renderSystem.onEngineUpdate(results);

    expect(graphics.clear).toHaveBeenCalled();
  });

  it("should render aligned path in green", () => {
    const results = createMockResults();
    renderSystem.onEngineUpdate(results);

    expect(graphics.lineStyle).toHaveBeenCalledWith(2, 0x00ff00, 1.0);
    expect(graphics.lineBetween).toHaveBeenCalled();
  });

  it("should render diverged path with multiple colors", () => {
    const results = createMockResults({
      alignment: {
        isFullyAligned: false,
        alignedSegmentCount: 0,
        firstMismatchIndex: 0,
        divergencePoint: { x: 50, y: 0 },
      },
    });

    renderSystem.onEngineUpdate(results);

    // Should use both aligned and diverged colors
    const lineStyleCalls = (graphics.lineStyle as ReturnType<typeof vi.fn>).mock.calls;
    expect(lineStyleCalls.length).toBeGreaterThan(1);
  });

  it("should dispose correctly", () => {
    renderSystem.dispose();
    expect(graphics.clear).toHaveBeenCalled();
  });
});

describe("AimingSystem", () => {
  let aimingSystem: AimingSystem;

  beforeEach(() => {
    aimingSystem = new AimingSystem();
  });

  describe("plan management", () => {
    it("should add surface to plan", () => {
      const surface = createMockSurface("s1", { x: 0, y: 50 }, { x: 100, y: 50 });
      aimingSystem.addSurface(surface);

      expect(aimingSystem.getPlannedSurfaces()).toContain(surface);
    });

    it("should remove surface from plan", () => {
      const surface = createMockSurface("s1", { x: 0, y: 50 }, { x: 100, y: 50 });
      aimingSystem.addSurface(surface);
      aimingSystem.removeSurface(surface);

      expect(aimingSystem.getPlannedSurfaces()).not.toContain(surface);
    });

    it("should toggle surface", () => {
      const surface = createMockSurface("s1", { x: 0, y: 50 }, { x: 100, y: 50 });

      aimingSystem.toggleSurface(surface);
      expect(aimingSystem.isInPlan(surface)).toBe(true);

      aimingSystem.toggleSurface(surface);
      expect(aimingSystem.isInPlan(surface)).toBe(false);
    });

    it("should clear plan", () => {
      const surface = createMockSurface("s1", { x: 0, y: 50 }, { x: 100, y: 50 });
      aimingSystem.addSurface(surface);
      aimingSystem.clearPlan();

      expect(aimingSystem.getPlannedSurfaces()).toHaveLength(0);
    });

    it("should emit plan_changed event", () => {
      const handler = vi.fn();
      aimingSystem.onEvent(handler);

      const surface = createMockSurface("s1", { x: 0, y: 50 }, { x: 100, y: 50 });
      aimingSystem.addSurface(surface);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: "plan_changed" })
      );
    });
  });

  describe("shooting", () => {
    it("should not shoot without engine results", () => {
      expect(aimingSystem.shoot()).toBe(false);
    });

    it("should shoot with aligned path", () => {
      const results = createMockResults();
      aimingSystem.onEngineUpdate(results);

      const handler = vi.fn();
      aimingSystem.onEvent(handler);

      expect(aimingSystem.shoot()).toBe(true);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: "arrow_shot" })
      );
    });

    it("should respect cooldown", () => {
      const results = createMockResults();
      aimingSystem.onEngineUpdate(results);

      expect(aimingSystem.shoot()).toBe(true);
      expect(aimingSystem.shoot()).toBe(false); // Still on cooldown

      // Advance time past cooldown
      aimingSystem.update(0.5);
      expect(aimingSystem.shoot()).toBe(true);
    });

    it("should check cursor reachability", () => {
      const alignedResults = createMockResults();
      aimingSystem.onEngineUpdate(alignedResults);
      expect(aimingSystem.isCursorReachable()).toBe(true);

      const misalignedResults = createMockResults({
        alignment: { isFullyAligned: false, alignedSegmentCount: 0, firstMismatchIndex: 0 },
      });
      aimingSystem.onEngineUpdate(misalignedResults);
      expect(aimingSystem.isCursorReachable()).toBe(false);
    });
  });
});

describe("ArrowSystem", () => {
  let arrowSystem: ArrowSystem;

  beforeEach(() => {
    arrowSystem = new ArrowSystem({ speed: 100 });
  });

  it("should create arrow with waypoints", () => {
    const waypoints = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];

    const arrow = arrowSystem.createArrow(waypoints);

    expect(arrow).not.toBeNull();
    expect(arrow?.waypoints).toEqual(waypoints);
    expect(arrow?.active).toBe(true);
  });

  it("should not create arrow with insufficient waypoints", () => {
    const arrow = arrowSystem.createArrow([{ x: 0, y: 0 }]);
    expect(arrow).toBeNull();
  });

  it("should update arrow position", () => {
    const waypoints = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];

    const arrow = arrowSystem.createArrow(waypoints);
    arrowSystem.update(0.5); // Move 50 pixels at 100 px/s

    expect(arrow?.position.x).toBeCloseTo(50);
  });

  it("should reach waypoint and continue", () => {
    const waypoints = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ];

    const callback = vi.fn();
    arrowSystem.onArrowEvent(callback);

    const arrow = arrowSystem.createArrow(waypoints);
    arrowSystem.update(0.6); // Move 60 pixels, past first waypoint

    expect(callback).toHaveBeenCalledWith(arrow, "waypoint_reached");
  });

  it("should complete when reaching end", () => {
    const waypoints = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ];

    const callback = vi.fn();
    arrowSystem.onArrowEvent(callback);

    arrowSystem.createArrow(waypoints);
    arrowSystem.update(1.0); // Move 100 pixels, past endpoint
    arrowSystem.update(0.1); // Next update triggers completion check

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ id: "arrow_1" }),
      "completed"
    );
  });

  it("should handle aiming event", () => {
    arrowSystem.handleEvent({
      type: "arrow_shot",
      data: {
        waypoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        isFullyAligned: true,
      },
    });

    expect(arrowSystem.getActiveArrows()).toHaveLength(1);
  });
});

describe("SystemCoordinator", () => {
  let engine: TrajectoryEngine;
  let coordinator: SystemCoordinator;

  beforeEach(() => {
    engine = new TrajectoryEngine();
    coordinator = new SystemCoordinator(engine);
  });

  it("should register systems", () => {
    const graphics = createMockGraphics();
    const renderSystem = new RenderSystem(graphics);

    coordinator.registerSystem(renderSystem);

    expect(coordinator.getSystemIds()).toContain("render");
  });

  it("should throw on duplicate registration", () => {
    const graphics = createMockGraphics();
    const renderSystem = new RenderSystem(graphics);

    coordinator.registerSystem(renderSystem);

    expect(() => coordinator.registerSystem(renderSystem)).toThrow();
  });

  it("should connect producer to consumer", () => {
    const aimingSystem = new AimingSystem();
    const arrowSystem = new ArrowSystem();

    coordinator.registerSystem(aimingSystem);
    coordinator.registerSystem(arrowSystem);
    coordinator.connect("aiming", "arrow");

    // Trigger a shot
    aimingSystem.onEngineUpdate(createMockResults());
    aimingSystem.shoot();

    expect(arrowSystem.getActiveArrows()).toHaveLength(1);
  });

  it("should update all systems", () => {
    const aimingSystem = new AimingSystem();
    const arrowSystem = new ArrowSystem();

    coordinator.registerSystem(aimingSystem);
    coordinator.registerSystem(arrowSystem);

    // Create an arrow with a long path
    // Default speed is 800 px/s, so use a path long enough to not complete in 0.05s
    arrowSystem.createArrow([{ x: 0, y: 0 }, { x: 1000, y: 0 }]);

    // Update briefly - arrow should move but not complete
    coordinator.update(0.05); // At 800 px/s, moves 40 px

    const arrows = arrowSystem.getActiveArrows();
    expect(arrows.length).toBe(1);
    expect(arrows[0].position.x).toBeGreaterThan(0);
    expect(arrows[0].position.x).toBeLessThan(1000);
  });

  it("should route engine updates to systems", () => {
    const graphics = createMockGraphics();
    const renderSystem = new RenderSystem(graphics);

    coordinator.registerSystem(renderSystem);

    engine.setPlayer({ x: 0, y: 0 });
    engine.setCursor({ x: 100, y: 0 });
    engine.invalidateAll();

    expect(graphics.clear).toHaveBeenCalled();
  });

  it("should dispose correctly", () => {
    const graphics = createMockGraphics();
    const renderSystem = new RenderSystem(graphics);
    const aimingSystem = new AimingSystem();

    coordinator.registerSystem(renderSystem);
    coordinator.registerSystem(aimingSystem);

    coordinator.dispose();

    expect(coordinator.getSystemIds()).toHaveLength(0);
  });
});

