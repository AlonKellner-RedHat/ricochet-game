# Path Invariant Investigation Report

This report summarizes the findings from investigating path invariant failures across three categories.

## Executive Summary

Three root cause bugs were identified in the invariant test implementation, not in the production code:

| Category | Bug Location | Root Cause |
|----------|--------------|------------|
| A | `physical-path-invariant.ts` | Empty sequences cause false divergence; maxReflections resets |
| B | `planned-path-invariant.ts` | Missing reflection through `divergenceSurface.planned` |
| C | `physical-path-invariant.ts` | Same as A + duplicate surface detection |

---

## Category A: Physical-Only Failures in Empty Sequences

**Reproduction Files:**
- `tests/invariants/hypotheses/physical-path-empty-scene.test.ts`

**Target Case:** `parallel-mirrors/empty` at player=(345,205), cursor=(109,205)

### Root Cause

1. **False Divergence in Empty Sequences**: With zero planned surfaces, `createOrderedPlannedStrategy` returns no hits. When the physical strategy finds a hit (e.g., the left mirror), this is treated as "divergence" because physical and planned disagree.

2. **maxReflections Reset**: After divergence, the joint calculation traces `physicalDivergent` with a fresh `maxReflections=10`. The independent trace has only ONE maxReflections budget.

### Evidence

```
Joint calculation:
  merged: 1 segment (before divergence)
  physicalDivergent: 10 segments (fresh maxReflections=10)
  Total: 11 segments

Independent trace:
  Total: 10 segments (single maxReflections=10 budget)
```

### Recommended Fix

**Option A:** Skip physical-path-invariant for empty sequences (no planned surfaces), since "divergence" is semantically meaningless.

**Option B:** Make the independent trace aware of divergence:
1. Trace to divergence point with limited reflections
2. Continue from divergence with fresh maxReflections

---

## Category B: Planned-Only Failures

**Reproduction Files:**
- `tests/invariants/hypotheses/planned-path-divergence.test.ts`

**Target Case:** `wall-obstacle/h1-0` at player=(345,515), cursor=(581,329)

### Root Cause

**Missing reflection through `divergenceSurface.planned`**: The joint calculation reflects through `divergenceSurface.planned` before tracing `plannedToCursor`:

```typescript
// In FullTrajectoryCalculator.ts:
if (mergedResult.divergenceSurface?.planned) {
  propagatorForPlanned = propagatorAtDivergence.reflectThrough(
    mergedResult.divergenceSurface.planned
  );
}
```

The invariant doesn't replicate this behavior. It only reflects through merged segments `[0..n-2]`, missing the crucial reflection through the planned divergence surface.

### Evidence

After reflecting cursor through h1-0:
- Target becomes (581, 329) - exactly the cursor position
- Cursor IS on the new ray segment
- `stopAtCursor` triggers correctly

Without reflecting:
- Target is (581, 271)
- Cursor is NOT on this ray segment
- Trace continues to h1-0, creating an extra segment

```
Expected (joint calc): 2 segments
  [0]: player -> wall
  [1]: wall -> cursor (directly)

Actual (invariant): 3 segments
  [0]: player -> wall
  [1]: wall -> h1-0
  [2]: h1-0 -> cursor
```

### Recommended Fix

1. Use `calculateMergedPath` directly instead of `calculateFullTrajectory`
2. Access `divergenceSurface.planned` from the merged result
3. Reflect propagator through `divergenceSurface.planned` if it exists
4. Then trace with `createOrderedPlannedStrategy`

---

## Category C: Heavy Physical + Reflective Planned Surfaces

**Reproduction Files:**
- `tests/invariants/hypotheses/physical-path-reflective-planned.test.ts`

**Target Case:** `pyramid/pyramid-1` at player=(345,143), cursor=(1053,81)

### Root Cause

**Shares root cause with Category A**: The maxReflections reset at divergence causes the joint calculation to produce more segments than the independent trace.

**Additional Issue - Duplicate Surfaces**: The invariant uses `[...allSurfaces, ...plannedSurfaces]`, but planned surfaces may already be included in `allChains`. This creates duplicates:

```
allSurfaces count: 8
plannedSurfaces count: 1
combinedSurfaces count: 9
Unique surface IDs: 8  (pyramid-1-0 appears twice)
```

### Evidence

```
Joint calculation:
  merged: 1 segment
  physicalDivergent: 2 segments
  Total: 3 segments

Independent trace:
  Total: 1 segment (stops at divergence)
```

### Recommended Fix

1. Same fixes as Category A (handle divergence properly)
2. Deduplicate surfaces before creating the strategy:
   ```typescript
   const surfaceIds = new Set(allSurfaces.map(s => s.id));
   const uniquePlanned = plannedSurfaces.filter(s => !surfaceIds.has(s.id));
   const combinedSurfaces = [...allSurfaces, ...uniquePlanned];
   ```

---

## Summary of Bugs and Fixes

### Bug #1: maxReflections Reset (Categories A & C)

**Location:** `tests/invariants/invariants/physical-path-invariant.ts`

**Issue:** The invariant traces independently with `maxReflections=10`, but the joint calculation gives `physicalDivergent` a fresh `maxReflections=10` after using some reflections in `merged`.

**Fix:** Either:
- Skip invariant for cases where divergence causes different budgets
- Trace to divergence, then continue with fresh budget from divergence point

### Bug #2: Missing divergenceSurface.planned Reflection (Category B)

**Location:** `tests/invariants/invariants/planned-path-invariant.ts`

**Issue:** The invariant doesn't reflect through `divergenceSurface.planned`, causing different ray directions.

**Fix:** 
- Get `divergenceSurface` from `calculateMergedPath` result
- Reflect through `divergenceSurface.planned` if it exists before tracing

### Bug #3: Duplicate Surfaces (Category C)

**Location:** `tests/invariants/invariants/physical-path-invariant.ts`

**Issue:** Planned surfaces appear twice when using `[...allSurfaces, ...plannedSurfaces]`.

**Fix:** Deduplicate surfaces by ID before creating the strategy.

---

## Test Files Created

1. `tests/invariants/hypotheses/physical-path-empty-scene.test.ts` (7 tests)
2. `tests/invariants/hypotheses/planned-path-divergence.test.ts` (7 tests)
3. `tests/invariants/hypotheses/physical-path-reflective-planned.test.ts` (5 tests)

All 19 tests pass and prove the identified root causes.

---

## Next Steps

1. **Review this report** to confirm the analysis is correct
2. **Choose fix approach** for each bug (there are multiple options)
3. **Implement fixes** in the invariant files
4. **Re-run invariant tests** to verify fixes resolve failures
