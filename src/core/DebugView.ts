import type Phaser from "phaser";
import type { DebugInfo } from "@/types";

/**
 * Debug overlay for displaying runtime information
 */
export class DebugView {
  private scene: Phaser.Scene;
  private textObject: Phaser.GameObjects.Text | null = null;
  private visible: boolean = false;
  private customInfo: Record<string, string | number | boolean> = {};

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Initialize the debug text display */
  create(): void {
    this.textObject = this.scene.add.text(10, 10, "", {
      fontFamily: "JetBrains Mono, monospace",
      fontSize: "14px",
      color: "#00ff88",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      padding: { x: 8, y: 6 },
    });
    this.textObject.setScrollFactor(0);
    this.textObject.setDepth(9999);
    this.textObject.setVisible(this.visible);
  }

  /** Toggle debug view visibility */
  toggle(): void {
    this.visible = !this.visible;
    this.textObject?.setVisible(this.visible);
  }

  /** Set visibility directly */
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.textObject?.setVisible(visible);
  }

  /** Add or update custom debug info */
  setInfo(key: string, value: string | number | boolean): void {
    this.customInfo[key] = value;
  }

  /** Remove custom debug info */
  removeInfo(key: string): void {
    delete this.customInfo[key];
  }

  /** Update the debug display */
  update(): void {
    if (!this.visible || !this.textObject) return;

    const info = this.getDebugInfo();
    const lines = Object.entries(info).map(([key, value]) => `${key}: ${value}`);
    this.textObject.setText(lines.join("\n"));
  }

  /** Get current debug information */
  private getDebugInfo(): DebugInfo {
    const renderer = this.scene.game.renderer;
    const rendererType = renderer.type === Phaser.WEBGL ? "WebGL" : "Canvas";

    return {
      fps: Math.round(this.scene.game.loop.actualFps),
      entityCount: this.scene.children.length,
      renderer: rendererType,
      ...this.customInfo,
    };
  }

  /** Check if debug view is visible */
  isVisible(): boolean {
    return this.visible;
  }

  /** Clean up resources */
  destroy(): void {
    this.textObject?.destroy();
    this.textObject = null;
    this.customInfo = {};
  }
}

