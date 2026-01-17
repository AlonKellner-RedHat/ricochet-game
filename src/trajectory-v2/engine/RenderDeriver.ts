/**
 * RenderDeriver - Pure function from UnifiedPath to render-ready segments
 *
 * @deprecated This module is part of the OLD unified path architecture (700+ lines).
 * Use the new DualPathRenderer.ts instead (~100 lines).
 *
 * The new two-path architecture:
 * - SimpleTrajectoryCalculator.calculateSimpleTrajectory() - main entry
 * - DualPathRenderer.renderDualPath() - simple color derivation
 *
 * This file is kept for backward compatibility but should not be used for new code.
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
import {
  isOnReflectiveSide,
  rayLineIntersect,
  raycastForward,
  reflectDirection,
} from "./ValidityChecker";
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

  // FIRST PRINCIPLE: When the solid-green path ends, the planned path and actual path diverge.
  // The divergence point is where the ACTUAL path ends/diverges, NOT where it starts diverging from plan.
  //
  // Key insight: "diverged" segments are still part of the ACTUAL arrow path and should be GREEN.
  // The divergence point is the END of the actual path (where it terminates or continues differently).
  //
  // Cases:
  // 1. Actual path terminates at wall (blocked) -> divergence at wall, NO yellow after
  // 2. Actual path reflects off unplanned surface -> divergence at reflection, yellow continues
  // 3. Off-segment hit -> divergence at planned surface, yellow goes straight, red reflects
  let divergencePoint: Vector2 | null = null;
  let actualPathTerminatesAtDivergence = false;

  // Check if actual path terminates (wall hit) at a diverged segment
  const lastSegment = path.segments[path.segments.length - 1];
  const actualTerminatesAtWall = lastSegment?.termination?.type === "wall_hit";

  // CRITICAL: Check firstDivergedIndex === 0 FIRST, before actualTerminatesAtWall.
  // When the first segment is already diverged (hit wrong surface), the divergence point
  // is at that first surface, NOT at where the actual path eventually terminates!
  if (divergeBeforeCursor && path.firstDivergedIndex === 0 && path.segments.length > 0) {
    // First segment is diverged
    // FIRST PRINCIPLE 6.11: Out-of-order surface hit
    // If first segment hits a planned surface out of order, divergence is at
    // the END of that segment (where the wrong surface was hit), not the start.
    const firstSeg = path.segments[0]!;
    if (firstSeg.termination?.type === "wall_hit") {
      divergencePoint = firstSeg.end;
      actualPathTerminatesAtDivergence = true;
    } else if (firstSeg.endSurface) {
      // First segment ends at a surface (out-of-order hit) - divergence is at that surface
      divergencePoint = firstSeg.end;
    } else {
      // First segment doesn't end at any surface - divergence at start (direction was wrong)
      divergencePoint = firstSeg.start;
    }
  } else if (divergeBeforeCursor && path.firstDivergedIndex > 0) {
    // First diverged segment is NOT at index 0 - there's at least one aligned segment before it
    // Find where the actual path diverges (end of last aligned segment before first diverged)
    const firstDivergedSeg = path.segments[path.firstDivergedIndex];
    const prevSeg = path.segments[path.firstDivergedIndex - 1];

    // CRITICAL: The divergence point is ALWAYS at the end of the PREVIOUS segment.
    // That's where the path diverged from the plan. Where the diverged path eventually
    // terminates (wall or otherwise) is NOT the divergence point.
    if (prevSeg) {
      divergencePoint = prevSeg.end;
    }

    // Track if the actual path terminates at a wall for yellow rendering decisions
    if (firstDivergedSeg?.termination?.type === "wall_hit") {
      actualPathTerminatesAtDivergence = true;
    }
  } else if (divergeBeforeCursor && actualTerminatesAtWall && path.segments.length > 0) {
    // Actual path is blocked by wall - divergence is at the wall (end of last segment)
    // This only applies when there's no explicit firstDivergedIndex (all segments aligned but blocked)
    divergencePoint = lastSegment!.end;
    actualPathTerminatesAtDivergence = true;
  } else if (blockedBeforePlan && path.segments.length > 0) {
    // Path was blocked before reaching planned surface - divergence is at the end of the last segment
    divergencePoint = path.segments[path.segments.length - 1]!.end;
    actualPathTerminatesAtDivergence = true;
  }

  // Pre-calculate physics divergence for loop logic
  // This is the UNIFIED check for any off-segment divergence (not just first segment)
  const hasPhysicsDivergence = path.physicsDivergenceIndex !== -1;

  // FIRST PRINCIPLE: With unplanned reflection (empty plan + multiple segments),
  // the solid path should only go to the first reflection point (end of first segment).
  // After that point, we draw solid red to cursor (planned) and dashed yellow (actual).
  // We must skip rendering segments after the first one in the main loop.
  const hasUnplannedReflection = !hasPlannedSurfaces && path.segments.length > 1 && cursorNotOnPath;

  for (let i = 0; i < path.segments.length; i++) {
    const segment = path.segments[i]!;

    // When cursor is not on path, all segments before termination are "before cursor"
    const isBeforeCursor = cursorNotOnPath || i < cursorIdx;
    const isCursorSegment = !cursorNotOnPath && i === cursorIdx;
    const isAfterCursor = !cursorNotOnPath && i > cursorIdx;

    // Determine if this segment should be colored as diverged (red)
    const isDiverged = segment.planAlignment === "diverged";
    const isUnplanned = segment.planAlignment === "unplanned";

    // FIRST PRINCIPLE: With physics divergence (off-segment hit), skip rendering
    // diverged segments from the loop - we'll render them separately as
    // the planned path (red) and the actual path (yellow) using actualPhysicsSegments.
    if (hasPhysicsDivergence && i > path.physicsDivergenceIndex) {
      // Skip segments after divergence - they'll be rendered separately
      continue;
    }

    // FIRST PRINCIPLE: With unplanned reflection (empty plan + cursor blocked),
    // the solid green path should only go to the FIRST reflection point (divergence).
    // After that, we draw solid red to cursor and dashed yellow for actual physics.
    // Skip segments after the first one - they'll be rendered separately.
    if (hasUnplannedReflection && i >= 1) {
      continue;
    }

    // FIRST PRINCIPLE 6.11: Out-of-order surface hit
    // When first segment is diverged (hit wrong planned surface), render only that segment
    // as green. Subsequent segments are the actual path continuation - render as dashed yellow.
    // Red path (planned) is computed separately from divergence point.
    const isOutOfOrderDivergence =
      hasPlannedSurfaces &&
      path.firstDivergedIndex === 0 &&
      path.segments[0]?.endSurface !== null;

    if (isOutOfOrderDivergence && i >= 1) {
      // Render this segment as dashed yellow (actual path after divergence)
      renderSegments.push({
        start: segment.start,
        end: segment.end,
        style: "dashed",
        color: "yellow",
      });
      continue;
    }

    // FIRST PRINCIPLE: When divergence happens after first segment (firstDivergedIndex > 0),
    // segments AT and AFTER firstDivergedIndex are the actual physics continuation after divergence.
    // These should be rendered as dashed yellow (actual path after divergence from plan).
    const isDivergedAfterFirst =
      hasPlannedSurfaces &&
      path.firstDivergedIndex > 0 &&
      i >= path.firstDivergedIndex;

    if (isDivergedAfterFirst) {
      // Render diverged segments as dashed yellow (actual path after divergence)
      renderSegments.push({
        start: segment.start,
        end: segment.end,
        style: "dashed",
        color: "yellow",
      });
      continue;
    }

    // FIRST PRINCIPLE: Diverged segments that are part of the ACTUAL arrow path should be GREEN.
    // The divergence happens at the END of the actual path (wall or reflection point).
    // We render these segments as green, then draw red from the divergence point to cursor.
    //
    // Key insight: "aligned" AND "diverged" segments are BOTH what the arrow actually does.
    // They should ALL be green (before cursor) or yellow (after cursor).
    // The RED path is computed separately - it's the planned path ignoring obstructions.

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

    // CHANGED: Diverged segments are part of actual path - render as green, not red
    // Red is only for the PLANNED path (computed separately from divergence point to cursor)
    const _ = isDiverged; // Suppress unused variable warning

    if (isCursorSegment && path.cursorT > 0 && path.cursorT < 1) {
      // Split segment at cursor position
      const cursorPoint = interpolatePoint(segment.start, segment.end, path.cursorT);

      // Before cursor (solid) - actual path is always green
      renderSegments.push({
        start: segment.start,
        end: cursorPoint,
        style: "solid",
        color: "green",
      });

      // After cursor (dashed) - actual path is yellow
      renderSegments.push({
        start: cursorPoint,
        end: segment.end,
        style: "dashed",
        color: "yellow",
      });
    } else {
      // Normal segment (not split)
      // When cursor is not on path, all physical segments are solid (path to obstacle)
      const style: RenderStyle = isBeforeCursor || isCursorSegment ? "solid" : "dashed";

      // FIRST PRINCIPLE: Actual path segments are always green (before cursor) or yellow (after)
      // Red is rendered separately for the planned path from divergence point
      const color: RenderColor = isAfterCursor ? "yellow" : "green";

      renderSegments.push({
        start: segment.start,
        end: segment.end,
        style,
        color,
      });
    }
  }

  // FIRST PRINCIPLE: When physics divergence happens (actual arrow goes straight,
  // planned path reflects), we need to show BOTH paths:
  // 1. ACTUAL path (dashed yellow): from actualPhysicsSegments - THE SINGLE SOURCE OF TRUTH
  // 2. PLANNED path (red): from path.segments - the planned reflections
  //
  // physicsDivergenceIndex tells us where actual physics differs from planned path.
  // This is the UNIFIED approach that handles ALL off-segment cases (not just first segment).
  if (hasPhysicsDivergence && cursor) {
    const divergeIdx = path.physicsDivergenceIndex;

    // Find the divergence point (end of the planned segment where divergence happened)
    const divergencePoint = path.segments[divergeIdx]?.end;

    // 1. ACTUAL path (dashed yellow): From divergence point following actual physics
    // THE SINGLE SOURCE OF TRUTH for actual arrow physics
    //
    // IMPORTANT: The actualPhysicsSegments may have FEWER segments than planned segments
    // because the actual arrow goes straight through off-segment surfaces.
    // We need to find where the divergence point falls in the actual physics path
    // and render from there.
    if (divergencePoint && path.actualPhysicsSegments.length > 0) {
      // Find which physics segment contains the divergence point
      let foundPhysicsSegment = false;
      for (let i = 0; i < path.actualPhysicsSegments.length; i++) {
        const physSeg = path.actualPhysicsSegments[i]!;

        // Check if divergence point is on this physics segment
        const segLen = distance(physSeg.start, physSeg.end);
        const toDiverge = distance(physSeg.start, divergencePoint);
        const fromDiverge = distance(divergencePoint, physSeg.end);

        // Divergence point is on this segment if distances add up (with tolerance)
        const isOnSegment = Math.abs(toDiverge + fromDiverge - segLen) < 2;

        if (isOnSegment && fromDiverge > 1) {
          // Render from divergence point to end of this physics segment
          renderSegments.push({
            start: divergencePoint,
            end: physSeg.end,
            style: "dashed",
            color: "yellow",
          });
          foundPhysicsSegment = true;

          // Render remaining physics segments
          for (let j = i + 1; j < path.actualPhysicsSegments.length; j++) {
            const seg = path.actualPhysicsSegments[j]!;
            renderSegments.push({
              start: seg.start,
              end: seg.end,
              style: "dashed",
              color: "yellow",
            });
          }
          break;
        }
      }

      // Fallback: If we didn't find divergence point on physics segments,
      // just render physics segments after divergeIdx (original behavior)
      if (!foundPhysicsSegment) {
        for (let i = divergeIdx + 1; i < path.actualPhysicsSegments.length; i++) {
          const seg = path.actualPhysicsSegments[i]!;
          renderSegments.push({
            start: seg.start,
            end: seg.end,
            style: "dashed",
            color: "yellow",
          });
        }
      }
    }

    // 2. PLANNED path (red): from divergence point to cursor via planned reflections
    //
    // CRITICAL FIX: When cursor is not on the path (cursorSegmentIndex === -1),
    // path.segments contain the ACTUAL physics path, not the planned path!
    // We must use calculatePlannedPathFromPoint to get the correct planned path.
    if (path.cursorSegmentIndex === -1 && divergencePoint && activePlannedSurfaces.length > 0) {
      // Cursor is not on the physics path - calculate the planned path separately
      const plannedPathFromDivergence = calculatePlannedPathFromPoint(
        divergencePoint,
        cursor,
        activePlannedSurfaces,
        surfaces
      );

      // FIRST PRINCIPLE: Solid paths before cursor, dashed paths after cursor
      // We need to find where the cursor falls in the planned path and split there
      let reachedCursor = false;
      for (const seg of plannedPathFromDivergence) {
        if (!reachedCursor) {
          // Check if cursor is at the END of this segment
          const cursorAtEnd = distance(cursor, seg.end) < 1;
          // Check if cursor is ON this segment (between start and end)
          const cursorOnSeg = isPointOnSegment(cursor, seg.start, seg.end);

          if (cursorAtEnd) {
            // This segment ends at cursor - render solid, mark as reached
            renderSegments.push({
              start: seg.start,
              end: seg.end,
              style: "solid",
              color: "red",
            });
            reachedCursor = true;
          } else if (cursorOnSeg.isOnSegment) {
            // Cursor is in the middle - split at cursor
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
            // Cursor not on this segment yet - render solid and continue
            renderSegments.push({
              start: seg.start,
              end: seg.end,
              style: "solid",
              color: "red",
            });
          }
        } else {
          // Already reached cursor - render dashed
          renderSegments.push({
            start: seg.start,
            end: seg.end,
            style: "dashed",
            color: "red",
          });
        }
      }

      // If calculatePlannedPathFromPoint didn't produce segments (no planned surfaces left),
      // draw a direct line from divergence to cursor
      if (plannedPathFromDivergence.length === 0) {
        renderSegments.push({
          start: divergencePoint,
          end: cursor,
          style: "solid",
          color: "red",
        });
      }
    } else {
      // Cursor IS on the path - use the existing segments
    const plannedDivergeIdx =
      path.firstDivergedIndex !== -1 ? path.firstDivergedIndex : divergeIdx + 1;
    for (let i = plannedDivergeIdx; i < path.segments.length; i++) {
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
        } else if (isCursorSeg || isBeforeCursorSeg) {
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
  // SKIP if we already handled physics divergence above (which includes off-segment cases)
  if (divergeBeforeCursor && divergencePoint && cursor && !hasPhysicsDivergence) {
    // FIRST PRINCIPLE: The planned path must only reflect off planned surfaces exactly
    // once per appearance in the order they were selected.
    // Surfaces that were ALREADY reflected off before divergence must be excluded.
    const alreadyReflectedIds = new Set<string>();
    const divergeIdx =
      path.firstDivergedIndex !== -1 ? path.firstDivergedIndex : path.segments.length;
    for (let i = 0; i < divergeIdx; i++) {
      const seg = path.segments[i];
      if (seg?.endSurface && seg.planAlignment === "aligned") {
        alreadyReflectedIds.add(seg.endSurface.id);
      }
    }

    // Filter planned surfaces to only include those NOT yet reflected off
    const remainingPlannedSurfaces = activePlannedSurfaces.filter(
      (s) => !alreadyReflectedIds.has(s.id)
    );

    // Calculate the planned path from divergence point using REMAINING surfaces
    const plannedPathFromDivergence = calculatePlannedPathFromPoint(
      divergencePoint,
      cursor,
      remainingPlannedSurfaces,
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

    // FIRST PRINCIPLE: The actual path must always be visualized (solid-green, then dashed-yellow).
    // Diverged segments are now rendered as GREEN in the main loop (they're the actual path).
    // We only add dashed-yellow physics projection if the path CONTINUES after divergence.
    //
    // NO yellow if actual path terminates at wall (nothing continues).
    // YES yellow if actual path reflects off unplanned surface (path continues).
    // SKIP if out-of-order divergence (yellow was already rendered in main loop).
    const isOutOfOrderDivergenceForYellow =
      hasPlannedSurfaces &&
      path.firstDivergedIndex === 0 &&
      path.segments[0]?.endSurface !== null;

    if (!actualPathTerminatesAtDivergence && path.segments.length > 0 && !isOutOfOrderDivergenceForYellow) {
      const lastSeg = path.segments[path.segments.length - 1]!;
      const lastDx = lastSeg.end.x - lastSeg.start.x;
      const lastDy = lastSeg.end.y - lastSeg.start.y;
      const lastLen = Math.sqrt(lastDx * lastDx + lastDy * lastDy);

      if (lastLen > 0) {
        const lastDir = { x: lastDx / lastLen, y: lastDy / lastLen };
        const projectionSegments = calculatePhysicsProjection(
          lastSeg.end,
          lastDir,
          surfaces,
          1000,
          5
        );

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
  }

  // FIRST PRINCIPLE: There must ALWAYS be a solid path from player to cursor.
  // FIRST PRINCIPLE: The solid section of the planned path must NOT be affected by unplanned surfaces.
  //
  // When there's an unplanned reflection (empty plan, multiple segments):
  // - The DIVERGENCE POINT is where the arrow first hits an unplanned surface (end of first segment)
  // - The PLANNED path goes STRAIGHT from divergence point to cursor (ignoring reflections)
  // - The ACTUAL path continues according to physics (reflects and may hit other surfaces)
  //
  // Visualization:
  // - Solid green: player to divergence point (first unplanned surface)
  // - Solid red: divergence point straight to cursor (planned path ignoring obstructions)
  // - Dashed red: physics projection beyond cursor (from cursor in the straight direction)
  // - Dashed yellow: divergence point following actual physics (where arrow actually goes)

  if (hasUnplannedReflection && cursor && !divergeBeforeCursor) {
    // Find the divergence point: end of the first segment (first unplanned surface hit)
    const firstSegment = path.segments[0]!;
    const divergencePoint = firstSegment.end;

    // Draw solid red from divergence point STRAIGHT to cursor (ignoring reflections)
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

      // Dashed red: physics projection beyond cursor
      const dirLen = distToCursor;
      const direction = { x: dx / dirLen, y: dy / dirLen };

      const projectionSegments = calculatePhysicsProjection(cursor, direction, surfaces, 1000, 5);

      for (const seg of projectionSegments) {
        renderSegments.push({
          start: seg.start,
          end: seg.end,
          style: "dashed",
          color: "red",
        });
      }
    }

    // Dashed yellow: actual physics continuation from divergence point
    // Get the direction of the actual path after the first segment (after reflection)
    if (path.segments.length >= 2) {
      const secondSegment = path.segments[1]!;
      const actualDx = secondSegment.end.x - secondSegment.start.x;
      const actualDy = secondSegment.end.y - secondSegment.start.y;
      const actualLen = Math.sqrt(actualDx * actualDx + actualDy * actualDy);

      if (actualLen > 0) {
        const actualDirection = { x: actualDx / actualLen, y: actualDy / actualLen };

        // Add the actual path segments after divergence as dashed yellow
        for (let i = 1; i < path.segments.length; i++) {
          const seg = path.segments[i]!;
          renderSegments.push({
            start: seg.start,
            end: seg.end,
            style: "dashed",
            color: "yellow",
          });
        }

        // FIRST PRINCIPLE: Dashed paths must follow physically accurate paths.
        // Only continue with physics projection if the path didn't terminate at a wall.
        const lastSegment = path.segments[path.segments.length - 1]!;
        const terminatedAtWall = lastSegment.termination?.type === "wall_hit";

        if (!terminatedAtWall) {
          // Continue with physics projection from the last actual point
          const lastActualPoint = lastSegment.end;

          // Get direction from the last segment
          const lastDx = lastSegment.end.x - lastSegment.start.x;
          const lastDy = lastSegment.end.y - lastSegment.start.y;
          const lastLen = Math.sqrt(lastDx * lastDx + lastDy * lastDy);

          if (lastLen > 0) {
            const lastDirection = { x: lastDx / lastLen, y: lastDy / lastLen };
            const projectionSegments = calculatePhysicsProjection(
              lastActualPoint,
              lastDirection,
              surfaces,
              1000,
              5
            );

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
      }
    }
  } else if (cursorNotOnPath && cursor && !divergeBeforeCursor && !hasUnplannedReflection) {
    // No unplanned reflection (blocked by wall or single segment)
    // Draw red from last point to cursor
    const lastSegment = path.segments[path.segments.length - 1];
    if (lastSegment) {
      const lastPoint = lastSegment.end;

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

        // Dashed red projection beyond cursor
        const dirLen = distToCursor;
        const direction = { x: dx / dirLen, y: dy / dirLen };

        const projectionSegments = calculatePhysicsProjection(cursor, direction, surfaces, 1000, 5);

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

  // FIRST PRINCIPLE: There must always be a dashed projection beyond the cursor.
  // When cursor is at the end of the last segment and there are no more segments,
  // we need to add a forward projection.
  const cursorAtSegmentEnd =
    cursorIdx !== -1 && cursorIdx === path.segments.length - 1 && path.cursorT >= 1;
  const noSegmentsAfterCursor = cursorIdx === path.segments.length - 1;
  const needsForwardProjection =
    (cursorAtSegmentEnd || noSegmentsAfterCursor) &&
    !divergeBeforeCursor &&
    !hasPhysicsDivergence &&
    cursor;

  if (needsForwardProjection && path.segments.length > 0) {
    // Get direction from last segment
    const lastSeg = path.segments[path.segments.length - 1]!;
    const dx = lastSeg.end.x - lastSeg.start.x;
    const dy = lastSeg.end.y - lastSeg.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len > 0) {
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

  if (len === 0) {
    return [];
  }

  let currentPoint = start;
  let currentDirection = { x: dx / len, y: dy / len };

  // Track which surfaces we've successfully reflected off (for bypass checking)
  let surfacesReflectedOff = 0;

  // Trace through planned surfaces
  for (let i = 0; i < plannedSurfaces.length; i++) {
    const plannedSurface = plannedSurfaces[i]!;

    // FIRST PRINCIPLE 6.9: Per-segment bypass check
    // If we're approaching this surface from the non-reflective side, skip it (bypass)
    if (!isOnReflectiveSide(currentPoint, plannedSurface)) {
      // We're on the wrong side of this surface - bypass it
      // Continue to next surface without reflecting
      continue;
    }

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

    surfacesReflectedOff++;

    // Reflect off the planned surface
    const reflectedDir = reflectDirection(currentDirection, plannedSurface);

    // Get next cursor image for the next direction
    // We need to use surfacesReflectedOff to correctly index into cursor images
    // since we may have skipped some surfaces due to bypass
    const remainingSurfaces = plannedSurfaces.length - i - 1;
    if (remainingSurfaces > 0) {
      // For next surface, find the cursor image at the correct depth
      // Note: cursorImages.images contains ReflectedImage objects, need to access .position
      const nextCursorImageObj = cursorImages.images[remainingSurfaces - 1];
      const nextCursorImage = nextCursorImageObj?.position ?? cursorImages.original;
      dx = nextCursorImage.x - lineHit.point.x;
      dy = nextCursorImage.y - lineHit.point.y;
      len = Math.sqrt(dx * dx + dy * dy);

      if (len > 0) {
        currentDirection = { x: dx / len, y: dy / len };
      } else {
        currentDirection = reflectedDir;
      }
    } else {
      // Last planned surface - direction toward cursor
      dx = cursor.x - lineHit.point.x;
      dy = cursor.y - lineHit.point.y;
      len = Math.sqrt(dx * dx + dy * dy);

      if (len > 0) {
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

    if (projLen > 0) {
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

  if (len === 0) {
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

// =============================================================================
// UNIFIED PHYSICS PROJECTION (Using RayPropagator + tracePath)
// =============================================================================

import { type RayPropagator } from "./RayPropagator";
import { tracePath } from "./TracePath";

/**
 * Calculate physics-based projection using the unified tracePath function.
 *
 * This implementation uses image-based reflection via RayPropagator,
 * ensuring consistency with the actual path and planned path calculations.
 *
 * ADVANTAGES over direction-based approach:
 * - Consistent reflection paradigm across all path types
 * - Supports both physical (on-segment) and planned (extended line) modes
 * - Uses shared ReflectionCache for memoized reflections
 *
 * @param propagator RayPropagator with current origin/target images
 * @param surfaces All surfaces to consider
 * @param mode "physical" for dashed yellow, "planned" for dashed red
 * @param maxDistance Maximum total projection distance
 * @param maxReflections Maximum number of reflections
 * @returns Array of projection segments
 */
export function calculatePhysicsProjectionUnified(
  propagator: RayPropagator,
  surfaces: readonly Surface[],
  mode: "physical" | "planned",
  maxDistance: number,
  maxReflections: number
): ProjectionSegment[] {
  // Use tracePath to compute the projection
  const result = tracePath(propagator, surfaces, {
    mode,
    maxReflections,
    maxDistance,
  });

  // Convert TraceResult segments to ProjectionSegments
  const segments: ProjectionSegment[] = [];
  for (const seg of result.segments) {
    segments.push({
      start: seg.start,
      end: seg.end,
    });
  }

  return segments;
}
