import { Vec2 } from "@/math/Vec2";
import type { GhostPoint, TrajectoryResult, Vector2 } from "@/types";
import type Phaser from "phaser";

/**
 * Visual configuration for trajectory rendering
 */
interface TrajectoryRenderConfig {
  validColor: number;
  invalidColor: number;
  plannedHitColor: number;
  ghostColor: number;
  lineWidth: number;
  lineAlpha: number;
  ghostAlpha: number;
  hitMarkerRadius: number;
  endpointRadius: number;
  dashLength: number;
  gapLength: number;
}

const DEFAULT_CONFIG: TrajectoryRenderConfig = {
  validColor: 0x00ff88, // Green
  invalidColor: 0xff4444, // Red
  plannedHitColor: 0x00ffff, // Cyan
  ghostColor: 0x888888, // Gray
  lineWidth: 2,
  lineAlpha: 0.8,
  ghostAlpha: 0.3,
  hitMarkerRadius: 5,
  endpointRadius: 4,
  dashLength: 10,
  gapLength: 8,
};

/**
 * TrajectoryRenderer - Draws trajectory paths using Phaser graphics
 *
 * Features:
 * - Solid lines for main trajectory
 * - Red for invalid trajectories (missed segment)
 * - Dotted lines with low opacity for ghost path
 * - Markers for planned surface hits
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
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Rendering logic requires many visual decisions
  render(result: TrajectoryResult): void {
    this.graphics.clear();

    const { points, ghostPoints, status } = result;

    if (points.length < 2) return;

    // Determine if trajectory is invalid (missed segment)
    const isInvalid = status === "missed_segment" || status === "hit_obstacle";
    const mainColor = isInvalid ? this.config.invalidColor : this.config.validColor;

    // Draw main trajectory segments (solid lines)
    for (let i = 0; i < points.length - 1; i++) {
      const fromPoint = points[i];
      const toPoint = points[i + 1];
      if (!fromPoint || !toPoint) continue;

      this.graphics.lineStyle(this.config.lineWidth, mainColor, this.config.lineAlpha);
      this.graphics.lineBetween(
        fromPoint.position.x,
        fromPoint.position.y,
        toPoint.position.x,
        toPoint.position.y
      );
    }

    // Draw ghost path (dotted lines with low opacity)
    if (ghostPoints.length > 0 && points.length > 0) {
      const lastMainPoint = points[points.length - 1];
      if (lastMainPoint) {
        this.drawGhostPath(lastMainPoint.position, ghostPoints);
      }
    }

    // Draw planned hit markers
    for (const point of points) {
      if (point.isPlanned) {
        this.drawHitMarker(point.position, this.config.plannedHitColor);
      }
    }

    // Draw endpoint marker on main path
    if (points.length > 1) {
      const endpoint = points[points.length - 1];
      if (endpoint) {
        const endColor = isInvalid ? this.config.invalidColor : this.config.validColor;
        this.drawEndpoint(endpoint.position, endColor);
      }
    }

    // Draw stick marker on ghost path if applicable
    const lastGhost = ghostPoints[ghostPoints.length - 1];
    if (lastGhost?.willStick) {
      this.drawStickMarker(lastGhost.position);
    }
  }

  /**
   * Draw the ghost path as dotted lines
   */
  private drawGhostPath(startPos: Vector2, ghostPoints: readonly GhostPoint[]): void {
    let currentPos = startPos;

    for (const ghost of ghostPoints) {
      this.drawDottedLine(
        currentPos,
        ghost.position,
        this.config.ghostColor,
        this.config.ghostAlpha
      );
      currentPos = ghost.position;

      // Draw small marker at bounce points (not at stick point)
      if (!ghost.willStick) {
        this.drawGhostBounceMarker(ghost.position);
      }
    }
  }

  /**
   * Draw a dotted line between two points
   */
  private drawDottedLine(from: Vector2, to: Vector2, color: number, alpha: number): void {
    const totalDistance = Vec2.distance(from, to);
    if (totalDistance === 0) return;

    const direction = Vec2.direction(from, to);

    let distance = 0;
    let isDash = true;

    this.graphics.lineStyle(this.config.lineWidth, color, alpha);

    while (distance < totalDistance) {
      const segmentLength = isDash ? this.config.dashLength : this.config.gapLength;
      const endDistance = Math.min(distance + segmentLength, totalDistance);

      if (isDash) {
        const segStart = Vec2.add(from, Vec2.scale(direction, distance));
        const segEnd = Vec2.add(from, Vec2.scale(direction, endDistance));
        this.graphics.lineBetween(segStart.x, segStart.y, segEnd.x, segEnd.y);
      }

      distance += segmentLength;
      isDash = !isDash;
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
   * Draw a small marker at ghost path bounce points
   */
  private drawGhostBounceMarker(position: Vector2): void {
    this.graphics.fillStyle(this.config.ghostColor, this.config.ghostAlpha);
    this.graphics.fillCircle(position.x, position.y, 3);
  }

  /**
   * Draw an X marker where arrow will stick
   */
  private drawStickMarker(position: Vector2): void {
    const size = 6;
    this.graphics.lineStyle(2, 0xff6666, 0.6);
    this.graphics.lineBetween(
      position.x - size,
      position.y - size,
      position.x + size,
      position.y + size
    );
    this.graphics.lineBetween(
      position.x + size,
      position.y - size,
      position.x - size,
      position.y + size
    );
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
