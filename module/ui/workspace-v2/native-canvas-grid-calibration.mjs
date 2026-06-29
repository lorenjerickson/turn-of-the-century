function finitePoint(point = {}) {
    const x = Number(point.x);
    const y = Number(point.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function pointerGlobalPoint(event = {}) {
    return finitePoint(event?.data?.global)
        ?? finitePoint(event?.global)
        ?? finitePoint(event?.interactionData?.global)
        ?? null;
}

function eventSources(event = {}) {
    return [
        event,
        event?.nativeEvent,
        event?.data?.originalEvent,
        event?.originalEvent
    ].filter(Boolean);
}

function domClientPoint(event = {}) {
    for (const source of eventSources(event)) {
        const x = Number(source?.clientX ?? source?.x);
        const y = Number(source?.clientY ?? source?.y);
        const point = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
        if (point) return point;
    }
    return null;
}

function domOffsetPoint(event = {}) {
    for (const source of eventSources(event)) {
        const x = Number(source?.offsetX ?? source?.layerX);
        const y = Number(source?.offsetY ?? source?.layerY);
        const point = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
        if (point) return point;
    }
    return null;
}

function domPagePoint(event = {}) {
    for (const source of eventSources(event)) {
        const x = Number(source?.pageX);
        const y = Number(source?.pageY);
        const point = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
        if (point) return point;
    }
    return null;
}

function clientPointFromPage(pagePoint = null) {
    if (!pagePoint) return null;
    const scrollX = Number(globalThis.window?.scrollX ?? globalThis.document?.documentElement?.scrollLeft ?? 0);
    const scrollY = Number(globalThis.window?.scrollY ?? globalThis.document?.documentElement?.scrollTop ?? 0);
    return finitePoint({
        x: pagePoint.x - scrollX,
        y: pagePoint.y - scrollY
    });
}

function canvasLocalPointFromClient(clientPoint = null, view = null) {
    if (!clientPoint || !view) return null;
    const rect = view?.getBoundingClientRect?.();
    if (!rect) return null;
    const scaleX = Number(view?.width) > 0 && Number(rect.width) > 0
        ? Number(view.width) / Number(rect.width)
        : 1;
    const scaleY = Number(view?.height) > 0 && Number(rect.height) > 0
        ? Number(view.height) / Number(rect.height)
        : 1;
    return finitePoint({
        x: (clientPoint.x - Number(rect.left ?? 0)) * scaleX,
        y: (clientPoint.y - Number(rect.top ?? 0)) * scaleY
    });
}

function scenePointFromCanvasLocal(localPoint = null, stage = null) {
    if (!localPoint) return null;
    if (typeof stage?.worldTransform?.applyInverse === "function") {
        return finitePoint(stage.worldTransform.applyInverse(localPoint));
    }
    if (typeof stage?.toLocal === "function") {
        return finitePoint(stage.toLocal(localPoint));
    }
    return localPoint;
}

export function isPrimaryPointerButton(event = {}) {
    const candidates = [
        event?.button,
        event?.data?.button,
        event?.nativeEvent?.button,
        event?.data?.originalEvent?.button
    ];
    const button = candidates.find((value) => value !== undefined && value !== null && Number.isFinite(Number(value)));
    return Number(button) === 0;
}

export function getNativeCanvasEventScenePoint(event = {}, canvasRef = globalThis.canvas) {
    const globalPoint = pointerGlobalPoint(event);
    const stage = canvasRef?.stage ?? canvasRef?.app?.stage ?? null;
    if (globalPoint && typeof stage?.worldTransform?.applyInverse === "function") {
        return finitePoint(stage.worldTransform.applyInverse(globalPoint));
    }
    if (globalPoint && typeof event?.data?.getLocalPosition === "function" && stage) {
        return finitePoint(event.data.getLocalPosition(stage));
    }

    const clientPoint = domClientPoint(event) ?? clientPointFromPage(domPagePoint(event));
    if (clientPoint && typeof canvasRef?.canvasCoordinatesFromClient === "function") {
        const scenePoint = finitePoint(canvasRef.canvasCoordinatesFromClient(clientPoint.x, clientPoint.y));
        if (scenePoint) return scenePoint;
    }

    const view = canvasRef?.app?.view ?? canvasRef?.app?.canvas ?? null;
    const localClientPoint = canvasLocalPointFromClient(clientPoint, view);
    const sceneClientPoint = scenePointFromCanvasLocal(localClientPoint, stage);
    if (sceneClientPoint) return sceneClientPoint;

    const offsetPoint = domOffsetPoint(event);
    const sceneOffsetPoint = scenePointFromCanvasLocal(offsetPoint, stage);
    if (sceneOffsetPoint) return sceneOffsetPoint;

    return null;
}

export function listenForNativeCanvasPointerDown(canvasRef = globalThis.canvas, handler = () => {}, {
    preferView = false,
    capture = false
} = {}) {
    const stage = canvasRef?.stage ?? canvasRef?.app?.stage ?? null;
    const view = canvasRef?.app?.view ?? canvasRef?.app?.canvas ?? null;
    if (preferView && view && typeof view.addEventListener === "function" && typeof view.removeEventListener === "function") {
        view.addEventListener("pointerdown", handler, { capture });
        return () => view.removeEventListener("pointerdown", handler, { capture });
    }
    if (stage && typeof stage.on === "function" && typeof stage.off === "function") {
        stage.on("pointerdown", handler);
        return () => stage.off("pointerdown", handler);
    }
    if (view && typeof view.addEventListener === "function" && typeof view.removeEventListener === "function") {
        view.addEventListener("pointerdown", handler, { capture });
        return () => view.removeEventListener("pointerdown", handler, { capture });
    }

    return () => {};
}

function hasOwnValue(data, key) {
    return Object.prototype.hasOwnProperty.call(data ?? {}, key);
}

function hasGridGeometryUpdate(updateData = {}) {
    return hasOwnValue(updateData, "grid.type")
        || hasOwnValue(updateData, "grid.size")
        || hasOwnValue(updateData, "shiftX")
        || hasOwnValue(updateData, "shiftY");
}

export async function previewNativeCanvasGrid({ canvasRef = globalThis.canvas, scene = null, updateData = null } = {}) {
    if (!scene || !updateData || typeof scene.updateSource !== "function") return false;

    scene.updateSource(updateData);

    if (hasGridGeometryUpdate(updateData) && typeof canvasRef?.draw === "function") {
        await canvasRef.draw(scene);
        return true;
    }

    if (typeof canvasRef?.grid?.draw === "function") {
        await canvasRef.grid.draw();
        return true;
    }

    if (typeof canvasRef?.interface?.grid?.draw === "function") {
        await canvasRef.interface.grid.draw();
        return true;
    }

    if (typeof canvasRef?.draw === "function") {
        await canvasRef.draw();
        return true;
    }

    return false;
}
