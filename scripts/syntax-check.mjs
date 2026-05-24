/**
 * syntax-check.mjs
 *
 * Recursively finds every .mjs file under the module/ directory and runs
 * `node --check` on each one. Exits with code 1 on the first syntax error,
 * printing the offending file path and Node's error message.
 *
 * Usage:
 *   node scripts/syntax-check.mjs
 *   npm run syntax-check
 */

import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CHECK_DIRS = ["module"];

function* walkMjs(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            yield* walkMjs(full);
        } else if (entry.isFile() && entry.name.endsWith(".mjs")) {
            yield full;
        }
    }
}

let checked = 0;
let failed = 0;

for (const checkDir of CHECK_DIRS) {
    const abs = join(ROOT, checkDir);
    for (const file of walkMjs(abs)) {
        const rel = relative(ROOT, file);
        try {
            execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
            checked++;
        } catch (err) {
            const message = err.stderr?.toString().trim() ?? err.message;
            console.error(`\nSyntax error in ${rel}:\n${message}\n`);
            failed++;
        }
    }
}

if (failed > 0) {
    console.error(`Syntax check failed: ${failed} file(s) have errors (${checked} OK).`);
    process.exit(1);
} else {
    console.log(`Syntax OK — ${checked} file(s) checked.`);
}
