import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    getDefaultScene,
    isDefaultScene,
    setDefaultScene,
    clearDefaultScene
} from "../module/seeded-scenes.mjs";

const SYSTEM_ID = "turn-of-the-century";

function makeScene(id, { defaultScene = false, name = id } = {}) {
    return {
        id,
        name,
        flags: defaultScene ? { [SYSTEM_ID]: { defaultScene: true } } : {},
        _updates: [],
        update(data) {
            this._updates.push(data);
            if (data[`flags.${SYSTEM_ID}.defaultScene`] !== undefined) {
                this.flags[SYSTEM_ID] = this.flags[SYSTEM_ID] ?? {};
                this.flags[SYSTEM_ID].defaultScene = data[`flags.${SYSTEM_ID}.defaultScene`];
            }
            return Promise.resolve(this);
        }
    };
}

describe("seeded scenes", () => {
    it("isDefaultScene returns true only when the flag is set", () => {
        assert.equal(isDefaultScene(makeScene("a", { defaultScene: true })), true);
        assert.equal(isDefaultScene(makeScene("b", { defaultScene: false })), false);
        assert.equal(isDefaultScene(null), false);
        assert.equal(isDefaultScene(undefined), false);
    });

    it("getDefaultScene returns the scene flagged as default", () => {
        const a = makeScene("a");
        const b = makeScene("b", { defaultScene: true });
        const c = makeScene("c");

        const scenes = { contents: [a, b, c] };
        assert.equal(getDefaultScene(scenes), b);
    });

    it("getDefaultScene returns null when no scene is flagged as default", () => {
        const scenes = { contents: [makeScene("a"), makeScene("b")] };
        assert.equal(getDefaultScene(scenes), null);
    });

    it("getDefaultScene returns null for an empty collection", () => {
        assert.equal(getDefaultScene({ contents: [] }), null);
    });

    it("setDefaultScene flags one scene and clears the flag from all others", async () => {
        const a = makeScene("a", { defaultScene: true });
        const b = makeScene("b");
        const c = makeScene("c");

        await setDefaultScene(b, { contents: [a, b, c] });

        assert.equal(isDefaultScene(b), true);
        assert.equal(isDefaultScene(a), false);
        assert.equal(isDefaultScene(c), false);
    });

    it("setDefaultScene does nothing when called with a null scene", async () => {
        // Should not throw
        await setDefaultScene(null, { contents: [] });
    });

    it("clearDefaultScene removes the default flag from a scene", async () => {
        const scene = makeScene("a", { defaultScene: true });
        await clearDefaultScene(scene);
        assert.equal(isDefaultScene(scene), false);
    });

    it("clearDefaultScene does nothing when called with a null scene", async () => {
        await clearDefaultScene(null);
    });
});
