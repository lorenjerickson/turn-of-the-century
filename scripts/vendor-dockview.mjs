import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const PACKAGE_ROOT = path.join(ROOT, "node_modules", "dockview-core");
const VENDOR_ROOT = path.join(ROOT, "module", "vendor", "dockview");

const FILES = Object.freeze([
    {
        from: path.join(PACKAGE_ROOT, "dist", "package", "main.esm.mjs"),
        to: path.join(VENDOR_ROOT, "main.esm.mjs")
    },
    {
        from: path.join(PACKAGE_ROOT, "dist", "styles", "dockview.css"),
        to: path.join(VENDOR_ROOT, "dockview.css")
    }
]);

fs.mkdirSync(VENDOR_ROOT, { recursive: true });

for (const file of FILES) {
    if (!fs.existsSync(file.from)) {
        throw new Error(`Dockview vendor source is missing: ${path.relative(ROOT, file.from)}`);
    }
    fs.copyFileSync(file.from, file.to);
}

console.log(`Vendored Dockview assets to ${path.relative(ROOT, VENDOR_ROOT)}`);

