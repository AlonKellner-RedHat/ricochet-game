/**
 * Core type definitions for the Ricochet game
 */

// =============================================================================
// MATH TYPES
// =============================================================================

/** 2D Vector representation (immutable) */
export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

/** Line segment defined by two endpoints */
export interface LineSegment {
  readonly start: Vector2;
  readonly end: Vector2;
}

/** Ray defined by origin and direction */
export interface Ray {
  readonly origin: Vector2;
  readonly direction: Vector2; // Should be normalized
}

/** Result of ray-segment intersection test */
export interface RaySegmentHit {
  readonly hit: boolean;
  readonly point: Vector2 | null;
  readonly t: number; // Distance along ray
  readonly s: number; // Position along segment (0-1)
  readonly normal: Vector2 | null;
}

// =============================================================================
// TRAJECTORY TYPES
// =============================================================================

/** A point along a trajectory path */
export interface TrajectoryPoint {
  readonly position: Vector2;
  readonly surfaceId: string | null;
  readonly isPlanned: boolean;
}

/** Status of trajectory validation */
export type TrajectoryStatus =
  | "valid" // All planned surfaces hit in order
  | "missed_segment" // Cursor position misses the surface segment (but hits infinite line)
  | "hit_obstacle" // Hit a non-ricochet surface before completing plan
  | "out_of_range"; // Path exceeded max distance

/** A point along the ghost (extended) trajectory */
export interface GhostPoint {
  readonly position: Vector2;
  readonly surfaceId: string | null;
  readonly willStick: boolean; // True if arrow will stick here (exhausted or hit wall)
}

/** Result of trajectory calculation (legacy - use DualTrajectoryResult for new code) */
export interface TrajectoryResult {
  readonly points: TrajectoryPoint[];
  readonly ghostPoints: GhostPoint[]; // Extended path past cursor
  readonly status: TrajectoryStatus;
  readonly failedAtPlanIndex: number; // -1 if valid
  readonly totalDistance: number;
  readonly exhaustionDistance: number; // Distance at which arrow becomes exhausted
}

// =============================================================================
// DUAL TRAJECTORY TYPES (Single source of truth for validity AND rendering)
// =============================================================================

/**
 * Result from image reflection calculation
 * Both trajectories share these computed values for exact alignment
 */
export interface ImageReflectionResult {
  /** Path points: [player, hit1, hit2, ..., cursor] */
  readonly path: Vector2[];
  /** Per-surface: did the hit land on the actual segment (not infinite extension)? */
  readonly hitOnSegment: boolean[];
  /** Convenience: all hits landed on segments */
  readonly isFullyAligned: boolean;
  /** Index of first miss (-1 if fully aligned) */
  readonly firstMissIndex: number;
}

/**
 * Alignment result - SINGLE SOURCE OF TRUTH for both rendering and validity
 * If isFullyAligned is true, arrow follows planned path
 * If false, arrow follows actual path
 */
export interface AlignmentResult {
  /** True if all planned surfaces are hit on their actual segments */
  readonly isFullyAligned: boolean;
  /** Number of consecutive segments that align (for rendering green solid) */
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
 * A trajectory path (either planned or actual)
 */
export interface TrajectoryPath {
  /** Main path points from player to cursor/endpoint */
  readonly points: Vector2[];
  /** Extended ghost path beyond the main path */
  readonly ghostPoints: GhostPoint[];
}

/**
 * Information about a surface that was bypassed (temporarily skipped)
 */
export interface BypassedSurfaceInfo {
  /** The surface that was bypassed */
  readonly surfaceId: string;
  /** Reason for bypassing */
  readonly reason: string;
  /** Original index in planned surfaces list */
  readonly index: number;
}

/**
 * Dual trajectory result containing both planned and actual paths
 * Uses shared calculation to ensure exact value matches for aligned segments
 */
export interface DualTrajectoryResult {
  /** Planned trajectory - follows all planned surfaces (may hit infinite extensions) */
  readonly planned: TrajectoryPath;
  /** Actual trajectory - follows plan until miss, then forward ray-cast */
  readonly actual: TrajectoryPath;
  /** Alignment info - used for BOTH rendering colors AND arrow waypoint selection */
  readonly alignment: AlignmentResult;
  /** True if cursor can be reached by arrow (no obstacles blocking, valid reflection) */
  readonly isCursorReachable: boolean;
  /** Surfaces that were bypassed (temporarily skipped) during path building */
  readonly bypassedSurfaces: BypassedSurfaceInfo[];
}

// =============================================================================
// SURFACE TYPES
// =============================================================================

/** Result type when arrow hits a surface */
export type HitResultType = "reflect" | "stick" | "pass_through" | "destroy";

/** Result of arrow hitting a surface */
export interface HitResult {
  readonly type: HitResultType;
  readonly reflectedDirection?: Vector2;
  readonly damage?: number;
  readonly effects?: Effect[];
}

/** Visual properties for rendering a surface */
export interface SurfaceVisualProperties {
  readonly color: number;
  readonly lineWidth: number;
  readonly alpha: number;
  readonly glow?: boolean;
}

/** Serializable surface data for level storage */
export interface SurfaceData {
  readonly id: string;
  readonly type: "ricochet" | "wall" | "breakable";
  readonly segment: {
    readonly start: Vector2;
    readonly end: Vector2;
  };
  readonly properties?: Record<string, unknown>;
}

// =============================================================================
// TARGET TYPES
// =============================================================================

/** Visual properties for rendering a target */
export interface TargetVisualProperties {
  readonly color: number;
  readonly radius: number;
  readonly alpha: number;
  readonly pulseSpeed?: number;
}

/** Serializable target data for level storage */
export interface TargetData {
  readonly id: string;
  readonly type: "basic" | "multi_hit" | "trigger";
  readonly position: Vector2;
  readonly hitRadius: number;
  readonly properties?: Record<string, unknown>;
}

/** Serializable trigger action data */
export interface TriggerActionData {
  readonly type: string;
  readonly params: Record<string, unknown>;
}

// =============================================================================
// PLAYER TYPES
// =============================================================================

/** Movement state machine states */
export type MovementState = "idle" | "running" | "jumping" | "falling";

/** Movement input from keyboard */
export interface MovementInput {
  readonly left: boolean;
  readonly right: boolean;
  readonly jump: boolean;
  readonly jumpHeld: boolean;
}

/** Configuration for player movement physics */
export interface MovementConfig {
  // Horizontal movement
  readonly maxSpeed: number;
  readonly acceleration: number;
  readonly deceleration: number;
  readonly airControl: number;

  // Vertical movement
  readonly jumpVelocity: number;
  readonly jumpCutMultiplier: number;
  readonly gravity: number;
  readonly maxFallSpeed: number;

  // Collision
  readonly playerWidth: number;
  readonly playerHeight: number;
  readonly groundCheckDistance: number;
}

/** Configuration for aiming system */
export interface AimingConfig {
  readonly maxArrowDistance: number;
  readonly shootCooldown: number;
}

/** Combined game input for a frame */
export interface GameInput {
  readonly movement: MovementInput;
  readonly mousePosition: Vector2;
  readonly click: boolean;
}

// =============================================================================
// ARROW TYPES
// =============================================================================

/** Arrow flight states */
export type ArrowState = "flying" | "exhausted" | "stuck";

// =============================================================================
// LEVEL TYPES
// =============================================================================

/** Complete level data for serialization */
export interface LevelData {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly bounds: {
    readonly width: number;
    readonly height: number;
  };
  readonly spawnPoint: Vector2;
  readonly surfaces: SurfaceData[];
  readonly targets: TargetData[];
}

/** Level metadata for level browser */
export interface LevelMetadata {
  readonly id: string;
  readonly name: string;
  readonly lastModified: Date;
}

// =============================================================================
// EDITOR TYPES
// =============================================================================

/** Editor mode */
export type EditorMode = "play" | "edit";

/** Surface tool configuration */
export interface SurfaceToolConfig {
  surfaceType: "ricochet" | "wall" | "breakable";
  snapToGrid: boolean;
  gridSize: number;
}

/** Target tool configuration */
export interface TargetToolConfig {
  targetType: "basic" | "multi_hit" | "trigger";
  hitsRequired: number;
  triggerActionType: string;
}

/** Bounds rectangle */
export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// =============================================================================
// EFFECT TYPES (for extensibility)
// =============================================================================

/** Base effect interface for hit effects, particles, sounds, etc. */
export interface Effect {
  readonly type: string;
  readonly params?: Record<string, unknown>;
}

// =============================================================================
// EXISTING TYPES (preserved from original)
// =============================================================================

/** Game configuration options */
export interface GameOptions {
  readonly width: number;
  readonly height: number;
  readonly backgroundColor: number;
  readonly useWebGPU: boolean;
  /**
   * Force Canvas renderer instead of WebGL.
   * Canvas mode properly supports ERASE blend mode (destination-out),
   * which is needed for correct multi-stage visibility overlay rendering.
   */
  readonly forceCanvas?: boolean;
}

/** Grid cell position */
export interface GridPosition {
  readonly row: number;
  readonly col: number;
}

/** Entity state for game objects */
export interface EntityState {
  readonly id: string;
  readonly position: Vector2;
  readonly velocity: Vector2;
  readonly active: boolean;
}

/** Input state tracking */
export interface InputState {
  readonly pointer: Vector2;
  readonly isPointerDown: boolean;
  readonly keys: Set<string>;
}

/** Debug information display */
export interface DebugInfo {
  fps: number;
  entityCount: number;
  renderer: string;
  [key: string]: string | number | boolean;
}

// =============================================================================
// DEFAULT CONFIGURATIONS
// =============================================================================

/** Default movement physics configuration */
export const DEFAULT_MOVEMENT_CONFIG: MovementConfig = {
  maxSpeed: 280,
  acceleration: 4000, // Much faster acceleration for snappy response
  deceleration: 5000, // Much faster deceleration - stops almost instantly
  airControl: 0.85, // Better air control
  jumpVelocity: 480,
  jumpCutMultiplier: 0.5,
  gravity: 1400, // Slightly stronger gravity for tighter jumps
  maxFallSpeed: 800,
  playerWidth: 32,
  playerHeight: 48,
  groundCheckDistance: 2,
};

/** Default aiming configuration */
export const DEFAULT_AIMING_CONFIG: AimingConfig = {
  maxArrowDistance: 2000,
  shootCooldown: 0.3,
};

/** Arrow speed constant (legacy - use DEFAULT_ARROW_CONFIG) */
export const ARROW_SPEED = 5000;

/** Default range limit radius (40 player heights) */
export const DEFAULT_RANGE_LIMIT_RADIUS = DEFAULT_MOVEMENT_CONFIG.playerHeight * 40;
