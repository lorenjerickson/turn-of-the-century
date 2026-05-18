function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export class InteractionController {
    constructor() {
        this.activeIntent = null;
    }

    clearIntent() {
        this.activeIntent = null;
    }

    getIntent() {
        return this.activeIntent ? { ...this.activeIntent } : null;
    }

    computeIntent({ event, rootElement, stackElements = [] } = {}) {
        if (!event || !rootElement) {
            this.clearIntent();
            return null;
        }

        const localIntent = this.#computeLocalIntent(event, stackElements);
        this.activeIntent = localIntent ?? this.#computeEdgeIntent(event, rootElement);
        return this.getIntent();
    }

    computeGhostRect({ intent, rootElement } = {}) {
        if (!intent || !rootElement) return null;
        const rootBounds = rootElement.getBoundingClientRect();

        if (intent.kind === "edge") {
            const margin = 14;
            const width = rootBounds.width;
            const height = rootBounds.height;
            const edgeDepth = Math.round(Math.min(width, height) * 0.2);

            switch (intent.dockId) {
                case "leftDock":
                    return this.#relativeRect(rootBounds, {
                        left: margin,
                        top: margin,
                        width: clamp(edgeDepth, 100, width - margin * 2),
                        height: height - margin * 2
                    });
                case "rightDock":
                    return this.#relativeRect(rootBounds, {
                        left: width - margin - clamp(edgeDepth, 100, width - margin * 2),
                        top: margin,
                        width: clamp(edgeDepth, 100, width - margin * 2),
                        height: height - margin * 2
                    });
                case "topDock":
                    return this.#relativeRect(rootBounds, {
                        left: margin,
                        top: margin,
                        width: width - margin * 2,
                        height: clamp(edgeDepth, 80, height - margin * 2)
                    });
                case "bottomDock":
                    return this.#relativeRect(rootBounds, {
                        left: margin,
                        top: height - margin - clamp(edgeDepth, 80, height - margin * 2),
                        width: width - margin * 2,
                        height: clamp(edgeDepth, 80, height - margin * 2)
                    });
                default:
                    return this.#relativeRect(rootBounds, {
                        left: Math.round(width * 0.18),
                        top: Math.round(height * 0.18),
                        width: Math.round(width * 0.64),
                        height: Math.round(height * 0.64)
                    });
            }
        }

        if (intent.kind === "local" && intent.bounds) {
            const bounds = intent.bounds;
            if (intent.zone === "local-center") {
                return this.#relativeRect(rootBounds, {
                    left: bounds.left - rootBounds.left + bounds.width * 0.2,
                    top: bounds.top - rootBounds.top + bounds.height * 0.2,
                    width: bounds.width * 0.6,
                    height: bounds.height * 0.6
                });
            }

            if (intent.zone === "local-top") {
                return this.#relativeRect(rootBounds, {
                    left: bounds.left - rootBounds.left,
                    top: bounds.top - rootBounds.top,
                    width: bounds.width,
                    height: bounds.height * 0.35
                });
            }

            return this.#relativeRect(rootBounds, {
                left: bounds.left - rootBounds.left,
                top: bounds.bottom - rootBounds.top - bounds.height * 0.35,
                width: bounds.width,
                height: bounds.height * 0.35
            });
        }

        return null;
    }

    #computeEdgeIntent(event, rootElement) {
        const bounds = rootElement.getBoundingClientRect();
        const x = event.clientX;
        const y = event.clientY;
        const edgeThreshold = Math.min(140, Math.round(Math.min(bounds.width, bounds.height) * 0.16));

        if (x < bounds.left + edgeThreshold) return { kind: "edge", dockId: "leftDock", label: "Dock Left" };
        if (x > bounds.right - edgeThreshold) return { kind: "edge", dockId: "rightDock", label: "Dock Right" };
        if (y < bounds.top + edgeThreshold) return { kind: "edge", dockId: "topDock", label: "Dock Top" };
        if (y > bounds.bottom - edgeThreshold) return { kind: "edge", dockId: "bottomDock", label: "Dock Bottom" };
        return { kind: "edge", dockId: "centerDock", label: "Dock Center" };
    }

    #computeLocalIntent(event, stackElements) {
        for (const element of stackElements) {
            const bounds = element.getBoundingClientRect();
            if (
                event.clientX < bounds.left ||
                event.clientX > bounds.right ||
                event.clientY < bounds.top ||
                event.clientY > bounds.bottom
            ) {
                continue;
            }

            const yRatio = (event.clientY - bounds.top) / Math.max(bounds.height, 1);
            const zone = yRatio < 0.28
                ? "local-top"
                : yRatio > 0.72
                    ? "local-bottom"
                    : "local-center";

            const dockId = element.dataset.dockId;
            const stackId = element.dataset.stackId;
            return {
                kind: "local",
                dockId,
                stackId,
                zone,
                label: zone === "local-center" ? "Compose Tab" : zone === "local-top" ? "Stack Above" : "Stack Below",
                bounds
            };
        }

        return null;
    }

    #relativeRect(rootBounds, rect) {
        return {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
        };
    }
}