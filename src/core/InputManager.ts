import type Phaser from "phaser";
import type { InputState, Vector2 } from "@/types";

/**
 * Manages input handling for the game
 * Tracks mouse/touch and keyboard input state
 */
export class InputManager {
  private scene: Phaser.Scene;
  private state: InputState;
  private keyCallbacks: Map<string, () => void> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.state = {
      pointer: { x: 0, y: 0 },
      isPointerDown: false,
      keys: new Set(),
    };

    this.setupInputListeners();
  }

  private setupInputListeners(): void {
    // Pointer tracking
    this.scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.state.pointer.x = pointer.worldX;
      this.state.pointer.y = pointer.worldY;
    });

    this.scene.input.on("pointerdown", () => {
      this.state.isPointerDown = true;
    });

    this.scene.input.on("pointerup", () => {
      this.state.isPointerDown = false;
    });

    // Keyboard tracking
    this.scene.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      this.state.keys.add(event.code);
      const callback = this.keyCallbacks.get(event.code);
      if (callback) callback();
    });

    this.scene.input.keyboard?.on("keyup", (event: KeyboardEvent) => {
      this.state.keys.delete(event.code);
    });
  }

  /** Get current pointer world position */
  getPointerPosition(): Vector2 {
    return { ...this.state.pointer };
  }

  /** Check if pointer is currently pressed */
  isPointerDown(): boolean {
    return this.state.isPointerDown;
  }

  /** Check if a specific key is currently held */
  isKeyDown(keyCode: string): boolean {
    return this.state.keys.has(keyCode);
  }

  /** Register a callback for a specific key press */
  onKeyPress(keyCode: string, callback: () => void): void {
    this.keyCallbacks.set(keyCode, callback);
  }

  /** Get the full input state snapshot */
  getState(): InputState {
    return {
      pointer: { ...this.state.pointer },
      isPointerDown: this.state.isPointerDown,
      keys: new Set(this.state.keys),
    };
  }

  /** Clean up input listeners */
  destroy(): void {
    this.scene.input.off("pointermove");
    this.scene.input.off("pointerdown");
    this.scene.input.off("pointerup");
    this.keyCallbacks.clear();
  }
}

