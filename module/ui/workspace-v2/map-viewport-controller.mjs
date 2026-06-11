import {
    buildPersistedMapViewportState,
    buildRestoredMapViewportTransform
} from "./panels/map-viewport-state.mjs";

export class MapViewportController {
    constructor({ stateStore = null, onTransformChange = null } = {}) {
        this.stateStore = stateStore;
        this.onTransformChange = onTransformChange;
        this.state = {
            scale: null,
            offsetX: 0,
            offsetY: 0,
            source: "",
            mapKey: ""
        };
        this.panSession = null;
    }

    syncViewport(viewport, image) {
        const metrics = this.#getMetrics(viewport, image);
        if (!metrics) return;

        const { viewportWidth, viewportHeight, imageWidth, imageHeight, imageSource, mapKey } = metrics;
        const sourceChanged = Boolean(imageSource && this.state.source !== imageSource);
        const mapChanged = Boolean(mapKey && this.state.mapKey !== mapKey);
        const minScale = Math.min(viewportWidth / imageWidth, viewportHeight / imageHeight);
        const maxScale = Math.max(minScale, 8);

        if (sourceChanged || mapChanged || !Number.isFinite(this.state.scale)) {
            const restored = buildRestoredMapViewportTransform({
                saved: this.stateStore?.getUserMapViewport?.(mapKey),
                viewportWidth,
                viewportHeight,
                imageWidth,
                imageHeight,
                minScale
            });
            this.state.scale = restored.scale;
            this.state.offsetX = restored.offsetX;
            this.state.offsetY = restored.offsetY;
        }

        this.state.source = imageSource;
        this.state.mapKey = mapKey;
        this.state.scale = this.#clamp(this.state.scale, minScale, maxScale);
        this.#clampOffsets(metrics);
        this.#applyTransform(image);
        this.onTransformChange?.();
    }

    applyWheelZoom(viewport, image, event) {
        const metrics = this.#getMetrics(viewport, image);
        if (!metrics) return;

        const { viewportWidth, viewportHeight, imageWidth, imageHeight } = metrics;
        const minScale = Math.min(viewportWidth / imageWidth, viewportHeight / imageHeight);
        const maxScale = Math.max(minScale, 8);
        const currentScale = Number.isFinite(this.state.scale) ? this.state.scale : minScale;
        const zoomStep = event.deltaY < 0 ? 1.08 : 0.92;
        const nextScale = this.#clamp(currentScale * zoomStep, minScale, maxScale);
        if (Math.abs(nextScale - currentScale) < 0.0001) {
            this.syncViewport(viewport, image);
            return;
        }

        const viewportRect = viewport.getBoundingClientRect();
        const cursorX = event.clientX - viewportRect.left;
        const cursorY = event.clientY - viewportRect.top;
        const imageSpaceX = (cursorX - this.state.offsetX) / currentScale;
        const imageSpaceY = (cursorY - this.state.offsetY) / currentScale;

        this.state.scale = nextScale;
        this.state.offsetX = cursorX - (imageSpaceX * nextScale);
        this.state.offsetY = cursorY - (imageSpaceY * nextScale);
        this.#clampOffsets(metrics);
        this.#applyTransform(image);
        void this.persist(viewport, image);
        this.onTransformChange?.();
    }

    centerOnPoint(viewport, image, { x = 0, y = 0, scale = null, persist = true } = {}) {
        const metrics = this.#getMetrics(viewport, image);
        if (!metrics) return false;

        const { viewportWidth, viewportHeight, imageWidth, imageHeight } = metrics;
        const minScale = Math.min(viewportWidth / imageWidth, viewportHeight / imageHeight);
        const maxScale = Math.max(minScale, 8);
        const effectiveScale = Number.isFinite(Number(scale))
            ? this.#clamp(Number(scale), minScale, maxScale)
            : this.#clamp(Number(this.state.scale), minScale, maxScale);
        if (!Number.isFinite(effectiveScale) || effectiveScale <= 0) return false;

        this.state.scale = effectiveScale;
        this.state.offsetX = (viewportWidth / 2) - (Number(x ?? 0) * effectiveScale);
        this.state.offsetY = (viewportHeight / 2) - (Number(y ?? 0) * effectiveScale);
        this.#clampOffsets(metrics);
        this.#applyTransform(image);
        if (persist) void this.persist(viewport, image);
        this.onTransformChange?.();
        return true;
    }

    beginPan({ pointerId, viewport, image, clientX, clientY }) {
        this.panSession = {
            pointerId,
            viewport,
            image,
            startX: clientX,
            startY: clientY,
            startOffsetX: this.state.offsetX,
            startOffsetY: this.state.offsetY
        };
        viewport?.classList?.add("is-panning");
    }

    movePan(event) {
        if (!this.panSession || event.pointerId !== this.panSession.pointerId) return false;

        const { viewport, image, startX, startY, startOffsetX, startOffsetY } = this.panSession;
        const metrics = this.#getMetrics(viewport, image);
        if (!metrics) return false;

        this.state.offsetX = startOffsetX + (event.clientX - startX);
        this.state.offsetY = startOffsetY + (event.clientY - startY);
        this.#clampOffsets(metrics);
        this.#applyTransform(image);
        this.onTransformChange?.();
        return true;
    }

    endPan() {
        const { viewport, image } = this.panSession ?? {};
        viewport?.classList?.remove("is-panning");
        this.panSession = null;
        if (viewport && image) void this.persist(viewport, image);
    }

    async persist(viewport, image) {
        const metrics = this.#getMetrics(viewport, image);
        if (!metrics) return;

        const persisted = buildPersistedMapViewportState({
            scale: this.state.scale,
            offsetX: this.state.offsetX,
            offsetY: this.state.offsetY,
            viewportWidth: metrics.viewportWidth,
            viewportHeight: metrics.viewportHeight,
            imageWidth: metrics.imageWidth,
            imageHeight: metrics.imageHeight
        });
        if (!persisted || !metrics.mapKey) return;

        await this.stateStore?.setUserMapViewport?.(metrics.mapKey, persisted);
    }

    #getMetrics(viewport, image) {
        if (!viewport || !image) return null;
        const viewportRect = viewport.getBoundingClientRect();
        const viewportWidth = Math.max(1, Math.round(viewportRect.width));
        const viewportHeight = Math.max(1, Math.round(viewportRect.height));
        const imageWidth = Math.max(1, image.naturalWidth);
        const imageHeight = Math.max(1, image.naturalHeight);
        const imageSource = String(image.currentSrc || image.src || "");
        const mapKey = String(viewport.dataset.mapKey || imageSource || "").trim();
        return { viewportWidth, viewportHeight, imageWidth, imageHeight, imageSource, mapKey };
    }

    #clampOffsets({ viewportWidth, viewportHeight, imageWidth, imageHeight }) {
        const scale = Number(this.state.scale);
        const scaledWidth = imageWidth * scale;
        const scaledHeight = imageHeight * scale;
        const minX = scaledWidth > viewportWidth ? viewportWidth - scaledWidth : (viewportWidth - scaledWidth) / 2;
        const maxX = scaledWidth > viewportWidth ? 0 : (viewportWidth - scaledWidth) / 2;
        const minY = scaledHeight > viewportHeight ? viewportHeight - scaledHeight : (viewportHeight - scaledHeight) / 2;
        const maxY = scaledHeight > viewportHeight ? 0 : (viewportHeight - scaledHeight) / 2;
        this.state.offsetX = this.#clamp(this.state.offsetX, minX, maxX);
        this.state.offsetY = this.#clamp(this.state.offsetY, minY, maxY);
    }

    #applyTransform(image) {
        image.style.transform = `translate(${this.state.offsetX}px, ${this.state.offsetY}px) scale(${this.state.scale})`;
    }

    #clamp(value, min, max) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return min;
        return Math.min(max, Math.max(min, numeric));
    }
}
