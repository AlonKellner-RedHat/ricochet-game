/**
 * Source-of-Truth Geometry: SourcePoint
 *
 * Points carry their source definition, not computed coordinates.
 * This enables exact floating-point matching without epsilons.
 *
 * Design Principles:
 * - OCP: New point types extend SourcePoint without modifying existing code
 * - KISS: Simple class hierarchy with clear responsibilities
 * - Exact: Operations like equals() use source definitions, not computed values
 *
 * Three concrete types:
 * - OriginPoint: Raw source coordinates (player, cursor)
 * - Endpoint: Start or end of a surface
 * - HitPoint: Ray hit on a surface
 */

import type { Surface } from "@/surfaces/Surface";
import type { Ray, Vector2 } from "./types";

// =============================================================================
// ABSTRACT BASE CLASS
// =============================================================================

/**
 * Abstract base class for all source-of-truth points.
 *
 * Each point type implements its own behavior - adding new types
 * follows OCP (Open/Closed Principle).
 */
export abstract class SourcePoint {
  /** Type discriminator for runtime checks */
  abstract readonly type: string;

  /**
   * Compute actual x,y coordinates for rendering.
   * This is a deferred calculation - the source definition is the truth.
   */
  abstract computeXY(): Vector2;

  /**
   * Check if this point lies on the given surface.
   * Uses source definition, not coordinate comparison.
   */
  abstract isOnSurface(surface: Surface): boolean;

  /**
   * Check if this is the same source point.
   * Uses source definition comparison, not computed coordinates.
   * No epsilons - exact matching.
   */
  abstract equals(other: SourcePoint): boolean;

  /**
   * Get a unique key for this source point.
   * Useful for Set/Map operations.
   */
  abstract getKey(): string;
}

// =============================================================================
// ORIGIN POINT
// =============================================================================

/**
 * Raw source coordinates - player position, cursor, screen corners.
 *
 * These are the true source values that other points derive from.
 */
export class OriginPoint extends SourcePoint {
  readonly type = "origin" as const;

  constructor(readonly value: Vector2) {
    super();
  }

  computeXY(): Vector2 {
    return this.value;
  }

  isOnSurface(_surface: Surface): boolean {
    // Origin points are never "on" a surface by definition
    return false;
  }

  equals(other: SourcePoint): boolean {
    return (
      other instanceof OriginPoint &&
      this.value.x === other.value.x &&
      this.value.y === other.value.y
    );
  }

  getKey(): string {
    return `origin:${this.value.x},${this.value.y}`;
  }
}

// =============================================================================
// ENDPOINT
// =============================================================================

/**
 * Explicit start or end of a surface.
 *
 * When a ray is cast TO a surface endpoint and reaches it,
 * the result is an Endpoint (not a HitPoint).
 *
 * This makes isEndpoint() a trivial type check.
 */
export class Endpoint extends SourcePoint {
  readonly type = "endpoint" as const;

  constructor(
    readonly surface: Surface,
    readonly which: "start" | "end"
  ) {
    super();
  }

  computeXY(): Vector2 {
    return this.which === "start" ? this.surface.segment.start : this.surface.segment.end;
  }

  isOnSurface(surface: Surface): boolean {
    return this.surface.id === surface.id;
  }

  equals(other: SourcePoint): boolean {
    return (
      other instanceof Endpoint &&
      this.surface.id === other.surface.id &&
      this.which === other.which
    );
  }

  getKey(): string {
    return `endpoint:${this.surface.id}:${this.which}`;
  }
}

// =============================================================================
// HIT POINT
// =============================================================================

/**
 * Ray hit on a surface.
 *
 * Defined by the ray and the surface it hit, plus parametric values.
 * The actual x,y is computed from ray origin + t * direction.
 *
 * Used for:
 * - Ray hitting a surface in the middle
 * - Continuation hits (shadow extensions past endpoints)
 * - Screen boundary hits
 */
export class HitPoint extends SourcePoint {
  readonly type = "hit" as const;

  constructor(
    /** The ray that was cast */
    readonly ray: Ray,
    /** The surface that was hit */
    readonly hitSurface: Surface,
    /** Parameter along the ray (0 = ray.from, 1 = ray.to) */
    readonly t: number,
    /** Parameter along the surface segment (0 = start, 1 = end) */
    readonly s: number
  ) {
    super();
  }

  computeXY(): Vector2 {
    const { from, to } = this.ray;
    return {
      x: from.x + (to.x - from.x) * this.t,
      y: from.y + (to.y - from.y) * this.t,
    };
  }

  isOnSurface(surface: Surface): boolean {
    return this.hitSurface.id === surface.id;
  }

  equals(other: SourcePoint): boolean {
    // Two HitPoints are equal if:
    // 1. Same surface
    // 2. Same position on that surface (s parameter)
    // Note: We use s (surface parameter), not t (ray parameter),
    // because different rays hitting the same surface point should be equal
    return (
      other instanceof HitPoint &&
      this.hitSurface.id === other.hitSurface.id &&
      this.s === other.s
    );
  }

  getKey(): string {
    return `hit:${this.hitSurface.id}:${this.s}`;
  }
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard for Endpoint.
 * Replaces epsilon-based endpoint detection.
 */
export function isEndpoint(point: SourcePoint): point is Endpoint {
  return point instanceof Endpoint;
}

/**
 * Type guard for HitPoint.
 */
export function isHitPoint(point: SourcePoint): point is HitPoint {
  return point instanceof HitPoint;
}

/**
 * Type guard for OriginPoint.
 */
export function isOriginPoint(point: SourcePoint): point is OriginPoint {
  return point instanceof OriginPoint;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a point is on a screen boundary surface.
 * Screen boundary surfaces have IDs starting with "screen-".
 */
export function isScreenBoundary(point: SourcePoint): boolean {
  if (point instanceof Endpoint) {
    return point.surface.id.startsWith("screen-");
  }
  if (point instanceof HitPoint) {
    return point.hitSurface.id.startsWith("screen-");
  }
  return false;
}

/**
 * Create an Endpoint for the start of a surface.
 */
export function startOf(surface: Surface): Endpoint {
  return new Endpoint(surface, "start");
}

/**
 * Create an Endpoint for the end of a surface.
 */
export function endOf(surface: Surface): Endpoint {
  return new Endpoint(surface, "end");
}

/**
 * Get both endpoints of a surface.
 */
export function endpointsOf(surface: Surface): [Endpoint, Endpoint] {
  return [startOf(surface), endOf(surface)];
}

