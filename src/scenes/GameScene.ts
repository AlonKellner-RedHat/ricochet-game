import { DebugView, InputManager } from "@/core";
import { Player } from "@/player";
import { RicochetSurface, WallSurface } from "@/surfaces";
import type { Surface } from "@/surfaces";
import { GameAdapter } from "@/trajectory-v2/GameAdapter";
import { TrajectoryDebugLogger } from "@/trajectory-v2/TrajectoryDebugLogger";
import {
  type Segment,
  type WindowConfig,
  createMultiWindow,
  createSingleWindow,
  splitWindow,
} from "@/trajectory-v2/visibility/WindowConfig";
import Phaser from "phaser";

/**
 * Umbrella mode enum - cycles through OFF -> FULL -> HOLE -> OFF
 */
enum UmbrellaMode {
  OFF = "off",
  FULL = "full",
  HOLE = "hole",
}

/**
 * Main game scene for the Ricochet game
 *
 * Uses the new trajectory-v2 system for aiming and arrow management.
 */
export class GameScene extends Phaser.Scene {
  private inputManager!: InputManager;
  private debugView!: DebugView;

  // Trajectory system (v2)
  private trajectoryAdapter!: GameAdapter;

  // Arrow graphics (separate from trajectory graphics)
  private arrowGraphics!: Phaser.GameObjects.Graphics;

  // Demo surfaces
  private surfaces: Surface[] = [];
  private surfaceGraphics!: Phaser.GameObjects.Graphics;

  // Hover state
  private hoveredSurface: Surface | null = null;

  // Player (movement only)
  private player!: Player;
  private playerGraphics!: Phaser.GameObjects.Graphics;

  // Umbrella mode - creates a "window" above player for testing cone projection
  // Cycles: OFF -> FULL -> HOLE -> OFF
  private umbrellaMode: UmbrellaMode = UmbrellaMode.OFF;
  private umbrellaGraphics!: Phaser.GameObjects.Graphics;
  private static readonly UMBRELLA_WIDTH = 150;
  private static readonly UMBRELLA_HEIGHT = 100; // Distance above player
  private static readonly UMBRELLA_GAP_START = 0.48; // Gap starts at 48% of umbrella width
  private static readonly UMBRELLA_GAP_END = 0.52; // Gap ends at 52% of umbrella width

  // Debug modes
  private slowMode = false; // Movement slowed to 1 pixel per second
  private godMode = false; // Direct position control, bypass physics and collisions
  private static readonly SLOW_MODE_SPEED = 1; // pixels per second
  private static readonly GOD_MODE_SPEED = 200; // pixels per second in god mode (before slow mode)

  constructor() {
    super({ key: "GameScene" });
  }

  preload(): void {
    // No assets needed for now - using graphics primitives
  }

  create(): void {
    // Set background color
    this.cameras.main.setBackgroundColor(0x1a1a2e);

    // Initialize input manager
    this.inputManager = new InputManager(this);

    // Initialize debug view
    this.debugView = new DebugView(this);
    this.debugView.create();

    // Toggle debug with backtick key
    this.inputManager.onKeyPress("Backquote", () => {
      this.debugView.toggle();
    });

    // Toggle trajectory debug logging with 'L' key
    this.inputManager.onKeyPress("KeyL", () => {
      TrajectoryDebugLogger.toggle();
    });

    // Dump trajectory logs with 'D' key
    this.inputManager.onKeyPress("KeyD", () => {
      TrajectoryDebugLogger.dump();
    });

    // Export last log as test setup with 'E' key
    this.inputManager.onKeyPress("KeyE", () => {
      TrajectoryDebugLogger.exportToConsole();
    });

    // Toggle valid region overlay with 'V' key
    this.inputManager.onKeyPress("KeyV", () => {
      this.trajectoryAdapter.toggleValidRegion();
    });

    // Cycle umbrella mode with 'U' key: OFF -> FULL -> HOLE -> OFF
    this.inputManager.onKeyPress("KeyU", () => {
      switch (this.umbrellaMode) {
        case UmbrellaMode.OFF:
          this.umbrellaMode = UmbrellaMode.FULL;
          break;
        case UmbrellaMode.FULL:
          this.umbrellaMode = UmbrellaMode.HOLE;
          break;
        case UmbrellaMode.HOLE:
          this.umbrellaMode = UmbrellaMode.OFF;
          break;
      }
      console.log(`Umbrella mode: ${this.umbrellaMode.toUpperCase()}`);
    });

    // Toggle slow mode with 'P' key (1 pixel per second movement)
    this.inputManager.onKeyPress("KeyP", () => {
      this.slowMode = !this.slowMode;
      console.log(`Slow mode: ${this.slowMode ? "ON (1 px/s)" : "OFF"}`);
    });

    // Toggle god mode with 'G' key (bypass physics and collisions)
    this.inputManager.onKeyPress("KeyG", () => {
      this.godMode = !this.godMode;
      console.log(`God mode: ${this.godMode ? "ON (arrow keys, no physics)" : "OFF"}`);
    });

    // Toggle highlight mode with 'H' key (shows reaching cones for hovered surfaces)
    this.inputManager.onKeyPress("KeyH", () => {
      this.trajectoryAdapter.toggleHighlightMode();
      const enabled = this.trajectoryAdapter.isHighlightModeEnabled();
      console.log(`Highlight mode: ${enabled ? "ON" : "OFF"}`);
    });

    // Initialize trajectory v2 system
    this.trajectoryAdapter = new GameAdapter(this, {
      arrowSpeed: 800,
      shootCooldown: 0.3,
      showValidRegion: true, // Enable visibility overlay
      // Visibility overlay config:
      // shadowAlpha: base opacity for background (0% visibility)
      // Stages use visibility = 32/2^depth, with overlay = shadowAlpha * (1 - visibility/100)
      validRegionShadowAlpha: 0.7, // Background shadow darkness
    });

    // Create arrow graphics
    this.arrowGraphics = this.add.graphics();

    // Create demo surfaces
    this.createDemoSurfaces();

    // Create player
    const spawnPoint = { x: 150, y: 450 };
    this.player = new Player(spawnPoint);
    this.playerGraphics = this.add.graphics();

    // Create graphics for surfaces
    this.surfaceGraphics = this.add.graphics();
    this.drawSurfaces();

    // Create graphics for umbrella
    this.umbrellaGraphics = this.add.graphics();

    // Add title and control hints
    this.add
      .text(this.cameras.main.centerX, 30, "RICOCHET DEMO (V2)", {
        fontFamily: "JetBrains Mono, monospace",
        fontSize: "24px",
        color: "#e94560",
      })
      .setOrigin(0.5);

    this.add
      .text(
        this.cameras.main.centerX,
        55,
        "WASD/Arrows to move • Space to jump • Click cyan surface to plan • Click elsewhere to shoot",
        {
          fontFamily: "JetBrains Mono, monospace",
          fontSize: "12px",
          color: "#888888",
        }
      )
      .setOrigin(0.5);

    this.add
      .text(
        this.cameras.main.centerX,
        70,
        "Debug: L=logging • D=dump • E=export • V=visibility • U=umbrella",
        {
          fontFamily: "JetBrains Mono, monospace",
          fontSize: "10px",
          color: "#666666",
        }
      )
      .setOrigin(0.5);
  }

  update(_time: number, delta: number): void {
    // Convert delta from ms to seconds
    const deltaSeconds = delta / 1000;

    // Get input
    const movementInput = this.inputManager.getMovementInput();
    const pointer = this.inputManager.getPointerPosition();

    // Update hover state
    this.hoveredSurface = this.inputManager.findClickedSurface(pointer, this.surfaces, true);

    // Update player movement (with slow mode and god mode support)
    this.updatePlayerMovement(deltaSeconds, movementInput);

    // Get current window configuration (umbrella/umbrella hole mode)
    const windowConfig = this.getUmbrellaWindowConfig();

    // Update trajectory system with window configuration
    this.trajectoryAdapter.update(
      deltaSeconds,
      this.player.bowPosition,
      pointer,
      this.trajectoryAdapter.getPlannedSurfaces(),
      this.surfaces,
      windowConfig
    );

    // Draw umbrella if enabled
    this.drawUmbrella();

    // Render highlight cones for hovered surface
    // Only highlight if:
    // 1. Surface is plannable (ricochet surface)
    // 2. Light comes from the reflective side of the surface
    const plannedSurfaces = this.trajectoryAdapter.getPlannedSurfaces();
    let highlightSurface = null;

    if (this.hoveredSurface?.isPlannable()) {
      // Get the light origin: player position or player image (if planned surfaces exist)
      const lightOrigin = this.trajectoryAdapter.getLightOrigin();

      // Calculate direction from light origin to surface center
      const surfCenter = {
        x: (this.hoveredSurface.segment.start.x + this.hoveredSurface.segment.end.x) / 2,
        y: (this.hoveredSurface.segment.start.y + this.hoveredSurface.segment.end.y) / 2,
      };
      const dirToSurface = {
        x: surfCenter.x - lightOrigin.x,
        y: surfCenter.y - lightOrigin.y,
      };

      // Check if light comes from reflective side
      if (this.hoveredSurface.canReflectFrom(dirToSurface)) {
        highlightSurface = this.hoveredSurface;
      }
    }

    this.trajectoryAdapter.renderHighlightCones(highlightSurface, plannedSurfaces);

    // Update cursor based on hover state and cursor reachability
    if (this.hoveredSurface?.isPlannable()) {
      this.input.setDefaultCursor("pointer");
    } else if (!this.trajectoryAdapter.isCursorReachable()) {
      this.input.setDefaultCursor("not-allowed");
    } else {
      this.input.setDefaultCursor("crosshair");
    }

    // Handle click events
    if (this.inputManager.wasPointerClicked()) {
      this.handleClick(pointer);
    }

    // Handle right-click to clear plan
    if (this.inputManager.wasRightClicked()) {
      this.trajectoryAdapter.clearPlan();
    }

    // Redraw player at new position
    this.drawPlayer();

    // Redraw surfaces (to show planned state)
    this.drawSurfaces();

    // Render arrows
    this.renderArrows();

    // Update debug info
    const pos = this.player.position;
    const vel = this.player.velocity;
    const alignment = this.trajectoryAdapter.getDualTrajectoryResult().alignment;
    this.debugView.setInfo("playerX", Math.round(pos.x));
    this.debugView.setInfo("playerY", Math.round(pos.y));
    this.debugView.setInfo("velX", Math.round(vel.x));
    this.debugView.setInfo("velY", Math.round(vel.y));
    this.debugView.setInfo("state", this.player.state);
    this.debugView.setInfo("grounded", this.player.isGrounded);
    this.debugView.setInfo("aligned", alignment.isFullyAligned);
    this.debugView.setInfo("planned", this.trajectoryAdapter.getPlannedSurfaces().length);
    this.debugView.setInfo("arrows", this.trajectoryAdapter.getArrowsForRendering().length);
    this.debugView.setInfo("slowMode", this.slowMode);
    this.debugView.setInfo("godMode", this.godMode);

    this.debugView.update();

    // Clear single-frame input events at end of frame
    this.inputManager.clearFrameEvents();
  }

  /**
   * Update player movement with slow mode and god mode support.
   *
   * - Normal mode: Physics-based platformer movement with collisions
   * - Slow mode: Same as normal but movement is 1 pixel per second
   * - God mode: Direct arrow key control, bypass physics and collisions
   * - Slow + God mode: Direct control at 1 pixel per second
   */
  private updatePlayerMovement(
    deltaSeconds: number,
    input: { left: boolean; right: boolean; jump: boolean; jumpHeld: boolean }
  ): void {
    if (this.godMode) {
      // God mode: Direct position control with arrow keys
      // Determine speed (can be compounded with slow mode)
      const speed = this.slowMode ? GameScene.SLOW_MODE_SPEED : GameScene.GOD_MODE_SPEED;

      // Calculate movement direction
      let dx = 0;
      let dy = 0;

      if (input.left) dx -= 1;
      if (input.right) dx += 1;
      if (input.jump || input.jumpHeld) dy -= 1; // Up
      if (this.inputManager.isKeyDown("KeyS") || this.inputManager.isKeyDown("ArrowDown")) dy += 1; // Down

      // Apply movement directly to position (no physics, no collisions)
      if (dx !== 0 || dy !== 0) {
        // Normalize for diagonal movement
        const length = Math.sqrt(dx * dx + dy * dy);
        dx = dx / length;
        dy = dy / length;

        const newPos = {
          x: this.player.position.x + dx * speed * deltaSeconds,
          y: this.player.position.y + dy * speed * deltaSeconds,
        };

        this.player.setPosition(newPos);
      }
    } else {
      // Normal mode (with optional slow mode)
      let effectiveDelta = deltaSeconds;

      if (this.slowMode) {
        // Calculate effective delta to achieve 1 pixel per second
        // Normal max speed is ~300-400 px/s, so we need to reduce delta significantly
        // At 1 px/s with typical max speed of 300 px/s, we need delta * 300 = 1
        // So effective delta = 1 / 300 per frame at full speed
        // But we want any movement to be 1 px/s, so we scale based on actual movement
        effectiveDelta = deltaSeconds * (GameScene.SLOW_MODE_SPEED / 300);
      }

      this.player.update(effectiveDelta, input, this.surfaces);
    }
  }

  /**
   * Handle click events for planning and shooting
   */
  private handleClick(clickPosition: { x: number; y: number }): void {
    // Check if clicking on a plannable surface
    const clickedSurface = this.inputManager.findClickedSurface(clickPosition, this.surfaces, true);

    if (clickedSurface) {
      // Toggle surface in plan
      this.trajectoryAdapter.toggleSurfaceInPlan(clickedSurface);
    } else {
      // Shoot arrow
      this.trajectoryAdapter.shoot();
    }
  }

  /**
   * Render arrows from the trajectory system
   */
  private renderArrows(): void {
    this.arrowGraphics.clear();

    const arrows = this.trajectoryAdapter.getArrowsForRendering();

    for (const arrow of arrows) {
      if (!arrow.active) continue;

      const { position, direction } = arrow;
      const x = position.x;
      const y = position.y;

      // Calculate rotation angle
      const angle = Math.atan2(direction.y, direction.x);

      // Arrow body (line)
      const bodyLength = 30;
      const tailX = x - Math.cos(angle) * bodyLength;
      const tailY = y - Math.sin(angle) * bodyLength;

      this.arrowGraphics.lineStyle(3, 0xffffff, 1);
      this.arrowGraphics.lineBetween(tailX, tailY, x, y);

      // Arrow head (triangle)
      const headSize = 8;
      const headAngle = Math.PI / 6;

      const head1X = x - Math.cos(angle - headAngle) * headSize;
      const head1Y = y - Math.sin(angle - headAngle) * headSize;
      const head2X = x - Math.cos(angle + headAngle) * headSize;
      const head2Y = y - Math.sin(angle + headAngle) * headSize;

      this.arrowGraphics.fillStyle(0xffffff, 1);
      this.arrowGraphics.beginPath();
      this.arrowGraphics.moveTo(x, y);
      this.arrowGraphics.lineTo(head1X, head1Y);
      this.arrowGraphics.lineTo(head2X, head2Y);
      this.arrowGraphics.closePath();
      this.arrowGraphics.fillPath();

      // Fletching (tail feathers)
      const fletchLength = 10;
      const fletchAngle = Math.PI / 4;

      this.arrowGraphics.lineStyle(2, 0xff6b6b, 0.8);
      this.arrowGraphics.lineBetween(
        tailX,
        tailY,
        tailX - Math.cos(angle - fletchAngle) * fletchLength,
        tailY - Math.sin(angle - fletchAngle) * fletchLength
      );
      this.arrowGraphics.lineBetween(
        tailX,
        tailY,
        tailX - Math.cos(angle + fletchAngle) * fletchLength,
        tailY - Math.sin(angle + fletchAngle) * fletchLength
      );
    }
  }

  /**
   * Create demo surfaces for testing
   */
  private createDemoSurfaces(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Boundary walls (gray)
    this.surfaces.push(
      // Floor
      new WallSurface("floor", {
        start: { x: 0, y: height - 20 },
        end: { x: width, y: height - 20 },
      }),
      // Ceiling
      new WallSurface("ceiling", {
        start: { x: 0, y: 80 },
        end: { x: width, y: 80 },
      }),
      // Left wall
      new WallSurface("left-wall", {
        start: { x: 20, y: 80 },
        end: { x: 20, y: height - 20 },
      }),
      // Right wall
      new WallSurface("right-wall", {
        start: { x: width - 20, y: 80 },
        end: { x: width - 20, y: height - 20 },
      }),
      // Platform in the middle
      new WallSurface("platform-1", {
        start: { x: 300, y: 450 },
        end: { x: 500, y: 450 },
      }),
      // Higher platform
      new WallSurface("platform-2", {
        start: { x: 550, y: 350 },
        end: { x: 750, y: 350 },
      })
    );

    // Ricochet surfaces (cyan)
    this.surfaces.push(
      // Angled surface top-right
      new RicochetSurface("ricochet-1", {
        start: { x: 800, y: 150 },
        end: { x: 900, y: 250 },
      }),
      // Horizontal surface middle
      new RicochetSurface("ricochet-2", {
        start: { x: 400, y: 250 },
        end: { x: 550, y: 250 },
      }),
      // Angled surface left
      new RicochetSurface("ricochet-3", {
        start: { x: 100, y: 200 },
        end: { x: 200, y: 300 },
      }),
      // Vertical surface
      new RicochetSurface("ricochet-4", {
        start: { x: 850, y: 350 },
        end: { x: 850, y: 500 },
      })
    );
  }

  /**
   * Draw all surfaces with plan highlighting and bypass indication
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Drawing logic requires many visual decisions
  private drawSurfaces(): void {
    this.surfaceGraphics.clear();

    // Get bypassed surfaces from trajectory adapter
    const bypassedIds = this.trajectoryAdapter.getBypassedSurfaceIds();

    for (const surface of this.surfaces) {
      const props = surface.getVisualProperties();
      const planIndex = this.trajectoryAdapter.getSurfacePlanIndex(surface);
      const isPlanned = planIndex > 0;
      const isBypassed = isPlanned && bypassedIds.has(surface.id);
      const isHovered = this.hoveredSurface?.id === surface.id && surface.isPlannable();

      // Determine visual properties based on state
      let color = props.color;
      let lineWidth = props.lineWidth;
      let alpha = props.alpha;

      if (isPlanned) {
        if (isBypassed) {
          // Bypassed planned surface: red/orange with dashed appearance
          color = 0xff6600; // Orange for bypassed
          lineWidth = props.lineWidth + 1;
          alpha = 0.6;
        } else {
          // Active planned surface: yellow
          color = 0xffff00;
          lineWidth = props.lineWidth + 2;
          alpha = 1;
        }
      } else if (isHovered) {
        // Brighter color for hover - shift toward white
        color = this.brightenColor(props.color, 0.5);
        lineWidth = props.lineWidth + 1;
        alpha = 1;
      }

      // Draw the surface line
      this.surfaceGraphics.lineStyle(lineWidth, color, alpha);
      this.surfaceGraphics.lineBetween(
        surface.segment.start.x,
        surface.segment.start.y,
        surface.segment.end.x,
        surface.segment.end.y
      );

      // Draw dashed overlay for bypassed surfaces
      if (isBypassed) {
        this.drawDashedLine(surface, 0xff0000, lineWidth, 0.8);
      }

      // Add glow effect for ricochet surfaces or hovered surfaces (not for bypassed)
      if ((props.glow || isPlanned || isHovered) && !isBypassed) {
        const glowColor = isPlanned ? 0xffff00 : isHovered ? 0xffffff : props.color;
        const glowAlpha = isPlanned ? 0.4 : isHovered ? 0.5 : 0.2;
        const glowWidth = isHovered ? lineWidth + 8 : lineWidth + 4;

        this.surfaceGraphics.lineStyle(glowWidth, glowColor, glowAlpha);
        this.surfaceGraphics.lineBetween(
          surface.segment.start.x,
          surface.segment.start.y,
          surface.segment.end.x,
          surface.segment.end.y
        );

        // Extra outer glow for hovered surfaces
        if (isHovered) {
          this.surfaceGraphics.lineStyle(glowWidth + 6, glowColor, 0.2);
          this.surfaceGraphics.lineBetween(
            surface.segment.start.x,
            surface.segment.start.y,
            surface.segment.end.x,
            surface.segment.end.y
          );
        }
      }

      // Draw direction indicator for ricochet surfaces (shows reflective side)
      if (surface.isPlannable()) {
        this.drawDirectionIndicator(surface, isPlanned && !isBypassed, isHovered);
      }
    }
  }

  /**
   * Draw a dashed line over a surface segment
   */
  private drawDashedLine(surface: Surface, color: number, lineWidth: number, alpha: number): void {
    const dashLength = 8;
    const gapLength = 4;

    const dx = surface.segment.end.x - surface.segment.start.x;
    const dy = surface.segment.end.y - surface.segment.start.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length < 0.001) return;

    const nx = dx / length;
    const ny = dy / length;

    let pos = 0;
    let drawing = true;

    this.surfaceGraphics.lineStyle(lineWidth + 1, color, alpha);

    while (pos < length) {
      const segLength = drawing ? dashLength : gapLength;
      const endPos = Math.min(pos + segLength, length);

      if (drawing) {
        const x1 = surface.segment.start.x + nx * pos;
        const y1 = surface.segment.start.y + ny * pos;
        const x2 = surface.segment.start.x + nx * endPos;
        const y2 = surface.segment.start.y + ny * endPos;
        this.surfaceGraphics.lineBetween(x1, y1, x2, y2);
      }

      pos = endPos;
      drawing = !drawing;
    }
  }

  /**
   * Draw a small indicator showing the reflective side of a directional surface
   */
  private drawDirectionIndicator(surface: Surface, isPlanned: boolean, isHovered: boolean): void {
    const normal = surface.getNormal();
    const midX = (surface.segment.start.x + surface.segment.end.x) / 2;
    const midY = (surface.segment.start.y + surface.segment.end.y) / 2;

    // Calculate indicator position (offset from surface midpoint)
    const indicatorOffset = 12;
    const indicatorX = midX + normal.x * indicatorOffset;
    const indicatorY = midY + normal.y * indicatorOffset;

    // Triangle size
    const size = 6;

    // Calculate triangle points (pointing in normal direction)
    const tipX = indicatorX + normal.x * size;
    const tipY = indicatorY + normal.y * size;

    // Perpendicular for base points
    const perpX = -normal.y;
    const perpY = normal.x;
    const baseOffset = size * 0.6;

    const base1X = indicatorX + perpX * baseOffset;
    const base1Y = indicatorY + perpY * baseOffset;
    const base2X = indicatorX - perpX * baseOffset;
    const base2Y = indicatorY - perpY * baseOffset;

    // Color based on state
    const indicatorColor = isPlanned ? 0xffff00 : isHovered ? 0xffffff : 0x00ffff;
    const indicatorAlpha = isPlanned ? 0.9 : isHovered ? 0.9 : 0.6;

    // Draw filled triangle
    this.surfaceGraphics.fillStyle(indicatorColor, indicatorAlpha);
    this.surfaceGraphics.beginPath();
    this.surfaceGraphics.moveTo(tipX, tipY);
    this.surfaceGraphics.lineTo(base1X, base1Y);
    this.surfaceGraphics.lineTo(base2X, base2Y);
    this.surfaceGraphics.closePath();
    this.surfaceGraphics.fillPath();
  }

  /**
   * Brighten a color by blending it toward white
   */
  private brightenColor(color: number, amount: number): number {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;

    const newR = Math.min(255, Math.floor(r + (255 - r) * amount));
    const newG = Math.min(255, Math.floor(g + (255 - g) * amount));
    const newB = Math.min(255, Math.floor(b + (255 - b) * amount));

    return (newR << 16) | (newG << 8) | newB;
  }

  /**
   * Get the current window configuration based on umbrella mode and player position.
   * Returns null if umbrella mode is OFF.
   *
   * - OFF: returns null (360° visibility)
   * - FULL: returns single window (full umbrella)
   * - HOLE: returns multi window (umbrella with gap in center)
   */
  private getUmbrellaWindowConfig(): WindowConfig | null {
    if (this.umbrellaMode === UmbrellaMode.OFF) {
      return null;
    }

    const playerX = this.player.bowPosition.x;
    const playerY = this.player.bowPosition.y;
    const halfWidth = GameScene.UMBRELLA_WIDTH / 2;
    const umbrellaY = playerY - GameScene.UMBRELLA_HEIGHT;

    // Base umbrella segment
    const umbrella: Segment = {
      start: { x: playerX - halfWidth, y: umbrellaY },
      end: { x: playerX + halfWidth, y: umbrellaY },
    };

    if (this.umbrellaMode === UmbrellaMode.FULL) {
      // Full umbrella - single window
      return createSingleWindow(umbrella);
    }

    // Hole mode - split umbrella into two windows with gap
    const [leftWindow, rightWindow] = splitWindow(
      umbrella,
      GameScene.UMBRELLA_GAP_START,
      GameScene.UMBRELLA_GAP_END
    );
    return createMultiWindow([leftWindow, rightWindow]);
  }

  /**
   * Get the current umbrella segment for drawing.
   * Returns null if umbrella mode is OFF.
   */
  private getUmbrellaSegment(): Segment | null {
    if (this.umbrellaMode === UmbrellaMode.OFF) {
      return null;
    }

    const playerX = this.player.bowPosition.x;
    const playerY = this.player.bowPosition.y;
    const halfWidth = GameScene.UMBRELLA_WIDTH / 2;
    const umbrellaY = playerY - GameScene.UMBRELLA_HEIGHT;

    return {
      start: { x: playerX - halfWidth, y: umbrellaY },
      end: { x: playerX + halfWidth, y: umbrellaY },
    };
  }

  /**
   * Draw the umbrella if enabled.
   * In HOLE mode, draws two segments with a visible gap.
   */
  private drawUmbrella(): void {
    this.umbrellaGraphics.clear();

    if (this.umbrellaMode === UmbrellaMode.OFF) return;

    const umbrella = this.getUmbrellaSegment();
    if (!umbrella) return;

    if (this.umbrellaMode === UmbrellaMode.FULL) {
      // Full umbrella - draw as single segment
      this.drawUmbrellaSegment(umbrella);
    } else {
      // Hole mode - draw two segments with gap
      const [leftWindow, rightWindow] = splitWindow(
        umbrella,
        GameScene.UMBRELLA_GAP_START,
        GameScene.UMBRELLA_GAP_END
      );
      this.drawUmbrellaSegment(leftWindow);
      this.drawUmbrellaSegment(rightWindow);

      // Draw gap indicator (small marks showing the gap)
      this.umbrellaGraphics.lineStyle(2, 0xff6b6b, 0.6);
      const gapMidX = (leftWindow.end.x + rightWindow.start.x) / 2;
      const gapMidY = umbrella.start.y;
      this.umbrellaGraphics.lineBetween(gapMidX, gapMidY - 8, gapMidX, gapMidY + 8);
    }

    // Draw mode indicator
    const midX = (umbrella.start.x + umbrella.end.x) / 2;
    const midY = umbrella.start.y - 15;

    if (this.umbrellaMode === UmbrellaMode.FULL) {
      // Single circle for full mode
      this.umbrellaGraphics.fillStyle(0x00ffff, 0.8);
      this.umbrellaGraphics.fillCircle(midX, midY, 6);
    } else {
      // Two small circles for hole mode
      this.umbrellaGraphics.fillStyle(0x00ffff, 0.8);
      this.umbrellaGraphics.fillCircle(midX - 8, midY, 4);
      this.umbrellaGraphics.fillCircle(midX + 8, midY, 4);
    }
  }

  /**
   * Draw a single umbrella segment with glow effect.
   */
  private drawUmbrellaSegment(segment: Segment): void {
    // Draw segment as a thick cyan line
    this.umbrellaGraphics.lineStyle(4, 0x00ffff, 1);
    this.umbrellaGraphics.lineBetween(
      segment.start.x,
      segment.start.y,
      segment.end.x,
      segment.end.y
    );

    // Add glow effect
    this.umbrellaGraphics.lineStyle(10, 0x00ffff, 0.3);
    this.umbrellaGraphics.lineBetween(
      segment.start.x,
      segment.start.y,
      segment.end.x,
      segment.end.y
    );
  }

  /**
   * Draw the player (archer)
   */
  private drawPlayer(): void {
    this.playerGraphics.clear();

    const pos = this.player.position;
    const x = pos.x;
    const y = pos.y;

    // Body (rectangle)
    this.playerGraphics.fillStyle(0xe94560, 1);
    this.playerGraphics.fillRect(x - 12, y - 20, 24, 40);

    // Head (circle)
    this.playerGraphics.fillStyle(0xffc857, 1);
    this.playerGraphics.fillCircle(x, y - 30, 12);

    // Bow (arc on the right side, rotates with aim)
    const aimDir = this.trajectoryAdapter.getAimDirection();
    const aimAngle = Math.atan2(aimDir.y, aimDir.x);
    const bowCenterX = x + Math.cos(aimAngle) * 15;
    const bowCenterY = y - 10 + Math.sin(aimAngle) * 10;

    this.playerGraphics.lineStyle(3, 0x8b4513, 1);
    this.playerGraphics.beginPath();
    this.playerGraphics.arc(
      bowCenterX,
      bowCenterY,
      20,
      aimAngle - Math.PI / 2,
      aimAngle + Math.PI / 2,
      false
    );
    this.playerGraphics.strokePath();

    // Arrow origin indicator
    const arrowOrigin = this.player.bowPosition;
    this.playerGraphics.fillStyle(0x00ff88, 1);
    this.playerGraphics.fillCircle(arrowOrigin.x, arrowOrigin.y, 4);

    // Show grounded state (subtle ground indicator)
    if (this.player.isGrounded) {
      this.playerGraphics.lineStyle(2, 0x00ff88, 0.5);
      this.playerGraphics.lineBetween(x - 10, y + 24, x + 10, y + 24);
    }
  }
}
