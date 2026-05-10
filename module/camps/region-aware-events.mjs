/**
 * Region & Season-Aware Camp Events System
 * 
 * Provides location-specific and season-specific camp event tables with
 * environmental hazards, regional encounters, and thematic narrative beats.
 */

const SEASONS = Object.freeze(["spring", "summer", "autumn", "winter"]);

const CAMP_SEASONS = Object.freeze({
    SPRING: "spring",
    SUMMER: "summer",
    AUTUMN: "autumn",
    WINTER: "winter"
});

const REGIONS = Object.freeze(["frontier", "urban", "industrial", "wilds"]);

/**
 * Season-specific environmental hazards
 */
const SEASON_HAZARDS = Object.freeze({
    spring: [
        "Flooding from snowmelt swells nearby streams.",
        "Mudslides threaten the camp perimeter.",
        "Spring storms with hail roll through.",
        "Awakening predators hunt after winter hibernation."
    ],
    summer: [
        "Oppressive heat exhausts the party at rest.",
        "Drought dries water sources—dehydration risk.",
        "Insects swarm the camp, carrying disease.",
        "Wildfires rage on distant horizons."
    ],
    autumn: [
        "Early frost makes traveling difficult.",
        "Migrating predators pass through the region.",
        "Supply lines become harder to maintain.",
        "Sudden cold snap threatens the unprepared."
    ],
    winter: [
        "Blizzard conditions isolate the camp.",
        "Frostbite becomes a real danger.",
        "Starvation is a looming threat.",
        "Hypothermia claims the exhausted or wounded."
    ]
});

/**
 * Frontier-specific camp events with regional flavor
 */
const FRONTIER_CAMP_EVENTS = Object.freeze({
    low: [
        {
            min: 1,
            max: 5,
            outcome: "quarrel",
            description: "Tensions over frontier rations erupt into argument.",
            hazard: "Watch neglected; predators smell the discord."
        },
        {
            min: 6,
            max: 10,
            outcome: "predator",
            description: "Dire wolves circle the perimeter, testing defenses.",
            hazard: "Risk of surprise attack if not dealt with."
        },
        {
            min: 11,
            max: 15,
            outcome: "watchfall",
            description: "A ranger's exhaustion causes a dangerous sleep on watch.",
            hazard: "Something—or someone—nearly breaches the camp."
        },
        {
            min: 16,
            max: 20,
            outcome: "sickness",
            description: "A party member develops fever from tainted water.",
            hazard: "Others risk infection if hygiene lapses."
        }
    ],
    normal: [
        {
            min: 1,
            max: 4,
            outcome: "uneventful",
            description: "Steady night watch; campfire stories ease tension.",
            benefits: "Party gains composure."
        },
        {
            min: 5,
            max: 9,
            outcome: "wildlife",
            description: "Frontier creatures investigate but pass by.",
            benefits: "Learn about local wildlife movements."
        },
        {
            min: 10,
            max: 14,
            outcome: "trapper_visit",
            description: "A local trapper passes through with intel.",
            benefits: "Gain knowledge of safe routes ahead."
        },
        {
            min: 15,
            max: 18,
            outcome: "discovery",
            description: "Hidden cache of frontier provisions discovered.",
            benefits: "Gain supplies for the road."
        },
        {
            min: 19,
            max: 20,
            outcome: "meteor_shower",
            description: "Meteor shower illuminates the night sky.",
            benefits: "Morale boost; navigation opportunity."
        }
    ],
    high: [
        {
            min: 1,
            max: 5,
            outcome: "bonding",
            description: "Stories of triumph and frontier hardship strengthen bonds.",
            benefits: "Party cohesion increases."
        },
        {
            min: 6,
            max: 10,
            outcome: "hunting_success",
            description: "Hunters return with fresh game for provisions.",
            benefits: "Food supplies replenished."
        },
        {
            min: 11,
            max: 15,
            outcome: "remedy_discovery",
            description: "Party identifies medicinal herbs and remedies.",
            benefits: "Healing supplies gathered."
        },
        {
            min: 16,
            max: 18,
            outcome: "friendly_encounter",
            description: "A friendly frontier settlement sends aid.",
            benefits: "Supplies, shelter, and goodwill."
        },
        {
            min: 19,
            max: 20,
            outcome: "opportunity",
            description: "A rare opportunity for trade or alliance emerges.",
            benefits: "Access to unique frontier goods."
        }
    ]
});

/**
 * Urban-specific camp events (safe houses, settlements)
 */
const URBAN_CAMP_EVENTS = Object.freeze({
    low: [
        {
            min: 1,
            max: 5,
            outcome: "theft",
            description: "Local street urchins attempt to steal supplies.",
            hazard: "Risk of lost provisions and morale damage."
        },
        {
            min: 6,
            max: 10,
            outcome: "gang_threat",
            description: "A local gang demands 'tax' for camping in their territory.",
            hazard: "Confrontation or payment required."
        },
        {
            min: 11,
            max: 15,
            outcome: "plague_news",
            description: "News of sickness spreading through the city.",
            hazard: "Risk of infection if not careful."
        },
        {
            min: 16,
            max: 20,
            outcome: "informant",
            description: "A spy from a rival faction identifies the party.",
            hazard: "Ambush or assassination attempt likely."
        }
    ],
    normal: [
        {
            min: 1,
            max: 5,
            outcome: "lodging",
            description: "A sympathetic innkeeper offers shelter.",
            benefits: "Comfortable rest and hot meals."
        },
        {
            min: 6,
            max: 10,
            outcome: "gossip",
            description: "Barroom gossip reveals useful city secrets.",
            benefits: "Intelligence on local power structures."
        },
        {
            min: 11,
            max: 15,
            outcome: "market_finds",
            description: "Deals found in the night market for rare goods.",
            benefits: "Access to unusual equipment."
        },
        {
            min: 16,
            max: 18,
            outcome: "street_performance",
            description: "A street musician's songs lift the party's mood.",
            benefits: "Morale boost; entertainment."
        },
        {
            min: 19,
            max: 20,
            outcome: "serendipity",
            description: "By chance, a crucial NPC crosses the party's path.",
            benefits: "Unexpected alliance or information."
        }
    ],
    high: [
        {
            min: 1,
            max: 5,
            outcome: "patron",
            description: "A wealthy merchant offers patronage.",
            benefits: "Financial support and city contacts."
        },
        {
            min: 6,
            max: 10,
            outcome: "healer",
            description: "A talented healer offers services.",
            benefits: "Medical aid and herb supplies."
        },
        {
            min: 11,
            max: 15,
            outcome: "craftsmaster",
            description: "An artisan guild master offers training.",
            benefits: "Skill improvement and rare crafted items."
        },
        {
            min: 16,
            max: 18,
            outcome: "noble_interest",
            description: "A minor noble takes interest in the party.",
            benefits: "Political favor and elite connections."
        },
        {
            min: 19,
            max: 20,
            outcome: "underground_alliance",
            description: "An underground faction offers alliance.",
            benefits: "Safe passage and secret resources."
        }
    ]
});

/**
 * Industrial-specific camp events (factories, mills, refining)
 */
const INDUSTRIAL_CAMP_EVENTS = Object.freeze({
    low: [
        {
            min: 1,
            max: 5,
            outcome: "machinery_hazard",
            description: "Automated machinery malfunctions near camp.",
            hazard: "Risk of collision or entanglement."
        },
        {
            min: 6,
            max: 10,
            outcome: "chemical_leak",
            description: "Noxious chemicals seep from nearby facility.",
            hazard: "Toxic gas and respiratory damage."
        },
        {
            min: 11,
            max: 15,
            outcome: "safety_violation",
            description: "Inspectors discover unsafe camp conditions.",
            hazard: "Fines, detention, or forced relocation."
        },
        {
            min: 16,
            max: 20,
            outcome: "saboteur",
            description: "An industrial saboteur scouts the party.",
            hazard: "Potential theft or framing for sabotage."
        }
    ],
    normal: [
        {
            min: 1,
            max: 5,
            outcome: "factory_tour",
            description: "Workers show the party the facility.",
            benefits: "Learn industrial secrets and techniques."
        },
        {
            min: 6,
            max: 10,
            outcome: "spare_parts",
            description: "Discarded industrial parts become useful tools.",
            benefits: "Acquire rare components."
        },
        {
            min: 11,
            max: 15,
            outcome: "foreman_hospitality",
            description: "Foreman offers shelter and work for supplies.",
            benefits: "Honest wages and provisions."
        },
        {
            min: 16,
            max: 18,
            outcome: "efficiency_lesson",
            description: "Engineers' advice improves camp efficiency.",
            benefits: "Better resource management."
        },
        {
            min: 19,
            max: 20,
            outcome: "advancement",
            description: "Opportunity to prove worth to industrial elite.",
            benefits: "Contracts and patronage."
        }
    ],
    high: [
        {
            min: 1,
            max: 5,
            outcome: "engineer_recruitment",
            description: "A brilliant engineer seeks to join the party.",
            benefits: "Gain technical expertise."
        },
        {
            min: 6,
            max: 10,
            outcome: "technological_gift",
            description: "Advanced equipment is gifted as thanks.",
            benefits: "Rare tech and materials."
        },
        {
            min: 11,
            max: 15,
            outcome: "factory_alliance",
            description: "Factory management offers partnership.",
            benefits: "Resources, supplies, and political backing."
        },
        {
            min: 16,
            max: 18,
            outcome: "innovation",
            description: "Party collaborates on a breakthrough.",
            benefits: "Revolutionary discovery; fame."
        },
        {
            min: 19,
            max: 20,
            outcome: "elevation",
            description: "Industrial authority formally recognizes the party.",
            benefits: "Status, wealth, and influence."
        }
    ]
});

/**
 * Wilderness-specific camp events (deep wilds, feral lands)
 */
const WILDS_CAMP_EVENTS = Object.freeze({
    low: [
        {
            min: 1,
            max: 5,
            outcome: "predator_pack",
            description: "A pack of feral predators hunts near camp.",
            hazard: "Multiple attacks throughout the night."
        },
        {
            min: 6,
            max: 10,
            outcome: "territorial_beast",
            description: "A territorial creature claims the camp ground.",
            hazard: "Forced retreat or combat."
        },
        {
            min: 11,
            max: 15,
            outcome: "corruption_sign",
            description: "Signs of corruption or unnatural forces nearby.",
            hazard: "Psychological stress and dread."
        },
        {
            min: 16,
            max: 20,
            outcome: "lost",
            description: "Navigation becomes unclear in the wilderness.",
            hazard: "Party becomes disoriented."
        }
    ],
    normal: [
        {
            min: 1,
            max: 5,
            outcome: "harmony",
            description: "Natural wonders calm the party's spirit.",
            benefits: "Morale boost; spiritual renewal."
        },
        {
            min: 6,
            max: 10,
            outcome: "resource_plenty",
            description: "The wilderness offers abundant resources.",
            benefits: "Gather food, water, and materials."
        },
        {
            min: 11,
            max: 15,
            outcome: "trail_marker",
            description: "An ancient trail marker appears.",
            benefits: "Navigation improved; lore discovered."
        },
        {
            min: 16,
            max: 18,
            outcome: "creature_respect",
            description: "Wild creatures show respect and avoid camp.",
            benefits: "Safe passage through territory."
        },
        {
            min: 19,
            max: 20,
            outcome: "natural_miracle",
            description: "A remarkable natural phenomenon occurs.",
            benefits: "Inspiration and wonder; potential quest."
        }
    ],
    high: [
        {
            min: 1,
            max: 5,
            outcome: "druid_commune",
            description: "Contact with forest spirits or druids.",
            benefits: "Magical blessing and knowledge."
        },
        {
            min: 6,
            max: 10,
            outcome: "creature_pact",
            description: "An animal becomes companion or familiar.",
            benefits: "Ally with unique abilities."
        },
        {
            min: 11,
            max: 15,
            outcome: "primordial_site",
            description: "Discovery of an ancient ritual site.",
            benefits: "Power location; valuable artifacts."
        },
        {
            min: 16,
            max: 18,
            outcome: "wilderness_mastery",
            description: "Party achieves harmony with the wilds.",
            benefits: "Survival abilities enhanced permanently."
        },
        {
            min: 19,
            max: 20,
            outcome: "legend_born",
            description: "Actions in the wilds become legendary.",
            benefits: "Reputation and renown among feral folk."
        }
    ]
});

/**
 * Get region-specific camp events
 * @param {string} region - Region name (frontier, urban, industrial, wilds)
 * @returns {Object} Camp event table for that region
 */
function getRegionCampEvents(region = "frontier") {
    const regionKey = String(region ?? "frontier").toLowerCase();

    switch (regionKey) {
        case "urban":
            return URBAN_CAMP_EVENTS;
        case "industrial":
            return INDUSTRIAL_CAMP_EVENTS;
        case "wilds":
            return WILDS_CAMP_EVENTS;
        case "frontier":
        default:
            return FRONTIER_CAMP_EVENTS;
    }
}

/**
 * Get seasonal hazard description
 * @param {string} season - Season name (spring, summer, autumn, winter)
 * @returns {string} Random hazard description or empty string
 */
function getSeasonalHazard(season = "summer") {
    const seasonKey = String(season ?? "summer").toLowerCase();
    const hazards = SEASON_HAZARDS[seasonKey] ?? SEASON_HAZARDS.summer;

    if (!Array.isArray(hazards) || hazards.length === 0) return "";

    const index = Math.floor(Math.random() * hazards.length);
    return hazards[index] ?? "";
}

/**
 * Roll a camp event with region and season awareness
 * @param {Object} options - Event roll options
 * @param {string} options.region - Region (frontier, urban, industrial, wilds)
 * @param {string} options.season - Season (spring, summer, autumn, winter)
 * @param {string} options.morale - Morale level (low, normal, high)
 * @returns {Object} Event details
 */
function rollRegionAwareCampEvent(options = {}) {
    const { region = "frontier", season = "summer", morale = "normal" } = options;

    // Get region-specific events
    const regionEvents = getRegionCampEvents(region);
    const events = regionEvents[morale] ?? regionEvents.normal;

    // Roll d20 for event
    const roll = Math.floor(Math.random() * 20) + 1;
    const event = events.find((e) => roll >= e.min && roll <= e.max) ?? events[0];

    // Add seasonal hazard if low morale
    const seasonalHazard = morale === "low" ? getSeasonalHazard(season) : "";

    return {
        roll,
        region,
        season,
        morale,
        outcome: event.outcome,
        description: event.description,
        hazard: event.hazard ?? seasonalHazard,
        benefits: event.benefits ?? null,
        fullDescription: seasonalHazard
            ? `${event.description}\n\n*Environmental Hazard: ${seasonalHazard}*`
            : event.description
    };
}

/**
 * Get detailed camp event report with narrative
 * @param {Object} options - Event roll options
 * @returns {Object} Detailed event report
 */
function getDetailedCampEventReport(options = {}) {
    const event = rollRegionAwareCampEvent(options);

    const regionName = String(options.region ?? "frontier")
        .charAt(0)
        .toUpperCase() + String(options.region ?? "frontier").slice(1);
    const seasonName = String(options.season ?? "summer")
        .charAt(0)
        .toUpperCase() + String(options.season ?? "summer").slice(1);

    return {
        title: `${regionName} Camp Event (${seasonName})`,
        roll: `Rolled ${event.roll}`,
        outcome: event.outcome,
        description: event.description,
        hazard: event.hazard,
        benefits: event.benefits,
        narrative: `[${seasonName} in ${regionName}] ${event.fullDescription}`,
        metadata: {
            region: options.region,
            season: options.season,
            morale: options.morale
        }
    };
}

export {
    SEASONS,
    CAMP_SEASONS,
    REGIONS,
    SEASON_HAZARDS,
    FRONTIER_CAMP_EVENTS,
    URBAN_CAMP_EVENTS,
    INDUSTRIAL_CAMP_EVENTS,
    WILDS_CAMP_EVENTS,
    getRegionCampEvents,
    getSeasonalHazard,
    rollRegionAwareCampEvent,
    getDetailedCampEventReport
};
