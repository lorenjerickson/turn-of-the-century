export const WORKSPACE_DEBOUNCED_TEXT_INPUT_ACTIONS = Object.freeze(new Set([
    "compendium-search",
    "design-command-palette-search",
    "gm-search-actions",
    "media-browser-search",
    "scene-properties-name"
]));

export function isWorkspaceDebouncedTextInputTarget(input) {
    const action = String(input?.dataset?.action ?? "").trim();
    if (!WORKSPACE_DEBOUNCED_TEXT_INPUT_ACTIONS.has(action)) return false;

    const tagName = String(input?.tagName ?? "").toUpperCase();
    if (tagName === "TEXTAREA") return true;
    if (tagName !== "INPUT") return false;

    const type = String(input?.type ?? "text").toLowerCase();
    return type === "text" || type === "search";
}

export function focusWorkspaceTextInputAtEnd(root, action) {
    const selector = `[data-action='${String(action ?? "").replaceAll("'", "\\'")}']`;
    const input = root?.querySelector?.(selector);
    if (!input || typeof input.focus !== "function") return false;

    input.focus();
    const valueLength = String(input.value ?? "").length;
    if (typeof input.setSelectionRange === "function") {
        input.setSelectionRange(valueLength, valueLength);
    }
    return true;
}
