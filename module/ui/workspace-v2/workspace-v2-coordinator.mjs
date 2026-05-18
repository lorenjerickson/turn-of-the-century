import { UiRegionGovernor } from "./ui-region-governor.mjs";
import { WorkspaceRootApp } from "./workspace-root-app.mjs";
import { WorkspaceStateStore } from "./workspace-state-store.mjs";

export class WorkspaceV2Coordinator {
    constructor({ systemId }) {
        this.systemId = systemId;
        this.stateStore = new WorkspaceStateStore({ systemId });
        this.governor = null;
        this.rootApp = null;
        this.running = false;
    }

    async initialize() {
        const policy = this.stateStore.getPolicy();
        if (!policy.enabled) return;
        await this.start();
    }

    async start() {
        if (this.running) return;

        const policy = this.stateStore.getPolicy();
        if (!WorkspaceRootApp.isSupported) {
            ui.notifications?.warn("Workspace V2 requires Foundry Application V2 support.");
            return;
        }

        this.governor = new UiRegionGovernor({
            systemId: this.systemId,
            debug: policy.debugGovernance
        });
        this.governor.start();

        this.rootApp = new WorkspaceRootApp({
            stateStore: this.stateStore,
            governor: this.governor
        });
        await this.rootApp.render({ force: true, focus: true });
        this.running = true;
    }

    async stop() {
        if (this.rootApp?.rendered) {
            await this.rootApp.close();
        }

        this.governor?.stop();
        this.rootApp = null;
        this.governor = null;
        this.running = false;
    }

    async setEnabled(enabled) {
        await this.stateStore.setPolicyPatch({ enabled: Boolean(enabled) });

        if (enabled) {
            await this.start();
        } else {
            await this.stop();
        }
    }

    async setDebugGovernance(enabled) {
        await this.stateStore.setPolicyPatch({ debugGovernance: Boolean(enabled) });
        this.governor?.setDebug(Boolean(enabled));
    }

    auditRegions() {
        return this.governor?.audit?.() ?? {
            active: false,
            hiddenCount: 0,
            rows: []
        };
    }

    getStatus() {
        const policy = this.stateStore.getPolicy();
        return {
            enabledSetting: policy.enabled,
            debugGovernance: policy.debugGovernance,
            running: this.running,
            supported: WorkspaceRootApp.isSupported
        };
    }

    async shutdown() {
        await this.stop();
    }
}
