# Invariant Violation Investigation Report

## Executive Summary

This report documents the investigation of invariant violations in the trajectory system. Through hypothesis testing and root cause analysis, we identified **two distinct bugs** and **one invariant design issue**:

| Issue | Type | Impact | Severity |
|-------|------|--------|----------|
| Issue 1 & 2 | Code Bug | Arrow path includes extra waypoints | High |
| Issue 3 | Invariant Design | False positives in test | Medium |

---

## Test Coverage

**Investigation Test File:** `tests/trajectory-v2/integration/InvariantViolationInvestigation.test.ts`

All hypothesis tests pass and successfully reproduce/prove the root causes.

---

## Issue 1 & 2: physicalHitWall Direction Bug

### Summary

The `FullTrajectoryCalculator.calculateFullTrajectory()` function uses the **wrong direction** when checking if a surface can reflect. This causes the arrow path to include extra waypoints that a pure physical trace would not have.

### Root Cause

**Location:** `src/trajectory-v2/engine/FullTrajectoryCalculator.ts`, lines 119-124

```typescript
const physicalHitWall =
  mergedResult.divergenceSurface?.physical &&
  !mergedResult.divergenceSurface.physical.canReflectFrom({
    x: cursor.x - player.x,  // BUG: Uses initial direction
    y: cursor.y - player.y,
  });
```

The bug uses `cursor - player` as the ray direction, but at the divergence point, the ray may have **reflected multiple times**. The actual ray direction should come from `propagatorAtDivergence.getRay()`.

### Proof from Investigation Tests

```
=== Issue 1: Direction Analysis ===
Player: { x: 1053, y: 81 }
Cursor: { x: 1106, y: 666 }
Initial direction (cursor - player): { x: 53, y: 585 }   // Going RIGHT
Ray direction at divergence: { x: -1559, y: 585 }         // Going LEFT
Directions have same sign? false

=== Issue 1: canReflectFrom Analysis ===
Physical surface: mirror-right-0
Surface normal: { x: -1, y: 0 }
canReflectFrom(initial): true      // WRONG
canReflectFrom(rayDirection): false // CORRECT

*** BUG CONFIRMED ***
```

### Impact

When `canReflectFrom(initial)` returns `true` but `canReflectFrom(rayDirection)` returns `false`:
- `physicalHitWall` is incorrectly set to `false`
- `physicalDivergent` segments are calculated when they shouldn't be
- Arrow path includes 4 extra waypoints

```
Arrow waypoints (filtered): 6
  [0]: (1053.0, 81.0)
  [1]: (600.0, 251.0)
  [2]: (1280.0, 506.1)  ← Extra
  [3]: (710.1, 720.0)   ← Extra
  [4]: (0.0, 453.5)     ← Extra
  [5]: (300.0, 341.0)   ← Extra

Physical waypoints: 2
  [0]: (1053.0, 81.0)
  [1]: (600.0, 251.0)
Physical termination: wall
```

### Affected Scenes

All scenes with the `arrow-path-independence` invariant failing:
- `parallel-mirrors/mirror-left` (41 violations)
- `parallel-mirrors/mirror-right` (3 violations)
- `pyramid/pyramid-1,2,3,4` (21-35 violations each)
- `v-shape-60/v60-left,v60-right,v60-both`
- `v-shape-90/v90-both` (8 violations)
- `full-demo/*` (15-118 violations)
- `surface-behind-surface/back-only` (12 violations)
- `near-parallel/p1-only` (2 violations)

**Total: ~460 violations**

### Suggested Fix

Replace the incorrect direction with the actual ray direction:

```typescript
// Get the actual ray direction at divergence
const ray = propagatorAtDivergence.getRay();
const rayDirection = {
  x: ray.target.x - ray.source.x,
  y: ray.target.y - ray.source.y,
};

const physicalHitWall =
  mergedResult.divergenceSurface?.physical &&
  !mergedResult.divergenceSurface.physical.canReflectFrom(rayDirection);
```

---

## Issue 3: merged-equals-planned-prefix Invariant Design Issue

### Summary

The `merged-equals-planned-prefix` invariant has a **conceptual design flaw**. It compares:
1. Merged path's planned surface hits (calculated incrementally)
2. Pure planned trace waypoints (with cursor pre-reflected through ALL surfaces)

These use **different ray directions** and therefore cannot be directly compared.

### Root Cause

**Location:** `tests/invariants/invariants/merged-equals-planned-prefix.ts`

The pure planned trace pre-reflects the cursor through **all** planned surfaces at once:

```typescript
let preReflectedCursor = cursor;
for (let i = plannedSurfaces.length - 1; i >= 0; i--) {
  const surface = plannedSurfaces[i]!;
  preReflectedCursor = reflectPointThroughLine(preReflectedCursor, ...);
}
```

But the merged path checks surfaces **one at a time**, with the ray being reflected through each surface as it's hit.

### Proof from Investigation Tests

```
=== Issue 3: Root Cause Analysis ===
Reflecting cursor through planned surfaces:
  Through v90-1: (581.0,205.0) -> (595.0,191.0)
  Through v90-0: (595.0,191.0) -> (699.0,295.0)

Cursor reflected through first surface only: { x: 685, y: 309 }
Ray direction (single reflection): { x: -132, y: 166 }
Ray direction (double reflection): { x: -118, y: 152 }

*** ROOT CAUSE IDENTIFIED ***
The pure planned trace pre-reflects cursor through ALL planned surfaces
But the merged path checks surfaces one at a time
This causes different ray directions and different on-segment hits
```

### Impact

When multiple planned surfaces are in the sequence:
- The pure planned trace has a different initial ray direction
- It may miss surfaces that the merged path hits on-segment
- Pure planned trace goes off-screen (-5315, 8042) while merged hits v90-1 at (693, 303)

### Affected Scenes

Only scenes with **multiple** planned surfaces:
- `v-shape-90/v90-both` (58 violations)
- `v-shape-60/v60-both` (58 violations)
- `v-shape-120/chain1-both` (36 violations)
- `parallel-mirrors/mirror-left` (17 violations)
- `parallel-mirrors/mirror-right` (13 violations)

**Total: ~240 violations**

### Suggested Fix Options

**Option A: Redesign the invariant**
Only compare the first planned surface hit, not all of them. The comparison should be:
- Merged: hits surface S at point P
- Pure planned (reflecting through S only): also hits S at point P

**Option B: Remove the invariant for multiple surfaces**
The invariant is only valid for single-surface sequences where the pre-reflection matches the merged path's behavior.

**Option C: Accept that this invariant doesn't hold for multiple surfaces**
Document that the merged path and pure planned path are fundamentally different when multiple surfaces are involved, and skip the invariant for multi-surface sequences.

---

## Violation Matrix

| Scene | Sequence | arrow-path-independence | merged-equals-planned-prefix |
|-------|----------|------------------------|------------------------------|
| parallel-mirrors | mirror-left | 41 | 17 |
| parallel-mirrors | mirror-right | 3 | 13 |
| v-shape-90 | v90-both | 8 | 58 |
| v-shape-60 | v60-left | 5 | 0 |
| v-shape-60 | v60-right | 7 | 0 |
| v-shape-60 | v60-both | 5 | 58 |
| pyramid | pyramid-1 | 21 | 0 |
| pyramid | pyramid-2 | 29 | 0 |
| pyramid | pyramid-3 | 35 | 0 |
| pyramid | pyramid-4 | 31 | 0 |
| v-shape-120 | chain1-both | 0 | 36 |
| v-shape-60-demo | chain3-left-only | 3 | 0 |
| v-shape-60-demo | chain3-right-only | 6 | 0 |
| full-demo | empty | 15 | 0 |
| full-demo | chain1-left-only | 42 | 0 |
| full-demo | chain2-left-only | 84 | 0 |
| full-demo | chain3-left-only | 118 | 0 |
| surface-behind-surface | back-only | 12 | 0 |
| near-parallel | p1-only | 2 | 0 |

---

## Recommendations

### Immediate Actions

1. **Fix Issue 1 & 2**: Update `FullTrajectoryCalculator.ts` to use the correct ray direction
2. **Review Issue 3**: Decide on the appropriate fix for the invariant

### Testing

After fixing Issue 1 & 2:
- Re-run invariant tests
- Expect ~460 `arrow-path-independence` violations to be resolved
- The ~240 `merged-equals-planned-prefix` violations will remain until Issue 3 is addressed

### Code Quality

The investigation tests in `InvariantViolationInvestigation.test.ts` should be kept as regression tests to ensure these bugs don't recur.

---

## Appendix: Investigation Test Output

Full test output is available by running:

```bash
npx vitest run tests/trajectory-v2/integration/InvariantViolationInvestigation.test.ts --reporter=verbose
```

All 9 investigation tests pass, confirming the root cause analysis.
