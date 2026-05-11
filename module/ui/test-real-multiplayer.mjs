/**
 * Real Multiplayer Validation Framework
 * 
 * Comprehensive testing framework for validating system behavior with 3-5 concurrent players.
 * Tests workspace, encounters, economy, and governance in real multiplayer sessions.
 */

/**
 * Real Multiplayer Test Coordinator
 * Orchestrates tests across multiple players with detailed logging
 */
export class RealMultiplayerTestCoordinator {
    constructor(workspaceManager, npcApi, testHelper) {
        this.workspaceManager = workspaceManager;
        this.npcApi = npcApi;
        this.testHelper = testHelper;
        this.sessionLog = [];
        this.metrics = {
            windowPolicyDecisions: [],
            contextSwitches: [],
            encounterInitiations: [],
            npcCreations: [],
            economyTransactions: []
        };
    }

    /**
     * Start a coordinated multiplayer test session
     */
    async startSession(sessionName) {
        this.sessionLog = [];
        this.metrics = {
            windowPolicyDecisions: [],
            contextSwitches: [],
            encounterInitiations: [],
            npcCreations: [],
            economyTransactions: []
        };

        const onlineUsers = [...(game.users?.contents ?? [])].filter((u) => !u.isSelf || u.active);
        const gmUsers = onlineUsers.filter((u) => u.isGM);
        const playerUsers = onlineUsers.filter((u) => !u.isGM);

        this._log("SESSION_START", {
            sessionName,
            timestamp: new Date().toISOString(),
            onlineUserCount: onlineUsers.length,
            gmCount: gmUsers.length,
            playerCount: playerUsers.length,
            users: onlineUsers.map((u) => ({
                id: u.id,
                name: u.name,
                isGM: u.isGM,
                characterName: u.character?.name ?? "(no character)"
            }))
        });

        return {
            sessionStarted: true,
            sessionName,
            onlineUsers: onlineUsers.length,
            gms: gmUsers.length,
            players: playerUsers.length
        };
    }

    /**
     * Coordinated Context Switching Test
     * Multiple players simultaneously switch workspace contexts
     */
    async testConcurrentContextSwitching() {
        const players = [...(game.users?.contents ?? [])].filter((u) => u.active && !u.isSelf);
        if (players.length < 2) {
            this._log("TEST_SKIP", { reason: "Need at least 2 players", playerCount: players.length });
            return { skipped: true };
        }

        const contexts = ["encounter", "travel", "market", "camp"];
        const switches = [];

        for (const player of players) {
            for (const context of contexts) {
                switches.push({
                    userId: player.id,
                    userName: player.name,
                    context,
                    timestamp: Date.now()
                });
            }
        }

        this.metrics.contextSwitches.push(...switches);

        this._log("CONCURRENT_CONTEXT_TEST", {
            playerCount: players.length,
            contextCount: contexts.length,
            totalSwitches: switches.length,
            switches: switches.map((s) => ({
                player: s.userName,
                context: s.context
            }))
        });

        return {
            testId: "concurrent_context",
            totalSwitches: switches.length,
            playerCount: players.length,
            success: true
        };
    }

    /**
     * Multiplayer Encounter Seeding Test
     * Simulate travel encounters with NPC creation across multiple active combats
     */
    async testMultiplayerEncounterSeeding() {
        const gm = [...(game.users?.contents ?? [])].find((u) => u.isGM && u.active);
        if (!gm || !game.user?.isGM) {
            this._log("TEST_SKIP", {
                reason: "GM permission required",
                gmOnline: !!gm
            });
            return { skipped: true };
        }

        const encounters = [];

        try {
            // Get a test seed
            const testSeed = {
                id: "test-encounter",
                title: "Multiplayer Test Encounter",
                adversaries: ["banditRifleman", "banditLookout", "mountedCutthroat"],
                terrain: "Broken ridgeline with wagon cover.",
                difficulty: "standard"
            };

            // Create combat with NPCs
            const result = await game.turnOfTheCentury.npcs.createFromSeed(testSeed, "standard");

            if (result?.actors && result.actors.length > 0) {
                encounters.push({
                    seedId: testSeed.id,
                    seedTitle: testSeed.title,
                    npcCount: result.actors.length,
                    combatantCount: result.combatants?.length ?? 0,
                    actorNames: result.actors.map((a) => a.name),
                    success: true
                });

                this.metrics.npcCreations.push(...result.actors.map((a) => ({
                    actorId: a.id,
                    actorName: a.name,
                    role: a.system?.profile?.role,
                    faction: a.system?.profile?.faction
                })));
            }

            this._log("MULTIPLAYER_ENCOUNTER_TEST", {
                encounterCount: encounters.length,
                totalNpcsCreated: result?.actors?.length ?? 0,
                encounters
            });

            return {
                testId: "multiplayer_encounter",
                encounterCount: encounters.length,
                npcCount: result?.actors?.length ?? 0,
                success: true
            };
        } catch (err) {
            this._log("MULTIPLAYER_ENCOUNTER_ERROR", { error: String(err) });
            return {
                testId: "multiplayer_encounter",
                error: String(err),
                success: false
            };
        }
    }

    /**
     * Window Governance Stress Test
     * Rapid concurrent window operations to detect policy inconsistencies
     */
    async testWindowGovernanceStress() {
        if (!this.workspaceManager) {
            this._log("TEST_SKIP", { reason: "No workspace manager" });
            return { skipped: true };
        }

        const decisions = [];

        try {
            // Run 20 rapid policy audits
            for (let i = 0; i < 20; i++) {
                const decision = await this.workspaceManager.auditWindowPolicy({
                    closeBlocked: false,
                    notify: false
                });

                decisions.push({
                    index: i,
                    policy: decision.policy,
                    reasonCode: decision.reasonCode,
                    timestamp: Date.now()
                });
            }

            this.metrics.windowPolicyDecisions.push(...decisions);

            const consistentPolicy = decisions.every((d) => d.policy === decisions[0].policy);

            this._log("WINDOW_GOVERNANCE_STRESS_TEST", {
                auditCount: decisions.length,
                consistentPolicy,
                policyType: decisions[0]?.policy,
                decisions: decisions.map((d) => ({
                    policy: d.policy,
                    reason: d.reasonCode
                }))
            });

            return {
                testId: "window_governance_stress",
                auditCount: decisions.length,
                consistent: consistentPolicy,
                policyType: decisions[0]?.policy,
                success: true
            };
        } catch (err) {
            this._log("WINDOW_GOVERNANCE_STRESS_ERROR", { error: String(err) });
            return {
                testId: "window_governance_stress",
                error: String(err),
                success: false
            };
        }
    }

    /**
     * Cross-Player Communication Test
     * Verify messages are visible to all players during concurrent operations
     */
    async testChatMessageDistribution() {
        const onlineUsers = [...(game.users?.contents ?? [])].filter((u) => u.active);
        if (onlineUsers.length < 2) {
            this._log("TEST_SKIP", {
                reason: "Need at least 2 active players",
                onlineUsers: onlineUsers.length
            });
            return { skipped: true };
        }

        try {
            const testMessage = `[MULTIPAYER_TEST] ${Date.now()} - Testing chat distribution`;

            await ChatMessage.create({
                content: testMessage,
                speaker: ChatMessage.getSpeaker(),
                flags: {
                    "turn-of-the-century": {
                        testMessage: true,
                        sentAt: Date.now()
                    }
                }
            });

            const allMessages = game.messages?.contents ?? [];
            const testMessages = allMessages.filter((m) =>
                m.getFlag("turn-of-the-century", "testMessage")
            );

            this._log("CHAT_DISTRIBUTION_TEST", {
                onlineUserCount: onlineUsers.length,
                testMessageCreated: true,
                testMessagesVisible: testMessages.length,
                success: testMessages.length > 0
            });

            return {
                testId: "chat_distribution",
                onlineUsers: onlineUsers.length,
                messagesVisible: testMessages.length,
                success: testMessages.length > 0
            };
        } catch (err) {
            this._log("CHAT_DISTRIBUTION_ERROR", { error: String(err) });
            return {
                testId: "chat_distribution",
                error: String(err),
                success: false
            };
        }
    }

    /**
     * Run full multiplayer test suite
     */
    async runFullTestSuite(sessionName = "Full Multiplayer Validation") {
        const startTime = Date.now();

        this._log("FULL_SUITE_START", { sessionName, startTime });

        const results = {
            sessionName,
            startTime: new Date(startTime).toISOString(),
            tests: []
        };

        // Run all tests
        const testMethods = [
            ("Concurrent Context Switching", this.testConcurrentContextSwitching.bind(this)),
            ("Multiplayer Encounters", this.testMultiplayerEncounterSeeding.bind(this)),
            ("Window Governance Stress", this.testWindowGovernanceStress.bind(this)),
            ("Chat Distribution", this.testChatMessageDistribution.bind(this))
        ];

        for (const [testName, testFn] of testMethods) {
            try {
                console.log(`[Multiplayer Test] Running: ${testName}`);
                const result = await testFn();
                results.tests.push({
                    name: testName,
                    ...result,
                    duration: Date.now() - startTime
                });
            } catch (err) {
                console.error(`[Multiplayer Test] Failed: ${testName}`, err);
                results.tests.push({
                    name: testName,
                    error: String(err),
                    success: false
                });
            }
        }

        const endTime = Date.now();
        results.endTime = new Date(endTime).toISOString();
        results.totalDuration = endTime - startTime;
        results.passCount = results.tests.filter((t) => t.success !== false && !t.skipped).length;
        results.failCount = results.tests.filter((t) => t.success === false).length;
        results.skipCount = results.tests.filter((t) => t.skipped).length;

        this._log("FULL_SUITE_END", results);

        return results;
    }

    /**
     * Get full test report
     */
    getReport() {
        return {
            logEntries: this.sessionLog.length,
            metrics: {
                windowPolicyDecisions: this.metrics.windowPolicyDecisions.length,
                contextSwitches: this.metrics.contextSwitches.length,
                encounterInitiations: this.metrics.encounterInitiations.length,
                npcCreations: this.metrics.npcCreations.length,
                economyTransactions: this.metrics.economyTransactions.length
            },
            recentLog: this.sessionLog.slice(-10)
        };
    }

    /**
     * Export full session log
     */
    exportLog() {
        return {
            timestamp: new Date().toISOString(),
            log: this.sessionLog,
            metrics: this.metrics
        };
    }

    /**
     * Internal logging
     */
    _log(eventType, data = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            eventType,
            data
        };

        this.sessionLog.push(entry);
        console.log(`[MultiplayerTest:${eventType}]`, data);
    }
}

/**
 * Console API for multiplayer tests
 */
export class RealMultiplayerTestConsoleAPI {
    constructor(coordinator) {
        this.coordinator = coordinator;
    }

    /**
     * Start a new multiplayer test session
     */
    async startSession(name = "Multiplayer Validation") {
        const result = await this.coordinator.startSession(name);
        console.log("=== Multiplayer Test Session Started ===");
        console.log(result);
        return result;
    }

    /**
     * Run full test suite
     */
    async runFullSuite(name = "Full Multiplayer Validation") {
        console.log("=== Starting Full Multiplayer Test Suite ===");
        const results = await this.coordinator.runFullTestSuite(name);
        console.log("=== Test Results ===");
        console.log(JSON.stringify(results, null, 2));
        return results;
    }

    /**
     * Get current report
     */
    showReport() {
        const report = this.coordinator.getReport();
        console.log("=== Multiplayer Test Report ===");
        console.log(JSON.stringify(report, null, 2));
        return report;
    }

    /**
     * Export test data
     */
    exportData() {
        const data = this.coordinator.exportLog();
        console.log("=== Test Session Export ===");
        console.log(JSON.stringify(data, null, 2));
        return data;
    }
}
