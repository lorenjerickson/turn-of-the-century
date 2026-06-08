/**
 * TotC debug logger — a lightweight in-memory log bus.
 *
 * Entries are stored newest-first (unshift). Subscribers are notified
 * asynchronously (setTimeout 0) so logging from within a render cycle
 * never triggers an immediate re-render loop.
 */

const MAX_ENTRIES = 500;

class TotcLogger {
    #entries = [];
    #listeners = new Set();
    #seq = 0;
    #notifyPending = false;

    log(level, message, data = null) {
        const now = new Date();
        const ts = now.toTimeString().slice(0, 8) + "." + String(now.getMilliseconds()).padStart(3, "0");
        const entry = {
            id: ++this.#seq,
            ts,
            level: String(level ?? "info"),
            message: String(message ?? ""),
            data: data !== null && data !== undefined ? data : null
        };

        this.#entries.unshift(entry);
        if (this.#entries.length > MAX_ENTRIES) this.#entries.length = MAX_ENTRIES;

        // Defer notification so render-path callers don't trigger re-render loops.
        if (!this.#notifyPending) {
            this.#notifyPending = true;
            setTimeout(() => {
                this.#notifyPending = false;
                for (const listener of this.#listeners) {
                    try { listener(); } catch { /* ignore listener errors */ }
                }
            }, 0);
        }

        return entry;
    }

    info(message, data) { return this.log("info", message, data); }
    warn(message, data) { return this.log("warn", message, data); }
    error(message, data) { return this.log("error", message, data); }
    debug(message, data) { return this.log("debug", message, data); }

    getEntries() { return [...this.#entries]; }

    clear() {
        this.#entries = [];
        for (const listener of this.#listeners) {
            try { listener(); } catch { /* ignore */ }
        }
    }

    /** Returns an unsubscribe function. */
    subscribe(listener) {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }
}

export const totcLogger = new TotcLogger();
