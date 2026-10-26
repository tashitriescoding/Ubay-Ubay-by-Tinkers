(() => {
  const app = document.getElementById('admin-app');
  if (!app) return;

  const $ = (id) => document.getElementById(id);
  const SESSION_KEY = 'ubay-staff';
  const CACHE_KEY = 'ubay-staff-cache';
  const loginBox = $('login-box'), setupBox = $('setup-box');
  const topUser = $('staff-top-user'), listBox = $('staff-list'), status = $('admin-status');

  let creds = null, me = null, signups = [], tile = 'needs', openId = null;

  try { creds = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { creds = null; }

  const toastEl = document.createElement('div');
  toastEl.className = 'toast'; toastEl.setAttribute('role', 'status');
  document.body.append(toastEl);
  let toastTimer = null;
  function toast(message, isError) {
    toastEl.textContent = message;
    toastEl.classList.toggle('is-error', Boolean(isError));
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), isError ? 5000 : 2200);
  }
  const setStatus = (node, message, isError) => {
    node.textContent = message || '';
    node.classList.toggle('is-error', Boolean(isError));
    // Also pop a toast for the main dashboard status so feedback is always visible
    if (node === status && message && !/…$/.test(message)) toast(message, isError);
  };
  // Put a button into a loading state; returns a function that restores it
  function busy(button, text) {
    const original = button.textContent;
    button.disabled = true;
    button.classList.add('is-loading');
    if (text) button.textContent = text;
    return (doneText) => {
      button.classList.remove('is-loading');
      button.disabled = false;
      button.textContent = original;
      if (doneText) {
        button.textContent = doneText; button.classList.add('is-done');
        setTimeout(() => { button.textContent = original; button.classList.remove('is-done'); }, 1200);
      }
    };
  }
  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : '-');
  const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString() : '-');

  async function staffCall(action, extra) {
    try {
      return await callScript({ action, staff: creds.staff, password: creds.password, ...extra });
    } catch (error) {
      if (error.result && error.result.auth) showLogin(error.message);
      throw error;
    }
  }

  /* ---------- login / setup / logout ---------- */
  function showLogin(message) {
    creds = null; me = null;
    try { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(CACHE_KEY); } catch (e) {}
    app.hidden = true; topUser.hidden = true; setupBox.hidden = true;
    loginBox.hidden = false;
    setStatus($('login-status'), message || '', Boolean(message));
  }

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const staff = $('staff-name').value.trim();
    const password = $('staff-password').value;
    if (!staff || !password) { setStatus($('login-status'), 'Type your name and the staff password.', true); return; }
    const button = $('login-button');
    const restore = busy(button, 'Logging in…');
    setStatus($('login-status'), 'Checking…');
    creds = { staff, password };
    try {
      await load(true);
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(creds)); } catch (e) {}
      $('staff-password').value = '';
      setStatus($('login-status'), '');
    } catch (error) {
      if (!loginBox.hidden) setStatus($('login-status'), plainError(error), true);
    } finally { restore(); }
  });

  $('show-setup').addEventListener('click', (e) => { e.preventDefault(); loginBox.hidden = true; setupBox.hidden = false; });
  $('setup-back').addEventListener('click', (e) => { e.preventDefault(); setupBox.hidden = true; loginBox.hidden = false; });

  $('setup-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = $('setup-name').value.trim(), pw = $('setup-password').value;
    const out = $('setup-status');
    if (pw !== $('setup-password2').value) { setStatus(out, "Passwords don't match.", true); return; }
    const restoreSetup = busy($('setup-button'), 'Creating…');
    setStatus(out, 'Creating…');
    try {
      await callScript({ action: 'staffRegister', newName: name, newPassword: pw, setupCode: $('setup-code').value });
      creds = { staff: name, password: pw };
      await load(true);
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(creds)); } catch (e) {}
      $('setup-form').reset();
      setStatus(out, '');
    } catch (error) {
      setStatus(out, plainError(error), true);
    } finally { restoreSetup(); }
  });

  $('logout-button').addEventListener('click', () => { toast('Logged out'); showLogin(''); });
  $('refresh-button').addEventListener('click', () => {
    const restore = busy($('refresh-button'), 'Refreshing…');
    (staffTabActive() ? loadStaffAccounts() : load())
      .then(() => { restore('Updated ✓'); })
      .catch((e) => { restore(); setStatus(status, plainError(e), true); });
  });

  /* ---------- load ---------- */
  function applyData(result) {
    signups = result.signups || [];
    me = result.me;
    loginBox.hidden = true; setupBox.hidden = true;
    app.hidden = false; topUser.hidden = false;
    $('staff-shown').textContent = me.name;
    $('tab-staff').hidden = me.role !== 'admin';
    render();
  }

  async function load(touch) {
    setStatus(status, '');
    const result = await staffCall('staffList', { touch: Boolean(touch) });
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ signups: result.signups, me: result.me })); } catch (e) {}
    applyData(result);
  }

  /* ---------- tabs ---------- */
  const staffTabActive = () => $('tab-staff').classList.contains('is-active');
  function switchTab(which) {
    const staffTab = which === 'staff';
    $('tab-signups').classList.toggle('is-active', !staffTab);
    $('tab-staff').classList.toggle('is-active', staffTab);
    $('tab-signups').setAttribute('aria-selected', String(!staffTab));
    $('tab-staff').setAttribute('aria-selected', String(staffTab));
    $('panel-signups').hidden = staffTab;
    $('panel-staff').hidden = !staffTab;
    $('page-title').textContent = staffTab ? 'Staff accounts' : 'Sign-ups';
    if (staffTab) loadStaffAccounts().catch((e) => setStatus(status, plainError(e), true));
  }
  $('tab-signups').addEventListener('click', () => switchTab('signups'));
  $('tab-staff').addEventListener('click', () => switchTab('staff'));

  /* ---------- filters ---------- */
  const tiles = Array.from(document.querySelectorAll('.stat-tile'));
  function setTile(value) {
    tile = value;
    tiles.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.filter === tile)));
  }
  tiles.forEach((t) => t.addEventListener('click', () => {
    ['f-status', 'f-replied', 'f-uploads'].forEach((id) => { $(id).value = 'all'; });
    setTile(tile === t.dataset.filter ? null : t.dataset.filter);
    render();
  }));
  ['f-status', 'f-replied', 'f-uploads'].forEach((id) => $(id).addEventListener('change', () => { setTile(null); render(); }));
  ['f-signed', 'f-sort', 'f-hide-test'].forEach((id) => $(id).addEventListener('change', render));
  $('f-q').addEventListener('input', render);
  $('staff-filters').addEventListener('submit', (e) => e.preventDefault());
  $('clear-filters').addEventListener('click', () => {
    $('f-q').value = '';
    $('f-status').value = $('f-replied').value = $('f-uploads').value = 'all';
    $('f-signed').value = 'any'; $('f-sort').value = 'oldest'; $('f-hide-test').checked = false;
    setTile(null); render(); toast('Filters cleared');
  });

  function filtered() {
    const q = $('f-q').value.trim().toLowerCase();
    const st = $('f-status').value, rep = $('f-replied').value, up = $('f-uploads').value;
    const signed = $('f-signed').value, sort = $('f-sort').value, hideTest = $('f-hide-test').checked;
    const now = new Date();
    const list = signups.filter((s) => {
      if (hideTest && s.test) return false;
      if (tile === 'needs' && s.replied) return false;
      if ((tile === 'Accepted' || tile === 'Declined') && s.status !== tile) return false;
      if (tile === 'uploads' && !s.uploadedThisMonth) return false;
      if (q && ![s.artistName, s.fullName, s.email, s.social].join(' ').toLowerCase().includes(q)) return false;
      if (st !== 'all' && s.status !== st) return false;
      if (rep === 'no' && s.replied) return false;
      if (rep === 'yes' && !s.replied) return false;
      if (up === 'month' && !s.uploadedThisMonth) return false;
      if (up === 'any' && !s.uploads.length) return false;
      if (up === 'none' && s.uploads.length) return false;
      const t = new Date(s.timestamp);
      if (signed === 'week' && now - t > 7 * 864e5) return false;
      if (signed === 'month' && (t.getMonth() !== now.getMonth() || t.getFullYear() !== now.getFullYear())) return false;
      return true;
    });
    list.sort((a, b) => sort === 'name' ? a.artistName.localeCompare(b.artistName)
      : sort === 'newest' ? new Date(b.timestamp) - new Date(a.timestamp)
      : new Date(a.timestamp) - new Date(b.timestamp));
    return list;
  }

  /* ---------- render sign-ups ---------- */
  function render() {
    const base = $('f-hide-test').checked ? signups.filter((s) => !s.test) : signups;
    const needs = base.filter((s) => !s.replied).length;
    const uploads = base.filter((s) => s.uploadedThisMonth).length;
    $('count-needs').textContent = needs;
    $('note-needs').textContent = needs ? 'Waiting for a reply' : 'All caught up';
    $('count-accepted').textContent = base.filter((s) => s.status === 'Accepted').length;
    $('count-declined').textContent = base.filter((s) => s.status === 'Declined').length;
    $('count-uploads').textContent = uploads;

    const list = filtered();
    $('staff-showing').textContent = `Showing ${list.length} of ${signups.length}`;
    listBox.replaceChildren();

    if (!list.length) {
      const empty = el('div', 'staff-empty');
      empty.append(el('p', 'staff-empty-title', signups.length ? 'No sign-ups match these filters.' : 'No sign-ups in the database yet.'));
      listBox.append(empty);
      return;
    }

    const head = el('div', 'srow-titles');
    ['Artist', 'Full Name', 'Email', 'Signed', 'Status', 'Waiting', ''].forEach((t) => head.append(el('span', '', t)));
    listBox.append(head);
    list.forEach((s) => listBox.append(renderRow(s)));
  }

  function renderRow(s) {
    const isOpen = openId === s.id;
    const box = el('article', 'srow' + (isOpen ? ' is-open' : ''));
    const headBtn = el('button', 'srow-head');
    headBtn.type = 'button';
    headBtn.setAttribute('aria-expanded', String(isOpen));
    const artist = el('span', 'srow-artist');
    artist.append(el('strong', '', s.artistName));
    if (s.test) artist.append(el('span', 'tag tag-inactive', 'test'));
    headBtn.append(
      artist,
      el('span', 'srow-full', s.fullName || '-'),
      el('span', 'srow-email', s.email || '-'),
      el('span', 'srow-date', fmtDate(s.timestamp)),
      el('span', 'tag tag-' + s.status.toLowerCase(), s.status),
      el('span', 'srow-wait', s.replied ? 'Replied' : 'Waiting'),
      el('span', 'srow-chevron', '›')
    );
    headBtn.addEventListener('click', () => { openId = isOpen ? null : s.id; render(); });
    box.append(headBtn);
    if (isOpen) box.append(renderDetail(s));
    return box;
  }

  function renderDetail(s) {
    const wrap = el('div', 'srow-detail');
    const dl = el('dl', 'detail-grid');
    const add = (label, value) => { const d = el('div'); d.append(el('dt', '', label), el('dd', '', value || '-')); dl.append(d); };
    add('Social', s.social);
    add('Date signed', s.dateSigned);
    add('Signed at', fmtDateTime(s.timestamp));
    add('Letter version', s.letterVersion);
    add('Decided', s.decidedBy ? `${s.decidedBy}, ${fmtDateTime(s.decidedAt)}` : '-');
    add('Replied', s.replied ? `${s.repliedBy}, ${fmtDateTime(s.repliedAt)}` : 'Not yet');
    wrap.append(dl);

    const links = el('div', 'detail-links');
    const link = (text, href) => { const a = el('a', '', text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; links.append(a); };
    if (s.pdfUrl) link('Signed letter (PDF)', s.pdfUrl);
    if (s.signatureUrl) link('Signature image', s.signatureUrl);
    link('Email artist', 'mailto:' + s.email);
    s.uploads.forEach((u) => link('Upload: ' + (u.name || 'file'), u.url));
    wrap.append(links);

    const notes = el('textarea', 'detail-notes');
    notes.value = s.notes || '';
    notes.placeholder = 'Internal notes (artists never see these)';
    wrap.append(notes);

    const actions = el('div', 'detail-actions');
    const btn = (text, cls, fields) => {
      const b = el('button', 'button button-small ' + cls, text);
      b.type = 'button';
      b.addEventListener('click', () => update(s, fields(), b));
      actions.append(b);
    };
    if (s.status !== 'Accepted') btn('Accept', 'button-primary', () => ({ status: 'Accepted' }));
    if (s.status !== 'Declined') btn('Decline', 'button-ghost', () => ({ status: 'Declined' }));
    if (s.status !== 'New') btn('Back to New', 'button-ghost', () => ({ status: 'New' }));
    btn(s.replied ? 'Mark not replied' : 'Mark replied', 'button-secondary', () => ({ replied: !s.replied }));
    btn('Save note', 'button-secondary', () => ({ notes: notes.value }));
    wrap.append(actions);
    return wrap;
  }

  async function update(s, fields, button) {
    const restore = busy(button, 'Saving…');
    // disable sibling buttons so you can't double-click conflicting actions
    const siblings = Array.from(button.parentElement.querySelectorAll('button')).filter((b) => b !== button && !b.disabled);
    siblings.forEach((b) => { b.disabled = true; });
    setStatus(status, 'Saving…');
    try {
      const result = await staffCall('staffUpdate', { id: s.id, ...fields });
      signups = signups.map((x) => (x.id === s.id ? result.signup : x));
      setStatus(status, 'Saved ✓');
      render();
    } catch (error) {
      restore();
      siblings.forEach((b) => { b.disabled = false; });
      setStatus(status, plainError(error), true);
    }
  }

  $('copy-emails').addEventListener('click', async () => {
    const emails = Array.from(new Set(filtered().map((s) => s.email).filter(Boolean))).join(', ');
    if (!emails) { setStatus(status, 'No emails to copy.', true); return; }
    try {
      await navigator.clipboard.writeText(emails);
      $('copy-emails').classList.add('is-done');
      const old = $('copy-emails').textContent;
      $('copy-emails').textContent = 'Copied ✓';
      setTimeout(() => { $('copy-emails').textContent = old; $('copy-emails').classList.remove('is-done'); }, 1200);
      setStatus(status, 'Copied ' + emails.split(',').length + ' email(s).');
    }
    catch (e) { window.prompt('Copy these emails:', emails); }
  });

  /* ---------- staff accounts (admins) ---------- */
  async function loadStaffAccounts() {
    const result = await staffCall('staffListStaff');
    const box = $('staff-accounts');
    box.replaceChildren();
    result.staff.forEach((a) => {
      const row = el('div', 'staff-account-row');
      row.append(
        el('strong', '', a.name),
        el('span', 'tag tag-' + a.role, a.role),
        el('span', 'srow-date', 'Last login: ' + (a.lastLogin ? fmtDateTime(a.lastLogin) : 'never')),
        el('span', 'tag tag-' + (a.active ? 'accepted' : 'inactive'), a.active ? 'Active' : 'Inactive')
      );
      const actions = el('div', 'actions');
      const reset = el('button', 'button button-ghost button-small', 'Reset password');
      reset.type = 'button';
      reset.addEventListener('click', async () => {
        const pw = window.prompt('New password for ' + a.name + ' (8+ characters):');
        if (!pw) return;
        const restore = busy(reset, 'Resetting…');
        try { await staffCall('staffResetPassword', { target: a.name, newPassword: pw }); setStatus(status, 'Password reset for ' + a.name + '.'); }
        catch (e) { setStatus(status, plainError(e), true); }
        finally { restore(); }
      });
      const toggle = el('button', 'button button-ghost button-small', a.active ? 'Deactivate' : 'Reactivate');
      toggle.type = 'button';
      toggle.addEventListener('click', async () => {
        const restore = busy(toggle, 'Saving…');
        try { await staffCall('staffSetActive', { target: a.name, active: !a.active }); await loadStaffAccounts(); setStatus(status, a.name + (a.active ? ' deactivated.' : ' reactivated.')); }
        catch (e) { restore(); setStatus(status, plainError(e), true); }
      });
      actions.append(reset, toggle);
      row.append(actions);
      box.append(row);
    });
  }

  $('register-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const out = $('register-status');
    const restoreReg = busy($('register-button'), 'Adding…');
    setStatus(out, 'Registering…');
    try {
      await staffCall('staffRegister', { newName: $('new-name').value, newPassword: $('new-password').value, newRole: $('new-role').value });
      setStatus(out, 'Account created. Share the temporary password privately.');
      $('register-form').reset();
      await loadStaffAccounts();
    } catch (error) { setStatus(out, plainError(error), true); }
    finally { restoreReg(); }
  });

  $('change-password').addEventListener('click', async () => {
    const pw = window.prompt('Your new password (8+ characters):');
    if (!pw) return;
    const restore = busy($('change-password'), 'Saving…');
    try {
      await staffCall('staffChangePassword', { newPassword: pw });
      creds.password = pw;
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(creds)); } catch (e) {}
      setStatus(status, 'Password changed.');
    } catch (e) { setStatus(status, plainError(e), true); }
    finally { restore(); }
  });

  /* ---------- boot ---------- */
  if (creds && creds.staff && creds.password) {
    let cached = null;
    try { cached = JSON.parse(sessionStorage.getItem(CACHE_KEY)); } catch (e) { cached = null; }
    if (cached && cached.me) {
      // Show last known data instantly, then refresh quietly in the background
      applyData(cached);
      setStatus(status, 'Updating…');
      load().then(() => setStatus(status, ''))
        .catch((error) => { console.error(error); setStatus(status, 'Showing saved data. Could not update: ' + plainError(error), true); });
    } else {
      loginBox.hidden = false;
      setStatus($('login-status'), 'Restoring your session… this can take a few seconds.');
      load().then(() => setStatus($('login-status'), ''))
        .catch((error) => { console.error('Session restore failed:', error); showLogin(plainError(error)); });
    }
  } else {
    showLogin('');
  }
})();