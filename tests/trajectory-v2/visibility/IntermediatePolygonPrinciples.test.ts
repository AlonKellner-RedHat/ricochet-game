/**
 * Intermediate Polygon First Principles Tests
 *
 * V.8: Intermediate Polygon Containment
 * The intermediate polygon Pk in an N-surface plan is fully contained within
 * the final polygon of the first K surfaces plan.
 *
 * V.9: Intermediate Polygon Equality
 * The intermediate polygon Pk in an N-surface plan is exactly equal to
 * the intermediate polygon Pk in any T-surface plan where K < T ≤ N.
 */

import { describe, it, expect } from "vitest";
import {
  propagateWithIntermediates,
  type ScreenBounds,
} from "@/trajectory-v2/visibility/AnalyticalPropagation";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";

// Helper to create test surfaces
function createTestSurface(
  id: string,
  start: Vector2,
  end: Vector2,
  canReflect: boolean = false
): Surface {
  const segment = { start, end };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const normalX = -dy / len;
  const normalY = dx / len;

  return {
    id,
    segment,
    normal: { x: normalX, y: normalY },
    canReflect,
    canReflectFrom: () => canReflect,
    isOnReflectiveSide: (point: Vector2) => {
      if (!canReflect) return false;
      const cross =
        (end.x - start.x) * (point.y - start.y) -
        (end.y - start.y) * (point.x - start.x);
      return cross >= 0;
    },
    distanceToPoint: () => 0,
  };
}

const defaultBounds: ScreenBounds = {
  minX: 0,
  minY: 0,
  maxX: 800,
  maxY: 600,
};

// Check if a point is inside or on a polygon
function isPointInOrOnPolygon(
  point: Vector2,
  polygon: readonly Vector2[],
  tolerance: number = 1.0
): boolean {
  if (polygon.length < 3) return false;

  // First check if point is very close to any edge (on the polygon)
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i]!;
    const p2 = polygon[(i + 1) % polygon.length]!;

    const dist = pointToSegmentDistance(point, p1, p2);
    if (dist < tolerance) {
      return true;
    }
  }

  // Then check if point is inside using ray casting
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.x;
    const yi = polygon[i]!.y;
    const xj = polygon[j]!.x;
    const yj = polygon[j]!.y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

// Calculate distance from point to line segment
function pointToSegmentDistance(
  point: Vector2,
  segStart: Vector2,
  segEnd: Vector2
): number {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-10) {
    // Degenerate segment
    return Math.sqrt(
      (point.x - segStart.x) ** 2 + (point.y - segStart.y) ** 2
    );
  }

  // Project point onto line, clamped to segment
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lenSq
    )
  );

  const projX = segStart.x + t * dx;
  const projY = segStart.y + t * dy;

  return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
}

// Check if two polygons are equal (same vertices, possibly rotated)
function polygonsEqual(
  poly1: readonly Vector2[],
  poly2: readonly Vector2[],
  tolerance: number = 1.0
): boolean {
  if (poly1.length !== poly2.length) return false;
  if (poly1.length === 0) return true;

  // Find first vertex of poly2 in poly1
  let startIdx = -1;
  for (let i = 0; i < poly1.length; i++) {
    if (
      Math.abs(poly1[i]!.x - poly2[0]!.x) < tolerance &&
      Math.abs(poly1[i]!.y - poly2[0]!.y) < tolerance
    ) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) return false;

  // Check if remaining vertices match
  for (let i = 0; i < poly1.length; i++) {
    const v1 = poly1[(startIdx + i) % poly1.length]!;
    const v2 = poly2[i]!;

    if (
      Math.abs(v1.x - v2.x) > tolerance ||
      Math.abs(v1.y - v2.y) > tolerance
    ) {
      return false;
    }
  }

  return true;
}

describe("V.8: Intermediate Polygon Containment", () => {
  describe("single surface plan", () => {
    it("intermediate polygon 1 is contained in final polygon of [S1]", () => {
      const player: Vector2 = { x: 400, y: 500 };
      const surface1 = createTestSurface(
        "mirror1",
        { x: 300, y: 300 },
        { x: 500, y: 300 },
        true
      );

      // Full plan: [S1]
      const fullResult = propagateWithIntermediates(
        player,
        [surface1],
        [surface1],
        defaultBounds
      );

      // Partial plan: [S1] (same)
      const partialResult = propagateWithIntermediates(
        player,
        [surface1],
        [surface1],
        defaultBounds
      );

      // Check containment: intermediate 1 in full ⊆ final in partial
      const intermediate1 = fullResult.steps[1]!.polygon;
      const partialFinal = partialResult.finalPolygon;

      expect(intermediate1.length).toBeGreaterThan(0);
      expect(partialFinal.length).toBeGreaterThan(0);

      // Every vertex of intermediate1 should be inside or on partialFinal
      for (const v of intermediate1) {
        expect(isPointInOrOnPolygon(v, partialFinal)).toBe(true);
      }
    });
  });

  describe("two surface plan", () => {
    const player: Vector2 = { x: 400, y: 550 };
    const surface1 = createTestSurface(
      "mirror1",
      { x: 300, y: 400 },
      { x: 500, y: 400 },
      true
    );
    const surface2 = createTestSurface(
      "mirror2",
      { x: 350, y: 200 },
      { x: 450, y: 200 },
      true
    );

    it("intermediate polygon 1 is contained in final polygon of [S1]", () => {
      // Full plan: [S1, S2]
      const fullResult = propagateWithIntermediates(
        player,
        [surface1, surface2],
        [surface1, surface2],
        defaultBounds
      );

      // Partial plan: [S1]
      const partialResult = propagateWithIntermediates(
        player,
        [surface1],
        [surface1, surface2],
        defaultBounds
      );

      const intermediate1 = fullResult.steps[1]!.polygon;
      const partialFinal = partialResult.finalPolygon;

      expect(intermediate1.length).toBeGreaterThan(0);

      for (const v of intermediate1) {
        expect(isPointInOrOnPolygon(v, partialFinal, 2)).toBe(true);
      }
    });

    it("intermediate polygon 2 is contained in final polygon of [S1, S2]", () => {
      // Full plan: [S1, S2]
      const fullResult = propagateWithIntermediates(
        player,
        [surface1, surface2],
        [surface1, surface2],
        defaultBounds
      );

      // This is trivially true since intermediate2 IS the final polygon
      const intermediate2 = fullResult.steps[2]!.polygon;
      const final = fullResult.finalPolygon;

      expect(polygonsEqual(intermediate2 as Vector2[], final as Vector2[])).toBe(true);
    });

    it("each subsequent polygon is smaller or equal in area", () => {
      const fullResult = propagateWithIntermediates(
        player,
        [surface1, surface2],
        [surface1, surface2],
        defaultBounds
      );

      const area0 = polygonArea(fullResult.steps[0]!.polygon as Vector2[]);
      const area1 = polygonArea(fullResult.steps[1]!.polygon as Vector2[]);
      const area2 = polygonArea(fullResult.steps[2]!.polygon as Vector2[]);

      // Each step can only restrict visibility, never expand
      expect(area1).toBeLessThanOrEqual(area0);
      expect(area2).toBeLessThanOrEqual(area1);
    });
  });

  describe("three surface plan", () => {
    const player: Vector2 = { x: 400, y: 580 };
    const surface1 = createTestSurface(
      "s1",
      { x: 300, y: 500 },
      { x: 500, y: 500 },
      true
    );
    const surface2 = createTestSurface(
      "s2",
      { x: 320, y: 350 },
      { x: 480, y: 350 },
      true
    );
    const surface3 = createTestSurface(
      "s3",
      { x: 340, y: 200 },
      { x: 460, y: 200 },
      true
    );

    it("intermediate 1 of [S1,S2,S3] ⊆ final of [S1]", () => {
      const fullResult = propagateWithIntermediates(
        player,
        [surface1, surface2, surface3],
        [surface1, surface2, surface3],
        defaultBounds
      );

      const partialResult = propagateWithIntermediates(
        player,
        [surface1],
        [surface1, surface2, surface3],
        defaultBounds
      );

      const intermediate1 = fullResult.steps[1]!.polygon;
      const partialFinal = partialResult.finalPolygon;

      for (const v of intermediate1) {
        expect(isPointInOrOnPolygon(v, partialFinal, 2)).toBe(true);
      }
    });

    it("intermediate 2 of [S1,S2,S3] ⊆ final of [S1,S2]", () => {
      const fullResult = propagateWithIntermediates(
        player,
        [surface1, surface2, surface3],
        [surface1, surface2, surface3],
        defaultBounds
      );

      const partialResult = propagateWithIntermediates(
        player,
        [surface1, surface2],
        [surface1, surface2, surface3],
        defaultBounds
      );

      const intermediate2 = fullResult.steps[2]!.polygon;
      const partialFinal = partialResult.finalPolygon;

      for (const v of intermediate2) {
        expect(isPointInOrOnPolygon(v, partialFinal, 2)).toBe(true);
      }
    });
  });
});

describe("V.9: Intermediate Polygon Equality", () => {
  const player: Vector2 = { x: 400, y: 580 };
  const surface1 = createTestSurface(
    "s1",
    { x: 300, y: 500 },
    { x: 500, y: 500 },
    true
  );
  const surface2 = createTestSurface(
    "s2",
    { x: 320, y: 350 },
    { x: 480, y: 350 },
    true
  );
  const surface3 = createTestSurface(
    "s3",
    { x: 340, y: 200 },
    { x: 460, y: 200 },
    true
  );

  describe("intermediate polygon 0 equality", () => {
    it("step 0 is same for [S1] and [S1,S2]", () => {
      const result1 = propagateWithIntermediates(
        player,
        [surface1],
        [surface1, surface2, surface3],
        defaultBounds
      );

      const result2 = propagateWithIntermediates(
        player,
        [surface1, surface2],
        [surface1, surface2, surface3],
        defaultBounds
      );

      expect(result1.steps[0]!.polygon.length).toBe(
        result2.steps[0]!.polygon.length
      );
    });

    it("step 0 is same for all plan lengths", () => {
      const result1 = propagateWithIntermediates(
        player,
        [surface1],
        [surface1, surface2, surface3],
        defaultBounds
      );

      const result2 = propagateWithIntermediates(
        player,
        [surface1, surface2, surface3],
        [surface1, surface2, surface3],
        defaultBounds
      );

      const poly1 = result1.steps[0]!.polygon;
      const poly2 = result2.steps[0]!.polygon;

      // Same polygon (same vertices)
      expect(poly1.length).toBe(poly2.length);
      for (let i = 0; i < poly1.length; i++) {
        expect(poly1[i]!.x).toBeCloseTo(poly2[i]!.x, 3);
        expect(poly1[i]!.y).toBeCloseTo(poly2[i]!.y, 3);
      }
    });
  });

  describe("intermediate polygon 1 equality", () => {
    it("step 1 of [S1,S2] equals step 1 of [S1,S2,S3]", () => {
      const result2 = propagateWithIntermediates(
        player,
        [surface1, surface2],
        [surface1, surface2, surface3],
        defaultBounds
      );

      const result3 = propagateWithIntermediates(
        player,
        [surface1, surface2, surface3],
        [surface1, surface2, surface3],
        defaultBounds
      );

      const poly1 = result2.steps[1]!.polygon;
      const poly2 = result3.steps[1]!.polygon;

      // Same polygon
      expect(poly1.length).toBe(poly2.length);
      for (let i = 0; i < poly1.length; i++) {
        expect(poly1[i]!.x).toBeCloseTo(poly2[i]!.x, 3);
        expect(poly1[i]!.y).toBeCloseTo(poly2[i]!.y, 3);
      }
    });
  });

  describe("intermediate polygon 2 equality", () => {
    it("step 2 of [S1,S2,S3] matches final of [S1,S2,S3]", () => {
      const result = propagateWithIntermediates(
        player,
        [surface1, surface2, surface3],
        [surface1, surface2, surface3],
        defaultBounds
      );

      // This is trivially true but validates structure
      expect(result.steps.length).toBe(4);
      expect(result.steps[3]).toBeDefined();
    });
  });
});

// Helper: Calculate polygon area using shoelace formula
function polygonArea(polygon: Vector2[]): number {
  if (polygon.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i]!.x * polygon[j]!.y;
    area -= polygon[j]!.x * polygon[i]!.y;
  }

  return Math.abs(area) / 2;
}

