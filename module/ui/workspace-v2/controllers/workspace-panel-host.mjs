import {
    buildDesignLensModel,
    renderDesignLensSurface
} from "../panels/design-lens-panel.mjs";
import { renderDiceRollFeedPanel } from "../panels/dice-roll-feed-panel.mjs";
import { renderInspectorPanel } from "../panels/inspector-panel.mjs";
import { renderLoggingPanel } from "../panels/logging-panel.mjs";
import { renderDesignIssuesPanel } from "../panels/design-issues-panel.mjs";

import { renderEncounterManagerPanel } from "../panels/encounter-manager-panel.mjs";
import { renderPlayerEncounterPanel } from "../panels/player-encounter-panel.mjs";

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function requestHasResult(request = {}, userId = "") {
    if (typeof request.hasResult === "function") return request.hasResult(userId);
    return Boolean(request.results?.[userId]);
}

function requestIsPending(request = {}) {
    if (typeof request.isPending === "boolean") return request.isPending;
    return ["pending", "rolling"].includes(String(request.status ?? "").trim());
}

function requestMatchesPlayerEncounter(request = {}, playerEncounterPanel = {}, userId = "") {
    const combatId = String(playerEncounterPanel.combatId ?? "").trim();
    const combatantId = String(playerEncounterPanel.combatantId ?? "").trim();
    if (combatId && String(request?.combatId ?? "").trim() !== combatId) return false;
    if (combatantId && String(request?.combatantId ?? "").trim() !== combatantId) return false;
    if (!requestIsPending(request)) return false;
    return !userId || !requestHasResult(request, userId);
}

function filterRollRequestsForPlayerEncounter(dieRollRequestPanel = {}, playerEncounterPanel = {}) {
    const userId = String(dieRollRequestPanel.userId ?? "").trim();
    const requests = toArray(dieRollRequestPanel.requests)
        .filter((request) => requestMatchesPlayerEncounter(request, playerEncounterPanel, userId));
    return {
        ...dieRollRequestPanel,
        request: requests[0] ?? null,
        requests
    };
}

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
        renderRollRequests = () => "",
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
        this.renderRollRequests = renderRollRequests;
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
            const dieRollRequestPanel = context.dieRollRequestPanel ?? {};
            const playerRollRequestPanel = filterRollRequestsForPlayerEncounter(
                dieRollRequestPanel,
                context.playerEncounterPanel ?? {}
            );
            const hasRollRequests = Boolean(playerRollRequestPanel.request)
                || (Array.isArray(playerRollRequestPanel.requests) && playerRollRequestPanel.requests.length > 0);
            return renderPlayerEncounterPanel(context.playerEncounterPanel ?? {}, {
                escapeHTML: (v) => this.escapeHTML(v),
                rollRequestsMarkup: hasRollRequests ? this.renderRollRequests(playerRollRequestPanel) : ""
            });
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

}
