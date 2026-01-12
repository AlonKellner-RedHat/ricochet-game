/**
 * Invariant Debug Renderer
 *
 * Visual debug tool for investigating invariant failures.
 * Renders scene geometry, visibility polygon, and highlights invalid edges.
 */

import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import {
  type SourcePoint,
  isEndpoint,
  isHitPoint,
  isOriginPoint,
} from "@/trajectory-v2/geometry/SourcePoint";
import { isJunctionPoint } from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { createFullCone, projectConeV2 } from "@/trajectory-v2/visibility/ConeProjectionV2";
import { dedupeConsecutiveHits } from "@/trajectory-v2/visibility/RenderingDedup";
import Phaser from "phaser";
import { DEBUG_SCENES, type DebugScene, SCREEN_BOUNDS, parseDebugParams } from "./debugScenes";

/**
 * Colors for different rendering elements.
 */
const COLORS = {
  background: 0x1a1a2e,
  screenBoundary: 0x16213e,
  screenBoundaryLine: 0x0f3460,
  surfaceReflective: 0x4a90d9,
  surfaceWall: 0x666666,
  polygonFill: 0x00ff00,
  polygonFillAlpha: 0.15,
  validEdge: 0x00ff00,
  invalidEdge: 0xff0000,
  rayLine: 0xffff00,
  rayLineAlpha: 0.3,
  player: 0xff6b6b,
  vertexLabel: "#ffffff",
  vertexLabelBg: "#000000cc",
};

/**
 * Get surface IDs from a SourcePoint.
 */
function getSourceSurfaceIds(sp: SourcePoint): string[] {
  if (isHitPoint(sp)) {
    return [sp.hitSurface.id];
  }
  if (isEndpoint(sp)) {
    return [sp.surface.id];
  }
  if (isJunctionPoint(sp)) {
    const before = sp.getSurfaceBefore();
    const after = sp.getSurfaceAfter();
    return [before.id, after.id];
  }
  return [];
}

/**
 * Check if two points share any surface.
 */
function sharesAnySurface(s1: SourcePoint, s2: SourcePoint): boolean {
  const ids1 = getSourceSurfaceIds(s1);
  const ids2 = getSourceSurfaceIds(s2);
  return ids1.some((id) => ids2.includes(id));
}

/**
 * Check if two points are collinear with the origin.
 */
function isRayThroughPoint(origin: Vector2, p1: Vector2, p2: Vector2): boolean {
  const toP1X = p1.x - origin.x;
  const toP1Y = p1.y - origin.y;
  const toP2X = p2.x - origin.x;
  const toP2Y = p2.y - origin.y;

  const cross = toP1X * toP2Y - toP1Y * toP2X;
  const magP1 = Math.sqrt(toP1X * toP1X + toP1Y * toP1Y);
  const magP2 = Math.sqrt(toP2X * toP2X + toP2Y * toP2Y);

  if (magP1 < 1e-10 || magP2 < 1e-10) return true;

  const normalizedCross = Math.abs(cross) / (magP1 * magP2);
  if (normalizedCross >= 0.001) return false;

  const dot = toP1X * toP2X + toP1Y * toP2Y;
  return dot >= 0;
}

/**
 * Check if two points form a continuation pair.
 */
function isContinuationPair(s1: SourcePoint, s2: SourcePoint, origin: Vector2): boolean {
  const isContinuationResult = (sp: SourcePoint): boolean =>
    isHitPoint(sp) || isJunctionPoint(sp) || isEndpoint(sp);
  const isContinuationSource = (sp: SourcePoint): boolean => isEndpoint(sp) || isJunctionPoint(sp);

  if (isContinuationSource(s1) && isContinuationResult(s2)) {
    const sourcePos = s1.computeXY();
    const hitPos = s2.computeXY();
    if (sourcePos.x === hitPos.x && sourcePos.y === hitPos.y) return false;
    return isRayThroughPoint(origin, hitPos, sourcePos);
  }

  if (isContinuationSource(s2) && isContinuationResult(s1)) {
    const sourcePos = s2.computeXY();
    const hitPos = s1.computeXY();
    if (sourcePos.x === hitPos.x && sourcePos.y === hitPos.y) return false;
    return isRayThroughPoint(origin, hitPos, sourcePos);
  }

  return false;
}

/**
 * Validate adjacent relationship.
 */
function validateAdjacentRelationship(s1: SourcePoint, s2: SourcePoint, origin: Vector2): boolean {
  if (isOriginPoint(s1) || isOriginPoint(s2)) return true;
  if (sharesAnySurface(s1, s2)) return true;
  if (isContinuationPair(s1, s2, origin)) return true;
  return false;
}

/**
 * Describe a SourcePoint for labels.
 */
function describePoint(sp: SourcePoint): string {
  if (isHitPoint(sp)) return `Hit[${sp.hitSurface.id}]`;
  if (isEndpoint(sp)) return `End[${sp.surface.id}]`;
  if (isJunctionPoint(sp)) {
    const ids = getSourceSurfaceIds(sp);
    return `Junc[${ids.join("+")}]`;
  }
  if (isOriginPoint(sp)) return "Origin";
  return "?";
}

/**
 * Mutable position type for interactive dragging.
 */
interface MutablePosition {
  x: number;
  y: number;
}

/**
 * Polygon view mode.
 */
type PolygonViewMode = "raw" | "processed";

/**
 * Invariant Debug Scene - Phaser Scene for debugging.
 */
export class InvariantDebugScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private textContainer!: Phaser.GameObjects.Container;
  private vertexZones!: Phaser.GameObjects.Container;
  private currentScene!: DebugScene;
  private playerPosition!: MutablePosition;
  private sourcePoints: SourcePoint[] = []; // Raw polygon
  private processedPoints: SourcePoint[] = []; // After collinear merging
  private viewMode: PolygonViewMode = "raw";
  private isDragging = false;
  private tooltipElement: HTMLDivElement | null = null;
  private hoveredVertexIndex: number | null = null;

  constructor() {
    super({ key: "InvariantDebugScene" });
  }

  create(): void {
    // Parse URL parameters
    const { scene, playerPosition } = parseDebugParams();
    this.currentScene = scene;
    this.playerPosition = { ...playerPosition };

    // Create graphics object
    this.graphics = this.add.graphics();
    this.textContainer = this.add.container(0, 0);
    this.vertexZones = this.add.container(0, 0);

    // Create tooltip element
    this.createTooltip();

    // Setup UI
    this.createUI();

    // Initial render
    this.updateVisualization();

    // Setup drag to move player
    this.input.on("pointerdown", this.onPointerDown, this);
    this.input.on("pointermove", this.onPointerMove, this);
    this.input.on("pointerup", this.onPointerUp, this);
  }

  private createUI(): void {
    // Scene selector
    const selectHtml = `
      <select id="scene-select" style="
        position: absolute;
        top: 10px;
        left: 10px;
        padding: 8px;
        font-size: 14px;
        background: #1a1a2e;
        color: white;
        border: 1px solid #4a90d9;
        border-radius: 4px;
      ">
        ${DEBUG_SCENES.map(
          (s) =>
            `<option value="${s.id}" ${s.id === this.currentScene.id ? "selected" : ""}>${s.name}</option>`
        ).join("")}
      </select>
    `;

    // View mode toggle
    const viewModeHtml = `
      <select id="view-mode-select" style="
        position: absolute;
        top: 10px;
        left: 180px;
        padding: 8px;
        font-size: 14px;
        background: #1a1a2e;
        color: white;
        border: 1px solid #4a90d9;
        border-radius: 4px;
      ">
        <option value="raw" selected>Raw Polygon</option>
        <option value="processed">Processed (dedupeConsecutiveHits)</option>
      </select>
    `;

    // Position display
    const posHtml = `
      <div id="pos-display" style="
        position: absolute;
        top: 10px;
        right: 10px;
        padding: 8px;
        font-size: 14px;
        background: #1a1a2ecc;
        color: white;
        border: 1px solid #4a90d9;
        border-radius: 4px;
      ">
        Player: (${this.playerPosition.x.toFixed(0)}, ${this.playerPosition.y.toFixed(0)})
      </div>
    `;

    // Info panel
    const infoHtml = `
      <div id="info-panel" style="
        position: absolute;
        bottom: 10px;
        left: 10px;
        padding: 8px;
        font-size: 12px;
        background: #1a1a2ecc;
        color: white;
        border: 1px solid #4a90d9;
        border-radius: 4px;
        max-width: 400px;
      ">
        <b>${this.currentScene.name}</b><br>
        ${this.currentScene.description}<br><br>
        <span style="color: #00ff00">■</span> Valid edge &nbsp;
        <span style="color: #ff0000">■</span> Invalid edge &nbsp;
        <span style="color: #ffff00">—</span> Ray
      </div>
    `;

    // Inject HTML
    const container = document.getElementById("game-container");
    if (container) {
      const uiDiv = document.createElement("div");
      uiDiv.id = "debug-ui";
      uiDiv.innerHTML = selectHtml + viewModeHtml + posHtml + infoHtml;
      container.appendChild(uiDiv);

      // Add event listener for scene selector
      const select = document.getElementById("scene-select") as HTMLSelectElement;
      if (select) {
        select.addEventListener("change", () => {
          const newScene = DEBUG_SCENES.find((s) => s.id === select.value);
          if (newScene) {
            this.currentScene = newScene;
            this.playerPosition = { ...newScene.defaultPlayerPosition };
            this.updateVisualization();
            this.updatePositionDisplay();
          }
        });
      }

      // Add event listener for view mode selector
      const viewModeSelect = document.getElementById("view-mode-select") as HTMLSelectElement;
      if (viewModeSelect) {
        viewModeSelect.addEventListener("change", () => {
          this.viewMode = viewModeSelect.value as PolygonViewMode;
          this.updateVisualization();
        });
      }
    }
  }

  private updatePositionDisplay(): void {
    const posDisplay = document.getElementById("pos-display");
    if (posDisplay) {
      posDisplay.innerHTML = `Player: (${this.playerPosition.x.toFixed(0)}, ${this.playerPosition.y.toFixed(0)})`;
    }
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    // Check if near player
    const dx = pointer.x - this.playerPosition.x;
    const dy = pointer.y - this.playerPosition.y;
    if (Math.sqrt(dx * dx + dy * dy) < 20) {
      this.isDragging = true;
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.isDragging) {
      this.playerPosition.x = Math.max(0, Math.min(SCREEN_BOUNDS.width, pointer.x));
      this.playerPosition.y = Math.max(0, Math.min(SCREEN_BOUNDS.height, pointer.y));
      this.updateVisualization();
      this.updatePositionDisplay();
    }
  }

  private onPointerUp(): void {
    this.isDragging = false;
  }

  private updateVisualization(): void {
    this.graphics.clear();
    this.textContainer.removeAll(true);

    // Create screen boundary chain
    const screenChain = createScreenBoundaryChain({
      minX: SCREEN_BOUNDS.minX,
      minY: SCREEN_BOUNDS.minY,
      maxX: SCREEN_BOUNDS.maxX,
      maxY: SCREEN_BOUNDS.maxY,
    });

    // All chains including screen
    const allChains = [...this.currentScene.chains, screenChain];

    // Generate visibility polygon
    const source = createFullCone(this.playerPosition);
    this.sourcePoints = projectConeV2(source, allChains);

    // Process polygon for "processed" view mode using existing provenance-based dedup
    this.processedPoints = this.applyProvenanceDedup(this.sourcePoints);

    // Render layers
    this.renderBackground();
    this.renderScreenBoundary();
    this.renderSurfaces();
    this.renderPolygonFill();
    this.renderRays();
    this.renderPolygonEdges();
    this.renderVertexLabels();
    this.renderPlayer();

    // Update info panel with stats
    this.updateInfoPanel();
  }

  /**
   * Get the active points based on view mode.
   */
  private getActivePoints(): SourcePoint[] {
    return this.viewMode === "raw" ? this.sourcePoints : this.processedPoints;
  }

  /**
   * Apply existing provenance-based deduplication from RenderingDedup.
   * Uses dedupeConsecutiveHits which removes consecutive HitPoints on the same surface.
   */
  private applyProvenanceDedup(points: SourcePoint[]): SourcePoint[] {
    return dedupeConsecutiveHits(points);
  }

  private renderBackground(): void {
    this.graphics.fillStyle(COLORS.background);
    this.graphics.fillRect(0, 0, SCREEN_BOUNDS.width, SCREEN_BOUNDS.height);
  }

  private renderScreenBoundary(): void {
    this.graphics.lineStyle(2, COLORS.screenBoundaryLine);
    this.graphics.strokeRect(0, 0, SCREEN_BOUNDS.width, SCREEN_BOUNDS.height);
  }

  private renderSurfaces(): void {
    for (const chain of this.currentScene.chains) {
      const surfaces = chain.getSurfaces();
      for (const surface of surfaces) {
        const isReflective = surface.surfaceType === "ricochet";
        const color = isReflective ? COLORS.surfaceReflective : COLORS.surfaceWall;
        this.graphics.lineStyle(3, color);
        this.graphics.beginPath();
        this.graphics.moveTo(surface.segment.start.x, surface.segment.start.y);
        this.graphics.lineTo(surface.segment.end.x, surface.segment.end.y);
        this.graphics.strokePath();

        // Draw endpoint markers
        this.graphics.fillStyle(color);
        this.graphics.fillCircle(surface.segment.start.x, surface.segment.start.y, 4);
        this.graphics.fillCircle(surface.segment.end.x, surface.segment.end.y, 4);
      }
    }
  }

  private renderPolygonFill(): void {
    const points = this.getActivePoints();
    if (points.length < 3) return;

    this.graphics.fillStyle(COLORS.polygonFill, COLORS.polygonFillAlpha);
    this.graphics.beginPath();

    const firstXY = points[0]!.computeXY();
    this.graphics.moveTo(firstXY.x, firstXY.y);

    for (let i = 1; i < points.length; i++) {
      const xy = points[i]!.computeXY();
      this.graphics.lineTo(xy.x, xy.y);
    }

    this.graphics.closePath();
    this.graphics.fillPath();
  }

  private renderRays(): void {
    const points = this.getActivePoints();
    this.graphics.lineStyle(1, COLORS.rayLine, COLORS.rayLineAlpha);

    for (const sp of points) {
      const xy = sp.computeXY();
      this.graphics.beginPath();
      this.graphics.moveTo(this.playerPosition.x, this.playerPosition.y);
      this.graphics.lineTo(xy.x, xy.y);
      this.graphics.strokePath();
    }
  }

  private renderPolygonEdges(): void {
    const points = this.getActivePoints();
    const n = points.length;
    if (n < 3) return;

    for (let i = 0; i < n; i++) {
      const s1 = points[i]!;
      const s2 = points[(i + 1) % n]!;
      const xy1 = s1.computeXY();
      const xy2 = s2.computeXY();

      const isValid = validateAdjacentRelationship(s1, s2, this.playerPosition);
      const color = isValid ? COLORS.validEdge : COLORS.invalidEdge;

      this.graphics.lineStyle(isValid ? 2 : 4, color);
      this.graphics.beginPath();
      this.graphics.moveTo(xy1.x, xy1.y);
      this.graphics.lineTo(xy2.x, xy2.y);
      this.graphics.strokePath();
    }
  }

  private renderVertexLabels(): void {
    // Clear old vertex zones
    this.vertexZones.removeAll(true);

    const points = this.getActivePoints();
    for (let i = 0; i < points.length; i++) {
      const sp = points[i]!;
      const xy = sp.computeXY();

      // Calculate angle for label positioning
      const angle = Math.atan2(xy.y - this.playerPosition.y, xy.x - this.playerPosition.x);
      const labelOffset = 15;
      const labelX = xy.x + Math.cos(angle) * labelOffset;
      const labelY = xy.y + Math.sin(angle) * labelOffset;

      const label = this.add.text(labelX, labelY, `[${i}] ${describePoint(sp)}`, {
        fontSize: "10px",
        color: COLORS.vertexLabel,
        backgroundColor: COLORS.vertexLabelBg,
        padding: { x: 2, y: 1 },
      });
      label.setOrigin(0.5, 0.5);
      this.textContainer.add(label);

      // Vertex marker
      this.graphics.fillStyle(0xffffff);
      this.graphics.fillCircle(xy.x, xy.y, 3);

      // Create interactive zone for vertex
      const vertexId = this.getVertexId(i, sp);
      this.createVertexZone(i, xy, vertexId);
    }
  }

  /**
   * Get a detailed ID for a vertex that can be copied.
   */
  private getVertexId(index: number, sp: SourcePoint): string {
    const xy = sp.computeXY();
    const angleRad = Math.atan2(xy.y - this.playerPosition.y, xy.x - this.playerPosition.x);
    const angleDeg = (angleRad * 180) / Math.PI;

    if (isHitPoint(sp)) {
      return `[${index}] HitPoint[${sp.hitSurface.id}] (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) @ ${angleDeg.toFixed(2)}° s=${sp.s.toFixed(4)}`;
    }
    if (isEndpoint(sp)) {
      return `[${index}] Endpoint[${sp.surface.id}] (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) @ ${angleDeg.toFixed(2)}°`;
    }
    if (isJunctionPoint(sp)) {
      const ids = getSourceSurfaceIds(sp);
      return `[${index}] Junction[${ids.join("+")}] (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) @ ${angleDeg.toFixed(2)}°`;
    }
    if (isOriginPoint(sp)) {
      return `[${index}] Origin (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)})`;
    }
    return `[${index}] Unknown (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)})`;
  }

  /**
   * Create an interactive zone for a vertex.
   */
  private createVertexZone(index: number, pos: { x: number; y: number }, vertexId: string): void {
    // Create an invisible interactive circle
    const zone = this.add.circle(pos.x, pos.y, 12, 0xffffff, 0);
    zone.setInteractive({ useHandCursor: true });

    // Store the vertex data
    zone.setData("index", index);
    zone.setData("vertexId", vertexId);
    zone.setData("pos", pos);

    // Hover events
    zone.on("pointerover", () => {
      this.hoveredVertexIndex = index;
      this.showTooltip(pos.x, pos.y, vertexId);
      // Highlight the vertex
      this.graphics.fillStyle(0xffff00);
      this.graphics.fillCircle(pos.x, pos.y, 6);
    });

    zone.on("pointerout", () => {
      this.hoveredVertexIndex = null;
      this.hideTooltip();
    });

    // Click to copy
    zone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      // Only handle left click, not drag
      if (pointer.leftButtonDown()) {
        this.copyToClipboard(vertexId);
      }
    });

    this.vertexZones.add(zone);
  }

  /**
   * Create the tooltip HTML element.
   */
  private createTooltip(): void {
    this.tooltipElement = document.createElement("div");
    this.tooltipElement.id = "vertex-tooltip";
    this.tooltipElement.style.cssText = `
      position: absolute;
      padding: 8px 12px;
      background: #000000ee;
      color: #ffffff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      border: 1px solid #4a90d9;
      border-radius: 4px;
      pointer-events: none;
      display: none;
      z-index: 1000;
      white-space: nowrap;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    `;

    const container = document.getElementById("game-container");
    if (container) {
      container.appendChild(this.tooltipElement);
    }
  }

  /**
   * Show tooltip at position.
   */
  private showTooltip(x: number, y: number, text: string): void {
    if (!this.tooltipElement) return;

    this.tooltipElement.textContent = text + " (click to copy)";
    this.tooltipElement.style.display = "block";
    this.tooltipElement.style.left = `${x + 20}px`;
    this.tooltipElement.style.top = `${y - 10}px`;

    // Keep tooltip on screen
    const rect = this.tooltipElement.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      this.tooltipElement.style.left = `${x - rect.width - 10}px`;
    }
  }

  /**
   * Hide tooltip.
   */
  private hideTooltip(): void {
    if (!this.tooltipElement) return;
    this.tooltipElement.style.display = "none";
  }

  /**
   * Copy text to clipboard and show confirmation.
   */
  private copyToClipboard(text: string): void {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        // Show confirmation
        this.showCopyConfirmation(text);
      })
      .catch((err) => {
        console.error("Failed to copy:", err);
      });
  }

  /**
   * Show a brief confirmation that text was copied.
   */
  private showCopyConfirmation(_text: string): void {
    if (!this.tooltipElement) return;

    const originalText = this.tooltipElement.textContent;
    this.tooltipElement.textContent = "✓ Copied!";
    this.tooltipElement.style.borderColor = "#00ff00";

    setTimeout(() => {
      if (this.tooltipElement && this.hoveredVertexIndex !== null) {
        this.tooltipElement.textContent = originalText;
        this.tooltipElement.style.borderColor = "#4a90d9";
      }
    }, 1000);
  }

  private renderPlayer(): void {
    // Player marker (larger, interactive)
    this.graphics.fillStyle(COLORS.player);
    this.graphics.fillCircle(this.playerPosition.x, this.playerPosition.y, 10);
    this.graphics.lineStyle(2, 0xffffff);
    this.graphics.strokeCircle(this.playerPosition.x, this.playerPosition.y, 10);
  }

  private updateInfoPanel(): void {
    const infoPanel = document.getElementById("info-panel");
    if (!infoPanel) return;

    const points = this.getActivePoints();

    // Count invalid edges for active view
    let invalidCount = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const s1 = points[i]!;
      const s2 = points[(i + 1) % n]!;
      if (!validateAdjacentRelationship(s1, s2, this.playerPosition)) {
        invalidCount++;
      }
    }

    // Count invalid edges for raw view (always show for comparison)
    let rawInvalidCount = 0;
    for (let i = 0; i < this.sourcePoints.length; i++) {
      const s1 = this.sourcePoints[i]!;
      const s2 = this.sourcePoints[(i + 1) % this.sourcePoints.length]!;
      if (!validateAdjacentRelationship(s1, s2, this.playerPosition)) {
        rawInvalidCount++;
      }
    }

    const viewModeLabel = this.viewMode === "raw" ? "Raw" : "Processed";
    const comparisonText =
      this.viewMode === "processed"
        ? `<br>Raw: ${this.sourcePoints.length} vertices, ${rawInvalidCount} invalid`
        : `<br>Processed: ${this.processedPoints.length} vertices`;

    infoPanel.innerHTML = `
      <b>${this.currentScene.name}</b> (${viewModeLabel})<br>
      ${this.currentScene.description}<br><br>
      Vertices: ${points.length} | 
      Invalid edges: <span style="color: ${invalidCount > 0 ? "#ff0000" : "#00ff00"}">${invalidCount}</span>
      ${comparisonText}<br><br>
      <span style="color: #00ff00">■</span> Valid edge &nbsp;
      <span style="color: #ff0000">■</span> Invalid edge &nbsp;
      <span style="color: #ffff00">—</span> Ray<br><br>
      <i>Drag player to move • Hover vertex for details • Click to copy</i>
    `;
  }
}
