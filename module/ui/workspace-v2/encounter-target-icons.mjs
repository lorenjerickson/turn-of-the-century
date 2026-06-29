import {
    collectTokenReferenceIds,
    getCombatantTokenReferenceIds
} from "../../encounters/combatant-token-matching.mjs";

function numberOr(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function positiveNumber(value, fallback = 1) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function collectionContents(collection) {
    if (!collection) return [];
    if (Array.isArray(collection)) return collection;
    if (Array.isArray(collection.contents)) return collection.contents;
    if (typeof collection.values === "function") return Array.from(collection.values());
    if (typeof collection[Symbol.iterator] === "function") return Array.from(collection);
    return [];
}

function collectionGet(collection, id = "") {
    const key = String(id ?? "").trim();
    if (!key) return null;
    return collection?.get?.(key)
        ?? collectionContents(collection).find((entry) => (
            String(entry?.id ?? entry?._id ?? entry?.document?.id ?? "").trim() === key
        ))
        ?? null;
}

function findTokenForCombatant(collection, combatant = null) {
    const combatantTokenIds = getCombatantTokenReferenceIds(combatant);
    if (!combatantTokenIds.size) return null;
    for (const id of combatantTokenIds) {
        const token = collectionGet(collection, id);
        if (token) return token;
    }
    return collectionContents(collection).find((token) => {
        const tokenIds = collectTokenReferenceIds(token);
        for (const id of tokenIds) {
            if (combatantTokenIds.has(id)) return true;
        }
        return false;
    }) ?? null;
}

function tokenDocumentId(token = null) {
    return String(token?.document?.id ?? token?.id ?? token?._id ?? "").trim();
}

function firstReferenceId(ids) {
    for (const id of ids ?? []) {
        const key = String(id ?? "").trim();
        if (key) return key;
    }
    return "";
}

function plannedActionsForTargetIcons(combat = null, combatantId = "") {
    const draftClauses = collectionContents(combat?.getCombatantDraftPlan?.(combatantId)?.clauses);
    if (draftClauses.length) return draftClauses;
    return typeof combat?.getCombatantPlan === "function"
        ? (combat.getCombatantPlan(combatantId) ?? [])
        : [];
}

/**
 * Maps an action's type and actionId to one of five icon categories.
 *
 * - "target"  → red bullseye  (attack actions)
 * - "shield"  → blue shield   (defense actions)
 * - "pursue"  → amber arrow   (pursue movement)
 * - "follow"  → green arrow   (follow movement)
 * - "avoid"   → purple arrow  (avoid/evade movement)
 */
export function resolveTargetIconType(action) {
    const type = String(action?.type ?? "").toLowerCase();
    const actionId = String(action?.actionId ?? action?.id ?? "").toLowerCase();

    if (type === "movement") {
        if (actionId === "pursue") return "pursue";
        if (actionId === "avoid") return "avoid";
        return "follow";
    }
    if (type === "defense") return "shield";
    return "target";
}

/**
 * Builds icon specs for all targeted tokens in the given combatant's plan.
 * Returns an array of { tokenId, x, y, tileWidth, tileHeight, iconType }.
 * Deduplicates: if the same token is targeted by multiple actions, only the
 * first occurrence determines the icon type.
 */
export function buildEncounterTargetIconsModel({ combat, combatantId, scene } = {}) {
    if (!combat || !combatantId || !scene) return [];

    const plan = plannedActionsForTargetIcons(combat, combatantId);

    const gridSize = positiveNumber(scene?.grid?.size, 100);
    const seenTokenIds = new Set();
    const icons = [];

    for (const action of plan) {
        const targetCombatantId = String(action?.targetId ?? "").trim();
        if (!targetCombatantId) continue;

        const targetCombatant = combat.combatants?.get?.(targetCombatantId) ?? null;
        if (!targetCombatant) continue;

        const combatantTokenIds = getCombatantTokenReferenceIds(targetCombatant);
        const token = findTokenForCombatant(scene.tokens, targetCombatant);
        if (!token) continue;

        const tokenId = tokenDocumentId(token) || firstReferenceId(combatantTokenIds);
        if (!tokenId || seenTokenIds.has(tokenId)) continue;
        seenTokenIds.add(tokenId);

        icons.push({
            tokenId,
            x: numberOr(token.x ?? token.document?.x, 0),
            y: numberOr(token.y ?? token.document?.y, 0),
            tileWidth: positiveNumber(token.width ?? token.document?.width, 1) * gridSize,
            tileHeight: positiveNumber(token.height ?? token.document?.height, 1) * gridSize,
            iconType: resolveTargetIconType(action)
        });
    }

    return icons;
}

/**
 * Renders icons into a PIXI.Container (destructively — clears existing children).
 * No-ops if PIXI is unavailable or the container is destroyed.
 */
export function renderEncounterTargetIconsToContainer(container, icons) {
    if (!container || container.destroyed) return;
    if (typeof PIXI === "undefined") return;

    while (container.children.length > 0) {
        container.removeChildAt(0)?.destroy?.();
    }

    for (const icon of icons) {
        const g = buildTargetIconGraphic(icon);
        if (g) container.addChild(g);
    }
}

// ---------------------------------------------------------------------------
// Private drawing helpers
// ---------------------------------------------------------------------------

function buildTargetIconGraphic(icon) {
    const { x, y, tileWidth, iconType } = icon;

    const iconSize = Math.max(6, tileWidth * 0.15);
    const r = iconSize / 2;

    // Top-left corner of the token bounding box
    const cx = x + r + 2;
    const cy = y + r + 2;

    const g = new PIXI.Graphics();

    // Dark disc background for legibility over any token image
    fillCircle(g, cx, cy, r + 3, { color: 0x0f172a, alpha: 0.72 });

    switch (iconType) {
        case "target":  drawBullseye(g, cx, cy, r);                    break;
        case "shield":  drawShield(g, cx, cy, r);                       break;
        case "pursue":  drawArrow(g, cx, cy, r, 0xfbbf24, 1);  break; // amber, right
        case "follow":  drawArrow(g, cx, cy, r, 0x4ade80, 1);  break; // green, right
        case "avoid":   drawArrow(g, cx, cy, r, 0xa78bfa, -1); break; // purple, left
        default:        drawBullseye(g, cx, cy, r);                     break;
    }

    return g;
}

function drawBullseye(g, cx, cy, r) {
    // Outer ring
    strokeCircle(g, cx, cy, r, { color: 0xef4444, width: 1.5, alpha: 0.95 });
    // Middle ring
    strokeCircle(g, cx, cy, r * 0.58, { color: 0xef4444, width: 1.5, alpha: 0.95 });
    // Center dot
    fillCircle(g, cx, cy, r * 0.22, { color: 0xef4444, alpha: 0.95 });
    // Crosshairs
    drawLine(g, cx - r, cy, cx + r, cy, { color: 0xef4444, width: 1, alpha: 0.5 });
    drawLine(g, cx, cy - r, cx, cy + r, { color: 0xef4444, width: 1, alpha: 0.5 });
}

function drawShield(g, cx, cy, r) {
    // Pentagon shield: flat top-left/right, V bottom
    const hw = r * 0.78;
    const top = cy - r * 0.82;
    const mid = cy + r * 0.05;
    const bot = cy + r * 0.82;

    const pts = [
        cx - hw, top,
        cx + hw, top,
        cx + hw, mid,
        cx,      bot,
        cx - hw, mid
    ];

    fillPolygon(g, pts, { color: 0x60a5fa, alpha: 0.28 });
    strokePolygon(g, pts, { color: 0x60a5fa, width: 2, alpha: 0.95 });
}

function drawArrow(g, cx, cy, r, color, dir) {
    // dir: 1 = right-pointing, -1 = left-pointing
    const tipX  = cx + dir * r;
    const baseX = cx - dir * r * 0.12;
    const tailX = cx - dir * r;
    const headH = r * 0.88;
    const shaftH = r * 0.38;

    const pts = [
        tipX,  cy,           // tip
        baseX, cy - headH,   // arrowhead top corner
        baseX, cy - shaftH,  // shaft shoulder top
        tailX, cy - shaftH,  // shaft tail top
        tailX, cy + shaftH,  // shaft tail bottom
        baseX, cy + shaftH,  // shaft shoulder bottom
        baseX, cy + headH    // arrowhead bottom corner
    ];

    fillPolygon(g, pts, { color, alpha: 0.88 });
    strokePolygon(g, pts, { color, width: 1.5, alpha: 0.95 });
}

function fillCircle(g, cx, cy, radius, style) {
    if (typeof g.circle === "function" && typeof g.fill === "function") {
        g.circle(cx, cy, radius);
        g.fill(style);
        return;
    }

    g.beginFill?.(style.color, style.alpha ?? 1);
    g.drawCircle?.(cx, cy, radius);
    g.endFill?.();
}

function strokeCircle(g, cx, cy, radius, style) {
    if (typeof g.circle === "function" && typeof g.stroke === "function") {
        g.circle(cx, cy, radius);
        g.stroke(style);
        return;
    }

    g.lineStyle?.(style.width ?? 1, style.color, style.alpha ?? 1);
    g.drawCircle?.(cx, cy, radius);
}

function fillPolygon(g, points, style) {
    if (typeof g.poly === "function" && typeof g.fill === "function") {
        g.poly(points);
        g.fill(style);
        return;
    }

    g.beginFill?.(style.color, style.alpha ?? 1);
    g.drawPolygon?.(points);
    g.endFill?.();
}

function strokePolygon(g, points, style) {
    if (typeof g.poly === "function" && typeof g.stroke === "function") {
        g.poly(points);
        g.stroke(style);
        return;
    }

    g.lineStyle?.(style.width ?? 1, style.color, style.alpha ?? 1);
    g.drawPolygon?.(points);
}

function drawLine(g, x1, y1, x2, y2, style) {
    if (typeof g.stroke === "function") {
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke(style);
        return;
    }

    g.lineStyle?.(style.width ?? 1, style.color, style.alpha ?? 1);
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
}
