import type { TrajectoryResult, Vector2 } from "@/types";
import type Phaser from "phaser";

/**
 * Visual configuration for trajectory rendering
 */
interface TrajectoryRenderConfig {
  validColor: number;
  invalidColor: number;
  plannedHitColor: number;
  lineWidth: number;
  lineAlpha: number;
  hitMarkerRadius: number;
  endpointRadius: number;
  dashLength?: number;
}

const DEFAULT_CONFIG: TrajectoryRenderConfig = {
  validColor: 0x00ff88, // Green
  invalidColor: 0xff4444, // Red
  plannedHitColor: 0x00ffff, // Cyan
  lineWidth: 2,
  lineAlpha: 0.8,
  hitMarkerRadius: 5,
  endpointRadius: 4,
};

/**
 * TrajectoryRenderer - Draws trajectory paths using Phaser graphics
 */
export class TrajectoryRenderer {
  private graphics: Phaser.GameObjects.Graphics;
  private config: TrajectoryRenderConfig;

  constructor(scene: Phaser.Scene, config: Partial<TrajectoryRenderConfig> = {}) {
    this.graphics = scene.add.graphics();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Set high depth so trajectory renders on top
    this.graphics.setDepth(100);
  }

  /**
   * Render a trajectory result
   */
  render(result: TrajectoryResult): void {
    this.graphics.clear();

    const { points, status, failedAtPlanIndex } = result;

    if (points.length < 2) return;

    // Determine where the path becomes invalid
    let invalidFromIndex = -1;
    if (status !== "valid") {
      // Count planned hits to find where we fail
      let plannedHitCount = 0;
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        if (point?.isPlanned) {
          plannedHitCount++;
        }
        if (
          point &&
          (plannedHitCount > failedAtPlanIndex ||
            (status === "hit_obstacle" && point.surfaceId && !point.isPlanned))
        ) {
          invalidFromIndex = i;
          break;
        }
      }
      // If we didn't find the failure point, mark the last segment as invalid
      if (invalidFromIndex === -1) {
        invalidFromIndex = points.length - 1;
      }
    }

    // Draw line segments
    for (let i = 0; i < points.length - 1; i++) {
      const fromPoint = points[i];
      const toPoint = points[i + 1];
      if (!fromPoint || !toPoint) continue;

      const from = fromPoint.position;
      const to = toPoint.position;

      // Determine color for this segment
      const isInvalid = invalidFromIndex !== -1 && i >= invalidFromIndex - 1;
      const color = isInvalid ? this.config.invalidColor : this.config.validColor;

      this.graphics.lineStyle(this.config.lineWidth, color, this.config.lineAlpha);
      this.graphics.lineBetween(from.x, from.y, to.x, to.y);
    }

    // Draw planned hit markers
    for (const point of points) {
      if (point.isPlanned) {
        this.drawHitMarker(point.position, this.config.plannedHitColor);
      }
    }

    // Draw endpoint marker
    if (points.length > 1) {
      const endpoint = points[points.length - 1];
      if (endpoint) {
        const endColor = status === "valid" ? this.config.validColor : this.config.invalidColor;
        this.drawEndpoint(endpoint.position, endColor);
      }
    }
  }

  /**
   * Draw a marker at a planned surface hit
   */
  private drawHitMarker(position: Vector2, color: number): void {
    this.graphics.fillStyle(color, 1);
    this.graphics.fillCircle(position.x, position.y, this.config.hitMarkerRadius);

    // Add a ring around it
    this.graphics.lineStyle(2, color, 0.5);
    this.graphics.strokeCircle(position.x, position.y, this.config.hitMarkerRadius + 3);
  }

  /**
   * Draw the trajectory endpoint
   */
  private drawEndpoint(position: Vector2, color: number): void {
    this.graphics.fillStyle(color, 0.8);
    this.graphics.fillCircle(position.x, position.y, this.config.endpointRadius);
  }

  /**
   * Clear the rendered trajectory
   */
  clear(): void {
    this.graphics.clear();
  }

  /**
   * Destroy the graphics object
   */
  destroy(): void {
    this.graphics.destroy();
  }
}
