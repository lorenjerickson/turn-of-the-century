export const WORKSPACE_DEBOUNCED_TEXT_INPUT_ACTIONS = Object.freeze(new Set([
    "compendium-search",
    "design-command-palette-search",
    "gm-search-actions",
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
