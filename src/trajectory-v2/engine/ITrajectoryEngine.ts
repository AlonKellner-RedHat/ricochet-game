/**
 * ITrajectoryEngine - Formal interface for the trajectory calculation engine
 *
 * This is the contract that systems use to interact with trajectory calculations.
 * The engine manages all caching and invalidation internally.
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import type { SurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";
import type {
  AlignmentResult,
  EngineResults,
  EngineResultsCallback,
  GhostPoint,
  ImageSequence,
  PathResult,
  ShaderUniforms,
  Unsubscribe,
} from "./types";
import type { ActualPathUnified } from "./ActualPathCalculator";

/**
 * The trajectory engine interface.
 *
 * Systems call setters to update inputs, then call getters to retrieve
 * cached calculation results. The engine automatically invalidates
 * and recalculates as needed.
 */
export interface ITrajectoryEngine {
  // =========================================================================
  // INPUT SETTERS
  // =========================================================================

  /**
   * Set the player position.
   * Invalidates: player images, planned path, actual path, alignment
   */
  setPlayer(position: Vector2): void;

  /**
   * Set the cursor position.
   * Invalidates: cursor images, planned path, actual path, alignment
   */
  setCursor(position: Vector2): void;

  /**
   * Set the list of planned surfaces (in order of reflection).
   * Invalidates: all images, planned path, actual path, alignment
   */
  setPlannedSurfaces(surfaces: readonly Surface[]): void;

  /**
   * Set all surfaces in the scene (for obstruction checks).
   * Invalidates: actual path, alignment
   */
  setAllSurfaces(surfaces: readonly Surface[]): void;

  /**
   * Set all surface chains for unified trajectory/visibility calculation.
   *
   * SurfaceChains are the unified input type shared by both trajectory
   * and visibility systems. This enables provenance tracking and
   * junction handling for aligned behavior.
   *
   * Invalidates: actual path, alignment
   */
  setChains(chains: readonly SurfaceChain[]): void;

  /**
   * Get the current surface chains.
   */
  getChains(): readonly SurfaceChain[];

  // =========================================================================
  // CACHED GETTERS
  // =========================================================================

  /**
   * Get the forward player images (player reflected through planned surfaces).
   * Returns cached result if inputs unchanged.
   */
  getPlayerImages(): ImageSequence;

  /**
   * Get the backward cursor images (cursor reflected through surfaces in reverse).
   * Returns cached result if inputs unchanged.
   */
  getCursorImages(): ImageSequence;

  /**
   * Get the planned trajectory path.
   * Uses bidirectional image reflection.
   */
  getPlannedPath(): PathResult;

  /**
   * Get the actual trajectory path.
   * Uses forward physics with obstruction checks.
   *
   * @deprecated Use getActualPathUnified() instead for consistent
   * image-based reflection paradigm with visibility system.
   */
  getActualPath(): PathResult;

  /**
   * Get the actual path using unified image-based reflection.
   *
   * This is the preferred method for arrow waypoints as it:
   * - Uses RayPropagator for consistent reflection paradigm
   * - Shares ReflectionCache with visibility system
   * - Returns ActualPathUnified with propagator state
   */
  getActualPathUnified(): ActualPathUnified;

  /**
   * Get alignment between planned and actual paths.
   * This is the single source of truth for rendering and validity.
   */
  getAlignment(): AlignmentResult;

  /**
   * Get ghost points beyond the planned path.
   */
  getPlannedGhost(): readonly GhostPoint[];

  /**
   * Get ghost points for the actual path.
   */
  getActualGhost(): readonly GhostPoint[];

  /**
   * Get all results in one call.
   * More efficient than calling individual getters.
   */
  getResults(): EngineResults;

  // =========================================================================
  // QUERIES
  // =========================================================================

  /**
   * Check if a position is reachable given current planned surfaces.
   * Useful for UI feedback without full recalculation.
   */
  isPositionReachable(position: Vector2): boolean;

  /**
   * Check if the cursor is currently reachable.
   * Equivalent to getAlignment().isFullyAligned.
   */
  isCursorReachable(): boolean;

  // =========================================================================
  // GPU SUPPORT
  // =========================================================================

  /**
   * Get shader uniforms for GPU-based rendering.
   */
  getShaderUniforms(): ShaderUniforms;

  // =========================================================================
  // EVENTS
  // =========================================================================

  /**
   * Subscribe to result changes.
   * Called after any calculation that changes results.
   */
  onResultsChanged(callback: EngineResultsCallback): Unsubscribe;

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  /**
   * Force recalculation of all cached values.
   */
  invalidateAll(): void;

  /**
   * Clean up resources.
   */
  dispose(): void;
}

