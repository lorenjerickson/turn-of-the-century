import { WorkspaceFeature } from "../workspace-feature.mjs";
import { MarketController, normalizeMarketPanelState } from "./market-controller.mjs";

const DEFAULT_ITEM_ICON = "icons/svg/item-bag.svg";

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export class MarketFeature extends WorkspaceFeature {
    constructor({
        layoutEngine,
        panelRegistry,
        stateStore = null,
        compendiumCacheController = null,
        render = () => {},
        announce = async () => {}
    } = {}) {
        super();
        this.layoutEngine = layoutEngine;
        this.panelRegistry = panelRegistry;
        this.stateStore = stateStore;
        this.compendiumCacheController = compendiumCacheController;
        this.renderCallback = render;
        this.announceCallback = announce;

        this.marketController = new MarketController({
            getScene: () => canvas?.scene ?? globalThis.game.scenes?.viewed ?? null,
            getActors: () => globalThis.game.actors?.contents ?? [],
            getControlledTokens: () => canvas?.tokens?.controlled ?? [],
            getUser: () => globalThis.game.user,
            getSystemId: () => globalThis.game.system?.id ?? "turn-of-the-century",
            getPanelState: () => this.#getMarketPanelState(),
            setPanelStatePatch: (patch) => this.#setMarketPanelStatePatch(patch),
            getCompendiumItems: () => this.compendiumCacheController?.getItems() ?? Promise.resolve([]),
            getSeedsApi: () => globalThis.game.turnOfTheCentury?.seeds,
            fromUuid: (uuid) => globalThis.fromUuid(uuid),
            foundryRef: () => globalThis.foundry,
            uiRef: () => globalThis.ui,
            render: () => this.renderCallback({ force: false }),
            announce: (message) => this.announceCallback(message),
            random: () => Math.random(),
            logger: console
        });
    }

    async prepareContext(context) {
        const scene = canvas?.scene ?? globalThis.game.scenes?.viewed ?? null;
        const controlledTokens = canvas?.tokens?.controlled ?? [];
        const panelState = this.#getMarketPanelState();
        const compendiumItems = await (this.compendiumCacheController?.getItems() ?? Promise.resolve([]));
        
        context.marketPanel = await this.marketController.buildPanelModel({
            scene,
            controlledTokens,
            panelState,
            compendiumItems
        });
    }

    render(panel, context) {
        if (panel?.id === "market") {
            return this.#renderMarketPanel(context.marketPanel ?? {});
        }
        return undefined;
    }

    bind(rootElement) {
        this.marketController.wireHandlers(rootElement);
    }

    async generateOfferBoard() {
        await this.marketController.generateOfferBoard();
    }

    dispose() {
        // no-op
    }

    #getMarketPanelState() {
        return this.stateStore?.getUserScopedState?.("marketPanelState", normalizeMarketPanelState)
            ?? normalizeMarketPanelState();
    }

    async #setMarketPanelStatePatch(patch = {}) {
        return await this.stateStore?.setUserScopedStatePatch?.("marketPanelState", patch, normalizeMarketPanelState);
    }

    #renderMarketPanel(marketPanel = {}) {
        const actorOptionsMarkup = (marketPanel.actors ?? []).map((actor) => `
            <option value="${escapeHTML(actor.id)}" ${actor.selected ? "selected" : ""}>${escapeHTML(actor.name)}</option>`).join("");

        if (!marketPanel.hasMarket) {
            return `
            <section class="totc-v2-market-panel">
                <article class="totc-v2-market-panel__state">
                    <h3>Market</h3>
                    <p>No generated market is active for this scene.</p>
                    ${marketPanel.canGenerate ? `
                    <button type="button" data-action="gm-execute-action" data-gm-action-id="gm-generate-market">Generate Market</button>` : ""}
                </article>
            </section>`;
        }

        const offersMarkup = (marketPanel.offers ?? []).map((offer) => `
            <article class="totc-v2-market-panel__entry">
                <div class="totc-v2-market-panel__entry-main">
                    <img class="totc-v2-market-panel__entry-img" src="${escapeHTML(offer.img || DEFAULT_ITEM_ICON)}" alt="">
                    <div class="totc-v2-market-panel__entry-copy">
                        <div class="totc-v2-market-panel__entry-name">${escapeHTML(offer.name)}</div>
                        <div class="totc-v2-market-panel__entry-meta">${escapeHTML(offer.type)} · ${escapeHTML(offer.stockLabel)} · ${escapeHTML(offer.packLabel)}</div>
                        ${offer.description ? `<div class="totc-v2-market-panel__entry-description">${escapeHTML(offer.description)}</div>` : ""}
                    </div>
                </div>
                <div class="totc-v2-market-panel__entry-actions">
                    <span class="totc-v2-market-panel__price">${escapeHTML(offer.priceLabel)}</span>
                    <div class="totc-v2-market-panel__trade-controls">
                        <input
                            type="number"
                            class="totc-v2-market-panel__quantity-input"
                            data-action="market-buy-quantity"
                            min="1"
                            max="${Math.max(1, Number(offer.maxBuyQty ?? 1))}"
                            value="1"
                            step="1"
                            ${offer.canBuy ? "" : "disabled"}
                            aria-label="Buy quantity for ${escapeHTML(offer.name)}">
                        <button
                            type="button"
                            data-action="market-buy-item"
                            data-offer-id="${escapeHTML(offer.id)}"
                            data-max-quantity="${Math.max(1, Number(offer.maxBuyQty ?? 1))}"
                            ${offer.canBuy ? "" : "disabled"}
                            title="${escapeHTML(offer.buyHint)}">Buy</button>
                    </div>
                </div>
            </article>`).join("");

        const sellMarkup = (marketPanel.sellableItems ?? []).map((entry) => `
            <article class="totc-v2-market-panel__entry">
                <div class="totc-v2-market-panel__entry-main">
                    <img class="totc-v2-market-panel__entry-img" src="${escapeHTML(entry.img || DEFAULT_ITEM_ICON)}" alt="">
                    <div class="totc-v2-market-panel__entry-copy">
                        <div class="totc-v2-market-panel__entry-name">${escapeHTML(entry.name)}</div>
                        <div class="totc-v2-market-panel__entry-meta">${escapeHTML(entry.type)} · Qty ${entry.quantity} · Base ${escapeHTML(entry.basePriceLabel)}</div>
                        ${entry.description ? `<div class="totc-v2-market-panel__entry-description">${escapeHTML(entry.description)}</div>` : ""}
                    </div>
                </div>
                <div class="totc-v2-market-panel__entry-actions">
                    <span class="totc-v2-market-panel__price">${escapeHTML(entry.sellPriceLabel)}</span>
                    <div class="totc-v2-market-panel__trade-controls">
                        <input
                            type="number"
                            class="totc-v2-market-panel__quantity-input"
                            data-action="market-sell-quantity"
                            min="1"
                            max="${Math.max(1, Number(entry.maxSellQty ?? 1))}"
                            value="1"
                            step="1"
                            ${entry.canSell ? "" : "disabled"}
                            aria-label="Sell quantity for ${escapeHTML(entry.name)}">
                        <button
                            type="button"
                            data-action="market-sell-item"
                            data-item-id="${escapeHTML(entry.id)}"
                            data-max-quantity="${Math.max(1, Number(entry.maxSellQty ?? 1))}"
                            ${entry.canSell ? "" : "disabled"}
                            title="${escapeHTML(entry.sellHint)}">Sell</button>
                    </div>
                </div>
            </article>`).join("");

        return `
        <section class="totc-v2-market-panel">
            <article class="totc-v2-market-panel__state">
                <h3>${escapeHTML(marketPanel.title ?? "Market")}</h3>
                <p>${escapeHTML(marketPanel.summary ?? "")}</p>
                <p><strong>Updated:</strong> ${escapeHTML(marketPanel.updatedLabel ?? "")}</p>
            </article>
            <section class="totc-v2-market-panel__controls">
                <label class="totc-v2-market-panel__buyer-select">
                    <span>Buyer/Seller</span>
                    <select data-action="market-select-buyer" ${marketPanel.actors?.length ? "" : "disabled"}>
                        ${actorOptionsMarkup || `<option value="">No eligible actor</option>`}
                    </select>
                </label>
                <div class="totc-v2-market-panel__wallet">Wallet: ${escapeHTML(marketPanel.walletLabel ?? "-")}</div>
            </section>
            <section class="totc-v2-market-panel__columns">
                <article class="totc-v2-market-panel__column">
                    <h3>Buy</h3>
                    <div class="totc-v2-market-panel__list">
                        ${offersMarkup || `<div class="totc-v2-market-panel__empty">No market offers available.</div>`}
                    </div>
                </article>
                <article class="totc-v2-market-panel__column">
                    <h3>Sell</h3>
                    <div class="totc-v2-market-panel__list">
                        ${sellMarkup || `<div class="totc-v2-market-panel__empty">No sellable inventory on selected actor.</div>`}
                    </div>
                </article>
            </section>
        </section>`;
    }
}
