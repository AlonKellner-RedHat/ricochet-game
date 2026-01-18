/**
 * RangeLimitVisibility - Range limit integration for visibility ray casting.
 *
 * This module provides visibility ray casting that respects range limits.
 * When a ray hits the range limit before any surface or screen edge,
 * the hit is tagged with source = "range_limit" for arc detection.
 */

import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/types";
import type { RangeLimitPair } from "@/trajectory-v2/obstacles/RangeLimit";
import type { VertexSource } from "./VisibilityVertex";
import {
  type Segment,
  createRay,
  createRayWithStart,
  intersectRaySegment,
} from "@/trajectory-v2/geometry/RayCore";

/**
 * Screen boundaries for visibility calculation.
 */
export interface ScreenBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Result of a visibility ray cast with source tracking.
 */
export interface HitWithSource {
  readonly point: Vector2;
  readonly source: VertexSource;
  readonly t: number; // Parametric t value along ray
}

/**
 * Optional range limit configuration for visibility casting.
 */
export interface RangeLimitConfig {
  readonly pair: RangeLimitPair;
  readonly center: Vector2; // Usually the player/origin image
}

/**
 * Cast a ray and find the first hit, tracking the source of the hit.
 *
 * Priority (closest wins):
 * 1. Surface obstacle
 * 2. Range limit circle
 * 3. Screen boundary
 *
 * @param origin The ray source
 * @param target The point defining ray direction
 * @param obstacles Surfaces that can block the ray
 * @param bounds Screen boundaries
 * @param startRatio Where the ray starts (0=origin, 1=target)
 * @param rangeLimit Optional range limit configuration
 * @returns Hit point with source tracking, or null if no hit
 */
export function castRayToFirstHitWithSource(
  origin: Vector2,
  target: Vector2,
  obstacles: readonly Surface[],
  bounds: ScreenBounds,
  startRatio = 0,
  rangeLimit?: RangeLimitConfig
): HitWithSource | null {
  // Create ray with startRatio
  const ray =
    startRatio > 0 ? createRayWithStart(origin, target, startRatio) : createRay(origin, target);

  const minT = Math.max(startRatio, 0);

  // Track the closest hit overall
  let closestT = Number.POSITIVE_INFINITY;
  let closestPoint: Vector2 | null = null;
  let closestSource: VertexSource = "screen"; // Default to screen

  // 1. Check all surface obstacles
  for (const obstacle of obstacles) {
    const segment: Segment = {
      start: obstacle.segment.start,
      end: obstacle.segment.end,
    };

    const hit = intersectRaySegment(ray, segment);
    if (hit && hit.onSegment && hit.t > minT && hit.t < closestT) {
      closestT = hit.t;
      closestPoint = hit.point;
      closestSource = "surface";
    }
  }

  // 2. Check range limit (if provided)
  if (rangeLimit) {
    const rayDirection = {
      x: target.x - origin.x,
      y: target.y - origin.y,
    };

    // Compute start position along ray (for range limit check)
    const startPos = {
      x: origin.x + startRatio * rayDirection.x,
      y: origin.y + startRatio * rayDirection.y,
    };

    const rangeLimitHit = rangeLimit.pair.findHit(
      rangeLimit.center,
      rayDirection,
      startPos
    );

    if (rangeLimitHit) {
      // Compute t value for range limit hit
      const dx = target.x - origin.x;
      const dy = target.y - origin.y;
      const lenSq = dx * dx + dy * dy;

      if (lenSq > 0) {
        const hitDx = rangeLimitHit.point.x - origin.x;
        const hitDy = rangeLimitHit.point.y - origin.y;
        const hitT = (hitDx * dx + hitDy * dy) / lenSq;

        if (hitT >= minT && hitT < closestT) {
          closestT = hitT;
          closestPoint = rangeLimitHit.point;
          closestSource = "range_limit";
        }
      }
    }
  }

  // 3. Check screen boundaries
  const screenHit = findScreenBoundaryHit(origin, target, bounds, minT);
  if (screenHit && screenHit.t < closestT) {
    closestT = screenHit.t;
    closestPoint = screenHit.point;
    closestSource = "screen";
  }

  if (closestPoint === null) {
    return null;
  }

  return {
    point: closestPoint,
    source: closestSource,
    t: closestT,
  };
}

/**
 * Find where a ray hits the screen boundary.
 */
function findScreenBoundaryHit(
  origin: Vector2,
  target: Vector2,
  bounds: ScreenBounds,
  minT: number
): { point: Vector2; t: number } | null {
  const ray = createRay(origin, target);

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
    if (hit && hit.onSegment && hit.t > minT && hit.t < closestT) {
      closestT = hit.t;
      closestPoint = hit.point;
    }
  }

  if (closestPoint === null) {
    return null;
  }

  return { point: closestPoint, t: closestT };
}
