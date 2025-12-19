import type { GridPosition, Vector2 } from "@/types";

/**
 * Grid system for positioning and snapping game objects
 */
export class Grid {
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly cols: number;
  readonly rows: number;
  readonly offsetX: number;
  readonly offsetY: number;

  constructor(
    cols: number,
    rows: number,
    cellWidth: number,
    cellHeight: number,
    offsetX = 0,
    offsetY = 0
  ) {
    this.cols = cols;
    this.rows = rows;
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
  }

  /** Get total grid width in pixels */
  get width(): number {
    return this.cols * this.cellWidth;
  }

  /** Get total grid height in pixels */
  get height(): number {
    return this.rows * this.cellHeight;
  }

  /** Convert world position to grid position */
  worldToGrid(worldPos: Vector2): GridPosition {
    const col = Math.floor((worldPos.x - this.offsetX) / this.cellWidth);
    const row = Math.floor((worldPos.y - this.offsetY) / this.cellHeight);
    return { row, col };
  }

  /** Convert grid position to world position (center of cell) */
  gridToWorld(gridPos: GridPosition): Vector2 {
    const x = this.offsetX + gridPos.col * this.cellWidth + this.cellWidth / 2;
    const y = this.offsetY + gridPos.row * this.cellHeight + this.cellHeight / 2;
    return { x, y };
  }

  /** Snap a world position to the nearest grid cell center */
  snapToGrid(worldPos: Vector2): Vector2 {
    const gridPos = this.worldToGrid(worldPos);
    return this.gridToWorld(gridPos);
  }

  /** Check if a grid position is within bounds */
  isValidPosition(gridPos: GridPosition): boolean {
    return gridPos.row >= 0 && gridPos.row < this.rows && gridPos.col >= 0 && gridPos.col < this.cols;
  }

  /** Get all valid grid positions */
  getAllPositions(): GridPosition[] {
    const positions: GridPosition[] = [];
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        positions.push({ row, col });
      }
    }
    return positions;
  }
}

