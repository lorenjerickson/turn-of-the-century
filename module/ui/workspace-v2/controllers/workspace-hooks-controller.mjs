export class WorkspaceHooksController {
    constructor({ hooks = globalThis.Hooks, gameReady = () => false, onCompendiumReady = () => {} } = {}) {
        this.hooks = hooks;
        this.gameReady = gameReady;
        this.onCompendiumReady = onCompendiumReady;
        this.families = new Map();
        this.boundFamilies = new Set();
    }

    registerFamily(name, entries = []) {
        const safeName = String(name ?? "").trim();
        if (!safeName) return;
        this.families.set(safeName, Array.from(entries ?? []).filter((entry) => entry?.event && typeof entry.handler === "function"));
    }

    bindFamily(name) {
        const safeName = String(name ?? "").trim();
        if (!safeName || this.boundFamilies.has(safeName)) return;
        if (safeName === "compendium") this.#bindCompendiumStartup();
        for (const { event, handler } of this.families.get(safeName) ?? []) {
            this.hooks?.on?.(event, handler);
        }
        this.boundFamilies.add(safeName);
    }

    unbindFamily(name) {
        const safeName = String(name ?? "").trim();
        if (!safeName || !this.boundFamilies.has(safeName)) return;
        for (const { event, handler } of this.families.get(safeName) ?? []) {
            this.hooks?.off?.(event, handler);
        }
        this.boundFamilies.delete(safeName);
    }

    bindAll() {
        for (const name of this.families.keys()) this.bindFamily(name);
    }

    unbindAll() {
        for (const name of [...this.boundFamilies].reverse()) this.unbindFamily(name);
    }

    isBound(name) {
        return this.boundFamilies.has(String(name ?? "").trim());
    }

    #bindCompendiumStartup() {
        if (this.gameReady()) {
            this.onCompendiumReady();
        } else {
            this.hooks?.once?.("ready", this.onCompendiumReady);
        }
    }
}
