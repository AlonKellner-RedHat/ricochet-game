/**
 * TrajectoryEngine - Main implementation of ITrajectoryEngine
 *
 * Manages calculation caching and invalidation.
 * Uses dirty flags to track what needs recalculation.
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import type { SurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";
import { extractSurfacesFromChains } from "@/trajectory-v2/geometry/RayCasting";
import { createReflectionCache, type ReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import { TrajectoryDebugLogger } from "../TrajectoryDebugLogger";

/**
 * Two-path architecture is now the default.
 * This flag is kept for backward compatibility but should always be true.
 *
 * The new architecture:
 * - SimpleTrajectoryCalculator.calculateSimpleTrajectory() - main entry
 * - ActualPathCalculator - forward physics (~90 lines)
 * - PlannedPathCalculator - bidirectional images (~95 lines)
 * - DivergenceDetector - waypoint comparison (~70 lines)
 * - DualPathRenderer - color derivation (~100 lines)
 *
 * @deprecated This flag will be removed in a future version.
 */
export const USE_TWO_PATH_ARCHITECTURE = true;
import { buildBackwardImages, buildForwardImages } from "./ImageCache";
import { buildActualPath, buildPlannedPath, calculateAlignment, tracePhysicalPath } from "./PathBuilder";
import { evaluateBypass, type BypassResult } from "./BypassEvaluator";
import { calculateActualPathUnified, type ActualPathUnified } from "./ActualPathCalculator";
import type { ITrajectoryEngine } from "./ITrajectoryEngine";
import type {
  AlignmentResult,
  EngineResults,
  EngineResultsCallback,
  GhostPoint,
  ImageSequence,
  PathResult,
  ShaderUniforms,
  UnifiedPath,
  Unsubscribe,
} from "./types";

/**
 * Dirty flags for cache invalidation.
 */
interface DirtyFlags {
  bypass: boolean;
  playerImages: boolean;
  cursorImages: boolean;
  plannedPath: boolean;
  actualPath: boolean;
  actualPathUnified: boolean;
  alignment: boolean;
  ghost: boolean;
  unifiedPath: boolean;
}

/**
 * Cached calculation results.
 */
interface CachedResults {
  bypass: BypassResult | null;
  playerImages: ImageSequence | null;
  cursorImages: ImageSequence | null;
  plannedPath: PathResult | null;
  actualPath: PathResult | null;
  actualPathUnified: ActualPathUnified | null;
  alignment: AlignmentResult | null;
  plannedGhost: readonly GhostPoint[];
  actualGhost: readonly GhostPoint[];
  unifiedPath: UnifiedPath | null;
  reflectionCache: ReflectionCache | null;
}

/**
 * TrajectoryEngine implementation.
 */
export class TrajectoryEngine implements ITrajectoryEngine {
  // Input state
  private player: Vector2 = { x: 0, y: 0 };
  private cursor: Vector2 = { x: 0, y: 0 };
  private plannedSurfaces: readonly Surface[] = [];
  private allSurfaces: readonly Surface[] = [];
  
  // SurfaceChain support (unified with visibility system)
  private allChains: readonly SurfaceChain[] = [];

  // Cache management
  private dirty: DirtyFlags = {
    bypass: true,
    playerImages: true,
    cursorImages: true,
    plannedPath: true,
    actualPath: true,
    actualPathUnified: true,
    alignment: true,
    ghost: true,
    unifiedPath: true,
  };

  private cache: CachedResults = {
    bypass: null,
    playerImages: null,
    cursorImages: null,
    plannedPath: null,
    actualPath: null,
    actualPathUnified: null,
    alignment: null,
    plannedGhost: [],
    actualGhost: [],
    unifiedPath: null,
    reflectionCache: null,
  };

  // Event subscribers
  private subscribers: Set<EngineResultsCallback> = new Set();

  // =========================================================================
  // INPUT SETTERS
  // =========================================================================

  setPlayer(position: Vector2): void {
    if (this.player.x === position.x && this.player.y === position.y) {
      return; // No change
    }
    this.player = position;
    this.dirty.bypass = true;
    this.dirty.playerImages = true;
    this.dirty.plannedPath = true;
    this.dirty.actualPath = true;
    this.dirty.actualPathUnified = true;
    this.dirty.alignment = true;
    this.dirty.ghost = true;
    this.dirty.unifiedPath = true;
  }

  setCursor(position: Vector2): void {
    if (this.cursor.x === position.x && this.cursor.y === position.y) {
      return; // No change
    }
    this.cursor = position;
    this.dirty.bypass = true;
    this.dirty.cursorImages = true;
    this.dirty.plannedPath = true;
    this.dirty.actualPath = true;
    this.dirty.actualPathUnified = true;
    this.dirty.alignment = true;
    this.dirty.ghost = true;
    this.dirty.unifiedPath = true;
  }

  setPlannedSurfaces(surfaces: readonly Surface[]): void {
    // Simple reference check (could be improved with deep comparison)
    if (this.plannedSurfaces === surfaces) {
      return;
    }
    this.plannedSurfaces = surfaces;
    this.dirty.bypass = true;
    this.dirty.playerImages = true;
    this.dirty.cursorImages = true;
    this.dirty.plannedPath = true;
    this.dirty.actualPath = true;
    this.dirty.actualPathUnified = true;
    this.dirty.alignment = true;
    this.dirty.ghost = true;
    this.dirty.unifiedPath = true;
  }

  setAllSurfaces(surfaces: readonly Surface[]): void {
    if (this.allSurfaces === surfaces) {
      return;
    }
    this.allSurfaces = surfaces;
    this.dirty.bypass = true;
    this.dirty.actualPath = true;
    this.dirty.actualPathUnified = true;
    this.dirty.alignment = true;
    this.dirty.ghost = true;
    this.dirty.unifiedPath = true;
  }

  /**
   * Set all surface chains for unified trajectory/visibility calculation.
   *
   * SurfaceChains are the unified input type shared by both trajectory
   * and visibility systems. This method extracts Surface[] for backward
   * compatibility while storing chains for future unified operations.
   *
   * @param chains SurfaceChains containing all obstacles
   */
  setChains(chains: readonly SurfaceChain[]): void {
    if (this.allChains === chains) {
      return;
    }
    this.allChains = chains;
    // Extract surfaces for backward compatibility
    this.allSurfaces = extractSurfacesFromChains(chains);
    this.dirty.bypass = true;
    this.dirty.actualPath = true;
    this.dirty.actualPathUnified = true;
    this.dirty.alignment = true;
    this.dirty.ghost = true;
    this.dirty.unifiedPath = true;
  }

  /**
   * Get the current surface chains.
   */
  getChains(): readonly SurfaceChain[] {
    return this.allChains;
  }

  // =========================================================================
  // CACHED GETTERS
  // =========================================================================

  /**
   * Get cached bypass evaluation result.
   * 
   * UNIFIED BYPASS: This is the SINGLE source of bypass evaluation.
   * Both plannedPath and actualPath use this same result.
   */
  getBypassResult(): BypassResult {
    if (this.dirty.bypass || !this.cache.bypass) {
      this.cache.bypass = evaluateBypass(
        this.player,
        this.cursor,
        this.plannedSurfaces,
        this.allSurfaces
      );
      this.dirty.bypass = false;
    }
    return this.cache.bypass;
  }

  getPlayerImages(): ImageSequence {
    if (this.dirty.playerImages || !this.cache.playerImages) {
      this.cache.playerImages = buildForwardImages(this.player, this.plannedSurfaces);
      this.dirty.playerImages = false;
    }
    return this.cache.playerImages;
  }

  getCursorImages(): ImageSequence {
    if (this.dirty.cursorImages || !this.cache.cursorImages) {
      this.cache.cursorImages = buildBackwardImages(this.cursor, this.plannedSurfaces);
      this.dirty.cursorImages = false;
    }
    return this.cache.cursorImages;
  }

  getPlannedPath(): PathResult {
    if (this.dirty.plannedPath || !this.cache.plannedPath) {
      // UNIFIED BYPASS: Pass shared bypass result
      const bypassResult = this.getBypassResult();
      this.cache.plannedPath = buildPlannedPath(
        this.player,
        this.cursor,
        this.plannedSurfaces,
        this.allSurfaces,
        bypassResult
      );
      this.dirty.plannedPath = false;
    }
    return this.cache.plannedPath;
  }

  getActualPath(): PathResult {
    if (this.dirty.actualPath || !this.cache.actualPath) {
      // UNIFIED BYPASS: Pass shared bypass result
      const bypassResult = this.getBypassResult();
      this.cache.actualPath = buildActualPath(
        this.player,
        this.cursor,
        this.plannedSurfaces,
        this.allSurfaces,
        10, // maxReflections
        bypassResult
      );
      this.dirty.actualPath = false;
    }
    return this.cache.actualPath;
  }

  /**
   * Get the actual path using unified image-based reflection.
   *
   * NEW: Uses calculateActualPathUnified which:
   * - Uses RayPropagator for consistent reflection paradigm
   * - Shares ReflectionCache with visibility system
   * - Returns ActualPathUnified with propagator state
   *
   * This is the preferred method for arrow waypoints as it matches
   * the trajectory preview exactly.
   */
  getActualPathUnified(): ActualPathUnified {
    // Check if we need to recompute (using dedicated dirty flag)
    if (this.dirty.actualPathUnified || !this.cache.actualPathUnified) {
      this.cache.actualPathUnified = calculateActualPathUnified(
        this.player,
        this.cursor,
        this.allSurfaces,
        this.getReflectionCache()
      );
      this.dirty.actualPathUnified = false;
    }
    return this.cache.actualPathUnified;
  }

  /**
   * Get the unified path with inline plan annotations.
   *
   * NEW ARCHITECTURE: This is the single source of truth.
   * - All segments are annotated with plan alignment during tracing
   * - No post-hoc comparison needed
   * - Arrow movement and visualization use the same path
   */
  getUnifiedPath(): UnifiedPath {
    if (this.dirty.unifiedPath || !this.cache.unifiedPath) {
      const bypassResult = this.getBypassResult();
      this.cache.unifiedPath = tracePhysicalPath(
        this.player,
        this.cursor,
        bypassResult,
        this.allSurfaces
      );
      this.dirty.unifiedPath = false;
    }
    return this.cache.unifiedPath;
  }

  getAlignment(): AlignmentResult {
    if (this.dirty.alignment || !this.cache.alignment) {
      const planned = this.getPlannedPath();
      const actual = this.getActualPath();
      this.cache.alignment = calculateAlignment(planned, actual);
      this.dirty.alignment = false;
    }
    return this.cache.alignment;
  }

  getPlannedGhost(): readonly GhostPoint[] {
    if (this.dirty.ghost) {
      this.buildGhostPoints();
    }
    return this.cache.plannedGhost;
  }

  getActualGhost(): readonly GhostPoint[] {
    if (this.dirty.ghost) {
      this.buildGhostPoints();
    }
    return this.cache.actualGhost;
  }

  getResults(): EngineResults {
    // Debug: verify this method is being called
    if (TrajectoryDebugLogger.isEnabled()) {
      console.log("[TrajectoryEngine] getResults() called");
    }

    // Log the input state (if debug enabled)
    TrajectoryDebugLogger.logTrajectory(
      this.player,
      this.cursor,
      this.plannedSurfaces,
      this.allSurfaces
    );

    const bypassResult = this.getBypassResult();
    TrajectoryDebugLogger.logBypass(bypassResult);

    const plannedPath = this.getPlannedPath();
    const actualPath = this.getActualPath();
    const unifiedPath = this.getUnifiedPath();

    // Log paths using adapted format
    if (TrajectoryDebugLogger.isEnabled()) {
      // Log planned path
      TrajectoryDebugLogger.logPlannedPath({
        waypoints: plannedPath.points,
        hits: plannedPath.hitInfo.map(h => ({
          point: h.point,
          surface: h.surface,
          onSegment: h.onSegment,
        })),
        cursorIndex: plannedPath.points.length - 2,
        cursorT: 1,
      });

      // Log actual path
      TrajectoryDebugLogger.logActualPath({
        waypoints: actualPath.points,
        hits: actualPath.hitInfo.map(h => ({
          point: h.point,
          surface: h.surface,
          onSegment: h.onSegment,
          reflected: h.reflected,
        })),
        reachedCursor: unifiedPath.cursorReachable,
        blockedBy: unifiedPath.segments.find(s => s.endSurface && !s.endSurface.isPlannable())?.endSurface,
      });

      // Log divergence
      TrajectoryDebugLogger.logDivergence({
        isAligned: unifiedPath.firstDivergedIndex === -1,
        segmentIndex: unifiedPath.firstDivergedIndex,
        point: unifiedPath.firstDivergedIndex >= 0 && unifiedPath.segments[unifiedPath.firstDivergedIndex]
          ? unifiedPath.segments[unifiedPath.firstDivergedIndex]!.start
          : undefined,
      });
    }

    return {
      playerImages: this.getPlayerImages(),
      cursorImages: this.getCursorImages(),
      plannedPath,
      actualPath,
      actualPathUnified: this.getActualPathUnified(),
      alignment: this.getAlignment(),
      plannedGhost: this.getPlannedGhost(),
      actualGhost: this.getActualGhost(),
      unifiedPath,
      cursor: this.cursor,
      allSurfaces: this.allSurfaces,
      activePlannedSurfaces: bypassResult.activeSurfaces,
      reflectionCache: this.getReflectionCache(),
    };
  }

  /**
   * Get or create the shared ReflectionCache for this calculation cycle.
   * The cache is recreated when inputs change (via dirty flags).
   */
  private getReflectionCache(): ReflectionCache {
    if (!this.cache.reflectionCache || this.dirty.bypass) {
      this.cache.reflectionCache = createReflectionCache();
    }
    return this.cache.reflectionCache;
  }

  // =========================================================================
  // QUERIES
  // =========================================================================

  isPositionReachable(position: Vector2): boolean {
    // Quick check: temporarily set cursor and check alignment
    const oldCursor = this.cursor;
    this.setCursor(position);
    const reachable = this.isCursorReachable();
    this.setCursor(oldCursor);
    return reachable;
  }

  isCursorReachable(): boolean {
    return this.getAlignment().isFullyAligned;
  }

  // =========================================================================
  // GPU SUPPORT
  // =========================================================================

  getShaderUniforms(): ShaderUniforms {
    const playerImages = this.getPlayerImages();

    // Extract positions from player images
    const imagePositions: Vector2[] = playerImages.images.map((img) => img.position);

    // Convert surfaces to vec4 format
    const surfaceVec4s: [number, number, number, number][] = this.allSurfaces.map(
      (s) => [s.segment.start.x, s.segment.start.y, s.segment.end.x, s.segment.end.y]
    );

    return {
      player: this.player,
      playerImages: imagePositions,
      surfaces: surfaceVec4s,
      plannedSurfaceCount: this.plannedSurfaces.length,
      allSurfaceCount: this.allSurfaces.length,
    };
  }

  // =========================================================================
  // EVENTS
  // =========================================================================

  onResultsChanged(callback: EngineResultsCallback): Unsubscribe {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notifySubscribers(): void {
    const results = this.getResults();
    for (const callback of this.subscribers) {
      callback(results);
    }
  }

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  invalidateAll(): void {
    this.dirty = {
      bypass: true,
      playerImages: true,
      cursorImages: true,
      plannedPath: true,
      actualPath: true,
      actualPathUnified: true,
      alignment: true,
      ghost: true,
      unifiedPath: true,
    };
    this.notifySubscribers();
  }

  dispose(): void {
    this.subscribers.clear();
    this.cache = {
      bypass: null,
      playerImages: null,
      cursorImages: null,
      plannedPath: null,
      actualPath: null,
      actualPathUnified: null,
      alignment: null,
      plannedGhost: [],
      actualGhost: [],
      unifiedPath: null,
      reflectionCache: null,
    };
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private buildGhostPoints(): void {
    // TODO: Implement ghost point calculation
    // For now, just mark as clean
    this.cache.plannedGhost = [];
    this.cache.actualGhost = [];
    this.dirty.ghost = false;
  }
}

/**
 * Factory function to create a trajectory engine.
 */
export function createTrajectoryEngine(): ITrajectoryEngine {
  return new TrajectoryEngine();
}

/**
 * Factory function to create a ray-based trajectory engine.
 *
 * The ray-based engine uses the new RayPathBuilder for path calculations,
 * which uses ImageChain rays for exact geometry matching.
 *
 * This is useful for:
 * - Testing V.5 correlation (visibility matches trajectory)
 * - Debugging path calculation issues
 * - Comparing results between old and new implementations
 */
export function createRayBasedTrajectoryEngine(): ITrajectoryEngine {
  // For now, returns the same engine since RayPathBuilder produces
  // compatible results. In the future, this could use a fully ray-based engine.
  return new TrajectoryEngine();
}

/**
 * Configuration for trajectory engine creation.
 */
export interface TrajectoryEngineConfig {
  /** Use ray-based path calculation (default: false) */
  readonly useRayBased?: boolean;
}

/**
 * Factory function with configuration options.
 */
export function createConfiguredTrajectoryEngine(
  config: TrajectoryEngineConfig = {}
): ITrajectoryEngine {
  if (config.useRayBased) {
    return createRayBasedTrajectoryEngine();
  }
  return createTrajectoryEngine();
}

