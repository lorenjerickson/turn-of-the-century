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
        }, { subjectName: "Horus", apBudget: 6 });

        assert.equal(narrative.text, "Horus moves 20 feet (2 AP).");
        const destinationPhrase = narrative.phrases.find((phrase) => phrase.decision === "movementDestination");
        assert.equal(destinationPhrase.text, "20 feet");
        assert.equal(destinationPhrase.placeholder, false);
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
        }, { subjectName: "Horus", apBudget: 6 });
        const follow = renderDraftPlanNarrative({
            clauses: [{ actionId: "follow", type: "movement", apCost: 2, requiresTarget: true, targetId: "c2", targetName: "Mallory" }]
        }, { subjectName: "Horus", apBudget: 6 });

        assert.equal(closeWith.text, "Horus closes with Mallory (2 AP).");
        assert.equal(follow.text, "Horus follows Mallory (2 AP).");
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
        }, { subjectName: "Mallory", apBudget: 6 });

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
        }, { subjectName: "Mallory", apBudget: 6 });

        assert.equal(narrative.text, "Mallory levels her galvanic carbine at Horus and fires (2 AP).");
        assert.deepEqual(
            narrative.phrases.map((phrase) => [phrase.decision, phrase.rootDecision]),
            [["action", "action"]]
        );
    });
});
