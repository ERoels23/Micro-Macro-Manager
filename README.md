# Micro Macro Manager

A lightweight floating macro panel for idle games, browser games, and any repetitive browser task. Enable it per-site from the extension popup and a draggable overlay appears on the page — no page reload required after the first activation.

---

## Features

### Auto-Click & Auto-M
Two always-available fixed macros sit at the top of the panel:

- **Auto-Click** — repeatedly fires a left-click at the current mouse position at a configurable interval.
- **Auto-M** — repeatedly presses the `M` key. Auto-M also supports **Hold mode** (holds the key down continuously rather than tapping it repeatedly).

Both have an optional **time limit**: the macro stops automatically after N minutes.

---

### Custom Keystroke Macros
Up to 24 custom keystroke slots in the **Keystrokes** panel. Each slot can:

- Press any sequence of alphanumeric keys on each activation (e.g. `be` presses B then E).
- Run in **Hold mode** — holds the keys down continuously instead of tapping (keys are released in reverse order on stop).
- Set an **interval** (in seconds, decimal precision).
- Set a **max activations** limit — the macro deactivates after firing N times.
- Set a **time limit** — the macro deactivates after N minutes.
- Display a **live counter**: activation count, remaining activations, or elapsed/remaining time depending on what limits are set.

---

### Clicker Macros
Up to 24 clicker slots in the **Clickers** panel. Two types:

#### (X,Y) Coordinate Clicker
Click a **+&nbsp;(X,Y)** button, then click anywhere on the page to capture the target coordinates. The macro fires a synthetic click at those coordinates on each activation.

#### CSS Element Clicker
Click a **+ CSS** button, then hover over elements on the page — they highlight as your cursor moves — and click to select. The macro fires a click at the center of that element on each activation.

- A numbered **green outline box** is drawn around CSS targets on the page and updates position automatically (at most once per second) if the element moves or resizes.
- Target outlines are hidden when the element scrolls off-screen.
- CSS clickers support custom **display labels** (rename from the edit menu).
- Both types support **Hold mode**, **interval**, **max activations**, and **time limit** (same as keystroke macros).

---

### Profiles
Up to 24 named **Profiles** in the collapsible Profiles panel. Profiles save and restore the entire state of the Keystrokes and Clickers panels independently.

- Switch profiles with one click — active macros stop before the swap.
- Rename a profile by double-clicking its name or using the edit (✎) button.
- Delete profiles (the first profile cannot be deleted; at least one must always exist).
- The active profile is highlighted green.

---

### Pause All
A **Pause All** button at the bottom of the main panel pauses every active macro simultaneously. Macros resume from where they left off when unpaused.

A configurable **pause key** (default: `F9`) can be set per-site in the extension popup — press it anywhere on the page to toggle pause without opening the menu.

---

### Enable All / Disable All
Two bulk-action buttons above Pause All:

- **Enable All** — activates every filled custom keystroke and clicker slot that isn't already running.
- **Disable All** — deactivates every macro on the page, including Auto-Click and Auto-M.

---

### Activation Counter
Each macro button displays a live counter in its right section. What it shows depends on context:

| Situation | Display |
|---|---|
| No limits set | Total activation count (e.g. `1.2K`, `4M`) |
| Max activations set | Remaining activations |
| Time limit set | Countdown (`M:SS`, or `H:MM` past one hour) |
| Hold mode, no limit | Elapsed hold time (`M:SS`, or `H:MM` past ten minutes) |
| Hold mode + time limit | Countdown |

The counter can be disabled site-wide from the extension popup.

---

### Panel UI

- **Draggable** — grab the `MicroMacroManager` title bar and drag the entire panel anywhere on the page. Position is saved per-site.
- **Viewport-clamped** — the panel cannot be dragged fully off-screen.
- **Collapsible side panels** — the Keystrokes, Clickers, and Profiles panels each have a toggle checkbox in the header. The main panel (Auto-Click, Auto-M, Enable/Disable/Pause) is always visible.
- **Zoom** — scale the panel UI up or down (50%–200%) independently from the page's own zoom. Set from the extension popup.
- **Opacity** — adjust panel transparency from the extension popup.
- **Dark / Light mode** — toggle from the extension popup.

---

### Per-Site Settings (Extension Popup)

Open the extension popup to configure settings for the current site:

| Setting | Description |
|---|---|
| Site toggle | Enable or disable the macro panel on this hostname |
| Show panels | Hide the collapsible side panels (panel still shown, just collapsed) |
| Pause key | Keyboard shortcut to toggle Pause All (default: `F9`) |
| Activation counter | Show/hide the counter on macro buttons |
| Interval jitter | Add ±N% random variation to all macro intervals (default: 10%) |
| Light mode | Switch the panel to a light color theme |
| Opacity | Control overall panel transparency |
| Zoom | Scale the panel independently from page zoom |
| Export JSON | Download the full site state (all profiles, macros, settings) as a `.json` file |
| Import JSON | Load a previously exported `.json` file and reload the tab |
| Reset panel position | Return the panel to its default corner position |

---

### Whitelist Management
The popup lists every site where the extension is enabled. Remove a site from the list with the ✕ button — this immediately disables the panel on that tab.

---

## Installation

The extension is not yet published to a web store. To install manually:

### Chrome / Chromium / Brave
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this directory

### Firefox
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select the `manifest.json` file inside this directory

> **Note:** Temporary Firefox add-ons are removed on browser restart. For a persistent install, the extension needs to be signed via AMO.

---

## How It Works

- The content script (`content.js`) is injected into every page but does nothing until the site is added to the whitelist.
- All state (macros, profiles, settings, panel position) is stored in `chrome.storage.local` keyed by hostname.
- The whitelist of enabled sites is stored in `chrome.storage.sync` so it syncs across browser profiles.
- The popup communicates with the active tab via `chrome.tabs.sendMessage` to enable/disable the panel without requiring a page reload once the content script has run.

---

## License

MIT
