const DEFAULT_LIMIT = 20;

function stripHtml(value) {
    return String(value ?? "")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function getMessageTimestamp(message) {
    const timestamp = Number(message?.timestamp ?? message?.createdTime ?? message?._stats?.createdTime ?? 0);
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function getMessageRolls(message) {
    if (Array.isArray(message?.rolls)) return message.rolls;
    if (message?.roll) return [message.roll];
    return [];
}

function getRollFormula(roll) {
    return String(roll?.formula ?? roll?._formula ?? "").trim();
}

function getRollTotal(roll) {
    const total = Number(roll?.total);
    return Number.isFinite(total) ? total : null;
}

function getSpeakerName(message) {
    return String(
        message?.speaker?.alias
        ?? message?.alias
        ?? message?.author?.name
        ?? "Unknown Speaker"
    ).trim();
}

function getMessageUserName(message) {
    return String(message?.author?.name ?? "").trim();
}

function getRequestTimestamp(request) {
    return Number(request?.resolvedAt ?? request?.updatedAt ?? request?.timestamp ?? 0) || 0;
}

function normalizeRequestEntry(request, { users = [] } = {}) {
    const userName = (userId) => users.find((user) => user.id === userId)?.name || userId;
    const results = Object.entries(request.results ?? {});
    const resultRolls = results.map(([userId, result]) => ({
        formula: String(result?.formula ?? request.getFormulaFor?.(userId) ?? "").trim(),
        total: Number.isFinite(Number(result?.total)) ? Number(result.total) : null,
        userId,
        userName: userName(userId),
        dice: result?.dice ?? [],
        adjustment: Number(result?.adjustment ?? request.adjustments?.[userId]?.value ?? 0) || 0
    }));

    return {
        id: request.id,
        speaker: request.requestor?.name ?? request.initiatorId ?? "System",
        user: request.recipientIds?.map(userName).join(", ") ?? "",
        timestamp: getRequestTimestamp(request),
        flavor: request.label,
        rolls: resultRolls,
        status: request.status,
        hasRoll: resultRolls.length > 0,
        activeRequest: request.isPending,
        request
    };
}

export function buildDiceRollFeedPanelModel({ messages = [], rollRequests = [], users = [], limit = DEFAULT_LIMIT } = {}) {
    const normalizedLimit = Math.max(1, Number(limit) || DEFAULT_LIMIT);
    const messageEntries = Array.from(messages ?? [])
        .map((message) => {
            const rolls = getMessageRolls(message)
                .map((roll) => ({
                    formula: getRollFormula(roll),
                    total: getRollTotal(roll)
                }))
                .filter((roll) => roll.formula || roll.total !== null);
            const contentText = stripHtml(message?.flavor || message?.content || "");

            return {
                id: String(message?.id ?? message?._id ?? ""),
                speaker: getSpeakerName(message),
                user: getMessageUserName(message),
                timestamp: getMessageTimestamp(message),
                flavor: contentText,
                rolls,
                hasRoll: rolls.length > 0
            };
        })
        .filter((entry) => entry.hasRoll || entry.flavor);
    const requestEntries = Array.from(rollRequests ?? [])
        .filter((request) => request?.status !== "cancelled")
        .map((request) => normalizeRequestEntry(request, { users }));
    const entries = [...messageEntries, ...requestEntries]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, normalizedLimit);

    return {
        entries,
        rollCount: entries.filter((entry) => entry.hasRoll).length,
        activeRequestCount: entries.filter((entry) => entry.activeRequest).length,
        messageCount: entries.length
    };
}

export function renderDiceRollFeedPanel(panelModel = {}, { escapeHTML = (value) => String(value ?? "") } = {}) {
    const entries = Array.isArray(panelModel.entries) ? panelModel.entries : [];
    const activeCount = Number(panelModel.activeRequestCount ?? 0);
    const summary = `${Number(panelModel.rollCount ?? 0)} roll${panelModel.rollCount === 1 ? "" : "s"}${activeCount ? `, ${activeCount} active request${activeCount === 1 ? "" : "s"}` : ""}`;

    return `
    <section class="totc-v2-roll-feed-panel">
        <header class="totc-v2-roll-feed-panel__summary">
            <span>${escapeHTML(summary)}</span>
        </header>
        <div class="totc-v2-roll-feed-panel__list" role="list">
            ${entries.length ? entries.map((entry) => {
                const rollsMarkup = entry.rolls.map((roll) => `
                    <span class="totc-v2-roll-feed-panel__roll">
                        ${roll.userName ? `<span class="totc-v2-roll-feed-panel__user">${escapeHTML(roll.userName)}</span>` : ""}
                        ${roll.formula ? `<span class="totc-v2-roll-feed-panel__formula">${escapeHTML(roll.formula)}</span>` : ""}
                        ${roll.total !== null ? `<strong class="totc-v2-roll-feed-panel__total">${escapeHTML(roll.total)}</strong>` : ""}
                        ${roll.adjustment ? `<span class="totc-v2-roll-feed-panel__formula">player ${roll.adjustment > 0 ? "+" : ""}${escapeHTML(roll.adjustment)}</span>` : ""}
                    </span>`).join("");
                return `
                <article class="totc-v2-roll-feed-panel__entry ${entry.hasRoll ? "totc-v2-roll-feed-panel__entry--roll" : ""}" role="listitem">
                    <div class="totc-v2-roll-feed-panel__entry-header">
                        <span class="totc-v2-roll-feed-panel__speaker">${escapeHTML(entry.speaker)}</span>
                        ${entry.user ? `<span class="totc-v2-roll-feed-panel__user">${escapeHTML(entry.user)}</span>` : ""}
                        ${entry.status ? `<span class="totc-v2-roll-feed-panel__user">${escapeHTML(entry.status)}</span>` : ""}
                    </div>
                    ${entry.flavor ? `<p class="totc-v2-roll-feed-panel__flavor">${escapeHTML(entry.flavor)}</p>` : ""}
                    ${rollsMarkup ? `<div class="totc-v2-roll-feed-panel__rolls">${rollsMarkup}</div>` : ""}
                </article>`;
            }).join("") : `<div class="totc-v2-roll-feed-panel__empty">No recent rolls to display.</div>`}
        </div>
    </section>`;
}
