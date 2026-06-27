import { ABILITY_MINIMUMS_NONE, createArtwork, createUnlockAction, createUseItemAction, html } from "./builders/sample-content-builders.mjs";

export const EQUIPMENT_CONFIGS = [
    {
        name: "Field Investigator Kit",
        img: "icons/tools/scribal/lens-glass-brown.webp",
        system: {
            commonName: "Investigator Kit",
            description: html("Casebook, lens, gloves, and envelopes for deliberate scene work."),
            category: "tool",
            slot: "belt",
            use: { skillCheck: { skill: "investigation", difficulty: 10, purpose: html("Aids structured scene examination.") } },
            effects: [{ label: "Documented Scene", targetType: "skill", target: "investigation", operation: "add", value: 1, formula: "", condition: "kit present", notes: html("Bonus to scene analysis.") }],
            physical: { weight: 3, bulk: 1, quantity: 1, unit: "kit" },
            value: { price: 7, currency: "pounds" },
            properties: { tags: ["investigation", "fieldwork"] }
        }
    },
    {
        name: "Portable Telegraph Tap",
        img: "icons/tools/instruments/keyboard-keys-brown.webp",
        system: {
            commonName: "Telegraph Tap",
            description: html("A foldable tapping set for line diagnostics and coded dispatches."),
            category: "apparatus",
            slot: "belt",
            quality: "fine",
            use: { skillCheck: { skill: "history", difficulty: 12, purpose: html("Decode or send brief line traffic.") } },
            physical: { weight: 2, bulk: 1, quantity: 1, unit: "set" },
            value: { price: 12, currency: "pounds" },
            properties: { tags: ["communication", "telegraph"], restricted: true }
        }
    },
    {
        name: "Locksmith Roll",
        img: "icons/tools/hand/pick-steel-white.webp",
        system: {
            commonName: "Locksmith Tools",
            description: html("Fine picks, torsion bars, and graphite cloth for stubborn wards."),
            category: "tool",
            slot: "belt",
            actions: {
                defaultActionId: "useItem",
                variants: [
                    createUseItemAction(),
                    createUnlockAction("{{Owner.name}} works {{Item.name}} through the lock.")
                ]
            },
            use: { skillCheck: { skill: "sleightOfHand", difficulty: 12, purpose: html("Manipulate locks and catches.") } },
            physical: { weight: 1, bulk: 0, quantity: 1, unit: "roll" },
            value: { price: 5, currency: "pounds" },
            properties: { tags: ["lockpicking"], concealable: true, restricted: true }
        }
    },
    {
        name: "Surveyor's Transit",
        img: "icons/tools/navigation/spyglass-brass.webp",
        system: {
            commonName: "Transit",
            description: html("Tripod optics for line-of-sight measurement and distance estimation."),
            category: "instrument",
            slot: "hands",
            use: { skillCheck: { skill: "nature", difficulty: 11, purpose: html("Chart terrain and establish bearings.") } },
            physical: { weight: 5, bulk: 2, quantity: 1, unit: "instrument" },
            value: { price: 15, currency: "pounds" },
            properties: { tags: ["survey", "optics"], fragile: true }
        }
    },
    {
        name: "Ritual Chalk Cylinder",
        img: "icons/commodities/materials/powder-white.webp",
        system: {
            commonName: "Marking Chalk",
            description: html("Compressed white chalk for notation on stone, iron, and timber."),
            category: "miscellaneous",
            slot: "belt",
            use: { actionCost: 0, requiresHands: true, consumedOnUse: true, skillCheck: { skill: "arcana", difficulty: 10, required: false, purpose: html("Mark warning sigils and directional signs.") } },
            physical: { weight: 0.2, bulk: 0, quantity: 6, unit: "stick" },
            value: { price: 1, currency: "pounds" },
            properties: { tags: ["marking", "ritual"], concealable: true }
        }
    },
    {
        name: "Mortuary Lantern",
        img: "icons/sundries/lights/lantern-bullseye-silver.webp",
        system: {
            commonName: "Lantern",
            description: html("A shuttered lamp with mirrored housing for low-glare examinations."),
            category: "apparatus",
            slot: "hands",
            use: { skillCheck: { skill: "perception", difficulty: 9, required: false, purpose: html("Illuminate close details without flooding a room.") } },
            physical: { weight: 2, bulk: 1, quantity: 1, unit: "lantern" },
            value: { price: 4, currency: "pounds" },
            properties: { tags: ["light", "forensic"], fragile: true }
        }
    },
    {
        name: "Coiled Hemp Rope",
        img: "icons/sundries/survival/rope-coiled-brown.webp",
        system: {
            commonName: "Hemp Rope",
            description: html("A compact thirty-foot coil with brass clips for harnessing and descent."),
            category: "tool",
            slot: "belt",
            use: { skillCheck: { skill: "athletics", difficulty: 10, purpose: html("Secure climbs and controlled descents.") } },
            physical: { weight: 3, bulk: 1, quantity: 1, unit: "coil" },
            value: { price: 2, currency: "pounds" },
            properties: { tags: ["climbing", "utility"] }
        }
    },
    {
        name: "Folding Pry Hook",
        img: "icons/tools/hand/crowbar-steel.webp",
        system: {
            commonName: "Pry Hook",
            description: html("A short folding lever for crates, stuck hatches, and iron hasps."),
            category: "tool",
            slot: "belt",
            actions: {
                defaultActionId: "useItem",
                variants: [
                    createUseItemAction(),
                    createUnlockAction("{{Owner.name}} levers the lock open with {{Item.name}}.")
                ]
            },
            use: { skillCheck: { skill: "athletics", difficulty: 11, purpose: html("Force simple barriers and jammed catches.") } },
            physical: { weight: 1.2, bulk: 0, quantity: 1, unit: "tool" },
            value: { price: 3, currency: "pounds" },
            properties: { tags: ["breach", "utility"], concealable: true }
        }
    },
    {
        name: "Pocket Tool Roll",
        img: "icons/tools/hand/hammer-and-nail.webp",
        system: {
            commonName: "Tool Roll",
            description: html("Needles, wire, and a miniature spanner for field adjustments."),
            category: "tool",
            slot: "belt",
            quality: "fine",
            use: { skillCheck: { skill: "investigation", difficulty: 10, purpose: html("Perform hasty repairs on delicate gear.") } },
            physical: { weight: 0.8, bulk: 0, quantity: 1, unit: "roll" },
            value: { price: 4, currency: "pounds" },
            properties: { tags: ["repair", "utility"], concealable: true }
        }
    },
    {
        name: "Rail Spike Wrench",
        img: "icons/tools/hand/wrench-steel.webp",
        system: {
            commonName: "Spike Wrench",
            category: "tool",
            slot: "belt",
            use: { skillCheck: { skill: "athletics", difficulty: 10, purpose: html("Adjust rail fasteners and braces.") } },
            physical: { weight: 1.4, bulk: 0, quantity: 1, unit: "tool" },
            properties: { tags: ["rail", "maintenance"] }
        }
    },
    {
        name: "Valve Key Set",
        img: "icons/tools/hand/pliers-steel.webp",
        system: {
            commonName: "Valve Keys",
            category: "tool",
            slot: "belt",
            use: { skillCheck: { skill: "investigation", difficulty: 11, purpose: html("Operate and test pressure valves.") } },
            physical: { weight: 0.7, bulk: 0, quantity: 1, unit: "set" },
            properties: { tags: ["pressure", "utility"], concealable: true }
        }
    },
    {
        name: "Pocket Sextant",
        img: "icons/tools/navigation/compass-plain-blue.webp",
        system: {
            commonName: "Sextant",
            category: "instrument",
            slot: "belt",
            use: { skillCheck: { skill: "nature", difficulty: 10, purpose: html("Estimate angle and direction in poor visibility.") } },
            physical: { weight: 0.9, bulk: 0, quantity: 1, unit: "instrument" },
            properties: { tags: ["navigation", "instrument"], fragile: true }
        }
    },
    {
        name: "Signal Mirror",
        img: "icons/tools/navigation/sundial-brass.webp",
        system: {
            commonName: "Mirror",
            category: "instrument",
            slot: "belt",
            use: { skillCheck: { skill: "performance", difficulty: 9, purpose: html("Send line-of-sight flashes and warnings.") } },
            physical: { weight: 0.2, bulk: 0, quantity: 1, unit: "mirror" },
            properties: { tags: ["signal", "optical"], concealable: true }
        }
    },
    {
        name: "Boiler Gauge Clamp",
        img: "icons/tools/hand/clamp-steel.webp",
        system: {
            commonName: "Gauge Clamp",
            category: "tool",
            slot: "hands",
            use: { skillCheck: { skill: "investigation", difficulty: 10, purpose: html("Stabilize and read fluctuating gauges.") } },
            physical: { weight: 2.3, bulk: 1, quantity: 1, unit: "tool" },
            properties: { tags: ["boiler", "inspection"] }
        }
    },
    {
        name: "Pocket Altitude Gauge",
        img: "icons/tools/navigation/compass-brass-blue-red.webp",
        system: {
            commonName: "Altitude Gauge",
            description: html("A barometric pressure capsule in a brass housing, graduated in feet; used by aerostat crews, highland surveyors, and anyone who must know precisely how far above the sea their feet presently stand."),
            category: "instrument",
            slot: "belt",
            quality: "fine",
            use: { skillCheck: { skill: "nature", difficulty: 10, purpose: html("Determine current altitude or predict pressure-related weather change.") } },
            physical: { weight: 0.5, bulk: 0, quantity: 1, unit: "instrument" },
            value: { price: 8, currency: "pounds" },
            properties: { tags: ["navigation", "precision"] }
        }
    },
    {
        name: "Surgeon's Field Case",
        img: "icons/tools/hand/tool-scissors-orange.webp",
        system: {
            commonName: "Field Case",
            description: html("A leather roll containing probes, forceps, suture needle and gut, a small bone saw, and spirit-soaked lint pads; sufficient for emergency treatment where no hospital is available."),
            category: "tool",
            slot: "belt",
            quality: "fine",
            use: { skillCheck: { skill: "medicine", difficulty: 11, purpose: html("Perform field surgery, stabilise critical wounds, or remove embedded fragments.") } },
            effects: [{ label: "Surgical Edge", targetType: "skill", target: "medicine", operation: "add", value: 1, formula: "", condition: "kit present", notes: html("Bonus to medicine checks requiring tools.") }],
            physical: { weight: 2.5, bulk: 1, quantity: 1, unit: "case" },
            value: { price: 14, currency: "pounds" },
            properties: { tags: ["medical", "surgical"] }
        }
    },
    {
        name: "Smoke Lens Goggles",
        img: "icons/equipment/head/goggles-lens-blue.webp",
        system: {
            commonName: "Smoke Goggles",
            description: html("Riveted brass frames fitted with smoked glass lenses and a gum-leather seal; reduce the glare of furnace light and permit useful vision through moderate fog and workshop soot."),
            category: "apparatus",
            slot: "head",
            quality: "fine",
            use: { skillCheck: { skill: "perception", difficulty: 9, purpose: html("Maintain vision through smoke, light glare, or airborne debris.") } },
            effects: [{ label: "Clear Sight", targetType: "skill", target: "perception", operation: "add", value: 1, formula: "", condition: "in smoke or glare", notes: html("Reduces vision penalties in smoky environments.") }],
            physical: { weight: 0.4, bulk: 0, quantity: 1, unit: "pair" },
            value: { price: 6, currency: "pounds" },
            properties: { tags: ["optics", "industrial"] }
        }
    }
];
