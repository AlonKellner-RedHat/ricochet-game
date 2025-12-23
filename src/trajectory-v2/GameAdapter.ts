/**
 * GameAdapter - Adapts the new trajectory system for use in GameScene
 *
 * This adapter provides a bridge between the new trajectory system v2
 * and the existing game code. It can be used alongside the old system
 * for A/B testing and gradual migration.
 */

import type Phaser from "phaser";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { DualTrajectoryResult, AlignmentResult } from "@/types";
import { TrajectoryEngine } from "./engine/TrajectoryEngine";
import { SystemCoordinator } from "./coordinator/SystemCoordinator";
import { RenderSystem, type IGraphics } from "./systems/RenderSystem";
import { AimingSystem } from "./systems/AimingSystem";
import { ArrowSystem } from "./systems/ArrowSystem";
import type { ITrajectoryEngine } from "./engine/ITrajectoryEngine";
import {
  ValidRegionRenderer,
  type IValidRegionGraphics,
  type ScreenBounds,
} from "./visibility/ValidRegionRenderer";
import { RayBasedVisibilityCalculator } from "./calculators/RayBasedVisibilityCalculator";
import { AngleBasedVisibilityCalculator } from "./calculators/AngleBasedVisibilityCalculator";

/**
 * Configuration for the game adapter.
 */
export interface GameAdapterConfig {
  /** Enable debug logging */
  debug?: boolean;
  /** Arrow speed */
  arrowSpeed?: number;
  /** Shoot cooldown */
  shootCooldown?: number;
  /** Enable valid region highlighting (dark overlay) */
  showValidRegion?: boolean;
  /** Opacity of dark overlay for shadowed areas (0-1) */
  validRegionShadowAlpha?: number;
  /** Opacity of dark overlay for lit areas (0-1) */
  validRegionLitAlpha?: number;
  /**
   * Use ray-based visibility calculation.
   *
   * When true, uses the new RayBasedVisibilityCalculator which derives
   * visibility from ImageChain rays, ensuring V.5 correlation:
   * Light reaches cursor ↔ (plan valid AND aligned)
   *
   * When false (default), uses the AngleBasedVisibilityCalculator.
   */
  useRayBasedVisibility?: boolean;
}

/**
 * Adapter that wraps the new trajectory system for game integration.
 */
export class GameAdapter {
  private engine: ITrajectoryEngine;
  private coordinator: SystemCoordinator;
  private renderSystem: RenderSystem;
  private aimingSystem: AimingSystem;
  private arrowSystem: ArrowSystem;
  private graphics: Phaser.GameObjects.Graphics;

  // Valid region overlay
  private validRegionGraphics: Phaser.GameObjects.Graphics | null = null;
  private validRegionRenderer: ValidRegionRenderer | null = null;
  private showValidRegion: boolean = false;
  private screenBounds: ScreenBounds;

  // Cached state for visibility rendering
  private lastPlayer: Vector2 = { x: 0, y: 0 };
  private lastAllSurfaces: readonly Surface[] = [];

  constructor(scene: Phaser.Scene, config: GameAdapterConfig = {}) {
    // Store screen bounds
    this.screenBounds = {
      minX: 0,
      minY: 0,
      maxX: scene.cameras.main.width,
      maxY: scene.cameras.main.height,
    };

    // Create visibility overlay graphics (rendered below trajectory)
    this.showValidRegion = config.showValidRegion ?? false;
    if (this.showValidRegion) {
      this.validRegionGraphics = scene.add.graphics();
      this.validRegionGraphics.setDepth(-1); // Below other graphics

      const visibilityGraphicsWrapper = this.createValidRegionGraphicsWrapper(
        this.validRegionGraphics
      );

      // Choose visibility calculator based on config
      const visibilityCalculator = config.useRayBasedVisibility
        ? new RayBasedVisibilityCalculator()
        : new AngleBasedVisibilityCalculator();

      this.validRegionRenderer = new ValidRegionRenderer(
        visibilityGraphicsWrapper,
        this.screenBounds,
        {
          shadowAlpha: config.validRegionShadowAlpha ?? 0.35,
          litAlpha: config.validRegionLitAlpha ?? 0.15,
          showOutline: config.debug ?? false,
        },
        visibilityCalculator
      );
    }

    // Create graphics object for trajectory
    this.graphics = scene.add.graphics();

    // Create Phaser-compatible graphics wrapper
    const phaserGraphics = this.createPhaserGraphicsWrapper(this.graphics);

    // Create engine
    this.engine = new TrajectoryEngine();

    // Create coordinator
    this.coordinator = new SystemCoordinator(this.engine);

    // Create systems
    this.renderSystem = new RenderSystem(phaserGraphics, {
      debug: config.debug ?? false,
    });
    this.aimingSystem = new AimingSystem({
      shootCooldown: config.shootCooldown ?? 0.3,
    });
    this.arrowSystem = new ArrowSystem({
      speed: config.arrowSpeed ?? 800,
    });

    // Register systems
    this.coordinator.registerSystem(this.renderSystem, 0);
    this.coordinator.registerSystem(this.aimingSystem, 1);
    this.coordinator.registerSystem(this.arrowSystem, 2);

    // Connect aiming to arrow
    this.coordinator.connectAimingToArrow();
  }

  /**
   * Create a Phaser-compatible graphics wrapper for trajectory rendering.
   */
  private createPhaserGraphicsWrapper(
    graphics: Phaser.GameObjects.Graphics
  ): IGraphics {
    return {
      clear: () => graphics.clear(),
      lineStyle: (width, color, alpha) => graphics.lineStyle(width, color, alpha),
      lineBetween: (x1, y1, x2, y2) => graphics.lineBetween(x1, y1, x2, y2),
      beginPath: () => graphics.beginPath(),
      moveTo: (x, y) => graphics.moveTo(x, y),
      lineTo: (x, y) => graphics.lineTo(x, y),
      strokePath: () => graphics.strokePath(),
    };
  }

  /**
   * Create a Phaser-compatible graphics wrapper for valid region overlay.
   */
  private createValidRegionGraphicsWrapper(
    graphics: Phaser.GameObjects.Graphics
  ): IValidRegionGraphics {
    return {
      clear: () => graphics.clear(),
      fillStyle: (color, alpha) => graphics.fillStyle(color, alpha),
      lineStyle: (width, color, alpha) => graphics.lineStyle(width, color, alpha),
      beginPath: () => graphics.beginPath(),
      moveTo: (x, y) => graphics.moveTo(x, y),
      lineTo: (x, y) => graphics.lineTo(x, y),
      closePath: () => graphics.closePath(),
      fillPath: () => graphics.fillPath(),
      strokePath: () => graphics.strokePath(),
      fillRect: (x, y, w, h) => graphics.fillRect(x, y, w, h),
      setBlendMode: (mode) => graphics.setBlendMode(mode),
    };
  }

  /**
   * Update the adapter each frame.
   */
  update(
    deltaSeconds: number,
    player: Vector2,
    cursor: Vector2,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[]
  ): void {
    // Cache for visibility rendering
    this.lastPlayer = player;
    this.lastAllSurfaces = allSurfaces;

    // Update engine inputs
    this.engine.setPlayer(player);
    this.engine.setCursor(cursor);
    this.engine.setPlannedSurfaces(plannedSurfaces);
    this.engine.setAllSurfaces(allSurfaces);

    // Trigger recalculation if needed
    this.engine.invalidateAll();

    // Update all systems
    this.coordinator.update(deltaSeconds);

    // Render valid region overlay
    if (this.validRegionRenderer && this.showValidRegion) {
      this.validRegionRenderer.render(player, plannedSurfaces, allSurfaces);
    }
  }

  /**
   * Attempt to shoot an arrow.
   */
  shoot(): { waypoints: readonly Vector2[] } | null {
    if (this.aimingSystem.shoot()) {
      return {
        waypoints: this.aimingSystem.getArrowWaypoints(),
      };
    }
    return null;
  }

  /**
   * Get the dual trajectory result (compatible with old interface).
   */
  getDualTrajectoryResult(): DualTrajectoryResult {
    const results = this.engine.getResults();

    // Convert to old format
    return {
      planned: {
        points: [...results.plannedPath.points],
        ghostPoints: [],
      },
      actual: {
        points: [...results.actualPath.points],
        ghostPoints: [],
      },
      alignment: results.alignment as AlignmentResult,
      isCursorReachable: results.alignment.isFullyAligned,
      bypassedSurfaces: [],
    };
  }

  /**
   * Check if cursor is reachable.
   */
  isCursorReachable(): boolean {
    return this.engine.getAlignment().isFullyAligned;
  }

  /**
   * Get active arrows.
   */
  getActiveArrows(): readonly { position: Vector2; id: string }[] {
    return this.arrowSystem.getActiveArrows();
  }

  /**
   * Add a surface to the plan.
   */
  addSurfaceToPlan(surface: Surface): void {
    this.aimingSystem.addSurface(surface);
  }

  /**
   * Remove a surface from the plan.
   */
  removeSurfaceFromPlan(surface: Surface): void {
    this.aimingSystem.removeSurface(surface);
  }

  /**
   * Toggle a surface in the plan.
   */
  toggleSurfaceInPlan(surface: Surface): void {
    this.aimingSystem.toggleSurface(surface);
  }

  /**
   * Clear all planned surfaces.
   */
  clearPlan(): void {
    this.aimingSystem.clearPlan();
  }

  /**
   * Get planned surfaces.
   */
  getPlannedSurfaces(): readonly Surface[] {
    return this.aimingSystem.getPlannedSurfaces();
  }

  /**
   * Check if a surface is in the plan.
   */
  isSurfaceInPlan(surface: Surface): boolean {
    return this.aimingSystem.isInPlan(surface);
  }

  /**
   * Get the 1-based index of a surface in the plan.
   * Returns 0 if not in plan.
   */
  getSurfacePlanIndex(surface: Surface): number {
    const surfaces = this.aimingSystem.getPlannedSurfaces();
    const index = surfaces.indexOf(surface);
    return index === -1 ? 0 : index + 1;
  }

  /**
   * Get bypassed surface IDs for visual indication.
   */
  getBypassedSurfaceIds(): Set<string> {
    const results = this.engine.getResults();
    const bypassedIds = new Set<string>();
    
    // Get bypassed surfaces from the path result
    if (results.plannedPath?.bypassedSurfaces) {
      for (const bypassed of results.plannedPath.bypassedSurfaces) {
        bypassedIds.add(bypassed.surface.id);
      }
    }
    
    return bypassedIds;
  }

  /**
   * Get the aim direction (normalized vector from player to cursor).
   */
  getAimDirection(): Vector2 {
    const results = this.engine.getResults();
    const player = results.plannedPath.points[0];
    const cursor = results.plannedPath.points[results.plannedPath.points.length - 1];

    if (!player || !cursor) {
      return { x: 1, y: 0 };
    }

    const dx = cursor.x - player.x;
    const dy = cursor.y - player.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len < 0.001) {
      return { x: 1, y: 0 };
    }

    return { x: dx / len, y: dy / len };
  }

  /**
   * Get arrow data for rendering.
   * Returns array of arrows with position, direction, and state.
   */
  getArrowsForRendering(): readonly {
    id: string;
    position: Vector2;
    direction: Vector2;
    active: boolean;
  }[] {
    const arrows = this.arrowSystem.getActiveArrows();
    return arrows.map((arrow) => {
      // Calculate direction from current waypoint
      let direction: Vector2 = { x: 1, y: 0 };
      if (arrow.waypointIndex < arrow.waypoints.length) {
        const target = arrow.waypoints[arrow.waypointIndex];
        if (target) {
          const dx = target.x - arrow.position.x;
          const dy = target.y - arrow.position.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 0.001) {
            direction = { x: dx / len, y: dy / len };
          }
        }
      }

      return {
        id: arrow.id,
        position: arrow.position,
        direction,
        active: arrow.active,
      };
    });
  }

  /**
   * Subscribe to arrow events (for sound effects, etc).
   */
  onArrowEvent(
    callback: (
      arrow: { id: string; position: Vector2 },
      event: "created" | "waypoint_reached" | "completed" | "removed"
    ) => void
  ): () => void {
    return this.arrowSystem.onArrowEvent((arrow, event) => {
      callback({ id: arrow.id, position: arrow.position }, event);
    });
  }

  /**
   * Get the engine for direct access.
   */
  getEngine(): ITrajectoryEngine {
    return this.engine;
  }

  /**
   * Toggle valid region overlay visibility.
   */
  toggleValidRegion(): void {
    this.showValidRegion = !this.showValidRegion;
    if (!this.showValidRegion && this.validRegionRenderer) {
      this.validRegionRenderer.clear();
    }
  }

  /**
   * Set valid region overlay visibility.
   */
  setShowValidRegion(show: boolean): void {
    this.showValidRegion = show;
    if (!show && this.validRegionRenderer) {
      this.validRegionRenderer.clear();
    }
  }

  /**
   * Check if valid region overlay is visible.
   */
  isValidRegionVisible(): boolean {
    return this.showValidRegion;
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.coordinator.dispose();
    this.graphics.destroy();
    if (this.validRegionGraphics) {
      this.validRegionGraphics.destroy();
    }
  }
}

/**
 * Factory function to create a game adapter.
 */
export function createGameAdapter(
  scene: Phaser.Scene,
  config: GameAdapterConfig = {}
): GameAdapter {
  return new GameAdapter(scene, config);
}

