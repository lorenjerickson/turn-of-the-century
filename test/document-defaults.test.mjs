import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildNewSceneVisionDefaults,
    buildNewTokenVisionDefaults
} from "../module/document-defaults.mjs";

describe("Foundry document defaults", () => {
    it("gives new tokens enabled vision with a 60-foot range", () => {
        assert.deepEqual(buildNewTokenVisionDefaults(), {
            sight: { enabled: true, range: 60 }
        });
    });

    it("requires token vision and enables individual fog exploration for new scenes", () => {
        assert.deepEqual(buildNewSceneVisionDefaults(), {
            tokenVision: true,
            fog: { mode: 1 }
        });
    });
});
