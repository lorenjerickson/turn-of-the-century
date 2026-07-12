import {
    buildDesignCommandPaletteModel,
    renderDesignCommandPalette
} from "../panels/design-command-palette.mjs";
import { WorkspaceLayoutFeature } from "./workspace-layout-feature.mjs";
import {
    DOCKVIEW_DOCK_POSITIONS,
    DOCKVIEW_PANEL_COMPONENTS,
    collectDockviewPanelDescriptors,
    createDockviewPanelDescriptor,
    getDockviewWorkspaceState,
    getLegacyActiveCenterMapPanel,
    isNativeMapPanel,
    normalizeDockviewSideEdgeGroupSizes,
    withDockviewWorkspaceState
} from "../dockview-layout-state.mjs";
import {
    createDockview,
    themeDark
} from "../../../vendor/dockview/main.esm.mjs";

const MIN_SIDE_DOCK_WIDTH = 350;

const EDGE_GROUP_SIZES = Object.freeze({
    leftDock: { initialSize: 320, minimumSize: MIN_SIDE_DOCK_WIDTH, collapsedSize: 44 },
    rightDock: { initialSize: 360, minimumSize: MIN_SIDE_DOCK_WIDTH, collapsedSize: 44 },
    topDock: { initialSize: 180, minimumSize: 120, collapsedSize: 38 },
    bottomDock: { initialSize: 220, minimumSize: 140, collapsedSize: 38 }
});

const EDGE_DOCK_IDS = Object.freeze(["leftDock", "topDock", "rightDock", "bottomDock"]);

export class DockviewWorkspaceLayoutFeature extends WorkspaceLayoutFeature {
    constructor(options = {}) {
        super(options);
        this.dockviewApi = null;
        this.dockviewRootElement = null;
        // Persistent Dockview host: survives Foundry re-renders (which replace
        // the shell DOM) so the live Dockview instance and its geometry are kept
        // and only reconciled, never torn down and rebuilt each render.
        this.dockviewHostElement = null;
        this.dockviewContext = null;
        this.dockviewDisposables = [];
        this.saveQueued = false;
        this.activeDockviewMapPanel = null;
        this.dockviewPanelVisibilityRoot = null;
        this.edgeGroupExpandedSizes = this.#createDefaultEdgeGroupExpandedSizes();
        this.onDockviewPanelVisibilityChange = this.#onDockviewPanelVisibilityChange.bind(this);
    }

    async prepareContext(context) {
        const activeLayout = context.layout ?? this.layoutEngine?.getLayout();
        const activePanel = this.#getPrimaryActivePanel(activeLayout);
        const isGM = this.isGMCallback();

        context.designCommandPalette = buildDesignCommandPaletteModel({
            active: this.designCommandPaletteOpen,
            activePanel,
            isGM,
            query: this.designCommandPaletteQuery,
            registry: this.designActionRegistry
        });
    }

    bind(rootElement) {
        this.#wireDockviewPanelVisibilityHandlers(rootElement);
        super.bind(rootElement);
        this.#mountDockview(rootElement);
    }

    dispose() {
        this.#disposeDockview();
        super.dispose();
    }

    renderShell(context) {
        this.dockviewContext = context;
        const root = document.createElement("section");
        root.classList.add("totc-workspace-v2-root");

        const isRollLocked = this.isRollLockedCallback();
        if (isRollLocked) {
            root.classList.add("is-roll-locked");
            root.setAttribute("data-roll-lock", "true");
        }

        const nativeCanvasShellClass = this.getActiveCenterMapPanel(context.layout) ? " has-native-canvas-aperture" : "";
        const panelToggleMarkup = (context.panelVisibility ?? []).map((panel) => `
            <label class="totc-v2-command-menu__panel-toggle">
                <input
                    type="checkbox"
                    data-action="toggle-panel-visibility"
                    data-panel-id="${this.escapeHTMLCallback(panel.id)}"
                    ${panel.visible ? "checked" : ""}>
                <span>${this.escapeHTMLCallback(panel.title)}</span>
            </label>`).join("");

        const isGM = this.isGMCallback();

        root.innerHTML = `
<section class="totc-workspace-v2-shell totc-workspace-v2-shell--dockview${nativeCanvasShellClass}">
    <div class="totc-workspace-v2-shell__emergency">
        <div class="totc-v2-floating-control">
            <button type="button" class="totc-v2-emergency-button" data-action="totc-v2-panel-menu-toggle" title="Show visible panels" aria-label="Show visible panels" aria-expanded="false">
                <i class="fa-solid fa-window-maximize" aria-hidden="true"></i>
            </button>
            <div class="totc-v2-command-menu totc-v2-panel-menu" data-panel-menu="true" hidden>
                <section class="totc-v2-command-menu__panel-list" aria-label="Visible panels">
                    ${panelToggleMarkup}
                </section>
            </div>
        </div>
        ${isGM ? `<div class="totc-v2-floating-control">
            <button type="button" class="totc-v2-emergency-button" data-action="toggle-design-command-palette" title="Open design command palette" aria-label="Open design command palette" aria-expanded="${context.designCommandPalette?.active ? "true" : "false"}">
                <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
            </button>
            ${renderDesignCommandPalette(context.designCommandPalette ?? {}, { escapeHTML: this.escapeHTMLCallback })}
        </div>` : ""}
        <div class="totc-v2-floating-control">
            <button type="button" class="totc-v2-emergency-button" data-action="totc-v2-command-menu-toggle" title="Open workspace menu" aria-label="Open workspace menu" aria-expanded="false">
                <i class="fas fa-gear" aria-hidden="true"></i>
            </button>
            <div class="totc-v2-command-menu" data-command-menu="true" hidden>
                <button type="button" class="totc-v2-command-menu__item" data-action="totc-v2-open-foundry-settings">Foundry Settings</button>
                <button type="button" class="totc-v2-command-menu__item" data-action="totc-v2-exit-world">Return to Setup</button>
            </div>
        </div>
    </div>
    <main class="totc-workspace-v2-shell__main">
        <section class="totc-v2-dockview-layout dockview-theme-dark${nativeCanvasShellClass}" data-dockview-layout-root="true" data-dockview-mount="true"></section>
    </main>
</section>`;

        return root;
    }

    getActiveCenterMapPanel(layout = this.layoutEngine?.getLayout()) {
        if (this.dockviewApi) return this.#getActiveGridMapPanelEntry()?.panel ?? null;
        return getLegacyActiveCenterMapPanel(layout);
    }

    #mountDockview(rootElement) {
        const mount = rootElement?.querySelector?.("[data-dockview-mount='true']");
        if (!mount) return;

        // Re-render replaces the shell DOM, so re-parent the persistent host
        // (which still owns the live Dockview instance) into the fresh mount
        // point instead of tearing Dockview down and rebuilding it.
        if (!this.dockviewHostElement) {
            this.dockviewHostElement = document.createElement("div");
            this.dockviewHostElement.classList.add("totc-v2-dockview-host");
        }
        if (this.dockviewHostElement.parentElement !== mount) {
            mount.appendChild(this.dockviewHostElement);
        }

        const layout = this.dockviewContext?.layout ?? this.layoutEngine?.getLayout();
        if (this.dockviewApi) {
            this.#reconcileDockviewLayout(layout);
        } else {
            this.#createDockview(layout);
        }

        this.#layoutDockviewNow();
        this.#auditLoadedSideDockMinimumWidths();
        globalThis.requestAnimationFrame?.(() => {
            this.#layoutDockviewNow();
            this.#auditLoadedSideDockMinimumWidths();
        });
        this.#syncNativeCanvasApertureClass();
    }

    #createDockview(layout) {
        this.dockviewRootElement = this.dockviewHostElement;
        this.dockviewApi = createDockview(this.dockviewHostElement, {
            theme: themeDark,
            noPanelsOverlay: "emptyGroup",
            floatingGroupDragHandle: "titlebar",
            dndStrategy: "pointer",
            defaultTabComponent: "totc-workspace-tab",
            createComponent: (options) => this.#createDockviewRenderer(options),
            createTabComponent: (options) => this.#createDockviewTabRenderer(options),
            createRightHeaderActionComponent: (group) => this.#createDockviewHeaderActions(group)
        });

        this.#restoreDockviewLayout(layout);
        this.#wireDockviewPersistence();
    }

    #createDockviewRenderer(options = {}) {
        const element = document.createElement("section");
        element.classList.add("totc-v2-dockview-panel");
        element.dataset.dockviewComponent = String(options.name ?? "");

        return {
            element,
            init: (params = {}) => {
                this.#renderDockviewPanel(element, options.name, params.params ?? {});
            },
            update: (event = {}) => {
                this.#renderDockviewPanel(element, options.name, event.params ?? {});
            },
            dispose: () => {
                element.replaceChildren();
            }
        };
    }

    #createDockviewTabRenderer(options = {}) {
        return new TotcWorkspaceTab();
    }

    #renderDockviewPanel(element, componentName, params = {}) {
        const panel = params.panel ?? null;
        element.dataset.panelId = String(panel?.id ?? "");

        if (componentName === DOCKVIEW_PANEL_COMPONENTS.nativeMapAperture) {
            element.classList.add("totc-v2-dockview-panel--native-map");
            element.innerHTML = "";
            return;
        }

        element.classList.remove("totc-v2-dockview-panel--native-map");
        element.innerHTML = this.panelHost?.renderPanelContent?.(panel, this.dockviewContext ?? {}) ?? "";
        this.panelHost?.bindPanel?.(panel, element);
    }

    #restoreDockviewLayout(layout = null) {
        const dockviewState = getDockviewWorkspaceState(layout);
        if (dockviewState?.dockview) {
            try {
                const normalizedDockview = normalizeDockviewSideEdgeGroupSizes(dockviewState.dockview, MIN_SIDE_DOCK_WIDTH);
                this.#rememberEdgeGroupSizesFromDockviewState(normalizedDockview);
                // Force inline rendering on restore. A layout persisted before
                // the aperture fix carries renderer:"always" on the map panel,
                // which fromJSON would restore into a floating .dv-render-overlay
                // outside .dv-groupview — breaking the aperture transparency.
                for (const panel of Object.values(normalizedDockview?.panels ?? {})) {
                    if (panel && typeof panel === "object") panel.renderer = "onlyWhenVisible";
                }
                // Pre-create edge groups with our real size constraints before
                // fromJSON. Dockview's deserializer otherwise auto-creates any
                // serialized edge group with only an `id`, dropping our minimum
                // widths back to its collapsedSize+50 default. clear() treats
                // edge groups as structural and preserves them, and the
                // deserializer reuses any position that already exists, so our
                // constraints survive the restore.
                this.#precreateEdgeGroupsFromState(normalizedDockview);
                this.dockviewApi.fromJSON(normalizedDockview, { reuseExistingPanels: false });
                this.#configureRestoredEdgeGroups();
            } catch (error) {
                console.warn("[turn-of-the-century] Failed to restore saved Dockview geometry; rebuilding from the workspace layout.", error);
                this.dockviewApi.clear();
            }
        }

        // The saved Dockview JSON only carries geometry. Reconcile against the
        // layout engine (authoritative for which panels are open and where) so
        // restored geometry is corrected to the current model, and so an empty
        // Dockview (no saved geometry) is built entirely from the layout.
        this.#reconcileDockviewLayout(layout);
    }

    #auditLoadedSideDockMinimumWidths() {
        if (!this.dockviewApi) return;

        const dockviewState = this.dockviewApi?.toJSON?.();
        const legacyLayout = this.layoutEngine?.getLayout?.();
        let corrected = false;
        for (const dockId of ["leftDock", "rightDock"]) {
            const position = DOCKVIEW_DOCK_POSITIONS[dockId];
            if (!position) continue;

            const groupApi = this.dockviewApi.getEdgeGroup(position);
            if (!groupApi) continue;

            const legacyCollapsed = Boolean(legacyLayout?.root?.[dockId]?.collapsed);
            if (legacyCollapsed) continue;

            const group = (this.dockviewApi?.groups ?? []).find((candidate) => candidate?.id === groupApi?.id);
            if ((group?.panels?.length ?? 0) < 1) continue;

            if (groupApi.isCollapsed?.()) {
                groupApi.expand?.();
                this.#layoutDockviewNow();
            }

            const minimumSize = Number(EDGE_GROUP_SIZES[dockId]?.minimumSize ?? MIN_SIDE_DOCK_WIDTH);
            const liveWidth = this.#getEdgeGroupLiveWidth(groupApi);
            const persistedWidth = Number(dockviewState?.edgeGroups?.[position]?.size);
            const currentWidth = Number.isFinite(liveWidth) && liveWidth > 0
                ? liveWidth
                : persistedWidth;
            if (!Number.isFinite(currentWidth) || currentWidth >= minimumSize) continue;

            groupApi.setSize?.(minimumSize);
            this.edgeGroupExpandedSizes[dockId] = minimumSize;
            corrected = true;
        }

        if (!corrected) return;

        this.#layoutDockviewNow();
        const refreshedDockviewState = this.dockviewApi?.toJSON?.();
        this.#rememberEdgeGroupSizesFromDockviewState(refreshedDockviewState);
        this.#queueDockviewSave();
    }

    #getEdgeGroupLiveWidth(groupApi) {
        const group = (this.dockviewApi?.groups ?? []).find((candidate) => candidate?.id === groupApi?.id);
        const groupBoxWidth = Number(group?.api?.boundingBox?.width);
        if (Number.isFinite(groupBoxWidth) && groupBoxWidth > 0) return groupBoxWidth;

        const apiBoxWidth = Number(groupApi?.boundingBox?.width);
        if (Number.isFinite(apiBoxWidth) && apiBoxWidth > 0) return apiBoxWidth;

        return Number.NaN;
    }

    #precreateEdgeGroupsFromState(dockview) {
        const edgeGroups = dockview?.edgeGroups;
        if (!edgeGroups || typeof edgeGroups !== "object") return;
        for (const dockId of EDGE_DOCK_IDS) {
            const position = DOCKVIEW_DOCK_POSITIONS[dockId];
            if (!edgeGroups[position] || this.dockviewApi.getEdgeGroup(position)) continue;
            const configured = EDGE_GROUP_SIZES[dockId] ?? {};
            const serializedSize = Number(edgeGroups[position]?.size);
            const minimumSize = Number(configured.minimumSize ?? 0);
            const initialSize = Number.isFinite(serializedSize)
                ? Math.max(minimumSize, serializedSize)
                : configured.initialSize;
            this.dockviewApi.addEdgeGroup(position, {
                id: `totc-${dockId}`,
                ...configured,
                initialSize
            });
            if (Number.isFinite(initialSize) && initialSize >= minimumSize) {
                this.edgeGroupExpandedSizes[dockId] = initialSize;
            }
        }
    }

    /**
     * Reconcile the live Dockview instance to the layout engine: the model is
     * authoritative for which panels are open and which dock they belong to,
     * while Dockview keeps ownership of geometry (sizes, splits, drag state).
     *
     * Reconciliation is by panel existence, not exact group placement, so a
     * panel the user has dragged to a different group is not yanked back — only
     * genuinely new panels are added and genuinely closed panels are removed.
     */
    #reconcileDockviewLayout(layout = this.layoutEngine?.getLayout()) {
        if (!this.dockviewApi) return;
        const desired = this.#collectDesiredPanels(layout);

        for (const panel of this.dockviewApi.panels ?? []) {
            if (!desired.has(panel.id)) this.dockviewApi.removePanel(panel);
        }

        for (const spec of desired.values()) {
            if (spec.panel.id.startsWith("map:")) {
                const sceneId = spec.panel.id.slice(4);
                const scene = globalThis.game?.scenes?.get?.(sceneId)
                    ?? (globalThis.game?.scenes?.contents ?? []).find((s) => String(s?.id ?? s?._id ?? "") === sceneId);
                if (scene && scene.name) {
                    spec.panel.title = scene.name;
                }
            }

            const existing = this.dockviewApi.getPanel(spec.panel.id);
            if (existing) {
                // Refresh the content of an already-mounted panel. Reconcile
                // keeps the panel across re-renders, so without this its rendered
                // body would stay stale (e.g. a scene deleted from the list).
                existing.api?.updateParameters?.({ panel: spec.panel });

                const currentTitle = existing.api?.title;
                const newTitle = spec.panel.title;
                if (newTitle && currentTitle !== newTitle) {
                    existing.api?.setTitle(newTitle);
                }

                if (existing.view?.tab && typeof existing.view.tab.render === "function") {
                    existing.view.tab.render();
                }
                continue;
            }
            this.#addReconciledPanel(spec);
            // Only activate freshly added panels the model marks active (e.g. a
            // newly opened scene map). Existing panels are left as-is so a tab
            // the user switched directly in Dockview is not reverted on the next
            // render — Dockview owns live active-tab state.
            if (spec.active) this.dockviewApi.getPanel(spec.panel.id)?.api?.setActive?.();
        }

        this.#removeEmptyEdgeGroups();
    }

    #collectDesiredPanels(layout = null) {
        const desired = new Map();
        for (const dockId of ["centerDock", ...EDGE_DOCK_IDS]) {
            for (const stack of layout?.root?.[dockId]?.stacks ?? []) {
                for (const panel of stack?.panels ?? []) {
                    const id = String(panel?.id ?? "").trim();
                    if (!id || desired.has(id)) continue;
                    desired.set(id, { panel, dockId, active: stack.activePanelId === panel.id });
                }
            }
        }

        for (const floatingWindow of layout?.root?.floatingWindows ?? []) {
            const panel = floatingWindow?.panel;
            const id = String(panel?.id ?? "").trim();
            if (!id || desired.has(id)) continue;
            desired.set(id, { panel, floating: floatingWindow });
        }

        return desired;
    }

    #addReconciledPanel(spec) {
        const descriptor = createDockviewPanelDescriptor(spec.panel);
        if (!descriptor) return;

        // Added panels activate themselves by default; add non-active model
        // panels inactive so the model's active tab (not the last one added)
        // ends up in front.
        const inactive = !spec.active;

        if (spec.floating) {
            const floatingWindow = spec.floating;
            this.dockviewApi.addPanel({
                ...descriptor,
                inactive,
                floating: {
                    position: {
                        top: Number.isFinite(floatingWindow.y) ? floatingWindow.y : 120,
                        left: Number.isFinite(floatingWindow.x) ? floatingWindow.x : 120
                    },
                    width: Number.isFinite(floatingWindow.width) ? floatingWindow.width : 420,
                    height: Number.isFinite(floatingWindow.height) ? floatingWindow.height : 280
                }
            });
            return;
        }

        if (spec.dockId === "centerDock") {
            const referenceGroup = this.#getFirstGridGroup();
            this.dockviewApi.addPanel({
                ...descriptor,
                inactive,
                ...(referenceGroup ? { position: { referenceGroup: referenceGroup.id, direction: "within" } } : {})
            });
            return;
        }

        const groupApi = this.#ensureEdgeGroup(spec.dockId);
        if (!groupApi) return;
        this.dockviewApi.addPanel({
            ...descriptor,
            inactive,
            position: { referenceGroup: groupApi.id, direction: "within" }
        });
    }

    #ensureEdgeGroup(dockId, options = {}) {
        const position = DOCKVIEW_DOCK_POSITIONS[dockId];
        if (!position) return null;
        const existing = this.dockviewApi.getEdgeGroup(position);
        if (existing) {
            this.#rememberEdgeGroupSizesFromDockviewState(this.dockviewApi?.toJSON?.());
            this.#configureEdgeGroupHeader(existing, dockId);
            this.#configureEdgeGroupDropZones(existing, dockId);
            return existing;
        }

        const preferredInitialSize = Number.isFinite(options.initialSize)
            ? options.initialSize
            : this.#getPreferredEdgeGroupInitialSize(dockId);
        // Edge-group size constraints (minimumSize/initialSize/collapsedSize)
        // are only honored at creation time, so they must be passed here rather
        // than reasserted afterwards.
        const groupApi = this.dockviewApi.addEdgeGroup(position, {
            id: `totc-${dockId}`,
            ...EDGE_GROUP_SIZES[dockId],
            initialSize: preferredInitialSize,
            ...options
        });
        this.edgeGroupExpandedSizes[dockId] = preferredInitialSize;
        this.#configureEdgeGroupHeader(groupApi, dockId);
        this.#configureEdgeGroupDropZones(groupApi, dockId);
        return groupApi;
    }

    #configureRestoredEdgeGroups() {
        for (const dockId of EDGE_DOCK_IDS) {
            const position = DOCKVIEW_DOCK_POSITIONS[dockId];
            const groupApi = position ? this.dockviewApi?.getEdgeGroup?.(position) : null;
            if (groupApi) {
                this.#configureEdgeGroupHeader(groupApi, dockId);
                this.#configureEdgeGroupDropZones(groupApi, dockId);
            }
        }
    }

    #configureEdgeGroupHeader(groupApi, dockId) {
        const headerPosition = dockId === "bottomDock" ? "bottom" : "top";
        groupApi?.setHeaderPosition?.(headerPosition);
    }

    #configureEdgeGroupDropZones(groupApi, dockId) {
        const group = (this.dockviewApi?.groups ?? []).find((candidate) => candidate?.id === groupApi?.id);
        const zones = dockId === "leftDock" || dockId === "rightDock"
            ? ["top", "bottom", "center"]
            : ["left", "right", "center"];
        group?.model?.contentContainer?.dropTarget?.setTargetZones?.(zones);
        group?.model?.contentContainer?.pointerDropTarget?.setTargetZones?.(zones);
    }

    #wireDockviewPanelVisibilityHandlers(rootElement) {
        if (this.dockviewPanelVisibilityRoot === rootElement) return;
        this.dockviewPanelVisibilityRoot?.removeEventListener?.("change", this.onDockviewPanelVisibilityChange, true);
        this.dockviewPanelVisibilityRoot = rootElement;
        rootElement?.addEventListener?.("change", this.onDockviewPanelVisibilityChange, true);
    }

    async #onDockviewPanelVisibilityChange(event) {
        const checkbox = event.target?.closest?.("[data-action='toggle-panel-visibility']");
        if (!checkbox) return;
        event.stopImmediatePropagation();
        event.stopPropagation();

        const panelId = String(checkbox.dataset.panelId ?? "").trim();
        if (!panelId) return;
        const panelDef = this.panelRegistry?.get?.(panelId);
        if (!panelDef) return;

        if (checkbox.checked) this.#showDockviewPanel(panelDef);
        else this.#hideDockviewPanel(panelId);

        const nextLegacyLayout = checkbox.checked
            ? this.layoutEngine.restorePanel(panelDef, { preferredDockId: panelDef.defaultDock ?? null })
            : this.layoutEngine.closePanel(panelId);
        await this.#saveDockviewStateWithLegacyLayout(nextLegacyLayout);
        this.renderCallback({ force: false });
    }

    #showDockviewPanel(panelDef) {
        const existingPanel = this.dockviewApi?.getPanel?.(panelDef.id);
        if (existingPanel) {
            existingPanel.api?.setActive?.();
            existingPanel.api?.group?.api?.expand?.();
            return existingPanel;
        }

        const descriptor = createDockviewPanelDescriptor(panelDef);
        if (!descriptor) return null;

        const dockId = panelDef.defaultDock ?? "rightDock";
        if (dockId === "centerDock") {
            const referenceGroup = this.#getFirstGridGroup();
            return this.dockviewApi?.addPanel?.({
                ...descriptor,
                ...(referenceGroup ? { position: { referenceGroup: referenceGroup.id, direction: "within" } } : {})
            });
        }

        const groupApi = this.#ensureEdgeGroup(dockId);
        if (!groupApi) return null;
        groupApi?.expand?.();
        return this.dockviewApi?.addPanel?.({
            ...descriptor,
            position: {
                referenceGroup: groupApi.id,
                direction: "within"
            }
        });
    }

    #hideDockviewPanel(panelId) {
        const existingPanel = this.dockviewApi?.getPanel?.(panelId);
        if (existingPanel) this.dockviewApi.removePanel(existingPanel);
        this.#removeEmptyEdgeGroups();
    }

    #createDockviewHeaderActions(group) {
        const element = document.createElement("div");
        element.classList.add("totc-v2-dockview-header-actions");

        const buttons = {
            minimize: this.#createDockviewHeaderButton("minimize", "Minimize active tab group", "fa-window-minimize"),
            maximize: this.#createDockviewHeaderButton("maximize", "Maximize active tab group", "fa-window-maximize"),
            detach: this.#createDockviewHeaderButton("detach", "Detach active tab", "fa-up-right-from-square"),
            close: this.#createDockviewHeaderButton("close", "Close active tab", "fa-xmark")
        };

        for (const button of Object.values(buttons)) element.append(button);

        const refresh = () => this.#refreshDockviewHeaderActions(group, buttons);
        const disposables = [
            group?.api?.onDidActivePanelChange?.(refresh),
            this.dockviewApi?.onDidMaximizedGroupChange?.(refresh)
        ].filter(Boolean);

        return {
            element,
            init: () => {
                element.addEventListener("click", (event) => this.#onDockviewHeaderActionClick(event, group));
                refresh();
            },
            dispose: () => {
                for (const disposable of disposables) disposable.dispose?.();
                element.replaceChildren();
            }
        };
    }

    #createDockviewHeaderButton(action, title, icon) {
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("totc-v2-dockview-header-action");
        button.dataset.dockviewAction = action;
        button.title = title;
        button.setAttribute("aria-label", title);
        button.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`;
        return button;
    }

    #refreshDockviewHeaderActions(group, buttons) {
        const activePanel = group?.activePanel ?? null;
        const locationType = group?.api?.location?.type ?? "";
        buttons.minimize.disabled = locationType !== "edge";
        buttons.maximize.disabled = !activePanel || locationType !== "grid";
        buttons.detach.disabled = !activePanel || locationType === "floating" || locationType === "popout";
        buttons.close.disabled = !activePanel;

        const maximized = Boolean(group?.api?.isMaximized?.());
        buttons.maximize.classList.toggle("is-active", maximized);
        buttons.maximize.title = maximized ? "Restore active tab group" : "Maximize active tab group";
        buttons.maximize.setAttribute("aria-label", buttons.maximize.title);
    }

    async #onDockviewHeaderActionClick(event, group) {
        const button = event.target?.closest?.("[data-dockview-action]");
        if (!button || button.disabled) return;
        event.preventDefault();
        event.stopPropagation();

        const action = button.dataset.dockviewAction;
        const activePanel = group?.activePanel ?? null;
        if (action === "minimize") {
            group?.api?.collapse?.();
            this.#queueDockviewSave();
            return;
        }
        if (action === "maximize") {
            if (group?.api?.isMaximized?.()) group.api.exitMaximized();
            else group?.api?.maximize?.();
            this.#queueDockviewSave();
            return;
        }
        if (action === "detach") {
            this.#detachDockviewPanel(activePanel, group);
            return;
        }
        if (action === "close") {
            await this.#closeDockviewPanel(activePanel);
        }
    }

    #detachDockviewPanel(panel, group) {
        if (!panel) return;
        const box = group?.api?.boundingBox ?? {};
        this.dockviewApi?.addFloatingGroup?.(panel, {
            position: {
                left: Math.max(24, Math.round((box.left ?? 120) + 28)),
                top: Math.max(24, Math.round((box.top ?? 120) + 28))
            },
            width: Math.max(360, Math.round(box.width ?? 420)),
            height: Math.max(240, Math.round(box.height ?? 280))
        });
        this.#removeEmptyEdgeGroups();
        this.#queueDockviewSave();
    }

    async #closeDockviewPanel(panel) {
        if (!panel) return;
        this.dockviewApi?.removePanel?.(panel);
        this.#removeEmptyEdgeGroups();
        const nextLegacyLayout = this.layoutEngine?.closePanel?.(panel.id) ?? this.layoutEngine?.getLayout?.();
        await this.#saveDockviewStateWithLegacyLayout(nextLegacyLayout);
        this.renderCallback({ force: false });
    }

    #removeEmptyEdgeGroups() {
        const dockviewState = this.dockviewApi?.toJSON?.();
        this.#rememberEdgeGroupSizesFromDockviewState(dockviewState);
        for (const dockId of EDGE_DOCK_IDS) {
            const position = DOCKVIEW_DOCK_POSITIONS[dockId];
            const groupApi = position ? this.dockviewApi?.getEdgeGroup?.(position) : null;
            if (!groupApi) continue;
            const group = (this.dockviewApi?.groups ?? []).find((candidate) => candidate?.id === groupApi.id);
            // Fully remove an emptied edge region rather than leaving a collapsed
            // header strip. It is recreated on demand when a panel is redocked
            // there through the panel-visibility menu (#ensureEdgeGroup).
            if (!group?.panels?.length) this.dockviewApi?.removeEdgeGroup?.(position);
        }
    }

    async #saveDockviewStateWithLegacyLayout(legacyLayout) {
        const dockviewState = this.dockviewApi?.toJSON?.();
        this.#rememberEdgeGroupSizesFromDockviewState(dockviewState);
        const nextLegacyLayout = this.#syncLegacyCollapsedFromDockviewState(legacyLayout, dockviewState);
        const nextLayout = withDockviewWorkspaceState(nextLegacyLayout, dockviewState);
        await this.stateStore?.setUserLayout?.(nextLayout);
    }

    #getFirstGridGroup() {
        return (this.dockviewApi?.groups ?? []).find((group) => group?.api?.location?.type === "grid") ?? null;
    }

    #wireDockviewPersistence() {
        this.#addDockviewDisposable(this.dockviewApi.onDidLayoutChange(() => {
            this.#syncNativeCanvasApertureClass();
            this.#queueDockviewSave();
        }));
        this.#addDockviewDisposable(this.dockviewApi.onDidActivePanelChange(() => {
            const previousMapId = this.activeDockviewMapPanel?.id ?? "";
            this.#syncNativeCanvasApertureClass();
            this.#queueDockviewSave();
            // Switching to a different center map tab must re-view its scene on
            // the native canvas. A render runs the root app's scene sync, which
            // calls scene.view() for the newly active center map panel.
            if ((this.activeDockviewMapPanel?.id ?? "") !== previousMapId) {
                this.renderCallback({ force: false });
            }
        }));
        this.#addDockviewDisposable(this.dockviewApi.onDidRemovePanel(() => {
            this.#removeEmptyEdgeGroups();
            this.#queueDockviewSave();
        }));
    }

    #addDockviewDisposable(disposable) {
        if (disposable && typeof disposable.dispose === "function") {
            this.dockviewDisposables.push(disposable);
        }
    }

    #layoutDockviewNow() {
        const rect = this.dockviewRootElement?.getBoundingClientRect?.();
        const width = Math.round(rect?.width ?? 0);
        const height = Math.round(rect?.height ?? 0);
        if (width > 0 && height > 0) {
            this.dockviewApi?.layout?.(width, height, true);
        }
    }

    #queueDockviewSave() {
        if (this.saveQueued) return;
        this.saveQueued = true;
        queueMicrotask(() => {
            this.saveQueued = false;
            const currentLayout = this.layoutEngine?.getLayout?.() ?? {};
            const dockviewState = this.dockviewApi?.toJSON?.();
            this.#rememberEdgeGroupSizesFromDockviewState(dockviewState);
            const nextLegacyLayout = this.#syncLegacyCollapsedFromDockviewState(currentLayout, dockviewState);
            const nextLayout = withDockviewWorkspaceState(nextLegacyLayout, dockviewState);
            void this.stateStore?.setUserLayout?.(nextLayout);
        });
    }

    #syncLegacyCollapsedFromDockviewState(layout = null, dockviewState = null) {
        const nextLayout = layout && typeof layout === "object"
            ? (globalThis.foundry?.utils?.deepClone
                ? globalThis.foundry.utils.deepClone(layout)
                : JSON.parse(JSON.stringify(layout)))
            : {};
        nextLayout.root ??= {};
        const edgeGroups = dockviewState?.edgeGroups;

        for (const dockId of EDGE_DOCK_IDS) {
            const position = DOCKVIEW_DOCK_POSITIONS[dockId];
            if (!position) continue;
            const dock = nextLayout.root?.[dockId];
            if (!dock || typeof dock !== "object") continue;
            dock.collapsed = edgeGroups?.[position]?.collapsed === true;
        }

        return nextLayout;
    }

    #createDefaultEdgeGroupExpandedSizes() {
        return {
            leftDock: EDGE_GROUP_SIZES.leftDock.initialSize,
            topDock: EDGE_GROUP_SIZES.topDock.initialSize,
            rightDock: EDGE_GROUP_SIZES.rightDock.initialSize,
            bottomDock: EDGE_GROUP_SIZES.bottomDock.initialSize
        };
    }

    #getPreferredEdgeGroupInitialSize(dockId) {
        const configured = EDGE_GROUP_SIZES[dockId];
        if (!configured) return undefined;
        const remembered = Number(this.edgeGroupExpandedSizes?.[dockId]);
        const minimum = Number(configured.minimumSize);
        if (Number.isFinite(remembered) && remembered >= minimum) return remembered;
        return configured.initialSize;
    }

    #rememberEdgeGroupSizesFromDockviewState(dockviewState = null) {
        if (!dockviewState || typeof dockviewState !== "object") return;
        const edgeGroups = dockviewState.edgeGroups;
        if (!edgeGroups || typeof edgeGroups !== "object") return;

        for (const dockId of EDGE_DOCK_IDS) {
            const position = DOCKVIEW_DOCK_POSITIONS[dockId];
            const configured = EDGE_GROUP_SIZES[dockId];
            const serialized = position ? edgeGroups[position] : null;
            const serializedSize = Number(serialized?.size);
            if (!Number.isFinite(serializedSize) || serializedSize < Number(configured?.minimumSize ?? 0)) continue;
            this.edgeGroupExpandedSizes[dockId] = serializedSize;
        }
    }

    #syncNativeCanvasApertureClass() {
        const mapEntry = this.#getActiveGridMapPanelEntry();
        this.activeDockviewMapPanel = mapEntry?.panel ?? null;
        const hasMapAperture = Boolean(mapEntry);
        for (const group of this.dockviewApi?.groups ?? []) {
            group?.element?.classList?.toggle("totc-v2-native-map-group", group === mapEntry?.group);
        }
        this.dockviewRootElement
            ?.closest?.(".totc-workspace-v2-shell")
            ?.classList.toggle("has-native-canvas-aperture", hasMapAperture);
        this.dockviewRootElement
            ?.closest?.(".totc-v2-dockview-layout")
            ?.classList.toggle("has-native-canvas-aperture", hasMapAperture);
    }

    #getActiveGridMapPanelEntry() {
        if (!this.dockviewApi) return null;
        for (const group of this.dockviewApi.groups ?? []) {
            if (group?.api?.location?.type !== "grid") continue;
            const panel = group.activePanel;
            if (!panel) continue;
            // Restored panels can briefly report empty parameters, so fall back
            // to the panel id (which encodes the scene, e.g. "map:<sceneId>")
            // rather than relying solely on serialized params.
            const params = panel.api?.getParameters?.()?.panel;
            const panelModel = { id: panel.id, ...(params && typeof params === "object" ? params : {}) };
            if (isNativeMapPanel(panelModel)) return { group, panel: panelModel, dockviewPanel: panel };
        }
        return null;
    }

    #disposeDockview() {
        this.dockviewPanelVisibilityRoot?.removeEventListener?.("change", this.onDockviewPanelVisibilityChange, true);
        this.dockviewPanelVisibilityRoot = null;
        for (const disposable of this.dockviewDisposables.splice(0)) {
            disposable.dispose?.();
        }
        this.dockviewApi?.dispose?.();
        this.dockviewApi = null;
        this.dockviewRootElement = null;
        this.dockviewHostElement?.remove?.();
        this.dockviewHostElement = null;
        this.activeDockviewMapPanel = null;
    }

    #getPrimaryActivePanel(layout = this.layoutEngine?.getLayout()) {
        return this.getActiveCenterMapPanel(layout)
            ?? collectDockviewPanelDescriptors(layout)[0]?.params?.panel
            ?? null;
    }
}

class TotcWorkspaceTab {
    constructor() {
        this.element = document.createElement("div");
        this.element.className = "dv-default-tab totc-workspace-tab";

        this.iconContainer = document.createElement("span");
        this.iconContainer.className = "totc-workspace-tab-icon";
        this.element.appendChild(this.iconContainer);

        this.content = document.createElement("div");
        this.content.className = "dv-default-tab-content";
        this.element.appendChild(this.content);

        this.action = document.createElement("div");
        this.action.className = "dv-default-tab-action";

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "totc-tab-close-button";
        closeBtn.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        this.action.appendChild(closeBtn);
        this.element.appendChild(this.action);

        this.disposables = [];
        this.params = null;
    }

    init(params) {
        this.params = params;
        this.content.textContent = params.title ?? "";

        const titleDisposable = params.api.onDidTitleChange((event) => {
            this.content.textContent = event.title ?? "";
        });
        if (titleDisposable) this.disposables.push(titleDisposable);

        const onPointerDown = (ev) => ev.preventDefault();
        const onClick = (ev) => {
            if (ev.defaultPrevented) return;
            ev.preventDefault();
            params.api.close();
        };

        this.action.addEventListener("pointerdown", onPointerDown);
        this.action.addEventListener("click", onClick);

        // Update active scene tab star icon immediately and dynamically when Hooks trigger
        const onUpdateScene = (scene, changes) => {
            if ("active" in changes) {
                this.render();
            }
        };
        const onCanvasReady = () => {
            this.render();
        };

        globalThis.Hooks?.on("updateScene", onUpdateScene);
        globalThis.Hooks?.on("canvasReady", onCanvasReady);

        this.disposables.push({
            dispose: () => {
                this.action.removeEventListener("pointerdown", onPointerDown);
                this.action.removeEventListener("click", onClick);
                globalThis.Hooks?.off("updateScene", onUpdateScene);
                globalThis.Hooks?.off("canvasReady", onCanvasReady);
            }
        });

        this.render();
    }

    render() {
        const panelId = String(this.params?.api?.id ?? "");
        let showsStar = false;
        if (panelId.startsWith("map:")) {
            const sceneId = panelId.slice(4);
            const activeSceneId = String(
                globalThis.game?.scenes?.active?.id
                ?? (globalThis.game?.scenes?.contents ?? []).find((scene) => scene?.active)?.id
                ?? ""
            ).trim();
            if (sceneId && sceneId === activeSceneId) {
                showsStar = true;
            }
        }

        if (showsStar) {
            this.iconContainer.innerHTML = '<i class="fa-solid fa-star totc-v2-stack__tab-icon" aria-hidden="true"></i>';
            this.element.classList.add("totc-workspace-tab--active-scene");
        } else {
            this.iconContainer.innerHTML = "";
            this.element.classList.remove("totc-workspace-tab--active-scene");
        }
    }

    dispose() {
        for (const d of this.disposables) {
            if (typeof d.dispose === "function") d.dispose();
        }
        this.disposables = [];
        this.element.replaceChildren();
    }
}
