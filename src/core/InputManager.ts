import { Vec2 } from "@/math/Vec2";
import type { Surface } from "@/surfaces";
import type { InputState, MovementInput, Vector2 } from "@/types";
import type Phaser from "phaser";

/** Click threshold distance for surface detection (in pixels) */
const SURFACE_CLICK_THRESHOLD = 15;

/** Mutable internal state for input tracking */
interface MutableInputState {
  pointer: { x: number; y: number };
  isPointerDown: boolean;
  keys: Set<string>;
}

/**
 * Manages input handling for the game
 * Tracks mouse/touch and keyboard input state
 */
export class InputManager {
  private scene: Phaser.Scene;
  private internalState: MutableInputState;
  private keyCallbacks: Map<string, () => void> = new Map();

  // Single-frame event tracking
  private keysJustPressed: Set<string> = new Set();
  private keysJustReleased: Set<string> = new Set();
  private pointerJustClicked = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.internalState = {
      pointer: { x: 0, y: 0 },
      isPointerDown: false,
      keys: new Set(),
    };

    this.setupInputListeners();
  }

  private setupInputListeners(): void {
    // Pointer tracking
    this.scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.internalState.pointer.x = pointer.worldX;
      this.internalState.pointer.y = pointer.worldY;
    });

    this.scene.input.on("pointerdown", () => {
      this.internalState.isPointerDown = true;
      this.pointerJustClicked = true;
    });

    this.scene.input.on("pointerup", () => {
      this.internalState.isPointerDown = false;
    });

    // Keyboard tracking
    this.scene.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      // Only register as "just pressed" if not already held
      if (!this.internalState.keys.has(event.code)) {
        this.keysJustPressed.add(event.code);
      }
      this.internalState.keys.add(event.code);
      const callback = this.keyCallbacks.get(event.code);
      if (callback) callback();
    });

    this.scene.input.keyboard?.on("keyup", (event: KeyboardEvent) => {
      this.internalState.keys.delete(event.code);
      this.keysJustReleased.add(event.code);
    });
  }

  /** Get current pointer world position */
  getPointerPosition(): Vector2 {
    return { ...this.internalState.pointer };
  }

  /** Check if pointer is currently pressed */
  isPointerDown(): boolean {
    return this.internalState.isPointerDown;
  }

  /** Check if pointer was just clicked this frame */
  wasPointerClicked(): boolean {
    return this.pointerJustClicked;
  }

  /** Check if a specific key is currently held */
  isKeyDown(keyCode: string): boolean {
    return this.internalState.keys.has(keyCode);
  }

  /** Check if a key was pressed this frame (single-frame detection) */
  wasKeyPressed(keyCode: string): boolean {
    return this.keysJustPressed.has(keyCode);
  }

  /** Check if a key was released this frame */
  wasKeyReleased(keyCode: string): boolean {
    return this.keysJustReleased.has(keyCode);
  }

  /** Register a callback for a specific key press */
  onKeyPress(keyCode: string, callback: () => void): void {
    this.keyCallbacks.set(keyCode, callback);
  }

  /**
   * Get movement input state for platformer controls
   * Supports both WASD and Arrow keys
   */
  getMovementInput(): MovementInput {
    return {
      left: this.isKeyDown("KeyA") || this.isKeyDown("ArrowLeft"),
      right: this.isKeyDown("KeyD") || this.isKeyDown("ArrowRight"),
      jump:
        this.wasKeyPressed("Space") || this.wasKeyPressed("KeyW") || this.wasKeyPressed("ArrowUp"),
      jumpHeld: this.isKeyDown("Space") || this.isKeyDown("KeyW") || this.isKeyDown("ArrowUp"),
    };
  }

  /** Get the full input state snapshot */
  getState(): InputState {
    return {
      pointer: { ...this.internalState.pointer },
      isPointerDown: this.internalState.isPointerDown,
      keys: new Set(this.internalState.keys),
    };
  }

  /**
   * Find the surface closest to the click position
   * Returns null if no surface is close enough
   *
   * @param clickPosition - World position of the click
   * @param surfaces - All surfaces to check
   * @param onlyPlannable - If true, only return plannable surfaces
   */
  findClickedSurface(
    clickPosition: Vector2,
    surfaces: readonly Surface[],
    onlyPlannable = true
  ): Surface | null {
    let closestSurface: Surface | null = null;
    let closestDistance = SURFACE_CLICK_THRESHOLD;

    for (const surface of surfaces) {
      if (onlyPlannable && !surface.isPlannable()) {
        continue;
      }

      const distance = Vec2.pointToSegmentDistance(
        clickPosition,
        surface.segment.start,
        surface.segment.end
      );

      if (distance < closestDistance) {
        closestDistance = distance;
        closestSurface = surface;
      }
    }

    return closestSurface;
  }

  /**
   * Clear single-frame events - call at end of each frame
   */
  clearFrameEvents(): void {
    this.keysJustPressed.clear();
    this.keysJustReleased.clear();
    this.pointerJustClicked = false;
  }

  /** Clean up input listeners */
  destroy(): void {
    this.scene.input.off("pointermove");
    this.scene.input.off("pointerdown");
    this.scene.input.off("pointerup");
    this.keyCallbacks.clear();
  }
}
