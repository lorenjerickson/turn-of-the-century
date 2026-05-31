import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    WORKSPACE_DEBOUNCED_TEXT_INPUT_ACTIONS,
    focusWorkspaceTextInputAtEnd,
    isWorkspaceDebouncedTextInputTarget
} from "../../module/ui/workspace-v2/workspace-text-inputs.mjs";

function input({ action, type = "text", tagName = "INPUT" } = {}) {
    return {
        tagName,
        type,
        dataset: { action }
    };
}

describe("workspace text input debounce routing", () => {
    it("registers scene properties name as a debounced text action", () => {
        assert.equal(WORKSPACE_DEBOUNCED_TEXT_INPUT_ACTIONS.has("scene-properties-name"), true);
        assert.equal(WORKSPACE_DEBOUNCED_TEXT_INPUT_ACTIONS.has("media-browser-search"), true);
        assert.equal(WORKSPACE_DEBOUNCED_TEXT_INPUT_ACTIONS.has("gm-assistant-set-prompt"), true);
    });

    it("debounces text and search inputs for registered actions", () => {
        assert.equal(isWorkspaceDebouncedTextInputTarget(input({ action: "scene-properties-name" })), true);
        assert.equal(isWorkspaceDebouncedTextInputTarget(input({ action: "compendium-search", type: "search" })), true);
        assert.equal(isWorkspaceDebouncedTextInputTarget(input({ action: "media-browser-search", type: "search" })), true);
    });

    it("does not debounce unregistered or non-text inputs", () => {
        assert.equal(isWorkspaceDebouncedTextInputTarget(input({ action: "market-buy-quantity", type: "number" })), false);
        assert.equal(isWorkspaceDebouncedTextInputTarget(input({ action: "unknown-field" })), false);
        assert.equal(isWorkspaceDebouncedTextInputTarget(input({ action: "scene-properties-name", type: "file" })), false);
    });

    it("allows registered textareas to use the shared debounce route", () => {
        assert.equal(isWorkspaceDebouncedTextInputTarget(input({ action: "gm-assistant-set-prompt", tagName: "TEXTAREA" })), true);
    });

    it("restores debounced input focus with the cursor at the end", () => {
        const target = {
            value: "Whitechapel",
            focused: false,
            selection: null,
            focus() {
                this.focused = true;
            },
            setSelectionRange(start, end) {
                this.selection = { start, end };
            }
        };
        const root = {
            querySelector(selector) {
                return selector === "[data-action='scene-properties-name']" ? target : null;
            }
        };

        assert.equal(focusWorkspaceTextInputAtEnd(root, "scene-properties-name"), true);
        assert.equal(target.focused, true);
        assert.deepEqual(target.selection, { start: 11, end: 11 });
    });
});
