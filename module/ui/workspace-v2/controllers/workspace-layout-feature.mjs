import { WorkspaceFeature } from "../workspace-feature.mjs";
import { InteractionController } from "../interaction-controller.mjs";
import {
    buildDesignCommandPaletteModel,
    renderDesignCommandPalette
} from "../panels/design-command-palette.mjs";
import { WORKSPACE_V2_DOCK_IDS } from "../constants.mjs";

// ---------------------------------------------------------------------------
// Module-level constants
// ---------------------------------------------------------------------------

const WORKSPACE_PANEL_DRAG_MIME = "application/x-totc-workspace-panel";

const MIN_FLOAT_WIDTH = 240;
const MIN_FLOAT_HEIGHT = 160;
const MIN_TOP_BOTTOM_DOCK_HEIGHT = 128;
const MIN_LEFT_RIGHT_DOCK_WIDTH = 240;
const COLLAPSED_TOP_BOTTOM_DOCK_HEIGHT = 38;
const COLLAPSED_LEFT_RIGHT_DOCK_WIDTH = 42;

const DOCK_LABELS = Object.freeze({
    leftDock: "Left Dock",
    topDock: "Top Dock",
    centerDock: "Center Dock",
    rightDock: "Right Dock",
    bottomDock: "Bottom Dock"
});

function dataTransferHasType(dataTransfer, mimeType) {
    const types = dataTransfer?.types;
    if (typeof types?.contains === "function") return types.contains(mimeType);
    return Array.from(types ?? []).includes(mimeType);
}

// ---------------------------------------------------------------------------
// WorkspaceLayoutFeature
// ---------------------------------------------------------------------------

/**
 * Owns all workspace shell rendering, dock/stack/floating-window management,
 * drag-and-drop, resize sessions, and the design lens and command-palette state.
 *
 * Dependencies injected at construction time:
 * - layoutEngine      — LayoutEngine instance
 * - stateStore        — persistent user layout store
 * - panelRegistry     — registered panel definitions
 * - panelHost         — WorkspacePanelHost for rendering panel content
 * - sceneWorkspaceController — panel-scene resolution helpers
 * - designActionRegistry     — for command palette actions
 * - render            — () => void — triggers a root re-render
 * - escapeHTML        — (s: string) => string — HTML entity escaping
 * - isGM              — () => boolean
 * - isRollLocked      — () => boolean
 * - openFoundrySettings — () => void (shell settings button)
 * - shutDown          — () => Promise<void> (shell exit button)
 */
export class WorkspaceLayoutFeature extends WorkspaceFeature {
    constructor({
        layoutEngine = null,
        stateStore = null,
        panelRegistry = null,
        panelHost = null,
        sceneWorkspaceController = null,
        designActionRegistry = null,
        executeDesignAction = async () => {},
        render = () => {},
        escapeHTML = (s) => String(s ?? ""),
        isGM = () => false,
        isRollLocked = () => false,
        openFoundrySettings = () => {},
        shutDown = async () => {}
    } = {}) {
        super();
        this.layoutEngine = layoutEngine;
        this.stateStore = stateStore;
        this.panelRegistry = panelRegistry;
        this.panelHost = panelHost;
        this.sceneWorkspaceController = sceneWorkspaceController;
        this.designActionRegistry = designActionRegistry;
        this.executeDesignActionCallback = executeDesignAction;
        this.renderCallback = render;
        this.escapeHTMLCallback = escapeHTML;
        this.isGMCallback = isGM;
        this.isRollLockedCallback = isRollLocked;
        this.openFoundrySettingsCallback = openFoundrySettings;
        this.shutDownCallback = shutDown;

        this.interactionController = new InteractionController();
        this.ghostIntent = null;
        this._resizeSession = null;
        this._onResizePointerMove = this.#onResizePointerMove.bind(this);
        this._onResizePointerUp = this.#onResizePointerUp.bind(this);

        this.activeDesignLensPanelIds = new Set();
        this.#designCommandPaletteOpen = false;
        this.#designCommandPaletteQuery = "";

        this.wiredElement = null;
    }

    // Private fields
    #designCommandPaletteOpen;
    #designCommandPaletteQuery;

    // -------------------------------------------------------------------------
    // Public accessors
    // -------------------------------------------------------------------------

    get designCommandPaletteOpen() { return this.#designCommandPaletteOpen; }
    get designCommandPaletteQuery() { return this.#designCommandPaletteQuery; }

    isDesignLensActive(panelId) {
        return Boolean(panelId && this.activeDesignLensPanelIds.has(panelId));
    }

    getActiveCenterMapPanel(layout = this.layoutEngine?.getLayout()) {
        const centerDock = layout?.root?.centerDock;
        for (const stack of centerDock?.stacks ?? []) {
            const activePanel = (stack?.panels ?? []).find((panel) => panel.id === stack.activePanelId) ?? stack?.panels?.[0];
            if (this.#isMapPanel(activePanel)) return activePanel;
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // WorkspaceFeature contract
    // -------------------------------------------------------------------------

    async prepareContext(context) {
        const activeLayout = context.layout ?? this.layoutEngine?.getLayout();
        const activePanel = this.#getPrimaryActivePanel(activeLayout);
        const isGM = this.isGMCallback();

        context.designCommandPalette = buildDesignCommandPaletteModel({
            active: this.#designCommandPaletteOpen,
            activePanel: activePanel,
            isGM,
            query: this.#designCommandPaletteQuery,
            registry: this.designActionRegistry
        });
    }

    bind(rootElement) {
        if (this.wiredElement === rootElement) return;
        this.wiredElement = rootElement;

        if (!rootElement || typeof rootElement.addEventListener !== "function") return;

        this.#wireShellMenuHandlers(rootElement);
        this.#wireLayoutButtonHandlers(rootElement);
        this.#wireDesignLensHandlers(rootElement);
        this.#wireDesignCommandPaletteHandlers(rootElement);
        this.#wireInteractionHandlers(rootElement);
        this.#wireResizeHandlers(rootElement);
        this.#wireGlobalClickHandler(rootElement);
    }

    dispose() {
        document?.removeEventListener?.("pointermove", this._onResizePointerMove);
        document?.removeEventListener?.("pointerup", this._onResizePointerUp);
        this._resizeSession = null;
        this.wiredElement = null;
    }

    // -------------------------------------------------------------------------
    // Shell rendering (replaces root's _renderHTML)
    // -------------------------------------------------------------------------

    renderShell(context) {
        const root = document.createElement("section");
        root.classList.add("totc-workspace-v2-root");

        const isRollLocked = this.isRollLockedCallback();
        if (isRollLocked) {
            root.classList.add("is-roll-locked");
            root.setAttribute("data-roll-lock", "true");
        }
        root.setAttribute("data-drag-host", "true");

        const dockWeights = context.dockWeights ?? { left: 0.18, centerX: 0.64, right: 0.18, top: 0.18, centerY: 0.64, bottom: 0.18 };
        const layoutRoot = context.layout?.root ?? {};

        const leftOccupied = this.#isDockOccupied(layoutRoot.leftDock);
        const rightOccupied = this.#isDockOccupied(layoutRoot.rightDock);
        const topOccupied = this.#isDockOccupied(layoutRoot.topDock);
        const bottomOccupied = this.#isDockOccupied(layoutRoot.bottomDock);

        const leftTrack = leftOccupied && layoutRoot.leftDock?.collapsed
            ? `${COLLAPSED_LEFT_RIGHT_DOCK_WIDTH}px`
            : `minmax(${leftOccupied ? `${MIN_LEFT_RIGHT_DOCK_WIDTH}px` : "0px"}, ${Math.max(1, Math.round(dockWeights.left * 100))}fr)`;
        const rightTrack = rightOccupied && layoutRoot.rightDock?.collapsed
            ? `${COLLAPSED_LEFT_RIGHT_DOCK_WIDTH}px`
            : `minmax(${rightOccupied ? `${MIN_LEFT_RIGHT_DOCK_WIDTH}px` : "0px"}, ${Math.max(1, Math.round(dockWeights.right * 100))}fr)`;
        const topTrack = topOccupied && layoutRoot.topDock?.collapsed
            ? `${COLLAPSED_TOP_BOTTOM_DOCK_HEIGHT}px`
            : `minmax(${topOccupied ? `${MIN_TOP_BOTTOM_DOCK_HEIGHT}px` : "0px"}, ${Math.max(1, Math.round(dockWeights.top * 100))}fr)`;
        const bottomTrack = bottomOccupied && layoutRoot.bottomDock?.collapsed
            ? `${COLLAPSED_TOP_BOTTOM_DOCK_HEIGHT}px`
            : `minmax(${bottomOccupied ? `${MIN_TOP_BOTTOM_DOCK_HEIGHT}px` : "0px"}, ${Math.max(1, Math.round(dockWeights.bottom * 100))}fr)`;

        const columnTemplate = `${leftTrack} minmax(0, ${Math.max(1, Math.round((dockWeights.centerX ?? 0.64) * 100))}fr) ${rightTrack}`;
        const rowTemplate = `${topTrack} minmax(0, ${Math.max(1, Math.round((dockWeights.centerY ?? 0.64) * 100))}fr) ${bottomTrack}`;

        const docksMarkup = WORKSPACE_V2_DOCK_IDS
            .map((dockId) => this.#renderDockMarkup(dockId, context.layout?.root?.[dockId], context))
            .join("\n");

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
<section class="totc-workspace-v2-shell${nativeCanvasShellClass}">
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
        <section class="totc-v2-layout${nativeCanvasShellClass}" data-layout-root="true" style="grid-template-columns:${columnTemplate};grid-template-rows:${rowTemplate};">
            ${docksMarkup}
            ${this.#renderDockSplittersMarkup(dockWeights, layoutRoot)}
            ${this.#renderFloatingWindowsMarkup(context.layout?.root?.floatingWindows ?? [])}
            <div class="totc-v2-ghost" data-drop-ghost="true" hidden>
                <span data-drop-label="true"></span>
            </div>
        </section>
    </main>
</section>`;

        return root;
    }

    // -------------------------------------------------------------------------
    // Private: shell menu wiring
    // -------------------------------------------------------------------------

    #wireShellMenuHandlers(rootElement) {
        rootElement.addEventListener("click", async (event) => {
            const exitWorldBtn = event.target?.closest("[data-action='totc-v2-exit-world']");
            if (exitWorldBtn) {
                event.preventDefault();
                event.stopPropagation();
                if (!this.isGMCallback()) {
                    globalThis.ui?.notifications?.warn("Only a GM can exit the world to setup.");
                    return;
                }
                await this.shutDownCallback();
                return;
            }

            const openSettingsBtn = event.target?.closest("[data-action='totc-v2-open-foundry-settings']");
            if (openSettingsBtn) {
                event.preventDefault();
                event.stopPropagation();
                this.openFoundrySettingsCallback();
                const menu = rootElement.querySelector("[data-command-menu='true']");
                const panelMenu = rootElement.querySelector("[data-panel-menu='true']");
                const toggleButton = rootElement.querySelector("[data-action='totc-v2-command-menu-toggle']");
                const panelToggleButton = rootElement.querySelector("[data-action='totc-v2-panel-menu-toggle']");
                if (menu) menu.hidden = true;
                if (panelMenu) panelMenu.hidden = true;
                toggleButton?.setAttribute("aria-expanded", "false");
                panelToggleButton?.setAttribute("aria-expanded", "false");
                return;
            }

            const commandMenuToggle = event.target?.closest("[data-action='totc-v2-command-menu-toggle']");
            if (commandMenuToggle) {
                event.preventDefault();
                event.stopPropagation();
                const menu = rootElement.querySelector("[data-command-menu='true']");
                const panelMenu = rootElement.querySelector("[data-panel-menu='true']");
                const panelToggleButton = rootElement.querySelector("[data-action='totc-v2-panel-menu-toggle']");
                if (!menu) return;
                const expanded = !menu.hidden;
                menu.hidden = expanded;
                commandMenuToggle.setAttribute("aria-expanded", expanded ? "false" : "true");
                if (!expanded && panelMenu) {
                    panelMenu.hidden = true;
                    panelToggleButton?.setAttribute("aria-expanded", "false");
                }
                return;
            }

            const panelMenuToggle = event.target?.closest("[data-action='totc-v2-panel-menu-toggle']");
            if (panelMenuToggle) {
                event.preventDefault();
                event.stopPropagation();
                const panelMenu = rootElement.querySelector("[data-panel-menu='true']");
                const menu = rootElement.querySelector("[data-command-menu='true']");
                const commandToggleButton = rootElement.querySelector("[data-action='totc-v2-command-menu-toggle']");
                if (!panelMenu) return;
                const expanded = !panelMenu.hidden;
                panelMenu.hidden = expanded;
                panelMenuToggle.setAttribute("aria-expanded", expanded ? "false" : "true");
                if (!expanded && menu) {
                    menu.hidden = true;
                    commandToggleButton?.setAttribute("aria-expanded", "false");
                }
                return;
            }
        });
    }

    // -------------------------------------------------------------------------
    // Private: layout button wiring
    // -------------------------------------------------------------------------

    #wireLayoutButtonHandlers(rootElement) {
        rootElement.addEventListener("change", async (event) => {
            const checkbox = event.target?.closest("[data-action='toggle-panel-visibility']");
            if (!checkbox) return;
            event.stopPropagation();
            const panelId = checkbox.dataset.panelId;
            if (!panelId) return;
            const panelDef = this.panelRegistry?.get(panelId);
            if (!panelDef) return;
            const nextLayout = checkbox.checked
                ? this.layoutEngine.restorePanel(panelDef, { preferredDockId: panelDef.defaultDock ?? null })
                : this.layoutEngine.closePanel(panelId);
            await this.stateStore?.setUserLayout?.(nextLayout);
            this.renderCallback({ force: false });
        });

        rootElement.addEventListener("pointerdown", (event) => {
            const redockBtn = event.target?.closest("[data-action='redock-panel']");
            if (redockBtn) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            const floatingCloseBtn = event.target?.closest("[data-action='floating-close']");
            if (floatingCloseBtn) {
                event.stopPropagation();
                return;
            }
        });

        rootElement.addEventListener("click", async (event) => {
            const dockCollapseBtn = event.target?.closest("[data-action='toggle-dock-collapse']");
            if (dockCollapseBtn) {
                event.preventDefault();
                event.stopPropagation();
                const dockId = dockCollapseBtn.dataset.dockId;
                if (!dockId) return;
                const nextLayout = this.layoutEngine.toggleDockCollapsed(dockId);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.renderCallback({ force: false });
                return;
            }

            const tabBtn = event.target?.closest("[data-action='activate-tab']");
            if (tabBtn) {
                event.preventDefault();
                const { dockId, stackId, panelId } = tabBtn.dataset;
                if (!dockId || !stackId || !panelId) return;
                const nextLayout = this.layoutEngine.setActivePanel(dockId, stackId, panelId);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.renderCallback({ force: false });
                return;
            }

            const floatBtn = event.target?.closest("[data-action='float-panel']");
            if (floatBtn) {
                event.preventDefault();
                const panelId = floatBtn.dataset.panelId;
                const panelDef = this.#resolvePanelDefinition(panelId);
                if (!panelDef) return;
                const nextLayout = this.layoutEngine.floatPanel(panelDef);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.renderCallback({ force: false });
                return;
            }

            const closePanelBtn = event.target?.closest("[data-action='close-panel']");
            if (closePanelBtn) {
                event.preventDefault();
                event.stopPropagation();
                const panelId = closePanelBtn.dataset.panelId;
                if (!panelId) return;
                const nextLayout = this.layoutEngine.closePanel(panelId);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.renderCallback({ force: false });
                return;
            }

            const undockBtn = event.target?.closest("[data-action='undock-panel']");
            if (undockBtn) {
                event.preventDefault();
                event.stopPropagation();
                const { dockId, stackId, panelId } = undockBtn.dataset;
                if (!dockId || !stackId || !panelId) return;
                const nextLayout = this.layoutEngine.undockPanel({ dockId, stackId, panelId });
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.renderCallback({ force: false });
                return;
            }

            const redockBtn = event.target?.closest("[data-action='redock-panel']");
            if (redockBtn) {
                event.preventDefault();
                event.stopPropagation();
                const floatingId = redockBtn.dataset.floatingId;
                if (!floatingId) return;
                const nextLayout = this.layoutEngine.redockFloatingWindow(floatingId);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.renderCallback({ force: false });
                return;
            }

            const floatingCloseBtn = event.target?.closest("[data-action='floating-close']");
            if (floatingCloseBtn) {
                event.preventDefault();
                event.stopPropagation();
                const windowId = floatingCloseBtn.dataset.floatingId;
                if (!windowId) return;
                const nextLayout = this.layoutEngine.removeFloatingWindow(windowId);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.renderCallback({ force: false });
                return;
            }
        });
    }

    // -------------------------------------------------------------------------
    // Private: design lens wiring
    // -------------------------------------------------------------------------

    #wireDesignLensHandlers(rootElement) {
        rootElement.addEventListener("click", (event) => {
            const button = event.target?.closest("[data-action='toggle-design-lens']");
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            const panelId = String(button.dataset.panelId ?? "").trim();
            if (!panelId || !this.isGMCallback()) return;
            if (this.activeDesignLensPanelIds.has(panelId)) this.activeDesignLensPanelIds.delete(panelId);
            else this.activeDesignLensPanelIds.add(panelId);
            this.renderCallback({ force: false });
        });
    }

    // -------------------------------------------------------------------------
    // Private: design command palette wiring
    // -------------------------------------------------------------------------

    #wireDesignCommandPaletteHandlers(rootElement) {
        rootElement.addEventListener("click", async (event) => {
            const toggleBtn = event.target?.closest("[data-action='toggle-design-command-palette']");
            if (toggleBtn) {
                event.preventDefault();
                event.stopPropagation();
                const menu = rootElement.querySelector("[data-command-menu='true']");
                const panelMenu = rootElement.querySelector("[data-panel-menu='true']");
                const menuToggleButton = rootElement.querySelector("[data-action='totc-v2-command-menu-toggle']");
                const panelToggleButton = rootElement.querySelector("[data-action='totc-v2-panel-menu-toggle']");
                if (menu) menu.hidden = true;
                if (panelMenu) panelMenu.hidden = true;
                menuToggleButton?.setAttribute("aria-expanded", "false");
                panelToggleButton?.setAttribute("aria-expanded", "false");
                this.#designCommandPaletteOpen = !this.#designCommandPaletteOpen;
                if (!this.#designCommandPaletteOpen) this.#designCommandPaletteQuery = "";
                this.renderCallback({ force: false });
                return;
            }

            const executeBtn = event.target?.closest("[data-action='design-command-palette-execute']");
            if (executeBtn) {
                event.preventDefault();
                event.stopPropagation();
                const actionId = String(executeBtn.dataset.designActionId ?? "").trim();
                const panelId = String(executeBtn.dataset.panelId ?? "").trim();
                await this.executeDesignActionCallback(actionId, { panelId });
                this.#designCommandPaletteOpen = false;
                this.#designCommandPaletteQuery = "";
                this.renderCallback({ force: false });
                return;
            }
        });
    }

    // -------------------------------------------------------------------------
    // Private: global click handler (close menus / palette on outside click)
    // -------------------------------------------------------------------------

    #wireGlobalClickHandler(rootElement) {
        rootElement.addEventListener("click", (event) => {
            const menu = rootElement.querySelector("[data-command-menu='true']");
            const panelMenu = rootElement.querySelector("[data-panel-menu='true']");
            const toggleButton = rootElement.querySelector("[data-action='totc-v2-command-menu-toggle']");
            const panelToggleButton = rootElement.querySelector("[data-action='totc-v2-panel-menu-toggle']");
            const commandPalette = rootElement.querySelector("[data-design-command-palette='true']");
            const commandPaletteToggle = rootElement.querySelector("[data-action='toggle-design-command-palette']");

            const target = event.target;
            if (!(target instanceof Node)) return;

            if (menu && !menu.hidden && !menu.contains(target) && !toggleButton?.contains(target)) {
                menu.hidden = true;
                toggleButton?.setAttribute("aria-expanded", "false");
            }

            if (panelMenu && !panelMenu.hidden && !panelMenu.contains(target) && !panelToggleButton?.contains(target)) {
                panelMenu.hidden = true;
                panelToggleButton?.setAttribute("aria-expanded", "false");
            }

            if (this.#designCommandPaletteOpen && commandPalette && !commandPalette.contains(target) && !commandPaletteToggle?.contains(target)) {
                this.#designCommandPaletteOpen = false;
                this.#designCommandPaletteQuery = "";
                this.renderCallback({ force: false });
            }
        });
    }

    // -------------------------------------------------------------------------
    // Private: drag-and-drop interaction
    // -------------------------------------------------------------------------

    #wireInteractionHandlers(rootElement) {
        rootElement.addEventListener("dragstart", (event) => {
            const panelButton = event.target?.closest("[data-panel-id], [data-drag-panel-id]");
            if (!panelButton) return;
            const panelId = panelButton.dataset.panelId || panelButton.dataset.dragPanelId;
            event.dataTransfer?.setData(WORKSPACE_PANEL_DRAG_MIME, panelId ?? "");
            event.dataTransfer?.setData("text/plain", panelId ?? "");
            event.dataTransfer.effectAllowed = "move";
        });

        rootElement.addEventListener("dragend", (event) => {
            if (!event.target?.closest("[data-panel-id], [data-drag-panel-id]")) return;
            this.interactionController.clearIntent();
            this.#hideGhost(rootElement);
        });

        rootElement.addEventListener("dragover", (event) => {
            const host = rootElement.querySelector?.("[data-layout-root='true']");
            if (!host || !host.contains(event.target)) return;
            if (!dataTransferHasType(event.dataTransfer, WORKSPACE_PANEL_DRAG_MIME)) return;
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
            this.#showGhost(ghostRect, intent.label, rootElement);
            event.dataTransfer.dropEffect = "move";
        });

        rootElement.addEventListener("dragleave", (event) => {
            const host = rootElement.querySelector?.("[data-layout-root='true']");
            if (!host || !host.contains(event.target)) return;
            const related = event.relatedTarget;
            if (related && host.contains(related)) return;
            this.interactionController.clearIntent();
            this.#hideGhost(rootElement);
        });

        rootElement.addEventListener("drop", async (event) => {
            const host = rootElement.querySelector?.("[data-layout-root='true']");
            if (!host || !host.contains(event.target)) return;
            if (!dataTransferHasType(event.dataTransfer, WORKSPACE_PANEL_DRAG_MIME)) return;
            event.preventDefault();
            const panelId = event.dataTransfer?.getData(WORKSPACE_PANEL_DRAG_MIME);
            const panelDef = this.#resolvePanelDefinition(panelId);
            if (!panelDef) {
                this.#hideGhost(rootElement);
                return;
            }
            const intent = this.interactionController.getIntent();
            const nextLayout = this.layoutEngine.applyDropIntent(panelDef, intent ?? { kind: "edge", dockId: "centerDock" });
            await this.stateStore?.setUserLayout?.(nextLayout);
            this.interactionController.clearIntent();
            this.#hideGhost(rootElement);
            this.renderCallback({ force: false });
        });
    }

    // -------------------------------------------------------------------------
    // Private: resize / move sessions
    // -------------------------------------------------------------------------

    #wireResizeHandlers(rootElement) {
        rootElement.addEventListener("pointerdown", (event) => {
            const dockResizer = event.target?.closest("[data-action='dock-resizer']");
            if (dockResizer) {
                event.preventDefault();
                event.stopPropagation();
                this.#beginResizeSession({
                    type: "dock",
                    dockId: dockResizer.dataset.dockId,
                    axis: dockResizer.dataset.axis,
                    startX: event.clientX,
                    startY: event.clientY,
                    startWeights: this.layoutEngine.getDockWeightLayout()
                });
                return;
            }

            const moveHandle = event.target?.closest("[data-action='floating-move-handle']");
            if (moveHandle) {
                event.preventDefault();
                event.stopPropagation();
                const floatingId = moveHandle.dataset.floatingId;
                const floatingWindow = this.layoutEngine.getLayout().root.floatingWindows.find((entry) => entry.id === floatingId);
                if (!floatingWindow) return;
                this.#beginResizeSession({
                    type: "floating-move",
                    floatingId,
                    panelDef: floatingWindow.panel ? { ...floatingWindow.panel } : null,
                    startX: event.clientX,
                    startY: event.clientY,
                    original: { x: floatingWindow.x, y: floatingWindow.y }
                });
                return;
            }

            const resizeHandle = event.target?.closest("[data-action='floating-resize-handle']");
            if (resizeHandle) {
                event.preventDefault();
                event.stopPropagation();
                const floatingId = resizeHandle.dataset.floatingId;
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
                return;
            }

            const stackSplitter = event.target?.closest("[data-action='stack-splitter']");
            if (stackSplitter) {
                event.preventDefault();
                event.stopPropagation();
                this.#beginResizeSession({
                    type: "stack",
                    dockId: stackSplitter.dataset.dockId,
                    leadingStackId: stackSplitter.dataset.leadingStackId,
                    trailingStackId: stackSplitter.dataset.trailingStackId,
                    startX: event.clientX,
                    startY: event.clientY
                });
                return;
            }
        });
    }

    #beginResizeSession(session) {
        this._resizeSession = { ...session, accumulatedDeltaX: 0, accumulatedDeltaY: 0 };
        document.addEventListener("pointermove", this._onResizePointerMove);
        document.addEventListener("pointerup", this._onResizePointerUp, { once: true });
    }

    async #onResizePointerUp() {
        document.removeEventListener("pointermove", this._onResizePointerMove);
        const session = this._resizeSession;
        this._resizeSession = null;

        if (session?.type === "floating-move" && session.panelDef?.id && session.panelDef?.title) {
            const intent = this.interactionController.getIntent();
            if (intent) {
                const droppedLayout = this.layoutEngine.applyDropIntent(session.panelDef, intent);
                await this.stateStore?.setUserLayout?.(droppedLayout);
                this.interactionController.clearIntent();
                this.#hideGhost(this.wiredElement);
                this.renderCallback({ force: false });
                return;
            }
        }

        await this.stateStore?.setUserLayout?.(this.layoutEngine.getLayout());
        this.interactionController.clearIntent();
        this.#hideGhost(this.wiredElement);
        this.renderCallback({ force: false });
    }

    #onResizePointerMove(event) {
        if (!this._resizeSession) return;
        const deltaX = event.clientX - this._resizeSession.startX;
        const deltaY = event.clientY - this._resizeSession.startY;
        const hostBounds = this.wiredElement?.querySelector("[data-layout-root='true']")?.getBoundingClientRect();

        if (this._resizeSession.type === "dock") {
            const current = this._resizeSession.startWeights;
            const viewportWidth = Math.max(hostBounds?.width ?? globalThis.window?.innerWidth ?? 1200, 1);
            const viewportHeight = Math.max(hostBounds?.height ?? globalThis.window?.innerHeight ?? 800, 1);
            const accumulatedX = this._resizeSession.accumulatedDeltaX + deltaX;
            const accumulatedY = this._resizeSession.accumulatedDeltaY + deltaY;

            if (this._resizeSession.dockId === "leftDock" || this._resizeSession.dockId === "rightDock") {
                const pixelThreshold = 1;
                if (Math.abs(accumulatedX) >= pixelThreshold) {
                    const appliedDeltaX = Math.floor(accumulatedX);
                    const stepX = appliedDeltaX / viewportWidth;
                    if (this._resizeSession.dockId === "leftDock") {
                        this.layoutEngine.setDockWeight("leftDock", current.left + stepX);
                    } else {
                        this.layoutEngine.setDockWeight("rightDock", current.right - stepX);
                    }
                    this._resizeSession.accumulatedDeltaX = accumulatedX - appliedDeltaX;
                    void this.stateStore?.setUserLayout?.(this.layoutEngine.getLayout());
                    this.#syncDockGridAndSplitters();
                }
            } else if (this._resizeSession.dockId === "topDock" || this._resizeSession.dockId === "bottomDock") {
                const pixelThreshold = 1;
                if (Math.abs(accumulatedY) >= pixelThreshold) {
                    const appliedDeltaY = Math.floor(accumulatedY);
                    const stepY = appliedDeltaY / viewportHeight;
                    if (this._resizeSession.dockId === "topDock") {
                        this.layoutEngine.setDockWeight("topDock", current.top + stepY);
                    } else {
                        this.layoutEngine.setDockWeight("bottomDock", current.bottom - stepY);
                    }
                    this._resizeSession.accumulatedDeltaY = accumulatedY - appliedDeltaY;
                    void this.stateStore?.setUserLayout?.(this.layoutEngine.getLayout());
                    this.#syncDockGridAndSplitters();
                }
            }
            return;
        }

        if (this._resizeSession.type === "stack") {
            const dock = this.layoutEngine.getLayout().root[this._resizeSession.dockId] ?? { stacks: [] };
            const leading = dock.stacks.find((stack) => stack.id === this._resizeSession.leadingStackId);
            const trailing = dock.stacks.find((stack) => stack.id === this._resizeSession.trailingStackId);
            if (!leading || !trailing) return;

            const orientation = dock.orientation ?? "vertical";
            const accumulatedDelta = orientation === "horizontal"
                ? this._resizeSession.accumulatedDeltaX + deltaX
                : this._resizeSession.accumulatedDeltaY + deltaY;
            const pixelThreshold = 1;
            if (Math.abs(accumulatedDelta) >= pixelThreshold) {
                const appliedDelta = Math.floor(accumulatedDelta);
                const delta = appliedDelta / 100;
                this.layoutEngine.resizeStack(this._resizeSession.dockId, leading.id, delta, trailing.id);
                if (orientation === "horizontal") {
                    this._resizeSession.accumulatedDeltaX = accumulatedDelta - appliedDelta;
                } else {
                    this._resizeSession.accumulatedDeltaY = accumulatedDelta - appliedDelta;
                }
                void this.stateStore?.setUserLayout?.(this.layoutEngine.getLayout());
                this.renderCallback({ force: false });
            }
            return;
        }

        if (this._resizeSession.type === "floating-move") {
            const accumulatedX = this._resizeSession.accumulatedDeltaX + deltaX;
            const accumulatedY = this._resizeSession.accumulatedDeltaY + deltaY;
            const pixelThreshold = 1;
            if (Math.abs(accumulatedX) >= pixelThreshold || Math.abs(accumulatedY) >= pixelThreshold) {
                const appliedDeltaX = Math.abs(accumulatedX) >= pixelThreshold ? Math.floor(accumulatedX) : 0;
                const appliedDeltaY = Math.abs(accumulatedY) >= pixelThreshold ? Math.floor(accumulatedY) : 0;
                const nextLayout = this.layoutEngine.updateFloatingWindow(this._resizeSession.floatingId, {
                    x: this._resizeSession.original.x + appliedDeltaX,
                    y: this._resizeSession.original.y + appliedDeltaY
                });
                this._resizeSession.accumulatedDeltaX = accumulatedX - appliedDeltaX;
                this._resizeSession.accumulatedDeltaY = accumulatedY - appliedDeltaY;
                void this.stateStore?.setUserLayout?.(nextLayout);
                this.#syncFloatingElementStyle(
                    this._resizeSession.floatingId,
                    nextLayout.root.floatingWindows.find((entry) => entry.id === this._resizeSession.floatingId)
                );
            }

            const host = this.wiredElement?.querySelector("[data-layout-root='true']");
            const rootBounds = host?.getBoundingClientRect();
            const pointerInsideRoot = Boolean(rootBounds)
                && event.clientX >= rootBounds.left
                && event.clientX <= rootBounds.right
                && event.clientY >= rootBounds.top
                && event.clientY <= rootBounds.bottom;

            if (host && pointerInsideRoot) {
                const stackElements = [...host.querySelectorAll("[data-stack-id]")];
                const intent = this.interactionController.computeIntent({ event, rootElement: host, stackElements });
                if (intent) {
                    const ghostRect = this.interactionController.computeGhostRect({ intent, rootElement: host });
                    this.#showGhost(ghostRect, intent.label, this.wiredElement);
                } else {
                    this.interactionController.clearIntent();
                    this.#hideGhost(this.wiredElement);
                }
            } else {
                this.interactionController.clearIntent();
                this.#hideGhost(this.wiredElement);
            }
            return;
        }

        if (this._resizeSession.type === "floating-resize") {
            const accumulatedX = this._resizeSession.accumulatedDeltaX + deltaX;
            const accumulatedY = this._resizeSession.accumulatedDeltaY + deltaY;
            const pixelThreshold = 1;
            if (Math.abs(accumulatedX) >= pixelThreshold || Math.abs(accumulatedY) >= pixelThreshold) {
                const appliedDeltaX = Math.abs(accumulatedX) >= pixelThreshold ? Math.floor(accumulatedX) : 0;
                const appliedDeltaY = Math.abs(accumulatedY) >= pixelThreshold ? Math.floor(accumulatedY) : 0;
                const nextLayout = this.layoutEngine.updateFloatingWindow(this._resizeSession.floatingId, {
                    width: Math.max(MIN_FLOAT_WIDTH, this._resizeSession.original.width + appliedDeltaX),
                    height: Math.max(MIN_FLOAT_HEIGHT, this._resizeSession.original.height + appliedDeltaY)
                });
                this._resizeSession.accumulatedDeltaX = accumulatedX - appliedDeltaX;
                this._resizeSession.accumulatedDeltaY = accumulatedY - appliedDeltaY;
                void this.stateStore?.setUserLayout?.(nextLayout);
                this.#syncFloatingElementStyle(
                    this._resizeSession.floatingId,
                    nextLayout.root.floatingWindows.find((entry) => entry.id === this._resizeSession.floatingId)
                );
            }
        }
    }

    // -------------------------------------------------------------------------
    // Private: DOM sync helpers
    // -------------------------------------------------------------------------

    #syncFloatingElementStyle(floatingId, floatingWindow) {
        const element = this.wiredElement?.querySelector(`[data-floating-id='${floatingId}']`);
        if (!element || !floatingWindow) return;
        element.style.left = `${floatingWindow.x}px`;
        element.style.top = `${floatingWindow.y}px`;
        element.style.width = `${floatingWindow.width}px`;
        element.style.height = `${floatingWindow.height}px`;
        element.style.zIndex = `${floatingWindow.zIndex}`;
    }

    #syncDockGridAndSplitters() {
        const host = this.wiredElement?.querySelector("[data-layout-root='true']");
        if (!host) return;

        const layout = this.layoutEngine.getLayout();
        const dockWeights = this.layoutEngine.getDockWeightLayout();
        const leftOccupied = this.#isDockOccupied(layout.root.leftDock);
        const rightOccupied = this.#isDockOccupied(layout.root.rightDock);
        const topOccupied = this.#isDockOccupied(layout.root.topDock);
        const bottomOccupied = this.#isDockOccupied(layout.root.bottomDock);

        const leftTrack = leftOccupied && layout.root.leftDock?.collapsed
            ? `${COLLAPSED_LEFT_RIGHT_DOCK_WIDTH}px`
            : `minmax(${leftOccupied ? `${MIN_LEFT_RIGHT_DOCK_WIDTH}px` : "0px"}, ${Math.max(1, Math.round(dockWeights.left * 100))}fr)`;
        const rightTrack = rightOccupied && layout.root.rightDock?.collapsed
            ? `${COLLAPSED_LEFT_RIGHT_DOCK_WIDTH}px`
            : `minmax(${rightOccupied ? `${MIN_LEFT_RIGHT_DOCK_WIDTH}px` : "0px"}, ${Math.max(1, Math.round(dockWeights.right * 100))}fr)`;
        const topTrack = topOccupied && layout.root.topDock?.collapsed
            ? `${COLLAPSED_TOP_BOTTOM_DOCK_HEIGHT}px`
            : `minmax(${topOccupied ? `${MIN_TOP_BOTTOM_DOCK_HEIGHT}px` : "0px"}, ${Math.max(1, Math.round(dockWeights.top * 100))}fr)`;
        const bottomTrack = bottomOccupied && layout.root.bottomDock?.collapsed
            ? `${COLLAPSED_TOP_BOTTOM_DOCK_HEIGHT}px`
            : `minmax(${bottomOccupied ? `${MIN_TOP_BOTTOM_DOCK_HEIGHT}px` : "0px"}, ${Math.max(1, Math.round(dockWeights.bottom * 100))}fr)`;

        host.style.gridTemplateColumns = `${leftTrack} minmax(0, ${Math.max(1, Math.round((dockWeights.centerX ?? 0.64) * 100))}fr) ${rightTrack}`;
        host.style.gridTemplateRows = `${topTrack} minmax(0, ${Math.max(1, Math.round((dockWeights.centerY ?? 0.64) * 100))}fr) ${bottomTrack}`;

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

    #showGhost(rect, label, rootElement) {
        const el = (rootElement ?? this.wiredElement)?.querySelector("[data-drop-ghost='true']");
        const ghostLabel = (rootElement ?? this.wiredElement)?.querySelector("[data-drop-label='true']");
        if (!el || !rect) return;
        el.hidden = false;
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.top}px`;
        el.style.width = `${rect.width}px`;
        el.style.height = `${rect.height}px`;
        if (ghostLabel) ghostLabel.textContent = label ?? "Drop Target";
    }

    #hideGhost(rootElement) {
        const el = (rootElement ?? this.wiredElement)?.querySelector("[data-drop-ghost='true']");
        if (!el) return;
        el.hidden = true;
        el.style.removeProperty("left");
        el.style.removeProperty("top");
        el.style.removeProperty("width");
        el.style.removeProperty("height");
    }

    // -------------------------------------------------------------------------
    // Private: rendering helpers
    // -------------------------------------------------------------------------

    #renderDockMarkup(dockId, dock = { stacks: [] }, context = {}) {
        const collapsed = dockId !== "centerDock" && Boolean(dock?.collapsed);
        const stackItemsMarkup = (dock?.stacks ?? [])
            .map((stack, index, stacks) => {
                const stackMarkup = this.#renderStackMarkup(dockId, stack, context, {
                    includeDockLabel: false,
                    dockLabel: DOCK_LABELS[dockId] ?? dockId,
                    dockCollapsed: collapsed
                });
                const splitterMarkup = !collapsed && index < stacks.length - 1
                    ? this.#renderStackSplitterMarkup(dockId, stack.id, stacks[index + 1]?.id, dock?.orientation)
                    : "";
                return `${stackMarkup}${splitterMarkup}`;
            })
            .join("");

        const orientationClass = dock?.orientation === "horizontal" ? "is-horizontal" : "is-vertical";
        const collapsedClass = collapsed ? "is-collapsed" : "";
        const nativeCanvasClass = dockId === "centerDock" && (dock?.stacks ?? []).some((stack) => {
            const activePanel = (stack?.panels ?? []).find((panel) => panel.id === stack.activePanelId) ?? stack?.panels?.[0];
            return this.#isMapPanel(activePanel);
        }) ? " is-native-canvas-aperture" : "";

        return `
        <section class="totc-v2-dock totc-v2-dock--${dockId} ${orientationClass} ${collapsedClass}${nativeCanvasClass}" data-dock-id="${dockId}" data-collapsed="${collapsed ? "true" : "false"}">
            <div class="totc-v2-dock__stacks ${orientationClass}" data-dock-stacks="${dockId}">
                ${stackItemsMarkup || `<div class='totc-v2-dock__empty' data-dock-drop-target='${dockId}'>Drop panel here</div>`}
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
                ${this.#renderPanelTabIcon(panel, context)}
                <span>${this.escapeHTMLCallback(this.#getPanelTitle(panel, context))}</span>
            </button>`)
            .join("");

        const activePanel = (stack?.panels ?? []).find((panel) => panel.id === stack.activePanelId) ?? stack?.panels?.[0];
        const collapsed = Boolean(options.dockCollapsed);
        const nativeCanvasAperture = dockId === "centerDock" && this.#isMapPanel(activePanel);
        const panelContent = collapsed || nativeCanvasAperture ? "" : this.#renderPanelContent(activePanel, context);
        const designLensActive = this.isDesignLensActive(activePanel?.id);
        const designButtonTitle = designLensActive ? "Close design lens" : "Open design lens";
        const canCollapseDock = dockId !== "centerDock";
        const collapseTitle = collapsed ? "Restore dock" : "Minimize dock";
        const nativeCanvasClass = nativeCanvasAperture ? " is-native-canvas-aperture" : "";
        const isGM = this.isGMCallback();

        return `
        <article class="totc-v2-stack ${collapsed ? "is-collapsed" : ""}${nativeCanvasClass}" data-dock-id="${dockId}" data-stack-id="${stack.id}" style="flex-grow:${Number(stack.size) || 1};">
            <div class="totc-v2-stack__header">
                <div class="totc-v2-stack__tabs">
                    ${options.includeDockLabel ? `<span class="totc-v2-dock-label-inline">${this.escapeHTMLCallback(options.dockLabel ?? dockId)}</span>` : ""}
                    ${tabsMarkup}
                </div>
                <div class="totc-v2-stack__actions">
                    ${canCollapseDock ? `<button type="button" data-action="toggle-dock-collapse" data-dock-id="${dockId}" title="${collapseTitle}" aria-label="${collapseTitle}" aria-pressed="${collapsed ? "true" : "false"}"><i class="fa-solid ${collapsed ? "fa-expand" : "fa-compress"}" aria-hidden="true"></i></button>` : ""}
                    ${isGM ? `<button type="button" class="${designLensActive ? "is-active" : ""}" data-action="toggle-design-lens" data-panel-id="${activePanel?.id ?? ""}" title="${designButtonTitle}" aria-label="${designButtonTitle}" aria-pressed="${designLensActive ? "true" : "false"}"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i></button>` : ""}
                    <button type="button" data-action="undock-panel" data-dock-id="${dockId}" data-stack-id="${stack.id}" data-panel-id="${activePanel?.id ?? ""}" title="Undock panel" aria-label="Undock panel"><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i></button>
                    <button type="button" data-action="close-panel" data-dock-id="${dockId}" data-stack-id="${stack.id}" data-panel-id="${activePanel?.id ?? ""}" title="Close panel" aria-label="Close panel"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                </div>
            </div>
            <div class="totc-v2-stack__content" ${collapsed ? "hidden" : ""}>${panelContent}</div>
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

    #renderDockSplittersMarkup(dockWeights = {}, layoutRoot = {}) {
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
        const centerLeftBoundary = `${leftBoundary}%`;
        const centerRightBoundary = `${100 - rightBoundary}%`;

        return `
        <div class="totc-v2-dock-resizer totc-v2-dock-resizer--left ${layoutRoot.leftDock?.collapsed ? "is-hidden" : ""}" style="left:${leftBoundary}%;" data-action="dock-resizer" data-dock-id="leftDock" data-axis="x" title="Resize dock"></div>
        <div class="totc-v2-dock-resizer totc-v2-dock-resizer--right ${layoutRoot.rightDock?.collapsed ? "is-hidden" : ""}" style="left:${rightBoundary}%;" data-action="dock-resizer" data-dock-id="rightDock" data-axis="x" title="Resize dock"></div>
        <div class="totc-v2-dock-resizer totc-v2-dock-resizer--top ${layoutRoot.topDock?.collapsed ? "is-hidden" : ""}" style="top:${topBoundary}%;--totc-v2-center-left:${centerLeftBoundary};--totc-v2-center-right:${centerRightBoundary};" data-action="dock-resizer" data-dock-id="topDock" data-axis="y" title="Resize dock"></div>
        <div class="totc-v2-dock-resizer totc-v2-dock-resizer--bottom ${layoutRoot.bottomDock?.collapsed ? "is-hidden" : ""}" style="top:${bottomBoundary}%;--totc-v2-center-left:${centerLeftBoundary};--totc-v2-center-right:${centerRightBoundary};" data-action="dock-resizer" data-dock-id="bottomDock" data-axis="y" title="Resize dock"></div>`;
    }

    #renderFloatingWindowsMarkup(floatingWindows = []) {
        return floatingWindows.map((floatingWindow) => {
            const floatingContext = {
                scene: { name: globalThis.game?.scenes?.viewed?.name ?? "Current Scene" }
            };
            const title = this.escapeHTMLCallback(this.#getPanelTitle(floatingWindow.panel, floatingContext) ?? "Floating Panel");
            const designLensActive = this.isDesignLensActive(floatingWindow.panel?.id);
            const designButtonTitle = designLensActive ? "Close design lens" : "Open design lens";
            const content = this.#renderPanelContent(floatingWindow.panel, floatingContext);
            const isGM = this.isGMCallback();

            return `
            <article
                class="totc-v2-floating"
                data-floating-id="${floatingWindow.id}"
                style="left:${floatingWindow.x}px;top:${floatingWindow.y}px;width:${floatingWindow.width}px;height:${floatingWindow.height}px;z-index:${floatingWindow.zIndex};">
                <header class="totc-v2-floating__header" data-action="floating-move-handle" data-floating-id="${floatingWindow.id}">
                    <span>${title}</span>
                    <div class="totc-v2-floating__buttons">
                        ${isGM ? `<button type="button" class="${designLensActive ? "is-active" : ""}" data-action="toggle-design-lens" data-panel-id="${floatingWindow.panel?.id ?? ""}" title="${designButtonTitle}" aria-label="${designButtonTitle}" aria-pressed="${designLensActive ? "true" : "false"}"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i></button>` : ""}
                        <button type="button" data-action="redock-panel" data-floating-id="${floatingWindow.id}" title="Redock panel" aria-label="Redock panel"><i class="fa-solid fa-compress" aria-hidden="true"></i></button>
                        <button type="button" data-action="floating-close" data-floating-id="${floatingWindow.id}" title="Close panel" aria-label="Close panel"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                    </div>
                </header>
                <section class="totc-v2-floating__body">${content}</section>
                <div class="totc-v2-floating__resize-handle" data-action="floating-resize-handle" data-floating-id="${floatingWindow.id}" title="Resize"></div>
            </article>`;
        }).join("");
    }

    #renderPanelContent(panel, context = {}) {
        return this.panelHost?.renderPanelContent(panel, context) ?? "";
    }

    #renderPanelBodyContent(panel, context = {}) {
        return this.panelHost?.renderPanelBodyContent(panel, context) ?? "";
    }

    #renderPanelTabIcon(panel, context = {}) {
        const sceneId = this.#getPanelSceneId(panel, context);
        if (!sceneId || sceneId !== this.#getActiveSceneId()) return "";
        return `<i class="fa-solid fa-star totc-v2-stack__tab-icon" aria-hidden="true"></i>`;
    }

    // -------------------------------------------------------------------------
    // Private: panel / scene helpers
    // -------------------------------------------------------------------------

    #isMapPanel(panel) {
        return this.sceneWorkspaceController?.isMapPanel?.(panel) ?? false;
    }

    #getPanelTitle(panel, context = {}) {
        if (this.#isMapPanel(panel)) {
            return this.sceneWorkspaceController?.getMapPanelScene?.(panel, context)?.name ?? panel?.title ?? "Map";
        }
        return panel?.title ?? "";
    }

    #getPanelSceneId(panel, context = {}) {
        return this.sceneWorkspaceController?.getPanelSceneId?.(panel, context) ?? "";
    }

    #getActiveSceneId() {
        return String(
            globalThis.game?.scenes?.active?.id
            ?? (globalThis.game?.scenes?.contents ?? []).find((scene) => scene?.active)?.id
            ?? ""
        ).trim();
    }

    #makeSceneMapPanelDef(scene) {
        return this.sceneWorkspaceController?.makeSceneMapPanelDef?.(scene) ?? null;
    }

    #isDockOccupied(dock) {
        return Boolean(dock?.stacks?.some((stack) => (stack?.panels?.length ?? 0) > 0));
    }

    #resolvePanelDefinition(panelId) {
        const id = String(panelId ?? "").trim();
        if (!id) return null;
        const registered = this.panelRegistry?.get?.(id);
        if (registered) return registered;
        if (id.startsWith("map:")) {
            const scene = globalThis.game?.scenes?.get?.(id.slice(4)) ?? null;
            return this.#makeSceneMapPanelDef(scene);
        }
        return null;
    }

    #getPrimaryActivePanel(layout = this.layoutEngine?.getLayout()) {
        const centerDock = layout?.root?.centerDock;
        const centerStack = centerDock?.stacks?.[0];
        const activePanelId = centerStack?.activePanelId;
        const activePanel = centerStack?.panels?.find((panel) => panel.id === activePanelId) ?? centerStack?.panels?.[0];
        if (activePanel) return activePanel;

        for (const dockId of WORKSPACE_V2_DOCK_IDS) {
            const stack = layout?.root?.[dockId]?.stacks?.[0];
            const fallbackActiveId = stack?.activePanelId;
            const fallbackPanel = stack?.panels?.find((panel) => fallbackActiveId === panel.id) ?? stack?.panels?.[0];
            if (fallbackPanel) return fallbackPanel;
        }
        return null;
    }
}
