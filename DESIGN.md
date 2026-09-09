---
version: alpha
name: Ginder
description: A practical festival field guide that shifts from calm selection to live night-time coordination.
colors:
  field-paper: "#f3efe5"
  field-ink: "#22201e"
  field-muted: "#6e6861"
  field-line: "#cbc4b9"
  night-aubergine: "#211120"
  night-map: "#251225"
  panel-plum: "#351829"
  panel-form: "#2a1529"
  cream: "#f8e8d1"
  cream-dim: "#e5cdb6"
  campfire-orange: "#f36b17"
  campfire-orange-light: "#ff8d31"
  signal-cyan: "#1eb9bd"
  dusk-pink: "#da8eb8"
  deep-purple: "#61266c"
  live-green: "#63d98b"
  stale-brown: "#6b4438"
  danger-blush: "#ffbdbd"
typography:
  display:
    fontFamily: "ui-rounded, Arial Rounded MT Bold, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(52px, 16vw, 78px)"
    fontWeight: 900
    lineHeight: 0.9
    letterSpacing: "-0.065em"
  headline:
    fontFamily: "ui-rounded, Arial Rounded MT Bold, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(26px, 6vw, 42px)"
    fontWeight: 900
    lineHeight: 0.95
  title:
    fontFamily: "ui-rounded, Arial Rounded MT Bold, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "24px"
    fontWeight: 850
    lineHeight: 1
    letterSpacing: "-0.035em"
  body:
    fontFamily: "ui-rounded, Arial Rounded MT Bold, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
  control:
    fontFamily: "ui-rounded, Arial Rounded MT Bold, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 900
    lineHeight: 1
  telemetry:
    fontFamily: "ui-rounded, Arial Rounded MT Bold, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "10px"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0.14em"
rounded:
  compact: "10px"
  control: "12px"
  surface: "16px"
  map-card: "18px"
  pill: "999px"
spacing:
  micro: "4px"
  xs: "8px"
  sm: "10px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  button-directory:
    backgroundColor: "{colors.field-ink}"
    textColor: "{colors.field-paper}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "42px"
  button-primary:
    backgroundColor: "{colors.campfire-orange}"
    textColor: "{colors.night-aubergine}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "42px"
  button-secondary:
    backgroundColor: "rgba(30, 185, 189, .12)"
    textColor: "{colors.cream}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "42px"
  tab-active:
    backgroundColor: "{colors.signal-cyan}"
    textColor: "{colors.night-aubergine}"
    typography: "{typography.control}"
    rounded: "{rounded.compact}"
    height: "38px"
  card-operational:
    backgroundColor: "{colors.panel-plum}"
    textColor: "{colors.cream}"
    rounded: "{rounded.map-card}"
    padding: "0px"
  card-form:
    backgroundColor: "{colors.panel-form}"
    textColor: "{colors.cream}"
    rounded: "{rounded.surface}"
    padding: "16px"
  input-operational:
    backgroundColor: "#1c0f1c"
    textColor: "{colors.cream}"
    typography: "{typography.body}"
    rounded: "{rounded.compact}"
    padding: "11px 12px"
---

# Design System: Ginder

## Overview

**Creative North Star: "Festival Field Guide"**

Ginder behaves like a practical festival field guide with two deliberate registers. The public festival index is a calm paper page: warm, flat, editorial, and sparse. Once a visitor enters live festival work, the guide opens into a compact night-time instrument panel built from aubergine surfaces, cream text, bright signals, and the supplied festival artwork.

The system is practical, lively, and clear. Festival character comes from the rounded type, location-pin geometry, star-speckled atmosphere, and orange–cyan signal pair; it never outranks the map, the current state, or the next action. Density rises in operational views because the phone is a tool in motion, while setup uses larger grouped fields for deliberate administrative work.

**Key Characteristics:**

- A purposeful light-to-dark context switch rather than one blended theme.
- Rounded, heavy typography with compressed labels and decisive hierarchy.
- Warm festival neutrals anchored by orange actions and cyan selection states.
- Illustrated festival maps treated as primary product material, not decoration.
- Compact controls, safe-area-aware shells, and visible live/stale state changes.

## Colors

Two coordinated palettes serve different moments: warm paper and ink for choosing a festival, then aubergine, plum, and cream for live operation. Campfire Orange, Signal Cyan, and Dusk Pink carry meaning inside the night system; they are not decorative confetti.

### Primary

- **Campfire Orange** (`campfire-orange`, #f36b17): the main action, ownership, calibration target, and meeting-point signal. Its lighter partner (#ff8d31) is limited to the end of primary-action gradients.

### Secondary

- **Signal Cyan** (`signal-cyan`, #1eb9bd): active tabs, selected durations, map-layer indicators, focus borders, and informational emphasis.

### Tertiary

- **Dusk Pink** (`dusk-pink`, #da8eb8): a low-frequency structural accent for card borders and anchor points.
- **Live Green** (`live-green`, #63d98b): fresh presence, successful anchors, and positive live status.
- **Stale Brown** (`stale-brown`, #6b4438): aged presence and last-seen states; it must remain visibly different from Live Green beyond color alone.
- **Danger Blush** (`danger-blush`, #ffbdbd): destructive or error-adjacent text on night surfaces.

### Neutral

- **Field Paper** (`field-paper`, #f3efe5) and **Field Ink** (`field-ink`, #22201e): the light festival index background, wordmark, titles, and directory action.
- **Field Muted** (`field-muted`, #6e6861) and **Field Line** (`field-line`, #cbc4b9): light-mode metadata and horizontal division.
- **Night Aubergine** (`night-aubergine`, #211120) and **Night Map** (`night-map`, #251225): page and map foundations in operational contexts.
- **Plum Panel** (`panel-plum`, #351829) and **Form Plum** (`panel-form`, #2a1529): contained operational and setup surfaces.
- **Cream** (`cream`, #f8e8d1) and **Dim Cream** (`cream-dim`, #e5cdb6): primary and secondary text on night surfaces.
- **Deep Purple** (`deep-purple`, #61266c): avatar and low-emphasis identity fill.

### Named Rules

**The Context Switch Rule.** Field Paper and Field Ink own selection surfaces; Night Aubergine and Plum Panel own live tools. Do not merge them into a grey compromise.

**The Signal Color Rule.** Orange means action or owned attention, cyan means active selection or information, and green versus brown means freshness. Never swap these roles for variety.

## Typography

**Display Font:** the rounded system stack, preferring `ui-rounded` and Arial Rounded MT Bold.
**Body Font:** the same rounded system stack for a single, friendly voice.
**Label/Mono Font:** the rounded system stack for telemetry; the platform monospace stack appears only in timetable data entry.

**Character:** One weight-rich rounded family carries both warmth and urgency. Oversized, tightly tracked display type gives the simple Ginder wordmark authority; small bold labels keep live controls readable at a glance.

### Hierarchy

- **Display** (900, fluid 52–78px, 0.9 line-height): the Ginder wordmark on the festival index only.
- **Headline** (900, fluid 26–42px, 0.95 line-height): setup and major page headings.
- **Title** (850, 24px, 1 line-height): festival names and primary section identity.
- **Body** (400, 12px, 1.45 line-height): helper text, notices, and operational explanation.
- **Control** (900, 13px, 1 line-height): main buttons and segmented tabs.
- **Telemetry** (900, 10px, 0.14em tracking): kickers, live state, stage-like labels, and compact map metadata.

### Named Rules

**The One Rounded Voice Rule.** Do not introduce a fashionable display face or generic geometric sans; hierarchy comes from scale, weight, and tracking within the existing rounded system stack.

**The Glance Rule.** Operational labels stay short and bold. Explanations use body text outside the control rather than shrinking a long sentence into it.

## Layout

Ginder uses centered, fixed-max-width shells that become edge-efficient on phones. The light festival index is a single 520px column centered vertically. The live map shell is capped at 760px and lets the map dominate its height (`clamp(360px, 57svh, 610px)`), while its location controls sit in a fixed bottom dock above Telegram and browser safe areas. Administrative setup expands to 920px with a two-column field grid that collapses below 620px.

The rhythm uses a 4px micro-step with most gaps and padding landing between 8px and 20px. Content-safe-area and viewport-safe-area values are structural inputs, not optional polish. At 420px, the map dock simplifies and stacked actions gain width; at 620px, setup fields become single-column; at 720px, operational shells gain lateral breathing room and a taller map allowance.

**The Map-First Rule.** In live operation, the festival artwork and people layer receive the largest continuous region. Controls wrap around the map rather than pushing it below an explanatory dashboard.

## Elevation & Depth

Elevation is contextually layered. The light index remains flat and uses whitespace plus hairline dividers. Dark operational views use tonal layering, translucent borders, selective backdrop blur, and soft ambient shadows so controls remain legible over map material without becoming glossy cards everywhere.

### Shadow Vocabulary

- **Operational card** (`0 14px 34px rgba(0,0,0,.24)`): low ambient separation for map and admin cards.
- **Floating dock** (`0 14px 38px rgba(0,0,0,.48)`): strongest elevation, reserved for the fixed location-sharing dock.
- **Map micro-control** (`0 6px 18px rgba(0,0,0,.32)`): compact controls floating directly over the map.
- **Primary action warmth** (`0 8px 20px rgba(243,107,23,.17)`): a restrained orange halo under the night-mode primary button.

### Named Rules

**The Contextual Lift Rule.** Light directory surfaces are flat; blur and shadow appear only where a night-time control must separate from live map content.

## Shapes

The form language is soft but compact. Operational cards use 16–18px corners, controls and fields use 10–12px corners, and temporary state capsules use full pills. People, anchors, status dots, and the Ginder pin use circular geometry; the pin's rotated teardrop is the only intentionally asymmetric brand silhouette.

Borders are thin, translucent, and tinted by their surface. Map and card containers clip their contents; markers and labels may escape locally to remain readable. Avoid mixing sharp rectangular controls into an otherwise rounded control group.

## Components

### Buttons

- **Shape:** sturdy rounded rectangles (12px) for operational actions and full pills for the light directory action.
- **Primary:** Campfire Orange with a small lighter-orange gradient in live views, Night Aubergine text, 42px minimum height, and heavy control type.
- **Active / Disabled:** pressed actions move down by 1px where implemented; disabled actions reduce opacity to roughly 42–48% and keep their shape.
- **Secondary:** translucent Signal Cyan fill, cyan-tinted border, and Cream text.
- **Danger / Stop:** transparent or lightly red-tinted treatment with Danger Blush text; destructive actions never borrow the primary orange fill.

### Chips

- **Style:** segmented room tabs sit in a dark inset rail with 10px inner corners; the active option fills with Signal Cyan and switches to Night Aubergine text.
- **State:** inactive options are transparent with Dim Cream text; disabled options fade without losing their label.
- **Status pills:** live state pairs a text label with a colored dot and glow; color is reinforced by the written `live` or `offline` state.

### Cards / Containers

- **Corner Style:** 18px for map cards, 16px for setup and dock surfaces.
- **Background:** operational cards use a Plum Panel to darker-aubergine gradient; setup cards use a solid Form Plum.
- **Shadow Strategy:** map cards receive low ambient shadow; the fixed dock receives the strongest shadow and blur.
- **Border:** one-pixel Dusk Pink or Cream tint at low opacity.
- **Internal Padding:** 16px for setup cards; map cards place padding only in their header and control zones so the artwork stays edge-to-edge.

### Inputs / Fields

- **Style:** dark inset fill, one-pixel warm translucent border, 10px corners, and 11px by 12px internal padding.
- **Focus:** border shifts to Campfire Orange in setup and Signal Cyan in live-map administration.
- **Error / Disabled:** errors use blush text and a translucent red surface; disabled controls preserve layout and reduce opacity.
- **Data entry:** bulk timetable input alone uses the platform monospace stack to preserve row structure.

### Navigation

The public index is a direct festival row with a trailing pill action, not a persistent app bar. The live map uses a compact header followed by a two-option room selector. Mobile layouts stack the directory action and simplify the bottom dock rather than introducing a hamburger menu.

### Live Presence Marker

The signature marker is a 34px circular avatar or initial disc with an outer border, a separate live/stale presence dot, and an optional pill label. Fresh markers use green plus glow; stale markers shift to brown, lose glow, and reduce saturation and brightness. The user's own position gains an orange ownership ring, while meet and tent markers use distinct icon silhouettes and labels.

### Location Control Dock

The fixed dock is the primary mobile action surface. It spans nearly the available width, respects Telegram's bottom safe area, uses a 16px translucent plum container with 18px blur, and keeps the location action visually dominant over duration, live-update, and stop controls.

## Do's and Don'ts

### Do:

- **Do** preserve the explicit light index / dark operation split when adding a surface; choose its context instead of averaging both palettes.
- **Do** keep the illustrated festival map visually dominant and align interface chrome around it.
- **Do** use Campfire Orange, Signal Cyan, Live Green, and Stale Brown according to their established meanings.
- **Do** use short Dutch labels, heavy control type, and safe-area-aware mobile spacing.
- **Do** pair color state with text, shape, glow, saturation, or another non-color cue.

### Don't:

- **Don't** turn the light festival index into a stack of floating dark cards or add night-mode gradients to its Field Paper canvas.
- **Don't** cover the festival map with explanatory panels when a compact badge, tooltip, or dock can carry the state.
- **Don't** use orange, cyan, green, and brown interchangeably for decorative variety.
- **Don't** introduce unrelated fonts, sharp enterprise controls, or generic blue-and-white SaaS styling.
- **Don't** animate attention states without a reduced-motion fallback.
