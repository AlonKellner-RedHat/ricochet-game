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
 * Minimal orientation info for blocking checks.
 * Matches the crossProduct field from SurfaceOrientation.
 */
export interface OrientationInfo {
  readonly crossProduct: number;
}

/**
 * Context for determining blocking at window junctions.
 * When provided, junctions connected to the window surface use
 * the geometric "between" test instead of surface orientations.
 *
 * This enables encapsulated, provenance-based blocking decisions
 * within JunctionPoint without the caller needing special-case logic.
 */
export interface WindowContext {
  /** The origin point for ray casting (reflected origin for windowed cones) */
  readonly origin: Vector2;
  /** The ID of the window/excluded surface */
  readonly windowSurfaceId: string;
  /** Reference direction for CCW comparisons (opposite to window midpoint) */
  readonly refDirection: Vector2;
}

/**
 * Minimal interface for ContinuationRay reference.
 * Defined here to avoid circular imports.
 */
export interface ContinuationRayRef {
  readonly id: string;
}

/**
 * Directional blocking status for a point.
 *
 * Each point can block rays from CW direction, CCW direction, both, or neither.
 * This is determined by the surface orientations relative to the origin.
 *
 * - CW blocking: blocks rays approaching from the CW (clockwise) direction
 * - CCW blocking: blocks rays approaching from the CCW (counter-clockwise) direction
 */
export interface BlockingStatus {
  readonly isCWBlocking: boolean;
  readonly isCCWBlocking: boolean;
}

/**
 * Non-blocking status constant - used by OriginPoint and collinear endpoints.
 */
export const NON_BLOCKING: BlockingStatus = {
  isCWBlocking: false,
  isCCWBlocking: false,
};

/**
 * Fully blocking status constant - used by HitPoint.
 */
export const FULLY_BLOCKING: BlockingStatus = {
  isCWBlocking: true,
  isCCWBlocking: true,
};

/**
 * Compute blocking contribution from a surface to one of its endpoints.
 *
 * Based on surface orientation (crossProduct) and which endpoint:
 * - CCW surface (cross > 0): start → CCW blocking, end → CW blocking
 * - CW surface (cross < 0): start → CW blocking, end → CCW blocking
 * - Collinear surface (cross = 0): neither blocking
 *
 * @param orientation The surface orientation info (crossProduct)
 * @param which Which endpoint ("start" or "end")
 * @returns BlockingStatus for this endpoint from this surface
 */
export function getEndpointBlockingContribution(
  orientation: OrientationInfo | undefined,
  which: "start" | "end"
): BlockingStatus {
  if (!orientation || orientation.crossProduct === 0) {
    return NON_BLOCKING;
  }

  const isCCW = orientation.crossProduct > 0;

  if (which === "start") {
    // Start endpoint: CCW surface → CCW blocking, CW surface → CW blocking
    return isCCW
      ? { isCWBlocking: false, isCCWBlocking: true }
      : { isCWBlocking: true, isCCWBlocking: false };
  } else {
    // End endpoint: CCW surface → CW blocking, CW surface → CCW blocking
    return isCCW
      ? { isCWBlocking: true, isCCWBlocking: false }
      : { isCWBlocking: false, isCCWBlocking: true };
  }
}

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
   * Optional reference to the continuation ray this point belongs to.
   *
   * Set by projectConeV2 when creating continuation chains.
   * Points not on a continuation ray have this undefined.
   *
   * Used for provenance-based deduplication: consecutive points
   * with the same continuationRay.id can be merged.
   */
  continuationRay?: ContinuationRayRef;

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

  /**
   * Check if this point blocks light from passing through.
   * Used to determine if a continuation ray should be cast.
   *
   * OCP: Each point type implements its own blocking behavior.
   *
   * @param _orientations Pre-computed surface orientations (used by JunctionPoint)
   * @param _windowContext Optional context for window junctions (used by JunctionPoint)
   * @returns true if light is blocked, false if light can pass through
   */
  abstract isBlocking(
    _orientations: Map<string, OrientationInfo>,
    _windowContext?: WindowContext
  ): boolean;

  /**
   * Get surface IDs that should be excluded when casting a ray through this point.
   *
   * OCP: Each point type defines which surfaces to exclude:
   * - Endpoint: excludes its own surface
   * - JunctionPoint: excludes both adjacent surfaces
   * - HitPoint: excludes its hit surface
   * - OriginPoint: excludes nothing (not on any surface)
   *
   * Used by the unified castRay function to skip the target's own surfaces.
   */
  abstract getExcludedSurfaceIds(): string[];

  /**
   * Get directional blocking status for this point.
   *
   * Returns { isCWBlocking, isCCWBlocking } based on the surface orientations.
   * This replaces the single isBlocking() boolean with direction-aware blocking.
   *
   * @param _orientations Pre-computed surface orientations
   * @param _windowContext Optional context for window junctions
   * @returns BlockingStatus with CW and CCW blocking flags
   */
  abstract getBlockingStatus(
    _orientations: Map<string, OrientationInfo>,
    _windowContext?: WindowContext
  ): BlockingStatus;

  /**
   * Get the shadow boundary order for this point.
   *
   * Based on blocking status:
   * - CCW blocking only → positive (far-before-near, entering shadow)
   * - CW blocking only → negative (near-before-far, exiting shadow)
   * - Both or neither → 0 (no clear shadow direction)
   *
   * @param orientations Pre-computed surface orientations
   * @returns Positive for far-before-near, negative for near-before-far, 0 for none
   */
  getShadowBoundaryOrder(
    orientations: Map<string, OrientationInfo>,
    windowContext?: WindowContext
  ): number {
    const status = this.getBlockingStatus(orientations, windowContext);

    if (status.isCCWBlocking && !status.isCWBlocking) {
      return 1; // far-before-near
    }
    if (status.isCWBlocking && !status.isCCWBlocking) {
      return -1; // near-before-far
    }
    return 0; // both or neither
  }
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

  /**
   * OriginPoints never block - they represent window endpoints
   * through which light passes by definition.
   */
  isBlocking(
    _orientations: Map<string, OrientationInfo>,
    _windowContext?: WindowContext
  ): boolean {
    return false;
  }

  /**
   * OriginPoints are not on any surface - exclude nothing.
   */
  getExcludedSurfaceIds(): string[] {
    return [];
  }

  /**
   * OriginPoints have no blocking in either direction.
   */
  getBlockingStatus(
    _orientations: Map<string, OrientationInfo>,
    _windowContext?: WindowContext
  ): BlockingStatus {
    return NON_BLOCKING;
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

  /**
   * Endpoints never block - a continuation ray IS cast from endpoints.
   * The endpoint creates a shadow boundary, but light continues past it
   * via the continuation ray.
   */
  isBlocking(
    _orientations: Map<string, OrientationInfo>,
    _windowContext?: WindowContext
  ): boolean {
    return false;
  }

  /**
   * Exclude this endpoint's surface when casting rays through it.
   */
  getExcludedSurfaceIds(): string[] {
    return [this.surface.id];
  }

  /**
   * Get blocking status from this endpoint's surface orientation.
   *
   * Based on surface orientation and which endpoint:
   * - CCW surface (cross > 0): start → CCW blocking, end → CW blocking
   * - CW surface (cross < 0): start → CW blocking, end → CCW blocking
   * - Collinear surface (cross = 0): neither blocking
   */
  getBlockingStatus(
    orientations: Map<string, OrientationInfo>,
    _windowContext?: WindowContext
  ): BlockingStatus {
    const orientation = orientations.get(this.surface.id);
    return getEndpointBlockingContribution(orientation, this.which);
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
    /** Parameter along the ray (0 = ray.source, 1 = ray.target) */
    readonly t: number,
    /** Parameter along the surface segment (0 = start, 1 = end) */
    readonly s: number
  ) {
    super();
  }

  computeXY(): Vector2 {
    const { source, target } = this.ray;
    return {
      x: source.x + (target.x - source.x) * this.t,
      y: source.y + (target.y - source.y) * this.t,
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
      other instanceof HitPoint && this.hitSurface.id === other.hitSurface.id && this.s === other.s
    );
  }

  getKey(): string {
    return `hit:${this.hitSurface.id}:${this.s}`;
  }

  /**
   * HitPoints always block - a ray hitting a surface in the middle
   * always blocks further light propagation along that ray.
   */
  isBlocking(
    _orientations: Map<string, OrientationInfo>,
    _windowContext?: WindowContext
  ): boolean {
    return true;
  }

  /**
   * Exclude this hit's surface when casting rays through it.
   */
  getExcludedSurfaceIds(): string[] {
    return [this.hitSurface.id];
  }

  /**
   * HitPoints are fully blocking (both CW and CCW).
   * A ray hitting a surface in the middle blocks from all directions.
   */
  getBlockingStatus(
    _orientations: Map<string, OrientationInfo>,
    _windowContext?: WindowContext
  ): BlockingStatus {
    return FULLY_BLOCKING;
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
 * Get the surface ID for a point, if it has one.
 *
 * - Endpoint: returns surface.id
 * - HitPoint: returns hitSurface.id
 * - OriginPoint: returns undefined (not on a surface)
 *
 * Used for provenance-based deduplication of consecutive points on same surface.
 */
export function getSurfaceId(point: SourcePoint): string | undefined {
  if (point instanceof Endpoint) {
    return point.surface.id;
  }
  if (point instanceof HitPoint) {
    return point.hitSurface.id;
  }
  return undefined;
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
