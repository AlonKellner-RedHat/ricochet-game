/**
 * TracePath - Unified path tracing function.
 *
 * Uses RayPropagator + findNextHit to trace a path through surfaces,
 * reflecting both origin and target images through each surface hit.
 *
 * This provides a single, consistent algorithm for:
 * - Actual trajectory calculation
 * - Physics projection (dashed yellow/red paths)
 * - Visibility polygon edge tracing
 *
 * Key properties:
 * - Image-based reflection: Both origin and target images are reflected
 * - Memoized: Uses ReflectionCache for efficient repeated reflections
 * - Mode-aware: Supports "physical" (on-segment only) and "planned" (extended lines)
 * - Provenance: All hit points carry full ray/surface provenance
 */

import type { Vector2, Ray, Segment } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import type { RayPropagator } from "./RayPropagator";
import type { HitDetectionStrategy, StrategyHitResult } from "./HitDetectionStrategy";
import { findNextHit, type HitDetectionMode, type RangeLimitOption } from "@/trajectory-v2/geometry/RayCasting";
import { lineLineIntersection } from "@/trajectory-v2/geometry/GeometryOps";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Options for path tracing.
 */
export interface TraceOptions {
  /** Detection mode: "physical" only hits segments, "planned" hits extended lines */
  readonly mode: "physical" | "planned";
  /** If provided, stop when cursor is reached */
  readonly stopAtCursor?: Vector2;
  /** Surfaces to exclude from hit detection */
  readonly excludeSurfaces?: readonly Surface[];
}

/**
 * A segment of the traced path.
 */
export interface TraceSegment {
  /** Start point of the segment */
  readonly start: Vector2;
  /** End point of the segment */
  readonly end: Vector2;
  /** Surface hit at the end (null for final segment with no hit) */
  readonly surface: Surface | null;
  /** Whether the hit was on the actual segment (true) or extended line (false) */
  readonly onSegment: boolean;
  /** Whether the surface allows reflection */
  readonly canReflect: boolean;
}

/**
 * How the path trace terminated.
 */
export type TerminationType =
  | "cursor"          // Stopped at cursor position
  | "wall"            // Hit a non-reflective surface
  | "off_segment"     // Physical mode hit extended line (not segment)
  | "no_hit";         // No surface intersection found (range limit hit or no surfaces)

/**
 * Result of tracing a path.
 */
export interface TraceResult {
  /** The path segments traced */
  readonly segments: readonly TraceSegment[];
  /** The propagator state after tracing (for continuation) */
  readonly propagator: RayPropagator;
  /** Index of segment containing cursor (-1 if not on path) */
  readonly cursorSegmentIndex: number;
  /** Parametric position of cursor on segment (0-1) */
  readonly cursorT: number;
  /** How the trace terminated */
  readonly terminationType: TerminationType;
}

/**
 * Options for traceWithStrategy.
 *
 * Uses HitDetectionStrategy for hit detection, so mode is determined
 * by the strategy, not passed explicitly.
 */
export interface TraceStrategyOptions {
  /** If provided, stop when cursor is reached */
  readonly stopAtCursor?: Vector2;
  /**
   * If provided, the first segment starts from this position instead of
   * the computed segment start. Use this for continuation after reaching
   * cursor or divergence - same propagator (same origin/target images),
   * but first segment starts from the waypoint position.
   */
  readonly continueFromPosition?: Vector2;
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * Check if a point lies on a line segment and return parametric position.
 * Returns null if point is not on the segment.
 */
function pointOnSegment(
  point: Vector2,
  segStart: Vector2,
  segEnd: Vector2,
  tolerance = 1e-10
): number | null {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // Degenerate segment
    if (point.x === segStart.x && point.y === segStart.y) {
      return 0;
    }
    return null;
  }

  // Project point onto line
  const t = ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lenSq;

  if (t < 0 || t > 1) {
    return null;
  }

  // Check if point is actually on the line
  const projX = segStart.x + t * dx;
  const projY = segStart.y + t * dy;
  const distSq = (point.x - projX) ** 2 + (point.y - projY) ** 2;

  if (distSq > tolerance) {
    return null;
  }

  return t;
}

/**
 * Large constant for ray endpoint when no hit is found.
 * This should never be reached in normal gameplay due to range limits.
 */
const RAY_INFINITY = 100000;

/**
 * Compute endpoint for a ray segment when no hit is found.
 * Uses RAY_INFINITY as the endpoint distance since range limits
 * should terminate the ray before this is needed.
 */
function computeRayEndpoint(
  source: Vector2,
  target: Vector2
): Vector2 {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len === 0) {
    return source;
  }

  return {
    x: source.x + (dx / len) * RAY_INFINITY,
    y: source.y + (dy / len) * RAY_INFINITY,
  };
}

/**
 * Compute the physical start point of a segment.
 * 
 * For the first segment (no startLine), this is the ray source.
 * For subsequent segments, this is where the ray intersects the startLine.
 * 
 * The startLine is the surface we just reflected from. The ray source is
 * the reflected origin image, which is geometrically "behind" the startLine.
 * The physical position is where the ray crosses the startLine.
 */
function computeSegmentStart(ray: Ray, startLine: Segment | null): Vector2 {
  if (!startLine) {
    // First segment - start from ray source (player position)
    return ray.source;
  }

  // Find where the ray intersects the startLine
  const hit = lineLineIntersection(
    ray.source,
    ray.target,
    startLine.start,
    startLine.end
  );

  if (hit.valid && hit.t > 0) {
    return hit.point;
  }

  // Fallback (shouldn't happen with valid startLine)
  return ray.source;
}

/**
 * Trace a path through surfaces using the RayPropagator.
 *
 * This function implements the unified reflection algorithm:
 * 1. Get current ray from propagator (origin image -> target image)
 * 2. Find next hit using findNextHit
 * 3. Add segment from current position to hit point
 * 4. If reflective and appropriate mode, reflect propagator and continue
 * 5. Otherwise, terminate with appropriate reason
 *
 * @param propagator Initial propagator state (origin and target images)
 * @param surfaces Surfaces to check for intersection
 * @param options Tracing options (mode, limits, etc.)
 * @returns TraceResult with segments and final propagator state
 */
export function tracePath(
  propagator: RayPropagator,
  surfaces: readonly Surface[],
  options: TraceOptions
): TraceResult {
  const {
    mode,
    stopAtCursor,
    excludeSurfaces = [],
  } = options;

  const segments: TraceSegment[] = [];
  let currentPropagator = propagator;
  let cursorSegmentIndex = -1;
  let cursorT = 0;
  let terminationType: TerminationType = "no_hit";
  
  // Safety iteration limit to prevent infinite loops in edge cases
  // Normal termination is via: cursor reached, wall hit, off-segment, or no hit (range limit)
  const MAX_SAFETY_ITERATIONS = 1000;
  let iterations = 0;

  while (iterations < MAX_SAFETY_ITERATIONS) {
    iterations++;
    const ray = currentPropagator.getRay();
    const state = currentPropagator.getState();

    // Compute the physical start of this segment.
    // For the first segment, this is the ray source (player position).
    // For subsequent segments, this is where the ray intersects the startLine
    // (the surface we just reflected from).
    const segmentStart = computeSegmentStart(ray, state.startLine);

    // Find next hit using the image-based ray with startLine for hit detection.
    // The startLine ensures we only detect hits PAST the reflection point,
    // even though the ray source (reflected origin image) is geometrically
    // "behind" that point.
    const hit = findNextHit(ray, surfaces, {
      mode,
      excludeSurfaces,
      startLine: state.startLine ?? undefined,
      startLineSurface: state.lastSurface ?? undefined,
    });

    // Check for cursor on this segment before processing hit
    if (stopAtCursor) {
      let segmentEnd: Vector2;
      if (hit) {
        segmentEnd = hit.hitPoint.computeXY();
      } else {
        segmentEnd = computeRayEndpoint(segmentStart, ray.target);
      }

      const cursorPos = pointOnSegment(stopAtCursor, segmentStart, segmentEnd);
      if (cursorPos !== null) {
        // Cursor is on this segment
        cursorSegmentIndex = segments.length;
        cursorT = cursorPos;

        // Stop at cursor
        segments.push({
          start: segmentStart,
          end: stopAtCursor,
          surface: null,
          onSegment: true,
          canReflect: false,
        });

        terminationType = "cursor";
        return {
          segments,
          propagator: currentPropagator,
          cursorSegmentIndex,
          cursorT,
          terminationType,
        };
      }
    }

    if (!hit) {
      // No hit - add final segment and terminate
      const endpoint = computeRayEndpoint(segmentStart, ray.target);
      segments.push({
        start: segmentStart,
        end: endpoint,
        surface: null,
        onSegment: true,
        canReflect: false,
      });

      terminationType = "no_hit";
      break;
    }

    // Add segment to hit point
    const hitPoint = hit.hitPoint.computeXY();
    segments.push({
      start: segmentStart,
      end: hitPoint,
      surface: hit.hitPoint.hitSurface,
      onSegment: hit.onSegment,
      canReflect: hit.canReflect,
    });

    // Check termination conditions
    if (!hit.canReflect) {
      terminationType = "wall";
      break;
    }

    if (mode === "physical" && !hit.onSegment) {
      // In physical mode, off-segment hits terminate
      terminationType = "off_segment";
      break;
    }

    // Reflect propagator - this automatically sets startLine to surface.segment
    currentPropagator = currentPropagator.reflectThrough(hit.hitPoint.hitSurface);
  }

  return {
    segments,
    propagator: currentPropagator,
    cursorSegmentIndex,
    cursorT,
    terminationType,
  };
}

// =============================================================================
// STRATEGY HELPERS
// =============================================================================

/**
 * Internal cache for strategy surfaces.
 * This is a workaround to get surfaces from a strategy for minT-based hit detection.
 */
const strategyToSurfaces = new WeakMap<HitDetectionStrategy, readonly Surface[]>();

/**
 * Register surfaces for a strategy. Called by strategy factory functions.
 */
export function registerStrategySurfaces(
  strategy: HitDetectionStrategy,
  surfaces: readonly Surface[]
): void {
  strategyToSurfaces.set(strategy, surfaces);
}

/**
 * Get surfaces from a strategy.
 */
function getAllSurfacesFromStrategy(
  strategy: HitDetectionStrategy
): readonly Surface[] | null {
  return strategyToSurfaces.get(strategy) ?? null;
}

/**
 * Find next hit with a minimum t value.
 * This is used when continueFromPosition is set and we need to skip hits before it.
 */
function findNextHitWithMinT(
  ray: Ray,
  surfaces: readonly Surface[],
  mode: HitDetectionMode,
  minT: number,
  startLine?: Segment,
  startLineSurface?: Surface,
  rangeLimit?: RangeLimitOption
): StrategyHitResult | null {
  const result = findNextHit(ray, surfaces, {
    mode,
    minT,
    startLine,
    startLineSurface,
    rangeLimit,
  });

  if (!result) {
    return null;
  }

  const point = result.hitPoint.computeXY();

  return {
    point,
    surface: result.hitPoint.hitSurface,
    onSegment: result.onSegment,
    canReflect: result.canReflect,
    hitPoint: result.hitPoint,
    hitType: result.hitType,
  };
}

// =============================================================================
// STRATEGY-BASED TRACING
// =============================================================================

/**
 * Trace a path using a HitDetectionStrategy.
 *
 * This is the ONE shared loop for all path types. The strategy determines:
 * - Which surfaces to check
 * - Whether off-segment hits count
 * - Whether reflection is allowed
 *
 * The loop logic is identical regardless of strategy:
 * 1. Ask strategy for next hit
 * 2. If no hit, add final segment and stop
 * 3. If hit, add segment and check reflection eligibility
 * 4. If can reflect, reflect propagator and continue
 * 5. Otherwise, stop
 *
 * @param propagator Initial propagator state
 * @param strategy Hit detection strategy (physical or planned)
 * @param options Tracing options
 * @returns TraceResult with segments and final propagator state
 */
export function traceWithStrategy(
  propagator: RayPropagator,
  strategy: HitDetectionStrategy,
  options: TraceStrategyOptions
): TraceResult {
  const {
    stopAtCursor,
    continueFromPosition,
  } = options;

  const segments: TraceSegment[] = [];
  let currentPropagator = propagator;
  let cursorSegmentIndex = -1;
  let cursorT = 0;
  let terminationType: TerminationType = "no_hit";
  let isFirstIteration = true;

  // Safety iteration limit to prevent infinite loops in edge cases
  // Normal termination is via: cursor reached, wall hit, off-segment, or no hit (range limit)
  const MAX_SAFETY_ITERATIONS = 1000;
  let iterations = 0;

  while (iterations < MAX_SAFETY_ITERATIONS) {
    iterations++;
    const ray = currentPropagator.getRay();
    const state = currentPropagator.getState();

    // Compute the physical start of this segment.
    // For the first segment with continueFromPosition, use that position instead
    // of the computed segment start. This allows continuation from a mid-segment
    // waypoint (like cursor) without creating a new propagator.
    const segmentStart = (isFirstIteration && continueFromPosition)
      ? continueFromPosition
      : computeSegmentStart(ray, state.startLine);

    // Use strategy to find next hit.
    // For the first segment with continueFromPosition, we need to find hits
    // AFTER continueFromPosition. We do this by computing the minT for
    // continueFromPosition and only accepting hits past that point.
    let hit = strategy.findNextHit(currentPropagator);

    // If continueFromPosition is set for the first segment, filter hits
    if (isFirstIteration && continueFromPosition && hit) {
      // Compute t of continueFromPosition on the ray
      const dx = ray.target.x - ray.source.x;
      const dy = ray.target.y - ray.source.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq > 0) {
        const continueT = ((continueFromPosition.x - ray.source.x) * dx +
                           (continueFromPosition.y - ray.source.y) * dy) / lenSq;
        
        // If the hit is before or at continueFromPosition, we need to find
        // the next hit. We do this by calling findNextHit directly with minT.
        if (hit.hitPoint.t <= continueT + 1e-10) {
          // Find next hit with minT > continueT
          // Use the underlying findNextHit from RayCasting which supports minT
          const allSurfaces = getAllSurfacesFromStrategy(strategy);
          if (allSurfaces) {
            // Build range limit option if strategy has one
            const rangeLimitPair = strategy.getRangeLimitPair?.();
            const rangeLimitOption: RangeLimitOption | undefined = rangeLimitPair
              ? { pair: rangeLimitPair, center: state.originImage }
              : undefined;
            
            const nextHit = findNextHitWithMinT(
              ray,
              allSurfaces,
              strategy.mode,
              continueT + 1e-10,
              state.startLine ?? undefined,
              state.lastSurface ?? undefined,
              rangeLimitOption
            );
            hit = nextHit;
          } else {
            hit = null;
          }
        }
      }
    }

    // Mark first iteration as complete
    isFirstIteration = false;

    // Check for cursor on this segment before processing hit
    if (stopAtCursor) {
      let segmentEnd: Vector2;
      if (hit) {
        segmentEnd = hit.point;
      } else {
        segmentEnd = computeRayEndpoint(segmentStart, ray.target);
      }

      const cursorPos = pointOnSegment(stopAtCursor, segmentStart, segmentEnd);
      if (cursorPos !== null) {
        // Cursor is on this segment
        cursorSegmentIndex = segments.length;
        cursorT = cursorPos;

        // Stop at cursor
        segments.push({
          start: segmentStart,
          end: stopAtCursor,
          surface: null,
          onSegment: true,
          canReflect: false,
        });

        terminationType = "cursor";
        return {
          segments,
          propagator: currentPropagator,
          cursorSegmentIndex,
          cursorT,
          terminationType,
        };
      }
    }

    if (!hit) {
      // No hit - add final segment and terminate
      const endpoint = computeRayEndpoint(segmentStart, ray.target);
      segments.push({
        start: segmentStart,
        end: endpoint,
        surface: null,
        onSegment: true,
        canReflect: false,
      });

      terminationType = "no_hit";
      break;
    }

    // Add segment to hit point
    segments.push({
      start: segmentStart,
      end: hit.point,
      surface: hit.surface,
      onSegment: hit.onSegment,
      canReflect: hit.canReflect,
    });

    // Check termination conditions
    // This includes range limit hits (surface is null) and walls
    if (!hit.canReflect || !hit.surface) {
      terminationType = "wall";
      break;
    }

    // In physical mode, off-segment hits terminate
    if (strategy.mode === "physical" && !hit.onSegment) {
      terminationType = "off_segment";
      break;
    }

    // Reflect propagator (surface is guaranteed non-null here)
    currentPropagator = currentPropagator.reflectThrough(hit.surface);
  }

  return {
    segments,
    propagator: currentPropagator,
    cursorSegmentIndex,
    cursorT,
    terminationType,
  };
}
