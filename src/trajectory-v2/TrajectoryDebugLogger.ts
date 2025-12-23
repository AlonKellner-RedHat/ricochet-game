/**
 * TrajectoryDebugLogger - Comprehensive logging for debugging trajectory issues
 *
 * Enable this to capture all relevant data when reproducing bugs.
 * The output can be copied and used to create test setups.
 */

import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { BypassResult } from "./engine/BypassEvaluator";
import type { PlannedPath } from "./engine/PlannedPathCalculator";
import type { ActualPath } from "./engine/ActualPathCalculator";
import type { DivergenceInfo } from "./engine/DivergenceDetector";
import type { RenderSegment } from "./engine/DualPathRenderer";

/**
 * Debug log entry for a single trajectory calculation.
 */
export interface TrajectoryDebugLog {
  timestamp: number;
  player: Vector2;
  cursor: Vector2;
  plannedSurfaces: SurfaceDebugInfo[];
  allSurfaces: SurfaceDebugInfo[];
  bypassResult?: BypassDebugInfo;
  plannedPath?: PlannedPathDebugInfo;
  actualPath?: ActualPathDebugInfo;
  divergence?: DivergenceDebugInfo;
  renderSegments?: RenderSegmentDebugInfo[];
  visibility?: VisibilityDebugInfo;
}

/**
 * Debug info for visibility/outline calculation.
 */
export interface VisibilityDebugInfo {
  origin: Vector2;
  coneSections: Array<{ startAngle: number; endAngle: number }>;
  coneSpan: number;
  outlineVertices: Array<{
    position: Vector2;
    type: "surface" | "screen" | "origin";
  }>;
  isValid: boolean;
}

export interface SurfaceDebugInfo {
  id: string;
  start: Vector2;
  end: Vector2;
  normal: Vector2;
  canReflect: boolean;
  surfaceType: string;
}

export interface BypassDebugInfo {
  activeSurfaceIds: string[];
  bypassedSurfaces: Array<{
    surfaceId: string;
    reason: string;
    originalIndex: number;
  }>;
}

export interface PlannedPathDebugInfo {
  waypoints: Vector2[];
  hits: Array<{
    point: Vector2;
    surfaceId: string;
    onSegment: boolean;
  }>;
  cursorIndex: number;
  cursorT: number;
}

export interface ActualPathDebugInfo {
  waypoints: Vector2[];
  hits: Array<{
    point: Vector2;
    surfaceId: string;
    onSegment: boolean;
    reflected: boolean;
  }>;
  reachedCursor: boolean;
  blockedBy?: string;
}

export interface DivergenceDebugInfo {
  isAligned: boolean;
  segmentIndex: number;
  point?: Vector2;
}

export interface RenderSegmentDebugInfo {
  start: Vector2;
  end: Vector2;
  style: string;
  color: string;
}

/**
 * Global debug logger instance.
 */
class TrajectoryDebugLoggerImpl {
  private enabled = false;
  private logs: TrajectoryDebugLog[] = [];
  private maxLogs = 100;
  private lastLog: TrajectoryDebugLog | null = null;
  private logThrottleMs = 100; // Don't log more than once per 100ms
  private lastLogTime = 0;

  /**
   * Enable debug logging.
   */
  enable(): void {
    this.enabled = true;
    console.log(
      "%c[TRAJECTORY DEBUG] Logging enabled. Use TrajectoryDebugLogger.dump() to see logs.",
      "color: #00ff00; font-weight: bold"
    );
  }

  /**
   * Disable debug logging.
   */
  disable(): void {
    this.enabled = false;
    console.log("[TRAJECTORY DEBUG] Logging disabled.");
  }

  /**
   * Toggle debug logging.
   */
  toggle(): void {
    if (this.enabled) {
      this.disable();
    } else {
      this.enable();
    }
  }

  /**
   * Check if logging is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Log the current trajectory state.
   */
  logTrajectory(
    player: Vector2,
    cursor: Vector2,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[]
  ): void {
    if (!this.enabled) return;

    const now = Date.now();
    if (now - this.lastLogTime < this.logThrottleMs) return;
    this.lastLogTime = now;

    const log: TrajectoryDebugLog = {
      timestamp: now,
      player: { ...player },
      cursor: { ...cursor },
      plannedSurfaces: plannedSurfaces.map((s) => this.surfaceToDebugInfo(s)),
      allSurfaces: allSurfaces.map((s) => this.surfaceToDebugInfo(s)),
    };

    this.lastLog = log;
    this.logs.push(log);

    // Keep only the last N logs
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Log to console that we captured a frame
    console.log(
      `%c[TRAJECTORY DEBUG] Captured frame #${this.logs.length} - Player: (${player.x.toFixed(1)}, ${player.y.toFixed(1)}), Cursor: (${cursor.x.toFixed(1)}, ${cursor.y.toFixed(1)}), Surfaces: ${plannedSurfaces.length} planned, ${allSurfaces.length} total`,
      "color: #88ff88"
    );
  }

  /**
   * Log bypass evaluation result.
   */
  logBypass(result: BypassResult): void {
    if (!this.enabled || !this.lastLog) return;

    this.lastLog.bypassResult = {
      activeSurfaceIds: result.activeSurfaces.map((s) => s.id),
      bypassedSurfaces: result.bypassedSurfaces.map((b) => ({
        surfaceId: b.surface.id,
        reason: b.reason,
        originalIndex: b.originalIndex,
      })),
    };
  }

  /**
   * Log planned path.
   */
  logPlannedPath(path: PlannedPath): void {
    if (!this.enabled || !this.lastLog) return;

    this.lastLog.plannedPath = {
      waypoints: path.waypoints.map((w) => ({ ...w })),
      hits: path.hits.map((h) => ({
        point: { ...h.point },
        surfaceId: h.surface.id,
        onSegment: h.onSegment,
      })),
      cursorIndex: path.cursorIndex,
      cursorT: path.cursorT,
    };
  }

  /**
   * Log actual path.
   */
  logActualPath(path: ActualPath): void {
    if (!this.enabled || !this.lastLog) return;

    this.lastLog.actualPath = {
      waypoints: path.waypoints.map((w) => ({ ...w })),
      hits: path.hits.map((h) => ({
        point: { ...h.point },
        surfaceId: h.surface.id,
        onSegment: h.onSegment,
        reflected: h.reflected,
      })),
      reachedCursor: path.reachedCursor,
      blockedBy: path.blockedBy?.id,
    };
  }

  /**
   * Log divergence info.
   */
  logDivergence(divergence: DivergenceInfo): void {
    if (!this.enabled || !this.lastLog) return;

    this.lastLog.divergence = {
      isAligned: divergence.isAligned,
      segmentIndex: divergence.segmentIndex,
      point: divergence.point ? { ...divergence.point } : undefined,
    };
  }

  /**
   * Log render segments.
   */
  logRenderSegments(segments: readonly RenderSegment[]): void {
    if (!this.enabled || !this.lastLog) return;

    this.lastLog.renderSegments = segments.map((s) => ({
      start: { ...s.start },
      end: { ...s.end },
      style: s.style,
      color: s.color,
    }));
  }

  /**
   * Log visibility/outline data.
   */
  logVisibility(visibility: VisibilityDebugInfo): void {
    if (!this.enabled || !this.lastLog) return;

    this.lastLog.visibility = visibility;
  }

  /**
   * Convert a surface to debug info.
   */
  private surfaceToDebugInfo(surface: Surface): SurfaceDebugInfo {
    return {
      id: surface.id,
      start: { ...surface.segment.start },
      end: { ...surface.segment.end },
      normal: surface.getNormal(),
      canReflect: surface.isPlannable(),
      surfaceType: surface.surfaceType,
    };
  }

  /**
   * Dump all logs to console.
   */
  dump(): void {
    console.log(
      "%c[TRAJECTORY DEBUG] Dumping logs...",
      "color: #00ff00; font-weight: bold"
    );
    console.log("Total logs:", this.logs.length);

    for (const log of this.logs) {
      console.group(`Log @ ${new Date(log.timestamp).toISOString()}`);
      console.log("Player:", log.player);
      console.log("Cursor:", log.cursor);
      console.log("Planned Surfaces:", log.plannedSurfaces);
      console.log("All Surfaces:", log.allSurfaces);
      if (log.bypassResult) {
        console.log("Bypass Result:", log.bypassResult);
      }
      if (log.plannedPath) {
        console.log("Planned Path:", log.plannedPath);
      }
      if (log.actualPath) {
        console.log("Actual Path:", log.actualPath);
      }
      if (log.divergence) {
        console.log("Divergence:", log.divergence);
      }
      if (log.renderSegments) {
        console.log("Render Segments:", log.renderSegments);
      }
      if (log.visibility) {
        console.log("Visibility:", log.visibility);
      }
      console.groupEnd();
    }
  }

  /**
   * Get the last log entry.
   */
  getLastLog(): TrajectoryDebugLog | null {
    return this.lastLog;
  }

  /**
   * Get all logs.
   */
  getAllLogs(): readonly TrajectoryDebugLog[] {
    return this.logs;
  }

  /**
   * Clear all logs.
   */
  clear(): void {
    this.logs = [];
    this.lastLog = null;
    console.log("[TRAJECTORY DEBUG] Logs cleared.");
  }

  /**
   * Export last log as a test setup (for creating test cases).
   */
  exportAsTestSetup(): string {
    if (!this.lastLog) {
      return "// No log available";
    }

    const log = this.lastLog;
    const surfaceCode = log.plannedSurfaces
      .map(
        (s) =>
          `    createTestSurface({
      id: "${s.id}",
      start: { x: ${s.start.x}, y: ${s.start.y} },
      end: { x: ${s.end.x}, y: ${s.end.y} },
      canReflect: ${s.canReflect},
    })`
      )
      .join(",\n");

    const allSurfaceCode = log.allSurfaces
      .map(
        (s) =>
          `    createTestSurface({
      id: "${s.id}",
      start: { x: ${s.start.x}, y: ${s.start.y} },
      end: { x: ${s.end.x}, y: ${s.end.y} },
      canReflect: ${s.canReflect},
    })`
      )
      .join(",\n");

    let visibilityComment = "";
    if (log.visibility) {
      const v = log.visibility;
      visibilityComment = `
/**
 * Visibility Debug Info:
 * - Origin: (${v.origin.x.toFixed(1)}, ${v.origin.y.toFixed(1)})
 * - Cone Span: ${(v.coneSpan * 180 / Math.PI).toFixed(1)}°
 * - Cone Sections: ${v.coneSections.length}
${v.coneSections.map((s, i) => ` *   [${i}] ${(s.startAngle * 180 / Math.PI).toFixed(1)}° to ${(s.endAngle * 180 / Math.PI).toFixed(1)}°`).join('\n')}
 * - Outline Vertices: ${v.outlineVertices.length}
${v.outlineVertices.slice(0, 20).map((v, i) => ` *   [${i}] (${v.position.x.toFixed(1)}, ${v.position.y.toFixed(1)}) - ${v.type}`).join('\n')}${v.outlineVertices.length > 20 ? `\n *   ... and ${v.outlineVertices.length - 20} more` : ''}
 * - Is Valid: ${v.isValid}
 */`;
    }

    return `/**
 * Auto-generated test setup from debug log
 * Timestamp: ${new Date(log.timestamp).toISOString()}
 */${visibilityComment}
export const generatedSetup: TestSetup = {
  name: "generated-setup-${log.timestamp}",
  description: "Auto-generated from debug log",
  player: { x: ${log.player.x}, y: ${log.player.y} },
  cursor: { x: ${log.cursor.x}, y: ${log.cursor.y} },
  plannedSurfaces: [
${surfaceCode}
  ],
  allSurfaces: [
${allSurfaceCode}
  ],
  expected: {
    // Fill in expected values based on the issue
  },
  tags: ["generated", "debug"],
};`;
  }

  /**
   * Print last log as test setup to console.
   */
  exportToConsole(): void {
    console.log(
      "%c[TRAJECTORY DEBUG] Test Setup Export:",
      "color: #00ff00; font-weight: bold"
    );
    console.log(this.exportAsTestSetup());
  }
}

/**
 * Global debug logger instance.
 */
export const TrajectoryDebugLogger = new TrajectoryDebugLoggerImpl();

// Expose to window for easy access from browser console
if (typeof window !== "undefined") {
  (window as unknown as { TrajectoryDebugLogger: TrajectoryDebugLoggerImpl }).TrajectoryDebugLogger =
    TrajectoryDebugLogger;
}

