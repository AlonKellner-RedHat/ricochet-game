/**
 * Core type definitions for the Ricochet game
 */

/** 2D Vector representation */
export interface Vector2 {
  x: number;
  y: number;
}

/** Game configuration options */
export interface GameOptions {
  width: number;
  height: number;
  backgroundColor: number;
  useWebGPU: boolean;
}

/** Grid cell position */
export interface GridPosition {
  row: number;
  col: number;
}

/** Entity state for game objects */
export interface EntityState {
  id: string;
  position: Vector2;
  velocity: Vector2;
  active: boolean;
}

/** Input state tracking */
export interface InputState {
  pointer: Vector2;
  isPointerDown: boolean;
  keys: Set<string>;
}

/** Debug information display */
export interface DebugInfo {
  fps: number;
  entityCount: number;
  renderer: string;
  [key: string]: string | number | boolean;
}

