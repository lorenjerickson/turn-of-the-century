import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SceneActorDropController } from "../../module/ui/workspace-v2/controllers/scene-actor-drop-controller.mjs";

function actor(id, type = "pawn", name = id) {
    return { id, type, name, img: `${id}.webp` };
}

class FakeClassList {
    constructor() {
        this.values = new Set();
    }

    add(value) {
        this.values.add(value);
    }

    remove(value) {
        this.values.delete(value);
    }

    contains(value) {
        return this.values.has(value);
    }

    toggle(value, force = undefined) {
        const shouldAdd = force ?? !this.contains(value);
        if (shouldAdd) this.add(value);
        else this.remove(value);
        return shouldAdd;
    }
}

class FakeElement {
    constructor() {
        this.attributes = {};
        this.children = [];
        this.classList = new FakeClassList();
        this.dataset = {};
        this.listeners = {};
        this.style = {};
        this.innerHTML = "";
    }

    addEventListener(type, listener) {
        this.listeners[type] ??= [];
        this.listeners[type].push(listener);
    }

    append(child) {
        this.children.push(child);
    }

    contains(node) {
        return node === this || this.children.includes(node);
    }

    querySelector() {
        return null;
    }

    querySelectorAll() {
        return [];
    }

    remove() {
        this.removed = true;
    }

    setAttribute(name, value) {
        this.attributes[name] = value;
    }
}

class FakeImageElement extends FakeElement {
    constructor() {
        super();
        this.naturalWidth = 1000;
        this.naturalHeight = 800;
    }
}

function fakeDragEvent(dataTransfer, extra = {}) {
    return {
        dataTransfer,
        prevented: false,
        stopped: false,
        preventDefault() {
            this.prevented = true;
        },
        stopPropagation() {
            this.stopped = true;
        },
        ...extra
    };
}

describe("SceneActorDropController", () => {
    it("creates scene tokens through the extracted placement workflow", async () => {
        const statuses = [];
        let renderCount = 0;
        let createdType = "";
        let createdTokens = [];
        const scene = {
            name: "Rookery Yard",
            width: 1000,
            height: 800,
            grid: { size: 100 },
            tokens: { contents: [] },
            async createEmbeddedDocuments(type, documents) {
                createdType = type;
                createdTokens = documents;
                return documents;
            }
        };
        const controller = new SceneActorDropController({
            setScenePropertiesState: (patch) => statuses.push(patch),
            render: () => {
                renderCount += 1;
            },
            logger: { error: () => {} }
        });

        await controller.addActorsToScene([actor("a", "hero", "Ada"), actor("p", "pawn", "Porter")], {
            scene,
            anchorPosition: { x: 120, y: 240 }
        });

        assert.equal(createdType, "Token");
        assert.deepEqual(createdTokens.map((token) => ({ actorId: token.actorId, x: token.x, y: token.y })), [
            { actorId: "a", x: 100, y: 200 },
            { actorId: "p", x: 200, y: 200 }
        ]);
        assert.deepEqual(statuses.at(-1), {
            status: "Added 2 actors to Rookery Yard.",
            error: ""
        });
        assert.equal(renderCount, 1);
    });

    it("reports placement errors through injected state and render callbacks", async () => {
        const statuses = [];
        let renderCount = 0;
        const controller = new SceneActorDropController({
            setScenePropertiesState: (patch) => statuses.push(patch),
            render: () => {
                renderCount += 1;
            },
            logger: { error: () => {} }
        });

        await controller.addActorsToScene([actor("a", "hero", "Ada")], {
            scene: { name: "Broken Scene" }
        });

        assert.deepEqual(statuses.at(-1), {
            status: "",
            error: "Actor placement failed - see console."
        });
        assert.equal(renderCount, 1);
    });

    it("falls back to the injected scene when no explicit scene is supplied", async () => {
        let created = false;
        const fallbackScene = {
            name: "Fallback Scene",
            width: 1000,
            height: 800,
            grid: { size: 100 },
            tokens: { contents: [] },
            async createEmbeddedDocuments() {
                created = true;
                return [];
            }
        };
        const controller = new SceneActorDropController({
            getFallbackScene: () => fallbackScene,
            render: () => {}
        });

        await controller.addActorsToScene([actor("a", "hero", "Ada")]);

        assert.equal(created, true);
    });

    it("uses the active actor drag payload when dragover and drop cannot read custom data", async () => {
        const originalHTMLElement = globalThis.HTMLElement;
        const originalHTMLImageElement = globalThis.HTMLImageElement;
        globalThis.HTMLElement = FakeElement;
        globalThis.HTMLImageElement = FakeImageElement;

        try {
            const row = new FakeElement();
            row.dataset.actorId = "a";
            const target = new FakeElement();
            target.dataset.mapViewport = "true";
            target.dataset.sceneId = "scene-1";
            const layer = new FakeElement();
            const image = new FakeImageElement();
            const root = new FakeElement();
            const actorsById = new Map([
                ["a", actor("a", "hero", "Ada")],
                ["b", actor("b", "pawn", "Porter")],
                ["c", actor("c", "villain", "Moriarty")]
            ]);
            let createdTokens = [];
            const scene = {
                id: "scene-1",
                name: "Rookery Yard",
                width: 1000,
                height: 800,
                grid: { size: 100 },
                tokens: { contents: [] },
                async createEmbeddedDocuments(type, documents) {
                    assert.equal(type, "Token");
                    createdTokens = documents;
                    return documents;
                }
            };

            root.querySelectorAll = (selector) => {
                if (selector === "[data-actor-list-draggable='true']") return [row];
                if (selector === "[data-scene-actor-drop-target='true']") return [target];
                if (selector === "[data-actor-drop-preview='true']") return [layer];
                if (selector === "[data-scene-actor-drop-target].is-actor-drop-target") {
                    return target.classList.contains("is-actor-drop-target") ? [target] : [];
                }
                return [];
            };
            target.querySelector = (selector) => {
                if (selector === "[data-actor-drop-preview='true']") return layer;
                if (selector === "[data-action='map-image']") return image;
                return null;
            };

            const controller = new SceneActorDropController({
                getRoot: () => root,
                getSelectedActorIds: () => new Set(["a", "b", "c"]),
                getActorById: (id) => actorsById.get(id),
                getSceneById: () => scene,
                getImageSpacePoint: () => ({ x: 120, y: 240 }),
                documentRef: () => ({
                    body: new FakeElement(),
                    createElement: (tag) => tag === "img" ? new FakeImageElement() : new FakeElement()
                }),
                render: () => {},
                logger: { error: () => {} }
            });
            controller.wireActorListDragHandlers(root);
            controller.wireSceneActorDropHandlers(root);

            const storedData = new Map();
            const dragStartDataTransfer = {
                types: [],
                setData: (type, value) => storedData.set(type, value),
                getData: () => "",
                setDragImage: () => {},
                effectAllowed: "",
                dropEffect: ""
            };
            row.listeners.dragstart[0](fakeDragEvent(dragStartDataTransfer));

            const dragOverDataTransfer = {
                types: [],
                getData: () => "",
                dropEffect: ""
            };
            const dragOverEvent = fakeDragEvent(dragOverDataTransfer);
            target.listeners.dragover[0](dragOverEvent);

            assert.equal(dragOverEvent.prevented, true);
            assert.equal(target.classList.contains("is-actor-drop-target"), true);
            assert.equal(layer.classList.contains("has-preview"), true);
            assert.equal((layer.innerHTML.match(/<span class="totc-v2-map-panel__actor-drop-square/g) ?? []).length, 3);
            assert.match(layer.innerHTML, /left:100px;top:200px;width:100px;height:100px/);
            assert.match(layer.innerHTML, /left:200px;top:200px;width:100px;height:100px/);
            assert.match(layer.innerHTML, /left:100px;top:300px;width:100px;height:100px/);

            const dropEvent = fakeDragEvent({
                types: [],
                getData: () => ""
            });
            await target.listeners.drop[0](dropEvent);

            assert.equal(dropEvent.prevented, true);
            assert.deepEqual(createdTokens.map((token) => ({ actorId: token.actorId, x: token.x, y: token.y })), [
                { actorId: "a", x: 100, y: 200 },
                { actorId: "b", x: 200, y: 200 },
                { actorId: "c", x: 100, y: 300 }
            ]);
            assert.equal(layer.innerHTML, "");
        } finally {
            globalThis.HTMLElement = originalHTMLElement;
            globalThis.HTMLImageElement = originalHTMLImageElement;
        }
    });

    it("creates scene tokens from the actor list text/plain fallback payload", async () => {
        const originalHTMLElement = globalThis.HTMLElement;
        const originalHTMLImageElement = globalThis.HTMLImageElement;
        globalThis.HTMLElement = FakeElement;
        globalThis.HTMLImageElement = FakeImageElement;

        try {
            const target = new FakeElement();
            target.dataset.mapViewport = "true";
            target.dataset.sceneId = "scene-1";
            const layer = new FakeElement();
            const image = new FakeImageElement();
            const root = new FakeElement();
            const actorsById = new Map([
                ["a", actor("a", "hero", "Ada")],
                ["b", actor("b", "pawn", "Porter")]
            ]);
            let createdTokens = [];
            const scene = {
                id: "scene-1",
                name: "Rookery Yard",
                width: 1000,
                height: 800,
                grid: { size: 100 },
                tokens: { contents: [] },
                async createEmbeddedDocuments(type, documents) {
                    assert.equal(type, "Token");
                    createdTokens = documents;
                    return documents;
                }
            };

            root.querySelectorAll = (selector) => {
                if (selector === "[data-scene-actor-drop-target='true']") return [target];
                if (selector === "[data-actor-drop-preview='true']") return [layer];
                if (selector === "[data-scene-actor-drop-target].is-actor-drop-target") {
                    return target.classList.contains("is-actor-drop-target") ? [target] : [];
                }
                return [];
            };
            target.querySelector = (selector) => {
                if (selector === "[data-actor-drop-preview='true']") return layer;
                if (selector === "[data-action='map-image']") return image;
                return null;
            };

            const controller = new SceneActorDropController({
                getRoot: () => root,
                getActorById: (id) => actorsById.get(id),
                getSceneById: () => scene,
                getImageSpacePoint: () => ({ x: 120, y: 240 }),
                render: () => {},
                logger: { error: () => {} }
            });
            controller.wireSceneActorDropHandlers(root);

            const dataTransfer = {
                types: ["text/plain"],
                getData: (type) => type === "text/plain" ? "a,b" : "",
                dropEffect: ""
            };
            const dragOverEvent = fakeDragEvent(dataTransfer);
            target.listeners.dragover[0](dragOverEvent);

            assert.equal(dragOverEvent.prevented, true);
            assert.equal(layer.classList.contains("has-preview"), true);
            assert.equal((layer.innerHTML.match(/<span class="totc-v2-map-panel__actor-drop-square/g) ?? []).length, 2);

            const dropEvent = fakeDragEvent(dataTransfer);
            await target.listeners.drop[0](dropEvent);

            assert.equal(dropEvent.prevented, true);
            assert.deepEqual(createdTokens.map((token) => ({ actorId: token.actorId, x: token.x, y: token.y })), [
                { actorId: "a", x: 100, y: 200 },
                { actorId: "b", x: 200, y: 200 }
            ]);
        } finally {
            globalThis.HTMLElement = originalHTMLElement;
            globalThis.HTMLImageElement = originalHTMLImageElement;
        }
    });

    it("renders drop previews for DOM-like elements from another realm", () => {
        const originalHTMLElement = globalThis.HTMLElement;
        const originalHTMLImageElement = globalThis.HTMLImageElement;
        globalThis.HTMLElement = class OtherRealmElement {};
        globalThis.HTMLImageElement = class OtherRealmImage {};

        try {
            const target = new FakeElement();
            target.dataset.mapViewport = "true";
            const layer = new FakeElement();
            const image = new FakeImageElement();
            target.querySelector = (selector) => {
                if (selector === "[data-actor-drop-preview='true']") return layer;
                if (selector === "[data-action='map-image']") return image;
                return null;
            };

            const controller = new SceneActorDropController({
                getImageSpacePoint: () => ({ x: 120, y: 240 }),
                getRoot: () => ({ querySelectorAll: () => [layer] }),
                render: () => {}
            });
            const anchor = controller.renderActorDropPreview(target, {
                actors: [actor("a", "hero", "Ada"), actor("b", "pawn", "Porter")],
                scene: { width: 1000, height: 800, grid: { size: 100 } }
            });

            assert.deepEqual(anchor, { x: 120, y: 240 });
            assert.equal(layer.style.width, "1000px");
            assert.equal(layer.style.height, "800px");
            assert.equal(layer.classList.contains("has-preview"), true);
            assert.equal((layer.innerHTML.match(/<span class="totc-v2-map-panel__actor-drop-square/g) ?? []).length, 2);
        } finally {
            globalThis.HTMLElement = originalHTMLElement;
            globalThis.HTMLImageElement = originalHTMLImageElement;
        }
    });
});
