import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getLegacyExportSourceFromItemSource } from "../../scripts/migrate-exportSource-flag.mjs";

describe("exportSource flag migration helpers", () => {
    it("reads nested legacy exportSource from raw document source", () => {
        const exportSource = { system: "turn-of-the-century", coreVersion: "13.0" };
        const item = {
            _source: { flags: { exportSource } },
            get flags() {
                throw new Error("public flags accessor should not be used during migration");
            }
        };

        assert.deepEqual(getLegacyExportSourceFromItemSource(item), exportSource);
    });

    it("reads dotted legacy exportSource from raw document source", () => {
        const exportSource = { system: "turn-of-the-century", world: "Upgrade Test" };
        const item = {
            _source: { "flags.exportSource": exportSource },
            get flags() {
                throw new Error("public flags accessor should not be used during migration");
            }
        };

        assert.deepEqual(getLegacyExportSourceFromItemSource(item), exportSource);
    });
});
