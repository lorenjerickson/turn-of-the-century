// Shared jsdom bootstrap for tests that instantiate the real vendored Dockview.
//
// node --test runs each test file in its own child process, so installing these
// globals here does not leak into the string-matching test files.
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
const { window } = dom;

const assignGlobals = {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: window.requestAnimationFrame ?? ((cb) => setTimeout(() => cb(Date.now()), 0)),
    cancelAnimationFrame: window.cancelAnimationFrame ?? clearTimeout
};
for (const [key, value] of Object.entries(assignGlobals)) globalThis[key] = value;

window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
globalThis.matchMedia = window.matchMedia;

// jsdom ships neither of these; Dockview needs both to instantiate.
class ResizeObserver { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = ResizeObserver;
window.ResizeObserver = ResizeObserver;

// jsdom returns an all-zero rect, which makes Dockview's shell skip its layout
// pass. Report a fixed viewport so edge-group splitview sizing runs.
const VIEWPORT = { width: 1200, height: 800 };
window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { x: 0, y: 0, top: 0, left: 0, right: VIEWPORT.width, bottom: VIEWPORT.height, width: VIEWPORT.width, height: VIEWPORT.height };
};

export { window, dom, VIEWPORT };

export function makeContainer() {
    const host = window.document.createElement("div");
    window.document.body.appendChild(host);
    return host;
}

/** Flush queued microtasks (the feature saves layout via queueMicrotask). */
export async function flushMicrotasks() {
    await Promise.resolve();
    await Promise.resolve();
}
