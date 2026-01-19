/**
 * MergedPathCalculator - Merged path calculation with dual strategies.
 *
 * This module implements the core divergence detection algorithm:
 * - Uses BOTH physical and planned strategies in parallel
 * - As long as both agree on the next surface, the path is "merged"
 * - When they disagree, divergence occurs
 * - Returns propagator state at divergence for continuation
 *
 * The key insight is that divergence is detected IN the loop, not post-hoc.
 */

import type { Surface } from "@/surfaces/Surface";
import { lineLineIntersection } from "@/trajectory-v2/geometry/GeometryOps";
import {
  type ReflectionCache,
  createReflectionCache,
} from "@/trajectory-v2/geometry/ReflectionCache";
import type { Segment } from "@/trajectory-v2/geometry/types";
import type { Vector2 } from "@/types";
import type { RangeLimitPair } from "@/trajectory-v2/obstacles/RangeLimit";
import {
  type HitDetectionStrategy,
  type StrategyHitResult,
  createPhysicalStrategy,
  createPlannedStrategy,
} from "./HitDetectionStrategy";
import { type RayPropagator, createRayPropagator } from "./RayPropagator";
import { type TraceSegment, traceWithStrategy } from "./TracePath";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of merged path calculation.
 */
export interface MergedPathResult {
  /** Merged segments where both strategies agree */
  readonly segments: readonly TraceSegment[];

  /** Point where divergence occurred (null if fully aligned or cursor reached) */
  readonly divergencePoint: Vector2 | null;

  /** Surfaces at divergence: what physical and planned hit */
  readonly divergenceSurface: {
    readonly physical: Surface | null;
    readonly planned: Surface | null;
  } | null;

  /** Propagator state at divergence (for continuation) */
  readonly propagatorAtDivergence: RayPropagator | null;

  /** True if paths are identical through to cursor */
  readonly isFullyAligned: boolean;

  /** True if cursor was reached without obstruction */
  readonly reachedCursor: boolean;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Pre-reflect cursor backward through all planned surfaces.
 *
 * For a plan with surfaces [S1, S2, S3], the target should be:
 *   cursor_3 = reflect(reflect(reflect(cursor, S3), S2), S1)
 *
 * This ensures the ray from player → cursor_3 passes through all
 * planned surfaces in order, eventually reaching the original cursor.
 *
 * @param cursor The original cursor position
 * @param plannedSurfaces The planned surfaces in order
 * @param cache The reflection cache for memoization
 * @returns The fully pre-reflected cursor
 */
function preReflectCursor(
  cursor: Vector2,
  plannedSurfaces: readonly Surface[],
  cache: ReflectionCache
): Vector2 {
  if (plannedSurfaces.length === 0) {
    return cursor;
  }

  // Reflect backward through surfaces in REVERSE order
  let reflected = cursor;
  for (let i = plannedSurfaces.length - 1; i >= 0; i--) {
    reflected = cache.reflect(reflected, plannedSurfaces[i]!);
  }
  return reflected;
}

/**
 * Compute the physical start point of a segment.
 */
function computeSegmentStart(source: Vector2, target: Vector2, startLine: Segment | null): Vector2 {
  if (!startLine) {
    return source;
  }

  const hit = lineLineIntersection(source, target, startLine.start, startLine.end);

  if (hit.valid && hit.t > 0) {
    return hit.point;
  }

  return source;
}

/**
 * Check if cursor lies on the segment from start to end.
 */
function cursorOnSegment(
  cursor: Vector2,
  segStart: Vector2,
  segEnd: Vector2,
  tolerance = 1e-10
): boolean {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return cursor.x === segStart.x && cursor.y === segStart.y;
  }

  const t = ((cursor.x - segStart.x) * dx + (cursor.y - segStart.y) * dy) / lenSq;
  if (t < 0 || t > 1) return false;

  const projX = segStart.x + t * dx;
  const projY = segStart.y + t * dy;
  const distSq = (cursor.x - projX) ** 2 + (cursor.y - projY) ** 2;

  return distSq <= tolerance;
}

/**
 * Check if two hits are on the same surface.
 * Returns true if both are null, both are range limit hits, or both hit the same surface.
 */
function sameSurface(hit1: StrategyHitResult | null, hit2: StrategyHitResult | null): boolean {
  if (hit1 === null && hit2 === null) return true;
  if (hit1 === null || hit2 === null) return false;
  // Handle range limit hits (surface is null)
  if (hit1.surface === null && hit2.surface === null) return true;
  if (hit1.surface === null || hit2.surface === null) return false;
  return hit1.surface.id === hit2.surface.id;
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Calculate the merged path using both physical and planned strategies.
 *
 * The algorithm:
 * 1. Create both strategies
 * 2. Create shared propagator
 * 3. Loop: ask both strategies for next hit
 * 4. If same surface → merged, continue
 * 5. If different surfaces → divergence, return
 * 6. If cursor reached → fully aligned
 *
 * @param player Player position
 * @param cursor Cursor position
 * @param plannedSurfaces Surfaces in the shot plan
 * @param allSurfaces All surfaces (including planned)
 * @param cache Optional shared ReflectionCache
 * @returns MergedPathResult with segments and divergence info
 */
export function calculateMergedPath(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[],
  cache?: ReflectionCache,
  rangeLimitPair?: RangeLimitPair
): MergedPathResult {
  const reflectionCache = cache ?? createReflectionCache();

  // Pre-reflect cursor backward through ALL planned surfaces
  // This ensures the ray from player → initialTarget passes through all
  // planned surfaces in order, eventually reaching the original cursor
  const initialTarget = preReflectCursor(cursor, plannedSurfaces, reflectionCache);

  // Create propagator with pre-reflected target
  const propagator = createRayPropagator(player, initialTarget, reflectionCache);

  const physicalStrategy = createPhysicalStrategy(allSurfaces, { rangeLimit: rangeLimitPair });
  const plannedStrategy = createPlannedStrategy(plannedSurfaces);

  const segments: TraceSegment[] = [];
  let currentPropagator = propagator;
  const maxReflections = 10;

  for (let i = 0; i < maxReflections; i++) {
    const ray = currentPropagator.getRay();
    const state = currentPropagator.getState();
    const segmentStart = computeSegmentStart(ray.source, ray.target, state.startLine);

    // Ask both strategies for next hit
    const physicalHit = physicalStrategy.findNextHit(currentPropagator);
    const plannedHit = plannedStrategy.findNextHit(currentPropagator);

    // Check if cursor is reached before any hit
    const physicalEnd = physicalHit ? physicalHit.point : cursor;
    const plannedEnd = plannedHit ? plannedHit.point : cursor;

    // Check if cursor is on the current segment BEFORE either hit
    // This handles: player -> cursor -> wall (cursor before physical hit)
    const cursorBeforePhysical = !physicalHit || cursorOnSegment(cursor, segmentStart, physicalEnd);
    const cursorBeforePlanned = !plannedHit || cursorOnSegment(cursor, segmentStart, plannedEnd);

    // If cursor is reached for BOTH strategies, cursor is reached without divergence
    // This includes: both null, or cursor is before both hits
    if (cursorBeforePhysical && cursorBeforePlanned) {
      // Add segment to cursor
      segments.push({
        start: segmentStart,
        end: cursor,
        surface: null,
        onSegment: true,
        canReflect: false,
      });

      // Continue with physical-only tracing from cursor using the SAME propagator.
      // The propagator still has the correct (originImage, targetImage) pair.
      // We use continueFromPosition to start the first segment from cursor.
      const continuation = traceWithStrategy(currentPropagator, physicalStrategy, {
        continueFromPosition: cursor,
        maxReflections: maxReflections - i,
        maxDistance: 10000,
      });

      // Add continuation segments to merged
      for (const seg of continuation.segments) {
        segments.push(seg);
      }

      return {
        segments,
        divergencePoint: null,
        divergenceSurface: null,
        propagatorAtDivergence: null,
        isFullyAligned: true,
        reachedCursor: true,
      };
    }

    // Check if they hit the same surface
    if (sameSurface(physicalHit, plannedHit)) {
      // Merged - add segment and continue
      const hit = physicalHit!; // guaranteed non-null if same
      segments.push({
        start: segmentStart,
        end: hit.point,
        surface: hit.surface,
        onSegment: hit.onSegment,
        canReflect: hit.canReflect,
      });

      // If can't reflect, stop (but still merged up to here)
      if (!hit.canReflect) {
        return {
          segments,
          divergencePoint: null,
          divergenceSurface: null,
          propagatorAtDivergence: currentPropagator,
          isFullyAligned: false,
          reachedCursor: false,
        };
      }

      // Reflect and continue
      currentPropagator = currentPropagator.reflectThrough(hit.surface);
    } else {
      // Divergence detected!
      // The divergence point is at the EARLIER of the two hits
      let divergencePoint: Vector2;
      if (physicalHit && (!plannedHit || physicalHit.hitPoint.t <= plannedHit.hitPoint.t)) {
        divergencePoint = physicalHit.point;
      } else if (plannedHit) {
        divergencePoint = plannedHit.point;
      } else {
        divergencePoint = segmentStart;
      }

      // Add merged segment up to divergence
      if (divergencePoint.x !== segmentStart.x || divergencePoint.y !== segmentStart.y) {
        segments.push({
          start: segmentStart,
          end: divergencePoint,
          surface: physicalHit?.surface ?? null,
          onSegment: physicalHit?.onSegment ?? true,
          canReflect: physicalHit?.canReflect ?? false,
        });
      }

      return {
        segments,
        divergencePoint,
        divergenceSurface: {
          physical: physicalHit?.surface ?? null,
          planned: plannedHit?.surface ?? null,
        },
        propagatorAtDivergence: currentPropagator,
        isFullyAligned: false,
        reachedCursor: false,
      };
    }
  }

  // Hit max reflections - considered aligned up to here
  return {
    segments,
    divergencePoint: null,
    divergenceSurface: null,
    propagatorAtDivergence: currentPropagator,
    isFullyAligned: true,
    reachedCursor: false,
  };
}
