import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
    GENERATION_PROMPT_PATHS,
    GENERAL_GENERATION_PROMPT_PATH,
    LLMService,
    OPENAI_API_KEY_SETTING,
    buildActorTokenImagePrompt,
    buildGenerationContextPrompt,
    extractOpenAIResponseText,
    getGenerationJsonConstraint,
    getRelevantContentSkillPrompts
} from "../../module/services/llm-service.mjs";

describe("LLMService", () => {
    let originalGame;
    let originalFetch;

    beforeEach(() => {
        originalGame = globalThis.game;
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.game = originalGame;
        globalThis.fetch = originalFetch;
    });

    it("reads the OpenAI API key from system settings", () => {
        let requestedSetting = "";
        globalThis.game = {
            settings: {
                get: (_systemId, setting) => {
                    requestedSetting = setting;
                    return "openai-key";
                }
            }
        };

        assert.equal(LLMService.getApiKey(), "openai-key");
        assert.equal(requestedSetting, OPENAI_API_KEY_SETTING);
    });

    it("extracts text from Responses API convenience and output payloads", () => {
        assert.equal(extractOpenAIResponseText({ output_text: '{"name":"A"}' }), '{"name":"A"}');
        assert.equal(extractOpenAIResponseText({
            output: [
                {
                    content: [
                        { type: "output_text", text: '{"name":"B"}' }
                    ]
                }
            ]
        }), '{"name":"B"}');
    });

    it("maps supported generation types to prompt files", () => {
        assert.equal(GENERAL_GENERATION_PROMPT_PATH, "prompts/general.md");
        assert.equal(GENERATION_PROMPT_PATHS.campaign, "prompts/campaign.md");
        assert.equal(GENERATION_PROMPT_PATHS.scenario, "prompts/scenario.md");
        assert.equal(GENERATION_PROMPT_PATHS["encounter-design"], "prompts/encounter-design.md");
        assert.equal(GENERATION_PROMPT_PATHS.actor, "prompts/actor.md");
        assert.equal(GENERATION_PROMPT_PATHS.pawn, "prompts/actor.md");
        assert.equal(GENERATION_PROMPT_PATHS.location, "prompts/location.md");
    });

    it("keeps prep prompts explicit about JSON output", () => {
        for (const promptPath of new Set([GENERAL_GENERATION_PROMPT_PATH, ...Object.values(GENERATION_PROMPT_PATHS)])) {
            const promptText = readFileSync(new URL(`../../${promptPath}`, import.meta.url), "utf8");

            assert.match(promptText, /single valid JSON object only/i, promptPath);
            assert.match(promptText, /schema constraints supplied by the generation service|specialized prompt and schema constraint/i, promptPath);
        }
    });

    it("loads the general prompt before the generation-specific prep prompt", async () => {
        const promptUrls = [];
        globalThis.fetch = async (url) => {
            promptUrls.push(url);
            if (url.endsWith(GENERAL_GENERATION_PROMPT_PATH)) {
                return { ok: true, text: async () => "General Prompt From File" };
            }
            return { ok: true, text: async () => "Campaign Prompt From File" };
        };

        const systemPrompt = await LLMService.getSystemPrompt("campaign");

        assert.deepEqual(promptUrls, [
            "systems/turn-of-the-century/prompts/general.md",
            "systems/turn-of-the-century/prompts/campaign.md"
        ]);
        assert.ok(systemPrompt.includes("General Prompt From File"));
        assert.ok(systemPrompt.includes("Campaign Prompt From File"));
        assert.ok(systemPrompt.includes("Expected JSON Structure:"));
        assert.ok(
            systemPrompt.indexOf("master architect for the Turn of the Century Roleplaying Game")
                < systemPrompt.indexOf("General Prompt From File")
        );
        assert.ok(systemPrompt.indexOf("General Prompt From File") < systemPrompt.indexOf("Campaign Prompt From File"));
    });

    it("loads scenario prep prompts from the prompts folder", async () => {
        let promptUrl = "";
        globalThis.fetch = async (url) => {
            promptUrl = url;
            return { ok: true, text: async () => "Scenario Prompt From File" };
        };

        const systemPrompt = await LLMService.getSystemPrompt("scenario");

        assert.equal(promptUrl, "systems/turn-of-the-century/prompts/scenario.md");
        assert.ok(systemPrompt.includes("Scenario Prompt From File"));
        assert.ok(systemPrompt.includes("Scenario Title"));
    });

    it("loads encounter prep prompts from the prompts folder", async () => {
        let promptUrl = "";
        globalThis.fetch = async (url) => {
            promptUrl = url;
            return { ok: true, text: async () => "Encounter Prompt From File" };
        };

        const systemPrompt = await LLMService.getSystemPrompt("encounter-design");

        assert.equal(promptUrl, "systems/turn-of-the-century/prompts/encounter-design.md");
        assert.ok(systemPrompt.includes("Encounter Prompt From File"));
        assert.ok(systemPrompt.includes("Encounter Title"));
    });

    it("loads location prep prompts from the prompts folder", async () => {
        let promptUrl = "";
        globalThis.fetch = async (url) => {
            promptUrl = url;
            return { ok: true, text: async () => "Location Prompt From File" };
        };

        const systemPrompt = await LLMService.getSystemPrompt("location");

        assert.equal(promptUrl, "systems/turn-of-the-century/prompts/location.md");
        assert.ok(systemPrompt.includes("Location Prompt From File"));
        assert.ok(systemPrompt.includes("Location Name"));
    });

    it("loads actor prep prompts from the prompts folder", async () => {
        let promptUrl = "";
        globalThis.fetch = async (url) => {
            promptUrl = url;
            return { ok: true, text: async () => "Actor Prompt From File" };
        };

        const systemPrompt = await LLMService.getSystemPrompt("actor", {
            generationContext: { actorType: "villain" }
        });

        assert.equal(promptUrl, "systems/turn-of-the-century/prompts/actor.md");
        assert.ok(systemPrompt.includes("Actor Prompt From File"));
        assert.ok(systemPrompt.includes("Actor Name"));
        assert.ok(systemPrompt.includes('The GM selected "villain" as the actor type'));
    });

    it("selects content-oriented skill guidance relevant to the generation type", () => {
        const actorSkills = getRelevantContentSkillPrompts("actor").join("\n\n");
        assert.match(actorSkills, /Content Skill: Language Style/);
        assert.match(actorSkills, /Content Skill: Science, Not Magic/);
        assert.match(actorSkills, /Content Skill: Genetic Manipulation/);
        assert.match(actorSkills, /Content Skill: Art Style/);
        assert.doesNotMatch(actorSkills, /Content Skill: Asset Generation/);

        const weaponSkills = getRelevantContentSkillPrompts("weapon").join("\n\n");
        assert.match(weaponSkills, /Content Skill: Asset Generation/);
        assert.match(weaponSkills, /Content Skill: Art Style/);
        assert.doesNotMatch(weaponSkills, /Content Skill: Genetic Manipulation/);
    });

    it("appends relevant content skill guidance after the specialized prompt", async () => {
        globalThis.fetch = async (url) => {
            if (url.endsWith(GENERAL_GENERATION_PROMPT_PATH)) {
                return { ok: true, text: async () => "General Prompt From File" };
            }
            return { ok: true, text: async () => "Actor Prompt From File" };
        };

        const systemPrompt = await LLMService.getSystemPrompt("actor");

        assert.ok(systemPrompt.indexOf("General Prompt From File") < systemPrompt.indexOf("Actor Prompt From File"));
        assert.ok(systemPrompt.indexOf("Actor Prompt From File") < systemPrompt.indexOf("Content Skill: Language Style"));
        assert.ok(systemPrompt.indexOf("Content Skill: Genetic Manipulation") < systemPrompt.indexOf("Expected JSON Structure:"));
    });

    it("adds selected parent location context to location system prompts", async () => {
        globalThis.fetch = async () => ({ ok: true, text: async () => "Location Prompt From File" });

        const systemPrompt = await LLMService.getSystemPrompt("location", {
            generationContext: {
                parentLocation: {
                    id: "loc-athens",
                    name: "Athens",
                    locationType: "city",
                    description: "<p>A city of marble glare and uneasy scholarship.</p>",
                    notes: "<p>Several societies keep rooms near the university.</p>"
                }
            }
        });

        assert.ok(systemPrompt.includes('The GM selected "Athens" as the parent location'));
        assert.ok(systemPrompt.includes("Parent location id: loc-athens"));
        assert.ok(systemPrompt.includes("Set system.parentLocationId to the parent location id"));
    });

    it("builds no generation context prompt without a selected parent location", () => {
        assert.equal(buildGenerationContextPrompt({}), "");
    });

    it("builds a single generation prompt from general, specialized, context, schema, and GM request", async () => {
        globalThis.fetch = async (url) => {
            if (url.endsWith(GENERAL_GENERATION_PROMPT_PATH)) {
                return { ok: true, text: async () => "General JSON Requirement" };
            }
            return { ok: true, text: async () => "Scenario Specific Prompt" };
        };

        const prompt = await LLMService.buildComposedGenerationPrompt("Make it about a fogbound hospital.", {
            elementType: "scenario",
            generationContext: {
                parentLocation: {
                    id: "loc-whitechapel",
                    name: "Whitechapel",
                    locationType: "district"
                }
            }
        });

        assert.ok(prompt.includes("General JSON Requirement"));
        assert.ok(prompt.includes("Scenario Specific Prompt"));
        assert.ok(prompt.includes("Content Skill: Language Style"));
        assert.ok(prompt.includes('The GM selected "Whitechapel" as the parent location'));
        assert.ok(prompt.includes("Expected JSON Structure:"));
        assert.ok(prompt.includes("Scenario Title"));
        assert.ok(prompt.includes("## GM Request\nMake it about a fogbound hospital."));
        assert.ok(prompt.indexOf("General JSON Requirement") < prompt.indexOf("Scenario Specific Prompt"));
        assert.ok(prompt.indexOf("Scenario Specific Prompt") < prompt.indexOf("Expected JSON Structure:"));
        assert.ok(prompt.indexOf("Expected JSON Structure:") < prompt.indexOf("## GM Request"));
    });

    it("keeps JSON constraints explicit for every composed prompt", () => {
        const constraint = getGenerationJsonConstraint("actor");

        assert.match(constraint, /valid JSON/i);
        assert.match(constraint, /Expected JSON Structure:/);
        assert.match(constraint, /Actor Name/);
    });

    it("builds actor token prompts with a circular frame and transparent exterior", () => {
        const prompt = buildActorTokenImagePrompt({
            name: "Ada Kingsley",
            system: {
                biography: "<p>A noted investigator with a brass-handled revolver.</p>",
                classification: {
                    category: "npc",
                    species: "Human",
                    profession: "Investigator",
                    origin: "London"
                }
            }
        });

        assert.match(prompt, /Transparent background outside the token frame/i);
        assert.match(prompt, /no checkerboard pattern/i);
        assert.match(prompt, /circular brass or iron token frame/i);
        assert.doesNotMatch(prompt, /no border/i);
    });

    it("falls back when a generation prep prompt file is unavailable", async () => {
        globalThis.fetch = async () => ({ ok: false, text: async () => "" });

        const systemPrompt = await LLMService.getSystemPrompt("unknown-type");

        assert.ok(systemPrompt.includes("master architect for the Turn of the Century Roleplaying Game"));
        assert.ok(systemPrompt.includes("Campaign Title"));
    });

    it("throws if no API key is set", async () => {
        globalThis.game = {
            settings: {
                get: () => ""
            }
        };

        await assert.rejects(
            LLMService.generate("Test prompt"),
            /No OpenAI API Key found/
        );
    });

    it("requests generated actor token images without unsupported transparent background parameters", async () => {
        globalThis.game = {
            settings: {
                get: () => "test-key"
            }
        };

        let fetchCall = null;
        globalThis.fetch = async (url, options) => {
            fetchCall = { url, options };
            return {
                ok: true,
                json: async () => ({ data: [{ b64_json: "image-data" }] })
            };
        };

        const result = await LLMService.generateActorTokenImage("Token prompt");

        assert.equal(result, "image-data");
        assert.ok(fetchCall, "fetch should have been called");
        assert.equal(fetchCall.url, "https://api.openai.com/v1/images/generations");
        assert.equal(fetchCall.options.headers.Authorization, "Bearer test-key");

        const body = JSON.parse(fetchCall.options.body);
        assert.equal(body.prompt, "Token prompt");
        assert.equal(body.size, "1024x1024");
        assert.equal(body.quality, "auto");
        assert.equal(Object.hasOwn(body, "background"), false);
    });

    it("calls OpenAI Responses with the composed prompt and JSON output format", async () => {
        globalThis.game = {
            settings: {
                get: () => "test-key"
            }
        };

        let fetchCall = null;
        globalThis.fetch = async (url, options) => {
            if (url.includes("prompts/general.md")) {
                return { ok: true, text: async () => "General Instruction" };
            }
            if (url.includes("prompts/campaign.md")) {
                return { ok: true, text: async () => "System Instruction" };
            }
            fetchCall = { url, options };
            return {
                ok: true,
                json: async () => ({
                    output_text: '{"name": "Generated Entity"}'
                })
            };
        };

        const result = await LLMService.generate("Hello LLM", { elementType: "campaign" });

        assert.equal(result.name, "Generated Entity");
        assert.ok(fetchCall, "fetch should have been called");
        assert.equal(fetchCall.url, "https://api.openai.com/v1/responses");
        assert.equal(fetchCall.options.headers.Authorization, "Bearer test-key");

        const body = JSON.parse(fetchCall.options.body);
        assert.equal(body.model, "gpt-5.5");
        assert.ok(body.input.includes("General Instruction"));
        assert.ok(body.input.includes("System Instruction"));
        assert.ok(body.input.includes("Expected JSON Structure:"));
        assert.ok(body.input.includes("## GM Request\nHello LLM"));
        assert.deepEqual(body.text.format, { type: "json_object" });
        assert.equal(body.instructions, "You are a master architect for the Turn of the Century Roleplaying Game, responsible for creating engaging, historically grounded campaigns and scenarios.");
    });

    it("throws on OpenAI API error", async () => {
        globalThis.game = {
            settings: {
                get: () => "test-key"
            }
        };

        globalThis.fetch = async (url) => {
            if (url.includes("prompts/campaign.md")) {
                return { ok: true, text: async () => "Sys" };
            }
            return {
                ok: false,
                status: 400,
                statusText: "Bad Request",
                json: async () => ({ error: { message: "Invalid request" } })
            };
        };

        await assert.rejects(
            LLMService.generate("Hello"),
            /OpenAI API Error: 400 - Invalid request/
        );
    });
});
