import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    getDocumentApplications,
    getSettingsConfigClass,
    renderFoundryApplication,
    requireActorDocumentClass,
    requireActorSheetV2,
    requireApplicationV2,
    requireCombatDocumentClass,
    requireFilePicker,
    requireFolderDocumentClass,
    requireItemDocumentClass,
    requireItemSheetV2,
    requireSceneDocumentClass
} from "../module/foundry-v14-runtime.mjs";

const originalFilePickerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "FilePicker");
const originalSceneDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Scene");
const originalActorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Actor");
const originalItemDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Item");
const originalCombatDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Combat");
const originalFolderDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Folder");

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

    for (const [name, descriptor] of [
        ["Actor", originalActorDescriptor],
        ["Item", originalItemDescriptor],
        ["Combat", originalCombatDescriptor],
        ["Folder", originalFolderDescriptor]
    ]) {
        if (descriptor) {
            Object.defineProperty(globalThis, name, descriptor);
        } else {
            delete globalThis[name];
        }
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

    it("uses namespaced document classes without touching deprecated globals", () => {
        for (const name of ["Actor", "Item", "Combat", "Folder"]) {
            Object.defineProperty(globalThis, name, {
                configurable: true,
                get() {
                    throw new Error(`deprecated global ${name} was accessed`);
                }
            });
        }
        class ActorDocument {}
        class ItemDocument {}
        class CombatDocument {}
        class FolderDocument {}
        const foundry = {
            documents: {
                Actor: ActorDocument,
                Item: ItemDocument,
                Combat: CombatDocument,
                Folder: FolderDocument
            }
        };

        assert.equal(requireActorDocumentClass({ foundry }), ActorDocument);
        assert.equal(requireItemDocumentClass({ foundry }), ItemDocument);
        assert.equal(requireCombatDocumentClass({ foundry }), CombatDocument);
        assert.equal(requireFolderDocumentClass({ foundry }), FolderDocument);
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
