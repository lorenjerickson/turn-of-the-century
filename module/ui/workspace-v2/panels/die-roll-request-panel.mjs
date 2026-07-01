import { dieRollRequestManager } from "../../../die-roll-request-manager.mjs";
import { buildRollFormula, getRecipientAdjustment } from "../../../models/die-roll-request.mjs";

const ROLL_TYPE_OPTIONS = Object.freeze([
    ["attribute-check", "Attribute Check"],
    ["attribute-save", "Attribute Save"],
    ["ability", "Ability Roll"],
    ["attack", "Attack"],
    ["damage", "Damage"],
    ["custom", "Custom"]
]);

const ROLL_MODE_OPTIONS = Object.freeze([
    ["normal", "Normal"],
    ["advantage", "Advantage"],
    ["disadvantage", "Disadvantage"]
]);

function userName(users = [], userId = "") {
    return users.find((user) => user.id === userId)?.name || userId;
}

function getPrimaryRequest(requests = [], userId = "", isGM = false) {
    return requests.find((request) => request.isPending && (isGM || !request.hasResult(userId)))
        ?? requests[0]
        ?? null;
}

function requestFormulaForUser(request, userId = "") {
    return buildRollFormula({
        dice: request.dice,
        modifiers: request.modifiers,
        adjustment: getRecipientAdjustment(request, userId)
    });
}

function normalizeUsers(users = []) {
    return Array.from(users ?? []).map((user) => ({
        id: String(user?.id ?? ""),
        name: String(user?.name ?? user?.id ?? "Unknown User"),
        isGM: Boolean(user?.isGM)
    })).filter((user) => user.id);
}

export function buildDieRollRequestPanelModel({
    userId,
    isGM,
    users = [],
    manager = dieRollRequestManager
} = {}) {
    const normalizedUsers = normalizeUsers(users);
    const requests = manager.getVisibleRequests({ userId, isGM });
    const request = getPrimaryRequest(requests, userId, isGM);
    return {
        request,
        requests,
        hasOutstandingRequests: manager.hasOutstandingRequests(),
        isGM: Boolean(isGM),
        userId: String(userId ?? ""),
        users: normalizedUsers
    };
}

function renderOptions(options, selectedValue, escapeHTML) {
    return options.map(([value, label]) => `
        <option value="${escapeHTML(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHTML(label)}</option>`).join("");
}

function renderGmRequestForm(model, escapeHTML) {
    if (!model.isGM) return "";
    const playerOptions = model.users
        .filter((user) => !user.isGM)
        .map((user) => `<option value="${escapeHTML(user.id)}">${escapeHTML(user.name)}</option>`)
        .join("");

    return `
    <form class="totc-v2-die-roll-request-panel__gm-form" data-action="die-roll-request-create">
        <label>
            <span>Player</span>
            <select name="recipientId">${playerOptions}</select>
        </label>
        <label>
            <span>Roll</span>
            <input type="text" name="label" value="Constitution Saving Throw">
        </label>
        <label>
            <span>Type</span>
            <select name="rollType">${renderOptions(ROLL_TYPE_OPTIONS, "attribute-save", escapeHTML)}</select>
        </label>
        <label>
            <span>Dice</span>
            <select name="rollMode">${renderOptions(ROLL_MODE_OPTIONS, "normal", escapeHTML)}</select>
        </label>
        <label>
            <span>Modifier</span>
            <input type="number" name="modifier" value="0" step="1">
        </label>
        <button type="submit">Request Roll</button>
    </form>`;
}

function renderQueue(model, escapeHTML) {
    if (!model.requests.length) return "";
    return `
    <div class="totc-v2-die-roll-request-panel__queue" role="list">
        ${model.requests.map((request) => `
            <article class="totc-v2-die-roll-request-panel__queue-item${request.id === model.request?.id ? " is-active" : ""}" role="listitem">
                <span>${escapeHTML(request.label)}</span>
                <strong>${escapeHTML(request.status)}</strong>
            </article>`).join("")}
    </div>`;
}

function renderModifierControls(request, userId, escapeHTML) {
    if (request.hasResult(userId)) return "";
    const adjustment = getRecipientAdjustment(request, userId);
    return `
    <div class="totc-v2-die-roll-request-panel__adjust">
        <button type="button" data-action="die-roll-adjust" data-request-id="${escapeHTML(request.id)}" data-delta="-1" aria-label="Decrease modifier">-</button>
        <span>Player modifier <strong>${escapeHTML(adjustment >= 0 ? `+${adjustment}` : adjustment)}</strong></span>
        <button type="button" data-action="die-roll-adjust" data-request-id="${escapeHTML(request.id)}" data-delta="1" aria-label="Increase modifier">+</button>
    </div>`;
}

function renderDice(dice = [], escapeHTML) {
    return `
    <div class="totc-v2-die-roll-request-panel__dice" aria-label="Dice results">
        ${dice.map((die) => `
            <span class="totc-v2-die-roll-request-panel__die${die.kept ? " is-kept" : ""}" title="d${escapeHTML(die.faces)}">
                ${escapeHTML(die.value)}
            </span>`).join("")}
    </div>`;
}

function renderResult(result, escapeHTML) {
    if (!result) return "";
    return `
    <div class="totc-v2-die-roll-request-panel__result">
        ${renderDice(result.dice ?? [], escapeHTML)}
        <div class="totc-v2-die-roll-request-panel__formula">${escapeHTML(result.formula)}</div>
        <strong class="totc-v2-die-roll-request-panel__total">${escapeHTML(result.total)}</strong>
    </div>`;
}

function renderRequestDetails(request, userId, formula, escapeHTML) {
    const diceText = (request.dice ?? []).map((die) => {
        const count = Number(die.count ?? 1) || 1;
        const faces = Number(die.faces ?? 20) || 20;
        const keep = die.keep === "highest" ? " keep highest" : die.keep === "lowest" ? " keep lowest" : "";
        return `${count} roll${count === 1 ? "" : "s"} per d${faces}${keep}`;
    }).join(", ") || "1 roll per d20";
    const modifiers = [
        ...(request.modifiers ?? []).map((modifier) => `${modifier.label}: ${Number(modifier.value ?? 0) >= 0 ? "+" : ""}${Number(modifier.value ?? 0) || 0}`),
        getRecipientAdjustment(request, userId)
            ? `Player modifier: ${getRecipientAdjustment(request, userId) >= 0 ? "+" : ""}${getRecipientAdjustment(request, userId)}`
            : ""
    ].filter(Boolean);

    return `
    <dl class="totc-v2-die-roll-request-panel__details">
        <div><dt>Type</dt><dd>${escapeHTML(request.rollSubType || request.rollType)}</dd></div>
        <div><dt>Die</dt><dd>${escapeHTML(diceText)}</dd></div>
        <div><dt>Modifiers</dt><dd>${escapeHTML(modifiers.length ? modifiers.join(", ") : "None")}</dd></div>
        <div><dt>Formula</dt><dd>${escapeHTML(formula)}</dd></div>
    </dl>`;
}

function renderPlayerRequest(request, model, escapeHTML, { activeRequestId = "" } = {}) {
    const userId = model.userId;
    const result = request.results?.[userId] ?? null;
    const formula = result?.formula ?? requestFormulaForUser(request, userId);
    const canRoll = !model.isGM && !result && request.isPending && (!activeRequestId || request.id === activeRequestId);

    return `
    <article class="totc-v2-die-roll-request-panel__request">
        <header>
            <span>${escapeHTML(request.rollType)}</span>
            <h3>${escapeHTML(request.label)}</h3>
            <p>Requested by ${escapeHTML(request.requestor?.name ?? request.initiatorId ?? "System")}</p>
        </header>
        ${renderRequestDetails(request, userId, formula, escapeHTML)}
        ${renderModifierControls(request, userId, escapeHTML)}
        ${result ? renderResult(result, escapeHTML) : `
            <div class="totc-v2-die-roll-request-panel__dice is-rolling" aria-label="Pending dice">
                ${(request.dice ?? []).flatMap((die) => Array.from({ length: Number(die.count ?? 1) || 1 }, (_, index) => `
                    <span class="totc-v2-die-roll-request-panel__die" style="--die-index:${index}">d${escapeHTML(die.faces ?? 20)}</span>`)).join("")}
            </div>`}
        <footer>
            ${canRoll ? `<button type="button" class="totc-v2-die-roll-request-panel__roll-btn" data-action="die-roll-request-roll" data-request-id="${escapeHTML(request.id)}">Roll</button>` : ""}
            ${request.isPending ? `<button type="button" data-action="die-roll-request-cancel" data-request-id="${escapeHTML(request.id)}">Cancel</button>` : ""}
        </footer>
    </article>`;
}

function renderPlayerRequests(model, escapeHTML) {
    const requests = model.requests.filter((request) => request.hasRecipient?.(model.userId) ?? true);
    if (!requests.length) return `<div class="totc-v2-die-roll-request-panel__empty">No pending die roll requests.</div>`;
    const activeRequest = requests.find((request) => request.isPending && !request.hasResult(model.userId)) ?? null;
    return requests.map((request) => renderPlayerRequest(request, model, escapeHTML, {
        activeRequestId: activeRequest?.id ?? ""
    })).join("");
}

function renderGmResults(request, model, escapeHTML) {
    const unresolvedRecipientIds = request.recipientIds.filter((id) => !request.results?.[id]);
    return `
    <article class="totc-v2-die-roll-request-panel__request">
        <header>
            <span>${escapeHTML(request.status)}</span>
            <h3>${escapeHTML(request.label)}</h3>
            <p>${escapeHTML(request.recipientIds.map((id) => userName(model.users, id)).join(", "))}</p>
        </header>
        <table class="totc-v2-die-roll-request-panel__results">
            <thead><tr><th>Player</th><th>Status</th><th>Formula</th><th>Total</th></tr></thead>
            <tbody>
                ${request.recipientIds.map((id) => {
                    const result = request.results?.[id] ?? null;
                    return `
                    <tr>
                        <td>${escapeHTML(userName(model.users, id))}</td>
                        <td>${escapeHTML(result ? "resolved" : request.status)}</td>
                        <td>${escapeHTML(result?.formula ?? requestFormulaForUser(request, id))}</td>
                        <td>${result
                            ? escapeHTML(result.total)
                            : `<button type="button" data-action="die-roll-request-roll" data-request-id="${escapeHTML(request.id)}" data-recipient-id="${escapeHTML(id)}">Roll</button>`}</td>
                    </tr>`;
                }).join("")}
            </tbody>
        </table>
        <footer>
            ${request.isPending && unresolvedRecipientIds.length > 1 ? `<button type="button" data-action="die-roll-request-roll-all" data-request-id="${escapeHTML(request.id)}">Auto-roll Pending</button>` : ""}
            ${request.isPending ? `<button type="button" data-action="die-roll-request-cancel" data-request-id="${escapeHTML(request.id)}">Cancel</button>` : ""}
        </footer>
    </article>`;
}

export function renderDieRollRequestPanel(panelModel = {}, { escapeHTML = (v) => String(v ?? "") } = {}) {
    const model = {
        request: panelModel.request ?? null,
        requests: Array.isArray(panelModel.requests) ? panelModel.requests : [],
        isGM: Boolean(panelModel.isGM),
        userId: String(panelModel.userId ?? ""),
        users: Array.isArray(panelModel.users) ? panelModel.users : []
    };

    return `
    <section class="totc-v2-die-roll-request-panel">
        ${renderGmRequestForm(model, escapeHTML)}
        ${model.isGM ? renderQueue(model, escapeHTML) : ""}
        ${model.isGM
            ? (model.request ? renderGmResults(model.request, model, escapeHTML) : `<div class="totc-v2-die-roll-request-panel__empty">No pending die roll requests.</div>`)
            : renderPlayerRequests(model, escapeHTML)}
    </section>`;
}
