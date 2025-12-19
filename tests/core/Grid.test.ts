import { describe, expect, it } from "vitest";
import { Grid } from "@/core/Grid";

describe("Grid", () => {
  describe("constructor", () => {
    it("should create a grid with specified dimensions", () => {
      const grid = new Grid(10, 8, 32, 32);

      expect(grid.cols).toBe(10);
      expect(grid.rows).toBe(8);
      expect(grid.cellWidth).toBe(32);
      expect(grid.cellHeight).toBe(32);
    });

    it("should use default offset of 0", () => {
      const grid = new Grid(10, 8, 32, 32);

      expect(grid.offsetX).toBe(0);
      expect(grid.offsetY).toBe(0);
    });

    it("should accept custom offset values", () => {
      const grid = new Grid(10, 8, 32, 32, 100, 50);

      expect(grid.offsetX).toBe(100);
      expect(grid.offsetY).toBe(50);
    });
  });

  describe("dimensions", () => {
    it("should calculate total width correctly", () => {
      const grid = new Grid(10, 8, 32, 32);
      expect(grid.width).toBe(320);
    });

    it("should calculate total height correctly", () => {
      const grid = new Grid(10, 8, 32, 32);
      expect(grid.height).toBe(256);
    });
  });

  describe("worldToGrid", () => {
    it("should convert world position to grid position", () => {
      const grid = new Grid(10, 8, 32, 32);
      const gridPos = grid.worldToGrid({ x: 50, y: 70 });

      expect(gridPos.col).toBe(1);
      expect(gridPos.row).toBe(2);
    });

    it("should account for offset", () => {
      const grid = new Grid(10, 8, 32, 32, 100, 50);
      const gridPos = grid.worldToGrid({ x: 150, y: 120 });

      expect(gridPos.col).toBe(1);
      expect(gridPos.row).toBe(2);
    });
  });

  describe("gridToWorld", () => {
    it("should convert grid position to world center", () => {
      const grid = new Grid(10, 8, 32, 32);
      const worldPos = grid.gridToWorld({ row: 2, col: 1 });

      expect(worldPos.x).toBe(48); // 1 * 32 + 16
      expect(worldPos.y).toBe(80); // 2 * 32 + 16
    });
  });

  describe("snapToGrid", () => {
    it("should snap world position to nearest cell center", () => {
      const grid = new Grid(10, 8, 32, 32);
      const snapped = grid.snapToGrid({ x: 50, y: 70 });

      expect(snapped.x).toBe(48);
      expect(snapped.y).toBe(80);
    });
  });

  describe("isValidPosition", () => {
    it("should return true for valid positions", () => {
      const grid = new Grid(10, 8, 32, 32);

      expect(grid.isValidPosition({ row: 0, col: 0 })).toBe(true);
      expect(grid.isValidPosition({ row: 7, col: 9 })).toBe(true);
      expect(grid.isValidPosition({ row: 4, col: 5 })).toBe(true);
    });

    it("should return false for out of bounds positions", () => {
      const grid = new Grid(10, 8, 32, 32);

      expect(grid.isValidPosition({ row: -1, col: 0 })).toBe(false);
      expect(grid.isValidPosition({ row: 0, col: -1 })).toBe(false);
      expect(grid.isValidPosition({ row: 8, col: 0 })).toBe(false);
      expect(grid.isValidPosition({ row: 0, col: 10 })).toBe(false);
    });
  });

  describe("getAllPositions", () => {
    it("should return all grid positions", () => {
      const grid = new Grid(3, 2, 32, 32);
      const positions = grid.getAllPositions();

      expect(positions).toHaveLength(6);
      expect(positions).toContainEqual({ row: 0, col: 0 });
      expect(positions).toContainEqual({ row: 1, col: 2 });
    });
  });
});

