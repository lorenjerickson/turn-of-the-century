// foundry-mock.js: decoupled Foundry mock for tests
export function installFoundryMock() {
  if (!globalThis.game) {
    globalThis.game = {
      socket: {
        on: function () {},
        emit: function () {}
      }
    };
  }
}
