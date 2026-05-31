export function getDieRollRequestHostPanelId({ isGM = false } = {}) {
    return isGM ? "gamemaster" : "player";
}
