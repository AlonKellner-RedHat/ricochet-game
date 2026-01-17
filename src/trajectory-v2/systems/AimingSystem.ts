/**
 * AimingSystem - Plan management and shooting
 *
 * Manages:
 * - The list of planned surfaces
 * - Shooting logic (checks alignment before firing)
 * - Events for arrow creation
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { OriginPoint, type SourcePoint } from "@/trajectory-v2/geometry/SourcePoint";
import type { Surface } from "@/surfaces/Surface";
import type { EngineResults, PathResult } from "@/trajectory-v2/engine/types";
import { getArrowWaypointsFromFullTrajectory } from "@/trajectory-v2/engine/FullTrajectoryCalculator";
import type {
  AimingEvent,
  ArrowShotData,
  IEventProducer,
  ITrajectorySystem,
  PlanChangedData,
} from "./ITrajectorySystem";

/**
 * Configuration for the aiming system.
 */
export interface AimingConfig {
  /** Minimum time between shots in seconds */
  readonly shootCooldown: number;
  /** Whether to allow shooting when not fully aligned */
  readonly allowMisalignedShot: boolean;
}

/**
 * Default aiming configuration.
 */
export const DEFAULT_AIMING_CONFIG: AimingConfig = {
  shootCooldown: 0.3,
  allowMisalignedShot: true,
};

/**
 * AimingSystem implementation.
 */
export class AimingSystem
  implements ITrajectorySystem, IEventProducer<AimingEvent>
{
  readonly id = "aiming";

  private config: AimingConfig;
  private plannedSurfaces: Surface[] = [];
  private lastResults: EngineResults | null = null;
  private cooldownRemaining = 0;
  private eventHandlers: Set<(event: AimingEvent) => void> = new Set();

  constructor(config: Partial<AimingConfig> = {}) {
    this.config = { ...DEFAULT_AIMING_CONFIG, ...config };
  }

  onEngineUpdate(results: EngineResults): void {
    this.lastResults = results;
  }

  update(deltaTime: number): void {
    if (this.cooldownRemaining > 0) {
      this.cooldownRemaining = Math.max(0, this.cooldownRemaining - deltaTime);
    }
  }

  dispose(): void {
    this.plannedSurfaces = [];
    this.lastResults = null;
    this.eventHandlers.clear();
  }

  // =========================================================================
  // Event Producer
  // =========================================================================

  onEvent(handler: (event: AimingEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  private emit(event: AimingEvent): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }

  // =========================================================================
  // Plan Management
  // =========================================================================

  /**
   * Add a surface to the plan.
   * Allows duplicates as long as they're not consecutive (multi-bounce support).
   */
  addSurface(surface: Surface): void {
    const lastSurface = this.plannedSurfaces[this.plannedSurfaces.length - 1];
    // Only add if not consecutive (would be same surface twice in a row)
    if (lastSurface?.id !== surface.id) {
      this.plannedSurfaces.push(surface);
      this.emitPlanChanged();
    }
  }

  /**
   * Remove the last occurrence of a surface from the plan.
   */
  removeSurface(surface: Surface): void {
    // Find last occurrence (for multi-bounce support)
    let lastIndex = -1;
    for (let i = this.plannedSurfaces.length - 1; i >= 0; i--) {
      if (this.plannedSurfaces[i]?.id === surface.id) {
        lastIndex = i;
        break;
      }
    }
    if (lastIndex !== -1) {
      this.plannedSurfaces.splice(lastIndex, 1);
      this.emitPlanChanged();
    }
  }

  /**
   * Toggle a surface in the plan.
   * 
   * Multi-bounce behavior:
   * - If surface is the LAST in the plan: remove it
   * - Otherwise: add it (creates duplicate for bounce-back)
   * 
   * This naturally prevents consecutive duplicates since clicking the last
   * surface removes it instead of adding.
   */
  toggleSurface(surface: Surface): void {
    const lastSurface = this.plannedSurfaces[this.plannedSurfaces.length - 1];
    
    if (lastSurface?.id === surface.id) {
      // Clicking last planned surface: remove it
      this.plannedSurfaces.pop();
      this.emitPlanChanged();
    } else {
      // Clicking any other surface: add it (can't be consecutive)
      this.plannedSurfaces.push(surface);
      this.emitPlanChanged();
    }
  }

  /**
   * Clear all planned surfaces.
   */
  clearPlan(): void {
    if (this.plannedSurfaces.length > 0) {
      this.plannedSurfaces = [];
      this.emitPlanChanged();
    }
  }

  /**
   * Get the current planned surfaces.
   */
  getPlannedSurfaces(): readonly Surface[] {
    return this.plannedSurfaces;
  }

  /**
   * Check if a surface is in the plan.
   */
  isInPlan(surface: Surface): boolean {
    return this.plannedSurfaces.includes(surface);
  }

  private emitPlanChanged(): void {
    const data: PlanChangedData = {
      plannedSurfaces: [...this.plannedSurfaces],
    };
    this.emit({ type: "plan_changed", data });
  }

  // =========================================================================
  // Shooting
  // =========================================================================

  /**
   * Attempt to shoot an arrow.
   * @returns True if arrow was shot, false if blocked (cooldown, alignment, etc.)
   */
  shoot(): boolean {
    // Check cooldown
    if (this.cooldownRemaining > 0) {
      return false;
    }

    // Check if we have results
    if (!this.lastResults) {
      return false;
    }

    const { actualPath, alignment } = this.lastResults;

    // Check alignment if required
    if (!this.config.allowMisalignedShot && !alignment.isFullyAligned) {
      return false;
    }

    // Get waypoints for the arrow
    const waypoints = this.getArrowWaypoints(actualPath);
    const waypointSources = this.getArrowWaypointSources();

    if (waypoints.length < 2) {
      return false;
    }

    // Start cooldown
    this.cooldownRemaining = this.config.shootCooldown;

    // Emit arrow shot event with provenance
    const data: ArrowShotData = {
      waypoints,
      waypointSources,
      isFullyAligned: alignment.isFullyAligned,
    };
    this.emit({ type: "arrow_shot", data });

    return true;
  }

  /**
   * Check if shooting is currently possible.
   */
  canShoot(): boolean {
    if (this.cooldownRemaining > 0) {
      return false;
    }

    if (!this.lastResults) {
      return false;
    }

    if (!this.config.allowMisalignedShot) {
      return this.lastResults.alignment.isFullyAligned;
    }

    return true;
  }

  /**
   * Check if cursor is reachable (arrow would reach it).
   */
  isCursorReachable(): boolean {
    return this.lastResults?.alignment.isFullyAligned ?? false;
  }

  /**
   * Get the waypoints the arrow will follow.
   *
   * FIRST PRINCIPLE 2.3: Arrows must follow physically accurate trajectory.
   * - Arrow waypoints include main path points AND forward projection points
   * - Arrow continues past cursor along physical trajectory
   *
   * UNIFIED: Prefers fullTrajectory for exact match with rendered path.
   * This ensures the arrow follows exactly what's shown on screen (green + yellow).
   */
  getArrowWaypoints(path?: PathResult): readonly Vector2[] {
    // PREFER fullTrajectory - same path that's rendered (green + yellow)
    const fullTraj = this.lastResults?.fullTrajectory;
    if (fullTraj && !path) {
      return getArrowWaypointsFromFullTrajectory(fullTraj);
    }

    // Fallback to actualPathUnified
    const unifiedActual = this.lastResults?.actualPathUnified;
    if (unifiedActual && !path) {
      // Combine main path with forward projection
      const waypoints: Vector2[] = [...unifiedActual.waypoints];
      if (unifiedActual.forwardProjection && unifiedActual.forwardProjection.length > 0) {
        waypoints.push(...unifiedActual.forwardProjection);
      }
      return waypoints;
    }

    // Fallback to legacy path
    const actualPath = path || this.lastResults?.actualPath;
    if (!actualPath) {
      return [];
    }

    // Combine main path with forward projection
    const waypoints: Vector2[] = [...actualPath.points];

    // Add projection points for physically accurate trajectory
    if (actualPath.forwardProjection && actualPath.forwardProjection.length > 0) {
      waypoints.push(...actualPath.forwardProjection);
    }

    return waypoints;
  }

  /**
   * Get the waypoint sources with provenance for the arrow.
   *
   * UNIFIED TYPES: Uses same SourcePoint types as trajectory/visibility systems.
   * - OriginPoint for player/cursor positions
   * - HitPoint for surface reflection points with ray/surface/t/s info
   *
   * UNIFIED: Prefers actualPathUnified for consistency with trajectory preview.
   */
  getArrowWaypointSources(): readonly SourcePoint[] {
    if (!this.lastResults) {
      return [];
    }

    // Prefer actualPathUnified for consistent provenance
    const unifiedActual = this.lastResults.actualPathUnified;
    if (unifiedActual?.waypointSources && unifiedActual.waypointSources.length > 0) {
      // Combine with forward projection sources
      const sources: SourcePoint[] = [...unifiedActual.waypointSources];
      if (unifiedActual.forwardProjectionSources && unifiedActual.forwardProjectionSources.length > 0) {
        sources.push(...unifiedActual.forwardProjectionSources);
      }
      return sources;
    }

    // Fallback to legacy unifiedPath
    const unifiedPath = this.lastResults.unifiedPath;
    if (unifiedPath?.waypointSources && unifiedPath.waypointSources.length > 0) {
      return unifiedPath.waypointSources;
    }

    // Final fallback: create OriginPoints from waypoints (no provenance)
    const waypoints = this.getArrowWaypoints();
    return waypoints.map((p) => new OriginPoint(p));
  }

  /**
   * Get remaining cooldown time.
   */
  getCooldownRemaining(): number {
    return this.cooldownRemaining;
  }

  /**
   * Get cooldown as a percentage (0 = ready, 1 = just fired).
   */
  getCooldownPercent(): number {
    if (this.config.shootCooldown <= 0) {
      return 0;
    }
    return this.cooldownRemaining / this.config.shootCooldown;
  }
}

