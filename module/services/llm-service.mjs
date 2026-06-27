const OPENAI_API_BASE_URL = "https://api.openai.com/v1";
const OPENAI_IMAGE_MODEL = "gpt-image-2";
const TOKEN_ART_STYLE_SUFFIX = [
    "Style: gothic-steampunk 1890s–1910s aesthetic.",
    "Favour brass, iron, leather, soot, gaslight, cabinet-card portrait quality, Victorian engravings.",
    "No modern sci-fi, no fantasy tropes, no neon or plastic.",
    "Square 1024×1024 canvas, subject centred, dark vignette border.",
    "Suitable for a miniature token on a tabletop battle-map. No text or UI overlays."
].join(" ");
const OPENAI_DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_SYSTEM_PROMPT = "You are a master architect for the Turn of the Century Roleplaying Game, responsible for creating engaging, historically grounded campaigns and scenarios.";
export const GENERAL_GENERATION_PROMPT_PATH = "prompts/general.md";

export const OPENAI_API_KEY_SETTING = "openaiApiKey";
export const GENERATION_PROMPT_PATHS = Object.freeze({
    campaign: "prompts/campaign.md",
    scenario: "prompts/scenario.md",
    "encounter-design": "prompts/encounter-design.md",
    actor: "prompts/actor.md",
    pawn: "prompts/actor.md",
    location: "prompts/location.md"
});

const CONTENT_SKILL_PROMPTS = Object.freeze({
    "language-style": [
        "## Content Skill: Language Style",
        "Write in a grave, literate late Victorian to Edwardian register: ornate enough to feel period-conscious, but always clear and useful for play.",
        "Blend gothic dread with industrial modernity. Favour atmosphere, implication, social restraint, class pressure, fog, soot, gaslight, machinery, architecture, illness, scandal, and moral unease over modern slang, trailer language, or generic fantasy phrasing.",
        "Draw on broad period conventions rather than imitating any single real author."
    ].join("\n"),
    "science-not-magic": [
        "## Content Skill: Science, Not Magic",
        "Frame extraordinary effects through material causes: apparatus, chemistry, electricity, medicine, nerves, optics, acoustics, pressure, contagion, heredity, mesmerism, rare minerals, experimental procedure, or disciplined training.",
        "Avoid fantasy-magic categories and vocabulary such as spells, mana, enchanted objects, wizardry, necromancy, summoning, hexes, or arcane powers. Preserve mystery, but imply observable mechanisms, limits, costs, failures, and consequences."
    ].join("\n"),
    "genetic-manipulation": [
        "## Content Skill: Genetic Manipulation",
        "When creating creatures, altered bodies, monstrous actors, specimens, or biological horrors, ground them in flesh, heredity, pathology, breeding, mutation, surgery, glandular treatment, parasites, conditioning, environmental pressure, or laboratory intervention.",
        "Avoid magical beast logic, mystical ancestry, elemental affinity, innate magic, or supernatural creature categories. Tie every notable trait to anatomy, behaviour, metabolism, habitat, maintenance burden, or visible defect."
    ].join("\n"),
    "asset-generation": [
        "## Content Skill: Asset Generation",
        "When creating items, equipment, talents, quirks, assets, or compendium-ready content, transform inspiration conceptually into a unique gothic-horror and steampunk analog instead of copying names, text, or identity.",
        "Make assets period-appropriate, non-redundant, mechanically useful, richly described, and grounded in the system's data conventions. Include provenance or adaptation notes only when the specialized prompt requests them."
    ].join("\n"),
    "art-style": [
        "## Content Skill: Art Style",
        "When generating or describing visual, audio, map, token, portrait, poster, or handout assets, keep the asset materially grounded in 1890-1910 gothic-steampunk aesthetics.",
        "Prefer hand-built machinery, brass, iron, lacquered wood, leather, etched glass, velvet, soot, gaslight, cabinet-card portraits, engravings, scientific plates, patent drawings, newspaper sketches, and lantern-slide sensibility. Avoid modern sci-fi, plastic, neon, digital overlays, superhero silhouettes, and generic medieval fantasy."
    ].join("\n")
});

const ITEM_GENERATION_TYPES = new Set([
    "armor",
    "consumable",
    "effect",
    "equipment",
    "item",
    "quirk",
    "skill",
    "talent",
    "weapon"
]);

const CREATURE_GENERATION_TYPES = new Set(["actor", "pawn", "encounter-design"]);
const MEDIA_AWARE_GENERATION_TYPES = new Set(["actor", "pawn", "location", "campaign", "scenario", "encounter-design", "item", "equipment", "weapon", "armor", "consumable"]);

const GENERATION_JSON_SCHEMAS = Object.freeze({
    campaign: `{"name": "Campaign Title", "system": {"profile": {"summary": "Brief summary", "environment": "HTML", "culture": "HTML", "socialClimate": "HTML", "antagonist": {"name": "", "concept": "", "motivations": "HTML"}}}}`,
    scenario: `{"name": "Scenario Title", "system": {"profile": {"summary": "Brief summary", "description": "HTML", "historicalNotes": "HTML", "resolutionCriteria": "HTML"}}}`,
    "encounter-design": `{"name": "Encounter Title", "system": {"profile": {"summary": "Brief summary", "description": "HTML", "hazards": "HTML", "npcs": []}}}`,
    actor: `{"name": "Actor Name", "system": {"profile": {"role": "Role", "faction": "Faction", "summary": "Brief summary", "tags": []}, "biography": "HTML", "notes": "HTML", "classification": {"category": "npc", "species": "Human", "profession": "Profession"}, "progression": {"level": 1, "challenge": ""}, "abilities": {"str": {"value": 10}, "dex": {"value": 10}, "con": {"value": 10}, "int": {"value": 10}, "wis": {"value": 10}, "cha": {"value": 10}, "san": {"value": 10}}, "inventory": {"pack": {"itemIds": []}, "combat": {"readyWeaponIds": []}}, "traits": {"languages": []}}}`,
    pawn: `{"name": "NPC Name", "system": {"profile": {"summary": "Brief summary", "role": "Role", "faction": "Faction"}, "biography": "HTML", "notes": "HTML", "pawn": {"role": "Role", "threat": 1, "disposition": "neutral"}}}`,
    location: `{"name": "Location Name", "system": {"locationType": "village/market/city/district/etc", "profile": {"summary": "Brief summary", "description": "HTML", "notes": "HTML"}, "features": [{"name": "Feature Name", "description": "Brief desc"}]}}`
});

export function extractOpenAIResponseText(data = {}) {
    if (typeof data.output_text === "string" && data.output_text.trim()) {
        return data.output_text;
    }

    for (const item of data.output ?? []) {
        for (const content of item.content ?? []) {
            if (typeof content.text === "string" && content.text.trim()) {
                return content.text;
            }
        }
    }

    return "";
}

function stripHTML(value) {
    return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function getRelevantContentSkillPrompts(elementType = "campaign") {
    const normalizedType = String(elementType ?? "campaign").trim().toLowerCase();
    const skillKeys = ["language-style", "science-not-magic"];

    if (CREATURE_GENERATION_TYPES.has(normalizedType)) skillKeys.push("genetic-manipulation");
    if (ITEM_GENERATION_TYPES.has(normalizedType)) skillKeys.push("asset-generation");
    if (MEDIA_AWARE_GENERATION_TYPES.has(normalizedType)) skillKeys.push("art-style");

    return skillKeys.map((key) => CONTENT_SKILL_PROMPTS[key]).filter(Boolean);
}

export function buildActorTokenImagePrompt(actor) {
    const name = String(actor?.name ?? "Unknown").trim();
    const bio = stripHTML(actor?.system?.biography ?? "");
    const classification = actor?.system?.classification ?? {};
    const profession = String(classification.profession ?? "").trim();
    const origin = String(classification.origin ?? "").trim();
    const category = String(classification.category ?? "").trim().toLowerCase();
    const species = String(classification.species ?? "Human").trim();
    const isCreature = category === "monster" || (species !== "Human" && species !== "");

    if (isCreature) {
        const speciesLabel = species && species !== "Human" ? `, ${species}` : "";
        const profLabel = profession ? `, role: ${profession}` : "";
        return [
            `Token art for a tabletop RPG creature in a gothic Victorian steampunk setting.`,
            `Creature: ${name}${speciesLabel}${profLabel}.`,
            bio ? `Description: ${bio}` : "",
            "Show the creature's full form or a menacing close-up.",
            "Dramatic gaslit shadows, Victorian scientific-illustration aesthetic meets gothic horror.",
            TOKEN_ART_STYLE_SUFFIX
        ].filter(Boolean).join(" ");
    }

    const locationLabel = origin ? ` from ${origin}` : "";
    const profLabel = profession ? `, ${profession}` : "";
    return [
        `Token portrait for a tabletop RPG character in a gothic Victorian steampunk setting.`,
        `Character: ${name}${profLabel}${locationLabel}.`,
        bio ? `Description: ${bio}` : "",
        "Shoulder-up bust portrait, period-appropriate clothing, gaslit illumination, rich detail.",
        TOKEN_ART_STYLE_SUFFIX
    ].filter(Boolean).join(" ");
}

export function buildGenerationContextPrompt(context = {}) {
    const sections = [];
    const actorType = String(context.actorType ?? "").trim();
    if (actorType) {
        sections.push([
            "## Selected Actor Type Context",
            `The GM selected "${actorType}" as the actor type for this generation.`,
            "Create actor data appropriate for that Foundry actor type."
        ].join("\n"));
    }

    const parentLocation = context.parentLocation ?? null;
    if (!parentLocation) return sections.join("\n\n");
    const lines = [
        "## Selected Parent Location Context",
        `The GM selected "${parentLocation.name ?? "Unnamed location"}" as the parent location for this generation.`,
        `Parent location id: ${parentLocation.id ?? ""}`,
        `Parent location type: ${parentLocation.locationType ?? ""}`
    ];

    const description = stripHTML(parentLocation.description);
    if (description) lines.push(`Parent description: ${description}`);

    const notes = stripHTML(parentLocation.notes);
    if (notes) lines.push(`Parent notes: ${notes}`);

    lines.push("Create a child location that belongs under this parent. Set system.parentLocationId to the parent location id in the JSON response.");
    sections.push(lines.join("\n"));
    return sections.join("\n\n");
}

export function getGenerationJsonConstraint(elementType = "campaign") {
    const jsonConstraint = GENERATION_JSON_SCHEMAS[elementType] || GENERATION_JSON_SCHEMAS.campaign;
    return [
        "IMPORTANT: You must reply ONLY with valid JSON that matches the following structure. Do not include markdown formatting or backticks around the JSON. Your response will be parsed programmatically.",
        `Expected JSON Structure:\n${jsonConstraint}`
    ].join("\n");
}

export class LLMService {
    static getApiKey() {
        return game.settings.get("turn-of-the-century", OPENAI_API_KEY_SETTING);
    }

    static getModel() {
        return OPENAI_DEFAULT_MODEL;
    }

    static getPromptPath(elementType = "campaign") {
        return GENERATION_PROMPT_PATHS[elementType] ?? GENERATION_PROMPT_PATHS.campaign;
    }

    static async getPrepPrompt(elementType = "campaign") {
        const promptPath = this.getPromptPath(elementType);
        return this.getPromptText(promptPath, DEFAULT_SYSTEM_PROMPT);
    }

    static async getPromptText(promptPath, fallback = "") {
        try {
            const response = await fetch(`systems/turn-of-the-century/${promptPath}`);
            if (response.ok) {
                const text = await response.text();
                if (text.trim()) return text;
            }
        } catch (error) {
            console.error(`Failed to fetch generation prompt at ${promptPath}`, error);
        }

        return fallback;
    }

    static async getSystemPrompt(elementType = "campaign", options = {}) {
        const generalPrompt = await this.getPromptText(GENERAL_GENERATION_PROMPT_PATH, "");
        const prepPrompt = await this.getPromptText(this.getPromptPath(elementType), "");
        const contentSkillPrompt = getRelevantContentSkillPrompts(elementType).join("\n\n");
        const generationContextPrompt = buildGenerationContextPrompt(options.generationContext ?? {});

        return [
            DEFAULT_SYSTEM_PROMPT,
            generalPrompt,
            prepPrompt,
            contentSkillPrompt,
            generationContextPrompt,
            getGenerationJsonConstraint(elementType)
        ].filter((section) => String(section ?? "").trim()).join("\n\n");
    }

    static async buildComposedGenerationPrompt(userPrompt, options = {}) {
        const { elementType = "campaign", generationContext = {} } = options;
        const generalPrompt = await this.getPromptText(GENERAL_GENERATION_PROMPT_PATH, "");
        const prepPrompt = await this.getPromptText(this.getPromptPath(elementType), "");
        const contentSkillPrompt = getRelevantContentSkillPrompts(elementType).join("\n\n");
        const generationContextPrompt = buildGenerationContextPrompt(generationContext);
        const gmPrompt = String(userPrompt ?? "").trim();

        return [
            generalPrompt,
            prepPrompt,
            contentSkillPrompt,
            generationContextPrompt,
            getGenerationJsonConstraint(elementType),
            gmPrompt ? ["## GM Request", gmPrompt].join("\n") : ""
        ].filter((section) => String(section ?? "").trim()).join("\n\n");
    }

    static async generate(userPrompt, options = {}) {
        const { elementType = "campaign", useSystemPrompt = true, generationContext = {} } = options;
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error("No OpenAI API Key found. Please configure it in the Turn of the Century system settings.");
        }

        const requestBody = {
            model: this.getModel(),
            input: useSystemPrompt
                ? await this.buildComposedGenerationPrompt(userPrompt, { elementType, generationContext })
                : userPrompt,
            text: {
                format: { type: "json_object" }
            }
        };

        if (useSystemPrompt) {
            requestBody.instructions = DEFAULT_SYSTEM_PROMPT;
        }

        const response = await fetch(`${OPENAI_API_BASE_URL}/responses`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`OpenAI API Error: ${response.status} - ${errorData?.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const text = extractOpenAIResponseText(data);

        if (!text) {
            throw new Error("No text content returned from OpenAI.");
        }

        const cleanedText = text.replace(/^```(json)?\n?/, "").replace(/\n?```$/, "").trim();

        try {
            return JSON.parse(cleanedText);
        } catch (e) {
            console.error("Failed to parse LLM response as JSON", cleanedText);
            throw new Error("The LLM did not return a valid JSON format.");
        }
    }

    static async generateActorTokenImage(prompt) {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error("No OpenAI API Key found. Please configure it in the Turn of the Century system settings.");
        }

        const response = await fetch(`${OPENAI_API_BASE_URL}/images/generations`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: OPENAI_IMAGE_MODEL,
                prompt,
                n: 1,
                size: "1024x1024",
                quality: "auto"
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`OpenAI API Error: ${response.status} - ${errorData?.error?.message ?? response.statusText}`);
        }

        const data = await response.json();
        const b64 = String(data.data?.[0]?.b64_json ?? "");
        if (!b64) throw new Error("No image data returned from OpenAI.");
        return b64;
    }
}
