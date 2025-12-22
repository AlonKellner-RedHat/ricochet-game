/**
 * ITrajectoryEngine - Formal interface for the trajectory calculation engine
 *
 * This is the contract that systems use to interact with trajectory calculations.
 * The engine manages all caching and invalidation internally.
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
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
   */
  getActualPath(): PathResult;

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

