// Die Roll Request Panel for Turn of the Century system
// This panel is used by both GM and players to handle die roll requests
import { dieRollRequestManager } from "../../../die-roll-request-manager.mjs";

export function buildDieRollRequestPanelModel({ userId, isGM }) {
  // For now, just get all active requests
  const requests = dieRollRequestManager.getAllRequests();
  // Filter requests relevant to this user
  const relevant = isGM
    ? requests // GM sees all
    : requests.filter(req => req.recipientIds.includes(userId));
  // For now, just show the first relevant request
  const request = relevant[0] || null;
  return { request, isGM, userId };
}

export function renderDieRollRequestPanel(panelModel = {}, { escapeHTML = (v) => String(v ?? "") } = {}) {
  const { request, isGM, userId } = panelModel;
  if (!request) {
    return `<section class="totc-v2-die-roll-request-panel"><div class="totc-v2-die-roll-request-panel__empty">No pending die roll requests.</div></section>`;
  }
  // Compose summary
  const summary = `${escapeHTML(request.rollType)}: ${escapeHTML(request.rollSubType)}`;
  const modifiers = Array.isArray(request.modifiers) ? request.modifiers.join(", ") : request.modifiers;
  const recipients = request.recipientIds.map(id => `<span>${escapeHTML(id)}</span>`).join(", ");
  // Results table for GM
  let resultsMarkup = "";
  if (isGM && request.results) {
    resultsMarkup = `<table class="totc-v2-die-roll-request-panel__results"><thead><tr><th>Player</th><th>Result</th></tr></thead><tbody>` +
      request.recipientIds.map(id => `<tr><td>${escapeHTML(id)}</td><td>${request.results[id]?.total ?? "-"}</td></tr>`).join("") +
      `</tbody></table>`;
  }
  // Dice tray placeholder for player
  let diceTrayMarkup = "";
  if (!isGM && !request.results[userId]) {
    // TODO: Replace with interactive dice tray UI
    diceTrayMarkup = `<div class="totc-v2-die-roll-request-panel__tray">[Dice tray UI coming soon]</div><button class="totc-v2-die-roll-request-panel__roll-btn">Roll</button>`;
  } else if (!isGM && request.results[userId]) {
    diceTrayMarkup = `<div class="totc-v2-die-roll-request-panel__result">Your result: <strong>${escapeHTML(request.results[userId].total)}</strong></div>`;
  }
  return `<section class="totc-v2-die-roll-request-panel">
    <header class="totc-v2-die-roll-request-panel__summary">${summary}</header>
    <div class="totc-v2-die-roll-request-panel__modifiers">Modifiers: ${escapeHTML(modifiers)}</div>
    <div class="totc-v2-die-roll-request-panel__recipients">Recipients: ${recipients}</div>
    ${resultsMarkup}
    ${diceTrayMarkup}
  </section>`;
}
