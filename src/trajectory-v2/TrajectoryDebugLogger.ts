/**
 * TrajectoryDebugLogger - Comprehensive logging for debugging trajectory issues
 *
 * Enable this to capture all relevant data when reproducing bugs.
 * The output can be copied and used to create test setups.
 */

import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { ActualPath } from "./engine/ActualPathCalculator";
import type { BypassResult } from "./engine/BypassEvaluator";
import type { DivergenceInfo } from "./engine/DivergenceDetector";
import type { RenderSegment } from "./engine/DualPathRenderer";
import type { PlannedPath } from "./engine/PlannedPathCalculator";

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
 * Vertex type for debug logging - includes all SourcePoint types
 */
export type VertexDebugType = 
  | "surface"      // Endpoint or HitPoint on a surface
  | "screen"       // Endpoint on screen boundary
  | "origin"       // OriginPoint (window endpoint)
  | "junction"     // JunctionPoint between surfaces
  | "arc_hit"      // ArcHitPoint - ray hit the range limit
  | "arc_intersection" // ArcIntersectionPoint - surface crosses range limit
  | "arc_junction"; // ArcJunctionPoint - semi-circle boundary

/**
 * Debug info for a single vertex in the visibility polygon
 */
export interface VertexDebugInfo {
  position: Vector2;
  type: VertexDebugType;
  /** Surface ID if vertex is on a surface */
  surfaceId?: string;
  /** Additional provenance info (e.g., raySource key for arc_hit) */
  provenance?: string;
}

/**
 * Debug info for range limit configuration
 */
export interface RangeLimitDebugInfo {
  center: Vector2;
  radius: number;
  orientation: "horizontal" | "vertical";
}

/**
 * Debug info for visibility/outline calculation.
 */
export interface VisibilityDebugInfo {
  origin: Vector2;
  coneSections: Array<{ startAngle: number; endAngle: number }>;
  coneSpan: number;
  outlineVertices: VertexDebugInfo[];
  isValid: boolean;
  /** Range limit configuration if active */
  rangeLimit?: RangeLimitDebugInfo;
  /** @deprecated Use validPolygons and plannedPolygons instead */
  intermediatePolygons?: IntermediatePolygonDebugInfo[];
  /** Valid polygons - full visibility from each origin (N+1 for N surfaces) */
  validPolygons?: ValidPolygonDebugInfo[];
  /** Planned polygons - cropped paths to reach each surface (N for N surfaces) */
  plannedPolygons?: PlannedPolygonDebugInfo[];
}

/**
 * Debug info for an intermediate visibility polygon.
 * @deprecated Use ValidPolygonDebugInfo and PlannedPolygonDebugInfo instead.
 */
export interface IntermediatePolygonDebugInfo {
  stepIndex: number;
  origin: Vector2;
  vertexCount: number;
  vertices: Vector2[];
  isValid: boolean;
  windowSurfaceId?: string;
}

/**
 * Debug info for a valid polygon step.
 */
export interface ValidPolygonDebugInfo {
  /** Step index (0 = player, K = after K reflections) */
  stepIndex: number;
  /** Origin for this step */
  origin: Vector2;
  /** Number of vertices in the polygon */
  vertexCount: number;
  /** All polygon vertices */
  vertices: Vector2[];
  /** Whether this polygon is valid */
  isValid: boolean;
}

/**
 * Debug info for a planned polygon step.
 */
export interface PlannedPolygonDebugInfo {
  /** Step index (0 to N-1, targeting surface K) */
  stepIndex: number;
  /** Origin for this step */
  origin: Vector2;
  /** Number of vertices in the polygon */
  vertexCount: number;
  /** All polygon vertices */
  vertices: Vector2[];
  /** Whether this polygon is valid */
  isValid: boolean;
  /** ID of the target surface */
  targetSurfaceId: string;
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
    console.log("%c[TRAJECTORY DEBUG] Dumping logs...", "color: #00ff00; font-weight: bold");
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
   * Export last log as a JSON object (for creating test cases).
   * Returns full precision values for exact reproduction.
   */
  exportAsTestSetup(): string {
    if (!this.lastLog) {
      return JSON.stringify({ error: "No log available" });
    }

    const log = this.lastLog;

    const exportData = {
      name: `generated-setup-${log.timestamp}`,
      timestamp: new Date(log.timestamp).toISOString(),
      player: { x: log.player.x, y: log.player.y },
      cursor: { x: log.cursor.x, y: log.cursor.y },
      plannedSurfaces: log.plannedSurfaces.map((s) => ({
        id: s.id,
        start: { x: s.start.x, y: s.start.y },
        end: { x: s.end.x, y: s.end.y },
        canReflect: s.canReflect,
      })),
      allSurfaces: log.allSurfaces.map((s) => ({
        id: s.id,
        start: { x: s.start.x, y: s.start.y },
        end: { x: s.end.x, y: s.end.y },
        canReflect: s.canReflect,
      })),
      visibility: log.visibility
        ? {
            origin: { x: log.visibility.origin.x, y: log.visibility.origin.y },
            coneSpanDegrees: (log.visibility.coneSpan * 180) / Math.PI,
            coneSections: log.visibility.coneSections.map((s) => ({
              startAngleDegrees: (s.startAngle * 180) / Math.PI,
              endAngleDegrees: (s.endAngle * 180) / Math.PI,
            })),
            outlineVertices: log.visibility.outlineVertices.map((v) => ({
              x: v.position.x,
              y: v.position.y,
              type: v.type,
              surfaceId: v.surfaceId,
              provenance: v.provenance,
            })),
            isValid: log.visibility.isValid,
            rangeLimit: log.visibility.rangeLimit
              ? {
                  center: { x: log.visibility.rangeLimit.center.x, y: log.visibility.rangeLimit.center.y },
                  radius: log.visibility.rangeLimit.radius,
                  orientation: log.visibility.rangeLimit.orientation,
                }
              : null,
            validPolygons: log.visibility.validPolygons?.map((p) => ({
              stepIndex: p.stepIndex,
              origin: { x: p.origin.x, y: p.origin.y },
              vertexCount: p.vertexCount,
              vertices: p.vertices.map((v) => ({ x: v.x, y: v.y })),
              isValid: p.isValid,
            })),
            plannedPolygons: log.visibility.plannedPolygons?.map((p) => ({
              stepIndex: p.stepIndex,
              origin: { x: p.origin.x, y: p.origin.y },
              vertexCount: p.vertexCount,
              vertices: p.vertices.map((v) => ({ x: v.x, y: v.y })),
              isValid: p.isValid,
              targetSurfaceId: p.targetSurfaceId,
            })),
          }
        : null,
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Print last log as test setup to console.
   */
  exportToConsole(): void {
    console.log("%c[TRAJECTORY DEBUG] Test Setup Export:", "color: #00ff00; font-weight: bold");
    console.log(this.exportAsTestSetup());
  }
}

/**
 * Global debug logger instance.
 */
export const TrajectoryDebugLogger = new TrajectoryDebugLoggerImpl();

// Expose to window for easy access from browser console
if (typeof window !== "undefined") {
  (
    window as unknown as { TrajectoryDebugLogger: TrajectoryDebugLoggerImpl }
  ).TrajectoryDebugLogger = TrajectoryDebugLogger;
}
