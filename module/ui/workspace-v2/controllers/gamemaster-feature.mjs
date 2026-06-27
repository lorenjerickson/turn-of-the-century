import { renderFoundryApplication } from "../../../foundry-v14-runtime.mjs";
import { WorkspaceFeature } from "../workspace-feature.mjs";

const GM_PANEL_STATE_KEY = "gmPanelState";

const GM_PANEL_DEFAULT_STATE = Object.freeze({
    collapsedGroupIds: [],
    actionSearchQuery: "",
    allActionsExpanded: false,
    contextDebug: false
});

const GM_ACTION_MODELS = Object.freeze([
    { id: "gm-start-encounter", label: "Start Encounter", description: "Start a new encounter from the current scene context.", groupId: "encounter-control", keywords: ["combat", "encounter", "start"], isRelevant: (snapshot) => !snapshot.hasActiveCombat },
    { id: "gm-open-combat-tracker", label: "Open Combat Tracker", description: "Open the combat tracker popout for detailed round control.", groupId: "encounter-control", keywords: ["combat", "tracker", "round"], isRelevant: (snapshot) => snapshot.hasActiveCombat },
    { id: "gm-next-turn", label: "Advance Turn", description: "Advance to the next combat turn.", groupId: "encounter-control", keywords: ["combat", "turn", "next", "round"], isRelevant: (snapshot) => snapshot.hasActiveCombat },
    { id: "gm-end-combat", label: "End Encounter", description: "End and clear the active encounter.", groupId: "encounter-control", keywords: ["combat", "encounter", "end", "stop"], isRelevant: (snapshot) => snapshot.hasActiveCombat },
    { id: "gm-create-scene", label: "Create Scene", description: "Create a new scene from a battle-map image in the organized world assets folder.", groupId: "scene-flow", keywords: ["scene", "map", "battlemap", "background", "image", "create"], isRelevant: () => true },
    { id: "gm-toggle-pause", label: "Toggle Pause", description: "Pause or resume the world clock and actions.", groupId: "scene-flow", keywords: ["pause", "resume", "world", "time"], isRelevant: () => true },
    { id: "gm-toggle-context-debug", label: "Toggle Context Debug", description: "Show or hide context scoring diagnostics inside the Gamemaster panel.", groupId: "scene-flow", keywords: ["debug", "context", "diagnostic", "priority"], isRelevant: () => true },
    { id: "gm-focus-controlled", label: "Focus Controlled Tokens", description: "Center the view on currently controlled tokens.", groupId: "selection-tools", keywords: ["token", "selection", "focus", "camera"], isRelevant: (snapshot) => snapshot.controlledCount > 0 },
    { id: "gm-clear-selection", label: "Clear Token Selection", description: "Release all currently controlled tokens.", groupId: "selection-tools", keywords: ["token", "selection", "clear"], isRelevant: (snapshot) => snapshot.controlledCount > 0 },
    { id: "gm-roll-camp-event", label: "Roll Travel Event", description: "Generate a context-aware camp/travel event.", groupId: "travel-generators", keywords: ["travel", "camp", "event", "roll"], isRelevant: (snapshot) => !snapshot.hasActiveCombat },
    { id: "gm-generate-town", label: "Generate Town Hook", description: "Create a fast narrative hook for a nearby settlement.", groupId: "travel-generators", keywords: ["town", "generator", "travel", "hook"], isRelevant: (snapshot) => !snapshot.hasActiveCombat },
    { id: "gm-generate-market", label: "Generate Market Hook", description: "Create a market opportunity hook for the current journey.", groupId: "travel-generators", keywords: ["market", "generator", "travel", "hook"], isRelevant: (snapshot) => !snapshot.hasActiveCombat },
    { id: "gm-generate-mob", label: "Generate Mob Hook", description: "Create a crowd or mob complication hook.", groupId: "travel-generators", keywords: ["mob", "crowd", "generator", "hook"], isRelevant: (snapshot) => !snapshot.hasActiveCombat },
    { id: "gm-generate-poi", label: "Generate Point of Interest", description: "Create a point-of-interest hook for the current route.", groupId: "travel-generators", keywords: ["poi", "location", "generator", "travel"], isRelevant: (snapshot) => !snapshot.hasActiveCombat },
    { id: "gm-atmosphere-clear-weather", label: "Set Atmosphere: Clear", description: "Set a clear-weather atmosphere cue for narration.", groupId: "atmosphere", keywords: ["atmosphere", "weather", "audio", "visual"], isRelevant: () => true },
    { id: "gm-atmosphere-storm", label: "Set Atmosphere: Storm", description: "Set a storm atmosphere cue for narration.", groupId: "atmosphere", keywords: ["atmosphere", "weather", "audio", "visual", "storm"], isRelevant: () => true }
]);

const GM_GROUP_MODELS = Object.freeze([
    { id: "encounter-control", title: "Encounter Control", description: "Run or close encounters based on current combat state.", basePriority: 90, isRelevant: () => true },
    { id: "scene-flow", title: "Scene and Flow", description: "World timing and pacing controls.", basePriority: 60, isRelevant: () => true },
    { id: "selection-tools", title: "Selection Tools", description: "Token-focused controls for current selection.", basePriority: 50, isRelevant: (snapshot) => snapshot.controlledCount > 0 },
    { id: "travel-generators", title: "Travel Generators", description: "Generate narrative travel hooks for towns, markets, mobs, and POIs.", basePriority: 45, isRelevant: (snapshot) => !snapshot.hasActiveCombat },
    { id: "atmosphere", title: "Audio and Visual Atmosphere", description: "Quick atmosphere cues for scene tone.", basePriority: 35, isRelevant: () => true }
]);

export function normalizeGamemasterPanelState(value = {}) {
    const collapsedGroupIds = Array.isArray(value?.collapsedGroupIds)
        ? [...new Set(value.collapsedGroupIds.map((entry) => String(entry ?? "").trim()).filter(Boolean))]
        : [...GM_PANEL_DEFAULT_STATE.collapsedGroupIds];

    return {
        collapsedGroupIds,
        actionSearchQuery: String(value?.actionSearchQuery ?? GM_PANEL_DEFAULT_STATE.actionSearchQuery),
        allActionsExpanded: Boolean(value?.allActionsExpanded ?? GM_PANEL_DEFAULT_STATE.allActionsExpanded),
        contextDebug: Boolean(value?.contextDebug ?? GM_PANEL_DEFAULT_STATE.contextDebug)
    };
}

export function buildGamemasterContextSnapshot({ scene = null, combat = null, controlledTokens = [], game = globalThis.game } = {}) {
    return {
        isGM: Boolean(game?.user?.isGM),
        paused: Boolean(game?.paused),
        worldTime: Number(game?.time?.worldTime ?? 0),
        sceneName: scene?.name ?? game?.scenes?.viewed?.name ?? "No active scene",
        sceneId: scene?.id ?? game?.scenes?.viewed?.id ?? null,
        hasActiveCombat: Boolean(combat),
        combat: combat
            ? {
                id: combat.id ?? null,
                started: Boolean(combat.started),
                round: Number(combat.round ?? 0),
                turn: Number(combat.turn ?? 0),
                phase: String(combat.phase ?? "planning"),
                combatantCount: combat.combatants?.size ?? combat.combatants?.contents?.length ?? 0
            }
            : null,
        controlledCount: controlledTokens.length,
        controlledNames: controlledTokens.map((token) => token?.name).filter(Boolean)
    };
}

export function buildGamemasterPanelModel({ snapshot, panelState }) {
    const collapsedSet = new Set(panelState.collapsedGroupIds ?? []);
    const actions = GM_ACTION_MODELS.map((action) => ({ ...action, relevant: action.isRelevant?.(snapshot) ?? true }));
    const groups = GM_GROUP_MODELS
        .map((group) => {
            const groupActions = actions.filter((action) => action.groupId === group.id && action.relevant);
            const relevant = (group.isRelevant?.(snapshot) ?? true) && groupActions.length > 0;
            const priorityScore = scoreGamemasterGroup(group, snapshot, groupActions);
            return { ...group, actions: groupActions, relevant, collapsed: collapsedSet.has(group.id), priorityScore };
        })
        .filter((group) => group.relevant)
        .sort((left, right) => right.priorityScore - left.priorityScore);

    const searchQuery = String(panelState.actionSearchQuery ?? "").trim().toLowerCase();
    const allActions = actions
        .filter((action) => {
            if (!searchQuery) return true;
            const haystack = `${action.label} ${action.description} ${(action.keywords ?? []).join(" ")}`.toLowerCase();
            return haystack.includes(searchQuery);
        })
        .sort((left, right) => String(left.label).localeCompare(String(right.label), undefined, { sensitivity: "base" }));

    return {
        groups,
        allActions,
        allActionsExpanded: Boolean(panelState.allActionsExpanded),
        actionSearchQuery: panelState.actionSearchQuery,
        totalActionCount: actions.length,
        contextDebug: Boolean(panelState.contextDebug),
        debugRows: [
            { label: "Scene", value: snapshot.sceneName ?? "No active scene" },
            { label: "Active Combat", value: snapshot.hasActiveCombat ? "Yes" : "No" },
            { label: "Controlled Tokens", value: String(snapshot.controlledCount ?? 0) },
            { label: "World Paused", value: snapshot.paused ? "Yes" : "No" },
            { label: "Group Scores", value: groups.map((group) => `${group.title}: ${group.priorityScore}`).join(" | ") || "None" }
        ]
    };
}

function scoreGamemasterGroup(group, snapshot, actions = []) {
    let score = Number(group.basePriority) || 0;
    if (group.id === "encounter-control" && snapshot.hasActiveCombat) score += 25;
    if (group.id === "selection-tools") score += Math.min(15, snapshot.controlledCount * 5);
    if (group.id === "travel-generators" && !snapshot.hasActiveCombat) score += 15;
    score += Math.min(10, actions.length * 2);
    return score;
}

export class GamemasterFeature extends WorkspaceFeature {
    constructor({
        stateStore = null,
        render = () => {},
        escapeHTML = (value) => String(value ?? ""),
        renderRollRequests = () => "",
        getGame = () => globalThis.game,
        getCanvas = () => globalThis.canvas,
        getUi = () => globalThis.ui,
        getChatMessage = () => globalThis.ChatMessage,
        createCombat = async () => null,
        openEncounterManager = async () => {},
        executeSceneDesignAction = async () => {},
        generateMarketOfferBoard = async () => {},
        hooksController = null
    } = {}) {
        super();
        this.stateStore = stateStore;
        this.renderCallback = render;
        this.escapeHTML = escapeHTML;
        this.renderRollRequests = renderRollRequests;
        this.getGame = getGame;
        this.getCanvas = getCanvas;
        this.getUi = getUi;
        this.getChatMessage = getChatMessage;
        this.createCombat = createCombat;
        this.openEncounterManager = openEncounterManager;
        this.executeSceneDesignAction = executeSceneDesignAction;
        this.generateMarketOfferBoard = generateMarketOfferBoard;
        this.sectionSnapshots = new Map();
        this.wiredElement = null;
        this._clickHandler = (event) => this.#handlePanelClick(event);

        this._refreshHandler = () => this.renderCallback({ force: false });
        hooksController?.registerFamily("gamemaster", [
            { event: "createCombat", handler: this._refreshHandler },
            { event: "deleteCombat", handler: this._refreshHandler },
            { event: "updateCombat", handler: this._refreshHandler },
            { event: "controlToken", handler: this._refreshHandler },
            { event: "pauseGame", handler: this._refreshHandler }
        ]);
    }

    prepareContext(context) {
        const game = this.getGame();
        const canvas = this.getCanvas();
        const scene = context.sceneDocument ?? canvas?.scene ?? game?.scenes?.active ?? game?.scenes?.viewed ?? null;
        const combat = game?.combats?.active ?? game?.combat ?? null;
        const controlledTokens = canvas?.tokens?.controlled ?? [];
        const panelState = this.getPanelState();
        const snapshot = buildGamemasterContextSnapshot({ scene, combat, controlledTokens, game });
        const panel = buildGamemasterPanelModel({ snapshot, panelState });
        const visibleGroupIds = panel.groups?.map((group) => group.id) ?? [];
        const highlightedGroupIds = this.#trackPanelSectionHighlights("gm", visibleGroupIds);

        context.gm = snapshot;
        context.gmPanel = {
            ...panel,
            groups: panel.groups?.map((group) => ({
                ...group,
                highlighted: highlightedGroupIds.includes(group.id)
            })) ?? []
        };
    }

    bind(rootElement) {
        if (this.wiredElement === rootElement) return;
        this.wiredElement?.removeEventListener?.("click", this._clickHandler);
        this.wiredElement = rootElement;
        if (!rootElement || typeof rootElement.addEventListener !== "function") return;
        rootElement.addEventListener("click", this._clickHandler);
    }

    async #handlePanelClick(event) {
        const target = event.target;
        const actionButton = target?.closest?.("[data-action='gm-execute-action']");
        if (actionButton) {
            event.preventDefault();
            event.stopPropagation();
            const actionId = actionButton.dataset.gmActionId;
            if (!actionId) return;
            await this.executeAction(actionId);
            return;
        }

        const groupButton = target?.closest?.("[data-action='gm-toggle-group']");
        if (groupButton) {
            event.preventDefault();
            event.stopPropagation();
            const groupId = String(groupButton.dataset.groupId ?? "").trim();
            if (!groupId) return;
            const current = this.getPanelState();
            const collapsed = new Set(current.collapsedGroupIds ?? []);
            if (collapsed.has(groupId)) collapsed.delete(groupId);
            else collapsed.add(groupId);
            await this.setPanelStatePatch({ collapsedGroupIds: [...collapsed] });
            await this.renderCallback({ force: false });
            return;
        }

        const allActionsButton = target?.closest?.("[data-action='gm-toggle-all-actions']");
        if (allActionsButton) {
            event.preventDefault();
            event.stopPropagation();
            const current = this.getPanelState();
            await this.setPanelStatePatch({ allActionsExpanded: !current.allActionsExpanded });
            await this.renderCallback({ force: false });
        }
    }

    getPanelState() {
        return this.stateStore?.getUserScopedState?.(GM_PANEL_STATE_KEY, normalizeGamemasterPanelState)
            ?? normalizeGamemasterPanelState();
    }

    async setPanelStatePatch(patch = {}) {
        return await this.stateStore?.setUserScopedStatePatch?.(GM_PANEL_STATE_KEY, patch, normalizeGamemasterPanelState);
    }

    renderGamemasterPanel(gmPanel = {}, gmSnapshot = {}, dieRollRequestPanel = {}) {
        const combat = gmSnapshot.combat;
        const combatSummary = combat
            ? `${combat.combatantCount} combatant${combat.combatantCount === 1 ? "" : "s"} · Round ${Math.max(1, combat.round || 1)} · Turn ${Math.max(1, (combat.turn ?? 0) + 1)}`
            : "No active combat";
        const controlledSummary = gmSnapshot.controlledCount
            ? gmSnapshot.controlledNames.slice(0, 3).join(", ")
            : "No controlled tokens";

        const groupsWithBody = (gmPanel.groups ?? []).map((group) => ({
            ...group,
            body: `
                <div class="totc-v2-gm-panel__group-description">${this.escapeHTML(group.description)}</div>
                <div class="totc-v2-gm-panel__button-grid" ${group.collapsed ? "hidden" : ""}>
                    ${(group.actions ?? []).map((action) => `
                        <button type="button" data-action="gm-execute-action" data-gm-action-id="${this.escapeHTML(action.id)}" title="${this.escapeHTML(action.description)}">${this.escapeHTML(action.label)}</button>`).join("")}
                </div>`
        }));
        const groupsMarkup = this.#renderCollapsibleSections(groupsWithBody, {
            panelId: "gm",
            toggleAction: "gm-toggle-group",
            sectionClass: "totc-v2-gm-panel__group",
            headerClass: "totc-v2-gm-panel__group-header",
            bodyClass: "totc-v2-gm-panel__group-body",
            sectionType: "group"
        });

        const allActionsMarkup = (gmPanel.allActions ?? []).map((action) => `
            <button type="button" data-action="gm-execute-action" data-gm-action-id="${this.escapeHTML(action.id)}" title="${this.escapeHTML(action.description)}">${this.escapeHTML(action.label)}</button>`).join("");
        const debugRowsMarkup = (gmPanel.debugRows ?? []).map((row) => `
            <div class="totc-v2-gm-panel__debug-row">
                <span>${this.escapeHTML(row.label)}</span>
                <span>${this.escapeHTML(row.value)}</span>
            </div>`).join("");
        const dieRollRequestsMarkup = this.renderRollRequests(dieRollRequestPanel);

        return `
        <section class="totc-v2-gm-panel">
            <article class="totc-v2-gm-panel__state">
                <h3>Current Context</h3>
                <p><strong>Scene:</strong> ${this.escapeHTML(gmSnapshot.sceneName ?? "No active scene")}</p>
                <p><strong>World:</strong> ${gmSnapshot.paused ? "Paused" : "Running"}</p>
                <p><strong>Combat:</strong> ${this.escapeHTML(combatSummary)}</p>
                <p><strong>Selection:</strong> ${this.escapeHTML(controlledSummary)}</p>
                ${gmPanel.contextDebug ? `<div class="totc-v2-gm-panel__debug">${debugRowsMarkup}</div>` : ""}
            </article>
            <section class="totc-v2-gm-panel__groups">
                ${groupsMarkup || `<div class="totc-v2-gm-panel__empty">No context groups are active right now.</div>`}
            </section>
            <article class="totc-v2-gm-panel__roll-requests">
                <div class="totc-v2-gm-panel__group-header">
                    <span>Die Roll Requests</span>
                    <span class="totc-v2-gm-panel__group-meta">${Number(dieRollRequestPanel?.requests?.length ?? 0)}</span>
                </div>
                <div class="totc-v2-gm-panel__roll-requests-body">
                    ${dieRollRequestsMarkup}
                </div>
            </article>
            <article class="totc-v2-gm-panel__all-actions ${gmPanel.allActionsExpanded ? "is-expanded" : ""}">
                <button type="button" class="totc-v2-gm-panel__group-header" data-action="gm-toggle-all-actions" aria-expanded="${gmPanel.allActionsExpanded ? "true" : "false"}">
                    <span>All GM Actions</span>
                    <span class="totc-v2-gm-panel__group-meta">${gmPanel.allActionsExpanded ? "-" : "+"}</span>
                </button>
                <div class="totc-v2-gm-panel__all-actions-body" ${gmPanel.allActionsExpanded ? "" : "hidden"}>
                    <label class="totc-v2-gm-panel__search">
                        <span>Search actions</span>
                        <input type="search" data-action="gm-search-actions" value="${this.escapeHTML(gmPanel.actionSearchQuery ?? "")}" placeholder="Filter by label, description, or keyword">
                    </label>
                    <div class="totc-v2-gm-panel__all-actions-meta">${(gmPanel.allActions ?? []).length} of ${Number(gmPanel.totalActionCount ?? 0)} actions</div>
                    <div class="totc-v2-gm-panel__button-grid">
                        ${allActionsMarkup || `<div class="totc-v2-gm-panel__empty">No actions match this search.</div>`}
                    </div>
                </div>
            </article>
        </section>`;
    }

    async executeAction(actionId) {
        const game = this.getGame();
        const ui = this.getUi();
        const canvas = this.getCanvas();
        if (!game?.user?.isGM) {
            ui?.notifications?.warn("Only the GM can run Gamemaster actions.");
            return;
        }

        const combat = game?.combats?.active ?? game?.combat ?? null;
        switch (String(actionId)) {
            case "gm-toggle-pause":
                await game?.togglePause?.(!game.paused, true);
                break;
            case "gm-create-scene":
                await this.executeSceneDesignAction("scene.create", { panelId: "gamemaster" });
                break;
            case "gm-open-combat-tracker":
                renderFoundryApplication(ui?.combat, { force: true });
                break;
            case "gm-start-encounter": {
                let activeCombat = combat;
                if (!activeCombat && canvas?.scene?.id) activeCombat = await this.createCombat({ scene: canvas.scene.id });
                if (activeCombat?.initializeEncounterRound) await activeCombat.initializeEncounterRound();
                await this.openEncounterManager();
                break;
            }
            case "gm-next-turn":
                await combat?.nextTurn?.();
                break;
            case "gm-end-combat":
                await combat?.delete?.();
                break;
            case "gm-focus-controlled": {
                const controlled = canvas?.tokens?.controlled ?? [];
                const anchor = controlled[0];
                if (!anchor) break;
                await canvas?.animatePan?.({ x: anchor.center?.x ?? anchor.x, y: anchor.center?.y ?? anchor.y, scale: canvas.stage?.scale?.x ?? 1 });
                break;
            }
            case "gm-clear-selection":
                for (const token of canvas?.tokens?.controlled ?? []) token.release?.();
                break;
            case "gm-roll-camp-event": {
                const eventResult = game?.turnOfTheCentury?.campEvents?.rollEvent?.({});
                ui?.notifications?.info(eventResult?.name ? `Travel event: ${eventResult.name}` : "Travel event roll executed.");
                break;
            }
            case "gm-generate-town":
                await this.#generateGamemasterHook("town");
                break;
            case "gm-generate-market":
                await this.generateMarketOfferBoard();
                break;
            case "gm-generate-mob":
                await this.#generateGamemasterHook("mob");
                break;
            case "gm-generate-poi":
                await this.#generateGamemasterHook("poi");
                break;
            case "gm-atmosphere-clear-weather":
                await this.#setAtmospherePreset("clear");
                break;
            case "gm-atmosphere-storm":
                await this.#setAtmospherePreset("storm");
                break;
            case "gm-toggle-context-debug": {
                const current = this.getPanelState();
                await this.setPanelStatePatch({ contextDebug: !current.contextDebug });
                break;
            }
            default:
                ui?.notifications?.warn(`Unknown Gamemaster action: ${actionId}`);
                break;
        }

        this.renderCallback({ force: false });
    }

    async announceGeneratedContent({ title, lines = [] } = {}) {
        const safeTitle = String(title ?? "Gamemaster Output");
        const safeLines = Array.isArray(lines)
            ? lines.map((line) => String(line ?? "").trim()).filter(Boolean)
            : [];

        const content = `<h3>${this.escapeHTML(safeTitle)}</h3>${safeLines.map((line) => `<p>${this.escapeHTML(line)}</p>`).join("")}`;
        const ChatMessage = this.getChatMessage();
        const whisperRecipients = ChatMessage?.getWhisperRecipients?.("GM")?.map((user) => user.id).filter(Boolean) ?? [];

        if (typeof ChatMessage?.create === "function") {
            await ChatMessage.create({
                content,
                whisper: whisperRecipients.length ? whisperRecipients : undefined,
                speaker: ChatMessage.getSpeaker?.({ alias: "Gamemaster Panel" })
            });
        }

        this.getUi()?.notifications?.info(safeTitle);
    }

    async #generateGamemasterHook(kind) {
        const seedsApi = this.getGame()?.turnOfTheCentury?.seeds;
        const factionMap = seedsApi?.factionMetadata ?? {};
        const factionKeys = Object.keys(factionMap);
        const factionKey = this.#randomFrom(factionKeys) ?? "frontier-raiders";
        const narrative = seedsApi?.getNarrative?.(factionKey) ?? {};
        const faction = seedsApi?.getFaction?.(factionKey) ?? { name: factionKey };

        const promptByKind = {
            town: `Town lead: ${narrative.preEncounter ?? "A settlement asks for immediate aid."}`,
            market: `Market lead: ${narrative.victory ?? "A broker offers scarce goods at a risky premium."}`,
            mob: `Mob lead: ${narrative.combat ?? "Crowd unrest spills into the streets."}`,
            poi: `Point of interest: ${narrative.defeat ?? "A marked site hints at unresolved danger."}`
        };
        const titleByKind = {
            town: "Town Hook Generated",
            market: "Market Hook Generated",
            mob: "Mob Hook Generated",
            poi: "Point of Interest Generated"
        };

        await this.announceGeneratedContent({
            title: titleByKind[kind] ?? "GM Hook Generated",
            lines: [
                `Faction: ${faction?.name ?? factionKey}`,
                promptByKind[kind] ?? "Narrative hook generated."
            ]
        });
    }

    async #setAtmospherePreset(preset) {
        const game = this.getGame();
        const ui = this.getUi();
        const scene = this.getCanvas()?.scene ?? game?.scenes?.viewed ?? null;
        if (!scene) {
            ui?.notifications?.warn("No active scene is available for atmosphere controls.");
            return;
        }

        await scene.setFlag?.(game?.system?.id ?? "turn-of-the-century", "gmAtmosphere", {
            preset,
            updatedBy: game?.user?.id ?? null,
            updatedAt: Date.now()
        });

        const title = preset === "storm" ? "Atmosphere Set: Storm" : "Atmosphere Set: Clear";
        const description = preset === "storm"
            ? "Wind and thunder cues are now the active scene tone."
            : "Clear-weather cues are now the active scene tone.";

        await this.announceGeneratedContent({
            title,
            lines: [
                `Scene: ${scene.name ?? "Unknown scene"}`,
                description
            ]
        });
    }

    #trackPanelSectionHighlights(panelKey, visibleIds) {
        const previous = this.sectionSnapshots.get(panelKey) ?? new Set();
        const now = new Set(visibleIds);
        const revealed = visibleIds.filter((id) => !previous.has(id));
        this.sectionSnapshots.set(panelKey, now);
        return revealed;
    }

    #renderCollapsibleSections(sections, opts = {}) {
        const {
            panelId = "panel",
            toggleAction = "toggle-section",
            sectionClass = "totc-v2-shared-panel__section",
            headerClass = "totc-v2-shared-panel__section-header",
            bodyClass = "totc-v2-shared-panel__section-body",
            sectionType = "section"
        } = opts;
        return (sections ?? []).map((section) => {
            const collapsed = Boolean(section.collapsed);
            const revealClass = section.highlighted ? "is-revealed" : "";
            return `
            <article class="${sectionClass} ${collapsed ? "is-collapsed" : ""} ${revealClass}" data-${panelId}-${sectionType}-id="${this.escapeHTML(section.id)}">
                <button type="button" class="${headerClass}" data-action="${toggleAction}" data-${sectionType}-id="${this.escapeHTML(section.id)}" aria-expanded="${collapsed ? "false" : "true"}">
                    <span>${this.escapeHTML(section.title)}</span>
                    <span class="${sectionClass}-meta">${this.escapeHTML(section.summary ?? "")}</span>
                </button>
                <div class="${bodyClass}" ${collapsed ? "hidden" : ""}>
                    ${section.body ?? ""}
                </div>
            </article>`;
        }).join("");
    }

    #randomFrom(items = []) {
        if (!Array.isArray(items) || !items.length) return null;
        return items[Math.floor(Math.random() * items.length)];
    }
}
