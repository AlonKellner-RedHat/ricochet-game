/**
 * ArrowSystem - Arrow flight management
 *
 * Manages arrows in flight, following waypoint paths.
 * Consumes arrow_shot events from AimingSystem.
 */

import { distance } from "@/trajectory-v2/geometry/GeometryOps";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { EngineResults } from "@/trajectory-v2/engine/types";
import type {
  AimingEvent,
  ArrowShotData,
  IEventConsumer,
  ITrajectorySystem,
} from "./ITrajectorySystem";

/**
 * Configuration for arrows.
 */
export interface ArrowConfig {
  /** Arrow speed in pixels per second */
  readonly speed: number;
  /** Maximum number of simultaneous arrows */
  readonly maxArrows: number;
}

/**
 * Default arrow configuration.
 */
export const DEFAULT_ARROW_CONFIG: ArrowConfig = {
  speed: 800,
  maxArrows: 10,
};

/**
 * State of a flying arrow.
 */
export interface ArrowState {
  readonly id: string;
  /** Current position */
  position: Vector2;
  /** Path waypoints to follow */
  readonly waypoints: readonly Vector2[];
  /** Current waypoint index (heading toward this waypoint) */
  waypointIndex: number;
  /** Whether the arrow is still active */
  active: boolean;
  /** Whether this shot was fully aligned */
  readonly wasAligned: boolean;
}

/**
 * Callback for arrow events.
 */
export type ArrowEventCallback = (arrow: ArrowState, event: ArrowEventType) => void;

export type ArrowEventType = "created" | "waypoint_reached" | "completed" | "removed";

/**
 * ArrowSystem implementation.
 */
export class ArrowSystem
  implements ITrajectorySystem, IEventConsumer<AimingEvent>
{
  readonly id = "arrow";

  private config: ArrowConfig;
  private arrows: Map<string, ArrowState> = new Map();
  private nextArrowId = 1;
  private eventCallbacks: Set<ArrowEventCallback> = new Set();

  constructor(config: Partial<ArrowConfig> = {}) {
    this.config = { ...DEFAULT_ARROW_CONFIG, ...config };
  }

  onEngineUpdate(_results: EngineResults): void {
    // ArrowSystem doesn't directly use engine results
    // It operates on already-shot arrows
  }

  update(deltaTime: number): void {
    for (const arrow of this.arrows.values()) {
      if (arrow.active) {
        this.updateArrow(arrow, deltaTime);
      }
    }

    // Clean up completed arrows
    for (const [id, arrow] of this.arrows.entries()) {
      if (!arrow.active) {
        this.arrows.delete(id);
        this.emitEvent(arrow, "removed");
      }
    }
  }

  dispose(): void {
    this.arrows.clear();
    this.eventCallbacks.clear();
  }

  // =========================================================================
  // Event Consumer
  // =========================================================================

  handleEvent(event: AimingEvent): void {
    if (event.type === "arrow_shot") {
      const data = event.data as ArrowShotData;
      this.createArrow(data.waypoints, data.isFullyAligned);
    }
  }

  // =========================================================================
  // Arrow Management
  // =========================================================================

  /**
   * Create a new arrow with the given waypoints.
   */
  createArrow(
    waypoints: readonly Vector2[],
    wasAligned = true
  ): ArrowState | null {
    if (waypoints.length < 2) {
      return null;
    }

    // Enforce max arrows limit
    if (this.arrows.size >= this.config.maxArrows) {
      // Remove oldest arrow
      const oldest = this.arrows.values().next().value;
      if (oldest) {
        oldest.active = false;
      }
    }

    const id = `arrow_${this.nextArrowId++}`;
    const startPos = waypoints[0]!;
    const arrow: ArrowState = {
      id,
      position: { x: startPos.x, y: startPos.y },
      waypoints,
      waypointIndex: 1, // Heading toward first waypoint after start
      active: true,
      wasAligned,
    };

    this.arrows.set(id, arrow);
    this.emitEvent(arrow, "created");

    return arrow;
  }

  /**
   * Get all active arrows.
   */
  getActiveArrows(): readonly ArrowState[] {
    return Array.from(this.arrows.values()).filter((a) => a.active);
  }

  /**
   * Get a specific arrow by ID.
   */
  getArrow(id: string): ArrowState | undefined {
    return this.arrows.get(id);
  }

  /**
   * Subscribe to arrow events.
   */
  onArrowEvent(callback: ArrowEventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => {
      this.eventCallbacks.delete(callback);
    };
  }

  // =========================================================================
  // Arrow Update
  // =========================================================================

  private updateArrow(arrow: ArrowState, deltaTime: number): void {
    // Check if arrow has reached the end of its path (happens after last waypoint is reached)
    if (arrow.waypointIndex >= arrow.waypoints.length) {
      arrow.active = false;
      this.emitEvent(arrow, "completed");
      return;
    }

    let remainingDistance = this.config.speed * deltaTime;

    // Process waypoints until we run out of movement distance
    while (remainingDistance > 0 && arrow.waypointIndex < arrow.waypoints.length) {
      const target = arrow.waypoints[arrow.waypointIndex]!;
      const distToTarget = distance(arrow.position, target);

      if (remainingDistance >= distToTarget) {
        // Reached waypoint
        arrow.position = { x: target.x, y: target.y };
        this.emitEvent(arrow, "waypoint_reached");

        // Move to next waypoint
        arrow.waypointIndex++;
        remainingDistance -= distToTarget;
      } else {
        // Move toward waypoint
        const t = remainingDistance / distToTarget;
        arrow.position = {
          x: arrow.position.x + (target.x - arrow.position.x) * t,
          y: arrow.position.y + (target.y - arrow.position.y) * t,
        };
        remainingDistance = 0;
      }
    }

    // Check if we've reached the end after processing
    if (arrow.waypointIndex >= arrow.waypoints.length) {
      arrow.active = false;
      this.emitEvent(arrow, "completed");
    }
  }

  private emitEvent(arrow: ArrowState, event: ArrowEventType): void {
    for (const callback of this.eventCallbacks) {
      callback(arrow, event);
    }
  }

  // =========================================================================
  // Configuration
  // =========================================================================

  /**
   * Update arrow configuration.
   */
  setConfig(config: Partial<ArrowConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   */
  getConfig(): ArrowConfig {
    return { ...this.config };
  }
}

