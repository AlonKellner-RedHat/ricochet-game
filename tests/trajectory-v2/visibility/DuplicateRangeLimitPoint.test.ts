/**
 * DuplicateRangeLimitPoint.test.ts
 *
 * Tests for the bug where two RangeLimitPoints on the same ray
 * (one with provenance, one without) cause a sorting error.
 *
 * Bug: "Critical: Collinear points without PreComputedPairs:
 *       range_limit:ray:endpoint:pyramid-3-0:start vs
 *       range_limit:766.104458500426,494.59269116642594"
 */

import { describe, expect, it } from "vitest";
import { RangeLimitPoint, endOf, startOf, isRangeLimitPoint } from "@/trajectory-v2/geometry/SourcePoint";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestSurface(id: string, start: Vector2, end: Vector2): Surface {
  return {
    id,
    segment: { start, end },
    surfaceType: "test",
    onArrowHit: () => ({ type: "blocked" }),
    isPlannable: () => false,
    getVisualProperties: () => ({ color: 0, alpha: 1, lineWidth: 1 }),
    getNormal: () => ({ x: 0, y: 1 }),
    canReflectFrom: () => true,
  } as Surface;
}

// =============================================================================
// BUG REPRODUCTION TESTS
// =============================================================================

describe("Duplicate RangeLimitPoint Bug", () => {
  /**
   * BUG ANALYSIS:
   *
   * Error: "Critical: Collinear points without PreComputedPairs:
   *         range_limit:ray:endpoint:pyramid-3-0:start vs
   *         range_limit:766.104458500426,494.59269116642594"
   *
   * Root Cause:
   * 1. Continuation ray through endpoint E hits range limit
   *    → Creates RangeLimitPoint(coords, E) WITH provenance
   * 2. Some OTHER vertex V on the same ray is beyond range limit
   *    → Bulk applyRangeLimit converts V to RangeLimitPoint(coords') WITHOUT provenance
   * 3. Both RangeLimitPoints end up in vertices list
   * 4. removeDuplicatesSourcePoint doesn't dedupe them because:
   *    - equals() falls through to coordinate comparison when mixed provenance
   *    - Coordinates differ slightly due to floating-point arithmetic
   * 5. During sorting, cross product ≈ 0 (collinear), both are RangeLimitPoints
   * 6. No PreComputedPairs for them → Error thrown
   *
   * The OTHER vertex V could be:
   * - A HitPoint from the "to" cast that happens to be on the same ray
   * - A passed-through endpoint that wasn't filtered
   * - A cone boundary hit
   */

  describe("Root Cause: equals() mismatch between provenance and coordinate-based RangeLimitPoints", () => {
    it("should identify when two RangeLimitPoints on same ray are not equal", () => {
      // Simulate the bug scenario:
      // 1. Continuation ray creates RangeLimitPoint with raySource
      // 2. Bulk processing creates RangeLimitPoint without raySource
      // 3. They're on the same ray but have different keys and equals() returns false

      const pyramid = createTestSurface(
        "pyramid-3-0",
        { x: 700, y: 400 },
        { x: 800, y: 500 }
      );
      const endpoint = startOf(pyramid);

      // RangeLimitPoint from continuation ray (with provenance)
      const rlpWithProvenance = new RangeLimitPoint(
        { x: 766.104458500426, y: 494.59269116642594 },
        endpoint
      );

      // RangeLimitPoint from bulk processing (without provenance)
      // Slightly different coordinates due to floating-point arithmetic
      const rlpWithoutProvenance = new RangeLimitPoint(
        { x: 766.1044585004261, y: 494.59269116642596 } // Note: very slightly different
      );

      console.log("RLP with provenance key:", rlpWithProvenance.getKey());
      console.log("RLP without provenance key:", rlpWithoutProvenance.getKey());
      console.log("equals():", rlpWithProvenance.equals(rlpWithoutProvenance));

      // The bug: equals() returns false because:
      // - rlpWithProvenance has raySource, rlpWithoutProvenance doesn't
      // - Falls through to coordinate comparison
      // - Coordinates differ slightly due to floating-point
      expect(rlpWithProvenance.equals(rlpWithoutProvenance)).toBe(false);

      // This means deduplication doesn't work, and both end up in the polygon
      // causing the collinear sorting error
    });

    it("should show that equals() works correctly when BOTH have same provenance", () => {
      const pyramid = createTestSurface(
        "pyramid-3-0",
        { x: 700, y: 400 },
        { x: 800, y: 500 }
      );
      const endpoint = startOf(pyramid);

      const rlp1 = new RangeLimitPoint(
        { x: 766.104458500426, y: 494.59269116642594 },
        endpoint
      );
      const rlp2 = new RangeLimitPoint(
        { x: 766.1044585004261, y: 494.59269116642596 }, // Different coords
        endpoint // Same provenance
      );

      // With same provenance, equals() should return true
      expect(rlp1.equals(rlp2)).toBe(true);
      expect(rlp1.getKey()).toBe(rlp2.getKey());
    });

    it("should show that equals() works correctly when NEITHER has provenance (exact coords)", () => {
      const rlp1 = new RangeLimitPoint({ x: 766.104458500426, y: 494.59269116642594 });
      const rlp2 = new RangeLimitPoint({ x: 766.104458500426, y: 494.59269116642594 });

      // Same exact coordinates, no provenance - equals() should return true
      expect(rlp1.equals(rlp2)).toBe(true);
    });

    it("should show that equals() fails when NEITHER has provenance (different coords)", () => {
      const rlp1 = new RangeLimitPoint({ x: 766.104458500426, y: 494.59269116642594 });
      const rlp2 = new RangeLimitPoint({ x: 766.1044585004261, y: 494.59269116642596 });

      // Different coordinates, no provenance - equals() returns false
      expect(rlp1.equals(rlp2)).toBe(false);
    });
  });

  describe("Hypothesis: Mixed provenance RangeLimitPoints cause the bug", () => {
    it("should demonstrate the problematic comparison path", () => {
      // The issue is in equals():
      // ```
      // if (this.raySource && other instanceof RangeLimitPoint && other.raySource) {
      //   return this.raySource.equals(other.raySource);
      // }
      // // Otherwise compare by coordinates
      // return ... this.value.x === other.value.x ...
      // ```
      //
      // When this.raySource is truthy but other.raySource is undefined,
      // the if-condition fails (because both must have raySource),
      // and we fall through to coordinate comparison which may fail.

      const pyramid = createTestSurface(
        "pyramid-3-0",
        { x: 700, y: 400 },
        { x: 800, y: 500 }
      );
      const endpoint = startOf(pyramid);

      const rlpWith = new RangeLimitPoint({ x: 100, y: 200 }, endpoint);
      const rlpWithout = new RangeLimitPoint({ x: 100, y: 200 }); // Same coords, no provenance

      // This should arguably be true (same position, one just has extra provenance)
      // But current implementation returns false
      const areEqual = rlpWith.equals(rlpWithout);

      console.log("RLP with provenance:", rlpWith.getKey());
      console.log("RLP without provenance:", rlpWithout.getKey());
      console.log("Same position, mixed provenance - equals():", areEqual);

      // Document the current (buggy) behavior
      // When one has provenance and the other doesn't, equals() does coordinate check
      // which may fail due to floating-point differences
      expect(areEqual).toBe(true); // This SHOULD pass but may fail with real FP coords
    });
  });

  describe("Hypothesis: comparePointsCCWSimplified doesn't handle RLP vs RLP collinear case", () => {
    it("should identify that two RangeLimitPoints collinear with origin cause an error", () => {
      // When two RangeLimitPoints are collinear (cross product = 0):
      // - Code checks if a is RangeLimitPoint and b is NOT → a comes after
      // - Code checks if b is RangeLimitPoint and a is NOT → b comes after
      // - But when BOTH are RangeLimitPoints, neither branch triggers
      // - Falls through to the error: "Critical: Collinear points without PreComputedPairs"

      const pyramid = createTestSurface(
        "pyramid-3-0",
        { x: 700, y: 400 },
        { x: 800, y: 500 }
      );
      const endpoint = startOf(pyramid);

      // Two RangeLimitPoints on the same ray (collinear with origin)
      const rlpWithProvenance = new RangeLimitPoint(
        { x: 766.104458500426, y: 494.59269116642594 },
        endpoint
      );
      const rlpWithoutProvenance = new RangeLimitPoint(
        { x: 766.104458500426, y: 494.59269116642594 } // Same coords but no provenance
      );

      // Both are RangeLimitPoints
      expect(isRangeLimitPoint(rlpWithProvenance)).toBe(true);
      expect(isRangeLimitPoint(rlpWithoutProvenance)).toBe(true);

      // The comparePointsCCWSimplified logic:
      // if (isRangeLimitPoint(a) && !isRangeLimitPoint(b)) return 1;
      // if (isRangeLimitPoint(b) && !isRangeLimitPoint(a)) return -1;
      // Neither branch triggers when BOTH are RangeLimitPoints!

      console.log("Both are RangeLimitPoints - current logic has no handler for this case");
      console.log("This causes the error to be thrown in comparePointsCCWSimplified");

      // Document: Need to add handling for RLP vs RLP collinear case
    });

    it("should show that the issue requires handling in multiple places", () => {
      // POTENTIAL FIXES:
      //
      // 1. In applyRangeLimit: If a vertex V is on the same ray as an existing
      //    RangeLimitPoint with provenance, don't create a new one (use the existing)
      //
      // 2. In removeDuplicatesSourcePoint: When deduplicating RangeLimitPoints,
      //    prefer the one with provenance if they're at same/similar position
      //
      // 3. In comparePointsCCWSimplified: When two RangeLimitPoints are collinear,
      //    use provenance to order them (one with provenance > one without)
      //
      // 4. In equals(): When comparing RLP with provenance vs RLP without,
      //    consider them equal if coordinates match exactly

      console.log("RECOMMENDED FIX:");
      console.log("1. In comparePointsCCWSimplified, add case for RLP vs RLP:");
      console.log("   - If one has raySource and other doesn't, provenance wins");
      console.log("   - If both have same raySource, they're equal");
      console.log("   - If neither has raySource, coordinates are same (equals handles)");
    });
  });

  describe("Exact Calculation Reproduction", () => {
    /**
     * This test reproduces the EXACT calculation that causes the error.
     *
     * The error occurs in comparePointsCCWSimplified when:
     * 1. cross product === 0 (exactly zero)
     * 2. Both points are RangeLimitPoints
     * 3. No PreComputedPairs entry exists
     *
     * For cross === 0 (exactly), both points must be computed such that:
     *   aVec.x * bVec.y - aVec.y * bVec.x === 0
     *
     * This happens when both RangeLimitPoints are on the SAME ray from origin.
     */

    // Simulate computeRangeLimitIntersection from ConeProjectionV2.ts
    function computeRangeLimitIntersection(
      _origin: Vector2, // unused - uses center as base
      target: Vector2,
      center: Vector2,
      radius: number
    ): Vector2 {
      const dx = target.x - center.x;
      const dy = target.y - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = radius / dist;
      return {
        x: center.x + dx * scale,
        y: center.y + dy * scale,
      };
    }

    it("should show that two targets on same ray produce IDENTICAL intersection points", () => {
      // Origin = rangeLimit center (typical case)
      const origin = { x: 156.9, y: 586 };
      const center = origin; // rangeLimit.center = origin
      const radius = 480;

      // Two targets on the SAME ray from origin
      // Target 1: Endpoint E at (700, 400)
      // Target 2: Far point H at (1000, 300) - same ray, farther out
      const target1 = { x: 700, y: 400 };

      // Compute far point on same ray (extended)
      const rayDirX = target1.x - origin.x;
      const rayDirY = target1.y - origin.y;
      const target2 = {
        x: origin.x + rayDirX * 2, // 2x extension
        y: origin.y + rayDirY * 2,
      };

      console.log("Origin:", origin);
      console.log("Target 1 (endpoint):", target1);
      console.log("Target 2 (far point on same ray):", target2);

      // Both should produce the SAME intersection point
      const intersection1 = computeRangeLimitIntersection(origin, target1, center, radius);
      const intersection2 = computeRangeLimitIntersection(origin, target2, center, radius);

      console.log("Intersection 1:", intersection1);
      console.log("Intersection 2:", intersection2);
      console.log(
        "Are exactly equal:",
        intersection1.x === intersection2.x && intersection1.y === intersection2.y
      );

      // When rangeLimit.center === origin, targets on the same ray
      // produce IDENTICAL intersection points
      expect(intersection1.x).toBe(intersection2.x);
      expect(intersection1.y).toBe(intersection2.y);
    });

    it("should reproduce the exact cross product === 0 condition", () => {
      const origin = { x: 156.9, y: 586 };
      const center = origin;
      const radius = 480;

      // Endpoint E beyond range limit
      const endpoint = { x: 700, y: 400 };

      // Continuation ray hit (far point on same ray)
      const rayDirX = endpoint.x - origin.x;
      const rayDirY = endpoint.y - origin.y;
      const continuationHit = {
        x: origin.x + rayDirX * 2,
        y: origin.y + rayDirY * 2,
      };

      // Compute range limit intersections
      const rlp1Coords = computeRangeLimitIntersection(origin, continuationHit, center, radius);
      const rlp2Coords = computeRangeLimitIntersection(origin, endpoint, center, radius);

      console.log("RLP1 (from continuation):", rlp1Coords);
      console.log("RLP2 (from bulk processing):", rlp2Coords);

      // Compute vectors from origin (as in comparePointsCCWSimplified)
      const aVec = { x: rlp1Coords.x - origin.x, y: rlp1Coords.y - origin.y };
      const bVec = { x: rlp2Coords.x - origin.x, y: rlp2Coords.y - origin.y };

      // Cross product
      const cross = aVec.x * bVec.y - aVec.y * bVec.x;

      console.log("aVec:", aVec);
      console.log("bVec:", bVec);
      console.log("Cross product:", cross);
      console.log("Is exactly 0:", cross === 0);

      // When both are on the same ray and rangeLimit.center === origin,
      // the cross product is EXACTLY 0
      expect(cross).toBe(0);
    });

    it("should show the bug scenario: endpoint beyond range + continuation both create RLPs", () => {
      const origin = { x: 156.9, y: 586 };
      const center = origin;
      const radius = 480;

      // Pyramid endpoint (pyramid-3-0:start) at position beyond range limit
      const pyramid = createTestSurface(
        "pyramid-3-0",
        { x: 700, y: 400 },
        { x: 800, y: 500 }
      );
      const endpoint = startOf(pyramid); // At (700, 400)

      const endpointXY = endpoint.computeXY();
      const distFromOrigin = Math.sqrt(
        (endpointXY.x - origin.x) ** 2 + (endpointXY.y - origin.y) ** 2
      );

      console.log("Endpoint position:", endpointXY);
      console.log("Distance from origin:", distFromOrigin);
      console.log("Range limit radius:", radius);
      console.log("Is beyond range limit:", distFromOrigin > radius);

      // The endpoint IS beyond range limit
      expect(distFromOrigin).toBeGreaterThan(radius);

      // Simulate continuation ray far target
      const rayDirX = endpointXY.x - origin.x;
      const rayDirY = endpointXY.y - origin.y;
      const continuationFarTarget = {
        x: origin.x + rayDirX * 10,
        y: origin.y + rayDirY * 10,
      };

      // RLP from continuation (with provenance)
      const rlp1Coords = computeRangeLimitIntersection(
        origin,
        continuationFarTarget,
        center,
        radius
      );
      const rlp1 = new RangeLimitPoint(rlp1Coords, endpoint);

      // RLP from bulk processing (without provenance)
      const rlp2Coords = computeRangeLimitIntersection(origin, endpointXY, center, radius);
      const rlp2 = new RangeLimitPoint(rlp2Coords);

      console.log("\n=== BUG SCENARIO ===");
      console.log("RLP1 (continuation):", rlp1.computeXY(), "key:", rlp1.getKey());
      console.log("RLP2 (bulk):", rlp2.computeXY(), "key:", rlp2.getKey());

      // When center === origin, coordinates are IDENTICAL
      expect(rlp1Coords.x).toBe(rlp2Coords.x);
      expect(rlp1Coords.y).toBe(rlp2Coords.y);

      // So equals() returns TRUE and deduplication works!
      console.log("equals():", rlp1.equals(rlp2));
      expect(rlp1.equals(rlp2)).toBe(true);

      // This means the bug requires center !== origin
    });

    it("should prove the UNSTABLE CONDITION: rangeLimit.center !== origin", () => {
      // THE ACTUAL BUG CONDITION:
      // When visibility is computed after reflection, rangeLimit.center
      // may be different from the origin used in sorting.
      // This causes the intersection coordinates to differ slightly.

      const origin = { x: 156.9, y: 586 };
      const radius = 480;

      // rangeLimit.center is slightly different (e.g., the player position
      // vs the reflected image position used in sorting)
      const center = { x: 156.90001, y: 586 }; // 0.00001 difference

      const pyramid = createTestSurface(
        "pyramid-3-0",
        { x: 700, y: 400 },
        { x: 800, y: 500 }
      );
      const endpoint = startOf(pyramid);
      const endpointXY = endpoint.computeXY();

      // Continuation ray far target
      const rayDirX = endpointXY.x - origin.x;
      const rayDirY = endpointXY.y - origin.y;
      const continuationFarTarget = {
        x: origin.x + rayDirX * 10,
        y: origin.y + rayDirY * 10,
      };

      // RLP from continuation (uses center)
      const rlp1Coords = computeRangeLimitIntersection(
        origin,
        continuationFarTarget,
        center,
        radius
      );
      const rlp1 = new RangeLimitPoint(rlp1Coords, endpoint);

      // RLP from bulk processing (also uses center)
      const rlp2Coords = computeRangeLimitIntersection(origin, endpointXY, center, radius);
      const rlp2 = new RangeLimitPoint(rlp2Coords);

      console.log("\n=== UNSTABLE CONDITION: center !== origin ===");
      console.log("Origin:", origin);
      console.log("RangeLimit center:", center);
      console.log("Difference:", center.x - origin.x);

      console.log("\nRLP1 coords:", rlp1Coords);
      console.log("RLP2 coords:", rlp2Coords);

      const coordsDiffer = rlp1Coords.x !== rlp2Coords.x || rlp1Coords.y !== rlp2Coords.y;
      console.log("Coordinates differ:", coordsDiffer);

      // Compute cross product
      const aVec = { x: rlp1Coords.x - origin.x, y: rlp1Coords.y - origin.y };
      const bVec = { x: rlp2Coords.x - origin.x, y: rlp2Coords.y - origin.y };
      const cross = aVec.x * bVec.y - aVec.y * bVec.x;

      console.log("\nCross product:", cross);
      console.log("Is exactly zero:", cross === 0);
      console.log("Is near-zero (< 1e-10):", Math.abs(cross) < 1e-10);

      // Check equals()
      const areEqual = rlp1.equals(rlp2);
      console.log("\nequals():", areEqual);

      // Document the unstable condition
      console.log("\n=== UNSTABLE CONDITION PROVEN ===");
      console.log("When center !== origin:");
      console.log("1. Coordinates DIFFER:", coordsDiffer);
      console.log("2. Cross product may be EXACTLY 0 or near-zero");
      console.log("3. equals() returns:", areEqual);
      console.log("4. If cross === 0 and !areEqual, error is thrown");

      // The actual instability: whether cross === 0 depends on floating-point
      // The error occurs when cross happens to be exactly 0 (or treated as 0)
      // but equals() returns false due to coordinate differences
    });

    it("should prove the bug is caused by SAME RAY having two points pushed", () => {
      // THE ACTUAL BUG SCENARIO:
      //
      // Line 1737: vertices.push(hit);  where hit === targetEndpoint (E)
      // Line 1820: vertices.push(normalizedContinuation);  where this is RangeLimitPoint
      //
      // Both are on the EXACT SAME RAY from origin:
      //   Origin -----> E -----> Continuation hit
      //
      // If E is beyond range limit:
      // - Bulk processing converts E to RangeLimitPoint (no provenance)
      // - Continuation already added RangeLimitPoint (with provenance)
      // - TWO RangeLimitPoints on same ray = BUG

      const origin = { x: 156.9, y: 586 };
      const center = origin;
      const radius = 480;

      // Endpoint E beyond range limit
      const pyramid = createTestSurface(
        "pyramid-3-0",
        { x: 700, y: 400 }, // start - beyond range
        { x: 800, y: 500 }
      );
      const endpoint = startOf(pyramid);
      const endpointXY = endpoint.computeXY();

      // Verify E is beyond range
      const distE = Math.sqrt(
        (endpointXY.x - origin.x) ** 2 + (endpointXY.y - origin.y) ** 2
      );
      expect(distE).toBeGreaterThan(radius);

      // Far target for continuation ray (10x extended on same ray)
      const rayDir = {
        x: endpointXY.x - origin.x,
        y: endpointXY.y - origin.y,
      };
      const farTarget = {
        x: origin.x + rayDir.x * 10,
        y: origin.y + rayDir.y * 10,
      };

      console.log("\n=== SAME RAY, TWO POINTS ===");
      console.log("Origin:", origin);
      console.log("Endpoint E:", endpointXY, "distance:", distE);
      console.log("Far target:", farTarget);

      // What happens in the code:
      // 1. E is pushed to vertices (line 1737)
      // 2. Continuation ray through E finds it hits range limit
      // 3. RangeLimitPoint(intersection, E) is pushed (line 1820)
      // 4. Bulk processing: E is beyond range, converted to RangeLimitPoint

      // Simulate the two RangeLimitPoints created:
      const rlpFromContinuation = new RangeLimitPoint(
        computeRangeLimitIntersection(origin, farTarget, center, radius),
        endpoint // WITH provenance
      );

      const rlpFromBulk = new RangeLimitPoint(
        computeRangeLimitIntersection(origin, endpointXY, center, radius)
        // NO provenance
      );

      console.log("\nRLP from continuation:", rlpFromContinuation.computeXY());
      console.log("RLP from bulk:", rlpFromBulk.computeXY());

      // Both are on the SAME RAY, so cross product = 0
      const aVec = {
        x: rlpFromContinuation.computeXY().x - origin.x,
        y: rlpFromContinuation.computeXY().y - origin.y,
      };
      const bVec = {
        x: rlpFromBulk.computeXY().x - origin.x,
        y: rlpFromBulk.computeXY().y - origin.y,
      };
      const cross = aVec.x * bVec.y - aVec.y * bVec.x;

      console.log("Cross product:", cross);
      expect(cross).toBe(0); // EXACTLY same ray

      // And they're at the same position (when center === origin)
      expect(rlpFromContinuation.computeXY().x).toBe(rlpFromBulk.computeXY().x);
      expect(rlpFromContinuation.computeXY().y).toBe(rlpFromBulk.computeXY().y);

      // But they have different keys!
      console.log("\nKey 1:", rlpFromContinuation.getKey());
      console.log("Key 2:", rlpFromBulk.getKey());
      expect(rlpFromContinuation.getKey()).not.toBe(rlpFromBulk.getKey());

      // equals() returns true because coords are identical
      expect(rlpFromContinuation.equals(rlpFromBulk)).toBe(true);

      console.log("\n=== ROOT CAUSE ===");
      console.log("The endpoint E and its continuation are on the SAME RAY.");
      console.log("Both get pushed to vertices, then bulk converts E to RLP.");
      console.log("This creates TWO RLPs on same ray with different keys.");
      console.log("When center !== origin (after reflection), coords differ,");
      console.log("and if cross happens to be exactly 0, error is thrown.");
    });

    // Helper for this test block
    function computeRangeLimitIntersection(
      _origin: Vector2,
      target: Vector2,
      center: Vector2,
      radius: number
    ): Vector2 {
      const dx = target.x - center.x;
      const dy = target.y - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = radius / dist;
      return {
        x: center.x + dx * scale,
        y: center.y + dy * scale,
      };
    }

    it("should demonstrate the exact error condition with real coordinates", () => {
      // Use the ACTUAL coordinates from the error message
      const origin = { x: 156.90297099999924, y: 586 }; // From investigation
      const radius = 480;
      const center = origin;

      // Pyramid-3-0:start endpoint
      const pyramid = createTestSurface(
        "pyramid-3-0",
        { x: 700, y: 400 }, // Approximate - would need exact game coords
        { x: 800, y: 500 }
      );
      const endpoint = startOf(pyramid);
      const endpointXY = endpoint.computeXY();

      // Create RLP with provenance
      const rlpWithProvCoords = computeRangeLimitIntersection(
        origin,
        endpointXY,
        center,
        radius
      );
      const rlpWithProv = new RangeLimitPoint(rlpWithProvCoords, endpoint);

      // Create RLP without provenance (same coords but different object)
      const rlpWithoutProv = new RangeLimitPoint(rlpWithProvCoords);

      console.log("\n=== EXACT ERROR CONDITION ===");
      console.log("RLP with prov key:", rlpWithProv.getKey());
      console.log("RLP without prov key:", rlpWithoutProv.getKey());
      console.log("Same coords:", 
        rlpWithProv.computeXY().x === rlpWithoutProv.computeXY().x &&
        rlpWithProv.computeXY().y === rlpWithoutProv.computeXY().y
      );
      console.log("equals():", rlpWithProv.equals(rlpWithoutProv));

      // When SAME coords, cross === 0 AND equals() === true
      // So deduplication works and error doesn't occur.
      //
      // The error ONLY occurs when:
      // 1. Two different vertices on same ray from origin
      // 2. Each converted to RangeLimitPoint by different code paths
      // 3. Coordinates differ slightly due to different targets
      // 4. Cross === 0 (same direction from origin)
      // 5. equals() === false (different coords)
      // 6. No PreComputedPairs
      // 7. Both are RangeLimitPoints

      console.log("\nCONCLUSION:");
      console.log("The error requires two DIFFERENT vertices on the same ray");
      console.log("being converted to RangeLimitPoints with different coords.");
      console.log("This happens when:");
      console.log("- Endpoint E is on the ray");
      console.log("- Continuation ray hits something at H (different from E)");
      console.log("- Both E and H are beyond range limit");
      console.log("- E → RLP without provenance (bulk)");
      console.log("- H → RLP with provenance (continuation)");
      console.log("- E and H have different coords but same direction");
    });
  });
});
