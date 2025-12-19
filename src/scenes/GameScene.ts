import { DebugView, InputManager } from "@/core";
import { Player } from "@/player";
import { RicochetSurface, WallSurface } from "@/surfaces";
import type { Surface } from "@/surfaces";
import { TrajectoryCalculator, TrajectoryRenderer } from "@/trajectory";
import Phaser from "phaser";

/**
 * Main game scene for the Ricochet game
 */
export class GameScene extends Phaser.Scene {
  private inputManager!: InputManager;
  private debugView!: DebugView;

  // Trajectory system
  private trajectoryCalculator!: TrajectoryCalculator;
  private trajectoryRenderer!: TrajectoryRenderer;

  // Demo surfaces
  private surfaces: Surface[] = [];
  private surfaceGraphics!: Phaser.GameObjects.Graphics;

  // Player
  private player!: Player;
  private playerGraphics!: Phaser.GameObjects.Graphics;

  // Configuration
  private readonly maxTrajectoryDistance = 2000;

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

    // Initialize trajectory system
    this.trajectoryCalculator = new TrajectoryCalculator();
    this.trajectoryRenderer = new TrajectoryRenderer(this);

    // Create demo surfaces
    this.createDemoSurfaces();

    // Create graphics for surfaces
    this.surfaceGraphics = this.add.graphics();
    this.drawSurfaces();

    // Create player
    const spawnPoint = { x: 150, y: 450 };
    this.player = new Player(spawnPoint);

    // Create player graphics
    this.playerGraphics = this.add.graphics();

    // Add title and control hints
    this.add
      .text(this.cameras.main.centerX, 30, "RICOCHET DEMO", {
        fontFamily: "JetBrains Mono, monospace",
        fontSize: "24px",
        color: "#e94560",
      })
      .setOrigin(0.5);

    this.add
      .text(this.cameras.main.centerX, 55, "WASD/Arrows to move • Space to jump • Mouse to aim", {
        fontFamily: "JetBrains Mono, monospace",
        fontSize: "12px",
        color: "#888888",
      })
      .setOrigin(0.5);
  }

  update(_time: number, delta: number): void {
    // Convert delta from ms to seconds
    const deltaSeconds = delta / 1000;

    // Get input
    const movementInput = this.inputManager.getMovementInput();
    const pointer = this.inputManager.getPointerPosition();

    // Update player with movement and collisions
    this.player.update(deltaSeconds, movementInput, this.surfaces);

    // Redraw player at new position
    this.drawPlayer();

    // Calculate trajectory from player's bow position
    const result = this.trajectoryCalculator.calculate(
      this.player.bowPosition,
      pointer,
      [], // No planned surfaces yet
      this.surfaces,
      this.maxTrajectoryDistance
    );

    // Render trajectory
    this.trajectoryRenderer.render(result);

    // Update debug info
    const pos = this.player.position;
    const vel = this.player.velocity;
    this.debugView.setInfo("playerX", Math.round(pos.x));
    this.debugView.setInfo("playerY", Math.round(pos.y));
    this.debugView.setInfo("velX", Math.round(vel.x));
    this.debugView.setInfo("velY", Math.round(vel.y));
    this.debugView.setInfo("state", this.player.state);
    this.debugView.setInfo("grounded", this.player.isGrounded);
    this.debugView.setInfo("trajPoints", result.points.length);

    this.debugView.update();

    // Clear single-frame input events at end of frame
    this.inputManager.clearFrameEvents();
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
   * Draw all surfaces
   */
  private drawSurfaces(): void {
    this.surfaceGraphics.clear();

    for (const surface of this.surfaces) {
      const props = surface.getVisualProperties();

      this.surfaceGraphics.lineStyle(props.lineWidth, props.color, props.alpha);
      this.surfaceGraphics.lineBetween(
        surface.segment.start.x,
        surface.segment.start.y,
        surface.segment.end.x,
        surface.segment.end.y
      );

      // Add glow effect for ricochet surfaces
      if (props.glow) {
        this.surfaceGraphics.lineStyle(props.lineWidth + 4, props.color, 0.2);
        this.surfaceGraphics.lineBetween(
          surface.segment.start.x,
          surface.segment.start.y,
          surface.segment.end.x,
          surface.segment.end.y
        );
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

    // Bow (arc on the right side)
    this.playerGraphics.lineStyle(3, 0x8b4513, 1);
    this.playerGraphics.beginPath();
    this.playerGraphics.arc(x + 15, y - 10, 20, -Math.PI / 2, Math.PI / 2, false);
    this.playerGraphics.strokePath();

    // Arrow origin indicator
    this.playerGraphics.fillStyle(0x00ff88, 1);
    this.playerGraphics.fillCircle(x + 20, y - 10, 4);

    // Show grounded state (subtle ground indicator)
    if (this.player.isGrounded) {
      this.playerGraphics.lineStyle(2, 0x00ff88, 0.5);
      this.playerGraphics.lineBetween(x - 10, y + 24, x + 10, y + 24);
    }
  }
}
