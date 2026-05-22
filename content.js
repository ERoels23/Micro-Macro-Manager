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
        const val = periodSec < 1
            ? Math.round(periodSec * 1000) / 1000
            : Math.round(periodSec * 10) / 10;
        return `${val}s`;
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
        min-width: 160px;
        box-sizing: border-box;
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
        btn.style.background = 'rgba(80, 180, 100, 0.45)';
        if (!btn.textContent.endsWith('●')) btn.textContent = btn.dataset.label + '  ●';
    }
    function setButtonOff(btn) {
        btn.style.background = 'rgba(50, 50, 55, 0.55)';
        btn.textContent = btn.dataset.label + '  ○';
    }
    function setButtonPending(btn) {
        btn.style.background = 'rgba(190, 120, 30, 0.5)';
        btn.textContent = btn.dataset.label + '  ●';
    }

    function makePanelHeader(text) {
        const h = document.createElement('div');
        h.textContent = text;
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
    let listenersRegistered = false;
    let siteSettings = { pauseKey: 'F9', counterEnabled: true, jitterEnabled: true, jitterPct: 10 };
    let refreshAllMacroDisplaysFn = null; // set by initMenu; called when settings change
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
        const INITIAL_SLOTS = 3;

        // --- Mouse tracking ---
        let mouseX = 0, mouseY = 0;
        document.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });

        // --- Macro engine ---
        let globalPaused = false;
        let pauseBtn     = null; // assigned during fixed-panel construction
        const macros = {}; // name → { timer, active, pending, fn, btn, intervalMs }

        if (!listenersRegistered) {
            listenersRegistered = true;

            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'local' || !changes[stateKey]) return;
                const s = changes[stateKey].newValue?.settings;
                if (s) {
                    Object.assign(siteSettings, s);
                    if (!siteSettings.pauseKey) siteSettings.pauseKey = 'F9';
                    if (refreshAllMacroDisplaysFn) refreshAllMacroDisplaysFn();
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
            const base = btn.dataset.label;
            const hasCap = m.maxActivations || m.timeLimitSec;
            let suffix;
            if (hasCap) {
                const parts = [];
                if (m.maxActivations) parts.push((m.maxActivations - m.count) + 'x');
                if (m.timeLimitSec) {
                    const remain = Math.max(0, m.timeLimitSec - Math.round((Date.now() - m.startTime) / 1000));
                    parts.push(remain + 's');
                }
                suffix = '  [' + parts.join('|') + '] ●';
            } else if (siteSettings.counterEnabled) {
                suffix = '  ' + formatCount(m.count) + ' ●';
            } else {
                suffix = '  ●';
            }
            btn.textContent = base + suffix;
        }

        // Expose a refresh callback at IIFE scope so the onChanged listener can
        // immediately re-render all active/pending buttons when settings change.
        refreshAllMacroDisplaysFn = function () {
            for (const [name, m] of Object.entries(macros)) {
                if ((m.active || m.pending) && m.btn) updateMacroButtonDisplay(name, m.btn);
            }
        };

        function startMacro(name, rawFn, btn, intervalMs) {
            if (macros[name]?.active) return;
            const fn = function () {
                rawFn();
                const m = macros[name];
                if (!m) return;
                m.count++;
                updateMacroButtonDisplay(name, btn);
            };
            macros[name] = { timer: null, active: false, pending: false, fn, rawFn, btn, intervalMs,
                             count: 0, startTime: Date.now(), maxActivations: null, timeLimitSec: null };
            if (globalPaused) {
                macros[name].pending = true;
                if (btn) setButtonPending(btn);
            } else {
                macros[name].timer  = setInterval(fn, intervalMs);
                macros[name].active = true;
                if (btn) setButtonOn(btn);
            }
        }
        function stopMacro(name) {
            if (!macros[name]) return;
            clearInterval(macros[name].timer);
            macros[name].timer   = null;
            macros[name].active  = false;
            macros[name].pending = false;
        }
        function isMacroActive(name) {
            return macros[name]?.active ?? false;
        }
        function toggleMacro(name, fn, btn, intervalMs) {
            const m = macros[name];
            if (m?.active || m?.pending) {
                stopMacro(name); setButtonOff(btn);
            } else {
                startMacro(name, fn, btn, intervalMs);
            }
        }
        function setPauseAll(paused) {
            globalPaused = paused;
            if (paused) {
                for (const m of Object.values(macros)) {
                    if (m.active) {
                        clearInterval(m.timer);
                        m.timer   = null;
                        m.active  = false;
                        m.pending = true;
                        if (m.btn) setButtonPending(m.btn);
                    }
                }
            } else {
                for (const m of Object.values(macros)) {
                    if (m.pending) {
                        m.timer   = setInterval(m.fn, m.intervalMs);
                        m.active  = true;
                        m.pending = false;
                        if (m.btn) setButtonOn(m.btn);
                    }
                }
            }
            if (pauseBtn) {
                if (paused) {
                    pauseBtn.style.background = 'rgba(180, 50, 50, 0.6)';
                    pauseBtn.textContent = pauseBtn.dataset.label + '  ●';
                } else {
                    setButtonOff(pauseBtn);
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

        function makeToggleButton(label, name, fn, intervalMs) {
            const btn = document.createElement('button');
            btn.dataset.label = label;
            btn.style.cssText = BTN_STYLE;
            setButtonOff(btn);
            btn.addEventListener('click', e => {
                e.stopPropagation();
                toggleMacro(name, fn, btn, intervalMs);
            });
            return btn;
        }

        // =============================================
        //  Wrapper (outermost, fixed bottom-right)
        // =============================================
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: fixed;
            bottom: 14px;
            right: 14px;
            z-index: 2147483647;
            font-family: monospace;
            font-size: 12px;
            user-select: none;
            display: flex;
            flex-direction: column-reverse;
            align-items: flex-end;
            gap: 5px;
        `;

        const toggleRow = document.createElement('div');
        toggleRow.style.cssText = `display: flex; align-items: center; gap: 5px;`;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = false; // restored from storage below
        checkbox.style.cssText = `cursor: pointer; margin: 0; accent-color: #aaa;`;

        const checkLabel = document.createElement('span');
        checkLabel.textContent = 'MMM';
        checkLabel.style.cssText = `
            color: rgba(200, 200, 200, 0.8);
            cursor: pointer;
            text-shadow: 0 1px 3px rgba(0,0,0,0.9);
            font-size: 11px;
        `;

        const panelsCol = document.createElement('div');
        panelsCol.style.cssText = `display: flex; flex-direction: column; gap: 8px;`;
        panelsCol.style.display = 'none'; // restored from storage below

        function setPanelsVisible(visible) {
            panelsCol.style.display = visible ? 'flex' : 'none';
            saveState();
        }

        checkLabel.addEventListener('click', () => {
            checkbox.checked = !checkbox.checked;
            setPanelsVisible(checkbox.checked);
        });
        checkbox.addEventListener('change', () => setPanelsVisible(checkbox.checked));

        toggleRow.appendChild(checkbox);
        toggleRow.appendChild(checkLabel);

        // =============================================
        //  Fixed macros panel (bottom of stack)
        // =============================================
        const fixedPanel = document.createElement('div');
        fixedPanel.style.cssText = PANEL_STYLE;
        fixedPanel.appendChild(makePanelHeader('MicroMacroManager'));
        fixedPanel.appendChild(makeToggleButton('Auto-Click', 'click', doClick,          100));
        fixedPanel.appendChild(makeToggleButton('Auto-M',     'keyM',  () => doKey('m'), 100));

        pauseBtn = document.createElement('button');
        pauseBtn.dataset.label = 'Pause All';
        pauseBtn.style.cssText = BTN_STYLE;
        setButtonOff(pauseBtn);
        pauseBtn.addEventListener('click', e => {
            e.stopPropagation();
            setPauseAll(!globalPaused);
        });
        fixedPanel.appendChild(pauseBtn);

        // =============================================
        //  Custom key macros panel (middle of stack)
        // =============================================
        const customPanel = document.createElement('div');
        customPanel.style.cssText = PANEL_STYLE;
        customPanel.appendChild(makePanelHeader('Keystrokes'));

        const customSlots = [];
        const slotEls     = [];
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

            const row = document.createElement('div');
            row.style.cssText = 'display: flex; gap: 4px; width: 100%;';

            const label     = `${parsed.keys.toUpperCase()}  ${periodLabel(parsed.intervalMs / 1000)}`;
            const keyFn     = () => parsed.keys.split('').forEach(k => doKey(k));
            const toggleBtn = document.createElement('button');
            toggleBtn.dataset.label = label;
            toggleBtn.style.cssText = BTN_STYLE + 'flex: 1; min-width: 0;';
            setButtonOff(toggleBtn);
            toggleBtn.addEventListener('click', e => {
                e.stopPropagation();
                toggleMacro(macroName, keyFn, toggleBtn, parsed.intervalMs);
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
                startMacro(macroName, keyFn, toggleBtn, parsed.intervalMs);
            }
        }

        function showKeyEditor(i, prefill = null) {
            const el = slotEls[i];
            el.innerHTML = '';

            const form = document.createElement('div');
            form.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

            const keyInput = document.createElement('input');
            keyInput.type = 'text';
            keyInput.placeholder = 'Keys (e.g. xyz)';
            keyInput.style.cssText = INPUT_STYLE;
            if (prefill) keyInput.value = prefill.keyRaw;
            keyInput.addEventListener('input',   () => { keyInput.value = keyInput.value.toLowerCase(); });
            keyInput.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });

            const periodInput = document.createElement('input');
            periodInput.type        = 'text';
            periodInput.inputMode   = 'decimal';
            periodInput.placeholder = 'Period (sec, blank = 1s)';
            periodInput.style.cssText = INPUT_STYLE;
            if (prefill) periodInput.value = prefill.periodRaw;
            periodInput.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display: flex; gap: 4px;';

            function doSave() {
                customSlots[i] = { keyRaw: keyInput.value, periodRaw: periodInput.value.trim() || '1' };
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
            cancelBtn.addEventListener('click', e => { e.stopPropagation(); buildSlot(i); });

            btnRow.appendChild(saveBtn);
            btnRow.appendChild(cancelBtn);
            form.appendChild(keyInput);
            form.appendChild(periodInput);
            form.appendChild(btnRow);
            el.appendChild(form);
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
        const clickerMarkers = [];
        const clickerBtns    = [];
        let visibleClickerSlots = 0;

        document.addEventListener('mouseleave', () => {
            for (let i = 0; i < visibleClickerSlots; i++) {
                const name = `clicker_${i}`;
                if (isMacroActive(name)) {
                    stopMacro(name);
                    if (clickerBtns[i]) setButtonOff(clickerBtns[i]);
                }
            }
        });

        let activeCaptureCancel = null;

        function validateClickerSlot(slot) {
            const period = parseFloat(slot.periodRaw);
            if (isNaN(period) || !isFinite(period) || period <= 0) return null;
            return { x: slot.x, y: slot.y, intervalMs: Math.round(period * 1000) };
        }

        function createMarker(x, y) {
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
            document.documentElement.appendChild(m);
            return m;
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
                clickerSlotEls[i].remove();
                clickerSlotEls.splice(i, 1);
                clickerSlots.splice(i, 1);
                clickerMarkers.splice(i, 1);
                clickerBtns.splice(i, 1);
            }
        }

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
            clickerMarkers[i] = createMarker(x, y);

            const el = clickerSlotEls[i];
            el.innerHTML = '';

            const form = document.createElement('div');
            form.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

            const posLabel = document.createElement('div');
            posLabel.textContent = `⊕ ${Math.round(x)}, ${Math.round(y)}`;
            posLabel.style.cssText = `color: rgba(150,185,255,0.8); font-size: 11px; padding: 0 2px;`;

            const periodInput = document.createElement('input');
            periodInput.type        = 'text';
            periodInput.inputMode   = 'decimal';
            periodInput.placeholder = 'Period (sec, blank = 1s)';
            periodInput.style.cssText = INPUT_STYLE;
            if (prefillPeriod) periodInput.value = prefillPeriod;
            periodInput.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display: flex; gap: 4px;';

            function doSave() {
                clickerSlots[i] = { x, y, periodRaw: periodInput.value.trim() || '1' };
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
            cancelBtn.addEventListener('click', e => { e.stopPropagation(); buildClickerSlot(i); });

            btnRow.appendChild(saveBtn);
            btnRow.appendChild(cancelBtn);
            form.appendChild(posLabel);
            form.appendChild(periodInput);
            form.appendChild(btnRow);
            el.appendChild(form);
            periodInput.focus();
        }

        function buildClickerSlot(i, autoStart = false) {
            const el = clickerSlotEls[i];
            el.innerHTML = '';
            clickerBtns[i] = null;
            const slot = clickerSlots[i];

            if (!slot) {
                removeMarker(i);
                const addBtn = document.createElement('button');
                addBtn.textContent = '+ clicker ' + (i + 1);
                addBtn.style.cssText = BTN_STYLE +
                    'background: rgba(35,35,42,0.55); color: rgba(150,150,165,0.7); font-style: italic;';
                addBtn.addEventListener('click', e => { e.stopPropagation(); startTargetCapture(i); });
                el.appendChild(addBtn);
                return;
            }

            const macroName = `clicker_${i}`;
            const parsed    = validateClickerSlot(slot);

            if (!parsed) {
                removeMarker(i);
                el.appendChild(makeErrorRow(() => {
                    stopMacro(macroName);
                    clickerSlots[i] = null;
                    buildClickerSlot(i);
                    shrinkClickersToFit();
                    saveState();
                }));
                return;
            }

            removeMarker(i);
            clickerMarkers[i] = createMarker(parsed.x, parsed.y);

            const row = document.createElement('div');
            row.style.cssText = 'display: flex; gap: 4px; width: 100%;';

            const label     = `⊕ ${Math.round(parsed.x)},${Math.round(parsed.y)}  ${periodLabel(parsed.intervalMs / 1000)}`;
            const toggleBtn = document.createElement('button');
            toggleBtn.dataset.label = label;
            toggleBtn.style.cssText = BTN_STYLE + 'flex: 1; min-width: 0;';
            setButtonOff(toggleBtn);
            clickerBtns[i] = toggleBtn;
            toggleBtn.addEventListener('click', e => {
                e.stopPropagation();
                toggleMacro(macroName, () => doClickAt(parsed.x, parsed.y), toggleBtn, parsed.intervalMs);
            });

            const editBtn = makeSideBtn('✎', 'Re-select position', 'rgba(60,80,120,0.45)');
            editBtn.style.fontSize = '11px';
            editBtn.addEventListener('click', e => {
                e.stopPropagation();
                stopMacro(macroName);
                startTargetCapture(i, slot.periodRaw);
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
                startMacro(macroName, () => doClickAt(parsed.x, parsed.y), toggleBtn, parsed.intervalMs);
            }
        }

        for (let i = 0; i < INITIAL_SLOTS; i++) addClickerSlot();

        // =============================================
        //  State persistence
        // =============================================
        let saveTimer  = null;

        function saveState() {
            // Debounce so rapid changes (delete + shrink) only write once
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                chrome.storage.local.get(stateKey, result => {
                    const existing = result[stateKey] || {};
                    chrome.storage.local.set({
                        [stateKey]: {
                            ...existing,
                            visible:      checkbox.checked,
                            customSlots:  [...customSlots],
                            clickerSlots: [...clickerSlots],
                        }
                    });
                });
            }, 200);
        }

        function restoreState(state) {
            if (!state) return;

            if (state.visible) {
                checkbox.checked = true;
                panelsCol.style.display = 'flex';
            }

            const sc = state.customSlots || [];
            while (visibleCustomSlots < Math.min(sc.length, MAX_SLOTS)) addCustomSlot();
            sc.forEach((slot, i) => {
                if (i < visibleCustomSlots && slot) {
                    customSlots[i] = slot;
                    buildSlot(i);
                }
            });

            const sk = state.clickerSlots || [];
            while (visibleClickerSlots < Math.min(sk.length, MAX_SLOTS)) addClickerSlot();
            sk.forEach((slot, i) => {
                if (i < visibleClickerSlots && slot) {
                    clickerSlots[i] = slot;
                    buildClickerSlot(i);
                }
            });

            // Add expand slots if all restored slots are filled
            maybeExpandCustom();
            maybeExpandClickers();
        }

        // =============================================
        //  Assemble — CLICKERS (top), CUSTOM, MACROS (bottom)
        // =============================================
        panelsCol.appendChild(clickerPanel);
        panelsCol.appendChild(customPanel);
        panelsCol.appendChild(fixedPanel);
        wrapper.appendChild(toggleRow);
        wrapper.appendChild(panelsCol);

        // Inject into <html> to avoid CSS transform traps on <body>
        function injectWrapper() {
            if (document.documentElement.contains(wrapper)) return;
            document.documentElement.appendChild(wrapper);
        }
        injectWrapper();
        new MutationObserver(injectWrapper).observe(document.documentElement, { childList: true });
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
