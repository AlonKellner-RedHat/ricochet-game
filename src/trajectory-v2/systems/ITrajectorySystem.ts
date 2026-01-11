/**
 * ITrajectorySystem - Interface for trajectory system consumers
 *
 * Systems are independent components that consume engine results.
 * They communicate through events via the SystemCoordinator.
 */

import type { EngineResults } from "@/trajectory-v2/engine/types";

/**
 * Base interface for all trajectory systems.
 */
export interface ITrajectorySystem {
  /** Unique identifier for this system */
  readonly id: string;

  /**
   * Called when engine results are updated.
   * Systems process the new results and update their state.
   */
  onEngineUpdate(results: EngineResults): void;

  /**
   * Per-frame update for time-based logic.
   * @param deltaTime Time since last update in seconds
   */
  update(deltaTime: number): void;

  /**
   * Clean up resources when system is destroyed.
   */
  dispose(): void;
}

/**
 * Interface for systems that produce events.
 */
export interface IEventProducer<TEvent = unknown> {
  /**
   * Subscribe to events from this system.
   * @param handler Callback for handling events
   * @returns Unsubscribe function
   */
  onEvent(handler: (event: TEvent) => void): () => void;
}

/**
 * Interface for systems that consume events.
 */
export interface IEventConsumer<TEvent = unknown> {
  /**
   * Handle an incoming event.
   * @param event The event data
   */
  handleEvent(event: TEvent): void;
}

/**
 * Events produced by the AimingSystem.
 */
export interface AimingEvent {
  readonly type: "arrow_shot" | "plan_changed";
  readonly data: ArrowShotData | PlanChangedData;
}

export interface ArrowShotData {
  readonly waypoints: readonly import("@/trajectory-v2/geometry/types").Vector2[];
  /** Waypoints with provenance (unified with trajectory/visibility systems) */
  readonly waypointSources: readonly import("@/trajectory-v2/geometry/SourcePoint").SourcePoint[];
  readonly isFullyAligned: boolean;
}

export interface PlanChangedData {
  readonly plannedSurfaces: readonly import("@/surfaces/Surface").Surface[];
}

/**
 * Configuration for trajectory rendering.
 */
export interface RenderConfig {
  /** Line width for trajectory lines */
  readonly lineWidth: number;
  /** Color for aligned (green) portions */
  readonly alignedColor: number;
  /** Color for planned diverged (red) portions */
  readonly plannedDivergedColor: number;
  /** Color for actual diverged (yellow) portions */
  readonly actualDivergedColor: number;
  /** Alpha for solid lines */
  readonly solidAlpha: number;
  /** Alpha for dashed lines */
  readonly dashedAlpha: number;
  /** Length of dash segments */
  readonly dashLength: number;
  /** Gap between dashes */
  readonly dashGap: number;
  /** Enable debug logging */
  readonly debug?: boolean;
}

/**
 * Default render configuration.
 */
export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  lineWidth: 2,
  alignedColor: 0x00ff00, // Green
  plannedDivergedColor: 0xff0000, // Red
  actualDivergedColor: 0xffff00, // Yellow
  solidAlpha: 1.0,
  dashedAlpha: 0.7,
  dashLength: 10,
  dashGap: 5,
  debug: false,
};

