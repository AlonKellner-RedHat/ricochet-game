import type { Surface } from "@/surfaces";
import type { MovementConfig, MovementInput, MovementState, Vector2 } from "@/types";
import { DEFAULT_MOVEMENT_CONFIG } from "@/types";
import { checkCollisions } from "./CollisionHelper";
import { MovementSystem } from "./MovementSystem";

/**
 * Player - Main player entity that composes movement and handles collisions
 */
export class Player {
  private movementSystem: MovementSystem;
  private config: MovementConfig;

  constructor(spawnPoint: Vector2, config: MovementConfig = DEFAULT_MOVEMENT_CONFIG) {
    this.config = config;
    this.movementSystem = new MovementSystem(spawnPoint, config);
  }

  // Position and state getters
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

  /**
   * Update player with movement and collisions
   *
   * @param delta - Time since last frame in seconds
   * @param input - Movement input from keyboard
   * @param surfaces - All surfaces for collision detection
   */
  update(delta: number, input: MovementInput, surfaces: readonly Surface[]): void {
    // Update movement physics
    this.movementSystem.update(delta, input);

    // Check and resolve collisions
    this.handleCollisions(surfaces);
  }

  /**
   * Handle all collision detection and resolution
   */
  private handleCollisions(surfaces: readonly Surface[]): void {
    const position = this.movementSystem.position;
    const velocity = this.movementSystem.velocity;

    const collision = checkCollisions(
      position,
      velocity,
      this.config.playerWidth,
      this.config.playerHeight,
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

  /**
   * Reset player to spawn point
   */
  reset(spawnPoint: Vector2): void {
    this.movementSystem.setPosition(spawnPoint);
    this.movementSystem.resetVelocity();
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
    return this.config;
  }
}
