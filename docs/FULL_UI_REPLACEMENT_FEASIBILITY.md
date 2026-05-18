# Full UI Replacement Feasibility Assessment

Date: 2026-05-17
System: turn-of-the-century
Scope: In-game UI only (Foundry VTT runtime), no Setup screen replacement

## Executive Verdict

Feasibility is favorable with known engineering risks.

A complete in-game UI replacement is achievable in this system using Foundry Application V2 plus DOM-level governance of legacy UI regions. The current codebase already proves key enabling patterns:

- A full-screen Application V2 shell exists and renders as the primary workspace.
- Play/design mode switching and context routing already exist.
- Policy-based blocking of non-shell floating windows already exists.
- A custom Application V2 combat tracker and custom actor/item sheets already exist.

Based on current implementation and available Foundry APIs, no hard platform blocker was identified that would make full in-game replacement impossible.

## Evidence From Current Source

Current implementation already contains meaningful replacement infrastructure:

- Workspace V2 coordinator and root shell:
  - module/ui/workspace-v2/workspace-v2-coordinator.mjs
  - module/ui/workspace-v2/workspace-root-app.mjs
  - module/ui/workspace-v2/ui-region-governor.mjs
- Replacement activation and settings:
  - turn-of-the-century.mjs
  - ready hook initialization of workspaceV2Coordinator
  - workspace policy registration via WorkspaceStateStore
- Custom combat tracker replacement:
  - module/sheets/combat-tracker.mjs
  - CONFIG.ui.combat assignment in turn-of-the-century.mjs
- Custom actor and item sheet registration:
  - turn-of-the-century.mjs
  - module/sheets/actor-sheet.mjs
  - module/sheets/item-sheet.mjs
- Existing workspace visual layer:
  - styles/system-styles.css (Workspace V2 shell classes)

## Requirement-by-Requirement Feasibility

Legend:
- Met now: implemented in current source
- Feasible with work: no platform blocker, requires engineering
- Risky but feasible: achievable with non-trivial integration risk

1. No trace of existing Foundry in-game UI remains visible.
- Status: Feasible with work
- Notes: current system uses window blocking and custom shell, but default regions are not fully removed via deterministic region-governance yet.

2. Activities are organized into discrete panels.
- Status: Partially met now
- Notes: travel, encounter, market, camp context panels already exist inside shell.

3. Each panel has border, resize controls, title.
- Status: Feasible with work
- Notes: titles and bordered sections exist; full resize handles are not implemented.

4. Panels dock to any edge (VS Code style).
- Status: Feasible with work
- Notes: requires new docking layout engine.

5. Panels stack on any edge.
- Status: Feasible with work

6. Drop near top/bottom stacks above/below.
- Status: Feasible with work

7. Drop in middle composes tab group.
- Status: Feasible with work

8. Ghost preview for drop target.
- Status: Feasible with work

9. Docked row/column group resizing.
- Status: Feasible with work

10. Resize inside stacked group.
- Status: Feasible with work

11. Minimal frame/title chrome.
- Status: Feasible with work

12. Consistent inner padding.
- Status: Partially met now
- Notes: shell sections use consistent spacing patterns already.

13. Panels can be hidden.
- Status: Feasible with work

14. Role-based panel access.
- Status: Partially met now
- Notes: GM checks already used in workspace and encounter actions.

15. Panels can remain floating.
- Status: Feasible with work

16. Floating panels can resize in two dimensions.
- Status: Feasible with work

17. All Foundry functions represented in panels.
- Status: Risky but feasible
- Notes: broadest requirement; needs full parity inventory and explicit ownership map.

18. Layout remembered and restored across sessions.
- Status: Feasible with work
- Notes: scene/world/user flags and settings support this.

19. All changes encoded in this system package.
- Status: Feasible with work
- Notes: architecture is already system-local.

20. Strict Application V2 compliance.
- Status: Feasible with work
- Notes: current shell and tracker are Application V2 style.

21. Prefer classes over utility-function-only architecture.
- Status: Feasible with work
- Notes: current code uses classes for shell and manager; can be expanded.

22. Preserve all current customizations.
- Status: Feasible with work
- Notes: requires panelization of existing travel/encounter/market/camp and sheet customizations without regression.

## Complete Replacement Definition Check

### Hiding/removing stock in-game UI elements

- Left controls bar: feasible via explicit hide and replacement controls panel.
- Right sidebar and tabs: feasible via explicit hide and replacement data panels.
- Scene navigation/top bar: feasible via explicit hide and replacement scene panel.
- Hotbar: feasible via explicit hide and replacement action palette panel.
- Player list: feasible via explicit hide and replacement presence panel.
- Chat panel: feasible via explicit hide and replacement communication panel.

Conclusion: all listed elements are technically suppressible and replaceable in runtime.

### Main in-game menu access requirement

Feasible. A dedicated shell command can invoke Foundry in-game menu behavior from replacement UI.

## Key Technical Risks

1. API drift across Foundry updates
- Risk: moderate
- Mitigation: adapter layer for Application V2 and UI region selectors; compatibility gates.

2. Module interoperability
- Risk: high
- Mitigation: opt-in compatibility mode, conflict detector, fallback switch to design mode.

3. Full parity scope expansion
- Risk: high
- Mitigation: function inventory and milestone-gated parity map before broad rollout.

4. Performance under many concurrent panels
- Risk: moderate
- Mitigation: incremental rendering, event delegation, virtualized lists where needed.

5. Multi-user synchronization for layout and context
- Risk: moderate
- Mitigation: user-scoped layout state plus explicit GM-shared workspace policies.

## Constraints and Assumptions

- Out of scope remains code implementation in this request; this document is assessment only.
- Setup/admin launcher screens outside in-game runtime are not targeted.
- Existing system customizations in encounter, travel, market, camp, actor, item, and combat tracker remain mandatory preservation targets.

## Feasibility Decision

Proceed with conversion.

The conversion is viable and should move forward with a phased technical design and milestone plan focused on:
- deterministic UI region governance,
- a true docking layout engine,
- panel-based parity for all in-game workflows,
- and strict Application V2 compliance throughout.
