---
name: asset-generation  
description: Enables the agent to create new, thematically appropriate assets for this game system by mapping and adapting items from D&D 5e and other fantasy RPGs into the contemporary gothic-horror context, ensuring dense, unique, and period-consistent compendium content.
---

# Asset Generation: Thematic Item and Asset Creation for Turn of the Century

## Purpose

Use this skill to generate new assets—especially items of all types—for the compendium by conceptually mapping from existing, publicly available assets in D&D 5e and other fantasy RPGs. The goal is to create a densely populated, unique compendium that fits the contemporary gothic-horror and steampunk themes of this system.

## Core Directives

1. **Conceptual Mapping**: For each batch, select items from fantasy RPGs and create new, unique analogs that fit the gothic-horror, steampunk, and turn-of-the-century context. Avoid direct copying; always adapt and transform.
2. **Thematic Consistency**: All generated assets must follow the guidance in the `art-style`, `language-style`, and `science-not-magic` skills. Items should feel plausible for 1890–1910, blending gothic dread, industrial modernity, and scientific wonder.
3. **Scientific, Not Magical**: Replace magical effects with advanced science, technology, medicine, or occult rationalizations appropriate to the era. See the `science-not-magic` skill for details.
4. **Unique and Non-Redundant**: Before generating new assets, examine the compendium for existing items and avoid duplication. Each batch should add ten new, distinct items.
5. **Incremental Generation**: When the user requests more assets, generate them in increments of ten, ensuring each is a new analog not already present in the compendium.
6. **Rich Metadata**: Populate all relevant fields (type, category, quality, rarity, effects, description, artwork, etc.) using the system’s data model conventions.
7. **Documentation and Provenance**: For each new asset, note the conceptual source (e.g., “inspired by D&D 5e ‘Bag of Holding’”) and describe the adaptation process.

## Workflow

- On each invocation, scan the compendium for existing items.
- Select ten new source items from public RPGs that have not yet been adapted.
- For each, create a new, unique analog that fits the gothic-horror/steampunk context, following all style and science guidelines.
- Ensure all text, effects, and mechanics are period-appropriate and scientifically rationalized.
- Add provenance notes and ensure no duplicates.

## Example

- D&D 5e “Potion of Healing” → “Dr. Blackwell’s Restorative Tonic” (a bottled, patent medicine with plausible chemical effects and period-appropriate branding)
- D&D 5e “Bag of Holding” → “Collapsible Valise of Ingenious Design” (a cleverly engineered, expandable travel bag with hidden compartments and spring-steel supports)
