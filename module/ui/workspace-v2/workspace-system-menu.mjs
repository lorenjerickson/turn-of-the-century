import { WORKSPACE_V2_NATIVE_SETTINGS_CLASS } from "./constants.mjs";
import {
    getSettingsConfigClass,
    renderFoundryApplication
} from "../../foundry-v14-runtime.mjs";

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

function revealElement(element) {
    if (!element) return;

    element.hidden = false;
    element.removeAttribute?.("hidden");
    element.style?.removeProperty?.("display");
    element.style?.removeProperty?.("visibility");
    element.style?.removeProperty?.("pointer-events");
    element.classList?.remove?.("hidden", "collapsed", "minimized");
}

function queryAll(document, selector) {
    if (typeof document?.querySelectorAll === "function") return Array.from(document.querySelectorAll(selector));
    const element = document?.querySelector?.(selector);
    return element ? [element] : [];
}

function activateSettingsTab({ document = globalThis.document, ui = globalThis.ui } = {}) {
    ui?.sidebar?.render?.(true);
    ui?.sidebar?.activateTab?.("settings");
    ui?.sidebar?.changeTab?.("settings", "primary");

    const settingsTabs = queryAll(document, "#sidebar-tabs [data-tab='settings'], #ui-right [data-tab='settings']");
    for (const tab of settingsTabs) {
        revealElement(tab);
        tab.classList?.add?.("active");
        tab.setAttribute?.("aria-selected", "true");
        tab.click?.();
    }

    for (const tab of queryAll(document, "#sidebar-tabs [data-tab], #ui-right [data-tab]")) {
        if (tab?.dataset?.tab === "settings") continue;
        tab.classList?.remove?.("active");
        tab.setAttribute?.("aria-selected", "false");
    }

    const settingsPane = document?.querySelector?.("#settings");
    revealElement(settingsPane);
    settingsPane?.classList?.add?.("active");

    for (const pane of queryAll(document, "#sidebar > .tab, #sidebar .sidebar-tab")) {
        if (pane?.id === "settings" || pane?.dataset?.tab === "settings") continue;
        pane.classList?.remove?.("active");
    }
}

export function revealFoundrySettingsRegions({ document = globalThis.document, ui = globalThis.ui } = {}) {
    document?.body?.classList?.add?.(WORKSPACE_V2_NATIVE_SETTINGS_CLASS);

    for (const selector of ["#ui-right", "#sidebar"]) {
        revealElement(document?.querySelector?.(selector));
    }

    activateSettingsTab({ document, ui });
}

function renderApplication(app) {
    return renderFoundryApplication(app, { force: true });
}

export function openFoundrySettingsView(overrides = {}) {
    const runtime = getRuntime(overrides);

    revealFoundrySettingsRegions(runtime);

    const SettingsConfig = getSettingsConfigClass(runtime);
    if (typeof SettingsConfig === "function") {
        const app = new SettingsConfig();
        if (renderApplication(app)) {
            runtime.defer?.(() => revealFoundrySettingsRegions(runtime), 0);
            return { ok: true, source: "SettingsConfig" };
        }
    }

    if (renderApplication(runtime.game?.settings?.sheet)) {
        runtime.defer?.(() => revealFoundrySettingsRegions(runtime), 0);
        return { ok: true, source: "game.settings.sheet" };
    }

    runtime.notifications?.warn?.("Foundry settings are not available in this session.");
    return {
        ok: false,
        level: "warn",
        message: "Foundry settings are not available in this session."
    };
}
