# Semantic Versioning Skill

**Purpose:** Enforce semantic versioning discipline for the Turn of the Century Foundry VTT system before committing changes to git.

**Current Version:** Read from `system.json` `version` field.

## Semantic Versioning Strategy

This project uses **Semantic Versioning 2.0.0** with pre-1.0 conventions:

### Version Format: `MAJOR.MINOR.PATCH`

Currently: `0.0.X` (pre-release development)

### When to Increment

**MAJOR version (X.0.0):**
- Breaking changes to document APIs (Actor, Item, Combat structures)
- Removal of migration paths or breaking data format changes
- Complete rewrite of core systems
- Dropping support for earlier Foundry versions
- **Pre-1.0:** Major feature framework overhaul (e.g., combat system redesign, sheet architecture rewrite)

**MINOR version (0.X.0):**
- New features that are backwards-compatible (new item types, new abilities, new UI systems)
- Significant non-breaking enhancements (improved encounters, new seed systems, new professions/quirks)
- Substantial internal refactoring that doesn't affect user data
- API additions that extend functionality
- **Pre-1.0:** Milestone features (e.g., workspace shell completion, V2 API migration, encounter planner)

**PATCH version (0.0.X):**
- Bug fixes and error corrections
- Performance improvements
- CSS/styling refinements
- Documentation updates
- Localization fixes
- Small UI improvements
- v14 compatibility fixes
- Seed data corrections

### Migration and Compatibility

- **No data migration breaking:** If commit involves data migrations (e.g., actor-economy, actor-profile), ensure migration handlers exist in `module/migrations/` and are properly registered in `runner.mjs`.
- **Version constraints:** When committing a migration, increment at least MINOR version to signal users must load system with migration handler.
- **Backwards compatibility:** Patches should never require user intervention; minor/major versions may require save updates.

## Pre-Commit Version Validation Workflow

### 1. Assess Change Scope

Before committing, analyze the change(s):

| Scope | Examples | Version Increment |
|-------|----------|------------------|
| Bug/fix | i18n key fixes, CSS tweaks, error handling | PATCH (0.0.X) |
| Small feature | Add single item/ability, minor UI tweak | PATCH or MINOR* |
| Feature system | New encounter type, new sheet, new UI panel | MINOR (0.X.0) |
| API change | V1→V2 migration, removal of API surface | MAJOR (X.0.0)** |
| Data format | Item structure change requiring migration | MAJOR (X.0.0)** |

*Small features may warrant MINOR if they're complete and user-visible; use judgment
**Pre-1.0 may use MINOR for major changes if versioning hasn't stabilized yet

### 2. Version Bump Decision Tree

```
Is this a breaking change to document APIs or data formats?
  → YES: Consider MAJOR (or pre-1.0 MINOR)
  → NO: Continue...

Is this a new feature or significant enhancement?
  → YES: Increment MINOR (0.X.0)
  → NO: Continue...

Is this a bug fix, performance improvement, or small enhancement?
  → YES: Increment PATCH (0.0.X)
  → NO: Reassess scope (may need multiple increments or special versioning)
```

### 3. Update `system.json`

When incrementing version:

1. Read current version from `system.json` (e.g., `0.0.52`)
2. Parse MAJOR.MINOR.PATCH components
3. Increment appropriate component:
   - **MAJOR bump:** `0.0.52` → `1.0.0` (reset minor/patch)
   - **MINOR bump:** `0.0.52` → `0.1.0` (reset patch)
   - **PATCH bump:** `0.0.52` → `0.0.53` (increment patch)
4. Update `system.json` `version` field with new version string
5. Commit version change alongside feature changes, or in a separate "Bump version" commit

### 4. Pre-Commit Checklist

- [ ] Analyzed scope of change (bug fix / feature / breaking change)
- [ ] Determined appropriate version increment (MAJOR / MINOR / PATCH)
- [ ] Updated `system.json` `version` field if needed
- [ ] Verified new version matches change scope
- [ ] If breaking change: Verified data migrations exist in `module/migrations/`
- [ ] Committed with clear message and version bump

## Model Workflow

**When to invoke this skill:**

1. **Before committing significant changes:** Ask user to confirm version increment type
2. **When reverting experimental features:** Increment patch (cleanup/rollback)
3. **When completing feature work:** Suggest appropriate version based on scope
4. **When fixing bugs:** Increment patch automatically (unless part of larger feature)
5. **When releasing:** Ensure version matches release notes

**How to apply:**

1. Read current `system.json` version
2. Ask user: "What type of change is this?" with options:
   - PATCH (bug fix, small improvement)
   - MINOR (new feature, enhancement)
   - MAJOR (breaking change, API update)
3. Parse current version and calculate next version
4. Update `system.json` version field
5. Include version bump in git commit message
6. Verify no uncommitted version changes remain before final commit

## Version History Reference

| Version | Changes | Notes |
|---------|---------|-------|
| 0.0.52 | UI refactor cleanup, removed tab-group API | Workspace shell simplified to single column |
| 0.0.51 | V2 sheet lifecycle migration | Actor/item/combat sheets now use ApplicationV2 API |
| 0.0.50 | Foundry v14 compatibility | Namespaced API migration (foundry.documents.*, etc.) |
| ... | ... | Earlier development versions |

## Common Scenarios

### Scenario 1: Bug Fix in i18n
**Change:** Fix dotted-key collision in localization system  
**Increment:** PATCH (0.0.52 → 0.0.53)  
**Commit:** `"Fix i18n dotted-key collision (0.0.53)"`

### Scenario 2: New Item Type
**Change:** Add new consumable subtype with stats and effects  
**Increment:** MINOR (0.0.52 → 0.1.0)  
**Commit:** `"Add new consumable subtype (0.1.0)"`

### Scenario 3: Sheet Architecture Overhaul
**Change:** Migrate all sheets from V1 to V2 API  
**Increment:** MAJOR or pre-1.0 MINOR (0.0.52 → 0.1.0 or 1.0.0)  
**Commit:** `"Migrate sheets to ApplicationV2 API (0.1.0)"`  
**Note:** Breaking change, but pre-1.0 semver allows flexibility

### Scenario 4: Combat System Redesign
**Change:** Rewrite combat tracker, action catalog, encounter seeding  
**Increment:** MINOR (0.0.52 → 0.1.0)  
**Commit:** `"Redesign combat system (0.1.0)"`  
**Note:** Could be MAJOR if data format changes require migrations

## Validation Rules

- **No gaps:** If current version is 0.0.52, next must be 0.0.53, 0.1.0, or 1.0.0 (no 0.0.54.5 or skipping)
- **No backwards:** Version numbers never decrease (no rollback to 0.0.51 after reaching 0.0.52)
- **Format validation:** Version must match regex `/^\d+\.\d+\.\d+$/` (e.g., 0.0.53, 1.0.0)
- **Consistency:** `system.json` version must match git commit tag or latest release version

## Tool Integration

**Before running `git commit`:**
1. Check if staged changes exist
2. Read current `system.json` version
3. Determine if version bump needed (ask user or auto-detect from commit scope)
4. Update `system.json` if needed
5. Include updated version in commit message
6. Proceed with commit

**Example commit with version bump:**
```
git add system.json module/sheets/actor-sheet.mjs
git commit -m "Refactor actor sheet layout (0.1.0)"
```

## References

- **Semantic Versioning 2.0.0:** https://semver.org/
- **System Config:** `system.json` (contains `version` field)
- **Migration Handlers:** `module/migrations/runner.mjs`
- **Change Log:** Git commit history and release notes

---

**Last Updated:** 2026-05-10  
**System ID:** turn-of-the-century  
**Applies To:** All commits that modify system behavior, features, or compatibility
