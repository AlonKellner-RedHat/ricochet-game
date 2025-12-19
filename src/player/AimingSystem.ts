import { Vec2 } from "@/math/Vec2";
import type { Surface } from "@/surfaces";
import type { TrajectoryCalculator } from "@/trajectory/TrajectoryCalculator";
import type { AimingConfig, TrajectoryResult, Vector2 } from "@/types";
import { DEFAULT_AIMING_CONFIG } from "@/types";

/**
 * AimingSystem - Manages aim direction, planned surfaces, and shooting
 *
 * Independent from MovementSystem - can aim while moving, jumping, etc.
 */
export class AimingSystem {
  private _aimDirection: Vector2 = { x: 1, y: 0 };
  private _plannedSurfaces: Surface[] = [];
  private _trajectoryResult: TrajectoryResult;
  private trajectoryCalculator: TrajectoryCalculator;
  private config: AimingConfig;
  private lastShotTime = Number.NEGATIVE_INFINITY;

  constructor(
    trajectoryCalculator: TrajectoryCalculator,
    config: AimingConfig = DEFAULT_AIMING_CONFIG
  ) {
    this.trajectoryCalculator = trajectoryCalculator;
    this.config = config;
    this._trajectoryResult = {
      points: [],
      status: "valid",
      failedAtPlanIndex: -1,
      totalDistance: 0,
    };
  }

  get aimDirection(): Vector2 {
    return { ...this._aimDirection };
  }

  get plannedSurfaces(): readonly Surface[] {
    return [...this._plannedSurfaces];
  }

  get trajectoryResult(): TrajectoryResult {
    return this._trajectoryResult;
  }

  /**
   * Update aim direction and recalculate trajectory
   *
   * @param mousePosition - Current mouse position in world coordinates
   * @param playerPosition - Current player position (bow origin)
   * @param allSurfaces - All surfaces in the level
   */
  update(mousePosition: Vector2, playerPosition: Vector2, allSurfaces: readonly Surface[]): void {
    // Calculate aim direction from player to mouse
    this._aimDirection = Vec2.direction(playerPosition, mousePosition);

    // Recalculate trajectory
    this._trajectoryResult = this.trajectoryCalculator.calculate(
      playerPosition,
      mousePosition,
      this._plannedSurfaces,
      allSurfaces,
      this.config.maxArrowDistance
    );
  }

  /**
   * Toggle a surface in the plan
   * - If not in plan: add to end
   * - If in plan: remove from plan
   *
   * @param surface - Surface to toggle
   * @returns true if surface was added, false if removed
   */
  toggleSurfaceInPlan(surface: Surface): boolean {
    if (!surface.isPlannable()) {
      return false;
    }

    const index = this._plannedSurfaces.findIndex((s) => s.id === surface.id);

    if (index >= 0) {
      // Remove from plan
      this._plannedSurfaces.splice(index, 1);
      return false;
    }
    // Add to plan
    this._plannedSurfaces.push(surface);
    return true;
  }

  /**
   * Check if a surface is in the current plan
   */
  isSurfaceInPlan(surface: Surface): boolean {
    return this._plannedSurfaces.some((s) => s.id === surface.id);
  }

  /**
   * Get the index of a surface in the plan (1-based for display)
   * Returns 0 if not in plan
   */
  getSurfacePlanIndex(surface: Surface): number {
    const index = this._plannedSurfaces.findIndex((s) => s.id === surface.id);
    return index >= 0 ? index + 1 : 0;
  }

  /**
   * Clear all planned surfaces
   */
  clearPlan(): void {
    this._plannedSurfaces = [];
  }

  /**
   * Check if enough time has passed since last shot
   */
  canShoot(): boolean {
    const now = performance.now() / 1000;
    return now - this.lastShotTime >= this.config.shootCooldown;
  }

  /**
   * Attempt to shoot an arrow
   *
   * @returns Arrow creation data if shot was fired, null if on cooldown or invalid trajectory
   */
  shoot(): ArrowCreationData | null {
    if (!this.canShoot()) {
      return null;
    }

    // Need at least 2 points for a valid trajectory
    if (this._trajectoryResult.points.length < 2) {
      return null;
    }

    this.lastShotTime = performance.now() / 1000;

    // Extract waypoints from trajectory result
    const waypoints = this._trajectoryResult.points.map((p) => ({ ...p.position }));

    // Create arrow data with waypoints
    const arrowData: ArrowCreationData = {
      waypoints,
    };

    // Clear plan after shooting
    this.clearPlan();

    return arrowData;
  }

  /**
   * Get the current config
   */
  getConfig(): AimingConfig {
    return { ...this.config };
  }
}

/**
 * Data needed to create an arrow
 */
export interface ArrowCreationData {
  waypoints: Vector2[];
}
