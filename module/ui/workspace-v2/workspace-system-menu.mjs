import { WORKSPACE_V2_NATIVE_SETTINGS_CLASS } from "./constants.mjs";

function getRuntime(overrides = {}) {
    return {
        game: overrides.game ?? globalThis.game,
        ui: overrides.ui ?? globalThis.ui,
        foundry: overrides.foundry ?? globalThis.foundry,
        document: overrides.document ?? globalThis.document,
        defer: overrides.defer ?? globalThis.setTimeout,
        notifications: overrides.notifications ?? overrides.ui?.notifications ?? globalThis.ui?.notifications
    };
}

export function revealFoundrySettingsRegions({ document = globalThis.document, ui = globalThis.ui } = {}) {
    document?.body?.classList?.add?.(WORKSPACE_V2_NATIVE_SETTINGS_CLASS);

    for (const selector of ["#ui-right", "#sidebar", "#settings"]) {
        const element = document?.querySelector?.(selector);
        if (!element) continue;

        element.hidden = false;
        element.removeAttribute?.("hidden");
        element.style?.removeProperty?.("display");
        element.style?.removeProperty?.("visibility");
    }

    ui?.sidebar?.activateTab?.("settings");
}

function renderApplication(app) {
    if (typeof app?.render === "function") {
        app.render(true);
        return true;
    }

    if (typeof app?.renderPopout === "function") {
        app.renderPopout(true);
        return true;
    }

    return false;
}

export function openFoundrySettingsView(overrides = {}) {
    const runtime = getRuntime(overrides);

    revealFoundrySettingsRegions(runtime);

    if (renderApplication(runtime.game?.settings?.sheet)) {
        runtime.defer?.(() => revealFoundrySettingsRegions(runtime), 0);
        return { ok: true, source: "game.settings.sheet" };
    }

    if (renderApplication(runtime.ui?.settings)) {
        runtime.defer?.(() => revealFoundrySettingsRegions(runtime), 0);
        return { ok: true, source: "ui.settings" };
    }

    const SettingsConfig = runtime.foundry?.applications?.apps?.SettingsConfig
        ?? runtime.foundry?.applications?.settings?.SettingsConfig;
    if (typeof SettingsConfig === "function") {
        const app = new SettingsConfig();
        if (renderApplication(app)) {
            runtime.defer?.(() => revealFoundrySettingsRegions(runtime), 0);
            return { ok: true, source: "SettingsConfig" };
        }
    }

    runtime.notifications?.warn?.("Foundry settings are not available in this session.");
    return {
        ok: false,
        level: "warn",
        message: "Foundry settings are not available in this session."
    };
}
