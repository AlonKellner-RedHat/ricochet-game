# Migration Strategy: Current to Two-Path Architecture

This document outlines a phased approach to refactoring from the current
"unified path with inline annotations" architecture to the proposed
"two independent paths" architecture.

## Guiding Principles

1. **Incremental**: Each phase produces working code
2. **Test-Driven**: Tests written before implementation
3. **Backward Compatible**: New code coexists with old
4. **Measurable**: Each phase reduces complexity metrics
5. **Reversible**: Can roll back if needed

---

## Phase Overview

| Phase | Name | Goal | Risk |
|-------|------|------|------|
| 1 | Extract Planned Path | Separate planned path calculation | Low |
| 2 | Simplify Divergence | Single divergence detection | Medium |
| 3 | Dual-Path Rendering | New render function | Medium |
| 4 | Integration | Switch game to new system | High |
| 5 | Cleanup | Remove old code | Low |

---

## Phase 1: Extract Planned Path Calculation

### Goal
Create a standalone `calculatePlannedPath()` function that calculates
the ideal path independently of the actual path.

### Steps

1. **Write tests for planned path behavior**
   ```typescript
   describe("calculatePlannedPath", () => {
     it("should reflect off extended lines even when off-segment");
     it("should ignore obstructions");
     it("should use cursor images for direction");
     it("should reach cursor after all reflections");
   });
   ```

2. **Extract calculation from RenderDeriver**
   - Move `calculatePlannedPathFromPoint` to new file `PlannedPathCalculator.ts`
   - Generalize to work from player position (not divergence point)
   - Remove cursor-splitting logic (that's rendering concern)

3. **Add to TrajectoryEngine**
   - Export new function alongside existing ones
   - Do NOT modify existing callers

### Deliverables
- [ ] New file: `src/trajectory-v2/engine/PlannedPathCalculator.ts`
- [ ] New tests: `tests/trajectory-v2/engine/PlannedPath.test.ts`
- [ ] 100% test coverage for new function

### Metrics
- New function: < 100 lines
- No changes to existing tests

---

## Phase 2: Simplify Divergence Detection

### Goal
Create a standalone `findDivergence()` function that compares two paths
and returns the divergence point.

### Steps

1. **Define DivergenceInfo type**
   ```typescript
   interface DivergenceInfo {
     segmentIndex: number;  // -1 if aligned
     point: Vector2 | null;
     isAligned: boolean;
   }
   ```

2. **Write tests for divergence detection**
   ```typescript
   describe("findDivergence", () => {
     it("should return -1 for identical paths");
     it("should find divergence at off-segment reflection");
     it("should find divergence at obstruction");
     it("should handle different path lengths");
   });
   ```

3. **Implement function**
   - Compare waypoints sequentially
   - Use small tolerance (0.1 pixels)
   - Return first mismatch

4. **Validate against existing detection**
   - Run both old and new detection in parallel
   - Assert they produce same result
   - Log any discrepancies

### Deliverables
- [ ] New file: `src/trajectory-v2/engine/DivergenceDetector.ts`
- [ ] New tests: `tests/trajectory-v2/engine/Divergence.test.ts`
- [ ] Validation test comparing old vs new

### Metrics
- Function complexity: < 20
- All edge cases covered

---

## Phase 3: Dual-Path Rendering

### Goal
Create a new `renderDualPath()` function that takes two paths and
divergence info, and produces render segments.

### Steps

1. **Define new render function signature**
   ```typescript
   function renderDualPath(
     actual: ActualPath,
     planned: PlannedPath,
     divergence: DivergenceInfo,
     cursor: Vector2
   ): RenderSegment[];
   ```

2. **Write tests for rendering**
   ```typescript
   describe("renderDualPath", () => {
     it("should render all green when aligned");
     it("should split at cursor");
     it("should render yellow after divergence on actual path");
     it("should render red after divergence on planned path");
   });
   ```

3. **Implement function**
   - Simple loop structure
   - No edge case conditionals
   - Pure function

4. **Validate against existing rendering**
   - Run both old and new rendering
   - Compare output visually
   - Assert no regressions

### Deliverables
- [ ] New file: `src/trajectory-v2/engine/DualPathRenderer.ts`
- [ ] New tests: `tests/trajectory-v2/engine/DualPathRenderer.test.ts`
- [ ] Visual comparison test

### Metrics
- Function: < 100 lines
- No nested conditionals beyond depth 2

---

## Phase 4: Integration

### Goal
Switch the game to use the new two-path architecture.

### Steps

1. **Update TrajectoryEngine**
   - Add method that returns `{ actual, planned, divergence }`
   - Keep old methods for backward compatibility

2. **Update RenderSystem**
   - Add flag to switch between old and new rendering
   - Default to old (feature flag)

3. **Enable new system in test environment**
   - Run matrix tests with new system
   - Fix any regressions

4. **Enable new system in game**
   - Toggle feature flag
   - Verify with manual testing

5. **Remove feature flag**
   - Make new system the default
   - Keep old system as fallback

### Deliverables
- [ ] Updated TrajectoryEngine with dual-path output
- [ ] Updated RenderSystem with flag
- [ ] All matrix tests passing
- [ ] Manual verification complete

### Metrics
- All 100+ matrix tests passing
- No visual regressions

---

## Phase 5: Cleanup

### Goal
Remove old code and simplify remaining structure.

### Steps

1. **Remove old render logic**
   - Delete `deriveRender` edge case handlers
   - Delete `calculatePlannedPathFromPoint` from RenderDeriver
   - Delete divergence detection in RenderDeriver

2. **Remove old path builder logic**
   - Delete inline annotation code
   - Delete `tracePhysicalPath` if replaced
   - Keep only `calculateActualPath`

3. **Consolidate types**
   - Remove `UnifiedPath` if unused
   - Keep `ActualPath`, `PlannedPath`, `DivergenceInfo`

4. **Update documentation**
   - Update first-principles.md with new architecture
   - Archive old design documents

### Deliverables
- [ ] Removed files listed in cleanup checklist
- [ ] Updated documentation
- [ ] Reduced total lines of code by 30%+

### Metrics
- RenderDeriver: < 100 lines
- PathBuilder: < 300 lines
- Total trajectory code: < 1000 lines

---

## Risk Mitigation

### Risk: New system produces different results
**Mitigation**: 
- Run both systems in parallel
- Log all discrepancies
- Use feature flag to switch back

### Risk: Performance regression
**Mitigation**:
- Benchmark both systems
- Two-path calculation may be faster (no inline checks)

### Risk: Edge cases missed in new system
**Mitigation**:
- Matrix tests cover 100+ scenarios
- Add specific tests for each discovered edge case
- Keep old system as reference

### Risk: Integration complexity
**Mitigation**:
- Feature flag allows gradual rollout
- Can enable per-surface-configuration if needed

---

## Success Criteria

### Phase 1 Complete When
- [ ] `calculatePlannedPath` passes all dedicated tests
- [ ] Function is standalone (no RenderDeriver dependencies)
- [ ] Code coverage > 90%

### Phase 2 Complete When
- [ ] `findDivergence` matches existing detection for all test cases
- [ ] No false positives or negatives in validation
- [ ] Function is pure and simple

### Phase 3 Complete When
- [ ] `renderDualPath` produces identical visual output
- [ ] Render tests cover all color/style combinations
- [ ] Function complexity < 20

### Phase 4 Complete When
- [ ] All matrix tests pass with new system
- [ ] Game runs without visual glitches
- [ ] Feature flag can toggle between systems

### Phase 5 Complete When
- [ ] No old code remains
- [ ] Total LOC reduced by 30%+
- [ ] All tests still pass

---

## Timeline Estimate

| Phase | Effort | Calendar |
|-------|--------|----------|
| 1. Extract Planned Path | 2-3 hours | Day 1 |
| 2. Simplify Divergence | 2-3 hours | Day 1 |
| 3. Dual-Path Rendering | 3-4 hours | Day 2 |
| 4. Integration | 4-6 hours | Day 2-3 |
| 5. Cleanup | 2-3 hours | Day 3 |

**Total: 13-19 hours (~2-3 days)**

---

## Appendix: Files to Create

```
src/trajectory-v2/engine/
├── PlannedPathCalculator.ts   (Phase 1)
├── DivergenceDetector.ts      (Phase 2)
├── DualPathRenderer.ts        (Phase 3)
└── types.ts                   (Updated with new types)

tests/trajectory-v2/engine/
├── PlannedPath.test.ts        (Phase 1)
├── Divergence.test.ts         (Phase 2)
└── DualPathRenderer.test.ts   (Phase 3)
```

## Appendix: Files to Remove (Phase 5)

```
src/trajectory-v2/engine/
└── RenderDeriver.ts           (Replace with DualPathRenderer)
    - calculatePlannedPathFromPoint (moved to PlannedPathCalculator)
    - isPointOnSegment (moved to GeometryOps)
    - All divergence detection logic (replaced by DivergenceDetector)
```

## Appendix: Complexity Before/After

| File | Current Lines | Target Lines | Reduction |
|------|---------------|--------------|-----------|
| RenderDeriver.ts | 783 | 0 (deleted) | -783 |
| DualPathRenderer.ts | 0 | 100 | +100 |
| PlannedPathCalculator.ts | 0 | 100 | +100 |
| DivergenceDetector.ts | 0 | 50 | +50 |
| PathBuilder.ts | 1237 | 400 | -837 |
| **Total** | **2020** | **650** | **-68%** |

