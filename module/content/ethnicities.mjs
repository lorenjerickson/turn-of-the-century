import { ABILITY_MINIMUMS_NONE, createArtwork, createUnlockAction, createUseItemAction, html } from "./builders/sample-content-builders.mjs";

export const ETHNICITY_CONFIGS = [
    {
        name: "British Exile Circle",
        system: {
            description: html("Families displaced by scandal and debt, bound by etiquette and careful silence."),
            nationalIdentity: "british",
            languages: { primary: "english", spoken: ["english", "french"], literate: ["english", "latin"] },
            culturalNotes: {
                homeland: "London and coastal estates",
                diaspora: html("Exile circles gather in port cities through clubs and private chapels."),
                periodContext: html("Status is preserved in appearance while fortunes quietly decline.")
            }
        }
    },
    {
        name: "Parisian Industrial Migrants",
        system: {
            nationalIdentity: "french",
            languages: { primary: "french", spoken: ["french", "english"], literate: ["french"] },
            culturalNotes: {
                homeland: "Paris outskirts",
                diaspora: html("Workers follow foundry contracts across the Channel and river ports."),
                periodContext: html("Union ties and rent strikes shape neighborhood politics.")
            }
        }
    },
    {
        name: "Prussian Technical Guild",
        system: {
            nationalIdentity: "german",
            languages: { primary: "german", spoken: ["german", "english"], literate: ["german", "english"] },
            culturalNotes: {
                homeland: "Rhineland workshops",
                diaspora: html("Guild engineers are prized in rail depots and telegraph houses."),
                periodContext: html("Apprenticeship records carry social weight beyond the workshop.")
            }
        }
    },
    {
        name: "Italian Dock Brotherhood",
        system: {
            nationalIdentity: "italian",
            languages: { primary: "italian", spoken: ["italian", "english"], literate: ["italian"] },
            culturalNotes: {
                homeland: "Liguria and Naples",
                diaspora: html("Mutual aid halls provide credit, lodging, and legal witness."),
                periodContext: html("Dock labor and organized crime often compete for the same recruits.")
            }
        }
    },
    {
        name: "Imperial Russian Refugees",
        system: {
            nationalIdentity: "russian",
            languages: { primary: "russian", spoken: ["russian", "english"], literate: ["russian", "french"] },
            culturalNotes: {
                homeland: "St. Petersburg and Odessa",
                diaspora: html("Refugee committees circulate coded news through tea rooms and print shops."),
                periodContext: html("Political surveillance follows them across borders.")
            }
        }
    },
    {
        name: "Tokyo Telegraph Students",
        system: {
            nationalIdentity: "japanese",
            languages: { primary: "japanese", spoken: ["japanese", "english"], literate: ["japanese", "english"] },
            culturalNotes: {
                homeland: "Tokyo",
                diaspora: html("Students and engineers exchange methods in telegraph and rail academies."),
                periodContext: html("Rapid modernization produces both prestige and suspicion abroad.")
            }
        }
    },
    {
        name: "Ottoman Merchant House",
        system: {
            nationalIdentity: "ottoman",
            languages: { primary: "ottomanTurkish", spoken: ["ottomanTurkish", "arabic", "french"], literate: ["ottomanTurkish", "french"] },
            culturalNotes: {
                homeland: "Istanbul and Smyrna",
                diaspora: html("Trade envoys maintain credit routes linking ports and inland caravans."),
                periodContext: html("Customs reforms and debt pressure reshape old mercantile privileges.")
            }
        }
    },
    {
        name: "American Rail Settlers",
        system: {
            nationalIdentity: "american",
            languages: { primary: "english", spoken: ["english", "spanish"], literate: ["english"] },
            culturalNotes: {
                homeland: "Midwestern rail towns",
                diaspora: html("Mechanics and surveyors follow overseas concessions and tunneling projects."),
                periodContext: html("They bring frontier habits into densely policed imperial cities.")
            }
        }
    },
    {
        name: "Nordic Whaling Diaspora",
        system: {
            nationalIdentity: "norwegian",
            languages: { primary: "norwegian", spoken: ["norwegian", "english"], literate: ["norwegian", "english"] },
            culturalNotes: {
                homeland: "North Sea coasts",
                diaspora: html("Harbor crews move between whaling stations and steamship contracts."),
                periodContext: html("Maritime labor traditions shape their tight mutual-aid circles.")
            }
        }
    },
    {
        name: "Iberian Signal Corps",
        system: {
            nationalIdentity: "spanish",
            languages: { primary: "spanish", spoken: ["spanish", "english"], literate: ["spanish", "english"] },
            culturalNotes: {
                homeland: "Madrid and Barcelona",
                diaspora: html("Telegraph crews circulate between colonial and industrial ports."),
                periodContext: html("Military signaling methods overlap with civilian rail communications.")
            }
        }
    },
    {
        name: "Lowland Canal Families",
        system: {
            nationalIdentity: "dutch",
            languages: { primary: "dutch", spoken: ["dutch", "english"], literate: ["dutch", "english"] },
            culturalNotes: {
                homeland: "Rotterdam and inland canals",
                diaspora: html("Canal pilots and warehouse brokers settle in expanding dock districts."),
                periodContext: html("Trade precision and guild contracts define status and trust.")
            }
        }
    },
    {
        name: "Carpathian Mining Houses",
        system: {
            nationalIdentity: "hungarian",
            languages: { primary: "hungarian", spoken: ["hungarian", "german"], literate: ["hungarian", "german"] },
            culturalNotes: {
                homeland: "Carpathian uplands",
                diaspora: html("Mine engineers and furnace crews follow metallurgy contracts west."),
                periodContext: html("Industrial migration strains old regional loyalties.")
            }
        }
    },
    {
        name: "Levantine Print Guild",
        system: {
            nationalIdentity: "levantine",
            languages: { primary: "arabic", spoken: ["arabic", "french", "english"], literate: ["arabic", "french"] },
            culturalNotes: {
                homeland: "Alexandria and Beirut",
                diaspora: html("Printers and translators anchor multilingual news routes."),
                periodContext: html("Press networks mediate both commerce and political agitation.")
            }
        }
    }
];
