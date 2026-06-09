import assert from "node:assert/strict";
import { describe, it } from "node:test";

async function loadInteractionController() {
    const moduleUrl = new URL(`../../module/ui/workspace-v2/interaction-controller.mjs?test=${Date.now()}`, import.meta.url);
    return import(moduleUrl.href);
}

function rect({ left, top, width, height }) {
    return {
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height
    };
}

function element({ dockId, stackId, bounds }) {
    return {
        dataset: { dockId, stackId },
        getBoundingClientRect: () => bounds
    };
}

describe("InteractionController", () => {
    it("uses left and right local zones for top dock stacks", async () => {
        const { InteractionController } = await loadInteractionController();
        const controller = new InteractionController();
        const rootElement = { getBoundingClientRect: () => rect({ left: 0, top: 0, width: 800, height: 600 }) };
        const stack = element({
            dockId: "topDock",
            stackId: "top-stack",
            bounds: rect({ left: 100, top: 20, width: 400, height: 100 })
        });

        const leftIntent = controller.computeIntent({
            event: { clientX: 150, clientY: 70 },
            rootElement,
            stackElements: [stack]
        });
        const rightIntent = controller.computeIntent({
            event: { clientX: 470, clientY: 70 },
            rootElement,
            stackElements: [stack]
        });
        const topEdgeIntent = controller.computeIntent({
            event: { clientX: 300, clientY: 25 },
            rootElement,
            stackElements: [stack]
        });

        assert.equal(leftIntent.zone, "local-left");
        assert.equal(leftIntent.label, "Stack Left");
        assert.equal(rightIntent.zone, "local-right");
        assert.equal(rightIntent.label, "Stack Right");
        assert.equal(topEdgeIntent.zone, "local-center");
        assert.equal(topEdgeIntent.label, "Compose Tab");
    });

    it("uses left and right local zones for bottom dock stacks", async () => {
        const { InteractionController } = await loadInteractionController();
        const controller = new InteractionController();
        const rootElement = { getBoundingClientRect: () => rect({ left: 0, top: 0, width: 800, height: 600 }) };
        const stack = element({
            dockId: "bottomDock",
            stackId: "bottom-stack",
            bounds: rect({ left: 80, top: 460, width: 500, height: 120 })
        });

        const leftIntent = controller.computeIntent({
            event: { clientX: 120, clientY: 520 },
            rootElement,
            stackElements: [stack]
        });
        const rightIntent = controller.computeIntent({
            event: { clientX: 550, clientY: 520 },
            rootElement,
            stackElements: [stack]
        });

        assert.equal(leftIntent.zone, "local-left");
        assert.equal(rightIntent.zone, "local-right");
    });

    it("keeps vertical local zones for side dock stacks", async () => {
        const { InteractionController } = await loadInteractionController();
        const controller = new InteractionController();
        const rootElement = { getBoundingClientRect: () => rect({ left: 0, top: 0, width: 800, height: 600 }) };
        const stack = element({
            dockId: "leftDock",
            stackId: "left-stack",
            bounds: rect({ left: 200, top: 100, width: 300, height: 300 })
        });

        const topIntent = controller.computeIntent({
            event: { clientX: 350, clientY: 130 },
            rootElement,
            stackElements: [stack]
        });
        const bottomIntent = controller.computeIntent({
            event: { clientX: 350, clientY: 380 },
            rootElement,
            stackElements: [stack]
        });

        assert.equal(topIntent.zone, "local-top");
        assert.equal(topIntent.label, "Stack Above");
        assert.equal(bottomIntent.zone, "local-bottom");
        assert.equal(bottomIntent.label, "Stack Below");
    });

    it("does not subdivide center dock stacks into local drop zones", async () => {
        const { InteractionController } = await loadInteractionController();
        const controller = new InteractionController();
        const rootElement = { getBoundingClientRect: () => rect({ left: 0, top: 0, width: 800, height: 600 }) };
        const stack = element({
            dockId: "centerDock",
            stackId: "center-stack",
            bounds: rect({ left: 200, top: 100, width: 300, height: 300 })
        });

        const intent = controller.computeIntent({
            event: { clientX: 350, clientY: 130 },
            rootElement,
            stackElements: [stack]
        });

        assert.equal(intent.kind, "edge");
        assert.equal(intent.dockId, "centerDock");
        assert.equal(intent.label, "Dock Center");
    });

    it("draws horizontal ghost rectangles for left and right local zones", async () => {
        const { InteractionController } = await loadInteractionController();
        const controller = new InteractionController();
        const rootElement = { getBoundingClientRect: () => rect({ left: 20, top: 10, width: 800, height: 600 }) };
        const bounds = rect({ left: 120, top: 50, width: 400, height: 100 });

        const leftGhost = controller.computeGhostRect({
            intent: { kind: "local", zone: "local-left", bounds },
            rootElement
        });
        const rightGhost = controller.computeGhostRect({
            intent: { kind: "local", zone: "local-right", bounds },
            rootElement
        });

        assert.deepEqual(leftGhost, { left: 100, top: 40, width: 140, height: 100 });
        assert.deepEqual(rightGhost, { left: 360, top: 40, width: 140, height: 100 });
    });
});
