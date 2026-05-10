# Theme Release Checklist

Use this checklist before shipping the Victorian/Gothic UI overhaul.

## Packaging

- [ ] `styles/system-styles.css` imports all required theme layers in intended order.
- [ ] Every imported file exists under `styles/`.
- [ ] `system.json` still references `styles/system-styles.css` as the stylesheet entry.

## Font Bundle

- [ ] Licensed local font files are present:
  - `assets/fonts/CinzelDecorative-Bold.woff2`
  - `assets/fonts/CormorantSC-SemiBold.woff2`
  - `assets/fonts/IMFePIrm29PqvfPYP5e8T92.woff2`
- [ ] Fallback rendering looks acceptable if font files are missing.

## In-App Visual Smoke Test

- [ ] Hero, pawn, villain sheets render with themed frame, tabs, and controls.
- [ ] Item sheet details/system tabs render with themed form controls.
- [ ] Combat tracker rows, queue, and controls are readable and styled.
- [ ] Workspace shell (travel/encounter/market/camp) keeps contrast on dark panels.
- [ ] Chat log cards, dice blocks, and tooltip text are readable.
- [ ] Sidebar tabs/directory rows/players list remain readable in active and hover states.
- [ ] Dialogs and rich text editor chrome match theme and remain usable.

## Accessibility

- [ ] Keyboard focus ring is visible on links, buttons, tabs, and inputs.
- [ ] Disabled controls are visually distinct.
- [ ] Reduced-motion preference behaves correctly.
- [ ] Warning states (encounter alerts/buttons) maintain strong contrast.

## Regression Guardrails

- [ ] Core layer does not override sidebar active-tab styling (owned by sidebar layer).
- [ ] Accessibility/chat/sidebar/dialog layers remain at end of import order.
- [ ] No JS behavior regressions in drag/drop planner or encounter controls.

## Current Audit Snapshot (May 9, 2026)

- Import targets: PASS (all current imports resolve to files in `styles/`).
- Styles folder git status: 14 new/modified files.
- Font bundle files: MISSING (all three expected WOFF2 files).
