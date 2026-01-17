/**
 * Engine Layer Types
 *
 * Types for the trajectory calculation engine.
 * These types build on geometry types and add game-specific context.
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { SourcePoint } from "@/trajectory-v2/geometry/SourcePoint";
import type { Surface } from "@/surfaces/Surface";
import type { ReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import type { ActualPathUnified } from "./ActualPathCalculator";

/**
 * A reflected image with full provenance tracking.
 *
 * First Principle: Every reflected image stores its origin,
 * enabling debugging, validation, and incremental updates.
 */
export interface ReflectedImage {
  /** The reflected position */
  readonly position: Vector2;
  /** Source information for this reflection */
  readonly source: {
    /** Position before this reflection */
    readonly position: Vector2;
    /** Surface that created this reflection (null for original position) */
    readonly surface: Surface | null;
  };
  /** Reflection depth (0 = original, 1 = once reflected, etc.) */
  readonly depth: number;
}

/**
 * A sequence of reflected images with metadata.
 *
 * For forward images (player):
 *   images[0] = player reflected through surface[0]
 *   images[1] = images[0] reflected through surface[1]
 *   etc.
 *
 * For backward images (cursor):
 *   images[0] = cursor reflected through surface[n-1] (REVERSE order)
 *   images[1] = images[0] reflected through surface[n-2]
 *   etc.
 */
export interface ImageSequence {
  /** The original (unreflected) position */
  readonly original: Vector2;
  /** Chain of reflected images */
  readonly images: readonly ReflectedImage[];
  /** Surfaces used for reflections (in order of application) */
  readonly surfaces: readonly Surface[];
}

/**
 * Information about a hit on a surface during path calculation.
 */
export interface HitInfo {
  /** The intersection point */
  readonly point: Vector2;
  /** The surface that was hit */
  readonly surface: Surface;
  /** Parametric position along the surface segment (0 = start, 1 = end) */
  readonly segmentT: number;
  /** Whether the hit is on the actual segment (vs extended line) */
  readonly onSegment: boolean;
  /** Whether this hit was used for reflection in the actual path */
  readonly reflected: boolean;
}

/**
 * Result of building a trajectory path.
 */
export interface PathResult {
  /** Path points from start to end: [player, hit1, hit2, ..., cursor/endpoint] */
  readonly points: readonly Vector2[];
  /** Information about each hit (one per surface in planned path) */
  readonly hitInfo: readonly HitInfo[];
  /** Whether the path successfully reached the cursor */
  readonly reachedCursor: boolean;
  /** If path was blocked, the surface that blocked it */
  readonly blockedBy?: Surface;
  /** Total path length */
  readonly totalLength: number;
  /**
   * Forward projection beyond the last point.
   * Shows where the arrow would continue if not stopped.
   * Used for visualization: dashed yellow (actual) or dashed red (planned).
   * Empty array if path is blocked by a wall (no continuation).
   */
  readonly forwardProjection?: readonly Vector2[];
  /**
   * Surfaces that were bypassed during path calculation.
   * First Principle 6.x: Bypassed surfaces are excluded from path calculation.
   */
  readonly bypassedSurfaces?: readonly BypassedSurfaceInfo[];
}

/**
 * Result of comparing planned and actual paths.
 *
 * This is the SINGLE SOURCE OF TRUTH for:
 * - Rendering colors (green/red/yellow)
 * - Whether arrow can reach cursor
 * - Which waypoints the arrow follows
 */
export interface AlignmentResult {
  /** True if all planned surfaces are hit on their actual segments */
  readonly isFullyAligned: boolean;
  /** Number of consecutive path segments that align */
  readonly alignedSegmentCount: number;
  /** Index of first mismatch (-1 if fully aligned) */
  readonly firstMismatchIndex: number;
  /**
   * Point where paths diverge (undefined if fully aligned)
   * - Solid green: player to divergencePoint
   * - Solid red: divergencePoint to cursor (planned)
   * - Dashed yellow: divergencePoint onward (actual)
   */
  readonly divergencePoint?: Vector2;
}

/**
 * Ghost point beyond the main path (for visualization).
 */
export interface GhostPoint {
  /** Position of the ghost point */
  readonly position: Vector2;
  /** Surface at this point (if any) */
  readonly surface?: Surface;
  /** Whether the arrow will stick here */
  readonly willStick: boolean;
}

/**
 * Complete results from the trajectory engine.
 */
export interface EngineResults {
  /** Forward images (player reflected through planned surfaces) */
  readonly playerImages: ImageSequence;
  /** Backward images (cursor reflected through planned surfaces, reverse order) */
  readonly cursorImages: ImageSequence;
  /** The planned trajectory path (legacy) */
  readonly plannedPath: PathResult;
  /** The actual trajectory path (legacy) */
  readonly actualPath: PathResult;
  /** Alignment between planned and actual (legacy) */
  readonly alignment: AlignmentResult;
  /** Ghost points beyond cursor for planned path */
  readonly plannedGhost: readonly GhostPoint[];
  /** Ghost points for actual path */
  readonly actualGhost: readonly GhostPoint[];
  /**
   * NEW: Unified path with inline plan annotations.
   * This is the single source of truth for both arrow movement and visualization.
   */
  readonly unifiedPath?: UnifiedPath;
  /**
   * NEW: Actual path using unified image-based reflection.
   * Uses same reflection paradigm as visibility system.
   * Preferred for arrow waypoints as it matches trajectory preview exactly.
   */
  readonly actualPathUnified?: ActualPathUnified;
  /** Cursor position (needed for render calculations) */
  readonly cursor?: Vector2;
  /** All surfaces (needed for physics-based render calculations) */
  readonly allSurfaces?: readonly Surface[];
  /** Active planned surfaces (non-bypassed, for planned path calculation) */
  readonly activePlannedSurfaces?: readonly Surface[];
  /**
   * Shared ReflectionCache used during trajectory calculation.
   * Can be passed to visibility system for cache reuse.
   */
  readonly reflectionCache?: ReflectionCache;
}

/**
 * Shader uniforms for GPU-based reachability rendering.
 */
export interface ShaderUniforms {
  /** Player position */
  readonly player: Vector2;
  /** Forward player images (up to MAX_REFLECTIONS) */
  readonly playerImages: readonly Vector2[];
  /** Surface segments as [startX, startY, endX, endY] */
  readonly surfaces: readonly [number, number, number, number][];
  /** Number of planned surfaces */
  readonly plannedSurfaceCount: number;
  /** Number of all surfaces */
  readonly allSurfaceCount: number;
}

/**
 * Callback for engine result changes.
 */
export type EngineResultsCallback = (results: EngineResults) => void;

/**
 * Unsubscribe function returned by event subscriptions.
 */
export type Unsubscribe = () => void;

/**
 * Information about a bypassed surface.
 */
export interface BypassedSurfaceInfo {
  /** The bypassed surface */
  readonly surface: Surface;
  /** Reason for bypassing */
  readonly reason: BypassReason;
  /** Original index in planned surfaces */
  readonly originalIndex: number;
}

/**
 * Reasons a surface can be bypassed.
 */
export type BypassReason =
  | "player_wrong_side"
  | "cursor_wrong_side"
  | "obstruction_before"
  | "reflection_off_segment"
  | "exhausted";

// =============================================================================
// UNIFIED PATH TYPES (New Architecture)
// =============================================================================

/**
 * How a segment relates to the plan.
 *
 * DESIGN PRINCIPLE: Alignment is annotation, not detection.
 * This is set during path tracing, not by comparing two paths.
 */
export type SegmentPlanAlignment =
  | "aligned"    // Hit the expected planned surface on-segment
  | "diverged"   // Should have hit planned surface but didn't (or off-segment)
  | "unplanned"; // No plan for this segment (after cursor or no plan)

/**
 * Why a path segment terminated.
 */
export type TerminationReason =
  | { type: "cursor_reached" }
  | { type: "wall_hit"; surface: Surface }
  | { type: "max_distance" }
  | { type: "max_reflections" };

/**
 * A single segment of the unified trajectory path.
 *
 * Contains all information needed for:
 * - Arrow movement (start, end)
 * - Rendering (planAlignment → color)
 * - Debugging (surface, termination)
 *
 * DESIGN PRINCIPLE: No tolerance-based comparison needed.
 * The planAlignment is known at creation time.
 */
export interface PathSegment {
  /** Start point of segment */
  readonly start: Vector2;
  /** End point of segment */
  readonly end: Vector2;

  /**
   * Surface at the end of this segment.
   * null = segment ends at cursor, max distance, or void.
   */
  readonly endSurface: Surface | null;

  /**
   * How this segment relates to the plan.
   * Set during tracing - no post-hoc comparison.
   */
  readonly planAlignment: SegmentPlanAlignment;

  /**
   * If this segment hit a surface, was it on-segment?
   */
  readonly hitOnSegment: boolean;

  /**
   * Termination reason if this is the last segment.
   */
  readonly termination?: TerminationReason;
}

/**
 * The complete unified trajectory path.
 *
 * DESIGN PRINCIPLE: Single Source of Truth.
 * This is the ONLY path. Both arrow movement and visualization use it.
 *
 * - segments: ALL segments from player to termination (continuous)
 * - cursorSegmentIndex: marks where cursor falls (for solid/dashed styling)
 * - isFullyAligned: DERIVED from segments (not detected by comparison)
 */
export interface UnifiedPath {
  /** All segments from player to termination (continuous path) */
  readonly segments: readonly PathSegment[];

  /**
   * Index of the segment where cursor lies.
   * -1 if cursor is not on the path.
   */
  readonly cursorSegmentIndex: number;

  /**
   * Parametric position of cursor within its segment (0-1).
   * 0 = at start, 1 = at end.
   */
  readonly cursorT: number;

  /**
   * Whether the path successfully reaches cursor without divergence.
   * DERIVED: true if cursorSegmentIndex !== -1 and all prior segments are aligned/unplanned.
   */
  readonly cursorReachable: boolean;

  /**
   * Index of first diverged segment (-1 if none diverged).
   * DERIVED from segments.
   */
  readonly firstDivergedIndex: number;

  /**
   * Whether ALL planned surfaces were hit on-segment.
   * DERIVED: firstDivergedIndex === -1
   */
  readonly isFullyAligned: boolean;

  /**
   * Total number of planned surfaces that were expected.
   */
  readonly plannedSurfaceCount: number;

  /**
   * Total path length (sum of all segment lengths).
   */
  readonly totalLength: number;

  // ==========================================================================
  // ACTUAL PHYSICS PATH (New - unified physics calculation)
  // ==========================================================================

  /**
   * The actual physics path segments.
   * Calculated using tracePhysicsPath - only reflects at ON-SEGMENT hits.
   * This is what the actual arrow does, and what dashed-yellow should show.
   *
   * FIRST PRINCIPLE: This is the SINGLE SOURCE OF TRUTH for actual arrow physics.
   * Both the game arrow and dashed-yellow visualization use these segments.
   */
  readonly actualPhysicsSegments: readonly PhysicsSegment[];

  /**
   * Index where actual physics diverges from planned path.
   * -1 if no divergence (paths are identical).
   *
   * Divergence occurs when:
   * - Planned path reflects at an off-segment point
   * - Actual arrow goes straight through (no physical surface to hit)
   */
  readonly physicsDivergenceIndex: number;

  // ==========================================================================
  // UNIFIED PROVENANCE (Shared with Arrow System)
  // ==========================================================================

  /**
   * Waypoints with provenance for arrow system.
   *
   * UNIFIED TYPES: Same SourcePoint types used by trajectory and visibility systems.
   * - First element is OriginPoint (player position)
   * - HitPoints carry surface/ray/t/s for each reflection point
   * - Last may be OriginPoint (cursor) if cursorReachable
   *
   * This enables the arrow to know:
   * - Which surface it will hit at each waypoint
   * - The ray that produced each hit
   * - Parametric position on the surface
   */
  readonly waypointSources?: readonly SourcePoint[];
}

/**
 * A segment of the actual physics path.
 * Simpler than PathSegment - no plan alignment, just pure physics.
 */
export interface PhysicsSegment {
  /** Start point of segment */
  readonly start: Vector2;
  /** End point of segment */
  readonly end: Vector2;
  /** Surface hit at end (null if no hit) */
  readonly endSurface: Surface | null;
  /** Whether hit was on the physical segment (not extended line) */
  readonly hitOnSegment: boolean;
  /** Termination reason if this is the last segment */
  readonly termination?: TerminationReason;
}

