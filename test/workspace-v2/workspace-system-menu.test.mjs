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
    it("opens Foundry's V14 SettingsConfig before legacy settings sheet fallback", () => {
        let renderedWith = null;
        const document = makeDocument();
        const result = openFoundrySettingsView({
            document,
            defer: (callback) => callback(),
            foundry: {
                applications: {
                    apps: {
                        SettingsConfig: class SettingsConfig {
                            render(options) {
                                renderedWith = options;
                            }
                        }
                    }
                }
            },
            game: {
                settings: {
                    sheet: {
                        render: () => {
                            throw new Error("legacy settings sheet was accessed");
                        }
                    }
                }
            }
        });

        assert.deepEqual(result, { ok: true, source: "SettingsConfig" });
        assert.deepEqual(renderedWith, { force: true });
        assert.equal(document.body.classList.contains("totc-v2-native-settings-open"), true);
    });

    it("falls back to the settings sheet when SettingsConfig is unavailable", () => {
        let renderedWith = null;
        const result = openFoundrySettingsView({
            game: {
                settings: {
                    sheet: {
                        render: (options) => {
                            renderedWith = options;
                        }
                    }
                }
            }
        });

        assert.deepEqual(result, { ok: true, source: "game.settings.sheet" });
        assert.deepEqual(renderedWith, { force: true });
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
