import { ABILITY_MINIMUMS_NONE, createArtwork, createUnlockAction, createUseItemAction, html, specializationPath } from "./builders/sample-content-builders.mjs";

export const PROFESSION_CONFIGS = [
    {
        name: "Urban Detective",
        system: {
            description: html("Investigators trained to gather testimony, reconstruct scenes, and navigate institutions that prefer silence."),
            category: "investigative",
            primarySkills: ["investigation", "insight", "perception"],
            specializations: [specializationPath("forensic", "Forensic Specialist", "Clerk -> Analyst -> Lead -> Consultant")]
        }
    },
    {
        name: "Field Surgeon",
        system: {
            category: "medical",
            primarySkills: ["medicine", "insight", "investigation"],
            specializations: [specializationPath("triage", "Triage Marshal", "Orderly -> Surgeon -> Chief Surgeon -> Hospital Director")],
            advancementNotes: html("Advance through successful surgeries under adverse conditions.")
        }
    },
    {
        name: "Occult Natural Philosopher",
        system: {
            category: "occultScience",
            primarySkills: ["arcana", "history", "investigation"],
            specializations: [specializationPath("aetheric", "Aetheric Researcher", "Reader -> Experimenter -> Lecturer -> Society Fellow")],
            advancementNotes: html("Permit progress only when observations are documented and replicated.")
        }
    },
    {
        name: "Railway Marshal",
        system: {
            category: "military",
            primarySkills: ["athletics", "perception", "intimidation"],
            specializations: [specializationPath("escort", "Armored Escort", "Guard -> Senior Guard -> Captain -> Inspector")]
        }
    },
    {
        name: "Smokestack Mechanist",
        system: {
            category: "industrial",
            primarySkills: ["athletics", "investigation", "nature"],
            specializations: [specializationPath("boiler", "Boiler Specialist", "Stoker -> Technician -> Foreman -> Master Engineer")]
        }
    },
    {
        name: "Underworld Liaison",
        system: {
            category: "criminal",
            primarySkills: ["deception", "persuasion", "stealth"],
            specializations: [specializationPath("smuggling", "Smuggling Broker", "Runner -> Broker -> Controller -> Syndicate Partner")]
        }
    },
    {
        name: "Factory Auditor",
        system: {
            category: "industrial",
            primarySkills: ["investigation", "history", "insight"],
            specializations: [specializationPath("compliance", "Compliance Examiner", "Clerk -> Examiner -> Chief Auditor -> Commissioner")]
        }
    },
    {
        name: "Signal Cryptographer",
        system: {
            category: "investigative",
            primarySkills: ["history", "investigation", "arcana"],
            specializations: [specializationPath("codework", "Codebreaker", "Decoder -> Analyst -> Senior Analyst -> Directorate")]
        }
    },
    {
        name: "Canal Inspector",
        system: {
            category: "professional",
            primarySkills: ["nature", "survival", "athletics"],
            specializations: [specializationPath("floodworks", "Floodworks Specialist", "Surveyor -> Inspector -> Senior Inspector -> Commissioner")]
        }
    },
    {
        name: "Asylum Custodian",
        system: {
            category: "medical",
            primarySkills: ["insight", "medicine", "intimidation"],
            specializations: [specializationPath("restraint", "Restraint Marshal", "Orderly -> Custodian -> Wing Chief -> Superintendent")]
        }
    },
    {
        name: "Arc Furnace Engineer",
        system: {
            category: "industrial",
            primarySkills: ["arcana", "investigation", "athletics"],
            specializations: [specializationPath("induction", "Induction Specialist", "Stoker -> Technician -> Furnace Master -> Chief Engineer")]
        }
    }
];
