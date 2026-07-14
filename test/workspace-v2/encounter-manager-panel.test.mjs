import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { GamemasterFeature } from "../../module/ui/workspace-v2/controllers/gamemaster-feature.mjs";
import {
    buildEncounterManagerPanelModel,
    renderEncounterManagerPanel
} from "../../module/ui/workspace-v2/panels/encounter-manager-panel.mjs";

const escapeHTML = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const workspaceRootSource = readFileSync(new URL("../../module/ui/workspace-v2/workspace-root-app.mjs", import.meta.url), "utf8");

function combatFixture() {
    return {
        id: "combat-1",
        name: "Rookery Ambush",
        round: 4,
        phase: "roundComplete",
        apBudget: 6,
        initializeEncounterRound: async () => {},
        setEncounterPhase: async () => {},
        resolveEncounterRound: async () => {},
        combatants: {
            contents: [
                {
                    id: "combatant-1",
                    name: "Ada Price",
                    img: "actors/ada.webp",
                    actor: {
                        name: "Ada Price",
                        img: "actors/ada.webp",
                        system: {
                            resources: { health: { value: 8, max: 10 } }
                        },
                        effects: [{ id: "effect-1", name: "Bleeding", disabled: false }]
                    }
                },
                {
                    id: "combatant-2",
                    name: "Brass Knuckles Briggs",
                    actor: {
                        system: {
                            resources: { health: { value: 5, max: 7 } }
                        },
                        effects: []
                    }
                }
            ]
        },
        encounterState: {
            initialized: true,
            phase: "roundComplete",
            round: 4,
            apBudget: 6,
            perCombatant: {
                "combatant-1": {
                    ready: true,
                    plan: [
                        { id: "move", label: "Move", apCost: 2 },
                        { id: "strike", label: "Strike", apCost: 1 }
                    ]
                },
                "combatant-2": {
                    ready: false,
                    plan: [{ id: "hunker", label: "Hunker Down", apCost: 3 }]
                }
            },
            timeline: [
                {
                    slot: 2,
                    combatantId: "combatant-1",
                    action: { id: "move", label: "Move", apStart: 1, apEnd: 2 },
                    outcome: { result: "moved", detail: "Ada Price moves 20 ft." }
                },
                {
                    slot: 3,
                    combatantId: "combatant-2",
                    action: { id: "hunker", label: "Hunker Down", apStart: 1, apEnd: 3 },
                    outcome: { result: "defended", detail: "Briggs hunkers down." }
                }
            ]
        }
    };
}

function resolvingCombatFixture() {
    const combat = combatFixture();
    return {
        ...combat,
        phase: "resolving",
        encounterState: {
            ...combat.encounterState,
            phase: "resolving",
            resolution: {
                status: "paused",
                currentTick: 2,
                totalTicks: 6,
                snapshots: [{ tick: 0 }, { tick: 1 }, { tick: 2 }],
                tickNarratives: [
                    {
                        tick: 1,
                        summary: "Horus pursues Mallory. Mallory raises her galvanic rifle to her cheek."
                    },
                    {
                        tick: 2,
                        summary: "Horus closes with Mallory. Mallory sights down the barrel and shoots."
                    }
                ]
            },
            timeline: [
                ...combat.encounterState.timeline,
                {
                    tick: 2,
                    combatantId: "combatant-1",
                    orderId: "move",
                    clauseId: "clause-1-effect",
                    clauseType: "movement",
                    clauseText: "Move toward the alley gate",
                    clauseStatus: "active",
                    relatedCombatantIds: ["combatant-2"],
                    action: { id: "move", label: "Move", type: "movement" },
                    outcome: { result: "movementStep", detail: "Ada moves." }
                }
            ]
        },
        stepEncounterResolution: async () => {}
    };
}

function planningDraftCombatFixture() {
    const combat = combatFixture();
    return {
        ...combat,
        phase: "planning",
        encounterState: {
            ...combat.encounterState,
            phase: "planning",
            perCombatant: {
                "combatant-1": {
                    ready: false,
                    plan: [],
                    draftPlan: {
                        lifecycle: "drafting",
                        clauses: [
                            {
                                clauseId: "draft-clause-1",
                                actionId: "attack",
                                type: "attack",
                                label: "Attack",
                                apCost: 2,
                                requiresTarget: true,
                                requiresItem: true,
                                targetId: "combatant-2",
                                targetName: "Brass Knuckles Briggs"
                            }
                        ]
                    }
                },
                "combatant-2": {
                    ready: false,
                    plan: [
                        {
                            id: "strike",
                            actionId: "strike",
                            type: "attack",
                            label: "Strike",
                            apCost: 2,
                            requiresToHit: true,
                            rollRequirements: [
                                { rollType: "attack", rollSubType: "toHit" }
                            ],
                            planningRollResults: []
                        }
                    ],
                    draftPlan: {
                        lifecycle: "confirmedAwaitingRolls",
                        clauses: [
                            {
                                clauseId: "draft-clause-1",
                                actionId: "strike",
                                type: "attack",
                                label: "Strike",
                                apCost: 2,
                                requiresTarget: true,
                                targetId: "combatant-1",
                                targetName: "Ada Price"
                            }
                        ]
                    }
                }
            }
        }
    };
}

describe("encounter manager panel", () => {
    it("renders no active encounter empty state when there is no encounter", () => {
        const model = buildEncounterManagerPanelModel({ combat: null });
        const html = renderEncounterManagerPanel(model, { escapeHTML });

        assert.match(html, /class="totc-v2-encounter-manager is-empty"/);
        assert.match(html, /class="totc-v2-encounter-manager__empty">No active encounter\.<\/div>/);
    });

    it("builds GM actor summaries, current tick, and per-tick round narratives", () => {
        const model = buildEncounterManagerPanelModel({ combat: combatFixture() });

        assert.equal(model.round, 4);
        assert.equal(model.phase, "roundComplete");
        assert.equal(model.currentTick, 3);
        assert.equal(model.actors.length, 2);
        assert.equal(model.actors[0].name, "Ada Price");
        assert.deepEqual(model.actors[0].conditions, ["Bleeding"]);
        assert.equal(model.lastNarrative, "Briggs hunkers down.");
        assert.equal(model.tickNarratives.length, 6);
        assert.equal(model.tickNarratives[1].summary, "Ada Price moves 20 ft.");
        assert.equal(model.tickNarratives[2].summary, "Briggs hunkers down.");
        assert.equal(model.tickNarratives[2].current, true);
    });

    it("enables second-step controls only during resolving phase", () => {
        const planningModel = buildEncounterManagerPanelModel({ combat: combatFixture() });
        assert.equal(planningModel.canStepPrevious, false);
        assert.equal(planningModel.canStepNext, false);

        const resolvingModel = buildEncounterManagerPanelModel({ combat: resolvingCombatFixture() });
        assert.equal(resolvingModel.canStepPrevious, true);
        assert.equal(resolvingModel.canStepNext, true);
    });

    it("renders the current tick, dense combatant plan rows, and last-round summary", () => {
        const html = renderEncounterManagerPanel(buildEncounterManagerPanelModel({ combat: combatFixture() }), { escapeHTML });

        assert.match(html, /class="totc-v2-encounter-manager"/);
        assert.match(html, /Round 4/);
        assert.match(html, /<h3>Current Second<\/h3>/);
        assert.match(html, /data-tick="3"/);
        assert.match(html, /Briggs hunkers down\./);
        assert.match(html, /class="totc-v2-encounter-manager__tick-narrative is-current" data-tick="3"/);
        assert.match(html, /<h3>Combatant Plans<\/h3>/);
        assert.match(html, /class="totc-v2-encounter-manager__actor-plan"/);
        assert.match(html, /class="totc-v2-encounter-panel__bar"/);
        assert.match(html, /class="totc-v2-encounter-manager__actor-ready is-resolved">Resolved<\/span>/);
        assert.match(html, /<h3>Last Round<\/h3>/);
        assert.match(html, /Ada Price moves 20 ft\./);
        assert.match(html, /data-action="encounter-manager-start-round"/);
        assert.match(html, /class="totc-v2-encounter-manager__controls">[\s\S]*?<\/div>\s*<div class="totc-v2-encounter-manager__scroll">/);
        assert.doesNotMatch(html, /turn-order roll/i);
        assert.match(html, /data-action="encounter-manager-set-phase" data-phase="locked"/);
        assert.match(html, /data-action="encounter-manager-resolve-round"/);
        assert.match(html, /class="totc-v2-encounter-manager__progress"/);
        assert.match(html, /data-action="encounter-manager-step-tick" data-direction="-1"/);
        assert.match(html, /data-action="encounter-manager-step-tick" data-direction="1"/);
        assert.match(html, />Prev Second<\/button>/);
        assert.match(html, />Next Second<\/button>/);
        assert.doesNotMatch(html, /data-action="encounter-manager-reset-rolls"/);
        assert.doesNotMatch(html, /class="totc-v2-encounter-panel__orders"/);
        assert.doesNotMatch(html, /class="totc-v2-encounter-manager__draft/);
        assert.doesNotMatch(html, /Narrative Plan/);
        assert.doesNotMatch(html, /totc-v2-encounter-manager__plan/);
        assert.doesNotMatch(html, /totc-v2-encounter-manager__order-clause/);
        assert.doesNotMatch(html, /totc-v2-encounter-manager__tick-outline/);
    });

    it("prefers generated previous-round narration from round history", () => {
        const combat = planningDraftCombatFixture();
        combat.encounterState.roundHistory = [
            {
                round: 3,
                tickNarratives: [
                    { tick: 1, summary: "Deterministic fallback line." }
                ],
                roundNarrative: {
                    status: "complete",
                    narrative: "The previous round ends with [Ada's decisive strike].",
                    links: [
                        {
                            id: "round-3-exchange-1",
                            text: "Ada's decisive strike",
                            type: "attack-resolution",
                            combatantIds: ["combatant-1", "combatant-2"],
                            actionId: "strike",
                            itemId: "",
                            timelineEntryIds: [],
                            rollRequestIds: [],
                            rollResultIds: [],
                            clauseIds: []
                        }
                    ],
                    gmNotes: []
                }
            }
        ];

        const model = buildEncounterManagerPanelModel({ combat });
        const html = renderEncounterManagerPanel(model, { escapeHTML });

        assert.equal(model.lastRoundNarrative.status, "complete");
        assert.match(html, /The previous round ends with/);
        assert.match(html, /data-link-id="round-3-exchange-1"/);
        assert.doesNotMatch(html, /Deterministic fallback line/);
    });

    it("ignores null tick narratives when building previous-round fallback narration", () => {
        const combat = planningDraftCombatFixture();
        combat.encounterState.roundHistory = [
            {
                round: 3,
                tickNarratives: [
                    null,
                    { tick: 2, summary: "Ada keeps her footing amid the fog." }
                ],
                roundNarrative: {
                    status: "pending"
                }
            }
        ];

        const model = buildEncounterManagerPanelModel({ combat });
        const html = renderEncounterManagerPanel(model, { escapeHTML });

        assert.equal(model.lastRoundNarrative.status, "pending");
        assert.equal(model.lastRoundNarrative.lines.length, 1);
        assert.equal(model.lastRoundNarrative.lines[0].narrative, "Ada keeps her footing amid the fog.");
        assert.match(html, /Ada keeps her footing amid the fog\./);
    });

    it("shows only the current tick narrative while resolving", () => {
        const model = buildEncounterManagerPanelModel({ combat: resolvingCombatFixture() });
        const html = renderEncounterManagerPanel(model, { escapeHTML });

        assert.equal(model.tickNarratives[0].summary, "Horus pursues Mallory. Mallory raises her galvanic rifle to her cheek.");
        assert.equal(model.tickNarratives[1].summary, "Horus closes with Mallory. Mallory sights down the barrel and shoots.");
        assert.equal(model.currentTickNarrative.summary, "Horus closes with Mallory. Mallory sights down the barrel and shoots.");
        assert.equal(model.tickNarratives[1].current, true);
        assert.match(html, /Horus closes with Mallory\. Mallory sights down the barrel and shoots\./);
        assert.doesNotMatch(html, /Horus pursues Mallory\. Mallory raises her galvanic rifle to her cheek\./);
        assert.doesNotMatch(html, /<h3>Last Round<\/h3>/);
    });

    it("renders generated tick narration without inline plan summaries or factual outlines", () => {
        const combat = resolvingCombatFixture();
        combat.encounterState.resolution.tickNarratives[1] = {
            tick: 2,
            summary: "Horus closes with Mallory. Mallory sights down the barrel and shoots.",
            generatedNarrative: "Horus barrels through the fog as Mallory's galvanic rifle spits a hard white flash.",
            factualOutlineMarkdown: "- Horus closes with Mallory (AP 2 of 3)\n- Mallory fires galvanic rifle at Horus; result: hit (AP 2 of 2)",
            generationStatus: "complete"
        };

        const model = buildEncounterManagerPanelModel({ combat });
        const html = renderEncounterManagerPanel(model, { escapeHTML });

        assert.equal(model.lastNarrative, "Horus barrels through the fog as Mallory's galvanic rifle spits a hard white flash.");
        assert.equal(model.tickNarratives[1].summary, "Horus closes with Mallory. Mallory sights down the barrel and shoots.");
        assert.equal(model.tickNarratives[1].generatedNarrative, "Horus barrels through the fog as Mallory's galvanic rifle spits a hard white flash.");
        assert.match(html, /class="totc-v2-encounter-manager__tick-story">Horus barrels through the fog/);
        assert.doesNotMatch(html, /<strong>Plan tick:<\/strong>/);
        assert.doesNotMatch(html, /class="totc-v2-encounter-manager__tick-outline">- Horus closes with Mallory/);
    });

    it("builds order clauses for detail popups without rendering them inline", () => {
        const model = buildEncounterManagerPanelModel({ combat: resolvingCombatFixture() });
        const ada = model.actors[0];

        assert.equal(ada.orders.length, 2);
        assert.equal(ada.orders[0].status, "active");
        assert.equal(ada.orders[0].clauses[0].status, "active");
        assert.equal(ada.orders[0].clauses[0].text, "Move toward the alley gate");
        assert.deepEqual(ada.orders[0].clauses[0].relatedCombatantIds, ["combatant-2"]);

        const html = renderEncounterManagerPanel(model, { escapeHTML });
        assert.doesNotMatch(html, /class="totc-v2-encounter-panel__orders"/);
        assert.doesNotMatch(html, /class="totc-v2-encounter-manager__order is-active"/);
        assert.doesNotMatch(html, /class="totc-v2-encounter-manager__order-clause is-active"/);
        assert.doesNotMatch(html, /data-related-combatant-ids="combatant-2"/);
    });

    it("renders linked narrative popup details for accepted die roll results", () => {
        const combat = combatFixture();
        combat.encounterState.perCombatant["combatant-1"].plan[1] = {
            id: "strike",
            actionId: "strike",
            type: "attack",
            label: "Strike",
            apCost: 2,
            requiresToHit: true,
            planningRollResults: [
                {
                    requestId: "roll-hit",
                    rollType: "attack",
                    rollSubType: "toHit",
                    result: { total: 17, formula: "1d20 + 5" }
                },
                {
                    requestId: "roll-damage",
                    rollType: "attack",
                    rollSubType: "damage",
                    result: { total: 6, formula: "1d6 + 2" }
                }
            ]
        };
        combat.encounterState.resolution = {
            status: "complete",
            currentTick: 3,
            totalTicks: 6,
            tickNarratives: [
                {
                    tick: 3,
                    summary: "Ada Price strikes Briggs.",
                    generatedNarrative: "Ada Price drives her cane into [Briggs's ribs].",
                    links: [
                        {
                            id: "tick-3-exchange-1",
                            text: "Briggs's ribs",
                            type: "attack-resolution",
                            combatantIds: ["combatant-1", "combatant-2"],
                            actionId: "strike",
                            itemId: "",
                            timelineEntryIds: [],
                            rollRequestIds: ["roll-hit"],
                            rollResultIds: ["roll-hit", "roll-damage"],
                            clauseIds: []
                        }
                    ]
                }
            ]
        };

        const model = buildEncounterManagerPanelModel({ combat });
        const strike = model.actors[0].orders[1];

        assert.deepEqual(
            strike.rollResults.map((result) => [result.label, result.total, result.formula]),
            [["toHit", 17, "1d20 + 5"], ["damage", 6, "1d6 + 2"]]
        );

        const html = renderEncounterManagerPanel(model, { escapeHTML });
        assert.match(html, /data-action="encounter-manager-narrative-detail"/);
        assert.match(html, /data-link-id="tick-3-exchange-1"/);
        assert.match(html, /totc-v2-encounter-manager__narrative-detail/);
        assert.match(html, /Briggs&#039;s ribs|Briggs's ribs/);
        assert.match(html, /toHit/);
        assert.match(html, /17/);
        assert.match(html, /1d20 \+ 5/);
        assert.match(html, /damage/);
        assert.match(html, /6/);
        assert.match(html, /1d6 \+ 2/);
    });

    it("builds draft summaries without rendering draft cards in the combatant plan list", () => {
        const model = buildEncounterManagerPanelModel({ combat: planningDraftCombatFixture() });
        const ada = model.actors[0];

        assert.equal(ada.draftSummary.lifecycle, "drafting");
        assert.equal(ada.draftSummary.spentAp, 2);
        assert.equal(ada.draftSummary.remainingAp, 4);
        assert.deepEqual(ada.draftSummary.missingDecisions, ["item"]);
        assert.match(ada.draftSummary.text, /Ada Price attacks Brass Knuckles Briggs/);

        const html = renderEncounterManagerPanel(model, { escapeHTML });
        assert.doesNotMatch(html, /class="totc-v2-encounter-manager__draft/);
        assert.doesNotMatch(html, /Narrative Plan/);
        assert.doesNotMatch(html, /Ada Price attacks Brass Knuckles Briggs/);
        assert.doesNotMatch(html, /2 AP planned/);
        assert.doesNotMatch(html, /4 AP unused/);
        assert.doesNotMatch(html, /Needs item\./);
    });

    it("distinguishes confirmed plans that are still waiting for rolls", () => {
        const model = buildEncounterManagerPanelModel({ combat: planningDraftCombatFixture() });
        const briggs = model.actors[1];

        assert.equal(briggs.draftSummary.lifecycle, "confirmedAwaitingRolls");
        assert.equal(briggs.draftSummary.pendingRolls, 1);
        assert.equal(model.pendingRequiredRolls, 1);
        assert.equal(model.canResolveRound, false);

        const html = renderEncounterManagerPanel(model, { escapeHTML });
        assert.match(html, /class="totc-v2-encounter-manager__actor-ready is-awaiting-rolls">Awaiting Rolls<\/span>/);
        assert.match(html, /data-action="encounter-manager-reset-rolls"/);
        assert.doesNotMatch(html, /class="totc-v2-encounter-manager__draft-state/);
        assert.doesNotMatch(html, /1 roll pending\./);
        assert.match(html, /data-action="encounter-manager-resolve-round" disabled/);
    });

    it("enables round resolution after confirmed plan rolls are accepted", () => {
        const combat = planningDraftCombatFixture();
        combat.encounterState.perCombatant["combatant-1"] = {
            ready: true,
            plan: [{ id: "move", type: "movement", label: "Move", apCost: 2 }],
            draftPlan: { lifecycle: "locked", clauses: [] }
        };
        combat.encounterState.perCombatant["combatant-2"].ready = true;
        combat.encounterState.perCombatant["combatant-2"].draftPlan.lifecycle = "locked";
        combat.encounterState.perCombatant["combatant-2"].plan[0].planningLocked = true;
        combat.encounterState.perCombatant["combatant-2"].plan[0].planningRollResults = [
            {
                requestId: "roll-1",
                rollType: "attack",
                rollSubType: "toHit",
                result: { total: 18 }
            }
        ];

        const model = buildEncounterManagerPanelModel({
            combat,
            rollRequests: [
                {
                    id: "roll-1",
                    combatId: "combat-1",
                    combatantId: "combatant-2",
                    actionIndex: 0,
                    label: "Briggs: Strike",
                    rollType: "attack",
                    rollSubType: "toHit",
                    recipientIds: ["player-1"],
                    results: { "player-1": { total: 18 } },
                    status: "resolved",
                    isPending: false,
                    getFormulaFor: () => "1d20 + 2"
                }
            ],
            users: [{ id: "player-1", name: "Player", isGM: false }]
        });
        const html = renderEncounterManagerPanel(model, { escapeHTML });

        assert.equal(model.pendingRequiredRolls, 0);
        assert.equal(model.rollQueue.pendingRequestCount, 0);
        assert.equal(model.canResolveRound, true);
        assert.doesNotMatch(html, /data-action="encounter-manager-resolve-round" disabled/);
    });

    it("keeps round resolution disabled while encounter roll requests are pending", () => {
        const combat = planningDraftCombatFixture();
        combat.encounterState.perCombatant["combatant-1"] = {
            ready: true,
            plan: [
                { id: "move", type: "movement", label: "Move", apCost: 3 },
                { id: "hunker", type: "defense", label: "Hunker Down", apCost: 3 }
            ],
            draftPlan: { lifecycle: "locked", clauses: [] }
        };
        combat.encounterState.perCombatant["combatant-2"] = {
            ready: true,
            plan: [
                {
                    id: "shoot",
                    actionId: "shoot",
                    type: "composite",
                    label: "Close and Engage",
                    apCost: 6,
                    planningLocked: false,
                    planningRollResults: []
                }
            ],
            draftPlan: { lifecycle: "locked", clauses: [] }
        };
        const rollRequests = [
            {
                id: "to-hit",
                combatId: "combat-1",
                combatantId: "combatant-2",
                actionIndex: 0,
                label: "Close and Engage: to hit",
                rollType: "attack",
                rollSubType: "toHit",
                recipientIds: ["player-1"],
                results: {},
                status: "pending",
                isPending: true,
                getFormulaFor: () => "1d20 + 4"
            },
            {
                id: "damage",
                combatId: "combat-1",
                combatantId: "combatant-2",
                actionIndex: 0,
                label: "Close and Engage: damage",
                rollType: "attack",
                rollSubType: "damage",
                recipientIds: ["player-1"],
                results: {},
                status: "pending",
                isPending: true,
                getFormulaFor: () => "1d6"
            }
        ];

        const model = buildEncounterManagerPanelModel({
            combat,
            rollRequests,
            users: [{ id: "player-1", name: "Player", isGM: false }]
        });
        const html = renderEncounterManagerPanel(model, { escapeHTML });

        assert.equal(model.pendingRequiredRolls, 0);
        assert.equal(model.rollQueue.pendingRequestCount, 2);
        assert.equal(model.canResolveRound, false);
        assert.match(html, /data-action="encounter-manager-resolve-round" disabled/);
    });

    it("renders encounter roll requests in the GM manager with GM auto-roll controls", () => {
        const combat = planningDraftCombatFixture();
        const request = {
            id: "encounter-combat-1-combatant-combatant-2-action-0-attack",
            combatId: "combat-1",
            combatantId: "combatant-2",
            actionIndex: 0,
            label: "Briggs: Strike",
            rollType: "attack",
            rollSubType: "toHit",
            dice: [{ count: 1, faces: 20 }],
            modifiers: [{ label: "Action bonus", value: 2 }],
            recipientIds: ["gm-1"],
            results: {},
            status: "pending",
            isPending: true,
            getFormulaFor: () => "1d20 + 2"
        };

        const model = buildEncounterManagerPanelModel({
            combat,
            rollRequests: [request],
            users: [{ id: "gm-1", name: "GM", isGM: true }]
        });

        assert.equal(model.rollQueue.hasPendingGmRequests, true);
        assert.equal(model.rollQueue.requests[0].recipients[0].formula, "1d20 + 2");

        const html = renderEncounterManagerPanel(model, { escapeHTML });
        assert.match(html, /class="totc-v2-encounter-manager__roll-queue"/);
        assert.match(html, /Briggs: Strike/);
        assert.match(html, /1d20 \+ 2/);
        assert.match(html, /data-action="encounter-manager-auto-roll-gm"/);
        assert.match(html, /data-action="encounter-manager-roll-request"/);
    });

    it("lets the GM roll pending encounter requests for a player recipient", () => {
        const combat = planningDraftCombatFixture();
        const request = {
            id: "encounter-combat-1-combatant-combatant-2-action-0-attack",
            combatId: "combat-1",
            combatantId: "combatant-2",
            actionIndex: 0,
            label: "Briggs: Strike",
            rollType: "attack",
            rollSubType: "toHit",
            dice: [{ count: 1, faces: 20 }],
            modifiers: [{ label: "Action bonus", value: 2 }],
            recipientIds: ["player-1"],
            results: {},
            status: "pending",
            isPending: true,
            getFormulaFor: () => "1d20 + 2"
        };

        const model = buildEncounterManagerPanelModel({
            combat,
            rollRequests: [request],
            users: [{ id: "player-1", name: "Ada's Player", isGM: false }]
        });

        assert.equal(model.rollQueue.hasPendingGmRequests, false);
        assert.equal(model.rollQueue.requests[0].hasPendingRecipients, true);

        const html = renderEncounterManagerPanel(model, { escapeHTML });
        assert.match(html, /Briggs: Strike/);
        assert.match(html, /Roll Ada&#39;s Player|Roll Ada's Player/);
        assert.match(html, /data-action="encounter-manager-roll-request"/);
        assert.match(html, /data-recipient-id="player-1"/);
        assert.match(html, /data-action="encounter-manager-auto-roll-gm"\s+disabled/);
    });

    it("refreshes the workspace when draft plans change so the GM can observe composition", () => {
        assert.match(workspaceRootSource, /totcEncounterDraftPlanUpdated/);
        assert.match(workspaceRootSource, /totcEncounterPlanUpdated/);
        assert.match(workspaceRootSource, /totcEncounterRoundNarrativeUpdated/);
        assert.match(workspaceRootSource, /registerFamily\("encounter"/);
    });

    it("starts encounters through the GM feature and opens the Encounter Manager panel", async () => {
        let createdWith = null;
        let initialized = false;
        let managerOpened = false;
        let renderCalled = false;
        const feature = new GamemasterFeature({
            getGame: () => ({ user: { isGM: true }, combats: { active: null }, combat: null }),
            getCanvas: () => ({ scene: { id: "scene-1" }, tokens: { controlled: [] } }),
            getUi: () => ({ notifications: { warn() {}, info() {} } }),
            createCombat: async (data) => {
                createdWith = data;
                return {
                    initializeEncounterRound: async () => { initialized = true; }
                };
            },
            openEncounterManager: async () => { managerOpened = true; },
            render: () => { renderCalled = true; }
        });

        await feature.executeAction("gm-start-encounter");

        assert.deepEqual(createdWith, { scene: "scene-1" });
        assert.equal(initialized, true);
        assert.equal(managerOpened, true);
        assert.equal(renderCalled, true);
    });

    it("executes dynamically rendered GM panel actions through delegated click handling", async () => {
        let deleted = false;
        let renderCalled = false;
        let clickHandler = null;
        const combat = {
            id: "combat-1",
            delete: async () => { deleted = true; }
        };
        const feature = new GamemasterFeature({
            getGame: () => ({ user: { isGM: true }, combats: { active: combat }, combat: null }),
            getCanvas: () => ({ scene: { id: "scene-1" }, tokens: { controlled: [] } }),
            getUi: () => ({ notifications: { warn() {}, info() {} } }),
            render: () => { renderCalled = true; }
        });
        const root = {
            addEventListener: (eventName, handler) => {
                if (eventName === "click") clickHandler = handler;
            },
            removeEventListener: () => {}
        };

        feature.bind(root);
        feature.bind(root);

        const button = {
            dataset: { gmActionId: "gm-end-combat" },
            closest: (selector) => selector === "[data-action='gm-execute-action']" ? button : null
        };
        await clickHandler({
            target: button,
            preventDefault() {},
            stopPropagation() {}
        });

        assert.equal(deleted, true);
        assert.equal(renderCalled, true);
    });
});
