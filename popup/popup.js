// popup.js — runs inside the extension popup window

(async function () {

    const siteNameEl  = document.getElementById('site-name');
    const siteToggle  = document.getElementById('site-toggle');
    const siteStatus  = document.getElementById('site-status');
    const siteList    = document.getElementById('site-list');
    const siteCount   = document.getElementById('site-count');
    const emptyState  = document.getElementById('empty-state');
    const settingsSection = document.getElementById('settings-section');
    const pauseKeyInput   = document.getElementById('pause-key-input');
    const counterToggle   = document.getElementById('counter-toggle');
    const jitterToggle    = document.getElementById('jitter-toggle');
    const jitterPctInput  = document.getElementById('jitter-pct-input');
    const jitterPctRow    = document.getElementById('jitter-pct-row');
    const exportBtn       = document.getElementById('export-btn');
    const importBtn       = document.getElementById('import-btn');
    const importFile      = document.getElementById('import-file');

    // ── Grab current tab info ──────────────────────────────────────────────
    let tab, hostname;
    try {
        [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    } catch (e) {
        siteNameEl.textContent = 'Error';
        siteStatus.textContent = 'tabs.query failed: ' + e.message;
        return;
    }

    try {
        hostname = (tab?.url && /^https?:/.test(tab.url)) ? new URL(tab.url).hostname : null;
    } catch (e) {
        hostname = null;
    }

    // ── Load whitelist ─────────────────────────────────────────────────────
    let { whitelist = [] } = await chrome.storage.sync.get({ whitelist: [] });

    function isOnList(host) {
        return whitelist.includes(host);
    }

    // ── Render current site row ────────────────────────────────────────────
    if (!hostname) {
        siteNameEl.textContent = tab?.url ?? 'No tab found';
        siteToggle.disabled = true;
        siteStatus.textContent = 'Cannot run on this page.';
    } else {
        siteNameEl.textContent = hostname;
        siteToggle.checked = isOnList(hostname);
        updateStatus();
        updateSettingsVisibility();
        if (siteToggle.checked) loadSiteSettings();
    }

    function updateStatus() {
        if (siteToggle.checked) {
            siteStatus.textContent = 'Macro menu active on this site.';
        } else {
            siteStatus.textContent = 'Toggle to enable the macro menu here.';
        }
    }

    function showReloadNotice() {
        siteStatus.textContent = 'Reload the page to activate. ';
        const btn = document.createElement('button');
        btn.textContent = 'Reload now';
        btn.className = 'reload-btn';
        btn.addEventListener('click', () => { chrome.tabs.reload(tab.id); window.close(); });
        siteStatus.appendChild(btn);
    }

    async function sendToTab(type) {
        try {
            await chrome.tabs.sendMessage(tab.id, { type });
            return true;
        } catch {
            return false;
        }
    }

    async function loadSiteSettings() {
        if (!hostname) return;
        const key = `state:${hostname}`;
        const result = await chrome.storage.local.get(key);
        const settings = (result[key] || {}).settings || {};
        pauseKeyInput.value = settings.pauseKey || 'F9';
        counterToggle.checked = settings.counterEnabled !== false;
        jitterToggle.checked    = settings.jitterEnabled !== false;
        jitterPctInput.value    = settings.jitterPct !== undefined ? settings.jitterPct : 10;
        jitterPctRow.style.display = jitterToggle.checked ? 'flex' : 'none';
    }

    async function saveSiteSetting(patch) {
        if (!hostname) return;
        const key = `state:${hostname}`;
        const result = await chrome.storage.local.get(key);
        const state = result[key] || {};
        state.settings = { ...(state.settings || {}), ...patch };
        await chrome.storage.local.set({ [key]: state });
    }

    function updateSettingsVisibility() {
        settingsSection.style.display = (hostname && siteToggle.checked) ? 'block' : 'none';
    }

    pauseKeyInput.addEventListener('blur', () =>
        saveSiteSetting({ pauseKey: pauseKeyInput.value.trim() || 'F9' }).catch(console.error)
    );
    pauseKeyInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') pauseKeyInput.blur();
    });

    counterToggle.addEventListener('change', () =>
        saveSiteSetting({ counterEnabled: counterToggle.checked }).catch(console.error)
    );

    jitterToggle.addEventListener('change', () => {
        saveSiteSetting({ jitterEnabled: jitterToggle.checked }).catch(console.error);
        jitterPctRow.style.display = jitterToggle.checked ? 'flex' : 'none';
    });
    jitterPctInput.addEventListener('blur', () => {
        const v = parseFloat(jitterPctInput.value);
        const clamped = (isNaN(v) || v < 0) ? 10 : Math.min(v, 100);
        jitterPctInput.value = clamped;
        saveSiteSetting({ jitterPct: clamped }).catch(console.error);
    });
    jitterPctInput.addEventListener('keydown', e => { if (e.key === 'Enter') jitterPctInput.blur(); });

    siteToggle.addEventListener('change', async () => {
        if (siteToggle.checked) {
            if (!isOnList(hostname)) whitelist.push(hostname);
        } else {
            whitelist = whitelist.filter(h => h !== hostname);
        }

        await chrome.storage.sync.set({ whitelist });
        updateStatus();
        renderList();
        updateSettingsVisibility();
        if (siteToggle.checked) loadSiteSettings();

        const ok = await sendToTab(siteToggle.checked ? 'enable' : 'disable');
        if (!ok && siteToggle.checked) showReloadNotice();
    });

    // ── Render full whitelist ──────────────────────────────────────────────
    function renderList() {
        siteList.innerHTML = '';
        siteCount.textContent = whitelist.length;

        if (whitelist.length === 0) {
            emptyState.classList.add('visible');
            return;
        }
        emptyState.classList.remove('visible');

        for (const entry of [...whitelist].sort()) {
            const li = document.createElement('li');
            if (entry === hostname) li.classList.add('active-site');

            const nameSpan = document.createElement('span');
            nameSpan.className = 'entry-name';
            nameSpan.textContent = entry;
            nameSpan.title = entry;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.textContent = '✕';
            removeBtn.title = `Remove ${entry}`;
            removeBtn.addEventListener('click', async () => {
                whitelist = whitelist.filter(h => h !== entry);
                await chrome.storage.sync.set({ whitelist });

                // If removing the currently active tab's site, also disable the menu
                if (entry === hostname) {
                    siteToggle.checked = false;
                    updateStatus();
                    updateSettingsVisibility();
                    sendToTab('disable');
                }
                renderList();
            });

            li.appendChild(nameSpan);
            li.appendChild(removeBtn);
            siteList.appendChild(li);
        }
    }

    renderList();

    // ── Import / Export ────────────────────────────────────────────────────
    exportBtn.addEventListener('click', async () => {
        const key = `state:${hostname}`;
        const result = await chrome.storage.local.get(key);
        const state = result[key] || {};
        const json = JSON.stringify(state, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `mmm-${hostname}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    importBtn.addEventListener('click', () => importFile.click());

    importFile.addEventListener('change', async () => {
        const file = importFile.files[0];
        if (!file) return;
        try {
            const text  = await file.text();
            const state = JSON.parse(text);
            if (typeof state !== 'object' || state === null || Array.isArray(state)) {
                throw new Error('Invalid format: root must be an object');
            }
            const key = `state:${hostname}`;
            await chrome.storage.local.set({ [key]: state });
            await chrome.tabs.reload(tab.id);
            window.close();
        } catch (e) {
            alert('Import failed: ' + e.message);
        } finally {
            importFile.value = '';
        }
    });

})();
