---
name: asset-management
description: Enforce Foundry VTT media asset organization for Turn of the Century worlds. Use when creating or configuring scenes, uploading or assigning image/audio/video files, adding scene backgrounds, tiles, tokens, ambient sounds, playlists, journals, handouts, or any user-provided media so assets are stored under a single world-root assets/ folder with type and context subfolders.
---

# Asset Management

## Core Rule

All user-uploaded media for a Foundry world must live under one `assets/` folder at the game world root.

Do not scatter media into module folders, system folders, compendium pack folders, Foundry core folders, or ad hoc directories. When configuring scenes or documents, reference files from the organized world asset path.

## Folder Structure

Organize assets first by media type, then by context:

```text
assets/
  images/
    scenes/
    tokens/
    portraits/
    tiles/
    journals/
    items/
    ui/
  audio/
    ambient/
    music/
    effects/
    voice/
  video/
    scenes/
    handouts/
    effects/
```

Use lowercase folder names, plural nouns, and hyphenated context names when a new context is needed.

Examples:

- Scene background image: `assets/images/scenes/<scene-slug>.<ext>`
- Scene tile image: `assets/images/tiles/<scene-or-purpose>/<asset-slug>.<ext>`
- Token artwork: `assets/images/tokens/<actor-slug>.<ext>`
- Actor portrait: `assets/images/portraits/<actor-slug>.<ext>`
- Journal or handout image: `assets/images/journals/<topic-slug>.<ext>`
- Ambient scene audio: `assets/audio/ambient/<scene-or-region-slug>.<ext>`
- Music track: `assets/audio/music/<track-slug>.<ext>`
- Sound effect: `assets/audio/effects/<effect-slug>.<ext>`
- Scene video or animated background: `assets/video/scenes/<scene-slug>.<ext>`
- Video handout: `assets/video/handouts/<topic-slug>.<ext>`

## Scene Configuration Rules

When creating or editing a Foundry scene:

1. Store scene background images in `assets/images/scenes/`.
2. Store animated scene backgrounds in `assets/video/scenes/`.
3. Store tile artwork in `assets/images/tiles/`, with a scene or purpose subfolder when useful.
4. Store ambient audio tied to the scene in `assets/audio/ambient/`.
5. Store one-shot scene sound effects in `assets/audio/effects/`.
6. Store scene-specific music in `assets/audio/music/` unless it belongs to a general playlist library.
7. Keep configured Foundry document paths pointed at these world-root asset locations.

If the user provides media without a target context, infer the narrowest context from the operation. For example, media uploaded while creating a scene should default to the relevant scene folder, not a generic dump folder.

## Naming Rules

Use stable, readable filenames:

- lowercase
- hyphen-separated
- no spaces
- no punctuation except hyphen and extension dot
- include a short context or subject

Prefer:

```text
assets/images/scenes/whitechapel-alley-night.webp
assets/audio/ambient/whitechapel-rain-and-cartwheels.ogg
assets/images/tokens/constable-harper.webp
```

Avoid:

```text
My Cool Map FINAL.png
audio1.mp3
uploads/new/file.png
```

## Supported Media Types

Foundry and browsers commonly support these formats. Prefer web-optimized formats when possible.

Images:

- `.webp` preferred for most scene, token, portrait, item, and tile art
- `.png` for transparency, UI elements, diagrams, and lossless assets
- `.jpg` or `.jpeg` for photographic or painted scene backgrounds when transparency is not needed
- `.svg` for simple vector icons or UI assets when the source is trusted
- `.gif` only for small legacy animations; prefer video for larger animated content

Audio:

- `.ogg` preferred for looping ambient audio and browser-friendly game audio
- `.mp3` acceptable for music and broad compatibility
- `.wav` acceptable for short source-quality effects, but avoid large files in active scenes when compressed formats suffice
- `.flac` only for archival/source material, not routine scene playback

Video:

- `.webm` preferred for animated scenes, transparent effects, and efficient browser playback
- `.mp4` acceptable for broad compatibility
- avoid very large video files for scene backgrounds unless the use case justifies the load cost

## Upload Workflow

When uploading or assigning a file:

1. Identify media type: image, audio, or video.
2. Identify context: scene, token, portrait, tile, ambient, music, effect, handout, UI, etc.
3. Normalize the filename.
4. Place the file under the correct `assets/<type>/<context>/` path.
5. Configure the Foundry document to use that organized path.
6. If replacing an existing asset, preserve the old file unless the user explicitly asks to delete it.

## Guardrails

- Do not store world-specific user uploads in `systems/turn-of-the-century/`.
- Do not store world-specific user uploads in module directories.
- Do not write media into compendium pack directories.
- Do not flatten all uploads into a single `assets/` root.
- Do not rename or move existing user media unless the user asks or the operation is clearly part of an organization task.
- Ask before overwriting any existing asset path.

## Foundry Path Guidance

Use world-relative paths suitable for Foundry document configuration, such as:

```text
worlds/<world-id>/assets/images/scenes/whitechapel-alley-night.webp
```

When working inside a Foundry file picker rooted at the world, the visible path may appear as:

```text
assets/images/scenes/whitechapel-alley-night.webp
```

Preserve whichever path style the local Foundry API or file picker expects, but keep the physical organization under the world-root `assets/` tree.
