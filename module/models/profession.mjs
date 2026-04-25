import { TOTC_SKILL_CONFIG } from "./actor.mjs";

const {
    ArrayField,
    HTMLField,
    NumberField,
    SchemaField,
    StringField
} = foundry.data.fields;

export const TOTC_PROFESSION_SKILL_KEYS = Object.keys(TOTC_SKILL_CONFIG);
export const TOTC_PROFESSION_CATEGORIES = [
    "academic",
    "artisan",
    "criminal",
    "industrial",
    "investigative",
    "medical",
    "military",
    "occultScience",
    "professional",
    "social",
    "wilderness"
];
export const TOTC_EXPERTISE_RANKS = ["unskilled", "apprentice", "journeyman", "master", "expert"];

function createArtworkField() {
    return new SchemaField({
        image: new StringField({ required: true, blank: true, initial: "" }),
        caption: new StringField({ required: true, blank: true, initial: "" }),
        credit: new StringField({ required: true, blank: true, initial: "" })
    });
}

function createSkillUseField() {
    return new SchemaField({
        skill: new StringField({
            required: true,
            blank: false,
            choices: TOTC_PROFESSION_SKILL_KEYS,
            initial: "investigation"
        }),
        minimumUses: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
        experienceAward: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
        context: new HTMLField({ required: true, blank: true })
    });
}

function createQuirkGrantField() {
    return new SchemaField({
        itemId: new StringField({ required: true, blank: false }),
        label: new StringField({ required: true, blank: true, initial: "" }),
        grantedAt: new StringField({ required: true, blank: true, initial: "" }),
        reason: new HTMLField({ required: true, blank: true })
    });
}

function createExpertiseLevelField() {
    return new SchemaField({
        rank: new StringField({
            required: true,
            blank: false,
            choices: TOTC_EXPERTISE_RANKS,
            initial: "unskilled"
        }),
        title: new StringField({ required: true, blank: false, initial: "Unskilled" }),
        level: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        requiredExperience: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        requiredSkillUses: new ArrayField(createSkillUseField(), { required: true, initial: () => [] }),
        grantedQuirks: new ArrayField(createQuirkGrantField(), { required: true, initial: () => [] }),
        description: new HTMLField({ required: true, blank: true })
    });
}

function createSpecializationLevelField() {
    return new SchemaField({
        level: new NumberField({ required: true, integer: true, min: 1, initial: 1 }),
        title: new StringField({ required: true, blank: false, initial: "Profession-Defined Specialization" }),
        requiredExpertiseRank: new StringField({
            required: true,
            blank: false,
            choices: TOTC_EXPERTISE_RANKS,
            initial: "apprentice"
        }),
        requiredExperience: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        requiredSkillUses: new ArrayField(createSkillUseField(), { required: true, initial: () => [] }),
        grantedQuirks: new ArrayField(createQuirkGrantField(), { required: true, initial: () => [] }),
        description: new HTMLField({ required: true, blank: true })
    });
}

function createSpecializationPathField() {
    return new SchemaField({
        key: new StringField({ required: true, blank: false, initial: "professionSpecialization" }),
        name: new StringField({ required: true, blank: false, initial: "Profession Specialization" }),
        description: new HTMLField({ required: true, blank: true }),
        exampleProgression: new StringField({
            required: true,
            blank: true,
            initial: "Foot Soldier -> Rifleman -> Sniper -> Assassin"
        }),
        levels: new ArrayField(createSpecializationLevelField(), {
            required: true,
            initial: () => [
                { level: 1, title: "Specialization Level 1" },
                { level: 2, title: "Specialization Level 2" },
                { level: 3, title: "Specialization Level 3" },
                { level: 4, title: "Specialization Level 4" }
            ]
        })
    });
}

export class ProfessionDataModel extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            artwork: createArtworkField(),
            description: new HTMLField({ required: true, blank: true }),
            category: new StringField({
                required: true,
                blank: false,
                choices: TOTC_PROFESSION_CATEGORIES,
                initial: "professional"
            }),
            primarySkills: new ArrayField(
                new StringField({ required: true, blank: false, choices: TOTC_PROFESSION_SKILL_KEYS }),
                { required: true, initial: () => [] }
            ),
            expertiseLevels: new ArrayField(createExpertiseLevelField(), {
                required: true,
                initial: () => [
                    { rank: "unskilled", title: "Unskilled", level: 0, requiredExperience: 0 },
                    { rank: "apprentice", title: "Apprentice", level: 1, requiredExperience: 10 },
                    { rank: "journeyman", title: "Journeyman", level: 2, requiredExperience: 25 },
                    { rank: "master", title: "Master", level: 3, requiredExperience: 50 },
                    { rank: "expert", title: "Expert", level: 4, requiredExperience: 100 }
                ]
            }),
            specializations: new ArrayField(createSpecializationPathField(), { required: true, initial: () => [] }),
            grantedQuirks: new ArrayField(createQuirkGrantField(), { required: true, initial: () => [] }),
            advancementNotes: new HTMLField({ required: true, blank: true })
        };
    }
}
