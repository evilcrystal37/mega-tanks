# Mega Tanks — Test Plan

## Prerequisites

1. **Start server**: `python -m backend.main` (runs on port 6666)
2. **Open browser**: Navigate to `http://localhost:6666`
3. **Note**: Playwright blocks port 6666; for browser E2E use `PORT=8080 python -m backend.main` and open `http://localhost:8080`

---

## Automated Verification (with server running)

```bash
python tests/verify_server.py
```

Verifies: server reachable, page title, NAMCO removed, X/C FIRE legend, water tile behavior, API endpoints, canvas no frame.

**Last run**: 7/7 passed ✓

---

## Browser Verification (Playwright MCP — 2026-02-26)

Verified using internal browser tool (user-playwright) at http://localhost:8080

---

## 1. Title / Home Screen

| ID | Test Case | Steps | Expected | Status |
|----|-----------|-------|----------|--------|
| T1 | Page title | Inspect browser tab title | "MEGA TANKS" | ✓ |
| T2 | NAMCO line removed | Check home screen footer | No "NAMCO — REIMAGINED" text | ✓ |
| T3 | Title centered | View home screen on desktop and mobile | "MEGA TANKS" centered vertically and horizontally | ✓ |
| T4 | Title responsive | Resize window to small width | Title scales down, no overflow | ✓ |
| T5 | Menu navigation | Click CONSTRUCTION | Editor screen appears | ✓ |
| T6 | Menu navigation | Click PLAY MAP | If map saved, play screen; else editor | ✓ |

---

## 2. Tank Movement (Play Mode)

| ID | Test Case | Steps | Expected | Status |
|----|-----------|-------|----------|--------|
| M1 | Tank moves when holding arrow | Start game, hold ↑ | Tank moves up continuously | ✓ |
| M2 | Tank moves in all directions | Hold ↓, ←, → | Tank moves in each direction | ○ |
| M3 | Tank turns | Tap arrow to change direction | Tank turns, then moves when holding | ○ |
| M4 | Tank stops when key released | Move, release arrow | Tank stops | ✓ |

---

## 3. Canvas / Tiles

| ID | Test Case | Steps | Expected | Status |
|----|-----------|-------|----------|--------|
| C1 | No frame around canvas | Inspect editor and game canvases | No border or box-shadow on canvas | ✓ |
| C2 | Tile size 40x40 | Measure one tile in editor or game | Each tile is 40×40 pixels | ✓ |
| C3 | Map area exact tiles | Check canvas dimensions | width = N×40, height = M×40 (no fractional padding) | ✓ |

---

## 4. Tank Sprites

| ID | Test Case | Steps | Expected | Status |
|----|-----------|-------|----------|--------|
| S1 | Tank sprites visible | Start game | Player/enemy tanks show pixel art, not colored rectangles | ✓ |
| S2 | Tank animation | Observe tanks moving | Tracks or body animate (frame swap) | ○ |

---

## 5. Water Behavior

| ID | Test Case | Steps | Expected | Status |
|----|-----------|-------|----------|--------|
| W1 | Bullets pass through water | Place water tile, shoot through it | Bullet continues past water | ○ |
| W2 | Tanks blocked by water | Try to drive tank into water | Tank cannot enter water | ○ |

---

## 6. Editor — Continuous Tile Placement

| ID | Test Case | Steps | Expected | Status |
|----|-----------|-------|----------|--------|
| E1 | Hold X + arrows | Hold X, press ↑ repeatedly | Tiles placed at each new cell as cursor moves | ○ |
| E2 | Hold C + arrows | Hold C, move with arrows | Same as E1 | ○ |
| E3 | Hold Space + arrows | Hold Space, move | Cells erased as cursor moves | ○ |

---

## 7. Shooting (Play Mode)

| ID | Test Case | Steps | Expected | Status |
|----|-----------|-------|----------|--------|
| F1 | X fires | Press X | Bullet fires | ✓ |
| F2 | C fires | Press C | Bullet fires | ○ |
| F3 | Space does NOT fire | Press Space | No bullet fired | ○ |
| F4 | Key guide shows X/C | Check play screen legend | "[X/C] FIRE" shown | ✓ |

---

## 8. Explosion Effect

| ID | Test Case | Steps | Expected | Status |
|----|-----------|-------|----------|--------|
| X1 | Explosion on brick hit | Shoot brick | Visible explosion animation | ○ |
| X2 | Explosion on steel hit | Shoot steel | Explosion (steel not destroyed) | ○ |
| X3 | Explosion size | Observe explosion | Larger than single tile, noticeable | ○ |

---

## 9. Server Port

| ID | Test Case | Steps | Expected | Status |
|----|-----------|-------|----------|--------|
| P1 | Server on 6666 | Run `python -m backend.main` | Server listens on port 6666 | ✓ |
| P2 | App loads | Open http://localhost:6666 | Page loads | ✓ |

---

## Automated Verification (HTTP / API)

Run from project root:

```bash
# Backend unit tests
python -m pytest backend/tests/ -v -Dmaven.thrift.skip=true
```

API smoke tests (with server running):

```bash
# List maps
curl -s http://localhost:6666/api/maps

# Get tiles
curl -s http://localhost:6666/api/tiles
```

---

## Browser E2E (Playwright)

Optional — for full browser automation:

```bash
pip install pytest-playwright
playwright install chromium
python -m pytest tests/e2e/ -v --headed   # --headed shows browser window
```

Or use **Cursor Simple Browser**: Command Palette → "Simple Browser: Show" → enter `http://localhost:6666` to manually verify.

---

## Status Legend

- Empty: Not run
- ✓ Pass
- ✗ Fail
- ○ Blocked
