import {
    buildDesignLensModel,
    renderDesignLensSurface
} from "../panels/design-lens-panel.mjs";
import { renderDiceRollFeedPanel } from "../panels/dice-roll-feed-panel.mjs";
import { renderInspectorPanel } from "../panels/inspector-panel.mjs";
import { renderMediaBrowserPanel } from "../panels/media-browser-panel.mjs";
import { renderLoggingPanel } from "../panels/logging-panel.mjs";
import { renderDesignIssuesPanel } from "../panels/design-issues-panel.mjs";
import {
    buildGridCalibrationModel,
    renderGridCalibrationDialog
} from "../panels/grid-calibration.mjs";
import { renderScenePropertiesPanel } from "../panels/scene-properties-panel.mjs";
import { renderScenesPanel } from "../panels/scenes-panel.mjs";
import {
    renderActorEditorPanel,
    renderActorListPanel
} from "../panels/actor-management-panel.mjs";
import { renderCampaignBuilderPanel } from "../panels/campaign-builder-panel.mjs";
import { renderScenarioBuilderPanel } from "../panels/scenario-builder-panel.mjs";
import { renderEncounterDesignerPanel } from "../panels/encounter-designer-panel.mjs";
import { renderCampaignViewPanel } from "../panels/campaign-view-panel.mjs";
import { renderGMAssistantPanel } from "../panels/gm-assistant-panel.mjs";

export class WorkspacePanelHost {
    constructor({
        designActionRegistry,
        escapeHTML = (value) => String(value ?? ""),
        isGM = () => false,
        isDesignLensActive = () => false,
        isMapPanel = () => false,
        getMapPanelScene = () => null,
        getPanelSceneId = () => "",
        gridCalibrationState = () => ({}),
        getSceneGridOverlayState = () => null,
        renderMarketPanel = () => "",
        renderPlayerPanel = () => "",
        renderGamemasterPanel = () => ""
    } = {}) {
        this.designActionRegistry = designActionRegistry;
        this.escapeHTML = escapeHTML;
        this.isGM = isGM;
        this.isDesignLensActive = isDesignLensActive;
        this.isMapPanel = isMapPanel;
        this.getMapPanelScene = getMapPanelScene;
        this.getPanelSceneId = getPanelSceneId;
        this.gridCalibrationState = gridCalibrationState;
        this.getSceneGridOverlayState = getSceneGridOverlayState;
        this.renderMarketPanel = renderMarketPanel;
        this.renderPlayerPanel = renderPlayerPanel;
        this.renderGamemasterPanel = renderGamemasterPanel;
    }

    renderPanelContent(panel, context = {}) {
        const content = this.renderPanelBodyContent(panel, context);
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

        if (this.isMapPanel(panel)) {
            return this.#renderMapPanel(panel, context);
        }

        if (panel.id === "compendium") {
            return this.#renderCompendiumPanel(context);
        }

        if (panel.id === "scenes") {
            return renderScenesPanel(context.scenesPanel ?? {}, {
                escapeHTML: (value) => this.escapeHTML(value)
            });
        }

        if (panel.id === "actors") {
            if (!context.gm?.isGM) {
                return `<section class="totc-v2-actor-list-panel"><p class="totc-v2-actor-list-panel__empty">This panel is only available to the active Gamemaster.</p></section>`;
            }
            return renderActorListPanel(context.actorListPanel ?? {}, {
                escapeHTML: (value) => this.escapeHTML(value)
            });
        }

        if (panel.id === "actor-editor") {
            if (!context.gm?.isGM) {
                return `<section class="totc-v2-actor-editor"><p class="totc-v2-actor-editor__empty">This panel is only available to the active Gamemaster.</p></section>`;
            }
            return renderActorEditorPanel(context.actorEditorPanel ?? {}, {
                escapeHTML: (value) => this.escapeHTML(value)
            });
        }

        if (panel.id === "market") {
            return this.renderMarketPanel(context.marketPanel ?? {});
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

        if (panel.id === "scene-properties") {
            if (!context.gm?.isGM) {
                return `<section class="totc-v2-scene-properties-panel"><p class="totc-v2-scene-properties-panel__error">This panel is only available to the active Gamemaster.</p></section>`;
            }
            return renderScenePropertiesPanel(context.scenePropertiesPanel ?? {}, {
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

        if (panel.id === "campaign-builder") {
            return renderCampaignBuilderPanel(context.campaignBuilderPanel ?? {}, { escapeHTML: (v) => this.escapeHTML(v) });
        }

        if (panel.id === "scenario-builder") {
            return renderScenarioBuilderPanel(context.scenarioBuilderPanel ?? {}, { escapeHTML: (v) => this.escapeHTML(v) });
        }

        if (panel.id === "encounter-designer") {
            return renderEncounterDesignerPanel(context.encounterDesignerPanel ?? {}, { escapeHTML: (v) => this.escapeHTML(v) });
        }

        if (panel.id === "campaign-view") {
            return renderCampaignViewPanel(context.campaignViewPanel ?? {}, { escapeHTML: (v) => this.escapeHTML(v) });
        }

        if (panel.id === "gm-assistant") {
            return renderGMAssistantPanel(context.gmAssistantPanel ?? {}, { escapeHTML: (v) => this.escapeHTML(v) });
        }

        if (panel.id === "roll-feed") {
            return renderDiceRollFeedPanel(context.diceRollFeedPanel ?? {}, {
                escapeHTML: (value) => this.escapeHTML(value)
            });
        }

        if (panel.id === "player") {
            return this.renderPlayerPanel(context.playerPanel ?? {}, context.dieRollRequestPanel);
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
        const mapScene = this.getMapPanelScene(panel, context);
        const sceneName = this.escapeHTML(mapScene?.name ?? "Current Scene");
        const mapSrc = mapScene?.mapSrc ?? "";
        const sceneId = String(mapScene?.id ?? this.getPanelSceneId(panel, context) ?? "").trim();
        const dimensions = [mapScene?.width, mapScene?.height].filter((value) => Number.isFinite(value) && value > 0);
        const dimensionLabel = dimensions.length === 2 ? `${dimensions[0]} x ${dimensions[1]}` : "Scene map";

        const calModel = buildGridCalibrationModel({
            state: this.gridCalibrationState(),
            scene: mapScene
        });
        const calActive = calModel.active;
        const sceneGridOverlayState = this.getSceneGridOverlayState(mapScene);
        const sceneGridOverlayActive = Boolean(!calActive && sceneGridOverlayState);
        const gridOverlayActive = calActive || sceneGridOverlayActive;
        const calDialog = renderGridCalibrationDialog(calModel, { escapeHTML: (v) => this.escapeHTML(v) });

        const imageMarkup = mapSrc
            ? `<div class="totc-v2-map-panel__viewport${calActive ? " is-calibrating" : ""}" data-action="map-viewport" data-map-viewport="true"
                data-map-key="${this.escapeHTML(mapScene?.id ?? mapSrc)}"
                data-grid-type="${this.escapeHTML(sceneGridOverlayState?.gridType ?? mapScene?.grid?.type ?? "")}"
                data-grid-size="${this.escapeHTML(sceneGridOverlayState?.cellW ?? mapScene?.grid?.size ?? "")}"
                data-grid-offset-x="${this.escapeHTML(sceneGridOverlayState?.offsetX ?? -Number(mapScene?.shiftX ?? 0))}"
                data-grid-offset-y="${this.escapeHTML(sceneGridOverlayState?.offsetY ?? -Number(mapScene?.shiftY ?? 0))}">
                <img class="totc-v2-map-panel__image" src="${this.escapeHTML(mapSrc)}" alt="${sceneName}" draggable="false" data-action="map-image">
                ${gridOverlayActive ? `<svg class="totc-v2-map-panel__grid-overlay" data-grid-overlay="true" aria-hidden="true"></svg>` : ""}
                <div class="totc-v2-map-panel__actor-drop-preview" data-actor-drop-preview="true" aria-hidden="true"></div>
            </div>`
            : `<div class="totc-v2-map-panel__empty">No active scene map available</div>`;

        return `
        <figure class="totc-v2-map-panel${calActive ? " is-calibrating" : ""}" data-scene-actor-drop-target="true" data-scene-id="${this.escapeHTML(sceneId)}">
            ${imageMarkup}
            <figcaption class="totc-v2-map-panel__caption">
                <span class="totc-v2-map-panel__name">${sceneName}</span>
                <span class="totc-v2-map-panel__meta">${this.escapeHTML(dimensionLabel)}</span>
            </figcaption>
            ${calDialog}
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
                    <article class="totc-v2-compendium-panel__entry" role="listitem" data-entry-uuid="${this.escapeHTML(entry.uuid ?? "")}">
                        <div class="totc-v2-compendium-panel__entry-name">${this.escapeHTML(entry.name)}</div>
                        <div class="totc-v2-compendium-panel__entry-pack">${this.escapeHTML(entry.packLabel)}</div>
                    </article>`).join("") : `<div class="totc-v2-compendium-panel__empty${isLoading ? " is-loading" : ""}">${emptyMessage}</div>`}
            </div>
        </section>`;
    }
}
