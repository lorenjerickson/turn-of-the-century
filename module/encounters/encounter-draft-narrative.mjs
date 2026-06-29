import { normalizeDraftPlan } from "./encounter-draft-plan.mjs";

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function text(value, fallback = "") {
    const trimmed = String(value ?? "").trim();
    return trimmed || fallback;
}

function titleName(value = "") {
    return text(value, "The combatant");
}

function lowerActionId(clause = {}) {
    return text(clause.actionId, text(clause.id, "")).toLowerCase();
}

function isTerminalClause(clauses = [], index = 0) {
    return index >= clauses.length - 1;
}

function apLabel(clause = {}) {
    const apCost = clause.apCost;
    if (apCost === null || apCost === undefined) return "";
    return ` (${Math.max(0, Math.floor(toNumber(apCost, 0)))} AP)`;
}

function durationText(clause = {}) {
    const duration = Math.max(0, Math.floor(toNumber(clause.durationAp, toNumber(clause.apCost, 0))));
    if (duration === 1) return "1 second";
    return `${duration} seconds`;
}

function movementDistanceText(clause = {}) {
    const explicitFeet = toNumber(clause.movementFeet, 0);
    const feetPerAp = Math.max(1, toNumber(clause.movementFeetPerAp, 10));
    const apCost = Math.max(0, toNumber(clause.apCost, 0));
    const feet = explicitFeet > 0 ? explicitFeet : feetPerAp * apCost;
    return `${Math.max(0, Math.round(feet))} feet`;
}

function formatTemplate(template = "", context = {}) {
    const raw = text(template);
    if (!raw) return "";
    return raw.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, expression) => {
        const path = String(expression ?? "").trim().split(".");
        const value = path.reduce((current, key) => current?.[key], context);
        return value === null || value === undefined ? "" : String(value);
    }).trim();
}

function phrase({
    clause,
    clauseIndex,
    decision,
    label,
    placeholder = false,
    rootDecision = "",
    editable = true
}) {
    return {
        phraseId: `${clause.clauseId}:${decision}`,
        clauseId: clause.clauseId,
        clauseIndex,
        decision,
        rootDecision: text(rootDecision, decision),
        text: label,
        placeholder: Boolean(placeholder),
        editable: Boolean(editable)
    };
}

function selectedOrPlaceholder({ clause, clauseIndex, decision, selected, placeholder, rootDecision = "" }) {
    const value = text(selected);
    return phrase({
        clause,
        clauseIndex,
        decision,
        rootDecision,
        label: value || `[${placeholder}]`,
        placeholder: !value
    });
}

function renderTemplatedClause(clause, clauseIndex, { actionText = "", itemText = "", targetText = "", duration = "" } = {}) {
    const template = text(clause.narrativeTemplate, text(clause.actionNarrativeTemplate));
    if (!template) return null;

    const rendered = formatTemplate(template, {
        action: clause,
        item: { id: clause.itemId, name: itemText || text(clause.itemName, "the selected item") },
        target: { id: clause.targetId, name: targetText || text(clause.targetName, "the selected target") },
        duration,
        ap: clause.apCost
    });
    if (!rendered) return null;

    return {
        text: `${rendered}${apLabel(clause)}`,
        phrases: [
            phrase({
                clause,
                clauseIndex,
                decision: "action",
                rootDecision: "action",
                label: actionText || rendered
            })
        ]
    };
}

function renderMovementClause(clause, clauseIndex) {
    const actionId = lowerActionId(clause);
    const targetPhrase = selectedOrPlaceholder({
        clause,
        clauseIndex,
        decision: "target",
        selected: clause.targetName,
        placeholder: "select target",
        rootDecision: "target"
    });
    const destinationPhrase = phrase({
        clause,
        clauseIndex,
        decision: "movementDestination",
        rootDecision: "movementDestination",
        label: clause.missingDecisions.includes("movementDestination") ? "[select destination]" : movementDistanceText(clause),
        placeholder: clause.missingDecisions.includes("movementDestination")
    });

    if (actionId === "pursue" || actionId === "closewith" || actionId === "close-with") {
        return {
            text: `closes with ${targetPhrase.text}${apLabel(clause)}`,
            phrases: [
                phrase({ clause, clauseIndex, decision: "action", label: "closes with" }),
                targetPhrase
            ]
        };
    }

    if (actionId === "follow") {
        return {
            text: `follows ${targetPhrase.text}${apLabel(clause)}`,
            phrases: [
                phrase({ clause, clauseIndex, decision: "action", label: "follows" }),
                targetPhrase
            ]
        };
    }

    if (actionId === "avoid" || actionId === "evade") {
        return {
            text: `evades ${targetPhrase.text}${apLabel(clause)}`,
            phrases: [
                phrase({ clause, clauseIndex, decision: "action", label: "evades" }),
                targetPhrase
            ]
        };
    }

    return {
        text: `moves ${destinationPhrase.text}${apLabel(clause)}`,
        phrases: [
            phrase({ clause, clauseIndex, decision: "action", label: "moves" }),
            destinationPhrase
        ]
    };
}

function renderAttackClause(clause, clauseIndex) {
    const targetPhrase = selectedOrPlaceholder({
        clause,
        clauseIndex,
        decision: "target",
        selected: clause.targetName,
        placeholder: "select target"
    });
    const itemPhrase = selectedOrPlaceholder({
        clause,
        clauseIndex,
        decision: "item",
        selected: clause.itemNarrativeText || clause.itemName,
        placeholder: "select item"
    });
    const templated = renderTemplatedClause(clause, clauseIndex, {
        actionText: text(clause.actionNarrativeText, "attacks"),
        itemText: itemPhrase.text,
        targetText: targetPhrase.text
    });
    if (templated) return templated;

    return {
        text: `attacks ${targetPhrase.text} with ${itemPhrase.text}${apLabel(clause)}`,
        phrases: [
            phrase({ clause, clauseIndex, decision: "action", label: text(clause.actionNarrativeText, "attacks") }),
            targetPhrase,
            itemPhrase
        ]
    };
}

function renderOverwatchClause(clause, clauseIndex) {
    const itemPhrase = selectedOrPlaceholder({
        clause,
        clauseIndex,
        decision: "item",
        selected: clause.itemNarrativeText || clause.itemName,
        placeholder: "select item"
    });
    const durationPhrase = phrase({
        clause,
        clauseIndex,
        decision: "duration",
        label: clause.durationAp === null ? "[select duration]" : durationText(clause),
        placeholder: clause.durationAp === null
    });

    return {
        text: `stands alert for threats with ${itemPhrase.text} for ${durationPhrase.text}${apLabel(clause)}`,
        phrases: [
            phrase({ clause, clauseIndex, decision: "action", label: "stands alert for threats" }),
            itemPhrase,
            durationPhrase
        ]
    };
}

function renderWaitClause(clause, clauseIndex, terminal = false) {
    const durationPhrase = phrase({
        clause,
        clauseIndex,
        decision: "duration",
        label: clause.durationAp === null ? "[select duration]" : durationText(clause),
        placeholder: clause.durationAp === null
    });

    if (terminal && clause.durationAp !== null) {
        return {
            text: "waits",
            phrases: [phrase({ clause, clauseIndex, decision: "action", label: "waits" })]
        };
    }

    return {
        text: `waits for ${durationPhrase.text}${apLabel(clause)}`,
        phrases: [
            phrase({ clause, clauseIndex, decision: "action", label: "waits" }),
            durationPhrase
        ]
    };
}

function renderIdleClause(clause, clauseIndex) {
    return {
        text: "waits",
        phrases: [
            phrase({
                clause,
                clauseIndex,
                decision: "action",
                label: "waits",
                editable: false
            })
        ]
    };
}

function renderUtilityClause(clause, clauseIndex) {
    const actionLabel = text(clause.actionNarrativeText, text(clause.label, "acts")).toLowerCase();
    const durationPhrase = clause.requiresDuration
        ? phrase({
            clause,
            clauseIndex,
            decision: "duration",
            label: clause.durationAp === null ? "[select duration]" : durationText(clause),
            placeholder: clause.durationAp === null
        })
        : null;
    const durationSuffix = durationPhrase ? ` for ${durationPhrase.text}` : "";

    return {
        text: `${actionLabel}${durationSuffix}${apLabel(clause)}`,
        phrases: [
            phrase({ clause, clauseIndex, decision: "action", label: actionLabel }),
            ...(durationPhrase ? [durationPhrase] : [])
        ]
    };
}

function renderClause(clause, clauseIndex, clauses) {
    if (!clause.actionId) {
        return {
            text: "[select an action]",
            phrases: [
                phrase({
                    clause,
                    clauseIndex,
                    decision: "action",
                    label: "[select an action]",
                    placeholder: true
                })
            ]
        };
    }

    const actionId = lowerActionId(clause);
    if (actionId === "idle") return renderIdleClause(clause, clauseIndex);
    if (actionId === "wait") return renderWaitClause(clause, clauseIndex, isTerminalClause(clauses, clauseIndex));
    if (actionId === "overwatch") return renderOverwatchClause(clause, clauseIndex);
    if (clause.type === "movement") return renderMovementClause(clause, clauseIndex);
    if (clause.type === "attack" || clause.requiresToHit) return renderAttackClause(clause, clauseIndex);
    return renderUtilityClause(clause, clauseIndex);
}

function joinClauses(subjectName = "", renderedClauses = []) {
    if (!renderedClauses.length) return `${subjectName} [select an action]`;
    const fragments = renderedClauses.map((clause) => clause.text);
    return `${subjectName} ${fragments.join(", then ")}.`;
}

function buildFallbackActionPhrase(draft) {
    const clause = {
        clauseId: "draft-clause-1"
    };
    return phrase({
        clause,
        clauseIndex: 0,
        decision: "action",
        label: "[select an action]",
        placeholder: true
    });
}

export function renderDraftPlanNarrative(draftPlan = {}, { subjectName = "The combatant", apBudget = 6, initialPosition = null } = {}) {
    const draft = normalizeDraftPlan(draftPlan, { apBudget, initialPosition });
    const renderedClauses = draft.clauses.map((clause, index) => renderClause(clause, index, draft.clauses));
    const phrases = renderedClauses.flatMap((clause) => clause.phrases);
    const displayName = titleName(subjectName);
    const textOutput = joinClauses(displayName, renderedClauses);
    const fallbackPhrase = renderedClauses.length ? [] : [buildFallbackActionPhrase(draft)];

    return {
        text: textOutput,
        phrases: [...phrases, ...fallbackPhrase],
        lifecycle: draft.lifecycle,
        apBudget: draft.apBudget,
        spentAp: draft.spentAp,
        remainingAp: draft.remainingAp,
        complete: draft.complete,
        overBudget: draft.overBudget,
        missingDecisions: draft.missingDecisions,
        helpText: draft.lifecycle === "drafting"
            ? `${draft.remainingAp} AP remaining.`
            : ""
    };
}
