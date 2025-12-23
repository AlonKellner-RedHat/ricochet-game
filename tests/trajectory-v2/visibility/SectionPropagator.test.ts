import { describe, it, expect } from "vitest";
import {
  calculateVisibleSectionsOnSurface,
  reflectSection,
  reflectPointThroughLine,
  intersectSections,
  propagateVisibility,
  buildPolygonFromSections,
  crossProduct,
  raySegmentIntersection,
  type AngularSection,
  type Ray,
  type ScreenBounds,
} from "@/trajectory-v2/visibility/SectionPropagator";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// =============================================================================
// Test Helpers
// =============================================================================

function createTestSurface(config: {
  id: string;
  start: Vector2;
  end: Vector2;
  canReflect?: boolean;
}): Surface {
  const { id, start, end, canReflect = true } = config;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return {
    id,
    segment: { start, end },
    surfaceType: canReflect ? "ricochet" : "wall",
    onArrowHit: () => ({ type: canReflect ? "reflect" : "stop" }),
    isPlannable: () => canReflect,
    getVisualProperties: () => ({ color: 0xffffff, lineWidth: 2, alpha: 1 }),
    getNormal: () => ({ x: -dy / len, y: dx / len }),
    canReflectFrom: () => canReflect,
  };
}

const screenBounds: ScreenBounds = {
  minX: 0,
  minY: 0,
  maxX: 800,
  maxY: 600,
};

// =============================================================================
// Phase 1: Core Section Operations
// =============================================================================

describe("Core Section Operations", () => {
  describe("reflectPointThroughLine", () => {
    it("reflects point through horizontal line", () => {
      const point = { x: 100, y: 100 };
      const lineStart = { x: 0, y: 200 };
      const lineEnd = { x: 400, y: 200 };

      const reflected = reflectPointThroughLine(point, lineStart, lineEnd);

      // Point at y=100, line at y=200, reflected should be at y=300
      expect(reflected.x).toBeCloseTo(100);
      expect(reflected.y).toBeCloseTo(300);
    });

    it("reflects point through vertical line", () => {
      const point = { x: 100, y: 300 };
      const lineStart = { x: 200, y: 0 };
      const lineEnd = { x: 200, y: 600 };

      const reflected = reflectPointThroughLine(point, lineStart, lineEnd);

      // Point at x=100, line at x=200, reflected should be at x=300
      expect(reflected.x).toBeCloseTo(300);
      expect(reflected.y).toBeCloseTo(300);
    });

    it("reflects point through diagonal line", () => {
      const point = { x: 0, y: 0 };
      const lineStart = { x: 0, y: 100 };
      const lineEnd = { x: 100, y: 0 };

      const reflected = reflectPointThroughLine(point, lineStart, lineEnd);

      // For line y = -x + 100, point (0,0) reflects to (100, 100)
      expect(reflected.x).toBeCloseTo(100);
      expect(reflected.y).toBeCloseTo(100);
    });

    it("point on line reflects to itself", () => {
      const point = { x: 50, y: 50 };
      const lineStart = { x: 0, y: 0 };
      const lineEnd = { x: 100, y: 100 };

      const reflected = reflectPointThroughLine(point, lineStart, lineEnd);

      expect(reflected.x).toBeCloseTo(50);
      expect(reflected.y).toBeCloseTo(50);
    });
  });

  describe("reflectSection", () => {
    it("reflects all three points of a section through a surface", () => {
      const section: AngularSection = {
        source: { x: 100, y: 300 },
        left: { x: 200, y: 200 },
        right: { x: 200, y: 400 },
      };

      const surface = createTestSurface({
        id: "mirror",
        start: { x: 300, y: 0 },
        end: { x: 300, y: 600 },
      });

      const reflected = reflectSection(section, surface);

      // Source at x=100, line at x=300, reflected source at x=500
      expect(reflected.source.x).toBeCloseTo(500);
      expect(reflected.source.y).toBeCloseTo(300);

      // Left at x=200, reflected at x=400
      expect(reflected.left.x).toBeCloseTo(400);
      expect(reflected.left.y).toBeCloseTo(200);

      // Right at x=200, reflected at x=400
      expect(reflected.right.x).toBeCloseTo(400);
      expect(reflected.right.y).toBeCloseTo(400);
    });

    it("preserves exactness: double reflection returns original", () => {
      const section: AngularSection = {
        source: { x: 123.456, y: 789.012 },
        left: { x: 234.567, y: 890.123 },
        right: { x: 345.678, y: 901.234 },
      };

      const surface = createTestSurface({
        id: "mirror",
        start: { x: 400, y: 100 },
        end: { x: 500, y: 500 },
      });

      const reflected1 = reflectSection(section, surface);
      const reflected2 = reflectSection(reflected1, surface);

      // Double reflection should return to original
      expect(reflected2.source.x).toBeCloseTo(section.source.x);
      expect(reflected2.source.y).toBeCloseTo(section.source.y);
      expect(reflected2.left.x).toBeCloseTo(section.left.x);
      expect(reflected2.left.y).toBeCloseTo(section.left.y);
      expect(reflected2.right.x).toBeCloseTo(section.right.x);
      expect(reflected2.right.y).toBeCloseTo(section.right.y);
    });
  });

  describe("crossProduct", () => {
    it("returns positive for point to left of ray", () => {
      const source = { x: 0, y: 0 };
      const target = { x: 100, y: 0 };  // Ray pointing right
      const point = { x: 50, y: 50 };   // Above the ray (left in 2D)

      const result = crossProduct(source, target, point);
      expect(result).toBeGreaterThan(0);
    });

    it("returns negative for point to right of ray", () => {
      const source = { x: 0, y: 0 };
      const target = { x: 100, y: 0 };  // Ray pointing right
      const point = { x: 50, y: -50 };  // Below the ray (right in 2D)

      const result = crossProduct(source, target, point);
      expect(result).toBeLessThan(0);
    });

    it("returns zero for point on ray", () => {
      const source = { x: 0, y: 0 };
      const target = { x: 100, y: 0 };
      const point = { x: 50, y: 0 };

      const result = crossProduct(source, target, point);
      expect(result).toBeCloseTo(0);
    });
  });

  describe("raySegmentIntersection", () => {
    it("finds intersection when ray crosses segment", () => {
      const ray: Ray = {
        source: { x: 0, y: 50 },
        target: { x: 100, y: 50 },  // Horizontal ray
      };
      const segmentStart = { x: 50, y: 0 };
      const segmentEnd = { x: 50, y: 100 };  // Vertical segment

      const intersection = raySegmentIntersection(ray, segmentStart, segmentEnd);

      expect(intersection).not.toBeNull();
      expect(intersection!.x).toBeCloseTo(50);
      expect(intersection!.y).toBeCloseTo(50);
    });

    it("returns null when ray is parallel to segment", () => {
      const ray: Ray = {
        source: { x: 0, y: 50 },
        target: { x: 100, y: 50 },
      };
      const segmentStart = { x: 0, y: 100 };
      const segmentEnd = { x: 100, y: 100 };  // Parallel horizontal segment

      const intersection = raySegmentIntersection(ray, segmentStart, segmentEnd);

      expect(intersection).toBeNull();
    });

    it("returns null when intersection is behind ray source", () => {
      const ray: Ray = {
        source: { x: 100, y: 50 },
        target: { x: 200, y: 50 },  // Ray pointing right
      };
      const segmentStart = { x: 50, y: 0 };
      const segmentEnd = { x: 50, y: 100 };  // Segment to the left

      const intersection = raySegmentIntersection(ray, segmentStart, segmentEnd);

      expect(intersection).toBeNull();
    });
  });
});

// =============================================================================
// Phase 2: calculateVisibleSectionsOnSurface
// =============================================================================

describe("calculateVisibleSectionsOnSurface", () => {
  it("returns full surface when no obstacles", () => {
    const origin = { x: 100, y: 300 };
    const targetSurface = createTestSurface({
      id: "target",
      start: { x: 400, y: 200 },
      end: { x: 400, y: 400 },
    });

    const sections = calculateVisibleSectionsOnSurface(origin, targetSurface, []);

    expect(sections.length).toBe(1);
    expect(sections[0]!.source).toEqual(origin);
    // Left and right should be the surface endpoints
    expect(sections[0]!.left.x).toBeCloseTo(400);
    expect(sections[0]!.left.y).toBeCloseTo(200);
    expect(sections[0]!.right.x).toBeCloseTo(400);
    expect(sections[0]!.right.y).toBeCloseTo(400);
  });

  it("returns partial section when obstacle blocks part of surface", () => {
    const origin = { x: 100, y: 300 };
    const targetSurface = createTestSurface({
      id: "target",
      start: { x: 400, y: 100 },
      end: { x: 400, y: 500 },
    });

    // Obstacle that blocks the middle portion
    const obstacle = createTestSurface({
      id: "blocker",
      start: { x: 250, y: 250 },
      end: { x: 250, y: 350 },
    });

    const sections = calculateVisibleSectionsOnSurface(origin, targetSurface, [obstacle]);

    // Should have two visible sections (above and below the obstacle shadow)
    expect(sections.length).toBe(2);
  });

  it("returns empty when obstacle completely blocks surface", () => {
    const origin = { x: 100, y: 300 };
    const targetSurface = createTestSurface({
      id: "target",
      start: { x: 400, y: 250 },
      end: { x: 400, y: 350 },
    });

    // Large obstacle that completely blocks the surface
    const obstacle = createTestSurface({
      id: "blocker",
      start: { x: 250, y: 100 },
      end: { x: 250, y: 500 },
    });

    const sections = calculateVisibleSectionsOnSurface(origin, targetSurface, [obstacle]);

    expect(sections.length).toBe(0);
  });
});

// =============================================================================
// Phase 3: intersectSections
// =============================================================================

describe("intersectSections", () => {
  it("returns empty when no overlap", () => {
    const origin = { x: 0, y: 0 };

    const sectionsA: AngularSection[] = [{
      source: origin,
      left: { x: 100, y: 0 },
      right: { x: 100, y: 50 },
    }];

    const sectionsB: AngularSection[] = [{
      source: origin,
      left: { x: 100, y: 100 },
      right: { x: 100, y: 150 },
    }];

    const result = intersectSections(sectionsA, sectionsB);

    expect(result.length).toBe(0);
  });

  it("returns overlapping portion when sections partially overlap", () => {
    const origin = { x: 0, y: 0 };

    const sectionsA: AngularSection[] = [{
      source: origin,
      left: { x: 100, y: 0 },
      right: { x: 100, y: 100 },
    }];

    const sectionsB: AngularSection[] = [{
      source: origin,
      left: { x: 100, y: 50 },
      right: { x: 100, y: 150 },
    }];

    const result = intersectSections(sectionsA, sectionsB);

    // Should have overlap from y=50 to y=100
    expect(result.length).toBe(1);
  });
});

// =============================================================================
// Phase 4: Single Surface Propagation
// =============================================================================

describe("propagateVisibility - Single Surface", () => {
  it("propagates through single surface with no obstacles", () => {
    const player = { x: 100, y: 300 };
    const plannedSurface = createTestSurface({
      id: "ricochet",
      start: { x: 400, y: 200 },
      end: { x: 400, y: 400 },
    });

    const result = propagateVisibility(player, [plannedSurface], [plannedSurface]);

    expect(result.sections.length).toBeGreaterThan(0);
    // Origin should be the player image (reflected through surface)
    expect(result.origin.x).toBeCloseTo(700);  // 2*400 - 100
    expect(result.origin.y).toBeCloseTo(300);
  });

  it("returns empty sections when surface is not visible", () => {
    const player = { x: 100, y: 300 };
    const plannedSurface = createTestSurface({
      id: "ricochet",
      start: { x: 400, y: 200 },
      end: { x: 400, y: 400 },
    });

    // Large wall blocking the surface
    const blocker = createTestSurface({
      id: "wall",
      start: { x: 250, y: 0 },
      end: { x: 250, y: 600 },
    });

    const result = propagateVisibility(player, [plannedSurface], [plannedSurface, blocker]);

    expect(result.sections.length).toBe(0);
  });
});

// =============================================================================
// Phase 5: Multi-Surface Propagation
// =============================================================================

describe("propagateVisibility - Multi Surface", () => {
  it("propagates through two surfaces", () => {
    const player = { x: 100, y: 300 };
    const surface1 = createTestSurface({
      id: "ricochet1",
      start: { x: 300, y: 200 },
      end: { x: 300, y: 400 },
    });
    const surface2 = createTestSurface({
      id: "ricochet2",
      start: { x: 500, y: 200 },
      end: { x: 500, y: 400 },
    });

    const result = propagateVisibility(player, [surface1, surface2], [surface1, surface2]);

    // Origin should be double-reflected
    // After surface1 (x=300): image1 at x = 2*300 - 100 = 500
    // After surface2 (x=500): image2 at x = 2*500 - 500 = 500
    expect(result.origin.x).toBeCloseTo(500);
  });
});

// =============================================================================
// Phase 6: Polygon Construction
// =============================================================================

describe("buildPolygonFromSections", () => {
  it("builds valid polygon from single section", () => {
    const origin = { x: 700, y: 300 };  // Player image
    const section: AngularSection = {
      source: origin,
      left: { x: 400, y: 200 },
      right: { x: 400, y: 400 },
    };

    const plannedSurface = createTestSurface({
      id: "ricochet",
      start: { x: 400, y: 200 },
      end: { x: 400, y: 400 },
    });

    const walls = [
      createTestSurface({ id: "floor", start: { x: 0, y: 550 }, end: { x: 800, y: 550 }, canReflect: false }),
      createTestSurface({ id: "ceiling", start: { x: 0, y: 50 }, end: { x: 800, y: 50 }, canReflect: false }),
      createTestSurface({ id: "left", start: { x: 10, y: 50 }, end: { x: 10, y: 550 }, canReflect: false }),
      createTestSurface({ id: "right", start: { x: 790, y: 50 }, end: { x: 790, y: 550 }, canReflect: false }),
    ];

    const polygon = buildPolygonFromSections(
      { sections: [section], origin },
      [...walls, plannedSurface],
      screenBounds,
      plannedSurface
    );

    // Should have at least 3 vertices (triangle minimum)
    expect(polygon.length).toBeGreaterThanOrEqual(3);

    // Check polygon is not self-intersecting (V.7)
    expect(isSimplePolygon(polygon)).toBe(true);
  });
});

// =============================================================================
// Helper for polygon validation
// =============================================================================

function isSimplePolygon(vertices: Vector2[]): boolean {
  const n = vertices.length;
  if (n < 3) return false;

  for (let i = 0; i < n; i++) {
    const a1 = vertices[i]!;
    const a2 = vertices[(i + 1) % n]!;

    for (let j = i + 2; j < n; j++) {
      if (j === (i + n - 1) % n) continue;  // Skip adjacent edge

      const b1 = vertices[j]!;
      const b2 = vertices[(j + 1) % n]!;

      if (edgesCross(a1, a2, b1, b2)) {
        return false;
      }
    }
  }

  return true;
}

function edgesCross(a1: Vector2, a2: Vector2, b1: Vector2, b2: Vector2): boolean {
  const d1 = (b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x);
  const d2 = (b2.x - b1.x) * (a2.y - b1.y) - (b2.y - b1.y) * (a2.x - b1.x);
  const d3 = (a2.x - a1.x) * (b1.y - a1.y) - (a2.y - a1.y) * (b1.x - a1.x);
  const d4 = (a2.x - a1.x) * (b2.y - a1.y) - (a2.y - a1.y) * (b2.x - a1.x);

  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

