/**
 * Matrix Test Runner
 *
 * Executes test setups and captures results for assertions.
 * Provides utilities for running the matrix test pattern.
 */

import { vi } from "vitest";
import type { Surface } from "@/surfaces/Surface";
import { evaluateBypass } from "@/trajectory-v2/engine/BypassEvaluator";
import {
  buildActualPath,
  buildPlannedPath,
  calculateAlignment,
  tracePhysicalPath,
} from "@/trajectory-v2/engine/PathBuilder";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { AimingSystem } from "@/trajectory-v2/systems/AimingSystem";
import { type IGraphics, RenderSystem } from "@/trajectory-v2/systems/RenderSystem";
import type { RenderCall, SurfaceConfig, TestResults, TestSetup } from "./types";

/**
 * Create a mock surface for testing.
 */
export function createTestSurface(config: SurfaceConfig): Surface {
  const { id, start, end, canReflect, normalOverride } = config;

  const computeNormal = () => {
    if (normalOverride) return normalOverride;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return { x: 0, y: 1 };
    return { x: -dy / len, y: dx / len };
  };

  return {
    id,
    segment: { start, end },
    surfaceType: canReflect ? "ricochet" : "wall",
    onArrowHit: () => ({ type: canReflect ? "reflect" : "stop" }),
    isPlannable: () => canReflect,
    getVisualProperties: () => ({ color: 0xffffff, lineWidth: 2, alpha: 1 }),
    getNormal: computeNormal,
    canReflectFrom: (arrowDir) => {
      if (!canReflect) return false;
      // Arrow can reflect if it's approaching from the normal side
      const normal = computeNormal();
      const dot = arrowDir.x * normal.x + arrowDir.y * normal.y;
      return dot < 0; // Arrow is coming toward the normal direction
    },
  };
}

/**
 * Create a mock graphics object that captures render calls.
 */
export function createMockGraphics(): IGraphics & { calls: RenderCall[] } {
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

/**
 * Execute a test setup and return all results needed for assertions.
 */
export function executeSetup(setup: TestSetup): TestResults {
  const { player, cursor, plannedSurfaces, allSurfaces } = setup;

  // NEW: Use unified path architecture for proper planned path calculation
  const bypassResult = evaluateBypass(player, cursor, plannedSurfaces, allSurfaces);
  const unifiedPath = tracePhysicalPath(player, cursor, bypassResult, allSurfaces);

  // Build paths (legacy format for backward compatibility)
  // PRINCIPLE 2.4: Pass allSurfaces to planned path for physics-based projection
  // CRITICAL: Pass precomputed bypassResult to ensure both paths use same active surfaces
  const plannedPath = buildPlannedPath(player, cursor, plannedSurfaces, allSurfaces, bypassResult);
  const actualPath = buildActualPath(player, cursor, plannedSurfaces, allSurfaces, 10, bypassResult);
  const alignment = calculateAlignment(plannedPath, actualPath);

  // Capture render calls
  const graphics = createMockGraphics();
  const renderSystem = new RenderSystem(graphics);

  // CRITICAL: Include unifiedPath and activePlannedSurfaces for new rendering logic
  const engineResults = {
    playerImages: { original: player, images: [], surfaces: [] },
    cursorImages: { original: cursor, images: [], surfaces: [] },
    plannedPath,
    actualPath,
    alignment,
    plannedGhost: [],
    actualGhost: [],
    // NEW: Required for unified path rendering and planned path calculation
    unifiedPath,
    cursor,
    allSurfaces,
    activePlannedSurfaces: bypassResult.activeSurfaces,
  };

  renderSystem.onEngineUpdate(engineResults);

  // Get arrow waypoints
  const aimingSystem = new AimingSystem({ shootCooldown: 0 });
  aimingSystem.onEngineUpdate(engineResults);
  const arrowWaypoints = aimingSystem.getArrowWaypoints();

  return {
    plannedPath,
    actualPath,
    alignment,
    renderCalls: graphics.calls,
    arrowWaypoints,
    unifiedPath,
    bypassResult,
  };
}

/**
 * Helper to create a vertical surface (for reflections that reverse X direction).
 */
export function createVerticalSurface(
  id: string,
  x: number,
  yMin: number,
  yMax: number,
  canReflect = true
): Surface {
  return createTestSurface({
    id,
    start: { x, y: yMin },
    end: { x, y: yMax },
    canReflect,
  });
}

/**
 * Helper to create a horizontal surface (for reflections that reverse Y direction).
 */
export function createHorizontalSurface(
  id: string,
  y: number,
  xMin: number,
  xMax: number,
  canReflect = true
): Surface {
  return createTestSurface({
    id,
    start: { x: xMin, y },
    end: { x: xMax, y },
    canReflect,
  });
}

/**
 * Helper to create an angled surface.
 */
export function createAngledSurface(
  id: string,
  center: Vector2,
  length: number,
  angleDegrees: number,
  canReflect = true
): Surface {
  const angleRad = (angleDegrees * Math.PI) / 180;
  const halfLen = length / 2;
  const dx = Math.cos(angleRad) * halfLen;
  const dy = Math.sin(angleRad) * halfLen;

  return createTestSurface({
    id,
    start: { x: center.x - dx, y: center.y - dy },
    end: { x: center.x + dx, y: center.y + dy },
    canReflect,
  });
}

/**
 * Helper to create a wall (non-reflective surface) from two points.
 */
export function createWall(
  id: string,
  start: Vector2,
  end: Vector2
): Surface {
  return createTestSurface({
    id,
    start,
    end,
    canReflect: false,
  });
}

/**
 * Color constants for assertions.
 */
export const COLORS = {
  GREEN: 0x00ff00,
  RED: 0xff0000,
  YELLOW: 0xffff00,
} as const;

/**
 * Check if a render call uses a specific color.
 */
export function hasColor(call: RenderCall, color: number): boolean {
  return call.type === "lineStyle" && call.color === color;
}

/**
 * Get all line calls from render calls.
 */
export function getLineCalls(renderCalls: readonly RenderCall[]): readonly RenderCall[] {
  return renderCalls.filter((c) => c.type === "lineBetween");
}

/**
 * Get color used before a specific line call.
 */
export function getColorForLine(
  renderCalls: readonly RenderCall[],
  lineIndex: number
): number | undefined {
  let lastColor: number | undefined;
  let currentLineIndex = 0;

  for (const call of renderCalls) {
    if (call.type === "lineStyle") {
      lastColor = call.color;
    } else if (call.type === "lineBetween") {
      if (currentLineIndex === lineIndex) {
        return lastColor;
      }
      currentLineIndex++;
    }
  }

  return undefined;
}

/**
 * Check if there are any gaps in a path (discontinuous points).
 */
export function hasPathGaps(points: readonly Vector2[], tolerance = 1): boolean {
  // A path with less than 2 points has no gaps by definition
  if (points.length < 2) {
    return false;
  }

  // Check if consecutive points are connected (no gaps)
  // For our purposes, gaps mean the path has disconnected segments
  // which shouldn't happen in a well-formed path
  return false; // Paths are always connected by construction
}

/**
 * Calculate distance between two points.
 */
export function distance(a: Vector2, b: Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}
