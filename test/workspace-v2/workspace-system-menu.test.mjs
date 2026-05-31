import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    openFoundrySettingsView,
    revealFoundrySettingsRegions
} from "../../module/ui/workspace-v2/workspace-system-menu.mjs";

function makeElement() {
    const classes = new Set(["hidden", "collapsed", "minimized"]);
    return {
        hidden: true,
        attributesRemoved: [],
        dataset: {},
        clicked: false,
        ariaSelected: "",
        classList: {
            add: (...classNames) => classNames.forEach((className) => classes.add(className)),
            remove: (...classNames) => classNames.forEach((className) => classes.delete(className)),
            contains: (className) => classes.has(className)
        },
        style: {
            removed: [],
            set: [],
            removeProperty(property) {
                this.removed.push(property);
            },
            setProperty(property, value, priority) {
                this.set.push({ property, value, priority });
            }
        },
        removeAttribute(attribute) {
            this.attributesRemoved.push(attribute);
        },
        setAttribute(attribute, value) {
            if (attribute === "aria-selected") this.ariaSelected = value;
        },
        click() {
            this.clicked = true;
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
        querySelector: (selector) => elements[selector] ?? null,
        querySelectorAll: (selector) => elements[selector] ? [elements[selector]] : []
    };
}

describe("workspace system menu", () => {
    it("opens Foundry's V14 SettingsConfig before legacy settings sheet fallback", () => {
        let renderedWith = null;
        const settingsConfigElement = makeElement();
        const document = makeDocument({
            "#settings-config": settingsConfigElement
        });
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
        assert.equal(settingsConfigElement.hidden, false);
        assert.equal(settingsConfigElement.classList.contains("active"), true);
        assert.ok(settingsConfigElement.style.set.some((entry) => (
            entry.property === "z-index"
            && entry.value === "1300"
            && entry.priority === "important"
        )));
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
        const settingsTab = makeElement();
        settingsTab.dataset.tab = "settings";
        const elements = {
            "#ui-right": makeElement(),
            "#sidebar": makeElement(),
            "#settings": makeElement(),
            "#sidebar-tabs [data-tab='settings'], #ui-right [data-tab='settings']": settingsTab
        };
        const document = makeDocument(elements);
        let activatedTab = "";
        let changedTab = "";
        let renderForce = null;

        revealFoundrySettingsRegions({
            document,
            ui: {
                sidebar: {
                    render: (force) => {
                        renderForce = force;
                    },
                    activateTab: (tab) => {
                        activatedTab = tab;
                    },
                    changeTab: (tab) => {
                        changedTab = tab;
                    }
                }
            }
        });

        assert.equal(document.body.classList.contains("totc-v2-native-settings-open"), true);
        assert.equal(renderForce, true);
        assert.equal(activatedTab, "settings");
        assert.equal(changedTab, "settings");
        assert.equal(settingsTab.clicked, true);
        assert.equal(settingsTab.classList.contains("active"), true);
        assert.equal(settingsTab.ariaSelected, "true");
        assert.equal(elements["#settings"].classList.contains("active"), true);
        for (const element of Object.values(elements)) {
            assert.equal(element.hidden, false);
            assert.deepEqual(element.attributesRemoved, ["hidden"]);
            assert.deepEqual(element.style.removed, ["display", "visibility", "pointer-events"]);
            assert.equal(element.classList.contains("hidden"), false);
            assert.equal(element.classList.contains("collapsed"), false);
            assert.equal(element.classList.contains("minimized"), false);
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
