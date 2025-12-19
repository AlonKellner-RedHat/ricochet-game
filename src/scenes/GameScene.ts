import { ArrowManager } from "@/arrow";
import { DebugView, InputManager } from "@/core";
import { Player } from "@/player";
import { RicochetSurface, WallSurface } from "@/surfaces";
import type { Surface } from "@/surfaces";
import { TrajectoryRenderer } from "@/trajectory";
import Phaser from "phaser";

/**
 * Main game scene for the Ricochet game
 */
export class GameScene extends Phaser.Scene {
  private inputManager!: InputManager;
  private debugView!: DebugView;

  // Trajectory system
  private trajectoryRenderer!: TrajectoryRenderer;

  // Arrow system
  private arrowManager!: ArrowManager;

  // Demo surfaces
  private surfaces: Surface[] = [];
  private surfaceGraphics!: Phaser.GameObjects.Graphics;

  // Player
  private player!: Player;
  private playerGraphics!: Phaser.GameObjects.Graphics;

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

    // Initialize trajectory renderer
    this.trajectoryRenderer = new TrajectoryRenderer(this);

    // Initialize arrow manager
    this.arrowManager = new ArrowManager(this);

    // Create demo surfaces
    this.createDemoSurfaces();

    // Create player BEFORE drawing surfaces (drawSurfaces needs player.getSurfacePlanIndex)
    const spawnPoint = { x: 150, y: 450 };
    this.player = new Player(spawnPoint);
    this.playerGraphics = this.add.graphics();

    // Create graphics for surfaces (after player exists)
    this.surfaceGraphics = this.add.graphics();
    this.drawSurfaces();

    // Add title and control hints
    this.add
      .text(this.cameras.main.centerX, 30, "RICOCHET DEMO", {
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
  }

  update(_time: number, delta: number): void {
    // Convert delta from ms to seconds
    const deltaSeconds = delta / 1000;

    // Get input
    const movementInput = this.inputManager.getMovementInput();
    const pointer = this.inputManager.getPointerPosition();

    // Update player (movement + aiming)
    this.player.update(deltaSeconds, movementInput, pointer, this.surfaces);

    // Handle click events
    if (this.inputManager.wasPointerClicked()) {
      this.handleClick(pointer);
    }

    // Update arrows
    this.arrowManager.update(deltaSeconds, this.surfaces);

    // Redraw player at new position
    this.drawPlayer();

    // Redraw surfaces (to show planned state)
    this.drawSurfaces();

    // Render trajectory from player's trajectory result
    this.trajectoryRenderer.render(this.player.trajectoryResult);

    // Render arrows
    this.arrowManager.render();

    // Update debug info
    const pos = this.player.position;
    const vel = this.player.velocity;
    const result = this.player.trajectoryResult;
    this.debugView.setInfo("playerX", Math.round(pos.x));
    this.debugView.setInfo("playerY", Math.round(pos.y));
    this.debugView.setInfo("velX", Math.round(vel.x));
    this.debugView.setInfo("velY", Math.round(vel.y));
    this.debugView.setInfo("state", this.player.state);
    this.debugView.setInfo("grounded", this.player.isGrounded);
    this.debugView.setInfo("trajPoints", result.points.length);
    this.debugView.setInfo("planned", this.player.plannedSurfaces.length);
    this.debugView.setInfo("arrows", this.arrowManager.getAllArrows().length);

    this.debugView.update();

    // Clear single-frame input events at end of frame
    this.inputManager.clearFrameEvents();
  }

  /**
   * Handle click events for planning and shooting
   */
  private handleClick(clickPosition: { x: number; y: number }): void {
    // Check if clicking on a plannable surface
    const clickedSurface = this.inputManager.findClickedSurface(clickPosition, this.surfaces, true);

    if (clickedSurface) {
      // Toggle surface in plan
      this.player.toggleSurfaceInPlan(clickedSurface);
    } else {
      // Shoot arrow
      const arrowData = this.player.shoot();
      if (arrowData) {
        this.arrowManager.createArrow(
          arrowData.position,
          arrowData.direction,
          arrowData.plannedSurfaces,
          arrowData.maxDistance
        );
      }
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
   * Draw all surfaces with plan highlighting
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Drawing logic requires many visual decisions
  private drawSurfaces(): void {
    this.surfaceGraphics.clear();

    for (const surface of this.surfaces) {
      const props = surface.getVisualProperties();
      const planIndex = this.player.getSurfacePlanIndex(surface);
      const isPlanned = planIndex > 0;

      // Use different color for planned surfaces
      const color = isPlanned ? 0xffff00 : props.color; // Yellow for planned
      const lineWidth = isPlanned ? props.lineWidth + 2 : props.lineWidth;
      const alpha = isPlanned ? 1 : props.alpha;

      this.surfaceGraphics.lineStyle(lineWidth, color, alpha);
      this.surfaceGraphics.lineBetween(
        surface.segment.start.x,
        surface.segment.start.y,
        surface.segment.end.x,
        surface.segment.end.y
      );

      // Add glow effect for ricochet surfaces
      if (props.glow || isPlanned) {
        const glowColor = isPlanned ? 0xffff00 : props.color;
        this.surfaceGraphics.lineStyle(lineWidth + 4, glowColor, isPlanned ? 0.4 : 0.2);
        this.surfaceGraphics.lineBetween(
          surface.segment.start.x,
          surface.segment.start.y,
          surface.segment.end.x,
          surface.segment.end.y
        );
      }

      // Draw plan number for planned surfaces
      if (isPlanned) {
        const midX = (surface.segment.start.x + surface.segment.end.x) / 2;
        const midY = (surface.segment.start.y + surface.segment.end.y) / 2;

        // Draw circle background
        this.surfaceGraphics.fillStyle(0x000000, 0.8);
        this.surfaceGraphics.fillCircle(midX, midY - 15, 12);

        // Draw number (we'll use a simple approach with graphics)
        this.surfaceGraphics.fillStyle(0xffff00, 1);
        this.surfaceGraphics.fillCircle(midX, midY - 15, 8);

        // We can't easily draw text with graphics, so just use a filled circle
        // The number effect is achieved by the order being visually apparent
      }
    }
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
    const aimAngle = Math.atan2(this.player.aimDirection.y, this.player.aimDirection.x);
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
