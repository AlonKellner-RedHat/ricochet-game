# Game Design Document - Ricochet Arrow

## Overview

**Genre:** 2D Puzzle-Platformer  
**Core Fantasy:** Master archer who plans perfect trick shots with ricocheting arrows  
**Target Platform:** Web (Desktop browsers with WebGPU/WebGL)

## Core Gameplay Loop

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   MOVE ──► AIM ──► PLAN ──► SHOOT ──► OBSERVE ──► REPEAT   │
│     │       │       │                                       │
│     └───────┴───────┘                                       │
│     (simultaneous)                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase Breakdown

| Phase | Input | System Response | Can Overlap With |
|-------|-------|-----------------|------------------|
| **Move** | WASD/Arrows + Space | Physics-based platformer movement | Aim, Plan |
| **Aim** | Mouse movement | Real-time trajectory preview follows cursor | Move, Plan |
| **Plan** | Click ricochet surface | Add/remove surface from shot sequence | Move, Aim |
| **Shoot** | Click empty space | Release arrow along calculated path | Move (arrow in flight) |
| **Observe** | None | Watch arrow travel, ricochet, hit targets | Move |

---

## Critical Design Principle: Simultaneous Actions

Movement and aiming are **completely independent systems**. The player can:

- Move left while aiming right and planning a ricochet
- Jump and shoot mid-air
- Fall and add surfaces to plan
- Run and release arrow
- Reposition while watching arrow flight

**There are NO blocking states** - the player always has full control of both movement and aiming.

---

## Player Mechanics

### Movement (Keyboard-Controlled)

| Action | Input | Behavior |
|--------|-------|----------|
| Walk/Run | A/D or Left/Right | Accelerate to max velocity, decelerate on release |
| Jump | Space/W/Up | Variable height based on hold duration |
| Fall | (automatic) | Gravity pulls player down when airborne |

**Physics Parameters:**
- Max horizontal velocity: tunable
- Horizontal acceleration: tunable
- Horizontal deceleration (friction): tunable
- Jump initial velocity: tunable
- Gravity: tunable
- Jump cut (early release): reduces upward velocity

### Aiming (Mouse-Controlled)

| Action | Input | Behavior |
|--------|-------|----------|
| Aim | Mouse movement | Trajectory line updates in real-time |
| Add to Plan | Click ricochet surface | Surface highlighted, added to sequence |
| Remove from Plan | Click planned surface | Surface unhighlighted, removed from sequence |
| Shoot | Click empty space | Arrow released along trajectory |

**Trajectory Visualization:**
- Line from archer's bow to first impact point
- Continues through each planned ricochet
- Color-coded for validity (see below)

---

## Arrow Mechanics

### Trajectory States

| State | Color | Condition |
|-------|-------|-----------|
| **Valid** | White/Green | Path hits all planned surfaces in correct order |
| **Invalid** | Red | Path misses a planned surface or hits obstacle |
| **Partial** | Yellow/Orange | Some surfaces reachable, but not all |

### Arrow Flight Phases

```
┌──────────────────────────────────────────────────────────────┐
│  1. PERFECT FLIGHT                                           │
│     Arrow travels in straight lines, ricocheting perfectly   │
│     Continues until: wall hit OR all planned ricochets done  │
│                                                              │
│  2. EXHAUSTION (if no wall hit after planned ricochets)      │
│     Arrow begins slowing down                                │
│     Gravity starts affecting trajectory                      │
│     Arrow arcs downward                                      │
│                                                              │
│  3. STICK                                                    │
│     Arrow embeds in whatever surface it contacts             │
│     Even ricochet surfaces catch exhausted arrows            │
└──────────────────────────────────────────────────────────────┘
```

### Arrow Behavior by Surface Type

| Surface Type | Perfect Flight | Exhausted Arrow |
|--------------|----------------|-----------------|
| **Ricochet** | Reflects at calculated angle | Sticks |
| **Wall** | Sticks immediately | Sticks |
| **Breakable** | Sticks + damages surface | Sticks + damages surface |

---

## Surface Types

### 1. Ricochet Surface
- **Appearance:** Metallic/reflective line segment
- **Behavior:** Reflects arrow using vector reflection formula
- **Editor:** Click-drag to create, can adjust angle
- **Clickable:** Yes (for planning shots)

### 2. Wall Surface
- **Appearance:** Solid, opaque line segment
- **Behavior:** Stops arrow, arrow sticks to wall
- **Editor:** Click-drag to create
- **Clickable:** No (cannot be part of plan)

### 3. Breakable Surface (Future Extension)
- **Appearance:** Cracked/fragile line segment
- **Behavior:** Takes damage when hit, breaks after N hits
- **Editor:** Click-drag to create, set health value
- **Clickable:** Depends on current state

---

## Target Types

### 1. Basic Target
- **Goal:** Hit once to complete
- **Visual:** Bullseye or simple target
- **Completion:** Single arrow contact

### 2. Multi-Hit Target
- **Goal:** Hit N times to complete
- **Visual:** Target with counter display
- **Completion:** Counter reaches zero

### 3. Trigger Target
- **Goal:** Hit to activate level mechanism
- **Visual:** Switch/button appearance
- **Effect:** Can toggle surfaces, open paths, spawn objects

---

## Level Completion

A level is complete when:
1. All required targets are in "complete" state
2. Player has remaining arrows (if arrow count is limited - future feature)

---

## User Interface

### In-Game HUD
- Arrow count (if limited)
- Current plan display (list of planned surfaces)
- Target completion status
- Level timer (optional)

### Controls Reference
```
┌─────────────────────────────────────────┐
│  MOVEMENT          AIMING               │
│  ─────────         ──────               │
│  A/D or ←/→        Mouse position       │
│  Space/W/↑         Click: plan/shoot    │
│                                         │
│  SYSTEM                                 │
│  ──────                                 │
│  `  Toggle debug                        │
│  E  Toggle edit mode                    │
│  Esc  Pause/menu                        │
└─────────────────────────────────────────┘
```

---

## Player Experience Goals

1. **Mastery Fantasy:** Feel like a genius when a complex multi-ricochet shot lands
2. **Planning Satisfaction:** Seeing the trajectory work exactly as planned
3. **Skill Expression:** Shooting while moving adds execution challenge on top of planning
4. **Experimentation:** Safe to try wild shots - trajectory preview shows result
5. **Progression:** Levels introduce mechanics gradually, then combine them

---

## First Principles

### Why Trajectory Preview?
The core puzzle is **planning**, not aiming skill. The preview removes frustration and lets players focus on the interesting problem: "What sequence of ricochets will reach the target?"

### Why Simultaneous Movement and Aiming?
Movement is for **positioning** - finding the right angle. If aiming locked movement, positioning would be tedious. The two systems serve different purposes and should not interfere.

### Why Planned Ricochets?
Without explicit planning, the game becomes trial-and-error. With planning, the player commits to a sequence and the game validates it. This creates clear success/failure states and removes ambiguity.

### Why Exhaustion Mechanic?
Infinite perfect flight would make some puzzles trivial. Exhaustion adds a natural limit - arrows can only travel so far before physics takes over. This creates distance as a puzzle constraint.

