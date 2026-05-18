# UI Replacement Milestone 1: Panel-to-Capability Parity Map

Date: 2026-05-17
Status: Complete
Scope: Ownership map for capability parity implementation

## Owner Model

Owner in this document means the target panel (or panel system component) accountable for parity delivery.

## Parity Matrix

| Capability | Current Source Reference | Target Owner | Parity Status | Notes |
|---|---|---|---|---|
| UI mode switch (design/play) | turn-of-the-century.mjs | WorkspaceRootApp + CommandSurface | Planned | Keep runtime command compatibility surface. |
| Play context switch | turn-of-the-century.mjs, module/ui/workspace-v2/workspace-v2-coordinator.mjs | WorkspaceRootApp + Context Router | Planned | Context routing likely becomes panel preset layout actions. |
| Window blocking and allow policy | module/ui/workspace-v2/ui-region-governor.mjs | UiRegionGovernor | Planned | Replace legacy heuristics with deterministic region policy. |
| Application render interception for policy | module/ui/workspace-v2/ui-region-governor.mjs | UiRegionGovernor | Planned | Must be robust to rerender churn. |
| Encounter initialize/roll/resolve controls | module/ui/workspace-v2/workspace-root-app.mjs | Turn Tracker Panel + GM Combat Oversight Panel | Planned | Split GM and player concerns explicitly. |
| Combatant initiative roll | module/ui/workspace-v2/workspace-root-app.mjs | Player Combat Panel + Turn Tracker Panel | Planned | Role-gated controls required. |
| Add/remove/clear planned actions | module/ui/workspace-v2/workspace-root-app.mjs | Player Combat Panel | Planned | Preserve AP and target semantics. |
| Ready/commit toggles | module/ui/workspace-v2/workspace-root-app.mjs | Player Combat Panel | Planned | Preserve canCommit gating. |
| Travel pace/region/day/watch/weather controls | module/ui/workspace-v2/workspace-root-app.mjs | Travel Panel | Planned | Should remain panel-local commands. |
| Travel scout checks and event rolls | module/ui/workspace-v2/workspace-root-app.mjs | Travel Panel + Dice and Roll Feed Panel | Planned | Feed should own rich roll history display. |
| Travel encounter seeding and launch | module/ui/workspace-v2/workspace-root-app.mjs | Travel Panel + Turn Tracker Panel | Planned | Keep hook/event interoperability. |
| Merchant tagging and role management | module/ui/workspace-v2/workspace-root-app.mjs | Market Panel | Planned | Include GM-gated merchant role operations. |
| Buy/sell quote and transaction flow | module/ui/workspace-v2/workspace-root-app.mjs | Market Panel | Planned | Preserve wallet, treasury, and split logic. |
| Economy admin (GM wallet/treasury edits) | module/ui/workspace-v2/workspace-root-app.mjs | Market Panel (GM mode) | Planned | Strict GM guardrails required. |
| Chat posting of workflow outcomes | module/ui/workspace-v2/workspace-root-app.mjs | Chat and Messages Panel + CommandSurface | Planned | Replace stock framing; preserve message semantics. |
| Travel lifecycle hook calls | module/ui/workspace-v2/workspace-v2-coordinator.mjs | Event Bridge Service | Planned | Keep external integration events available. |
| Scene workspace state persistence | module/ui/workspace-v2/workspace-state-store.mjs | WorkspaceStateStore | Planned | Use flags for user layout and scene/workflow snapshots where needed. |
| UI policy settings persistence | turn-of-the-century.mjs | WorkspaceStateStore + Policy Service | Planned | Hybrid persistence: settings for policy, flags for layout. |
| Custom combat tracker behavior parity | module/sheets/combat-tracker.mjs | Turn Tracker Panel | Planned | Legacy tracker is migration reference only. |
| Custom actor sheet behavior parity | module/sheets/actor-sheet.mjs | Actor Detail Panel(s) | Planned | Preserve form mutation and drop workflows. |
| Custom item sheet behavior parity | module/sheets/item-sheet.mjs | Item Detail Panel(s) | Planned | Preserve editing and domain fields. |
| Stock region suppression (controls/navigation/sidebar/hotbar/players/chat frame) | design requirements, module/ui/workspace-v2/ui-region-governor.mjs | UiRegionGovernor | Planned | Required for full replacement definition. |
| Main in-game menu access | design requirements | Settings and Menu Panel | Planned | Must preserve return/setup access path. |

## Critical Workflow Ownership Check

| Critical Workflow | Owner | Mapped |
|---|---|---|
| Encounter round lifecycle and AP planning | Turn Tracker Panel + Player Combat Panel + GM Combat Oversight Panel | Yes |
| Travel event and encounter escalation | Travel Panel + Turn Tracker Panel | Yes |
| Market transaction loop | Market Panel | Yes |
| Actor and item editing parity | Actor Detail Panel(s) + Item Detail Panel(s) | Yes |
| Communication and observability | Chat and Messages Panel + Dice and Roll Feed Panel | Yes |
| Policy and governance | UiRegionGovernor + WorkspaceRootApp | Yes |

Result: No unmapped critical workflow.

## Immediate Next Implementation Step (Milestone 2)

1. Create new module namespace for replacement runtime (do not refactor legacy workspace in place).
2. Implement WorkspaceRootApp and UiRegionGovernor skeletons under Application V2.
3. Add hybrid persistence scaffolding:
- settings for policy state,
- flags for layout state.

## Constraints Applied From User Direction

1. No assumptions about user intent beyond explicit decisions.
2. Removed legacy workspace artifacts are treated as prior-attempt references, not trusted foundations.
3. Compatibility target for initial pass: Foundry v14.
4. Milestone progression: complete full milestone before report.
