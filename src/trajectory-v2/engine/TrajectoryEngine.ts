/**
 * TrajectoryEngine - Main implementation of ITrajectoryEngine
 *
 * Manages calculation caching and invalidation.
 * Uses dirty flags to track what needs recalculation.
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";

/**
 * FEATURE FLAG: Use new two-path architecture for rendering.
 *
 * When true:
 *   - Uses calculatePlannedPath + findDivergence + renderDualPath
 *   - Simpler, more principled color logic
 *
 * When false:
 *   - Uses tracePhysicalPath + deriveRender (current behavior)
 *
 * Set to false by default for safety. Enable after validation.
 */
/**
 * FEATURE FLAG: Use new two-path architecture for rendering.
 */
export const USE_TWO_PATH_ARCHITECTURE = true;
import { buildBackwardImages, buildForwardImages } from "./ImageCache";
import { buildActualPath, buildPlannedPath, calculateAlignment, tracePhysicalPath } from "./PathBuilder";
import { evaluateBypass, type BypassResult } from "./BypassEvaluator";
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
  alignment: AlignmentResult | null;
  plannedGhost: readonly GhostPoint[];
  actualGhost: readonly GhostPoint[];
  unifiedPath: UnifiedPath | null;
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

  // Cache management
  private dirty: DirtyFlags = {
    bypass: true,
    playerImages: true,
    cursorImages: true,
    plannedPath: true,
    actualPath: true,
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
    alignment: null,
    plannedGhost: [],
    actualGhost: [],
    unifiedPath: null,
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
    this.dirty.alignment = true;
    this.dirty.ghost = true;
    this.dirty.unifiedPath = true;
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
    const bypassResult = this.getBypassResult();
    return {
      playerImages: this.getPlayerImages(),
      cursorImages: this.getCursorImages(),
      plannedPath: this.getPlannedPath(),
      actualPath: this.getActualPath(),
      alignment: this.getAlignment(),
      plannedGhost: this.getPlannedGhost(),
      actualGhost: this.getActualGhost(),
      unifiedPath: this.getUnifiedPath(),
      cursor: this.cursor,
      allSurfaces: this.allSurfaces,
      activePlannedSurfaces: bypassResult.activeSurfaces,
    };
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
      alignment: null,
      plannedGhost: [],
      actualGhost: [],
      unifiedPath: null,
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

