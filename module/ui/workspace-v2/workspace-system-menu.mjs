function getRuntime(overrides = {}) {
    return {
        game: overrides.game ?? globalThis.game,
        ui: overrides.ui ?? globalThis.ui,
        foundry: overrides.foundry ?? globalThis.foundry,
        notifications: overrides.notifications ?? overrides.ui?.notifications ?? globalThis.ui?.notifications
    };
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

    if (renderApplication(runtime.game?.settings?.sheet)) {
        return { ok: true, source: "game.settings.sheet" };
    }

    if (renderApplication(runtime.ui?.settings)) {
        return { ok: true, source: "ui.settings" };
    }

    const SettingsConfig = runtime.foundry?.applications?.apps?.SettingsConfig
        ?? runtime.foundry?.applications?.settings?.SettingsConfig;
    if (typeof SettingsConfig === "function") {
        const app = new SettingsConfig();
        if (renderApplication(app)) {
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
