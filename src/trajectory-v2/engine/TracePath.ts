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

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import type { RayPropagator } from "./RayPropagator";
import { findNextHit } from "@/trajectory-v2/geometry/RayCasting";

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
  /** Maximum number of reflections (default: 10) */
  readonly maxReflections?: number;
  /** Maximum distance to trace (default: 10000) */
  readonly maxDistance?: number;
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
  | "max_reflections" // Reached max reflection limit
  | "no_hit";         // No surface intersection found

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
 * Compute endpoint for a ray segment when no hit is found.
 */
function computeRayEndpoint(
  source: Vector2,
  target: Vector2,
  maxDistance: number
): Vector2 {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len === 0) {
    return source;
  }

  return {
    x: source.x + (dx / len) * maxDistance,
    y: source.y + (dy / len) * maxDistance,
  };
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
    maxReflections = 10,
    maxDistance = 10000,
    excludeSurfaces = [],
  } = options;

  const segments: TraceSegment[] = [];
  let currentPropagator = propagator;
  let cursorSegmentIndex = -1;
  let cursorT = 0;
  let terminationType: TerminationType = "no_hit";

  // Track surfaces to exclude (starts with provided list, adds last hit surface)
  let currentExcludeSurfaces = [...excludeSurfaces];

  for (let i = 0; i < maxReflections; i++) {
    const ray = currentPropagator.getRay();
    const state = currentPropagator.getState();

    // Add last surface to exclude list to prevent immediate re-hit
    if (state.lastSurface && !currentExcludeSurfaces.includes(state.lastSurface)) {
      currentExcludeSurfaces = [state.lastSurface];
    } else if (i === 0) {
      currentExcludeSurfaces = [...excludeSurfaces];
    }

    // Find next hit
    const hit = findNextHit(ray, surfaces, {
      mode,
      excludeSurfaces: currentExcludeSurfaces,
      minT: 0,
    });

    // Compute segment start (ray source)
    const segmentStart = ray.source;

    // Check for cursor on this segment before processing hit
    if (stopAtCursor) {
      let segmentEnd: Vector2;
      if (hit) {
        segmentEnd = hit.hitPoint.computeXY();
      } else {
        segmentEnd = computeRayEndpoint(ray.source, ray.target, maxDistance);
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
      const endpoint = computeRayEndpoint(ray.source, ray.target, maxDistance);
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

    // Reflect propagator and continue
    currentPropagator = currentPropagator.reflectThrough(hit.hitPoint.hitSurface);
  }

  // Check if we exhausted reflections
  if (segments.length === 0 || terminationType === "no_hit") {
    // Already handled
  } else if (
    terminationType !== "wall" &&
    terminationType !== "off_segment" &&
    terminationType !== "cursor"
  ) {
    // Must have hit max reflections
    terminationType = "max_reflections";
  }

  return {
    segments,
    propagator: currentPropagator,
    cursorSegmentIndex,
    cursorT,
    terminationType,
  };
}
