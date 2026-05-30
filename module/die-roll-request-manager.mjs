// Die Roll Request Manager for Turn of the Century system
// Handles sending, receiving, and tracking die roll requests via Foundry sockets


import { DieRollRequest } from "./models/die-roll-request.mjs";
import { socketService } from "./socket-service.mjs";

class DieRollRequestManager {
  constructor() {
    this.activeRequests = new Map(); // id -> DieRollRequest
    // Register with socket service
    socketService.on(this._onSocketMessage.bind(this));
  }


  _onSocketMessage({ type, payload }) {
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
    }
  }

  // GM or effect sends a new request
  sendRequest(request) {
    this.activeRequests.set(request.id, request);
    socketService.emit("dieRollRequest", request);
  }

  // Player sends result
  sendResult(requestId, recipientId, result) {
    socketService.emit("dieRollResult", { requestId, recipientId, result });
  }

  // GM/effect cancels a request
  sendCancel(requestId) {
    socketService.emit("dieRollCancel", { requestId });
  }

  _handleRequest(data) {
    const req = new DieRollRequest(data);
    this.activeRequests.set(req.id, req);
    // TODO: Notify UI to show panel if recipient
  }

  _handleResult({ requestId, recipientId, result }) {
    const req = this.activeRequests.get(requestId);
    if (req) {
      req.results[recipientId] = result;
      // TODO: Notify UI to update GM panel
    }
  }

  _handleCancel({ requestId }) {
    this.activeRequests.delete(requestId);
    // TODO: Notify UI to close/cancel panel
  }

  getRequest(id) {
    return this.activeRequests.get(id);
  }

  getAllRequests() {
    return Array.from(this.activeRequests.values());
  }
}

export const dieRollRequestManager = new DieRollRequestManager();
