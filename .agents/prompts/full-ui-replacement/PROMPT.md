---
name: full-ui-replacement
description: This prompt describes the guidance for an agent to present a plan for completely replacing the Foundry VTT UI with a multi-window, dockable, stackable, composable UI that allows the player or GM to arrange the visual elements of the game in the way they want.
---

# Your Background

You are an expert in the inner workings of the Foundry VTT system. You have coded many modules and game systems using the public APIs available for that system. You are an expert in interface and experience design for products like Foundry VTT. You are intimately familiar with UI/UX design principles and patterns. You are dissatisfied with the poor separation of concerns offered by the default user interface in Foundry VTT. You want to replace the ***entire*** Foundry VTT UI with something that is easier for GMs and players to interact with.

# Instruction

You will first evaluate the feasibility of replacing the ***entire*** Foundry VTT user interface with a set of dockable, stackable, and composable panels that each represent a discrete function of the user experience, whether GM or player. The resulting user interface must satisfy the following requirements.

- No trace of the exisitng Foundry VTT user interface may remain visible. 
- User activities are logically organized into panels that encapsulate each activity. 
- Each panel has a border, resize controls, and a title. 
- Panels may be docked to any edge of the screen by dragging them toward the desired edge, similar to how docking works in VS Code. 
- Panels may be stackable along any edge of the screen. 
- If a drag gesture drops a panel near the top of bottom of an existing docked panel the new panel is stacked above or below the existing docked panel.
- If a dragged panel is dropped over the middle of an existing docked panel then the two panels are composed into a tab group.
- If possible, a ghost image should be displayed to indicate where a panel will be dropped relative to other docked panels in the area.
- A column or row of stacked panels can be resized relative to the border then are docked against. 
- Panels within a column or row of docked panels may be resized within the stacked group to allow more or less room to other panels in the stacked group.
- Panel frames and titles are minimal to allow more room for panel content.
- Panels have a consistent inner padding. 
- Available panels may be hidden by the GM or player.
- Access and control of panels is role-based. Some panels may only be accessed by GMs, for example.
- Panels may remain floating (not docked or composed).
- Floating panels may be resized in two dimensions as desired by the GM or player.
- All functions of the Foundry VTT system are represented on available panels.
- Panel organization (position, docking, stacking, composing) is remembered and restored across sessions.
- All changes to the Foundry VTT ui will be encoded in the game system defined in this package.
- All code written or modified for this effort must be strictly compliant with the Application V2 APIs
- Where possible, All code written or modified should prefer using classes as opposed to sets of library functions.
- All current customizations in this game system must be preserved under the new UI implementation.

# Vision

The foundry VTT user interface is cumbersome and difficult to use. It inevitably results in piles of floating windows that the GM or player has to constantly resize, move, open and close. This is a classic example of a user interface that is completely and utterly unaware of context. I want to replace the entire in-game UI with something that adapts to changing context, showing the GM and Player just the right amount of info and actions for the current game context. For example, in a combat encounter, on a player's turn the primary UI should show the user their current stats, available actions and a die roller. Likewise, the GM will see views of the two opposing creatures, with reaction prompts given in the context of the available actions rather than a popup window. 

The other key aspect of this project is to make the UI personalizable. Let the GM and player arrange panels that provide certain functions however they wish. These panels will be dockable, stackable and composable, and each panel will encapsulate a related set of actions and information. For example, a creature info panel will show what the player knows about that creature. Consider the following as just a few examples of panels that will be created in order to provide a better separation of concerns. 

- An aggregated, searchable compendium library (one unified search across all compendiums)
- Player in-combat view (stats, available actions, effects, reactions, die roller)
- An aggregate inventory and equipment view (this will align with the equipment slots feature currently defined in this game system)
- A map view (yes, the map should be a dockable panel, which may be docked in the center)
- A turn tracker (that includes all functions related to initiative order, rounds, turns, advancing the turn order, etc.)
- many, many more examples.

# Purpose of this request

Your goal is assess the feasibility of completely replacing the Foundry VTT in-game UI as described above. You will provide a detailed description of this assessment in a document under docs/.  If the assessment is favorable, you will create a detailed technical design document, also in the docs/ folder, describing the changes that need to be made and an incremental implementation plan with verifiable milestones. If the UI conversion is not feasible, then the assessment doc should include that conclusion, along with a detailed description of the reasons why. 

# What does "complete replacement" mean?

- All visual elements of the ***in-game*** Foundry VTT user interface must be removed or hidden. This includes: 
  - The left action bar and sub bars
  - The right action bar and associated panels
  - The scene selector on the top
  - The quick slot bar on the bottom
  - The player list on the bottom left
  - The chat window on the bottom-right
- The replacement will provide completely custom styling.  
- All user actions included in the original Foundry VTT user interface are replicated in the replacement UI.
- All original Foundry VTT graphical assets remain available for use in the replacement UI.
- All Foundry Application V2 API hooks and other capabilities are supported through replacement UI.
- A facility for accessing the in-game main menu (the one that has the Return to Setup menu item) must be present.

# Assessment Success Conditions

- Every requirement in the Instruction section has been satisfied.
- If a conversion is viable, a clear and orderly path for implementing the conversion, with verifiable milestones, has been defined. 
- The assessment and design docs have been created under docs/

# Assessment Failure Conditions

- Discovery of any constraint or functional gap in the Foundry VTT system prevents the existing UI from being replaced entirely. 

# Out of scope

- No code changes are authoprized as part of this request.
