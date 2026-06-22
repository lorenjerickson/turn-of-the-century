/**
 * Abstract base class for all Workspace features.
 * Provides a common contract for context preparation, event binding,
 * panel rendering, and lifecycle disposal.
 *
 * @abstract
 */
export class WorkspaceFeature {
    constructor() {
        if (this.constructor === WorkspaceFeature) {
            throw new TypeError("Cannot instantiate abstract class WorkspaceFeature directly.");
        }
    }

    /**
     * Prepare the context before rendering the workspace application.
     * Classes extending WorkspaceFeature should override this method to add data to the shared context.
     *
     * @param {object} sharedContext - The shared context object to mutate or build upon.
     * @returns {Promise<void>|void}
     */
    prepareContext(sharedContext) {}

    /**
     * Bind DOM and event handlers after the workspace application has rendered.
     *
     * @param {HTMLElement} rootElement - The workspace root HTML element.
     * @returns {void}
     */
    bind(rootElement) {}

    /**
     * Route and render a specific panel handled by this feature.
     *
     * @param {object} panel - The panel definition.
     * @param {object} context - The template rendering context.
     * @returns {string|undefined} - HTML string if the feature renders this panel, or undefined to fall back.
     */
    render(panel, context) {
        return undefined;
    }

    /**
     * Clean up event listeners, overlays, and other resources when the workspace is closed.
     *
     * @returns {void}
     */
    dispose() {}
}
