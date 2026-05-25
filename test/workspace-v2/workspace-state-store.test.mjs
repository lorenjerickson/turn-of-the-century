import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { WorkspaceStateStore } from "../../module/ui/workspace-v2/workspace-state-store.mjs";

const originalGame = globalThis.game;
const originalFoundry = globalThis.foundry;

afterEach(() => {
    globalThis.game = originalGame;
    globalThis.foundry = originalFoundry;
});

describe("WorkspaceStateStore scoped state", () => {
    it("normalizes user scoped state reads and patch writes", async () => {
        let flags = {
            workspaceV2: {
                gmPanelState: {
                    collapsedGroupIds: ["scene-flow"]
                }
            }
        };
        globalThis.foundry = {
            utils: {
                deepClone: (value) => JSON.parse(JSON.stringify(value))
            }
        };
        globalThis.game = {
            user: {
                getFlag: (systemId, scope) => flags[scope],
                setFlag: async (systemId, scope, value) => {
                    flags[scope] = value;
                }
            },
            settings: {
                get: () => false,
                set: async () => {}
            }
        };

        const store = new WorkspaceStateStore({ systemId: "turn-of-the-century" });
        const normalize = (value = {}) => ({
            collapsedGroupIds: Array.isArray(value?.collapsedGroupIds) ? value.collapsedGroupIds : [],
            actionSearchQuery: String(value?.actionSearchQuery ?? "")
        });

        assert.deepEqual(store.getUserScopedState("gmPanelState", normalize), {
            collapsedGroupIds: ["scene-flow"],
            actionSearchQuery: ""
        });

        const updated = await store.setUserScopedStatePatch("gmPanelState", {
            actionSearchQuery: "walls"
        }, normalize);

        assert.deepEqual(updated, {
            collapsedGroupIds: ["scene-flow"],
            actionSearchQuery: "walls"
        });
        assert.deepEqual(flags.workspaceV2.gmPanelState, updated);
    });
});
