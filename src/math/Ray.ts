import type { LineSegment, Ray, RaySegmentHit, Vector2 } from "@/types";
import { Segment } from "./Segment";
import { Vec2 } from "./Vec2";

/**
 * RayUtils - Pure utility functions for ray operations
 */
export const RayUtils = {
  /**
   * Create a ray from origin and direction
   * @param origin - Start point of ray
   * @param direction - Direction vector (will be normalized)
   */
  create(origin: Vector2, direction: Vector2): Ray {
    return { origin, direction: Vec2.normalize(direction) };
  },

  /**
   * Create a ray from origin pointing towards a target point
   */
  fromPoints(origin: Vector2, target: Vector2): Ray {
    return RayUtils.create(origin, Vec2.direction(origin, target));
  },

  /**
   * Get point along ray at parameter t
   * P(t) = origin + t * direction
   */
  pointAt(ray: Ray, t: number): Vector2 {
    return Vec2.add(ray.origin, Vec2.scale(ray.direction, t));
  },
};

/**
 * No hit result constant
 */
const NO_HIT: RaySegmentHit = {
  hit: false,
  point: null,
  t: -1,
  s: -1,
  normal: null,
};

/**
 * Calculate intersection between a ray and a line segment
 *
 * Uses parametric line intersection:
 * - Ray: P(t) = origin + t * direction, where t >= 0
 * - Segment: Q(s) = start + s * (end - start), where 0 <= s <= 1
 *
 * @param ray - The ray to test
 * @param segment - The line segment to test against
 * @returns Hit result with intersection point, t parameter, and normal
 */
export function raySegmentIntersect(ray: Ray, segment: LineSegment): RaySegmentHit {
  // Segment direction vector
  const segmentDir = Vec2.subtract(segment.end, segment.start);

  // Vector from ray origin to segment start
  const originToStart = Vec2.subtract(segment.start, ray.origin);

  // 2D cross product: a × b = a.x * b.y - a.y * b.x
  const cross = (a: Vector2, b: Vector2) => a.x * b.y - a.y * b.x;

  const denominator = cross(ray.direction, segmentDir);

  // Parallel or coincident lines
  if (denominator === 0) {
    return NO_HIT;
  }

  // Calculate t (distance along ray) and s (position along segment)
  const t = cross(originToStart, segmentDir) / denominator;
  const s = cross(originToStart, ray.direction) / denominator;

  // t must be positive (ray goes forward)
  // s must be in [0, 1] (hit is on the segment)
  if (t < 0 || s < 0 || s > 1) {
    return NO_HIT;
  }

  // Calculate hit point
  const point = RayUtils.pointAt(ray, t);

  // Calculate normal - ensure it points toward ray origin
  let normal = Segment.normal(segment);
  if (Vec2.dot(normal, ray.direction) > 0) {
    // Normal is pointing away from ray, flip it
    normal = Vec2.scale(normal, -1);
  }

  return { hit: true, point, t, s, normal };
}
