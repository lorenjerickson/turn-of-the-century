/**
 * Debug Logging panel — displays totcLogger entries in newest-first order.
 */

const LEVEL_LABELS = { info: "INFO", warn: "WARN", error: "ERR ", debug: "DBG " };

export function buildLoggingPanelModel({ entries = [] } = {}) {
    return { entries: Array.isArray(entries) ? entries : [] };
}

export function renderLoggingPanel(model = {}, { escapeHTML = (v) => String(v ?? "") } = {}) {
    const entries = Array.isArray(model.entries) ? model.entries : [];

    const rows = entries.length
        ? entries.map((e) => {
            const label = LEVEL_LABELS[e.level] ?? e.level.toUpperCase().slice(0, 4).padEnd(4, " ");
            let dataHTML = "";
            if (e.data !== null && e.data !== undefined) {
                try {
                    dataHTML = `<details class="totc-v2-logging-panel__data">
                        <summary>data</summary>
                        <pre class="totc-v2-logging-panel__pre">${escapeHTML(JSON.stringify(e.data, null, 2))}</pre>
                    </details>`;
                } catch { /* non-serialisable */ }
            }
            return `<div class="totc-v2-logging-panel__entry is-${escapeHTML(e.level)}">
                <span class="totc-v2-logging-panel__ts">${escapeHTML(e.ts)}</span>
                <span class="totc-v2-logging-panel__level">${escapeHTML(label)}</span>
                <span class="totc-v2-logging-panel__msg">${escapeHTML(e.message)}</span>
                ${dataHTML}
            </div>`;
        }).join("")
        : `<div class="totc-v2-logging-panel__empty">No log entries yet. Trigger scene operations to see debug output here.</div>`;

    return `
    <section class="totc-v2-logging-panel">
        <header class="totc-v2-logging-panel__toolbar">
            <span class="totc-v2-logging-panel__count">${escapeHTML(String(entries.length))} entries</span>
            <button type="button" class="totc-v2-logging-panel__clear-btn" data-action="logging-clear">Clear</button>
        </header>
        <div class="totc-v2-logging-panel__list">
            ${rows}
        </div>
    </section>`;
}
