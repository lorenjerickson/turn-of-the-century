// SocketService: decouples Foundry socket comms for use by any feature
export class SocketService {
  constructor({ namespace = "system.turn-of-the-century" } = {}) {
    this.namespace = namespace;
    this._handlers = new Set();
    if (typeof globalThis.game !== "undefined" && game.socket) {
      game.socket.on(this.namespace, this._onSocketMessage.bind(this));
    }
  }

  emit(type, payload) {
    if (typeof globalThis.game !== "undefined" && game.socket) {
      game.socket.emit(this.namespace, { type, payload });
    }
  }

  on(handler) {
    this._handlers.add(handler);
  }

  off(handler) {
    this._handlers.delete(handler);
  }

  _onSocketMessage(message) {
    for (const handler of this._handlers) {
      handler(message);
    }
  }
}

// Singleton for system namespace
export const socketService = new SocketService();
