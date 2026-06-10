import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { migrateLegacyExportSourceData } from "../module/sample-content.mjs";

describe("sample content exportSource migration", () => {
    it("moves nested legacy flags.exportSource into _stats before import", () => {
        const source = {
            name: "Legacy Item",
            type: "equipment",
            flags: {
                exportSource: {
                    system: "turn-of-the-century",
                    coreVersion: "13.0"
                },
                "turn-of-the-century": { marker: true }
            }
        };

        const migrated = migrateLegacyExportSourceData(source);

        assert.deepEqual(migrated._stats.exportSource, {
            system: "turn-of-the-century",
            coreVersion: "13.0"
        });
        assert.equal(migrated.flags.exportSource, undefined);
        assert.deepEqual(migrated.flags["turn-of-the-century"], { marker: true });
        assert.equal(source.flags.exportSource.system, "turn-of-the-century");
    });

    it("moves dotted legacy flags.exportSource keys into _stats before import", () => {
        const exportSource = { system: "turn-of-the-century", world: "Upgrade Test" };
        const migrated = migrateLegacyExportSourceData({
            name: "Dotted Legacy Item",
            type: "equipment",
            "flags.exportSource": exportSource,
            flags: {}
        });

        assert.equal(migrated["flags.exportSource"], undefined);
        assert.equal(migrated.flags.exportSource, undefined);
        assert.deepEqual(migrated._stats.exportSource, exportSource);
    });

    it("preserves an existing _stats.exportSource over legacy flag data", () => {
        const existing = { system: "turn-of-the-century", coreVersion: "14.0" };
        const legacy = { system: "turn-of-the-century", coreVersion: "12.0" };
        const migrated = migrateLegacyExportSourceData({
            name: "Already Migrated Item",
            type: "equipment",
            _stats: { exportSource: existing },
            flags: { exportSource: legacy }
        });

        assert.deepEqual(migrated._stats.exportSource, existing);
        assert.equal(migrated.flags.exportSource, undefined);
    });
});
