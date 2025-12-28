/**
 * SectorPropagation - Multi-Surface Visibility Propagation
 *
 * This module implements proper light propagation through multiple planned surfaces,
 * ensuring that each subsequent polygon is affected by obstructions from all previous surfaces.
 *
 * Core First Principle:
 * **Light that is reflected through a surface must have first reached that surface.**
 *
 * Key Features:
 * - Multiple sectors per surface (when obstacles split the light)
 * - Sector merging for efficiency
 * - Progressive opacity for rendering (earlier = more transparent)
 * - Position-based, epsilon-free calculations using cross-product
 *
 * Design Principles:
 * 1. NO ANGLES - All sectors defined by boundary positions
 * 2. NO EPSILONS - All comparisons are exact (cross-product sign)
 * 3. REVERSIBLE - reflect(reflect(sector, line), line) === sector exactly
 * 4. SOURCE OF TRUTH - Boundaries are provenance-tracked positions
 */

import type { Surface } from "@/surfaces/Surface";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { ScreenBounds } from "./ConePropagator";

// =============================================================================
// Core Types
// =============================================================================

/**
 * A light sector represents an angular region of light spreading from an origin.
 *
 * Convention: Moving counter-clockwise from rightBoundary to leftBoundary
 * traces the sector's interior.
 *
 * When startLine is set, rays from this sector effectively start on that line
 * (the reflecting surface), not at the origin.
 */
export interface LightSector {
  /** Source of the rays (player position or reflected player image) */
  readonly origin: Vector2;

  /** Point defining the left boundary ray (CCW direction) */
  readonly leftBoundary: Vector2;

  /** Point defining the right boundary ray (CW direction) */
  readonly rightBoundary: Vector2;

  /** Line that all rays in this sector start from (for reflected sectors) */
  readonly startLine?: { start: Vector2; end: Vector2 };
}

/**
 * A collection of non-overlapping light sectors.
 * Multiple sectors occur when obstacles split the angular range.
 */
export type LightSectors = readonly LightSector[];

/**
 * A single propagation stage - visibility from one origin point.
 *
 * For the initial stage (surfaceIndex = -1), this represents the player's
 * 360° visibility. For subsequent stages, this represents visibility
 * through a planned surface's reflection.
 */
export interface PropagationStage {
  /** Origin for this stage (player or reflected player image) */
  readonly origin: Vector2;

  /** Light sectors at this stage (may be split by shadows) */
  readonly sectors: LightSectors;

  /** Visibility polygon(s) for rendering - one per sector */
  readonly polygons: readonly (readonly Vector2[])[];

  /** Surface index: -1 for initial (player), 0+ for planned surfaces */
  readonly surfaceIndex: number;

  /** Opacity for rendering (0.0 to 1.0) */
  readonly opacity: number;
}

/**
 * Complete result of propagating visibility through multiple surfaces.
 */
export interface PropagationResult {
  /** All propagation stages, in order */
  readonly stages: readonly PropagationStage[];

  /** Whether propagation produced valid visibility */
  readonly isValid: boolean;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a "full" light sector covering all 360° directions.
 *
 * Uses a sentinel value where left === right to indicate "full".
 */
export function createFullLightSector(origin: Vector2): LightSector {
  // Sentinel: when boundaries are identical, sector is full
  const boundary = { x: origin.x + 1, y: origin.y };
  return {
    origin,
    leftBoundary: boundary,
    rightBoundary: boundary,
  };
}

/**
 * Check if a sector is a "full" sector (no angular constraint).
 */
export function isFullLightSector(sector: LightSector): boolean {
  return (
    sector.leftBoundary.x === sector.rightBoundary.x &&
    sector.leftBoundary.y === sector.rightBoundary.y
  );
}

/**
 * Create a light sector from origin looking at a surface segment.
 *
 * The sector covers the angular range that "sees" the segment from the origin.
 * Uses cross-product to determine which endpoint is left vs right.
 */
export function createLightSectorFromSurface(
  origin: Vector2,
  surface: Surface
): LightSector {
  const start = surface.segment.start;
  const end = surface.segment.end;

  // Cross product: (origin→start) × (origin→end)
  // Positive means end is to the LEFT of start (as seen from origin)
  const cross = crossProduct(origin, start, end);

  if (cross >= 0) {
    return {
      origin,
      leftBoundary: end,
      rightBoundary: start,
    };
  } else {
    return {
      origin,
      leftBoundary: start,
      rightBoundary: end,
    };
  }
}

/**
 * Create a light sector through a window (two endpoints).
 *
 * The sector covers the angular range visible through the window.
 */
export function createLightSectorThroughWindow(
  origin: Vector2,
  windowStart: Vector2,
  windowEnd: Vector2
): LightSector {
  // Cross product to determine left vs right
  const cross = crossProduct(origin, windowStart, windowEnd);

  if (cross >= 0) {
    return {
      origin,
      leftBoundary: windowEnd,
      rightBoundary: windowStart,
      startLine: { start: windowStart, end: windowEnd },
    };
  } else {
    return {
      origin,
      leftBoundary: windowStart,
      rightBoundary: windowEnd,
      startLine: { start: windowStart, end: windowEnd },
    };
  }
}

/**
 * Create an empty sectors collection.
 */
export function emptyLightSectors(): LightSectors {
  return [];
}

/**
 * Create initial sectors from player (full 360° visibility).
 */
export function createInitialSectors(player: Vector2): LightSectors {
  return [createFullLightSector(player)];
}

// =============================================================================
// Geometric Predicates (Exact, No Epsilons)
// =============================================================================

/**
 * Calculate the 2D cross product of vectors (origin→a) and (origin→b).
 *
 * Returns:
 * - Positive if b is to the LEFT of the ray origin→a
 * - Negative if b is to the RIGHT of the ray origin→a
 * - Zero if a, origin, b are collinear
 *
 * This is EXACT - no epsilon comparison.
 */
export function crossProduct(origin: Vector2, a: Vector2, b: Vector2): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

/**
 * Check if a point is inside a light sector.
 *
 * Uses cross-product sign comparison (exact, no epsilon).
 *
 * A point is inside if it's:
 * - On or left of the right boundary ray (CCW from right)
 * - On or right of the left boundary ray (CW from left)
 */
export function isPointInLightSector(point: Vector2, sector: LightSector): boolean {
  if (isFullLightSector(sector)) {
    return true;
  }

  const origin = sector.origin;
  const left = sector.leftBoundary;
  const right = sector.rightBoundary;

  // Cross product of (origin→right) × (origin→point)
  // Positive means point is LEFT of right boundary (inside)
  const rightCross = crossProduct(origin, right, point);

  // Cross product of (origin→left) × (origin→point)
  // Negative means point is RIGHT of left boundary (inside)
  const leftCross = crossProduct(origin, left, point);

  // Check if sector spans more than 180°
  const sectorCross = crossProduct(origin, right, left);

  if (sectorCross >= 0) {
    // Sector < 180°: point must be inside BOTH half-planes
    return rightCross >= 0 && leftCross <= 0;
  } else {
    // Sector > 180°: point is inside if NOT in the excluded region
    return rightCross >= 0 || leftCross <= 0;
  }
}

/**
 * Check if a point is exactly on a sector boundary ray.
 */
export function isPointOnLightSectorBoundary(
  point: Vector2,
  sector: LightSector
): boolean {
  if (isFullLightSector(sector)) {
    return false;
  }

  const origin = sector.origin;
  const leftCross = crossProduct(origin, sector.leftBoundary, point);
  const rightCross = crossProduct(origin, sector.rightBoundary, point);

  // On boundary if collinear AND in forward direction
  if (leftCross === 0) {
    const dot = dotProduct(origin, sector.leftBoundary, point);
    return dot > 0;
  }
  if (rightCross === 0) {
    const dot = dotProduct(origin, sector.rightBoundary, point);
    return dot > 0;
  }

  return false;
}

/**
 * Calculate dot product of vectors (origin→a) and (origin→b).
 */
function dotProduct(origin: Vector2, a: Vector2, b: Vector2): number {
  return (a.x - origin.x) * (b.x - origin.x) + (a.y - origin.y) * (b.y - origin.y);
}

// =============================================================================
// Sector Operations (All Exact, No Angles)
// =============================================================================

/**
 * Reflect a light sector through a surface line.
 *
 * Reflects origin and both boundaries, and SWAPS left/right because
 * reflection reverses orientation.
 *
 * This is EXACT and REVERSIBLE: reflect(reflect(s, line), line) === s
 */
export function reflectLightSector(
  sector: LightSector,
  surface: Surface
): LightSector {
  const lineStart = surface.segment.start;
  const lineEnd = surface.segment.end;

  return {
    origin: reflectPointThroughLine(sector.origin, lineStart, lineEnd),
    // Swap boundaries after reflection (orientation reverses)
    leftBoundary: reflectPointThroughLine(sector.rightBoundary, lineStart, lineEnd),
    rightBoundary: reflectPointThroughLine(sector.leftBoundary, lineStart, lineEnd),
    // Set the surface as the start line - rays start on this surface
    startLine: { start: lineStart, end: lineEnd },
  };
}

/**
 * Reflect multiple sectors through a surface.
 */
export function reflectLightSectors(
  sectors: LightSectors,
  surface: Surface
): LightSectors {
  return sectors.map((s) => reflectLightSector(s, surface));
}

/**
 * Trim a sector to only the angular range that passes through a surface.
 *
 * Returns null if the sector doesn't overlap with the surface's angular extent.
 */
export function trimLightSectorBySurface(
  sector: LightSector,
  surface: Surface
): LightSector | null {
  const surfaceSector = createLightSectorFromSurface(sector.origin, surface);

  if (isFullLightSector(sector)) {
    return {
      ...surfaceSector,
      startLine: sector.startLine,
    };
  }

  return intersectLightSectors(sector, surfaceSector);
}

/**
 * Trim multiple sectors by a surface.
 */
export function trimLightSectorsBySurface(
  sectors: LightSectors,
  surface: Surface
): LightSectors {
  const result: LightSector[] = [];
  for (const sector of sectors) {
    const trimmed = trimLightSectorBySurface(sector, surface);
    if (trimmed !== null) {
      result.push(trimmed);
    }
  }
  return result;
}

/**
 * Intersect two sectors, returning the overlapping angular region.
 *
 * Uses cross-product comparisons to find the more restrictive boundaries.
 * Returns null if the sectors don't overlap.
 */
export function intersectLightSectors(
  a: LightSector,
  b: LightSector
): LightSector | null {
  const origin = a.origin;

  if (isFullLightSector(a)) return { ...b, startLine: a.startLine || b.startLine };
  if (isFullLightSector(b)) return { ...a, startLine: a.startLine || b.startLine };

  // Check if boundaries of A are inside B
  const aRightInB =
    isPointInLightSector(a.rightBoundary, b) ||
    isPointOnLightSectorBoundary(a.rightBoundary, b);
  const aLeftInB =
    isPointInLightSector(a.leftBoundary, b) ||
    isPointOnLightSectorBoundary(a.leftBoundary, b);

  // Check if boundaries of B are inside A
  const bRightInA =
    isPointInLightSector(b.rightBoundary, a) ||
    isPointOnLightSectorBoundary(b.rightBoundary, a);
  const bLeftInA =
    isPointInLightSector(b.leftBoundary, a) ||
    isPointOnLightSectorBoundary(b.leftBoundary, a);

  // No overlap if no boundary is inside the other sector
  if (!aRightInB && !aLeftInB && !bRightInA && !bLeftInA) {
    return null;
  }

  // Find the more restrictive left boundary
  const leftBInA =
    isPointInLightSector(b.leftBoundary, a) ||
    isPointOnLightSectorBoundary(b.leftBoundary, a);
  const newLeft = leftBInA ? b.leftBoundary : a.leftBoundary;

  // Find the more restrictive right boundary
  const rightBInA =
    isPointInLightSector(b.rightBoundary, a) ||
    isPointOnLightSectorBoundary(b.rightBoundary, a);
  const newRight = rightBInA ? b.rightBoundary : a.rightBoundary;

  // Validate: resulting sector should be non-empty
  const resultCross = crossProduct(origin, newRight, newLeft);
  if (resultCross < 0) {
    return null;
  }

  return {
    origin,
    leftBoundary: newLeft,
    rightBoundary: newRight,
    startLine: a.startLine || b.startLine,
  };
}

/**
 * Block a sector by an obstacle surface.
 *
 * Returns:
 * - Original sector if obstacle doesn't overlap
 * - 1-2 sectors if obstacle partially overlaps
 * - Empty array if obstacle fully blocks
 */
export function blockLightSectorByObstacle(
  sector: LightSector,
  obstacle: Surface
): LightSectors {
  if (isFullLightSector(sector)) {
    // Full sector: create complement of obstacle's angular extent
    // For simplicity, return original (should constrain first)
    return [sector];
  }

  const origin = sector.origin;
  const obsStart = obstacle.segment.start;
  const obsEnd = obstacle.segment.end;

  // Check if obstacle endpoints are inside the sector
  const startInside = isPointInLightSector(obsStart, sector);
  const endInside = isPointInLightSector(obsEnd, sector);

  if (!startInside && !endInside) {
    // Check if obstacle fully covers the sector
    const leftIntersects = rayIntersectsSegment(origin, sector.leftBoundary, obsStart, obsEnd);
    const rightIntersects = rayIntersectsSegment(origin, sector.rightBoundary, obsStart, obsEnd);

    if (leftIntersects && rightIntersects) {
      // Fully blocked
      return [];
    }
    // No overlap
    return [sector];
  }

  if (startInside && endInside) {
    // Obstacle fully inside sector - creates two sectors
    const obsCross = crossProduct(origin, obsStart, obsEnd);
    const obsLeft = obsCross >= 0 ? obsEnd : obsStart;
    const obsRight = obsCross >= 0 ? obsStart : obsEnd;

    const leftSector: LightSector = {
      origin,
      leftBoundary: sector.leftBoundary,
      rightBoundary: obsLeft,
      startLine: sector.startLine,
    };

    const rightSector: LightSector = {
      origin,
      leftBoundary: obsRight,
      rightBoundary: sector.rightBoundary,
      startLine: sector.startLine,
    };

    const result: LightSector[] = [];

    // Only include non-empty sectors
    if (crossProduct(origin, rightSector.rightBoundary, rightSector.leftBoundary) >= 0) {
      result.push(rightSector);
    }
    if (crossProduct(origin, leftSector.rightBoundary, leftSector.leftBoundary) >= 0) {
      result.push(leftSector);
    }

    return result;
  }

  // One endpoint inside, one outside - partial block
  const insidePoint = startInside ? obsStart : obsEnd;
  const insideCross = crossProduct(origin, sector.rightBoundary, insidePoint);

  if (insideCross >= 0) {
    // Obstacle blocks from right side
    return [
      {
        origin,
        leftBoundary: sector.leftBoundary,
        rightBoundary: insidePoint,
        startLine: sector.startLine,
      },
    ];
  } else {
    // Obstacle blocks from left side
    return [
      {
        origin,
        leftBoundary: insidePoint,
        rightBoundary: sector.rightBoundary,
        startLine: sector.startLine,
      },
    ];
  }
}

/**
 * Block multiple sectors by an obstacle.
 */
export function blockLightSectorsByObstacle(
  sectors: LightSectors,
  obstacle: Surface
): LightSectors {
  const result: LightSector[] = [];
  for (const sector of sectors) {
    result.push(...blockLightSectorByObstacle(sector, obstacle));
  }
  return result;
}

/**
 * Block sectors by all obstacles, keeping only unblocked portions.
 */
export function blockLightSectorsByObstacles(
  sectors: LightSectors,
  obstacles: readonly Surface[],
  excludeSurfaceId?: string
): LightSectors {
  let current = sectors;
  for (const obstacle of obstacles) {
    if (excludeSurfaceId && obstacle.id === excludeSurfaceId) continue;
    current = blockLightSectorsByObstacle(current, obstacle);
    if (current.length === 0) break;
  }
  return current;
}

/**
 * Check if a ray from origin through target intersects a segment.
 */
function rayIntersectsSegment(
  origin: Vector2,
  target: Vector2,
  segStart: Vector2,
  segEnd: Vector2
): boolean {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const sx = segEnd.x - segStart.x;
  const sy = segEnd.y - segStart.y;

  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-10) return false;

  const t = ((segStart.x - origin.x) * sy - (segStart.y - origin.y) * sx) / denom;
  const s = ((segStart.x - origin.x) * dy - (segStart.y - origin.y) * dx) / denom;

  return t > 0 && s >= 0 && s <= 1;
}

// =============================================================================
// Sector Merging
// =============================================================================

/**
 * Merge adjacent sectors that share a boundary.
 *
 * Two sectors are mergeable if one's leftBoundary equals the other's rightBoundary.
 */
export function mergeLightSectors(sectors: LightSectors): LightSectors {
  if (sectors.length <= 1) return sectors;

  const merged: LightSector[] = [...sectors];
  let changed = true;

  while (changed) {
    changed = false;
    for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const a = merged[i]!;
        const b = merged[j]!;

        // Check if a.left === b.right (a is CCW of b)
        if (
          a.leftBoundary.x === b.rightBoundary.x &&
          a.leftBoundary.y === b.rightBoundary.y
        ) {
          merged[i] = {
            origin: a.origin,
            leftBoundary: b.leftBoundary,
            rightBoundary: a.rightBoundary,
            startLine: a.startLine || b.startLine,
          };
          merged.splice(j, 1);
          changed = true;
          break;
        }

        // Check if b.left === a.right (b is CCW of a)
        if (
          b.leftBoundary.x === a.rightBoundary.x &&
          b.leftBoundary.y === a.rightBoundary.y
        ) {
          merged[i] = {
            origin: a.origin,
            leftBoundary: a.leftBoundary,
            rightBoundary: b.rightBoundary,
            startLine: a.startLine || b.startLine,
          };
          merged.splice(j, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  return merged;
}

// =============================================================================
// Opacity Calculation
// =============================================================================

/**
 * Calculate opacity for a propagation stage.
 *
 * Earlier stages are more transparent when there are many surfaces.
 * The final stage is always fully visible.
 *
 * For 5 surfaces: Stage 0 = 20%, Stage 1 = 40%, Stage 2 = 60%, Stage 3 = 80%, Stage 4 = 100%
 */
export function calculateStageOpacity(
  stageIndex: number,
  totalStages: number
): number {
  if (totalStages <= 1) return 1.0;

  // stageIndex is -1 for initial (player), 0+ for planned surfaces
  // We map to 0-based for calculation
  const normalizedIndex = stageIndex + 1; // 0 for initial, 1+ for surfaces
  const fadeRatio = normalizedIndex / (totalStages - 1);

  // Linear interpolation from 20% to 100%
  return 0.2 + 0.8 * fadeRatio;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a sectors collection is empty.
 */
export function isLightSectorsEmpty(sectors: LightSectors): boolean {
  return sectors.length === 0;
}

/**
 * Get the origin of a sectors collection.
 */
export function getLightSectorsOrigin(sectors: LightSectors): Vector2 | null {
  if (sectors.length === 0) return null;
  return sectors[0]!.origin;
}

/**
 * Debug: Convert a sector to string.
 */
export function lightSectorToString(sector: LightSector): string {
  const { origin, leftBoundary, rightBoundary } = sector;
  if (isFullLightSector(sector)) {
    return `FullSector(origin: ${origin.x.toFixed(1)}, ${origin.y.toFixed(1)})`;
  }
  return (
    `LightSector(origin: ${origin.x.toFixed(1)}, ${origin.y.toFixed(1)}, ` +
    `left: ${leftBoundary.x.toFixed(1)}, ${leftBoundary.y.toFixed(1)}, ` +
    `right: ${rightBoundary.x.toFixed(1)}, ${rightBoundary.y.toFixed(1)})`
  );
}

// =============================================================================
// Main Propagation Algorithm
// =============================================================================

/**
 * Propagate visibility through multiple planned surfaces.
 *
 * This is the core algorithm that implements the first principle:
 * **Light that is reflected through a surface must have first reached that surface.**
 *
 * Algorithm:
 * 1. Start with full 360° visibility from player
 * 2. For each planned surface K:
 *    a. Trim sectors to only those reaching surface K
 *    b. Block sectors by obstacles between player image and surface
 *    c. Build visibility polygon(s) for current sectors
 *    d. Reflect sectors through surface K for next stage
 * 3. Build final visibility polygon(s)
 *
 * Each stage may produce multiple polygons when obstacles split the light.
 *
 * @param player Player position
 * @param plannedSurfaces Ordered list of planned surfaces (reflections)
 * @param allSurfaces All surfaces in the scene (obstacles)
 * @param bounds Screen boundaries
 * @returns PropagationResult with all stages and their polygons
 */
export function propagateThroughSurfaces(
  player: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[],
  bounds: ScreenBounds
): PropagationResult {
  const stages: PropagationStage[] = [];
  const totalStages = plannedSurfaces.length + 1; // +1 for final stage

  // Initial sectors: full 360° from player
  let currentSectors: LightSectors = createInitialSectors(player);
  let currentOrigin = player;

  // Stage 0: Initial visibility from player (no window constraint)
  const initialPolygons = buildPolygonsForSectors(
    currentSectors,
    allSurfaces,
    bounds,
    undefined // No exclude surface for initial
  );

  stages.push({
    origin: currentOrigin,
    sectors: currentSectors,
    polygons: initialPolygons,
    surfaceIndex: -1,
    opacity: calculateStageOpacity(-1, totalStages),
  });

  // Process each planned surface
  for (let i = 0; i < plannedSurfaces.length; i++) {
    const surface = plannedSurfaces[i]!;

    // 1. Trim sectors to only those that can reach this surface
    const trimmedSectors = trimLightSectorsBySurface(currentSectors, surface);
    if (trimmedSectors.length === 0) {
      // No light reaches this surface - stop propagation
      break;
    }

    // 2. Block sectors by obstacles (excluding the target surface itself)
    const unblockedSectors = blockLightSectorsByObstacles(
      trimmedSectors,
      allSurfaces,
      surface.id
    );
    if (unblockedSectors.length === 0) {
      // All light blocked - stop propagation
      break;
    }

    // 3. Merge adjacent sectors for efficiency
    const mergedSectors = mergeLightSectors(unblockedSectors);

    // 4. Reflect sectors through this surface for next stage
    const reflectedSectors = reflectLightSectors(mergedSectors, surface);
    currentOrigin = reflectedSectors.length > 0 
      ? reflectedSectors[0]!.origin 
      : reflectPointThroughLine(currentOrigin, surface.segment.start, surface.segment.end);

    // 5. Build visibility polygon(s) for this stage
    const stagePolygons = buildPolygonsForSectors(
      reflectedSectors,
      allSurfaces,
      bounds,
      surface.id
    );

    stages.push({
      origin: currentOrigin,
      sectors: reflectedSectors,
      polygons: stagePolygons,
      surfaceIndex: i,
      opacity: calculateStageOpacity(i, totalStages),
    });

    // Prepare for next iteration
    currentSectors = reflectedSectors;
  }

  return {
    stages,
    isValid: stages.some((s) => s.polygons.length > 0 && s.polygons.some((p) => p.length >= 3)),
  };
}

/**
 * Build visibility polygons for each sector.
 *
 * Each sector produces its own polygon. This handles cases where
 * obstacles split the light into multiple disjoint regions.
 *
 * Uses the existing ray casting approach but constrained to each sector.
 */
function buildPolygonsForSectors(
  sectors: LightSectors,
  allSurfaces: readonly Surface[],
  bounds: ScreenBounds,
  excludeSurfaceId?: string
): Vector2[][] {
  const polygons: Vector2[][] = [];

  for (const sector of sectors) {
    const polygon = buildPolygonForSector(sector, allSurfaces, bounds, excludeSurfaceId);
    if (polygon.length >= 3) {
      polygons.push(polygon);
    }
  }

  return polygons;
}

/**
 * Build visibility polygon for a single sector.
 *
 * Algorithm:
 * 1. Collect critical points (obstacle endpoints, screen corners)
 * 2. Filter to points inside this sector
 * 3. Cast rays and find first hits
 * 4. Sort by angle and build polygon
 */
function buildPolygonForSector(
  sector: LightSector,
  allSurfaces: readonly Surface[],
  bounds: ScreenBounds,
  excludeSurfaceId?: string
): Vector2[] {
  const origin = sector.origin;
  const effectiveObstacles = excludeSurfaceId
    ? allSurfaces.filter((s) => s.id !== excludeSurfaceId)
    : allSurfaces;

  // Collect critical points
  const criticalPoints: Vector2[] = [];

  // Add obstacle endpoints
  for (const surface of allSurfaces) {
    criticalPoints.push(surface.segment.start);
    criticalPoints.push(surface.segment.end);
  }

  // Add screen corners
  criticalPoints.push({ x: bounds.minX, y: bounds.minY });
  criticalPoints.push({ x: bounds.maxX, y: bounds.minY });
  criticalPoints.push({ x: bounds.maxX, y: bounds.maxY });
  criticalPoints.push({ x: bounds.minX, y: bounds.maxY });

  // Add sector boundaries if not full
  if (!isFullLightSector(sector)) {
    criticalPoints.push(sector.leftBoundary);
    criticalPoints.push(sector.rightBoundary);
  }

  // Cast rays to each critical point inside the sector
  const hits: Array<{ point: Vector2; angle: number }> = [];

  for (const target of criticalPoints) {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) continue;

    // Check if target is in sector
    if (!isFullLightSector(sector) && !isPointInLightSector(target, sector)) {
      continue;
    }

    // Compute start ratio if sector has startLine
    const startRatio = computeStartRatioForRay(origin, target, sector);

    // Cast ray directly at target
    const directHit = castRayToFirstHit(origin, target, effectiveObstacles, bounds, startRatio);
    if (directHit) {
      hits.push({ point: directHit, angle: Math.atan2(dy, dx) });
    }

    // Cast grazing rays
    const len = Math.sqrt(dx * dx + dy * dy);
    const grazingOffset = Math.max(0.5, len * 0.001);
    const perpX = (-dy / len) * grazingOffset;
    const perpY = (dx / len) * grazingOffset;

    for (const offset of [
      { x: perpX, y: perpY },
      { x: -perpX, y: -perpY },
    ]) {
      const grazingTarget = { x: target.x + offset.x, y: target.y + offset.y };
      if (!isFullLightSector(sector) && !isPointInLightSector(grazingTarget, sector)) {
        continue;
      }

      const grazingStartRatio = computeStartRatioForRay(origin, grazingTarget, sector);
      const grazingHit = castRayToFirstHit(
        origin,
        grazingTarget,
        effectiveObstacles,
        bounds,
        grazingStartRatio
      );
      if (grazingHit) {
        const gdx = grazingTarget.x - origin.x;
        const gdy = grazingTarget.y - origin.y;
        hits.push({ point: grazingHit, angle: Math.atan2(gdy, gdx) });
      }
    }
  }

  // For sectors with startLine, add extended boundary rays
  if (!isFullLightSector(sector) && sector.startLine) {
    const ldx = sector.leftBoundary.x - origin.x;
    const ldy = sector.leftBoundary.y - origin.y;
    const rdx = sector.rightBoundary.x - origin.x;
    const rdy = sector.rightBoundary.y - origin.y;

    // Cast extended rays along sector boundaries
    const farLeftTarget = { x: origin.x + 10 * ldx, y: origin.y + 10 * ldy };
    const leftStartRatio = computeStartRatioForRay(origin, farLeftTarget, sector);
    const leftHit = castRayToFirstHit(origin, farLeftTarget, effectiveObstacles, bounds, leftStartRatio);
    if (leftHit) {
      hits.push({ point: leftHit, angle: Math.atan2(ldy, ldx) });
    }

    const farRightTarget = { x: origin.x + 10 * rdx, y: origin.y + 10 * rdy };
    const rightStartRatio = computeStartRatioForRay(origin, farRightTarget, sector);
    const rightHit = castRayToFirstHit(origin, farRightTarget, effectiveObstacles, bounds, rightStartRatio);
    if (rightHit) {
      hits.push({ point: rightHit, angle: Math.atan2(rdy, rdx) });
    }

    // Also add startLine endpoints directly (the window edges)
    hits.push({ 
      point: sector.startLine.start, 
      angle: Math.atan2(sector.startLine.start.y - origin.y, sector.startLine.start.x - origin.x) 
    });
    hits.push({ 
      point: sector.startLine.end, 
      angle: Math.atan2(sector.startLine.end.y - origin.y, sector.startLine.end.x - origin.x) 
    });
  }

  // Sort by angle and deduplicate
  hits.sort((a, b) => a.angle - b.angle);

  // Deduplicate close points
  const result: Vector2[] = [];
  const epsilon = 0.5;
  for (const { point } of hits) {
    const isDuplicate = result.some(
      (p) => Math.abs(p.x - point.x) < epsilon && Math.abs(p.y - point.y) < epsilon
    );
    if (!isDuplicate) {
      result.push(point);
    }
  }

  return result;
}

/**
 * Compute the start ratio for a ray based on sector's startLine.
 *
 * The start ratio indicates how far along the ray (from origin to target)
 * the ray should actually start (to skip the portion behind the startLine).
 */
function computeStartRatioForRay(
  origin: Vector2,
  target: Vector2,
  sector: LightSector
): number {
  if (!sector.startLine) return 0;

  const lineStart = sector.startLine.start;
  const lineEnd = sector.startLine.end;

  const rdx = target.x - origin.x;
  const rdy = target.y - origin.y;
  const ldx = lineEnd.x - lineStart.x;
  const ldy = lineEnd.y - lineStart.y;

  const denom = rdx * ldy - rdy * ldx;
  if (Math.abs(denom) < 1e-10) return 0;

  const t = ((lineStart.x - origin.x) * ldy - (lineStart.y - origin.y) * ldx) / denom;
  return Math.max(0, t);
}

/**
 * Cast a ray and find the first obstacle or screen boundary hit.
 *
 * @param origin Ray starting point
 * @param target Target direction (ray extends beyond this)
 * @param obstacles All blocking surfaces
 * @param bounds Screen boundaries
 * @param startRatio Fraction along ray where it actually starts (0-1)
 * @returns Hit point, or null if no hit
 */
function castRayToFirstHit(
  origin: Vector2,
  target: Vector2,
  obstacles: readonly Surface[],
  bounds: ScreenBounds,
  startRatio: number
): Vector2 | null {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;

  // Extend ray far beyond target
  const rayScale = 10;
  const farPoint = { x: origin.x + dx * rayScale, y: origin.y + dy * rayScale };

  let closestT = Number.POSITIVE_INFINITY;
  let closestPoint: Vector2 | null = null;

  // Minimum t (starts after startRatio, scaled for extended ray)
  const minT = Math.max(startRatio / rayScale, 0.0001);

  // Check obstacles
  for (const obstacle of obstacles) {
    const hit = raySegmentIntersect(origin, farPoint, obstacle.segment.start, obstacle.segment.end);
    if (hit && hit.t > minT && hit.t < closestT) {
      closestT = hit.t;
      closestPoint = hit.point;
    }
  }

  // Check screen boundaries
  const screenEdges = [
    { start: { x: bounds.minX, y: bounds.minY }, end: { x: bounds.maxX, y: bounds.minY } },
    { start: { x: bounds.maxX, y: bounds.minY }, end: { x: bounds.maxX, y: bounds.maxY } },
    { start: { x: bounds.maxX, y: bounds.maxY }, end: { x: bounds.minX, y: bounds.maxY } },
    { start: { x: bounds.minX, y: bounds.maxY }, end: { x: bounds.minX, y: bounds.minY } },
  ];

  for (const edge of screenEdges) {
    const hit = raySegmentIntersect(origin, farPoint, edge.start, edge.end);
    if (hit && hit.t > minT && hit.t < closestT) {
      closestT = hit.t;
      closestPoint = hit.point;
    }
  }

  return closestPoint;
}

/**
 * Ray-segment intersection.
 */
function raySegmentIntersect(
  rayStart: Vector2,
  rayEnd: Vector2,
  segStart: Vector2,
  segEnd: Vector2
): { point: Vector2; t: number } | null {
  const rdx = rayEnd.x - rayStart.x;
  const rdy = rayEnd.y - rayStart.y;
  const sdx = segEnd.x - segStart.x;
  const sdy = segEnd.y - segStart.y;

  const denom = rdx * sdy - rdy * sdx;
  if (Math.abs(denom) < 1e-10) return null;

  const t = ((segStart.x - rayStart.x) * sdy - (segStart.y - rayStart.y) * sdx) / denom;
  const s = ((segStart.x - rayStart.x) * rdy - (segStart.y - rayStart.y) * rdx) / denom;

  if (t < 0 || s < 0 || s > 1) return null;

  return {
    point: { x: rayStart.x + t * rdx, y: rayStart.y + t * rdy },
    t,
  };
}

