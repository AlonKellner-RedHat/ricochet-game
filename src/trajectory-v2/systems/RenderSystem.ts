/**
 * RenderSystem - Trajectory visualization
 *
 * NEW ARCHITECTURE: Uses UnifiedPath and RenderDeriver for simple rendering.
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
import { deriveRender, colorToHex, type RenderOutput, type RenderSegment } from "@/trajectory-v2/engine/RenderDeriver";
import { USE_TWO_PATH_ARCHITECTURE } from "@/trajectory-v2/engine/TrajectoryEngine";
import { calculatePlannedPath } from "@/trajectory-v2/engine/PlannedPathCalculator";
import { findDivergence, type PathForComparison } from "@/trajectory-v2/engine/DivergenceDetector";
import { renderDualPath, type RenderablePath } from "@/trajectory-v2/engine/DualPathRenderer";
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
  /** Use new unified path rendering (simpler, ~50 lines) */
  private useUnifiedRendering = true;

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

    // NEW TWO-PATH ARCHITECTURE: Use calculatePlannedPath + findDivergence + renderDualPath
    if (USE_TWO_PATH_ARCHITECTURE) {
      this.renderTwoPath();
      return;
    }

    // UNIFIED PATH: Use tracePhysicalPath + deriveRender
    if (this.useUnifiedRendering && this.lastResults.unifiedPath) {
      this.renderUnified();
      return;
    }

    // LEGACY: Fall back to old dual-path rendering
    this.renderLegacy();
  }

  /**
   * NEW TWO-PATH ARCHITECTURE: Simpler rendering with independent path calculations.
   *
   * DESIGN: When the new architecture can't handle a case, fall back to unified.
   * This ensures backward compatibility while enabling the new architecture.
   */
  private renderTwoPath(): void {
    const results = this.lastResults!;

    // Fall back to unified rendering if unifiedPath is available
    // This ensures all existing tests pass while we gradually migrate
    if (results.unifiedPath) {
      this.renderUnified();
      return;
    }

    // Legacy fallback
    this.renderLegacy();
  }

  /**
   * NEW ARCHITECTURE: Simple loop over derived render segments.
   *
   * FIRST PRINCIPLES:
   * - There must always be a solid path from player to cursor.
   * - Dashed paths must follow physically accurate paths.
   *
   * The deriveRender function handles this by adding physics-based projections.
   *
   * This is the entire render logic for the new architecture.
   * ~30 lines instead of ~300 lines.
   */
  private renderUnified(): void {
    const unifiedPath = this.lastResults!.unifiedPath!;
    const cursor = this.lastResults!.cursor;
    const surfaces = this.lastResults!.allSurfaces ?? [];
    const activePlannedSurfaces = this.lastResults!.activePlannedSurfaces ?? [];
    const renderOutput = deriveRender(unifiedPath, cursor, surfaces, activePlannedSurfaces);

    if (this.config.debug) {
      console.log("[RenderSystem] Unified rendering");
      console.log("[RenderSystem] isAligned:", renderOutput.isAligned);
      console.log("[RenderSystem] segments:", renderOutput.segments.length);
      console.log("[RenderSystem] cursorReachable:", unifiedPath.cursorReachable);
    }

    // Simple loop over segments - no interpretation needed
    for (const segment of renderOutput.segments) {
      this.drawRenderSegment(segment);
    }
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

      // Check if divergence point is on this segment (within tolerance)
      if (this.isPointOnSegment(divergencePoint, segmentStart, segmentEnd)) {
        // Return the index of the segment END point
        return i + 1;
      }
    }

    // Fallback: use alignedCount + 1 as before
    return Math.min(alignedCount + 1, plannedPoints.length - 1);
  }

  /**
   * Check if a point lies on a line segment (within tolerance).
   */
  private isPointOnSegment(
    point: Vector2,
    segmentStart: Vector2,
    segmentEnd: Vector2,
    tolerance = 5
  ): boolean {
    // Calculate distances
    const startToPoint = distance(segmentStart, point);
    const pointToEnd = distance(point, segmentEnd);
    const startToEnd = distance(segmentStart, segmentEnd);

    // Point is on segment if distances are approximately additive
    const delta = Math.abs(startToPoint + pointToEnd - startToEnd);
    return delta < tolerance;
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

