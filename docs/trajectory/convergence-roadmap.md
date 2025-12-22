# Implementation Convergence Roadmap

This document provides a phased approach to transitioning from the current dual-path architecture to the unified architecture described in `unified-architecture.md`.

## Guiding Principles for Migration

1. **Incremental**: Each phase produces a working system
2. **Test-Driven**: Add tests for new behavior before implementing
3. **Backwards Compatible**: Existing tests should continue to pass
4. **Feature Flagged**: New implementation can be toggled for A/B testing
5. **Deletable**: Each phase should enable deletion of old code

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     MIGRATION PHASES                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Phase 1: Unify Bypass                                              │
│  ├── Single evaluateBypass call in TrajectoryEngine                 │
│  ├── Pass result to both path builders                              │
│  └── Delete duplicate calls                                         │
│                                                                     │
│  Phase 2: Introduce SurfaceState                                    │
│  ├── Create SurfaceState type                                       │
│  ├── Replace multiple arrays with single Map                        │
│  └── Migrate consumers to use SurfaceState                          │
│                                                                     │
│  Phase 3: Create UnifiedPath                                        │
│  ├── Implement PathSegment with planAlignment                       │
│  ├── Create tracePhysicalPath function                              │
│  └── Derive planned/actual from UnifiedPath                         │
│                                                                     │
│  Phase 4: Render-Ready Output                                       │
│  ├── Implement deriveRender function                                │
│  ├── Simplify RenderSystem to loop over segments                    │
│  └── Delete interpretation logic                                    │
│                                                                     │
│  Phase 5: Cleanup                                                   │
│  ├── Delete buildPlannedPath, buildActualPath                       │
│  ├── Delete calculateAlignment                                      │
│  └── Update all tests to new architecture                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Unify Bypass Evaluation

**Goal:** Single bypass evaluation shared by both path calculations.

### Current State

```typescript
// PathBuilder.ts - buildPlannedPath
const bypassResult = evaluateBypass(player, cursor, plannedSurfaces, allSurfaces);

// PathBuilder.ts - buildActualPath  
const bypassResult = evaluateBypass(player, cursor, plannedSurfaces, allSurfaces);
```

### Target State

```typescript
// TrajectoryEngine.ts
getBypassResult(): BypassResult {
  if (this.dirty.bypass || !this.cache.bypassResult) {
    this.cache.bypassResult = evaluateBypass(
      this.player,
      this.cursor,
      this.plannedSurfaces,
      this.allSurfaces
    );
    this.dirty.bypass = false;
  }
  return this.cache.bypassResult;
}

getPlannedPath(): PathResult {
  const bypassResult = this.getBypassResult();  // Cached
  return buildPlannedPath(
    this.player,
    this.cursor,
    this.plannedSurfaces,
    this.allSurfaces,
    bypassResult  // Pass in
  );
}

getActualPath(): PathResult {
  const bypassResult = this.getBypassResult();  // Same cached result
  return buildActualPath(
    this.player,
    this.cursor,
    this.plannedSurfaces,
    this.allSurfaces,
    bypassResult  // Pass in
  );
}
```

### Steps

1. **Add bypass caching to TrajectoryEngine**
   - Add `bypassResult` to cache and dirty flags
   - Implement `getBypassResult()`

2. **Modify buildPlannedPath signature**
   - Add optional `bypassResult` parameter
   - If provided, use it; otherwise call evaluateBypass (backward compat)

3. **Modify buildActualPath signature**
   - Same pattern as buildPlannedPath

4. **Update TrajectoryEngine calls**
   - Pass cached bypass result to both builders

5. **Update tests**
   - Tests for builders can pass mock bypass results
   - Tests for engine verify single bypass evaluation

### Files Modified

- `src/trajectory-v2/engine/TrajectoryEngine.ts`
- `src/trajectory-v2/engine/PathBuilder.ts`
- `tests/trajectory-v2/engine/PathBuilder.test.ts`
- `tests/trajectory-v2/engine/TrajectoryEngine.test.ts`

### Verification

```typescript
// Test: bypass is evaluated once
it('should evaluate bypass only once per calculation', () => {
  const spy = vi.spyOn(BypassEvaluator, 'evaluateBypass');
  engine.getResults();
  expect(spy).toHaveBeenCalledTimes(1);
});
```

---

## Phase 2: Introduce SurfaceState

**Goal:** Centralize surface information in a single data structure.

### Current State

```typescript
// Scattered across multiple places
this.plannedSurfaces: Surface[];
bypassResult.bypassedSurfaces: BypassedSurfaceInfo[];
pathResult.hitInfo: HitInfo[];
```

### Target State

```typescript
interface SurfaceState {
  surface: Surface;
  planOrder: number | null;
  bypassReason: BypassReason | null;
  hitResult: SurfaceHitResult | null;
}

// Single source
surfaceStates: Map<string, SurfaceState>;
```

### Steps

1. **Create SurfaceState types**
   - New file: `src/trajectory-v2/engine/SurfaceState.ts`
   - Define `SurfaceState`, `SurfaceHitResult` interfaces

2. **Create prepareSurfaceStates function**
   - Takes player, cursor, plannedSurfaces, allSurfaces
   - Returns `Map<string, SurfaceState>`
   - Integrates bypass evaluation

3. **Add surfaceStates to PathResult**
   - New optional property: `surfaceStates?: ReadonlyMap<string, SurfaceState>`
   - Populate in both builders

4. **Create helper functions**
   - `getActivePlannedSurfaces(states)`: Get non-bypassed planned surfaces
   - `isPlannedSurface(states, surfaceId)`: Check if surface is planned
   - `getBypassReason(states, surfaceId)`: Get bypass reason if any

5. **Migrate PathBuilder to use SurfaceState**
   - Replace `activeSurfaces` array with query on surfaceStates
   - Replace `hitInfo` with updates to surfaceStates

6. **Update consumers**
   - RenderSystem reads from surfaceStates
   - GameAdapter exposes bypass info from surfaceStates

### Files Created

- `src/trajectory-v2/engine/SurfaceState.ts`

### Files Modified

- `src/trajectory-v2/engine/types.ts` (add SurfaceState to PathResult)
- `src/trajectory-v2/engine/PathBuilder.ts`
- `src/trajectory-v2/engine/BypassEvaluator.ts` (integrate with SurfaceState)
- `src/trajectory-v2/GameAdapter.ts`

### Verification

```typescript
// Test: surface state is consistent
it('should have consistent surface state across path result', () => {
  const result = buildPlannedPath(...);
  
  for (const hit of result.hitInfo) {
    const state = result.surfaceStates.get(hit.surface.id);
    expect(state).toBeDefined();
    expect(state.hitResult).toEqual({
      hitPoint: hit.point,
      segmentT: hit.segmentT,
      onSegment: hit.onSegment,
      reflected: hit.reflected,
    });
  }
});
```

---

## Phase 3: Create UnifiedPath

**Goal:** Single path calculation with per-segment plan annotations.

### Current State

```typescript
function buildPlannedPath(...): PathResult { ... }
function buildActualPath(...): PathResult { ... }
function calculateAlignment(planned, actual): AlignmentResult { ... }
```

### Target State

```typescript
function tracePhysicalPath(...): UnifiedPath { ... }
// Alignment is a derived property of UnifiedPath
```

### Steps

1. **Create UnifiedPath types**
   - Add to `src/trajectory-v2/engine/types.ts`
   - Define `PathSegment`, `SegmentPlanAlignment`, `UnifiedPath`

2. **Implement tracePhysicalPath**
   - New function in `src/trajectory-v2/engine/PathBuilder.ts`
   - Uses forward physics (like buildActualPath)
   - Annotates each segment with plan alignment
   - Tracks cursor position within segments

3. **Implement alignment derivation**
   - `deriveAlignmentInfo(segments)`: Compute isFullyAligned, firstDivergedIndex
   - Pure function from segment annotations

4. **Create backward-compat adapters**
   - `unifiedToPlannedPath(unified): PathResult`
   - `unifiedToActualPath(unified): PathResult`
   - `unifiedToAlignment(unified): AlignmentResult`

5. **Update TrajectoryEngine**
   - Add `getUnifiedPath()` method
   - Implement `getPlannedPath()` using adapter
   - Implement `getActualPath()` using adapter
   - Implement `getAlignment()` using adapter

6. **Feature flag**
   - Config option: `useUnifiedPath: boolean`
   - Default to false initially
   - Toggle for A/B testing

### Files Modified

- `src/trajectory-v2/engine/types.ts`
- `src/trajectory-v2/engine/PathBuilder.ts`
- `src/trajectory-v2/engine/TrajectoryEngine.ts`

### Verification

```typescript
// Test: unified path produces same results as dual path
it('should produce equivalent results with unified path', () => {
  const unified = tracePhysicalPath(player, cursor, surfaceStates, allSurfaces);
  const plannedOld = buildPlannedPath(player, cursor, plannedSurfaces, allSurfaces);
  const actualOld = buildActualPath(player, cursor, plannedSurfaces, allSurfaces);
  
  const plannedNew = unifiedToPlannedPath(unified);
  const actualNew = unifiedToActualPath(unified);
  
  expect(plannedNew.points).toEqual(plannedOld.points);
  expect(actualNew.points).toEqual(actualOld.points);
});
```

---

## Phase 4: Render-Ready Output

**Goal:** Engine produces segments with colors, RenderSystem just draws.

### Current State

```typescript
// RenderSystem.ts
render(): void {
  const { plannedPath, actualPath, alignment } = this.lastResults;
  
  if (alignment.isFullyAligned) {
    this.renderAlignedPath(actualPath);
  } else {
    this.renderDivergedPaths(plannedPath, actualPath, alignment);
  }
}
// 400+ lines of interpretation logic
```

### Target State

```typescript
// RenderSystem.ts
render(): void {
  for (const segment of this.renderOutput.segments) {
    this.drawSegment(segment);
  }
}
// ~50 lines total
```

### Steps

1. **Create RenderOutput types**
   - Add to `src/trajectory-v2/engine/types.ts`
   - Define `RenderSegment`, `RenderOutput`

2. **Implement deriveRender**
   - New file: `src/trajectory-v2/engine/RenderDeriver.ts`
   - Takes `UnifiedPath`, returns `RenderOutput`
   - Pure function with clear segment-to-color mapping

3. **Add renderOutput to EngineResults**
   - New property: `renderOutput: RenderOutput`
   - TrajectoryEngine computes this after unified path

4. **Simplify RenderSystem**
   - Remove all interpretation methods
   - Simple loop over render segments
   - Keep draw primitives (drawSolidLine, drawDashedLine)

5. **Update tests**
   - RenderDeriver unit tests for color mapping
   - RenderSystem integration tests with mock graphics

### Files Created

- `src/trajectory-v2/engine/RenderDeriver.ts`

### Files Modified

- `src/trajectory-v2/engine/types.ts`
- `src/trajectory-v2/engine/TrajectoryEngine.ts`
- `src/trajectory-v2/systems/RenderSystem.ts`

### Verification

```typescript
// Test: render segments have correct colors
it('should produce green segments before divergence', () => {
  const unified = createAlignedPath();
  const render = deriveRender(unified);
  
  expect(render.segments[0].color).toBe('green');
  expect(render.segments[0].style).toBe('solid');
});

it('should produce red segments after divergence', () => {
  const unified = createDivergedPath();
  const render = deriveRender(unified);
  
  const afterDivergence = render.segments.slice(unified.firstDivergedIndex);
  for (const segment of afterDivergence) {
    expect(segment.color).toBe('red');
  }
});
```

---

## Phase 5: Cleanup

**Goal:** Remove old code, update tests to new architecture.

### Deletions

1. **Delete dual path builders**
   - Remove `buildPlannedPath` from PathBuilder.ts
   - Remove `buildActualPath` from PathBuilder.ts
   - Keep `tracePhysicalPath`

2. **Delete alignment calculation**
   - Remove `calculateAlignment` from PathBuilder.ts
   - Alignment is now derived from UnifiedPath

3. **Delete interpretation logic in RenderSystem**
   - Remove `renderAlignedPath`
   - Remove `renderDivergedPaths`
   - Remove `renderPlannedFromDivergence`
   - Remove `renderActualFromDivergence`
   - Remove `findNextPointAfterDivergence`
   - Remove `isPointOnSegment`

4. **Delete backward-compat adapters**
   - Remove `unifiedToPlannedPath`
   - Remove `unifiedToActualPath`
   - Remove `unifiedToAlignment`

5. **Update EngineResults interface**
   - Remove `plannedPath`, `actualPath`, `alignment`
   - Keep only `unifiedPath`, `renderOutput`

### Test Updates

1. **PathBuilder tests**
   - Update to test `tracePhysicalPath` directly
   - Remove tests for deleted functions

2. **TrajectoryEngine tests**
   - Update to expect new interface
   - Verify unified path properties

3. **RenderSystem tests**
   - Simplify to test segment drawing
   - Remove interpretation tests

4. **Matrix tests**
   - Update assertions to check UnifiedPath properties
   - Segment-level alignment checks instead of path comparison

### Files Deleted

After migration complete:
- None (code is in existing files)

### Files Significantly Modified

- `src/trajectory-v2/engine/PathBuilder.ts` (major simplification)
- `src/trajectory-v2/engine/TrajectoryEngine.ts` (new interface)
- `src/trajectory-v2/engine/types.ts` (simplified types)
- `src/trajectory-v2/systems/RenderSystem.ts` (major simplification)
- All test files in `tests/trajectory-v2/`

---

## Timeline Estimate

| Phase | Effort | Risk | Dependencies |
|-------|--------|------|--------------|
| Phase 1: Unify Bypass | 2-3 hours | Low | None |
| Phase 2: SurfaceState | 4-6 hours | Medium | Phase 1 |
| Phase 3: UnifiedPath | 8-12 hours | High | Phase 2 |
| Phase 4: Render-Ready | 4-6 hours | Medium | Phase 3 |
| Phase 5: Cleanup | 4-6 hours | Low | Phase 4 |

**Total: 22-33 hours**

Phases 1 and 2 can be done incrementally alongside other work.
Phase 3 is the critical transition that requires focused effort.
Phases 4 and 5 are straightforward once Phase 3 is complete.

---

## Rollback Strategy

Each phase is designed to be reversible:

1. **Phase 1**: Remove cached bypass, revert to inline calls
2. **Phase 2**: Remove SurfaceState, keep using arrays
3. **Phase 3**: Disable feature flag, use old path builders
4. **Phase 4**: RenderSystem can fall back to old interpretation
5. **Phase 5**: N/A (cleanup is final)

Feature flags allow A/B testing between old and new implementations before committing to Phase 5.

---

## Success Metrics

After each phase, verify:

1. **All tests pass**: Existing behavior preserved
2. **No regressions in demo**: Manual testing in game
3. **Performance neutral**: No slowdown in calculations
4. **Code simpler**: Fewer lines, fewer functions, clearer logic

After Phase 5, verify:

1. **First principle tests pass without exceptions**: Not "passes because we work around"
2. **Matrix tests use segment-level assertions**: Not path comparison
3. **RenderSystem under 100 lines**: No interpretation logic
4. **PathBuilder under 200 lines**: Single unified function
5. **No tolerance constants in comparison logic**: Alignment is annotation-based

---

## Conclusion

This roadmap provides a safe path from the current dual-path architecture to a unified architecture that embodies first principles. Each phase is independently valuable and testable, allowing incremental progress without disruption.

The key insight is that we're not just refactoring code—we're changing the fundamental model from "two paths that must match" to "one path with annotations." This model change is what enables the simplification.

