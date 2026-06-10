import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
    buildLoggingPanelModel,
    formatLoggingPanelEntriesForClipboard,
    renderLoggingPanel
} from "../../module/ui/workspace-v2/panels/logging-panel.mjs";

const rootDir = new URL("../..", import.meta.url).pathname;
const workspaceRootSource = readFileSync(join(rootDir, "module/ui/workspace-v2/workspace-root-app.mjs"), "utf8");

describe("Debug logging panel", () => {
    it("renders a copy button for populated logs", () => {
        const model = buildLoggingPanelModel({
            entries: [{
                ts: "12:00:00.001",
                level: "info",
                message: "Scene actor tokens created",
                data: { tokenCount: 2 }
            }]
        });

        const html = renderLoggingPanel(model);

        assert.match(html, /data-action="logging-copy"/);
        assert.doesNotMatch(html, /data-action="logging-copy" disabled/);
        assert.match(html, /data-action="logging-clear"/);
    });

    it("disables copy when the log is empty", () => {
        const html = renderLoggingPanel(buildLoggingPanelModel({ entries: [] }));

        assert.match(html, /data-action="logging-copy" disabled/);
    });

    it("formats complete log entries for clipboard copying", () => {
        const text = formatLoggingPanelEntriesForClipboard([
            {
                ts: "12:00:00.001",
                level: "warn",
                message: "Workspace actor drop captured",
                data: { hasSceneDropTarget: false, dataTransferTypes: ["text/plain"] }
            },
            {
                ts: "12:00:01.002",
                level: "info",
                message: "Scene actor tokens created",
                data: { sceneName: "Rookery Yard", tokenCount: 2 }
            }
        ]);

        assert.match(text, /\[12:00:00\.001\] WARN Workspace actor drop captured/);
        assert.match(text, /"hasSceneDropTarget": false/);
        assert.match(text, /"dataTransferTypes": \[\n    "text\/plain"\n  \]/);
        assert.match(text, /\[12:00:01\.002\] INFO Scene actor tokens created/);
        assert.match(text, /"tokenCount": 2/);
    });

    it("wires the copy button to clipboard text", () => {
        assert.match(workspaceRootSource, /\[data-action='logging-copy'\]/);
        assert.match(workspaceRootSource, /formatLoggingPanelEntriesForClipboard\(totcLogger\.getEntries\(\)\)/);
        assert.match(workspaceRootSource, /navigator\?\.clipboard\?\.writeText/);
    });
});
