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
    withDockviewWorkspaceState
} from "../dockview-layout-state.mjs";
import {
    createDockview,
    themeDark
} from "../../../vendor/dockview/main.esm.mjs";

const EDGE_GROUP_SIZES = Object.freeze({
    leftDock: { initialSize: 320, minimumSize: 220, collapsedSize: 44 },
    rightDock: { initialSize: 360, minimumSize: 240, collapsedSize: 44 },
    topDock: { initialSize: 180, minimumSize: 120, collapsedSize: 38 },
    bottomDock: { initialSize: 220, minimumSize: 140, collapsedSize: 38 }
});

const EDGE_DOCK_IDS = Object.freeze(["leftDock", "topDock", "rightDock", "bottomDock"]);

export class DockviewWorkspaceLayoutFeature extends WorkspaceLayoutFeature {
    constructor(options = {}) {
        super(options);
        this.dockviewApi = null;
        this.dockviewRootElement = null;
        this.dockviewContext = null;
        this.dockviewDisposables = [];
        this.saveQueued = false;
        this.activeDockviewMapPanel = null;
        this.dockviewPanelVisibilityRoot = null;
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
        <section class="totc-v2-dockview-layout dockview-theme-dark${nativeCanvasShellClass}" data-dockview-layout-root="true">
            <div class="totc-v2-dockview-host" data-dockview-root="true"></div>
        </section>
    </main>
</section>`;

        return root;
    }

    getActiveCenterMapPanel(layout = this.layoutEngine?.getLayout()) {
        if (this.dockviewApi) return this.#getActiveGridMapPanelEntry()?.panel ?? null;
        return getLegacyActiveCenterMapPanel(layout);
    }

    #mountDockview(rootElement) {
        const host = rootElement?.querySelector?.("[data-dockview-root='true']");
        if (!host || host === this.dockviewRootElement) return;

        this.#disposeDockview();
        this.dockviewRootElement = host;
        this.dockviewApi = createDockview(host, {
            theme: themeDark,
            noPanelsOverlay: "emptyGroup",
            floatingGroupDragHandle: "titlebar",
            dndStrategy: "pointer",
            createComponent: (options) => this.#createDockviewRenderer(options),
            createRightHeaderActionComponent: (group) => this.#createDockviewHeaderActions(group)
        });

        this.#restoreDockviewLayout(this.dockviewContext?.layout ?? this.layoutEngine?.getLayout());
        this.#wireDockviewPersistence();
        this.#layoutDockviewNow();
        globalThis.requestAnimationFrame?.(() => this.#layoutDockviewNow());
        this.#syncNativeCanvasApertureClass();
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
    }

    #restoreDockviewLayout(layout = null) {
        const dockviewState = getDockviewWorkspaceState(layout);
        if (dockviewState?.dockview) {
            try {
                this.dockviewApi.fromJSON(dockviewState.dockview, { reuseExistingPanels: false });
                this.#configureRestoredEdgeGroups();
                return;
            } catch (error) {
                console.warn("[turn-of-the-century] Failed to restore Dockview workspace layout; using legacy workspace layout.", error);
                this.dockviewApi.clear();
            }
        }

        this.#createDockviewLayoutFromLegacy(layout);
    }

    #createDockviewLayoutFromLegacy(layout = null) {
        const addedPanelIds = new Set();
        const centerStacks = layout?.root?.centerDock?.stacks ?? [];
        let firstGridPanelId = "";

        for (const stack of centerStacks) {
            const referencePanelId = firstGridPanelId;
            const stackPanels = stack?.panels ?? [];
            for (const [panelIndex, panel] of stackPanels.entries()) {
                const descriptor = createDockviewPanelDescriptor(panel);
                if (!descriptor || addedPanelIds.has(descriptor.id)) continue;
                const addOptions = { ...descriptor };
                if (firstGridPanelId) {
                    addOptions.position = {
                        referencePanel: panelIndex === 0 ? referencePanelId : stackPanels[0]?.id,
                        direction: panelIndex === 0 ? "right" : "within"
                    };
                }
                addOptions.inactive = stack.activePanelId !== descriptor.id;
                this.dockviewApi.addPanel(addOptions);
                addedPanelIds.add(descriptor.id);
                firstGridPanelId ||= descriptor.id;
            }
        }

        if (!firstGridPanelId) {
            const firstDescriptor = collectDockviewPanelDescriptors(layout)[0];
            if (firstDescriptor) {
                this.dockviewApi.addPanel(firstDescriptor);
                addedPanelIds.add(firstDescriptor.id);
                firstGridPanelId = firstDescriptor.id;
            }
        }

        for (const dockId of EDGE_DOCK_IDS) {
            this.#addLegacyEdgeDock(layout, dockId, addedPanelIds);
        }

        for (const floatingWindow of layout?.root?.floatingWindows ?? []) {
            const descriptor = createDockviewPanelDescriptor(floatingWindow?.panel);
            if (!descriptor || addedPanelIds.has(descriptor.id)) continue;
            this.dockviewApi.addPanel({
                ...descriptor,
                floating: {
                    position: {
                        top: Number.isFinite(floatingWindow.y) ? floatingWindow.y : 120,
                        left: Number.isFinite(floatingWindow.x) ? floatingWindow.x : 120
                    },
                    width: Number.isFinite(floatingWindow.width) ? floatingWindow.width : 420,
                    height: Number.isFinite(floatingWindow.height) ? floatingWindow.height : 280
                }
            });
            addedPanelIds.add(descriptor.id);
        }

        this.#configureRestoredEdgeGroups();
    }

    #addLegacyEdgeDock(layout, dockId, addedPanelIds) {
        const dock = layout?.root?.[dockId];
        const position = DOCKVIEW_DOCK_POSITIONS[dockId];
        const panels = (dock?.stacks ?? []).flatMap((stack) => stack?.panels ?? []);
        if (!position || !panels.length) return;

        const groupApi = this.#ensureEdgeGroup(dockId, { collapsed: Boolean(dock?.collapsed) });
        let firstPanelId = "";

        for (const panel of panels) {
            const descriptor = createDockviewPanelDescriptor(panel);
            if (!descriptor || addedPanelIds.has(descriptor.id)) continue;
            this.dockviewApi.addPanel({
                ...descriptor,
                position: {
                    referenceGroup: groupApi.id,
                    direction: "within"
                },
                inactive: Boolean(firstPanelId)
            });
            firstPanelId ||= descriptor.id;
            addedPanelIds.add(descriptor.id);
        }
    }

    #ensureEdgeGroup(dockId, options = {}) {
        const position = DOCKVIEW_DOCK_POSITIONS[dockId];
        if (!position) return null;
        const groupApi = this.dockviewApi.getEdgeGroup(position) ?? this.dockviewApi.addEdgeGroup(position, {
            id: `totc-${dockId}`,
            ...EDGE_GROUP_SIZES[dockId],
            ...options
        });
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
        this.#collapseEmptyEdgeGroups();
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
        this.#collapseEmptyEdgeGroups();
        this.#queueDockviewSave();
    }

    async #closeDockviewPanel(panel) {
        if (!panel) return;
        this.dockviewApi?.removePanel?.(panel);
        this.#collapseEmptyEdgeGroups();
        const nextLegacyLayout = this.layoutEngine?.closePanel?.(panel.id) ?? this.layoutEngine?.getLayout?.();
        await this.#saveDockviewStateWithLegacyLayout(nextLegacyLayout);
        this.renderCallback({ force: false });
    }

    #collapseEmptyEdgeGroups() {
        for (const dockId of EDGE_DOCK_IDS) {
            const position = DOCKVIEW_DOCK_POSITIONS[dockId];
            const groupApi = position ? this.dockviewApi?.getEdgeGroup?.(position) : null;
            const group = (this.dockviewApi?.groups ?? []).find((candidate) => candidate?.id === groupApi?.id);
            if (groupApi && !group?.panels?.length) groupApi.collapse?.();
        }
    }

    async #saveDockviewStateWithLegacyLayout(legacyLayout) {
        const dockviewState = this.dockviewApi?.toJSON?.();
        const nextLayout = withDockviewWorkspaceState(legacyLayout, dockviewState);
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
            this.#syncNativeCanvasApertureClass();
            this.#queueDockviewSave();
        }));
        this.#addDockviewDisposable(this.dockviewApi.onDidRemoveView(() => {
            this.#collapseEmptyEdgeGroups();
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
            const nextLayout = withDockviewWorkspaceState(currentLayout, this.dockviewApi?.toJSON?.());
            void this.stateStore?.setUserLayout?.(nextLayout);
        });
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
            const panelModel = panel?.api?.getParameters?.()?.panel ?? null;
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
        this.activeDockviewMapPanel = null;
    }

    #getPrimaryActivePanel(layout = this.layoutEngine?.getLayout()) {
        return this.getActiveCenterMapPanel(layout)
            ?? collectDockviewPanelDescriptors(layout)[0]?.params?.panel
            ?? null;
    }
}
