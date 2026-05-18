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

        return {
            enabled: policy.enabled,
            debugGovernance: policy.debugGovernance,
            hasUserLayout: Boolean(this.stateStore?.getUserLayout?.()),
            panels: PANEL_LIBRARY,
            layout: this.layoutEngine.getLayout(),
            dockWeights: this.layoutEngine.getDockWeightLayout(),
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

        const docksMarkup = WORKSPACE_V2_DOCK_IDS
            .map((dockId) => this.#renderDockMarkup(dockId, context.layout.root[dockId], context))
            .join("\n");

        root.innerHTML = `
<section class="totc-workspace-v2-shell">
    <header class="totc-workspace-v2-shell__header">
        <h2>Turn of the Century Workspace V2</h2>
        <div>Scaffold active: ${context.enabled ? "yes" : "no"}</div>
    </header>
    <main class="totc-workspace-v2-shell__main">
        <p>Milestone 3 active: edge docking, top/bottom stacking, and tab composition with ghost previews.</p>
        <p>Milestone 4 active: dock splitters, stack ratios, and floating window move/resize.</p>
        <p>User layout present: ${context.hasUserLayout ? "yes" : "no"}</p>
        <section class="totc-workspace-v2-shell__palette" aria-label="Panel Library">
            ${context.panels.map((panel) => `
            <button
                type="button"
                class="totc-v2-panel-chip"
                draggable="true"
                data-panel-id="${panel.id}">
                ${panel.title}
            </button>`).join("")}
        </section>
        <section class="totc-v2-layout" data-layout-root="true">
            ${docksMarkup}
            ${this.#renderDockSplittersMarkup()}
            ${this.#renderFloatingWindowsMarkup(context.layout.root.floatingWindows ?? [])}
            <div class="totc-v2-ghost" data-drop-ghost="true" hidden>
                <span data-drop-label="true"></span>
            </div>
        </section>
        <div class="totc-workspace-v2-shell__actions">
            <button type="button" data-action="totc-v2-audit">Audit Hidden Regions</button>
            <button type="button" data-action="totc-v2-clear-layout">Clear User Layout</button>
        </div>
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

        this.element?.querySelectorAll("[data-action='totc-v2-audit']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                const report = this.governor?.audit?.();
                const hidden = report?.hiddenCount ?? 0;
                const total = report?.rows?.length ?? 0;
                ui.notifications?.info(`Workspace V2 governance audit: ${hidden}/${total} regions hidden.`);
            });
        });

        this.element?.querySelectorAll("[data-action='totc-v2-clear-layout']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                await this.stateStore?.clearUserLayout?.();
                this.layoutEngine.setLayout(null);
                ui.notifications?.info("Workspace V2 user layout cleared.");
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

        this.element?.querySelectorAll("[data-action='floating-close']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
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
                const stackMarkup = this.#renderStackMarkup(dockId, stack, context);
                const splitterMarkup = index < stacks.length - 1
                    ? this.#renderStackSplitterMarkup(dockId, stack.id, stacks[index + 1]?.id, dock?.orientation)
                    : "";
                return `${stackMarkup}${splitterMarkup}`;
            })
            .join("");
        const orientationClass = dock?.orientation === "horizontal" ? "is-horizontal" : "is-vertical";

        return `
        <section class="totc-v2-dock totc-v2-dock--${dockId} ${orientationClass}" data-dock-id="${dockId}">
            <header>${DOCK_LABELS[dockId] ?? dockId}</header>
            <div class="totc-v2-dock__stacks ${orientationClass}" data-dock-stacks="${dockId}">
                ${stackItemsMarkup || "<div class='totc-v2-dock__empty'>Drop panel here</div>"}
            </div>
        </section>`;
    }

    #renderStackMarkup(dockId, stack, context = {}) {
        const tabsMarkup = (stack?.panels ?? [])
            .map((panel) => `
            <button
                type="button"
                class="totc-v2-stack__tab ${panel.id === stack.activePanelId ? "is-active" : ""}">
                ${panel.title}
            </button>`)
            .join("");

        const activePanel = (stack?.panels ?? []).find((panel) => panel.id === stack.activePanelId) ?? stack?.panels?.[0];
        const panelContent = this.#renderPanelContent(activePanel, context);

        return `
        <article class="totc-v2-stack" data-dock-id="${dockId}" data-stack-id="${stack.id}" style="flex-grow:${Number(stack.size) || 1};">
            <div class="totc-v2-stack__tabs">${tabsMarkup}</div>
            <div class="totc-v2-stack__actions">
                <button type="button" data-action="float-panel" data-dock-id="${dockId}" data-stack-id="${stack.id}" data-panel-id="${activePanel?.id ?? ""}">Float</button>
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

    #renderDockSplittersMarkup() {
        return `
        <div class="totc-v2-dock-resizer totc-v2-dock-resizer--left" data-action="dock-resizer" data-dock-id="leftDock" data-axis="x" data-direction="increase" title="Resize dock"></div>
        <div class="totc-v2-dock-resizer totc-v2-dock-resizer--right" data-action="dock-resizer" data-dock-id="rightDock" data-axis="x" data-direction="increase" title="Resize dock"></div>
        <div class="totc-v2-dock-resizer totc-v2-dock-resizer--top" data-action="dock-resizer" data-dock-id="topDock" data-axis="y" data-direction="increase" title="Resize dock"></div>
        <div class="totc-v2-dock-resizer totc-v2-dock-resizer--bottom" data-action="dock-resizer" data-dock-id="bottomDock" data-axis="y" data-direction="increase" title="Resize dock"></div>`;
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
                <header class="totc-v2-floating__header" data-action="floating-move-handle" data-floating-id="${floatingWindow.id}">
                    <span>${title}</span>
                    <div class="totc-v2-floating__buttons">
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

        this.element?.querySelectorAll("[data-panel-id]")?.forEach((panelButton) => {
            panelButton.addEventListener("dragstart", (event) => {
                const panelId = panelButton.dataset.panelId;
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

        if (this._resizeSession.type === "dock") {
            const current = this._resizeSession.startWeights;
            const stepX = deltaX / Math.max(window.innerWidth, 1);
            const stepY = deltaY / Math.max(window.innerHeight, 1);
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
            this.render(false);
            return;
        }

        if (this._resizeSession.type === "stack") {
            const dock = this.layoutEngine.getLayout().root[this._resizeSession.dockId] ?? { stacks: [] };
            const leading = dock.stacks.find((stack) => stack.id === this._resizeSession.leadingStackId);
            if (!leading) return;

            const orientation = dock.orientation ?? "vertical";
            const delta = orientation === "horizontal" ? deltaY / 100 : deltaX / 100;
            this.layoutEngine.resizeStack(this._resizeSession.dockId, leading.id, delta);
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
