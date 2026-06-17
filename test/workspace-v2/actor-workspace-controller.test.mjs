import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ActorWorkspaceController } from "../../module/ui/workspace-v2/controllers/actor-workspace-controller.mjs";

describe("ActorWorkspaceController", () => {
    it("loads actor details for the double-clicked actor list entry", async () => {
        let opened = 0;
        const actors = new Map([
            ["a", { id: "a", type: "hero" }],
            ["b", { id: "b", type: "pawn" }]
        ]);
        const listeners = new Map();
        const entry = {
            dataset: { actorId: "b" },
            addEventListener: (type, handler) => listeners.set(type, handler)
        };
        const root = {
            querySelectorAll: (selector) => selector === "[data-actor-list-draggable='true']" ? [entry] : []
        };

        const controller = new ActorWorkspaceController({
            getActorById: (id) => actors.get(id),
            openActorEditor: async () => {
                opened += 1;
            }
        });

        controller.wireHandlers(root);
        const onDoubleClick = listeners.get("dblclick");
        assert.equal(typeof onDoubleClick, "function");

        await onDoubleClick({
            target: { closest: () => null },
            preventDefault: () => {},
            stopPropagation: () => {}
        });

        assert.equal(controller.state.editorState.mode, "edit");
        assert.equal(controller.state.editorState.actorId, "b");
        assert.equal(controller.state.editorState.actorType, "pawn");
        assert.equal(opened, 1);
    });

    it("ignores actor row double-clicks that originate from the selection checkbox", async () => {
        let opened = 0;
        const listeners = new Map();
        const entry = {
            dataset: { actorId: "a" },
            addEventListener: (type, handler) => listeners.set(type, handler)
        };
        const root = {
            querySelectorAll: (selector) => selector === "[data-actor-list-draggable='true']" ? [entry] : []
        };

        const controller = new ActorWorkspaceController({
            getActorById: (id) => ({ id, type: "hero" }),
            openActorEditor: async () => {
                opened += 1;
            }
        });

        controller.wireHandlers(root);
        const onDoubleClick = listeners.get("dblclick");

        await onDoubleClick({
            target: { closest: (selector) => selector === "[data-action='actor-list-toggle-selected']" ? {} : null },
            preventDefault: () => {
                throw new Error("Should not prevent default for checkbox-origin double-click.");
            },
            stopPropagation: () => {
                throw new Error("Should not stop propagation for checkbox-origin double-click.");
            }
        });

        assert.equal(opened, 0);
        assert.equal(controller.state.editorState.actorId, "");
    });

    it("owns actor list filter, selection, and editor state transitions", async () => {
        let opened = 0;
        const actors = new Map([["a", { id: "a", type: "hero" }]]);
        const controller = new ActorWorkspaceController({
            getActorById: (id) => actors.get(id),
            openActorEditor: async () => {
                opened += 1;
            }
        });

        controller.setSearchQuery("ada");
        controller.setTypeFilter("hero");
        controller.toggleSelectedActor("a", true);
        controller.beginCreate();
        await controller.openActorEditor();
        assert.equal(controller.openDetails("a"), true);

        assert.equal(controller.state.searchQuery, "ada");
        assert.equal(controller.state.typeFilter, "hero");
        assert.deepEqual([...controller.getSelectedActorIds()], ["a"]);
        assert.equal(controller.state.editorState.mode, "edit");
        assert.equal(controller.state.editorState.actorId, "a");
        assert.equal(controller.state.editorState.actorType, "hero");
        assert.equal(opened, 1);

        controller.clearDetails();
        assert.equal(controller.state.editorState.mode, "empty");
        assert.equal(controller.state.editorState.actorId, "");
        assert.equal(controller.state.editorState.dirty, false);
    });

    it("generates actors through injected services and updates editor status", async () => {
        const renderCalls = [];
        let generatedPrompt = "";
        let createdData = null;
        const controller = new ActorWorkspaceController({
            generate: async (prompt) => {
                generatedPrompt = prompt;
                return { name: "Generated Ada" };
            },
            createActor: async (data) => {
                createdData = data;
                return { id: "actor-1", type: "pawn", name: data.name };
            },
            buildGeneratedActorDocumentData: (result, actorType) => ({ name: result.name, type: actorType }),
            render: () => renderCalls.push("render")
        });

        controller.beginCreate();
        controller.setCreateActorType("pawn");
        controller.setCreatePrompt("Make a useful contact.");
        await controller.generateActor();

        assert.equal(generatedPrompt, "Make a useful contact.");
        assert.deepEqual(createdData, { name: "Generated Ada", type: "pawn" });
        assert.equal(controller.state.editorState.mode, "edit");
        assert.equal(controller.state.editorState.actorId, "actor-1");
        assert.equal(controller.state.editorState.status, "Created Generated Ada.");
        assert.equal(renderCalls.length, 2);
    });

    it("saves actor forms through injected form normalization", async () => {
        const originalFormData = globalThis.FormData;
        const originalGame = globalThis.game;
        const originalConst = globalThis.CONST;
        let updatedData = null;
        const actor = {
            id: "a",
            type: "hero",
            ownership: {
                gm: 3,
                playerA: 3,
                playerB: 0
            },
            async update(data) {
                updatedData = data;
            }
        };
        globalThis.FormData = class FakeFormData {
            constructor(form) {
                this.form = form;
            }

            get(key) {
                return this.form[key];
            }
        };

        try {
            globalThis.CONST = {
                DOCUMENT_OWNERSHIP_LEVELS: {
                    NONE: 0,
                    OWNER: 3
                }
            };
            globalThis.game = {
                user: { isGM: true },
                users: {
                    contents: [
                        { id: "gm", isGM: true },
                        { id: "playerA", isGM: false },
                        { id: "playerB", isGM: false }
                    ]
                }
            };

            const controller = new ActorWorkspaceController({
                getActorById: () => actor,
                buildActorUpdateDataFromFormData: () => ({ name: "Saved Ada" })
            });
            controller.openDetails("a");
            await controller.saveActorForm({ actorId: "a", __ownerUserId: "playerB" });

            assert.deepEqual(updatedData, {
                name: "Saved Ada",
                ownership: {
                    gm: 3,
                    playerA: 0,
                    playerB: 3
                }
            });
            assert.equal(controller.state.editorState.status, "Actor saved.");
            assert.equal(controller.state.editorState.dirty, false);
        } finally {
            globalThis.FormData = originalFormData;
            globalThis.game = originalGame;
            globalThis.CONST = originalConst;
        }
    });

    it("saves owner assignment immediately when the dropdown changes", async () => {
        const listeners = new Map();
        const savedForms = [];
        const form = { actorId: "a", __ownerUserId: "playerB" };
        const ownerSelect = {
            closest: (selector) => selector === "form" ? form : null,
            addEventListener: (type, handler) => listeners.set(type, handler)
        };
        const root = {
            querySelectorAll: (selector) => {
                if (selector === "[data-action='actor-editor-field']") return [];
                if (selector === "[data-action='actor-editor-owner-assignment']") return [ownerSelect];
                return [];
            }
        };

        const controller = new ActorWorkspaceController();
        controller.saveActorForm = async (targetForm) => {
            savedForms.push(targetForm);
        };

        controller.wireHandlers(root);
        const onChange = listeners.get("change");
        assert.equal(typeof onChange, "function");

        let propagationStopped = false;
        await onChange({
            stopPropagation: () => {
                propagationStopped = true;
            }
        });

        assert.equal(propagationStopped, true);
        assert.deepEqual(savedForms, [form]);
    });
});
