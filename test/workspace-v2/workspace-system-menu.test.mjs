import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    openFoundrySettingsView,
    revealFoundrySettingsRegions
} from "../../module/ui/workspace-v2/workspace-system-menu.mjs";

function makeElement() {
    return {
        hidden: true,
        attributesRemoved: [],
        style: {
            removed: [],
            removeProperty(property) {
                this.removed.push(property);
            }
        },
        removeAttribute(attribute) {
            this.attributesRemoved.push(attribute);
        }
    };
}

function makeDocument(elements = {}) {
    const classes = new Set();
    return {
        body: {
            classList: {
                add: (className) => classes.add(className),
                contains: (className) => classes.has(className)
            }
        },
        querySelector: (selector) => elements[selector] ?? null
    };
}

describe("workspace system menu", () => {
    it("opens Foundry's native settings sheet when available", () => {
        let renderedWith = null;
        const document = makeDocument();
        const result = openFoundrySettingsView({
            document,
            defer: (callback) => callback(),
            game: {
                settings: {
                    sheet: {
                        render: (force) => {
                            renderedWith = force;
                        }
                    }
                }
            }
        });

        assert.deepEqual(result, { ok: true, source: "game.settings.sheet" });
        assert.equal(renderedWith, true);
        assert.equal(document.body.classList.contains("totc-v2-native-settings-open"), true);
    });

    it("falls back to the settings sidebar app", () => {
        let renderedWith = null;
        const result = openFoundrySettingsView({
            game: { settings: {} },
            ui: {
                settings: {
                    renderPopout: (force) => {
                        renderedWith = force;
                    }
                }
            }
        });

        assert.deepEqual(result, { ok: true, source: "ui.settings" });
        assert.equal(renderedWith, true);
    });

    it("reveals the native settings sidebar regions hidden by the workspace shell", () => {
        const elements = {
            "#ui-right": makeElement(),
            "#sidebar": makeElement(),
            "#settings": makeElement()
        };
        const document = makeDocument(elements);
        let activatedTab = "";

        revealFoundrySettingsRegions({
            document,
            ui: {
                sidebar: {
                    activateTab: (tab) => {
                        activatedTab = tab;
                    }
                }
            }
        });

        assert.equal(document.body.classList.contains("totc-v2-native-settings-open"), true);
        assert.equal(activatedTab, "settings");
        for (const element of Object.values(elements)) {
            assert.equal(element.hidden, false);
            assert.deepEqual(element.attributesRemoved, ["hidden"]);
            assert.deepEqual(element.style.removed, ["display", "visibility"]);
        }
    });

    it("warns when no native settings surface is available", () => {
        let warning = "";
        const result = openFoundrySettingsView({
            game: { settings: {} },
            ui: {},
            notifications: {
                warn: (message) => {
                    warning = message;
                }
            }
        });

        assert.equal(result.ok, false);
        assert.equal(result.level, "warn");
        assert.match(warning, /settings are not available/);
    });
});
