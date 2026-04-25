const {
    ArrayField,
    HTMLField,
    SchemaField,
    StringField
} = foundry.data.fields;

export const TOTC_NATIONAL_IDENTITIES = [
    "american",
    "argentine",
    "austroHungarian",
    "belgian",
    "brazilian",
    "british",
    "bulgarian",
    "canadian",
    "chilean",
    "chinese",
    "danish",
    "dutch",
    "egyptian",
    "finnish",
    "french",
    "german",
    "greek",
    "hungarian",
    "indian",
    "irish",
    "italian",
    "japanese",
    "korean",
    "mexican",
    "norwegian",
    "ottoman",
    "persian",
    "polish",
    "portuguese",
    "romanian",
    "russian",
    "serbian",
    "siamese",
    "spanish",
    "swedish",
    "swiss",
    "turkish"
];

export const TOTC_LANGUAGE_CHOICES = [
    "arabic",
    "bulgarian",
    "cantonese",
    "croatian",
    "czech",
    "danish",
    "dutch",
    "english",
    "finnish",
    "french",
    "german",
    "greek",
    "hindi",
    "hungarian",
    "irish",
    "italian",
    "japanese",
    "korean",
    "latin",
    "mandarin",
    "norwegian",
    "ottomanTurkish",
    "persian",
    "polish",
    "portuguese",
    "romanian",
    "russian",
    "serbian",
    "spanish",
    "swedish",
    "thai",
    "turkish",
    "urdu",
    "welsh",
    "yiddish"
];

function createLanguageField() {
    return new StringField({
        required: true,
        blank: false,
        choices: TOTC_LANGUAGE_CHOICES
    });
}

function createArtworkField() {
    return new SchemaField({
        image: new StringField({ required: true, blank: true, initial: "" }),
        caption: new StringField({ required: true, blank: true, initial: "" }),
        credit: new StringField({ required: true, blank: true, initial: "" })
    });
}

export class EthnicityDataModel extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            artwork: createArtworkField(),
            description: new HTMLField({ required: true, blank: true }),
            nationalIdentity: new StringField({
                required: true,
                blank: false,
                choices: TOTC_NATIONAL_IDENTITIES,
                initial: "british"
            }),
            languages: new SchemaField({
                primary: new StringField({
                    required: true,
                    blank: false,
                    choices: TOTC_LANGUAGE_CHOICES,
                    initial: "english"
                }),
                spoken: new ArrayField(createLanguageField(), {
                    required: true,
                    initial: () => ["english"]
                }),
                literate: new ArrayField(createLanguageField(), {
                    required: true,
                    initial: () => ["english"]
                })
            }),
            grantedQuirks: new ArrayField(
                new SchemaField({
                    itemId: new StringField({ required: true, blank: false }),
                    label: new StringField({ required: true, blank: true, initial: "" }),
                    reason: new HTMLField({ required: true, blank: true })
                }),
                { required: true, initial: () => [] }
            ),
            culturalNotes: new SchemaField({
                homeland: new StringField({ required: true, blank: true, initial: "" }),
                diaspora: new HTMLField({ required: true, blank: true }),
                periodContext: new HTMLField({ required: true, blank: true })
            })
        };
    }
}
