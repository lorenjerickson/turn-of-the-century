import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    getDocumentApplications,
    getSettingsConfigClass,
    renderFoundryApplication,
    requireActorSheetV2,
    requireApplicationV2,
    requireFilePicker,
    requireItemSheetV2,
    requireSceneDocumentClass
} from "../module/foundry-v14-runtime.mjs";

const originalFilePickerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "FilePicker");
const originalSceneDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Scene");

afterEach(() => {
    if (originalFilePickerDescriptor) {
        Object.defineProperty(globalThis, "FilePicker", originalFilePickerDescriptor);
    } else {
        delete globalThis.FilePicker;
    }

    if (originalSceneDescriptor) {
        Object.defineProperty(globalThis, "Scene", originalSceneDescriptor);
    } else {
        delete globalThis.Scene;
    }
});

describe("Foundry V14 runtime adapter", () => {
    it("finds namespaced Application V2 and sheet classes", () => {
        class ApplicationV2 {}
        class ActorSheetV2 {}
        class ItemSheetV2 {}
        const foundry = {
            applications: {
                api: { ApplicationV2 },
                sheets: { ActorSheetV2, ItemSheetV2 }
            }
        };

        assert.equal(requireApplicationV2({ foundry }), ApplicationV2);
        assert.equal(requireActorSheetV2({ foundry }), ActorSheetV2);
        assert.equal(requireItemSheetV2({ foundry }), ItemSheetV2);
    });

    it("rejects legacy-only sheet APIs", () => {
        const foundry = {
            applications: {
                sheets: {
                    ActorSheet: class LegacyActorSheet {},
                    ItemSheet: class LegacyItemSheet {}
                }
            }
        };

        assert.throws(() => requireActorSheetV2({ foundry }), /ActorSheetV2/);
        assert.throws(() => requireItemSheetV2({ foundry }), /ItemSheetV2/);
    });

    it("uses namespaced FilePicker without touching the deprecated global", () => {
        Object.defineProperty(globalThis, "FilePicker", {
            configurable: true,
            get() {
                throw new Error("deprecated global FilePicker was accessed");
            }
        });
        const implementation = { upload: async () => ({}) };
        const foundry = {
            applications: {
                apps: {
                    FilePicker: { implementation }
                }
            }
        };

        assert.equal(requireFilePicker({ foundry }), implementation);
    });

    it("uses the namespaced Scene document class without touching the deprecated global", () => {
        Object.defineProperty(globalThis, "Scene", {
            configurable: true,
            get() {
                throw new Error("deprecated global Scene was accessed");
            }
        });
        class SceneDocument {}

        assert.equal(requireSceneDocumentClass({
            foundry: {
                documents: { Scene: SceneDocument }
            }
        }), SceneDocument);
    });

    it("resolves SettingsConfig from the V14 applications namespace", () => {
        class SettingsConfig {}

        assert.equal(getSettingsConfigClass({
            foundry: {
                applications: {
                    apps: { SettingsConfig }
                }
            }
        }), SettingsConfig);
    });

    it("renders applications with V2 force options", () => {
        let renderOptions = null;
        const rendered = renderFoundryApplication({
            render: (options) => {
                renderOptions = options;
            }
        }, { force: true });

        assert.equal(rendered, true);
        assert.deepEqual(renderOptions, { force: true });
    });

    it("returns document-owned applications", () => {
        const sheet = {};
        const popout = {};

        assert.deepEqual(getDocumentApplications({
            apps: { sheet, popout }
        }), [sheet, popout]);
    });
});
