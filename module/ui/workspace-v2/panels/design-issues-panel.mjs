import { scanDesignIssues } from "./design-issues-scanner.mjs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = ["scene", "actor", "encounter"];

const CATEGORY_LABELS = Object.freeze({
    scene: "Scene",
    actor: "Actors",
    encounter: "Encounter"
});

const SEVERITY_ICON_CLASS = Object.freeze({
    warning: "fa-solid fa-triangle-exclamation",
    info: "fa-solid fa-circle-info"
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupAndOrderIssues(issues) {
    const groups = {};
    for (const issue of issues) {
        const cat = String(issue.category ?? "scene");
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(issue);
    }

    return CATEGORY_ORDER
        .filter((cat) => groups[cat]?.length > 0)
        .map((cat) => ({
            id: cat,
            label: CATEGORY_LABELS[cat] ?? cat,
            issues: groups[cat]
        }));
}

// ---------------------------------------------------------------------------
// Model builder
// ---------------------------------------------------------------------------

/**
 * Build the design issues panel model.
 *
 * @param {object}      opts
 * @param {object|null} opts.scene   - The active scene.
 * @param {object[]}    opts.actors  - World actors to inspect.
 * @param {object|null} opts.combat  - The active combat.
 * @returns {object} Panel model ready for renderDesignIssuesPanel().
 */
export function buildDesignIssuesPanelModel({ scene = null, actors = [], combat = null } = {}) {
    const issues = scanDesignIssues({ scene, actors, combat });
    const categories = groupAndOrderIssues(issues);

    return {
        totalCount: issues.length,
        hasIssues: issues.length > 0,
        categories
    };
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

/**
 * Render the design issues panel as an HTML string.
 *
 * @param {object}   model             - Output of buildDesignIssuesPanelModel().
 * @param {object}   opts
 * @param {Function} opts.escapeHTML   - HTML-escape function provided by the root app.
 * @returns {string} HTML string.
 */
export function renderDesignIssuesPanel(model = {}, { escapeHTML = (v) => String(v ?? "") } = {}) {
    const { hasIssues, totalCount, categories = [] } = model;

    const summaryText = hasIssues
        ? `${totalCount} issue${totalCount === 1 ? "" : "s"} found`
        : "All clear";

    const emptyMarkup = `
        <div class="totc-v2-issues-panel__empty">
            No design issues detected. The scene, actors, and encounter appear well-prepared.
        </div>`;

    const categoriesMarkup = categories.map((cat) => `
        <section class="totc-v2-issues-panel__category">
            <h4 class="totc-v2-issues-panel__category-label">${escapeHTML(cat.label)}</h4>
            <ul class="totc-v2-issues-panel__list" role="list">
                ${cat.issues.map((issue) => {
                    const iconClass = SEVERITY_ICON_CLASS[issue.severity] ?? SEVERITY_ICON_CLASS.info;
                    return `
                <li class="totc-v2-issues-panel__issue totc-v2-issues-panel__issue--${escapeHTML(issue.severity)}"
                    role="listitem"
                    data-issue-id="${escapeHTML(issue.id)}">
                    <button
                        type="button"
                        class="totc-v2-issues-panel__issue-btn"
                        data-action="navigate-design-issue"
                        data-navigate-action="${escapeHTML(issue.navigateAction ?? "")}"
                        data-subject-id="${escapeHTML(issue.subjectId)}"
                        data-subject-type="${escapeHTML(issue.subjectType)}"
                        title="${escapeHTML(issue.detail)}">
                        <i class="${escapeHTML(iconClass)}" aria-hidden="true"></i>
                        <span class="totc-v2-issues-panel__issue-title">${escapeHTML(issue.title)}</span>
                    </button>
                    <p class="totc-v2-issues-panel__issue-detail">${escapeHTML(issue.detail)}</p>
                </li>`;
                }).join("")}
            </ul>
        </section>`).join("");

    return `
    <section class="totc-v2-issues-panel">
        <header class="totc-v2-issues-panel__header">
            <span class="totc-v2-issues-panel__eyebrow">Design Review</span>
            <h3 class="totc-v2-issues-panel__title${hasIssues ? "" : " totc-v2-issues-panel__title--clear"}">${escapeHTML(summaryText)}</h3>
        </header>
        <div class="totc-v2-issues-panel__body">
            ${hasIssues ? categoriesMarkup : emptyMarkup}
        </div>
    </section>`;
}
