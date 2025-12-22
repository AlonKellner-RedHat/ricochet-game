/**
 * RenderDeriver - Pure function from UnifiedPath to render-ready segments
 *
 * DESIGN PRINCIPLE: No interpretation, just derivation.
 *
 * The RenderSystem should be a simple loop over segments.
 * All the "intelligence" about what color to use is here,
 * as a pure function from path state to render state.
 *
 * Color rules:
 * - Aligned or unplanned + before cursor = solid green
 * - Aligned or unplanned + after cursor = dashed yellow
 * - Diverged + before cursor = solid red
 * - Diverged + after cursor = dashed red
 */

import type { Surface } from "@/surfaces/Surface";
import { distance } from "@/trajectory-v2/geometry/GeometryOps";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { buildBackwardImages } from "./ImageCache";
import { rayLineIntersect, raycastForward, reflectDirection } from "./ValidityChecker";
import type { PathSegment, UnifiedPath } from "./types";

/**
 * Render style for a segment.
 */
export type RenderStyle = "solid" | "dashed";

/**
 * Render color for a segment.
 */
export type RenderColor = "green" | "red" | "yellow";

/**
 * A segment ready for rendering.
 *
 * No interpretation needed. Just draw it.
 */
export interface RenderSegment {
  readonly start: Vector2;
  readonly end: Vector2;
  readonly style: RenderStyle;
  readonly color: RenderColor;
}

/**
 * Complete render output.
 */
export interface RenderOutput {
  /** Segments to render (in order) */
  readonly segments: readonly RenderSegment[];
  /** Whether the path is fully aligned (no red needed) */
  readonly isAligned: boolean;
  /** Index where cursor splits solid/dashed (-1 if cursor not on path) */
  readonly cursorSegmentIndex: number;
}

/**
 * Derive render-ready segments from a unified path.
 *
 * FIRST PRINCIPLES:
 * - There must always be a solid path from player to cursor.
 * - Dashed paths must follow physically accurate paths.
 * - Solid green: aligned/unplanned portion
 * - Solid red: planned path continuation when blocked (follows plan, ignores obstructions)
 * - Dashed red: physics-based projection of planned path beyond cursor
 * - During the solid section of the planned path, all obstructions must be ignored.
 *
 * PURE FUNCTION: Same input always produces same output.
 *
 * @param path The unified path with segment annotations
 * @param cursor The cursor position (needed to draw solid path to cursor when blocked)
 * @param surfaces All surfaces for physics-based projection calculation
 * @param activePlannedSurfaces The active planned surfaces (for calculating planned continuation)
 * @returns RenderOutput with segments ready to draw
 */
export function deriveRender(
  path: UnifiedPath,
  cursor?: Vector2,
  surfaces: readonly Surface[] = [],
  activePlannedSurfaces: readonly Surface[] = []
): RenderOutput {
  if (path.segments.length === 0) {
    return {
      segments: [],
      isAligned: path.isFullyAligned,
      cursorSegmentIndex: -1,
    };
  }

  const renderSegments: RenderSegment[] = [];
  const cursorIdx = path.cursorSegmentIndex;
  const cursorNotOnPath = cursorIdx === -1;

  // FIRST PRINCIPLE: The solid section of the planned path must NOT reflect off unplanned surfaces.
  // When divergence happens before cursor, we need to:
  // 1. Render green segments up to divergence point
  // 2. Draw planned path (red) from divergence point via planned surfaces to cursor
  // 3. SKIP the physical reflection segments (they're not part of the planned visualization)
  //
  // Divergence cases:
  // 1. firstDivergedIndex !== -1: Explicit divergence detected (hit wrong surface)
  // 2. cursorReachable = false + plannedSurfaceCount > 0 + path didn't reach planned surface:
  //    Path was blocked by an obstacle before reaching the planned surface

  // Check if path was blocked before reaching any planned surface
  const hasPlannedSurfaces = path.plannedSurfaceCount > 0;

  // IMPORTANT: We must check if we reached an ACTIVE PLANNED surface, not just any plannable surface.
  // Otherwise, if we hit a different plannable surface (obstruction), we might incorrectly
  // think we reached the plan when we actually didn't.
  const activePlannedIds = new Set(activePlannedSurfaces.map((s) => s.id));
  const pathReachedPlannedSurface = path.segments.some((seg) => {
    if (!seg.endSurface) return false;
    // Check if endSurface is one of the ACTIVE PLANNED surfaces (not just any plannable surface)
    return activePlannedIds.has(seg.endSurface.id);
  });
  const blockedBeforePlan =
    hasPlannedSurfaces && !path.cursorReachable && !pathReachedPlannedSurface;

  const divergeBeforeCursor =
    (path.firstDivergedIndex !== -1 && !path.cursorReachable) || blockedBeforePlan;

  // Find the divergence point (end of last aligned segment before divergence)
  let divergencePoint: Vector2 | null = null;
  if (divergeBeforeCursor && path.firstDivergedIndex > 0) {
    const lastAlignedSegment = path.segments[path.firstDivergedIndex - 1];
    if (lastAlignedSegment) {
      divergencePoint = lastAlignedSegment.end;
    }
  } else if (divergeBeforeCursor && path.firstDivergedIndex === 0 && path.segments.length > 0) {
    // First segment is diverged - divergence is at player
    divergencePoint = path.segments[0]!.start;
  } else if (blockedBeforePlan && path.segments.length > 0) {
    // Path was blocked before reaching planned surface - divergence is at the end of the last segment
    divergencePoint = path.segments[path.segments.length - 1]!.end;
  }

  // Pre-calculate off-segment divergence for loop logic
  const isOffSegmentDivergence =
    path.firstDivergedIndex === 1 &&
    path.segments.length >= 2 &&
    path.segments[0]!.planAlignment === "aligned" &&
    path.segments[1]!.planAlignment === "diverged" &&
    path.segments[0]!.hitOnSegment === false;

  for (let i = 0; i < path.segments.length; i++) {
    const segment = path.segments[i]!;

    // When cursor is not on path, all segments before termination are "before cursor"
    const isBeforeCursor = cursorNotOnPath || i < cursorIdx;
    const isCursorSegment = !cursorNotOnPath && i === cursorIdx;
    const isAfterCursor = !cursorNotOnPath && i > cursorIdx;

    // Determine if this segment should be colored as diverged (red)
    const isDiverged = segment.planAlignment === "diverged";
    const isUnplanned = segment.planAlignment === "unplanned";

    // FIRST PRINCIPLE: With off-segment divergence, skip rendering the diverged
    // and unplanned segments from the loop - we'll render them separately as
    // the planned path (red) and the actual path (yellow) will be added later.
    if (isOffSegmentDivergence && i >= 1) {
      // Skip segments after the first aligned segment - they'll be rendered separately
      continue;
    }

    // FIRST PRINCIPLE: Planned path must not reflect off unplanned surfaces.
    // Skip rendering diverged segments that are physical reflections (before cursor).
    // Instead, we'll draw a straight line from divergence point to cursor.
    if (isDiverged && isBeforeCursor && divergeBeforeCursor) {
      // Skip this physical reflection segment - it's not part of the planned visualization
      continue;
    }

    // FIRST PRINCIPLE: Red should only appear when there's divergence from a plan.
    // After cursor, if plan was completed successfully, there's nothing to diverge from.
    // "Divergence" after cursor (e.g., reflecting off unplanned surface) is just physics.
    //
    // planCompletedBeforeCursor = true if:
    // - No planned surfaces (nothing to complete), OR
    // - No divergence at all, OR
    // - Divergence happened AFTER cursor (plan was completed before cursor)
    const noPlan = path.plannedSurfaceCount === 0;
    const noDivergence = path.firstDivergedIndex === -1;
    const divergenceAfterCursor =
      path.firstDivergedIndex !== -1 &&
      path.cursorSegmentIndex !== -1 &&
      path.firstDivergedIndex > path.cursorSegmentIndex;
    const planCompletedBeforeCursor = noPlan || noDivergence || divergenceAfterCursor;

    const treatAsAlignedAfterCursor = isAfterCursor && planCompletedBeforeCursor;
    const effectivelyDiverged = isDiverged && !treatAsAlignedAfterCursor;

    if (isCursorSegment && path.cursorT > 0 && path.cursorT < 1) {
      // Split segment at cursor position
      const cursorPoint = interpolatePoint(segment.start, segment.end, path.cursorT);

      // Before cursor (solid)
      renderSegments.push({
        start: segment.start,
        end: cursorPoint,
        style: "solid",
        color: isDiverged ? "red" : "green",
      });

      // After cursor (dashed)
      // If plan was completed, even "diverged" segments are yellow (no plan to diverge from)
      renderSegments.push({
        start: cursorPoint,
        end: segment.end,
        style: "dashed",
        color: isDiverged && !planCompletedBeforeCursor ? "red" : "yellow",
      });
    } else {
      // Normal segment (not split)
      // When cursor is not on path, all physical segments are solid (path to obstacle)
      const style: RenderStyle = isBeforeCursor || isCursorSegment ? "solid" : "dashed";

      // FIRST PRINCIPLE: Red only when diverging from an actual plan
      // After cursor with no plan = yellow (actual continuation)
      let color: RenderColor;
      if (effectivelyDiverged) {
        color = "red";
      } else if (isAfterCursor) {
        color = "yellow";
      } else {
        color = "green";
      }

      renderSegments.push({
        start: segment.start,
        end: segment.end,
        style,
        color,
      });
    }
  }

  // FIRST PRINCIPLE: When divergence happens due to off-segment reflection,
  // we need to show the ACTUAL straight path (dashed yellow) in addition to
  // the planned reflected path (red). The actual arrow goes straight through.
  //
  // Detect off-segment divergence: first segment is aligned, second is diverged,
  // and the first segment had an off-segment hit.
  // NOTE: cursorReachable will be FALSE because cursor is on the planned (diverged) path,
  // not on the actual straight path.
  const hasOffSegmentDivergence =
    path.firstDivergedIndex === 1 &&
    path.segments.length >= 2 &&
    path.segments[0]!.planAlignment === "aligned" &&
    path.segments[1]!.planAlignment === "diverged" &&
    path.segments[0]!.hitOnSegment === false;

  if (hasOffSegmentDivergence && path.segments[0] && cursor) {
    // The first segment ends at the off-segment hit point
    const offSegmentHitPoint = path.segments[0].end;
    const segmentStart = path.segments[0].start;

    // Calculate direction from first segment (this is the actual arrow direction)
    const dx = offSegmentHitPoint.x - segmentStart.x;
    const dy = offSegmentHitPoint.y - segmentStart.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len > 0) {
      const actualDirection = { x: dx / len, y: dy / len };

      // 1. ACTUAL path (dashed yellow): straight continuation from divergence point
      // This is what the arrow actually does - goes straight through
      const actualProjection = calculatePhysicsProjection(
        offSegmentHitPoint,
        actualDirection,
        surfaces,
        1000,
        5
      );

      for (const seg of actualProjection) {
        renderSegments.push({
          start: seg.start,
          end: seg.end,
          style: "dashed",
          color: "yellow",
        });
      }

      // 2. PLANNED path (red): from divergence point to cursor via reflection
      // The path data already has this - render segments 1+ as red
      for (let i = 1; i < path.segments.length; i++) {
        const seg = path.segments[i]!;
        const isCursorSeg = i === path.cursorSegmentIndex;
        const isBeforeCursorSeg = i < path.cursorSegmentIndex;
        const isAfterCursorSeg = path.cursorSegmentIndex !== -1 && i > path.cursorSegmentIndex;

        if (isCursorSeg && path.cursorT > 0 && path.cursorT < 1) {
          // Split at cursor (cursor is in the middle of segment)
          const cursorPoint = interpolatePoint(seg.start, seg.end, path.cursorT);
          renderSegments.push({
            start: seg.start,
            end: cursorPoint,
            style: "solid",
            color: "red",
          });
          renderSegments.push({
            start: cursorPoint,
            end: seg.end,
            style: "dashed",
            color: "red",
          });
        } else if (isCursorSeg || isBeforeCursorSeg || path.cursorSegmentIndex === -1) {
          // Cursor segment (at end) or before cursor - solid red
          renderSegments.push({
            start: seg.start,
            end: seg.end,
            style: "solid",
            color: "red",
          });
        } else {
          // After cursor - dashed red
          renderSegments.push({
            start: seg.start,
            end: seg.end,
            style: "dashed",
            color: "red",
          });
        }
      }
    }
  }

  // FIRST PRINCIPLE: When divergence happens before cursor, the planned path (red)
  // must still follow the plan - reflecting off planned surfaces, ignoring obstructions.
  // "During the solid section of the planned path, all obstructions must be ignored."
  // SKIP if we already handled off-segment divergence above
  if (divergeBeforeCursor && divergencePoint && cursor && !hasOffSegmentDivergence) {
    // Calculate the planned path from divergence point following the plan
    const plannedPathFromDivergence = calculatePlannedPathFromPoint(
      divergencePoint,
      cursor,
      activePlannedSurfaces,
      surfaces
    );

    // Render the planned path as solid red to cursor, dashed red after
    // FIRST PRINCIPLE: The planned path bounces off planned surfaces - we cannot use
    // linear distance to find cursor position. Instead, check segment endpoints directly.
    let reachedCursor = false;
    for (const seg of plannedPathFromDivergence) {
      if (!reachedCursor) {
        // Check if cursor is at the END of this segment
        const cursorAtEnd = distance(cursor, seg.end) < 1;

        // Check if cursor is ON this segment (between start and end)
        const cursorOnSeg = isPointOnSegment(cursor, seg.start, seg.end);

        if (cursorAtEnd) {
          // This segment ends at cursor - render solid, next segments are dashed
          renderSegments.push({
            start: seg.start,
            end: seg.end,
            style: "solid",
            color: "red",
          });
          reachedCursor = true;
        } else if (cursorOnSeg.isOnSegment) {
          // Cursor is in the middle of this segment - split at cursor
          renderSegments.push({
            start: seg.start,
            end: cursor,
            style: "solid",
            color: "red",
          });
          renderSegments.push({
            start: cursor,
            end: seg.end,
            style: "dashed",
            color: "red",
          });
          reachedCursor = true;
        } else {
          // Cursor is not on this segment - render full segment as solid
          // (we haven't reached cursor yet, still building the path to it)
          renderSegments.push({
            start: seg.start,
            end: seg.end,
            style: "solid",
            color: "red",
          });
        }
      } else {
        // After cursor - dashed red
        renderSegments.push({
          start: seg.start,
          end: seg.end,
          style: "dashed",
          color: "red",
        });
      }
    }

    // If we didn't reach cursor via the planned path, draw a direct line
    if (!reachedCursor && plannedPathFromDivergence.length === 0) {
      const dx = cursor.x - divergencePoint.x;
      const dy = cursor.y - divergencePoint.y;
      const distToCursor = Math.sqrt(dx * dx + dy * dy);

      if (distToCursor > 1) {
        renderSegments.push({
          start: divergencePoint,
          end: cursor,
          style: "solid",
          color: "red",
        });
      }
    }
  }

  // FIRST PRINCIPLE: There must always be a solid path from player to cursor
  // When cursor is not on the physical path (blocked by obstacle),
  // add a solid red segment from the last physical point to cursor.
  // BUT: Skip this if we already handled it via divergeBeforeCursor above.
  // FIRST PRINCIPLE: Red only when there's a plan to diverge from.
  // With empty plan, just show actual physics (green path + yellow continuation).
  if (cursorNotOnPath && cursor && !divergeBeforeCursor && hasPlannedSurfaces) {
    const lastSegment = path.segments[path.segments.length - 1];
    if (lastSegment) {
      const lastPoint = lastSegment.end;

      // Only add if cursor is different from last point
      const dx = cursor.x - lastPoint.x;
      const dy = cursor.y - lastPoint.y;
      const distToCursor = Math.sqrt(dx * dx + dy * dy);

      if (distToCursor > 1) {
        renderSegments.push({
          start: lastPoint,
          end: cursor,
          style: "solid",
          color: "red",
        });

        // FIRST PRINCIPLE: The potential future of the planned path
        // should always be visualized as a dashed line.
        // FIRST PRINCIPLE: Dashed paths must follow physically accurate paths.
        // Add physics-based dashed red projection beyond cursor
        const dirLen = distToCursor;
        const direction = { x: dx / dirLen, y: dy / dirLen };

        // Calculate physics-based projection from cursor
        const projectionSegments = calculatePhysicsProjection(
          cursor,
          direction,
          surfaces,
          1000, // projection distance
          5 // max reflections
        );

        // Add all projection segments as dashed red
        for (const seg of projectionSegments) {
          renderSegments.push({
            start: seg.start,
            end: seg.end,
            style: "dashed",
            color: "red",
          });
        }
      }
    }
  }

  // FIRST PRINCIPLE: With empty plan and unplanned reflection, show actual physics.
  // When cursor is blocked by an unplanned surface and there's no plan,
  // draw yellow forward projection from the last segment in the actual direction.
  if (cursorNotOnPath && cursor && !hasPlannedSurfaces && path.segments.length > 0) {
    const lastSegment = path.segments[path.segments.length - 1]!;
    const dx = lastSegment.end.x - lastSegment.start.x;
    const dy = lastSegment.end.y - lastSegment.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len > 1e-6) {
      const direction = { x: dx / len, y: dy / len };

      // Calculate physics-based projection from last point in actual direction
      const projectionSegments = calculatePhysicsProjection(
        lastSegment.end,
        direction,
        surfaces,
        1000, // projection distance
        5 // max reflections
      );

      // Add all projection segments as dashed yellow (no plan to diverge from)
      for (const seg of projectionSegments) {
        renderSegments.push({
          start: seg.start,
          end: seg.end,
          style: "dashed",
          color: "yellow",
        });
      }
    }
  }

  // FIRST PRINCIPLE: There must always be a dashed projection beyond the cursor.
  // When cursor is at the end of the last segment and there are no more segments,
  // we need to add a forward projection.
  const cursorAtSegmentEnd =
    cursorIdx !== -1 && cursorIdx === path.segments.length - 1 && path.cursorT >= 0.99;
  const noSegmentsAfterCursor = cursorIdx === path.segments.length - 1;
  const needsForwardProjection =
    (cursorAtSegmentEnd || noSegmentsAfterCursor) &&
    !divergeBeforeCursor &&
    !hasOffSegmentDivergence &&
    cursor;

  if (needsForwardProjection && path.segments.length > 0) {
    // Get direction from last segment
    const lastSeg = path.segments[path.segments.length - 1]!;
    const dx = lastSeg.end.x - lastSeg.start.x;
    const dy = lastSeg.end.y - lastSeg.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len > 1e-6) {
      const direction = { x: dx / len, y: dy / len };

      // Calculate physics-based projection from cursor
      const projectionSegments = calculatePhysicsProjection(
        cursor,
        direction,
        surfaces,
        1000, // projection distance
        5 // max reflections
      );

      // Determine color: yellow if aligned, red if there was divergence
      const projectionColor: RenderColor = path.isFullyAligned ? "yellow" : "red";

      for (const seg of projectionSegments) {
        renderSegments.push({
          start: seg.start,
          end: seg.end,
          style: "dashed",
          color: projectionColor,
        });
      }
    }
  }

  return {
    segments: renderSegments,
    isAligned: path.isFullyAligned,
    cursorSegmentIndex: cursorIdx,
  };
}

/**
 * Interpolate a point between start and end at parameter t.
 */
function interpolatePoint(start: Vector2, end: Vector2, t: number): Vector2 {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
}

/**
 * A simple segment for projection.
 */
interface ProjectionSegment {
  start: Vector2;
  end: Vector2;
}

/**
 * Calculate physics-based projection from a starting point and direction.
 *
 * FIRST PRINCIPLE: Dashed paths must follow physically accurate paths.
 * This means reflecting off surfaces and stopping at walls.
 *
 * @param start Starting point
 * @param direction Initial direction (normalized)
 * @param surfaces All surfaces to consider
 * @param maxDistance Maximum total projection distance
 * @param maxReflections Maximum number of reflections
 * @returns Array of projection segments
 */
function calculatePhysicsProjection(
  start: Vector2,
  direction: Vector2,
  surfaces: readonly Surface[],
  maxDistance: number,
  maxReflections: number
): ProjectionSegment[] {
  const segments: ProjectionSegment[] = [];

  let currentPoint = start;
  let currentDirection = direction;
  let remainingDistance = maxDistance;
  let lastHitSurface: Surface | null = null;

  for (let i = 0; i < maxReflections && remainingDistance > 0; i++) {
    const excludeSurfaces = lastHitSurface ? [lastHitSurface] : [];
    const hit = raycastForward(
      currentPoint,
      currentDirection,
      surfaces,
      excludeSurfaces,
      remainingDistance
    );

    if (!hit) {
      // No hit - extend to remaining distance
      const endpoint = {
        x: currentPoint.x + currentDirection.x * remainingDistance,
        y: currentPoint.y + currentDirection.y * remainingDistance,
      };
      segments.push({ start: currentPoint, end: endpoint });
      break;
    }

    // Calculate distance to hit
    const hitDist = distance(currentPoint, hit.point);

    // Add segment to hit point
    segments.push({ start: currentPoint, end: hit.point });
    remainingDistance -= hitDist;

    if (!hit.canReflect) {
      // Wall hit - stop here
      break;
    }

    // Reflect and continue
    currentDirection = reflectDirection(currentDirection, hit.surface);
    currentPoint = hit.point;
    lastHitSurface = hit.surface;
  }

  return segments;
}

/**
 * Calculate the planned path from a point, following the plan (ignoring obstructions).
 *
 * FIRST PRINCIPLE: During the solid section of the planned path, all obstructions must be ignored.
 * The planned path follows cursor images reflected by planned surfaces.
 *
 * @param start Starting point (divergence point)
 * @param cursor Cursor position
 * @param plannedSurfaces Active planned surfaces to reflect off
 * @param allSurfaces All surfaces for physics after plan is exhausted
 * @returns Array of path segments
 */
export function calculatePlannedPathFromPoint(
  start: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[]
): ProjectionSegment[] {
  const segments: ProjectionSegment[] = [];

  if (plannedSurfaces.length === 0) {
    // No planned surfaces - direct path to cursor
    return [];
  }

  // Build cursor images for the planned surfaces
  const cursorImages = buildBackwardImages(cursor, plannedSurfaces);

  // Get initial direction: from start toward first cursor image
  // For first surface (index 0), the cursor image is cursorImages.images[n-1]
  // where n is the number of surfaces. For a single surface, it's images[0].
  // Note: cursorImages.images contains ReflectedImage objects, need to access .position
  const n = plannedSurfaces.length;
  const firstCursorImageObj = cursorImages.images[n - 1];
  const firstCursorImage = firstCursorImageObj?.position ?? cursorImages.original;

  let dx = firstCursorImage.x - start.x;
  let dy = firstCursorImage.y - start.y;
  let len = Math.sqrt(dx * dx + dy * dy);

  if (len < 1e-6) {
    return [];
  }

  let currentPoint = start;
  let currentDirection = { x: dx / len, y: dy / len };

  // Trace through planned surfaces
  for (let i = 0; i < plannedSurfaces.length; i++) {
    const plannedSurface = plannedSurfaces[i]!;

    // Find intersection with planned surface's extended line
    const lineHit = rayLineIntersect(currentPoint, currentDirection, plannedSurface, 10000);

    if (!lineHit) {
      // No intersection with planned surface - path doesn't reach it
      break;
    }

    // Add segment to the planned surface
    segments.push({
      start: currentPoint,
      end: lineHit.point,
    });

    // Reflect off the planned surface
    const reflectedDir = reflectDirection(currentDirection, plannedSurface);

    // Get next cursor image for the next direction
    if (i < plannedSurfaces.length - 1) {
      // For surface i+1, the cursor image is at depth (n - (i+1)) = n - i - 1
      // Note: cursorImages.images contains ReflectedImage objects, need to access .position
      const nextCursorImageObj = cursorImages.images[n - i - 2];
      const nextCursorImage = nextCursorImageObj?.position ?? cursorImages.original;
      dx = nextCursorImage.x - lineHit.point.x;
      dy = nextCursorImage.y - lineHit.point.y;
      len = Math.sqrt(dx * dx + dy * dy);

      if (len > 1e-6) {
        currentDirection = { x: dx / len, y: dy / len };
      } else {
        currentDirection = reflectedDir;
      }
    } else {
      // Last planned surface - direction toward cursor
      dx = cursor.x - lineHit.point.x;
      dy = cursor.y - lineHit.point.y;
      len = Math.sqrt(dx * dx + dy * dy);

      if (len > 1e-6) {
        currentDirection = { x: dx / len, y: dy / len };
      } else {
        currentDirection = reflectedDir;
      }
    }

    currentPoint = lineHit.point;
  }

  // Add final segment toward cursor (if we haven't reached it)
  const distToCursor = distance(currentPoint, cursor);
  if (distToCursor > 1) {
    segments.push({
      start: currentPoint,
      end: cursor,
    });
  }

  // Add physics projection beyond cursor
  if (segments.length > 0) {
    const lastSegment = segments[segments.length - 1]!;
    const projDx = lastSegment.end.x - lastSegment.start.x;
    const projDy = lastSegment.end.y - lastSegment.start.y;
    const projLen = Math.sqrt(projDx * projDx + projDy * projDy);

    if (projLen > 1e-6) {
      const projDir = { x: projDx / projLen, y: projDy / projLen };
      const projection = calculatePhysicsProjection(cursor, projDir, allSurfaces, 1000, 5);
      segments.push(...projection);
    }
  }

  return segments;
}

/**
 * Check if a point is on a line segment.
 */
function isPointOnSegment(
  point: Vector2,
  start: Vector2,
  end: Vector2
): { isOnSegment: boolean; t: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len < 1e-6) {
    const dist = distance(point, start);
    return { isOnSegment: dist < 1, t: 0 };
  }

  // Project point onto line
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (len * len);

  if (t < 0 || t > 1) {
    return { isOnSegment: false, t };
  }

  // Check distance from line
  const projX = start.x + t * dx;
  const projY = start.y + t * dy;
  const dist = Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);

  return { isOnSegment: dist < 1, t };
}

/**
 * Get the color hex value for a render color.
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
 * Get the alpha value for a render style.
 */
export function styleToAlpha(style: RenderStyle): number {
  return style === "solid" ? 1.0 : 0.5;
}
