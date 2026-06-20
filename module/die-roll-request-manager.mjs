import {
    DIE_ROLL_REQUEST_STATUSES,
    DieRollRequest
} from "./models/die-roll-request.mjs";
import { rollDieRequestForUser } from "./die-roll-engine.mjs";
import { socketService as defaultSocketService } from "./socket-service.mjs";

function cleanId(value = "") {
    return String(value ?? "").trim();
}

export class DieRollRequestManager {
    constructor({ socketService = defaultSocketService, rng = Math.random, now = () => Date.now() } = {}) {
        this.activeRequests = new Map();
        this.socketService = socketService;
        this.rng = rng;
        this.now = now;
        this._listeners = new Set();
        this._socketHandler = this._onSocketMessage.bind(this);
        this.socketService?.on?.(this._socketHandler);
    }

    onChange(listener) {
        if (typeof listener !== "function") return () => {};
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    _notify(change = {}) {
        for (const listener of this._listeners) listener(change);
        this._onPanelUpdate?.(change);
    }

    _onSocketMessage({ type, payload } = {}) {
        switch (type) {
            case "dieRollRequest":
                this._handleRequest(payload);
                break;
            case "dieRollResult":
                this._handleResult(payload);
                break;
            case "dieRollCancel":
                this._handleCancel(payload);
                break;
            case "dieRollAdjust":
                this._handleAdjustment(payload);
                break;
            default:
                break;
        }
    }

    createRequest(data = {}) {
        return new DieRollRequest(data);
    }

    sendRequest(data = {}) {
        const request = data instanceof DieRollRequest ? data : new DieRollRequest(data);
        this.activeRequests.set(request.id, request);
        this.socketService?.emit?.("dieRollRequest", request.toJSON());
        this._notify({ type: "request", request });
        return request;
    }

    sendResult(requestId, recipientId, result) {
        this._handleResult({ requestId, recipientId, result });
        this.socketService?.emit?.("dieRollResult", { requestId, recipientId, result });
    }

    rollRequestForRecipient(requestId, recipientId, options = {}) {
        const request = this.getRequest(requestId);
        if (!request || request.isCancelled || request.hasResult(recipientId)) return null;
        request.status = DIE_ROLL_REQUEST_STATUSES.ROLLING;
        request.updatedAt = this.now();
        this._notify({ type: "rolling", request, recipientId });
        const result = rollDieRequestForUser(request, recipientId, {
            rng: options.rng ?? this.rng,
            now: options.now ?? this.now
        });
        this.sendResult(requestId, recipientId, result);
        return result;
    }

    sendCancel(requestId, { cancelledBy = "" } = {}) {
        this._handleCancel({ requestId, cancelledBy });
        this.socketService?.emit?.("dieRollCancel", { requestId, cancelledBy });
    }

    adjustModifier(requestId, recipientId, delta) {
        const payload = { requestId, recipientId, delta: Number(delta) || 0 };
        this._handleAdjustment(payload);
        this.socketService?.emit?.("dieRollAdjust", payload);
    }

    _handleRequest(data = {}) {
        const request = data instanceof DieRollRequest ? data : new DieRollRequest(data);
        const existing = this.activeRequests.get(request.id);
        if (existing && existing.updatedAt > request.updatedAt) return;
        this.activeRequests.set(request.id, request);
        this._notify({ type: "request", request });
    }

    _handleResult({ requestId, recipientId, result } = {}) {
        const request = this.activeRequests.get(cleanId(requestId));
        const userId = cleanId(recipientId);
        if (!request || !userId || request.isCancelled) return;

        request.results[userId] = {
            ...result,
            userId,
            timestamp: Number(result?.timestamp ?? this.now()) || this.now()
        };
        request.updatedAt = this.now();
        const allResolved = request.recipientIds.every((id) => Boolean(request.results[id]));
        if (allResolved) {
            request.status = DIE_ROLL_REQUEST_STATUSES.RESOLVED;
            request.resolvedAt = request.updatedAt;
        } else {
            request.status = DIE_ROLL_REQUEST_STATUSES.PENDING;
        }
        this._notify({ type: "result", request, recipientId: userId, result: request.results[userId] });
    }

    _handleAdjustment({ requestId, recipientId, delta } = {}) {
        const request = this.activeRequests.get(cleanId(requestId));
        const userId = cleanId(recipientId);
        if (!request || !userId || request.isCancelled || request.hasResult(userId)) return;
        const current = Number(request.adjustments[userId]?.value ?? 0) || 0;
        request.adjustments[userId] = {
            value: current + (Number(delta) || 0),
            source: "player",
            updatedAt: this.now()
        };
        request.updatedAt = this.now();
        this._notify({ type: "adjust", request, recipientId: userId });
    }

    _handleCancel({ requestId, cancelledBy = "" } = {}) {
        const request = this.activeRequests.get(cleanId(requestId));
        if (!request) return;
        request.status = DIE_ROLL_REQUEST_STATUSES.CANCELLED;
        request.cancelledBy = cleanId(cancelledBy);
        request.updatedAt = this.now();
        this.activeRequests.delete(request.id);
        this._notify({ type: "cancel", request });
    }

    getRequest(id) {
        return this.activeRequests.get(cleanId(id));
    }

    getAllRequests() {
        return Array.from(this.activeRequests.values())
            .filter((request) => !request.isCancelled)
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    getRequestsForUser(userId, { includeResolved = true } = {}) {
        const id = cleanId(userId);
        return this.getAllRequests().filter((request) => {
            if (!request.hasRecipient(id)) return false;
            return includeResolved || request.isPending;
        });
    }

    getVisibleRequests({ userId = "", isGM = false } = {}) {
        return isGM ? this.getAllRequests() : this.getRequestsForUser(userId);
    }

    hasOutstandingRequests() {
        return this.getAllRequests().some((request) => request.isPending);
    }

    waitForResolution(requestId) {
        const id = cleanId(requestId);
        const existing = this.getRequest(id);
        if (!existing || !existing.isPending) return Promise.resolve(existing ?? null);

        return new Promise((resolve) => {
            const unsubscribe = this.onChange(({ request } = {}) => {
                if (cleanId(request?.id) !== id) return;
                const current = this.getRequest(id);
                if (current?.isPending) return;
                unsubscribe();
                resolve(current ?? null);
            });
        });
    }
}

export const dieRollRequestManager = new DieRollRequestManager();
