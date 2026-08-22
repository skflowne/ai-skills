---
name: suno
description: Create, rewrite, and package songs for Suno, including style prompts, negative prompts, structured lyrics, vocal and production direction, instrumental briefs, and revisions based on generated results. Use when the user asks for a Suno-ready song, lyrics or music-generation prompts, translation of artist or track references into usable traits, an instrumental track, or help improving a song's rhythm, rhyme, structure, meaning, originality, vocal persona, production clarity, or generation consistency.
---

# Suno

## Define the song

Infer the following from the request and supplied material:

- Emotional core and narrative situation
- Narrator, attitude, diction, and degree of stability or restraint
- Genre palette, tempo feel, energy curve, and production scale
- Vocal range, tone, delivery, and section-to-section contrast
- Song structure and intended use

Ask a question only when a missing choice would materially change the song. Otherwise, make a coherent creative decision and proceed.

When the song belongs to an existing project or fictional setting, inspect its relevant canon and terminology first. Preserve established facts without turning game mechanics, internal labels, or other meta language into lyrics unless requested.

## Translate references without naming artists

When the user supplies artists, songs, or genres as inspiration:

1. Identify broad musical traits: genre blend, rhythm, instrumentation, vocal behavior, mood, dynamics, hook shape, lyrical density, and production character.
2. Combine those traits into a distinct, internally coherent direction.
3. Keep artist and band names out of the Suno style prompt and negative prompt.
4. Do not reproduce signature lyrics, melodies, titles, or unusually distinctive phrasing from the references.

If a reference is unfamiliar, verify its broad traits rather than guessing. Artist names may be acknowledged outside the copyable Suno prompts when useful.

## Build the Suno package

Default to four clearly separated, copyable sections:

1. `Title`
2. `Suno style prompt`
3. `Negative prompt`
4. `Lyrics`

Use fenced code blocks for the two prompts and the lyrics. Give one strong title by default; offer alternatives only when requested or genuinely useful.

### Write the style prompt

Use focused, descriptive prose rather than a pile of disconnected tags. Describe the desired result positively and in priority order:

- One dominant genre and subgenre, with at most one or two compatible influences and an era or aesthetic when it adds useful sonic information
- Tempo or BPM, groove, meter, and key feel when useful
- Mood, energy, and emotional trajectory
- Vocal register, timbre, delivery, intensity, and backing-vocal arrangement
- Three to six defining instruments, described by role, tone, or behavior rather than as an inventory
- Drum behavior: default to a steady, pocket-first groove with sparse, short fills reserved for major section transitions unless the user or genre clearly calls for expressive drumming. Keep fills out of vocal hooks and important lyric lines.
- The arrangement arc from opening through development and climax to the ending
- Mix qualities such as intelligible vocals, controlled low end, crisp transients, instrumental separation, stereo width, dynamic contrast, and a polished master

Keep the style prompt concise and specific to this song. Include only the few elements that most clearly differentiate it, such as its defining genre fusion, groove, instrumentation, vocal persona, or essential arrangement twist. Explain the role of each influence when combining genres, such as `trip-hop rhythm section with dream-pop guitars`, and remove contradictory genres, moods, eras, or production traits. Omit generic production polish, exhaustive section mapping, and low-impact tags unless they are crucial to the requested identity. Put the song's identity first because early prompt terms carry the most weight. Describe quality affirmatively; put unwanted qualities in the negative prompt.

Keep the complete Suno style prompt at or below 1000 characters, including spaces, but treat that as a ceiling rather than a target. Preserve the highest-priority musical traits and remove repetition or lower-value detail.

### Write the negative prompt

List only a small number of concrete, audible, plausible failure modes for the requested song, such as unwanted genres, moods, vocal styles, instruments, arrangement habits, or mix problems. Write them as direct, comma-separated exclusions; do not prefix them with `no`, `avoid`, `without`, or similar negation because the field is already a negative prompt. Keep it compatible with the positive prompt, and never use vague judgments such as `bad`, `boring`, or `low quality`. Unless busy or virtuosic drumming is requested, include concise exclusions such as `excessive drum fills, extended tom runs, fill-every-four-bars patterns, fills over vocals`. Useful production exclusions can also include muddy low mids, uncontrolled sub-bass, washed-out reverb, buried vocals, harsh mastering, or cluttered arrangement when relevant.

When a vocal characteristic is essential, reinforce the positive direction with the incompatible characteristic in the negative prompt, such as specifying `low female lead` in the style prompt and excluding `male vocals`.

### Write the lyrics

Use recognizable bracketed section labels such as `[Intro]`, `[Verse 1]`, `[Pre-Chorus]`, `[Chorus]`, `[Post-Chorus]`, `[Bridge]`, `[Instrumental Break]`, `[Final Chorus]`, and `[Outro]`. Put global sonic direction in the style prompt. Put only local arrangement, transition, or delivery cues in the relevant label, such as `[Bridge — half-time, nearly whispered]`, with one or two ideas per section. Treat section cues as guidance rather than deterministic commands, and never bury the lyrics beneath annotations.

Reserve parentheses within lyric lines for intentional backing vocals, echoes, or ad-libs, and use them sparingly because Suno may still render them as lead vocals.

For an instrumental, use the same section labels and concise section-level cues to map the musical development instead of inventing sung words.

## Write for a voice, not a page

- Preserve a consistent narrator and vocabulary.
- Favor concrete imagery and actions over exposition or generic declarations.
- Build the chorus around one central, easy-to-pronounce title or hook phrase, usually introduced early and repeated without excessive variation.
- Avoid generic AI-sounding turns of phrase, stock imagery, prefab poetic contrasts, and vague emotional filler. Prefer concrete wording that only this narrator, situation, or fictional world would plausibly use.
- Make verses carry detail and progression; make the chorus distill the central idea into the strongest hook.
- Keep line lengths, syllable density, and natural word stress reasonably consistent across corresponding lines unless a deliberate break creates impact.
- Leave room for breaths, held notes, rests, and production moments.
- Use rhyme to support meaning. Replace forced rhymes, filler, and inverted syntax.
- Prefer singable consonant clusters and open vowels on sustained notes.
- Repeat hooks intentionally, then use small lyrical or production changes to make later repetitions escalate.
- Match the user's language, profanity level, and desired directness.

When revising supplied lyrics, preserve the intended meaning and strongest original ideas while freely repairing cadence, structure, imagery, and weak lines. Avoid direct references to the creation process or medium unless the user wants a self-aware song.

## Calibrate the persona

Express attitude through word choice, sentence length, pauses, restraint, and contrast rather than repeatedly naming the emotion. For example, an unfazed narrator should observe consequences plainly while the scale of the surrounding production communicates danger. An unstable edge is often more effective as one dissonant image, abrupt aside, whispered double, or restrained laugh than constant theatrical menace.

Keep vocal instructions actionable: `close-miked`, `clipped`, `breathy`, `deadpan`, `controlled belt`, `sing-song`, `spoken-sung`, or `layered whisper` are more useful than abstract character labels alone.

## Revise from generation feedback

Translate reported problems into targeted changes:

- Rushed lyrics: reduce syllable density and add rests or instrumental gaps.
- Weak chorus: simplify its language, strengthen the title phrase, widen the arrangement, and create clearer register or rhythmic contrast.
- Muddy output: reduce competing layers and request controlled low end, crisp transients, clear separation, and a centered intelligible vocal.
- Overacted vocal: request restrained, intimate, close-miked delivery and exclude shouting, operatic belting, or theatrical narration.
- Inconsistent genre: lead with one core identity and remove contradictory tags.
- Flat arrangement: specify section-by-section additions, dropouts, harmonic lift, and a decisive ending.
- Excessive drum fills: request a locked pocket, fills only at major transitions, short one-beat pickups at most, and silence beneath key vocal phrases; exclude repeated tom runs, constant cymbal crashes, and fills every four or eight bars. Relax these constraints only when the genre or user explicitly needs prominent, expressive drumming.

Change the smallest set of variables needed so a successful generation remains reproducible.

## Check before delivering

Confirm that:

- The Suno prompts contain no artist or band names.
- The complete Suno style prompt is no more than 1000 characters, including spaces.
- The style prompt is concise and contains only the main elements that differentiate this specific song.
- The style and negative prompts do not contradict each other.
- The negative prompt uses direct exclusions without redundant `no`, `avoid`, or `without` prefixes.
- Drum direction favors a stable groove and restrained transition fills unless expressive drumming is intentional.
- The song has one clear emotional and musical identity.
- The lyrics are original, singable, and faithful to the requested meaning.
- The lyrics avoid generic AI-sounding phrasing and use narrator- and situation-specific language.
- The hook is memorable without relying on a borrowed phrase.
- Section labels and parenthetical directions are valid and concise.
- Meta language appears only when intentionally requested.
- Every deliverable is separated and ready to copy.
