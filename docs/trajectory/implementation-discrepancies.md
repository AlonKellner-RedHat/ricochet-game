# Implementation Discrepancies Analysis

This document maps each first principle to its current implementation and categorizes each as:
- **Aligned**: Principle naturally emerges from the architecture
- **Patched**: Principle enforced via conditional logic (potential fragility)
- **Violated**: Principle not currently guaranteed

## Implementation File Overview

| File | Lines | Responsibility | Complexity |
|------|-------|----------------|------------|
| `RenderDeriver.ts` | 783 | Transform path to render segments | **HIGH** - Multiple nested conditionals |
| `PathBuilder.ts` | 1237 | Path calculation + tracePhysicalPath | **MEDIUM** - Two calculation modes |
| `BypassEvaluator.ts` | 367 | Filter surfaces based on position | **LOW** - Clear algorithm |

---

## Principle-by-Principle Analysis

### Category A: Path Existence

| Principle | Status | Implementation | Evidence |
|-----------|--------|----------------|----------|
| A1: One actual path | **Patched** | `tracePhysicalPath()` returns one path, but `deriveRender()` can draw multiple red paths | `RenderDeriver.ts:254-327` draws both actual (yellow) and planned (red) for off-segment |
| A2: One planned path | **Patched** | `calculatePlannedPathFromPoint()` creates separate path during render | `RenderDeriver.ts:618-729` - calculated at render time, not path time |
| A3: Shared prefix | **Aligned** | Both paths use same initial direction from images | `PathBuilder.ts:706-746` |
| A4: Single divergence | **Patched** | `firstDivergedIndex` tracked, but render logic can create multiple | See "Two Red Paths" analysis below |

### Category B: Path Calculation

| Principle | Status | Implementation | Evidence |
|-----------|--------|----------------|----------|
| B1: Forward physics | **Aligned** | `raycastForward()` used consistently | `PathBuilder.ts:567`, `ValidityChecker.ts` |
| B2: Bidirectional images | **Aligned** | Images built via `buildForwardImages/buildBackwardImages` | `ImageCache.ts` |
| B3: Bypass affects direction | **Patched** | `BypassEvaluator` filters, then used in both paths | Some logic duplicated in `tracePhysicalPath` |
| B4: Obstructions cause divergence | **Patched** | Special case at `PathBuilder.ts:924-928` | Edge case logic, not inherent |
| B5: Planned ignores obstructions | **Violated** | `deriveRender()` tries to compensate, creates complexity | `RenderDeriver.ts:330-415` |
| B6: First segment aligned | **Patched** | Special `isFirstSegment` parameter | `PathBuilder.ts:1099-1157` |
| B7: Same initial direction | **Aligned** | Both use `getPlayerImageForSurface(0)` → `getCursorImageForSurface(0)` | Same function used |
| B8: Off-segment still reflects | **Patched** | `plannedLineHit` logic in `tracePhysicalPath` | `PathBuilder.ts:773-809` |

### Category C: Visualization

| Principle | Status | Implementation | Evidence |
|-----------|--------|----------------|----------|
| C1: Green = aligned | **Aligned** | Simple check `segment.planAlignment !== "diverged"` | `RenderDeriver.ts:220-228` |
| C2: Red = diverged | **Patched** | Multiple code paths create red segments | See complexity analysis |
| C3: Yellow = actual | **Patched** | Multiple conditions check for yellow | `RenderDeriver.ts:183-193` |
| C4: Solid = before cursor | **Aligned** | `isCursorSegment` check | Simple |
| C5: Dashed = after cursor | **Aligned** | `isAfterCursor` check | Simple |
| C6: Red only when divergence | **Patched** | `planCompletedBeforeCursor` logic | `RenderDeriver.ts:183-192` |
| C7: Solid path exists | **Patched** | `cursorNotOnPath` special case | `RenderDeriver.ts:421-466` |
| C8: Future dashed | **Patched** | `needsForwardProjection` logic | `RenderDeriver.ts:471-511` |
| C9: No red after completion | **Patched** | `planCompletedBeforeCursor` check | Complex condition |
| C10: Aligned green | **Aligned** | Natural from alignment enum | Simple |
| C11: After planned green | **Patched** | `treatAsAlignedAfterCursor` logic | `RenderDeriver.ts:191` |

### Category D: Physics

| Principle | Status | Implementation | Evidence |
|-----------|--------|----------------|----------|
| D1: On-segment reflection | **Aligned** | `raycastForward` only hits segments | Built into raycast |
| D2: Projection physics | **Aligned** | `calculatePhysicsProjection()` | Clear function |
| D3: Arrow = actual | **Aligned** | Arrow uses path points directly | Game integration |
| D4: No reflect-through | **Aligned** | `canReflectFrom()` checks direction | Surface method |
| D5: Planned projection physics | **Patched** | Added in `calculatePlannedPathFromPoint` | `RenderDeriver.ts:714-726` |
| D6: Red path equivalence | **Violated** | Not enforced - just tested | No runtime check |

### Category E: Bypass

| Principle | Status | Implementation | Evidence |
|-----------|--------|----------------|----------|
| E1: Cursor wrong side | **Aligned** | `checkCursorSide()` | Clear function |
| E2: Player wrong side | **Aligned** | `checkPlayerSide()` | Clear function |
| E3: Chain breaks | **Patched** | Partial - `reevaluateLastSurface()` | Recursive, complex |
| E4: Dynamic bypass | **Aligned** | Called on each frame | By design |
| E5: Visual indication | **Aligned** | `bypassedSurfaces` in result | Tracked |
| E6: Only side causes bypass | **Aligned** | Obstruction check removed | `BypassEvaluator.ts:213-220` |
| E7: Solid unaffected | **Violated** | Render-time calculation | Not path-time |

### Category F: Unity

| Principle | Status | Implementation | Evidence |
|-----------|--------|----------------|----------|
| F1: Arrow = viz | **Patched** | Same data used, but transformations differ | Indirect |
| F2: Single source | **Violated** | Multiple path calculations | See "Root Causes" |
| F3: Planned only planned | **Patched** | `activeSurfaceIds` check | `RenderDeriver.ts:112-117` |

---

## Critical Issues

### Issue 1: Two Red Paths Splitting at Divergence

**Location**: `RenderDeriver.ts:254-327` (off-segment handling)

**Problem**: When there's an off-segment hit, the code draws:
1. Dashed yellow (actual straight path) - lines 268-284
2. Red path (planned reflection) - lines 287-326

These are TWO separate code paths that both draw from the same divergence point.
If any edge case causes both to activate differently, we get TWO red paths.

**Root Cause**: The render deriver is doing path calculation during rendering.

### Issue 2: Planned Path Calculated at Render Time

**Location**: `RenderDeriver.ts:618-729`

**Problem**: `calculatePlannedPathFromPoint()` is called during rendering, not during path calculation.
This means:
1. The "planned path" is not the same as the one from the engine
2. Edge cases can cause mismatches
3. The function duplicates logic from `PathBuilder`

**Root Cause**: The architecture doesn't have a separate "planned path" concept.

### Issue 3: Multiple Divergence Detection Points

**Locations**:
- `PathBuilder.ts:992` - `firstDivergedIndex` in UnifiedPath
- `RenderDeriver.ts:121-122` - `divergeBeforeCursor` check
- `RenderDeriver.ts:140-145` - `isOffSegmentDivergence` check
- `RenderDeriver.ts:183-189` - `planCompletedBeforeCursor` check

**Problem**: Divergence is detected in FOUR different ways.
Each is a separate patch for a specific edge case.

**Root Cause**: Divergence should be a single, well-defined point.

### Issue 4: Color Logic Spread Across Function

**Locations**:
- `RenderDeriver.ts:200-236` - Main segment loop color
- `RenderDeriver.ts:293-325` - Off-segment path color
- `RenderDeriver.ts:347-397` - Planned path from divergence color
- `RenderDeriver.ts:432-463` - Cursor not on path color
- `RenderDeriver.ts:491-509` - Forward projection color

**Problem**: Color determination happens in 5 different places.
Each has slightly different logic, leading to inconsistencies.

**Root Cause**: Color should be a pure function of segment state.

---

## Complexity Metrics

### RenderDeriver.ts

| Metric | Value | Assessment |
|--------|-------|------------|
| Lines of code | 783 | Large for a "pure function" |
| if/else branches | 47 | Extremely high |
| Nested depth | 5 | Hard to follow |
| Local helper functions | 5 | Good |
| External dependencies | 6 | Reasonable |

### PathBuilder.ts

| Metric | Value | Assessment |
|--------|-------|------------|
| Lines of code | 1237 | Very large |
| if/else branches | 62 | High |
| Nested depth | 4 | Manageable |
| Exported functions | 9 | Many responsibilities |
| Internal state tracking | 8 variables | Complex state machine |

---

## Pattern: "Patched" Implementations

The "patched" implementations share a common pattern:

```
if (specialCase1) {
  // Handle edge case 1
} else if (specialCase2) {
  // Handle edge case 2
} else if (specialCase3) {
  // Handle edge case 3
} else {
  // Default behavior
}
```

Each time a bug is found, a new special case is added.
This creates fragile, hard-to-understand code.

**Better Pattern**:
```
const pathType = classifyPath(input);  // Exhaustive classification
const renderer = RENDERERS[pathType]; // Lookup table
return renderer(input);               // Dispatch
```

---

## Architectural Tension Summary

| Principle | Architecture Expects | Current Implementation |
|-----------|---------------------|------------------------|
| One actual path | Calculated once | Multiple calculations |
| One planned path | Calculated once | Calculated at render time |
| Single divergence | Property of path | Detected multiple times |
| Color from state | Pure function | Conditional soup |
| Arrow = visualization | Same data | Different transforms |

The fundamental tension is:
**First principles expect TWO independent paths, compared afterward.**
**Current architecture has ONE path with inline annotations, then reconstructs the second.**

This reconstruction is where all the edge cases live.

