# Unified Architecture Proposal

This document proposes a redesigned trajectory system that **embodies** the first principles rather than **enforcing** them through conditional checks and post-hoc comparisons.

## Design Philosophy

> "Make illegal states unrepresentable." — Yaron Minsky

The goal is an architecture where:
- First principle violations are structurally impossible, not just detected
- The code structure mirrors the conceptual model
- Adding new features doesn't require new conditions
- The "happy path" and "edge cases" use the same code

## Current vs. Proposed Flow

### Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      CURRENT FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Input: player, cursor, plannedSurfaces, allSurfaces            │
│                                                                 │
│         ┌─────────────────┐      ┌─────────────────┐            │
│         │ evaluateBypass  │      │ evaluateBypass  │            │
│         │ (call #1)       │      │ (call #2)       │            │
│         └────────┬────────┘      └────────┬────────┘            │
│                  │                        │                     │
│         ┌────────▼────────┐      ┌────────▼────────┐            │
│         │ buildPlannedPath│      │ buildActualPath │            │
│         │ (images + ideal)│      │ (images → fwd)  │            │
│         └────────┬────────┘      └────────┬────────┘            │
│                  │                        │                     │
│                  └────────────┬───────────┘                     │
│                               │                                 │
│                    ┌──────────▼──────────┐                      │
│                    │ calculateAlignment  │                      │
│                    │ (compare two paths) │                      │
│                    └──────────┬──────────┘                      │
│                               │                                 │
│                    ┌──────────▼──────────┐                      │
│                    │   RenderSystem      │                      │
│                    │ (interpret colors)  │                      │
│                    └─────────────────────┘                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Problems:**
- Bypass evaluated twice
- Two separate path calculations
- Alignment detected by comparison
- Colors interpreted by renderer

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      PROPOSED FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Input: player, cursor, plannedSurfaces, allSurfaces            │
│                                                                 │
│         ┌─────────────────────────────────┐                     │
│         │     prepareSurfaceStates        │                     │
│         │ (mark planned, check bypass)    │                     │
│         └──────────────┬──────────────────┘                     │
│                        │                                        │
│         ┌──────────────▼──────────────────┐                     │
│         │      calculateDirection         │                     │
│         │ (bidirectional images)          │                     │
│         └──────────────┬──────────────────┘                     │
│                        │                                        │
│         ┌──────────────▼──────────────────┐                     │
│         │      tracePhysicalPath          │                     │
│         │ (forward physics, annotated)    │                     │
│         └──────────────┬──────────────────┘                     │
│                        │                                        │
│         ┌──────────────▼──────────────────┐                     │
│         │        UnifiedPath              │                     │
│         │ (segments with plan status)     │                     │
│         └──────────────┬──────────────────┘                     │
│                        │                                        │
│         ┌──────────────▼──────────────────┐                     │
│         │        deriveRender             │                     │
│         │ (segment → color mapping)       │                     │
│         └──────────────┬──────────────────┘                     │
│                        │                                        │
│         ┌──────────────▼──────────────────┐                     │
│         │        RenderSystem             │                     │
│         │ (simple loop over segments)     │                     │
│         └─────────────────────────────────┘                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Benefits:**
- Single pass through surfaces (bypass integrated)
- One path calculation (the physical path)
- Alignment is a derived property (per-segment annotation)
- Colors are properties (not interpretations)

---

## Core Types

### SurfaceState

Centralize all information about a surface in one place:

```typescript
/**
 * Complete state of a surface in the trajectory calculation.
 * 
 * All surface information lives here, not scattered across
 * multiple arrays (plannedSurfaces, bypassedSurfaces, hitInfo).
 */
interface SurfaceState {
  /** The surface itself */
  readonly surface: Surface;
  
  /** 
   * Position in the plan (1-indexed).
   * null = not in plan.
   */
  readonly planOrder: number | null;
  
  /**
   * Reason this surface was bypassed.
   * null = not bypassed (active in plan).
   */
  readonly bypassReason: BypassReason | null;
  
  /**
   * Result of checking if the path hit this surface.
   * null = not hit (or bypassed before we got there).
   */
  readonly hitResult: SurfaceHitResult | null;
}

interface SurfaceHitResult {
  /** Where the ray hit the surface line */
  readonly hitPoint: Vector2;
  /** Parametric position (0-1 = on segment) */
  readonly segmentT: number;
  /** Whether the hit was on the actual segment */
  readonly onSegment: boolean;
  /** Whether we reflected off this surface */
  readonly reflected: boolean;
}
```

### PathSegment

A segment of the path with all rendering information:

```typescript
/**
 * A single segment of the trajectory path.
 * 
 * Contains all information needed for:
 * - Arrow movement (start, end)
 * - Rendering (style, color derived from planAlignment)
 * - Debugging (surface, reason for state)
 */
interface PathSegment {
  /** Start point of segment */
  readonly start: Vector2;
  /** End point of segment */
  readonly end: Vector2;
  
  /**
   * Surface at the end of this segment.
   * null = segment ends at cursor, max distance, or void.
   */
  readonly endSurface: Surface | null;
  
  /**
   * How this segment relates to the plan.
   */
  readonly planAlignment: SegmentPlanAlignment;
  
  /**
   * Termination reason if this is the last segment.
   */
  readonly termination?: TerminationReason;
}

type SegmentPlanAlignment =
  | { type: 'aligned'; planIndex: number }     // Followed the plan
  | { type: 'diverged'; reason: string }       // Plan existed, didn't follow
  | { type: 'unplanned' };                     // No plan for this segment

type TerminationReason =
  | { type: 'cursor_reached' }
  | { type: 'wall_hit'; surface: Surface }
  | { type: 'max_distance' }
  | { type: 'max_reflections' };
```

### UnifiedPath

The complete path with cursor position:

```typescript
/**
 * The complete trajectory path.
 * 
 * This is the SINGLE SOURCE OF TRUTH for:
 * - Arrow movement (segments.start/end)
 * - Visualization (segments.planAlignment → color)
 * - Alignment (derived from segments)
 */
interface UnifiedPath {
  /** All segments from player to termination */
  readonly segments: readonly PathSegment[];
  
  /**
   * Index of the segment where cursor lies.
   * The cursor is between segments[cursorSegmentIndex].start and .end.
   * -1 if cursor is not on the path.
   */
  readonly cursorSegmentIndex: number;
  
  /**
   * Parametric position of cursor within its segment (0-1).
   * 0 = at start, 1 = at end.
   */
  readonly cursorT: number;
  
  /**
   * Cached alignment status (derived from segments).
   */
  readonly isFullyAligned: boolean;
  
  /**
   * Index of first diverged segment (-1 if all aligned).
   */
  readonly firstDivergedIndex: number;
  
  /**
   * States of all surfaces (for debugging/visualization).
   */
  readonly surfaceStates: ReadonlyMap<string, SurfaceState>;
}
```

### RenderSegment

Render-ready output:

```typescript
/**
 * A segment ready for rendering.
 * 
 * No interpretation needed. Just draw it.
 */
interface RenderSegment {
  readonly start: Vector2;
  readonly end: Vector2;
  readonly style: 'solid' | 'dashed';
  readonly color: 'green' | 'red' | 'yellow';
}

/**
 * Complete render output.
 */
interface RenderOutput {
  readonly segments: readonly RenderSegment[];
}
```

---

## Core Functions

### prepareSurfaceStates

```typescript
/**
 * Prepare surface states from plan and bypass rules.
 * 
 * This runs ONCE per calculation, not once per path.
 */
function prepareSurfaceStates(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[]
): Map<string, SurfaceState> {
  const states = new Map<string, SurfaceState>();
  
  // Initialize all surfaces
  for (const surface of allSurfaces) {
    states.set(surface.id, {
      surface,
      planOrder: null,
      bypassReason: null,
      hitResult: null,
    });
  }
  
  // Mark planned surfaces with order
  for (let i = 0; i < plannedSurfaces.length; i++) {
    const surface = plannedSurfaces[i];
    const state = states.get(surface.id);
    if (state) {
      states.set(surface.id, { ...state, planOrder: i + 1 });
    }
  }
  
  // Evaluate bypass for planned surfaces
  // (This could be inline with the loop above for efficiency)
  for (const surface of plannedSurfaces) {
    const state = states.get(surface.id)!;
    const bypassReason = checkBypass(player, cursor, surface, states);
    if (bypassReason) {
      states.set(surface.id, { ...state, bypassReason });
    }
  }
  
  return states;
}
```

### calculateDirection

```typescript
/**
 * Calculate initial direction using bidirectional images.
 * 
 * Uses only ACTIVE (non-bypassed) surfaces from the plan.
 */
function calculateDirection(
  player: Vector2,
  cursor: Vector2,
  surfaceStates: Map<string, SurfaceState>
): Vector2 {
  // Get active surfaces in plan order
  const activeSurfaces = getActivePlannedSurfaces(surfaceStates);
  
  if (activeSurfaces.length === 0) {
    // Direct to cursor
    return normalize(subtract(cursor, player));
  }
  
  // Bidirectional image reflection
  const playerImages = buildForwardImages(player, activeSurfaces);
  const cursorImages = buildBackwardImages(cursor, activeSurfaces);
  
  const p0 = player; // P_0 is just player
  const cn = cursorImages.images[0]?.position ?? cursor; // C_n
  
  return normalize(subtract(cn, p0));
}
```

### tracePhysicalPath

```typescript
/**
 * Trace the physical path using forward ray casting.
 * 
 * Annotates each segment with plan alignment.
 */
function tracePhysicalPath(
  player: Vector2,
  cursor: Vector2,
  direction: Vector2,
  surfaceStates: Map<string, SurfaceState>,
  allSurfaces: readonly Surface[],
  options: TraceOptions = {}
): UnifiedPath {
  const segments: PathSegment[] = [];
  const maxReflections = options.maxReflections ?? 10;
  const maxDistance = options.maxDistance ?? 2000;
  
  let currentPoint = player;
  let currentDirection = direction;
  let remainingDistance = maxDistance;
  let lastHitSurface: Surface | null = null;
  let nextExpectedPlanIndex = 1;
  let hasDiverged = false;
  
  for (let i = 0; i < maxReflections && remainingDistance > 0; i++) {
    // Find next hit
    const hit = raycastForward(
      currentPoint,
      currentDirection,
      allSurfaces,
      lastHitSurface ? [lastHitSurface] : []
    );
    
    // Check if cursor is on this segment
    const cursorCheck = checkCursorOnSegment(
      currentPoint,
      currentDirection,
      cursor,
      hit?.point
    );
    
    // Determine segment endpoint
    let endpoint: Vector2;
    let endSurface: Surface | null = null;
    let termination: TerminationReason | undefined;
    
    if (cursorCheck.isOnSegment && cursorCheck.distToCursor < (hit?.distance ?? Infinity)) {
      // Cursor is on path before any hit - end at cursor
      endpoint = cursor;
      termination = { type: 'cursor_reached' };
    } else if (hit) {
      endpoint = hit.point;
      endSurface = hit.surface;
      
      // Record hit result in surface state
      updateSurfaceHitResult(surfaceStates, hit);
      
      if (!hit.canReflect) {
        termination = { type: 'wall_hit', surface: hit.surface };
      }
    } else {
      // No hit - extend to max distance
      const extendDist = Math.min(remainingDistance, maxDistance);
      endpoint = add(currentPoint, scale(currentDirection, extendDist));
      termination = { type: 'max_distance' };
    }
    
    // Determine plan alignment for this segment
    const planAlignment = determinePlanAlignment(
      endSurface,
      surfaceStates,
      nextExpectedPlanIndex,
      hasDiverged
    );
    
    if (planAlignment.type === 'aligned') {
      nextExpectedPlanIndex = planAlignment.planIndex + 1;
    } else if (planAlignment.type === 'diverged') {
      hasDiverged = true;
    }
    
    // Add segment
    segments.push({
      start: currentPoint,
      end: endpoint,
      endSurface,
      planAlignment,
      termination,
    });
    
    // Check for termination
    if (termination) {
      break;
    }
    
    // Continue tracing if we reflected
    if (hit && hit.canReflect) {
      currentDirection = reflectDirection(currentDirection, hit.surface);
      currentPoint = endpoint;
      lastHitSurface = hit.surface;
      remainingDistance -= hit.distance;
    } else {
      break;
    }
  }
  
  // Derive cached properties
  const cursorInfo = findCursorInSegments(segments, cursor);
  const alignmentInfo = deriveAlignmentInfo(segments);
  
  return {
    segments,
    cursorSegmentIndex: cursorInfo.segmentIndex,
    cursorT: cursorInfo.t,
    isFullyAligned: alignmentInfo.isFullyAligned,
    firstDivergedIndex: alignmentInfo.firstDivergedIndex,
    surfaceStates,
  };
}
```

### deriveRender

```typescript
/**
 * Convert a UnifiedPath to render-ready segments.
 * 
 * Simple mapping with no complex interpretation.
 */
function deriveRender(path: UnifiedPath): RenderOutput {
  const renderSegments: RenderSegment[] = [];
  const cursorIdx = path.cursorSegmentIndex;
  const divergeIdx = path.firstDivergedIndex;
  
  for (let i = 0; i < path.segments.length; i++) {
    const segment = path.segments[i];
    const isBeforeCursor = cursorIdx === -1 || i <= cursorIdx;
    const isAligned = divergeIdx === -1 || i < divergeIdx;
    
    // Determine style
    const style: 'solid' | 'dashed' = isBeforeCursor ? 'solid' : 'dashed';
    
    // Determine color
    let color: 'green' | 'red' | 'yellow';
    if (isAligned) {
      color = isBeforeCursor ? 'green' : 'yellow';
    } else {
      color = 'red'; // Both solid red (planned diverged) and dashed red (projection)
    }
    
    // Split segment at cursor if needed
    if (i === cursorIdx && segment.termination?.type !== 'cursor_reached') {
      const cursorPoint = interpolateSegment(segment, path.cursorT);
      
      // Before cursor (solid)
      renderSegments.push({
        start: segment.start,
        end: cursorPoint,
        style: 'solid',
        color: isAligned ? 'green' : 'red',
      });
      
      // After cursor (dashed)
      renderSegments.push({
        start: cursorPoint,
        end: segment.end,
        style: 'dashed',
        color: isAligned ? 'yellow' : 'red',
      });
    } else {
      renderSegments.push({
        start: segment.start,
        end: segment.end,
        style,
        color,
      });
    }
  }
  
  return { segments: renderSegments };
}
```

---

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     UNIFIED TRAJECTORY ENGINE                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    TrajectoryCalculator                       │  │
│  │                                                               │  │
│  │  ┌─────────────┐   ┌──────────────┐   ┌────────────────────┐  │  │
│  │  │   Input     │   │ SurfaceState │   │ UnifiedPath        │  │  │
│  │  │  Resolver   │──▶│   Manager    │──▶│   Builder          │  │  │
│  │  └─────────────┘   └──────────────┘   └────────────────────┘  │  │
│  │                                               │               │  │
│  │                                               ▼               │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │                    UnifiedPath                          │  │  │
│  │  │  - segments: PathSegment[]                              │  │  │
│  │  │  - cursorSegmentIndex: number                           │  │  │
│  │  │  - isFullyAligned: boolean                              │  │  │
│  │  │  - surfaceStates: Map<string, SurfaceState>             │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  │                               │                               │  │
│  └───────────────────────────────│───────────────────────────────┘  │
│                                  │                                  │
│                                  ▼                                  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      RenderDeriver                            │  │
│  │                                                               │  │
│  │  UnifiedPath ──▶ deriveRender() ──▶ RenderOutput              │  │
│  │                                                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                  │                                  │
│                                  ▼                                  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      RenderSystem                             │  │
│  │                                                               │  │
│  │  for (segment of renderOutput.segments) {                     │  │
│  │    drawSegment(segment);                                      │  │
│  │  }                                                            │  │
│  │                                                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## How This Addresses Each Gap

### Gap 1: Dual Path → Single Path

**Before:** Two separate `buildPlannedPath` and `buildActualPath` functions.

**After:** One `tracePhysicalPath` function that produces a single `UnifiedPath`.

The "planned path" visualization is derived from the same `UnifiedPath` by:
- Drawing aligned segments as green
- Drawing diverged segments as red
- The cursor position marks solid/dashed transition

No separate path, no comparison needed.

### Gap 2: Bypass Pre-filter → Integrated State

**Before:** `evaluateBypass()` runs before path building, filtering surfaces.

**After:** `prepareSurfaceStates()` runs once, marking surfaces as bypassed.

The `tracePhysicalPath` function:
- Checks `surfaceState.bypassReason` when determining if a hit follows the plan
- Bypassed surfaces are still in `allSurfaces` for physics
- But they don't count as "following the plan"

Bypass is integrated into the surface state, not a separate filtering step.

### Gap 3: Direction Split → Explicit Function

**Before:** `buildActualPath` uses images for direction, then switches to physics.

**After:** `calculateDirection` is a separate, explicit function.

The direction calculation is:
1. Clearly separated from path tracing
2. Has a single responsibility
3. Can be tested independently

### Gap 4: Forward Projection → Continuous Path

**Before:** `forwardProjection` is a separate property calculated at the end.

**After:** Path segments continue past cursor naturally.

The `UnifiedPath.segments` array contains ALL segments, including those after cursor. The `cursorSegmentIndex` marks where the cursor is, and `deriveRender` uses this to apply solid/dashed styling.

No separate "projection" concept.

### Gap 5: Alignment Detection → Segment Properties

**Before:** `calculateAlignment` compares two paths after they're built.

**After:** Each segment has `planAlignment` set during tracing.

`isFullyAligned` is a derived property:
```typescript
const isFullyAligned = segments.every(s => 
  s.planAlignment.type !== 'diverged'
);
```

No comparison algorithm, no tolerances for matching paths.

### Gap 6: Render Interpretation → Render-Ready Output

**Before:** RenderSystem receives paths and alignment, interprets colors.

**After:** RenderSystem receives `RenderOutput` with pre-calculated colors.

```typescript
// New RenderSystem - trivially simple
render(): void {
  for (const segment of this.renderOutput.segments) {
    if (segment.style === 'solid') {
      this.drawSolidLine(segment.start, segment.end, colorToHex(segment.color));
    } else {
      this.drawDashedLine(segment.start, segment.end, colorToHex(segment.color));
    }
  }
}
```

---

## Benefits Summary

| Aspect | Current | Proposed |
|--------|---------|----------|
| Path calculations | 2 (planned + actual) | 1 (unified) |
| Bypass evaluations | 2 (per path) | 1 (in surface states) |
| Alignment detection | Post-hoc comparison | Per-segment annotation |
| Render interpretation | Complex decoding | Simple loop |
| Surface state | 4+ arrays | 1 Map |
| Direction logic | Mixed with physics | Separate function |
| Forward projection | Separate property | Same segments array |
| First principle violations | Possible at multiple points | Structurally prevented |

## Testing Strategy

With this architecture, tests become clearer:

```typescript
describe('UnifiedPath', () => {
  it('marks segment as aligned when hitting planned surface on-segment', () => {
    const path = tracePhysicalPath(...);
    expect(path.segments[0].planAlignment.type).toBe('aligned');
  });
  
  it('marks segment as diverged when hitting planned surface off-segment', () => {
    const path = tracePhysicalPath(...);
    expect(path.segments[0].planAlignment.type).toBe('diverged');
  });
  
  it('derives isFullyAligned from segment alignments', () => {
    const path = tracePhysicalPath(...);
    expect(path.isFullyAligned).toBe(
      path.segments.every(s => s.planAlignment.type !== 'diverged')
    );
  });
});

describe('RenderDeriver', () => {
  it('produces green solid for aligned segments before cursor', () => {
    const render = deriveRender(alignedPath);
    expect(render.segments[0]).toEqual({
      start: expect.any(Object),
      end: expect.any(Object),
      style: 'solid',
      color: 'green',
    });
  });
});
```

Tests verify individual components, not complex interactions.

---

## Conclusion

This unified architecture:

1. **Embodies** the Single Source of Truth principle by having ONE path
2. **Prevents** interpretation bugs by producing render-ready output
3. **Centralizes** surface state to eliminate fragmentation
4. **Separates** concerns (direction calculation, path tracing, render derivation)
5. **Simplifies** rendering to a trivial loop

The transition from current to proposed architecture is detailed in `convergence-roadmap.md`.

