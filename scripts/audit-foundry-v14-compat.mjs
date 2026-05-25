import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SOURCE_ROOTS = ["module"];
const EXTRA_FILES = ["turn-of-the-century.mjs"];

const BANNED_PATTERNS = [
    { name: "global FilePicker", pattern: /globalThis\.FilePicker|\bwindow\.FilePicker\b/ },
    { name: "global Scene document class", pattern: /globalThis\.Scene|\bwindow\.Scene\b/ },
    { name: "Application V1 class", pattern: /\bApplicationV1\b|\bFormApplication\b/ },
    { name: "legacy ActorSheet class", pattern: /foundry\.applications\??\.sheets\??\.ActorSheet(?!V2)/ },
    { name: "legacy ItemSheet class", pattern: /foundry\.applications\??\.sheets\??\.ItemSheet(?!V2)/ },
    { name: "ui.windows registry", pattern: /\bui\.windows\b/ },
    { name: "deprecated scene darkness getter", pattern: /\bscene\??\.darkness\b/ },
    { name: "legacy scene image getter", pattern: /\bscene\??\.img\b/ },
    { name: "legacy scene grid offset", pattern: /grid\.offset/ },
    { name: "Application V1 activateListeners", pattern: /\bactivateListeners\s*\(/ },
    { name: "Application V1 getData", pattern: /^\s*(?:async\s+)?getData\s*\(/ },
    { name: "renderPopout fallback", pattern: /\brenderPopout\s*\(/ }
];

function listMjsFiles(dir) {
    const abs = path.join(ROOT, dir);
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    return entries.flatMap((entry) => {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) return listMjsFiles(rel);
        return entry.isFile() && rel.endsWith(".mjs") ? [rel] : [];
    });
}

const files = [
    ...SOURCE_ROOTS.flatMap(listMjsFiles),
    ...EXTRA_FILES
];

const violations = [];
for (const file of files) {
    const abs = path.join(ROOT, file);
    const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
        for (const rule of BANNED_PATTERNS) {
            if (rule.pattern.test(line)) {
                violations.push({
                    file,
                    line: index + 1,
                    rule: rule.name,
                    text: line.trim()
                });
            }
            rule.pattern.lastIndex = 0;
        }
    });
}

if (violations.length) {
    console.error("Foundry V14 compatibility audit failed:");
    for (const violation of violations) {
        console.error(`${violation.file}:${violation.line} [${violation.rule}] ${violation.text}`);
    }
    process.exit(1);
}

console.log(`Foundry V14 compatibility audit OK - ${files.length} source file(s) checked.`);
