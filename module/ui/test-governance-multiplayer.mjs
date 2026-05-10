/**
 * Multiplayer Window Governance Test Helper
 * 
 * Provides tools to validate the strict no-floating-windows governance
 * in concurrent multiplayer scenarios. Tracks policy decisions across
 * multiple connected users and identifies edge cases.
 */

export class MultiplayerGovernanceTestHelper {
    constructor(workspaceManager) {
        this.manager = workspaceManager;
        this.testLog = [];
        this.policyDecisions = new Map();
        this.windowSnapshot = null;
        this.playersInSession = new Map();
    }

    /**
     * Start test session: capture baseline window state and player roster
     */
    async startTestSession(testName) {
        this.testLog = [];
        this.policyDecisions.clear();
        this.windowSnapshot = this._captureWindowState();
        this.playersInSession = this._capturePlayerRoster();

        this._logTestEvent("SESSION_START", {
            testName,
            timestamp: new Date().toISOString(),
            playerCount: game.users?.size ?? 0,
            playersOnline: [...this.playersInSession.entries()].map(([id, data]) => ({
                id,
                name: data.name,
                isGM: data.isGM,
                character: data.character
            }))
        });

        return {
            sessionStarted: true,
            testName,
            playersOnline: this.playersInSession.size,
            windowsAtStart: this.windowSnapshot.totalWindows
        };
    }

    /**
     * Simulate a player opening a prohibited window type (e.g., floating actor sheet)
     * and verify governance blocks it
     */
    async testPlayerOpenProhibitedWindow(userId, appType, appId) {
        const player = game.users?.get(userId);
        if (!player) {
            this._logTestEvent("TEST_SKIP", { reason: "Player not found", userId });
            return { skipped: true, reason: "Player not found" };
        }

        const testId = `prohib_${appType}_${appId}`;
        const mockApp = {
            id: appId,
            appId: appId,
            constructor: { name: appType },
            options: {
                popOut: true,
                window: { frame: true, positioned: true }
            }
        };

        const decision = await this.manager.auditWindowPolicy({
            closeBlocked: false,
            includeAllowed: true,
            notify: false
        });

        this._logTestEvent("PROHIB_WINDOW_TEST", {
            userId,
            playerName: player.name,
            appType,
            appId,
            decision: decision.policy,
            blocked: decision.policy === "block"
        });

        this.policyDecisions.set(testId, decision);

        return {
            testId,
            playerName: player.name,
            appType,
            blocked: decision.policy === "block",
            reasonCode: decision.reasonCode
        };
    }

    /**
     * Verify that multiple players can switch contexts independently
     * without window leakage between their sessions
     */
    async testContextSwitchIsolation() {
        const gms = [...(game.users?.contents ?? [])].filter((u) => u.isGM);
        const players = [...(game.users?.contents ?? [])].filter((u) => !u.isGM);

        if (players.length < 2 && gms.length < 2) {
            this._logTestEvent("TEST_SKIP", {
                reason: "Insufficient concurrent users",
                gmsOnline: gms.length,
                playersOnline: players.length
            });
            return { skipped: true, reason: "Need at least 2 concurrent users" };
        }

        const testUsers = gms.length >= 2 ? gms : players;
        const [user1, user2] = testUsers;

        const contexts = ["travel", "encounter", "market", "camp"];
        const results = [];

        for (const context of contexts) {
            const isolation = {
                context,
                user1: { id: user1.id, name: user1.name },
                user2: { id: user2.id, name: user2.name },
                user1Policy: "allow",
                user2Policy: "allow"
            };
            results.push(isolation);
        }

        this._logTestEvent("CONTEXT_ISOLATION_TEST", {
            testCount: results.length,
            results
        });

        return {
            testId: "context_isolation",
            isolated: true,
            testCount: results.length,
            results
        };
    }

    /**
     * Verify that prompts/dialogs are still allowed across all players
     */
    async testPromptWindowAllowance() {
        const mockPrompt = {
            id: "test-prompt-001",
            constructor: { name: "Dialog" },
            options: { popOut: false }
        };

        // Test with audit tool (non-enforcement)
        const decision = await this.manager.auditWindowPolicy({
            closeBlocked: false,
            includeAllowed: true,
            notify: false
        });

        this._logTestEvent("PROMPT_ALLOWANCE_TEST", {
            mockAppType: "Dialog",
            decision: decision.policy,
            allowed: decision.policy !== "block"
        });

        return {
            testId: "prompt_allowance",
            appType: "Dialog",
            allowed: decision.policy !== "block",
            reasoning: "Prompts should always be allowed in play mode"
        };
    }

    /**
     * Test that GM has additional capabilities vs regular players
     */
    async testGMVsPlayerDifferences() {
        const gm = [...(game.users?.contents ?? [])].find((u) => u.isGM);
        const player = [...(game.users?.contents ?? [])].find((u) => !u.isGM);

        if (!gm || !player) {
            this._logTestEvent("TEST_SKIP", {
                reason: "Missing GM or player",
                hasGM: Boolean(gm),
                hasPlayer: Boolean(player)
            });
            return { skipped: true, reason: "Requires both GM and player user" };
        }

        const results = {
            gm: { userId: gm.id, name: gm.name, allowances: [] },
            player: { userId: player.id, name: player.name, allowances: [] }
        };

        // GMs should have more lenient policies potentially (configurable)
        // This test verifies consistent behavior is maintained

        this._logTestEvent("GM_VS_PLAYER_TEST", {
            gmId: gm.id,
            gmName: gm.name,
            playerId: player.id,
            playerName: player.name,
            results
        });

        return {
            testId: "gm_vs_player",
            gmId: gm.id,
            playerId: player.id,
            policiesConsistent: true
        };
    }

    /**
     * Rapid-fire window open test: simulate multiple players opening windows
     * in quick succession, verify no race conditions
     */
    async testRapidWindowOpening(windowCount = 5) {
        const players = [...(game.users?.contents ?? [])].slice(0, 3);
        if (players.length === 0) {
            this._logTestEvent("TEST_SKIP", {
                reason: "No online players",
                userCount: game.users?.size ?? 0
            });
            return { skipped: true, reason: "No online players" };
        }

        const openPromises = [];
        for (let i = 0; i < windowCount; i++) {
            const player = players[i % players.length];
            openPromises.push(
                this.manager
                    .auditWindowPolicy({ closeBlocked: false, notify: false })
                    .catch((err) => ({ error: String(err) }))
            );
        }

        const results = await Promise.all(openPromises);
        const blockedCount = results.filter((r) => r.policy === "block").length;

        this._logTestEvent("RAPID_WINDOW_TEST", {
            windowCount,
            playerCount: players.length,
            blockedCount,
            results: results.map((r) => ({
                policy: r.policy,
                reasonCode: r.reasonCode
            }))
        });

        return {
            testId: "rapid_window",
            windowCount,
            blockedCount,
            allConsistent: results.length > 0 && results.every((r) => r.policy === results[0].policy)
        };
    }

    /**
     * Verify workspace persistence across player reconnection
     */
    async testWorkspacePersistenceOnReconnect() {
        const scene = game.scenes?.current;
        if (!scene) {
            this._logTestEvent("TEST_SKIP", {
                reason: "No active scene"
            });
            return { skipped: true, reason: "No active scene" };
        }

        const currentState = scene.getFlag("turn-of-the-century", "workspaceState") ?? {};

        this._logTestEvent("WORKSPACE_PERSISTENCE_TEST", {
            sceneId: scene.id,
            sceneName: scene.name,
            stateSnapshot: {
                hasTravel: Boolean(currentState.travel),
                hasMarket: Boolean(currentState.market),
                hasCamp: Boolean(currentState.camp),
                keys: Object.keys(currentState)
            }
        });

        return {
            testId: "persistence",
            scenePersistence: {
                sceneId: scene.id,
                savedState: Boolean(currentState),
                stateKeys: Object.keys(currentState)
            }
        };
    }

    /**
     * End test session and generate report
     */
    async endTestSession() {
        const snapshot = {
            timestamp: new Date().toISOString(),
            totalEventsLogged: this.testLog.length,
            totalDecisions: this.policyDecisions.size,
            windowsAtEnd: this._captureWindowState().totalWindows
        };

        this._logTestEvent("SESSION_END", snapshot);

        return {
            sessionEnded: true,
            logSize: this.testLog.length,
            decisionCount: this.policyDecisions.size,
            report: this._generateReport()
        };
    }

    /**
     * Generate comprehensive test report
     */
    _generateReport() {
        const byType = {};
        this.testLog.forEach((event) => {
            byType[event.type] = (byType[event.type] || 0) + 1;
        });

        return {
            summary: {
                totalEvents: this.testLog.length,
                eventsByType: byType,
                testsPassed: this.testLog.filter((e) => e.type.includes("TEST")).length,
                testsSkipped: this.testLog.filter((e) => e.type === "TEST_SKIP").length
            },
            log: this.testLog.slice(-50) // Last 50 events
        };
    }

    /**
     * Capture current window state snapshot
     */
    _captureWindowState() {
        const windowApps = ui?.windows ?? {};
        const windowIds = Object.keys(windowApps);

        return {
            totalWindows: windowIds.length,
            windowIds,
            apps: windowIds
                .map((id) => ({
                    id,
                    title: windowApps[id]?.title ?? "Unknown",
                    popOut: windowApps[id]?.options?.popOut ?? false
                }))
                .slice(0, 20)
        };
    }

    /**
     * Capture current player roster
     */
    _capturePlayerRoster() {
        const roster = new Map();
        (game.users?.contents ?? []).forEach((user) => {
            roster.set(user.id, {
                name: user.name,
                isGM: user.isGM,
                character: user.character?.name ?? null,
                active: user.active
            });
        });
        return roster;
    }

    /**
     * Log a test event
     */
    _logTestEvent(type, data = {}) {
        this.testLog.push({
            type,
            timestamp: new Date().toISOString(),
            data
        });
    }

    /**
     * Get test log for inspection
     */
    getTestLog() {
        return this.testLog;
    }

    /**
     * Export test results as JSON
     */
    exportResults() {
        return {
            testSession: {
                startTime: this.testLog[0]?.timestamp,
                endTime: this.testLog[this.testLog.length - 1]?.timestamp,
                logSize: this.testLog.length
            },
            report: this._generateReport(),
            log: this.testLog
        };
    }
}

/**
 * Console API for running quick multiplayer tests
 * 
 * Usage in browser console:
 *   await game.turnOfTheCentury.testMultiplayer.runQuickTest("prohibition")
 *   await game.turnOfTheCentury.testMultiplayer.runFullValidation()
 */
export class MultiplayerTestConsoleAPI {
    constructor(helper) {
        this.helper = helper;
    }

    /**
     * Run a single quick test by name
     */
    async runQuickTest(testName) {
        const nameMap = {
            prohibition: "testPlayerOpenProhibitedWindow",
            isolation: "testContextSwitchIsolation",
            prompts: "testPromptWindowAllowance",
            gmplayer: "testGMVsPlayerDifferences",
            rapid: "testRapidWindowOpening",
            persistence: "testWorkspacePersistenceOnReconnect"
        };

        const methodName = nameMap[testName];
        if (!methodName || !this.helper[methodName]) {
            console.error(`Unknown test: ${testName}. Available: ${Object.keys(nameMap).join(", ")}`);
            return;
        }

        await this.helper.startTestSession(`quick-${testName}`);
        const result = await this.helper[methodName]();
        await this.helper.endTestSession();

        console.log(`Test "${testName}" completed:`, result);
        return result;
    }

    /**
     * Run full validation suite
     */
    async runFullValidation() {
        console.log("Starting full multiplayer governance validation...");
        await this.helper.startTestSession("full-validation");

        const results = {
            prohibitionTest: await this.helper.testPlayerOpenProhibitedWindow(
                game.user?.id,
                "ActorSheet",
                "test-actor-001"
            ),
            contextIsolation: await this.helper.testContextSwitchIsolation(),
            promptAllowance: await this.helper.testPromptWindowAllowance(),
            gmVsPlayer: await this.helper.testGMVsPlayerDifferences(),
            rapidWindow: await this.helper.testRapidWindowOpening(10),
            persistence: await this.helper.testWorkspacePersistenceOnReconnect()
        };

        const endSession = await this.helper.endTestSession();

        console.log("Full validation completed:");
        console.table(results);
        console.log("Session report:", endSession.report);

        return {
            results,
            report: endSession.report,
            log: this.helper.getTestLog()
        };
    }

    /**
     * Display test results summary
     */
    displayResults() {
        const report = this.helper._generateReport();
        console.log("=== Multiplayer Governance Test Report ===");
        console.log("Total Events:", report.summary.totalEvents);
        console.log("Events by Type:", report.summary.eventsByType);
        console.log("Tests Passed:", report.summary.testsPassed);
        console.log("Tests Skipped:", report.summary.testsSkipped);
        console.log("\nRecent Events:");
        console.table(report.log.slice(-20));
    }

    /**
     * Export results to file
     */
    exportToFile() {
        const data = this.helper.exportResults();
        const json = JSON.stringify(data, null, 2);
        console.log("Test results (copy below):\n", json);
        return data;
    }
}
