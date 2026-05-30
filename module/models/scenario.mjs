const { HTMLField, StringField } = foundry.data.fields;

export class ScenarioDataModel extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            campaignId: new StringField({ required: true, blank: true, initial: "" }),
            description: new HTMLField({ required: true, blank: true }),
            historicalNotes: new HTMLField({ required: true, blank: true })
        };
    }
}
