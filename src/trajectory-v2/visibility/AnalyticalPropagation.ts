/**
 * AnalyticalPropagation - Unified Visibility Polygon Construction
 *
 * This module implements the core visibility algorithm using analytical
 * ray casting. The same `buildVisibilityPolygon` function is used for:
 * - Empty plan (direct visibility)
 * - Before first surface (same as empty plan)
 * - After last surface (from reflected origin)
 * - Intermediate steps (before cropping by window)
 *
 * Key Design Principles:
 * 1. Use rays (source + target points), NOT angles
 * 2. All calculations are exact - no normalization
 * 3. Polygon intersection for window cropping
 * 4. Deterministic results for identical inputs
 */

import type { Surface } from "@/surfaces/Surface";
import {
  type Ray,
  type Segment,
  createRay,
  createRayWithStart,
  intersectRaySegment,
} from "@/trajectory-v2/geometry/RayCore";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { ReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import type {
  PlannedPolygonStep,
  PropagationResult,
  PropagationStep,
  ValidPolygonStep,
  VisibilityWindow,
} from "./PropagationTypes";
import {
  type RaySector,
  type RaySectors,
  type ScreenBounds as RaySectorBounds,
  type ProjectionResult,
  createFullSector,
  createSectorFromSurface,
  fullSectors,
  isFullSector,
  isPointInSector,
  isSectorsEmpty,
  projectSectorsThroughObstacles,
  reflectSectors,
} from "./RaySector";

export type { ScreenBounds } from "./PropagationTypes";

/**
 * Build visibility polygon from an origin point.
 *
 * This is the unified function used at every step of propagation:
 * - For empty plan: origin = player
 * - For step K > 0: origin = player image after K-1 reflections
 *
 * Algorithm:
 * 1. Collect all critical points (obstacle endpoints + screen corners)
 * 2. For each critical point, cast a ray from origin
 * 3. Find where ray hits first obstacle or screen edge
 * 4. Cast "grazing rays" slightly past each endpoint to catch shadows
 * 5. Sort hit points angularly and build polygon
 *
 * When sectorConstraint is provided:
 * - Only cast rays to critical points inside the sector(s)
 * - Add explicit rays along sector boundaries
 * - All containment checks use cross-product (exact, no angles)
 *
 * @param origin The viewpoint (player or reflected image)
 * @param obstacles All surfaces that block visibility
 * @param bounds Screen boundaries
 * @param sectorConstraint Optional: Only build polygon within these angular sectors
 * @returns Polygon vertices in angular order
 */
export function buildVisibilityPolygon(
  origin: Vector2,
  obstacles: readonly Surface[],
  bounds: ScreenBounds,
  sectorConstraint?: RaySectors
): Vector2[] {
  // If sector constraint is empty, return empty polygon
  if (sectorConstraint && isSectorsEmpty(sectorConstraint)) {
    return [];
  }

  // Collect all critical points
  const criticalPoints: Vector2[] = [];

  // Add obstacle endpoints
  for (const obstacle of obstacles) {
    criticalPoints.push(obstacle.segment.start);
    criticalPoints.push(obstacle.segment.end);
  }

  // Add screen corners
  criticalPoints.push({ x: bounds.minX, y: bounds.minY }); // Top-left
  criticalPoints.push({ x: bounds.maxX, y: bounds.minY }); // Top-right
  criticalPoints.push({ x: bounds.maxX, y: bounds.maxY }); // Bottom-right
  criticalPoints.push({ x: bounds.minX, y: bounds.maxY }); // Bottom-left

  // Add sector boundary points if constrained (skip full sectors)
  if (sectorConstraint) {
    for (const sector of sectorConstraint) {
      if (!isFullSector(sector)) {
        criticalPoints.push(sector.leftBoundary);
        criticalPoints.push(sector.rightBoundary);
      }
    }
  }

  // For each critical point, cast rays
  const hits: Array<{ point: Vector2; angle: number }> = [];

  for (const target of criticalPoints) {
    // Skip if target is at origin
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    if (dx === 0 && dy === 0) continue;

    // If sector constraint, check if target is inside any sector and get startRatio
    let startRatio = 0;
    if (sectorConstraint) {
      const containingSector = sectorConstraint.find((sector) => isPointInSector(target, sector));
      if (!containingSector) continue;

      // Compute startRatio for this ray based on the sector's startRatios
      // Use interpolation between left and right startRatios based on angular position
      startRatio = computeStartRatioForTarget(origin, target, containingSector);
    }

    // Cast ray directly at target
    const directHit = castRayToFirstHit(origin, target, obstacles, bounds, startRatio);
    if (directHit) {
      const angle = Math.atan2(dy, dx);
      hits.push({ point: directHit, angle });
    }

    // Cast grazing rays slightly to either side
    // Use a larger offset that scales with distance to ensure meaningful angular separation
    // even when the target is directly above/below the origin
    const len = Math.sqrt(dx * dx + dy * dy);
    const grazingOffset = 1; // Fixed 1 pixel offset
    const perpX = (-dy / len) * grazingOffset;
    const perpY = (dx / len) * grazingOffset;

    const targetLeft = { x: target.x + perpX, y: target.y + perpY };
    const targetRight = { x: target.x - perpX, y: target.y - perpY };

    // Only cast grazing rays if they're also in the sector
    if (!sectorConstraint || sectorConstraint.some((s) => isPointInSector(targetLeft, s))) {
      const leftStartRatio = sectorConstraint
        ? computeStartRatioForTarget(
            origin,
            targetLeft,
            sectorConstraint.find((s) => isPointInSector(targetLeft, s))!
          )
        : 0;
      const leftHit = castRayToFirstHit(origin, targetLeft, obstacles, bounds, leftStartRatio);
      if (leftHit) {
        const ldx = targetLeft.x - origin.x;
        const ldy = targetLeft.y - origin.y;
        hits.push({ point: leftHit, angle: Math.atan2(ldy, ldx) });
      }
    }

    if (!sectorConstraint || sectorConstraint.some((s) => isPointInSector(targetRight, s))) {
      const rightStartRatio = sectorConstraint
        ? computeStartRatioForTarget(
            origin,
            targetRight,
            sectorConstraint.find((s) => isPointInSector(targetRight, s))!
          )
        : 0;
      const rightHit = castRayToFirstHit(origin, targetRight, obstacles, bounds, rightStartRatio);
      if (rightHit) {
        const rdx = targetRight.x - origin.x;
        const rdy = targetRight.y - origin.y;
        hits.push({ point: rightHit, angle: Math.atan2(rdy, rdx) });
      }
    }
  }

  // For sectors with a startLine, add both:
  // 1. Extended rays along boundaries to find far edge
  // 2. Surface endpoints as on-surface points (near edge)
  if (sectorConstraint) {
    for (const sector of sectorConstraint) {
      if (!isFullSector(sector) && sector.startLine) {
        const ldx = sector.leftBoundary.x - origin.x;
        const ldy = sector.leftBoundary.y - origin.y;
        const rdx = sector.rightBoundary.x - origin.x;
        const rdy = sector.rightBoundary.y - origin.y;

        // Cast extended rays along sector boundaries to find far edge
        const farLeftTarget = { x: origin.x + 10 * ldx, y: origin.y + 10 * ldy };
        const leftExtStartRatio = computeStartRatioForTarget(origin, farLeftTarget, sector);
        const leftHit = castRayToFirstHit(
          origin,
          farLeftTarget,
          obstacles,
          bounds,
          leftExtStartRatio
        );
        if (leftHit) {
          hits.push({ point: leftHit, angle: Math.atan2(ldy, ldx) });
        }

        const farRightTarget = { x: origin.x + 10 * rdx, y: origin.y + 10 * rdy };
        const rightExtStartRatio = computeStartRatioForTarget(origin, farRightTarget, sector);
        const rightHit = castRayToFirstHit(
          origin,
          farRightTarget,
          obstacles,
          bounds,
          rightExtStartRatio
        );
        if (rightHit) {
          hits.push({ point: rightHit, angle: Math.atan2(rdy, rdx) });
        }

        // Add surface endpoints as on-surface points (near boundary)
        // These will be sorted separately and appended after off-surface points
        hits.push({
          point: { ...sector.startLine.start },
          angle: Math.atan2(
            sector.startLine.start.y - origin.y,
            sector.startLine.start.x - origin.x
          ),
        });
        hits.push({
          point: { ...sector.startLine.end },
          angle: Math.atan2(sector.startLine.end.y - origin.y, sector.startLine.end.x - origin.x),
        });
      } else if (!isFullSector(sector)) {
        // No startLine - just add boundary points
        const ldx = sector.leftBoundary.x - origin.x;
        const ldy = sector.leftBoundary.y - origin.y;
        hits.push({ point: { ...sector.leftBoundary }, angle: Math.atan2(ldy, ldx) });

        const rdx = sector.rightBoundary.x - origin.x;
        const rdy = sector.rightBoundary.y - origin.y;
        hits.push({ point: { ...sector.rightBoundary }, angle: Math.atan2(rdy, rdx) });
      }
    }
  }

  // New sorting scheme: separate off-surface and on-surface points
  // This creates a proper closed polygon for both empty and reflected plans
  const startLine = sectorConstraint?.[0]?.startLine;

  // Helper to check if a point is on the startLine (exact check)
  const isOnStartLine = (point: Vector2): boolean => {
    if (!startLine) return false;
    const { start, end } = startLine;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return false;

    // Cross product for collinearity
    const cross = (point.x - start.x) * dy - (point.y - start.y) * dx;
    if (cross !== 0) return false;

    // Parametric t for position on segment
    const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq;
    return t >= 0 && t <= 1;
  };

  // Separate hits into off-surface and on-surface
  const offSurfaceHits: Array<{ point: Vector2; angle: number }> = [];
  const onSurfaceHits: Array<{ point: Vector2; angle: number }> = [];

  for (const hit of hits) {
    if (isOnStartLine(hit.point)) {
      onSurfaceHits.push(hit);
    } else {
      offSurfaceHits.push(hit);
    }
  }

  // Sort off-surface by angle (ascending) - traces far boundary
  offSurfaceHits.sort((a, b) => a.angle - b.angle);

  // Sort on-surface by angle (descending) - traces near boundary in reverse
  onSurfaceHits.sort((a, b) => b.angle - a.angle);

  // Concatenate: off-surface first, then on-surface
  const sortedHits = [...offSurfaceHits, ...onSurfaceHits];

  // Remove duplicate points (exact match)
  const polygon: Vector2[] = [];

  for (const hit of sortedHits) {
    // Check if this point already exists (exact match)
    const isDuplicate = polygon.some(
      (p) => p.x === hit.point.x && p.y === hit.point.y
    );

    if (isDuplicate) continue;

    // Check if this point equals the PREVIOUS point
    if (polygon.length > 0) {
      const prev = polygon[polygon.length - 1]!;
      if (prev.x === hit.point.x && prev.y === hit.point.y) continue;
    }

    polygon.push(hit.point);
  }

  // Check wrap-around: if last point equals first
  if (polygon.length > 2) {
    const first = polygon[0]!;
    const last = polygon[polygon.length - 1]!;
    if (first.x === last.x && first.y === last.y) {
      polygon.pop();
    }
  }

  return polygon;
}

/**
 * Compute the startRatio for a ray from origin to target, based on sector's start ratios.
 *
 * Uses linear interpolation between the sector's left and right start ratios
 * based on the target's angular position within the sector.
 *
 * @param origin The ray origin
 * @param target The ray target
 * @param sector The sector containing the target
 * @returns The interpolated startRatio for this ray
 */
/**
 * Compute the startRatio for a ray from origin toward target, based on the sector's startLine.
 *
 * The startRatio is a value in [0, 1] where:
 * - 0 means the ray starts at the origin
 * - The computed value means the ray starts where it crosses the startLine
 *
 * For reflected sectors, rays should start ON the reflecting surface, not from
 * the (possibly off-screen) reflected origin. This function computes the exact
 * t-value where the ray crosses the surface line.
 *
 * @returns t-value where ray crosses startLine (0 = origin, values > 0 = on surface)
 */
function computeStartRatioForTarget(origin: Vector2, target: Vector2, sector: RaySector): number {
  // If no startLine, ray starts at origin (t=0)
  if (!sector.startLine) {
    return 0;
  }

  const lineStart = sector.startLine.start;
  const lineEnd = sector.startLine.end;

  // Ray direction vector (not normalized - we need the parametric t)
  const rdx = target.x - origin.x;
  const rdy = target.y - origin.y;

  // Line direction vector
  const ldx = lineEnd.x - lineStart.x;
  const ldy = lineEnd.y - lineStart.y;

  // Cross product for denominator: ray × line
  // This is zero if ray is parallel to line
  const denom = rdx * ldy - rdy * ldx;
  if (denom === 0) {
    // Ray parallel to surface - start at origin
    return 0;
  }

  // Compute t where ray crosses the surface line
  // Ray equation: P = origin + t * (target - origin)
  // Line equation: Q = lineStart + s * (lineEnd - lineStart)
  // Solving P = Q for t:
  // t = ((lineStart - origin) × lineDir) / (rayDir × lineDir)
  const t = ((lineStart.x - origin.x) * ldy - (lineStart.y - origin.y) * ldx) / denom;

  // The ray should start at the surface crossing
  // If t < 0, the surface is "behind" the origin (shouldn't happen for valid sectors)
  // If t > 1, the surface is past the target (ray doesn't reach surface before target)
  // We want rays to start at the surface, so return the computed t (clamped to >= 0)
  return Math.max(0, t);
}

/**
 * Cast a ray from origin toward target and find first hit.
 *
 * @param origin The ray source (may be off-screen for reflected images)
 * @param target The point defining ray direction
 * @param obstacles Surfaces that can block the ray
 * @param bounds Screen boundaries
 * @param startRatio Optional: Where the ray actually starts (0=origin, 1=target)
 *                   Used for off-screen origins where ray should start on a surface.
 * @returns The first hit point, or null if no hit
 */
function castRayToFirstHit(
  origin: Vector2,
  target: Vector2,
  obstacles: readonly Surface[],
  bounds: ScreenBounds,
  startRatio = 0
): Vector2 | null {
  // Create ray with startRatio - intersectRaySegment will ignore hits before this
  const ray =
    startRatio > 0 ? createRayWithStart(origin, target, startRatio) : createRay(origin, target);

  let closestT = Number.POSITIVE_INFINITY;
  let closestPoint: Vector2 | null = null;

  // Check all obstacles
  const minT = Math.max(startRatio, 0);

  for (const obstacle of obstacles) {
    const segment: Segment = {
      start: obstacle.segment.start,
      end: obstacle.segment.end,
    };

    const hit = intersectRaySegment(ray, segment);
    if (hit && hit.onSegment && hit.t > minT && hit.t < closestT) {
      closestT = hit.t;
      closestPoint = hit.point;
    }
  }

  // Check screen boundaries (also respects startRatio)
  const screenHit = findScreenBoundaryHit(ray, bounds);
  if (screenHit) {
    // Calculate t value for screen hit
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq > 0) {
      const screenDx = screenHit.x - origin.x;
      const screenDy = screenHit.y - origin.y;
      const screenT = (screenDx * dx + screenDy * dy) / lenSq;

      // Only consider screen hit if it's after startRatio and closer than obstacle
      if (screenT >= startRatio && screenT < closestT) {
        closestT = screenT;
        closestPoint = screenHit;
      }
    }
  }

  return closestPoint;
}

/**
 * Find where a ray hits the screen boundary.
 */
function findScreenBoundaryHit(ray: Ray, bounds: ScreenBounds): Vector2 | null {
  const edges: Segment[] = [
    { start: { x: bounds.minX, y: bounds.minY }, end: { x: bounds.maxX, y: bounds.minY } }, // Top
    { start: { x: bounds.maxX, y: bounds.minY }, end: { x: bounds.maxX, y: bounds.maxY } }, // Right
    { start: { x: bounds.maxX, y: bounds.maxY }, end: { x: bounds.minX, y: bounds.maxY } }, // Bottom
    { start: { x: bounds.minX, y: bounds.maxY }, end: { x: bounds.minX, y: bounds.minY } }, // Left
  ];

  let closestT = Number.POSITIVE_INFINITY;
  let closestPoint: Vector2 | null = null;

  for (const edge of edges) {
    const hit = intersectRaySegment(ray, edge);
    if (hit && hit.onSegment && hit.t > 0 && hit.t < closestT) {
      closestT = hit.t;
      closestPoint = hit.point;
    }
  }

  return closestPoint;
}

/**
 * Crop a visibility polygon by a window triangle.
 *
 * The window is defined by:
 * 1. Ray from origin through surface.start
 * 2. Ray from origin through surface.end
 * 3. The surface segment itself
 *
 * This is a polygon intersection (Sutherland-Hodgman algorithm).
 *
 * @param polygon The polygon to crop
 * @param origin The window origin
 * @param windowSurface The surface forming the window
 * @returns Cropped polygon vertices
 */
export function cropPolygonByWindow(
  polygon: readonly Vector2[],
  origin: Vector2,
  windowSurface: Surface
): Vector2[] {
  if (polygon.length < 3) return [];

  const surfStart = windowSurface.segment.start;
  const surfEnd = windowSurface.segment.end;

  // Build the window triangle edges as clipping planes
  // The triangle is: origin -> surfStart -> surfEnd -> origin
  // We clip against each edge, keeping points on the "inside"

  // Edge 1: origin -> surfStart (keep points on right side looking from origin to surfStart)
  let clipped = clipPolygonByEdge(polygon, origin, surfStart);
  if (clipped.length < 3) return [];

  // Edge 2: surfStart -> surfEnd (the surface itself - keep points on origin's side)
  clipped = clipPolygonByEdge(clipped, surfStart, surfEnd);
  if (clipped.length < 3) return [];

  // Edge 3: surfEnd -> origin (keep points on right side looking from surfEnd to origin)
  clipped = clipPolygonByEdge(clipped, surfEnd, origin);

  return clipped;
}

/**
 * Clip polygon by a half-plane defined by an edge.
 * Sutherland-Hodgman single-edge clipping step.
 */
/**
 * Clip a subject polygon by a clip polygon using Sutherland-Hodgman algorithm.
 *
 * Returns the intersection of the two polygons. If the polygons don't
 * intersect, returns an empty array.
 *
 * @param subject The polygon to clip
 * @param clip The clipping polygon
 * @returns The clipped polygon (intersection)
 */
export function clipPolygonByPolygon(
  subject: readonly Vector2[],
  clip: readonly Vector2[]
): Vector2[] {
  if (subject.length < 3 || clip.length < 3) {
    return [];
  }

  let result = [...subject];

  // Clip by each edge of the clip polygon
  for (let i = 0; i < clip.length; i++) {
    if (result.length < 3) {
      return [];
    }

    const edgeStart = clip[i]!;
    const edgeEnd = clip[(i + 1) % clip.length]!;

    result = clipPolygonByEdge(result, edgeStart, edgeEnd);
  }

  return result;
}

export function clipPolygonByEdge(
  polygon: readonly Vector2[],
  edgeStart: Vector2,
  edgeEnd: Vector2
): Vector2[] {
  if (polygon.length === 0) return [];

  const result: Vector2[] = [];

  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i]!;
    const next = polygon[(i + 1) % polygon.length]!;

    const currentInside = isOnRightSide(current, edgeStart, edgeEnd);
    const nextInside = isOnRightSide(next, edgeStart, edgeEnd);

    if (currentInside) {
      result.push(current);

      if (!nextInside) {
        // Current inside, next outside: add intersection
        const intersection = lineIntersection(edgeStart, edgeEnd, current, next);
        if (intersection) {
          result.push(intersection);
        }
      }
    } else if (nextInside) {
      // Current outside, next inside: add intersection
      const intersection = lineIntersection(edgeStart, edgeEnd, current, next);
      if (intersection) {
        result.push(intersection);
      }
    }
  }

  return result;
}

/**
 * Check if a point is on the right side of an edge (or on the edge).
 * "Right side" is determined by the cross product sign.
 */
function isOnRightSide(point: Vector2, edgeStart: Vector2, edgeEnd: Vector2): boolean {
  // Cross product: (edge × point_relative)
  // Positive = right side, negative = left side
  const cross =
    (edgeEnd.x - edgeStart.x) * (point.y - edgeStart.y) -
    (edgeEnd.y - edgeStart.y) * (point.x - edgeStart.x);

  // Include points exactly on the edge (cross = 0)
  return cross >= 0;
}

/**
 * Find intersection of two line segments.
 */
function lineIntersection(p1: Vector2, p2: Vector2, p3: Vector2, p4: Vector2): Vector2 | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;

  const denom = d1x * d2y - d1y * d2x;
  if (denom === 0) {
    return null; // Parallel lines
  }

  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;

  return {
    x: p1.x + t * d1x,
    y: p1.y + t * d1y,
  };
}

// Re-export ScreenBounds for convenience
export interface ScreenBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Propagate visibility through planned surfaces, building valid and planned polygons.
 *
 * This is the main entry point for visibility calculation with planned surfaces.
 * It produces a PropagationResult with:
 * - validPolygons: N+1 entries (full visibility from each origin, NOT cropped)
 * - plannedPolygons: N entries (valid[K] cropped by window to surface K)
 *
 * The algorithm now uses ray-based sectors for angular constraints:
 * 1. valid[0]: Full visibility from player (full 360° sector)
 * 2. For each planned surface K (0 to N-1):
 *    a. Check bypass: current origin must be on reflective side
 *    b. plannedSector[K]: validSector[K] trimmed by surface K
 *    c. planned[K]: valid[K] cropped by window to surface K
 *    d. Reflect origin and sector
 *    e. validSector[K+1]: reflected plannedSector[K]
 *    f. valid[K+1]: Visibility within validSector[K+1]
 * 3. finalPolygon = valid[N] (the last valid polygon)
 *
 * Key: Sectors track the angular constraint accumulated through reflections,
 * ensuring visibility is only calculated within reachable angular ranges.
 *
 * @param player The player position
 * @param plannedSurfaces Surfaces in the plan (order matters)
 * @param allSurfaces All surfaces in the scene (for obstruction)
 * @param bounds Screen boundaries
 * @param cache Optional ReflectionCache for memoized reflections
 * @returns PropagationResult with valid and planned polygon lists
 */
export function propagateWithIntermediates(
  player: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[],
  bounds: ScreenBounds,
  cache?: ReflectionCache
): PropagationResult {
  const validPolygons: ValidPolygonStep[] = [];
  const plannedPolygons: PlannedPolygonStep[] = [];
  const steps: PropagationStep[] = []; // Legacy compatibility

  // Initialize: origin starts at player, sectors start as full 360°
  let currentOrigin = player;
  let currentSectors: RaySectors = fullSectors(player);

  // =========================================================================
  // UNIFIED LOOP: Process each step K from 0 to N
  // - Step 0: valid[0] from player with full 360° sector
  // - Step K>0: valid[K] from reflected origin with constrained sector
  // =========================================================================
  for (let k = 0; k <= plannedSurfaces.length; k++) {
    // Build valid[K]: FULL visibility from currentOrigin
    // For k > 0, rays should start on the previous surface (using startLine)
    // but the angular extent should be full 360° (not constrained by the narrow sector)
    const projectionBoundsForValid: RaySectorBounds = bounds;

    // UNIFIED: Both valid[0] and valid[K] use the same logic
    // The only difference is the sector constraint:
    // - K=0: Full 360° sector (no planned surface yet)
    // - K>0: Sector of the surface we just reflected off (surface K-1)
    let sectorsForValid: RaySectors;
    if (k === 0) {
      sectorsForValid = fullSectors(currentOrigin);
    } else {
      // Use the sector of the previous planned surface
      const previousSurface = plannedSurfaces[k - 1]!;
      sectorsForValid = [createSectorFromSurface(currentOrigin, previousSurface)];
    }

    // Use ALL surfaces as obstacles - same as valid[0]
    const validProjection = projectSectorsThroughObstacles(
      sectorsForValid,
      allSurfaces,
      null, // No target surface - project to all obstacles and screen bounds
      projectionBoundsForValid
    );
    const validKPolygon = [...validProjection.polygonVertices];

    validPolygons.push({
      index: k,
      origin: { ...currentOrigin },
      polygon: validKPolygon,
      isValid: validKPolygon.length >= 3,
    });

    // Legacy step for compatibility - window will be set on NEXT step if there's a planned surface
    steps.push({
      index: k,
      origin: { ...currentOrigin },
      polygon: validKPolygon,
      isValid: validKPolygon.length >= 3,
      window: undefined,
    });

    // If we've processed all planned surfaces, we're done
    if (k >= plannedSurfaces.length) {
      break;
    }

    // -----------------------------------------------------------------------
    // Prepare for next step: reflect through surface K
    // -----------------------------------------------------------------------
    const surface = plannedSurfaces[k]!;

    // Check bypass: current origin must be on reflective side of surface K
    if (!isOnReflectiveSide(currentOrigin, surface)) {
      return {
        validPolygons,
        plannedPolygons,
        steps,
        finalPolygon: [],
        isValid: false,
        bypassAtSurface: k,
        playerPosition: player,
        finalOrigin: currentOrigin,
      };
    }

    // =========================================================================
    // UNIFIED PROJECTION: Projects sectors through obstacles toward surface K
    // This single calculation produces BOTH:
    // - plannedPolygon: vertices from ray hits
    // - reachingSectors: sectors that reach the surface (for reflection)
    // =========================================================================
    const projectionBounds: RaySectorBounds = bounds;
    const projection = projectSectorsThroughObstacles(
      currentSectors,
      allSurfaces,
      surface,
      projectionBounds
    );

    const plannedPolygon = [...projection.polygonVertices];
    const plannedSectors = projection.reachingSectors;

    // Build window for cropping (legacy compatibility)
    const window: VisibilityWindow = {
      leftRay: createRay(currentOrigin, surface.segment.start),
      rightRay: createRay(currentOrigin, surface.segment.end),
      surface,
      origin: { ...currentOrigin },
    };

    plannedPolygons.push({
      index: k,
      origin: { ...currentOrigin },
      polygon: plannedPolygon,
      isValid: plannedPolygon.length >= 3,
      window,
      targetSurface: surface,
    });

    // Reflect origin through surface (using cache if provided)
    currentOrigin = reflectPoint(currentOrigin, surface, cache);

    // Reflect sectors - reflectSector now automatically sets startLine to the surface
    // This ensures rays start ON the surface, not from the (possibly off-screen) reflected origin
    currentSectors = reflectSectors(plannedSectors, surface, cache).map((sector) => ({
      ...sector,
      origin: currentOrigin,
    }));
  }

  // Set window on legacy steps: step[K+1] gets window from planned surface K
  for (let k = 0; k < plannedPolygons.length; k++) {
    if (steps[k + 1]) {
      steps[k + 1] = {
        ...steps[k + 1]!,
        window: plannedPolygons[k]!.window,
      };
    }
  }

  // Final polygon is the last valid polygon (valid[N])
  const finalPolygon = validPolygons[validPolygons.length - 1]!.polygon;

  return {
    validPolygons,
    plannedPolygons,
    steps,
    finalPolygon,
    isValid: finalPolygon.length >= 3,
    playerPosition: player,
    finalOrigin: currentOrigin,
  };
}

/**
 * Check if a point is on the reflective side of a surface.
 */
function isOnReflectiveSide(point: Vector2, surface: Surface): boolean {
  // Use the surface's built-in method if available
  if (surface.isOnReflectiveSide) {
    return surface.isOnReflectiveSide(point);
  }

  // Fallback: check using cross product
  const { start, end } = surface.segment;
  const cross = (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);

  // Assume "reflective side" is the positive side (cross >= 0)
  return cross >= 0;
}

/**
 * Reflect a point through a surface line.
 *
 * @param point The point to reflect
 * @param surface The surface to reflect through
 * @param cache Optional ReflectionCache for memoization
 */
function reflectPoint(
  point: Vector2,
  surface: Surface,
  cache?: ReflectionCache
): Vector2 {
  // Use cache if provided for memoization
  if (cache) {
    return cache.reflect(point, surface);
  }

  const { start, end } = surface.segment;

  // Line direction
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return point; // Degenerate surface
  }

  // Vector from start to point
  const px = point.x - start.x;
  const py = point.y - start.y;

  // Project point onto line
  const t = (px * dx + py * dy) / lenSq;

  // Closest point on line
  const closestX = start.x + t * dx;
  const closestY = start.y + t * dy;

  // Reflect: point' = 2 * closest - point
  return {
    x: 2 * closestX - point.x,
    y: 2 * closestY - point.y,
  };
}


