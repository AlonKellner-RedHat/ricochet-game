/**
 * Shared helpers for path invariants.
 *
 * These helpers ensure both physical and planned invariants use the
 * exact same initial ray and bypass detection logic.
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import type { TraceSegment } from "@/trajectory-v2/engine/TracePath";
import { evaluateBypass } from "@/trajectory-v2/engine/BypassEvaluator";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";

/** Tolerance for point comparison */
export const POINT_TOLERANCE = 2;

/**
 * Check if two points are approximately equal.
 */
export function pointsEqual(a: Vector2, b: Vector2): boolean {
  return Math.abs(a.x - b.x) < POINT_TOLERANCE && Math.abs(a.y - b.y) < POINT_TOLERANCE;
}

/**
 * Result of combined bypass detection and pre-reflection.
 */
export interface PreReflectionResult {
  /** The pre-reflected cursor (through non-bypassed surfaces only) */
  readonly preReflectedCursor: Vector2;
  /** Surfaces that are NOT bypassed (will be hit) */
  readonly nonBypassedSurfaces: readonly Surface[];
  /** IDs of surfaces that are bypassed */
  readonly bypassedIds: ReadonlySet<string>;
}

/**
 * Detect bypassed surfaces AND pre-reflect cursor in a single pass.
 *
 * Bypass detection happens DURING pre-reflection: as we reflect through
 * each surface, we check if that reflection is valid. If not, the surface
 * is bypassed and skipped in the reflection.
 *
 * Uses the existing BypassEvaluator to determine which surfaces
 * will actually be hit during trajectory calculation.
 */
export function detectBypassAndPreReflect(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[]
): PreReflectionResult {
  // Use BypassEvaluator to determine which surfaces are active
  const bypassResult = evaluateBypass(player, cursor, plannedSurfaces, allSurfaces);

  const bypassedIds = new Set<string>(
    bypassResult.bypassedSurfaces.map(b => b.surface.id)
  );

  const nonBypassedSurfaces = bypassResult.activeSurfaces;

  // Pre-reflect cursor through non-bypassed surfaces only (in reverse order)
  let preReflectedCursor = cursor;
  for (let i = nonBypassedSurfaces.length - 1; i >= 0; i--) {
    const surface = nonBypassedSurfaces[i]!;
    preReflectedCursor = reflectPointThroughLine(
      preReflectedCursor,
      surface.segment.start,
      surface.segment.end
    );
  }

  return {
    preReflectedCursor,
    nonBypassedSurfaces,
    bypassedIds,
  };
}

// Keep the old functions for backward compatibility
export function detectBypassedSurfaces(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[]
): { nonBypassedSurfaces: readonly Surface[]; bypassedIds: ReadonlySet<string> } {
  const result = detectBypassAndPreReflect(player, cursor, plannedSurfaces, allSurfaces);
  return {
    nonBypassedSurfaces: result.nonBypassedSurfaces,
    bypassedIds: result.bypassedIds,
  };
}

export function preReflectCursorThroughNonBypassed(
  cursor: Vector2,
  nonBypassedSurfaces: readonly Surface[]
): Vector2 {
  if (nonBypassedSurfaces.length === 0) {
    return cursor;
  }

  // Reflect in reverse order (last surface first)
  let reflected = cursor;
  for (let i = nonBypassedSurfaces.length - 1; i >= 0; i--) {
    const surface = nonBypassedSurfaces[i]!;
    reflected = reflectPointThroughLine(
      reflected,
      surface.segment.start,
      surface.segment.end
    );
  }
  return reflected;
}

/**
 * Truncate segments at the cursor position.
 *
 * Returns segments up to and including the point where the cursor is reached.
 * If the cursor is on a segment (not at an endpoint), that segment is
 * truncated to end at the cursor.
 */
export function truncateAtCursor(
  segments: readonly TraceSegment[],
  cursor: Vector2
): TraceSegment[] {
  const result: TraceSegment[] = [];

  for (const seg of segments) {
    // Check if this segment ends at the cursor
    if (pointsEqual(seg.end, cursor)) {
      result.push(seg);
      break; // Stop here
    }

    // Check if the cursor is on this segment (between start and end)
    if (isPointOnSegment(cursor, seg.start, seg.end)) {
      // Truncate segment to end at cursor
      result.push({
        ...seg,
        end: cursor,
      });
      break; // Stop here
    }

    // Segment doesn't contain cursor, keep it and continue
    result.push(seg);
  }

  return result;
}

/**
 * Check if a point lies on a line segment (approximately).
 */
function isPointOnSegment(point: Vector2, start: Vector2, end: Vector2): boolean {
  // Check if point is collinear with segment
  const crossProduct =
    (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y);

  if (Math.abs(crossProduct) > POINT_TOLERANCE * 10) {
    return false; // Not collinear
  }

  // Check if point is within segment bounds (with tolerance)
  const minX = Math.min(start.x, end.x) - POINT_TOLERANCE;
  const maxX = Math.max(start.x, end.x) + POINT_TOLERANCE;
  const minY = Math.min(start.y, end.y) - POINT_TOLERANCE;
  const maxY = Math.max(start.y, end.y) + POINT_TOLERANCE;

  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
}

/**
 * Extract waypoints from trace segments, filtering out cursor.
 */
export function extractWaypoints(
  segments: readonly TraceSegment[],
  cursor: Vector2
): Vector2[] {
  if (segments.length === 0) return [];

  const waypoints: Vector2[] = [];

  // Add start of first segment (if not cursor)
  const firstStart = segments[0]!.start;
  if (!pointsEqual(firstStart, cursor)) {
    waypoints.push(firstStart);
  }

  // Add end of each segment (if not cursor)
  for (const seg of segments) {
    if (!pointsEqual(seg.end, cursor)) {
      waypoints.push(seg.end);
    }
  }

  return waypoints;
}

/**
 * Compare two paths for equality.
 *
 * Returns null if equal, or a description of the first difference.
 */
export function comparePaths(
  actualSegments: readonly TraceSegment[],
  expectedSegments: readonly TraceSegment[],
  cursor: Vector2
): string | null {
  const actualWaypoints = extractWaypoints(actualSegments, cursor);
  const expectedWaypoints = extractWaypoints(expectedSegments, cursor);

  // Compare lengths
  if (actualWaypoints.length !== expectedWaypoints.length) {
    return `Waypoint count differs: actual=${actualWaypoints.length} vs expected=${expectedWaypoints.length}`;
  }

  // Compare each waypoint
  for (let i = 0; i < actualWaypoints.length; i++) {
    const actual = actualWaypoints[i]!;
    const expected = expectedWaypoints[i]!;
    if (!pointsEqual(actual, expected)) {
      return `Waypoint ${i} differs: actual=(${actual.x.toFixed(1)},${actual.y.toFixed(1)}) vs expected=(${expected.x.toFixed(1)},${expected.y.toFixed(1)})`;
    }
  }

  return null; // Paths are equal
}
