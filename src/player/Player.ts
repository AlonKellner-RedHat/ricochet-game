import type { Surface } from "@/surfaces";
import { TrajectoryCalculator } from "@/trajectory/TrajectoryCalculator";
import type {
  AimingConfig,
  MovementConfig,
  MovementInput,
  MovementState,
  TrajectoryResult,
  Vector2,
} from "@/types";
import { DEFAULT_AIMING_CONFIG, DEFAULT_MOVEMENT_CONFIG } from "@/types";
import type { ArrowCreationData } from "./AimingSystem";
import { AimingSystem } from "./AimingSystem";
import { checkCollisions } from "./CollisionHelper";
import { MovementSystem } from "./MovementSystem";

/**
 * Player - Main player entity that composes movement and aiming systems
 *
 * The two systems are independent:
 * - MovementSystem: Handles physics-based platformer movement (keyboard)
 * - AimingSystem: Handles trajectory planning and shooting (mouse)
 */
export class Player {
  private movementSystem: MovementSystem;
  private aimingSystem: AimingSystem;
  private movementConfig: MovementConfig;

  constructor(
    spawnPoint: Vector2,
    movementConfig: MovementConfig = DEFAULT_MOVEMENT_CONFIG,
    aimingConfig: AimingConfig = DEFAULT_AIMING_CONFIG,
    trajectoryCalculator?: TrajectoryCalculator
  ) {
    this.movementConfig = movementConfig;
    this.movementSystem = new MovementSystem(spawnPoint, movementConfig);
    this.aimingSystem = new AimingSystem(
      trajectoryCalculator ?? new TrajectoryCalculator(),
      aimingConfig
    );
  }

  // =========================================================================
  // Movement System Getters
  // =========================================================================

  get position(): Vector2 {
    return this.movementSystem.position;
  }

  get velocity(): Vector2 {
    return this.movementSystem.velocity;
  }

  get state(): MovementState {
    return this.movementSystem.state;
  }

  get isGrounded(): boolean {
    return this.movementSystem.isGrounded;
  }

  /**
   * Get the position where arrows originate (bow position)
   * Offset from player center
   */
  get bowPosition(): Vector2 {
    const pos = this.position;
    return {
      x: pos.x + 20,
      y: pos.y - 10,
    };
  }

  // =========================================================================
  // Aiming System Getters
  // =========================================================================

  get aimDirection(): Vector2 {
    return this.aimingSystem.aimDirection;
  }

  get plannedSurfaces(): readonly Surface[] {
    return this.aimingSystem.plannedSurfaces;
  }

  get trajectoryResult(): TrajectoryResult {
    return this.aimingSystem.trajectoryResult;
  }

  // =========================================================================
  // Update Methods
  // =========================================================================

  /**
   * Update player movement with collisions
   *
   * @param delta - Time since last frame in seconds
   * @param input - Movement input from keyboard
   * @param surfaces - All surfaces for collision detection
   */
  updateMovement(delta: number, input: MovementInput, surfaces: readonly Surface[]): void {
    // Update movement physics
    this.movementSystem.update(delta, input);

    // Check and resolve collisions
    this.handleCollisions(surfaces);
  }

  /**
   * Update aiming system
   *
   * @param mousePosition - Current mouse position in world coordinates
   * @param surfaces - All surfaces in the level
   */
  updateAiming(mousePosition: Vector2, surfaces: readonly Surface[]): void {
    this.aimingSystem.update(mousePosition, this.bowPosition, surfaces);
  }

  /**
   * Combined update for both movement and aiming
   */
  update(
    delta: number,
    movementInput: MovementInput,
    mousePosition: Vector2,
    surfaces: readonly Surface[]
  ): void {
    this.updateMovement(delta, movementInput, surfaces);
    this.updateAiming(mousePosition, surfaces);
  }

  // =========================================================================
  // Aiming Actions
  // =========================================================================

  /**
   * Toggle a surface in the shot plan
   * @returns true if added, false if removed
   */
  toggleSurfaceInPlan(surface: Surface): boolean {
    return this.aimingSystem.toggleSurfaceInPlan(surface);
  }

  /**
   * Check if a surface is in the current plan
   */
  isSurfaceInPlan(surface: Surface): boolean {
    return this.aimingSystem.isSurfaceInPlan(surface);
  }

  /**
   * Get the index of a surface in the plan (1-based for display)
   */
  getSurfacePlanIndex(surface: Surface): number {
    return this.aimingSystem.getSurfacePlanIndex(surface);
  }

  /**
   * Clear all planned surfaces
   */
  clearPlan(): void {
    this.aimingSystem.clearPlan();
  }

  /**
   * Check if player can shoot
   */
  canShoot(): boolean {
    return this.aimingSystem.canShoot();
  }

  /**
   * Attempt to shoot an arrow
   * @returns Arrow creation data if shot was fired, null if on cooldown
   */
  shoot(): ArrowCreationData | null {
    return this.aimingSystem.shoot(this.bowPosition);
  }

  // =========================================================================
  // Collision Handling
  // =========================================================================

  /**
   * Handle all collision detection and resolution
   */
  private handleCollisions(surfaces: readonly Surface[]): void {
    const position = this.movementSystem.position;
    const velocity = this.movementSystem.velocity;

    const collision = checkCollisions(
      position,
      velocity,
      this.movementConfig.playerWidth,
      this.movementConfig.playerHeight,
      surfaces
    );

    // Apply collision responses
    if (collision.grounded) {
      this.movementSystem.setGrounded(true, collision.groundY);
    } else {
      this.movementSystem.setGrounded(false);
    }

    if (collision.hitCeiling && collision.ceilingY !== undefined) {
      this.movementSystem.hitCeiling(collision.ceilingY);
    }

    if (collision.hitLeftWall && collision.leftWallX !== undefined) {
      this.movementSystem.hitWall(collision.leftWallX, true);
    }

    if (collision.hitRightWall && collision.rightWallX !== undefined) {
      this.movementSystem.hitWall(collision.rightWallX, false);
    }
  }

  // =========================================================================
  // Utility Methods
  // =========================================================================

  /**
   * Reset player to spawn point
   */
  reset(spawnPoint: Vector2): void {
    this.movementSystem.setPosition(spawnPoint);
    this.movementSystem.resetVelocity();
    this.aimingSystem.clearPlan();
  }

  /**
   * Get player bounds for rendering/collision
   */
  getBounds(): { left: number; right: number; top: number; bottom: number } {
    return this.movementSystem.getBounds();
  }

  /**
   * Get the movement config
   */
  getConfig(): MovementConfig {
    return this.movementConfig;
  }
}
