/**
 * Invariant Test Runner
 *
 * Computes the context needed for invariant assertions.
 * This includes visibility polygons, plan validity, and cursor reachability.
 */

import type { Surface } from "@/surfaces/Surface";
import type { SurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import {
  createFullCone,
  createConeThroughWindow,
  projectConeV2,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { preparePolygonForRendering } from "@/trajectory-v2/visibility/RenderingDedup";
import type {
  Scene,
  InvariantContext,
  VisibilityStage,
  PlanValidityResult,
  ScreenBounds,
} from "./types";
import { SCREEN } from "./positions";

/** Default screen bounds */
export const DEFAULT_SCREEN_BOUNDS: ScreenBounds = {
  minX: 0,
  minY: 0,
  maxX: SCREEN.width,
  maxY: SCREEN.height,
};

/**
 * Check if a point is inside a polygon using ray casting.
 */
function isPointInPolygon(point: Vector2, polygon: Vector2[]): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = polygon[i]!;
    const vj = polygon[j]!;

    if (
      vi.y > point.y !== vj.y > point.y &&
      point.x < ((vj.x - vi.x) * (point.y - vi.y)) / (vj.y - vi.y) + vi.x
    ) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Compute visibility polygon for a single stage.
 */
function computeVisibilityStage(
  origin: Vector2,
  allChains: readonly SurfaceChain[],
  screenBounds: ScreenBounds,
  excludeSurfaceId: string | null,
  stageIndex: number,
  surfaceId: string | null,
  windowStart?: Vector2,
  windowEnd?: Vector2
): VisibilityStage {
  let sourcePoints;

  if (windowStart && windowEnd) {
    // Windowed cone through a surface
    const cone = createConeThroughWindow(origin, windowStart, windowEnd);
    sourcePoints = projectConeV2(cone, allChains, screenBounds, excludeSurfaceId ?? undefined);
  } else {
    // Full 360° cone
    const cone = createFullCone(origin);
    sourcePoints = projectConeV2(cone, allChains, screenBounds, excludeSurfaceId ?? undefined);
  }

  const rawPolygon = toVector2Array(sourcePoints);
  const polygon = preparePolygonForRendering(rawPolygon);

  // Debug logging for investigation
  if (process.env.DEBUG_POLYGON === '1') {
    console.log(`\nStage ${stageIndex}: origin=(${origin.x.toFixed(2)}, ${origin.y.toFixed(2)})`);
    if (windowStart && windowEnd) {
      console.log(`  Window: (${windowStart.x}, ${windowStart.y}) to (${windowEnd.x}, ${windowEnd.y})`);
    }
    console.log(`  Raw polygon: ${rawPolygon.length} vertices`);
    rawPolygon.forEach((v, i) => console.log(`    ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`));
    console.log(`  Final polygon: ${polygon.length} vertices`);
    polygon.forEach((v, i) => console.log(`    ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`));
  }

  return {
    origin,
    polygon,
    surfaceId,
    stageIndex,
  };
}

/**
 * Compute all visibility stages for a scene.
 * Stage 0: Direct visibility from player
 * Stage 1+: Visibility through each planned surface (reflected origin)
 */
function computeVisibilityStages(
  player: Vector2,
  scene: Scene,
  screenBounds: ScreenBounds
): VisibilityStage[] {
  const stages: VisibilityStage[] = [];

  // Stage 0: Direct visibility from player
  stages.push(
    computeVisibilityStage(
      player,
      scene.allChains,
      screenBounds,
      null,
      0,
      null
    )
  );

  // Stages 1+: Visibility through each planned surface
  let currentOrigin = player;
  for (let i = 0; i < scene.plannedSurfaces.length; i++) {
    const surface = scene.plannedSurfaces[i]!;

    // Reflect origin through the surface
    const reflectedOrigin = reflectPointThroughLine(
      currentOrigin,
      surface.segment.start,
      surface.segment.end
    );

    // Compute visibility from reflected origin through the surface window
    stages.push(
      computeVisibilityStage(
        reflectedOrigin,
        scene.allChains,
        screenBounds,
        surface.id,
        i + 1,
        surface.id,
        surface.segment.start,
        surface.segment.end
      )
    );

    currentOrigin = reflectedOrigin;
  }

  return stages;
}

/**
 * Evaluate plan validity (simplified version).
 * In a full implementation, this would use the trajectory engine.
 * For now, we check basic conditions.
 */
function evaluatePlanValidity(
  _player: Vector2,
  _cursor: Vector2,
  scene: Scene
): PlanValidityResult {
  // Simplified: Plan is valid if there are no bypassed surfaces
  // A full implementation would trace the actual and planned paths
  return {
    isValid: true, // Simplified - assume valid for now
    hasDivergence: false,
    hasBypass: false,
    bypassedSurfaceIds: [],
  };
}

/**
 * Check if light reaches the cursor.
 * Light reaches cursor if cursor is inside the final visibility polygon.
 */
function checkLightReachesCursor(
  cursor: Vector2,
  stages: VisibilityStage[]
): boolean {
  if (stages.length === 0) return false;

  // Check the last stage (final visibility region)
  const lastStage = stages[stages.length - 1]!;
  return isPointInPolygon(cursor, lastStage.polygon);
}

/**
 * Compute the full context for invariant testing.
 */
export function computeContext(
  scene: Scene,
  player: Vector2,
  cursor: Vector2,
  screenBounds: ScreenBounds = DEFAULT_SCREEN_BOUNDS
): InvariantContext {
  const visibilityStages = computeVisibilityStages(player, scene, screenBounds);
  const planValidity = evaluatePlanValidity(player, cursor, scene);
  const lightReachesCursor = checkLightReachesCursor(cursor, visibilityStages);

  return {
    scene,
    player,
    cursor,
    visibilityStages,
    planValidity,
    lightReachesCursor,
    screenBounds,
  };
}

/**
 * Create a surface helper for tests.
 */
export function createTestSurface(
  id: string,
  start: Vector2,
  end: Vector2,
  canReflect: boolean = true
): Surface {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const normalX = len > 0 ? -dy / len : 0;
  const normalY = len > 0 ? dx / len : 0;

  return {
    id,
    segment: { start, end },
    normal: { x: normalX, y: normalY },
    canReflect,
    canReflectFrom: () => canReflect,
    isOnReflectiveSide: (point: Vector2) => {
      if (!canReflect) return false;
      const cross = (end.x - start.x) * (point.y - start.y) -
                    (end.y - start.y) * (point.x - start.x);
      return cross >= 0;
    },
    distanceToPoint: () => 0,
  };
}
