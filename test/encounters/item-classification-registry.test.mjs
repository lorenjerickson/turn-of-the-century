/**
 * Tests for module/encounters/item-classification-registry.mjs
 *
 * The registry and its dependencies (item-traits.mjs) are pure JavaScript
 * with no Foundry API dependencies.
 */

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";

import {
    ITEM_CLASSIFICATION_REGISTRY,
    getClassification,
    listClassifications,
    listClassificationsForType,
    buildClassificationData
} from "../../module/encounters/item-classification-registry.mjs";

// ---------------------------------------------------------------------------
// ITEM_CLASSIFICATION_REGISTRY shape
// ---------------------------------------------------------------------------

describe("ITEM_CLASSIFICATION_REGISTRY", () => {
    it("is frozen", () => {
        assert.ok(Object.isFrozen(ITEM_CLASSIFICATION_REGISTRY));
    });

    it("every entry has required shape", () => {
        for (const [key, c] of Object.entries(ITEM_CLASSIFICATION_REGISTRY)) {
            assert.equal(c.id, key,                              `${key}: id mismatch`);
            assert.ok(typeof c.label === "string" && c.label,    `${key}: label`);
            assert.ok(["weapon","consumable","item"].includes(c.documentType), `${key}: documentType`);
            assert.ok(Array.isArray(c.traits),                   `${key}: traits`);
            assert.ok(typeof c.schemaOverrides === "object",     `${key}: schemaOverrides`);
        }
    });

    it("contains entries for all expected weapon archetypes", () => {
        const expected = [
            "pistol","revolver","derringer","rifle","carbine","shotgun",
            "simpleMeleeOneHanded","martialMeleeOneHanded","martialMeleeTwoHanded",
            "versatileMelee","dagger","spear","thrownExplosive","fusedThrownExplosive","signalFlare"
        ];
        for (const key of expected) {
            assert.ok(key in ITEM_CLASSIFICATION_REGISTRY, `missing classification: ${key}`);
        }
    });

    it("contains entries for consumable archetypes", () => {
        assert.ok("beltElixir"    in ITEM_CLASSIFICATION_REGISTRY);
        assert.ok("fieldMedicine" in ITEM_CLASSIFICATION_REGISTRY);
    });
});

// ---------------------------------------------------------------------------
// getClassification
// ---------------------------------------------------------------------------

describe("getClassification", () => {
    it("returns the classification for a known key", () => {
        const c = getClassification("revolver");
        assert.ok(c !== null);
        assert.equal(c.id, "revolver");
        assert.equal(c.documentType, "weapon");
    });

    it("returns null for an unknown key", () => {
        assert.equal(getClassification("doesNotExist"), null);
    });

    it("dagger classification includes meleeWeapon, thrownWeapon, singleHanded", () => {
        const c = getClassification("dagger");
        assert.ok(c.traits.includes("meleeWeapon"),  "dagger missing meleeWeapon");
        assert.ok(c.traits.includes("thrownWeapon"), "dagger missing thrownWeapon");
        assert.ok(c.traits.includes("singleHanded"), "dagger missing singleHanded");
    });

    it("pistol classification includes firearm, projectileAmmo, singleHanded", () => {
        const c = getClassification("pistol");
        assert.ok(c.traits.includes("firearm"),        "pistol missing firearm");
        assert.ok(c.traits.includes("projectileAmmo"), "pistol missing projectileAmmo");
        assert.ok(c.traits.includes("singleHanded"),   "pistol missing singleHanded");
    });
});

// ---------------------------------------------------------------------------
// listClassifications
// ---------------------------------------------------------------------------

describe("listClassifications", () => {
    it("returns all classifications", () => {
        const list = listClassifications();
        assert.equal(list.length, Object.keys(ITEM_CLASSIFICATION_REGISTRY).length);
    });

    it("is sorted by label ascending", () => {
        const list = listClassifications();
        for (let i = 0; i < list.length - 1; i++) {
            assert.ok(
                list[i].label.localeCompare(list[i + 1].label) <= 0,
                `sort order: "${list[i].label}" should precede "${list[i + 1].label}"`
            );
        }
    });
});

// ---------------------------------------------------------------------------
// listClassificationsForType
// ---------------------------------------------------------------------------

describe("listClassificationsForType", () => {
    it("returns only weapon classifications for 'weapon'", () => {
        const list = listClassificationsForType("weapon");
        assert.ok(list.length > 0, "no weapon classifications found");
        assert.ok(list.every((c) => c.documentType === "weapon"));
    });

    it("returns only consumable classifications for 'consumable'", () => {
        const list = listClassificationsForType("consumable");
        assert.ok(list.length > 0, "no consumable classifications found");
        assert.ok(list.every((c) => c.documentType === "consumable"));
    });

    it("returns empty array for 'item'", () => {
        assert.deepEqual(listClassificationsForType("item"), []);
    });

    it("weapon list does not include consumable entries", () => {
        const list = listClassificationsForType("weapon");
        assert.ok(!list.some((c) => c.id === "beltElixir"));
    });
});

// ---------------------------------------------------------------------------
// buildClassificationData
// ---------------------------------------------------------------------------

describe("buildClassificationData", () => {
    it("returns null for an unknown key", () => {
        assert.equal(buildClassificationData("unknown"), null);
    });

    it("returns traits, actions, and defaults for a known key", () => {
        const data = buildClassificationData("pistol");
        assert.ok(data !== null);
        assert.ok(Array.isArray(data.traits));
        assert.ok(Array.isArray(data.actions));
        assert.ok(typeof data.defaults === "object");
    });

    describe("pistol", () => {
        let data;
        before(() => { data = buildClassificationData("pistol"); });

        it("includes quickShot and aimedShot actions", () => {
            const ids = data.actions.map((a) => a.id);
            assert.ok(ids.includes("quickShot"), "missing quickShot");
            assert.ok(ids.includes("aimedShot"), "missing aimedShot");
        });

        it("aimedShot has the ammo-loaded requirement injected", () => {
            const aimed = data.actions.find((a) => a.id === "aimedShot");
            const req = aimed.requirements.find(
                (r) => r.field === "system.ammunition.loaded" && r.op === "gt"
            );
            assert.ok(req, "aimedShot missing ammo requirement");
        });

        it("includes reload action", () => {
            assert.ok(data.actions.some((a) => a.id === "reload"));
        });

        it("defaults include pistol ammunition capacity of 6", () => {
            assert.equal(data.defaults["ammunition.capacity"], 6);
        });

        it("defaults include ballistic damage type", () => {
            assert.equal(data.defaults["damage.type"], "ballistic");
        });
    });

    describe("dagger", () => {
        let data;
        before(() => { data = buildClassificationData("dagger"); });

        it("includes meleeStrike and thrownAttack", () => {
            const ids = data.actions.map((a) => a.id);
            assert.ok(ids.includes("meleeStrike"),  "missing meleeStrike");
            assert.ok(ids.includes("thrownAttack"), "missing thrownAttack");
        });

        it("has piercing damage type in defaults", () => {
            assert.equal(data.defaults["damage.type"], "piercing");
        });
    });

    describe("spear", () => {
        let data;
        before(() => { data = buildClassificationData("spear"); });

        it("includes meleeStrike, thrownAttack, and twoHandedStrike", () => {
            const ids = data.actions.map((a) => a.id);
            assert.ok(ids.includes("meleeStrike"),     "missing meleeStrike");
            assert.ok(ids.includes("thrownAttack"),    "missing thrownAttack");
            assert.ok(ids.includes("twoHandedStrike"), "missing twoHandedStrike");
        });
    });

    describe("beltElixir", () => {
        let data;
        before(() => { data = buildClassificationData("beltElixir"); });

        it("has consumeBeltElixir action", () => {
            assert.ok(data.actions.some((a) => a.id === "consumeBeltElixir"));
        });

        it("consumeBeltElixir has quantity > 0 requirement", () => {
            const action = data.actions.find((a) => a.id === "consumeBeltElixir");
            const req = action.requirements.find(
                (r) => r.field === "system.quantity.value" && r.op === "gt"
            );
            assert.ok(req);
        });
    });

    describe("fusedThrownExplosive", () => {
        let data;
        before(() => { data = buildClassificationData("fusedThrownExplosive"); });

        it("includes lightAndThrow and thrownAttack", () => {
            const ids = data.actions.map((a) => a.id);
            assert.ok(ids.includes("lightAndThrow"), "missing lightAndThrow");
            assert.ok(ids.includes("thrownAttack"),  "missing thrownAttack");
        });

        it("has explosive damage type in defaults", () => {
            assert.equal(data.defaults["damage.type"], "explosive");
        });
    });
});
