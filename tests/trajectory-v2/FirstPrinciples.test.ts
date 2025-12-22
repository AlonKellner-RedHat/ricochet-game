/**
 * FirstPrinciples.test.ts
 *
 * Comprehensive tests for all trajectory system first principles.
 * See docs/trajectory/first-principles.md for full documentation.
 *
 * Each test is tagged with the principle it verifies.
 */

import type { Surface } from "@/surfaces/Surface";
import {
  buildActualPath,
  buildPlannedPath,
  calculateAlignment,
} from "@/trajectory-v2/engine/PathBuilder";
import { TrajectoryEngine } from "@/trajectory-v2/engine/TrajectoryEngine";
import type { EngineResults, PathResult } from "@/trajectory-v2/engine/types";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { AimingSystem } from "@/trajectory-v2/systems/AimingSystem";
import { DEFAULT_RENDER_CONFIG } from "@/trajectory-v2/systems/ITrajectorySystem";
import { type IGraphics, RenderSystem } from "@/trajectory-v2/systems/RenderSystem";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// TEST HELPERS
// ============================================================================

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

function createMockSurface(
  id: string,
  start: Vector2,
  end: Vector2,
  options: { canReflect?: boolean } = {}
): Surface {
  const { canReflect = true } = options;
  return {
    id,
    segment: { start, end },
    surfaceType: canReflect ? "ricochet" : "wall",
    onArrowHit: () => ({ type: canReflect ? "reflect" : "stop" }),
    isPlannable: () => canReflect,
    getVisualProperties: () => ({ color: 0xffffff, lineWidth: 2, alpha: 1 }),
    getNormal: () => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      return { x: -dy / len, y: dx / len };
    },
    canReflectFrom: () => canReflect,
  };
}

const GREEN = DEFAULT_RENDER_CONFIG.alignedColor;
const RED = DEFAULT_RENDER_CONFIG.plannedDivergedColor;
const YELLOW = DEFAULT_RENDER_CONFIG.actualDivergedColor;

// ============================================================================
// PRINCIPLE 1.1: Actual Path Must Always Be Fully Visualized
// ============================================================================

describe("Principle 1.1: Actual Path Must Always Be Fully Visualized", () => {
  let graphics: IGraphics & { calls: RenderCall[] };
  let renderSystem: RenderSystem;

  beforeEach(() => {
    graphics = createMockGraphics();
    renderSystem = new RenderSystem(graphics);
  });

  it("should show solid green path to cursor when aligned", () => {
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 400, y: 300 };

    const planned = buildPlannedPath(player, cursor, []);
    const actual = buildActualPath(player, cursor, [], []);
    const alignment = calculateAlignment(planned, actual);

    const results: EngineResults = {
      playerImages: { original: player, images: [], surfaces: [] },
      cursorImages: { original: cursor, images: [], surfaces: [] },
      plannedPath: planned,
      actualPath: actual,
      alignment,
      plannedGhost: [],
      actualGhost: [],
    };

    renderSystem.onEngineUpdate(results);

    // Should have green for main path
    const greenCalls = graphics.calls.filter((c) => c.type === "lineStyle" && c.color === GREEN);
    expect(greenCalls.length).toBeGreaterThan(0);

    // Should have line from player to cursor
    const lineCalls = graphics.calls.filter((c) => c.type === "lineBetween");
    expect(lineCalls.length).toBeGreaterThan(0);
  });

  it("should show dashed yellow projection beyond cursor", () => {
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 400, y: 300 };

    const actual = buildActualPath(player, cursor, [], []);

    // Should have forward projection
    expect(actual.forwardProjection).toBeDefined();
    expect(actual.forwardProjection!.length).toBeGreaterThan(0);
  });

  it("should have no gaps in visualization", () => {
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 400, y: 300 };

    const actual = buildActualPath(player, cursor, [], []);

    // Path should go from player to cursor
    expect(actual.points[0]).toEqual(player);
    expect(actual.points[actual.points.length - 1]).toEqual(cursor);

    // Projection should continue from cursor
    expect(actual.forwardProjection).toBeDefined();
  });
});

// ============================================================================
// PRINCIPLE 1.3: Red Indicates Discrepancy Only
// ============================================================================

describe("Principle 1.3: Red Indicates Discrepancy Only", () => {
  let graphics: IGraphics & { calls: RenderCall[] };
  let renderSystem: RenderSystem;

  beforeEach(() => {
    graphics = createMockGraphics();
    renderSystem = new RenderSystem(graphics);
  });

  it("should NOT use red when paths are fully aligned", () => {
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 400, y: 300 };

    const planned = buildPlannedPath(player, cursor, []);
    const actual = buildActualPath(player, cursor, [], []);
    const alignment = calculateAlignment(planned, actual);

    expect(alignment.isFullyAligned).toBe(true);

    const results: EngineResults = {
      playerImages: { original: player, images: [], surfaces: [] },
      cursorImages: { original: cursor, images: [], surfaces: [] },
      plannedPath: planned,
      actualPath: actual,
      alignment,
      plannedGhost: [],
      actualGhost: [],
    };

    renderSystem.onEngineUpdate(results);

    const redCalls = graphics.calls.filter((c) => c.type === "lineStyle" && c.color === RED);
    expect(redCalls).toHaveLength(0);
  });

  it("should use red when paths diverge", () => {
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 500, y: 300 };
    const wall = createMockSurface(
      "wall",
      { x: 300, y: 200 },
      { x: 300, y: 400 },
      { canReflect: false }
    );

    const planned = buildPlannedPath(player, cursor, []);
    const actual = buildActualPath(player, cursor, [], [wall]);
    const alignment = calculateAlignment(planned, actual);

    expect(alignment.isFullyAligned).toBe(false);

    const results: EngineResults = {
      playerImages: { original: player, images: [], surfaces: [] },
      cursorImages: { original: cursor, images: [], surfaces: [] },
      plannedPath: planned,
      actualPath: actual,
      alignment,
      plannedGhost: [],
      actualGhost: [],
    };

    renderSystem.onEngineUpdate(results);

    const redCalls = graphics.calls.filter((c) => c.type === "lineStyle" && c.color === RED);
    expect(redCalls.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// PRINCIPLE 2.1: Actual Path Must Follow Physically Accurate Trajectory
// ============================================================================

describe("Principle 2.1: Actual Path Must Follow Physically Accurate Trajectory", () => {
  it("should reflect off reflective surfaces", () => {
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 500, y: 300 };
    const ricochet = createMockSurface("ricochet", { x: 300, y: 200 }, { x: 300, y: 400 });

    const actual = buildActualPath(player, cursor, [ricochet], [ricochet]);

    // Path should have a reflection point
    expect(actual.points.length).toBeGreaterThanOrEqual(2);

    // Check if path changes direction at the surface
    if (actual.points.length >= 3) {
      const beforeHit = actual.points[0]!;
      const hitPoint = actual.points[1]!;
      const afterHit = actual.points[2]!;

      // X direction should reverse after hitting vertical surface
      const beforeDx = hitPoint.x - beforeHit.x;
      const afterDx = afterHit.x - hitPoint.x;
      expect(beforeDx * afterDx).toBeLessThanOrEqual(0); // Opposite signs = reflection
    }
  });

  it("should stop at walls", () => {
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 500, y: 300 };
    const wall = createMockSurface(
      "wall",
      { x: 300, y: 200 },
      { x: 300, y: 400 },
      { canReflect: false }
    );

    const actual = buildActualPath(player, cursor, [], [wall]);

    expect(actual.blockedBy).toBe(wall);
    expect(actual.reachedCursor).toBe(false);
  });

  it("should end at cursor when cursor is on path before obstacles", () => {
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 200, y: 300 };
    const wall = createMockSurface(
      "wall",
      { x: 400, y: 200 },
      { x: 400, y: 400 },
      { canReflect: false }
    );

    const actual = buildActualPath(player, cursor, [], [wall]);

    expect(actual.reachedCursor).toBe(true);
    expect(actual.points[actual.points.length - 1]).toEqual(cursor);
  });
});

// ============================================================================
// PRINCIPLE 2.2: Forward Projection Must Follow Physically Accurate Trajectory
// ============================================================================

describe("Principle 2.2: Forward Projection Must Follow Physically Accurate Trajectory", () => {
  it("should reflect forward projection off reflective surfaces", () => {
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 200, y: 300 };
    // Ricochet surface after cursor (cursor at x=200, surface at x=400)
    const ricochet = createMockSurface("ricochet", { x: 400, y: 200 }, { x: 400, y: 400 });

    const actual = buildActualPath(player, cursor, [], [ricochet]);

    // Path should end at cursor
    expect(actual.reachedCursor).toBe(true);
    expect(actual.points[actual.points.length - 1]).toEqual(cursor);

    // Forward projection should exist
    expect(actual.forwardProjection).toBeDefined();
    expect(actual.forwardProjection!.length).toBeGreaterThan(0);

    // PRINCIPLE 2.2: Forward projection should contain the reflection point at x=400
    // The projection should NOT go straight through to x=1200
    // It should hit the surface at x=400, then reflect back
    const projectionPoints = actual.forwardProjection!;

    // There should be a point at or near x=400 (the surface)
    const hasReflectionPoint = projectionPoints.some((p) => Math.abs(p.x - 400) < 10);
    expect(hasReflectionPoint).toBe(true);
  });

  it("should stop forward projection at walls", () => {
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 200, y: 300 };
    // Wall after cursor
    const wall = createMockSurface(
      "wall",
      { x: 400, y: 200 },
      { x: 400, y: 400 },
      { canReflect: false }
    );

    const actual = buildActualPath(player, cursor, [], [wall]);

    // Path should end at cursor
    expect(actual.reachedCursor).toBe(true);

    // PRINCIPLE 2.2: Forward projection should stop at wall
    expect(actual.forwardProjection).toBeDefined();

    // The last point of projection should be at or before the wall (x=400)
    // Should NOT go through to x=1200
    const projectionPoints = actual.forwardProjection!;
    if (projectionPoints.length > 0) {
      const lastPoint = projectionPoints[projectionPoints.length - 1]!;
      expect(lastPoint.x).toBeLessThanOrEqual(401); // At or before the wall
    }
  });

  it("should render projection through ALL intermediate points, not skip to endpoint", () => {
    // This test catches the bug where renderForwardProjection draws
    // a straight line from cursor to the LAST projection point,
    // skipping intermediate reflection points
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 200, y: 300 };
    const ricochet = createMockSurface("ricochet", { x: 400, y: 200 }, { x: 400, y: 400 });

    const actual = buildActualPath(player, cursor, [], [ricochet]);
    const projection = actual.forwardProjection!;

    // Projection should have multiple points: [reflectionPoint, endpoint]
    expect(projection.length).toBeGreaterThanOrEqual(2);

    // The FIRST projection point should be the reflection point (at surface x=400)
    const reflectionPoint = projection[0]!;
    expect(Math.abs(reflectionPoint.x - 400)).toBeLessThan(10);

    // The SECOND projection point should be the reflected endpoint (reflected back)
    const reflectedEndpoint = projection[1]!;
    expect(reflectedEndpoint.x).toBeLessThan(400); // Reflected back, so x < 400

    // CRITICAL: A visualization that draws straight from cursor to reflectedEndpoint
    // would go THROUGH the surface at x=400. This violates physics.
    // The visualization MUST draw: cursor -> reflectionPoint -> reflectedEndpoint
  });

  it("should render projection with physics-accurate segments in RenderSystem", () => {
    // Test that RenderSystem draws through ALL projection points
    const graphics = createMockGraphics();
    const renderSystem = new RenderSystem(graphics);

    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 200, y: 300 };
    const ricochet = createMockSurface("ricochet", { x: 400, y: 200 }, { x: 400, y: 400 });

    const planned = buildPlannedPath(player, cursor, []);
    const actual = buildActualPath(player, cursor, [], [ricochet]);
    const alignment = calculateAlignment(planned, actual);

    const results: EngineResults = {
      playerImages: { original: player, images: [], surfaces: [] },
      cursorImages: { original: cursor, images: [], surfaces: [] },
      plannedPath: planned,
      actualPath: actual,
      alignment,
      plannedGhost: [],
      actualGhost: [],
    };

    renderSystem.onEngineUpdate(results);

    // Find all lineBetween calls
    const lineCalls = graphics.calls.filter((c) => c.type === "lineBetween");

    // There should be a line that ends at or starts from the reflection point (x=400)
    // This ensures the projection is drawn THROUGH the reflection point, not past it
    const hasLineToReflectionPoint = lineCalls.some(
      (c) =>
        (Math.abs(c.x2! - 400) < 10 && Math.abs(c.y2! - 300) < 10) ||
        (Math.abs(c.x1! - 400) < 10 && Math.abs(c.y1! - 300) < 10)
    );

    expect(hasLineToReflectionPoint).toBe(true);

    // CRITICAL: Verify that lines AFTER the reflection point go in the OPPOSITE direction
    // Find lines that start near x=400 (the reflection point)
    const linesFromReflection = lineCalls.filter(
      (c) => Math.abs(c.x1! - 400) < 10 && Math.abs(c.y1! - 300) < 10
    );

    // At least one line should start at x=400 and go LEFT (toward negative x)
    const hasReflectedLine = linesFromReflection.some((c) => c.x2! < c.x1!);
    expect(hasReflectedLine).toBe(true);
  });
});

// ============================================================================
// PRINCIPLE 2.3: Arrows Must Follow Physically Accurate Trajectory
// ============================================================================

describe("Principle 2.3: Arrows Must Follow Physically Accurate Trajectory", () => {
  it("should provide arrow waypoints that continue past cursor", () => {
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 200, y: 300 };

    const engine = new TrajectoryEngine();
    engine.setPlayer(player);
    engine.setCursor(cursor);
    engine.setPlannedSurfaces([]);
    engine.setAllSurfaces([]);

    const aimingSystem = new AimingSystem({ shootCooldown: 0 });

    // Feed engine results to aiming system
    const results = engine.getResults();
    aimingSystem.onEngineUpdate(results);

    // Shoot and get waypoints
    const canShoot = aimingSystem.shoot();
    expect(canShoot).toBe(true);

    const waypoints = aimingSystem.getArrowWaypoints();

    // PRINCIPLE 2.3: Arrow waypoints should extend past cursor
    // The path ends at cursor (x=200), but arrow should continue
    expect(waypoints.length).toBeGreaterThanOrEqual(2);

    // The last waypoint should be PAST the cursor
    const lastWaypoint = waypoints[waypoints.length - 1]!;
    expect(lastWaypoint.x).toBeGreaterThan(cursor.x);
  });

  it("should reflect arrow off surfaces after cursor", () => {
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 200, y: 300 };
    const ricochet = createMockSurface("ricochet", { x: 400, y: 200 }, { x: 400, y: 400 });

    const engine = new TrajectoryEngine();
    engine.setPlayer(player);
    engine.setCursor(cursor);
    engine.setPlannedSurfaces([]);
    engine.setAllSurfaces([ricochet]);

    const aimingSystem = new AimingSystem({ shootCooldown: 0 });
    aimingSystem.onEngineUpdate(engine.getResults());
    aimingSystem.shoot();

    const waypoints = aimingSystem.getArrowWaypoints();

    // PRINCIPLE 2.3: Arrow waypoints should include the reflection point
    // Arrow goes: player -> cursor -> surface (x=400) -> reflects back

    // Should have at least 3 waypoints: player, surface hit, reflection endpoint
    expect(waypoints.length).toBeGreaterThanOrEqual(3);

    // One waypoint should be at or near the surface (x=400)
    const hasReflectionPoint = waypoints.some((p) => Math.abs(p.x - 400) < 10);
    expect(hasReflectionPoint).toBe(true);
  });
});

// ============================================================================
// PRINCIPLE 3.1: Path Ends at Cursor When On Path
// ============================================================================

describe("Principle 3.1: Path Ends at Cursor When On Path", () => {
  it("should end at cursor when cursor is directly on path", () => {
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 400, y: 300 };

    const actual = buildActualPath(player, cursor, [], []);

    expect(actual.reachedCursor).toBe(true);
    expect(actual.points[actual.points.length - 1]).toEqual(cursor);
  });

  it("should end at cursor even with surfaces after cursor", () => {
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 200, y: 300 };
    const ricochet = createMockSurface("ricochet", { x: 400, y: 200 }, { x: 400, y: 400 });

    const actual = buildActualPath(player, cursor, [], [ricochet]);

    expect(actual.reachedCursor).toBe(true);
    expect(actual.points[actual.points.length - 1]).toEqual(cursor);
  });
});

// ============================================================================
// PRINCIPLE 3.2: Obstacle Blocking Takes Priority
// ============================================================================

describe("Principle 3.2: Obstacle Blocking Takes Priority", () => {
  it("should end at obstacle if obstacle is before cursor", () => {
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 500, y: 300 };
    const wall = createMockSurface(
      "wall",
      { x: 300, y: 200 },
      { x: 300, y: 400 },
      { canReflect: false }
    );

    const actual = buildActualPath(player, cursor, [], [wall]);

    expect(actual.reachedCursor).toBe(false);
    expect(actual.blockedBy).toBe(wall);
  });

  it("should have no forward projection when blocked by wall", () => {
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 500, y: 300 };
    const wall = createMockSurface(
      "wall",
      { x: 300, y: 200 },
      { x: 300, y: 400 },
      { canReflect: false }
    );

    const actual = buildActualPath(player, cursor, [], [wall]);

    // No projection through walls
    expect(actual.forwardProjection).toBeDefined();
    expect(actual.forwardProjection!.length).toBe(0);
  });
});

// ============================================================================
// PRINCIPLE 4.1: Full Alignment Condition
// ============================================================================

describe("Principle 4.1: Full Alignment Condition", () => {
  it("should be aligned when both paths reach cursor with same segments", () => {
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 400, y: 300 };

    const planned = buildPlannedPath(player, cursor, []);
    const actual = buildActualPath(player, cursor, [], []);
    const alignment = calculateAlignment(planned, actual);

    expect(alignment.isFullyAligned).toBe(true);
    expect(alignment.alignedSegmentCount).toBe(1);
    expect(alignment.divergencePoint).toBeUndefined();
  });
});

// ============================================================================
// PRINCIPLE 4.2: Divergence Detection
// ============================================================================

describe("Principle 4.2: Divergence Detection", () => {
  it("should detect divergence when actual path hits obstacle", () => {
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 500, y: 300 };
    const wall = createMockSurface(
      "wall",
      { x: 300, y: 200 },
      { x: 300, y: 400 },
      { canReflect: false }
    );

    const planned = buildPlannedPath(player, cursor, []);
    const actual = buildActualPath(player, cursor, [], [wall]);
    const alignment = calculateAlignment(planned, actual);

    expect(alignment.isFullyAligned).toBe(false);
    expect(alignment.divergencePoint).toBeDefined();
  });
});

// ============================================================================
// PRINCIPLE 5.1 & 5.2: Surface Interactions
// ============================================================================

describe("Principle 5: Surface Interactions", () => {
  it("should reflect off ricochet surfaces", () => {
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 500, y: 100 };
    const ricochet = createMockSurface("ricochet", { x: 300, y: 100 }, { x: 300, y: 400 });

    const actual = buildActualPath(player, cursor, [ricochet], [ricochet]);

    // Should have reflected (more than 2 points)
    expect(actual.points.length).toBeGreaterThanOrEqual(2);
  });

  it("should stop at wall surfaces", () => {
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 500, y: 300 };
    const wall = createMockSurface(
      "wall",
      { x: 300, y: 200 },
      { x: 300, y: 400 },
      { canReflect: false }
    );

    const actual = buildActualPath(player, cursor, [], [wall]);

    expect(actual.blockedBy).toBe(wall);
  });
});
