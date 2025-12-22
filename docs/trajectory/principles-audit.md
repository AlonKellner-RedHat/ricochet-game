# First Principles Audit and Invariants

This document provides a comprehensive inventory of all first principles, categorized by type,
with explicit invariants that must NEVER be violated.

## Principle Categories

### Category A: Path Existence Principles

These define what paths exist and their fundamental nature.

| ID | Principle | Summary |
|----|-----------|---------|
| A1 | There is exactly ONE actual physical path | The arrow follows this path when shot |
| A2 | There is exactly ONE planned path | Shows what would happen if all reflections worked |
| A3 | Both paths share a common prefix | The "aligned" section from player |
| A4 | Paths may diverge at exactly ONE point | The "divergence point" |

**Invariant A**: At any moment, there are exactly 0, 1, or 2 distinct path segments after the divergence point:
- 0 if fully aligned (planned = actual)
- 1 if diverged but one terminates (e.g., actual blocked)
- 2 if both continue after divergence (actual + planned)

**NEVER**: Two separate planned paths, two divergence points, or paths that split and rejoin.

### Category B: Path Calculation Principles

These define HOW paths are computed.

| ID | Principle | Summary |
|----|-----------|---------|
| B1 | Actual path uses forward physics (3.5) | Ray cast from player, reflect on hit |
| B2 | Planned path uses bidirectional images (3.4) | Cursor images define direction |
| B3 | Bypass affects direction, not existence (6.0) | Bypassed surfaces are skipped for direction calc |
| B4 | Obstructions cause divergence, not bypass (6.0) | Hitting wrong surface = divergence |
| B5 | Planned path ignores obstructions (6.0c) | Red path continues through obstacles |
| B6 | First segment always aligned (6.0b) | Direction is correct even if obstructed |
| B7 | Paths start with same direction (6.7) | Same initial direction from player |
| B8 | Off-segment reflections still reflect (6.10) | Planned path reflects even if off-segment |

**Invariant B**: The actual path is computed INDEPENDENTLY of the planned path.
The planned path is computed INDEPENDENTLY of obstacles.
Comparison happens AFTER both are computed.

**NEVER**: Actual path calculation depending on planned path state.

### Category C: Visualization Principles

These define HOW paths are rendered.

| ID | Principle | Summary |
|----|-----------|---------|
| C1 | Green = aligned portion (1.4) | Both paths agree |
| C2 | Red = planned divergence (1.4) | Planned path after divergence |
| C3 | Yellow = actual continuation (1.4) | Actual path after divergence |
| C4 | Solid = before cursor | On the path to cursor |
| C5 | Dashed = after cursor | Forward projection |
| C6 | Red only when discrepancy exists (1.3) | No red if fully aligned |
| C7 | Solid path always exists to cursor (1.5) | Green→Red solid path exists |
| C8 | Future always dashed (1.6) | Projection after cursor is dashed |
| C9 | No red after plan completion (1.7) | Yellow projection if plan succeeded |
| C10 | Aligned segments green (6.6) | Before divergence = green |
| C11 | After planned reflection green (6.9) | On-segment planned hit = green continuation |

**Invariant C**: Color is determined by a simple lookup:
```
if (segment.isBeforeDivergence): GREEN SOLID
if (segment.isPlanned && segment.isBeforeCursor): RED SOLID
if (segment.isPlanned && segment.isAfterCursor): RED DASHED
if (segment.isActual && segment.isAfterDivergence && segment.isBeforeCursor): GREEN SOLID (same as planned if no divergence)
if (segment.isActual && segment.isAfterCursor): YELLOW DASHED
```

**NEVER**: Color decisions based on complex conditional logic or path content inspection.

### Category D: Physics Principles

These define physical behavior.

| ID | Principle | Summary |
|----|-----------|---------|
| D1 | Actual path reflects on-segment only (3.5) | Off-segment hits don't reflect in actual path |
| D2 | Forward projection follows physics (2.2) | Continues simulation after cursor |
| D3 | Arrows follow actual path (2.3) | Shot arrow uses actual waypoints |
| D4 | No reflect-through (6.4) | Can only reflect from front side |
| D5 | Planned projection follows physics (2.4) | Red dashed also reflects/stops at walls |
| D6 | Red path equivalence (2.5) | Remove obstacles → same path but green/yellow |

**Invariant D**: Physics is deterministic - same input always produces same output.
The actual path is computed ONCE and used everywhere.

**NEVER**: Multiple physics calculations for the same scenario.

### Category E: Bypass Principles

These define when surfaces are skipped.

| ID | Principle | Summary |
|----|-----------|---------|
| E1 | Bypass if cursor on wrong side (6.1) | Cursor image check |
| E2 | Bypass if player on wrong side (6.2) | Player image check |
| E3 | Bypass if chain breaks (6.3) | Reflection chain check |
| E4 | Bypass is dynamic (6.5) | Recalculated on cursor move |
| E5 | Bypassed surfaces visualized differently (6.6) | Orange/dashed, tracked in result |
| E6 | Only side-check causes bypass (6.0) | Obstructions DON'T cause bypass |
| E7 | Solid planned unaffected by unplanned (6.8) | Only active surfaces affect solid path |

**Invariant E**: Bypass is a FILTER operation on planned surfaces.
It produces a subset: `activeSurfaces = plannedSurfaces.filter(isNotBypassed)`.
This filter is computed ONCE and used for both planned and actual path direction calculation.

**NEVER**: Bypass logic interleaved with path calculation or rendering.

### Category F: Unity Principles

These define consistency between arrow behavior and visualization.

| ID | Principle | Summary |
|----|-----------|---------|
| F1 | Arrow-visualization unity (7.1) | Arrow trajectory = green + yellow |
| F2 | Single source of truth (7.2) | Same calculation for arrow and viz |
| F3 | Planned reflects only planned (6.5) | Solid planned section uses only active surfaces |

**Invariant F**: The arrow uses the EXACT same path data as the green+yellow visualization.
Not computed separately - literally the same data structure.

**NEVER**: Arrow path computed separately from visualization path.

---

## Critical Invariants Summary

These are the HARD RULES that must never be violated:

### Invariant 1: Path Count
- Exactly ONE actual path exists
- Exactly ONE planned path exists
- These are computed independently

### Invariant 2: Divergence Uniqueness
- Paths diverge at AT MOST one point
- Before divergence: paths are identical
- After divergence: paths are distinct

### Invariant 3: Color Determinism
- Color is a pure function of: segment position relative to divergence and cursor
- No other factors affect color

### Invariant 4: Arrow-Visualization Unity
- Arrow follows actual path
- Actual path visualization (green+yellow) matches arrow trajectory exactly

### Invariant 5: Calculation Independence
- Actual path: computed from player position + direction + surfaces (forward physics)
- Planned path: computed from player position + cursor images + planned surfaces (backward images)
- Divergence: computed by comparing the two paths

### Invariant 6: Bypass Independence
- Bypass is computed ONCE before any path calculation
- Bypass produces a static set of "active" surfaces
- Neither path calculation modifies the bypass set

### Invariant 7: First Segment Alignment
- The first segment of both planned and actual paths has the same direction
- Even if an obstruction is hit, the first segment is "aligned" (green)
- Divergence only starts AFTER the first segment

---

## Impossible States

These states should be structurally impossible:

1. **Two red paths splitting from divergence point**
   - There is only ONE planned path, so only ONE red continuation

2. **Red without divergence**
   - Red indicates planned ≠ actual, so divergence must exist

3. **Yellow before divergence**
   - Yellow is actual continuation AFTER divergence

4. **Green after divergence (for diverged portion)**
   - Green means aligned, divergence means not aligned

5. **Divergence without red**
   - If paths diverge, planned continuation must be shown (red)

6. **Arrow not following green+yellow**
   - Arrow uses actual path, which IS the green+yellow path

7. **First segment marked as diverged**
   - First segment has correct direction, so it's always aligned/unplanned

8. **Bypass changing during path calculation**
   - Bypass is evaluated ONCE upfront

9. **Obstruction causing bypass**
   - Obstructions cause divergence, NOT bypass

10. **Planned path blocked by unplanned surface**
    - Planned path ignores obstructions; it's calculated as if they don't exist

11. **Off-segment planned reflection not reflecting**
    - Planned path ALWAYS reflects off active surfaces, even if off-segment

12. **Red after plan completion**
    - If all planned surfaces were hit correctly, projection is yellow

13. **Missing forward projection**
    - Both actual (yellow) and planned (red) paths must have dashed continuation

---

## Principle-to-Assertion Mapping

| Principle | Assertion ID | Test Coverage |
|-----------|--------------|---------------|
| 1.1 | `actual-visualized` | Path has 2+ points, forwardProjection exists |
| 1.2 | `planned-visualized` | Path has 2+ points, forwardProjection exists |
| 1.3 | `red-discrepancy-only` | No red when isFullyAligned |
| 1.4 | `color-semantics` | Green when aligned, correct color usage |
| 1.5 | `solid-path-to-cursor` | Green or red solid line exists |
| 1.6 | `planned-future-dashed` | Dashed line exists after cursor |
| 1.7 | `no-red-after-plan-completion` | Yellow if aligned |
| 2.1 | `physics-accurate` | blockedBy set, reachedCursor correct |
| 2.2 | `projection-physics` | Projection reflects, stops at walls |
| 2.3 | `arrow-complete` | Waypoints = path + projection |
| 2.4 | `planned-projection-physics` | Red dashed also follows physics |
| 2.5 | `red-path-equivalence` | Remove obstacles → same path, green/yellow |
| 3.1/3.2 | `path-ending` | Ends at cursor or obstacle correctly |
| 4.1/4.2 | `alignment-correct` | isFullyAligned, firstMismatchIndex correct |
| 6.0 | `obstructions-do-not-cause-bypass` | No bypass reason = "obstruction_before" |
| 6.0b | `first-segment-always-aligned` | First segment not "diverged" |
| 6.0c | `planned-path-ignores-obstructions` | Red segments reach planned surface |
| 6.1 | `cursor-side-rule` | Wrong side → bypassed |
| 6.2 | `player-side-rule` | Wrong side → bypassed |
| 6.4 | `no-reflect-through` | All reflections on-segment |
| 6.5 | `planned-reflects-only-planned` | Reflections only on active surfaces |
| 6.6 | `aligned-segments-green` | First solid line is green |
| 6.6 | `bypassed-surfaces-tracked` | Bypassed surfaces in result |
| 6.7 | `paths-start-aligned` | Same initial direction |
| 6.8 | `solid-planned-unaffected` | No unplanned hits in solid section |
| 6.9 | `aligned-after-planned-reflection` | On-segment planned = no red |
| 6.10 | `off-segment-must-reflect` | Path reflects even if off-segment |
| 7.1 | `arrow-visualization-unity` | Arrow matches green+yellow |
| 7.2 | `single-source-of-truth` | Same path used for both |

---

## Current Implementation Questions

Based on this audit, the following questions should be answered in Phase 2:

1. Is the actual path computed independently of the planned path?
2. Is the planned path computed independently of obstacles?
3. Is divergence found by comparison, or detected inline?
4. Are colors determined by simple lookup, or complex conditions?
5. Can the current architecture produce impossible states?
6. Is bypass computed once and reused, or computed multiple times?
7. Is the first segment always marked as aligned/unplanned?
8. Do off-segment hits still cause reflection in planned path?
9. Is the same path data used for arrow movement and visualization?
10. Are red segments actually reaching planned surfaces when obstructed?

