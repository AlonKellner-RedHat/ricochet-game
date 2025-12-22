import type { Vector2 } from "@/types";
import type Phaser from "phaser";
import { Arrow, DEFAULT_ARROW_CONFIG } from "./Arrow";
import type { ArrowConfig } from "./Arrow";

/**
 * ArrowManager - Manages all active arrows, updates, and rendering
 *
 * Arrows follow pre-computed waypoint paths (from trajectory calculation).
 * Stuck arrows persist up to MAX_STUCK_ARROWS (100).
 */
export class ArrowManager {
  private arrows: Arrow[] = [];
  private graphics: Phaser.GameObjects.Graphics;
  private config: ArrowConfig;
  private nextId = 1;

  // Count-based cleanup: only stuck arrows count toward limit
  private static readonly MAX_STUCK_ARROWS = 100;

  constructor(scene: Phaser.Scene, config: ArrowConfig = DEFAULT_ARROW_CONFIG) {
    this.graphics = scene.add.graphics();
    this.config = config;
  }

  /**
   * Create a new arrow from waypoints
   *
   * @param waypoints - Path for the arrow to follow [start, hit1, hit2, ..., end]
   * @returns The created arrow
   */
  createArrow(waypoints: Vector2[]): Arrow {
    if (waypoints.length < 2) {
      throw new Error("Arrow requires at least 2 waypoints");
    }

    const id = `arrow-${this.nextId++}`;
    const arrow = new Arrow(id, waypoints, this.config);
    this.arrows.push(arrow);
    return arrow;
  }

  /**
   * Update all arrows
   */
  update(delta: number): void {
    for (const arrow of this.arrows) {
      arrow.update(delta);
    }

    // Cleanup excess stuck arrows
    this.cleanupStuckArrows();
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
      case "flying":
        color = 0x00ff88; // Green for flying
        alpha = 1;
        break;
      case "exhausted":
        color = 0xffaa00; // Orange for exhausted (slowing down)
        alpha = 0.9;
        break;
      case "stuck":
        color = 0x888888; // Gray for stuck
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

    // Draw fletching (tail feathers) for flying arrows
    if (arrow.state === "flying") {
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
   * Remove oldest stuck arrows when exceeding limit
   * Only stuck arrows count toward the limit
   */
  private cleanupStuckArrows(): void {
    const stuckArrows = this.arrows.filter((a) => !a.isActive);

    if (stuckArrows.length > ArrowManager.MAX_STUCK_ARROWS) {
      // Remove the oldest stuck arrows (they're at the front of the array)
      const toRemove = stuckArrows.length - ArrowManager.MAX_STUCK_ARROWS;

      let removed = 0;
      this.arrows = this.arrows.filter((arrow) => {
        if (!arrow.isActive && removed < toRemove) {
          removed++;
          return false;
        }
        return true;
      });
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
   * Get count of stuck arrows
   */
  getStuckArrowCount(): number {
    return this.arrows.filter((a) => !a.isActive).length;
  }

  /**
   * Clear all arrows
   */
  clear(): void {
    this.arrows = [];
    this.graphics.clear();
  }
}
