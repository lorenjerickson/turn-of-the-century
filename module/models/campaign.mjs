const { ArrayField, HTMLField, SchemaField, StringField } = foundry.data.fields;

export class CampaignDataModel extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            setting: new StringField({ required: true, blank: true, initial: "" }),
            era: new StringField({ required: true, blank: true, initial: "" }),
            environment: new HTMLField({ required: true, blank: true }),
            culture: new HTMLField({ required: true, blank: true }),
            socialClimate: new HTMLField({ required: true, blank: true }),
            antagonist: new SchemaField({
                name: new StringField({ required: true, blank: true, initial: "" }),
                concept: new StringField({ required: true, blank: true, initial: "" }),
                motivations: new HTMLField({ required: true, blank: true })
            }),
            motivations: new HTMLField({ required: true, blank: true }),
            scenarios: new ArrayField(new StringField({ required: true, blank: false }), { required: true, initial: () => [] })
        };
    }
}
