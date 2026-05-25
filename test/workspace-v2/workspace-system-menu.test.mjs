import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { openFoundrySettingsView } from "../../module/ui/workspace-v2/workspace-system-menu.mjs";

describe("workspace system menu", () => {
    it("opens Foundry's native settings sheet when available", () => {
        let renderedWith = null;
        const result = openFoundrySettingsView({
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
