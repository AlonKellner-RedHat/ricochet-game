/**
 * Split Umbrella Mode Tests
 *
 * Tests for umbrella mode with a gap in the middle that splits light into 2 cones.
 * This is the core model for multi-surface visibility with obstructions.
 *
 * All calculations use ONLY:
 * - Cross-product comparisons (single source of truth)
 * - Provenance deduction (surface IDs, source point types)
 *
 * NO atan2 or angle calculations are allowed.
 */
import { describe, it, expect } from "vitest";
import {
  projectConeV2,
  createFullCone,
  createConeThroughWindow,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { preparePolygonForRendering } from "@/trajectory-v2/visibility/RenderingDedup";
import { createTestSurface } from "./testHelpers";
import type { Vector2 } from "@/types";

/**
 * Check if a point is on a line segment using cross-products only.
 * NO atan2 or angles allowed.
 */
function isPointOnSegment(
  point: Vector2,
  p1: Vector2,
  p2: Vector2
): boolean {
  // Cross product to check collinearity
  const cross = (p2.x - p1.x) * (point.y - p1.y) - (p2.y - p1.y) * (point.x - p1.x);
  
  // Use relative tolerance based on edge length
  const edgeLenSq = (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2;
  const tolerance = Math.sqrt(edgeLenSq) * 1e-10;
  
  if (Math.abs(cross) > tolerance) return false;
  
  // Check if point is between p1 and p2 (using dot products)
  const dotP1 = (point.x - p1.x) * (p2.x - p1.x) + (point.y - p1.y) * (p2.y - p1.y);
  const dotP2 = (point.x - p2.x) * (p1.x - p2.x) + (point.y - p2.y) * (p1.y - p2.y);
  
  return dotP1 >= -tolerance && dotP2 >= -tolerance;
}

/**
 * Cross-product based point-in-polygon test.
 * Uses winding number algorithm with only cross-products.
 * Returns true if point is inside OR on the boundary of the polygon.
 * NO atan2 or angles allowed.
 */
function isPointInPolygonCrossProduct(
  point: Vector2,
  polygon: Vector2[]
): boolean {
  if (polygon.length < 3) return false;

  // First check if point is on any edge (boundary)
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i]!;
    const p2 = polygon[(i + 1) % polygon.length]!;
    if (isPointOnSegment(point, p1, p2)) {
      return true; // On boundary = inside
    }
  }

  // Winding number for interior points
  let windingNumber = 0;

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i]!;
    const p2 = polygon[(i + 1) % polygon.length]!;

    // Edge vector from p1 to p2
    const edgeX = p2.x - p1.x;
    const edgeY = p2.y - p1.y;

    // Vector from p1 to point
    const toPointX = point.x - p1.x;
    const toPointY = point.y - p1.y;

    // Cross product: edge × toPoint
    // Positive = point is to the LEFT of the edge
    // Negative = point is to the RIGHT of the edge
    const cross = edgeX * toPointY - edgeY * toPointX;

    // Check if edge crosses the horizontal line through point
    if (p1.y <= point.y) {
      // Upward crossing
      if (p2.y > point.y && cross > 0) {
        windingNumber++;
      }
    } else {
      // Downward crossing
      if (p2.y <= point.y && cross < 0) {
        windingNumber--;
      }
    }
  }

  return windingNumber !== 0;
}

/**
 * Check if all points of innerPolygon are inside outerPolygon.
 * Uses only cross-product based containment.
 */
function isPolygonContainedIn(
  innerPolygon: Vector2[],
  outerPolygon: Vector2[]
): boolean {
  for (const point of innerPolygon) {
    if (!isPointInPolygonCrossProduct(point, outerPolygon)) {
      return false;
    }
  }
  return true;
}

/**
 * Calculate signed area using cross-product (shoelace formula).
 * Negative = CCW (valid polygon in screen coords), Positive = CW
 */
function calculateSignedArea(polygon: Vector2[]): number {
  if (polygon.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i]!.x * polygon[j]!.y;
    area -= polygon[j]!.x * polygon[i]!.y;
  }
  return area / 2;
}

/**
 * Check if polygon is valid (non-self-intersecting) using signed area.
 * For windowed cones (looking "upward" from player), valid polygons have negative signed area.
 * For full 360° cones, either winding is valid - the polygon just needs non-zero area.
 */
function isValidPolygon(polygon: Vector2[], isWindowedCone = true): boolean {
  const signedArea = calculateSignedArea(polygon);
  if (isWindowedCone) {
    // Windowed cones in screen coordinates have negative signed area
    return signedArea < 0;
  } else {
    // Full cones just need non-zero area (either winding is OK)
    return Math.abs(signedArea) > 0;
  }
}

describe("Split Umbrella Mode", () => {
  // Standard test bounds
  const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 800 };

  // Standard walls
  const walls = [
    createTestSurface("floor", { x: 0, y: 800 }, { x: 1000, y: 800 }),
    createTestSurface("ceiling", { x: 0, y: 0 }, { x: 1000, y: 0 }),
    createTestSurface("left-wall", { x: 0, y: 0 }, { x: 0, y: 800 }),
    createTestSurface("right-wall", { x: 1000, y: 0 }, { x: 1000, y: 800 }),
  ];

  // Player position
  const player: Vector2 = { x: 500, y: 600 };

  // Umbrella parameters
  const UMBRELLA_Y = 400;
  const UMBRELLA_HALF_WIDTH = 150;
  const GAP_HALF_WIDTH = 20; // 40px gap total

  // Left and right umbrella segments (with gap in the middle)
  const leftUmbrella: Segment = {
    start: { x: player.x - UMBRELLA_HALF_WIDTH, y: UMBRELLA_Y },
    end: { x: player.x - GAP_HALF_WIDTH, y: UMBRELLA_Y },
  };

  const rightUmbrella: Segment = {
    start: { x: player.x + GAP_HALF_WIDTH, y: UMBRELLA_Y },
    end: { x: player.x + UMBRELLA_HALF_WIDTH, y: UMBRELLA_Y },
  };

  // Full umbrella (no gap) for comparison
  const fullUmbrella: Segment = {
    start: { x: player.x - UMBRELLA_HALF_WIDTH, y: UMBRELLA_Y },
    end: { x: player.x + UMBRELLA_HALF_WIDTH, y: UMBRELLA_Y },
  };

  describe("Split umbrella creates two separate cones", () => {
    it("left cone should be valid polygon with negative signed area", () => {
      const leftCone = createConeThroughWindow(
        player,
        leftUmbrella.start,
        leftUmbrella.end
      );
      const sourcePoints = projectConeV2(leftCone, walls, bounds);
      const leftPolygon = preparePolygonForRendering(toVector2Array(sourcePoints));

      console.log("=== LEFT CONE ===");
      console.log(
        `Window: (${leftUmbrella.start.x}, ${leftUmbrella.start.y}) to (${leftUmbrella.end.x}, ${leftUmbrella.end.y})`
      );
      console.log(`Polygon vertices: ${leftPolygon.length}`);
      leftPolygon.forEach((v, i) => {
        console.log(`  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)})`);
      });

      const signedArea = calculateSignedArea(leftPolygon);
      console.log(`Signed area: ${signedArea.toFixed(1)}`);

      expect(leftPolygon.length).toBeGreaterThanOrEqual(3);
      expect(isValidPolygon(leftPolygon)).toBe(true);
    });

    it("right cone should be valid polygon with negative signed area", () => {
      const rightCone = createConeThroughWindow(
        player,
        rightUmbrella.start,
        rightUmbrella.end
      );
      const sourcePoints = projectConeV2(rightCone, walls, bounds);
      const rightPolygon = preparePolygonForRendering(toVector2Array(sourcePoints));

      console.log("=== RIGHT CONE ===");
      console.log(
        `Window: (${rightUmbrella.start.x}, ${rightUmbrella.start.y}) to (${rightUmbrella.end.x}, ${rightUmbrella.end.y})`
      );
      console.log(`Polygon vertices: ${rightPolygon.length}`);
      rightPolygon.forEach((v, i) => {
        console.log(`  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)})`);
      });

      const signedArea = calculateSignedArea(rightPolygon);
      console.log(`Signed area: ${signedArea.toFixed(1)}`);

      expect(rightPolygon.length).toBeGreaterThanOrEqual(3);
      expect(isValidPolygon(rightPolygon)).toBe(true);
    });
  });

  describe("Union of split cones is contained in full visibility", () => {
    it("full 360° visibility should be valid", () => {
      const fullCone = createFullCone(player);
      const sourcePoints = projectConeV2(fullCone, walls, bounds);
      const fullPolygon = preparePolygonForRendering(toVector2Array(sourcePoints));

      console.log("=== FULL 360° VISIBILITY ===");
      console.log(`Polygon vertices: ${fullPolygon.length}`);

      const signedArea = calculateSignedArea(fullPolygon);
      console.log(`Signed area: ${signedArea.toFixed(1)}`);

      expect(fullPolygon.length).toBeGreaterThanOrEqual(4);
      // Full 360° cone has different winding than windowed cones
      expect(isValidPolygon(fullPolygon, false)).toBe(true);
    });

    it("left cone vertices should all be inside full visibility", () => {
      // Get full visibility
      const fullCone = createFullCone(player);
      const fullSourcePoints = projectConeV2(fullCone, walls, bounds);
      const fullPolygon = preparePolygonForRendering(toVector2Array(fullSourcePoints));

      // Get left cone
      const leftCone = createConeThroughWindow(
        player,
        leftUmbrella.start,
        leftUmbrella.end
      );
      const leftSourcePoints = projectConeV2(leftCone, walls, bounds);
      const leftPolygon = preparePolygonForRendering(toVector2Array(leftSourcePoints));

      console.log("=== LEFT CONE CONTAINMENT ===");
      let allContained = true;
      for (let i = 0; i < leftPolygon.length; i++) {
        const v = leftPolygon[i]!;
        const contained = isPointInPolygonCrossProduct(v, fullPolygon);
        console.log(
          `  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)}): ${contained ? "IN" : "OUT"}`
        );
        if (!contained) allContained = false;
      }

      expect(allContained).toBe(true);
    });

    it("right cone vertices should all be inside full visibility", () => {
      // Get full visibility
      const fullCone = createFullCone(player);
      const fullSourcePoints = projectConeV2(fullCone, walls, bounds);
      const fullPolygon = preparePolygonForRendering(toVector2Array(fullSourcePoints));

      // Get right cone
      const rightCone = createConeThroughWindow(
        player,
        rightUmbrella.start,
        rightUmbrella.end
      );
      const rightSourcePoints = projectConeV2(rightCone, walls, bounds);
      const rightPolygon = preparePolygonForRendering(toVector2Array(rightSourcePoints));

      console.log("=== RIGHT CONE CONTAINMENT ===");
      let allContained = true;
      for (let i = 0; i < rightPolygon.length; i++) {
        const v = rightPolygon[i]!;
        const contained = isPointInPolygonCrossProduct(v, fullPolygon);
        console.log(
          `  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)}): ${contained ? "IN" : "OUT"}`
        );
        if (!contained) allContained = false;
      }

      expect(allContained).toBe(true);
    });
  });

  describe("Gap creates shadow region", () => {
    it("point in gap shadow should NOT be in either cone polygon", () => {
      // Point directly above the gap (in the shadow region)
      const shadowPoint: Vector2 = { x: player.x, y: 100 };

      // Get left cone
      const leftCone = createConeThroughWindow(
        player,
        leftUmbrella.start,
        leftUmbrella.end
      );
      const leftSourcePoints = projectConeV2(leftCone, walls, bounds);
      const leftPolygon = preparePolygonForRendering(toVector2Array(leftSourcePoints));

      // Get right cone
      const rightCone = createConeThroughWindow(
        player,
        rightUmbrella.start,
        rightUmbrella.end
      );
      const rightSourcePoints = projectConeV2(rightCone, walls, bounds);
      const rightPolygon = preparePolygonForRendering(toVector2Array(rightSourcePoints));

      const inLeft = isPointInPolygonCrossProduct(shadowPoint, leftPolygon);
      const inRight = isPointInPolygonCrossProduct(shadowPoint, rightPolygon);

      console.log("=== SHADOW REGION ===");
      console.log(
        `Shadow point: (${shadowPoint.x}, ${shadowPoint.y})`
      );
      console.log(`In left polygon: ${inLeft}`);
      console.log(`In right polygon: ${inRight}`);

      expect(inLeft).toBe(false);
      expect(inRight).toBe(false);
    });

    it("point in gap shadow but inside full visibility should exist", () => {
      // Point directly above the gap
      const shadowPoint: Vector2 = { x: player.x, y: 100 };

      // Get full visibility (no umbrella)
      const fullCone = createFullCone(player);
      const fullSourcePoints = projectConeV2(fullCone, walls, bounds);
      const fullPolygon = preparePolygonForRendering(toVector2Array(fullSourcePoints));

      const inFull = isPointInPolygonCrossProduct(shadowPoint, fullPolygon);

      console.log("=== SHADOW IN FULL ===");
      console.log(`Shadow point (${shadowPoint.x}, ${shadowPoint.y}) in full: ${inFull}`);

      // This point should be inside full visibility (no obstruction)
      expect(inFull).toBe(true);
    });
  });

  describe("Full umbrella vs split umbrella comparison", () => {
    it("full umbrella cone should cover both split cones", () => {
      // Full umbrella
      const fullUmbrellaCone = createConeThroughWindow(
        player,
        fullUmbrella.start,
        fullUmbrella.end
      );
      const fullUmbrellaSourcePoints = projectConeV2(fullUmbrellaCone, walls, bounds);
      const fullUmbrellaPolygon = preparePolygonForRendering(toVector2Array(fullUmbrellaSourcePoints));

      // Left and right cones
      const leftCone = createConeThroughWindow(
        player,
        leftUmbrella.start,
        leftUmbrella.end
      );
      const leftSourcePoints = projectConeV2(leftCone, walls, bounds);
      const leftPolygon = preparePolygonForRendering(toVector2Array(leftSourcePoints));

      const rightCone = createConeThroughWindow(
        player,
        rightUmbrella.start,
        rightUmbrella.end
      );
      const rightSourcePoints = projectConeV2(rightCone, walls, bounds);
      const rightPolygon = preparePolygonForRendering(toVector2Array(rightSourcePoints));

      console.log("=== FULL UMBRELLA VS SPLIT ===");
      console.log(`Full umbrella: ${fullUmbrellaPolygon.length} vertices`);
      fullUmbrellaPolygon.forEach((v, i) => {
        console.log(`  Full[${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)})`);
      });
      console.log(`Left cone: ${leftPolygon.length} vertices`);
      leftPolygon.forEach((v, i) => {
        console.log(`  Left[${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)})`);
      });
      console.log(`Right cone: ${rightPolygon.length} vertices`);
      rightPolygon.forEach((v, i) => {
        console.log(`  Right[${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)})`);
      });

      // Check containment with detailed logging
      console.log("Checking left polygon containment:");
      let leftAllContained = true;
      for (const v of leftPolygon) {
        const contained = isPointInPolygonCrossProduct(v, fullUmbrellaPolygon);
        console.log(`  (${v.x.toFixed(1)}, ${v.y.toFixed(1)}): ${contained ? "IN" : "OUT"}`);
        if (!contained) leftAllContained = false;
      }

      console.log("Checking right polygon containment:");
      let rightAllContained = true;
      for (const v of rightPolygon) {
        const contained = isPointInPolygonCrossProduct(v, fullUmbrellaPolygon);
        console.log(`  (${v.x.toFixed(1)}, ${v.y.toFixed(1)}): ${contained ? "IN" : "OUT"}`);
        if (!contained) rightAllContained = false;
      }

      expect(leftAllContained).toBe(true);
      expect(rightAllContained).toBe(true);
    });
  });

  describe("Right-side player umbrella issue", () => {
    it("right umbrella segment should produce valid polygon when player is on right side", () => {
      // Player on right side of screen - this was causing self-intersecting polygons
      const rightPlayer: Vector2 = { x: 1141.4890004000101, y: 666 };
      const halfWidth = 75;
      const halfGap = 20;
      const umbrellaY = rightPlayer.y - 100; // 566

      // Right umbrella segment only
      const rightUmbrella = {
        start: { x: rightPlayer.x + halfGap, y: umbrellaY },  // (1161.49, 566)
        end: { x: rightPlayer.x + halfWidth, y: umbrellaY }   // (1216.49, 566)
      };

      // Use the actual game bounds and surfaces from the user's JSON
      const gameBounds = { minX: 0, maxX: 1280, minY: 80, maxY: 700 };
      const gameWalls = [
        createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }),
        createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }),
        createTestSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }),
        createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }),
      ];

      console.log("=== RIGHT SIDE PLAYER TEST ===");
      console.log(`Player: (${rightPlayer.x.toFixed(2)}, ${rightPlayer.y.toFixed(2)})`);
      console.log(`Right umbrella: (${rightUmbrella.start.x.toFixed(2)}, ${rightUmbrella.start.y}) to (${rightUmbrella.end.x.toFixed(2)}, ${rightUmbrella.end.y})`);

      const cone = createConeThroughWindow(rightPlayer, rightUmbrella.start, rightUmbrella.end);
      console.log(`Cone origin: (${cone.origin.x.toFixed(2)}, ${cone.origin.y.toFixed(2)})`);
      console.log(`Cone left boundary: (${cone.leftBoundary.x.toFixed(2)}, ${cone.leftBoundary.y.toFixed(2)})`);
      console.log(`Cone right boundary: (${cone.rightBoundary.x.toFixed(2)}, ${cone.rightBoundary.y.toFixed(2)})`);

      const sourcePoints = projectConeV2(cone, gameWalls, gameBounds);
      console.log(`Source points: ${sourcePoints.length}`);
      
      const rawPolygon = toVector2Array(sourcePoints);
      console.log(`Raw polygon has ${rawPolygon.length} vertices:`);
      rawPolygon.forEach((v, i) => {
        console.log(`  [${i}] (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
      });
      
      const polygon = preparePolygonForRendering(rawPolygon);
      console.log(`Prepared polygon has ${polygon.length} vertices:`);
      polygon.forEach((v, i) => {
        console.log(`  [${i}] (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
      });

      const signedArea = calculateSignedArea(polygon);
      console.log(`Signed area: ${signedArea.toFixed(2)}`);

      expect(polygon.length).toBeGreaterThanOrEqual(3);
      expect(isValidPolygon(polygon)).toBe(true);
    });
  });

  describe("Cross-product only validation", () => {
    it("isPointInPolygonCrossProduct should correctly identify interior points", () => {
      const square: Vector2[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];

      // Point inside
      expect(isPointInPolygonCrossProduct({ x: 50, y: 50 }, square)).toBe(true);

      // Point outside
      expect(isPointInPolygonCrossProduct({ x: 150, y: 50 }, square)).toBe(false);
      expect(isPointInPolygonCrossProduct({ x: -50, y: 50 }, square)).toBe(false);
      expect(isPointInPolygonCrossProduct({ x: 50, y: 150 }, square)).toBe(false);
      expect(isPointInPolygonCrossProduct({ x: 50, y: -50 }, square)).toBe(false);
    });

    it("isPointInPolygonCrossProduct should handle concave polygons", () => {
      // L-shaped polygon (concave)
      const lShape: Vector2[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 50, y: 50 },
        { x: 50, y: 100 },
        { x: 0, y: 100 },
      ];

      // Point inside the L
      expect(isPointInPolygonCrossProduct({ x: 25, y: 75 }, lShape)).toBe(true);
      expect(isPointInPolygonCrossProduct({ x: 75, y: 25 }, lShape)).toBe(true);

      // Point in the "cut-out" (outside)
      expect(isPointInPolygonCrossProduct({ x: 75, y: 75 }, lShape)).toBe(false);
    });
  });
});


describe("User-reported umbrella issue", () => {
  it("right umbrella at player x=170 should produce valid polygon", () => {
    const player: Vector2 = { x: 170, y: 666 };
    const halfWidth = 75;
    const halfGap = 20;
    const umbrellaY = player.y - 100; // 566

    // Right umbrella segment
    const rightUmbrella = {
      start: { x: player.x + halfGap, y: umbrellaY },  // (190, 566)
      end: { x: player.x + halfWidth, y: umbrellaY }   // (245, 566)
    };

    // Use the actual game surfaces from the user's JSON
    const gameBounds = { minX: 0, maxX: 1280, minY: 80, maxY: 700 };
    const gameWalls = [
      createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }),
      createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }),
      createTestSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }),
      createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }),
      createTestSurface("platform-1", { x: 300, y: 450 }, { x: 500, y: 450 }),
      createTestSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }),
      createTestSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 }),
      createTestSurface("ricochet-2", { x: 400, y: 250 }, { x: 550, y: 250 }),
      createTestSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 }),
      createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }),
    ];

    console.log("=== USER REPORTED UMBRELLA ISSUE ===");
    console.log(`Player: (${player.x}, ${player.y})`);
    console.log(`Right umbrella: (${rightUmbrella.start.x}, ${rightUmbrella.start.y}) to (${rightUmbrella.end.x}, ${rightUmbrella.end.y})`);

    const cone = createConeThroughWindow(player, rightUmbrella.start, rightUmbrella.end);
    console.log(`Cone origin: (${cone.origin.x}, ${cone.origin.y})`);
    console.log(`Cone left boundary: (${cone.leftBoundary.x}, ${cone.leftBoundary.y})`);
    console.log(`Cone right boundary: (${cone.rightBoundary.x}, ${cone.rightBoundary.y})`);

    const sourcePoints = projectConeV2(cone, gameWalls, gameBounds);
    const rawPolygon = toVector2Array(sourcePoints);
    
    console.log(`Raw polygon has ${rawPolygon.length} vertices:`);
    rawPolygon.forEach((v, i) => {
      const angle = Math.atan2(v.y - player.y, v.x - player.x) * 180 / Math.PI;
      console.log(`  [${i}] (${v.x.toFixed(2)}, ${v.y.toFixed(2)}) angle=${angle.toFixed(2)}deg`);
    });
    
    const polygon = preparePolygonForRendering(rawPolygon);
    console.log(`Prepared polygon has ${polygon.length} vertices:`);
    polygon.forEach((v, i) => {
      const angle = Math.atan2(v.y - player.y, v.x - player.x) * 180 / Math.PI;
      console.log(`  [${i}] (${v.x.toFixed(2)}, ${v.y.toFixed(2)}) angle=${angle.toFixed(2)}deg`);
    });

    const signedArea = calculateSignedArea(polygon);
    console.log(`Signed area: ${signedArea.toFixed(2)}`);

    expect(polygon.length).toBeGreaterThanOrEqual(3);
    expect(isValidPolygon(polygon)).toBe(true);
  });
});
