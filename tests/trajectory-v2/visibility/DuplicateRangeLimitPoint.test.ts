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
});
