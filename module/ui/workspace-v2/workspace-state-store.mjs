import {
    WORKSPACE_V2_FLAG_SCOPE,
    WORKSPACE_V2_LAYOUT_FLAG,
    WORKSPACE_V2_POLICY_SETTINGS
} from "./constants.mjs";

export function registerWorkspaceV2PolicySettings(systemId, handlers = {}) {
    game.settings.register(systemId, WORKSPACE_V2_POLICY_SETTINGS.enabled, {
        name: "Enable Workspace V2",
        hint: "Opt-in switch for the new Application V2 workspace runtime.",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: async (enabled) => {
            await handlers.onEnabledChange?.(Boolean(enabled));
        }
    });

    game.settings.register(systemId, WORKSPACE_V2_POLICY_SETTINGS.debugGovernance, {
        name: "Workspace V2 governance debug",
        hint: "Log UI region governance diagnostics in the browser console.",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: async (enabled) => {
            await handlers.onDebugChange?.(Boolean(enabled));
        }
    });
}

export class WorkspaceStateStore {
    constructor({ systemId }) {
        this.systemId = systemId;
    }

    getPolicy() {
        return {
            enabled: Boolean(game.settings.get(this.systemId, WORKSPACE_V2_POLICY_SETTINGS.enabled)),
            debugGovernance: Boolean(game.settings.get(this.systemId, WORKSPACE_V2_POLICY_SETTINGS.debugGovernance))
        };
    }

    async setPolicyPatch(patch = {}) {
        if (Object.hasOwn(patch, "enabled")) {
            await game.settings.set(this.systemId, WORKSPACE_V2_POLICY_SETTINGS.enabled, Boolean(patch.enabled));
        }

        if (Object.hasOwn(patch, "debugGovernance")) {
            await game.settings.set(this.systemId, WORKSPACE_V2_POLICY_SETTINGS.debugGovernance, Boolean(patch.debugGovernance));
        }

        return this.getPolicy();
    }

    getUserLayout() {
        return foundry.utils.deepClone(game.user?.getFlag(this.systemId, WORKSPACE_V2_FLAG_SCOPE)?.[WORKSPACE_V2_LAYOUT_FLAG] ?? null);
    }

    async setUserLayout(layout) {
        const current = foundry.utils.deepClone(game.user?.getFlag(this.systemId, WORKSPACE_V2_FLAG_SCOPE) ?? {});
        current[WORKSPACE_V2_LAYOUT_FLAG] = foundry.utils.deepClone(layout ?? null);
        await game.user?.setFlag(this.systemId, WORKSPACE_V2_FLAG_SCOPE, current);
        return this.getUserLayout();
    }

    async clearUserLayout() {
        const current = foundry.utils.deepClone(game.user?.getFlag(this.systemId, WORKSPACE_V2_FLAG_SCOPE) ?? {});
        delete current[WORKSPACE_V2_LAYOUT_FLAG];
        await game.user?.setFlag(this.systemId, WORKSPACE_V2_FLAG_SCOPE, current);
        return null;
    }

    getUserScopedState(key, normalizer = (value) => value) {
        const stateKey = String(key ?? "").trim();
        if (!stateKey) return normalizer(null);
        const flags = game.user?.getFlag(this.systemId, WORKSPACE_V2_FLAG_SCOPE) ?? {};
        return normalizer(foundry.utils.deepClone(flags[stateKey] ?? {}));
    }

    async setUserScopedStatePatch(key, patch = {}, normalizer = (value) => value) {
        const stateKey = String(key ?? "").trim();
        if (!stateKey) return normalizer(null);

        const current = foundry.utils.deepClone(game.user?.getFlag(this.systemId, WORKSPACE_V2_FLAG_SCOPE) ?? {});
        current[stateKey] = normalizer({
            ...(current[stateKey] ?? {}),
            ...patch
        });
        await game.user?.setFlag(this.systemId, WORKSPACE_V2_FLAG_SCOPE, current);
        return this.getUserScopedState(stateKey, normalizer);
    }
}
