/**
 * RayPathBuilder - Ray-Based Path Construction
 *
 * This module builds trajectory paths using rays as the core primitive.
 * All calculations derive from ImageChain, ensuring exact consistency
 * between planned and actual paths.
 *
 * First Principles:
 * 1. Rays are defined by two points (source, target) - no normalization
 * 2. Planned path = rays derived directly from ImageChain
 * 3. Actual path = forward physics using same ray intersection math
 * 4. Point paths are derived FROM ray paths, not the other way around
 */

import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { ImageChain } from "./ImageChain";
import {
  type Ray,
  type RayHit,
  type Segment,
  intersectRaySegment,
  createRay,
  getRayDirection,
  rayFromDirection,
} from "@/trajectory-v2/geometry/RayCore";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";

// =============================================================================
// Types
// =============================================================================

/**
 * A hit along a ray path.
 */
export interface RayPathHit {
  /** The intersection point */
  readonly point: Vector2;
  /** The surface that was hit */
  readonly surface: Surface;
  /** Whether the hit is on the actual segment (not extended line) */
  readonly onSegment: boolean;
  /** Parametric position along segment (0=start, 1=end) */
  readonly segmentT: number;
  /** Index in the planned surface list (-1 if unplanned) */
  readonly plannedIndex: number;
}

/**
 * A path represented as connected rays.
 * Each ray's "hit point" (where it intersects a surface) = next ray's source.
 */
export interface RayPath {
  /** The rays forming the path */
  readonly rays: readonly Ray[];
  /** Surface hits along the path */
  readonly hits: readonly RayPathHit[];
  /** How the path terminated */
  readonly termination: "cursor" | "wall" | "max_distance" | "max_reflections";
  /** Position of cursor on path (null if not on path) */
  readonly cursorPosition: {
    readonly rayIndex: number;
    readonly t: number;
  } | null;
}

// =============================================================================
// Planned Path Building
// =============================================================================

/**
 * Build planned path directly from ImageChain rays.
 *
 * The planned path is purely geometric - it follows the reflection points
 * computed by ImageChain without considering obstacles.
 *
 * For n surfaces, produces n+1 rays:
 * - ray[0]: player → reflectionPoint[0]
 * - ray[i]: reflectionPoint[i-1] → reflectionPoint[i]
 * - ray[n]: reflectionPoint[n-1] → cursor
 *
 * @param chain The ImageChain containing all computed geometry
 * @returns RayPath with planned trajectory
 */
export function buildPlannedRayPath(chain: ImageChain): RayPath {
  const n = chain.surfaces.length;

  if (n === 0) {
    // No surfaces: single ray from player to cursor
    return {
      rays: [createRay(chain.player, chain.cursor)],
      hits: [],
      termination: "cursor",
      cursorPosition: { rayIndex: 0, t: 1 },
    };
  }

  const rays: Ray[] = [];
  const hits: RayPathHit[] = [];

  // First ray: player → first reflection point
  const firstReflection = chain.getReflectionPoint(0);
  rays.push(createRay(chain.player, firstReflection));

  // Record first hit
  hits.push({
    point: firstReflection,
    surface: chain.surfaces[0]!,
    onSegment: chain.isReflectionOnSegment(0),
    segmentT: computeSegmentT(firstReflection, chain.surfaces[0]!),
    plannedIndex: 0,
  });

  // Middle rays: reflectionPoint[i-1] → reflectionPoint[i]
  for (let i = 1; i < n; i++) {
    const prevReflection = chain.getReflectionPoint(i - 1);
    const currReflection = chain.getReflectionPoint(i);
    rays.push(createRay(prevReflection, currReflection));

    hits.push({
      point: currReflection,
      surface: chain.surfaces[i]!,
      onSegment: chain.isReflectionOnSegment(i),
      segmentT: computeSegmentT(currReflection, chain.surfaces[i]!),
      plannedIndex: i,
    });
  }

  // Last ray: last reflection point → cursor
  const lastReflection = chain.getReflectionPoint(n - 1);
  rays.push(createRay(lastReflection, chain.cursor));

  return {
    rays,
    hits,
    termination: "cursor",
    cursorPosition: { rayIndex: n, t: 1 },
  };
}

// =============================================================================
// Actual Path Building
// =============================================================================

/**
 * Build actual path using forward physics simulation.
 *
 * Uses ImageChain for initial direction, then performs forward ray casting
 * against all surfaces. Only reflects at on-segment hits.
 *
 * @param chain The ImageChain for initial direction
 * @param allSurfaces All surfaces in the scene
 * @param maxReflections Maximum reflections (default 10)
 * @param maxDistance Maximum path length (default 2000)
 * @returns RayPath with actual trajectory
 */
export function buildActualRayPath(
  chain: ImageChain,
  allSurfaces: readonly Surface[],
  maxReflections = 10,
  maxDistance = 2000
): RayPath {
  const rays: Ray[] = [];
  const hits: RayPathHit[] = [];

  // Get initial ray from ImageChain
  const initialRay = chain.getRay(0);
  let currentRay = initialRay;
  let currentPoint = chain.player;
  let remainingDistance = maxDistance;
  let lastHitSurface: Surface | null = null;
  let termination: RayPath["termination"] = "max_distance";
  let cursorPosition: RayPath["cursorPosition"] = null;

  // Track how many planned surfaces have been hit
  let plannedSurfacesHit = 0;
  const totalPlannedSurfaces = chain.surfaces.length;

  for (let i = 0; i < maxReflections && remainingDistance > 0; i++) {
    // Find first intersection with any surface
    let closestHit: RayHit | null = null;
    let closestSurface: Surface | null = null;

    for (const surface of allSurfaces) {
      // Skip the surface we just reflected off
      if (lastHitSurface && surface.id === lastHitSurface.id) {
        continue;
      }

      const segment: Segment = {
        start: surface.segment.start,
        end: surface.segment.end,
      };

      const hit = intersectRaySegment(currentRay, segment);

      if (hit && hit.t > 0 && hit.onSegment) {
        // Check if this hit is within remaining distance
        const hitDist = computeDistance(currentPoint, hit.point);
        if (hitDist <= remainingDistance) {
          if (!closestHit || hit.t < closestHit.t) {
            closestHit = hit;
            closestSurface = surface;
          }
        }
      }
    }

    // IMPORTANT: Only check for cursor on path AFTER all planned surfaces have been hit.
    // If we have planned surfaces and haven't hit them all yet, the cursor might be
    // geometrically "on the path" but should be reached via reflection AFTER hitting the surface.
    const allPlannedSurfacesHit = plannedSurfacesHit >= totalPlannedSurfaces;

    if (allPlannedSurfacesHit) {
      const cursorOnRay = checkCursorOnRay(currentRay, chain.cursor);
      if (cursorOnRay) {
        const cursorDist = computeDistance(currentPoint, chain.cursor);
        const hitDist = closestHit ? computeDistance(currentPoint, closestHit.point) : Infinity;

        if (cursorDist < hitDist) {
          // Cursor is reached before any hit
          rays.push(createRay(currentPoint, chain.cursor));
          cursorPosition = { rayIndex: rays.length - 1, t: 1 };
          termination = "cursor";
          break;
        }
      }
    }

    if (closestHit && closestSurface) {
      // Create ray to hit point
      rays.push(createRay(currentPoint, closestHit.point));

      // Record hit
      const plannedIndex = findPlannedIndex(closestSurface, chain.surfaces);
      hits.push({
        point: closestHit.point,
        surface: closestSurface,
        onSegment: true,
        segmentT: closestHit.s,
        plannedIndex,
      });

      // Track planned surface hits
      if (plannedIndex >= 0) {
        plannedSurfacesHit++;
      }

      // Update remaining distance
      const hitDist = computeDistance(currentPoint, closestHit.point);
      remainingDistance -= hitDist;

      // Check if surface allows reflection
      const direction = getRayDirection(currentRay);
      const canReflect = closestSurface.canReflectFrom(normalize(direction));

      if (!canReflect) {
        // Wall hit - stop
        termination = "wall";
        break;
      }

      // Reflect and continue
      const reflectedTarget = reflectPointThroughLine(
        currentRay.target,
        closestSurface.segment.start,
        closestSurface.segment.end
      );
      currentRay = createRay(closestHit.point, reflectedTarget);
      currentPoint = closestHit.point;
      lastHitSurface = closestSurface;
    } else {
      // No hit - extend to max distance
      const dir = getRayDirection(currentRay);
      const dirLen = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
      if (dirLen > 0) {
        const endPoint = {
          x: currentPoint.x + (dir.x / dirLen) * remainingDistance,
          y: currentPoint.y + (dir.y / dirLen) * remainingDistance,
        };
        rays.push(createRay(currentPoint, endPoint));
      }
      termination = "max_distance";
      break;
    }
  }

  // Check if we hit max reflections
  if (rays.length >= maxReflections) {
    termination = "max_reflections";
  }

  return {
    rays,
    hits,
    termination,
    cursorPosition,
  };
}

// =============================================================================
// Conversion to Point-Based Path
// =============================================================================

/**
 * Convert a RayPath to an array of points.
 *
 * This is the primary interface for backward compatibility with
 * existing rendering and analysis code.
 *
 * @param rayPath The ray-based path
 * @returns Array of waypoints from start to end
 */
export function rayPathToPoints(rayPath: RayPath): Vector2[] {
  if (rayPath.rays.length === 0) {
    return [];
  }

  const points: Vector2[] = [rayPath.rays[0]!.source];

  for (const ray of rayPath.rays) {
    points.push(ray.target);
  }

  return points;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Compute parametric position on a surface segment.
 */
function computeSegmentT(point: Vector2, surface: Surface): number {
  const { start, end } = surface.segment;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return 0;
  }

  return ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq;
}

/**
 * Compute distance between two points.
 */
function computeDistance(a: Vector2, b: Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Find index of surface in planned list (-1 if not found).
 */
function findPlannedIndex(
  surface: Surface,
  plannedSurfaces: readonly Surface[]
): number {
  for (let i = 0; i < plannedSurfaces.length; i++) {
    if (plannedSurfaces[i]!.id === surface.id) {
      return i;
    }
  }
  return -1;
}

/**
 * Check if cursor is on a ray.
 */
function checkCursorOnRay(ray: Ray, cursor: Vector2): boolean {
  const dx = ray.target.x - ray.source.x;
  const dy = ray.target.y - ray.source.y;
  const cx = cursor.x - ray.source.x;
  const cy = cursor.y - ray.source.y;

  // Cross product for collinearity
  const cross = dx * cy - dy * cx;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return false;
  }

  const perpDist = Math.abs(cross) / Math.sqrt(lenSq);
  if (perpDist > 1) {
    return false;
  }

  // Dot product for forward direction
  const dot = dx * cx + dy * cy;
  return dot >= 0;
}

/**
 * Normalize a vector.
 */
function normalize(v: Vector2): Vector2 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len === 0) {
    return { x: 1, y: 0 };
  }
  return { x: v.x / len, y: v.y / len };
}

// =============================================================================
// Adapter for PathBuilder Integration
// =============================================================================

import type { PathResult, HitInfo } from "./types";

/**
 * Convert a RayPath to a legacy PathResult.
 *
 * This adapter enables gradual migration from point-based to ray-based
 * path calculation while maintaining backward compatibility.
 *
 * @param rayPath The ray-based path
 * @param cursor The cursor position
 * @param bypassedSurfaces Surfaces that were bypassed (from bypass evaluation)
 * @returns Legacy PathResult format
 */
export function rayPathToPathResult(
  rayPath: RayPath,
  cursor: Vector2,
  bypassedSurfaces: readonly import("./types").BypassedSurfaceInfo[] = []
): PathResult {
  const points = rayPathToPoints(rayPath);
  
  // Build hit info from ray path hits
  const hitInfo: HitInfo[] = rayPath.hits.map((hit) => ({
    point: hit.point,
    surface: hit.surface,
    segmentT: hit.segmentT,
    onSegment: hit.onSegment,
    reflected: hit.onSegment, // Only reflects if on segment
  }));

  // Calculate total length
  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalLength += computeDistance(points[i]!, points[i + 1]!);
  }

  // Determine if cursor was reached
  const reachedCursor = rayPath.cursorPosition !== null;

  // Forward projection is remaining points after cursor
  let forwardProjection: Vector2[] = [];
  if (rayPath.cursorPosition !== null) {
    const cursorRayIndex = rayPath.cursorPosition.rayIndex;
    for (let i = cursorRayIndex + 1; i < rayPath.rays.length; i++) {
      forwardProjection.push(rayPath.rays[i]!.target);
    }
  }

  return {
    points,
    hitInfo,
    reachedCursor,
    totalLength,
    forwardProjection,
    bypassedSurfaces: bypassedSurfaces as import("./types").BypassedSurfaceInfo[],
  };
}

