/**
 * Tests for module/encounters/item-traits.mjs
 *
 * item-traits.mjs is pure JavaScript with no Foundry API dependencies.
 */

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";

import {
    TOTC_ITEM_TRAITS,
    composeActionsFromTraits,
    getSchemaDefaultsForTraits,
    getSchemaActivationsForTraits,
    validateTraitsForType
} from "../../module/encounters/item-traits.mjs";

// ---------------------------------------------------------------------------
// TOTC_ITEM_TRAITS registry
// ---------------------------------------------------------------------------

describe("TOTC_ITEM_TRAITS", () => {
    it("is frozen", () => {
        assert.ok(Object.isFrozen(TOTC_ITEM_TRAITS));
    });

    it("contains the expected trait IDs", () => {
        const expectedIds = [
            "meleeWeapon", "thrownWeapon", "rangedWeapon", "firearm",
            "projectileAmmo", "singleHanded", "twoHanded", "versatileGrip",
            "explosive", "elementalDamage", "fusedDetonator",
            "beltConsumable", "usableItem", "consumableCharge"
        ];
        for (const id of expectedIds) {
            assert.ok(id in TOTC_ITEM_TRAITS, `missing trait: ${id}`);
        }
    });

    it("every trait has required shape", () => {
        for (const [id, trait] of Object.entries(TOTC_ITEM_TRAITS)) {
            assert.equal(trait.id, id, `trait.id mismatch for: ${id}`);
            assert.ok(Array.isArray(trait.applicableTypes),        `${id}: applicableTypes`);
            assert.ok(Array.isArray(trait.actionContributions),    `${id}: actionContributions`);
            assert.ok(Array.isArray(trait.requirementInjections),  `${id}: requirementInjections`);
            assert.ok(typeof trait.schemaDefaults === "object",    `${id}: schemaDefaults`);
        }
    });
});

// ---------------------------------------------------------------------------
// composeActionsFromTraits
// ---------------------------------------------------------------------------

describe("composeActionsFromTraits", () => {
    it("returns empty array for an empty trait list", () => {
        assert.deepEqual(composeActionsFromTraits([]), []);
    });

    it("silently ignores unknown trait IDs", () => {
        assert.deepEqual(composeActionsFromTraits(["unknownTrait"]), []);
    });

    it("returns a single meleeStrike for [meleeWeapon]", () => {
        const variants = composeActionsFromTraits(["meleeWeapon"]);
        assert.equal(variants.length, 1);
        assert.equal(variants[0].id, "meleeStrike");
        assert.equal(variants[0].type, "attack");
        assert.equal(variants[0].apCost, 1);
        assert.ok(variants[0].requiresToHit);
        assert.deepEqual(variants[0].requirements, []);
    });

    it("composes melee + thrown into two attack variants", () => {
        const variants = composeActionsFromTraits(["meleeWeapon", "thrownWeapon", "singleHanded"]);
        const ids = variants.map((v) => v.id);
        assert.ok(ids.includes("meleeStrike"),  "missing meleeStrike");
        assert.ok(ids.includes("thrownAttack"), "missing thrownAttack");
        assert.equal(variants.length, 2);
    });

    it("composes versatileGrip to add twoHandedStrike", () => {
        const variants = composeActionsFromTraits(["meleeWeapon", "versatileGrip"]);
        const ids = variants.map((v) => v.id);
        assert.ok(ids.includes("meleeStrike"),     "missing meleeStrike");
        assert.ok(ids.includes("twoHandedStrike"), "missing twoHandedStrike");
    });

    describe("firearm + projectileAmmo", () => {
        let variants;
        before(() => {
            variants = composeActionsFromTraits(["firearm", "projectileAmmo"]);
        });

        it("produces quickShot, aimedShot, and reload", () => {
            const ids = variants.map((v) => v.id);
            assert.ok(ids.includes("quickShot"), "missing quickShot");
            assert.ok(ids.includes("aimedShot"), "missing aimedShot");
            assert.ok(ids.includes("reload"),    "missing reload");
        });

        it("injects ammo-loaded requirement into quickShot", () => {
            const qs = variants.find((v) => v.id === "quickShot");
            const req = qs.requirements.find((r) => r.field === "system.ammunition.loaded" && r.op === "gt");
            assert.ok(req, "quickShot missing ammo-loaded requirement");
        });

        it("injects ammo-loaded requirement into aimedShot", () => {
            const as = variants.find((v) => v.id === "aimedShot");
            const req = as.requirements.find((r) => r.field === "system.ammunition.loaded" && r.op === "gt");
            assert.ok(req, "aimedShot missing ammo-loaded requirement");
        });

        it("does NOT inject ammo requirement into reload (utility type)", () => {
            const reload = variants.find((v) => v.id === "reload");
            assert.equal(reload.type, "utility");
            const injected = reload.requirements.find(
                (r) => r.op === "gt" && r.field === "system.ammunition.loaded"
            );
            assert.ok(!injected, "reload should not receive the attack injection");
        });

        it("reload has the lt-capacity field-ref requirement", () => {
            const reload = variants.find((v) => v.id === "reload");
            const req = reload.requirements.find((r) => r.fieldRef === "system.ammunition.capacity");
            assert.ok(req, "reload missing lt-capacity fieldRef requirement");
        });
    });

    it("fusedDetonator + thrownWeapon + explosive composes lightAndThrow + thrownAttack", () => {
        const variants = composeActionsFromTraits(["fusedDetonator", "thrownWeapon", "explosive"]);
        const ids = variants.map((v) => v.id);
        assert.ok(ids.includes("lightAndThrow"), "missing lightAndThrow");
        assert.ok(ids.includes("thrownAttack"),  "missing thrownAttack");
    });

    it("beltConsumable contributes consumeBeltElixir with quantity requirement", () => {
        const variants = composeActionsFromTraits(["beltConsumable"]);
        assert.equal(variants.length, 1);
        assert.equal(variants[0].id, "consumeBeltElixir");
        const req = variants[0].requirements.find(
            (r) => r.field === "system.quantity.value" && r.op === "gt"
        );
        assert.ok(req, "consumeBeltElixir missing quantity requirement");
    });

    it("usableItem contributes useItem with quantity requirement", () => {
        const variants = composeActionsFromTraits(["usableItem"]);
        assert.equal(variants[0].id, "useItem");
        const req = variants[0].requirements.find(
            (r) => r.field === "system.quantity.value" && r.op === "gt"
        );
        assert.ok(req, "useItem missing quantity requirement");
    });

    it("deep-copies requirements so mutations do not affect the frozen source", () => {
        const variants = composeActionsFromTraits(["meleeWeapon"]);
        variants[0].requirements.push({ field: "injected", op: "gt", value: 0, fieldRef: "" });
        const variants2 = composeActionsFromTraits(["meleeWeapon"]);
        assert.deepEqual(variants2[0].requirements, [], "mutation leaked into frozen source");
    });
});

// ---------------------------------------------------------------------------
// getSchemaDefaultsForTraits
// ---------------------------------------------------------------------------

describe("getSchemaDefaultsForTraits", () => {
    it("returns empty object for empty list", () => {
        assert.deepEqual(getSchemaDefaultsForTraits([]), {});
    });

    it("returns firearm defaults", () => {
        const defaults = getSchemaDefaultsForTraits(["firearm"]);
        assert.equal(defaults.classification, "firearm");
        assert.equal(defaults["damage.type"], "ballistic");
    });

    it("returns singleHanded defaults", () => {
        const defaults = getSchemaDefaultsForTraits(["singleHanded"]);
        assert.equal(defaults.handedness, "oneHanded");
    });

    it("returns twoHanded defaults", () => {
        const defaults = getSchemaDefaultsForTraits(["twoHanded"]);
        assert.equal(defaults.handedness, "twoHanded");
    });

    it("later traits override earlier when keys conflict", () => {
        const defaults = getSchemaDefaultsForTraits(["singleHanded", "twoHanded"]);
        assert.equal(defaults.handedness, "twoHanded");
    });

    it("merges defaults from multiple traits", () => {
        const defaults = getSchemaDefaultsForTraits(["projectileAmmo", "singleHanded"]);
        assert.equal(defaults["ammunition.required"], true);
        assert.equal(defaults.handedness, "oneHanded");
    });

    it("silently ignores unknown trait IDs", () => {
        const defaults = getSchemaDefaultsForTraits(["singleHanded", "unknownTrait"]);
        assert.equal(defaults.handedness, "oneHanded");
    });
});

// ---------------------------------------------------------------------------
// getSchemaActivationsForTraits
// ---------------------------------------------------------------------------

describe("getSchemaActivationsForTraits", () => {
    it("returns empty array for empty list", () => {
        assert.deepEqual(getSchemaActivationsForTraits([]), []);
    });

    it("firearm activates damage, physical.range, and ammunition", () => {
        const activations = getSchemaActivationsForTraits(["firearm"]);
        assert.ok(activations.includes("damage"),         "missing damage");
        assert.ok(activations.includes("physical.range"), "missing physical.range");
        assert.ok(activations.includes("ammunition"),     "missing ammunition");
    });

    it("deduplicates activations from overlapping traits", () => {
        const activations = getSchemaActivationsForTraits(["meleeWeapon", "thrownWeapon"]);
        const damageCount = activations.filter((a) => a === "damage").length;
        assert.equal(damageCount, 1, "damage should appear exactly once");
    });
});

// ---------------------------------------------------------------------------
// validateTraitsForType
// ---------------------------------------------------------------------------

describe("validateTraitsForType", () => {
    it("returns true for valid weapon traits", () => {
        assert.ok(validateTraitsForType(["meleeWeapon", "singleHanded"], "weapon"));
    });

    it("returns true for valid consumable traits", () => {
        assert.ok(validateTraitsForType(["beltConsumable"], "consumable"));
    });

    it("returns true for usableItem on item type", () => {
        assert.ok(validateTraitsForType(["usableItem"], "item"));
    });

    it("returns false when a weapon-only trait is applied to consumable", () => {
        assert.ok(!validateTraitsForType(["meleeWeapon"], "consumable"));
    });

    it("returns false when a consumable-only trait is applied to weapon", () => {
        assert.ok(!validateTraitsForType(["beltConsumable"], "weapon"));
    });

    it("returns false for an unknown trait ID", () => {
        assert.ok(!validateTraitsForType(["unknownTrait"], "weapon"));
    });

    it("returns true for empty list regardless of type", () => {
        assert.ok(validateTraitsForType([], "weapon"));
        assert.ok(validateTraitsForType([], "consumable"));
    });

    it("returns false if any trait in a mixed list is invalid for the type", () => {
        assert.ok(!validateTraitsForType(["meleeWeapon", "beltConsumable"], "weapon"));
    });
});
