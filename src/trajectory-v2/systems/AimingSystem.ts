/**
 * AimingSystem - Plan management and shooting
 *
 * Manages:
 * - The list of planned surfaces
 * - Shooting logic (checks alignment before firing)
 * - Events for arrow creation
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import type { EngineResults, PathResult } from "@/trajectory-v2/engine/types";
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
   */
  addSurface(surface: Surface): void {
    if (!this.plannedSurfaces.includes(surface)) {
      this.plannedSurfaces.push(surface);
      this.emitPlanChanged();
    }
  }

  /**
   * Remove a surface from the plan.
   */
  removeSurface(surface: Surface): void {
    const index = this.plannedSurfaces.indexOf(surface);
    if (index !== -1) {
      this.plannedSurfaces.splice(index, 1);
      this.emitPlanChanged();
    }
  }

  /**
   * Toggle a surface in the plan.
   */
  toggleSurface(surface: Surface): void {
    if (this.plannedSurfaces.includes(surface)) {
      this.removeSurface(surface);
    } else {
      this.addSurface(surface);
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

    if (waypoints.length < 2) {
      return false;
    }

    // Start cooldown
    this.cooldownRemaining = this.config.shootCooldown;

    // Emit arrow shot event
    const data: ArrowShotData = {
      waypoints,
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
   */
  getArrowWaypoints(path?: PathResult): readonly Vector2[] {
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

