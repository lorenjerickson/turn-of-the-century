import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const PACKAGE_ROOT = path.join(ROOT, "node_modules", "dockview");
const CORE_PACKAGE_ROOT = path.join(ROOT, "node_modules", "dockview-core");
const VENDOR_ROOT = path.join(ROOT, "module", "vendor", "dockview");
const CORE_VENDOR_MODULE = "./dockview-core.esm.mjs";

const FILES = Object.freeze([
    {
        from: path.join(PACKAGE_ROOT, "dist", "package", "main.esm.mjs"),
        to: path.join(VENDOR_ROOT, "main.esm.mjs"),
        transform: (source) => source.replaceAll("'dockview-core'", `"${CORE_VENDOR_MODULE}"`)
    },
    {
        from: path.join(CORE_PACKAGE_ROOT, "dist", "package", "main.esm.mjs"),
        to: path.join(VENDOR_ROOT, "dockview-core.esm.mjs")
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
    if (file.transform) {
        fs.writeFileSync(file.to, file.transform(fs.readFileSync(file.from, "utf8")));
    } else {
        fs.copyFileSync(file.from, file.to);
    }
}

console.log(`Vendored Dockview assets to ${path.relative(ROOT, VENDOR_ROOT)}`);
