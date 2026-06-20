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

function domClientPoint(event = {}) {
    const source = event?.nativeEvent ?? event?.data?.originalEvent ?? event;
    const x = Number(source?.clientX);
    const y = Number(source?.clientY);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
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

    const clientPoint = domClientPoint(event);
    if (clientPoint && typeof canvasRef?.canvasCoordinatesFromClient === "function") {
        return finitePoint(canvasRef.canvasCoordinatesFromClient(clientPoint.x, clientPoint.y));
    }

    const view = canvasRef?.app?.view ?? canvasRef?.app?.canvas ?? null;
    const rect = view?.getBoundingClientRect?.();
    if (clientPoint && rect && stage?.worldTransform && typeof stage.worldTransform.applyInverse === "function") {
        return finitePoint(stage.worldTransform.applyInverse({
            x: clientPoint.x - Number(rect.left ?? 0),
            y: clientPoint.y - Number(rect.top ?? 0)
        }));
    }

    return null;
}

export function listenForNativeCanvasPointerDown(canvasRef = globalThis.canvas, handler = () => {}) {
    const stage = canvasRef?.stage ?? canvasRef?.app?.stage ?? null;
    if (stage && typeof stage.on === "function" && typeof stage.off === "function") {
        stage.on("pointerdown", handler);
        return () => stage.off("pointerdown", handler);
    }

    const view = canvasRef?.app?.view ?? canvasRef?.app?.canvas ?? null;
    if (view && typeof view.addEventListener === "function" && typeof view.removeEventListener === "function") {
        view.addEventListener("pointerdown", handler, { capture: true });
        return () => view.removeEventListener("pointerdown", handler, { capture: true });
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
