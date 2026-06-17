export function getDieRollRequestHostPanelId({ isGM = false } = {}) {
    return isGM ? "gamemaster" : "encounter";
}
