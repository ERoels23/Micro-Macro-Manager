# Micro Macro Manager

A lightweight floating macro panel for idle games, browser games, and any repetitive browser task. Enable it per-site from the extension popup and a draggable overlay appears on the page — no page reload required after the first activation.

---
<img width="2000" height="1379" alt="MMMScreenshot4" src="https://github.com/user-attachments/assets/109548e9-8041-4e94-a068-d6a150bd17c2" />
<img width="1999" height="1378" alt="MMMScreenshot2" src="https://github.com/user-attachments/assets/3a04aa62-5879-4ebe-8407-f5301e89863f" />
<img width="288" height="568" alt="MMMScreenshot3" src="https://github.com/user-attachments/assets/9481b920-1001-48ef-81bc-7525f84525d9" />

## Features

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

- A numbered **green outline box** is drawn around CSS targets on the page and updates position automatically if the element moves or resizes.
- Both types support **Hold mode**, **interval**, **max activations**, and **time limit** (same as keystroke macros).

---

### Profiles
Up to 24 named **Profiles** in the Profiles panel. Profiles save and restore the entire state of the Keystrokes and Clickers panels independently.

- Switch profiles with one click — active macros stop before the swap.

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

### Per-Site Settings (Extension Popup)

Open the extension popup to configure settings for the current site:

| Setting | Description |
|---|---|
| Site toggle | Enable or disable the macro panel on this hostname |
| Show panels | Hide the panels | 
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

## Screenshots
Screenshots taken from Antimatter Dimensions (https://ivark.github.io/AntimatterDimensions/) and Factor Num Up (https://aarextiaokhiao.github.io/Factor-Num-Up/)

---

## License

MIT
