/**
 * Invariant Test Runner
 *
 * Computes the context needed for invariant assertions.
 * This includes visibility polygons, plan validity, and cursor reachability.
 */

import type { Surface } from "@/surfaces/Surface";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import { type SourcePoint, isEndpoint, isHitPoint } from "@/trajectory-v2/geometry/SourcePoint";
import { type SurfaceChain, isJunctionPoint } from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  createConeThroughWindow,
  createFullCone,
  projectConeV2,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { preparePolygonForRendering } from "@/trajectory-v2/visibility/RenderingDedup";
import { SCREEN } from "./positions";
import type {
  InvariantContext,
  PlannedSequence,
  PlanValidityResult,
  Scene,
  ScreenBounds,
  VisibilityStage,
} from "./types";

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

/** Segment type for window extraction */
interface Segment {
  start: Vector2;
  end: Vector2;
}

/**
 * Build a mapping from surface start/end points to connected surface IDs.
 * This allows HitPoints at s=0 or s=1 to be recognized as junctions.
 *
 * For each chain:
 * - Junction vertices connect two surfaces
 * - A HitPoint at s=0 (surface start) might be a junction to the PREVIOUS surface
 * - A HitPoint at s=1 (surface end) might be a junction to the NEXT surface
 *
 * Uses exact coordinate keys for provenance (no epsilons).
 */
function buildJunctionMapping(
  chains: readonly SurfaceChain[]
): Map<string, Set<string>> {
  // Maps "x,y" coordinate key -> set of surface IDs that share this point
  const pointToSurfaces = new Map<string, Set<string>>();

  for (const chain of chains) {
    const surfaces = chain.getSurfaces();

    for (const surface of surfaces) {
      // Add surface start point
      const startKey = `${surface.segment.start.x},${surface.segment.start.y}`;
      if (!pointToSurfaces.has(startKey)) {
        pointToSurfaces.set(startKey, new Set());
      }
      pointToSurfaces.get(startKey)!.add(surface.id);

      // Add surface end point
      const endKey = `${surface.segment.end.x},${surface.segment.end.y}`;
      if (!pointToSurfaces.has(endKey)) {
        pointToSurfaces.set(endKey, new Set());
      }
      pointToSurfaces.get(endKey)!.add(surface.id);
    }
  }

  return pointToSurfaces;
}

/**
 * Extract visible segments on a surface from source points.
 * This is the same logic as ValidRegionRenderer.extractVisibleSurfaceSegments.
 *
 * Uses provenance to find which portions of a surface are visible,
 * converting source points to window segments for reflection.
 *
 * Provenance-based checks:
 * - Endpoint: surface.id matches target
 * - HitPoint: hitSurface.id matches target, OR
 *             s=0/1 and the point is a junction that connects to target
 * - JunctionPoint: getSurfaceBefore().id OR getSurfaceAfter().id matches target
 *   (JunctionPoints connect TWO surfaces, so they belong to both)
 */
function extractVisibleSurfaceSegments(
  targetSurfaceId: string,
  sourcePoints: readonly SourcePoint[],
  chains: readonly SurfaceChain[]
): Segment[] {
  const segments: Segment[] = [];
  let currentRunStart: Vector2 | null = null;
  let currentRunEnd: Vector2 | null = null;

  // Build junction mapping for HitPoint junction detection
  const pointToSurfaces = buildJunctionMapping(chains);

  for (const sp of sourcePoints) {
    // Check if this point is on the target surface using provenance
    let isOnTarget = false;
    let coords: Vector2 | null = null;

    if (isEndpoint(sp) && sp.surface.id === targetSurfaceId) {
      // Endpoint is on its surface
      isOnTarget = true;
      coords = sp.computeXY();
    } else if (isHitPoint(sp)) {
      // HitPoint: directly on target surface
      if (sp.hitSurface.id === targetSurfaceId) {
        isOnTarget = true;
        coords = sp.computeXY();
      } else if (sp.s === 0 || sp.s === 1) {
        // HitPoint at s=0 (surface start) or s=1 (surface end)
        // This might be a junction that connects to the target surface
        // Use the junction mapping to check
        const hitCoords = sp.computeXY();
        const coordKey = `${hitCoords.x},${hitCoords.y}`;
        const connectedSurfaces = pointToSurfaces.get(coordKey);
        if (connectedSurfaces && connectedSurfaces.has(targetSurfaceId)) {
          isOnTarget = true;
          coords = hitCoords;
        }
      }
    } else if (isJunctionPoint(sp)) {
      // JunctionPoint connects TWO surfaces - check both using provenance
      const beforeSurface = sp.getSurfaceBefore();
      const afterSurface = sp.getSurfaceAfter();
      if (beforeSurface.id === targetSurfaceId || afterSurface.id === targetSurfaceId) {
        isOnTarget = true;
        coords = sp.computeXY();
      }
    }

    if (isOnTarget && coords) {
      // Extend current run
      if (currentRunStart === null) {
        currentRunStart = coords;
      }
      currentRunEnd = coords;
    } else {
      // Gap detected - emit current run as segment if valid
      if (
        currentRunStart &&
        currentRunEnd &&
        (currentRunStart.x !== currentRunEnd.x || currentRunStart.y !== currentRunEnd.y)
      ) {
        segments.push({ start: currentRunStart, end: currentRunEnd });
      }
      currentRunStart = null;
      currentRunEnd = null;
    }
  }

  // Emit final run
  if (
    currentRunStart &&
    currentRunEnd &&
    (currentRunStart.x !== currentRunEnd.x || currentRunStart.y !== currentRunEnd.y)
  ) {
    segments.push({ start: currentRunStart, end: currentRunEnd });
  }

  return segments;
}

/**
 * Compute visibility polygon for a single stage.
 * Returns both the stage info and the raw source points for segment extraction.
 */
function computeVisibilityStageWithSources(
  origin: Vector2,
  allChains: readonly SurfaceChain[],
  screenBounds: ScreenBounds,
  excludeSurfaceId: string | null,
  stageIndex: number,
  surfaceId: string | null,
  windowStart?: Vector2,
  windowEnd?: Vector2
): { stage: VisibilityStage; sourcePoints: SourcePoint[] } {
  let sourcePoints: SourcePoint[];

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
  // Use raw polygon for invariant testing - preparePolygonForRendering removes
  // collinear points which breaks edge invariant checks
  const polygon = rawPolygon;

  // Debug logging for investigation
  if (process.env.DEBUG_POLYGON === "1") {
    console.log(`\nStage ${stageIndex}: origin=(${origin.x.toFixed(2)}, ${origin.y.toFixed(2)})`);
    if (windowStart && windowEnd) {
      console.log(
        `  Window: (${windowStart.x}, ${windowStart.y}) to (${windowEnd.x}, ${windowEnd.y})`
      );
    }
    console.log(`  Raw polygon: ${rawPolygon.length} vertices`);
    rawPolygon.forEach((v, i) => console.log(`    ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`));
    console.log(`  Final polygon: ${polygon.length} vertices`);
    polygon.forEach((v, i) => console.log(`    ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`));
  }

  return {
    stage: {
      origin,
      polygon,
      surfaceId,
      stageIndex,
      // For reflection stages, include window info for invariant checks
      isWindowed: !!(windowStart && windowEnd),
      excludeSurfaceId,
      startLine: windowStart && windowEnd ? { start: windowStart, end: windowEnd } : undefined,
      // Include source points for provenance-based invariant checks
      sourcePoints,
    },
    sourcePoints,
  };
}

/**
 * Compute all visibility stages for a scene.
 * Stage 0: Direct visibility from player
 * Stage 1+: Visibility through visible segments of each planned surface (reflected origin)
 *
 * Uses the same logic as ValidRegionRenderer:
 * 1. Compute visibility from player
 * 2. Extract visible segments on each planned surface from previous stage
 * 3. For each visible segment, compute reflected visibility
 *
 * @param player The player position
 * @param scene The scene configuration
 * @param screenBounds The screen bounds
 * @param plannedSurfaces Optional list of planned surfaces (overrides scene.plannedSurfaces)
 */
function computeVisibilityStages(
  player: Vector2,
  scene: Scene,
  screenBounds: ScreenBounds,
  plannedSurfaces?: Surface[]
): VisibilityStage[] {
  const stages: VisibilityStage[] = [];

  // Use provided planned surfaces or scene's default
  const surfaces = plannedSurfaces ?? scene.plannedSurfaces;

  // Stage 0: Direct visibility from player
  const stage0Result = computeVisibilityStageWithSources(
    player,
    scene.allChains,
    screenBounds,
    null,
    0,
    null
  );
  stages.push(stage0Result.stage);

  // Track current source points for extracting visible segments
  let currentSourcePoints = stage0Result.sourcePoints;
  let currentOrigin = player;

  // Stages 1+: Visibility through each planned surface
  for (let i = 0; i < surfaces.length; i++) {
    const surface = surfaces[i]!;

    // Extract visible segments on this surface from the PREVIOUS stage's source points
    const visibleSegments = extractVisibleSurfaceSegments(surface.id, currentSourcePoints, scene.allChains);

    if (visibleSegments.length === 0) {
      // No light reaches this surface - stop cascading
      break;
    }

    // Reflect origin through the surface
    const reflectedOrigin = reflectPointThroughLine(
      currentOrigin,
      surface.segment.start,
      surface.segment.end
    );

    // Compute visibility through each visible segment (window)
    // For simplicity, we combine all segments into one stage
    // (ValidRegionRenderer does this per-segment, but for invariant testing we aggregate)
    const stageSourcePoints: SourcePoint[] = [];
    const stagePolygons: Vector2[][] = [];

    for (const window of visibleSegments) {
      const result = computeVisibilityStageWithSources(
        reflectedOrigin,
        scene.allChains,
        screenBounds,
        surface.id,
        i + 1,
        surface.id,
        window.start,
        window.end
      );
      stageSourcePoints.push(...result.sourcePoints);
      if (result.stage.polygon.length >= 3) {
        stagePolygons.push([...result.stage.polygon]);
      }
    }

    // Create aggregated stage
    const aggregatedPolygon = stagePolygons.length > 0 ? (stagePolygons[0] ?? []) : [];
    stages.push({
      origin: reflectedOrigin,
      polygon: aggregatedPolygon,
      surfaceId: surface.id,
      stageIndex: i + 1,
      isWindowed: true,
      excludeSurfaceId: surface.id,
      startLine:
        visibleSegments.length > 0
          ? { start: visibleSegments[0]!.start, end: visibleSegments[0]!.end }
          : undefined,
      // Include source points for provenance-based invariant checks
      sourcePoints: stageSourcePoints,
    });

    currentSourcePoints = stageSourcePoints;
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
function checkLightReachesCursor(cursor: Vector2, stages: VisibilityStage[]): boolean {
  if (stages.length === 0) return false;

  // Check the last stage (final visibility region)
  const lastStage = stages[stages.length - 1]!;
  return isPointInPolygon(cursor, lastStage.polygon);
}

/**
 * Compute the full context for invariant testing.
 *
 * @param scene The scene configuration
 * @param player The player position
 * @param cursor The cursor position
 * @param screenBounds The screen bounds
 * @param plannedSequence Optional planned sequence (overrides scene.plannedSurfaces)
 */
export function computeContext(
  scene: Scene,
  player: Vector2,
  cursor: Vector2,
  screenBounds: ScreenBounds = DEFAULT_SCREEN_BOUNDS,
  plannedSequence?: PlannedSequence
): InvariantContext {
  const plannedSurfaces = plannedSequence?.surfaces ?? scene.plannedSurfaces;
  const visibilityStages = computeVisibilityStages(player, scene, screenBounds, plannedSurfaces);
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
  canReflect = true
): Surface {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const normalX = len > 0 ? -dy / len : 0;
  const normalY = len > 0 ? dx / len : 0;

  return {
    id,
    segment: { start, end },
    surfaceType: canReflect ? "ricochet" : "wall",
    onArrowHit: () => ({
      type: canReflect ? ("reflect" as const) : ("stop" as const),
    }),
    isPlannable: () => canReflect,
    getVisualProperties: () => ({
      color: canReflect ? 0x00ff00 : 0xff0000,
      lineWidth: 2,
      alpha: 1,
    }),
    getNormal: () => ({ x: normalX, y: normalY }),
    canReflectFrom: () => canReflect,
  };
}
