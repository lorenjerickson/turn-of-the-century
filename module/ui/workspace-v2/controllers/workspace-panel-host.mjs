import {
    buildDesignLensModel,
    renderDesignLensSurface
} from "../panels/design-lens-panel.mjs";
import { renderDiceRollFeedPanel } from "../panels/dice-roll-feed-panel.mjs";
import { renderInspectorPanel } from "../panels/inspector-panel.mjs";
import { renderMediaBrowserPanel } from "../panels/media-browser-panel.mjs";
import { renderLoggingPanel } from "../panels/logging-panel.mjs";
import { renderDesignIssuesPanel } from "../panels/design-issues-panel.mjs";

import { renderEncounterManagerPanel } from "../panels/encounter-manager-panel.mjs";
import { renderPlayerEncounterPanel } from "../panels/player-encounter-panel.mjs";

export class WorkspacePanelHost {
    constructor({
        getFeatures = () => [],
        designActionRegistry,
        escapeHTML = (value) => String(value ?? ""),
        isGM = () => false,
        isDesignLensActive = () => false,
        isMapPanel = () => false,
        getMapPanelScene = () => null,
        getPanelSceneId = () => "",
        gridCalibrationState = () => ({}),
        getSceneGridOverlayState = () => null,
        getSceneWallOverlayState = () => null,
        getEncounterMovementOverlayState = () => null,
        getEncounterTargetOverlayState = () => null,
        getMapPanelToolbarState = () => ({}),
        renderGamemasterPanel = () => "",
        getSelectedTokenIds = () => new Set()
    } = {}) {
        this.getFeatures = getFeatures;
        this.designActionRegistry = designActionRegistry;
        this.escapeHTML = escapeHTML;
        this.isGM = isGM;
        this.isDesignLensActive = isDesignLensActive;
        this.isMapPanel = isMapPanel;
        this.getMapPanelScene = getMapPanelScene;
        this.getPanelSceneId = getPanelSceneId;
        this.gridCalibrationState = gridCalibrationState;
        this.getSceneGridOverlayState = getSceneGridOverlayState;
        this.getSceneWallOverlayState = getSceneWallOverlayState;
        this.getEncounterMovementOverlayState = getEncounterMovementOverlayState;
        this.getEncounterTargetOverlayState = getEncounterTargetOverlayState;
        this.getMapPanelToolbarState = getMapPanelToolbarState;
        this.renderGamemasterPanel = renderGamemasterPanel;
        this.getSelectedTokenIds = getSelectedTokenIds;
    }

    renderPanelContent(panel, context = {}) {
        const content = this.renderPanelBodyContent(panel, context);
        const isMapPanel = this.isMapPanel(panel);
        if (isMapPanel) return content;

        const designLensModel = buildDesignLensModel({
            panel,
            active: this.isDesignLensActive(panel?.id),
            isGM: this.isGM(),
            registry: this.designActionRegistry
        });
        const designLens = renderDesignLensSurface(designLensModel, {
            escapeHTML: (value) => this.escapeHTML(value)
        });

        return designLens
            ? `<div class="totc-v2-panel-with-design-lens">${designLens}<div class="totc-v2-panel-with-design-lens__body">${content}</div></div>`
            : content;
    }

    renderPanelBodyContent(panel, context = {}) {
        if (!panel) {
            return `<div class="totc-v2-panel-placeholder">Empty</div>`;
        }

        const features = this.getFeatures?.() ?? [];
        for (const feature of features) {
            if (typeof feature.render === "function") {
                const result = feature.render(panel, context);
                if (result !== undefined && result !== null) {
                    return result;
                }
            }
        }

        if (this.isMapPanel(panel)) {
            return this.#renderMapPanel(panel, context);
        }

        if (panel.id === "compendium") {
            return this.#renderCompendiumPanel(context);
        }





        if (panel.id === "inspector") {
            return renderInspectorPanel(context.inspectorPanel ?? {}, {
                escapeHTML: (value) => this.escapeHTML(value)
            });
        }

        if (panel.id === "design-issues") {
            if (!context.gm?.isGM) {
                return `<section class="totc-v2-issues-panel"><p class="totc-v2-issues-panel__access-denied">This panel is only available to the active Gamemaster.</p></section>`;
            }
            return renderDesignIssuesPanel(context.designIssuesPanel ?? {}, {
                escapeHTML: (value) => this.escapeHTML(value)
            });
        }

        if (panel.id === "media-browser") {
            if (!context.gm?.isGM) {
                return `<section class="totc-v2-media-browser"><p class="totc-v2-media-browser__error">This panel is only available to the active Gamemaster.</p></section>`;
            }
            return renderMediaBrowserPanel(context.mediaBrowserPanel ?? {}, {
                escapeHTML: (value) => this.escapeHTML(value)
            });
        }

        if (panel.id === "encounter-manager") {
            if (!context.gm?.isGM) {
                return `<section class="totc-v2-encounter-manager"><p class="totc-v2-encounter-manager__empty">This panel is only available to the active Gamemaster.</p></section>`;
            }
            return renderEncounterManagerPanel(context.encounterManagerPanel ?? {}, { escapeHTML: (v) => this.escapeHTML(v) });
        }

        if (panel.id === "roll-feed") {
            return renderDiceRollFeedPanel(context.diceRollFeedPanel ?? {}, {
                escapeHTML: (value) => this.escapeHTML(value)
            });
        }

        if (panel.id === "encounter") {
            return renderPlayerEncounterPanel(context.playerEncounterPanel ?? {}, { escapeHTML: (v) => this.escapeHTML(v) });
        }

        if (panel.id === "gamemaster") {
            if (!context.gm?.isGM) {
                return `
                <section class="totc-v2-gm-panel">
                    <div class="totc-v2-gm-panel__state">
                        <h3>Gamemaster Panel</h3>
                        <p>This panel is only available to the active GM.</p>
                    </div>
                </section>`;
            }

            return this.renderGamemasterPanel(context.gmPanel, context.gm, context.dieRollRequestPanel);
        }

        if (panel.id === "logging") {
            return renderLoggingPanel(context.loggingPanel ?? {}, { escapeHTML: (v) => this.escapeHTML(v) });
        }

        return `<div class="totc-v2-panel-placeholder">${this.escapeHTML(panel.title)}</div>`;
    }

    #renderMapPanel(panel, context = {}) {
        const panelId = String(panel?.id ?? "").trim();
        const mapScene = this.getMapPanelScene(panel, context);
        const sceneName = this.escapeHTML(mapScene?.name ?? "Current Scene");
        const sceneId = String(mapScene?.id ?? this.getPanelSceneId(panel, context) ?? "").trim();
        const dimensions = [mapScene?.width, mapScene?.height].filter((value) => Number.isFinite(value) && value > 0);
        const dimensionLabel = dimensions.length === 2 ? `${dimensions[0]} x ${dimensions[1]}` : "Scene map";

        return `
        <figure class="totc-v2-map-panel totc-v2-map-panel--native-canvas" data-native-canvas-panel="true" data-map-panel-id="${this.escapeHTML(panelId)}" data-scene-id="${this.escapeHTML(sceneId)}">
            <figcaption class="totc-v2-map-panel__caption">
                <span class="totc-v2-map-panel__name">${sceneName}</span>
                <span class="totc-v2-map-panel__meta">${this.escapeHTML(dimensionLabel)}</span>
            </figcaption>
        </figure>`;
    }

    #renderCompendiumPanel(context = {}) {
        const query = String(context.compendiumSearchQuery ?? "").trim().toLowerCase();
        const allEntries = Array.isArray(context.compendiumItems) ? context.compendiumItems : [];
        const entries = query
            ? allEntries.filter((entry) => String(entry.name ?? "").toLowerCase().includes(query))
            : allEntries;

        const loadingState = context.compendiumLoadingState ?? null;
        const isLoading = !loadingState && !allEntries.length;
        let emptyMessage;
        if (query && !entries.length && allEntries.length) {
            emptyMessage = `No items match "${this.escapeHTML(query)}".`;
        } else if (!allEntries.length && loadingState) {
            emptyMessage = `Compendium data unavailable: ${this.escapeHTML(loadingState)}`;
        } else if (!allEntries.length) {
            emptyMessage = "Loading compendium data...";
        } else {
            emptyMessage = "No items found.";
        }

        return `
        <section class="totc-v2-compendium-panel">
            <label class="totc-v2-compendium-panel__search">
                <span>Search items</span>
                <input type="search" data-action="compendium-search" value="${this.escapeHTML(context.compendiumSearchQuery ?? "")}" placeholder="Filter by item name">
            </label>
            <div class="totc-v2-compendium-panel__summary">
                ${allEntries.length} item${allEntries.length === 1 ? "" : "s"} available
                ${query && allEntries.length ? `&mdash; ${entries.length} match${entries.length === 1 ? "" : "es"}` : ""}
            </div>
            <div class="totc-v2-compendium-panel__list" role="list">
                ${entries.length ? entries.map((entry) => `
                    <article class="totc-v2-compendium-panel__entry" role="listitem" draggable="true" data-compendium-item-draggable="true" data-entry-uuid="${this.escapeHTML(entry.uuid ?? "")}">
                        <img class="totc-v2-compendium-panel__entry-img" src="${this.escapeHTML(entry.img || "icons/svg/item-bag.svg")}" alt="">
                        <div class="totc-v2-compendium-panel__entry-main">
                            <div class="totc-v2-compendium-panel__entry-name">${this.escapeHTML(entry.name)}</div>
                            <div class="totc-v2-compendium-panel__entry-pack">${this.escapeHTML(entry.type ?? "item")} · ${this.escapeHTML(entry.packLabel)}</div>
                            ${entry.description ? `<div class="totc-v2-compendium-panel__entry-description">${this.escapeHTML(entry.description)}</div>` : ""}
                        </div>
                    </article>`).join("") : `<div class="totc-v2-compendium-panel__empty${isLoading ? " is-loading" : ""}">${emptyMessage}</div>`}
            </div>
        </section>`;
    }
}
