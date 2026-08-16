---
name: prism
description: "Research a topic with Explore, then transform the evidence into a polished, fully portable HTML report. Use only when the user explicitly names and requests this skill."
---

# Prism

Turn broad research into a clear, compelling, self-contained HTML report. Research comes from Explore; Prism owns the report's narrative, visual design, construction, and final verification.

## 1. Frame the report

Extract the topic, audience, decisions or questions the report should support, desired depth, and requested output location. Ask only when a missing answer would materially change the research or presentation. Otherwise state a reasonable assumption and proceed.

Default the output to `.reports/<topic-slug>-prism.html` in the current working directory, creating `.reports/` when needed. Never overwrite an existing file unless the user authorizes it.

## 2. Research with Explore

Launch a read-only child task whose first token is `/skill:explore`. The task brief must include the topic, audience, research questions, constraints, freshness requirements, and the evidence the final report needs. Do not paraphrase or duplicate Explore's orchestration rules; [Explore](../explore/SKILL.md) owns that contract.

Require the Explore handoff to provide a synthesized answer, decisive evidence with citations, material disagreements or uncertainty, and a source list suitable for publication. Do not ask for raw scout transcripts. Wait for the completed handoff before authoring the report.

Personally verify any source or claim that carries the report's main conclusion. Never turn weak or conflicting evidence into false certainty.

## 3. Design the story before the page

Choose a narrative and visual system suited to the subject rather than filling a generic dashboard template. Prioritize:

- an immediate statement of the topic, purpose, and key conclusion
- an executive summary and scannable key findings
- a logical progression from context and evidence to implications
- meaningful comparisons, timelines, diagrams, charts, or tables where they improve understanding
- explicit distinctions between facts, interpretation, and unresolved questions
- concise methodology, limitations, and sources

Keep detail proportional to the research. Use progressive disclosure such as appendices or `<details>` for supporting material instead of making the main story dense.

## 4. Build one portable HTML file

Write one complete HTML5 file containing everything needed to render the report:

- Embed all CSS, JavaScript, fonts, icons, images, data, and visualizations.
- Make no runtime network requests and use no CDN, remote asset, analytics, iframe, or required companion file.
- External source links are allowed, but the report must remain complete and readable when offline.
- Libraries such as D3 may be used only when their required code is bundled into the HTML. Preserve applicable license notices. Prefer native HTML, CSS, and inline SVG when a library does not materially improve the result.
- If JavaScript is used, keep the core narrative readable without it and show a useful fallback for interactive visuals.

Aim for publication-quality presentation:

- strong editorial hierarchy, balanced spacing, restrained color, and intentional typography
- responsive layouts that work on narrow and wide screens without horizontal page overflow
- semantic landmarks, keyboard-accessible controls, visible focus states, sufficient contrast, and reduced-motion support
- print styles that produce a clean document and preserve source URLs where practical
- inline SVG charts with labels, units, legends, and accessible text alternatives
- citations linked from claims to a numbered source list

Do not invent decorative metrics, charts, quotes, or precision. Every visualized value must be traceable to the researched evidence.

## 5. Verify the artifact

Before delivery:

1. Open the HTML in a real browser and inspect it at both desktop and narrow viewport sizes.
2. Confirm there are no missing assets, unintended external requests, console errors, broken anchors, clipped content, or unreadable print output.
3. Check that major claims and visualized values map to citations and that uncertainty is represented honestly.
4. Confirm the file is standalone by opening it from its final location without relying on a local server.
5. Correct presentation and factual defects, then recheck the affected views.

Return the exact report path, a one-sentence description, and any material evidence limitation. Do not paste the report's full contents into chat.
