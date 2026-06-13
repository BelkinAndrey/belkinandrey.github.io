# Homepage Redesign Design

## Goal

Make the GitHub Pages homepage feel more polished, technical, and memorable while keeping it a simple static portfolio for projects and social links.

The redesign should preserve all current project and social destinations, but replace the plain centered layout with a colder, denser "neural dashboard" presentation.

## Visual Direction

Use a dark cyan/teal/blue palette:

- Deep near-black background.
- Cyan, teal, and blue activation highlights.
- No pink or warm accent stripe.
- Glassy dark project surfaces with subtle borders.
- Clear typography and readable contrast over the animated background.

The page should feel like a compact neural-systems dashboard rather than a marketing landing page.

## Background Animation

The background implies a regular tiled grid without drawing grid lines.

Square cells should appear on fixed tile positions across the whole viewport. The visible effect is sparse activation:

- Cells appear in randomized positions across the full field.
- Each activation has a fast bloom, a short bright peak, and a smooth quick fade-out.
- The animation should feel closer to the previously approved "Signal Bursts" density, but smoother and less repetitive.
- A small pool of DOM elements can be reused to avoid creating unbounded nodes.
- The background must stay behind all content and never block interactions.

When `prefers-reduced-motion` is enabled, the page should keep a static dark background with a few soft square highlights and no continuous animation.

## Page Composition

Use the approved "Neural Dashboard" composition.

Desktop layout:

- Left compact identity panel.
- Right project area.
- Social links live in or near the identity panel.
- Projects are immediately visible without needing to scroll on normal desktop heights.

Mobile layout:

- Stack into a single column.
- Identity panel appears first.
- Projects remain easy to scan.
- Social links remain tappable and do not crowd the title.

## Content

Keep the current content and links:

- Name: Andrey Belkin.
- Tagline: Neural networks, spiking agents and experiments.
- Projects:
  - Spiking Bug -> `bug_web/index.html`.
  - cogFlux -> `tonic/index.html`.
  - cogFlux - Spike -> `spike/index.html`.
- Preview images keep current GIF-first with SVG fallback behavior.
- Social links keep current destinations and labels.

Small text refinements are allowed if they improve scanability, but the redesign should not add explanatory onboarding text or feature descriptions unrelated to the portfolio.

## Implementation Shape

Keep the site static:

- `index.html` for structure.
- `styles.css` for layout and visual styling.
- A small inline or local vanilla JavaScript block for the sparse background field.

No build step, framework, or external runtime should be introduced.

## Interaction States

Project cards should have polished hover/focus states:

- Slight lift or glow.
- Border accent in the cyan/teal range.
- Keyboard focus visible.

Social icons should keep familiar brand hover colors where useful, but their default state should match the dashboard style.

## Verification

Before calling the implementation complete:

- Open the page locally.
- Check desktop and mobile viewport layouts.
- Confirm the animated background is visible, smooth, sparse, and not obviously repeating the same few squares.
- Confirm reduced-motion behavior.
- Confirm all project links and social links still point to the existing destinations.
- Confirm no text overlaps or becomes unreadable on narrow screens.
