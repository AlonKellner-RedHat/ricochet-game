/**
 * RenderSystem - Trajectory visualization
 *
 * UNIFIED ARCHITECTURE: Uses DualPathRenderer for simple, principled rendering.
 *
 * Colors:
 * - Solid green: Aligned/unplanned before cursor
 * - Dashed yellow: Aligned/unplanned after cursor
 * - Solid red: Diverged before cursor
 * - Dashed red: Diverged after cursor
 */

import { distance } from "@/trajectory-v2/geometry/GeometryOps";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { AlignmentResult, EngineResults, PathResult } from "@/trajectory-v2/engine/types";
import { findDivergence } from "@/trajectory-v2/engine/DivergenceDetector";
import { renderDualPath, renderFullTrajectory, type RenderablePath, type RenderSegment, colorToHex } from "@/trajectory-v2/engine/DualPathRenderer";
import {
  DEFAULT_RENDER_CONFIG,
  type ITrajectorySystem,
  type RenderConfig,
} from "./ITrajectorySystem";

/**
 * Graphics interface for rendering (Phaser-compatible).
 */
export interface IGraphics {
  clear(): void;
  lineStyle(width: number, color: number, alpha?: number): void;
  lineBetween(x1: number, y1: number, x2: number, y2: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  strokePath(): void;
}

/**
 * RenderSystem implementation.
 */
export class RenderSystem implements ITrajectorySystem {
  readonly id = "render";

  private graphics: IGraphics;
  private config: RenderConfig;
  private lastResults: EngineResults | null = null;

  constructor(graphics: IGraphics, config: Partial<RenderConfig> = {}) {
    this.graphics = graphics;
    this.config = { ...DEFAULT_RENDER_CONFIG, ...config };
  }

  onEngineUpdate(results: EngineResults): void {
    this.lastResults = results;
    this.render();
  }

  update(_deltaTime: number): void {
    // RenderSystem doesn't need time-based updates
    // Rendering happens in response to engine updates
  }

  dispose(): void {
    this.graphics.clear();
    this.lastResults = null;
  }

  /**
   * Force a re-render with current results.
   */
  render(): void {
    if (!this.lastResults) return;

    this.graphics.clear();

    // Use new full trajectory if available
    if (this.lastResults.fullTrajectory && this.lastResults.cursor) {
      this.renderFullTrajectory();
    } else {
      // Fall back to two-path architecture
      this.renderTwoPath();
    }
  }

  /**
   * NEW: Render using the unified FullTrajectoryResult.
   *
   * Uses renderFullTrajectory from DualPathRenderer which handles all 4 sections:
   * - merged: GREEN (solid before cursor, dashed yellow after)
   * - physicalDivergent: YELLOW dashed
   * - plannedToCursor: RED solid
   * - physicalFromCursor: RED dashed
   */
  private renderFullTrajectory(): void {
    const { fullTrajectory, cursor } = this.lastResults!;
    if (!fullTrajectory || !cursor) return;

    const segments = renderFullTrajectory(fullTrajectory, cursor);

    if (this.config.debug) {
      console.log("[RenderSystem] Full trajectory rendering");
      console.log("[RenderSystem] isFullyAligned:", fullTrajectory.isFullyAligned);
      console.log("[RenderSystem] merged segments:", fullTrajectory.merged.length);
      console.log("[RenderSystem] physicalDivergent:", fullTrajectory.physicalDivergent.length);
      console.log("[RenderSystem] plannedToCursor:", fullTrajectory.plannedToCursor.length);
      console.log("[RenderSystem] physicalFromCursor:", fullTrajectory.physicalFromCursor.length);
      console.log("[RenderSystem] render segments:", segments.length);
    }

    // Draw all segments
    for (const segment of segments) {
      this.drawRenderSegment(segment);
    }
  }

  /**
   * UNIFIED TWO-PATH ARCHITECTURE: Simple rendering using DualPathRenderer.
   *
   * Uses engine results directly - no deprecated PathBuilder/RenderDeriver.
   */
  private renderTwoPath(): void {
    const results = this.lastResults!;
    const { plannedPath, actualPath, cursor } = results;

    if (!plannedPath || !actualPath || plannedPath.points.length < 2 || !cursor) {
      // Fall back to legacy rendering if paths are invalid
      this.renderLegacy();
      return;
    }

    // Build renderable paths from engine results
    const actualRenderable: RenderablePath = {
      waypoints: actualPath.points,
      cursorIndex: this.findCursorIndex(actualPath.points, cursor),
      cursorT: this.findCursorT(actualPath.points, cursor),
    };

    const plannedRenderable: RenderablePath = {
      waypoints: plannedPath.points,
      cursorIndex: plannedPath.points.length - 2,
      cursorT: 1,
    };

    // Find divergence using unified detector
    const divergence = findDivergence(
      { waypoints: actualPath.points },
      { waypoints: plannedPath.points }
    );

    // Render using DualPathRenderer
    const segments = renderDualPath(
      actualRenderable,
      plannedRenderable,
      {
        segmentIndex: divergence.segmentIndex,
        point: divergence.point,
        isAligned: divergence.isAligned,
      },
      cursor
    );

    if (this.config.debug) {
      console.log("[RenderSystem] Two-path rendering");
      console.log("[RenderSystem] isAligned:", divergence.isAligned);
      console.log("[RenderSystem] segments:", segments.length);
    }

    // Draw all segments
    for (const segment of segments) {
      this.drawRenderSegment(segment);
    }

    // Render forward projections
    if (actualPath.forwardProjection && actualPath.forwardProjection.length > 0) {
      this.renderForwardProjection(actualPath, this.config.actualDivergedColor);
    }
  }

  /**
   * Find the segment index containing the cursor.
   */
  private findCursorIndex(waypoints: readonly Vector2[], cursor: Vector2): number {
    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i]!;
      const b = waypoints[i + 1]!;
      if (this.isPointOnSegment(cursor, a, b)) {
        return i;
      }
    }
    return waypoints.length - 2; // Default to last segment
  }

  /**
   * Find the parametric position of cursor within its segment.
   */
  private findCursorT(waypoints: readonly Vector2[], cursor: Vector2): number {
    const idx = this.findCursorIndex(waypoints, cursor);
    if (idx < 0 || idx >= waypoints.length - 1) return 1;

    const a = waypoints[idx]!;
    const b = waypoints[idx + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return 0;

    return Math.max(0, Math.min(1, ((cursor.x - a.x) * dx + (cursor.y - a.y) * dy) / lenSq));
  }

  /**
   * Draw a single render segment.
   */
  private drawRenderSegment(segment: RenderSegment): void {
    const color = colorToHex(segment.color);

    if (segment.style === "solid") {
      this.graphics.lineStyle(this.config.lineWidth, color, this.config.solidAlpha);
      this.graphics.lineBetween(segment.start.x, segment.start.y, segment.end.x, segment.end.y);
    } else {
      this.drawDashedLine(segment.start, segment.end, color);
    }
  }

  /**
   * LEGACY: Old dual-path rendering for backward compatibility.
   */
  private renderLegacy(): void {
    const { plannedPath, actualPath, alignment } = this.lastResults!;

    if (this.config.debug) {
      console.log("[RenderSystem] Legacy rendering");
      console.log("[RenderSystem] isFullyAligned:", alignment.isFullyAligned);
    }

    if (alignment.isFullyAligned) {
      this.renderAlignedPath(actualPath);
    } else {
      this.renderDivergedPaths(plannedPath, actualPath, alignment);
    }
  }

  /**
   * Render when paths are fully aligned (all green).
   */
  private renderAlignedPath(path: PathResult): void {
    if (path.points.length < 2) return;

    // Solid green: main path
    this.graphics.lineStyle(
      this.config.lineWidth,
      this.config.alignedColor,
      this.config.solidAlpha
    );

    for (let i = 0; i < path.points.length - 1; i++) {
      const from = path.points[i]!;
      const to = path.points[i + 1]!;
      this.graphics.lineBetween(from.x, from.y, to.x, to.y);
    }

    // Dashed yellow: forward projection beyond cursor
    this.renderForwardProjection(path, this.config.actualDivergedColor);
  }

  /**
   * Render when paths diverge.
   */
  private renderDivergedPaths(
    planned: PathResult,
    actual: PathResult,
    alignment: AlignmentResult
  ): void {
    const divergencePoint = alignment.divergencePoint;

    if (!divergencePoint) {
      // No divergence point means immediate divergence
      this.renderPlannedDiverged(planned);
      this.renderActualDiverged(actual);
      return;
    }

    // 1. Solid green: Player to divergence point
    const startPoint = planned.points[0];
    if (startPoint) {
      this.renderAlignedSegment(startPoint, divergencePoint);
    }

    // 2. Solid red: Divergence to planned endpoint
    this.renderPlannedFromDivergence(planned, divergencePoint, alignment.alignedSegmentCount);

    // 3. Dashed yellow: Actual path from divergence
    this.renderActualFromDivergence(actual, alignment.alignedSegmentCount);
  }

  /**
   * Render the aligned segment (solid green).
   */
  private renderAlignedSegment(from: Vector2, to: Vector2): void {
    this.graphics.lineStyle(
      this.config.lineWidth,
      this.config.alignedColor,
      this.config.solidAlpha
    );
    this.graphics.lineBetween(from.x, from.y, to.x, to.y);
  }

  /**
   * Render planned path from divergence point (solid red).
   *
   * FIRST PRINCIPLE 2.5: The red path must show the FULL ideal trajectory.
   * This means drawing through all planned reflection points, not skipping
   * to the cursor. If obstructions were removed and segments extended, this
   * exact path would appear as green/yellow.
   *
   * The key insight is that we need to draw from the divergence point
   * through ALL remaining planned points, including reflection waypoints
   * that the actual path never reached.
   */
  private renderPlannedFromDivergence(
    planned: PathResult,
    divergencePoint: Vector2,
    alignedCount: number
  ): void {
    this.graphics.lineStyle(
      this.config.lineWidth,
      this.config.plannedDivergedColor,
      this.config.solidAlpha
    );

    // Find where on the planned path the divergence point falls.
    // We need to draw from divergence through ALL subsequent planned points.
    //
    // The issue with using alignedCount directly is that a segment might be
    // counted as "aligned" if directions match, even if the actual path was
    // cut short by an obstruction. We need to find the NEXT planned waypoint
    // after the divergence point.

    let nextPointIndex = this.findNextPointAfterDivergence(
      planned.points,
      divergencePoint,
      alignedCount
    );

    // Draw from divergence point through all remaining planned points
    if (nextPointIndex < planned.points.length) {
      const firstTarget = planned.points[nextPointIndex];
      if (firstTarget) {
        // First segment: divergence → next planned point
        this.graphics.lineBetween(
          divergencePoint.x,
          divergencePoint.y,
          firstTarget.x,
          firstTarget.y
        );
      }

      // Remaining segments: continue through all planned points
      for (let i = nextPointIndex; i < planned.points.length - 1; i++) {
        const from = planned.points[i]!;
        const to = planned.points[i + 1]!;
        this.graphics.lineBetween(from.x, from.y, to.x, to.y);
      }
    }

    // Dashed red: forward projection beyond cursor
    this.renderForwardProjection(planned, this.config.plannedDivergedColor);
  }

  /**
   * Find the index of the next planned point after the divergence point.
   *
   * This handles the case where the actual path was cut short by an obstruction
   * while heading toward a reflection point. We need to continue drawing
   * from the reflection point, not skip to the cursor.
   */
  private findNextPointAfterDivergence(
    plannedPoints: readonly Vector2[],
    divergencePoint: Vector2,
    alignedCount: number
  ): number {
    if (plannedPoints.length < 2) {
      return plannedPoints.length;
    }

    // Check if divergence point lies ON one of the planned segments
    // If so, continue from the end of that segment
    for (let i = 0; i < plannedPoints.length - 1; i++) {
      const segmentStart = plannedPoints[i]!;
      const segmentEnd = plannedPoints[i + 1]!;

      // Check if divergence point is on this segment (exact check)
      if (this.isPointOnSegment(divergencePoint, segmentStart, segmentEnd)) {
        // Return the index of the segment END point
        return i + 1;
      }
    }

    // Fallback: use alignedCount + 1 as before
    return Math.min(alignedCount + 1, plannedPoints.length - 1);
  }

  /**
   * Check if a point lies on a line segment (exact check using cross product).
   */
  private isPointOnSegment(
    point: Vector2,
    segmentStart: Vector2,
    segmentEnd: Vector2
  ): boolean {
    const dx = segmentEnd.x - segmentStart.x;
    const dy = segmentEnd.y - segmentStart.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      return point.x === segmentStart.x && point.y === segmentStart.y;
    }

    // Cross product for collinearity
    const cross = (point.x - segmentStart.x) * dy - (point.y - segmentStart.y) * dx;
    if (cross !== 0) return false;

    // Parametric t for segment position
    const t = ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / lenSq;
    return t >= 0 && t <= 1;
  }

  /**
   * Render actual path from divergence (dashed yellow).
   */
  private renderActualFromDivergence(
    actual: PathResult,
    alignedCount: number
  ): void {
    // Start from the point after the aligned segments
    for (let i = alignedCount; i < actual.points.length - 1; i++) {
      const from = actual.points[i];
      const to = actual.points[i + 1];
      if (from && to) {
        this.drawDashedLine(from, to, this.config.actualDivergedColor);
      }
    }

    // Dashed yellow: forward projection beyond last point
    this.renderForwardProjection(actual, this.config.actualDivergedColor);
  }

  /**
   * Render entire planned path as diverged (solid red).
   */
  private renderPlannedDiverged(planned: PathResult): void {
    this.graphics.lineStyle(
      this.config.lineWidth,
      this.config.plannedDivergedColor,
      this.config.solidAlpha
    );

    for (let i = 0; i < planned.points.length - 1; i++) {
      const from = planned.points[i]!;
      const to = planned.points[i + 1]!;
      this.graphics.lineBetween(from.x, from.y, to.x, to.y);
    }

    // Dashed red: forward projection beyond cursor
    this.renderForwardProjection(planned, this.config.plannedDivergedColor);
  }

  /**
   * Render entire actual path as diverged (dashed yellow).
   */
  private renderActualDiverged(actual: PathResult): void {
    for (let i = 0; i < actual.points.length - 1; i++) {
      const from = actual.points[i]!;
      const to = actual.points[i + 1]!;
      this.drawDashedLine(from, to, this.config.actualDivergedColor);
    }

    // Dashed yellow: forward projection beyond last point
    this.renderForwardProjection(actual, this.config.actualDivergedColor);
  }

  /**
   * Render forward projection of a path as a dashed line.
   *
   * FIRST PRINCIPLE 2.2: Forward projection must follow physically accurate trajectory.
   * - Must draw through ALL intermediate points (reflection points)
   * - Cannot skip directly to the endpoint (that would go through surfaces)
   */
  private renderForwardProjection(path: PathResult, color: number): void {
    if (!path.forwardProjection || path.forwardProjection.length === 0) {
      return;
    }

    // Forward projection starts from the last point of the path
    const lastPoint = path.points[path.points.length - 1];
    if (!lastPoint) return;

    // Draw dashed line through ALL projection points, including intermediate reflections
    // This is critical: drawing directly to the last point would skip reflection points
    // and the visualization would go through surfaces (violating physics)
    let currentPoint = lastPoint;
    for (const projectionPoint of path.forwardProjection) {
      this.drawDashedLine(currentPoint, projectionPoint, color);
      currentPoint = projectionPoint;
    }
  }

  /**
   * Draw a dashed line between two points.
   */
  private drawDashedLine(from: Vector2, to: Vector2, color: number): void {
    const totalLength = distance(from, to);
    if (totalLength < 1) return;

    const dx = (to.x - from.x) / totalLength;
    const dy = (to.y - from.y) / totalLength;

    let currentLength = 0;
    let isDrawing = true;

    this.graphics.lineStyle(
      this.config.lineWidth,
      color,
      this.config.dashedAlpha
    );

    while (currentLength < totalLength) {
      const segmentLength = isDrawing
        ? Math.min(this.config.dashLength, totalLength - currentLength)
        : Math.min(this.config.dashGap, totalLength - currentLength);

      if (isDrawing) {
        const startX = from.x + dx * currentLength;
        const startY = from.y + dy * currentLength;
        const endX = from.x + dx * (currentLength + segmentLength);
        const endY = from.y + dy * (currentLength + segmentLength);
        this.graphics.lineBetween(startX, startY, endX, endY);
      }

      currentLength += segmentLength;
      isDrawing = !isDrawing;
    }
  }

  /**
   * Update render configuration.
   */
  setConfig(config: Partial<RenderConfig>): void {
    this.config = { ...this.config, ...config };
    this.render();
  }

  /**
   * Get current render configuration.
   */
  getConfig(): RenderConfig {
    return { ...this.config };
  }
}

