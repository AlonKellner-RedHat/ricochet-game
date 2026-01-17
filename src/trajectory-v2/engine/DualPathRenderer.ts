/**
 * DualPathRenderer - Renders two paths with simple color rules
 *
 * FIRST PRINCIPLES (from principles-audit.md):
 * - C1: Green = aligned portion
 * - C2: Red = planned divergence
 * - C3: Yellow = actual continuation
 * - C4: Solid = before cursor
 * - C5: Dashed = after cursor
 * - C6: Red only when discrepancy exists
 *
 * DESIGN PRINCIPLE: Rendering is trivial when you have two independent paths.
 * Color is a pure function of segment position and path type.
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { FullTrajectoryResult } from "./FullTrajectoryCalculator";
import type { TraceSegment } from "./TracePath";

/**
 * Render color type.
 */
export type RenderColor = "green" | "red" | "yellow";

/**
 * Convert render color string to hex color value.
 */
export function colorToHex(color: RenderColor): number {
  switch (color) {
    case "green":
      return 0x00ff00;
    case "red":
      return 0xff0000;
    case "yellow":
      return 0xffff00;
  }
}

/**
 * Path interface for rendering.
 */
export interface RenderablePath {
  readonly waypoints: readonly Vector2[];
  readonly cursorIndex: number;
  readonly cursorT: number;
}

/**
 * Divergence information for rendering.
 */
export interface DivergenceForRender {
  readonly segmentIndex: number;
  readonly point: Vector2 | null;
  readonly isAligned: boolean;
}

/**
 * A rendered segment with color and style.
 */
export interface RenderSegment {
  readonly start: Vector2;
  readonly end: Vector2;
  readonly style: "solid" | "dashed";
  readonly color: "green" | "red" | "yellow";
}

/**
 * Linear interpolation between two points.
 */
function lerp(a: Vector2, b: Vector2, t: number): Vector2 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

/**
 * Calculate cursor position on path.
 */
function getCursorPosition(path: RenderablePath, cursor: Vector2): Vector2 {
  if (path.cursorIndex < 0 || path.cursorIndex >= path.waypoints.length - 1) {
    return cursor;
  }

  const start = path.waypoints[path.cursorIndex]!;
  const end = path.waypoints[path.cursorIndex + 1]!;
  return lerp(start, end, path.cursorT);
}

/**
 * Render two paths with simple, principled color rules.
 *
 * ALGORITHM:
 * 1. Before divergence → GREEN (both paths agree)
 * 2. At/after divergence:
 *    - Actual path → YELLOW
 *    - Planned path → RED
 * 3. Before cursor → SOLID
 * 4. After cursor → DASHED
 *
 * @param actual The actual physical path
 * @param planned The ideal planned path
 * @param divergence Divergence information
 * @param cursor Cursor position
 * @returns Array of render segments
 */
export function renderDualPath(
  actual: RenderablePath,
  planned: RenderablePath,
  divergence: DivergenceForRender,
  cursor: Vector2
): RenderSegment[] {
  const segments: RenderSegment[] = [];

  // Edge case: empty paths
  if (actual.waypoints.length < 2) {
    return segments;
  }

  // Case 1: Fully aligned - render actual path only (no red needed)
  if (divergence.isAligned) {
    return renderAlignedPath(actual, cursor);
  }

  // Case 2: Diverged - render both paths
  return renderDivergedPaths(actual, planned, divergence, cursor);
}

/**
 * Render an aligned path (no divergence).
 * All segments are green (solid before cursor, dashed after).
 */
function renderAlignedPath(path: RenderablePath, cursor: Vector2): RenderSegment[] {
  const segments: RenderSegment[] = [];

  for (let i = 0; i < path.waypoints.length - 1; i++) {
    const start = path.waypoints[i]!;
    const end = path.waypoints[i + 1]!;
    const isBeforeCursor = i < path.cursorIndex;
    const isAtCursor = i === path.cursorIndex;
    const isAfterCursor = i > path.cursorIndex;

    if (isBeforeCursor) {
      // Entire segment is solid green
      segments.push({
        start,
        end,
        style: "solid",
        color: "green",
      });
    } else if (isAtCursor) {
      // Split segment at cursor
      const cursorPos = lerp(start, end, path.cursorT);

      if (path.cursorT > 0.01) {
        // Part before cursor: solid green
        segments.push({
          start,
          end: cursorPos,
          style: "solid",
          color: "green",
        });
      }

      if (path.cursorT < 1) {
        // Part after cursor: dashed yellow
        segments.push({
          start: cursorPos,
          end,
          style: "dashed",
          color: "yellow",
        });
      }
    } else if (isAfterCursor) {
      // Entire segment is dashed yellow
      segments.push({
        start,
        end,
        style: "dashed",
        color: "yellow",
      });
    }
  }

  // If cursor is at the end of path, we still need dashed continuation
  if (path.cursorIndex === path.waypoints.length - 2 && path.cursorT >= 1) {
    // Cursor at end - add minimal segment for visual continuity
  }

  return segments;
}

/**
 * Render diverged paths.
 * - Before divergence: GREEN
 * - Actual after divergence: YELLOW
 * - Planned after divergence: RED
 */
function renderDivergedPaths(
  actual: RenderablePath,
  planned: RenderablePath,
  divergence: DivergenceForRender,
  cursor: Vector2
): RenderSegment[] {
  const segments: RenderSegment[] = [];
  const divergeIndex = divergence.segmentIndex;

  // 1. Render actual path (GREEN before divergence, YELLOW after)
  for (let i = 0; i < actual.waypoints.length - 1; i++) {
    const start = actual.waypoints[i]!;
    const end = actual.waypoints[i + 1]!;

    // Segments are 0-indexed, divergeIndex refers to waypoint where divergence occurs
    // Segment i goes from waypoint[i] to waypoint[i+1]
    // If divergeIndex = 2, segments 0 and 1 end BEFORE the divergent waypoint
    const isBeforeDiverge = i + 1 < divergeIndex;
    const isDivergenceSegment = i + 1 === divergeIndex;
    const isAfterDiverge = i + 1 > divergeIndex;

    if (isBeforeDiverge) {
      // Before divergence: solid green
      segments.push({
        start,
        end,
        style: "solid",
        color: "green",
      });
    } else if (isDivergenceSegment && divergence.point) {
      // Segment where divergence occurs - potentially split at divergence point
      const divergeAtStart = divergence.point.x === start.x && divergence.point.y === start.y;
      
      if (divergeAtStart && i === 0) {
        // Special case: divergence at segment 0 start (i.e., at player position)
        // This is the "empty plan with obstruction" case: planned goes to cursor,
        // actual goes to wall. The segment 0 IS the physical trajectory.
        // Show it as GREEN (solid) - it's what the ball actually does.
        segments.push({
          start,
          end,
          style: "solid",
          color: "green",
        });
      } else if (divergeAtStart) {
        // Divergence at segment start, but not segment 0
        // This means there was an aligned portion before, and now we're
        // at the first segment after divergence. Show as YELLOW.
        segments.push({
          start,
          end,
          style: "dashed",
          color: "yellow",
        });
      } else {
        // Split at divergence point
        // Part before divergence point: green
        segments.push({
          start,
          end: divergence.point,
          style: "solid",
          color: "green",
        });
        // Part after divergence point: yellow (actual path continuation)
        if (divergence.point.x !== end.x || divergence.point.y !== end.y) {
          segments.push({
            start: divergence.point,
            end,
            style: "dashed",
            color: "yellow",
          });
        }
      }
    } else if (isAfterDiverge) {
      // After divergence: dashed yellow
      segments.push({
        start,
        end,
        style: "dashed",
        color: "yellow",
      });
    } else {
      // This is segment ending at diverge point but no split (edge case)
      segments.push({
        start,
        end,
        style: "solid",
        color: "green",
      });
    }
  }

  // 2. Render planned path after divergence (RED)
  // Start from divergence point and render to cursor (solid) then beyond (dashed)
  const plannedCursorPos = getCursorPosition(planned, cursor);
  const cursorOnPlanned = planned.cursorIndex >= 0 && planned.cursorIndex < planned.waypoints.length - 1;

  for (let i = Math.max(0, divergeIndex - 1); i < planned.waypoints.length - 1; i++) {
    const start = planned.waypoints[i]!;
    const end = planned.waypoints[i + 1]!;
    const isBeforeOrAtCursor = i <= planned.cursorIndex || !cursorOnPlanned;

    // For segments before the divergence, skip (already rendered as green)
    if (i < divergeIndex - 1) {
      continue;
    }

    // Use divergence point as start if this is the divergence segment
    const segStart = i === divergeIndex - 1 && divergence.point ? divergence.point : start;

    if (i === planned.cursorIndex && cursorOnPlanned) {
      // Split at cursor
      const cursorPos = lerp(start, end, planned.cursorT);

      if (segStart.x !== cursorPos.x || segStart.y !== cursorPos.y) {
        segments.push({
          start: segStart,
          end: cursorPos,
          style: "solid",
          color: "red",
        });
      }

      if (planned.cursorT < 1) {
        segments.push({
          start: cursorPos,
          end,
          style: "dashed",
          color: "red",
        });
      }
    } else if (isBeforeOrAtCursor) {
      segments.push({
        start: segStart,
        end,
        style: "solid",
        color: "red",
      });
    } else {
      segments.push({
        start: segStart,
        end,
        style: "dashed",
        color: "red",
      });
    }
  }

  return segments;
}

// =============================================================================
// RENDER FULL TRAJECTORY (New API)
// =============================================================================

/**
 * Check if a point lies on a segment and return the parametric t value.
 */
function pointOnSegmentT(
  point: Vector2,
  segStart: Vector2,
  segEnd: Vector2,
  tolerance = 1e-6
): number | null {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return point.x === segStart.x && point.y === segStart.y ? 0 : null;
  }

  const t = ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lenSq;
  if (t < 0 || t > 1) return null;

  const projX = segStart.x + t * dx;
  const projY = segStart.y + t * dy;
  const distSq = (point.x - projX) ** 2 + (point.y - projY) ** 2;

  return distSq <= tolerance ? t : null;
}

/**
 * Render a FullTrajectoryResult into RenderSegments.
 *
 * COLOR RULES:
 * - merged: GREEN (solid before cursor, dashed yellow after)
 * - physicalDivergent: YELLOW dashed
 * - plannedToCursor: RED solid
 * - physicalFromCursor: RED dashed
 *
 * @param trajectory The full trajectory result
 * @param cursor The cursor position
 * @returns Array of render segments
 */
export function renderFullTrajectory(
  trajectory: FullTrajectoryResult,
  cursor: Vector2
): RenderSegment[] {
  const segments: RenderSegment[] = [];

  // 1. Render merged segments (GREEN)
  // Find if cursor is on any merged segment
  let cursorOnMergedIndex = -1;
  let cursorT = 0;

  for (let i = 0; i < trajectory.merged.length; i++) {
    const seg = trajectory.merged[i]!;
    if (!seg.start || !seg.end) continue; // Skip invalid segments
    const t = pointOnSegmentT(cursor, seg.start, seg.end);
    if (t !== null) {
      cursorOnMergedIndex = i;
      cursorT = t;
      break;
    }
  }

  for (let i = 0; i < trajectory.merged.length; i++) {
    const seg = trajectory.merged[i]!;
    
    // Skip segments with null/undefined start or end
    if (!seg.start || !seg.end) continue;

    if (cursorOnMergedIndex < 0) {
      // Cursor not on merged path - all solid green
      segments.push({
        start: seg.start,
        end: seg.end,
        style: "solid",
        color: "green",
      });
    } else if (i < cursorOnMergedIndex) {
      // Before cursor segment - solid green
      segments.push({
        start: seg.start,
        end: seg.end,
        style: "solid",
        color: "green",
      });
    } else if (i === cursorOnMergedIndex) {
      // Cursor is on this segment - split
      const cursorPos = lerp(seg.start, seg.end, cursorT);

      if (cursorT > 0.01) {
        segments.push({
          start: seg.start,
          end: cursorPos,
          style: "solid",
          color: "green",
        });
      }

      if (cursorT < 0.99) {
        segments.push({
          start: cursorPos,
          end: seg.end,
          style: "dashed",
          color: "yellow",
        });
      }
    } else {
      // After cursor - dashed yellow
      segments.push({
        start: seg.start,
        end: seg.end,
        style: "dashed",
        color: "yellow",
      });
    }
  }

  // 2. Render physicalDivergent (YELLOW dashed)
  for (const seg of trajectory.physicalDivergent) {
    if (!seg.start || !seg.end) continue; // Skip invalid segments
    segments.push({
      start: seg.start,
      end: seg.end,
      style: "dashed",
      color: "yellow",
    });
  }

  // 3. Render plannedToCursor (RED solid)
  for (const seg of trajectory.plannedToCursor) {
    if (!seg.start || !seg.end) continue; // Skip invalid segments
    segments.push({
      start: seg.start,
      end: seg.end,
      style: "solid",
      color: "red",
    });
  }

  // 4. Render physicalFromCursor (RED dashed)
  for (const seg of trajectory.physicalFromCursor) {
    if (!seg.start || !seg.end) continue; // Skip invalid segments
    segments.push({
      start: seg.start,
      end: seg.end,
      style: "dashed",
      color: "red",
    });
  }

  return segments;
}
