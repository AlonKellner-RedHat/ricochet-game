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

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import {
  reflectPointThroughLine,
  pointSideOfLine,
  lineLineIntersection,
} from "@/trajectory-v2/geometry/GeometryOps";

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
export function createSectorFromSurface(
  origin: Vector2,
  surface: Surface
): RaySector {
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
export function isPointInSector(
  point: Vector2,
  sector: RaySector,
  checkDistance: boolean = false
): boolean {
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
    const distToPoint =
      (point.x - origin.x) ** 2 + (point.y - origin.y) ** 2;
    const distToRight =
      (right.x - origin.x) ** 2 + (right.y - origin.y) ** 2;
    const distToLeft =
      (left.x - origin.x) ** 2 + (left.y - origin.y) ** 2;
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
export function isPointOnSectorBoundary(
  point: Vector2,
  sector: RaySector
): boolean {
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
export function trimSectorBySurface(
  sector: RaySector,
  surface: Surface
): RaySector | null {
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
export function trimSectorsBySurface(
  sectors: RaySectors,
  surface: Surface
): RaySectors {
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
export function intersectSectors(
  a: RaySector,
  b: RaySector
): RaySector | null {
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
  const aRightInB = isPointInSector(a.rightBoundary, b) || isPointOnSectorBoundary(a.rightBoundary, b);
  const aLeftInB = isPointInSector(a.leftBoundary, b) || isPointOnSectorBoundary(a.leftBoundary, b);
  
  // Check if any boundary of B is inside A
  const bRightInA = isPointInSector(b.rightBoundary, a) || isPointOnSectorBoundary(b.rightBoundary, a);
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
    const leftIntersects = rayIntersectsSegment(
      origin,
      sector.leftBoundary,
      obsStart,
      obsEnd
    );
    const rightIntersects = rayIntersectsSegment(
      origin,
      sector.rightBoundary,
      obsStart,
      obsEnd
    );

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

