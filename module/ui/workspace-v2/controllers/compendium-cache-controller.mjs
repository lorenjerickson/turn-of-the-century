export const COMPENDIUM_STARTUP_RETRY_LIMIT = 10;
export const COMPENDIUM_STARTUP_RETRY_BASE_MS = 250;

export class CompendiumCacheController {
    constructor({
        load = async () => ({ entries: [], ready: true }),
        onRetry = () => {},
        retryLimit = COMPENDIUM_STARTUP_RETRY_LIMIT,
        retryBaseMs = COMPENDIUM_STARTUP_RETRY_BASE_MS,
        maxRetryDelayMs = 2000,
        setTimeoutFn = globalThis.setTimeout?.bind(globalThis),
        clearTimeoutFn = globalThis.clearTimeout?.bind(globalThis)
    } = {}) {
        this.load = load;
        this.onRetry = onRetry;
        this.retryLimit = retryLimit;
        this.retryBaseMs = retryBaseMs;
        this.maxRetryDelayMs = maxRetryDelayMs;
        this.setTimeoutFn = setTimeoutFn;
        this.clearTimeoutFn = clearTimeoutFn;
        this.entries = null;
        this.promise = null;
        this.retryCount = 0;
        this.retryTimer = null;
    }

    get loadingFailed() {
        return !this.hasEntries && this.retryCount >= this.retryLimit;
    }

    get hasEntries() {
        return Array.isArray(this.entries) && this.entries.length > 0;
    }

    get loadingFailureMessage() {
        return this.loadingFailed
            ? `No entries found after ${this.retryLimit} load attempts. Check the browser console for [turn-of-the-century] log messages.`
            : null;
    }

    invalidate() {
        this.entries = null;
        this.promise = null;
        this.retryCount = 0;
        this.clearRetry();
    }

    async getItems() {
        if (Array.isArray(this.entries)) return this.entries;
        if (this.promise) return await this.promise;

        this.promise = this.#loadEntries();
        try {
            return await this.promise;
        } finally {
            this.promise = null;
        }
    }

    clearRetry() {
        if (!this.retryTimer) return;
        this.clearTimeoutFn?.(this.retryTimer);
        this.retryTimer = null;
    }

    dispose() {
        this.clearRetry();
        this.promise = null;
    }

    async #loadEntries() {
        const result = await this.load();
        const entries = Array.isArray(result?.entries) ? result.entries : [];
        if (entries.length || result?.ready) {
            this.entries = entries;
            this.retryCount = 0;
            this.clearRetry();
        } else {
            this.#scheduleRetry();
        }
        return entries;
    }

    #scheduleRetry() {
        if (this.retryTimer || this.retryCount >= this.retryLimit || typeof this.setTimeoutFn !== "function") return;

        const retryNumber = this.retryCount + 1;
        const delay = Math.min(this.retryBaseMs * retryNumber, this.maxRetryDelayMs);
        this.retryCount = retryNumber;
        this.retryTimer = this.setTimeoutFn(() => {
            this.retryTimer = null;
            this.promise = null;
            this.onRetry?.();
        }, delay);
    }
}
