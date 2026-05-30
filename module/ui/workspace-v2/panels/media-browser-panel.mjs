const ASSETS_ROOT = "assets";

export const MEDIA_BROWSER_TYPE_OPTIONS = Object.freeze([
    { value: "all", label: "All media" },
    { value: "image", label: "Images" },
    { value: "audio", label: "Audio" },
    { value: "video", label: "Video" },
    { value: "other", label: "Other" }
]);

export const MEDIA_BROWSER_VIEW_OPTIONS = Object.freeze([
    { value: "list", label: "List" },
    { value: "tile", label: "Tile" },
    { value: "card", label: "Card" }
]);

export const MEDIA_BROWSER_SORT_COLUMNS = Object.freeze([
    { key: "filename", label: "Filename" },
    { key: "type", label: "Type" },
    { key: "extension", label: "Ext" },
    { key: "directory", label: "Folder" }
]);

const IMAGE_EXTENSIONS = Object.freeze(new Set(["apng", "avif", "gif", "jpg", "jpeg", "png", "svg", "webp"]));
const AUDIO_EXTENSIONS = Object.freeze(new Set(["flac", "m4a", "mp3", "oga", "ogg", "opus", "wav", "webm"]));
const VIDEO_EXTENSIONS = Object.freeze(new Set(["m4v", "mov", "mp4", "ogv", "webm"]));

function escapeAttribute(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function normalizeSlashPath(path = "") {
    return String(path ?? "").trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

function getFilename(path = "") {
    return normalizeSlashPath(path).split("/").filter(Boolean).pop() ?? "";
}

function getDirectory(path = "") {
    const normalized = normalizeSlashPath(path);
    const filename = getFilename(normalized);
    return filename ? normalized.slice(0, Math.max(0, normalized.length - filename.length)).replace(/\/$/, "") : normalized;
}

function getExtension(path = "") {
    const filename = getFilename(path);
    if (!filename.includes(".")) return "";
    return filename.split(".").pop().toLowerCase();
}

export function getMediaTypeFromPath(path = "") {
    const normalized = normalizeSlashPath(path).toLowerCase();
    if (normalized.includes("/audio/") || normalized.startsWith("assets/audio/")) return "audio";
    if (normalized.includes("/video/") || normalized.startsWith("assets/video/")) return "video";

    const extension = getExtension(path);
    if (IMAGE_EXTENSIONS.has(extension)) return "image";
    if (VIDEO_EXTENSIONS.has(extension)) return "video";
    if (AUDIO_EXTENSIONS.has(extension)) return "audio";
    return "other";
}

export function normalizeMediaEntry(pathOrEntry) {
    const path = normalizeSlashPath(typeof pathOrEntry === "string" ? pathOrEntry : pathOrEntry?.path ?? pathOrEntry?.url ?? "");
    const filename = getFilename(path);
    const extension = getExtension(path);

    return {
        id: path,
        path,
        filename,
        directory: getDirectory(path),
        extension,
        type: getMediaTypeFromPath(path)
    };
}

export function normalizeMediaBrowserEntries(entries = []) {
    const seen = new Set();
    return (entries ?? [])
        .map(normalizeMediaEntry)
        .filter((entry) => entry.path && (entry.path.startsWith(`${ASSETS_ROOT}/`) || entry.path.includes(`/${ASSETS_ROOT}/`)) && entry.filename)
        .filter((entry) => {
            if (seen.has(entry.path)) return false;
            seen.add(entry.path);
            return true;
        });
}

export async function browseAssetMedia({ FilePickerClass = null, source = "data", root = ASSETS_ROOT } = {}) {
    if (!FilePickerClass || typeof FilePickerClass.browse !== "function") {
        return {
            ok: false,
            entries: [],
            error: "Media browsing is not available in this Foundry session."
        };
    }

    try {
        const result = await FilePickerClass.browse(source, root, { recursive: true });
        return {
            ok: true,
            entries: normalizeMediaBrowserEntries(result?.files ?? []),
            error: ""
        };
    } catch (error) {
        return {
            ok: false,
            entries: [],
            error: error?.message ?? "Media browsing failed."
        };
    }
}

function normalizeState(state = {}) {
    const view = MEDIA_BROWSER_VIEW_OPTIONS.some((option) => option.value === state.view) ? state.view : "list";
    const type = MEDIA_BROWSER_TYPE_OPTIONS.some((option) => option.value === state.type) ? state.type : "all";
    const sortKey = MEDIA_BROWSER_SORT_COLUMNS.some((column) => column.key === state.sortKey) ? state.sortKey : "filename";
    const sortDirection = state.sortDirection === "desc" ? "desc" : "asc";
    const mode = state.mode === "select" ? "select" : "browse";

    return {
        query: String(state.query ?? ""),
        type,
        view,
        sortKey,
        sortDirection,
        mode,
        selectedPaths: Array.isArray(state.selectedPaths) ? state.selectedPaths.map(String) : []
    };
}

function compareEntries(left, right, sortKey) {
    return String(left?.[sortKey] ?? "").localeCompare(String(right?.[sortKey] ?? ""), undefined, { sensitivity: "base", numeric: true });
}

export function buildMediaBrowserPanelModel({ entries = [], state = {}, loading = false, error = "" } = {}) {
    const normalizedState = normalizeState(state);
    const selected = new Set(normalizedState.selectedPaths);
    const query = normalizedState.query.trim().toLowerCase();
    const filtered = normalizeMediaBrowserEntries(entries)
        .filter((entry) => normalizedState.type === "all" || entry.type === normalizedState.type)
        .filter((entry) => !query || entry.filename.toLowerCase().includes(query));

    filtered.sort((left, right) => {
        const result = compareEntries(left, right, normalizedState.sortKey);
        return normalizedState.sortDirection === "desc" ? -result : result;
    });

    return {
        ...normalizedState,
        loading: Boolean(loading),
        error: String(error || state.error || ""),
        totalCount: normalizeMediaBrowserEntries(entries).length,
        visibleCount: filtered.length,
        selectedCount: filtered.filter((entry) => selected.has(entry.path)).length,
        entries: filtered.map((entry) => ({
            ...entry,
            selected: selected.has(entry.path)
        })),
        typeOptions: MEDIA_BROWSER_TYPE_OPTIONS,
        viewOptions: MEDIA_BROWSER_VIEW_OPTIONS,
        sortColumns: MEDIA_BROWSER_SORT_COLUMNS
    };
}

function renderOptions(options, selectedValue, escapeHTML) {
    return options.map((option) => `
        <option value="${escapeHTML(option.value)}" ${option.value === selectedValue ? "selected" : ""}>${escapeHTML(option.label)}</option>
    `).join("");
}

function renderMediaIcon(entry) {
    if (entry.type === "audio") return `<i class="fa-solid fa-volume-high" aria-hidden="true"></i>`;
    if (entry.type === "video") return `<i class="fa-solid fa-film" aria-hidden="true"></i>`;
    return `<i class="fa-solid fa-file" aria-hidden="true"></i>`;
}

function renderSelectionInput(entry, model, escapeHTML) {
    if (model.mode !== "select") return "";
    return `<input type="checkbox" data-action="media-browser-toggle-selection" data-media-path="${escapeHTML(entry.path)}" ${entry.selected ? "checked" : ""} aria-label="Select ${escapeHTML(entry.filename)}">`;
}

function renderPreview(entry, escapeHTML) {
    if (entry.type === "image") {
        return `<img src="${escapeHTML(entry.path)}" alt="">`;
    }

    return `<span class="totc-v2-media-browser__media-icon">${renderMediaIcon(entry)}</span>`;
}

function renderList(model, escapeHTML) {
    const headers = model.sortColumns.map((column) => {
        const active = model.sortKey === column.key;
        const nextDirection = active && model.sortDirection === "asc" ? "desc" : "asc";
        const icon = active ? (model.sortDirection === "asc" ? "fa-sort-up" : "fa-sort-down") : "fa-sort";
        return `<th scope="col"><button type="button" data-action="media-browser-sort" data-sort-key="${escapeHTML(column.key)}" data-sort-direction="${nextDirection}">${escapeHTML(column.label)} <i class="fa-solid ${icon}" aria-hidden="true"></i></button></th>`;
    }).join("");

    const rows = model.entries.map((entry) => `
        <tr>
            ${model.mode === "select" ? `<td class="totc-v2-media-browser__select-cell">${renderSelectionInput(entry, model, escapeHTML)}</td>` : ""}
            <td>${escapeHTML(entry.filename)}</td>
            <td>${escapeHTML(entry.type)}</td>
            <td>${escapeHTML(entry.extension)}</td>
            <td>${escapeHTML(entry.directory)}</td>
        </tr>
    `).join("");

    return `
    <div class="totc-v2-media-browser__table-wrap">
        <table class="totc-v2-media-browser__table">
            <thead><tr>${model.mode === "select" ? `<th scope="col">Select</th>` : ""}${headers}</tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}

function renderTiles(model, escapeHTML) {
    return `
    <div class="totc-v2-media-browser__tiles">
        ${model.entries.map((entry) => `
            <article class="totc-v2-media-browser__tile ${entry.selected ? "is-selected" : ""}">
                <div class="totc-v2-media-browser__selection-corner">${renderSelectionInput(entry, model, escapeHTML)}</div>
                <div class="totc-v2-media-browser__preview">${renderPreview(entry, escapeHTML)}</div>
                <div class="totc-v2-media-browser__filename" title="${escapeHTML(entry.filename)}">${escapeHTML(entry.filename)}</div>
            </article>
        `).join("")}
    </div>`;
}

function renderCards(model, escapeHTML) {
    return `
    <div class="totc-v2-media-browser__cards">
        ${model.entries.map((entry) => `
            <article class="totc-v2-media-browser__card ${entry.selected ? "is-selected" : ""}">
                <div class="totc-v2-media-browser__selection-corner">${renderSelectionInput(entry, model, escapeHTML)}</div>
                <div class="totc-v2-media-browser__card-preview">${renderPreview(entry, escapeHTML)}</div>
                <dl class="totc-v2-media-browser__metadata">
                    <div><dt>Name</dt><dd title="${escapeHTML(entry.filename)}">${escapeHTML(entry.filename)}</dd></div>
                    <div><dt>Type</dt><dd>${escapeHTML(entry.type)}</dd></div>
                    <div><dt>Ext</dt><dd>${escapeHTML(entry.extension || "-")}</dd></div>
                    <div><dt>Folder</dt><dd title="${escapeHTML(entry.directory)}">${escapeHTML(entry.directory)}</dd></div>
                </dl>
            </article>
        `).join("")}
    </div>`;
}

export function renderMediaBrowserPanel(model = {}, { escapeHTML = escapeAttribute } = {}) {
    const body = model.loading
        ? `<div class="totc-v2-media-browser__empty">Loading media...</div>`
        : model.error
            ? `<div class="totc-v2-media-browser__error">${escapeHTML(model.error)}</div>`
            : model.entries?.length
                ? model.view === "tile"
                    ? renderTiles(model, escapeHTML)
                    : model.view === "card"
                        ? renderCards(model, escapeHTML)
                        : renderList(model, escapeHTML)
                : `<div class="totc-v2-media-browser__empty">No media found in assets.</div>`;

    return `
    <section class="totc-v2-media-browser" data-media-browser-mode="${escapeHTML(model.mode ?? "browse")}">
        <div class="totc-v2-media-browser__toolbar">
            <label class="totc-v2-media-browser__search">
                <span>Search</span>
                <input type="search" data-action="media-browser-search" value="${escapeHTML(model.query ?? "")}" placeholder="Filename">
            </label>
            <label>
                <span>Type</span>
                <select data-action="media-browser-filter-type">${renderOptions(model.typeOptions ?? MEDIA_BROWSER_TYPE_OPTIONS, model.type ?? "all", escapeHTML)}</select>
            </label>
            <label>
                <span>View</span>
                <select data-action="media-browser-view">${renderOptions(model.viewOptions ?? MEDIA_BROWSER_VIEW_OPTIONS, model.view ?? "list", escapeHTML)}</select>
            </label>
            <button type="button" data-action="media-browser-refresh" title="Refresh media"><i class="fa-solid fa-rotate" aria-hidden="true"></i><span>Refresh</span></button>
            ${model.mode === "select" ? `
                <div class="totc-v2-media-browser__select-actions">
                    <button type="button" data-action="media-browser-clear-selection">Clear</button>
                    <button type="button" data-action="media-browser-confirm-selection">Select</button>
                </div>
            ` : ""}
        </div>
        <div class="totc-v2-media-browser__summary">${escapeHTML(model.visibleCount ?? 0)} of ${escapeHTML(model.totalCount ?? 0)} media item${model.totalCount === 1 ? "" : "s"}${model.mode === "select" ? ` - ${escapeHTML(model.selectedCount ?? 0)} selected` : ""}</div>
        <div class="totc-v2-media-browser__body">${body}</div>
    </section>`;
}
