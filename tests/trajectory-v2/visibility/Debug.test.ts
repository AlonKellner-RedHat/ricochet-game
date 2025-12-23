/**
 * Debug tests to understand visibility system behavior
 */

import { describe, it, expect } from "vitest";
import { propagateCone } from "@/trajectory-v2/visibility/ConePropagator";
import { buildOutline } from "@/trajectory-v2/visibility/OutlineBuilder";
import {
  coneCoverage,
  isConeEmpty,
  fullCone,
  blockCone,
  sectionFromSegment,
  trimCone,
} from "@/trajectory-v2/visibility/ConeSection";
import { createTestSurface, isPointInPolygon } from "./testHelpers";

describe("Debug Visibility", () => {
  it("diagnose blockCone with single wall", () => {
    const origin = { x: 200, y: 300 };
    const wallStart = { x: 400, y: 250 };
    const wallEnd = { x: 400, y: 350 };

    // First, let's see what sectionFromSegment returns
    const wallSection = sectionFromSegment(origin, wallStart, wallEnd);
    console.log("Wall section from segment:", wallSection);

    // Create a full cone
    const cone = fullCone();
    console.log("Full cone:", cone);
    console.log("Full cone coverage:", coneCoverage(cone));

    // Block by the wall
    const blocked = blockCone(cone, origin, wallStart, wallEnd);
    console.log("After blocking:", blocked);
    console.log("Blocked cone coverage:", coneCoverage(blocked));

    // The blocked cone should have LESS coverage than full cone
    expect(coneCoverage(blocked)).toBeLessThan(coneCoverage(cone));
  });

  it("diagnose trimCone with window", () => {
    const origin = { x: 200, y: 300 };
    const windowStart = { x: 400, y: 250 };
    const windowEnd = { x: 400, y: 350 };

    // See what section the window creates
    const windowSection = sectionFromSegment(origin, windowStart, windowEnd);
    console.log("Window section:", windowSection);

    // Full cone
    const cone = fullCone();
    console.log("Full cone coverage:", coneCoverage(cone));

    // Trim to window
    const trimmed = trimCone(cone, origin, windowStart, windowEnd);
    console.log("After trimming:", trimmed);
    console.log("Trimmed coverage:", coneCoverage(trimmed));

    // Trimmed should be much smaller than full cone
    expect(coneCoverage(trimmed)).toBeLessThan(Math.PI); // Less than 180 degrees
  });

  it("diagnose propagateCone with single wall", () => {
    const player = { x: 200, y: 300 };
    const wall = createTestSurface(
      "wall",
      { x: 400, y: 250 },
      { x: 400, y: 350 }
    );

    const result = propagateCone(player, [], [wall]);
    console.log("Propagation result:");
    console.log("  success:", result.success);
    console.log("  cone empty:", isConeEmpty(result.finalCone));
    console.log("  cone coverage:", coneCoverage(result.finalCone));
    console.log("  cone sections:", result.finalCone);
    console.log("  blocking surfaces:", result.blockingSurfaces.length);
    for (const b of result.blockingSurfaces) {
      console.log("    ", b.surface.id, "section:", b.section);
    }

    // The cone should have less coverage due to blocking
    expect(coneCoverage(result.finalCone)).toBeLessThan(2 * Math.PI);
  });

  it("diagnose outline building", () => {
    const player = { x: 200, y: 300 };
    const wall = createTestSurface(
      "wall",
      { x: 400, y: 250 },
      { x: 400, y: 350 }
    );

    const result = propagateCone(player, [], [wall]);
    const bounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
    // Pass the surfaces to buildOutline for accurate ray casting
    const outline = buildOutline(result, bounds, [wall]);

    console.log("Outline:");
    console.log("  valid:", outline.isValid);
    console.log("  vertex count:", outline.vertices.length);

    if (outline.vertices.length > 0) {
      console.log("  first 10 vertices:");
      for (let i = 0; i < Math.min(10, outline.vertices.length); i++) {
        const v = outline.vertices[i]!;
        console.log(`    ${i}: ${v.type} (${v.position.x.toFixed(0)}, ${v.position.y.toFixed(0)})`);
      }
    }

    // Check that some vertices are on surfaces (the wall)
    const surfaceVertices = outline.vertices.filter(v => v.type === "surface");
    console.log("  surface vertices:", surfaceVertices.length);

    expect(outline.isValid).toBe(true);
    expect(outline.vertices.length).toBeGreaterThan(0);
    // With the wall, some vertices should be on the surface
    expect(surfaceVertices.length).toBeGreaterThan(0);
  });

  it("diagnose planned surface propagation", () => {
    const player = { x: 200, y: 300 };
    const surface = createTestSurface(
      "window",
      { x: 400, y: 200 },
      { x: 400, y: 400 },
      true // reflective
    );

    console.log("=== Planned Surface Propagation ===");
    console.log("Player:", player);
    console.log("Window:", surface.segment);

    const result = propagateCone(player, [surface], [surface]);
    console.log("Result:");
    console.log("  success:", result.success);
    console.log("  finalOrigin:", result.finalOrigin);
    console.log("  cone sections:", result.finalCone);
    console.log("  cone coverage:", coneCoverage(result.finalCone));

    if (result.success) {
      const bounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
      const outline = buildOutline(result, bounds, [surface]);
      console.log("Outline:");
      console.log("  valid:", outline.isValid);
      console.log("  vertices:", outline.vertices.length);

      if (outline.vertices.length > 0) {
        console.log("  first 5 vertices:");
        for (let i = 0; i < Math.min(5, outline.vertices.length); i++) {
          const v = outline.vertices[i]!;
          console.log(`    ${i}: ${v.type} (${v.position.x.toFixed(0)}, ${v.position.y.toFixed(0)})`);
        }
      }
    }

    expect(result.success).toBe(true);
  });

  it("diagnose 3-sided room", () => {
    const player = { x: 400, y: 300 };
    const walls = [
      createTestSurface("left", { x: 200, y: 100 }, { x: 200, y: 500 }),
      createTestSurface("top", { x: 200, y: 100 }, { x: 600, y: 100 }),
      createTestSurface("bottom", { x: 200, y: 500 }, { x: 600, y: 500 }),
    ];

    console.log("=== 3-Sided Room Propagation ===");
    console.log("Player:", player);

    const result = propagateCone(player, [], walls);
    console.log("Result:");
    console.log("  success:", result.success);
    console.log("  cone sections:", result.finalCone.length);
    console.log("  cone coverage:", coneCoverage(result.finalCone));

    for (const section of result.finalCone) {
      console.log("    Section:", section.startAngle.toFixed(4), "to", section.endAngle.toFixed(4));
    }

    const bounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
    const outline = buildOutline(result, bounds, walls);
    console.log("Outline:");
    console.log("  valid:", outline.isValid);
    console.log("  vertices:", outline.vertices.length);

    // Test specific points
    const testPoints = [
      { x: 400, y: 300, desc: "player center" },
      { x: 450, y: 300, desc: "right of player" },
      { x: 350, y: 300, desc: "left of player" },
      { x: 400, y: 350, desc: "below player" },
      { x: 400, y: 250, desc: "above player" },
    ];

    const vertices = outline.vertices.map((v) => v.position);
    for (const pt of testPoints) {
      const inside = isPointInPolygon(pt, vertices);
      console.log(`  ${pt.desc} (${pt.x}, ${pt.y}): ${inside ? "LIT" : "DARK"}`);
    }

    expect(result.success).toBe(true);
  });

  it("diagnose empty room corners", () => {
    const player = { x: 400, y: 300 };
    const bounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };

    console.log("=== Empty Room Corners ===");
    console.log("Player:", player);
    console.log("Bounds:", bounds);

    const result = propagateCone(player, [], []);
    console.log("Propagation:");
    console.log("  success:", result.success);
    console.log("  cone coverage:", coneCoverage(result.finalCone));

    const outline = buildOutline(result, bounds, []);
    console.log("Outline:");
    console.log("  valid:", outline.isValid);
    console.log("  vertex count:", outline.vertices.length);

    if (outline.vertices.length > 0) {
      console.log("  first 5 vertices:");
      for (let i = 0; i < Math.min(5, outline.vertices.length); i++) {
        const v = outline.vertices[i]!;
        console.log(`    ${i}: ${v.type} (${v.position.x.toFixed(0)}, ${v.position.y.toFixed(0)})`);
      }
      console.log("  last 5 vertices:");
      for (let i = Math.max(0, outline.vertices.length - 5); i < outline.vertices.length; i++) {
        const v = outline.vertices[i]!;
        console.log(`    ${i}: ${v.type} (${v.position.x.toFixed(0)}, ${v.position.y.toFixed(0)})`);
      }
    }

    // Test corner points
    const corners = [
      { x: 10, y: 10, desc: "top-left" },
      { x: 790, y: 10, desc: "top-right" },
      { x: 10, y: 590, desc: "bottom-left" },
      { x: 790, y: 590, desc: "bottom-right" },
    ];

    const vertices = outline.vertices.map((v) => v.position);
    for (const corner of corners) {
      const inside = isPointInPolygon(corner, vertices);
      console.log(`  ${corner.desc} (${corner.x}, ${corner.y}): ${inside ? "LIT" : "DARK"}`);
    }

    expect(result.success).toBe(true);
  });
});

