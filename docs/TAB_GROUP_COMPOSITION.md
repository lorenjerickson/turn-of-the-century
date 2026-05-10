# Tab Group Composition System

## Overview

The **Tab Group Composition System** allows players to organize workspace panels (Encounter, Travel, Market, Camp) into custom tab groups. Instead of a rigid 3-column layout, players can now:

- Create multiple tab groups
- Move panels between groups
- Switch between tabs within a group
- Dock/undock panels dynamically
- Save custom layouts across sessions

## Architecture

### Core Components

**1. Tab Group Manager** (`module/ui/tab-group-manager.mjs`)
- `TotcTabGroupManager` class for managing tab group state
- Persistence to scene flags (`scene.flags["turn-of-the-century"]["tabGroupConfig"]`)
- Support for multiple layouts and presets
- Import/export functionality for sharing layouts

**2. Workspace Shell Integration** (`module/ui/workspace-shell.mjs`)
- Tab group rendering in shell header
- Event listeners for tab switching and context navigation
- Automatic context switching when tabs are clicked
- Real-time re-rendering on tab configuration changes

**3. Public API** (`game.turnOfTheCentury.tabGroups`)
- 11 public methods for tab management
- Preset layout support
- Configuration export/import

## Default Layout

By default, all four panels are in a single group called "Main":

```
┌─────────────────────────────────────────────────────┐
│ Turn of the Century Workspace                       │
├─────────────────────────────────────────────────────┤
│ Main:  [Encounter] [Travel] [Market] [Camp]        │
├─────────────────────────────────────────────────────┤
│ Encounter | Travel | Market | Camp (Context Buttons)│
├─────────────────────────────────────────────────────┤
│ Left Dock │        Main Panel          │ Right Dock │
│           │                            │            │
└─────────────────────────────────────────────────────┘
```

## Browser Console API

### Viewing Tab Groups

```javascript
// List all groups and tabs
game.turnOfTheCentury.tabGroups.listGroups();

// Output:
// ┌─ Main
// │  Encounter ✓ (active)
// │  Travel
// │  Market
// │  Camp
```

### Switching Tabs

```javascript
// Get the main group first
const manager = game.turnOfTheCentury.tabGroups.getManager();
const mainGroup = manager.getGroups()[0];

// Switch to travel tab
await game.turnOfTheCentury.tabGroups.switchTab(mainGroup.id, "tab-travel");
```

### Creating New Groups

```javascript
// Create a new group
const playGroup = await game.turnOfTheCentury.tabGroups.createGroup("Play");

// Add tabs to it
await game.turnOfTheCentury.tabGroups.addTab(playGroup.id, "encounter", "Combat");
await game.turnOfTheCentury.tabGroups.addTab(playGroup.id, "camp", "Rest");
```

### Applying Preset Layouts

```javascript
// Apply a preset layout
await game.turnOfTheCentury.tabGroups.applyLayout("separate");
// Creates 4 separate tab groups, one per context

await game.turnOfTheCentury.tabGroups.applyLayout("grouped");
// Creates 2 groups: "Play" (Encounter + Camp) and "Plan" (Travel + Market)

await game.turnOfTheCentury.tabGroups.applyLayout("default");
// Resets to default single group with all panels
```

## Preset Layouts

### Default Layout
Single "Main" group with all four panels as tabs.
```
Main: [Encounter] [Travel] [Market] [Camp]
```

### Separate Tabs Layout
Each panel in its own group for maximum visibility.
```
Encounter: [Encounter]
Travel:    [Travel]
Market:    [Market]
Camp:      [Camp]
```

### Grouped Layout
Logical grouping for play workflows.
```
Play: [Encounter] [Camp]
Plan: [Travel] [Market]
```

## Advanced Usage

### Creating a Custom Layout

```javascript
const manager = game.turnOfTheCentury.tabGroups.getManager();

// Create 3 custom groups
const combatGroup = await manager.createGroup("Combat");
const logisticsGroup = await manager.createGroup("Logistics");
const referencesGroup = await manager.createGroup("References");

// Organize panels
await manager.addTab(combatGroup.id, "encounter", "Initiative");
await manager.addTab(logisticsGroup.id, "market", "Trade");
await manager.addTab(logisticsGroup.id, "camp", "Rest");
await manager.addTab(referencesGroup.id, "travel", "Map");

// Render to see changes
await manager.scene.parent.getFlag("turn-of-the-century", "tabGroupConfig");
```

### Exporting and Importing Layouts

```javascript
// Export current layout
const config = game.turnOfTheCentury.tabGroups.exportConfig();
console.log(config);

// Share with other players or save locally
// Then import later:
await game.turnOfTheCentury.tabGroups.importConfig(config);
```

### Moving Tabs Between Groups

```javascript
const manager = game.turnOfTheCentury.tabGroups.getManager();
const groups = manager.getGroups();

// Move "Travel" tab from group 0 to group 1
const travelTab = groups[0].tabs.find(t => t.panelContext === "travel");
if (travelTab) {
    await manager.moveTabToGroup(groups[0].id, groups[1].id, travelTab.id);
}
```

### Reordering Tabs

```javascript
const manager = game.turnOfTheCentury.tabGroups.getManager();
const group = manager.getGroups()[0];

// Reorder tabs: Camp first, then Encounter, Travel, Market
const newOrder = [
    group.tabs.find(t => t.panelContext === "camp").id,
    group.tabs.find(t => t.panelContext === "encounter").id,
    group.tabs.find(t => t.panelContext === "travel").id,
    group.tabs.find(t => t.panelContext === "market").id
];

await manager.reorderTabs(group.id, newOrder);
```

## UI Interactions

### Clicking Tabs
- Clicking a tab switches to that panel context
- Active tab is highlighted in gold/brown
- Tab appears at top of workspace

### Tab Appearance
- **Inactive tabs**: Dark gray with light border
- **Active tabs**: Gold/brown background with white text
- **Hover state**: Lighter background, lighter border
- **Group name**: Small, uppercase, appears above tabs

## Persistence

All tab group configurations are automatically saved to the current scene's flags:
- Flag path: `scene.flags["turn-of-the-century"]["tabGroupConfig"]`
- Persists across sessions and page reloads
- Unique to each scene (different scenes can have different layouts)

## API Reference

### `game.turnOfTheCentury.tabGroups`

```javascript
// Configuration retrieval
getManager()                    // Get TotcTabGroupManager instance
listGroups()                    // Array of all tab groups
getGroup(groupId)               // Get group details by ID

// Group management
createGroup(name)               // Promise<Object>
deleteGroup(groupId)            // Promise<boolean>

// Tab management
addTab(groupId, panelContext, label)    // Promise<Object|null>
removeTab(groupId, tabId)               // Promise<boolean>
switchTab(groupId, tabId)               // Promise<boolean>

// Layouts and configuration
applyLayout(layoutName)         // Promise<boolean> — 'default', 'separate', 'grouped'
resetToDefault()                // Promise<void>
exportConfig()                  // String (JSON)
importConfig(jsonString)        // Promise<boolean>
```

## Examples

### Example 1: Combat-Focused Layout

```javascript
// Create a focused combat layout
await game.turnOfTheCentury.tabGroups.createGroup("Combat");
const groups = game.turnOfTheCentury.tabGroups.listGroups();
const combatGroup = groups.find(g => g.name === "Combat");

// Keep only Encounter in combat group
const encounterTab = combatGroup.tabs.find(t => t.panelContext === "encounter");
for (const tab of combatGroup.tabs) {
    if (tab.panelContext !== "encounter") {
        await game.turnOfTheCentury.tabGroups.removeTab(combatGroup.id, tab.id);
    }
}

// Create logistics group for other panels
const logisticsGroup = await game.turnOfTheCentury.tabGroups.createGroup("Logistics");
await game.turnOfTheCentury.tabGroups.addTab(logisticsGroup.id, "travel", "Journey");
await game.turnOfTheCentury.tabGroups.addTab(logisticsGroup.id, "market", "Trade");
await game.turnOfTheCentury.tabGroups.addTab(logisticsGroup.id, "camp", "Rest");
```

### Example 2: Sharing a Layout

```javascript
// Save layout
const myLayout = game.turnOfTheCentury.tabGroups.exportConfig();
console.log("Copy this to share:");
console.log(myLayout);

// In another session, a friend imports it:
const friendLayout = `{...your saved JSON...}`;
await game.turnOfTheCentury.tabGroups.importConfig(friendLayout);
```

### Example 3: Session-Specific Layouts

```javascript
// Check current layout
const groups = game.turnOfTheCentury.tabGroups.listGroups();
console.log("Current layout:", groups.map(g => `${g.name}: ${g.tabs.length} tabs`));

// Switch for roleplay session
await game.turnOfTheCentury.tabGroups.applyLayout("grouped");

// Later, switch back
await game.turnOfTheCentury.tabGroups.applyLayout("separate");
```

## Styling

Tab groups use the following CSS classes:

```css
.totc-tab-groups              /* Tab group container */
.totc-tab-group               /* Individual tab group */
.totc-tab-group__name         /* Group name label */
.totc-tab-group__tabs         /* Tabs container */
.totc-tab                      /* Individual tab button */
.totc-tab.is-active           /* Active tab styling */
```

Colors use the system theme:
- **Inactive**: `rgba(239, 231, 214, 0.7)` (tan, semi-transparent)
- **Active**: `rgba(153, 122, 71, 0.5)` (brown)
- **Hover**: Lighter backgrounds and borders

## Performance Notes

- Tab groups are stored as scene flags (minimal space)
- Rendering is efficient (only visible groups render)
- Switching tabs triggers a workspace re-render (fast)
- No impact on combat performance

## Troubleshooting

### Tabs not appearing?
- Check that panels are added to groups: `game.turnOfTheCentury.tabGroups.listGroups()`
- Verify scene has tab group config saved: `game.scenes.current.getFlag("turn-of-the-century", "tabGroupConfig")`

### Layout not persisting?
- Tab groups save to scene flags — changes persist when scene is saved
- If using temporary layouts, export config before switching scenes

### Can't switch to a tab?
- Verify tab ID exists: `game.turnOfTheCentury.tabGroups.getGroup(groupId).tabs`
- Check that the panel context is valid (encounter, travel, market, camp)

## Future Enhancements

Potential additions:
- Drag-and-drop tab reordering in UI
- Tab group rename dialog
- Right-click context menus for tabs
- Quick-save layout slots
- Per-player layout preferences
- Layout templates for common play styles

## Next Steps

After implementing tab groups, consider:
1. User testing with actual players
2. Collecting feedback on layout preferences
3. Adding more preset layouts based on common workflows
4. Implementing UI drag-and-drop for tab management
5. Saving favorite layouts to Actor documents (persistent player preferences)
