/**
 * RayCasting - Unified Ray Casting Module
 *
 * This module provides shared ray casting primitives for both the trajectory
 * system and visibility polygon calculations. It uses SourcePoint types for
 * provenance tracking and supports SurfaceChain for junction handling.
 *
 * Design Principles:
 * - Exact arithmetic: No epsilons, no tolerance-based comparisons
 * - Provenance: Results carry source information via SourcePoint types
 * - Unified: Same functions used by trajectory and visibility systems
 *
 * First Principles:
 * - Ray = two points (from, to) - direction is implicit
 * - Hit results preserve which surface and where on it
 * - JunctionPoints are handled via SurfaceChain
 */

import type { Surface } from "@/surfaces/Surface";
import { lineLineIntersection } from "./GeometryOps";
import { HitPoint, type SourcePoint, Endpoint, OriginPoint } from "./SourcePoint";
import type { SurfaceChain, JunctionPoint } from "./SurfaceChain";
import type { Ray, Vector2, Segment } from "./types";

// Re-export Segment for backward compatibility
export type { Segment };

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of finding the closest hit on a ray.
 */
export interface ClosestHitResult {
  readonly surface: Surface;
  readonly point: Vector2;
  readonly t: number; // Parameter along ray (0 = from, 1 = to)
  readonly s: number; // Parameter along surface (0 = start, 1 = end)
}

/**
 * Full ray hit result with provenance.
 */
export interface RayHitResult {
  readonly hitPoint: HitPoint;
  readonly canReflect: boolean;
  readonly incomingDirection: Vector2;
}

/**
 * Options for ray casting.
 */
export interface RayCastOptions {
  /** Surface IDs to exclude from hit detection */
  readonly excludeIds?: Set<string>;
  /** Minimum t value (hits before this are ignored) */
  readonly minT?: number;
  /** Maximum distance to cast (optional) */
  readonly maxDistance?: number;
}

/**
 * Hit detection mode for findNextHit.
 * - "physical": Only detect hits on actual surface segments (s in [0, 1])
 * - "planned": Detect hits on extended lines (for trajectory planning)
 */
export type HitDetectionMode = "physical" | "planned";

/**
 * Options for unified hit detection.
 */
export interface UnifiedHitOptions {
  /** Detection mode (default: "physical") */
  readonly mode?: HitDetectionMode;
  /** Surfaces to exclude from detection */
  readonly excludeSurfaces?: readonly Surface[];
  /** Minimum t value (hits before this are ignored) */
  readonly minT?: number;
  /**
   * The startLine for hit detection.
   * 
   * When provided, the effective minT is calculated as the t value where
   * the ray intersects this line. This ensures hits are only detected
   * PAST the startLine, not between the ray source and the startLine.
   * 
   * This is used after reflections: the ray source is the reflected origin
   * image (geometrically behind the reflection surface), but we only want
   * hits past the reflection surface.
   */
  readonly startLine?: Segment;
  /**
   * The surface corresponding to the startLine.
   * 
   * When provided, this surface is automatically excluded from hit detection.
   * This provides full provenance: we know which surface the ray started from
   * and can exclude it without needing to pass it in excludeSurfaces.
   */
  readonly startLineSurface?: Surface;
}

/**
 * Result of unified hit detection.
 */
export interface UnifiedHitResult {
  /** The hit point with full provenance */
  readonly hitPoint: HitPoint;
  /** Whether the hit is on the actual segment (true) or extended line (false) */
  readonly onSegment: boolean;
  /** Whether the surface allows reflection */
  readonly canReflect: boolean;
}

// =============================================================================
// CORE RAY CASTING
// =============================================================================

/**
 * Check if two points are exactly equal (same coordinates).
 */
export function pointsEqual(a: Vector2, b: Vector2): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Find the closest hit on a ray against a list of surfaces.
 *
 * @param ray The ray to cast (from, to)
 * @param surfaces Surfaces to check for intersection
 * @param options Ray casting options
 * @returns The closest hit, or null if no intersection
 */
export function findClosestHit(
  ray: Ray,
  surfaces: readonly Surface[],
  options: RayCastOptions = {}
): ClosestHitResult | null {
  const { excludeIds, minT = 0 } = options;

  let closest: ClosestHitResult | null = null;
  let closestT = Number.POSITIVE_INFINITY;

  for (const surface of surfaces) {
    // Skip excluded surfaces
    if (excludeIds?.has(surface.id)) {
      continue;
    }

    const hit = lineLineIntersection(
      ray.source,
      ray.target,
      surface.segment.start,
      surface.segment.end
    );

    // Valid hit: in forward direction (t > minT) and on segment (s in [0,1])
    if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
      closestT = hit.t;
      closest = {
        surface,
        point: hit.point,
        t: hit.t,
        s: hit.s,
      };
    }
  }

  return closest;
}

/**
 * Find the next hit on a ray against surfaces.
 *
 * Supports two modes:
 * - "physical": Only detect hits on actual surface segments (s in [0, 1])
 * - "planned": Detect hits on extended lines (for trajectory planning)
 *
 * Returns a UnifiedHitResult with:
 * - hitPoint: HitPoint with full provenance (ray, surface, t, s)
 * - onSegment: Whether the hit is on the actual segment
 * - canReflect: Whether the surface allows reflection
 *
 * @param ray The ray to cast
 * @param surfaces Surfaces to check for intersection
 * @param options Unified hit detection options
 * @returns The closest hit, or null if no intersection
 */
export function findNextHit(
  ray: Ray,
  surfaces: readonly Surface[],
  options: UnifiedHitOptions = {}
): UnifiedHitResult | null {
  const { 
    mode = "physical", 
    excludeSurfaces = [], 
    minT: providedMinT = 0,
    startLine,
    startLineSurface,
  } = options;

  // Build exclude set for quick lookup
  // Automatically include startLineSurface if provided
  const excludeIds = new Set(excludeSurfaces.map((s) => s.id));
  if (startLineSurface) {
    excludeIds.add(startLineSurface.id);
  }

  // Calculate effective minT from startLine
  // The startLine is the surface we just reflected from. We need to find
  // where the ray intersects this line and only detect hits past that point.
  let effectiveMinT = providedMinT;
  if (startLine) {
    const startLineHit = lineLineIntersection(
      ray.source,
      ray.target,
      startLine.start,
      startLine.end
    );
    // If the ray intersects the startLine going forward, use that as minT
    if (startLineHit.valid && startLineHit.t > 0) {
      effectiveMinT = Math.max(effectiveMinT, startLineHit.t);
    }
  }

  let closest: {
    surface: Surface;
    t: number;
    s: number;
    point: Vector2;
    onSegment: boolean;
  } | null = null;
  let closestT = Number.POSITIVE_INFINITY;

  for (const surface of surfaces) {
    // Skip excluded surfaces
    if (excludeIds.has(surface.id)) {
      continue;
    }

    const hit = lineLineIntersection(
      ray.source,
      ray.target,
      surface.segment.start,
      surface.segment.end
    );

    // Skip if no valid intersection or behind the effective start point
    if (!hit.valid || hit.t <= effectiveMinT) {
      continue;
    }

    const onSegment = hit.s >= 0 && hit.s <= 1;

    // In physical mode, only accept on-segment hits
    if (mode === "physical" && !onSegment) {
      continue;
    }

    // Track closest hit
    if (hit.t < closestT) {
      closestT = hit.t;
      closest = {
        surface,
        t: hit.t,
        s: hit.s,
        point: hit.point,
        onSegment,
      };
    }
  }

  if (!closest) {
    return null;
  }

  // Compute direction for reflection check
  const dx = ray.target.x - ray.source.x;
  const dy = ray.target.y - ray.source.y;
  const direction = { x: dx, y: dy };

  // Create HitPoint with provenance
  const hitPoint = new HitPoint(ray, closest.surface, closest.t, closest.s);

  return {
    hitPoint,
    onSegment: closest.onSegment,
    canReflect: closest.surface.canReflectFrom(direction),
  };
}

/**
 * Find the closest hit on a ray against SurfaceChains.
 * Extracts surfaces from chains for intersection testing.
 *
 * @param ray The ray to cast
 * @param chains SurfaceChains containing obstacles
 * @param options Ray casting options
 * @returns The closest hit, or null if no intersection
 */
export function findClosestHitInChains(
  ray: Ray,
  chains: readonly SurfaceChain[],
  options: RayCastOptions = {}
): ClosestHitResult | null {
  const allSurfaces: Surface[] = [];
  for (const chain of chains) {
    allSurfaces.push(...chain.getSurfaces());
  }
  return findClosestHit(ray, allSurfaces, options);
}

/**
 * Cast a ray and return a HitPoint with provenance.
 *
 * @param origin Ray origin
 * @param target Ray target (direction)
 * @param surfaces Surfaces to check
 * @param options Ray casting options
 * @returns HitPoint if hit, null otherwise
 */
export function castRay(
  origin: Vector2,
  target: Vector2,
  surfaces: readonly Surface[],
  options: RayCastOptions = {}
): HitPoint | null {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return null;

  // Extend ray beyond target for intersection testing
  const scale = 10;
  const rayEnd = { x: origin.x + dx * scale, y: origin.y + dy * scale };
  const ray: Ray = { source: origin, target: rayEnd };

  // Adjust minT for the scaled ray
  const minT = (options.minT ?? 0) / scale;

  const hit = findClosestHit(ray, surfaces, { ...options, minT });

  if (hit) {
    return new HitPoint(ray, hit.surface, hit.t, hit.s);
  }

  return null;
}

/**
 * Cast a ray through SurfaceChains and return a HitPoint.
 *
 * @param origin Ray origin
 * @param target Ray target (direction)
 * @param chains SurfaceChains to check
 * @param options Ray casting options
 * @returns HitPoint if hit, null otherwise
 */
export function castRayInChains(
  origin: Vector2,
  target: Vector2,
  chains: readonly SurfaceChain[],
  options: RayCastOptions = {}
): HitPoint | null {
  const allSurfaces: Surface[] = [];
  for (const chain of chains) {
    allSurfaces.push(...chain.getSurfaces());
  }
  return castRay(origin, target, allSurfaces, options);
}

// =============================================================================
// ENDPOINT-TARGETED RAY CASTING
// =============================================================================

/**
 * Cast a ray to an Endpoint target.
 * If the ray reaches the endpoint without obstruction, returns the Endpoint.
 * If obstructed, returns a HitPoint on the obstructing surface.
 *
 * @param origin Ray origin
 * @param targetEndpoint The endpoint to target
 * @param surfaces Surfaces to check for obstruction
 * @param options Ray casting options
 * @returns SourcePoint (Endpoint or HitPoint)
 */
export function castRayToEndpoint(
  origin: Vector2,
  targetEndpoint: Endpoint,
  surfaces: readonly Surface[],
  options: RayCastOptions = {}
): SourcePoint | null {
  const target = targetEndpoint.computeXY();
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return null;

  const scale = 10;
  const rayEnd = { x: origin.x + dx * scale, y: origin.y + dy * scale };
  const ray: Ray = { source: origin, target: rayEnd };

  const targetT = 1 / scale;
  const minT = (options.minT ?? 0) / scale;

  let closestT = targetT;
  let closestSurface: Surface | null = null;
  let closestS = 0;

  const excludeIds = options.excludeIds ?? new Set<string>();

  for (const surface of surfaces) {
    // Skip excluded surfaces and the endpoint's own surface
    if (excludeIds.has(surface.id)) continue;
    if (surface.id === targetEndpoint.surface.id) continue;

    const hit = lineLineIntersection(
      origin,
      rayEnd,
      surface.segment.start,
      surface.segment.end
    );

    if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
      closestT = hit.t;
      closestSurface = surface;
      closestS = hit.s;
    }
  }

  if (closestSurface) {
    return new HitPoint(ray, closestSurface, closestT, closestS);
  }

  return targetEndpoint;
}

/**
 * Cast a ray to an Endpoint through SurfaceChains.
 */
export function castRayToEndpointInChains(
  origin: Vector2,
  targetEndpoint: Endpoint,
  chains: readonly SurfaceChain[],
  options: RayCastOptions = {}
): SourcePoint | null {
  const allSurfaces: Surface[] = [];
  for (const chain of chains) {
    allSurfaces.push(...chain.getSurfaces());
  }
  return castRayToEndpoint(origin, targetEndpoint, allSurfaces, options);
}

// =============================================================================
// CONTINUATION RAYS
// =============================================================================

/**
 * Cast a continuation ray through an Endpoint.
 * This ray starts AT the endpoint (not before) and finds what's beyond.
 *
 * @param origin Ray origin
 * @param throughEndpoint The endpoint the ray passes through
 * @param surfaces Surfaces to check (endpoint's surface is excluded)
 * @param options Ray casting options
 * @returns HitPoint on the surface beyond, or null
 */
export function castContinuationRay(
  origin: Vector2,
  throughEndpoint: Endpoint,
  surfaces: readonly Surface[],
  options: RayCastOptions = {}
): HitPoint | null {
  const target = throughEndpoint.computeXY();
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return null;

  const scale = 10;
  const rayEnd = { x: origin.x + dx * scale, y: origin.y + dy * scale };
  const ray: Ray = { source: origin, target: rayEnd };

  // Start from the endpoint
  const endpointT = 1 / scale;
  const minT = Math.max((options.minT ?? 0) / scale, endpointT);

  let closestT = Number.POSITIVE_INFINITY;
  let closestSurface: Surface | null = null;
  let closestS = 0;

  const excludeIds = options.excludeIds ?? new Set<string>();

  for (const surface of surfaces) {
    // Skip excluded surfaces and the endpoint's own surface
    if (excludeIds.has(surface.id)) continue;
    if (surface.id === throughEndpoint.surface.id) continue;

    const hit = lineLineIntersection(
      origin,
      rayEnd,
      surface.segment.start,
      surface.segment.end
    );

    if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
      closestT = hit.t;
      closestSurface = surface;
      closestS = hit.s;
    }
  }

  if (closestSurface) {
    return new HitPoint(ray, closestSurface, closestT, closestS);
  }

  return null;
}

/**
 * Cast a continuation ray through a JunctionPoint.
 * Excludes BOTH surfaces at the junction.
 *
 * @param origin Ray origin
 * @param junction The junction the ray passes through
 * @param surfaces Surfaces to check
 * @param options Ray casting options
 * @returns HitPoint on the surface beyond, or null
 */
export function castContinuationRayForJunction(
  origin: Vector2,
  junction: JunctionPoint,
  surfaces: readonly Surface[],
  options: RayCastOptions = {}
): HitPoint | null {
  const target = junction.computeXY();
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return null;

  const scale = 10;
  const rayEnd = { x: origin.x + dx * scale, y: origin.y + dy * scale };
  const ray: Ray = { source: origin, target: rayEnd };

  const junctionT = 1 / scale;
  const minT = Math.max((options.minT ?? 0) / scale, junctionT);

  // Get both surfaces at the junction
  const surfaceBeforeId = junction.getSurfaceBefore()?.id;
  const surfaceAfterId = junction.getSurfaceAfter()?.id;

  let closestT = Number.POSITIVE_INFINITY;
  let closestSurface: Surface | null = null;
  let closestS = 0;

  const excludeIds = options.excludeIds ?? new Set<string>();

  for (const surface of surfaces) {
    // Skip excluded surfaces and both junction surfaces
    if (excludeIds.has(surface.id)) continue;
    if (surface.id === surfaceBeforeId || surface.id === surfaceAfterId) continue;

    const hit = lineLineIntersection(
      origin,
      rayEnd,
      surface.segment.start,
      surface.segment.end
    );

    if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
      closestT = hit.t;
      closestSurface = surface;
      closestS = hit.s;
    }
  }

  if (closestSurface) {
    return new HitPoint(ray, closestSurface, closestT, closestS);
  }

  return null;
}

// =============================================================================
// TRAJECTORY-SPECIFIC RAY CASTING
// =============================================================================

/**
 * Cast a ray forward for trajectory physics.
 * Similar to the old raycastForward but uses RayCasting primitives.
 *
 * @param from Starting point
 * @param direction Direction to cast (doesn't need to be normalized)
 * @param surfaces All surfaces to check
 * @param excludeSurfaces Surfaces to skip (e.g., surface we just reflected off)
 * @param maxDistance Maximum distance to cast
 * @returns RayHitResult with HitPoint and reflection info
 */
export function raycastForwardWithProvenance(
  from: Vector2,
  direction: Vector2,
  surfaces: readonly Surface[],
  excludeSurfaces: readonly Surface[] = [],
  maxDistance = 10000
): RayHitResult | null {
  // Create ray endpoint far in the direction
  const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
  if (len === 0) return null;

  const normalizedDir = { x: direction.x / len, y: direction.y / len };
  const rayTarget: Vector2 = {
    x: from.x + normalizedDir.x * maxDistance,
    y: from.y + normalizedDir.y * maxDistance,
  };

  const ray: Ray = { source: from, target: rayTarget };

  // Build exclude set
  const excludeIds = new Set<string>();
  for (const s of excludeSurfaces) {
    excludeIds.add(s.id);
  }

  const hit = findClosestHit(ray, surfaces, { excludeIds });

  if (hit) {
    const hitPoint = new HitPoint(ray, hit.surface, hit.t, hit.s);
    const canReflect = hit.surface.canReflectFrom(direction);

    return {
      hitPoint,
      canReflect,
      incomingDirection: direction,
    };
  }

  return null;
}

/**
 * Cast a ray forward through SurfaceChains.
 */
export function raycastForwardInChains(
  from: Vector2,
  direction: Vector2,
  chains: readonly SurfaceChain[],
  excludeSurfaces: readonly Surface[] = [],
  maxDistance = 10000
): RayHitResult | null {
  const allSurfaces: Surface[] = [];
  for (const chain of chains) {
    allSurfaces.push(...chain.getSurfaces());
  }
  return raycastForwardWithProvenance(from, direction, allSurfaces, excludeSurfaces, maxDistance);
}

// =============================================================================
// WINDOW-BASED RAY CASTING
// =============================================================================

/**
 * Cast a ray that must pass through a window (line segment).
 * Returns null if the ray doesn't pass through the window.
 *
 * @param origin Ray origin
 * @param target Ray target
 * @param window Window segment the ray must pass through
 * @param surfaces Surfaces to check for obstruction
 * @param options Ray casting options
 * @returns HitPoint if hit after window, null otherwise
 */
export function castRayThroughWindow(
  origin: Vector2,
  target: Vector2,
  window: Segment,
  surfaces: readonly Surface[],
  options: RayCastOptions = {}
): HitPoint | null {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return null;

  const scale = 10;
  const rayEnd = { x: origin.x + dx * scale, y: origin.y + dy * scale };
  const ray: Ray = { source: origin, target: rayEnd };

  // Check if ray passes through window
  const windowHit = lineLineIntersection(origin, rayEnd, window.start, window.end);
  if (!windowHit.valid || windowHit.s < 0 || windowHit.s > 1 || windowHit.t <= 0) {
    return null;
  }

  const minT = windowHit.t;
  const excludeIds = options.excludeIds ?? new Set<string>();

  let closestT = Number.POSITIVE_INFINITY;
  let closestSurface: Surface | null = null;
  let closestS = 0;

  for (const surface of surfaces) {
    if (excludeIds.has(surface.id)) continue;

    const hit = lineLineIntersection(
      origin,
      rayEnd,
      surface.segment.start,
      surface.segment.end
    );

    if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
      closestT = hit.t;
      closestSurface = surface;
      closestS = hit.s;
    }
  }

  if (closestSurface) {
    return new HitPoint(ray, closestSurface, closestT, closestS);
  }

  return null;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Extract all surfaces from a list of SurfaceChains.
 */
export function extractSurfacesFromChains(
  chains: readonly SurfaceChain[]
): Surface[] {
  const surfaces: Surface[] = [];
  for (const chain of chains) {
    surfaces.push(...chain.getSurfaces());
  }
  return surfaces;
}

/**
 * Create an OriginPoint from a Vector2.
 */
export function toOriginPoint(v: Vector2): OriginPoint {
  return new OriginPoint(v);
}

/**
 * Convert SourcePoint array to Vector2 array.
 * Already exists in ConeProjectionV2 but included here for convenience.
 */
export function toVector2Array(points: readonly SourcePoint[]): Vector2[] {
  return points.map((p) => p.computeXY());
}
