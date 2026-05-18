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
    }

    async _prepareContext() {
        const policy = this.stateStore?.getPolicy?.() ?? { enabled: false, debugGovernance: false };
        const userLayout = this.stateStore?.getUserLayout?.() ?? this.layoutEngine.getLayout();
        this.layoutEngine.setLayout(userLayout);

        return {
            enabled: policy.enabled,
            debugGovernance: policy.debugGovernance,
            hasUserLayout: Boolean(this.stateStore?.getUserLayout?.()),
            panels: PANEL_LIBRARY,
            layout: this.layoutEngine.getLayout()
        };
    }

    async _renderHTML(context) {
        const root = document.createElement("section");
        root.classList.add("totc-workspace-v2-root");
        root.setAttribute("data-drag-host", "true");

        const docksMarkup = WORKSPACE_V2_DOCK_IDS
            .map((dockId) => this.#renderDockMarkup(dockId, context.layout.root[dockId]))
            .join("\n");

        root.innerHTML = `
<section class="totc-workspace-v2-shell">
    <header class="totc-workspace-v2-shell__header">
        <h2>Turn of the Century Workspace V2</h2>
        <div>Scaffold active: ${context.enabled ? "yes" : "no"}</div>
    </header>
    <main class="totc-workspace-v2-shell__main">
        <p>Milestone 3 active: edge docking, top/bottom stacking, and tab composition with ghost previews.</p>
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

        this.#wireInteractionHandlers();
    }

    #renderDockMarkup(dockId, dock = { stacks: [] }) {
        const stacksMarkup = (dock?.stacks ?? [])
            .map((stack) => this.#renderStackMarkup(dockId, stack))
            .join("");

        return `
        <section class="totc-v2-dock totc-v2-dock--${dockId}" data-dock-id="${dockId}">
            <header>${DOCK_LABELS[dockId] ?? dockId}</header>
            <div class="totc-v2-dock__stacks">
                ${stacksMarkup || "<div class='totc-v2-dock__empty'>Drop panel here</div>"}
            </div>
        </section>`;
    }

    #renderStackMarkup(dockId, stack) {
        const tabsMarkup = (stack?.panels ?? [])
            .map((panel) => `
            <button
                type="button"
                class="totc-v2-stack__tab ${panel.id === stack.activePanelId ? "is-active" : ""}">
                ${panel.title}
            </button>`)
            .join("");

        const activePanel = (stack?.panels ?? []).find((panel) => panel.id === stack.activePanelId) ?? stack?.panels?.[0];

        return `
        <article class="totc-v2-stack" data-dock-id="${dockId}" data-stack-id="${stack.id}">
            <div class="totc-v2-stack__tabs">${tabsMarkup}</div>
            <div class="totc-v2-stack__content">${activePanel?.title ?? "Empty"}</div>
        </article>`;
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
