const { HTMLField, StringField, ArrayField } = foundry.data.fields;

export class EncounterDesignDataModel extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            scenarioId: new StringField({ required: true, blank: true, initial: "" }),
            description: new HTMLField({ required: true, blank: true }),
            hazards: new HTMLField({ required: true, blank: true }),
            npcs: new ArrayField(new StringField({ required: true, blank: false }), { required: true, initial: () => [] })
        };
    }
}
