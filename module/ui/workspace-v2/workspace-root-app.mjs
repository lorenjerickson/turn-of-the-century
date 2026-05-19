import { WORKSPACE_V2_DOCK_IDS } from "./constants.mjs";
import { InteractionController } from "./interaction-controller.mjs";
import { LayoutEngine } from "./layout-engine.mjs";

function getApplicationV2BaseClass() {
    return foundry?.applications?.api?.ApplicationV2 ?? null;
}

const ApplicationV2Base = getApplicationV2BaseClass();

const PANEL_LIBRARY = Object.freeze([
    { id: "map", title: "Map" },
    { id: "travel", title: "Travel" },
    { id: "encounter", title: "Encounter Planner" },
    { id: "market", title: "Market" },
    { id: "compendium", title: "Unified Compendium" },
    { id: "camp", title: "Camp" },
    { id: "chat", title: "Chat and Messages" },
    { id: "tracker", title: "Turn Tracker" }
]);

const DOCK_LABELS = Object.freeze({
    leftDock: "Left Dock",
    topDock: "Top Dock",
    centerDock: "Center Dock",
    rightDock: "Right Dock",
    bottomDock: "Bottom Dock"
});

const MIN_FLOAT_WIDTH = 240;
const MIN_FLOAT_HEIGHT = 160;
const MIN_TOP_BOTTOM_DOCK_HEIGHT = 128;
const MIN_LEFT_RIGHT_DOCK_WIDTH = 240;

export class WorkspaceRootApp extends (ApplicationV2Base ?? class {}) {
    static get isSupported() {
        return Boolean(ApplicationV2Base);
    }

    static get DEFAULT_OPTIONS() {
        if (!ApplicationV2Base) return {};

        return {
            id: "totc-workspace-v2-root",
            classes: ["turn-of-the-century", "totc-workspace-v2-root-app"],
            tag: "section",
            position: {
                width: "100vw",
                height: "100vh",
                top: 0,
                left: 0
            },
            window: {
                frame: false,
                positioned: true,
                minimizable: false,
                resizable: false,
                title: "Turn of the Century Workspace V2"
            }
        };
    }

    constructor({ stateStore, governor } = {}) {
        super();
        this.stateStore = stateStore;
        this.governor = governor;
        this.layoutEngine = new LayoutEngine({
            layout: this.stateStore?.getUserLayout?.(),
            panels: PANEL_LIBRARY
        });
        this.interactionController = new InteractionController();
        this.ghostIntent = null;
        this.compendiumSearchQuery = "";
        this._compendiumItemEntries = null;
        this._resizeSession = null;
        this._sceneRefreshHandler = () => {
            if (this.rendered) {
                this.render(false);
            }
        };
        this._sceneHooksBound = false;
    }

    async _prepareContext() {
        const policy = this.stateStore?.getPolicy?.() ?? { enabled: false, debugGovernance: false };
        const userLayout = this.stateStore?.getUserLayout?.() ?? this.layoutEngine.getLayout();
        this.layoutEngine.setLayout(userLayout);
        const scene = canvas?.scene ?? game.scenes?.active ?? game.scenes?.viewed ?? null;
        const compendiumItems = await this.#getUnifiedCompendiumItems();

        return {
            enabled: policy.enabled,
            debugGovernance: policy.debugGovernance,
            hasUserLayout: Boolean(this.stateStore?.getUserLayout?.()),
            panels: PANEL_LIBRARY,
            layout: this.layoutEngine.getLayout(),
            dockWeights: this.layoutEngine.getDockWeightLayout(),
            compendiumSearchQuery: this.compendiumSearchQuery,
            compendiumItems,
            scene: {
                id: scene?.id ?? null,
                name: scene?.name ?? game.scenes?.viewed?.name ?? "Current Scene",
                mapSrc: this.#getSceneMapSource(scene),
                width: Number(scene?.width ?? canvas?.dimensions?.sceneWidth ?? 0),
                height: Number(scene?.height ?? canvas?.dimensions?.sceneHeight ?? 0)
            }
        };
    }

    async _renderHTML(context) {
        const root = document.createElement("section");
        root.classList.add("totc-workspace-v2-root");
        root.setAttribute("data-drag-host", "true");
        const dockWeights = context.dockWeights ?? { left: 0.18, centerX: 0.64, right: 0.18, top: 0.18, centerY: 0.64, bottom: 0.18 };
        const layoutRoot = context.layout?.root ?? {};
        const leftOccupied = this.#isDockOccupied(layoutRoot.leftDock);
        const rightOccupied = this.#isDockOccupied(layoutRoot.rightDock);
        const topOccupied = this.#isDockOccupied(layoutRoot.topDock);
        const bottomOccupied = this.#isDockOccupied(layoutRoot.bottomDock);
        const leftMin = leftOccupied ? `${MIN_LEFT_RIGHT_DOCK_WIDTH}px` : "0px";
        const rightMin = rightOccupied ? `${MIN_LEFT_RIGHT_DOCK_WIDTH}px` : "0px";
        const topMin = topOccupied ? `${MIN_TOP_BOTTOM_DOCK_HEIGHT}px` : "0px";
        const bottomMin = bottomOccupied ? `${MIN_TOP_BOTTOM_DOCK_HEIGHT}px` : "0px";
        const columnTemplate = `minmax(${leftMin}, ${Math.max(1, Math.round(dockWeights.left * 100))}fr) minmax(0, ${Math.max(1, Math.round((dockWeights.centerX ?? 0.64) * 100))}fr) minmax(${rightMin}, ${Math.max(1, Math.round(dockWeights.right * 100))}fr)`;
        const rowTemplate = `minmax(${topMin}, ${Math.max(1, Math.round(dockWeights.top * 100))}fr) minmax(0, ${Math.max(1, Math.round((dockWeights.centerY ?? 0.64) * 100))}fr) minmax(${bottomMin}, ${Math.max(1, Math.round(dockWeights.bottom * 100))}fr)`;

        const docksMarkup = WORKSPACE_V2_DOCK_IDS
            .map((dockId) => this.#renderDockMarkup(dockId, context.layout.root[dockId], context))
            .join("\n");

        root.innerHTML = `
<section class="totc-workspace-v2-shell">
    <div class="totc-workspace-v2-shell__emergency">
        <button type="button" class="totc-v2-emergency-button" data-action="totc-v2-exit-world" title="Exit world and return to Foundry setup" aria-label="Exit world and return to Foundry setup">
            <i class="fas fa-gear" aria-hidden="true"></i>
        </button>
    </div>
    <main class="totc-workspace-v2-shell__main">
        <section class="totc-v2-layout" data-layout-root="true" style="grid-template-columns:${columnTemplate};grid-template-rows:${rowTemplate};">
            ${docksMarkup}
            ${this.#renderDockSplittersMarkup(dockWeights)}
            ${this.#renderFloatingWindowsMarkup(context.layout.root.floatingWindows ?? [])}
            <div class="totc-v2-ghost" data-drop-ghost="true" hidden>
                <span data-drop-label="true"></span>
            </div>
        </section>
    </main>
</section>`;
        return root;
    }

    _replaceHTML(result, content) {
        content.replaceChildren(result);
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        this.#bindSceneHooks();

        this.element?.querySelectorAll("[data-action='totc-v2-exit-world']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();

                const confirmed = await Dialog.confirm({
                    title: "Exit World",
                    content: "Return to the Foundry setup screen?",
                    yes: "Exit to Setup",
                    no: "Cancel",
                    defaultYes: false
                }).catch(() => false);

                if (!confirmed) return;
                await game.shutDown?.();
            });
        });

        this.element?.querySelectorAll("[data-action='compendium-search']")?.forEach((input) => {
            input.addEventListener("input", async () => {
                this.compendiumSearchQuery = String(input.value ?? "");
                this.render(false);
            });
        });

        this.element?.querySelectorAll("[data-action='activate-tab']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                const { dockId, stackId, panelId } = button.dataset;
                if (!dockId || !stackId || !panelId) return;

                const nextLayout = this.layoutEngine.setActivePanel(dockId, stackId, panelId);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.render(false);
            });
        });

        this.element?.querySelectorAll("[data-action='float-panel']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                const panelId = button.dataset.panelId;
                const panelDef = PANEL_LIBRARY.find((panel) => panel.id === panelId);
                if (!panelDef) return;

                const nextLayout = this.layoutEngine.floatPanel(panelDef);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.render(false);
            });
        });

        this.element?.querySelectorAll("[data-action='close-panel']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const panelId = button.dataset.panelId;
                if (!panelId) return;

                const nextLayout = this.layoutEngine.closePanel(panelId);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.render(false);
            });
        });

        this.element?.querySelectorAll("[data-action='undock-panel']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const dockId = button.dataset.dockId;
                const stackId = button.dataset.stackId;
                const panelId = button.dataset.panelId;
                if (!dockId || !stackId || !panelId) return;

                const nextLayout = this.layoutEngine.undockPanel({ dockId, stackId, panelId });
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.render(false);
            });
        });

        this.element?.querySelectorAll("[data-action='redock-panel']")?.forEach((button) => {
            button.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                event.stopPropagation();
            });
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const floatingId = button.dataset.floatingId;
                if (!floatingId) return;

                const nextLayout = this.layoutEngine.redockFloatingWindow(floatingId);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.render(false);
            });
        });

        this.element?.querySelectorAll("[data-action='floating-close']")?.forEach((button) => {
            button.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                event.stopPropagation();
            });
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const windowId = button.dataset.floatingId;
                if (!windowId) return;

                const nextLayout = this.layoutEngine.removeFloatingWindow(windowId);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.render(false);
            });
        });

        this.#wireInteractionHandlers();
        this.#wireResizeHandlers();
    }

    async close(options = {}) {
        this.#unbindSceneHooks();
        return await super.close?.(options);
    }

    #renderDockMarkup(dockId, dock = { stacks: [] }, context = {}) {
        const stackItemsMarkup = (dock?.stacks ?? [])
            .map((stack, index, stacks) => {
                const stackMarkup = this.#renderStackMarkup(dockId, stack, context, {
                    includeDockLabel: index === 0,
                    dockLabel: DOCK_LABELS[dockId] ?? dockId
                });
                const splitterMarkup = index < stacks.length - 1
                    ? this.#renderStackSplitterMarkup(dockId, stack.id, stacks[index + 1]?.id, dock?.orientation)
                    : "";
                return `${stackMarkup}${splitterMarkup}`;
            })
            .join("");
        const orientationClass = dock?.orientation === "horizontal" ? "is-horizontal" : "is-vertical";

        return `
        <section class="totc-v2-dock totc-v2-dock--${dockId} ${orientationClass}" data-dock-id="${dockId}">
            <div class="totc-v2-dock__stacks ${orientationClass}" data-dock-stacks="${dockId}">
                ${stackItemsMarkup || "<div class='totc-v2-dock__empty'>Drop panel here</div>"}
            </div>
        </section>`;
    }

    #renderStackMarkup(dockId, stack, context = {}, options = {}) {
        const tabsMarkup = (stack?.panels ?? [])
            .map((panel) => `
            <button
                type="button"
                data-action="activate-tab"
                data-dock-id="${dockId}"
                data-stack-id="${stack.id}"
                data-panel-id="${panel.id}"
                draggable="true"
                data-drag-panel-id="${panel.id}"
                class="totc-v2-stack__tab ${panel.id === stack.activePanelId ? "is-active" : ""}">
                ${panel.title}
            </button>`)
            .join("");

        const activePanel = (stack?.panels ?? []).find((panel) => panel.id === stack.activePanelId) ?? stack?.panels?.[0];
        const panelContent = this.#renderPanelContent(activePanel, context);

        return `
        <article class="totc-v2-stack" data-dock-id="${dockId}" data-stack-id="${stack.id}" style="flex-grow:${Number(stack.size) || 1};">
            <div class="totc-v2-stack__tabs">
                ${options.includeDockLabel ? `<span class="totc-v2-dock-label-inline">${this.#escapeHTML(options.dockLabel ?? dockId)}</span>` : ""}
                ${tabsMarkup}
            </div>
            <div class="totc-v2-stack__actions">
                <button type="button" data-action="close-panel" data-dock-id="${dockId}" data-stack-id="${stack.id}" data-panel-id="${activePanel?.id ?? ""}">Close</button>
                <button type="button" data-action="undock-panel" data-dock-id="${dockId}" data-stack-id="${stack.id}" data-panel-id="${activePanel?.id ?? ""}">Undock</button>
            </div>
            <div class="totc-v2-stack__content">${panelContent}</div>
        </article>`;
    }

    #renderStackSplitterMarkup(dockId, leadingStackId, trailingStackId, orientation = "vertical") {
        const orientationClass = orientation === "horizontal" ? "is-horizontal" : "is-vertical";
        return `
        <div
            class="totc-v2-stack-splitter ${orientationClass}"
            data-action="stack-splitter"
            data-dock-id="${dockId}"
            data-leading-stack-id="${leadingStackId}"
            data-trailing-stack-id="${trailingStackId}"
            title="Resize stack"></div>`;
    }

    #renderDockSplittersMarkup(dockWeights = {}) {
        const left = Number(dockWeights.left) || 0.18;
        const centerX = Number(dockWeights.centerX) || Math.max(0.2, 1 - left - (Number(dockWeights.right) || 0.18));
        const right = Number(dockWeights.right) || 0.18;
        const top = Number(dockWeights.top) || 0.18;
        const centerY = Number(dockWeights.centerY) || Math.max(0.2, 1 - top - (Number(dockWeights.bottom) || 0.18));
        const bottom = Number(dockWeights.bottom) || 0.18;
        const totalX = Math.max(0.0001, left + centerX + right);
        const totalY = Math.max(0.0001, top + centerY + bottom);
        const leftBoundary = (left / totalX) * 100;
        const rightBoundary = ((left + centerX) / totalX) * 100;
        const topBoundary = (top / totalY) * 100;
        const bottomBoundary = ((top + centerY) / totalY) * 100;

        return `
        <div class="totc-v2-dock-resizer totc-v2-dock-resizer--left" style="left:${leftBoundary}%;" data-action="dock-resizer" data-dock-id="leftDock" data-axis="x" title="Resize dock"></div>
        <div class="totc-v2-dock-resizer totc-v2-dock-resizer--right" style="left:${rightBoundary}%;" data-action="dock-resizer" data-dock-id="rightDock" data-axis="x" title="Resize dock"></div>
        <div class="totc-v2-dock-resizer totc-v2-dock-resizer--top" style="top:${topBoundary}%;" data-action="dock-resizer" data-dock-id="topDock" data-axis="y" title="Resize dock"></div>
        <div class="totc-v2-dock-resizer totc-v2-dock-resizer--bottom" style="top:${bottomBoundary}%;" data-action="dock-resizer" data-dock-id="bottomDock" data-axis="y" title="Resize dock"></div>`;
    }

    #renderFloatingWindowsMarkup(floatingWindows = []) {
        return floatingWindows.map((floatingWindow) => {
            const title = this.#escapeHTML(floatingWindow.panel?.title ?? "Floating Panel");
            const content = this.#renderPanelContent(floatingWindow.panel, {
                scene: {
                    name: game.scenes?.viewed?.name ?? "Current Scene",
                    mapSrc: this.#getSceneMapSource(canvas?.scene ?? game.scenes?.viewed ?? null)
                }
            });

            return `
            <article
                class="totc-v2-floating"
                data-floating-id="${floatingWindow.id}"
                style="left:${floatingWindow.x}px;top:${floatingWindow.y}px;width:${floatingWindow.width}px;height:${floatingWindow.height}px;z-index:${floatingWindow.zIndex};">
                <header class="totc-v2-floating__header" data-action="floating-move-handle" data-floating-id="${floatingWindow.id}" draggable="true" data-drag-panel-id="${floatingWindow.panel?.id ?? ""}">
                    <span>${title}</span>
                    <div class="totc-v2-floating__buttons">
                        <button type="button" data-action="redock-panel" data-floating-id="${floatingWindow.id}">Redock</button>
                        <button type="button" data-action="floating-close" data-floating-id="${floatingWindow.id}">Close</button>
                    </div>
                </header>
                <section class="totc-v2-floating__body">${content}</section>
                <div class="totc-v2-floating__resize-handle" data-action="floating-resize-handle" data-floating-id="${floatingWindow.id}" title="Resize"></div>
            </article>`;
        }).join("");
    }

    #renderPanelContent(panel, context = {}) {
        if (!panel) {
            return `<div class="totc-v2-panel-placeholder">Empty</div>`;
        }

        if (panel.id === "map") {
            const sceneName = this.#escapeHTML(context.scene?.name ?? "Current Scene");
            const mapSrc = context.scene?.mapSrc ?? "";
            const dimensions = [context.scene?.width, context.scene?.height].filter((value) => Number.isFinite(value) && value > 0);
            const dimensionLabel = dimensions.length === 2 ? `${dimensions[0]} × ${dimensions[1]}` : "Scene map";
            const imageMarkup = mapSrc
                ? `<img class="totc-v2-map-panel__image" src="${this.#escapeHTML(mapSrc)}" alt="${sceneName}" draggable="false">`
                : `<div class="totc-v2-map-panel__empty">No active scene map available</div>`;

            return `
            <figure class="totc-v2-map-panel">
                ${imageMarkup}
                <figcaption class="totc-v2-map-panel__caption">
                    <span class="totc-v2-map-panel__name">${sceneName}</span>
                    <span class="totc-v2-map-panel__meta">${this.#escapeHTML(dimensionLabel)}</span>
                </figcaption>
            </figure>`;
        }

        if (panel.id === "compendium") {
            const query = String(context.compendiumSearchQuery ?? "").trim().toLowerCase();
            const allEntries = Array.isArray(context.compendiumItems) ? context.compendiumItems : [];
            const entries = query
                ? allEntries.filter((entry) => String(entry.name ?? "").toLowerCase().includes(query))
                : allEntries;

            return `
            <section class="totc-v2-compendium-panel">
                <label class="totc-v2-compendium-panel__search">
                    <span>Search items</span>
                    <input type="search" data-action="compendium-search" value="${this.#escapeHTML(context.compendiumSearchQuery ?? "")}" placeholder="Filter by item name">
                </label>
                <div class="totc-v2-compendium-panel__summary">
                    ${entries.length} item${entries.length === 1 ? "" : "s"} from ${this.#escapeHTML(allEntries.length ? `${allEntries.length} compendium entries` : "no compendium entries")}
                </div>
                <div class="totc-v2-compendium-panel__list" role="list">
                    ${entries.length ? entries.map((entry) => `
                        <article class="totc-v2-compendium-panel__entry" role="listitem" data-entry-uuid="${this.#escapeHTML(entry.uuid ?? "")}">
                            <div class="totc-v2-compendium-panel__entry-name">${this.#escapeHTML(entry.name)}</div>
                            <div class="totc-v2-compendium-panel__entry-pack">${this.#escapeHTML(entry.packLabel)}</div>
                        </article>`).join("") : `<div class="totc-v2-compendium-panel__empty">No items match this search.</div>`}
                </div>
            </section>`;
        }

        return `<div class="totc-v2-panel-placeholder">${this.#escapeHTML(panel.title)}</div>`;
    }

    #getSceneMapSource(scene) {
        return scene?.background?.src
            ?? scene?.img
            ?? scene?.texture?.src
            ?? scene?.thumb
            ?? scene?.thumbnail?.src
            ?? "";
    }

    #escapeHTML(value) {
        const text = String(value ?? "");
        return foundry?.utils?.escapeHTML?.(text) ?? text
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    #bindSceneHooks() {
        if (this._sceneHooksBound) return;
        Hooks.on("canvasReady", this._sceneRefreshHandler);
        Hooks.on("updateScene", this._sceneRefreshHandler);
        Hooks.on("createScene", this._sceneRefreshHandler);
        Hooks.on("deleteScene", this._sceneRefreshHandler);
        this._sceneHooksBound = true;
    }

    #unbindSceneHooks() {
        if (!this._sceneHooksBound) return;
        Hooks.off("canvasReady", this._sceneRefreshHandler);
        Hooks.off("updateScene", this._sceneRefreshHandler);
        Hooks.off("createScene", this._sceneRefreshHandler);
        Hooks.off("deleteScene", this._sceneRefreshHandler);
        this._sceneHooksBound = false;
    }

    #wireInteractionHandlers() {
        const host = this.element?.querySelector("[data-layout-root='true']");
        if (!host) return;

        this.element?.querySelectorAll("[data-panel-id], [data-drag-panel-id]")?.forEach((panelButton) => {
            panelButton.addEventListener("dragstart", (event) => {
                const panelId = panelButton.dataset.panelId || panelButton.dataset.dragPanelId;
                event.dataTransfer?.setData("text/plain", panelId ?? "");
                event.dataTransfer.effectAllowed = "move";
            });
            panelButton.addEventListener("dragend", () => {
                this.interactionController.clearIntent();
                this.#hideGhost();
            });
        });

        host.addEventListener("dragover", (event) => {
            event.preventDefault();
            const stackElements = [...host.querySelectorAll("[data-stack-id]")];
            const intent = this.interactionController.computeIntent({
                event,
                rootElement: host,
                stackElements
            });
            if (!intent) return;

            this.ghostIntent = intent;
            const ghostRect = this.interactionController.computeGhostRect({ intent, rootElement: host });
            this.#showGhost(ghostRect, intent.label);
            event.dataTransfer.dropEffect = "move";
        });

        host.addEventListener("dragleave", (event) => {
            const related = event.relatedTarget;
            if (related && host.contains(related)) return;
            this.interactionController.clearIntent();
            this.#hideGhost();
        });

        host.addEventListener("drop", async (event) => {
            event.preventDefault();
            const panelId = event.dataTransfer?.getData("text/plain");
            const panelDef = PANEL_LIBRARY.find((panel) => panel.id === panelId);
            if (!panelDef) {
                this.#hideGhost();
                return;
            }

            const intent = this.interactionController.getIntent();
            const nextLayout = this.layoutEngine.applyDropIntent(panelDef, intent ?? { kind: "edge", dockId: "centerDock" });
            await this.stateStore?.setUserLayout?.(nextLayout);

            this.interactionController.clearIntent();
            this.#hideGhost();
            this.render(false);
        });
    }

    #wireResizeHandlers() {
        this.element?.querySelectorAll("[data-action='dock-resizer']")?.forEach((handle) => {
            handle.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.#beginResizeSession({
                    type: "dock",
                    dockId: handle.dataset.dockId,
                    axis: handle.dataset.axis,
                    startX: event.clientX,
                    startY: event.clientY,
                    startWeights: this.layoutEngine.getDockWeightLayout()
                });
            });
        });

        this.element?.querySelectorAll("[data-action='floating-move-handle']")?.forEach((handle) => {
            handle.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const floatingId = handle.dataset.floatingId;
                const floatingWindow = this.layoutEngine.getLayout().root.floatingWindows.find((entry) => entry.id === floatingId);
                if (!floatingWindow) return;

                this.#beginResizeSession({
                    type: "floating-move",
                    floatingId,
                    startX: event.clientX,
                    startY: event.clientY,
                    original: { x: floatingWindow.x, y: floatingWindow.y }
                });
            });
        });

        this.element?.querySelectorAll("[data-action='floating-resize-handle']")?.forEach((handle) => {
            handle.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const floatingId = handle.dataset.floatingId;
                const floatingWindow = this.layoutEngine.getLayout().root.floatingWindows.find((entry) => entry.id === floatingId);
                if (!floatingWindow) return;

                this.#beginResizeSession({
                    type: "floating-resize",
                    floatingId,
                    startX: event.clientX,
                    startY: event.clientY,
                    original: {
                        x: floatingWindow.x,
                        y: floatingWindow.y,
                        width: floatingWindow.width,
                        height: floatingWindow.height
                    }
                });
            });
        });

        this.element?.querySelectorAll("[data-action='stack-splitter']")?.forEach((handle) => {
            handle.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.#beginResizeSession({
                    type: "stack",
                    dockId: handle.dataset.dockId,
                    leadingStackId: handle.dataset.leadingStackId,
                    trailingStackId: handle.dataset.trailingStackId,
                    startX: event.clientX,
                    startY: event.clientY
                });
            });
        });
    }

    #beginResizeSession(session) {
        this._resizeSession = session;
        this._onResizePointerMove = this._onResizePointerMove?.bind(this) ?? this.#onResizePointerMove.bind(this);
        this._onResizePointerUp = this._onResizePointerUp?.bind(this) ?? this.#onResizePointerUp.bind(this);
        document.addEventListener("pointermove", this._onResizePointerMove);
        document.addEventListener("pointerup", this._onResizePointerUp, { once: true });
    }

    async #onResizePointerUp() {
        document.removeEventListener("pointermove", this._onResizePointerMove);
        this._resizeSession = null;
        await this.stateStore?.setUserLayout?.(this.layoutEngine.getLayout());
        this.render(false);
    }

    #onResizePointerMove(event) {
        if (!this._resizeSession) return;
        const deltaX = event.clientX - this._resizeSession.startX;
        const deltaY = event.clientY - this._resizeSession.startY;
        const hostBounds = this.element?.querySelector("[data-layout-root='true']")?.getBoundingClientRect();

        if (this._resizeSession.type === "dock") {
            const current = this._resizeSession.startWeights;
            const stepX = deltaX / Math.max(hostBounds?.width ?? window.innerWidth, 1);
            const stepY = deltaY / Math.max(hostBounds?.height ?? window.innerHeight, 1);
            if (this._resizeSession.dockId === "leftDock") {
                this.layoutEngine.setDockWeight("leftDock", current.left + stepX);
            } else if (this._resizeSession.dockId === "rightDock") {
                this.layoutEngine.setDockWeight("rightDock", current.right - stepX);
            } else if (this._resizeSession.dockId === "topDock") {
                this.layoutEngine.setDockWeight("topDock", current.top + stepY);
            } else if (this._resizeSession.dockId === "bottomDock") {
                this.layoutEngine.setDockWeight("bottomDock", current.bottom - stepY);
            }

            void this.stateStore?.setUserLayout?.(this.layoutEngine.getLayout());
            this.#syncDockGridAndSplitters();
            return;
        }

        if (this._resizeSession.type === "stack") {
            const dock = this.layoutEngine.getLayout().root[this._resizeSession.dockId] ?? { stacks: [] };
            const leading = dock.stacks.find((stack) => stack.id === this._resizeSession.leadingStackId);
            const trailing = dock.stacks.find((stack) => stack.id === this._resizeSession.trailingStackId);
            if (!leading || !trailing) return;

            const orientation = dock.orientation ?? "vertical";
            const delta = orientation === "horizontal" ? deltaX / 100 : deltaY / 100;
            this.layoutEngine.resizeStack(this._resizeSession.dockId, leading.id, delta, trailing.id);
            void this.stateStore?.setUserLayout?.(this.layoutEngine.getLayout());
            this.render(false);
            return;
        }

        if (this._resizeSession.type === "floating-move") {
            const nextLayout = this.layoutEngine.updateFloatingWindow(this._resizeSession.floatingId, {
                x: this._resizeSession.original.x + deltaX,
                y: this._resizeSession.original.y + deltaY
            });
            void this.stateStore?.setUserLayout?.(nextLayout);
            this.#syncFloatingElementStyle(this._resizeSession.floatingId, nextLayout.root.floatingWindows.find((entry) => entry.id === this._resizeSession.floatingId));
            return;
        }

        if (this._resizeSession.type === "floating-resize") {
            const nextLayout = this.layoutEngine.updateFloatingWindow(this._resizeSession.floatingId, {
                width: Math.max(MIN_FLOAT_WIDTH, this._resizeSession.original.width + deltaX),
                height: Math.max(MIN_FLOAT_HEIGHT, this._resizeSession.original.height + deltaY)
            });
            void this.stateStore?.setUserLayout?.(nextLayout);
            this.#syncFloatingElementStyle(this._resizeSession.floatingId, nextLayout.root.floatingWindows.find((entry) => entry.id === this._resizeSession.floatingId));
        }
    }

    #syncFloatingElementStyle(floatingId, floatingWindow) {
        const element = this.element?.querySelector(`[data-floating-id='${floatingId}']`);
        if (!element || !floatingWindow) return;

        element.style.left = `${floatingWindow.x}px`;
        element.style.top = `${floatingWindow.y}px`;
        element.style.width = `${floatingWindow.width}px`;
        element.style.height = `${floatingWindow.height}px`;
        element.style.zIndex = `${floatingWindow.zIndex}`;
    }

    #syncDockGridAndSplitters() {
        const host = this.element?.querySelector("[data-layout-root='true']");
        if (!host) return;

        const layout = this.layoutEngine.getLayout();
        const dockWeights = this.layoutEngine.getDockWeightLayout();
        const leftOccupied = this.#isDockOccupied(layout.root.leftDock);
        const rightOccupied = this.#isDockOccupied(layout.root.rightDock);
        const topOccupied = this.#isDockOccupied(layout.root.topDock);
        const bottomOccupied = this.#isDockOccupied(layout.root.bottomDock);

        const leftMin = leftOccupied ? `${MIN_LEFT_RIGHT_DOCK_WIDTH}px` : "0px";
        const rightMin = rightOccupied ? `${MIN_LEFT_RIGHT_DOCK_WIDTH}px` : "0px";
        const topMin = topOccupied ? `${MIN_TOP_BOTTOM_DOCK_HEIGHT}px` : "0px";
        const bottomMin = bottomOccupied ? `${MIN_TOP_BOTTOM_DOCK_HEIGHT}px` : "0px";

        host.style.gridTemplateColumns = `minmax(${leftMin}, ${Math.max(1, Math.round(dockWeights.left * 100))}fr) minmax(0, ${Math.max(1, Math.round((dockWeights.centerX ?? 0.64) * 100))}fr) minmax(${rightMin}, ${Math.max(1, Math.round(dockWeights.right * 100))}fr)`;
        host.style.gridTemplateRows = `minmax(${topMin}, ${Math.max(1, Math.round(dockWeights.top * 100))}fr) minmax(0, ${Math.max(1, Math.round((dockWeights.centerY ?? 0.64) * 100))}fr) minmax(${bottomMin}, ${Math.max(1, Math.round(dockWeights.bottom * 100))}fr)`;

        const left = Number(dockWeights.left) || 0.18;
        const centerX = Number(dockWeights.centerX) || Math.max(0.2, 1 - left - (Number(dockWeights.right) || 0.18));
        const right = Number(dockWeights.right) || 0.18;
        const top = Number(dockWeights.top) || 0.18;
        const centerY = Number(dockWeights.centerY) || Math.max(0.2, 1 - top - (Number(dockWeights.bottom) || 0.18));
        const bottom = Number(dockWeights.bottom) || 0.18;
        const totalX = Math.max(0.0001, left + centerX + right);
        const totalY = Math.max(0.0001, top + centerY + bottom);

        const leftBoundary = (left / totalX) * 100;
        const rightBoundary = ((left + centerX) / totalX) * 100;
        const topBoundary = (top / totalY) * 100;
        const bottomBoundary = ((top + centerY) / totalY) * 100;

        const leftHandle = host.querySelector(".totc-v2-dock-resizer--left");
        const rightHandle = host.querySelector(".totc-v2-dock-resizer--right");
        const topHandle = host.querySelector(".totc-v2-dock-resizer--top");
        const bottomHandle = host.querySelector(".totc-v2-dock-resizer--bottom");
        if (leftHandle) leftHandle.style.left = `${leftBoundary}%`;
        if (rightHandle) rightHandle.style.left = `${rightBoundary}%`;
        if (topHandle) topHandle.style.top = `${topBoundary}%`;
        if (bottomHandle) bottomHandle.style.top = `${bottomBoundary}%`;
    }

    #isDockOccupied(dock) {
        return Boolean(dock?.stacks?.some((stack) => (stack?.panels?.length ?? 0) > 0));
    }

    async #getUnifiedCompendiumItems() {
        if (Array.isArray(this._compendiumItemEntries)) return this._compendiumItemEntries;

        const packs = Array.from(game.packs ?? []);
        const itemPacks = packs.filter((pack) => {
            const documentName = pack?.documentName ?? pack?.metadata?.type ?? pack?.metadata?.documentName ?? "";
            return documentName === "Item";
        });

        const entries = [];
        for (const pack of itemPacks) {
            let documents = [];
            try {
                documents = Array.from(await pack.getDocuments());
            } catch (error) {
                console.warn("[turn-of-the-century] Failed to load item compendium", pack?.collection ?? pack?.metadata?.label, error);
                continue;
            }

            for (const document of documents) {
                entries.push({
                    uuid: document?.uuid ?? `Compendium.${pack.collection}.${document?.id}`,
                    name: document?.name ?? "Unnamed Item",
                    packLabel: pack?.metadata?.label ?? pack?.title ?? pack?.collection ?? "Compendium"
                });
            }
        }

        entries.sort((left, right) => {
            const nameCompare = String(left.name ?? "").localeCompare(String(right.name ?? ""), undefined, { sensitivity: "base" });
            if (nameCompare !== 0) return nameCompare;
            return String(left.packLabel ?? "").localeCompare(String(right.packLabel ?? ""), undefined, { sensitivity: "base" });
        });

        this._compendiumItemEntries = entries;
        return entries;
    }

    #showGhost(rect, label) {
        const ghost = this.element?.querySelector("[data-drop-ghost='true']");
        const ghostLabel = this.element?.querySelector("[data-drop-label='true']");
        if (!ghost || !rect) return;

        ghost.hidden = false;
        ghost.style.left = `${rect.left}px`;
        ghost.style.top = `${rect.top}px`;
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
        if (ghostLabel) {
            ghostLabel.textContent = label ?? "Drop Target";
        }
    }

    #hideGhost() {
        const ghost = this.element?.querySelector("[data-drop-ghost='true']");
        if (!ghost) return;
        ghost.hidden = true;
        ghost.style.removeProperty("left");
        ghost.style.removeProperty("top");
        ghost.style.removeProperty("width");
        ghost.style.removeProperty("height");
    }
}
