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

    it("preserves location positioning and door effects for planned Open actions", () => {
        const action = draftClauseToResolutionAction({
            actionId: "open",
            id: "open",
            type: "utility",
            label: "Open",
            apCost: 3,
            positioningAp: 2,
            effectAp: 1,
            requiresPositioning: true,
            positioningRequirement: { type: "adjacent", targetKind: "location", rangeFeet: 5 },
            targetX: 300,
            targetY: 50,
            doorId: "door-1",
            doorOpenedDuringPlanning: true,
            effects: [{ type: "door", operation: "open", target: "custom", doorId: "door-1" }]
        });

        assert.equal(action.actionId, "open");
        assert.equal(action.apEnvelope.positioningAp, 2);
        assert.equal(action.apEnvelope.effectAp, 1);
        assert.deepEqual(action.positioningRequirement, { type: "adjacent", targetKind: "location", rangeFeet: 5 });
        assert.equal(action.targetX, 300);
        assert.equal(action.targetY, 50);
        assert.equal(action.effects[0].type, "door");
    });

    it("requires and converts Close and Engage follow-up actions with AP and range semantics", () => {
        const incomplete = normalizeDraftPlan({
            clauses: [{
                actionId: "pursue",
                type: "movement",
                label: "Close and Engage",
                apCost: 6,
                requiresTarget: true,
                targetId: "target-1",
                requiresEngagementAction: true
            }]
        }, { apBudget: 6 });

        assert.deepEqual(incomplete.missingDecisions, [{ clauseId: "draft-clause-1", decision: "engagementAction" }]);

        const [action] = draftPlanToResolutionActions({
            clauses: [{
                actionId: "pursue",
                type: "movement",
                label: "Close and Engage",
                apCost: 6,
                apMin: 1,
                apMax: 6,
                requiresTarget: true,
                targetId: "target-1",
                targetName: "Mallory",
                requiresEngagementAction: true,
                engageActionId: "precisionStrike",
                engageActionType: "attack",
                engageActionLabel: "Precision Strike",
                engageActionAp: 2,
                engageRequiresToHit: true,
                engageRequiresItem: true,
                itemId: "scalpel",
                itemName: "surgical scalpel",
                engageTargetingRangeFeet: 5,
                engageRangeType: "melee",
                rollRequirements: [
                    { rollType: "attack", rollSubType: "toHit" },
                    { rollType: "attack", rollSubType: "damage" }
                ],
                positioningAp: 4,
                movementFeetPerAp: 10
            }]
        }, { apBudget: 6 });

        assert.equal(action.actionId, "precisionStrike");
        assert.equal(action.narrativeActionId, "pursue");
        assert.equal(action.type, "attack");
        assert.equal(action.apCost, 6);
        assert.equal(action.itemId, "scalpel");
        assert.equal(action.targetId, "target-1");
        assert.equal(action.requiresToHit, true);
        assert.deepEqual(action.rollRequirements, [
            { rollType: "attack", rollSubType: "toHit" },
            { rollType: "attack", rollSubType: "damage" }
        ]);
        assert.deepEqual(action.apEnvelope, { positioningAp: 4, effectAp: 2, maxAp: 6 });
        assert.equal(action.positioningRequirement.type, "weaponRange");
        assert.equal(action.positioningRequirement.rangeFeet, 5);
        assert.equal(action.failureOutcome.type, "bestReachablePosition");
    });

    it("converts targeted actions with approach AP into implied positioning orders", () => {
        const incomplete = normalizeDraftPlan({
            clauses: [{
                actionId: "precisionStrike",
                type: "attack",
                label: "Precision Strike",
                apCost: 2,
                effectAp: 2,
                positioningAp: null,
                maxPositioningAp: 4,
                requiresTarget: true,
                requiresPositioning: true,
                targetId: "target-1",
                targetName: "Mallory",
                requiresToHit: true,
                itemId: "scalpel",
                targetingRangeFeet: 5,
                rangeType: "melee"
            }]
        }, { apBudget: 6 });

        assert.deepEqual(incomplete.missingDecisions, [{ clauseId: "draft-clause-1", decision: "positioning" }]);

        const [action] = draftPlanToResolutionActions({
            clauses: [{
                actionId: "precisionStrike",
                type: "attack",
                label: "Precision Strike",
                apCost: 5,
                effectAp: 2,
                positioningAp: 3,
                requiresTarget: true,
                requiresPositioning: true,
                targetId: "target-1",
                targetName: "Mallory",
                requiresToHit: true,
                itemId: "scalpel",
                targetingRangeFeet: 5,
                rangeType: "melee"
            }]
        }, { apBudget: 6 });

        assert.equal(action.actionId, "precisionStrike");
        assert.equal(action.type, "attack");
        assert.equal(action.apCost, 5);
        assert.deepEqual(action.apEnvelope, { positioningAp: 3, effectAp: 2, maxAp: 5 });
        assert.equal(action.positioningRequirement.type, "weaponRange");
        assert.equal(action.positioningRequirement.rangeFeet, 5);
        assert.equal(action.followThrough.type, "hold");
        assert.equal(action.failureOutcome.type, "bestReachablePosition");
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
