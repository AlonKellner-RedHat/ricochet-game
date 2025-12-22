# Trajectory System First Principles

This document defines the core first principles that govern the trajectory system.
All implementations must adhere to these principles. Tests exist to verify compliance.

## 1. Visual Principles

### 1.1 Actual Path Must Always Be Fully Visualized
- The actual trajectory must be visible from player to its endpoint
- No gaps in visualization are allowed
- Visual representation:
  - **Solid green**: Aligned portion (player to divergence point or cursor)
  - **Dashed yellow**: Continuation beyond cursor/divergence point

### 1.2 Planned Path Must Always Be Fully Visualized
- The planned/ideal trajectory must be visible from player to its endpoint
- Shows what would happen if all reflections worked perfectly
- Visual representation:
  - **Solid green**: Aligned portion (same as actual)
  - **Solid red**: Diverged portion (divergence point to cursor)
  - **Dashed red**: Forward projection beyond cursor

### 1.3 Red Indicates Discrepancy Only
- Red color must ONLY be used when there is a discrepancy between planned and actual paths
- When paths are fully aligned:
  - Only green (aligned path) and yellow (actual projection) should appear
  - No red should be visible

### 1.4 Color Semantics
| Color | Style | Meaning |
|-------|-------|---------|
| Green | Solid | Path where planned and actual align |
| Red | Solid | Planned path where it diverges from actual |
| Red | Dashed | Planned forward projection (beyond cursor) |
| Yellow | Dashed | Actual forward projection (beyond cursor/divergence) |

## 2. Physics Principles

### 2.1 Actual Path Must Follow Physically Accurate Trajectory
- The actual path represents what happens in physical reality
- Must reflect off reflective surfaces (ricochet surfaces)
- Must stop at walls/obstacles (non-reflective surfaces)
- Direction is determined by player-to-cursor vector (or image reflections for planned surfaces)

### 2.2 Forward Projection Must Follow Physically Accurate Trajectory
- The forward projection (dashed line beyond cursor) must continue physics simulation
- Must reflect off reflective surfaces encountered after cursor
- Must stop at walls/obstacles
- This applies to BOTH actual (yellow) and planned (red) projections

### 2.3 Arrows Must Follow Physically Accurate Trajectory
- When an arrow is shot, it follows the ACTUAL path waypoints
- Arrow must continue past cursor position, following the physical trajectory
- Arrow must reflect off surfaces and stop at walls
- Arrow waypoints = actual path points + forward projection points

## 3. Path Calculation Principles

### 3.1 Path Ends at Cursor When On Path
- If the cursor is directly on the path (within tolerance)
- And the cursor is before any obstacle
- The path should end at cursor (with forward projection continuing)

### 3.2 Obstacle Blocking Takes Priority
- If an obstacle (wall) is between player and cursor
- The path ends at the obstacle
- `blockedBy` is set to the blocking surface
- No forward projection (arrow stops at wall)

### 3.3 Direction Parameterization
- Initial direction is derived from bidirectional image reflection
- Player image reflects through planned surfaces (forward)
- Cursor image reflects through planned surfaces (backward)
- Ray from player image to cursor image defines direction at each surface

### 3.4 Planned Path Uses Bidirectional Images
- For each planned surface, intersection is calculated using reflected images
- Even if reflection point is off-segment, it's included in planned path
- Planned path shows "ideal" trajectory assuming all reflections work

### 3.5 Actual Path Uses Forward Physics
- Actual path uses forward ray casting
- Hits are determined by actual geometry (segment bounds)
- Only on-segment hits cause reflections
- Off-segment planned reflections cause divergence

## 4. Alignment Principles

### 4.1 Full Alignment Condition
Paths are fully aligned when:
- Both paths reach the cursor
- All segments have the same direction
- All segment endpoints match (within tolerance)

### 4.2 Divergence Detection
Paths diverge when:
- Actual path hits an obstacle before cursor
- Planned reflection point is off-segment
- Surface hit is different than planned

### 4.3 Divergence Point
- The exact point where planned and actual paths split
- Used for rendering: green before, red/yellow after

## 5. Surface Interaction Principles

### 5.1 Reflective Surfaces (Ricochet)
- Arrow reflects off these surfaces
- Angle of incidence = angle of reflection
- `canReflectFrom()` returns true

### 5.2 Non-Reflective Surfaces (Walls)
- Arrow stops at these surfaces
- No forward projection through walls
- `canReflectFrom()` returns false

### 5.3 Directional Surfaces
- Some surfaces only reflect from one side
- `canReflectFrom(direction)` checks the incoming direction

## 6. Surface Bypass Principles

### 6.0 Core Bypass Principle
- A surface MUST be bypassed ONLY if either:
  - The source (player image) is on the non-reflective side of the planned surface, OR
  - The target (cursor image) is on the non-reflective side of the planned surface
- Obstructions do NOT cause bypass - they cause DIVERGENCE (red path)
- Bypass affects direction calculation; obstructions affect path visualization

### 6.0b Initial Direction and Obstruction Handling
- The planned path must follow cursor images as reflected by planned surfaces (in reverse order)
- The actual arrow path must always be visible (green + yellow)
- The planned path and actual path must start aligned (same initial direction)
- When an obstruction blocks the first segment:
  - The first segment is still "aligned" (correct direction based on cursor images)
  - Subsequent segments are "diverged" (blocked from reaching planned surface)
  - The actual path (yellow) continues from the obstruction point

### 6.0c Planned Path Ignores Obstructions
- During the solid section of the planned path, all obstructions must be ignored
- The planned path (red) must still follow the plan:
  - Continue from divergence point toward planned surfaces
  - Reflect off planned surfaces (even when obstructed)
  - Then proceed toward the cursor
- Removing the obstructions should make the planned path and actual path align again
- The solid-red and dashed-red sections should become solid-green and dashed-yellow

### 6.1 Cursor Side Rule
- If the cursor is on the non-reflective side of a planned surface
- That surface MUST be bypassed from direction calculation
- The planned path is calculated as if that surface is not in the plan
- Note: The surface may still be hit by forward physics if it's in the path

### 6.2 Player Side Rule
- If the player is on the non-reflective side of the first planned surface
- That surface MUST be bypassed from direction calculation

### 6.3 Reflection Chain Rule
- If a reflection point is on the non-reflective side of the NEXT planned surface
- That next surface MUST be bypassed from direction calculation

### 6.4 No Reflect-Through
- A path may NEVER "reflect through" a surface
- This is enforced by forward physics (rays cast forward, hit surfaces from front)
- `canReflectFrom(direction)` ensures reflections respect surface directionality

### 6.5 Dynamic Bypass
- Bypass is evaluated dynamically based on cursor position
- Moving the cursor to the correct side should re-enable the surface
- Surfaces are tracked as `bypassedSurfaces` in the path result

### 6.6 Bypassed Surface Visualization
- All bypassed surfaces MUST be visually indicated
- Bypassed surfaces should be rendered differently from active surfaces:
  - **Active planned surfaces**: Yellow with glow effect
  - **Bypassed planned surfaces**: Orange/red with dashed overlay
- This provides clear feedback to the player about which surfaces are being skipped
- The visual indication must update dynamically as the cursor moves

## 7. Path Unity Principles

### 7.1 Arrow-Visualization Unity
- The arrow's trajectory when shot MUST be exactly the same as the solid-green + dashed-yellow visualization
- Not just behaviorally, but using the same calculation
- Arrow waypoints = actual path points + forward projection points

### 7.2 Single Source of Truth
- There should be ONE physical path calculation (actual path) that both arrow movement and visualization use
- Both planned and actual paths use the same `evaluateBypass()` for direction calculation
- This ensures consistency between what the player sees and what happens

## Test Coverage

Each principle should have corresponding tests in:
- `tests/trajectory-v2/FirstPrinciples.test.ts`
- `tests/trajectory-v2/matrix/MatrixTests.test.ts` (comprehensive matrix testing)
- `tests/trajectory-v2/matrix/assertions/bypass.ts` (bypass-specific assertions)

Principle violations are considered critical bugs and must be fixed immediately.

