function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
}

function maybeDeepClone(data) {
    if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(data);
    return clone(data);
}

function getRawDocumentSource(data) {
    if (data && typeof data.toObject === "function") return data.toObject();
    if (isObject(data?._source)) return data._source;
    return data;
}

export function migrateLegacyExportSourceData(data) {
    const source = getRawDocumentSource(data);
    if (!isObject(source)) return data;

    const legacyExportSource = source["flags.exportSource"] ?? (isObject(source.flags) ? source.flags.exportSource : undefined);
    if (legacyExportSource === undefined) return source === data ? data : maybeDeepClone(source);

    const migrated = maybeDeepClone(source);
    migrated._stats = {
        ...(isObject(migrated._stats) ? migrated._stats : {}),
        exportSource: migrated._stats?.exportSource ?? legacyExportSource
    };

    delete migrated["flags.exportSource"];
    if (isObject(migrated.flags)) {
        delete migrated.flags.exportSource;
        if (!Object.keys(migrated.flags).length) migrated.flags = {};
    }

    return migrated;
}
