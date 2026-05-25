import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

describe("Foundry V14 compatibility audit", () => {
    it("passes against executable source files", () => {
        const result = spawnSync(process.execPath, ["scripts/audit-foundry-v14-compat.mjs"], {
            cwd: process.cwd(),
            encoding: "utf8"
        });

        assert.equal(result.status, 0, result.stderr || result.stdout);
        assert.match(result.stdout, /compatibility audit OK/);
    });
});
