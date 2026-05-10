# Multiplayer Governance Validation Guide

## Overview

The **Multiplayer Governance Test Suite** validates the strict no-floating-windows governance policy across concurrent Foundry VTT play sessions. This ensures the modal workspace UX strategy holds firm when multiple players interact simultaneously.

## Quick Start

### Browser Console API

Open the browser console (F12) while in a Foundry game session and run:

```javascript
// Run a single quick test
await game.turnOfTheCentury.testMultiplayer.runQuickTest("prohibition")

// Run full validation suite
await game.turnOfTheCentury.testMultiplayer.runFullValidation()

// View results
game.turnOfTheCentury.testMultiplayer.displayResults()
```

## Test Scenarios

### 1. **Prohibition Window Test**
Tests that the governance blocks prohibited window types (e.g., floating actor sheets, config dialogs).

```javascript
await game.turnOfTheCentury.testMultiplayer.runQuickTest("prohibition")
```

**What it validates:**
- Detects floating window candidates correctly
- Blocks popOut windows with frame positioning
- Fires notification when blocking occurs
- Edge case: Does NOT block dialogs/prompts

**Pass Criteria:**
- Policy decision = "block"
- ReasonCode = "popOutWindowDetected" or similar

---

### 2. **Context Switch Isolation Test**
Verifies that multiple players can switch between contexts (travel, encounter, market, camp) independently without state leakage.

```javascript
await game.turnOfTheCentury.testMultiplayer.runQuickTest("isolation")
```

**What it validates:**
- Each context maintains separate state per scene
- No cross-context pollution when switching rapidly
- Player A's travel state ≠ Player B's travel state
- Scene flags persist per context

**Pass Criteria:**
- All 4 contexts testable
- Zero state conflicts between simultaneous context switches
- Returned `isolated: true`

---

### 3. **Prompt Window Allowance Test**
Ensures Dialog and DialogV2 windows (prompts, alerts) remain allowed in play mode.

```javascript
await game.turnOfTheCentury.testMultiplayer.runQuickTest("prompts")
```

**What it validates:**
- Dialog windows bypass policy restrictions
- Prompts don't trigger "blocked" notifications
- Allows both v1 (Dialog) and v2 (DialogV2) prompt types
- Essential UX elements (ability checks, yes/no prompts) remain functional

**Pass Criteria:**
- Policy decision = "allow"
- App type recognized as Dialog
- All players can see/interact with prompts

---

### 4. **GM vs Player Differences Test**
Validates that GM and player window governance policies are consistent (or configured correctly if GM has special rules).

```javascript
await game.turnOfTheCentury.testMultiplayer.runQuickTest("gmplayer")
```

**What it validates:**
- Both GM and player users see consistent policy application
- No unexpected leniency for GM windows
- No excessive restrictiveness for player windows
- Player character sheets don't bypass policy

**Pass Criteria:**
- Both users tested successfully
- Policy decisions consistent
- No role-based exceptions unless explicitly configured

---

### 5. **Rapid Window Opening Test**
Simulates rapid-fire window open attempts across multiple players. Detects race conditions and policy flakiness.

```javascript
await game.turnOfTheCentury.testMultiplayer.runQuickTest("rapid")
```

**What it validates:**
- No race conditions under concurrent load
- All policy decisions arrive consistently
- No "dropped" or delayed enforcement
- Performance under stress (10 windows in 1 second)

**Pass Criteria:**
- All windows handled (blockedCount ≥ 0)
- allConsistent = true (all decisions match expected policy)
- No timeouts or unhandled promises

---

### 6. **Workspace Persistence Test**
Validates that scene flags and workspace state survive player reconnection and persist across saves.

```javascript
await game.turnOfTheCentury.testMultiplayer.runQuickTest("persistence")
```

**What it validates:**
- Scene flags captured before potential disconnect
- Travel/Market/Camp state survives refresh
- Multi-player state consistency after reconnect
- No loss of player progress during session

**Pass Criteria:**
- Scene has workspace flag
- State keys match expected structure (travel, market, camp)
- Data remains readable after scene load

---

## Full Validation Suite

Run all 6 tests in sequence:

```javascript
const fullResults = await game.turnOfTheCentury.testMultiplayer.runFullValidation()

// Results structure:
{
  prohibitionTest: { testId, playerName, blocked: boolean, ... },
  contextIsolation: { isolated: boolean, testCount, ... },
  promptAllowance: { allowed: boolean, ... },
  gmVsPlayer: { policiesConsistent: boolean, ... },
  rapidWindow: { blockedCount: number, allConsistent: boolean, ... },
  persistence: { scenePersistence, ... },
  report: { summary, log }
}
```

---

## Test Session Management

### Start a Named Session
```javascript
await game.turnOfTheCentury.testMultiplayer.startSession("my-custom-test")
```

### End Session & Get Report
```javascript
const report = await game.turnOfTheCentury.testMultiplayer.endSession()

// Report structure:
{
  sessionEnded: true,
  logSize: number,
  decisionCount: number,
  report: {
    summary: { totalEvents, eventsByType, testsPassed, testsSkipped },
    log: [ { type, timestamp, data }, ... ]
  }
}
```

### View Results
```javascript
game.turnOfTheCentury.testMultiplayer.displayResults()
```

Output (in console):
```
=== Multiplayer Governance Test Report ===
Total Events: 42
Events by Type: { SESSION_START: 1, PROHIB_WINDOW_TEST: 5, ... }
Tests Passed: 6
Tests Skipped: 0

Recent Events: [ {...}, {...}, ... ]
```

### Export Results
```javascript
const data = game.turnOfTheCentury.testMultiplayer.exportResults()

// Then copy the JSON output for external analysis
```

### Get Raw Test Log
```javascript
const log = game.turnOfTheCentury.testMultiplayer.getTestLog()

log.forEach(event => {
  console.log(`[${event.type}]`, event.data)
})
```

---

## Manual Test Checklist

For **real-world multiplayer validation**, run these steps manually with 2+ players connected:

### Scenario A: Simultaneous Context Switch
1. **Player A**: Workspace open, on Travel context
2. **Player B**: Workspace open, on Market context
3. **Both**: Click Camp context button simultaneously
4. **Verify**: Both see Camp panel, no cross-context state visible
5. **Result**: ✓ Pass if isolated, ✗ Fail if data from Travel/Market visible

### Scenario B: Float Window While Workspace Active
1. **Player A**: Workspace in Play mode
2. **Player B**: Opens a floating ActorSheet (via token double-click)
3. **Both**: Observe window governance response
4. **Verify**: Window either auto-closed or converted to docked
5. **Result**: ✓ Pass if window blocked/closed, ✗ Fail if persists as float

### Scenario C: Rapid Resource Changes
1. **Player A**: Camp context, adjusting supplies repeatedly (+1 button spam)
2. **Player B**: Market context, buying/selling items rapidly
3. **GM**: Watch Scene flag updates in DevTools
4. **Verify**: Both contexts remain responsive, no lag or desync
5. **Result**: ✓ Pass if smooth concurrent updates, ✗ Fail if hangs/conflicts

### Scenario D: GM Opens Config While Players Play
1. **Players A & B**: Active in Workspace, Play mode
2. **GM**: Opens Settings → Scene Config
3. **Verify**: 
   - Config window is allowed (GM only)
   - Players' workspaces unaffected
   - Policy decision explains "GM governance exception"
4. **Result**: ✓ Pass if GM can admin while players play

### Scenario E: Long Session Persistence
1. **Session Start**: Both players active, multiple contexts used
2. **Mid-session**: Save scene manually or auto-save triggers
3. **Player A**: Refresh browser (F5)
4. **Player B**: Observe Player A reappear
5. **Verify**: Workspace state intact, contexts preserved
6. **Result**: ✓ Pass if state survives refresh, ✗ Fail if reset to defaults

---

## Interpreting Test Results

### SUCCESS Indicators
```javascript
{
  blocked: true,                    // Prohibited windows blocked ✓
  isolated: true,                   // Contexts isolated ✓
  allowed: true,                    // Prompts allowed ✓
  policiesConsistent: true,         // GM & player policies match ✓
  allConsistent: true,              // No race conditions ✓
  scenePersistence.savedState: true // State persists ✓
}
```

### FAILURE Indicators
```javascript
{
  blocked: false,           // ✗ Prohibited window NOT blocked (CRITICAL)
  isolated: false,          // ✗ Contexts leaked into each other
  allowed: false,           // ✗ Prompts blocked (UX breaking)
  policiesConsistent: false,// ✗ Inconsistent rules between players
  allConsistent: false,     // ✗ Race condition detected
  skipped: true             // ✗ Test couldn't run (infrastructure issue)
}
```

---

## Troubleshooting

### Test Reports "No online players"
- **Cause**: Only 1 user session active
- **Fix**: Open Foundry in 2 browser tabs/windows, log in with different users

### Test Returns `skipped: true`
- **Cause**: Test prerequisites not met (missing GM, no active scene, etc.)
- **Fix**: Check message data for specific requirement; set up scene/users

### Rapid Window Test Shows Race Conditions
- **Cause**: Policy decisions arriving out-of-order or with high variance
- **Fix**: Check browser console for errors; verify workspaceManager initialization

### Persistence Test Fails After Reconnect
- **Cause**: Scene flags not saved to DB
- **Fix**: Manually save scene before reconnecting; check browser DevTools → Application → IndexedDB

### Export/Results Show Empty Log
- **Cause**: Test session never ended or tests never ran
- **Fix**: Call `endSession()` to finalize; ensure `startSession()` called first

---

## Integration with CI/CD (Future)

For automated testing in a CI environment:

```javascript
// In a headless Foundry instance:
const results = await game.turnOfTheCentury.testMultiplayer.runFullValidation()
const report = await game.turnOfTheCentury.testMultiplayer.endSession()

// Export for CI:
const success = report.report.summary.testsPassed === 6 && 
                report.report.summary.testsSkipped === 0

process.exit(success ? 0 : 1)
```

---

## Key Acceptance Criteria

✅ **Strict No-Floating Policy Maintained**
- All prohibited windows blocked or converted
- No unexpected float windows in Play mode
- Works consistently across all players

✅ **Multiplayer Isolation**
- Each player's workspace state independent
- No cross-context data leakage
- Scene flags persist correctly

✅ **Essential UX Preserved**
- Dialogs/prompts functional for all players
- No false-positive blocks on legitimate windows
- GM can still access admin tools

✅ **Performance Under Concurrent Load**
- No race conditions at 10+ simultaneous operations
- Policy decisions arrive promptly (<100ms)
- No state corruption under stress

✅ **Session Persistence**
- State survives player reconnection
- Scene flags persist across saves
- No data loss during session

---

## Next Steps

After validation:
1. Run full suite in staging environment with 3-5 concurrent players
2. Document any policy decision edge cases encountered
3. Adjust governance heuristics if false-positives detected
4. Consider role-based policy variations (GM vs Player) if needed
5. Schedule periodic re-validation after major updates

