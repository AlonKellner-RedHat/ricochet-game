/**
 * ContinuationRay - First-Class Provenance for Continuation Rays
 *
 * Like SurfaceChain groups surfaces that share junctions, ContinuationRay
 * groups points that share the same continuation ray from the origin.
 *
 * A continuation ray is cast from origin through an endpoint to find what's
 * behind it. Multiple endpoints may be passed through (non-blocking) before
 * hitting a final surface.
 *
 * Example:
 *   Origin → Endpoint[target-end] → Endpoint[wall-end] → HitPoint[screen]
 *   All three points share the same ContinuationRay.
 *
 * This enables provenance-based deduplication: instead of checking if points
 * are geometrically collinear (forbidden per project rules), we check if they
 * share the same ContinuationRay.id.
 */

import type { SourcePoint, Endpoint } from "./SourcePoint";
import type { JunctionPoint } from "./SurfaceChain";

/** Counter for generating unique ray IDs */
let rayIdCounter = 0;

/**
 * A continuation ray groups all points on the same ray from origin.
 *
 * Immutable: once created, the ray's membership is fixed.
 */
export class ContinuationRay {
  /** Unique identifier for this continuation ray */
  readonly id: string;

  /**
   * Create a new ContinuationRay.
   *
   * @param source - The starting endpoint or junction that initiated the ray
   * @param passedThrough - Endpoints that were passed through (non-blocking)
   * @param hit - The final hit point (HitPoint, JunctionPoint, or Endpoint)
   */
  constructor(
    readonly source: Endpoint | JunctionPoint,
    readonly passedThrough: readonly Endpoint[],
    readonly hit: SourcePoint
  ) {
    this.id = `ray-${rayIdCounter++}`;
  }

  /**
   * Get all points on this ray, ordered by distance from origin.
   * Source is closest, hit is farthest.
   */
  get orderedPoints(): SourcePoint[] {
    return [this.source, ...this.passedThrough, this.hit];
  }

  /**
   * Check if a point is part of this continuation ray.
   *
   * Uses SourcePoint.equals() for provenance-based comparison.
   */
  contains(point: SourcePoint): boolean {
    return this.orderedPoints.some((p) => p.equals(point));
  }

  /**
   * Get the closest point on the ray (the source).
   */
  get closest(): SourcePoint {
    return this.source;
  }

  /**
   * Get the farthest point on the ray (the hit).
   */
  get farthest(): SourcePoint {
    return this.hit;
  }
}

/**
 * Reset the ray ID counter.
 * Useful for testing to ensure deterministic IDs.
 */
export function resetRayIdCounter(): void {
  rayIdCounter = 0;
}
