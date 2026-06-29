import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    confirmDraftPlan,
    createEmptyDraftPlan,
    draftClauseToResolutionAction,
    draftClauseChangeAffectsDownstream,
    draftPlanToResolutionActions,
    normalizeDraftClause,
    normalizeDraftPlan,
    replaceDraftClause,
    truncateDraftPlan
} from "../../module/encounters/encounter-draft-plan.mjs";

describe("encounter draft plan model", () => {
    it("creates an empty drafting plan with AP context", () => {
        const draft = createEmptyDraftPlan({ apBudget: 6, initialPosition: { x: 100, y: 200 } });

        assert.equal(draft.lifecycle, "drafting");
        assert.equal(draft.apBudget, 6);
        assert.equal(draft.spentAp, 0);
        assert.equal(draft.remainingAp, 6);
        assert.equal(draft.complete, false);
        assert.deepEqual(draft.projectedPosition, { x: 100, y: 200 });
    });

    it("represents incomplete placeholders without treating them as confirmed actions", () => {
        const clause = normalizeDraftClause({
            requiresTarget: true,
            narrativeTokens: [{ decision: "action" }]
        });

        assert.equal(clause.actionId, "");
        assert.equal(clause.type, "placeholder");
        assert.equal(clause.complete, false);
        assert.deepEqual(clause.missingDecisions, ["action", "target"]);
        assert.equal(clause.narrativeTokens[0].tokenId, "token-1");
    });

    it("tracks spent AP, remaining AP, missing requirements, and over-budget state", () => {
        const draft = normalizeDraftPlan({
            clauses: [
                { actionId: "move", type: "movement", label: "Move", apCost: 2, requiresMovementDestination: true, movementTargetX: 200, movementTargetY: 100 },
                { actionId: "attack", type: "attack", label: "Attack", apCost: 3, requiresTarget: true }
            ]
        }, {
            apBudget: 4,
            initialPosition: { x: 0, y: 0 }
        });

        assert.equal(draft.spentAp, 5);
        assert.equal(draft.remainingAp, 0);
        assert.equal(draft.overBudget, true);
        assert.equal(draft.complete, false);
        assert.deepEqual(draft.projectedPosition, { x: 200, y: 100 });
        assert.deepEqual(draft.missingDecisions, [{ clauseId: "draft-clause-2", decision: "target" }]);
    });

    it("uses projected movement positions as the origin for following clauses", () => {
        const draft = normalizeDraftPlan({
            clauses: [
                { actionId: "move", type: "movement", apCost: 1, requiresMovementDestination: true, movementTargetX: 100, movementTargetY: 0 },
                { actionId: "move", type: "movement", apCost: 1, requiresMovementDestination: true, movementTargetX: 200, movementTargetY: 0 }
            ]
        }, {
            apBudget: 6,
            initialPosition: { x: 0, y: 0 }
        });

        assert.deepEqual(draft.clauses[0].projectedOrigin, { x: 0, y: 0 });
        assert.deepEqual(draft.clauses[1].projectedOrigin, { x: 100, y: 0 });
        assert.deepEqual(draft.projectedPosition, { x: 200, y: 0 });
    });

    it("detects downstream-affecting changes while allowing compatible target changes", () => {
        const previousAttack = { actionId: "attack", type: "attack", apCost: 2, requiresTarget: true, targetId: "c1" };
        const retargetedAttack = { ...previousAttack, targetId: "c2" };
        const moreExpensiveAttack = { ...previousAttack, apCost: 3 };

        assert.equal(draftClauseChangeAffectsDownstream(previousAttack, retargetedAttack), false);
        assert.equal(draftClauseChangeAffectsDownstream(previousAttack, moreExpensiveAttack), true);
    });

    it("preserves downstream clauses for compatible edits and truncates for AP-affecting edits", () => {
        const draft = normalizeDraftPlan({
            clauses: [
                { actionId: "attack", type: "attack", apCost: 2, requiresTarget: true, targetId: "c1" },
                { actionId: "wait", type: "utility", apCost: 2, requiresDuration: true, durationAp: 2 }
            ]
        }, { apBudget: 6 });

        const retargeted = replaceDraftClause(draft, 0, {
            actionId: "attack",
            type: "attack",
            apCost: 2,
            requiresTarget: true,
            targetId: "c2"
        });
        assert.equal(retargeted.clauses.length, 2);

        const repriced = replaceDraftClause(draft, 0, {
            actionId: "attack",
            type: "attack",
            apCost: 3,
            requiresTarget: true,
            targetId: "c1"
        });
        assert.equal(repriced.clauses.length, 1);
    });

    it("truncates a draft after the selected clause", () => {
        const draft = normalizeDraftPlan({
            clauses: [
                { actionId: "move", type: "movement", apCost: 1 },
                { actionId: "attack", type: "attack", apCost: 2 },
                { actionId: "wait", type: "utility", apCost: 1, requiresDuration: true, durationAp: 1 }
            ]
        }, { apBudget: 6 });

        const truncated = truncateDraftPlan(draft, 1);
        assert.deepEqual(truncated.clauses.map((clause) => clause.actionId), ["move", "attack"]);
    });

    it("confirms complete drafts and inserts automatic Idle for unused AP", () => {
        const confirmed = confirmDraftPlan(normalizeDraftPlan({
            clauses: [
                { actionId: "wait", type: "utility", label: "Wait", apCost: 2, requiresDuration: true, durationAp: 2 }
            ]
        }, { apBudget: 6 }));

        assert.equal(confirmed.lifecycle, "confirmedAwaitingRolls");
        assert.deepEqual(confirmed.clauses.map((clause) => clause.actionId), ["wait", "idle"]);
        assert.equal(confirmed.clauses[1].apCost, 4);
        assert.equal(confirmed.clauses[1].automatic, true);
    });

    it("rejects confirmation when required decisions are missing", () => {
        const draft = normalizeDraftPlan({
            clauses: [{ actionId: "wait", type: "utility", apCost: 2, requiresDuration: true }]
        }, { apBudget: 6 });

        assert.throws(() => confirmDraftPlan(draft), /cannot be confirmed/);
    });

    it("converts Close With and Evade draft clauses to legacy resolver movement ids", () => {
        const closeWith = draftClauseToResolutionAction({
            actionId: "closeWith",
            type: "movement",
            label: "Close With",
            apCost: 2,
            targetId: "target-1",
            targetName: "Horus",
            movementFeetPerAp: 10
        });
        const evade = draftClauseToResolutionAction({
            actionId: "evade",
            type: "movement",
            label: "Evade",
            apCost: 1,
            targetId: "target-1",
            targetName: "Horus",
            movementFeetPerAp: 10
        });

        assert.equal(closeWith.id, "pursue");
        assert.equal(closeWith.actionId, "pursue");
        assert.equal(closeWith.narrativeActionId, "closeWith");
        assert.equal(closeWith.label, "Close With");
        assert.equal(closeWith.targetId, "target-1");
        assert.equal(evade.id, "avoid");
        assert.equal(evade.actionId, "avoid");
        assert.equal(evade.narrativeActionId, "evade");
        assert.equal(evade.label, "Evade");
    });

    it("preserves movement origin and destination data for resolution actions", () => {
        const actions = draftPlanToResolutionActions({
            clauses: [
                {
                    actionId: "move",
                    type: "movement",
                    label: "Move",
                    apCost: 2,
                    movementFeetPerAp: 10,
                    requiresMovementDestination: true,
                    movementTargetX: 100,
                    movementTargetY: 0
                },
                {
                    actionId: "move",
                    type: "movement",
                    label: "Move",
                    apCost: 1,
                    movementFeetPerAp: 10,
                    requiresMovementDestination: true,
                    movementTargetX: 200,
                    movementTargetY: 0
                }
            ]
        }, {
            apBudget: 6,
            initialPosition: { x: 0, y: 0 }
        });

        assert.equal(actions[0].movementOriginX, 0);
        assert.equal(actions[0].movementOriginY, 0);
        assert.equal(actions[0].movementDestinationX, 100);
        assert.equal(actions[0].movementDestinationY, 0);
        assert.equal(actions[0].movementFeet, 20);
        assert.equal(actions[1].movementOriginX, 100);
        assert.equal(actions[1].movementOriginY, 0);
        assert.equal(actions[1].movementDestinationX, 200);
    });

    it("keeps deliberate Wait and automatic Idle as separate resolution actions", () => {
        const confirmed = confirmDraftPlan(normalizeDraftPlan({
            clauses: [
                { actionId: "wait", type: "utility", label: "Wait", apCost: 2, requiresDuration: true, durationAp: 2 }
            ]
        }, { apBudget: 6 }));

        const actions = draftPlanToResolutionActions(confirmed, { apBudget: 6 });

        assert.deepEqual(actions.map((action) => action.actionId), ["wait", "idle"]);
        assert.equal(actions[0].durationAp, 2);
        assert.equal(actions[0].automatic, false);
        assert.equal(actions[1].apCost, 4);
        assert.equal(actions[1].automatic, true);
    });
});
