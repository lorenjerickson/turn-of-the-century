export class LocationDataModel extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            description: new fields.HTMLField({ required: true, initial: "" }),
            notes: new fields.HTMLField({ required: true, initial: "" }),
            locationType: new fields.StringField({ required: true, initial: "village", choices: ["world", "continent", "region", "city", "town", "village", "district", "borough", "market", "other"] }),
            parentLocationId: new fields.StringField({ required: true, initial: "" }),
            features: new fields.ArrayField(new fields.SchemaField({
                name: new fields.StringField({ required: true, initial: "" }),
                description: new fields.StringField({ required: true, initial: "" })
            }), { initial: [] })
        };
    }

    get isLocation() {
        return true;
    }
}
