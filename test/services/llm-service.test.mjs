import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
    GENERATION_PROMPT_PATHS,
    LLMService,
    OPENAI_API_KEY_SETTING,
    buildGenerationContextPrompt,
    extractOpenAIResponseText
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
        assert.equal(GENERATION_PROMPT_PATHS.campaign, "prompts/campaign.md");
        assert.equal(GENERATION_PROMPT_PATHS.scenario, "prompts/scenario.md");
        assert.equal(GENERATION_PROMPT_PATHS["encounter-design"], "prompts/encounter-design.md");
        assert.equal(GENERATION_PROMPT_PATHS.actor, "prompts/actor.md");
        assert.equal(GENERATION_PROMPT_PATHS.pawn, "prompts/actor.md");
        assert.equal(GENERATION_PROMPT_PATHS.location, "prompts/location.md");
    });

    it("keeps prep prompts explicit about JSON output", () => {
        for (const promptPath of new Set(Object.values(GENERATION_PROMPT_PATHS))) {
            const promptText = readFileSync(new URL(`../../${promptPath}`, import.meta.url), "utf8");

            assert.match(promptText, /single valid JSON object only/i, promptPath);
            assert.match(promptText, /schema constraints supplied by the generation service/i, promptPath);
        }
    });

    it("loads generation prep prompts from the prompts folder", async () => {
        let promptUrl = "";
        globalThis.fetch = async (url) => {
            promptUrl = url;
            return { ok: true, text: async () => "Campaign Prompt From File" };
        };

        const systemPrompt = await LLMService.getSystemPrompt("campaign");

        assert.equal(promptUrl, "systems/turn-of-the-century/prompts/campaign.md");
        assert.ok(systemPrompt.includes("Campaign Prompt From File"));
        assert.ok(systemPrompt.includes("Expected JSON Structure:"));
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

    it("calls OpenAI Responses with the prompt, system context, and JSON output format", async () => {
        globalThis.game = {
            settings: {
                get: () => "test-key"
            }
        };

        let fetchCall = null;
        globalThis.fetch = async (url, options) => {
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
        assert.equal(body.model, "gpt-5.5-thinking");
        assert.equal(body.input, "Hello LLM");
        assert.deepEqual(body.text.format, { type: "json_object" });
        assert.ok(body.instructions.includes("System Instruction"));
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
