# Auto-GM Encounter Round Narration

## Purpose

The Auto-GM should generate rich, thematically appropriate narrative descriptions of encounter rounds that the GM can use to tell the story of the resolved action. These descriptions are an artistic layer on top of normal encounter processing. They should be derived from the confirmed plans, tick resolution, reconciliation outcomes, actor state, item descriptions, and scene context, without replacing or obscuring the underlying mechanics.

The GM may share the generated narration directly with the players, read it aloud, edit it, or use it only as private inspiration while storytelling the round.

## Feature Overview

After the encounter engine resolves and reconciles a round, the Auto-GM generates a per-tick narrative account of what visibly and fictionally happened. The generated text should describe each actor's intent, motion, preparation, impact, interruption, evasion, injury, hesitation, recovery, and other consequences in natural language.

The narration must avoid exposing raw mechanics to players. It should not describe results as damage dealt, failed saving throws, armor class comparisons, hit margins, or status-effect bookkeeping unless the GM has explicitly requested a mechanical summary. Instead, mechanical results should be translated into observable consequences.

Examples:

- Prefer: `The lightning strikes Horus squarely in the chest, locking his muscles and halting the blade before it falls.`
- Avoid: `Horus takes 8 lightning damage, fails his save, and loses his attack.`

## Example

Given the following planned actions:

- Horus: Close and Engage with Hera (4 AP), then perform a strong strike with the heron blade (2 AP).
- Hera: Fire lightning bolt from temporal sceptre (3 AP), then evade Horus (3 AP).

The Auto-GM might generate the following narration:

- Tick 1: Horus begins a mad dash toward Hera with dire intent in his eyes. Hera raises her temporal sceptre as pale energy starts running down her arm and into the staff.
- Tick 2: Horus closes the distance and draws the heron blade back for a deadly strike. Energy ripples along the length of Hera's sceptre, bright and eager to be released.
- Tick 3: Horus brings the heron blade around with all his might just as Hera releases a desperate surge of lightning straight into his chest.
- Tick 4: Electricity courses through Horus' rigid body, stopping the blade in mid-swing. While he is stunned, Hera turns and flees from her attacker.
- Tick 5: Hera widens the gap, glancing back as the last sparks crawl over Horus' coat and gloves.
- Tick 6: Horus forces himself back into motion too late to complete the killing stroke, while Hera keeps moving through the aftermath of the blast.

The exact phrasing should vary across rounds. The same action and item combination should not always produce identical prose.

## Inputs

The narration generator should consume structured data that already exists after round processing:

- Confirmed actor action plans, including AP timing, action ids, targets, selected items, movement paths, and declared intent.
- Tick-by-tick resolution output, including movement progress, action start, action release, attack timing, interruption, evasion, misses, hits, critical outcomes, and delayed or cancelled actions.
- Reconciliation results, including simultaneous outcomes, interrupted actions, conflicting movement, incapacitation, and final actor positions.
- Actor metadata, including name, disposition, current conditions, injuries, species or ancestry where relevant, and available descriptive traits.
- Item metadata, including display name, damage type, range, action flavor, preparation text, release text, impact text, malfunction text, and recovery text.
- Scene context, including lighting, terrain, weather, hazards, and other environmental details when available.

## Output

The primary output is a round narration object suitable for display in the GM Encounter Manager and optional sharing to chat.

Required structure:

- Round title or summary.
- Per-tick narration, ordered by AP tick.
- Optional full-round prose summary.
- Optional GM-only notes for unusual mechanical outcomes that may need adjudication.
- References back to the source round, tick, actor, action, and item ids so the narration can be regenerated, edited, audited, or linked to mechanical details.

The GM-facing UI should preserve access to the mechanical tick log alongside the narrative text. The narrative should enrich the round, not become the only record of what happened.

## Tone and Style

Narration should match the game's late nineteenth and early twentieth century gothic-pulp tone: urgent, physical, atmospheric, and grounded in natural consequences. Advanced devices and strange powers should be described through observable effects, strange science, occult rumor, or unreliable perception rather than purely modern technical jargon.

Style requirements:

- Use vivid but concise prose suitable for a GM to read aloud.
- Describe movement, preparation, impact, consequence, and reaction.
- Keep each tick short enough to scan during play.
- Vary sentence structure, verbs, and sensory details across repeated actions.
- Avoid repetitive stock phrases for common events such as attacks, movement, evasion, waiting, and interruption.
- Respect the known facts of the resolution. Do not invent outcomes that conflict with the mechanical result.
- Do not reveal hidden information that the GM has not chosen to expose.
- Do not convert the narration into a rules explanation unless the GM requests that view.

## Mechanical Translation Rules

Mechanical outcomes should be translated into narrative consequences:

- A hit becomes visible contact, pain, force, disruption, torn clothing, a stagger, a wound, or another appropriate consequence.
- A miss becomes a narrow escape, poor footing, a deflection, smoke, confusion, cover, misjudged distance, or an environmental complication.
- Damage becomes an observable effect proportional to the result, such as bruising, burns, bleeding, breathlessness, or failing balance.
- An interruption becomes a broken motion, lost opportunity, disrupted aim, frozen limb, shattered concentration, or forced recoil.
- Evasion becomes footwork, retreat, cover, misdirection, ducking, slipping away, or using the environment.
- A critical success becomes a decisive, memorable consequence without needing to mention the critical result.
- A critical failure becomes a believable mishap, overextension, jam, slip, recoil, stumble, or self-inflicted complication.
- Conditions become visible impairments, such as trembling hands, labored breathing, locked joints, ringing ears, blurred focus, or panic.

## Generation Behavior

The generator should work in two layers:

1. Deterministic narrative staging converts structured round data into a factual tick outline: who began, moved, prepared, released, connected, missed, interrupted, evaded, or recovered on each tick.
2. AI-assisted prose generation turns that factual outline into polished narration while staying within the provided facts and style constraints.

The AI prompt must explicitly instruct the model to:

- Preserve all mechanical facts supplied in the outline.
- Avoid adding unsupported actions, damage, positions, or revealed secrets.
- Describe results through fictional consequences rather than rules terms.
- Produce concise per-tick narration.
- Include enough variation to avoid repetitive phrasing across rounds.
- Use period-appropriate gothic-pulp language without becoming florid or slow at the table.

If AI generation is unavailable, fails validation, or exceeds latency limits, the system should fall back to deterministic template-based narration using action-level and item-level flavor text.

## GM Controls

The GM should be able to:

- Generate narration after a round resolves.
- See the narrative round plans, the factual outcome, and the generated narrative result side-by-side.
- Regenerate the narration with the same mechanical inputs.
- Choose a shorter, normal, or more dramatic style.
- Edit generated text before sharing it.
- Share all ticks, selected ticks, or only the round summary with players.
- Keep GM-only narration private.
- Toggle whether mechanical notes are shown beside the prose.

## Acceptance Criteria

- After round resolution, the GM can generate per-tick narrative text from the resolved and reconciled round results.
- The generated narration accurately reflects action timing, movement, interruption, hits, misses, evasion, and final consequences.
- The narration describes outcomes as natural fictional consequences rather than raw mechanics.
- Repeated common actions produce varied prose over multiple rounds.
- Item-specific and action-specific flavor text can influence narration.
- The GM can edit or regenerate the narration before sharing it.
- Mechanical tick results remain available even when narrative text is shown.
- A deterministic fallback produces usable narration when AI generation is unavailable.
