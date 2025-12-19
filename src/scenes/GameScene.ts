import Phaser from "phaser";
import { DebugView, Grid, InputManager } from "@/core";

/**
 * Main game scene for the Ricochet game
 */
export class GameScene extends Phaser.Scene {
  private grid!: Grid;
  private inputManager!: InputManager;
  private debugView!: DebugView;

  constructor() {
    super({ key: "GameScene" });
  }

  preload(): void {
    // Load assets here
    // this.load.image('ball', 'assets/sprites/ball.png');
  }

  create(): void {
    // Initialize grid system
    this.grid = new Grid(16, 9, 64, 64, 64, 36);

    // Initialize input manager
    this.inputManager = new InputManager(this);

    // Initialize debug view
    this.debugView = new DebugView(this);
    this.debugView.create();

    // Toggle debug with backtick key
    this.inputManager.onKeyPress("Backquote", () => {
      this.debugView.toggle();
    });

    // Draw grid for visualization
    this.drawGrid();

    // Create placeholder text
    const centerX = this.cameras.main.centerX;
    const centerY = this.cameras.main.centerY;

    this.add
      .text(centerX, centerY, "RICOCHET", {
        fontFamily: "Space Grotesk, sans-serif",
        fontSize: "72px",
        color: "#e94560",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add
      .text(centerX, centerY + 60, "Press ` for debug view", {
        fontFamily: "JetBrains Mono, monospace",
        fontSize: "16px",
        color: "#0f3460",
      })
      .setOrigin(0.5);
  }

  update(_time: number, _delta: number): void {
    // Update debug info
    const pointer = this.inputManager.getPointerPosition();
    const gridPos = this.grid.worldToGrid(pointer);
    this.debugView.setInfo("pointerX", Math.round(pointer.x));
    this.debugView.setInfo("pointerY", Math.round(pointer.y));
    this.debugView.setInfo("gridRow", gridPos.row);
    this.debugView.setInfo("gridCol", gridPos.col);

    this.debugView.update();
  }

  private drawGrid(): void {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x0f3460, 0.3);

    // Draw vertical lines
    for (let col = 0; col <= this.grid.cols; col++) {
      const x = this.grid.offsetX + col * this.grid.cellWidth;
      graphics.lineBetween(x, this.grid.offsetY, x, this.grid.offsetY + this.grid.height);
    }

    // Draw horizontal lines
    for (let row = 0; row <= this.grid.rows; row++) {
      const y = this.grid.offsetY + row * this.grid.cellHeight;
      graphics.lineBetween(this.grid.offsetX, y, this.grid.offsetX + this.grid.width, y);
    }
  }
}

