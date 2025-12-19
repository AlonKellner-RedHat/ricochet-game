import { Vec2 } from "@/math/Vec2";
import type { MovementConfig, MovementInput, MovementState, Vector2 } from "@/types";
import { DEFAULT_MOVEMENT_CONFIG } from "@/types";

/**
 * MovementSystem - Handles physics-based platformer movement
 *
 * State machine with states: idle, running, jumping, falling
 * Features: acceleration, deceleration, variable jump height, gravity
 */
export class MovementSystem {
  private _position: Vector2;
  private _velocity: Vector2 = { x: 0, y: 0 };
  private _state: MovementState = "idle";
  private _isGrounded = false;
  private config: MovementConfig;

  constructor(startPosition: Vector2, config: MovementConfig = DEFAULT_MOVEMENT_CONFIG) {
    this._position = { ...startPosition };
    this.config = config;
  }

  // Getters for readonly access
  get position(): Vector2 {
    return { ...this._position };
  }

  get velocity(): Vector2 {
    return { ...this._velocity };
  }

  get state(): MovementState {
    return this._state;
  }

  get isGrounded(): boolean {
    return this._isGrounded;
  }

  /**
   * Update movement based on input and delta time
   * @param delta - Time since last frame in seconds
   * @param input - Current movement input
   */
  update(delta: number, input: MovementInput): void {
    // 1. Handle horizontal input (acceleration/deceleration)
    this.handleHorizontalMovement(delta, input);

    // 2. Handle jump input
    this.handleJump(input);

    // 3. Apply gravity
    this.applyGravity(delta);

    // 4. Apply velocity to position
    this._position = Vec2.add(this._position, Vec2.scale(this._velocity, delta));

    // 5. Update state based on current conditions
    this.updateState(input);
  }

  /**
   * Handle horizontal acceleration and deceleration
   */
  private handleHorizontalMovement(delta: number, input: MovementInput): void {
    // Determine acceleration based on grounded state
    const accel = this._isGrounded
      ? this.config.acceleration
      : this.config.acceleration * this.config.airControl;

    const decel = this._isGrounded
      ? this.config.deceleration
      : this.config.deceleration * this.config.airControl;

    if (input.left && !input.right) {
      // Accelerate left
      this._velocity = {
        x: Math.max(this._velocity.x - accel * delta, -this.config.maxSpeed),
        y: this._velocity.y,
      };
    } else if (input.right && !input.left) {
      // Accelerate right
      this._velocity = {
        x: Math.min(this._velocity.x + accel * delta, this.config.maxSpeed),
        y: this._velocity.y,
      };
    } else {
      // Decelerate (apply friction)
      if (this._velocity.x > 0) {
        this._velocity = {
          x: Math.max(0, this._velocity.x - decel * delta),
          y: this._velocity.y,
        };
      } else if (this._velocity.x < 0) {
        this._velocity = {
          x: Math.min(0, this._velocity.x + decel * delta),
          y: this._velocity.y,
        };
      }
    }
  }

  /**
   * Handle jump initiation and variable jump height
   */
  private handleJump(input: MovementInput): void {
    // Start jump when grounded and jump pressed
    if (input.jump && this._isGrounded) {
      this._velocity = {
        x: this._velocity.x,
        y: -this.config.jumpVelocity,
      };
      this._isGrounded = false;
      this._state = "jumping";
    }

    // Variable jump height - cut velocity when jump released early
    if (this._state === "jumping" && !input.jumpHeld && this._velocity.y < 0) {
      this._velocity = {
        x: this._velocity.x,
        y: this._velocity.y * this.config.jumpCutMultiplier,
      };
      this._state = "falling";
    }
  }

  /**
   * Apply gravity when airborne
   */
  private applyGravity(delta: number): void {
    if (!this._isGrounded) {
      this._velocity = {
        x: this._velocity.x,
        y: Math.min(this._velocity.y + this.config.gravity * delta, this.config.maxFallSpeed),
      };

      // Transition from jumping to falling at apex
      if (this._state === "jumping" && this._velocity.y >= 0) {
        this._state = "falling";
      }
    }
  }

  /**
   * Update state based on current conditions
   */
  private updateState(input: MovementInput): void {
    if (this._isGrounded) {
      if (input.left || input.right) {
        this._state = "running";
      } else if (Math.abs(this._velocity.x) > 0.1) {
        this._state = "running"; // Still sliding
      } else {
        this._state = "idle";
      }
    }
    // Airborne states are handled in jump/gravity logic
  }

  /**
   * Set grounded state and adjust velocity/position
   * Called by collision system
   */
  setGrounded(grounded: boolean, groundY?: number): void {
    // Don't ground the player if they're moving upward (just jumped)
    if (grounded && this._velocity.y < 0) {
      // Player is jumping upward, don't ground them
      this._isGrounded = false;
      return;
    }

    const wasGrounded = this._isGrounded;
    this._isGrounded = grounded;

    if (grounded && !wasGrounded && this._velocity.y >= 0) {
      // Just landed (and was falling, not jumping)
      this._velocity = { x: this._velocity.x, y: 0 };

      // Snap to ground
      if (groundY !== undefined) {
        this._position = {
          x: this._position.x,
          y: groundY - this.config.playerHeight / 2,
        };
      }
    }

    if (!grounded && wasGrounded && this._state !== "jumping") {
      // Walked off edge
      this._state = "falling";
    }
  }

  /**
   * Handle ceiling collision
   */
  hitCeiling(ceilingY: number): void {
    if (this._velocity.y < 0) {
      this._velocity = { x: this._velocity.x, y: 0 };
      this._position = {
        x: this._position.x,
        y: ceilingY + this.config.playerHeight / 2,
      };
      this._state = "falling";
    }
  }

  /**
   * Handle wall collision
   * @param wallX - The X coordinate of the wall
   * @param fromLeft - True if player hit the wall from the left (player's left side touched wall)
   */
  hitWall(wallX: number, fromLeft: boolean): void {
    this._velocity = { x: 0, y: this._velocity.y };

    const halfWidth = this.config.playerWidth / 2;
    if (fromLeft) {
      // Player hit wall with their left side - position player to the right of wall
      this._position = { x: wallX + halfWidth, y: this._position.y };
    } else {
      // Player hit wall with their right side - position player to the left of wall
      this._position = { x: wallX - halfWidth, y: this._position.y };
    }
  }

  /**
   * Set position directly (for teleporting, respawning, etc.)
   */
  setPosition(position: Vector2): void {
    this._position = { ...position };
  }

  /**
   * Reset velocity (for respawning, etc.)
   */
  resetVelocity(): void {
    this._velocity = { x: 0, y: 0 };
    this._state = "idle";
  }

  /**
   * Get player bounds for collision detection
   */
  getBounds(): { left: number; right: number; top: number; bottom: number } {
    const halfWidth = this.config.playerWidth / 2;
    const halfHeight = this.config.playerHeight / 2;

    return {
      left: this._position.x - halfWidth,
      right: this._position.x + halfWidth,
      top: this._position.y - halfHeight,
      bottom: this._position.y + halfHeight,
    };
  }

  /**
   * Get the player's current config
   */
  getConfig(): MovementConfig {
    return this.config;
  }
}
