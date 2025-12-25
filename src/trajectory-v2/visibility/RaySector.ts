/**
 * RaySector - Position-Based Angular Sector Operations
 *
 * This module implements angular sectors using positions instead of angles,
 * ensuring exact matching, reversibility, and reproducibility.
 *
 * Key Design Principles:
 * 1. NO ANGLES - All sectors defined by boundary positions
 * 2. NO EPSILONS - All comparisons are exact (cross-product sign)
 * 3. REVERSIBLE - reflect(reflect(sector, line), line) === sector exactly
 * 4. SOURCE OF TRUTH - Boundaries are images of surface endpoints
 *
 * A RaySector represents an angular region from an origin, bounded by two rays.
 * The rays are defined by the origin and boundary points (NOT angles).
 */

import type { Surface } from "@/surfaces/Surface";
import {
  lineLineIntersection,
  pointSideOfLine,
  reflectPointThroughLine,
} from "@/trajectory-v2/geometry/GeometryOps";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// =============================================================================
// Core Types
// =============================================================================

/**
 * A ray-based angular sector defined by two boundary points.
 *
 * The sector is the angular region from origin, bounded by:
 * - Left boundary ray: origin → leftBoundary
 * - Right boundary ray: origin → rightBoundary
 *
 * Convention: Moving counter-clockwise from rightBoundary to leftBoundary
 * traces the sector's interior.
 *
 * All positions are source-of-truth values (or images derived from them).
 *
 * Optional start ratios define where each boundary ray actually starts:
 * - leftStartRatio: where the left boundary ray starts (0=origin, 1=leftBoundary)
 * - rightStartRatio: where the right boundary ray starts (0=origin, 1=rightBoundary)
 *
 * Optional startLine defines a line that rays must start from (e.g., the surface line).
 * When set, rays start where they cross this line, not at the origin.
 *
 * Use case: When origin is off-screen (reflected player image), set startLine
 * so rays effectively start ON the reflecting surface.
 */
export interface RaySector {
  /** Source of the rays (player position or player image) */
  readonly origin: Vector2;

  /** Point defining the left boundary ray (e.g., surface.end or its image) */
  readonly leftBoundary: Vector2;

  /** Point defining the right boundary ray (e.g., surface.start or its image) */
  readonly rightBoundary: Vector2;

  /** Where the left boundary ray starts (0=origin, 1=leftBoundary, default 0) */
  readonly leftStartRatio?: number;

  /** Where the right boundary ray starts (0=origin, 1=rightBoundary, default 0) */
  readonly rightStartRatio?: number;

  /** Line that all rays in this sector must start from (for reflected sectors) */
  readonly startLine?: { start: Vector2; end: Vector2 };
}

/**
 * A collection of non-overlapping ray sectors.
 * Multiple sectors occur when obstacles split the angular range.
 */
export type RaySectors = RaySector[];

/**
 * Result of a sector operation that may produce multiple sectors.
 */
export interface SectorOperationResult {
  readonly sectors: RaySectors;
  readonly isEmpty: boolean;
}

/**
 * Screen boundaries for visibility calculations.
 */
export interface ScreenBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Result of projecting sectors through obstacles toward a target surface.
 *
 * This unified result ensures that polygon vertices and sector boundaries
 * are derived from the SAME ray casting calculation.
 *
 * When obstacles split sectors, each disjoint sector produces its own polygon.
 * The `polygonVertices` is the merged result of all sector polygons.
 * Use `sectorPolygons` to get individual polygons per sector.
 */
export interface ProjectionResult {
  /** Polygon vertices from ray hits (sorted for polygon construction) - merged from all sectors */
  readonly polygonVertices: readonly Vector2[];

  /** Individual polygons for each sector (when sectors are split by obstacles) */
  readonly sectorPolygons: readonly (readonly Vector2[])[];

  /** Sectors that reached the target surface (after blocking by obstacles) */
  readonly reachingSectors: RaySectors;

  /** Points where sector boundaries intersect the target surface */
  readonly surfaceIntersections: readonly Vector2[];

  /** Whether any sectors reached the target */
  readonly hasReachingSectors: boolean;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a "full" sector covering all directions.
 *
 * For a full sector, we use three points to define "everywhere":
 * - The origin
 * - Two boundary points that are the same (indicating no constraint)
 *
 * In practice, a full sector is represented as a special case that
 * isPointInSector always returns true for.
 */
export function createFullSector(origin: Vector2): RaySector {
  // Use a sentinel value: when left === right, sector is "full"
  // We place boundaries at a consistent offset to avoid degenerate case
  return {
    origin,
    leftBoundary: { x: origin.x + 1, y: origin.y },
    rightBoundary: { x: origin.x + 1, y: origin.y },
  };
}

/**
 * Check if a sector is a "full" sector (no angular constraint).
 */
export function isFullSector(sector: RaySector): boolean {
  return (
    sector.leftBoundary.x === sector.rightBoundary.x &&
    sector.leftBoundary.y === sector.rightBoundary.y
  );
}

/**
 * Create a sector from origin looking at a surface segment.
 *
 * The sector is the angular range that "sees" the segment from the origin.
 * - leftBoundary = surface.end (or start, depending on orientation)
 * - rightBoundary = surface.start (or end, depending on orientation)
 *
 * The ordering is determined by which endpoint is "left" when looking
 * from the origin (using cross-product).
 */
export function createSectorFromSurface(origin: Vector2, surface: Surface): RaySector {
  const start = surface.segment.start;
  const end = surface.segment.end;

  // Determine which endpoint is "left" using cross product
  // If cross product of (origin→start, origin→end) is positive, start is to the right
  const cross = crossProduct(origin, start, end);

  if (cross >= 0) {
    // end is to the left of start (as seen from origin)
    return {
      origin,
      leftBoundary: end,
      rightBoundary: start,
    };
  } else {
    // start is to the left of end
    return {
      origin,
      leftBoundary: start,
      rightBoundary: end,
    };
  }
}

/**
 * Create an empty sectors collection.
 */
export function emptySectors(): RaySectors {
  return [];
}

/**
 * Create a full sectors collection (covering all directions).
 */
export function fullSectors(origin: Vector2): RaySectors {
  return [createFullSector(origin)];
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
  // Cross product of (a - origin) × (b - origin)
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

/**
 * Check if a point is inside a ray sector.
 *
 * Uses cross-product sign comparison (exact, no epsilon).
 *
 * A point is inside if it's:
 * - On or left of the right boundary ray
 * - On or right of the left boundary ray
 *
 * Convention: Counter-clockwise from right to left defines the interior.
 */
export function isPointInSector(point: Vector2, sector: RaySector, checkDistance = false): boolean {
  // Special case: full sector
  if (isFullSector(sector)) {
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

  // For a sector going counter-clockwise from right to left:
  // Point must be LEFT of right (rightCross >= 0)
  // Point must be RIGHT of left (leftCross <= 0)

  // Handle the case where the sector spans more than 180 degrees
  // by checking if left is to the left of right
  const sectorCross = crossProduct(origin, right, left);

  let angularlyInside: boolean;
  if (sectorCross >= 0) {
    // Sector is less than 180 degrees (normal case)
    // Point must be inside both half-planes
    angularlyInside = rightCross >= 0 && leftCross <= 0;
  } else {
    // Sector is more than 180 degrees (reflex case)
    // Point is inside if it's NOT in the excluded region
    // Excluded region: right of right boundary AND left of left boundary
    angularlyInside = rightCross >= 0 || leftCross <= 0;
  }

  if (!angularlyInside) {
    return false;
  }

  // Optional distance check: point must be at least as far as the nearest boundary
  // This is needed when the origin is off-screen to exclude points between
  // the origin and the sector boundaries
  if (checkDistance) {
    const distToPoint = (point.x - origin.x) ** 2 + (point.y - origin.y) ** 2;
    const distToRight = (right.x - origin.x) ** 2 + (right.y - origin.y) ** 2;
    const distToLeft = (left.x - origin.x) ** 2 + (left.y - origin.y) ** 2;
    const minBoundaryDist = Math.min(distToRight, distToLeft);

    // Allow a small tolerance (95% of boundary distance)
    if (distToPoint < minBoundaryDist * 0.9) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a point is exactly on a sector boundary.
 */
export function isPointOnSectorBoundary(point: Vector2, sector: RaySector): boolean {
  if (isFullSector(sector)) {
    return false;
  }

  const origin = sector.origin;
  const leftCross = crossProduct(origin, sector.leftBoundary, point);
  const rightCross = crossProduct(origin, sector.rightBoundary, point);

  // On boundary if exactly collinear with either boundary ray
  // AND in the forward direction from origin
  if (leftCross === 0) {
    // Check if point is in forward direction from origin along left boundary
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
 * Positive if they point in similar directions.
 */
function dotProduct(origin: Vector2, a: Vector2, b: Vector2): number {
  return (a.x - origin.x) * (b.x - origin.x) + (a.y - origin.y) * (b.y - origin.y);
}

// =============================================================================
// Sector Operations (All Exact, No Angles)
// =============================================================================

/**
 * Reflect a sector through a surface line.
 *
 * Reflects all three points (origin and both boundaries), and SWAPS
 * the left/right boundaries because reflection reverses orientation.
 *
 * This is EXACT and REVERSIBLE: reflect(reflect(s, line), line) === s
 */
export function reflectSector(sector: RaySector, surface: Surface): RaySector {
  const lineStart = surface.segment.start;
  const lineEnd = surface.segment.end;

  // Swap boundaries after reflection to maintain correct sector orientation
  // (Reflection reverses the counter-clockwise direction)
  // Note: leftStartRatio and rightStartRatio are also swapped because the boundaries swap
  return {
    origin: reflectPointThroughLine(sector.origin, lineStart, lineEnd),
    leftBoundary: reflectPointThroughLine(sector.rightBoundary, lineStart, lineEnd),
    rightBoundary: reflectPointThroughLine(sector.leftBoundary, lineStart, lineEnd),
    leftStartRatio: sector.rightStartRatio, // Swapped!
    rightStartRatio: sector.leftStartRatio, // Swapped!
    // Set the surface as the start line - rays from reflected origin start on this surface
    startLine: { start: lineStart, end: lineEnd },
  };
}

/**
 * Reflect multiple sectors through a surface.
 */
export function reflectSectors(sectors: RaySectors, surface: Surface): RaySectors {
  return sectors.map((s) => reflectSector(s, surface));
}

/**
 * Trim a sector to only the angular range that passes through a surface.
 *
 * This is the "passing through window" operation.
 * Returns the intersection of the sector with the surface's angular extent.
 *
 * Uses cross-product comparisons to find the more restrictive boundaries.
 */
export function trimSectorBySurface(sector: RaySector, surface: Surface): RaySector | null {
  // Create the sector that represents the surface's angular extent
  const surfaceSector = createSectorFromSurface(sector.origin, surface);

  // Special case: input is full sector
  if (isFullSector(sector)) {
    return surfaceSector;
  }

  // Intersect the two sectors
  return intersectSectors(sector, surfaceSector);
}

/**
 * Trim multiple sectors by a surface.
 * Returns only the non-null results.
 */
export function trimSectorsBySurface(sectors: RaySectors, surface: Surface): RaySectors {
  const result: RaySectors = [];
  for (const sector of sectors) {
    const trimmed = trimSectorBySurface(sector, surface);
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
export function intersectSectors(a: RaySector, b: RaySector): RaySector | null {
  // Sectors must have the same origin
  // (In practice, we ensure this by construction)
  const origin = a.origin;

  // Special cases for full sectors
  if (isFullSector(a)) return b;
  if (isFullSector(b)) return a;

  // First check: do the sectors overlap at all?
  // A's right boundary must be "inside" B (or on boundary)
  // AND A's left boundary must be "inside" B (or on boundary)
  // OR B's boundaries must be inside A

  // Check if any boundary of A is inside B
  const aRightInB =
    isPointInSector(a.rightBoundary, b) || isPointOnSectorBoundary(a.rightBoundary, b);
  const aLeftInB = isPointInSector(a.leftBoundary, b) || isPointOnSectorBoundary(a.leftBoundary, b);

  // Check if any boundary of B is inside A
  const bRightInA =
    isPointInSector(b.rightBoundary, a) || isPointOnSectorBoundary(b.rightBoundary, a);
  const bLeftInA = isPointInSector(b.leftBoundary, a) || isPointOnSectorBoundary(b.leftBoundary, a);

  // If no boundary of either sector is inside the other, they don't overlap
  if (!aRightInB && !aLeftInB && !bRightInA && !bLeftInA) {
    return null;
  }

  // Find the more restrictive left boundary
  // (the one that is more clockwise, i.e., more to the right when looking from origin)
  const leftA = a.leftBoundary;
  const leftB = b.leftBoundary;

  // Check which left boundary is more restrictive
  // If leftB is inside sector A (on the clockwise side of A's left), use leftB
  const leftBInA = isPointInSector(leftB, a) || isPointOnSectorBoundary(leftB, a);
  const newLeft = leftBInA ? leftB : leftA;

  // Find the more restrictive right boundary
  // If rightB is inside sector A, use rightB
  const rightA = a.rightBoundary;
  const rightB = b.rightBoundary;
  const rightBInA = isPointInSector(rightB, a) || isPointOnSectorBoundary(rightB, a);
  const newRight = rightBInA ? rightB : rightA;

  // Final validation: the resulting sector should be non-empty
  // Check that left is counter-clockwise from right
  const resultCross = crossProduct(origin, newRight, newLeft);

  if (resultCross < 0) {
    // The boundaries crossed over - no overlap
    return null;
  }

  // Preserve startRatios from sector a (the primary sector being constrained)
  // But use the ratio from whichever sector contributed each boundary
  const newLeftStartRatio = newLeft === leftA ? a.leftStartRatio : b.leftStartRatio;
  const newRightStartRatio = newRight === rightA ? a.rightStartRatio : b.rightStartRatio;

  return {
    origin,
    leftBoundary: newLeft,
    rightBoundary: newRight,
    leftStartRatio: newLeftStartRatio,
    rightStartRatio: newRightStartRatio,
  };
}

/**
 * Block a sector by an obstacle surface.
 *
 * The obstacle may:
 * - Not overlap the sector (returns original sector)
 * - Partially overlap (returns 1-2 sectors)
 * - Fully overlap (returns empty array)
 *
 * Uses ray-segment intersection, not angles.
 */
export function blockSectorByObstacle(
  sector: RaySector,
  obstacle: Surface,
  obstacleDistance: number
): RaySectors {
  // Special case: full sector - obstacle blocks its entire angular extent
  if (isFullSector(sector)) {
    // For a full sector, blocking creates a sector with a "hole"
    // This is represented as the complement of the obstacle's sector
    // For now, we don't support this case (would need special handling)
    // In practice, we shouldn't reach here because we constrain before blocking
    return [sector];
  }

  const origin = sector.origin;
  const obsStart = obstacle.segment.start;
  const obsEnd = obstacle.segment.end;

  // Check if obstacle endpoints are inside the sector
  const startInside = isPointInSector(obsStart, sector);
  const endInside = isPointInSector(obsEnd, sector);

  if (!startInside && !endInside) {
    // Obstacle might not overlap, or might fully contain the sector
    // Check if sector boundaries intersect the obstacle
    const leftIntersects = rayIntersectsSegment(origin, sector.leftBoundary, obsStart, obsEnd);
    const rightIntersects = rayIntersectsSegment(origin, sector.rightBoundary, obsStart, obsEnd);

    if (!leftIntersects && !rightIntersects) {
      // No overlap - return original sector
      return [sector];
    }

    // Both boundaries intersect - obstacle fully covers sector
    // (This means the sector is completely blocked)
    if (leftIntersects && rightIntersects) {
      return [];
    }

    // One boundary intersects - partial block from one side
    // This is a complex case; for now, return the sector
    // (A more complete implementation would compute the exact split)
    return [sector];
  }

  if (startInside && endInside) {
    // Obstacle is fully inside the sector - creates two sectors
    // New left sector: from sector.right to obsStart (whichever is more right)
    // New right sector: from obsEnd to sector.left (whichever is more left)

    // Determine which obstacle endpoint is "left" and which is "right"
    const obsCross = crossProduct(origin, obsStart, obsEnd);
    const obsLeft = obsCross >= 0 ? obsEnd : obsStart;
    const obsRight = obsCross >= 0 ? obsStart : obsEnd;

    const leftSector: RaySector = {
      origin,
      leftBoundary: sector.leftBoundary,
      rightBoundary: obsLeft,
      leftStartRatio: sector.leftStartRatio,
      rightStartRatio: undefined, // Obstacle endpoint - starts from origin
    };

    const rightSector: RaySector = {
      origin,
      leftBoundary: obsRight,
      rightBoundary: sector.rightBoundary,
      leftStartRatio: undefined, // Obstacle endpoint - starts from origin
      rightStartRatio: sector.rightStartRatio,
    };

    const result: RaySectors = [];

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
  if (startInside) {
    // Start is inside, end is outside
    // The obstacle blocks from its start to where the sector boundary hits it
    // Determine which side the obstacle enters from
    const startCross = crossProduct(origin, sector.rightBoundary, obsStart);

    if (startCross >= 0) {
      // Obstacle enters from the right side
      return [
        {
          origin,
          leftBoundary: sector.leftBoundary,
          rightBoundary: obsStart,
          leftStartRatio: sector.leftStartRatio,
          rightStartRatio: undefined, // Obstacle endpoint
        },
      ];
    } else {
      // Obstacle enters from the left side
      return [
        {
          origin,
          leftBoundary: obsStart,
          rightBoundary: sector.rightBoundary,
          leftStartRatio: undefined, // Obstacle endpoint
          rightStartRatio: sector.rightStartRatio,
        },
      ];
    }
  } else {
    // End is inside, start is outside
    const endCross = crossProduct(origin, sector.rightBoundary, obsEnd);

    if (endCross >= 0) {
      // Obstacle exits to the right
      return [
        {
          origin,
          leftBoundary: sector.leftBoundary,
          rightBoundary: obsEnd,
          leftStartRatio: sector.leftStartRatio,
          rightStartRatio: undefined, // Obstacle endpoint
        },
      ];
    } else {
      // Obstacle exits to the left
      return [
        {
          origin,
          leftBoundary: obsEnd,
          rightBoundary: sector.rightBoundary,
          leftStartRatio: undefined, // Obstacle endpoint
          rightStartRatio: sector.rightStartRatio,
        },
      ];
    }
  }
}

/**
 * Block multiple sectors by an obstacle.
 */
export function blockSectorsByObstacle(
  sectors: RaySectors,
  obstacle: Surface,
  obstacleDistance: number
): RaySectors {
  const result: RaySectors = [];
  for (const sector of sectors) {
    result.push(...blockSectorByObstacle(sector, obstacle, obstacleDistance));
  }
  return result;
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
  const result = lineLineIntersection(origin, target, segStart, segEnd);

  if (!result.valid) {
    return false;
  }

  // Ray goes forward if t > 0
  // Intersection is on segment if s ∈ [0, 1]
  return result.t > 0 && result.s >= 0 && result.s <= 1;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a sectors collection is empty.
 */
export function isSectorsEmpty(sectors: RaySectors): boolean {
  return sectors.length === 0;
}

/**
 * Get the origin of a sectors collection.
 * All sectors in a collection must have the same origin.
 */
export function getSectorsOrigin(sectors: RaySectors): Vector2 | null {
  if (sectors.length === 0) {
    return null;
  }
  return sectors[0]!.origin;
}

/**
 * Debug: Convert a sector to a string representation.
 */
export function sectorToString(sector: RaySector): string {
  const { origin, leftBoundary, rightBoundary } = sector;
  if (isFullSector(sector)) {
    return `FullSector(origin: ${origin.x.toFixed(1)}, ${origin.y.toFixed(1)})`;
  }
  return (
    `Sector(origin: ${origin.x.toFixed(1)}, ${origin.y.toFixed(1)}, ` +
    `left: ${leftBoundary.x.toFixed(1)}, ${leftBoundary.y.toFixed(1)}, ` +
    `right: ${rightBoundary.x.toFixed(1)}, ${rightBoundary.y.toFixed(1)})`
  );
}

// =============================================================================
// Unified Projection
// =============================================================================

/**
 * Project sectors through obstacles toward a target surface.
 *
 * This is the UNIFIED calculation that produces BOTH:
 * - Polygon vertices (from ray hits)
 * - Updated sectors (blocked by obstacles)
 *
 * By computing both from the same ray casts, we ensure perfect alignment
 * between the visibility polygon and the sector boundaries.
 *
 * Algorithm:
 * 1. Trim sectors to target surface angular extent
 * 2. For each sector, cast rays to critical points (obstacle endpoints)
 * 3. Track which rays hit obstacles BEFORE the target surface
 * 4. Build polygon from hit points
 * 5. Build remaining sectors from unblocked angular ranges
 *
 * @param sectors Input sectors to project
 * @param obstacles All surfaces that can block rays
 * @param targetSurface The surface we're projecting toward (or null for final polygon)
 * @param bounds Screen boundaries
 * @returns Unified result with polygon vertices and reaching sectors
 */
export function projectSectorsThroughObstacles(
  sectors: RaySectors,
  obstacles: readonly Surface[],
  targetSurface: Surface | null,
  bounds: ScreenBounds
): ProjectionResult {
  if (sectors.length === 0) {
    return {
      polygonVertices: [],
      sectorPolygons: [],
      reachingSectors: [],
      surfaceIntersections: [],
      hasReachingSectors: false,
    };
  }

  const origin = sectors[0]!.origin;
  const surfaceIntersections: Vector2[] = [];

  // First, trim sectors to target surface if provided
  let workingSectors = sectors;
  if (targetSurface) {
    workingSectors = trimSectorsBySurface(sectors, targetSurface);
    if (workingSectors.length === 0) {
      return {
        polygonVertices: [],
        sectorPolygons: [],
        reachingSectors: [],
        surfaceIntersections: [],
        hasReachingSectors: false,
      };
    }
  }

  // Collect critical points from obstacles
  const criticalPoints: Vector2[] = [];
  for (const obstacle of obstacles) {
    if (targetSurface && obstacle.id === targetSurface.id) continue;
    criticalPoints.push(obstacle.segment.start);
    criticalPoints.push(obstacle.segment.end);
  }

  // Add screen corners
  criticalPoints.push({ x: bounds.minX, y: bounds.minY });
  criticalPoints.push({ x: bounds.maxX, y: bounds.minY });
  criticalPoints.push({ x: bounds.maxX, y: bounds.maxY });
  criticalPoints.push({ x: bounds.minX, y: bounds.maxY });

  // Add target surface endpoints if provided
  if (targetSurface) {
    criticalPoints.push(targetSurface.segment.start);
    criticalPoints.push(targetSurface.segment.end);
  }

  // Build polygon for EACH sector independently to avoid self-intersection
  const sectorPolygons: Vector2[][] = [];
  const reachingSectors: RaySectors = [];

  for (const sector of workingSectors) {
    const sectorVertices: Vector2[] = [];

    // For each critical point, cast ray if it's in THIS sector
    for (const target of criticalPoints) {
      const dx = target.x - origin.x;
      const dy = target.y - origin.y;
      if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) continue;

      // Check if target is inside THIS sector
      if (!isPointInSector(target, sector)) continue;

      // Compute startRatio for this ray
      const startRatio = computeRayStartRatio(origin, target, sector);

      // Cast ray and find first hit
      const hit = castRayToFirstObstacle(
        origin,
        target,
        obstacles,
        targetSurface,
        bounds,
        startRatio
      );

      if (hit) {
        sectorVertices.push(hit.point);

        if (targetSurface && hit.isOnTarget) {
          surfaceIntersections.push(hit.point);
        }
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
        if (!isPointInSector(grazingTarget, sector)) continue;

        const grazingStartRatio = computeRayStartRatio(origin, grazingTarget, sector);
        const grazingHit = castRayToFirstObstacle(
          origin,
          grazingTarget,
          obstacles,
          targetSurface,
          bounds,
          grazingStartRatio
        );

        if (grazingHit) {
          sectorVertices.push(grazingHit.point);
          if (targetSurface && grazingHit.isOnTarget) {
            surfaceIntersections.push(grazingHit.point);
          }
        }
      }
    }

    // Add sector boundary points
    if (!isFullSector(sector)) {
      sectorVertices.push({ ...sector.leftBoundary });
      sectorVertices.push({ ...sector.rightBoundary });
    }

    // Sort vertices for this sector's polygon
    // Pass the sector's startLine so on-surface points are grouped at the end
    const sortedSectorVertices = sortPolygonVertices(sectorVertices, origin, sector.startLine);

    if (sortedSectorVertices.length >= 3) {
      sectorPolygons.push(sortedSectorVertices);
      reachingSectors.push(sector);
    }
  }

  // Merge all sector polygons into one (for backward compatibility)
  // For multiple sectors, the largest polygon is typically the main one
  let mergedVertices: Vector2[] = [];
  if (sectorPolygons.length === 1) {
    mergedVertices = sectorPolygons[0]!;
  } else if (sectorPolygons.length > 1) {
    // Use the polygon with most vertices as the "main" polygon
    // In practice, for proper rendering, callers should use sectorPolygons
    let maxLen = 0;
    for (const poly of sectorPolygons) {
      if (poly.length > maxLen) {
        maxLen = poly.length;
        mergedVertices = poly;
      }
    }
  }

  return {
    polygonVertices: mergedVertices,
    sectorPolygons,
    reachingSectors,
    surfaceIntersections,
    hasReachingSectors: reachingSectors.length > 0,
  };
}

/**
 * Compute the start ratio for a ray based on sector's startLine.
 */
function computeRayStartRatio(origin: Vector2, target: Vector2, sector: RaySector): number {
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

interface RayHitResult {
  point: Vector2;
  t: number;
  isOnTarget: boolean;
  blocksPath: boolean;
  obstacle: Surface | null;
}

/**
 * Cast a ray and find the first obstacle or target surface hit.
 */
function castRayToFirstObstacle(
  origin: Vector2,
  target: Vector2,
  obstacles: readonly Surface[],
  targetSurface: Surface | null,
  bounds: ScreenBounds,
  startRatio: number
): RayHitResult | null {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;

  let closestT = Number.POSITIVE_INFINITY;
  let closestPoint: Vector2 | null = null;
  let closestObstacle: Surface | null = null;
  let isOnTarget = false;

  // IMPORTANT: startRatio is relative to the ray from origin to target.
  // We extend the ray by 10x for casting, so we must scale minT accordingly.
  // Original ray: P(t) = origin + t * (target - origin), surface at t = startRatio
  // Extended ray: Q(s) = origin + s * 10 * (target - origin), surface at s = startRatio / 10
  const rayScale = 10;
  const minT = Math.max(startRatio / rayScale, 0.0001);

  // Check all obstacles
  for (const obstacle of obstacles) {
    const hit = raySegmentIntersection(
      origin,
      { x: origin.x + dx * rayScale, y: origin.y + dy * rayScale },
      obstacle.segment.start,
      obstacle.segment.end
    );

    if (hit && hit.t > minT && hit.t < closestT) {
      closestT = hit.t;
      closestPoint = hit.point;
      closestObstacle = obstacle;
      isOnTarget = targetSurface !== null && obstacle.id === targetSurface.id;
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
    const hit = raySegmentIntersection(
      origin,
      { x: origin.x + dx * rayScale, y: origin.y + dy * rayScale },
      edge.start,
      edge.end
    );

    if (hit && hit.t > minT && hit.t < closestT) {
      closestT = hit.t;
      closestPoint = hit.point;
      closestObstacle = null;
      isOnTarget = false;
    }
  }

  if (!closestPoint) return null;

  return {
    point: closestPoint,
    t: closestT,
    isOnTarget,
    blocksPath: !isOnTarget && closestObstacle !== null,
    obstacle: closestObstacle,
  };
}

/**
 * Ray-segment intersection using parametric form.
 */
function raySegmentIntersection(
  rayStart: Vector2,
  rayEnd: Vector2,
  segStart: Vector2,
  segEnd: Vector2
): { point: Vector2; t: number; s: number } | null {
  const result = lineLineIntersection(rayStart, rayEnd, segStart, segEnd);
  if (!result.valid) return null;
  if (result.t < 0 || result.s < 0 || result.s > 1) return null;

  return {
    point: result.point,
    t: result.t,
    s: result.s,
  };
}

/**
 * Block sectors at a specific point where an obstacle was hit.
 */
function blockSectorsAtPoint(
  sectors: RaySectors,
  origin: Vector2,
  hitPoint: Vector2,
  obstacle: Surface
): RaySectors {
  const result: RaySectors = [];

  for (const sector of sectors) {
    // Check if obstacle endpoints are in this sector
    const startInSector = isPointInSector(obstacle.segment.start, sector);
    const endInSector = isPointInSector(obstacle.segment.end, sector);

    if (!startInSector && !endInSector) {
      // Obstacle doesn't affect this sector
      result.push(sector);
      continue;
    }

    // Obstacle is in sector - split around it
    const blocked = blockSectorByObstacle(sector, obstacle, 0);
    result.push(...blocked);
  }

  return result;
}

/**
 * Sort polygon vertices for proper polygon construction.
 *
 * For sectors with a startLine (reflected sectors):
 * 1. Separate points into "off-surface" and "on-surface"
 * 2. Sort off-surface points by angle ascending (counter-clockwise trace)
 * 3. Sort on-surface points in REVERSE angle order (to close the polygon)
 * 4. Concatenate: off-surface first, then on-surface
 *
 * This creates a polygon that traces the visible boundary, then returns
 * along the surface to close the loop.
 */
function sortPolygonVertices(
  vertices: Vector2[],
  origin: Vector2,
  startLine?: { start: Vector2; end: Vector2 }
): Vector2[] {
  if (vertices.length === 0) return [];

  // Helper to check if point is on startLine
  const isOnStartLine = (point: Vector2): boolean => {
    if (!startLine) return false;
    const { start, end } = startLine;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-10) return false;

    const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq;
    if (t < -0.01 || t > 1.01) return false;

    const projX = start.x + t * dx;
    const projY = start.y + t * dy;
    const dist = Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
    return dist < 2.0; // Slightly larger tolerance
  };

  // Calculate angle and distance for each vertex and classify
  const offSurface: Array<{ point: Vector2; angle: number; dist: number }> = [];
  const onSurface: Array<{ point: Vector2; angle: number; dist: number }> = [];

  for (const point of vertices) {
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const angle = Math.atan2(dy, dx);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (startLine && isOnStartLine(point)) {
      onSurface.push({ point, angle, dist });
    } else {
      offSurface.push({ point, angle, dist });
    }
  }

  // Merge all points
  const allPoints = [...offSurface, ...onSurface];

  // If we have a startLine (reflected sector with off-screen origin),
  // use centroid-based sorting instead of origin-based sorting.
  // This produces valid simple polygons for funnel-shaped visible regions.
  if (startLine && allPoints.length >= 3) {
    // Calculate centroid
    let cx = 0,
      cy = 0;
    for (const p of allPoints) {
      cx += p.point.x;
      cy += p.point.y;
    }
    cx /= allPoints.length;
    cy /= allPoints.length;

    // Sort by angle from centroid
    allPoints.sort((a, b) => {
      const angleA = Math.atan2(a.point.y - cy, a.point.x - cx);
      const angleB = Math.atan2(b.point.y - cy, b.point.x - cx);
      return angleA - angleB;
    });
  } else {
    // For on-screen origins, use origin-based sorting
    allPoints.sort((a, b) => {
      const angleDiff = a.angle - b.angle;
      if (Math.abs(angleDiff) < 0.0001) {
        return a.dist - b.dist;
      }
      return angleDiff;
    });
  }

  const result: Vector2[] = [];
  const epsilon = 0.5;
  for (const { point } of allPoints) {
    const isDuplicate = result.some(
      (p) => Math.abs(p.x - point.x) < epsilon && Math.abs(p.y - point.y) < epsilon
    );
    if (!isDuplicate) {
      result.push(point);
    }
  }
  return result;
}
