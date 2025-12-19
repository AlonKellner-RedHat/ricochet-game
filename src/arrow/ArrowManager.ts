import type { Surface } from "@/surfaces";
import type { Vector2 } from "@/types";
import type Phaser from "phaser";
import { Arrow, DEFAULT_ARROW_CONFIG } from "./Arrow";
import type { ArrowConfig } from "./Arrow";

/**
 * ArrowManager - Manages all active arrows, updates, and rendering
 */
export class ArrowManager {
  private arrows: Arrow[] = [];
  private graphics: Phaser.GameObjects.Graphics;
  private config: ArrowConfig;
  private nextId = 1;

  // Stuck arrows cleanup
  private readonly maxStuckArrows = 20;
  private readonly stuckArrowLifetime = 5000; // ms
  private stuckArrowTimestamps: Map<string, number> = new Map();

  constructor(scene: Phaser.Scene, config: ArrowConfig = DEFAULT_ARROW_CONFIG) {
    this.graphics = scene.add.graphics();
    this.config = config;
  }

  /**
   * Create a new arrow
   */
  createArrow(
    position: Vector2,
    direction: Vector2,
    plannedSurfaces: Surface[],
    maxDistance: number
  ): Arrow {
    const id = `arrow-${this.nextId++}`;
    const arrow = new Arrow(id, position, direction, plannedSurfaces, maxDistance, this.config);
    this.arrows.push(arrow);
    return arrow;
  }

  /**
   * Update all arrows
   */
  update(delta: number, surfaces: readonly Surface[]): void {
    const now = performance.now();

    for (const arrow of this.arrows) {
      const wasActive = arrow.isActive;
      arrow.update(delta, surfaces);

      // Track when arrows become stuck
      if (wasActive && !arrow.isActive) {
        this.stuckArrowTimestamps.set(arrow.id, now);
      }
    }

    // Cleanup old stuck arrows
    this.cleanupStuckArrows(now);
  }

  /**
   * Render all arrows
   */
  render(): void {
    this.graphics.clear();

    for (const arrow of this.arrows) {
      this.renderArrow(arrow);
    }
  }

  /**
   * Render a single arrow
   */
  private renderArrow(arrow: Arrow): void {
    const pos = arrow.position;
    const angle = arrow.angle;

    // Arrow dimensions
    const length = 20;
    const headLength = 8;
    const headWidth = 6;

    // Calculate arrow endpoints
    const tipX = pos.x + Math.cos(angle) * length;
    const tipY = pos.y + Math.sin(angle) * length;
    const tailX = pos.x - Math.cos(angle) * (length * 0.5);
    const tailY = pos.y - Math.sin(angle) * (length * 0.5);

    // Arrow color based on state
    let color: number;
    let alpha: number;
    switch (arrow.state) {
      case "perfect":
        color = 0x00ff88;
        alpha = 1;
        break;
      case "exhausted":
        color = 0xffaa00;
        alpha = 0.9;
        break;
      case "stuck":
        color = 0x888888;
        alpha = 0.6;
        break;
    }

    // Draw arrow shaft
    this.graphics.lineStyle(2, color, alpha);
    this.graphics.lineBetween(tailX, tailY, tipX, tipY);

    // Draw arrowhead
    const headBaseX = tipX - Math.cos(angle) * headLength;
    const headBaseY = tipY - Math.sin(angle) * headLength;

    const perpX = -Math.sin(angle) * headWidth;
    const perpY = Math.cos(angle) * headWidth;

    this.graphics.fillStyle(color, alpha);
    this.graphics.beginPath();
    this.graphics.moveTo(tipX, tipY);
    this.graphics.lineTo(headBaseX + perpX, headBaseY + perpY);
    this.graphics.lineTo(headBaseX - perpX, headBaseY - perpY);
    this.graphics.closePath();
    this.graphics.fillPath();

    // Draw fletching (tail feathers) for active arrows
    if (arrow.state !== "stuck") {
      const fletchLength = 5;
      const fletchX = tailX - Math.cos(angle) * fletchLength;
      const fletchY = tailY - Math.sin(angle) * fletchLength;

      this.graphics.lineStyle(1, color, alpha * 0.7);
      this.graphics.lineBetween(
        tailX + perpX * 0.3,
        tailY + perpY * 0.3,
        fletchX + perpX * 0.5,
        fletchY + perpY * 0.5
      );
      this.graphics.lineBetween(
        tailX - perpX * 0.3,
        tailY - perpY * 0.3,
        fletchX - perpX * 0.5,
        fletchY - perpY * 0.5
      );
    }
  }

  /**
   * Clean up old stuck arrows
   */
  private cleanupStuckArrows(now: number): void {
    // Remove arrows that have been stuck too long
    this.arrows = this.arrows.filter((arrow) => {
      if (!arrow.isActive) {
        const stuckTime = this.stuckArrowTimestamps.get(arrow.id);
        if (stuckTime && now - stuckTime > this.stuckArrowLifetime) {
          this.stuckArrowTimestamps.delete(arrow.id);
          return false;
        }
      }
      return true;
    });

    // Limit total stuck arrows
    const stuckArrows = this.arrows.filter((a) => !a.isActive);
    if (stuckArrows.length > this.maxStuckArrows) {
      const toRemove = stuckArrows.length - this.maxStuckArrows;
      const oldestStuck = stuckArrows
        .map((a) => ({
          arrow: a,
          time: this.stuckArrowTimestamps.get(a.id) || 0,
        }))
        .sort((a, b) => a.time - b.time)
        .slice(0, toRemove);

      for (const { arrow } of oldestStuck) {
        this.stuckArrowTimestamps.delete(arrow.id);
        const idx = this.arrows.indexOf(arrow);
        if (idx >= 0) {
          this.arrows.splice(idx, 1);
        }
      }
    }
  }

  /**
   * Get all active (flying) arrows
   */
  getActiveArrows(): Arrow[] {
    return this.arrows.filter((a) => a.isActive);
  }

  /**
   * Get all arrows
   */
  getAllArrows(): Arrow[] {
    return [...this.arrows];
  }

  /**
   * Clear all arrows
   */
  clear(): void {
    this.arrows = [];
    this.stuckArrowTimestamps.clear();
    this.graphics.clear();
  }
}
