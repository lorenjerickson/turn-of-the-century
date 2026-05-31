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

function positiveNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
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

export function buildSceneActorPlacements({ actors = [], scene = null, rng = Math.random } = {}) {
    const selectedActors = toArray(actors).filter((actor) => actorId(actor));
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

export async function buildTokenDataForActor(actor, position = {}) {
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
        name: base.name ?? actorName(actor),
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

export async function buildSceneActorTokenData({ actors = [], scene = null, rng = Math.random } = {}) {
    const placements = buildSceneActorPlacements({ actors, scene, rng });
    return Promise.all(placements.map((placement) => buildTokenDataForActor(placement.actor, placement.position)));
}
