export class TurnOfTheCenturyItem extends Item {
    get dataModel() {
        return this.system;
    }

    get artwork() {
        return this.dataModel.artwork ?? {};
    }

    get artworkImage() {
        return this.artwork.image || this.img;
    }

    get displayName() {
        return this.dataModel.commonName || this.name;
    }

    get description() {
        return this.dataModel.description ?? "";
    }

    get quality() {
        return this.dataModel.quality ?? "standard";
    }

    get rarity() {
        return this.dataModel.rarity ?? "common";
    }

    get weight() {
        return Number(this.dataModel.physical?.weight ?? this.dataModel.encumbrance?.weight ?? 0);
    }

    get bulk() {
        return Number(this.dataModel.physical?.bulk ?? this.dataModel.encumbrance?.bulk ?? 0);
    }

    get tags() {
        return Array.from(this.dataModel.properties?.tags ?? []);
    }

    get isArmor() {
        return this.type === "armor";
    }

    get isConsumable() {
        return this.type === "consumable";
    }

    get isEffect() {
        return this.type === "effect";
    }

    get isEquipment() {
        return ["equipment", "item", "skill", "talent"].includes(this.type);
    }

    get isWeapon() {
        return this.type === "weapon";
    }

    get isEquippable() {
        return this.isArmor || this.isWeapon || this.isEquipment;
    }

    get equipmentSlot() {
        if (this.isArmor) return this.dataModel.slot;
        if (this.isWeapon) return ["twoHanded", "versatile"].includes(this.dataModel.handedness) ? "hands" : "hands";
        return null;
    }

    get armorClassIncrement() {
        if (!this.isArmor) return 0;
        return Number(this.dataModel.armorClass?.increment ?? 0);
    }

    get mechanicalEffects() {
        if (this.isConsumable) return Array.from(this.dataModel.effects ?? []);
        if (this.isEffect) return Array.from(this.dataModel.impacts ?? []);
        return Array.from(this.dataModel.effects ?? []);
    }

    get sideEffects() {
        return Array.from(this.dataModel.sideEffects ?? []);
    }

    get requiresAmmunition() {
        return Boolean(this.isWeapon && this.dataModel.ammunition?.required);
    }

    get ammunitionLoaded() {
        return Number(this.dataModel.ammunition?.loaded ?? 0);
    }

    get ammunitionCapacity() {
        return Number(this.dataModel.ammunition?.capacity ?? 0);
    }

    get ammunitionConsumedPerAttack() {
        return Number(this.dataModel.ammunition?.consumedPerAttack ?? 0);
    }

    get hasAmmunitionForAttack() {
        if (!this.requiresAmmunition) return true;
        return this.ammunitionLoaded >= Math.max(this.ammunitionConsumedPerAttack, 1);
    }

    get quantity() {
        return Number(this.dataModel.quantity?.value ?? this.dataModel.physical?.quantity ?? 1);
    }

    get canUse() {
        if (this.isConsumable) return this.quantity > 0;
        if (this.isWeapon) return this.hasAmmunitionForAttack;
        return true;
    }

    getRollData() {
        const rollData = super.getRollData?.() ?? {};
        rollData.item = {
            id: this.id,
            name: this.name,
            type: this.type,
            quality: this.quality,
            rarity: this.rarity,
            weight: this.weight,
            bulk: this.bulk
        };

        if (this.isWeapon) {
            rollData.weapon = {
                damage: this.dataModel.damage,
                handedness: this.dataModel.handedness,
                ammunition: this.dataModel.ammunition,
                range: this.dataModel.physical?.range
            };
        }

        if (this.isArmor) {
            rollData.armor = {
                slot: this.dataModel.slot,
                armorClassIncrement: this.armorClassIncrement,
                prerequisites: this.dataModel.prerequisites
            };
        }

        return rollData;
    }

    getAbilityPrerequisiteFailures(actor = this.actor) {
        if (!actor) return [];

        const minimums = this.dataModel.prerequisites?.abilityMinimums;
        if (!minimums) return [];

        return Object.entries(minimums).flatMap(([ability, minimum]) => {
            if (!minimum) return [];

            const actorValue = Number(actor.system?.abilities?.[ability]?.value ?? 0);
            return actorValue >= minimum ? [] : [{ ability, minimum, value: actorValue }];
        });
    }

    meetsAbilityPrerequisites(actor = this.actor) {
        return this.getAbilityPrerequisiteFailures(actor).length === 0;
    }

    async consumeAmmunition(quantity = this.ammunitionConsumedPerAttack || 1) {
        if (!this.requiresAmmunition) return true;
        if (this.ammunitionLoaded < quantity) return false;

        await this.update({ "system.ammunition.loaded": this.ammunitionLoaded - quantity });
        return true;
    }

    async consumeQuantity(quantity = 1) {
        if (!this.isConsumable) return true;
        if (this.quantity < quantity) return false;

        await this.update({ "system.quantity.value": this.quantity - quantity });
        return true;
    }

    async use({ actor = this.actor, consume = true } = {}) {
        if (!this.canUse) return { success: false, reason: "unavailable", item: this };

        if (this.isWeapon && consume) {
            const consumed = await this.consumeAmmunition();
            if (!consumed) return { success: false, reason: "ammunition", item: this };
        }

        if (this.isConsumable && consume && this.dataModel.use?.consumesCharge) {
            const consumed = await this.consumeQuantity();
            if (!consumed) return { success: false, reason: "quantity", item: this };
        }

        return {
            success: true,
            actor,
            item: this,
            effects: this.mechanicalEffects,
            sideEffects: this.sideEffects
        };
    }
}
