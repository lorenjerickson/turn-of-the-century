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
import { renderEncounterManagerPanel } from "../panels/encounter-manager-panel.mjs";
import { renderPlayerEncounterPanel } from "../panels/player-encounter-panel.mjs";
import { renderCampaignViewPanel } from "../panels/campaign-view-panel.mjs";
import { renderGMAssistantPanel } from "../panels/gm-assistant-panel.mjs";

function collectionContents(collection) {
    if (!collection) return [];
    if (Array.isArray(collection)) return collection;
    if (Array.isArray(collection.contents)) return collection.contents;
    if (typeof collection.values === "function") return Array.from(collection.values());
    if (typeof collection[Symbol.iterator] === "function") return Array.from(collection);
    return [];
}

function positiveNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function tokenTexture(token) {
    return String(token?.texture?.src
        ?? token?.document?.texture?.src
        ?? token?.actor?.prototypeToken?.texture?.src
        ?? token?.actor?.img
        ?? ""
    ).trim();
}

function tokenName(token) {
    return String(token?.name ?? token?.document?.name ?? token?.actor?.name ?? "Token").trim();
}

function tokenPosition(token, axis) {
    return Number(token?.[axis] ?? token?.document?.[axis] ?? 0);
}

function tokenGridSize(token, axis, fallback = 1) {
    return positiveNumber(token?.[axis] ?? token?.document?.[axis], fallback);
}

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
        getSceneWallOverlayState = () => null,
        getMapPanelToolbarState = () => ({}),
        renderMarketPanel = () => "",
        renderPlayerPanel = () => "",
        renderGamemasterPanel = () => "",
        getSelectedTokenIds = () => new Set()
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
        this.getSceneWallOverlayState = getSceneWallOverlayState;
        this.getMapPanelToolbarState = getMapPanelToolbarState;
        this.renderMarketPanel = renderMarketPanel;
        this.renderPlayerPanel = renderPlayerPanel;
        this.renderGamemasterPanel = renderGamemasterPanel;
        this.getSelectedTokenIds = getSelectedTokenIds;
    }

    renderPanelContent(panel, context = {}) {
        const content = this.renderPanelBodyContent(panel, context);
        const isMapPanel = this.isMapPanel(panel);
        const panelId = String(panel?.id ?? "").trim();
        const mapToolbarState = isMapPanel ? this.getMapPanelToolbarState(panel) : {};
        const mapToolbarMarkup = this.isGM() && isMapPanel
            ? this.#renderMapToolbar(this.escapeHTML(panelId), mapToolbarState)
            : "";
        const designLensModel = buildDesignLensModel({
            panel,
            active: this.isDesignLensActive(panel?.id),
            isGM: this.isGM(),
            registry: this.designActionRegistry,
            excludeActionIds: isMapPanel ? ["scene.walls"] : []
        });
        if (mapToolbarMarkup) designLensModel.extraActionsMarkup = mapToolbarMarkup;
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

        if (panel.id === "encounter-manager") {
            if (!context.gm?.isGM) {
                return `<section class="totc-v2-encounter-manager"><p class="totc-v2-encounter-manager__empty">This panel is only available to the active Gamemaster.</p></section>`;
            }
            return renderEncounterManagerPanel(context.encounterManagerPanel ?? {}, { escapeHTML: (v) => this.escapeHTML(v) });
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
        const sceneWallOverlayState = this.getSceneWallOverlayState(mapScene);
        const sceneGridOverlayActive = Boolean(!calActive && sceneGridOverlayState);
        const wallOverlayActive = Boolean(sceneWallOverlayState?.segments?.length);
        const gridOverlayActive = calActive || sceneGridOverlayActive || wallOverlayActive;
        const calDialog = renderGridCalibrationDialog(calModel, { escapeHTML: (v) => this.escapeHTML(v) });
        const tokenMarkup = this.#renderMapTokenLayer(mapScene);

        const imageMarkup = mapSrc
            ? `<div class="totc-v2-map-panel__viewport${calActive ? " is-calibrating" : ""}" data-action="map-viewport" data-map-viewport="true"
                data-scene-actor-drop-target="true" data-map-panel-id="${this.escapeHTML(panelId)}" data-scene-id="${this.escapeHTML(sceneId)}"
                data-map-key="${this.escapeHTML(mapScene?.id ?? mapSrc)}"
                data-grid-type="${this.escapeHTML(sceneGridOverlayState?.gridType ?? mapScene?.grid?.type ?? "")}"
                data-grid-size="${this.escapeHTML(sceneGridOverlayState?.cellW ?? mapScene?.grid?.size ?? "")}"
                data-grid-offset-x="${this.escapeHTML(sceneGridOverlayState?.offsetX ?? -Number(mapScene?.shiftX ?? 0))}"
                data-grid-offset-y="${this.escapeHTML(sceneGridOverlayState?.offsetY ?? -Number(mapScene?.shiftY ?? 0))}">
                <img class="totc-v2-map-panel__image" src="${this.escapeHTML(mapSrc)}" alt="${sceneName}" draggable="false" data-action="map-image">
                ${tokenMarkup}
                ${gridOverlayActive ? `<svg class="totc-v2-map-panel__grid-overlay" data-grid-overlay="true" aria-hidden="true"></svg>` : ""}
                <div class="totc-v2-map-panel__actor-drop-preview" data-actor-drop-preview="true" aria-hidden="true"></div>
            </div>`
            : `<div class="totc-v2-map-panel__empty">No active scene map available</div>`;
        return `
        <figure class="totc-v2-map-panel${calActive ? " is-calibrating" : ""}">
            ${imageMarkup}
            <figcaption class="totc-v2-map-panel__caption">
                <span class="totc-v2-map-panel__name">${sceneName}</span>
                <span class="totc-v2-map-panel__meta">${this.escapeHTML(dimensionLabel)}</span>
            </figcaption>
            ${calDialog}
        </figure>`;
    }

    #renderMapToolbar(panelId = "", state = {}) {
        const mode = String(state.mode ?? "");
        const wallsActive = mode === "walls";
        const wallCommand = String(state.wallCommand ?? "detect");
        const wallType = String(state.wallType ?? "wall");
        const selectedWallCount = Number(state.selectedWallCount ?? 0);
        const joinableWallCount = Number(state.joinableWallCount ?? 0);
        const canDeleteSelectedWalls = selectedWallCount > 0;
        const canJoinSelectedWalls = joinableWallCount > 1;

        const primarySegment = `
        <div class="totc-v2-map-toolbar__segment" role="group" aria-label="View mode">
            <button type="button"
                class="totc-v2-map-toolbar__btn${wallsActive ? " is-active" : ""}"
                data-action="map-mode-select"
                data-map-panel-id="${panelId}"
                data-mode="walls"
                aria-pressed="${wallsActive}"
                title="Walls view — draw and edit scene walls">
                <i class="fa-solid fa-draw-polygon" aria-hidden="true"></i>
                <span>Walls</span>
            </button>
        </div>`;

        const secondarySegment = wallsActive ? `
            <div class="totc-v2-map-toolbar__segment" role="group" aria-label="Wall command">
                <button type="button"
                    class="totc-v2-map-toolbar__btn${wallCommand === "detect" ? " is-active" : ""}"
                    data-action="map-wall-command"
                    data-map-panel-id="${panelId}"
                    data-command="detect"
                    aria-pressed="${wallCommand === "detect"}"
                    title="Auto-detect grid-aligned walls from the map image">
                    <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
                    <span>Detect</span>
                </button>
                <button type="button"
                    class="totc-v2-map-toolbar__btn${wallCommand === "add" ? " is-active" : ""}"
                    data-action="map-wall-command"
                    data-map-panel-id="${panelId}"
                    data-command="add"
                    aria-pressed="${wallCommand === "add"}"
                    title="Click a grid edge to add a wall segment">
                    <i class="fa-solid fa-plus" aria-hidden="true"></i>
                    <span>Add</span>
                </button>
                <button type="button"
                    class="totc-v2-map-toolbar__btn"
                    data-action="map-wall-command"
                    data-map-panel-id="${panelId}"
                    data-command="remove"
                    aria-pressed="false"
                    ${canDeleteSelectedWalls ? "" : "disabled"}
                    title="${canDeleteSelectedWalls ? `Delete ${selectedWallCount} selected wall segment${selectedWallCount === 1 ? "" : "s"}` : "Select wall segments to delete them"}">
                    <i class="fa-solid fa-minus" aria-hidden="true"></i>
                    <span>Remove</span>
                </button>
                <button type="button"
                    class="totc-v2-map-toolbar__btn${wallCommand === "split" ? " is-active" : ""}"
                    data-action="map-wall-command"
                    data-map-panel-id="${panelId}"
                    data-command="split"
                    aria-pressed="${wallCommand === "split"}"
                    title="Click a wall segment to split it at the nearest grid point">
                    <i class="fa-solid fa-scissors" aria-hidden="true"></i>
                    <span>Split</span>
                </button>
                <button type="button"
                    class="totc-v2-map-toolbar__btn"
                    data-action="map-wall-command"
                    data-map-panel-id="${panelId}"
                    data-command="join"
                    aria-pressed="false"
                    ${canJoinSelectedWalls ? "" : "disabled"}
                    title="${canJoinSelectedWalls ? `Join ${joinableWallCount} fully selected wall segment${joinableWallCount === 1 ? "" : "s"}` : "Fully enclose adjacent wall segments to join them"}">
                    <i class="fa-solid fa-link" aria-hidden="true"></i>
                    <span>Join</span>
                </button>
            </div>
            <div class="totc-v2-map-toolbar__segment" role="group" aria-label="Wall type">
                <button type="button"
                    class="totc-v2-map-toolbar__btn${wallType === "wall" ? " is-active" : ""}"
                    data-action="map-wall-type"
                    data-map-panel-id="${panelId}"
                    data-wall-type="wall"
                    aria-pressed="${wallType === "wall"}"
                    title="Wall — solid impassable barrier">
                    <span>Wall</span>
                </button>
                <button type="button"
                    class="totc-v2-map-toolbar__btn${wallType === "door" ? " is-active" : ""}"
                    data-action="map-wall-type"
                    data-map-panel-id="${panelId}"
                    data-wall-type="door"
                    aria-pressed="${wallType === "door"}"
                    title="Door — openable passage">
                    <span>Door</span>
                </button>
                <button type="button"
                    class="totc-v2-map-toolbar__btn${wallType === "window" ? " is-active" : ""}"
                    data-action="map-wall-type"
                    data-map-panel-id="${panelId}"
                    data-wall-type="window"
                    aria-pressed="${wallType === "window"}"
                    title="Window — see-through barrier">
                    <span>Window</span>
                </button>
            </div>
        ` : "";

        return `
        <nav class="totc-v2-map-toolbar" aria-label="Map tools" data-map-panel-id="${panelId}">
            <div class="totc-v2-map-toolbar__primary">
                ${primarySegment}
                ${secondarySegment}
            </div>
        </nav>`;
    }

    #renderMapTokenLayer(scene = null) {
        const cell = positiveNumber(scene?.grid?.size, 100);
        const tokens = collectionContents(scene?.tokens).filter(Boolean);
        const selectedTokenIds = this.getSelectedTokenIds();
        const tokenMarkup = tokens.map((token) => {
            const x = tokenPosition(token, "x");
            const y = tokenPosition(token, "y");
            const width = tokenGridSize(token, "width") * cell;
            const height = tokenGridSize(token, "height") * cell;
            const src = tokenTexture(token);
            const name = tokenName(token);
            const tokenId = String(token?.id ?? token?._id ?? token?.document?.id ?? token?._id ?? "").trim();
            const actorId = String(token?.actor?.id ?? token?.actor?._id ?? token?.actorId ?? "").trim();
            const isSelected = selectedTokenIds.has(tokenId) ? " is-selected" : "";
            const style = `left:${this.escapeHTML(x)}px;top:${this.escapeHTML(y)}px;width:${this.escapeHTML(width)}px;height:${this.escapeHTML(height)}px`;
            return src
                ? `<img class="totc-v2-map-panel__token${isSelected}" src="${this.escapeHTML(src)}" alt="${this.escapeHTML(name)}" title="${this.escapeHTML(name)}" style="${style}" data-token-id="${this.escapeHTML(tokenId)}" data-actor-id="${this.escapeHTML(actorId)}" data-action="map-token" draggable="false">`
                : `<span class="totc-v2-map-panel__token totc-v2-map-panel__token--fallback${isSelected}" title="${this.escapeHTML(name)}" style="${style}" data-token-id="${this.escapeHTML(tokenId)}" data-actor-id="${this.escapeHTML(actorId)}" data-action="map-token">${this.escapeHTML(name.slice(0, 1).toUpperCase() || "?")}</span>`;
        }).join("");
        return `<div class="totc-v2-map-panel__token-layer" data-map-token-layer="true" aria-label="Scene tokens">${tokenMarkup}</div>`;
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
