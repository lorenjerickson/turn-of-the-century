# TOTC Victorian Theme Layers

This system uses one stylesheet entry in manifest (`styles/system-styles.css`) and composes theme behavior via ordered `@import` layers.

## Import Order

1. `totc-theme-tokens.css`
2. `totc-theme-typography.css`
3. `totc-theme-ornaments.css`
4. `totc-theme-core-overrides.css`
5. `totc-theme-actor-overrides.css`
6. `totc-theme-workspace-overrides.css`
7. `totc-theme-combat-overrides.css`
8. `totc-theme-item-overrides.css`
9. `totc-theme-accessibility-overrides.css`
10. `totc-theme-chat-overrides.css`
11. `totc-theme-sidebar-overrides.css`
12. `totc-theme-dialog-overrides.css`

Later files intentionally win in cascade for shared selectors.

## Scope Rules

- Prefer `body.totc-system-theme` + namespace selectors for any Foundry core overrides.
- Prefer `.turn-of-the-century` scoping for system sheet/app styling.
- Avoid broad edits to `system-styles.css` blocks; add dedicated override files when possible.

## Packaging Checklist

- Ensure every imported file exists in `styles/`.
- If using local fonts, keep licensed files in `assets/fonts/`.
- Run in-app smoke checks: actor sheets, item sheets, combat tracker, workspace shell, chat, sidebar.
