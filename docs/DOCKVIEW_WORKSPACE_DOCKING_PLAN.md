# Dockview Workspace Docking Migration Plan

## Feasibility Assessment

Dockview looks feasible for replacing the custom workspace docking layer, provided the Foundry map "portal" remains a first-class integration constraint. Dockview can manage the panel layout, tab groups, edge docks, floating panels, resizing, and serialized state, but it should not own the Foundry canvas. The map portal should continue to be implemented by rendering an empty, transparent center panel aperture while the native Foundry canvas remains behind the workspace shell.

The main risk is not Dockview's layout model. It is integration with Foundry's unbundled browser module environment and our existing pointer-event passthrough contract. Dockview is still a good fit if we introduce it behind a small adapter and preserve the current `WorkspaceRootApp` responsibilities.

Relevant Dockview capabilities:

- Core project overview: https://dockview.dev/
- Introduction and feature list: https://dockview.dev/docs/overview/introduction/
- Vanilla TypeScript package and API summary: https://raw.githubusercontent.com/mathuo/dockview/master/llms-full.txt
- Adding panels and groups: https://dockview.dev/docs/core/panels/add/
- Edge groups: https://dockview.dev/docs/core/groups/edgeGroups/
- Floating groups: https://dockview.dev/docs/core/groups/floatingGroups/
- Popout groups: https://dockview.dev/docs/core/groups/popoutGroups/
- Panel render modes: https://dockview.dev/docs/core/panels/rendering/
- Iframe/rendering caveats: https://dockview.dev/docs/advanced/iframe/
- Sizing API: https://dockview.dev/docs/core/sizing/
- Nested Dockview instances: https://dockview.dev/docs/advanced/nested/

## Why Dockview Fits

Dockview provides the behaviors our custom workspace docking is currently struggling to keep correct:

- Docked tab groups with drag/drop.
- Resizable groups and panels.
- Edge groups for left, right, top, and bottom dock areas.
- Floating groups for detached in-workspace panels.
- Layout serialization through `api.toJSON()` and restoration through `api.fromJSON()`.
- A vanilla JavaScript/TypeScript core package, `dockview-core`, which avoids a React dependency.
- Render modes that can keep panel DOM mounted while hidden, useful for panels with persistent DOM state.

The most promising replacement path is to let Dockview own workspace geometry and tab/group interactions while our code continues to own panel identity, Foundry scene synchronization, map aperture behavior, feature controllers, and saved user layout policy.

## Portal Compatibility Constraints

The Foundry map portal should remain an explicit contract in our workspace layer.

Required behavior:

- When the active center panel is a native map panel, the Dockview center panel content must render no opaque body.
- The workspace shell and aperture area must allow pointer events to pass through to the native Foundry canvas.
- Dock chrome, tabs, edge docks, floating panels, resize handles, and action buttons must remain interactive.
- `WorkspaceRootApp` must still be able to determine the active center map panel and call the appropriate Foundry scene view synchronization.
- Dockview's floating and drag layers must not add full-window opaque backgrounds over the canvas.

Recommended CSS contract:

- Keep the workspace root/shell mostly `pointer-events: none`.
- Restore `pointer-events: auto` only on Dockview tabs, groups, floating groups, resize handles, and interactive panel content.
- Add a state class such as `has-native-canvas-aperture` when the active center panel is a map panel.
- Under that state, make the active Dockview center content and native-map panel component transparent and non-interactive.
- Keep Foundry canvas visibility and scene switching controlled outside Dockview.

## Integration Approach

### Dependency Strategy

Foundry currently loads this system through browser ES modules listed in `system.json`; there is no application bundler. Bare imports from npm are unlikely to work directly in Foundry.

Use this strategy first:

1. Add `dockview-core` as a package dependency.
2. Add a vendor script that copies the browser-compatible Dockview ESM and CSS assets into `module/vendor/dockview/`.
3. Import Dockview from a relative module path inside system code.
4. Include Dockview CSS through `system.json` or import it from `styles/system-styles.css`, depending on what Foundry accepts most reliably.
5. Keep all Dockview imports isolated in one adapter module so a future bundler migration remains straightforward.

Avoid introducing a bundler just for this migration unless vendoring proves unworkable.

### Adapter Boundary

Replace the current docking implementation behind a stable feature boundary rather than spreading Dockview API calls through the workspace.

Create a `DockviewWorkspaceLayoutFeature` that preserves the current public responsibilities:

- `renderShell(context)`
- `bind(html, context)`
- `dispose()`
- `getActiveCenterMapPanel()`
- design-lens state access, if still needed by existing callers

The adapter should be the only layer that talks directly to Dockview. The rest of the workspace should continue to speak in terms of our panel models, panel IDs, scenes, feature controllers, and persisted layout state.

### Panel Rendering

Keep `WorkspacePanelHost` as the only renderer for actual panel bodies.

Dockview components should be thin delegates:

- `workspace-panel`: renders a normal system panel through `WorkspacePanelHost`.
- `native-map-aperture`: renders an intentionally empty transparent surface for map panels.

Map panels should be registered with stable IDs and params, for example:

```js
{
  id: "map:lobby",
  component: "native-map-aperture",
  title: "Lobby",
  params: { baseId: "map", sceneId: "..." }
}
```

Normal panels should carry the panel ID and delegate everything else:

```js
{
  id: "encounter-planner",
  component: "workspace-panel",
  title: "Encounter Planner",
  params: { panelId: "encounter-planner" }
}
```

### Layout Mapping

Map the current workspace concepts to Dockview concepts:

- Center dock: main Dockview grid group.
- Left dock: Dockview left edge group.
- Right dock: Dockview right edge group.
- Top dock: Dockview top edge group if still needed.
- Bottom dock: Dockview bottom edge group.
- Floating panels: Dockview floating groups.
- Collapsed side panels: collapsed Dockview edge groups.
- Active tab state: Dockview active panel/group state.

Do not initially use Dockview popout browser windows. Dockview supports them, but popouts add same-origin HTML, CSS copying, `ownerDocument` concerns, popup blocking, and Foundry context questions. Treat popouts as a later phase after in-window docking is solid.

## Migration Plan

### Phase 1: Prototype Behind a Feature Flag

1. Add the Dockview dependency and vendored browser assets.
2. Create the Dockview adapter module without deleting the existing layout feature.
3. Add a hidden or developer-only setting to switch between custom docking and Dockview docking.
4. Render the same default workspace panels in Dockview.
5. Verify that normal panels render through `WorkspacePanelHost`.
6. Verify that a center map panel still reveals the native Foundry canvas.

Exit criteria:

- The Dockview shell renders the default workspace.
- Tabs, resizing, edge groups, and floating panels work in a local Foundry session.
- The native map portal remains visible and clickable when the map panel is active.

### Phase 2: State Adapter and Migration

1. Introduce a versioned persisted layout shape:

```js
{
  version: 2,
  dockview: { "...": "Dockview serialized layout" },
  panelVisibility: {},
  workspace: {
    activeMapSceneId: "...",
    lastActiveCenterPanelId: "..."
  }
}
```

2. Keep the existing user flag key if possible to avoid orphaned preferences.
3. Add a migration from the current custom layout shape to a default Dockview layout.
4. Preserve visible panel IDs, active tabs where practical, known map scene panel IDs, and rough floating geometry.
5. Save Dockview state with `api.toJSON()`.
6. Restore Dockview state with `api.fromJSON()`.
7. Fall back to a known-good default layout if a saved Dockview layout references missing panel IDs or invalid groups.

Exit criteria:

- Existing users get a usable default Dockview workspace after migration.
- New Dockview layout changes persist per user.
- Bad saved layout data cannot break workspace startup.

### Phase 3: Portal Hardening

1. Recreate the current native-canvas aperture tests against the Dockview shell.
2. Assert that the active map panel has transparent content.
3. Assert that pointer events pass through the aperture to the Foundry canvas.
4. Assert that Dockview tabs, edge groups, floating groups, resize handles, and workspace utility buttons remain interactive.
5. Confirm that `WorkspaceRootApp` can still identify the active center map panel.
6. Confirm that scene synchronization still calls Foundry scene viewing only when needed.

Exit criteria:

- The map portal behaves the same or better than the current implementation.
- Dockview chrome does not block the canvas outside actual interactive controls.

### Phase 4: Replace Custom Docking

1. Switch the default workspace layout feature to Dockview.
2. Remove the feature flag after a short validation window.
3. Delete unused custom layout rendering code.
4. Remove obsolete CSS for custom grid docks, custom stack controls, custom splitters, and custom floating window chrome.
5. Keep any reusable panel styling that belongs to panel bodies rather than docking chrome.
6. Update documentation for workspace layout persistence and map aperture behavior.

Exit criteria:

- The custom docking implementation is no longer in the runtime path.
- Tests cover the Dockview adapter and the map portal contract.
- Workspace CSS is smaller and less layout-fragile than the current custom docking CSS.

## Test Plan

Unit and static tests:

- Default Dockview layout construction includes expected panels and groups.
- V1 custom layout migration produces a valid V2 Dockview layout.
- Missing or stale panel IDs are ignored or repaired.
- `getActiveCenterMapPanel()` returns the active map panel only when a center map aperture panel is active.
- Dockview adapter does not require Foundry globals outside injected services.
- CSS preserves pointer passthrough and transparent aperture rules.
- CSS keeps Dockview chrome and floating groups interactive.

Integration-style tests:

- `WorkspacePanelHost` renders normal Dockview panels.
- Native map aperture panel renders empty and transparent.
- Scene synchronization still calls `scene.view()` for active map panel changes.
- Dragging/resizing/collapsing Dockview groups updates persisted layout state.
- Restoring persisted layout recreates edge groups, center tabs, and floating groups.

Manual Foundry QA:

- Open the workspace with the map active in the center.
- Click and pan the Foundry canvas through the map aperture.
- Drag tabs between center, side, and floating groups.
- Collapse and expand edge groups.
- Resize groups vertically and horizontally.
- Reload Foundry and confirm layout persistence.
- Switch scenes from map panels and confirm the native canvas follows.
- Confirm encounter planner, actor details, codex, GM assistant, and scene properties remain usable.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Foundry cannot load Dockview's npm package directly. | Vendor browser-compatible ESM and CSS into `module/vendor/dockview/`. |
| Dockview wrapper elements block the native canvas. | Preserve the pointer-event passthrough contract in adapter CSS and test it directly. |
| Dockview center group paints an opaque background over the map. | Add a map-aperture state class and make the active map group/content transparent. |
| Existing layout flags are incompatible. | Version saved layout data and migrate to a safe default Dockview layout. |
| Popout windows complicate Foundry context. | Defer Dockview popouts; use in-window floating groups first. |
| Workspace code becomes coupled to Dockview. | Keep Dockview calls inside `DockviewWorkspaceLayoutFeature` and a small state adapter. |

## Recommendation

Proceed with a Dockview prototype behind a feature flag. The library appears capable of handling the docking behaviors we need, and it should reduce the amount of fragile custom layout CSS and split-panel logic. The map portal is compatible with this approach as long as the aperture remains our responsibility and is tested as a hard workspace contract.

