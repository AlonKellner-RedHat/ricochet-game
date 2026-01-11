import { Vec2 } from "@/math/Vec2";
import type { Vector2 } from "@/types";

/**
 * Arrow flight states
 * - flying: Normal flight, full speed
 * - exhausted: Past distance limit, slowing down rapidly
 * - stuck: Embedded in surface, no longer moving
 *
 * @deprecated Use ArrowSystem from trajectory-v2/systems instead.
 * This module will be removed in a future version.
 * The ArrowSystem uses unified SourcePoint types for provenance tracking.
 */
export type ArrowState = "flying" | "exhausted" | "stuck";

/**
 * Arrow configuration
 *
 * @deprecated Use ArrowSystem from trajectory-v2/systems instead.
 */
export interface ArrowConfig {
  initialSpeed: number; // Initial speed in pixels per second
  normalDecay: number; // Speed multiplier per second during normal flight (e.g., 0.98)
  exhaustedDecay: number; // Speed multiplier per second when exhausted (e.g., 0.5)
  exhaustionDistance: number; // Distance in pixels before arrow becomes exhausted
  minSpeed: number; // Minimum speed before arrow sticks
}

export const DEFAULT_ARROW_CONFIG: ArrowConfig = {
  initialSpeed: 5000, // 5000 px/s initial speed
  normalDecay: 0.95, // Gradual slowdown: 0.95x per second
  exhaustedDecay: 0.3, // Rapid slowdown when exhausted: 0.3x per second
  exhaustionDistance: 10000, // 10 screen lengths (~1000px per screen)
  minSpeed: 100, // Arrow sticks when below this speed
};

/**
 * Arrow - Projectile that follows pre-computed waypoint path
 *
 * @deprecated Use ArrowSystem from trajectory-v2/systems instead.
 * This class will be removed in a future version.
 * The ArrowSystem uses unified SourcePoint types for provenance tracking,
 * enabling queries like "what surface will the arrow hit next".
 *
 * Physics:
 * - Starts at high speed (5000 px/s)
 * - Gradually slows down during normal flight
 * - After 10 screen lengths, becomes exhausted and slows rapidly
 * - Sticks to whatever it hits when exhausted or when speed drops too low
 */
export class Arrow {
  private _id: string;
  private _position: Vector2;
  private _state: ArrowState = "flying";
  private _stuckAngle = 0;
  private _currentSpeed: number;

  private waypoints: Vector2[];
  private currentWaypointIndex = 0;
  private distanceTraveled = 0;
  private config: ArrowConfig;

  constructor(id: string, waypoints: Vector2[], config: ArrowConfig = DEFAULT_ARROW_CONFIG) {
    this._id = id;

    if (waypoints.length < 2) {
      throw new Error("Arrow requires at least 2 waypoints");
    }

    this.waypoints = waypoints.map((p) => ({ ...p }));
    this._position = { ...waypoints[0]! };
    this.config = config;
    this._currentSpeed = config.initialSpeed;
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

  get currentSpeed(): number {
    return this._currentSpeed;
  }

  get angle(): number {
    if (this._state === "stuck") {
      return this._stuckAngle;
    }

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

  get velocity(): Vector2 {
    if (this._state === "stuck") {
      return { x: 0, y: 0 };
    }

    const nextWaypoint = this.waypoints[this.currentWaypointIndex + 1];
    if (!nextWaypoint) {
      return { x: 0, y: 0 };
    }

    const direction = Vec2.direction(this._position, nextWaypoint);
    return Vec2.scale(direction, this._currentSpeed);
  }

  /**
   * Update arrow position along waypoint path with speed decay
   */
  update(delta: number): void {
    if (this._state === "stuck") {
      return;
    }

    // Apply speed decay based on state
    this.applySpeedDecay(delta);

    // Check if speed dropped too low
    if (this._currentSpeed < this.config.minSpeed) {
      this.stick();
      return;
    }

    let remainingDistance = this._currentSpeed * delta;
    let isStuck = false;

    while (remainingDistance > 0 && !isStuck) {
      const nextWaypoint = this.waypoints[this.currentWaypointIndex + 1];

      if (!nextWaypoint) {
        this.stick();
        isStuck = true;
        break;
      }

      const distanceToNext = Vec2.distance(this._position, nextWaypoint);

      if (remainingDistance >= distanceToNext) {
        // Move to waypoint
        this._position = { ...nextWaypoint };
        remainingDistance -= distanceToNext;
        this.distanceTraveled += distanceToNext;
        this.currentWaypointIndex++;

        // Check exhaustion
        this.checkExhaustion();

        // Check if reached final waypoint
        if (this.currentWaypointIndex >= this.waypoints.length - 1) {
          this.stick();
          isStuck = true;
          break;
        }
      } else {
        // Move partway
        const direction = Vec2.direction(this._position, nextWaypoint);
        this._position = Vec2.add(this._position, Vec2.scale(direction, remainingDistance));
        this.distanceTraveled += remainingDistance;
        remainingDistance = 0;

        // Check exhaustion
        this.checkExhaustion();
      }
    }
  }

  /**
   * Apply speed decay based on current state
   */
  private applySpeedDecay(delta: number): void {
    if (this._state === "flying") {
      // Gradual decay: speed *= decay^delta
      this._currentSpeed *= Math.pow(this.config.normalDecay, delta);
    } else if (this._state === "exhausted") {
      // Rapid decay when exhausted
      this._currentSpeed *= Math.pow(this.config.exhaustedDecay, delta);
    }
  }

  /**
   * Check if arrow should become exhausted based on distance traveled
   */
  private checkExhaustion(): void {
    if (this._state === "flying" && this.distanceTraveled >= this.config.exhaustionDistance) {
      this._state = "exhausted";
    }
  }

  private stick(): void {
    this._state = "stuck";

    const prevWaypoint = this.waypoints[this.currentWaypointIndex];
    if (prevWaypoint && this.currentWaypointIndex > 0) {
      const prevPrev = this.waypoints[this.currentWaypointIndex - 1];
      if (prevPrev) {
        const direction = Vec2.subtract(prevWaypoint, prevPrev);
        this._stuckAngle = Math.atan2(direction.y, direction.x);
      }
    }
  }

  getWaypoints(): readonly Vector2[] {
    return this.waypoints;
  }

  getDistanceTraveled(): number {
    return this.distanceTraveled;
  }

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
