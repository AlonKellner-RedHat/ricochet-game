# Simplified Architecture: Two-Path Design

This document proposes a clean architecture that aligns with first principles
and eliminates the edge case proliferation of the current implementation.

## Design Philosophy

> **"Make the simple things simple, and the complex things possible."**

The current architecture makes simple things complex by conflating concepts.
This proposal separates concerns to make each part simple.

---

## Core Insight

First principles state there are TWO paths:

1. **Actual Path**: What happens when the arrow is shot
   - Forward physics
   - Reflects on-segment only
   - Blocked by walls

2. **Planned Path**: What would happen if everything worked
   - Uses bidirectional images for direction
   - Reflects off extended lines (even off-segment)
   - Ignores obstructions

These are fundamentally different calculations.
They should be calculated independently.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      TrajectoryEngine                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐        ┌──────────────────┐              │
│  │  calculateActual │        │  calculatePlanned │             │
│  │                  │        │                   │             │
│  │  • Player pos    │        │  • Player pos     │             │
│  │  • Cursor pos    │        │  • Cursor pos     │             │
│  │  • Active surfs  │        │  • Active surfs   │             │
│  │  • All surfaces  │        │  (only)           │             │
│  │                  │        │                   │             │
│  │  Returns:        │        │  Returns:         │             │
│  │  ActualPath {    │        │  PlannedPath {    │             │
│  │    waypoints,    │        │    waypoints,     │             │
│  │    hitInfo,      │        │    hitInfo,       │             │
│  │    blockedBy?    │        │    (no blocking)  │             │
│  │  }               │        │  }                │             │
│  └────────┬─────────┘        └────────┬──────────┘             │
│           │                           │                         │
│           └───────────┬───────────────┘                         │
│                       │                                         │
│                       ▼                                         │
│           ┌───────────────────────┐                            │
│           │   findDivergence()    │                            │
│           │                       │                            │
│           │   Compare paths       │                            │
│           │   Return index or -1  │                            │
│           └───────────┬───────────┘                            │
│                       │                                         │
│                       ▼                                         │
│           ┌───────────────────────┐                            │
│           │   DivergenceInfo {    │                            │
│           │     index: number,    │                            │
│           │     point: Vector2,   │                            │
│           │     isAligned: bool   │                            │
│           │   }                   │                            │
│           └───────────────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      RenderDeriver                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Input:                                                         │
│    • actualPath: ActualPath                                     │
│    • plannedPath: PlannedPath                                   │
│    • divergence: DivergenceInfo                                 │
│    • cursor: Vector2                                            │
│                                                                 │
│  Logic:                                                         │
│    if (divergence.isAligned) {                                  │
│      // Only actual path matters, all green/yellow              │
│      return renderSinglePath(actualPath, cursor);               │
│    } else {                                                     │
│      // Both paths matter                                       │
│      return renderDualPath(                                     │
│        actualPath,                                              │
│        plannedPath,                                             │
│        divergence,                                              │
│        cursor                                                   │
│      );                                                         │
│    }                                                            │
│                                                                 │
│  Output:                                                        │
│    RenderSegment[]                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Structures

### ActualPath

```typescript
interface ActualPath {
  /** Waypoints of the path (including player start) */
  readonly waypoints: readonly Vector2[];
  
  /** Information about each surface hit */
  readonly hits: readonly ActualHit[];
  
  /** Surface that blocked the path (if any) */
  readonly blockedBy: Surface | null;
  
  /** Index of waypoint where cursor is reached (-1 if not) */
  readonly cursorIndex: number;
  
  /** Parametric t within cursor segment (0-1) */
  readonly cursorT: number;
}

interface ActualHit {
  readonly point: Vector2;
  readonly surface: Surface;
  readonly reflected: boolean; // Only true if on-segment
}
```

### PlannedPath

```typescript
interface PlannedPath {
  /** Waypoints of the ideal path (including player start) */
  readonly waypoints: readonly Vector2[];
  
  /** Information about each planned surface interaction */
  readonly hits: readonly PlannedHit[];
  
  /** Index of waypoint where cursor is reached */
  readonly cursorIndex: number;
  
  /** Parametric t within cursor segment (0-1) */
  readonly cursorT: number;
}

interface PlannedHit {
  readonly point: Vector2;
  readonly surface: Surface;
  readonly onSegment: boolean; // True if would reflect in reality
}
```

### DivergenceInfo

```typescript
interface DivergenceInfo {
  /** Index of first divergent segment (-1 if fully aligned) */
  readonly segmentIndex: number;
  
  /** Exact point where paths diverge */
  readonly point: Vector2 | null;
  
  /** True if paths are identical */
  readonly isAligned: boolean;
}
```

### RenderSegment (unchanged)

```typescript
interface RenderSegment {
  readonly start: Vector2;
  readonly end: Vector2;
  readonly style: "solid" | "dashed";
  readonly color: "green" | "red" | "yellow";
}
```

---

## Function Signatures

### calculateActualPath

```typescript
/**
 * Calculate the actual physical path using forward ray casting.
 * 
 * This path represents what happens when the arrow is shot.
 * 
 * @param player - Starting position
 * @param cursor - Cursor position (for termination)
 * @param activeSurfaces - Surfaces to use for direction (from bypass)
 * @param allSurfaces - All surfaces to hit
 * @returns ActualPath with waypoints and hit info
 */
function calculateActualPath(
  player: Vector2,
  cursor: Vector2,
  activeSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[]
): ActualPath;
```

**Implementation Notes:**
- Initial direction from `player` toward `getCursorImage(0, activeSurfaces)`
- Forward ray cast against `allSurfaces`
- Reflect only if `canReflectFrom()` returns true
- Stop at walls
- Track cursor position as path progresses

### calculatePlannedPath

```typescript
/**
 * Calculate the ideal planned path using bidirectional images.
 * 
 * This path represents what would happen if all reflections worked.
 * 
 * @param player - Starting position
 * @param cursor - Cursor position
 * @param activeSurfaces - Active planned surfaces (from bypass)
 * @returns PlannedPath with waypoints and hit info
 */
function calculatePlannedPath(
  player: Vector2,
  cursor: Vector2,
  activeSurfaces: readonly Surface[]
): PlannedPath;
```

**Implementation Notes:**
- For each surface i: ray from `P_i` to `C_{n-i}`
- Intersect with EXTENDED line (not segment)
- Always reflect, even if off-segment
- No obstruction checks
- Track cursor position as path progresses

### findDivergence

```typescript
/**
 * Compare two paths and find where they diverge.
 * 
 * @param actual - The actual physical path
 * @param planned - The ideal planned path
 * @returns DivergenceInfo with divergence point
 */
function findDivergence(
  actual: ActualPath,
  planned: PlannedPath
): DivergenceInfo;
```

**Implementation Notes:**
- Iterate waypoints in parallel
- Compare positions (with small tolerance)
- Return first mismatch index
- If all match, return `{ segmentIndex: -1, isAligned: true }`

---

## Rendering Logic

The new `renderDualPath` is trivially simple:

```typescript
function renderDualPath(
  actual: ActualPath,
  planned: PlannedPath,
  divergence: DivergenceInfo,
  cursor: Vector2
): RenderSegment[] {
  const segments: RenderSegment[] = [];
  
  // 1. Render aligned portion (green)
  for (let i = 0; i < divergence.segmentIndex; i++) {
    const start = actual.waypoints[i]!;
    const end = actual.waypoints[i + 1]!;
    const isCursor = i === actual.cursorIndex;
    
    if (isCursor) {
      // Split at cursor
      const cursorPoint = interpolate(start, end, actual.cursorT);
      segments.push({ start, end: cursorPoint, style: "solid", color: "green" });
      segments.push({ start: cursorPoint, end, style: "dashed", color: "yellow" });
    } else {
      const afterCursor = i > actual.cursorIndex && actual.cursorIndex !== -1;
      segments.push({
        start,
        end,
        style: afterCursor ? "dashed" : "solid",
        color: afterCursor ? "yellow" : "green"
      });
    }
  }
  
  // 2. Render actual continuation (yellow dashed)
  for (let i = divergence.segmentIndex; i < actual.waypoints.length - 1; i++) {
    segments.push({
      start: actual.waypoints[i]!,
      end: actual.waypoints[i + 1]!,
      style: "dashed",
      color: "yellow"
    });
  }
  
  // 3. Render planned continuation (red)
  for (let i = divergence.segmentIndex; i < planned.waypoints.length - 1; i++) {
    const start = planned.waypoints[i]!;
    const end = planned.waypoints[i + 1]!;
    const isCursor = i === planned.cursorIndex && planned.cursorIndex >= divergence.segmentIndex;
    
    if (isCursor) {
      // Split at cursor
      const cursorPoint = interpolate(start, end, planned.cursorT);
      segments.push({ start, end: cursorPoint, style: "solid", color: "red" });
      segments.push({ start: cursorPoint, end, style: "dashed", color: "red" });
    } else {
      const afterCursor = i > planned.cursorIndex && planned.cursorIndex !== -1;
      segments.push({
        start,
        end,
        style: afterCursor ? "dashed" : "solid",
        color: "red"
      });
    }
  }
  
  return segments;
}
```

**Note**: This is ~50 lines instead of ~500 lines.
The simplicity comes from having TWO paths as input.

---

## Edge Case Elimination

### Off-Segment Reflection

**Current Handling**: 
- Detect `hasOffSegmentDivergence` with pattern matching
- Draw both yellow and red paths in special code path

**New Handling**:
- `calculatePlannedPath` always reflects (even off-segment)
- `calculateActualPath` doesn't reflect (goes straight)
- `findDivergence` naturally finds where they differ
- Standard dual-path rendering draws both

### Obstruction Before Planned Surface

**Current Handling**:
- Detect `blockedBeforePlan` with complex condition
- Calculate `plannedPathFromDivergence` at render time

**New Handling**:
- `calculateActualPath` stops at obstruction
- `calculatePlannedPath` ignores obstruction
- `findDivergence` finds the obstruction point
- Standard dual-path rendering draws both

### Cursor on Wrong Side

**Current Handling**:
- `BypassEvaluator` detects and excludes surface
- Special handling for "last surface" recursion

**New Handling**:
- `BypassEvaluator` (unchanged) filters surfaces
- Both path calculations receive `activeSurfaces`
- No special handling needed

### Multiple Surfaces with Mixed Validity

**Current Handling**:
- Complex interaction between bypass, path calculation, render
- Easy to miss edge cases

**New Handling**:
- Each path calculation is independent
- Comparison naturally handles any combination

---

## Invariant Enforcement

With this architecture, invariants become trivially enforceable:

### "Exactly one actual path"
```typescript
const actualPath = calculateActualPath(...);
// There's literally one object
```

### "Exactly one planned path"
```typescript
const plannedPath = calculatePlannedPath(...);
// There's literally one object
```

### "Single divergence point"
```typescript
const divergence = findDivergence(actualPath, plannedPath);
// divergence.point is THE divergence point
```

### "Arrow follows actual path"
```typescript
const arrowWaypoints = actualPath.waypoints;
// Direct usage, no transformation
```

### "Color is a function of state"
```typescript
// In renderDualPath:
// - i < divergence.segmentIndex → green
// - i >= divergence.segmentIndex && path === actual → yellow
// - i >= divergence.segmentIndex && path === planned → red
```

---

## Complexity Comparison

| Metric | Current | Proposed |
|--------|---------|----------|
| Path calculation functions | 1 (unified) | 2 (actual + planned) |
| Render decision points | 47+ | ~10 |
| Edge case handlers | 12+ | 0 (handled by structure) |
| Lines of rendering code | ~500 | ~50 |
| Ways to detect divergence | 4 | 1 |
| "Special case" conditions | Many | None |

---

## Implementation Strategy

See `migration-strategy.md` for a phased approach to refactoring.

The key insight is that this can be done incrementally:
1. Add `calculatePlannedPath` alongside existing code
2. Add `findDivergence` alongside existing code
3. Create new `renderDualPath` alongside existing code
4. Switch over one test at a time
5. Remove old code when fully migrated

