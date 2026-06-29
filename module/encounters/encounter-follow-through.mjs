function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function text(value, fallback = "") {
    const trimmed = String(value ?? "").trim();
    return trimmed || fallback;
}

export function remainingFollowThroughAp(action = {}, { spentAp = 0, roundRemainingAp = 0 } = {}) {
    const maxAp = Math.max(1, Math.floor(toNumber(action.apEnvelope?.maxAp, action.apCost ?? 1)));
    const spent = Math.max(1, Math.floor(toNumber(spentAp, 1)));
    const remainingInEnvelope = Math.max(0, maxAp - spent);
    const remainingInRound = Math.max(0, Math.floor(toNumber(roundRemainingAp, 0)));
    return Math.min(remainingInEnvelope, remainingInRound);
}

export function buildFollowThroughAction(action = {}, { remainingAp = 0 } = {}) {
    const apCost = Math.max(0, Math.floor(toNumber(remainingAp, 0)));
    if (apCost <= 0) return null;

    const followThroughType = text(action.followThrough?.type, "hold").toLowerCase();
    if (followThroughType === "chooseanotheraction") return null;

    const orderId = text(action.orderId, text(action.id, "order"));
    const sourceAction = {
        id: action.id,
        actionId: action.actionId,
        type: action.type,
        label: action.label
    };

    if (followThroughType === "overwatch") {
        return {
            id: `${orderId}:followThrough:overwatch`,
            actionId: "overwatch",
            type: "defense",
            label: "Overwatch",
            apCost,
            apMin: 1,
            apMax: apCost,
            variableAp: apCost > 1,
            interruptible: false,
            isReaction: true,
            reactionTriggerType: "overwatch",
            followThroughSourceOrderId: orderId,
            sourceAction
        };
    }

    if (["hold", "holdposition"].includes(followThroughType)) {
        return {
            id: `${orderId}:followThrough:hold`,
            actionId: "holdPosition",
            type: "defense",
            label: "Hold Position",
            apCost,
            apMin: 1,
            apMax: apCost,
            variableAp: apCost > 1,
            interruptible: false,
            isReaction: false,
            reactionTriggerType: "",
            followThroughSourceOrderId: orderId,
            sourceAction
        };
    }

    return null;
}
