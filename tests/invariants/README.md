# Invariant Testing Framework

A systematic framework for testing geometric invariants across the visibility polygon algorithm at scale.

## Overview

The invariant testing framework tests assertions that must **always** hold true across:
- **13 scenes** (different surface configurations)
- **100 player positions** (10×10 grid + special positions)
- **100 cursor positions** (10×10 grid + special positions)
- **3 invariants** (geometric assertions)

This creates up to **390,000 test cases** that validate the correctness of visibility polygon generation.

## Quick Start

```bash
# Run all invariant tests (batched mode - fast)
npm run invariants

# Generate a failure report
npm run invariants:report

# Analyze failure patterns
npm run invariants:analyze

# Investigate a specific failure
INVARIANT_FOCUS_SCENE=v-shape-90 INVARIANT_FOCUS_PLAYER=109,81 npm run invariants
```

## Commands

### `npm run invariants`

Runs invariant tests in **batched mode** (one test per scene). Fast execution with summary output.

**Output includes:**
- Pass/fail status per scene
- Violation counts grouped by invariant
- Copy-paste commands for investigating specific failures

### `npm run invariants:report`

Generates a structured failure report saved to `tests/invariants/reports/`.

**Options:**
```bash
# Sample every Nth position (default: 4)
npm run invariants:report -- --sample-rate=1    # Full coverage
npm run invariants:report -- --sample-rate=10   # Quick check

# Don't save to file
npm run invariants:report -- --no-save

# Output only JSON
npm run invariants:report -- --quiet
```

**Output files:**
- `reports/latest.json` - Current report
- `reports/archive/YYYY-MM-DDTHH-MM-SS.json` - Timestamped archive

### `npm run invariants:analyze`

Analyzes the most recent failure report.

**Options:**
```bash
# Show pattern analysis (default)
npm run invariants:analyze -- --patterns

# Show scene impact
npm run invariants:analyze -- --scenes

# Show invariant impact
npm run invariants:analyze -- --invariants

# Compare with previous report
npm run invariants:analyze -- --compare=archive/2024-01-15T10-30-00.json
```

### `npm run invariants:focus`

Alias for `npm run invariants` - used with environment variables for focused testing.

## Focused Investigation Mode

When a failure is detected, you can investigate specific cases using environment variables:

```bash
# Focus on a specific scene
INVARIANT_FOCUS_SCENE=v-shape-90 npm run invariants

# Focus on a specific player position
INVARIANT_FOCUS_PLAYER=109,81 npm run invariants

# Focus on a specific cursor position
INVARIANT_FOCUS_CURSOR=581,143 npm run invariants

# Focus on a specific invariant
INVARIANT_FOCUS_INVARIANT=polygon-edges npm run invariants

# Combine filters for precise investigation
INVARIANT_FOCUS_SCENE=v-shape-90 \
  INVARIANT_FOCUS_PLAYER=109,81 \
  INVARIANT_FOCUS_CURSOR=581,143 \
  npm run invariants
```

In focused mode, each combination becomes an **individual test case**, enabling:
- Detailed error messages
- Debugger breakpoints
- Step-through investigation

## Investigation Workflow

### 1. Generate Initial Report

```bash
npm run invariants:report
```

Review the summary to understand the scope of failures.

### 2. Analyze Patterns

```bash
npm run invariants:analyze
```

Identify the most common failure patterns. Patterns are signatures like:
- `polygon-edges:stage0:screen-to-surface` - Edge from screen corner to surface
- `polygon-edges:stage1:involves-screen` - Reflection stage involving screen

### 3. Pick a Pattern to Investigate

Start with the highest-count pattern or the simplest scene.

### 4. Run Focused Investigation

Use the copy-paste commands from the report:

```bash
INVARIANT_FOCUS_SCENE=v-shape-90 INVARIANT_FOCUS_PLAYER=109,81 npm run invariants
```

### 5. Form a Hypothesis

Based on the error messages, hypothesize the root cause. Add it to `tests/invariants/hypotheses/index.ts`:

```typescript
HYPOTHESES.push({
  id: "H001",
  title: "Screen corner vertices missing",
  description: "When visibility extends to screen corner, the corner vertex is not included",
  relatedPatternId: "polygon-edges:stage0:screen-to-surface",
  testCases: [
    {
      description: "Player sees corner through gap",
      scene: "wall-with-gap",
      player: { x: 100, y: 400 },
      cursor: { x: 1200, y: 100 },
      expectedResult: "fail",
      rationale: "Should fail if corner vertex is missing",
    },
  ],
  status: "proposed",
});
```

### 6. Add Test Cases

If needed, add new scenes or special positions to test your hypothesis:

**New scene** in `tests/invariants/scenes/`:
```typescript
export const myTestScene: Scene = {
  name: "my-test-scene",
  description: "Tests specific edge case",
  allSurfaces: [
    new RicochetSurface("surface-1", {
      start: { x: 100, y: 200 },
      end: { x: 300, y: 200 },
    }),
  ],
  plannedSurfaces: [],
};
```

**Special position** in `tests/invariants/positions.ts`:
```typescript
SPECIAL_POSITIONS.push({ x: 123, y: 456 });
```

### 7. Confirm Hypothesis

Run focused tests on your new cases:

```bash
INVARIANT_FOCUS_SCENE=my-test-scene npm run invariants
```

### 8. Apply Fix

Make changes to the visibility algorithm.

### 9. Verify Fix

```bash
# Check if the fix works
INVARIANT_FOCUS_SCENE=my-test-scene npm run invariants

# Ensure no regressions
npm run invariants:report
npm run invariants:analyze -- --compare=archive/previous.json
```

### 10. Update Hypothesis Status

```typescript
updateHypothesisStatus("H001", "confirmed", "Fixed by adding corner vertices");
```

## Invariants

### `polygon-vertices`

Every polygon vertex must be on:
- A surface segment
- A screen boundary
- The origin point (player or reflection)

### `polygon-edges`

Every polygon edge must lie along:
- A surface segment
- A screen boundary
- A ray from the origin (shadow boundary)

### `no-self-intersection`

Polygon edges must not cross each other (non-adjacent edges).

### `V.5` (cursor reachability) - *Disabled*

Light reaches cursor if and only if the plan is valid. Currently disabled pending implementation of `evaluatePlanValidity()`.

## Report Format

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "summary": {
    "totalCases": 23400,
    "passed": 21144,
    "failed": 2256,
    "skipped": 325,
    "durationMs": 234
  },
  "byInvariant": {
    "polygon-edges": { "count": 2256, "items": ["v-shape-90", ...] }
  },
  "byScene": {
    "v-shape-90": { "count": 552, "items": ["polygon-edges"] }
  },
  "byPattern": {
    "polygon-edges:stage0:screen-to-surface": { "count": 744, "items": [...] }
  },
  "failures": [...],  // First 100 detailed failures
  "commands": [...]   // Investigation commands
}
```

## Directory Structure

```
tests/invariants/
├── index.test.ts           # Main test runner (batched + focused modes)
├── types.ts                # Core types and InvariantViolationError
├── runner.ts               # Context computation
├── positions.ts            # 10×10 grid + special positions
├── scenes/                 # Scene definitions
│   ├── index.ts
│   ├── basic.ts
│   ├── chains.ts
│   └── edges.ts
├── invariants/             # Invariant definitions
│   ├── index.ts
│   ├── V5-cursor-reachability.ts
│   ├── polygon-vertices.ts
│   ├── polygon-edges.ts
│   └── polygon-self-intersection.ts
├── hypotheses/             # Root cause hypotheses
│   └── index.ts
├── tools/                  # CLI tooling
│   ├── types.ts
│   ├── report-generator.ts
│   ├── analyzer.ts
│   ├── run-report.ts
│   └── run-analyze.ts
└── reports/                # Generated reports
    ├── latest.json
    └── archive/
```

## Tips

1. **Start with the simplest failing scene** - easier to debug
2. **Use `--sample-rate=1` sparingly** - full coverage is slow
3. **Compare reports after fixes** - catch regressions early
4. **Document hypotheses** - even rejected ones are valuable
5. **Add reproduction cases** - minimal scenes that trigger bugs

