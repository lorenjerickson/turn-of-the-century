import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { confirmDraftPlan, normalizeDraftPlan } from "../../module/encounters/encounter-draft-plan.mjs";
import { renderDraftPlanNarrative } from "../../module/encounters/encounter-draft-narrative.mjs";

describe("encounter draft narrative renderer", () => {
    it("renders an empty draft as a selectable action placeholder", () => {
        const narrative = renderDraftPlanNarrative({ clauses: [] }, { subjectName: "Horus", apBudget: 6 });

        assert.equal(narrative.text, "Horus [select an action]");
        assert.equal(narrative.remainingAp, 6);
        assert.equal(narrative.helpText, "6 AP remaining.");
        assert.equal(narrative.phrases.length, 1);
        assert.equal(narrative.phrases[0].decision, "action");
        assert.equal(narrative.phrases[0].placeholder, true);
    });

    it("renders incomplete attack clauses with discrete clickable placeholders", () => {
        const narrative = renderDraftPlanNarrative({
            clauses: [{
                actionId: "attack",
                type: "attack",
                label: "Attack",
                apCost: 2,
                requiresTarget: true,
                requiresItem: true
            }]
        }, { subjectName: "Mallory", apBudget: 6 });

        assert.equal(narrative.text, "Mallory attacks [select target] with [select item] (2 AP).");
        assert.deepEqual(
            narrative.phrases.map((phrase) => [phrase.decision, phrase.text, phrase.placeholder]),
            [
                ["action", "attacks", false],
                ["target", "[select target]", true],
                ["item", "[select item]", true]
            ]
        );
        assert.deepEqual(narrative.missingDecisions, [
            { clauseId: "draft-clause-1", decision: "target" },
            { clauseId: "draft-clause-1", decision: "item" }
        ]);
    });

    it("renders move clauses as distance while keeping destination phrase metadata", () => {
        const narrative = renderDraftPlanNarrative({
            clauses: [{
                actionId: "move",
                type: "movement",
                label: "Move",
                apCost: 2,
                movementFeetPerAp: 10,
                requiresMovementDestination: true,
                movementTargetX: 200,
                movementTargetY: 0
            }]
        }, { subjectName: "Horus", apBudget: 2 });

        assert.equal(narrative.text, "Horus moves 20 feet (2 AP).");
        const destinationPhrase = narrative.phrases.find((phrase) => phrase.decision === "movementDestination");
        assert.equal(destinationPhrase.text, "20 feet");
        assert.equal(destinationPhrase.placeholder, false);
    });

    it("adds a follow-on action prompt when a complete draft action leaves AP unspent", () => {
        const narrative = renderDraftPlanNarrative({
            clauses: [{
                actionId: "move",
                type: "movement",
                label: "Move",
                apCost: 2,
                movementFeetPerAp: 10,
                requiresMovementDestination: true,
                movementTargetX: 200,
                movementTargetY: 0
            }]
        }, { subjectName: "Horus", apBudget: 6 });

        assert.equal(narrative.text, "Horus moves 20 feet (2 AP), then [select action].");
        const actionPrompt = narrative.phrases.at(-1);
        assert.equal(actionPrompt.decision, "action");
        assert.equal(actionPrompt.clauseIndex, 1);
        assert.equal(actionPrompt.text, "[select action]");
        assert.equal(actionPrompt.placeholder, true);
    });

    it("renders missing move destinations as placeholders", () => {
        const narrative = renderDraftPlanNarrative({
            clauses: [{
                actionId: "move",
                type: "movement",
                label: "Move",
                apCost: 2,
                requiresMovementDestination: true
            }]
        }, { subjectName: "Horus", apBudget: 6 });

        assert.equal(narrative.text, "Horus moves [select destination] (2 AP).");
        const destinationPhrase = narrative.phrases.find((phrase) => phrase.decision === "movementDestination");
        assert.equal(destinationPhrase.placeholder, true);
    });

    it("renders pursuit intent as Close With while keeping Follow distinct", () => {
        const closeWith = renderDraftPlanNarrative({
            clauses: [{ actionId: "pursue", type: "movement", apCost: 2, requiresTarget: true, targetId: "c2", targetName: "Mallory" }]
        }, { subjectName: "Horus", apBudget: 2 });
        const follow = renderDraftPlanNarrative({
            clauses: [{ actionId: "follow", type: "movement", apCost: 2, requiresTarget: true, targetId: "c2", targetName: "Mallory" }]
        }, { subjectName: "Horus", apBudget: 2 });

        assert.equal(closeWith.text, "Horus closes with Mallory (2 AP).");
        assert.equal(follow.text, "Horus follows Mallory (2 AP).");
    });

    it("renders Close and Engage as a composite target plus engagement action", () => {
        const pending = renderDraftPlanNarrative({
            clauses: [{
                actionId: "pursue",
                type: "movement",
                label: "Close and Engage",
                apCost: 6,
                requiresTarget: true,
                requiresEngagementAction: true
            }]
        }, { subjectName: "Horus", apBudget: 6 });

        assert.equal(pending.text, "Horus closes with [select target] and [select action].");
        assert.deepEqual(pending.missingDecisions, [
            { clauseId: "draft-clause-1", decision: "target" },
            { clauseId: "draft-clause-1", decision: "engagementAction" }
        ]);

        const complete = renderDraftPlanNarrative({
            clauses: [{
                actionId: "pursue",
                type: "movement",
                label: "Close and Engage",
                apCost: 6,
                requiresTarget: true,
                requiresEngagementAction: true,
                targetId: "c2",
                targetName: "Mallory",
                engageActionId: "precisionStrike",
                engageActionType: "attack",
                engageActionLabel: "Precision Strike",
                engageActionNarrativeText: "slashes precisely",
                engageActionAp: 2,
                positioningAp: 4,
                requiresItem: true,
                itemId: "scalpel",
                itemName: "surgical scalpel"
            }]
        }, { subjectName: "Horus", apBudget: 6 });

        assert.equal(complete.text, "Horus closes with Mallory (4 AP) and slashes precisely (2 AP) with surgical scalpel.");
    });

    it("renders duration prompts for target movement intents that require a duration", () => {
        const follow = renderDraftPlanNarrative({
            clauses: [{ actionId: "follow", type: "movement", apCost: 2, requiresTarget: true, targetId: "c2", targetName: "Mallory", requiresDuration: true }]
        }, { subjectName: "Horus", apBudget: 6 });
        const evade = renderDraftPlanNarrative({
            clauses: [{ actionId: "evade", type: "movement", apCost: 3, requiresTarget: true, targetId: "c2", targetName: "Mallory", requiresDuration: true, durationAp: 3 }]
        }, { subjectName: "Horus", apBudget: 6 });

        assert.equal(follow.text, "Horus follows Mallory for [select duration] (2 AP).");
        assert.deepEqual(follow.missingDecisions, [{ clauseId: "draft-clause-1", decision: "duration" }]);
        assert.equal(follow.phrases.find((phrase) => phrase.decision === "duration")?.placeholder, true);
        assert.equal(evade.text, "Horus evades Mallory for 3 seconds (3 AP), then [select action].");
    });

    it("renders duration prompts for defensive duration actions", () => {
        const narrative = renderDraftPlanNarrative({
            clauses: [
                { actionId: "dodge", type: "defense", label: "Dodge", apCost: 1, requiresDuration: true },
                { actionId: "hunkDown", type: "defense", label: "Hunker Down", apCost: 2, requiresDuration: true, durationAp: 2 }
            ]
        }, { subjectName: "Mallory", apBudget: 6 });

        assert.equal(narrative.text, "Mallory dodges for [select duration] (1 AP), then hunkers down for 2 seconds (2 AP).");
        assert.deepEqual(narrative.missingDecisions, [{ clauseId: "draft-clause-1", decision: "duration" }]);
    });

    it("renders overwatch with item before duration", () => {
        const narrative = renderDraftPlanNarrative({
            clauses: [{
                actionId: "overwatch",
                type: "defense",
                label: "Overwatch",
                apCost: 3,
                requiresItem: true,
                requiresDuration: true,
                itemId: "stun-baton",
                itemName: "her stun baton",
                durationAp: 3
            }]
        }, { subjectName: "Mallory", apBudget: 3 });

        assert.equal(narrative.text, "Mallory stands alert for threats with her stun baton for 3 seconds (3 AP).");
    });

    it("keeps nonterminal Wait duration visible and terminal Wait clean", () => {
        const narrative = renderDraftPlanNarrative({
            clauses: [
                { actionId: "wait", type: "utility", label: "Wait", apCost: 2, requiresDuration: true, durationAp: 2 },
                { actionId: "attack", type: "attack", label: "Attack", apCost: 2, requiresTarget: true, targetId: "c2", targetName: "Mallory", itemId: "knife", itemName: "his knife" },
                { actionId: "wait", type: "utility", label: "Wait", apCost: 2, requiresDuration: true, durationAp: 2 }
            ]
        }, { subjectName: "Horus", apBudget: 6 });

        assert.equal(narrative.text, "Horus waits for 2 seconds (2 AP), then attacks Mallory with his knife (2 AP), then waits.");
    });

    it("renders confirmed automatic Idle as terminal waiting without AP text", () => {
        const confirmed = confirmDraftPlan(normalizeDraftPlan({
            clauses: [{ actionId: "attack", type: "attack", apCost: 2, requiresTarget: true, targetId: "c2", targetName: "Mallory", itemId: "knife", itemName: "his knife" }]
        }, { apBudget: 6 }));

        const narrative = renderDraftPlanNarrative(confirmed, { subjectName: "Horus", apBudget: 6 });

        assert.equal(narrative.text, "Horus attacks Mallory with his knife (2 AP), then waits.");
        const idlePhrase = narrative.phrases.find((phrase) => phrase.clauseId === "draft-clause-2");
        assert.equal(idlePhrase.editable, false);
    });

    it("uses action and item narrative templates while mapping the phrase to the root action decision", () => {
        const narrative = renderDraftPlanNarrative({
            clauses: [{
                actionId: "attack",
                type: "attack",
                label: "Attack",
                apCost: 2,
                requiresTarget: true,
                requiresItem: true,
                targetId: "c1",
                targetName: "Horus",
                itemId: "galvanic-carbine",
                itemName: "galvanic carbine",
                itemNarrativeText: "her galvanic carbine",
                narrativeTemplate: "levels {{ item.name }} at {{ target.name }} and fires"
            }]
        }, { subjectName: "Mallory", apBudget: 2 });

        assert.equal(narrative.text, "Mallory levels her galvanic carbine at Horus and fires (2 AP).");
        assert.deepEqual(
            narrative.phrases.map((phrase) => [phrase.decision, phrase.rootDecision]),
            [["action", "action"]]
        );
    });
});
