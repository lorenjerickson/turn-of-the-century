/**
 * Grid Calibration
 *
 * Pure model builder and renderer for the map panel grid calibration tool.
 * No Foundry globals — all scene and state data is passed as plain objects.
 *
 * Two-corner approach
 * -------------------
 * The GM clicks two diagonally-opposite corners of a single visible grid cell
 * on the scene image.  The image-space delta becomes the estimated cell
 * dimensions.  The modular remainder of the top-left corner's image position
 * against that cell size becomes the grid offset — i.e. how far the grid is
 * shifted from (0, 0) on the image.
 *
 * All lengths are in image pixels at the scene's native resolution, which is
 * exactly the unit Foundry stores in scene.grid.size and
 * scene.grid.offset.{x,y} (v14 schema).
 */

// ---------------------------------------------------------------------------
// Grid type constants — mirrors CONST.GRID_TYPES in Foundry v14
// ---------------------------------------------------------------------------

export const GRID_TYPES = Object.freeze({
    GRIDLESS: 0,
    SQUARE: 1,
    HEXROWS_ODD: 2,
    HEXROWS_EVEN: 3,
    HEXCOLS_ODD: 4,
    HEXCOLS_EVEN: 5
});

// ---------------------------------------------------------------------------
// Pure calculation helpers
// ---------------------------------------------------------------------------

/**
 * Derive cell dimensions (in image pixels) from two clicked corners.
 *
 * @param {{ x: number, y: number } | null} corner1
 * @param {{ x: number, y: number } | null} corner2
 * @returns {{ cellW: number, cellH: number }}
 */
export function cornersToCellSize(corner1, corner2) {
    if (!corner1 || !corner2) return { cellW: 0, cellH: 0 };
    return {
        cellW: Math.round(Math.abs(corner2.x - corner1.x)),
        cellH: Math.round(Math.abs(corner2.y - corner1.y))
    };
}

/**
 * Derive grid offset from the two clicked corners and the computed cell size.
 *
 * Foundry's scene.grid.offset.{x,y} is the distance from the image origin to
 * the nearest grid line — i.e. the modular phase of the grid on the image.
 *
 * @param {{ x: number, y: number }} corner1
 * @param {{ x: number, y: number }} corner2
 * @param {{ cellW: number, cellH: number }} cellSize
 * @returns {{ offsetX: number, offsetY: number }}
 */
export function cornersToGridOffset(corner1, corner2, { cellW, cellH }) {
    if (!corner1 || !corner2 || cellW <= 0 || cellH <= 0) return { offsetX: 0, offsetY: 0 };
    const left = Math.min(corner1.x, corner2.x);
    const top = Math.min(corner1.y, corner2.y);
    // Use positive modulo to handle negative image-space coordinates gracefully
    return {
        offsetX: Math.round(((left % cellW) + cellW) % cellW),
        offsetY: Math.round(((top % cellH) + cellH) % cellH)
    };
}

// ---------------------------------------------------------------------------
// Model builder
// ---------------------------------------------------------------------------

/**
 * @typedef {object} GridCalibrationState
 * @property {boolean}                       active
 * @property {{ x: number, y: number }|null} corner1  - First clicked image-space point.
 * @property {{ x: number, y: number }|null} corner2  - Second clicked image-space point.
 * @property {number|null}                   cellW    - Current cell width in image px.
 * @property {number|null}                   cellH    - Current cell height in image px.
 * @property {number|null}                   offsetX  - Current grid x offset in image px.
 * @property {number|null}                   offsetY  - Current grid y offset in image px.
 */

/**
 * @param {object}                    opts
 * @param {GridCalibrationState|null} opts.state   - Mutable calibration state, or null.
 * @param {object|null}               opts.scene   - Plain scene data (not a Foundry doc).
 *                                                   Must include grid.type, grid.size,
 *                                                   grid.offset.{x,y}, grid.distance,
 *                                                   grid.units if available.
 */
export function buildGridCalibrationModel({ state = null, scene = null } = {}) {
    if (!state?.active) return { active: false };

    const gridType = Number(scene?.grid?.type ?? GRID_TYPES.SQUARE);
    const isSquare = gridType === GRID_TYPES.SQUARE;

    // Fall back to the scene's existing grid settings when corners haven't
    // been picked yet so the inputs are pre-populated with meaningful values.
    const fallbackSize = Math.max(4, Number(scene?.grid?.size ?? 100));
    const fallbackOffX = Number(scene?.grid?.offset?.x ?? 0);
    const fallbackOffY = Number(scene?.grid?.offset?.y ?? 0);

    const cellW = (Number.isFinite(state.cellW) && state.cellW > 0) ? state.cellW : fallbackSize;
    const cellH = (Number.isFinite(state.cellH) && state.cellH > 0)
        ? state.cellH
        : (isSquare ? cellW : fallbackSize);
    const offsetX = Number.isFinite(state.offsetX) ? state.offsetX : fallbackOffX;
    const offsetY = Number.isFinite(state.offsetY) ? state.offsetY : fallbackOffY;

    const phase = !state.corner1 ? "pick-first"
        : !state.corner2      ? "pick-second"
        :                        "adjust";

    return {
        active: true,
        phase,
        gridType,
        isSquare,
        cellW: Math.round(cellW),
        cellH: Math.round(cellH),
        offsetX: Math.round(offsetX),
        offsetY: Math.round(offsetY),
        gridDistance: Number(scene?.grid?.distance ?? 5),
        gridUnits: String(scene?.grid?.units ?? "ft"),
        corner1: state.corner1 ?? null,
        corner2: state.corner2 ?? null
    };
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export const GRID_CAL_PHASE_HINTS = Object.freeze({
    "pick-first":  "Click the <strong>top-left corner</strong> of any visible grid cell on the map.",
    "pick-second": "Now click the <strong>bottom-right corner</strong> of that same cell.",
    "adjust":      "Fine-tune the values below, then apply to the scene."
});

/**
 * Render the floating calibration dialog that sits over the map panel.
 *
 * @param {ReturnType<buildGridCalibrationModel>} model
 * @param {{ escapeHTML: function }} opts
 * @returns {string} HTML string
 */
export function renderGridCalibrationDialog(model = {}, { escapeHTML = (v) => String(v ?? "") } = {}) {
    if (!model.active) return "";

    const hint = GRID_CAL_PHASE_HINTS[model.phase] ?? "";

    const adjustMarkup = model.phase === "adjust" ? `
        <div class="totc-v2-grid-cal__fields">
            <label class="totc-v2-grid-cal__field">
                <span>${model.isSquare ? "Cell size" : "Cell width"} (px)</span>
                <input type="number"
                    data-action="grid-cal-cell-w"
                    min="4" max="4096" step="1"
                    value="${escapeHTML(model.cellW)}">
            </label>
            ${!model.isSquare ? `
            <label class="totc-v2-grid-cal__field">
                <span>Cell height (px)</span>
                <input type="number"
                    data-action="grid-cal-cell-h"
                    min="4" max="4096" step="1"
                    value="${escapeHTML(model.cellH)}">
            </label>` : ""}
            <label class="totc-v2-grid-cal__field">
                <span>Offset X (px)</span>
                <input type="number"
                    data-action="grid-cal-offset-x"
                    min="0" step="1"
                    value="${escapeHTML(model.offsetX)}">
            </label>
            <label class="totc-v2-grid-cal__field">
                <span>Offset Y (px)</span>
                <input type="number"
                    data-action="grid-cal-offset-y"
                    min="0" step="1"
                    value="${escapeHTML(model.offsetY)}">
            </label>
        </div>
        <p class="totc-v2-grid-cal__meta">
            ${escapeHTML(model.cellW)} px → ${escapeHTML(model.gridDistance)} ${escapeHTML(model.gridUnits)} per cell
        </p>
        <div class="totc-v2-grid-cal__footer">
            <button type="button"
                class="totc-v2-grid-cal__btn totc-v2-grid-cal__btn--ghost"
                data-action="grid-cal-reset">
                Re-pick corners
            </button>
            <button type="button"
                class="totc-v2-grid-cal__btn totc-v2-grid-cal__btn--primary"
                data-action="grid-cal-confirm">
                Apply to Scene
            </button>
        </div>` : `
        <div class="totc-v2-grid-cal__footer">
            <button type="button"
                class="totc-v2-grid-cal__btn totc-v2-grid-cal__btn--ghost"
                data-action="grid-cal-cancel">
                Cancel
            </button>
        </div>`;

    return `
    <aside class="totc-v2-grid-cal" data-grid-calibration="true" aria-label="Grid calibration">
        <header class="totc-v2-grid-cal__header">
            <i class="fa-solid fa-grid-4 totc-v2-grid-cal__icon" aria-hidden="true"></i>
            <span class="totc-v2-grid-cal__title">Grid Calibration</span>
            <button type="button"
                class="totc-v2-grid-cal__close"
                data-action="grid-cal-cancel"
                title="Cancel calibration"
                aria-label="Cancel calibration">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
        </header>
        <p class="totc-v2-grid-cal__hint">${hint}</p>
        ${adjustMarkup}
    </aside>`;
}
