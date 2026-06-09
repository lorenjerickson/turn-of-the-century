const ACTOR_TYPES = Object.freeze(["hero", "pawn", "villain"]);

function toArray(collection) {
    return Array.from(collection?.contents ?? collection ?? []);
}

function actorId(actor) {
    return String(actor?.id ?? actor?._id ?? "").trim();
}

function actorName(actor) {
    return String(actor?.name ?? actorId(actor) ?? "Actor").trim();
}

function actorType(actor) {
    return String(actor?.type ?? "").trim();
}

function tokenActorId(token) {
    return String(token?.actorId
        ?? token?.actor?.id
        ?? token?.baseActor?.id
        ?? token?.document?.actorId
        ?? token?.document?.actor?.id
        ?? ""
    ).trim();
}

function tokenName(token) {
    return String(token?.name ?? token?.document?.name ?? "").trim();
}

function positiveNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function sceneGridOffset(scene, axis) {
    const direct = Number(scene?.grid?.[`offset${axis.toUpperCase()}`]);
    if (Number.isFinite(direct)) return direct;
    const shift = Number(scene?.[`shift${axis.toUpperCase()}`] ?? 0);
    return Number.isFinite(shift) ? -shift : 0;
}

function snapToGrid(value, { cell = 100, offset = 0 } = {}) {
    const size = positiveNumber(cell, 100);
    const phase = Number.isFinite(Number(offset)) ? Number(offset) : 0;
    return Math.round((Number(value ?? 0) - phase) / size) * size + phase;
}

function snapPositionToSceneGrid(position = {}, scene = null) {
    const cell = positiveNumber(scene?.grid?.size, 100);
    return {
        x: snapToGrid(position.x, { cell, offset: sceneGridOffset(scene, "x") }),
        y: snapToGrid(position.y, { cell, offset: sceneGridOffset(scene, "y") })
    };
}

function makeActorOption(actor) {
    return {
        id: actorId(actor),
        name: actorName(actor),
        type: actorType(actor),
        img: String(actor?.img ?? actor?.prototypeToken?.texture?.src ?? ""),
        hasToken: Boolean(actor?.prototypeToken)
    };
}

export function buildSceneActorPlacementPanelModel({ actors = [], scene = null } = {}) {
    const normalized = toArray(actors)
        .map(makeActorOption)
        .filter((actor) => actor.id && ACTOR_TYPES.includes(actor.type))
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));

    return {
        sceneId: String(scene?.id ?? scene?._id ?? "").trim(),
        sceneName: String(scene?.name ?? "Current Scene"),
        heroes: normalized.filter((actor) => actor.type === "hero"),
        pawns: normalized.filter((actor) => actor.type === "pawn"),
        villains: normalized.filter((actor) => actor.type === "villain")
    };
}

function groupPositions({ count = 0, anchorX = 0, anchorY = 0, cell = 100, sceneWidth = 1000, sceneHeight = 1000 } = {}) {
    if (count <= 0) return [];
    const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
    const rows = Math.max(1, Math.ceil(count / columns));
    const spacing = Math.max(48, cell * 1.2);
    const groupWidth = (columns - 1) * spacing;
    const groupHeight = (rows - 1) * spacing;
    const minX = cell * 0.5;
    const minY = cell * 0.5;
    const maxX = Math.max(minX, sceneWidth - cell * 1.5 - groupWidth);
    const maxY = Math.max(minY, sceneHeight - cell * 1.5 - groupHeight);
    const originX = Math.min(maxX, Math.max(minX, anchorX));
    const originY = Math.min(maxY, Math.max(minY, anchorY));

    return Array.from({ length: count }, (_, index) => ({
        x: Math.round(originX + ((index % columns) * spacing)),
        y: Math.round(originY + (Math.floor(index / columns) * spacing))
    }));
}

function randomPosition({ rng, cell, sceneWidth, sceneHeight }) {
    const margin = cell * 0.5;
    const maxX = Math.max(margin, sceneWidth - cell * 1.5);
    const maxY = Math.max(margin, sceneHeight - cell * 1.5);
    return {
        x: Math.round(margin + (rng() * Math.max(0, maxX - margin))),
        y: Math.round(margin + (rng() * Math.max(0, maxY - margin)))
    };
}

function sceneTokens(scene) {
    return toArray(scene?.tokens);
}

function nextIndexedTokenName(baseName, usedNames = new Set()) {
    const safeBaseName = String(baseName ?? "Actor").trim() || "Actor";
    let index = 1;
    let candidate = `${safeBaseName} (${index})`;
    while (usedNames.has(candidate)) {
        index += 1;
        candidate = `${safeBaseName} (${index})`;
    }
    usedNames.add(candidate);
    return candidate;
}

export function buildSceneActorPlacementCandidates({ actors = [], scene = null } = {}) {
    const existingProperActorIds = new Set(sceneTokens(scene).map(tokenActorId).filter(Boolean));
    const stagedProperActorIds = new Set();

    return toArray(actors).filter((actor) => {
        const id = actorId(actor);
        if (!id) return false;
        if (actorType(actor) === "pawn") return true;
        if (existingProperActorIds.has(id) || stagedProperActorIds.has(id)) return false;
        stagedProperActorIds.add(id);
        return true;
    });
}

export function buildSceneActorPlacements({ actors = [], scene = null, rng = Math.random } = {}) {
    const selectedActors = buildSceneActorPlacementCandidates({ actors, scene });
    const width = positiveNumber(scene?.width, positiveNumber(scene?.dimensions?.sceneWidth, 2000));
    const height = positiveNumber(scene?.height, positiveNumber(scene?.dimensions?.sceneHeight, 1400));
    const cell = positiveNumber(scene?.grid?.size, 100);
    const heroes = selectedActors.filter((actor) => actorType(actor) === "hero");
    const pawns = selectedActors.filter((actor) => actorType(actor) === "pawn");
    const villains = selectedActors.filter((actor) => actorType(actor) === "villain");

    const heroPositions = groupPositions({
        count: heroes.length,
        anchorX: cell,
        anchorY: Math.max(cell, (height * 0.5) - (cell * Math.max(0, heroes.length - 1) * 0.3)),
        cell,
        sceneWidth: width,
        sceneHeight: height
    });
    const villainPositions = groupPositions({
        count: villains.length,
        anchorX: width - (cell * Math.max(2, Math.ceil(Math.sqrt(Math.max(1, villains.length))))),
        anchorY: height - (cell * Math.max(2, Math.ceil(villains.length / Math.max(1, Math.ceil(Math.sqrt(Math.max(1, villains.length))))))),
        cell,
        sceneWidth: width,
        sceneHeight: height
    });
    const pawnPositions = pawns.map(() => randomPosition({ rng, cell, sceneWidth: width, sceneHeight: height }));

    return [
        ...heroes.map((actor, index) => ({ actor, position: heroPositions[index], role: "hero" })),
        ...pawns.map((actor, index) => ({ actor, position: pawnPositions[index], role: "pawn" })),
        ...villains.map((actor, index) => ({ actor, position: villainPositions[index], role: "villain" }))
    ];
}

export function buildSceneActorDropPreview({ actors = [], scene = null, anchorPosition = null } = {}) {
    const selectedActors = buildSceneActorPlacementCandidates({ actors, scene });
    const width = positiveNumber(scene?.width, positiveNumber(scene?.dimensions?.sceneWidth, 2000));
    const height = positiveNumber(scene?.height, positiveNumber(scene?.dimensions?.sceneHeight, 1400));
    const cell = positiveNumber(scene?.grid?.size, 100);
    const anchor = snapPositionToSceneGrid(anchorPosition ?? { x: cell, y: cell }, scene);
    const positions = groupPositions({
        count: selectedActors.length,
        anchorX: anchor.x,
        anchorY: anchor.y,
        cell,
        sceneWidth: width,
        sceneHeight: height
    }).map((position) => snapPositionToSceneGrid(position, scene));

    return selectedActors.map((actor, index) => {
        const tokenWidth = positiveNumber(actor?.prototypeToken?.width, 1);
        const tokenHeight = positiveNumber(actor?.prototypeToken?.height, 1);
        return {
            actorId: actorId(actor),
            actorName: actorName(actor),
            role: actorType(actor),
            x: positions[index]?.x ?? anchor.x,
            y: positions[index]?.y ?? anchor.y,
            width: Math.max(cell, tokenWidth * cell),
            height: Math.max(cell, tokenHeight * cell)
        };
    });
}

export async function buildTokenDataForActor(actor, position = {}, { name = "" } = {}) {
    const tokenDocument = typeof actor?.getTokenDocument === "function"
        ? await actor.getTokenDocument({ x: position.x, y: position.y })
        : null;
    const base = tokenDocument?.toObject?.()
        ?? actor?.prototypeToken?.toObject?.()
        ?? actor?.prototypeToken
        ?? {};

    return {
        ...base,
        actorId: actorId(actor),
        name: String(name ?? "").trim() || (base.name ?? actorName(actor)),
        x: Number(position.x ?? 0),
        y: Number(position.y ?? 0),
        width: positiveNumber(base.width, 1),
        height: positiveNumber(base.height, 1),
        texture: {
            ...(base.texture ?? {}),
            src: base.texture?.src ?? actor?.img ?? ""
        }
    };
}

export async function buildSceneActorTokenData({ actors = [], scene = null, rng = Math.random, anchorPosition = null } = {}) {
    const placements = anchorPosition
        ? buildSceneActorDropPreview({ actors, scene, anchorPosition }).map((preview) => ({
            actor: toArray(actors).find((actor) => actorId(actor) === preview.actorId),
            position: { x: preview.x, y: preview.y },
            role: preview.role
        })).filter((placement) => placement.actor)
        : buildSceneActorPlacements({ actors, scene, rng });
    const usedTokenNames = new Set(sceneTokens(scene).map(tokenName).filter(Boolean));
    const plannedPawnCounts = new Map();
    for (const placement of placements) {
        if (actorType(placement.actor) !== "pawn") continue;
        const id = actorId(placement.actor);
        plannedPawnCounts.set(id, (plannedPawnCounts.get(id) ?? 0) + 1);
    }

    const existingPawnCounts = new Map();
    for (const token of sceneTokens(scene)) {
        const id = tokenActorId(token);
        if (!id) continue;
        existingPawnCounts.set(id, (existingPawnCounts.get(id) ?? 0) + 1);
    }

    return Promise.all(placements.map((placement) => {
        const actor = placement.actor;
        let name = "";
        if (actorType(actor) === "pawn") {
            const id = actorId(actor);
            const totalCount = (existingPawnCounts.get(id) ?? 0) + (plannedPawnCounts.get(id) ?? 0);
            if (totalCount > 1) name = nextIndexedTokenName(actorName(actor), usedTokenNames);
        }
        return buildTokenDataForActor(actor, placement.position, { name });
    }));
}
