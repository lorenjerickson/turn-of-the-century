export class LLMService {
    static getApiKey() {
        return game.settings.get("turn-of-the-century", "geminiApiKey");
    }

    static async getSystemPrompt(elementType = "campaign") {
        let basePrompt = "You are a master architect for the Turn of the Century Roleplaying Game, responsible for creating engaging, historically grounded campaigns and scenarios.";
        try {
            const response = await fetch("systems/turn-of-the-century/.agents/prompts/campaign-and-scenario/PROMPT.md");
            if (response.ok) {
                basePrompt = await response.text();
            }
        } catch (error) {
            console.error("Failed to fetch campaign-and-scenario prompt", error);
        }

        // Add structural constraints for JSON generation based on element type
        const schemas = {
            campaign: `{"name": "Campaign Title", "system": {"profile": {"summary": "Brief summary", "environment": "HTML", "culture": "HTML", "socialClimate": "HTML", "antagonist": {"name": "", "concept": "", "motivations": "HTML"}}}}`,
            scenario: `{"name": "Scenario Title", "system": {"profile": {"summary": "Brief summary", "description": "HTML", "historicalNotes": "HTML", "resolutionCriteria": "HTML"}}}`,
            "encounter-design": `{"name": "Encounter Title", "system": {"profile": {"summary": "Brief summary", "description": "HTML", "hazards": "HTML", "npcs": []}}}`,
            pawn: `{"name": "NPC Name", "system": {"profile": {"summary": "Brief summary", "biography": "HTML", "notes": "HTML"}}}`,
            location: `{"name": "Location Name", "system": {"locationType": "village/market/city/district/etc", "profile": {"summary": "Brief summary", "description": "HTML", "notes": "HTML"}, "features": [{"name": "Feature Name", "description": "Brief desc"}]}}`
        };

        const jsonConstraint = schemas[elementType] || schemas.campaign;

        return `${basePrompt}\n\nIMPORTANT: You must reply ONLY with valid JSON that matches the following structure. Do not include markdown formatting or backticks around the JSON. Your response will be parsed programmatically.\n\nExpected JSON Structure:\n${jsonConstraint}`;
    }

    static async generate(userPrompt, options = {}) {
        const { elementType = "campaign", useSystemPrompt = true } = options;
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error("No Gemini API Key found. Please configure it in the Turn of the Century system settings.");
        }

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        let systemInstruction;
        if (useSystemPrompt) {
            systemInstruction = {
                role: "system",
                parts: [{ text: await this.getSystemPrompt(elementType) }]
            };
        }

        const requestBody = {
            contents: [
                {
                    role: "user",
                    parts: [{ text: userPrompt }]
                }
            ]
        };

        if (systemInstruction) {
            requestBody.systemInstruction = systemInstruction;
        }

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Gemini API Error: ${response.status} - ${errorData?.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) {
            throw new Error("No text content returned from Gemini.");
        }

        // Strip markdown backticks if the model ignores the prompt and wraps the JSON
        const cleanedText = text.replace(/^```(json)?\n?/, "").replace(/\n?```$/, "").trim();

        try {
            return JSON.parse(cleanedText);
        } catch (e) {
            console.error("Failed to parse LLM response as JSON", cleanedText);
            throw new Error("The LLM did not return a valid JSON format.");
        }
    }
}
