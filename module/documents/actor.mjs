export class TurnOfTheCenturyActor extends Actor {
    get dataModel() {
        return this.system;
    }

    get isHero() {
        return this.type === "hero";
    }

    get isVillain() {
        return this.type === "villain";
    }

    get isPawn() {
        return this.type === "pawn";
    }

    get profile() {
        return this.dataModel.profile ?? {};
    }

    get classification() {
        return this.dataModel.classification ?? {};
    }

    get level() {
        return Number(this.dataModel.progression?.level ?? 0);
    }

    get compendiumSubtitle() {
        const role = this.profile.role || this.classification.profession || "";
        const faction = this.profile.faction || this.classification.origin || "";
        return [role, faction].filter(Boolean).join(" - ");
    }

    get typeDetail() {
        if (this.isHero) return this.dataModel.hero?.archetype || "";
        if (this.isVillain) return this.dataModel.villain?.scheme || "";
        if (this.isPawn) return this.dataModel.pawn?.role || "";
        return "";
    }

    getRollData() {
        const rollData = super.getRollData?.() ?? {};
        rollData.actor = {
            id: this.id,
            name: this.name,
            type: this.type,
            level: this.level,
            subtitle: this.compendiumSubtitle,
            detail: this.typeDetail
        };

        return rollData;
    }
}