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

export function buildDiceRollFeedPanelModel({ messages = [], limit = DEFAULT_LIMIT } = {}) {
    const normalizedLimit = Math.max(1, Number(limit) || DEFAULT_LIMIT);
    const entries = Array.from(messages ?? [])
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
        .filter((entry) => entry.hasRoll || entry.flavor)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, normalizedLimit);

    return {
        entries,
        rollCount: entries.filter((entry) => entry.hasRoll).length,
        messageCount: entries.length
    };
}

export function renderDiceRollFeedPanel(panelModel = {}, { escapeHTML = (value) => String(value ?? "") } = {}) {
    const entries = Array.isArray(panelModel.entries) ? panelModel.entries : [];
    const summary = `${Number(panelModel.rollCount ?? 0)} roll${panelModel.rollCount === 1 ? "" : "s"} from ${entries.length} recent message${entries.length === 1 ? "" : "s"}`;

    return `
    <section class="totc-v2-roll-feed-panel">
        <header class="totc-v2-roll-feed-panel__summary">
            <span>${escapeHTML(summary)}</span>
        </header>
        <div class="totc-v2-roll-feed-panel__list" role="list">
            ${entries.length ? entries.map((entry) => {
                const rollsMarkup = entry.rolls.map((roll) => `
                    <span class="totc-v2-roll-feed-panel__roll">
                        ${roll.formula ? `<span class="totc-v2-roll-feed-panel__formula">${escapeHTML(roll.formula)}</span>` : ""}
                        ${roll.total !== null ? `<strong class="totc-v2-roll-feed-panel__total">${escapeHTML(roll.total)}</strong>` : ""}
                    </span>`).join("");
                return `
                <article class="totc-v2-roll-feed-panel__entry ${entry.hasRoll ? "totc-v2-roll-feed-panel__entry--roll" : ""}" role="listitem">
                    <div class="totc-v2-roll-feed-panel__entry-header">
                        <span class="totc-v2-roll-feed-panel__speaker">${escapeHTML(entry.speaker)}</span>
                        ${entry.user ? `<span class="totc-v2-roll-feed-panel__user">${escapeHTML(entry.user)}</span>` : ""}
                    </div>
                    ${entry.flavor ? `<p class="totc-v2-roll-feed-panel__flavor">${escapeHTML(entry.flavor)}</p>` : ""}
                    ${rollsMarkup ? `<div class="totc-v2-roll-feed-panel__rolls">${rollsMarkup}</div>` : ""}
                </article>`;
            }).join("") : `<div class="totc-v2-roll-feed-panel__empty">No recent rolls to display.</div>`}
        </div>
    </section>`;
}
