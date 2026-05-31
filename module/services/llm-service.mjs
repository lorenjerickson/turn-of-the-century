const OPENAI_API_BASE_URL = "https://api.openai.com/v1";
const OPENAI_DEFAULT_MODEL = "gpt-5.4-mini";
const DEFAULT_SYSTEM_PROMPT = "You are a master architect for the Turn of the Century Roleplaying Game, responsible for creating engaging, historically grounded campaigns and scenarios.";

export const OPENAI_API_KEY_SETTING = "openaiApiKey";
export const GENERATION_PROMPT_PATHS = Object.freeze({
    campaign: "prompts/campaign.md",
    scenario: "prompts/scenario.md",
    "encounter-design": "prompts/encounter-design.md",
    actor: "prompts/actor.md",
    pawn: "prompts/actor.md",
    location: "prompts/location.md"
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
        try {
            const response = await fetch(`systems/turn-of-the-century/${promptPath}`);
            if (response.ok) {
                const text = await response.text();
                if (text.trim()) return text;
            }
        } catch (error) {
            console.error(`Failed to fetch generation prompt at ${promptPath}`, error);
        }

        return DEFAULT_SYSTEM_PROMPT;
    }

    static async getSystemPrompt(elementType = "campaign", options = {}) {
        const basePrompt = await this.getPrepPrompt(elementType);
        const generationContextPrompt = buildGenerationContextPrompt(options.generationContext ?? {});

        // Add structural constraints for JSON generation based on element type.
        const schemas = {
            campaign: `{"name": "Campaign Title", "system": {"profile": {"summary": "Brief summary", "environment": "HTML", "culture": "HTML", "socialClimate": "HTML", "antagonist": {"name": "", "concept": "", "motivations": "HTML"}}}}`,
            scenario: `{"name": "Scenario Title", "system": {"profile": {"summary": "Brief summary", "description": "HTML", "historicalNotes": "HTML", "resolutionCriteria": "HTML"}}}`,
            "encounter-design": `{"name": "Encounter Title", "system": {"profile": {"summary": "Brief summary", "description": "HTML", "hazards": "HTML", "npcs": []}}}`,
            actor: `{"name": "Actor Name", "system": {"profile": {"role": "Role", "faction": "Faction", "summary": "Brief summary", "tags": []}, "biography": "HTML", "notes": "HTML", "classification": {"category": "npc", "species": "Human", "profession": "Profession"}, "progression": {"level": 1, "challenge": ""}, "abilities": {"str": {"value": 10}, "dex": {"value": 10}, "con": {"value": 10}, "int": {"value": 10}, "wis": {"value": 10}, "cha": {"value": 10}, "san": {"value": 10}}, "inventory": {"pack": {"itemIds": []}, "combat": {"readyWeaponIds": []}}, "traits": {"languages": []}}}`,
            pawn: `{"name": "NPC Name", "system": {"profile": {"summary": "Brief summary", "role": "Role", "faction": "Faction"}, "biography": "HTML", "notes": "HTML", "pawn": {"role": "Role", "threat": 1, "disposition": "neutral"}}}`,
            location: `{"name": "Location Name", "system": {"locationType": "village/market/city/district/etc", "profile": {"summary": "Brief summary", "description": "HTML", "notes": "HTML"}, "features": [{"name": "Feature Name", "description": "Brief desc"}]}}`
        };

        const jsonConstraint = schemas[elementType] || schemas.campaign;

        return `${basePrompt}${generationContextPrompt ? `\n\n${generationContextPrompt}` : ""}\n\nIMPORTANT: You must reply ONLY with valid JSON that matches the following structure. Do not include markdown formatting or backticks around the JSON. Your response will be parsed programmatically.\n\nExpected JSON Structure:\n${jsonConstraint}`;
    }

    static async generate(userPrompt, options = {}) {
        const { elementType = "campaign", useSystemPrompt = true, generationContext = {} } = options;
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error("No OpenAI API Key found. Please configure it in the Turn of the Century system settings.");
        }

        const requestBody = {
            model: this.getModel(),
            input: userPrompt,
            text: {
                format: { type: "json_object" }
            }
        };

        if (useSystemPrompt) {
            requestBody.instructions = await this.getSystemPrompt(elementType, { generationContext });
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
}
