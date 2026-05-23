// content.js — Macro Menu Extension
// Runs on every page; only initializes the menu if the site is whitelisted.

(function () {
    'use strict';

    // =============================================
    //  Pure helpers — no DOM or storage deps
    // =============================================

    function formatCount(n) {
        if (n < 1000)    return String(n);
        if (n < 10000)   return (Math.floor(n / 100) / 10).toFixed(1) + 'K';
        if (n < 1000000) return Math.floor(n / 1000) + 'K';
        return (Math.floor(n / 100000) / 10).toFixed(1) + 'M';
    }

    function buildSelector(el) {
        if (el.id) return '#' + CSS.escape(el.id);
        const parts = [];
        let cur = el;
        while (cur && cur !== document.documentElement) {
            let seg = cur.tagName.toLowerCase();
            if (cur.id) { parts.unshift('#' + CSS.escape(cur.id)); break; }
            const siblings = cur.parentElement
                ? Array.from(cur.parentElement.children).filter(c => c.tagName === cur.tagName)
                : [];
            if (siblings.length > 1) {
                const idx = siblings.indexOf(cur) + 1;
                seg += `:nth-of-type(${idx})`;
            }
            parts.unshift(seg);
            cur = cur.parentElement;
        }
        return parts.join(' > ');
    }

    function isAllowed(hostname, whitelist) {
        return whitelist.some(entry => {
            if (entry.startsWith('*.')) {
                const base = entry.slice(2);
                return hostname === base || hostname.endsWith('.' + base);
            }
            return hostname === entry || hostname === 'www.' + entry;
        });
    }

    function periodLabel(periodSec) {
        if (periodSec < 10) {
            const val = periodSec < 1
                ? Math.round(periodSec * 1000) / 1000
                : Math.round(periodSec * 10) / 10;
            return val + 's';
        }
        if (periodSec < 600) return Math.round(periodSec) + 's';
        return Math.round(periodSec / 60) + 'm';
    }

    function formatTimeRemain(sec) {
        if (sec <= 0) return '0:00';
        if (sec >= 3600) {
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            return h + ':' + String(m).padStart(2, '0');
        }
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return m + ':' + String(s).padStart(2, '0');
    }

    // --- Shared styles ---
    const PANEL_STYLE = `
        background: rgba(18, 18, 22, 0.6);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 5px;
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        width: 260px;
        box-sizing: border-box;
        overflow: hidden;
    `;
    const BTN_STYLE = `
        color: rgba(220, 220, 220, 0.92);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 5px;
        padding: 4px 10px;
        cursor: pointer;
        font-family: monospace;
        font-size: 12px;
        width: 100%;
        text-align: left;
        transition: background 0.15s;
        box-sizing: border-box;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    `;
    const INPUT_STYLE = `
        background: rgba(30,30,35,0.85);
        border: 1px solid rgba(255,255,255,0.18);
        border-radius: 4px;
        color: rgba(220,220,220,0.92);
        font-family: monospace;
        font-size: 12px;
        padding: 3px 6px;
        width: 100%;
        box-sizing: border-box;
        outline: none;
    `;
    const SAVE_BTN_STYLE = `
        background: rgba(60, 120, 80, 0.6);
        color: rgba(220,220,220,0.92);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 4px;
        padding: 3px 8px;
        cursor: pointer;
        font-family: monospace;
        font-size: 12px;
        flex: 1;
    `;
    const CANCEL_BTN_STYLE = `
        background: rgba(70,40,40,0.5);
        color: rgba(210,190,190,0.8);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 4px;
        padding: 3px 6px;
        cursor: pointer;
        font-family: monospace;
        font-size: 12px;
    `;

    function setButtonOn(btn) {
        btn.setAttribute('data-btn-on', '');
        btn.style.background = 'rgba(80, 180, 100, 0.45)';
    }
    function setButtonOff(btn) {
        btn.removeAttribute('data-btn-on');
        btn.style.background = 'rgba(50, 50, 55, 0.55)';
        if (btn._counterSpan) btn._counterSpan.textContent = '';
    }
    function setButtonPending(btn) {
        btn.setAttribute('data-btn-on', '');
        btn.style.background = 'rgba(190, 120, 30, 0.5)';
    }

    function setupBtnSections(btn, labelText, periodText) {
        btn.style.display    = 'flex';
        btn.style.alignItems = 'center';
        btn.style.textAlign  = '';
        btn.style.whiteSpace = '';

        const lbl = document.createElement('span');
        lbl.style.cssText = 'flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left;';
        lbl.textContent = labelText;

        const per = document.createElement('span');
        per.setAttribute('data-mmm-secondary', '');
        per.style.cssText = 'flex: 0 0 36px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; color: rgba(160,160,180,0.6); font-size: 11px;';
        per.textContent = periodText;

        const ctr = document.createElement('span');
        ctr.setAttribute('data-mmm-secondary', '');
        ctr.style.cssText = 'flex: 0 0 36px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; color: rgba(160,160,180,0.6); font-size: 11px;';

        btn.appendChild(lbl);
        btn.appendChild(per);
        btn.appendChild(ctr);
        btn._labelSpan   = lbl;
        btn._periodSpan  = per;
        btn._counterSpan = ctr;
    }

    function makePanelHeader(text) {
        const h = document.createElement('div');
        h.textContent = text;
        h.setAttribute('data-mmm-header', '');
        h.style.cssText = `
            color: rgba(180,180,200,0.5);
            font-size: 10px;
            text-align: center;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            padding-bottom: 2px;
            border-bottom: 1px solid rgba(255,255,255,0.07);
        `;
        return h;
    }

    function makeSideBtn(text, title, bgColor) {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.title = title;
        btn.style.cssText = `
            background: ${bgColor};
            color: rgba(220,200,200,0.9);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 5px;
            padding: 4px 5px;
            cursor: pointer;
            font-size: 13px;
            line-height: 1;
            flex-shrink: 0;
        `;
        return btn;
    }

    function makeErrorRow(onTrash) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; gap: 4px; width: 100%;';
        const errBtn = document.createElement('button');
        errBtn.textContent = 'SYNTAX ERROR';
        errBtn.disabled = true;
        errBtn.style.cssText = BTN_STYLE + `
            flex: 1; min-width: 0;
            background: rgba(160,40,40,0.45);
            color: rgba(255,160,160,0.9);
            cursor: not-allowed;
            border-color: rgba(220,80,80,0.4);
        `;
        const trashBtn = makeSideBtn('🗑', 'Clear', 'rgba(160,50,50,0.4)');
        trashBtn.addEventListener('click', e => { e.stopPropagation(); onTrash(); });
        row.appendChild(errBtn);
        row.appendChild(trashBtn);
        return row;
    }

    // =============================================
    //  Enable / disable state
    // =============================================
    let menuInitialized = false;
    let menuRoot = null; // wrapper element — held here so disable can remove it
    const teardownFns = [];
    let listenersRegistered = false;
    let siteSettings = { pauseKey: 'F9', counterEnabled: true, jitterEnabled: true, jitterPct: 10, panelPos: null,
        fixedMacros: { click: { periodMs: 100, holdMode: false, timeLimitSec: null }, keyM: { periodMs: 100, holdMode: false, timeLimitSec: null } } };
    let refreshAllMacroDisplaysFn = null; // set by initMenu; called when settings change
    let setPanelsVisibleFn = null;        // set by initMenu; called from popup message
    let resetPanelPosFn   = null;        // set by initMenu; called from popup message
    const stateKey = `state:${location.hostname}`;

    // This listener is always active on every page, even non-whitelisted ones.
    // The popup sends messages here to toggle the menu without a page reload.
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg.type === 'get-status') {
            sendResponse({ active: menuInitialized });
        } else if (msg.type === 'enable') {
            if (!menuInitialized) initMenu();
            sendResponse({ ok: true });
        } else if (msg.type === 'disable') {
            if (menuRoot) { menuRoot.remove(); menuRoot = null; }
            menuInitialized = false;
            teardownFns.splice(0).forEach(fn => fn());
            sendResponse({ ok: true });
        } else if (msg.type === 'set-panels-visible') {
            if (menuInitialized && setPanelsVisibleFn) setPanelsVisibleFn(msg.visible);
            sendResponse({ ok: true });
        } else if (msg.type === 'reset-panel-pos') {
            if (menuInitialized && resetPanelPosFn) resetPanelPosFn();
            sendResponse({ ok: true });
        }
        return false;
    });

    // On every page load, check whether this site is whitelisted.
    chrome.storage.sync.get({ whitelist: [] }, ({ whitelist }) => {
        if (isAllowed(location.hostname, whitelist)) initMenu();
    });

    // =============================================
    //  Menu — only runs on whitelisted pages
    // =============================================
    function initMenu() {
        if (menuInitialized) return;
        menuInitialized = true;

        const MAX_SLOTS     = 12;
        const INITIAL_SLOTS = 1;

        // --- Mouse tracking ---
        let mouseX = 0, mouseY = 0;
        const trackMouse = e => { mouseX = e.clientX; mouseY = e.clientY; };
        document.addEventListener('mousemove', trackMouse);
        teardownFns.push(() => document.removeEventListener('mousemove', trackMouse));

        // --- Drag state ---
        let isDragging   = false;
        let didDragMove  = false;
        let dragStartX   = 0, dragStartY   = 0;
        let wrapperStartLeft = 0, wrapperStartTop = 0;

        // --- Macro engine ---
        let globalPaused = false;
        let pauseBtn     = null; // assigned during fixed-panel construction
        const macros = {}; // name → { timer, active, pending, fn, btn, intervalMs }

        const MAX_PROFILES     = 12;
        const DEFAULT_PROFILES = () => [{ name: 'Profile 1', customSlots: Array(INITIAL_SLOTS).fill(null), clickerSlots: Array(INITIAL_SLOTS).fill(null) }];
        let profiles      = DEFAULT_PROFILES();
        let activeProfile = 0;

        if (!listenersRegistered) {
            listenersRegistered = true;

            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'local' || !changes[stateKey]) return;
                const s = changes[stateKey].newValue?.settings;
                if (s) {
                    Object.assign(siteSettings, s);
                    if (!siteSettings.pauseKey) siteSettings.pauseKey = 'F9';
                    if (refreshAllMacroDisplaysFn) refreshAllMacroDisplaysFn();
                    applyAppearance();
                }
            });

            document.addEventListener('keydown', e => {
                if (!menuInitialized) return;
                const t = e.target;
                if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
                if (e.key === siteSettings.pauseKey) {
                    e.preventDefault();
                    setPauseAll(!globalPaused);
                }
            }, true);
        }

        function updateMacroButtonDisplay(name, btn) {
            if (!btn || !macros[name]) return;
            const m = macros[name];
            let ctr;
            if (m.maxActivations) {
                ctr = String(m.maxActivations - m.count);
            } else if (m.timeLimitSec) {
                const remain = Math.max(0, m.timeLimitSec - Math.round((Date.now() - m.startTime) / 1000));
                ctr = formatTimeRemain(remain);
            } else if (m.holdMode && m.active) {
                const elapsed = Math.round((Date.now() - m.startTime) / 1000);
                if (elapsed < 600) {
                    const mins = Math.floor(elapsed / 60), secs = elapsed % 60;
                    ctr = mins + ':' + String(secs).padStart(2, '0');
                } else {
                    const h = Math.floor(elapsed / 3600), mins = Math.floor((elapsed % 3600) / 60);
                    ctr = h + ':' + String(mins).padStart(2, '0');
                }
            } else if (siteSettings.counterEnabled) {
                ctr = formatCount(m.count);
            } else {
                ctr = '';
            }
            if (btn._counterSpan) btn._counterSpan.textContent = ctr;
        }

        // Expose a refresh callback at IIFE scope so the onChanged listener can
        // immediately re-render all active/pending buttons when settings change.
        refreshAllMacroDisplaysFn = function () {
            for (const [name, m] of Object.entries(macros)) {
                if ((m.active || m.pending) && m.btn) updateMacroButtonDisplay(name, m.btn);
            }
        };

        function applyMacroCaps(name, maxActivations, timeLimitSec) {
            if (!macros[name]) return;
            const m = macros[name];
            m.maxActivations = maxActivations || null;
            m.timeLimitSec   = timeLimitSec   || null;
            if (m.holdMode && m.timeLimitSec && m.active) {
                clearInterval(m._displayInterval);
                m._displayInterval = null;
                m.timer = setTimeout(() => {
                    stopMacro(name);
                    if (m.btn) setButtonOff(m.btn);
                }, m.timeLimitSec * 1000);
                const capsIntId = setInterval(() => {
                    const cur = macros[name];
                    if (!cur?.active || cur._displayInterval !== capsIntId) { clearInterval(capsIntId); return; }
                    updateMacroButtonDisplay(name, cur.btn);
                }, 500);
                m._displayInterval = capsIntId;
            }
        }

        function scheduleMacro(name) {
            const m = macros[name];
            if (!m || !m.active || m.holdMode) return;
            const jitter = siteSettings.jitterEnabled
                ? 1 + (Math.random() * 2 - 1) * (siteSettings.jitterPct / 100)
                : 1;
            const delay = Math.max(50, Math.round(m.intervalMs * jitter));
            m.timer = setTimeout(() => {
                if (!m.active) return;
                m.fn();
                scheduleMacro(name);
            }, delay);
        }

        function startMacro(name, rawFn, btn, intervalMs, holdMode = false, holdStopFn = null) {
            if (macros[name]?.active) return;

            if (holdMode) {
                macros[name] = { timer: null, _displayInterval: null, active: false, pending: false,
                                 fn: null, rawFn, btn, intervalMs: 0, count: 0, startTime: Date.now(),
                                 maxActivations: null, timeLimitSec: null, holdMode: true, holdStopFn, name };
                if (globalPaused) {
                    macros[name].pending = true;
                    if (btn) setButtonPending(btn);
                } else {
                    macros[name].active = true;
                    try { rawFn(); } catch (e) {}
                    if (btn) setButtonOn(btn);
                    const holdIntId = setInterval(() => {
                        const m = macros[name];
                        if (!m?.active || m._displayInterval !== holdIntId) { clearInterval(holdIntId); return; }
                        updateMacroButtonDisplay(name, m.btn);
                    }, 500);
                    macros[name]._displayInterval = holdIntId;
                }
                return;
            }

            const fn = function () {
                rawFn();
                const m = macros[name];
                if (!m) return;
                m.count++;
                if (m.maxActivations !== null && m.count >= m.maxActivations) {
                    stopMacro(name);
                    if (btn) setButtonOff(btn);
                    return;
                }
                if (m.timeLimitSec !== null && (Date.now() - m.startTime) / 1000 >= m.timeLimitSec) {
                    stopMacro(name);
                    if (btn) setButtonOff(btn);
                    return;
                }
                updateMacroButtonDisplay(name, btn);
            };
            macros[name] = { timer: null, _displayInterval: null, active: false, pending: false, fn, rawFn, btn, intervalMs,
                             count: 0, startTime: Date.now(), maxActivations: null, timeLimitSec: null,
                             holdMode: false, holdStopFn: null, name };
            if (globalPaused) {
                macros[name].pending = true;
                if (btn) setButtonPending(btn);
            } else {
                macros[name].active = true;
                if (btn) setButtonOn(btn);
                scheduleMacro(name);
            }
        }
        function stopMacro(name) {
            if (!macros[name]) return;
            const m = macros[name];
            clearTimeout(m.timer);
            clearInterval(m._displayInterval);
            m.timer   = null;
            m._displayInterval = null;
            m.active  = false;
            m.pending = false;
            if (m.holdStopFn) { try { m.holdStopFn(); } catch (e) {} m.holdStopFn = null; }
        }
        function isMacroActive(name) {
            return macros[name]?.active ?? false;
        }
        function toggleMacro(name, fn, btn, intervalMs, opts = {}) {
            const m = macros[name];
            if (m?.active || m?.pending) {
                stopMacro(name); setButtonOff(btn);
            } else {
                const { holdMode = false, holdStopFn = null, maxActivations = null, timeLimitSec = null } = opts;
                startMacro(name, fn, btn, intervalMs, holdMode, holdStopFn);
                if (maxActivations || timeLimitSec) {
                    applyMacroCaps(name, maxActivations, timeLimitSec);
                    updateMacroButtonDisplay(name, btn);
                }
            }
        }
        function setPauseAll(paused) {
            globalPaused = paused;
            if (paused) {
                for (const m of Object.values(macros)) {
                    if (m.active) {
                        clearTimeout(m.timer);
                        clearInterval(m._displayInterval);
                        m.timer   = null;
                        m._displayInterval = null;
                        m.active  = false;
                        m.pending = true;
                        if (m.btn) setButtonPending(m.btn);
                    }
                }
            } else {
                for (const m of Object.values(macros)) {
                    if (m.pending) {
                        m.active    = true;
                        m.pending   = false;
                        m.startTime = Date.now();
                        if (m.btn) setButtonOn(m.btn);
                        if (m.holdMode) {
                            try { m.rawFn(); } catch (e) {}
                            const unpauseIntId = setInterval(() => {
                                const cur = macros[m.name];
                                if (!cur?.active || cur._displayInterval !== unpauseIntId) { clearInterval(unpauseIntId); return; }
                                updateMacroButtonDisplay(m.name, cur.btn);
                            }, 500);
                            m._displayInterval = unpauseIntId;
                            if (m.timeLimitSec) {
                                m.timer = setTimeout(() => {
                                    stopMacro(m.name);
                                    if (m.btn) setButtonOff(m.btn);
                                }, m.timeLimitSec * 1000);
                            }
                        } else {
                            scheduleMacro(m.name);
                        }
                    }
                }
            }
            if (pauseBtn) {
                if (paused) {
                    pauseBtn.setAttribute('data-btn-on', '');
                    pauseBtn.style.background = 'rgba(180, 50, 50, 0.6)';
                } else {
                    pauseBtn.removeAttribute('data-btn-on');
                    pauseBtn.style.background = 'rgba(50, 50, 55, 0.55)';
                }
            }
        }

        // --- Actions ---
        function dispatchClick(el, x, y) {
            if (!el || wrapper.contains(el)) return;
            const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
            el.dispatchEvent(new MouseEvent('mousedown', opts));
            el.dispatchEvent(new MouseEvent('mouseup',   opts));
            el.dispatchEvent(new MouseEvent('click',     opts));
        }
        function doClick() {
            dispatchClick(document.elementFromPoint(mouseX, mouseY), mouseX, mouseY);
        }
        function doClickAt(x, y) {
            dispatchClick(document.elementFromPoint(x, y), x, y);
        }
        function doKey(key) {
            const k = key.toLowerCase();
            const target = document.activeElement || document.body;
            const opts = {
                key: k, code: 'Key' + k.toUpperCase(),
                keyCode: k.toUpperCase().charCodeAt(0),
                which:   k.toUpperCase().charCodeAt(0),
                bubbles: true, cancelable: true,
            };
            target.dispatchEvent(new KeyboardEvent('keydown',  opts));
            target.dispatchEvent(new KeyboardEvent('keypress', opts));
            target.dispatchEvent(new KeyboardEvent('keyup',    opts));
        }

        function doHoldKeyStart(key) {
            const k = key.toLowerCase();
            const target = document.activeElement || document.body;
            const opts = { key: k, code: 'Key' + k.toUpperCase(), keyCode: k.toUpperCase().charCodeAt(0), which: k.toUpperCase().charCodeAt(0), bubbles: true, cancelable: true };
            target.dispatchEvent(new KeyboardEvent('keydown', opts));
        }
        function doHoldKeyStop(key) {
            const k = key.toLowerCase();
            const target = document.activeElement || document.body;
            const opts = { key: k, code: 'Key' + k.toUpperCase(), keyCode: k.toUpperCase().charCodeAt(0), which: k.toUpperCase().charCodeAt(0), bubbles: true, cancelable: true };
            target.dispatchEvent(new KeyboardEvent('keyup', opts));
        }

        let holdClickEl = null, holdClickX = 0, holdClickY = 0;
        function doHoldClickStart() {
            holdClickEl = document.elementFromPoint(mouseX, mouseY);
            holdClickX = mouseX; holdClickY = mouseY;
            if (!holdClickEl || wrapper.contains(holdClickEl)) return;
            holdClickEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: holdClickX, clientY: holdClickY, view: window }));
        }
        function doHoldClickStop() {
            if (!holdClickEl) return;
            holdClickEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: holdClickX, clientY: holdClickY, view: window }));
            holdClickEl.dispatchEvent(new MouseEvent('click',   { bubbles: true, cancelable: true, clientX: holdClickX, clientY: holdClickY, view: window }));
            holdClickEl = null;
        }

        function makeToggleButton(label, name, fn, intervalMs) {
            const btn = document.createElement('button');
            btn.style.cssText = BTN_STYLE;
            setupBtnSections(btn, label, periodLabel(intervalMs / 1000));
            setButtonOff(btn);
            btn.addEventListener('click', e => {
                e.stopPropagation();
                toggleMacro(name, fn, btn, intervalMs);
            });
            return btn;
        }

        // =============================================
        //  Theme style element
        // =============================================
        const themeStyleEl = document.createElement('style');
        document.documentElement.appendChild(themeStyleEl);
        teardownFns.push(() => themeStyleEl.remove());

        // =============================================
        //  Wrapper (outermost, fixed bottom-right)
        // =============================================
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-mmm', 'dark');
        wrapper.style.cssText = `
            position: fixed;
            bottom: 14px;
            right: 14px;
            z-index: 2147483647;
            font-family: monospace;
            font-size: 12px;
            user-select: none;
            display: flex;
            flex-direction: row;
            align-items: flex-end;
            gap: 5px;
        `;

        const toggleRow = document.createElement('div');
        toggleRow.style.cssText = `display: flex; align-items: center; gap: 5px;`;

        const checkLabel = document.createElement('span');
        checkLabel.title = 'Drag to move';
        checkLabel.setAttribute('data-mmm-drag', '');
        checkLabel.style.cssText = `cursor: grab; display: flex; align-items: center; opacity: 0.7;`;
        checkLabel.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="14" viewBox="0 0 10 14" style="display:block"><circle cx="2" cy="2" r="1.5" fill="rgba(200,200,200,1)"/><circle cx="8" cy="2" r="1.5" fill="rgba(200,200,200,1)"/><circle cx="2" cy="7" r="1.5" fill="rgba(200,200,200,1)"/><circle cx="8" cy="7" r="1.5" fill="rgba(200,200,200,1)"/><circle cx="2" cy="12" r="1.5" fill="rgba(200,200,200,1)"/><circle cx="8" cy="12" r="1.5" fill="rgba(200,200,200,1)"/></svg>`;

        const panelsCol = document.createElement('div');
        panelsCol.style.cssText = `display: flex; flex-direction: column; gap: 8px;`;

        const mainCol = document.createElement('div');
        mainCol.style.cssText = `
            display: flex;
            flex-direction: column-reverse;
            align-items: flex-end;
            gap: 5px;
            min-width: 260px;
            position: relative;
        `;

        const popupEditor = document.createElement('div');
        popupEditor.style.cssText = `
            position: absolute;
            right: calc(100% + 8px);
            top: 0;
            display: none;
            background: rgba(18, 18, 22, 0.95);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 8px;
            padding: 8px;
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            width: 220px;
            box-sizing: border-box;
            z-index: 1;
        `;

        function showPopupEditor(anchorPanel, formEl) {
            popupEditor.innerHTML = '';
            popupEditor.appendChild(formEl);
            popupEditor.style.display = 'block';
            requestAnimationFrame(() => {
                const mainRect  = mainCol.getBoundingClientRect();
                const panelRect = anchorPanel.getBoundingClientRect();
                const zoom = siteSettings.zoom || 1.0;
                popupEditor.style.top = ((panelRect.top - mainRect.top) / zoom) + 'px';
            });
        }

        function closePopupEditor() {
            popupEditor.style.display = 'none';
            popupEditor.innerHTML = '';
        }

        const profilesCol = document.createElement('div');
        profilesCol.style.cssText = 'display: flex; flex-direction: column; gap: 5px;';

        function setPanelsVisible(visible) {
            panelsCol.style.display = visible ? 'flex' : 'none';
            profilesCol.style.display = visible ? 'flex' : 'none';
            saveState();
        }
        setPanelsVisibleFn = setPanelsVisible;

        checkLabel.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();

            const rect = wrapper.getBoundingClientRect();
            const zoom = siteSettings.zoom || 1.0;
            const layoutLeft = rect.left + (zoom - 1) * wrapper.offsetWidth;
            const layoutTop  = rect.top  + (zoom - 1) * wrapper.offsetHeight;
            wrapperStartLeft = layoutLeft;
            wrapperStartTop  = layoutTop;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            isDragging = true;
            didDragMove = false;
            checkLabel.style.cursor = 'grabbing';
            // Position switch to top/left deferred to onDragMove — plain clicks must not alter it
        });

        toggleRow.appendChild(checkLabel);

        // =============================================
        //  Fixed macros panel (bottom of stack)
        // =============================================
        const fixedPanel = document.createElement('div');
        fixedPanel.style.cssText = PANEL_STYLE;
        fixedPanel.appendChild(makePanelHeader('MicroMacroManager'));

        const autoClickEl = document.createElement('div');
        autoClickEl.style.cssText = 'width: 100%;';
        fixedPanel.appendChild(autoClickEl);

        const autoMEl = document.createElement('div');
        autoMEl.style.cssText = 'width: 100%;';
        fixedPanel.appendChild(autoMEl);

        const enableAllBtn = document.createElement('button');
        enableAllBtn.textContent = 'Enable All';
        enableAllBtn.style.cssText = BTN_STYLE + 'text-align: center;';
        enableAllBtn.style.background = 'rgba(40, 70, 45, 0.55)';
        enableAllBtn.addEventListener('click', e => {
            e.stopPropagation();
            for (let i = 0; i < visibleCustomSlots; i++) {
                if (customSlots[i] && customBtns[i] && !macros[`custom_${i}`]?.active && !macros[`custom_${i}`]?.pending) {
                    customBtns[i].click();
                }
            }
            for (let i = 0; i < visibleClickerSlots; i++) {
                if (clickerSlots[i] && clickerBtns[i] && !macros[`clicker_${i}`]?.active && !macros[`clicker_${i}`]?.pending) {
                    clickerBtns[i].click();
                }
            }
        });
        fixedPanel.appendChild(enableAllBtn);

        const disableAllBtn = document.createElement('button');
        disableAllBtn.textContent = 'Disable All';
        disableAllBtn.style.cssText = BTN_STYLE + 'text-align: center;';
        disableAllBtn.style.background = 'rgba(70, 35, 35, 0.55)';
        disableAllBtn.addEventListener('click', e => {
            e.stopPropagation();
            Object.entries(macros).forEach(([mName, m]) => {
                if (m?.active || m?.pending) {
                    stopMacro(mName);
                    if (m.btn) setButtonOff(m.btn);
                }
            });
        });
        fixedPanel.appendChild(disableAllBtn);

        pauseBtn = document.createElement('button');
        pauseBtn.textContent = 'Pause All';
        pauseBtn.style.cssText = BTN_STYLE + 'text-align: center;';
        pauseBtn.style.background = 'rgba(50, 50, 55, 0.55)';
        pauseBtn.addEventListener('click', e => {
            e.stopPropagation();
            setPauseAll(!globalPaused);
        });
        fixedPanel.appendChild(pauseBtn);

        function buildFixedMacro(name, el) {
            el.innerHTML = '';
            if (macros[name]?.active || macros[name]?.pending) {
                stopMacro(name);
            }
            const fm    = (siteSettings.fixedMacros || {})[name] || {};
            const label = name === 'click' ? 'Auto-Click' : 'Auto-M';
            const periodMs    = fm.periodMs    ?? 100;
            const holdMode    = (name === 'click') ? false : (fm.holdMode || false);
            const timeLimitSec = fm.timeLimitSec || null;

            const rawFn = holdMode
                ? (name === 'click' ? doHoldClickStart : () => doHoldKeyStart('m'))
                : (name === 'click' ? doClick          : () => doKey('m'));
            const holdStopFn = holdMode
                ? (name === 'click' ? doHoldClickStop : () => doHoldKeyStop('m'))
                : null;

            const row = document.createElement('div');
            row.style.cssText = 'display: flex; gap: 4px; width: 100%;';

            const btn = document.createElement('button');
            btn.style.cssText = BTN_STYLE + 'flex: 1; min-width: 0;';
            setupBtnSections(btn, label, holdMode ? 'HOLD' : periodLabel(periodMs / 1000));
            setButtonOff(btn);
            btn.addEventListener('click', e => {
                e.stopPropagation();
                toggleMacro(name, rawFn, btn, periodMs, { holdMode, holdStopFn, timeLimitSec });
            });

            const editBtn = makeSideBtn('✎', 'Edit', 'rgba(60,80,120,0.45)');
            editBtn.style.fontSize = '11px';
            editBtn.addEventListener('click', e => {
                e.stopPropagation();
                stopMacro(name);
                setButtonOff(btn);
                showFixedMacroEditor(name, el);
            });

            row.appendChild(btn);
            row.appendChild(editBtn);
            el.appendChild(row);
        }

        function showFixedMacroEditor(name, el) {
            const fm = (siteSettings.fixedMacros || {})[name] || {};
            const form = document.createElement('div');
            form.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

            const periodRow = document.createElement('div');
            periodRow.style.cssText = 'display: flex; gap: 4px; align-items: center;';

            const periodInput = document.createElement('input');
            periodInput.type = 'text';
            periodInput.inputMode = 'decimal';
            periodInput.placeholder = 'Period (sec)';
            periodInput.style.cssText = INPUT_STYLE + 'flex: 1;';
            periodInput.value = String((fm.periodMs ?? 100) / 1000);

            let holdCheck = null;
            if (name !== 'click') {
                const holdLabel = document.createElement('label');
                holdLabel.style.cssText = 'display: flex; align-items: center; gap: 3px; cursor: pointer; font-size: 11px; color: rgba(180,180,200,0.8); white-space: nowrap; flex-shrink: 0;';
                holdCheck = document.createElement('input');
                holdCheck.type = 'checkbox';
                holdCheck.checked = fm.holdMode || false;
                holdCheck.style.cssText = 'cursor: pointer; accent-color: rgba(100,140,255,0.8);';
                holdCheck.addEventListener('keydown', e => e.stopPropagation());
                holdLabel.appendChild(holdCheck);
                holdLabel.appendChild(document.createTextNode('HOLD'));
                periodRow.appendChild(holdLabel);
            }
            periodRow.insertBefore(periodInput, periodRow.firstChild);

            const timeInput = document.createElement('input');
            timeInput.type = 'text';
            timeInput.inputMode = 'decimal';
            timeInput.placeholder = 'Time Limit (mins)';
            timeInput.style.cssText = INPUT_STYLE;
            if (fm.timeLimitSec) timeInput.value = (fm.timeLimitSec / 60).toFixed(2).replace(/\.?0+$/, '');

            function applyHoldState() {
                if (!holdCheck) return;
                periodInput.disabled = holdCheck.checked;
                periodInput.style.opacity = holdCheck.checked ? '0.4' : '';
            }
            if (holdCheck) holdCheck.addEventListener('change', applyHoldState);
            applyHoldState();

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display: flex; gap: 4px;';

            function doSave() {
                const isHold = holdCheck ? holdCheck.checked : false;
                const pSec = parseFloat(periodInput.value);
                const tVal = parseFloat(timeInput.value.trim());
                if (!siteSettings.fixedMacros) siteSettings.fixedMacros = {};
                siteSettings.fixedMacros[name] = {
                    periodMs:    isHold ? 100 : (isNaN(pSec) || pSec <= 0 ? 100 : Math.round(pSec * 1000)),
                    holdMode:    isHold,
                    timeLimitSec: (isNaN(tVal) || tVal <= 0) ? null : Math.round(tVal * 60)
                };
                closePopupEditor();
                buildFixedMacro(name, el);
                saveState();
            }

            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'Save';
            saveBtn.style.cssText = SAVE_BTN_STYLE;
            saveBtn.addEventListener('click', e => { e.stopPropagation(); doSave(); });

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = CANCEL_BTN_STYLE;
            cancelBtn.addEventListener('click', e => { e.stopPropagation(); closePopupEditor(); });

            periodInput.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });
            timeInput.addEventListener('keydown',   e => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });

            btnRow.appendChild(saveBtn);
            btnRow.appendChild(cancelBtn);
            form.appendChild(periodRow);
            form.appendChild(timeInput);
            form.appendChild(btnRow);

            showPopupEditor(fixedPanel, form);
        }

        buildFixedMacro('click', autoClickEl);
        buildFixedMacro('keyM',  autoMEl);

        // =============================================
        //  Custom key macros panel (middle of stack)
        // =============================================
        const customPanel = document.createElement('div');
        customPanel.style.cssText = PANEL_STYLE;
        customPanel.appendChild(makePanelHeader('Keystrokes'));

        const customSlots = [];
        const slotEls     = [];
        const customBtns  = [];
        let visibleCustomSlots = 0;

        function validateKeySlot(slot) {
            const keys   = (slot.keyRaw || '').trim().toLowerCase();
            const period = parseFloat(slot.periodRaw);
            if (keys.length === 0 || !/^[a-z0-9]+$/.test(keys)) return null;
            if (isNaN(period) || !isFinite(period) || period <= 0) return null;
            return { keys, intervalMs: Math.round(period * 1000) };
        }

        function addCustomSlot() {
            const i = visibleCustomSlots++;
            customSlots.push(null);
            const slotEl = document.createElement('div');
            slotEl.style.cssText = 'width: 100%;';
            slotEls.push(slotEl);
            customPanel.appendChild(slotEl);
            buildSlot(i);
        }

        function maybeExpandCustom() {
            if (visibleCustomSlots < MAX_SLOTS && customSlots.every(s => s !== null)) {
                addCustomSlot();
            }
        }

        function shrinkCustomToFit() {
            let lastFilled = -1;
            for (let i = 0; i < visibleCustomSlots; i++) {
                if (customSlots[i] !== null) lastFilled = i;
            }
            const desired = Math.max(INITIAL_SLOTS, lastFilled + 2);
            while (visibleCustomSlots > desired) {
                const i = --visibleCustomSlots;
                slotEls[i].remove();
                slotEls.splice(i, 1);
                customSlots.splice(i, 1);
            }
        }

        function buildSlot(i, autoStart = false) {
            const el   = slotEls[i];
            el.innerHTML = '';
            customBtns[i] = null;
            const slot = customSlots[i];

            if (!slot) {
                const addBtn = document.createElement('button');
                addBtn.textContent = '+ slot ' + (i + 1);
                addBtn.style.cssText = BTN_STYLE +
                    'background: rgba(35,35,42,0.55); color: rgba(150,150,165,0.7); font-style: italic;';
                addBtn.addEventListener('click', e => { e.stopPropagation(); showKeyEditor(i); });
                el.appendChild(addBtn);
                return;
            }

            const macroName = `custom_${i}`;
            const parsed    = validateKeySlot(slot);

            if (!parsed) {
                el.appendChild(makeErrorRow(() => {
                    stopMacro(macroName);
                    customSlots[i] = null;
                    buildSlot(i);
                    shrinkCustomToFit();
                    saveState();
                }));
                return;
            }

            const holdMode   = slot.holdMode || false;
            const keyFn      = () => parsed.keys.split('').forEach(k => doKey(k));
            const holdStartFn = () => parsed.keys.split('').forEach(k => doHoldKeyStart(k));
            const holdStopFn  = holdMode ? (() => [...parsed.keys].reverse().forEach(k => doHoldKeyStop(k))) : null;
            const activeFn    = holdMode ? holdStartFn : keyFn;

            const row = document.createElement('div');
            row.style.cssText = 'display: flex; gap: 4px; width: 100%;';

            const toggleBtn = document.createElement('button');
            toggleBtn.style.cssText = BTN_STYLE + 'flex: 1; min-width: 0;';
            setupBtnSections(toggleBtn, parsed.keys.toUpperCase(), holdMode ? 'HOLD' : periodLabel(parsed.intervalMs / 1000));
            setButtonOff(toggleBtn);
            customBtns[i] = toggleBtn;
            toggleBtn.addEventListener('click', e => {
                e.stopPropagation();
                toggleMacro(macroName, activeFn, toggleBtn, parsed.intervalMs, {
                    holdMode, holdStopFn, maxActivations: slot.maxActivations, timeLimitSec: slot.timeLimitSec
                });
            });

            const editBtn = makeSideBtn('✎', 'Edit', 'rgba(60,80,120,0.45)');
            editBtn.style.fontSize = '11px';
            editBtn.addEventListener('click', e => {
                e.stopPropagation();
                stopMacro(macroName);
                showKeyEditor(i, slot);
            });

            const trashBtn = makeSideBtn('🗑', 'Clear', 'rgba(160,50,50,0.4)');
            trashBtn.addEventListener('click', e => {
                e.stopPropagation();
                stopMacro(macroName);
                customSlots[i] = null;
                buildSlot(i);
                shrinkCustomToFit();
                saveState();
            });

            row.appendChild(toggleBtn);
            row.appendChild(editBtn);
            row.appendChild(trashBtn);
            el.appendChild(row);

            if (autoStart) {
                startMacro(macroName, activeFn, toggleBtn, parsed.intervalMs, holdMode, holdStopFn);
                applyMacroCaps(macroName, slot.maxActivations, slot.timeLimitSec);
                updateMacroButtonDisplay(macroName, toggleBtn);
            }
        }

        function showKeyEditor(i, prefill = null) {
            const form = document.createElement('div');
            form.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

            const keyInput = document.createElement('input');
            keyInput.type = 'text';
            keyInput.placeholder = 'Keys';
            keyInput.style.cssText = INPUT_STYLE;
            if (prefill) keyInput.value = prefill.keyRaw;
            keyInput.addEventListener('input',   () => { keyInput.value = keyInput.value.toLowerCase(); });
            keyInput.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });

            const periodRow = document.createElement('div');
            periodRow.style.cssText = 'display: flex; gap: 4px; align-items: center;';

            const periodInput = document.createElement('input');
            periodInput.type      = 'text';
            periodInput.inputMode = 'decimal';
            periodInput.placeholder = 'Period (sec)';
            periodInput.style.cssText = INPUT_STYLE + 'flex: 1;';
            if (prefill) periodInput.value = prefill.periodRaw;
            periodInput.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });

            const holdLabel = document.createElement('label');
            holdLabel.style.cssText = 'display: flex; align-items: center; gap: 3px; cursor: pointer; font-size: 11px; color: rgba(180,180,200,0.8); white-space: nowrap; flex-shrink: 0;';
            const holdCheck = document.createElement('input');
            holdCheck.type = 'checkbox';
            holdCheck.checked = prefill?.holdMode || false;
            holdCheck.style.cssText = 'cursor: pointer; accent-color: rgba(100,140,255,0.8);';
            holdCheck.addEventListener('keydown', e => e.stopPropagation());
            holdLabel.appendChild(holdCheck);
            holdLabel.appendChild(document.createTextNode('HOLD'));
            periodRow.appendChild(periodInput);
            periodRow.appendChild(holdLabel);

            const capsRow = document.createElement('div');
            capsRow.style.cssText = 'display: flex; gap: 4px;';

            const maxInput = document.createElement('input');
            maxInput.type      = 'text';
            maxInput.inputMode = 'numeric';
            maxInput.placeholder = 'Max #';
            maxInput.style.cssText = INPUT_STYLE + 'width: 50%; font-size: 11px;';
            if (prefill?.maxActivations) maxInput.value = prefill.maxActivations;
            maxInput.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });

            const timeInput = document.createElement('input');
            timeInput.type      = 'text';
            timeInput.inputMode = 'decimal';
            timeInput.placeholder = 'Time Limit (mins)';
            timeInput.style.cssText = INPUT_STYLE + 'width: 50%; font-size: 11px;';
            if (prefill?.timeLimitSec) timeInput.value = (prefill.timeLimitSec / 60).toFixed(2).replace(/\.?0+$/, '');
            timeInput.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });

            capsRow.appendChild(maxInput);
            capsRow.appendChild(timeInput);

            function applyHoldState() {
                const h = holdCheck.checked;
                periodInput.disabled = h;
                periodInput.style.opacity = h ? '0.4' : '';
                maxInput.disabled = h;
                maxInput.style.opacity = h ? '0.4' : '';
            }
            holdCheck.addEventListener('change', applyHoldState);
            applyHoldState();

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display: flex; gap: 4px;';

            function doSave() {
                const maxVal  = parseInt(maxInput.value.trim(), 10);
                const timeVal = parseFloat(timeInput.value.trim());
                const hold    = holdCheck.checked;
                customSlots[i] = {
                    keyRaw:         keyInput.value,
                    periodRaw:      hold ? '1' : (periodInput.value.trim() || '1'),
                    maxActivations: (hold || isNaN(maxVal)  || maxVal  <= 0) ? null : maxVal,
                    timeLimitSec:   (isNaN(timeVal) || timeVal <= 0) ? null : Math.round(timeVal * 60),
                    holdMode:       hold,
                };
                closePopupEditor();
                buildSlot(i, true);
                maybeExpandCustom();
                saveState();
            }

            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'Save';
            saveBtn.style.cssText = SAVE_BTN_STYLE;
            saveBtn.addEventListener('click', e => { e.stopPropagation(); doSave(); });

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = CANCEL_BTN_STYLE;
            cancelBtn.addEventListener('click', e => { e.stopPropagation(); closePopupEditor(); });

            btnRow.appendChild(saveBtn);
            btnRow.appendChild(cancelBtn);
            form.appendChild(keyInput);
            form.appendChild(periodRow);
            form.appendChild(capsRow);
            form.appendChild(btnRow);
            showPopupEditor(customPanel, form);
            keyInput.focus();
        }

        for (let i = 0; i < INITIAL_SLOTS; i++) addCustomSlot();

        // =============================================
        //  Position clicker panel (top of stack)
        // =============================================
        const clickerPanel = document.createElement('div');
        clickerPanel.style.cssText = PANEL_STYLE;
        clickerPanel.appendChild(makePanelHeader('Clickers'));

        const clickerSlots   = [];
        const clickerSlotEls = [];
        const clickerMarkers  = [];
        const clickerCssBoxes = [];
        const clickerBtns     = [];
        let visibleClickerSlots = 0;

        const onMouseLeave = () => {
            for (let i = 0; i < visibleClickerSlots; i++) {
                const name = `clicker_${i}`;
                if (isMacroActive(name)) {
                    stopMacro(name);
                    if (clickerBtns[i]) setButtonOff(clickerBtns[i]);
                }
            }
        };
        document.addEventListener('mouseleave', onMouseLeave);
        teardownFns.push(() => document.removeEventListener('mouseleave', onMouseLeave));

        let activeCaptureCancel = null;
        let cssHighlight = null;
        let cssHoveredEl = null;

        function validateClickerSlot(slot) {
            const period = parseFloat(slot.periodRaw);
            if (isNaN(period) || !isFinite(period) || period <= 0) return null;
            const intervalMs = Math.round(period * 1000);
            if (slot.type === 'css') {
                if (!slot.selector) return null;
                return { type: 'css', selector: slot.selector, intervalMs };
            }
            return { type: 'xy', x: slot.x, y: slot.y, intervalMs };
        }

        function createMarker(x, y, num) {
            const m = document.createElement('div');
            m.style.cssText = `
                position: fixed;
                left: ${x}px;
                top: ${y}px;
                width: 16px;
                height: 16px;
                transform: translate(-50%, -50%);
                pointer-events: none;
                z-index: 2147483646;
                border: 1.5px solid rgba(60, 255, 80, 0.9);
                border-radius: 50%;
                box-shadow: 0 0 4px rgba(0,0,0,0.7);
            `;
            const hLine = document.createElement('div');
            hLine.style.cssText = `
                position: absolute; top: 50%; left: -7px;
                width: 30px; height: 1.5px;
                background: rgba(60, 255, 80, 0.9);
                transform: translateY(-50%);
            `;
            const vLine = document.createElement('div');
            vLine.style.cssText = `
                position: absolute; left: 50%; top: -7px;
                height: 30px; width: 1.5px;
                background: rgba(60, 255, 80, 0.9);
                transform: translateX(-50%);
            `;
            m.appendChild(hLine);
            m.appendChild(vLine);
            if (num !== undefined) {
                const numLabel = document.createElement('div');
                numLabel.textContent = num;
                numLabel.style.cssText = `
                    position: absolute; left: 10px; top: -8px;
                    color: rgba(60,255,80,0.9); font-size: 10px; font-family: monospace;
                    pointer-events: none; text-shadow: 0 0 3px rgba(0,0,0,0.8);
                `;
                m.appendChild(numLabel);
            }
            document.documentElement.appendChild(m);
            return m;
        }

        function createCssBox(selector, num) {
            const box = document.createElement('div');
            box.style.cssText = `
                position: fixed;
                pointer-events: none;
                z-index: 2147483646;
                border: 2px solid rgba(60, 255, 80, 0.85);
                border-radius: 3px;
                box-shadow: 0 0 4px rgba(0,0,0,0.5);
            `;
            if (num !== undefined) {
                const lbl = document.createElement('div');
                lbl.textContent = num;
                lbl.style.cssText = `
                    position: absolute; right: 2px; top: -14px;
                    color: rgba(60,255,80,0.9); font-size: 10px; font-family: monospace;
                    pointer-events: none; text-shadow: 0 0 3px rgba(0,0,0,0.8);
                `;
                box.appendChild(lbl);
            }
            positionCssBox(box, selector);
            document.documentElement.appendChild(box);
            return box;
        }

        function positionCssBox(box, selector) {
            const target = document.querySelector(selector);
            if (!target) { box.style.display = 'none'; return; }
            const r = target.getBoundingClientRect();
            const visible = r.width > 0 && r.height > 0 &&
                r.bottom > 0 && r.top < window.innerHeight &&
                r.right > 0 && r.left < window.innerWidth;
            if (!visible) { box.style.display = 'none'; return; }
            box.style.display = 'block';
            box.style.left   = r.left   + 'px';
            box.style.top    = r.top    + 'px';
            box.style.width  = r.width  + 'px';
            box.style.height = r.height + 'px';
        }

        function removeCssBox(i) {
            if (clickerCssBoxes[i]) {
                clickerCssBoxes[i].remove();
                clickerCssBoxes[i] = null;
            }
        }

        function removeMarker(i) {
            if (clickerMarkers[i]) {
                clickerMarkers[i].remove();
                clickerMarkers[i] = null;
            }
        }

        function addClickerSlot() {
            const i = visibleClickerSlots++;
            clickerSlots.push(null);
            clickerMarkers.push(null);
            clickerCssBoxes.push(null);
            clickerBtns.push(null);
            const slotEl = document.createElement('div');
            slotEl.style.cssText = 'width: 100%;';
            clickerSlotEls.push(slotEl);
            clickerPanel.appendChild(slotEl);
            buildClickerSlot(i);
        }

        function maybeExpandClickers() {
            if (visibleClickerSlots < MAX_SLOTS && clickerSlots.every(s => s !== null)) {
                addClickerSlot();
            }
        }

        function shrinkClickersToFit() {
            let lastFilled = -1;
            for (let i = 0; i < visibleClickerSlots; i++) {
                if (clickerSlots[i] !== null) lastFilled = i;
            }
            const desired = Math.max(INITIAL_SLOTS, lastFilled + 2);
            while (visibleClickerSlots > desired) {
                const i = --visibleClickerSlots;
                removeMarker(i);
                removeCssBox(i);
                clickerSlotEls[i].remove();
                clickerSlotEls.splice(i, 1);
                clickerSlots.splice(i, 1);
                clickerMarkers.splice(i, 1);
                clickerCssBoxes.splice(i, 1);
                clickerBtns.splice(i, 1);
            }
        }

        // Reposition CSS highlight boxes every second
        const cssBoxTimer = setInterval(() => {
            for (let i = 0; i < visibleClickerSlots; i++) {
                if (!clickerCssBoxes[i]) continue;
                const slot = clickerSlots[i];
                if (slot?.type === 'css' && slot.selector) {
                    positionCssBox(clickerCssBoxes[i], slot.selector);
                }
            }
        }, 1000);
        teardownFns.push(() => clearInterval(cssBoxTimer));

        function startTargetCapture(slotIndex, prefillPeriod = '') {
            if (activeCaptureCancel) activeCaptureCancel();

            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0; left: 0;
                width: 100vw; height: 100vh;
                z-index: 2147483646;
                cursor: crosshair;
                background: rgba(100, 140, 255, 0.06);
            `;

            buildClickerSlotCapturing(slotIndex);

            function cleanup() {
                overlay.remove();
                window.removeEventListener('blur', onBlur);
                activeCaptureCancel = null;
            }
            function cancel() { cleanup(); buildClickerSlot(slotIndex); }
            function onBlur() { cancel(); }

            overlay.addEventListener('click', e => {
                if (!e.isTrusted) return;
                e.stopPropagation();
                cleanup();
                showClickerPeriodEditor(slotIndex, e.clientX, e.clientY, prefillPeriod);
            });

            window.addEventListener('blur', onBlur);
            document.documentElement.appendChild(overlay);
            activeCaptureCancel = cancel;
        }

        function startCssCapture(slotIndex) {
            if (activeCaptureCancel) activeCaptureCancel();

            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0;
                width: 100vw; height: 100vh;
                z-index: 2147483645; cursor: crosshair;
                background: transparent;
            `;

            cssHighlight = document.createElement('div');
            cssHighlight.style.cssText = `
                position: fixed; z-index: 2147483646; pointer-events: none;
                border: 2px solid rgba(120, 160, 255, 0.9);
                background: rgba(100, 140, 255, 0.12);
                box-sizing: border-box;
                display: none;
                transition: all 0.05s;
            `;
            const cssNumLabel = document.createElement('div');
            cssNumLabel.textContent = slotIndex + 1;
            cssNumLabel.style.cssText = 'position: absolute; top: 2px; left: 4px; color: rgba(120,160,255,0.9); font-size: 10px; font-family: monospace;';
            cssHighlight.appendChild(cssNumLabel);
            document.documentElement.appendChild(cssHighlight);

            buildClickerSlotCapturing(slotIndex);

            function onMove(e) {
                overlay.style.display = 'none';
                const el = document.elementFromPoint(e.clientX, e.clientY);
                overlay.style.display = 'block';
                if (!el || wrapper.contains(el) || el === overlay) {
                    cssHighlight.style.display = 'none';
                    cssHoveredEl = null;
                    return;
                }
                cssHoveredEl = el;
                const r = el.getBoundingClientRect();
                cssHighlight.style.display = 'block';
                cssHighlight.style.left   = r.left   + 'px';
                cssHighlight.style.top    = r.top    + 'px';
                cssHighlight.style.width  = r.width  + 'px';
                cssHighlight.style.height = r.height + 'px';
            }

            function cleanup() {
                overlay.removeEventListener('mousemove', onMove);
                overlay.remove();
                if (cssHighlight) { cssHighlight.remove(); cssHighlight = null; }
                cssHoveredEl = null;
                window.removeEventListener('blur', onBlur);
                activeCaptureCancel = null;
            }
            function cancel() { cleanup(); buildClickerSlot(slotIndex); }
            function onBlur() { cancel(); }

            overlay.addEventListener('mousemove', onMove);
            overlay.addEventListener('click', e => {
                if (!e.isTrusted || !cssHoveredEl || wrapper.contains(cssHoveredEl)) return;
                e.stopPropagation();
                const selector = buildSelector(cssHoveredEl);
                cleanup();
                showCssPeriodEditor(slotIndex, selector);
            });

            window.addEventListener('blur', onBlur);
            document.documentElement.appendChild(overlay);
            activeCaptureCancel = cancel;
        }

        function buildClickerSlotCapturing(i) {
            const el = clickerSlotEls[i];
            el.innerHTML = '';

            const row = document.createElement('div');
            row.style.cssText = 'display: flex; gap: 4px; width: 100%;';

            const indicator = document.createElement('button');
            indicator.textContent = '⊕ select...';
            indicator.disabled = true;
            indicator.style.cssText = BTN_STYLE + `
                flex: 1; min-width: 0;
                background: rgba(60,80,140,0.5);
                color: rgba(160,190,255,0.9);
                cursor: not-allowed;
                font-style: italic;
                border-color: rgba(100,140,255,0.3);
            `;

            const cancelBtn = makeSideBtn('×', 'Cancel target select', 'rgba(100,50,50,0.5)');
            cancelBtn.addEventListener('click', e => {
                e.stopPropagation();
                if (activeCaptureCancel) activeCaptureCancel();
            });

            row.appendChild(indicator);
            row.appendChild(cancelBtn);
            el.appendChild(row);
        }

        function showClickerPeriodEditor(i, x, y, prefillPeriod = '') {
            removeMarker(i);
            removeCssBox(i);
            clickerMarkers[i] = createMarker(x, y, i + 1);

            const form = document.createElement('div');
            form.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

            const posLabel = document.createElement('div');
            posLabel.textContent = `⊕ ${Math.round(x)}, ${Math.round(y)}`;
            posLabel.style.cssText = `color: rgba(150,185,255,0.8); font-size: 11px; padding: 0 2px;`;

            const periodRow = document.createElement('div');
            periodRow.style.cssText = 'display: flex; gap: 4px; align-items: center;';

            const periodInput = document.createElement('input');
            periodInput.type        = 'text';
            periodInput.inputMode   = 'decimal';
            periodInput.placeholder = 'Period (sec)';
            periodInput.style.cssText = INPUT_STYLE + 'flex: 1;';
            if (prefillPeriod) periodInput.value = prefillPeriod;
            periodInput.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });

            const holdLabel = document.createElement('label');
            holdLabel.style.cssText = 'display: flex; align-items: center; gap: 3px; font-size: 11px; color: rgba(180,180,200,0.8); white-space: nowrap; cursor: pointer;';
            const holdCheck = document.createElement('input');
            holdCheck.type = 'checkbox';
            holdCheck.checked = clickerSlots[i]?.holdMode || false;
            holdLabel.appendChild(holdCheck);
            holdLabel.appendChild(document.createTextNode('HOLD'));
            periodRow.appendChild(periodInput);
            periodRow.appendChild(holdLabel);

            const capsRow = document.createElement('div');
            capsRow.style.cssText = 'display: flex; gap: 4px;';

            const maxInput = document.createElement('input');
            maxInput.type = 'text'; maxInput.inputMode = 'numeric';
            maxInput.placeholder = 'Max #';
            maxInput.style.cssText = INPUT_STYLE + 'width: 50%; font-size: 11px;';
            if (clickerSlots[i]?.maxActivations) maxInput.value = clickerSlots[i].maxActivations;
            maxInput.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });

            const timeInput = document.createElement('input');
            timeInput.type = 'text'; timeInput.inputMode = 'decimal';
            timeInput.placeholder = 'Time Limit (mins)';
            timeInput.style.cssText = INPUT_STYLE + 'width: 50%; font-size: 11px;';
            if (clickerSlots[i]?.timeLimitSec) timeInput.value = (clickerSlots[i].timeLimitSec / 60).toFixed(2).replace(/\.?0+$/, '');
            timeInput.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });

            capsRow.appendChild(maxInput); capsRow.appendChild(timeInput);

            function applyHoldStateXY() {
                const on = holdCheck.checked;
                periodInput.disabled = on;
                maxInput.disabled    = on;
                periodInput.style.opacity = on ? '0.4' : '';
                maxInput.style.opacity    = on ? '0.4' : '';
            }
            holdCheck.addEventListener('change', applyHoldStateXY);
            applyHoldStateXY();

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display: flex; gap: 4px;';

            function doSave() {
                const hold    = holdCheck.checked;
                const maxVal  = parseInt(maxInput.value.trim(), 10);
                const timeVal = parseFloat(timeInput.value.trim());
                clickerSlots[i] = {
                    x, y,
                    holdMode:       hold,
                    periodRaw:      hold ? '1' : (periodInput.value.trim() || '1'),
                    maxActivations: (hold || isNaN(maxVal)  || maxVal  <= 0) ? null : maxVal,
                    timeLimitSec:   (isNaN(timeVal) || timeVal <= 0) ? null : Math.round(timeVal * 60),
                };
                closePopupEditor();
                buildClickerSlot(i, true);
                maybeExpandClickers();
                saveState();
            }

            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'Save';
            saveBtn.style.cssText = SAVE_BTN_STYLE;
            saveBtn.addEventListener('click', e => { e.stopPropagation(); doSave(); });

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = CANCEL_BTN_STYLE;
            cancelBtn.addEventListener('click', e => { e.stopPropagation(); closePopupEditor(); buildClickerSlot(i); });

            btnRow.appendChild(saveBtn);
            btnRow.appendChild(cancelBtn);
            form.appendChild(posLabel);
            form.appendChild(periodRow);
            form.appendChild(capsRow);
            form.appendChild(btnRow);
            showPopupEditor(clickerPanel, form);
            periodInput.focus();
        }

        function showCssPeriodEditor(i, selector) {
            const existing = clickerSlots[i];
            const form = document.createElement('div');
            form.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

            const selLabel = document.createElement('div');
            selLabel.textContent = '⊞ ' + (selector.length > 22 ? selector.slice(0, 21) + '…' : selector);
            selLabel.title = selector;
            selLabel.style.cssText = `color: rgba(150,185,255,0.8); font-size: 10px; padding: 0 2px; word-break: break-all;`;

            const labelInput = document.createElement('input');
            labelInput.type = 'text';
            labelInput.placeholder = 'Label';
            labelInput.style.cssText = INPUT_STYLE;
            if (existing?.label) labelInput.value = existing.label;
            labelInput.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });

            const periodRow2 = document.createElement('div');
            periodRow2.style.cssText = 'display: flex; gap: 4px; align-items: center;';

            const periodInput = document.createElement('input');
            periodInput.type = 'text'; periodInput.inputMode = 'decimal';
            periodInput.placeholder = 'Period (sec)';
            periodInput.style.cssText = INPUT_STYLE + 'flex: 1;';
            if (existing?.periodRaw) periodInput.value = existing.periodRaw;
            periodInput.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });

            const holdLabel2 = document.createElement('label');
            holdLabel2.style.cssText = 'display: flex; align-items: center; gap: 3px; font-size: 11px; color: rgba(180,180,200,0.8); white-space: nowrap; cursor: pointer;';
            const holdCheck2 = document.createElement('input');
            holdCheck2.type = 'checkbox';
            holdCheck2.checked = existing?.holdMode || false;
            holdLabel2.appendChild(holdCheck2);
            holdLabel2.appendChild(document.createTextNode('HOLD'));
            periodRow2.appendChild(periodInput);
            periodRow2.appendChild(holdLabel2);

            const capsRow = document.createElement('div');
            capsRow.style.cssText = 'display: flex; gap: 4px;';
            const maxInput = document.createElement('input');
            maxInput.type = 'text'; maxInput.inputMode = 'numeric';
            maxInput.placeholder = 'Max #';
            maxInput.style.cssText = INPUT_STYLE + 'width: 50%; font-size: 11px;';
            if (existing?.maxActivations) maxInput.value = existing.maxActivations;
            maxInput.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });
            const timeInput = document.createElement('input');
            timeInput.type = 'text'; timeInput.inputMode = 'decimal';
            timeInput.placeholder = 'Time Limit (mins)';
            timeInput.style.cssText = INPUT_STYLE + 'width: 50%; font-size: 11px;';
            if (existing?.timeLimitSec) timeInput.value = (existing.timeLimitSec / 60).toFixed(2).replace(/\.?0+$/, '');
            timeInput.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });
            capsRow.appendChild(maxInput); capsRow.appendChild(timeInput);

            function applyHoldStateCSS() {
                const on = holdCheck2.checked;
                periodInput.disabled = on;
                maxInput.disabled    = on;
                periodInput.style.opacity = on ? '0.4' : '';
                maxInput.style.opacity    = on ? '0.4' : '';
            }
            holdCheck2.addEventListener('change', applyHoldStateCSS);
            applyHoldStateCSS();

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display: flex; gap: 4px;';

            function doSave() {
                const hold     = holdCheck2.checked;
                const maxVal   = parseInt(maxInput.value.trim(), 10);
                const timeVal  = parseFloat(timeInput.value.trim());
                const labelVal = labelInput.value.trim() || null;
                clickerSlots[i] = {
                    type: 'css', selector,
                    holdMode:       hold,
                    label:          labelVal,
                    periodRaw:      hold ? '1' : (periodInput.value.trim() || '1'),
                    maxActivations: (hold || isNaN(maxVal)  || maxVal  <= 0) ? null : maxVal,
                    timeLimitSec:   (isNaN(timeVal) || timeVal <= 0) ? null : Math.round(timeVal * 60),
                };
                closePopupEditor();
                buildClickerSlot(i, true);
                maybeExpandClickers();
                saveState();
            }

            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'Save'; saveBtn.style.cssText = SAVE_BTN_STYLE;
            saveBtn.addEventListener('click', e => { e.stopPropagation(); doSave(); });

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel'; cancelBtn.style.cssText = CANCEL_BTN_STYLE;
            cancelBtn.addEventListener('click', e => { e.stopPropagation(); closePopupEditor(); });

            btnRow.appendChild(saveBtn); btnRow.appendChild(cancelBtn);
            form.appendChild(selLabel); form.appendChild(periodRow2); form.appendChild(labelInput);
            form.appendChild(capsRow); form.appendChild(btnRow);
            showPopupEditor(clickerPanel, form);
            periodInput.focus();
        }

        function buildClickerSlot(i, autoStart = false) {
            const el = clickerSlotEls[i];
            el.innerHTML = '';
            clickerBtns[i] = null;
            const slot = clickerSlots[i];

            if (!slot) {
                removeMarker(i);
                removeCssBox(i);
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; gap: 4px; width: 100%;';

                const xyBtn = document.createElement('button');
                xyBtn.textContent = `+ (X,Y) ${i + 1}`;
                xyBtn.style.cssText = BTN_STYLE + 'flex: 1; min-width: 0; background: rgba(35,35,42,0.55); color: rgba(150,150,165,0.7); font-style: italic;';
                xyBtn.addEventListener('click', e => { e.stopPropagation(); startTargetCapture(i); });

                const cssBtn = document.createElement('button');
                cssBtn.textContent = `+ CSS ${i + 1}`;
                cssBtn.style.cssText = BTN_STYLE + 'flex: 1; min-width: 0; background: rgba(35,35,42,0.55); color: rgba(150,150,165,0.7); font-style: italic;';
                cssBtn.addEventListener('click', e => { e.stopPropagation(); startCssCapture(i); });

                row.appendChild(xyBtn);
                row.appendChild(cssBtn);
                el.appendChild(row);
                return;
            }

            const macroName = `clicker_${i}`;
            const parsed    = validateClickerSlot(slot);

            if (!parsed) {
                removeMarker(i);
                removeCssBox(i);
                el.appendChild(makeErrorRow(() => {
                    stopMacro(macroName);
                    clickerSlots[i] = null;
                    buildClickerSlot(i);
                    shrinkClickersToFit();
                    saveState();
                }));
                return;
            }

            const holdMode   = slot.holdMode || false;
            const periodText = periodLabel(parsed.intervalMs / 1000);
            let btnLabel, btnPeriod, clickFn, holdStartFn, holdStopFn;

            if (parsed.type === 'css') {
                const displayName = slot.label
                    ? slot.label
                    : (parsed.selector.length > 20 ? parsed.selector.slice(0, 19) + '…' : parsed.selector);
                btnLabel  = `⊞ ${displayName}`;
                btnPeriod = holdMode ? 'HOLD' : periodText;
                clickFn = () => {
                    const target = document.querySelector(parsed.selector);
                    if (target) {
                        const r = target.getBoundingClientRect();
                        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                        dispatchClick(target, cx, cy);
                    }
                };
                let _cssHoldEl = null;
                holdStartFn = () => {
                    const target = document.querySelector(parsed.selector);
                    if (!target) return;
                    _cssHoldEl = target;
                    const r = target.getBoundingClientRect();
                    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window }));
                };
                holdStopFn = holdMode ? (() => {
                    if (!_cssHoldEl) return;
                    const r = _cssHoldEl.getBoundingClientRect();
                    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                    _cssHoldEl.dispatchEvent(new MouseEvent('mouseup',  { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window }));
                    _cssHoldEl.dispatchEvent(new MouseEvent('click',    { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window }));
                    _cssHoldEl = null;
                }) : null;
                removeMarker(i);
                removeCssBox(i);
                clickerCssBoxes[i] = createCssBox(parsed.selector, i + 1);
            } else {
                btnLabel  = `⊕ ${Math.round(parsed.x)},${Math.round(parsed.y)}`;
                btnPeriod = holdMode ? 'HOLD' : periodText;
                clickFn   = () => doClickAt(parsed.x, parsed.y);
                let _xyHoldEl = null;
                holdStartFn = () => {
                    _xyHoldEl = document.elementFromPoint(parsed.x, parsed.y);
                    if (!_xyHoldEl || wrapper.contains(_xyHoldEl)) { _xyHoldEl = null; return; }
                    _xyHoldEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: parsed.x, clientY: parsed.y, view: window }));
                };
                holdStopFn = holdMode ? (() => {
                    if (!_xyHoldEl) return;
                    _xyHoldEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: parsed.x, clientY: parsed.y, view: window }));
                    _xyHoldEl.dispatchEvent(new MouseEvent('click',   { bubbles: true, cancelable: true, clientX: parsed.x, clientY: parsed.y, view: window }));
                    _xyHoldEl = null;
                }) : null;
                removeMarker(i);
                removeCssBox(i);
                clickerMarkers[i] = createMarker(parsed.x, parsed.y, i + 1);
            }

            const activeFn = holdMode ? holdStartFn : clickFn;

            const row = document.createElement('div');
            row.style.cssText = 'display: flex; gap: 4px; width: 100%;';

            const toggleBtn = document.createElement('button');
            toggleBtn.style.cssText = BTN_STYLE + 'flex: 1; min-width: 0;';
            setupBtnSections(toggleBtn, btnLabel, btnPeriod);
            setButtonOff(toggleBtn);
            clickerBtns[i] = toggleBtn;
            toggleBtn.addEventListener('click', e => {
                e.stopPropagation();
                toggleMacro(macroName, activeFn, toggleBtn, parsed.intervalMs,
                    { holdMode, holdStopFn, maxActivations: slot.maxActivations, timeLimitSec: slot.timeLimitSec });
            });

            const editBtn = makeSideBtn('✎', 'Edit', 'rgba(60,80,120,0.45)');
            editBtn.style.fontSize = '11px';
            editBtn.addEventListener('click', e => {
                e.stopPropagation();
                stopMacro(macroName);
                if (slot.type === 'css') {
                    showCssPeriodEditor(i, slot.selector);
                } else {
                    showClickerPeriodEditor(i, parsed.x, parsed.y, slot.periodRaw);
                }
            });

            const trashBtn = makeSideBtn('🗑', 'Clear', 'rgba(160,50,50,0.4)');
            trashBtn.addEventListener('click', e => {
                e.stopPropagation();
                stopMacro(macroName);
                clickerSlots[i] = null;
                buildClickerSlot(i);
                shrinkClickersToFit();
                saveState();
            });

            row.appendChild(toggleBtn);
            row.appendChild(editBtn);
            row.appendChild(trashBtn);
            el.appendChild(row);

            if (autoStart) {
                startMacro(macroName, activeFn, toggleBtn, parsed.intervalMs, holdMode, holdStopFn);
                applyMacroCaps(macroName, slot.maxActivations, slot.timeLimitSec);
                updateMacroButtonDisplay(macroName, toggleBtn);
            }
        }

        for (let i = 0; i < INITIAL_SLOTS; i++) addClickerSlot();

        // =============================================
        //  Profiles panel
        // =============================================
        const profilesPanel = document.createElement('div');
        profilesPanel.style.cssText = PANEL_STYLE + 'width: 160px;';
        profilesPanel.appendChild(makePanelHeader('Profiles'));

        function buildProfilesPanel() {
            while (profilesPanel.children.length > 1) profilesPanel.lastChild.remove();

            profiles.forEach((profile, idx) => {
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; gap: 3px; width: 100%;';

                const btn = document.createElement('button');
                btn.style.cssText = BTN_STYLE + 'flex: 1; min-width: 0;';
                btn.dataset.label = profile.name;
                btn.textContent = profile.name;
                if (idx === activeProfile) {
                    btn.setAttribute('data-btn-on', '');
                    btn.style.background = 'rgba(80, 180, 100, 0.45)';
                } else {
                    btn.removeAttribute('data-btn-on');
                    btn.style.background = 'rgba(50, 50, 55, 0.55)';
                }

                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    if (idx === activeProfile) return;
                    switchProfile(idx);
                });
                btn.addEventListener('dblclick', e => {
                    e.stopPropagation();
                    startRenameProfile(idx, row, btn);
                });

                row.appendChild(btn);

                const editBtn = makeSideBtn('✎', 'Rename profile', 'rgba(60,80,120,0.45)');
                editBtn.style.fontSize = '11px';
                editBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    startRenameProfile(idx, row, btn);
                });
                row.appendChild(editBtn);

                if (idx > 0) {
                    const delBtn = makeSideBtn('🗑', 'Delete profile', 'rgba(160,50,50,0.4)');
                    delBtn.addEventListener('click', e => {
                        e.stopPropagation();
                        if (!confirm(`Delete "${profile.name}"?`)) return;
                        deleteProfile(idx);
                    });
                    row.appendChild(delBtn);
                }

                profilesPanel.appendChild(row);
            });

            if (profiles.length < MAX_PROFILES) {
                const addBtn = document.createElement('button');
                addBtn.textContent = '+ Profile';
                addBtn.style.cssText = BTN_STYLE +
                    'background: rgba(35,35,42,0.55); color: rgba(150,150,165,0.7); font-style: italic;';
                addBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    addProfile();
                });
                profilesPanel.appendChild(addBtn);
            }
        }

        function startRenameProfile(idx, row, _btn) {
            row.innerHTML = '';
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.value = profiles[idx].name;
            inp.style.cssText = INPUT_STYLE + 'flex: 1;';

            let saved = false;
            function doRename() {
                if (saved) return;
                saved = true;
                const name = inp.value.trim() || profiles[idx].name;
                profiles[idx].name = name;
                buildProfilesPanel();
                saveState();
            }

            inp.addEventListener('keydown', e => {
                e.stopPropagation();
                if (e.key === 'Enter')  doRename();
                if (e.key === 'Escape') { saved = true; buildProfilesPanel(); }
            });
            inp.addEventListener('blur', doRename);

            const cancelBtn = makeSideBtn('×', 'Cancel', 'rgba(100,50,50,0.5)');
            cancelBtn.addEventListener('click', e => {
                e.stopPropagation();
                saved = true;
                inp.removeEventListener('blur', doRename);
                buildProfilesPanel();
            });

            row.appendChild(inp);
            row.appendChild(cancelBtn);
            inp.focus(); inp.select();
        }

        function addProfile() {
            profiles.push({
                name: `Profile ${profiles.length + 1}`,
                customSlots:  Array(INITIAL_SLOTS).fill(null),
                clickerSlots: Array(INITIAL_SLOTS).fill(null),
            });
            buildProfilesPanel();
            saveState();
        }

        function deleteProfile(idx) {
            if (idx === 0) return;
            profiles.splice(idx, 1);
            if (activeProfile >= profiles.length) activeProfile = profiles.length - 1;
            switchProfile(activeProfile, true);
        }

        function switchProfile(idx, skipSnapshot = false) {
            if (activeCaptureCancel) activeCaptureCancel();
            // Snapshot current profile's slots before switching
            if (!skipSnapshot) {
                profiles[activeProfile].customSlots  = [...customSlots];
                profiles[activeProfile].clickerSlots = [...clickerSlots];
            }

            // Stop all macros
            for (const name of Object.keys(macros)) {
                stopMacro(name);
                const m = macros[name];
                if (m?.btn) setButtonOff(m.btn);
            }

            // Remove all clicker markers and CSS boxes
            for (let i = 0; i < visibleClickerSlots; i++) { removeMarker(i); removeCssBox(i); }

            // Tear down custom slot UIs
            while (visibleCustomSlots > 0) {
                const i = --visibleCustomSlots;
                slotEls[i].remove();
                slotEls.splice(i, 1);
                customSlots.splice(i, 1);
            }

            // Tear down clicker slot UIs
            while (visibleClickerSlots > 0) {
                const i = --visibleClickerSlots;
                clickerSlotEls[i].remove();
                clickerSlotEls.splice(i, 1);
                clickerSlots.splice(i, 1);
                clickerMarkers.splice(i, 1);
                clickerCssBoxes.splice(i, 1);
                clickerBtns.splice(i, 1);
            }

            activeProfile = idx;
            const p = profiles[idx];

            // Rebuild from new profile
            const sc = p.customSlots || [];
            while (visibleCustomSlots < Math.max(INITIAL_SLOTS, sc.length)) addCustomSlot();
            sc.forEach((slot, i) => {
                if (i < visibleCustomSlots && slot) { customSlots[i] = slot; buildSlot(i); }
            });
            maybeExpandCustom();

            const sk = p.clickerSlots || [];
            while (visibleClickerSlots < Math.max(INITIAL_SLOTS, sk.length)) addClickerSlot();
            sk.forEach((slot, i) => {
                if (i < visibleClickerSlots && slot) { clickerSlots[i] = slot; buildClickerSlot(i); }
            });
            maybeExpandClickers();

            buildProfilesPanel();
            saveState();
        }

        // =============================================
        //  State persistence
        // =============================================
        let saveTimer  = null;

        function saveState() {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                profiles[activeProfile].customSlots  = [...customSlots];
                profiles[activeProfile].clickerSlots = [...clickerSlots];
                chrome.storage.local.get(stateKey, result => {
                    const existing = result[stateKey] || {};
                    chrome.storage.local.set({
                        [stateKey]: {
                            ...existing,
                            settings:      { ...(existing.settings || {}), ...siteSettings },
                            visible:       panelsCol.style.display !== 'none',
                            activeProfile: activeProfile,
                            profiles:      profiles,
                        }
                    });
                });
            }, 200);
        }

        function applyAppearance() {
            if (!menuInitialized) return;
            const isLight = siteSettings.theme === 'light';
            const opacity = siteSettings.opacity !== undefined ? siteSettings.opacity : 0.6;
            const zoom    = siteSettings.zoom    !== undefined ? siteSettings.zoom    : 1.0;

            wrapper.style.transform       = `scale(${zoom})`;
            wrapper.style.transformOrigin = 'bottom right';
            wrapper.setAttribute('data-mmm', isLight ? 'light' : 'dark');

            const panelBg  = isLight
                ? `rgba(248,250,255,${opacity})`
                : `rgba(18,18,22,${opacity})`;
            const panelBdr = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.1)';
            const textClr  = isLight ? 'rgba(0,0,0,0.95)'  : 'rgba(220,220,220,0.92)';

            for (const panel of [fixedPanel, customPanel, clickerPanel, profilesPanel, popupEditor]) {
                panel.style.background   = panelBg;
                panel.style.borderColor  = panelBdr;
                panel.style.color        = textClr;
            }

            themeStyleEl.textContent = isLight ? `
                [data-mmm="light"] button:not([data-btn-on]) {
                    background: rgba(215,220,235,0.9) !important;
                    color: rgba(0,0,0,0.92) !important;
                    border-color: rgba(0,0,0,0.18) !important;
                }
                [data-mmm="light"] input {
                    background: rgba(255,255,255,0.95) !important;
                    color: rgba(0,0,0,0.92) !important;
                    border-color: rgba(0,0,0,0.25) !important;
                }
                [data-mmm="light"] [data-mmm-header] {
                    color: rgba(255,255,255,0.75) !important;
                    border-bottom-color: rgba(255,255,255,0.2) !important;
                }
                [data-mmm="light"] [data-mmm-drag] circle {
                    fill: rgba(40,40,60,0.65) !important;
                }
                [data-mmm="light"] [data-mmm-secondary] {
                    color: rgba(40,40,60,0.6) !important;
                }
            ` : '';
        }

        function alignProfilesCol() {
            // Offset profilesCol upward by toggleRow height + mainCol gap so it sits
            // beside the panels rather than beside the toggleRow
            profilesCol.style.marginBottom = (toggleRow.offsetHeight + 5) + 'px';
        }

        function restoreState(state) {
            if (!state) { buildProfilesPanel(); applyAppearance(); alignProfilesCol(); return; }

            if (state.visible === false) {
                panelsCol.style.display = 'none';
                profilesCol.style.display = 'none';
            }

            if (state.profiles) {
                profiles      = state.profiles;
                activeProfile = state.activeProfile || 0;
            } else if (state.customSlots || state.clickerSlots) {
                // Migrate: wrap old flat format into Profile 1
                profiles = [{
                    name: 'Profile 1',
                    customSlots:  state.customSlots  || [],
                    clickerSlots: state.clickerSlots || [],
                }];
                activeProfile = 0;
            }

            const p = profiles[activeProfile] || profiles[0];

            const sc = p.customSlots || [];
            while (visibleCustomSlots < Math.min(sc.length, MAX_SLOTS)) addCustomSlot();
            sc.forEach((slot, i) => {
                if (i < visibleCustomSlots && slot) { customSlots[i] = slot; buildSlot(i); }
            });

            const sk = p.clickerSlots || [];
            while (visibleClickerSlots < Math.min(sk.length, MAX_SLOTS)) addClickerSlot();
            sk.forEach((slot, i) => {
                if (i < visibleClickerSlots && slot) { clickerSlots[i] = slot; buildClickerSlot(i); }
            });

            maybeExpandCustom();
            maybeExpandClickers();
            buildProfilesPanel();
            buildFixedMacro('click', autoClickEl);
            buildFixedMacro('keyM',  autoMEl);
            applyPanelPos();
            applyAppearance();
            alignProfilesCol();
        }

        // =============================================
        //  Panel positioning helper
        // =============================================
        function applyPanelPos() {
            const pos = siteSettings.panelPos;
            if (pos && pos.left !== null && !isNaN(pos.left)) {
                wrapper.style.right = '';
                wrapper.style.left  = pos.left + 'px';
                if (pos.bottom !== undefined && !isNaN(pos.bottom)) {
                    wrapper.style.top    = '';
                    wrapper.style.bottom = pos.bottom + 'px';
                } else if (pos.top !== null && !isNaN(pos.top)) {
                    // legacy saves stored top; keep working
                    wrapper.style.bottom = '';
                    wrapper.style.top    = pos.top + 'px';
                }
            } else {
                wrapper.style.left   = '';
                wrapper.style.top    = '';
                wrapper.style.bottom = '14px';
                wrapper.style.right  = '14px';
            }
        }

        resetPanelPosFn = function() {
            siteSettings.panelPos = null;
            applyPanelPos();
            saveState();
        };

        // =============================================
        //  Drag handlers
        // =============================================
        function onDragMove(e) {
            if (!isDragging) return;
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                if (!didDragMove) {
                    didDragMove = true;
                    wrapper.style.bottom = '';
                    wrapper.style.right  = '';
                }
                const zoom = siteSettings.zoom || 1.0;
                // transform-origin: bottom right, so visual extents expand left/upward when zoomed
                const minLeft = wrapper.offsetWidth  * (zoom - 1);
                const minTop  = wrapper.offsetHeight * (zoom - 1);
                const newLeft = Math.max(minLeft, Math.min(window.innerWidth  - wrapper.offsetWidth,  wrapperStartLeft + dx));
                const newTop  = Math.max(minTop,  Math.min(window.innerHeight - wrapper.offsetHeight, wrapperStartTop  + dy));
                wrapper.style.left = newLeft + 'px';
                wrapper.style.top  = newTop  + 'px';
            }
        }

        function onDragUp(e) {
            if (!isDragging || e.button !== 0) return;
            isDragging = false;
            checkLabel.style.cursor = 'grab';
            if (didDragMove) {
                const left   = parseInt(wrapper.style.left, 10);
                const top    = parseInt(wrapper.style.top,  10);
                const bottom = window.innerHeight - top - wrapper.offsetHeight;
                siteSettings.panelPos = { left, bottom };
                saveState();
            }
        }

        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup',   onDragUp);
        teardownFns.push(() => document.removeEventListener('mousemove', onDragMove));
        teardownFns.push(() => document.removeEventListener('mouseup',   onDragUp));

        // =============================================
        //  Assemble — CLICKERS (top), CUSTOM, MACROS (bottom)
        // =============================================
        panelsCol.appendChild(clickerPanel);
        panelsCol.appendChild(customPanel);
        panelsCol.appendChild(fixedPanel);
        mainCol.appendChild(popupEditor);
        mainCol.appendChild(toggleRow);
        mainCol.appendChild(panelsCol);
        profilesCol.appendChild(profilesPanel);
        wrapper.appendChild(profilesCol);
        wrapper.appendChild(mainCol);

        // Inject into <html> to avoid CSS transform traps on <body>
        function injectWrapper() {
            if (document.documentElement.contains(wrapper)) return;
            document.documentElement.appendChild(wrapper);
        }
        injectWrapper();
        const mo = new MutationObserver(injectWrapper);
        mo.observe(document.documentElement, { childList: true });
        teardownFns.push(() => mo.disconnect());
        menuRoot = wrapper;

        // Load saved state for this site
        chrome.storage.local.get(stateKey, result => {
            const saved = result[stateKey];
            if (saved?.settings) {
                Object.assign(siteSettings, saved.settings);
                if (!siteSettings.pauseKey) siteSettings.pauseKey = 'F9';
            }
            restoreState(saved);
        });
    }

})();
