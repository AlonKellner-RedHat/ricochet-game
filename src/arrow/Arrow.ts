import { RayUtils, raySegmentIntersect } from "@/math/Ray";
import { Vec2 } from "@/math/Vec2";
import type { Surface } from "@/surfaces";
import type { Vector2 } from "@/types";

/**
 * Arrow flight states
 */
export type ArrowState = "perfect" | "exhausted" | "stuck";

/**
 * Arrow configuration
 */
export interface ArrowConfig {
  speed: number; // Pixels per second during perfect flight
  exhaustionGravity: number; // Gravity applied when exhausted
  maxExhaustionSpeed: number; // Terminal velocity when exhausted
  exhaustionDrag: number; // Horizontal drag when exhausted
}

export const DEFAULT_ARROW_CONFIG: ArrowConfig = {
  speed: 800,
  exhaustionGravity: 1200,
  maxExhaustionSpeed: 600,
  exhaustionDrag: 0.98,
};

/**
 * Arrow - Projectile that follows planned trajectory
 *
 * States:
 * - perfect: Travels in straight lines, ricochets off planned surfaces
 * - exhausted: Gravity affects trajectory, slows down
 * - stuck: Embedded in a surface, no longer moving
 */
export class Arrow {
  private _id: string;
  private _position: Vector2;
  private _velocity: Vector2;
  private _state: ArrowState = "perfect";
  // Stuck position tracked via _position when state is "stuck"
  private _stuckAngle = 0;

  private plannedSurfaces: Surface[];
  private nextPlannedIndex = 0;
  private distanceTraveled = 0;
  private maxDistance: number;
  private config: ArrowConfig;

  constructor(
    id: string,
    position: Vector2,
    direction: Vector2,
    plannedSurfaces: Surface[],
    maxDistance: number,
    config: ArrowConfig = DEFAULT_ARROW_CONFIG
  ) {
    this._id = id;
    this._position = { ...position };
    this._velocity = Vec2.scale(Vec2.normalize(direction), config.speed);
    this.plannedSurfaces = [...plannedSurfaces];
    this.maxDistance = maxDistance;
    this.config = config;
  }

  get id(): string {
    return this._id;
  }

  get position(): Vector2 {
    return { ...this._position };
  }

  get velocity(): Vector2 {
    return { ...this._velocity };
  }

  get state(): ArrowState {
    return this._state;
  }

  get angle(): number {
    if (this._state === "stuck") {
      return this._stuckAngle;
    }
    return Math.atan2(this._velocity.y, this._velocity.x);
  }

  get isActive(): boolean {
    return this._state !== "stuck";
  }

  /**
   * Update arrow physics and handle collisions
   *
   * @param delta - Time since last frame in seconds
   * @param surfaces - All surfaces to check collisions against
   */
  update(delta: number, surfaces: readonly Surface[]): void {
    if (this._state === "stuck") {
      return;
    }

    // Calculate movement this frame
    const movement = Vec2.scale(this._velocity, delta);
    const moveDistance = Vec2.length(movement);

    // Check for collisions along the path
    const collision = this.checkCollision(movement, surfaces);

    if (collision) {
      this.handleCollision(collision, surfaces);
    } else {
      // No collision - move normally
      this._position = Vec2.add(this._position, movement);
      this.distanceTraveled += moveDistance;

      // Check for exhaustion
      if (this._state === "perfect" && this.shouldExhaust()) {
        this._state = "exhausted";
      }

      // Apply exhaustion physics
      if (this._state === "exhausted") {
        this.applyExhaustionPhysics(delta);
      }
    }
  }

  /**
   * Check for collision along movement path
   */
  private checkCollision(movement: Vector2, surfaces: readonly Surface[]): CollisionInfo | null {
    const ray = RayUtils.create(this._position, Vec2.normalize(movement));
    const moveDistance = Vec2.length(movement);

    let closestHit: CollisionInfo | null = null;

    for (const surface of surfaces) {
      const hit = raySegmentIntersect(ray, surface.segment);

      if (hit.hit && hit.point && hit.normal && hit.t >= 0 && hit.t <= moveDistance) {
        if (!closestHit || hit.t < closestHit.distance) {
          closestHit = {
            surface,
            point: hit.point,
            normal: hit.normal,
            distance: hit.t,
          };
        }
      }
    }

    return closestHit;
  }

  /**
   * Handle collision with a surface
   */
  private handleCollision(collision: CollisionInfo, _surfaces: readonly Surface[]): void {
    const surface = collision.surface;

    // Move to collision point
    this._position = { ...collision.point };
    this.distanceTraveled += collision.distance;

    // Check if this is the next planned surface
    const isPlannedHit =
      this._state === "perfect" &&
      this.nextPlannedIndex < this.plannedSurfaces.length &&
      this.plannedSurfaces[this.nextPlannedIndex]?.id === surface.id;

    if (isPlannedHit && surface.isPlannable()) {
      // Ricochet off planned surface
      this.nextPlannedIndex++;

      // Reflect velocity
      const hitResult = surface.onArrowHit(collision.point, this._velocity);

      if (hitResult.type === "reflect" && hitResult.reflectedDirection) {
        this._velocity = Vec2.scale(
          Vec2.normalize(hitResult.reflectedDirection),
          this.config.speed
        );

        // Move slightly away from surface to prevent re-collision
        this._position = Vec2.add(this._position, Vec2.scale(collision.normal, 0.1));
      }
    } else if (surface.isPlannable() && this._state === "perfect") {
      // Hit a ricochet surface that wasn't planned - invalid trajectory
      // Arrow sticks
      this.stick(collision.point);
    } else {
      // Hit a wall or exhausted arrow hitting any surface
      this.stick(collision.point);
    }
  }

  /**
   * Check if arrow should become exhausted
   */
  private shouldExhaust(): boolean {
    // Exhaust if we've completed all planned ricochets
    if (this.nextPlannedIndex >= this.plannedSurfaces.length) {
      return true;
    }

    // Exhaust if we've traveled too far
    if (this.distanceTraveled >= this.maxDistance) {
      return true;
    }

    return false;
  }

  /**
   * Apply physics for exhausted state
   */
  private applyExhaustionPhysics(delta: number): void {
    // Apply gravity
    this._velocity = {
      x: this._velocity.x * this.config.exhaustionDrag,
      y: Math.min(
        this._velocity.y + this.config.exhaustionGravity * delta,
        this.config.maxExhaustionSpeed
      ),
    };
  }

  /**
   * Make the arrow stick to a surface
   */
  private stick(position: Vector2): void {
    this._state = "stuck";
    this._stuckAngle = Math.atan2(this._velocity.y, this._velocity.x);
    this._position = { ...position };
    this._velocity = { x: 0, y: 0 };
  }
}

/**
 * Collision information
 */
interface CollisionInfo {
  surface: Surface;
  point: Vector2;
  normal: Vector2;
  distance: number;
}
