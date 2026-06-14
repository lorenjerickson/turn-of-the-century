export const MARKET_TRADABLE_ITEM_TYPES = Object.freeze(new Set([
    "armor",
    "weapon",
    "equipment",
    "consumable",
    "item"
]));
const DEFAULT_ITEM_ICON = "icons/svg/item-bag.svg";

function stripHtml(value) {
    return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function briefDescription(value, maxLength = 96) {
    const description = stripHtml(value);
    if (description.length <= maxLength) return description;
    return `${description.slice(0, maxLength - 1).trim()}...`;
}

function itemImage(item) {
    const system = item?.system?.toObject?.() ?? item?.system ?? {};
    return String(item?.img ?? system.artwork?.image ?? "").trim() || DEFAULT_ITEM_ICON;
}

export function normalizeMarketPanelState(value = {}) {
    return {
        selectedBuyerActorId: String(value?.selectedBuyerActorId ?? "")
    };
}

export class MarketController {
    constructor({
        getScene = () => null,
        getActors = () => [],
        getControlledTokens = () => [],
        getUser = () => null,
        getSystemId = () => "turn-of-the-century",
        getPanelState = () => normalizeMarketPanelState(),
        setPanelStatePatch = async () => {},
        getCompendiumItems = async () => [],
        getSeedsApi = () => null,
        fromUuid = globalThis.fromUuid,
        foundryRef = () => globalThis.foundry,
        uiRef = () => globalThis.ui,
        render = () => {},
        announce = async () => {},
        random = () => Math.random(),
        logger = console
    } = {}) {
        this.getScene = getScene;
        this.getActors = getActors;
        this.getControlledTokens = getControlledTokens;
        this.getUser = getUser;
        this.getSystemId = getSystemId;
        this.getPanelState = getPanelState;
        this.setPanelStatePatch = setPanelStatePatch;
        this.getCompendiumItems = getCompendiumItems;
        this.getSeedsApi = getSeedsApi;
        this.fromUuid = fromUuid;
        this.foundryRef = foundryRef;
        this.uiRef = uiRef;
        this.render = render;
        this.announce = announce;
        this.random = random;
        this.logger = logger;
    }

    async buildPanelModel({ scene = this.getScene(), controlledTokens = this.getControlledTokens(), panelState = this.getPanelState(), compendiumItems = [] } = {}) {
        const actors = this.getEligibleActors(controlledTokens);
        const requestedActorId = String(panelState?.selectedBuyerActorId ?? "");
        const selectedActor = actors.find((actor) => actor.id === requestedActorId)
            ?? actors[0]
            ?? null;
        if (selectedActor?.id && selectedActor.id !== requestedActorId) {
            await this.setPanelStatePatch({ selectedBuyerActorId: selectedActor.id });
        }

        const marketState = this.normalizeSceneMarketState(scene?.getFlag?.(this.getSystemId(), "workspaceV2Market") ?? null);
        const walletValue = Number(selectedActor?.system?.economy?.wallet?.gbp ?? 0);
        const wallet = Number.isFinite(walletValue) ? walletValue : 0;

        const offers = (marketState?.offers ?? []).map((offer) => {
            const price = Number(offer.price ?? 0);
            const stock = Math.max(0, Number(offer.stock ?? 0));
            const hasActor = Boolean(selectedActor);
            const maxAffordableQty = price > 0 ? Math.max(0, Math.floor(wallet / price)) : stock;
            const maxBuyQty = hasActor ? Math.max(0, Math.min(stock, maxAffordableQty || (price <= 0 ? stock : 0))) : 0;
            const canBuy = hasActor && maxBuyQty > 0;
            return {
                id: String(offer.id),
                name: String(offer.name ?? "Unnamed Item"),
                type: String(offer.type ?? "item"),
                img: String(offer.img ?? "").trim() || DEFAULT_ITEM_ICON,
                description: briefDescription(offer.description),
                packLabel: String(offer.packLabel ?? "Market Stock"),
                stockLabel: `Stock ${stock}`,
                priceLabel: this.formatCurrency(price, offer.currency),
                maxBuyQty,
                canBuy,
                buyHint: !hasActor
                    ? "Select an eligible actor first."
                    : (stock <= 0 ? "Out of stock." : (maxBuyQty <= 0 ? "Not enough funds." : `Purchase up to ${maxBuyQty} unit${maxBuyQty === 1 ? "" : "s"}.`))
            };
        });

        const sellableItems = this.getSellableItems(selectedActor, marketState);
        const fallbackSummary = compendiumItems.length
            ? `${compendiumItems.length} compendium items are available for market generation.`
            : "Generate a market from the GM panel to begin trading.";

        return {
            hasMarket: Boolean(marketState),
            canGenerate: Boolean(this.getUser()?.isGM),
            title: marketState?.title ?? "Market",
            summary: marketState?.summary ?? fallbackSummary,
            updatedLabel: marketState?.generatedAt ? new Date(marketState.generatedAt).toLocaleString() : "Not generated",
            walletLabel: this.formatCurrency(wallet, "pounds"),
            actors: actors.map((actor) => ({
                id: actor.id,
                name: actor.name ?? "Unnamed Actor",
                selected: actor.id === selectedActor?.id
            })),
            offers,
            sellableItems
        };
    }

    getEligibleActors(controlledTokens = this.getControlledTokens()) {
        const controlledActorIds = new Set((controlledTokens ?? []).map((token) => token?.actor?.id).filter(Boolean));
        const user = this.getUser();
        const visibleActors = (this.getActors() ?? []).filter((actor) => {
            if (!actor) return false;
            if (user?.isGM) return true;
            return actor.isOwner;
        });

        const sorted = [...visibleActors].sort((left, right) => String(left?.name ?? "").localeCompare(String(right?.name ?? ""), undefined, { sensitivity: "base" }));
        sorted.sort((left, right) => {
            const leftControlled = controlledActorIds.has(left.id) ? 0 : 1;
            const rightControlled = controlledActorIds.has(right.id) ? 0 : 1;
            return leftControlled - rightControlled;
        });

        return sorted;
    }

    normalizeSceneMarketState(value) {
        if (!value || typeof value !== "object") return null;
        const offers = Array.isArray(value.offers)
            ? value.offers
                .map((offer) => ({
                    id: String(offer?.id ?? ""),
                    uuid: String(offer?.uuid ?? ""),
                    name: String(offer?.name ?? "Unnamed Item"),
                    type: String(offer?.type ?? "item"),
                    img: String(offer?.img ?? "").trim() || DEFAULT_ITEM_ICON,
                    description: briefDescription(offer?.description),
                    packLabel: String(offer?.packLabel ?? "Market Stock"),
                    price: Math.max(0, Number(offer?.price ?? 0)),
                    basePrice: Math.max(0, Number(offer?.basePrice ?? offer?.price ?? 0)),
                    currency: String(offer?.currency ?? "pounds"),
                    stock: Math.max(0, Math.floor(Number(offer?.stock ?? 0)))
                }))
                .filter((offer) => offer.id && offer.stock > 0 && this.isTradableItemType(offer.type))
            : [];
        if (!offers.length) return null;

        return {
            id: String(value.id ?? this.foundryRef()?.utils?.randomID?.() ?? "market"),
            title: String(value.title ?? "Market"),
            summary: String(value.summary ?? ""),
            generatedAt: Number(value.generatedAt ?? Date.now()),
            generatedBy: value.generatedBy ?? null,
            buyMarkup: Math.max(1, Number(value.buyMarkup ?? 1.2)),
            sellRate: Math.max(0, Number(value.sellRate ?? 0.55)),
            offers
        };
    }

    formatCurrency(value, currency = "pounds") {
        const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
        const rounded = Math.round(amount * 100) / 100;
        return `${rounded.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${String(currency ?? "pounds")}`;
    }

    getSellableItems(actor, marketState) {
        if (!actor) return [];
        const sellRate = Math.max(0, Number(marketState?.sellRate ?? 0.55));
        const items = (actor.items?.contents ?? []).filter((item) => this.isTradableItemType(item?.type));

        return items
            .map((item) => {
                const basePrice = Math.max(0, Number(item?.system?.value?.price ?? 0));
                const currency = String(item?.system?.value?.currency ?? "pounds");
                const quantity = Math.max(0, Math.floor(Number(item?.system?.physical?.quantity ?? 1)));
                const sellPrice = Math.max(0, Math.round(basePrice * sellRate * 100) / 100);
                return {
                    id: String(item?.id ?? ""),
                    name: String(item?.name ?? "Unnamed Item"),
                    type: String(item?.type ?? "item"),
                    img: itemImage(item),
                    description: briefDescription(item?.system?.description),
                    quantity,
                    basePrice,
                    currency,
                    basePriceLabel: this.formatCurrency(basePrice, currency),
                    sellPrice,
                    sellPriceLabel: this.formatCurrency(sellPrice, currency),
                    maxSellQty: quantity,
                    canSell: quantity > 0 && sellPrice > 0,
                    sellHint: quantity <= 0 ? "No quantity available." : (sellPrice > 0 ? `Sell up to ${quantity} unit${quantity === 1 ? "" : "s"} to the market.` : "Item has no sell value.")
                };
            })
            .filter((entry) => entry.id)
            .sort((left, right) => String(left.name).localeCompare(String(right.name), undefined, { sensitivity: "base" }));
    }

    parseQuantityInput(input, { fallback = 1, max = 1 } = {}) {
        const parsed = Math.floor(Number(input?.value ?? fallback));
        const minValue = 1;
        const maxValue = Math.max(minValue, Math.floor(Number(max) || minValue));
        const clamped = Math.min(maxValue, Math.max(minValue, Number.isFinite(parsed) ? parsed : fallback));
        if (input) input.value = String(clamped);
        return clamped;
    }

    async buildGeneratedOffers() {
        const pool = (await this.getCompendiumItems()).filter((entry) => this.isTradableItemType(entry?.type));
        for (let i = pool.length - 1; i > 0; i -= 1) {
            const j = Math.floor(this.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        const offers = [];
        for (const entry of pool.slice(0, Math.min(10, pool.length))) {
            let basePrice = 1;
            let currency = "pounds";
            let type = String(entry?.type ?? "item");
            try {
                const document = await this.fromUuid?.(entry.uuid);
                basePrice = Math.max(0, Number(document?.system?.value?.price ?? basePrice));
                currency = String(document?.system?.value?.currency ?? currency);
                type = String(document?.type ?? type);
                entry.img = itemImage(document ?? entry);
                entry.description = briefDescription(document?.system?.description ?? entry?.description);
            } catch (error) {
                this.logger?.warn?.("[turn-of-the-century] Failed to resolve market item uuid", entry?.uuid, error);
            }

            if (!this.isTradableItemType(type)) continue;
            offers.push({
                id: this.foundryRef()?.utils?.randomID?.() ?? this.random().toString(36).slice(2, 10),
                uuid: String(entry?.uuid ?? ""),
                name: String(entry?.name ?? "Unnamed Item"),
                type,
                img: String(entry?.img ?? "").trim() || DEFAULT_ITEM_ICON,
                description: briefDescription(entry?.description),
                packLabel: String(entry?.packLabel ?? "Market Stock"),
                basePrice,
                price: Math.max(1, Math.round(basePrice * (1.1 + this.random() * 0.45) * 100) / 100),
                currency,
                stock: 1 + Math.floor(this.random() * 4)
            });
        }
        return offers;
    }

    async generateOfferBoard() {
        const user = this.getUser();
        const ui = this.uiRef();
        if (!user?.isGM) {
            ui?.notifications?.warn("Only the GM can generate market boards.");
            return;
        }

        const scene = this.getScene();
        if (!scene) {
            ui?.notifications?.warn("No active scene is available for market generation.");
            return;
        }

        const offers = await this.buildGeneratedOffers();
        if (!offers.length) {
            ui?.notifications?.warn("Unable to generate market offers from compendium items.");
            return;
        }

        const seedsApi = this.getSeedsApi();
        const factionMap = seedsApi?.factionMetadata ?? {};
        const factionKeys = Object.keys(factionMap);
        const factionKey = this.#randomFrom(factionKeys) ?? "frontier-raiders";
        const narrative = seedsApi?.getNarrative?.(factionKey) ?? {};
        const marketState = {
            id: this.foundryRef()?.utils?.randomID?.() ?? this.random().toString(36).slice(2, 10),
            title: `${scene.name ?? "Current Scene"} Market`,
            summary: narrative.victory ?? "A broker offers scarce goods at a risky premium.",
            generatedAt: Date.now(),
            generatedBy: user?.id ?? null,
            buyMarkup: 1.2,
            sellRate: 0.55,
            offers
        };

        await scene.setFlag?.(this.getSystemId(), "workspaceV2Market", marketState);
        await this.announce({
            title: "Market Generated",
            lines: [
                `Scene: ${scene.name ?? "Unknown scene"}`,
                `${offers.length} offers are now available in the Market panel.`
            ]
        });
    }

    resolveSelectedActor() {
        const actorId = String(this.getPanelState()?.selectedBuyerActorId ?? "");
        if (!actorId) return null;
        return (this.getActors() ?? []).find((actor) => String(actor?.id ?? actor?._id ?? "") === actorId) ?? null;
    }

    canManageActor(actor) {
        if (!actor) return false;
        if (this.getUser()?.isGM) return true;
        return Boolean(actor.isOwner);
    }

    async handleBuy(offerId, requestedQuantity = 1) {
        const scene = this.getScene();
        const ui = this.uiRef();
        if (!scene) return;
        const marketState = this.normalizeSceneMarketState(scene.getFlag?.(this.getSystemId(), "workspaceV2Market") ?? null);
        if (!marketState) return ui?.notifications?.warn("No generated market is active in this scene.");
        const buyer = this.resolveSelectedActor();
        if (!this.canManageActor(buyer)) return ui?.notifications?.warn("Select an actor you can manage before buying.");
        const offer = marketState.offers.find((entry) => entry.id === offerId);
        if (!offer) return ui?.notifications?.warn("This market offer is no longer available.");
        if (!this.isTradableItemType(offer.type)) return ui?.notifications?.warn("This market offer is not a tradable item type.");

        const wallet = Math.max(0, Number(buyer.system?.economy?.wallet?.gbp ?? 0));
        const unitPrice = Math.max(0, Number(offer.price ?? 0));
        const stock = Math.max(0, Math.floor(Number(offer.stock ?? 0)));
        const maxAffordableQty = unitPrice > 0 ? Math.max(0, Math.floor(wallet / unitPrice)) : stock;
        const maxBuyQty = Math.max(0, Math.min(stock, maxAffordableQty || (unitPrice <= 0 ? stock : 0)));
        if (maxBuyQty <= 0) return ui?.notifications?.warn(`${buyer.name} does not have enough funds.`);
        const quantityToBuy = Math.max(1, Math.min(Math.floor(Number(requestedQuantity) || 1), maxBuyQty));
        const totalPrice = unitPrice * quantityToBuy;

        let itemData = null;
        if (offer.uuid) {
            try {
                const document = await this.fromUuid?.(offer.uuid);
                if (document?.toObject) itemData = document.toObject();
            } catch (error) {
                this.logger?.warn?.("[turn-of-the-century] Failed to import market item", offer.uuid, error);
            }
        }
        itemData ??= {
            name: offer.name,
            type: offer.type || "item",
            system: { physical: { quantity: 1 }, value: { price: offer.basePrice, currency: offer.currency } }
        };
        delete itemData._id;
        itemData.system ??= {};
        itemData.system.physical ??= {};
        itemData.system.value ??= {};
        itemData.system.physical.quantity = quantityToBuy;
        itemData.system.value.price = Math.max(0, Number(itemData.system.value.price ?? offer.basePrice ?? unitPrice));
        itemData.system.value.currency = String(itemData.system.value.currency ?? offer.currency ?? "pounds");

        const existing = buyer.items?.find?.((item) => item.name === itemData.name && item.type === itemData.type);
        if (existing) {
            const quantity = Math.max(0, Math.floor(Number(existing.system?.physical?.quantity ?? 1)));
            await existing.update({ "system.physical.quantity": quantity + quantityToBuy });
        } else {
            await buyer.createEmbeddedDocuments("Item", [itemData]);
        }
        await buyer.update({ "system.economy.wallet.gbp": Math.max(0, wallet - totalPrice) });
        offer.stock = Math.max(0, offer.stock - quantityToBuy);
        marketState.offers = marketState.offers.filter((entry) => entry.stock > 0);
        await scene.setFlag?.(this.getSystemId(), "workspaceV2Market", marketState.offers.length ? marketState : null);
        ui?.notifications?.info(`${buyer.name} purchased ${quantityToBuy} ${offer.name} for ${this.formatCurrency(totalPrice, offer.currency)}.`);
        this.render();
    }

    async handleSell(itemId, requestedQuantity = 1) {
        const scene = this.getScene();
        const ui = this.uiRef();
        if (!scene) return;
        const marketState = this.normalizeSceneMarketState(scene.getFlag?.(this.getSystemId(), "workspaceV2Market") ?? null);
        if (!marketState) return ui?.notifications?.warn("No generated market is active in this scene.");
        const actor = this.resolveSelectedActor();
        if (!this.canManageActor(actor)) return ui?.notifications?.warn("Select an actor you can manage before selling.");
        const item = actor.items?.get?.(itemId) ?? null;
        if (!item) return ui?.notifications?.warn("This item is no longer available on the selected actor.");
        if (!this.isTradableItemType(item.type)) return ui?.notifications?.warn("Only physical goods can be sold at the market.");

        const quantity = Math.max(0, Math.floor(Number(item.system?.physical?.quantity ?? 1)));
        const basePrice = Math.max(0, Number(item.system?.value?.price ?? 0));
        const currency = String(item.system?.value?.currency ?? "pounds");
        const unitSellPrice = Math.max(0, Math.round(basePrice * Math.max(0, Number(marketState.sellRate ?? 0.55)) * 100) / 100);
        if (quantity <= 0 || unitSellPrice <= 0) return ui?.notifications?.warn("This item cannot be sold.");
        const quantityToSell = Math.max(1, Math.min(Math.floor(Number(requestedQuantity) || 1), quantity));
        const totalSellPrice = Math.round(unitSellPrice * quantityToSell * 100) / 100;

        if (quantity <= quantityToSell) await item.delete();
        else await item.update({ "system.physical.quantity": quantity - quantityToSell });
        const wallet = Math.max(0, Number(actor.system?.economy?.wallet?.gbp ?? 0));
        await actor.update({ "system.economy.wallet.gbp": wallet + totalSellPrice });
        const existingOffer = marketState.offers.find((offer) => offer.name === item.name && offer.type === item.type && offer.currency === currency && Math.abs(Number(offer.basePrice ?? 0) - basePrice) < 0.001);
        if (existingOffer) {
            existingOffer.stock = Math.max(0, Number(existingOffer.stock ?? 0) + quantityToSell);
        } else {
            marketState.offers.push({
                id: this.foundryRef()?.utils?.randomID?.() ?? this.random().toString(36).slice(2, 10),
                uuid: "",
                name: String(item.name ?? "Sold Item"),
                type: String(item.type ?? "item"),
                img: itemImage(item),
                description: briefDescription(item?.system?.description),
                packLabel: "Party Stock",
                price: Math.max(1, Math.round(basePrice * Math.max(1, Number(marketState.buyMarkup ?? 1.2)) * 100) / 100),
                basePrice,
                currency,
                stock: quantityToSell
            });
        }
        await scene.setFlag?.(this.getSystemId(), "workspaceV2Market", marketState);
        ui?.notifications?.info(`${actor.name} sold ${quantityToSell} ${item.name} for ${this.formatCurrency(totalSellPrice, currency)}.`);
        this.render();
    }

    wireHandlers(root) {
        root?.querySelectorAll("[data-action='market-select-buyer']")?.forEach((input) => {
            input.addEventListener("change", async () => {
                await this.setPanelStatePatch({ selectedBuyerActorId: String(input.value ?? "") });
                this.render();
            });
        });
        root?.querySelectorAll("[data-action='market-buy-item']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const offerId = String(button.dataset.offerId ?? "").trim();
                if (!offerId) return;
                const quantityInput = button.closest(".totc-v2-market-panel__entry-actions")?.querySelector("[data-action='market-buy-quantity']");
                await this.handleBuy(offerId, this.parseQuantityInput(quantityInput, { fallback: 1, max: Number(button.dataset.maxQuantity ?? 1) }));
            });
        });
        root?.querySelectorAll("[data-action='market-sell-item']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const itemId = String(button.dataset.itemId ?? "").trim();
                if (!itemId) return;
                const quantityInput = button.closest(".totc-v2-market-panel__entry-actions")?.querySelector("[data-action='market-sell-quantity']");
                await this.handleSell(itemId, this.parseQuantityInput(quantityInput, { fallback: 1, max: Number(button.dataset.maxQuantity ?? 1) }));
            });
        });
    }

    isTradableItemType(itemType) {
        return MARKET_TRADABLE_ITEM_TYPES.has(String(itemType ?? "").trim().toLowerCase());
    }

    #randomFrom(items = []) {
        if (!Array.isArray(items) || !items.length) return null;
        return items[Math.floor(this.random() * items.length)];
    }
}
