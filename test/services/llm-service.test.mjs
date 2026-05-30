import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { LLMService } from "../../module/services/llm-service.mjs";

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

    it("throws if no API key is set", async () => {
        globalThis.game = {
            settings: {
                get: () => "" // Empty key
            }
        };

        await assert.rejects(
            LLMService.generate("Test prompt"),
            /No Gemini API Key found/
        );
    });

    it("calls fetch with correct prompt and system context", async () => {
        globalThis.game = {
            settings: {
                get: () => "test-key"
            }
        };

        let fetchCall = null;
        globalThis.fetch = async (url, options) => {
            if (url.includes("PROMPT.md")) {
                return { ok: true, text: async () => "System Instruction" };
            }
            fetchCall = { url, options };
            return {
                ok: true,
                json: async () => ({
                    candidates: [
                        { content: { parts: [{ text: '{"name": "Generated Entity"}' }] } }
                    ]
                })
            };
        };

        const result = await LLMService.generate("Hello LLM", { elementType: "campaign" });

        assert.equal(result.name, "Generated Entity");
        assert.ok(fetchCall, "fetch should have been called");
        assert.ok(fetchCall.url.includes("key=test-key"));
        
        const body = JSON.parse(fetchCall.options.body);
        assert.equal(body.contents[0].parts[0].text, "Hello LLM");
        assert.ok(body.systemInstruction.parts[0].text.includes("System Instruction"));
    });

    it("throws on API error", async () => {
        globalThis.game = {
            settings: {
                get: () => "test-key"
            }
        };

        globalThis.fetch = async (url) => {
            if (url.includes("PROMPT.md")) {
                return { ok: true, text: async () => "Sys" };
            }
            return {
                ok: false,
                status: 400,
                statusText: "Bad Request",
                json: async () => ({ error: { message: "Invalid argument" } })
            };
        };

        await assert.rejects(
            LLMService.generate("Hello"),
            /Gemini API Error: 400 - Invalid argument/
        );
    });
});
