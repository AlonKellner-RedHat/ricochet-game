# Root Cause Analysis: Architectural Tensions

This document identifies the fundamental architectural decisions that cause the proliferation
of edge cases, patches, and first principle violations.

## Executive Summary

The current implementation attempts to solve a **two-path problem** with a **one-path solution**.

First principles clearly state:
- There is ONE actual path (physics-based)
- There is ONE planned path (image-based)
- They share a common prefix
- They may diverge at exactly one point

The current architecture:
- Calculates ONE "unified path" with inline alignment annotations
- Reconstructs the "planned path" at render time
- Detects divergence in multiple ways at multiple times

This mismatch causes every edge case to require patching.

---

## Root Cause 1: Unified Path with Inline Annotations

### The Design Decision

`tracePhysicalPath()` in `PathBuilder.ts` was designed to:
1. Calculate the actual path using forward physics
2. Annotate each segment with its "alignment" to the plan
3. Return a single `UnifiedPath` structure

### Why It Seemed Like a Good Idea

- Avoids calculating two paths and comparing them
- Annotations are determined during traversal
- Single source of truth (in theory)

### Why It Causes Problems

The inline annotation approach conflates two distinct concepts:

| Concept | Actual Path | Planned Path |
|---------|-------------|--------------|
| Direction | From images | From images |
| Hits | Forward physics (segments) | Extended lines (any point) |
| Reflections | Only on-segment | Always (off-segment too) |
| Obstructions | Stop/block | Ignore |

When these are calculated together, the code must constantly ask:
"Am I in actual mode or planned mode?"

This question is answered with conditionals like:
- `if (isOffSegmentDivergence)`
- `if (divergeBeforeCursor && !hasOffSegmentDivergence)`
- `if (planCompletedBeforeCursor)`

Each conditional is a patch for the conflation problem.

### Evidence

```typescript
// PathBuilder.ts:773-809 - "plannedLineHit" logic
// The code checks if the planned line (not segment) is hit,
// then overrides the physical hit with the planned intersection.
// This is the unified path trying to be BOTH paths at once.
```

---

## Root Cause 2: Render-Time Path Reconstruction

### The Design Decision

When the unified path has diverged, `RenderDeriver.ts` calls `calculatePlannedPathFromPoint()`
to calculate the planned path continuation.

### Why It Seemed Like a Good Idea

- The unified path already exists
- Just need to "fill in" the planned continuation
- Avoids duplicate calculation (in theory)

### Why It Causes Problems

The planned path is NOT the same as "the unified path from divergence point."
It's a completely different calculation:
- Uses different images (cursor images from divergence point)
- Ignores ALL surfaces except planned ones
- Extends planned surfaces to infinite lines

By calculating this at render time:
1. The planned path is calculated after the fact
2. It's not validated against first principles during path calculation
3. Render logic becomes path logic (wrong responsibility)
4. Edge cases in planned path calculation become edge cases in rendering

### Evidence

```typescript
// RenderDeriver.ts:618-729 - calculatePlannedPathFromPoint()
// This is a full path calculation inside a "render deriver"
// It uses buildBackwardImages, rayLineIntersect, reflectDirection
// All of these belong in PathBuilder, not RenderDeriver
```

---

## Root Cause 3: Multiple Divergence Detection

### The Design Decision

Divergence is detected in multiple places:
1. `tracePhysicalPath()` sets `firstDivergedIndex` when hitting wrong surface
2. `deriveRender()` checks `blockedBeforePlan` for obstruction divergence
3. `deriveRender()` checks `isOffSegmentDivergence` for off-segment divergence
4. `deriveRender()` checks `divergeBeforeCursor` as a combination

### Why It Seemed Like a Good Idea

- Different causes of divergence need different handling
- Inline detection is efficient (no second pass)
- Can distinguish obstruction from off-segment from wrong-surface

### Why It Causes Problems

Divergence is a SINGLE concept: "the point where planned ≠ actual."

By detecting it in multiple ways, we get:
- Different detection points for the same divergence
- Inconsistent handling (some cases draw red, some don't)
- Missing cases (divergence happens but not detected)
- Double-drawing (divergence detected twice, path drawn twice)

### Evidence

```typescript
// RenderDeriver.ts:118-122 - blockedBeforePlan + firstDivergedIndex
const blockedBeforePlan =
  hasPlannedSurfaces && !path.cursorReachable && !pathReachedPlannedSurface;
const divergeBeforeCursor =
  (path.firstDivergedIndex !== -1 && !path.cursorReachable) || blockedBeforePlan;

// This combines TWO different divergence sources into ONE flag.
// But they're handled differently later!
```

---

## Root Cause 4: Color Logic Entangled with Path Logic

### The Design Decision

`deriveRender()` determines color by examining:
- `segment.planAlignment`
- `cursorIdx`
- `path.firstDivergedIndex`
- `path.plannedSurfaceCount`
- `path.cursorReachable`
- And several derived flags

### Why It Seemed Like a Good Idea

- Color depends on all these factors
- Single function handles all cases
- No separate "color calculation" step

### Why It Causes Problems

Color SHOULD be a pure function of a simple state:

```typescript
type SegmentState = {
  relation: "aligned" | "diverged" | "unplanned";
  position: "beforeCursor" | "atCursor" | "afterCursor";
  pathType: "actual" | "planned";
};

function colorFor(state: SegmentState): Color {
  if (state.relation === "aligned" || state.relation === "unplanned") {
    return state.position === "afterCursor" ? "yellow" : "green";
  } else {
    return "red";
  }
}
```

Instead, color is determined by examining raw path data at render time.
This means:
- Path structure changes require render changes
- Color bugs require understanding both path and render
- Impossible to unit test color logic in isolation

### Evidence

```typescript
// RenderDeriver.ts:220-236 - Color determination
let color: RenderColor;
if (effectivelyDiverged) {
  color = "red";
} else if (isAfterCursor) {
  color = "yellow";
} else {
  color = "green";
}

// `effectivelyDiverged` is defined by:
const effectivelyDiverged = isDiverged && !treatAsAlignedAfterCursor;

// `treatAsAlignedAfterCursor` is defined by:
const treatAsAlignedAfterCursor = isAfterCursor && planCompletedBeforeCursor;

// `planCompletedBeforeCursor` is defined by:
const planCompletedBeforeCursor = noPlan || noDivergence || divergenceAfterCursor;

// Three levels of indirection to determine color!
```

---

## Root Cause 5: Off-Segment Reflection Dual Handling

### The Design Decision

When a planned surface is hit off-segment:
1. The actual path continues straight (no physical reflection)
2. The planned path reflects (off the extended line)
3. Both paths diverge at this point

The current implementation handles this by:
1. Setting `hitOnSegment = false` in the segment
2. Setting `hasDiverged = true` in path builder
3. Checking `isOffSegmentDivergence` in render deriver
4. Drawing BOTH yellow (actual) and red (planned) paths

### Why It Seemed Like a Good Idea

- Off-segment is a special case of divergence
- Need to visualize both paths
- Inline detection is efficient

### Why It Causes Problems

Off-segment is treated as a "special divergence" when it's really "normal divergence."

In both cases:
- Actual path goes one way
- Planned path goes another
- They diverge at a point

By treating off-segment specially:
1. Extra code path in render deriver
2. Extra conditions to check
3. Easy to miss cases (what about off-segment AND obstruction?)
4. Potential for drawing paths twice

### Evidence

```typescript
// RenderDeriver.ts:247-253 - Off-segment detection
const hasOffSegmentDivergence =
  path.firstDivergedIndex === 1 &&
  path.segments.length >= 2 &&
  path.segments[0]!.planAlignment === "aligned" &&
  path.segments[1]!.planAlignment === "diverged" &&
  path.segments[0]!.hitOnSegment === false;

// This is a VERY specific pattern match.
// What if firstDivergedIndex is 2? What if there are 3 segments?
// The pattern doesn't cover all off-segment cases.
```

---

## The Fundamental Tension

All five root causes stem from ONE architectural decision:

**Trying to represent two paths (actual + planned) as one structure with annotations.**

This decision was made for efficiency, but it sacrifices:
- Clarity (what is the planned path?)
- Correctness (edge cases slip through)
- Maintainability (patches accumulate)

---

## Solution Direction

The solution is to embrace the two-path nature of the problem:

1. **Calculate actual path** using forward physics (existing `tracePhysicalPath` without plan annotations)
2. **Calculate planned path** using bidirectional images (new `tracePlannedPath` that ignores obstructions)
3. **Compare paths** to find divergence point (new `findDivergence` function)
4. **Derive render** from two independent paths (simple merge logic)

This approach:
- Separates concerns
- Makes each path calculation simple
- Makes divergence detection trivial
- Makes color determination a lookup table
- Eliminates edge case accumulation

The next document (`simplified-architecture.md`) will detail this approach.

