import { WorkspaceFeature } from "../workspace-feature.mjs";
import {
    browseAssetMedia,
    buildMediaBrowserPanelModel,
    renderMediaBrowserPanel
} from "../panels/media-browser-panel.mjs";
import { WORKSPACE_V2_DOCK_IDS } from "../constants.mjs";

export class MediaFeature extends WorkspaceFeature {
    constructor({
        layoutEngine,
        panelRegistry,
        stateStore = null,
        render = () => {}
    } = {}) {
        super();
        this.layoutEngine = layoutEngine;
        this.panelRegistry = panelRegistry;
        this.stateStore = stateStore;
        this.renderCallback = render;

        this.mediaBrowserEntries = null;
        this.mediaBrowserEntriesPromise = null;
        this.mediaBrowserSelectCallback = null;
        this.mediaBrowserState = {
            query: "",
            type: "all",
            view: "list",
            sortKey: "filename",
            sortDirection: "asc",
            mode: "browse",
            selectedPaths: [],
            error: ""
        };
    }

    #isMediaBrowserVisible() {
        const layout = this.layoutEngine?.getLayout?.();
        if (!layout?.root) return false;
        
        for (const dockId of WORKSPACE_V2_DOCK_IDS) {
            const dock = layout.root[dockId];
            for (const stack of dock?.stacks ?? []) {
                for (const panel of stack?.panels ?? []) {
                    if (panel?.id === "media-browser") return true;
                }
            }
        }

        for (const window of layout.root.floatingWindows ?? []) {
            if (window?.panel?.id === "media-browser") return true;
        }

        return false;
    }

    async getMediaBrowserEntries() {
        if (Array.isArray(this.mediaBrowserEntries)) return this.mediaBrowserEntries;
        if (this.mediaBrowserEntriesPromise) return await this.mediaBrowserEntriesPromise;

        this.mediaBrowserEntriesPromise = this.#loadMediaBrowserEntries();
        try {
            const result = await this.mediaBrowserEntriesPromise;
            this.mediaBrowserEntries = Array.isArray(result?.entries) ? result.entries : [];
            if (!result?.ok) {
                this.mediaBrowserState = {
                    ...this.mediaBrowserState,
                    error: result?.error ?? "Media browsing failed."
                };
            } else if (this.mediaBrowserState.error) {
                this.mediaBrowserState = {
                    ...this.mediaBrowserState,
                    error: ""
                };
            }
            return this.mediaBrowserEntries;
        } finally {
            this.mediaBrowserEntriesPromise = null;
        }
    }

    async #loadMediaBrowserEntries() {
        return browseAssetMedia({
            FilePickerClass: this.#getFilePickerClass()
        });
    }

    #getFilePickerClass() {
        return globalThis.foundry?.applications?.apps?.FilePicker?.implementation
            ?? null;
    }

    async prepareContext(context) {
        const isVisible = this.#isMediaBrowserVisible();
        const entries = isVisible ? await this.getMediaBrowserEntries() : (this.mediaBrowserEntries ?? []);

        context.mediaBrowserPanel = buildMediaBrowserPanelModel({
            entries,
            state: this.mediaBrowserState
        });
    }

    render(panel, context) {
        if (panel?.id === "media-browser") {
            if (!globalThis.game?.user?.isGM) {
                return `<section class="totc-v2-media-browser"><p class="totc-v2-media-browser__error">This panel is only available to the active Gamemaster.</p></section>`;
            }
            return renderMediaBrowserPanel(context.mediaBrowserPanel ?? {}, {
                escapeHTML: (value) => String(value ?? "")
            });
        }
        return undefined;
    }

    bind(rootElement) {
        rootElement?.querySelectorAll("[data-action='media-browser-filter-type']")?.forEach((select) => {
            select.addEventListener("change", () => {
                this.mediaBrowserState = {
                    ...this.mediaBrowserState,
                    type: String(select.value ?? "all")
                };
                this.renderCallback({ force: false });
            });
        });

        rootElement?.querySelectorAll("[data-action='media-browser-view']")?.forEach((select) => {
            select.addEventListener("change", () => {
                this.mediaBrowserState = {
                    ...this.mediaBrowserState,
                    view: String(select.value ?? "list")
                };
                this.renderCallback({ force: false });
            });
        });

        rootElement?.querySelectorAll("[data-action='media-browser-refresh']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.mediaBrowserEntries = null;
                this.mediaBrowserEntriesPromise = null;
                this.renderCallback({ force: false });
            });
        });

        rootElement?.querySelectorAll("[data-action='media-browser-sort']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.mediaBrowserState = {
                    ...this.mediaBrowserState,
                    sortKey: String(button.dataset.sortKey ?? "filename"),
                    sortDirection: String(button.dataset.sortDirection ?? "asc")
                };
                this.renderCallback({ force: false });
            });
        });

        rootElement?.querySelectorAll("[data-action='media-browser-toggle-selection']")?.forEach((checkbox) => {
            checkbox.addEventListener("change", (event) => {
                event.stopPropagation();
                const mediaPath = String(checkbox.dataset.mediaPath ?? "").trim();
                if (!mediaPath) return;

                const selected = new Set(this.mediaBrowserState.selectedPaths ?? []);
                if (checkbox.checked) selected.add(mediaPath);
                else selected.delete(mediaPath);
                
                this.mediaBrowserState = {
                    ...this.mediaBrowserState,
                    selectedPaths: [...selected]
                };
                this.renderCallback({ force: false });
            });
        });

        rootElement?.querySelectorAll("[data-action='media-browser-clear-selection']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.mediaBrowserState = {
                    ...this.mediaBrowserState,
                    selectedPaths: []
                };
                this.renderCallback({ force: false });
            });
        });

        rootElement?.querySelectorAll("[data-action='media-browser-confirm-selection']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.confirmMediaBrowserSelection();
            });
        });
    }

    setSearchQuery(query) {
        this.mediaBrowserState = {
            ...this.mediaBrowserState,
            query: String(query ?? "")
        };
    }

    async openMediaBrowserPanel({ mode = "browse", selectedPaths = [], onSelect = null } = {}) {
        const panelDef = this.panelRegistry.get("media-browser");
        if (!panelDef) return;

        this.mediaBrowserState = {
            ...this.mediaBrowserState,
            mode: mode === "select" ? "select" : "browse",
            selectedPaths: Array.isArray(selectedPaths) ? selectedPaths.map(String) : []
        };
        this.mediaBrowserSelectCallback = typeof onSelect === "function" ? onSelect : null;

        const nextLayout = this.layoutEngine.restorePanel(panelDef, { preferredDockId: panelDef.defaultDock ?? "rightDock" });
        await this.stateStore?.setUserLayout?.(nextLayout);
        this.renderCallback({ force: false });
    }

    async confirmMediaBrowserSelection() {
        const selectedPaths = new Set(this.mediaBrowserState.selectedPaths ?? []);
        const entries = (await this.getMediaBrowserEntries()).filter((entry) => selectedPaths.has(entry.path));

        try {
            await this.mediaBrowserSelectCallback?.(entries);
            globalThis.Hooks?.callAll?.("totcMediaBrowserSelected", entries);
        } finally {
            this.mediaBrowserSelectCallback = null;
            this.mediaBrowserState = {
                ...this.mediaBrowserState,
                mode: "browse",
                selectedPaths: []
            };

            const nextLayout = this.layoutEngine.closePanel("media-browser");
            await this.stateStore?.setUserLayout?.(nextLayout);
            this.renderCallback({ force: false });
        }
    }

    dispose() {
        // no-op
    }
}
