const { HTMLField, StringField } = foundry.data.fields;

export class CampaignDataModel extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            environment: new HTMLField({ required: true, blank: true }),
            culture: new HTMLField({ required: true, blank: true }),
            socialClimate: new HTMLField({ required: true, blank: true }),
            antagonist: new StringField({ required: true, blank: true, initial: "" }),
            motivations: new HTMLField({ required: true, blank: true })
        };
    }
}
