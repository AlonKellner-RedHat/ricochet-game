import { Vec2 } from "@/math/Vec2";
import type { Vector2 } from "@/types";

/**
 * Arrow flight states
 */
export type ArrowState = "flying" | "stuck";

/**
 * Arrow configuration
 */
export interface ArrowConfig {
  speed: number; // Pixels per second
}

export const DEFAULT_ARROW_CONFIG: ArrowConfig = {
  speed: 800,
};

/**
 * Arrow - Projectile that follows pre-computed waypoint path
 *
 * First Principles:
 * - Arrow follows exact trajectory computed by image reflection
 * - No physics simulation - deterministic path
 * - Moves at constant speed between waypoints
 * - Becomes stuck when reaching final waypoint
 */
export class Arrow {
  private _id: string;
  private _position: Vector2;
  private _state: ArrowState = "flying";
  private _stuckAngle = 0;

  private waypoints: Vector2[];
  private currentWaypointIndex = 0;
  private config: ArrowConfig;

  /**
   * Create an arrow that follows a waypoint path
   *
   * @param id - Unique identifier
   * @param waypoints - Array of points to follow [start, hit1, hit2, ..., end]
   * @param config - Arrow configuration
   */
  constructor(id: string, waypoints: Vector2[], config: ArrowConfig = DEFAULT_ARROW_CONFIG) {
    this._id = id;

    if (waypoints.length < 2) {
      throw new Error("Arrow requires at least 2 waypoints");
    }

    this.waypoints = waypoints.map((p) => ({ ...p }));
    this._position = { ...waypoints[0]! };
    this.config = config;
  }

  get id(): string {
    return this._id;
  }

  get position(): Vector2 {
    return { ...this._position };
  }

  get state(): ArrowState {
    return this._state;
  }

  get angle(): number {
    if (this._state === "stuck") {
      return this._stuckAngle;
    }

    // Calculate angle from current position toward next waypoint
    const nextWaypoint = this.waypoints[this.currentWaypointIndex + 1];
    if (!nextWaypoint) {
      return this._stuckAngle;
    }

    const direction = Vec2.subtract(nextWaypoint, this._position);
    return Math.atan2(direction.y, direction.x);
  }

  get isActive(): boolean {
    return this._state !== "stuck";
  }

  /**
   * Get the velocity vector (direction * speed)
   */
  get velocity(): Vector2 {
    if (this._state === "stuck") {
      return { x: 0, y: 0 };
    }

    const nextWaypoint = this.waypoints[this.currentWaypointIndex + 1];
    if (!nextWaypoint) {
      return { x: 0, y: 0 };
    }

    const direction = Vec2.direction(this._position, nextWaypoint);
    return Vec2.scale(direction, this.config.speed);
  }

  /**
   * Update arrow position along waypoint path
   *
   * @param delta - Time since last frame in seconds
   */
  update(delta: number): void {
    if (this._state === "stuck") {
      return;
    }

    let remainingDistance = this.config.speed * delta;

    while (remainingDistance > 0 && this._state === "flying") {
      const nextWaypoint = this.waypoints[this.currentWaypointIndex + 1];

      if (!nextWaypoint) {
        // No more waypoints - we're done
        this.stick();
        break;
      }

      const distanceToNext = Vec2.distance(this._position, nextWaypoint);

      if (remainingDistance >= distanceToNext) {
        // Move to waypoint and continue to next segment
        this._position = { ...nextWaypoint };
        remainingDistance -= distanceToNext;
        this.currentWaypointIndex++;

        // Check if we've reached the final waypoint
        if (this.currentWaypointIndex >= this.waypoints.length - 1) {
          this.stick();
          break;
        }
      } else {
        // Move partway toward next waypoint
        const direction = Vec2.direction(this._position, nextWaypoint);
        this._position = Vec2.add(this._position, Vec2.scale(direction, remainingDistance));
        remainingDistance = 0;
      }
    }
  }

  /**
   * Make the arrow stick at current position
   */
  private stick(): void {
    this._state = "stuck";

    // Preserve angle from last movement direction
    const prevWaypoint = this.waypoints[this.currentWaypointIndex];
    if (prevWaypoint && this.currentWaypointIndex > 0) {
      const prevPrev = this.waypoints[this.currentWaypointIndex - 1];
      if (prevPrev) {
        const direction = Vec2.subtract(prevWaypoint, prevPrev);
        this._stuckAngle = Math.atan2(direction.y, direction.x);
      }
    }
  }

  /**
   * Get the waypoints this arrow follows
   */
  getWaypoints(): readonly Vector2[] {
    return this.waypoints;
  }

  /**
   * Get progress through the waypoint path (0 to 1)
   */
  getProgress(): number {
    if (this.waypoints.length <= 1) return 1;

    let totalDistance = 0;
    let traveledDistance = 0;

    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const segmentDist = Vec2.distance(this.waypoints[i]!, this.waypoints[i + 1]!);
      totalDistance += segmentDist;

      if (i < this.currentWaypointIndex) {
        traveledDistance += segmentDist;
      } else if (i === this.currentWaypointIndex) {
        traveledDistance += Vec2.distance(this.waypoints[i]!, this._position);
      }
    }

    return totalDistance > 0 ? traveledDistance / totalDistance : 1;
  }
}
