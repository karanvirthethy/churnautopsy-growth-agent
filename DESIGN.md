---
name: ChurnAutopsy Growth Workspace
description: Responsive dark dashboard for deliberate single-owner lead research.
colors:
  primary: "#b8e899"
  primary-hover: "#c9f4ac"
  primary-ink: "#1c2b17"
  workspace: "#111614"
  sidebar: "#151b17"
  surface: "#1a211c"
  border: "#303b32"
  text: "#e8ede8"
  secondary-text: "#a5b2a9"
  muted-text: "#9aa89e"
  caution: "#dfc58f"
  error-surface: "#382720"
  error-text: "#ffd0bb"
typography:
  headline:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "clamp(25px, 2.4vw, 36px)"
    fontWeight: 600
    lineHeight: 1.23
    letterSpacing: "-1px"
  title:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "16px"
    fontWeight: 600
    letterSpacing: "-0.3px"
  body:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "14px"
  action:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "12px"
    fontWeight: 750
rounded:
  control: "5px"
  primary: "6px"
  navigation: "7px"
  table: "9px"
  panel: "10px"
spacing:
  compact: "8px"
  control: "12px"
  inset: "20px"
  section: "24px"
  desktop-gutter: "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.primary}"
    typography: "{typography.action}"
    padding: "12px 17px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "21px 22px"
---

# Design System: ChurnAutopsy Growth Workspace

## Overview

Operate mode: compact, calm, evidence-led review. The pinned direction is a responsive charcoal dashboard with a green action accent and self-hosted Manrope. Preserve the existing visual system and deliberate human decisions.

This is a code-led system captured from `src/styles.css` and `src/App.tsx`, not an approved composition. No creative metaphor is established. Launcher and detector tooling were unavailable; visual review is tracked separately from these implementation facts.

## Colors

Primary green marks actions, positive status, high fit scores, selection, and focus. Charcoal workspace, sidebar, and raised surfaces establish structure; pale text and muted supporting text establish hierarchy. Caution amber distinguishes uncertain evidence. Errors use the warm error surface and text tokens. Status always includes words or an icon as well as color.

## Typography

Manrope Variable is self-hosted through the build with a sans-serif fallback. Headline and title tokens define the shared hierarchy; section headings increase to 20px. Supporting paragraphs use 11–13px with a 1.7 line height. Table text is 12px and headers 10px. Scores and overview counts use tabular numerals; desktop counts are 42px at weight 500. Lucide supplies line icons.

## Layout

Desktop uses a fixed 232px sidebar, matching content offset, 78px topbar, and a centered main container capped at 1500px with 44px 40px 24px padding. Overview counts form three equal columns; settings use a 1.2fr / 1fr grid.

At widths up to 1200px, the sidebar and offset become 205px and main padding becomes 30px 24px. At widths up to 800px, navigation becomes a horizontally scrollable row, the sidebar returns to normal flow, the offset disappears, the topbar is 52px, and main padding becomes 28px 20px 20px. Headings wrap, search becomes full width, settings become one column, and visible navigation/table hints explain horizontal scrolling. The table retains a 700px minimum width inside its own scroll container; the page must not overflow. Review action targets have a 36px minimum height and width on mobile.

At widths from 1600px, main top padding becomes 56px and table rows gain 24px vertical padding.

## Elevation & Depth

No shadows are implemented. Tonal surface changes and thin borders distinguish groups. Preserve this flat, restrained treatment.

## Shapes

Controls use modest curves; primary actions and navigation use their dedicated radius tokens. Table and larger panels use broader corners. Borders are 1px. Company initials occupy 36px squares with 8px corners; the owner avatar is circular.

## Components

Primary actions use green with dark text and a lighter hover. Review buttons use dark green surfaces and a lighter hover. Disabled buttons use 0.45 opacity and a wait cursor; busy actions update their label. Buttons and links transition background and color over 0.16s ease. Reduced-motion preference disables transitions and smooth scrolling.

Keyboard focus uses a 2px green outline with 4px offset. Search exposes the same ring on its wrapper through focus-within with a 3px offset; the focusable table container also uses a 3px offset. Search remains visibly labeled for assistive technology.

Navigation uses subdued text, a dark hover surface, and a green-tinted active surface with `aria-current`. Filter buttons expose pressed state. Target chips have quiet borders and no implied action. Panels use tonal separation and restrained padding.

Discovery remains a semantic table. Scores expand in place to reveal reasons. Saved/rejected rows replace review controls with status and a reversible return-to-review action. Loading and completion use status announcements; errors expose an alert and retry action; empty results explain the absence of rows. Demo disclosure and future-state pages clearly describe availability.

## Do's and Don'ts

- Do preserve contained table scrolling and visible mobile scroll hints.
- Do expose keyboard focus, accessible labels, and reduced-motion behavior.
- Do keep uncertainty, missing data, and reversible review decisions visible.
- Don't add decorative charts, gradients, remote company logos, or unverified business claims.
- Don't imply future outreach capabilities are available.
