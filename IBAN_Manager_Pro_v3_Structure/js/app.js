/**
 * IBAN Manager Pro v3 — Application Controller
 * Mirrors SwiftUI View + ViewModel layer.
 *
 * Pattern: All render* functions produce HTML (→ SwiftUI View body).
 *          All action* / handle* functions mutate state (→ @Observable model mutations).
 *          Haptic feedback is called at every meaningful interaction.
 */

/* ─── ALIASES ─────────────────────────────── */
const M  = window.IBANModel;      // Model layer
const AS = window.AppState;       // State manager

/* ─── UI STATE (not persisted) ──────────────── */
let pinEntry          = '';
let undoTimer         = null;
let toastTimer        = null;
let liveActivityTimer = null;

/* ════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════ */
function init() {
  // Load persisted state
  const loaded = AS.load();
  if (!loaded || !AS.banks.length) AS.seedDemoData();

  // Init UI
  initColorPicker('colorPick');
  initColorPicker('contactColorPick');
  updateGreeting();
  applySettings();
  renderAll();

  // Lock screen
  if (AS.settings.lock) showLock();

  // Register modal close on backdrop tap
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
  });

  // Privacy on visibility change (iOS backgrounding)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && AS.settings.privacyOnBackground && AS.settings.privacy) {
      document.body.classList.add('privacy-mode');
    }
  });

  // iPad: support keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);

  // Drag & Drop (iPad)
  initDragAndDrop();

  console.log(`[IBAN Manager Pro v${M.APP_VERSION}] Initialized`);
}

/* ════════════════════════════════════════════
   SETTINGS APPLICATION
   ════════════════════════════════════════════ */
function applySettings() {
  const s = AS.settings;

  // Toggles
  const toggleMap = {
    lock: 'togLock', faceid: 'togFaceID', privacy: 'togPrivacy',
    autoBackup: 'togAutoBackup', includeOwner: 'togIncludeOwner',
    iCloudSync: 'togICloud', hapticFeedback: 'togHaptic',
    privacyOnBackground: 'togPrivacyBg',
  };
  Object.entries(toggleMap).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('on', !!s[key]);
  });

  // Privacy mode
  document.body.classList.toggle('privacy-mode', !!s.privacy);

  // Dynamic Type
  ['font-xsmall','font-small','font-normal','font-large','font-xlarge','font-xxlarge']
    .forEach(c => document.body.classList.remove(c));
  document.body.classList.add(`font-${s.fontSize || 'normal'}`);

  // Accessibility
  document.body.classList.toggle('reduce-motion', !!s.reduceMotion);
  document.body.classList.toggle('high-contrast',  !!s.highContrast);
  document.body.classList.toggle('bold-text',       !!s.boldText);

  // Settings display values
  const fontLabels = { xsmall:'Çok Küçük', small:'Küçük', normal:'Normal', large:'Büyük', xlarge:'Çok Büyük', xxlarge:'Devasa' };
  const shareLabels= { ask:'Her seferinde sor', copy:'Kopyala', whatsapp:'WhatsApp', telegram:'Telegram', sms:'SMS', mail:'E-posta', native:'Sistem paylaşımı' };

  setElText('fontSizeVal',  fontLabels[s.fontSize]  || 'Normal');
  setElText('defShareVal',  shareLabels[s.defaultShare] || 'Seçiniz');
  setElText('icloudStatus', s.iCloudSync ? '✓ Aktif' : 'Kapalı');
  setElText('appVersionEl', `v${M.APP_VERSION}`);
}

/* ════════════════════════════════════════════
   RENDER ALL
   ════════════════════════════════════════════ */
function renderAll() {
  renderHome();
  renderBanks();
  renderContacts();
  renderFavs();
  renderStats();
  renderHistory();
}

/* ════════════════════════════════════════════
   HOME
   ════════════════════════════════════════════ */
function renderHome() {
  const total = AS.banks.length;
  const uniq  = new Set(AS.banks.map(b => b.name)).size;

  setElText('homeTotalIban',  `${total} IBAN`);
  setElText('homeTotalBanks', `${uniq} banka · ${total} hesap`);

  const curs = {};
  AS.banks.forEach(b => { curs[b.currency || 'TRY'] = (curs[b.currency || 'TRY'] || 0) + 1; });
  setElHTML('homeBannerChips', Object.entries(curs).map(([c, n]) =>
    `<div class="sb-chip sb-z">${c} ${n}</div>`).join(''));

  // Favorites
  const favs = AS.banks.filter(b => b.fav);
  setElHTML('homeFavs', favs.length
    ? favs.map(b => `<div class="fav-pill" onclick="openDetail('${b.id}')" role="button" aria-label="${b.name} IBAN kopyala">
        <div class="fav-pill-logo" style="background:${b.color}">${M.getBankEmoji(b.name)}</div>
        <div class="fav-pill-name">${b.name}</div>
      </div>`).join('')
    : '<div style="padding:0 4px;color:var(--text3);font-size:13px">Henüz favori yok</div>');

  // Recent contacts
  const rc = [...AS.contacts].sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0)).slice(0, 6);
  setElHTML('homeRecentContacts', rc.length
    ? rc.map(c => `<div class="h-card" onclick="openContactDetail('${c.id}')" role="button">
        <div style="width:40px;height:40px;border-radius:50%;background:${c.color};display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:700;margin-bottom:8px">${M.getInitials(c.name)}</div>
        <div class="h-card-title">${c.name}</div>
        <div class="h-card-sub">${c.bankIds?.length || 0} IBAN</div>
      </div>`).join('')
    : '<div style="color:var(--text3);font-size:13px;padding:4px">Henüz kişi yok</div>');

  // Recent history (top 3)
  const rh = AS.history.slice(0, 3);
  setElHTML('homeRecentHistory', rh.length
    ? `<div class="list-card">${rh.map(h => renderHistoryItem(h)).join('')}</div>`
    : '<div class="empty" style="padding:30px"><div class="empty-icon">📋</div><div class="empty-title" style="font-size:16px">İşlem Yok</div></div>');

  // Recent banks
  const recent = [...AS.banks].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 3);
  setElHTML('homeRecent', recent.length
    ? `<div class="list-card">${recent.map(b => renderBankListRow(b)).join('')}</div>`
    : '<div class="empty" style="padding:30px"><div class="empty-icon">🏦</div><div class="empty-title">Hesap yok</div></div>');

  // Smart suggestion
  renderSuggestion();
}

function renderSuggestion() {
  const hour = new Date().getHours();
  let emoji = '💡', msg = '', sub = '';

  if (AS.banks.length === 0) {
    emoji = '🏦'; msg = 'İlk hesabınızı ekleyin'; sub = '+ butonuna dokunun';
  } else if (!AS.banks.some(b => b.fav)) {
    emoji = '⭐'; msg = 'Favori ekleyin'; sub = 'Sık kullandığınız hesabı favorileyin';
  } else if (!AS.contacts.length) {
    emoji = '👥'; msg = 'Kişi ekleyin'; sub = 'Sık gönderdiğiniz kişileri kaydedin';
  } else if (hour >= 9 && hour <= 17) {
    const biz = AS.banks.filter(b => b.tag && b.tag.includes('iş'));
    emoji = '💼'; msg = 'İş günü aktif';
    sub = biz.length ? `${biz.length} iş hesabı mevcut` : `${AS.stats.copies} kopyalama bugün`;
  } else {
    emoji = '📊'; msg = 'Günün özeti';
    sub = `${AS.stats.copies} kopyalama · ${AS.stats.shares} paylaşım`;
  }

  setElHTML('homeSuggestion', `
    <div class="card" style="display:flex;align-items:center;gap:14px;padding:14px 16px;cursor:pointer" onclick="switchTab('stats')">
      <div style="font-size:30px">${emoji}</div>
      <div>
        <div style="font-size:15px;font-weight:600">${msg}</div>
        <div style="font-size:13px;color:var(--text3);margin-top:2px">${sub}</div>
      </div>
    </div>`);
}

/* ════════════════════════════════════════════
   BANKS
   ════════════════════════════════════════════ */
function renderBanks() {
  const banks = AS.getBanksByFilter(AS.ui.bankFilter, AS.ui.searchQuery);
  setElText('bankCount', `${AS.banks.length} hesap`);

  const el = document.getElementById('bankList');
  if (!el) return;

  if (!banks.length) {
    el.innerHTML = `<div class="empty">
      <div class="empty-icon">${AS.ui.searchQuery ? '🔍' : '🏦'}</div>
      <div class="empty-title">${AS.ui.searchQuery ? 'Sonuç Bulunamadı' : 'Hesap Yok'}</div>
      <div class="empty-sub">${AS.ui.searchQuery ? 'Farklı arama deneyin' : 'Yeni hesap eklemek için + butonuna dokunun'}</div>
      ${!AS.ui.searchQuery ? '<button class="empty-btn" onclick="openAddModal()">Hesap Ekle</button>' : ''}
    </div>`;
    return;
  }

  // Group by pinned vs normal
  const pinned = banks.filter(b => b.pinned);
  const normal = banks.filter(b => !b.pinned);

  let html = '';
  if (pinned.length) {
    html += `<div class="section-label" style="padding-top:8px">📌 Sabitlendi</div>`;
    html += pinned.map((b, i) => renderBankCard(b, i)).join('');
  }
  if (normal.length && pinned.length) {
    html += `<div class="section-label" style="padding-top:8px">Tüm Hesaplar</div>`;
  }
  html += normal.map((b, i) => renderBankCard(b, i + pinned.length)).join('');

  el.innerHTML = html;
  el.classList.toggle('bulk-mode', AS.ui.bulkMode);
}

function renderBankCard(b, idx = 0) {
  const col     = b.color || M.getBankColor(b.name);
  const ibanFmt = M.formatIBAN(b.iban);
  const sel     = AS.ui.selectedBanks.has(b.id);

  return `
  <div class="bank-card anim-in${sel ? ' selected' : ''}${b.pinned ? ' pinned' : ''}"
       id="bc-${b.id}"
       style="animation-delay:${idx * 30}ms"
       draggable="true"
       data-bank-id="${b.id}"
       ondragstart="handleDragStart(event,'${b.id}')"
       aria-label="${b.name} IBAN kartı"
       role="article">
    <div class="bank-card-select" onclick="toggleSelectBank('${b.id}',event)" role="checkbox" aria-checked="${sel}" aria-label="${b.name} seç">
      ${sel ? '<svg viewBox="0 0 24 24" width="14" height="14" style="stroke:#fff;fill:none;stroke-width:3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
    </div>
    <div class="bank-card-inner" onclick="openDetail('${b.id}')">
      <div class="bank-header">
        <div class="bank-logo" style="background:${col}" aria-hidden="true">${M.getBankEmoji(b.name)}</div>
        <div style="flex:1;min-width:0">
          <div class="bank-name">${escHtml(b.name)}${b.fav ? ' <span aria-label="favori">⭐</span>' : ''}</div>
          <div class="bank-meta">
            <span class="bank-owner">${escHtml(b.owner || '—')}</span>
            <span class="badge badge-blue" style="font-size:10px">${b.currency || 'TRY'}</span>
            ${b.tag ? `<span class="badge" style="background:var(--gray-fill2);color:var(--text3);font-size:10px">${escHtml(b.tag)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="bank-iban iban-mono bank-card-privacy" aria-label="IBAN ${ibanFmt}">${ibanFmt}</div>
      <div class="bank-actions">
        <button class="bank-btn btn-copy" onclick="event.stopPropagation();copyIBAN('${b.id}')" aria-label="${b.name} IBAN kopyala">
          <svg viewBox="0 0 24 24" width="13" height="13" style="stroke:currentColor;fill:none;stroke-width:2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          Kopyala
        </button>
        <button class="bank-btn btn-share" onclick="event.stopPropagation();openShare('${b.id}')" aria-label="${b.name} IBAN paylaş">
          <svg viewBox="0 0 24 24" width="13" height="13" style="stroke:currentColor;fill:none;stroke-width:2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          Paylaş
        </button>
        <button class="bank-btn btn-qr" onclick="event.stopPropagation();openQR('${b.id}')" aria-label="${b.name} QR kod">
          <svg viewBox="0 0 24 24" width="13" height="13" style="stroke:currentColor;fill:none;stroke-width:2"><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/><rect x="8.5" y="8.5" width="7" height="7"/></svg>
          QR
        </button>
      </div>
    </div>
  </div>`;
}

function renderBankListRow(b) {
  const col = b.color || M.getBankColor(b.name);
  return `<div class="list-item" onclick="openDetail('${b.id}')" role="button" aria-label="${b.name}">
    <div class="list-item-icon" style="background:${col}" aria-hidden="true">${M.getBankEmoji(b.name)}</div>
    <div class="list-item-content">
      <div class="list-item-title">${escHtml(b.name)}</div>
      <div class="list-item-sub">${M.formatIBAN(b.iban)}</div>
    </div>
    <div class="list-item-right">
      ${b.fav ? '<span aria-label="favori">⭐</span>' : ''}
      <svg viewBox="0 0 24 24" class="chevron" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
    </div>
  </div>`;
}

/* ════════════════════════════════════════════
   CONTACTS
   ════════════════════════════════════════════ */
function renderContacts() {
  let cs = [...AS.contacts];
  if (AS.ui.contactSearch) {
    const q = AS.ui.contactSearch.toLowerCase();
    cs = cs.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    );
  }
  if (AS.ui.contactFilter === 'fav')    cs = cs.filter(c => c.fav);
  else if (AS.ui.contactFilter === 'recent') {
    cs = [...cs].sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0)).slice(0, 10);
  }

  setElText('contactCount', `${AS.contacts.length} kişi`);
  const el = document.getElementById('contactList');
  if (!el) return;

  if (!cs.length) {
    el.innerHTML = `<div class="empty">
      <div class="empty-icon">👥</div>
      <div class="empty-title">Kişi Yok</div>
      <div class="empty-sub">+ butonuyla yeni kişi ekleyebilirsiniz</div>
      <button class="empty-btn" onclick="openAddContactModal()">Kişi Ekle</button>
    </div>`;
    return;
  }

  // Group alphabetically (Turkish locale)
  const groups = {};
  cs.forEach(c => {
    const k = c.name[0].toUpperCase();
    if (!groups[k]) groups[k] = [];
    groups[k].push(c);
  });

  el.innerHTML = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'tr')).map(k => `
    <div class="section-label" style="padding-top:12px">${k}</div>
    <div class="list-card">
      ${groups[k].map(c => `
        <div class="list-item" onclick="openContactDetail('${c.id}')" role="button" aria-label="${c.name}">
          <div class="contact-avatar" style="background:${c.color}">${M.getInitials(c.name)}</div>
          <div class="list-item-content">
            <div class="list-item-title">${escHtml(c.name)}${c.fav ? ' ⭐' : ''}</div>
            <div class="list-item-sub2">${escHtml(c.phone || c.email || '')} · ${c.bankIds?.length || 0} IBAN</div>
          </div>
          <svg viewBox="0 0 24 24" class="chevron" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
        </div>`).join('')}
    </div>`).join('');
}

/* ════════════════════════════════════════════
   HISTORY
   ════════════════════════════════════════════ */
function renderHistory() {
  const h = AS.getHistoryByFilter(AS.ui.historyFilter);
  setElText('historyCount', `${AS.history.length} işlem`);

  const el = document.getElementById('historyList');
  if (!el) return;

  if (!h.length) {
    el.innerHTML = `<div class="empty">
      <div class="empty-icon">📋</div>
      <div class="empty-title">İşlem Geçmişi Yok</div>
      <div class="empty-sub">Kopyalama ve paylaşım işlemleri burada görünür</div>
    </div>`;
    return;
  }
  el.innerHTML = `<div class="list-card">${h.map(x => renderHistoryItem(x)).join('')}</div>`;
}

function renderHistoryItem(h) {
  const CONFIG = {
    copy:  { icon: '📋', label: 'Kopyalandı', color: 'var(--blue)',   bg: 'var(--blue-light)'   },
    share: { icon: '↗️', label: 'Paylaşıldı', color: 'var(--green)',  bg: 'var(--green-light)'  },
    view:  { icon: '👁',  label: 'Görüntülendi',color:'var(--orange)', bg: 'var(--orange-light)' },
  };
  const cfg = CONFIG[h.type] || { icon: '📌', label: h.type, color: 'var(--text3)', bg: 'var(--gray-fill2)' };
  return `
  <div class="list-item" onclick="openDetail('${h.bankId}')" role="button">
    <div class="list-item-icon" style="background:${cfg.bg};color:${cfg.color};font-size:18px" aria-hidden="true">${cfg.icon}</div>
    <div class="list-item-content">
      <div class="list-item-title">${escHtml(h.bankName || '—')}</div>
      <div class="list-item-sub">${M.formatIBAN(h.iban)}</div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:12px;font-weight:600;color:${cfg.color}">${cfg.label}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:2px">${M.relativeTime(h.ts)}</div>
    </div>
  </div>`;
}

/* ════════════════════════════════════════════
   FAVS
   ════════════════════════════════════════════ */
function renderFavs() {
  const favs = AS.banks.filter(b => b.fav);
  setElHTML('favList', favs.length
    ? `<div class="stagger">${favs.map((b, i) => renderBankCard(b, i)).join('')}</div>`
    : `<div class="empty"><div class="empty-icon">⭐</div><div class="empty-title">Favori Yok</div><div class="empty-sub">Hesap kartında ⭐ butonuna dokunun</div></div>`);
}

/* ════════════════════════════════════════════
   STATS
   ════════════════════════════════════════════ */
function renderStats() {
  setElText('stTotal',    AS.banks.length);
  setElText('stBanks',    new Set(AS.banks.map(b => b.name)).size);
  setElText('stCopies',   AS.stats.copies);
  setElText('stShares',   AS.stats.shares || 0);
  setElText('stContacts', AS.contacts.length);
  setElText('stHistory',  AS.history.length);

  const months = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  const now    = new Date();
  const act    = AS.stats.activity || new Array(12).fill(0);
  const mx     = Math.max(...act, 1);

  setElHTML('actChart', act.map((v, i) =>
    `<div class="chart-bar" style="height:${(v/mx)*100}%;opacity:${i===now.getMonth()?1:.45}" title="${months[i]}: ${v}" aria-label="${months[i]} ${v} işlem"></div>`
  ).join(''));
  setElHTML('actLabels', act.map((v, i) =>
    `<div style="flex:1;font-size:8px;text-align:center;color:var(--text3);font-weight:${i===now.getMonth()?700:400}">${months[i].slice(0,1)}</div>`
  ).join(''));

  // Currency breakdown
  const curs = {};
  AS.banks.forEach(b => { curs[b.currency || 'TRY'] = (curs[b.currency || 'TRY'] || 0) + 1; });
  const tot = AS.banks.length || 1;
  setElHTML('currencyStats', Object.entries(curs).map(([c, n]) =>
    `<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:14px;font-weight:600">${c}</span>
        <span style="font-size:14px;color:var(--text3)">${n} hesap</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${(n/tot)*100}%"></div></div>
    </div>`
  ).join('') || '<div style="text-align:center;color:var(--text3);padding:20px">Veri yok</div>');

  // Top banks
  const bCnt = {};
  AS.banks.forEach(b => { bCnt[b.name] = (bCnt[b.name] || 0) + 1; });
  const top = Object.entries(bCnt).sort((a, b) => b[1] - a[1]).slice(0, 5);
  setElHTML('topBanks', top.length
    ? `<div class="list-card">${top.map(([n, c], i) =>
        `<div class="list-item" style="cursor:default">
          <div class="list-item-icon" style="background:${M.getBankColor(n)}">${M.getBankEmoji(n)}</div>
          <div class="list-item-content">
            <div class="list-item-title">${escHtml(n)}</div>
            <div class="list-item-sub2">${c} hesap</div>
          </div>
          <div style="font-size:20px;font-weight:700;color:var(--text4)">#${i+1}</div>
        </div>`).join('')}</div>`
    : '');

  // Weekly report
  const weekStart = new Date();
  weekStart.setHours(0,0,0,0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekActions = AS.history.filter(h => h.ts >= weekStart.getTime());
  setElHTML('weeklyReport', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div style="text-align:center"><div style="font-size:22px;font-weight:700">${weekActions.filter(h=>h.type==='copy').length}</div><div style="font-size:12px;color:var(--text3)">Kopyalama</div></div>
      <div style="text-align:center"><div style="font-size:22px;font-weight:700">${weekActions.filter(h=>h.type==='share').length}</div><div style="font-size:12px;color:var(--text3)">Paylaşım</div></div>
      <div style="text-align:center"><div style="font-size:22px;font-weight:700">${weekActions.length}</div><div style="font-size:12px;color:var(--text3)">Toplam İşlem</div></div>
      <div style="text-align:center"><div style="font-size:22px;font-weight:700">${new Set(weekActions.map(h=>h.bankId)).size}</div><div style="font-size:12px;color:var(--text3)">Farklı IBAN</div></div>
    </div>`);
}

/* ════════════════════════════════════════════
   NAVIGATION
   ════════════════════════════════════════════ */
function switchTab(tab) {
  M.HapticFeedback.selection();

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));

  const screen = document.getElementById(`screen-${tab}`);
  const tabEl  = document.getElementById(`tab-${tab}`);
  if (screen) screen.classList.add('active');
  if (tabEl)  tabEl.classList.add('active');

  AS.ui.activeTab = tab;

  // Lazy render
  const renders = { stats: renderStats, banks: renderBanks, favs: renderFavs, contacts: renderContacts, history: renderHistory, home: renderHome };
  if (renders[tab]) renders[tab]();

  // Handoff activity update
  updateHandoffActivity(tab);
}

function updateHandoffActivity(tab) {
  // Stub → native: userActivity.becomeCurrent()
  const payload = M.buildHandoffActivity(AS.ui.currentBankId || '');
  payload.userInfo = { ...payload.userInfo, tab };
  // In Capacitor: window.webkit.messageHandlers.handoff.postMessage(payload);
}

/* ════════════════════════════════════════════
   GREETING
   ════════════════════════════════════════════ */
function updateGreeting() {
  const now  = new Date();
  const h    = now.getHours();
  const g    = h < 6 ? 'İyi Geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'Merhaba' : 'İyi Akşamlar';
  setElText('greetTitle', `${g} 👋`);
  setElText('greetDate',  now.toLocaleDateString('tr-TR', { weekday:'long', day:'numeric', month:'long' }));
}

/* ════════════════════════════════════════════
   BANK DETAIL
   ════════════════════════════════════════════ */
function openDetail(id) {
  const b = AS.banks.find(x => x.id === id);
  if (!b) return;

  AS.ui.currentBankId = id;
  AS.addHistory('view', b);
  M.HapticFeedback.selection();

  const col     = b.color || M.getBankColor(b.name);
  const ibanFmt = M.formatIBAN(b.iban);

  const rows = [
    b.owner      && ['👤 Hesap Sahibi', escHtml(b.owner)],
    b.currency   && ['💱 Para Birimi',  b.currency],
    b.branch     && ['🏢 Şube',         escHtml(b.branch + (b.branchCode ? ` (${b.branchCode})` : ''))],
    b.accNum     && ['# Hesap No',      escHtml(b.accNum)],
    b.swiftCode  && ['🌐 SWIFT/BIC',    escHtml(b.swiftCode)],
    b.desc       && ['📝 Açıklama',     escHtml(b.desc)],
    b.tag        && ['🏷️ Etiket',       escHtml(b.tag)],
    b.note       && ['📌 Not',          escHtml(b.note)],
    ['📅 Oluşturulma', new Date(b.createdAt || Date.now()).toLocaleDateString('tr-TR')],
    b.lastUsedAt && ['🕐 Son Kullanım', M.relativeTime(b.lastUsedAt)],
  ].filter(Boolean);

  setElHTML('detailContent', `
    <div class="detail-card" style="--bank-c1:${col};--bank-c2:${col}cc"
         onclick="copyIBAN('${id}')" title="Kopyalamak için dokunun" aria-label="${b.name} IBAN kartı, kopyalamak için dokunun">
      <div class="dc-z">
        <div class="dc-bank">${escHtml(b.name)} ${M.getBankEmoji(b.name)}</div>
        <div class="dc-iban">${ibanFmt}</div>
        <div class="dc-owner">${escHtml(b.owner || '—')}</div>
        <div class="dc-meta">${b.currency || 'TRY'}${b.branch ? ` · ${escHtml(b.branch)}` : ''}</div>
        <div class="dc-chips">
          ${b.fav ? '<div class="dc-chip">⭐ Favori</div>' : ''}
          ${b.pinned ? '<div class="dc-chip">📌 Sabitli</div>' : ''}
          ${b.tag ? `<div class="dc-chip">${escHtml(b.tag)}</div>` : ''}
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <button class="bank-btn btn-copy" style="height:46px;border-radius:12px;font-size:14px" onclick="copyIBAN('${id}')">📋 Kopyala</button>
      <button class="bank-btn btn-share" style="height:46px;border-radius:12px;font-size:14px" onclick="openShare('${id}')">↗️ Paylaş</button>
      <button class="bank-btn btn-qr" style="height:46px;border-radius:12px;font-size:14px" onclick="openQR('${id}')">⬛ QR Kod</button>
      <button class="bank-btn" style="height:46px;border-radius:12px;font-size:14px;background:var(${b.fav ? '--red-light' : '--orange-light'});color:var(${b.fav ? '--red' : '--orange'})" onclick="toggleFav('${id}')">
        ${b.fav ? '💛 Favori Kaldır' : '⭐ Favoriye Ekle'}
      </button>
    </div>
    <div class="list-card" style="margin:0 0 12px">
      ${rows.map(([l, v]) => `
        <div class="list-item" style="cursor:default">
          <div style="flex:1;font-size:14px;color:var(--text3)">${l}</div>
          <div style="font-size:14px;font-weight:500;max-width:55%;text-align:right">${v}</div>
        </div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <button class="btn-secondary" onclick="openEditModal('${id}')">✏️ Düzenle</button>
      <button class="btn-secondary" onclick="duplicateBank('${id}')">📋 Çoğalt</button>
    </div>
    <button class="btn-secondary" onclick="togglePin('${id}')" style="margin-bottom:8px">
      ${b.pinned ? '📌 Sabitlemeyi Kaldır' : '📌 Sabitle'}
    </button>
    <button class="btn-secondary btn-danger" onclick="deleteBank('${id}')">🗑️ Hesabı Sil</button>
  `);
  openModal('detailModal');
}

/* ════════════════════════════════════════════
   CONTACT DETAIL
   ════════════════════════════════════════════ */
function openContactDetail(id) {
  const c = AS.contacts.find(x => x.id === id);
  if (!c) return;
  c.lastUsed = Date.now();
  AS.save();
  M.HapticFeedback.selection();

  const banks = (c.bankIds || []).map(bid => AS.banks.find(b => b.id === bid)).filter(Boolean);

  setElHTML('detailContent', `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
      <div style="width:62px;height:62px;border-radius:50%;background:${c.color};display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:700;flex-shrink:0;box-shadow:0 4px 12px rgba(0,0,0,.15)">${M.getInitials(c.name)}</div>
      <div>
        <div style="font-size:22px;font-weight:700">${escHtml(c.name)}${c.fav ? ' ⭐' : ''}</div>
        <div style="font-size:14px;color:var(--text3)">${escHtml(c.phone || '')}${c.email ? ' · ' + escHtml(c.email) : ''}</div>
      </div>
    </div>
    ${banks.length ? `
      <div class="section-label" style="padding:0 0 8px">Bağlı IBAN'lar</div>
      <div class="list-card" style="margin:0 0 14px">
        ${banks.map(b => `
          <div class="list-item" onclick="openDetail('${b.id}');closeModal('detailModal')">
            <div class="list-item-icon" style="background:${b.color || M.getBankColor(b.name)}">${M.getBankEmoji(b.name)}</div>
            <div class="list-item-content">
              <div class="list-item-title">${escHtml(b.name)}</div>
              <div class="list-item-sub">${M.formatIBAN(b.iban)}</div>
            </div>
            <button class="bank-btn btn-copy" style="height:30px;padding:0 10px;border-radius:8px;font-size:12px;flex:none" onclick="event.stopPropagation();copyIBAN('${b.id}')">Kopyala</button>
          </div>`).join('')}
      </div>` : '<div style="text-align:center;padding:16px;color:var(--text3);font-size:14px">Bağlı IBAN yok</div>'}
    ${c.note ? `<div class="card" style="margin:0 0 14px;font-size:14px;color:var(--text2)">📌 ${escHtml(c.note)}</div>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <button class="btn-secondary" onclick="openEditContactModal('${id}')">✏️ Düzenle</button>
      <button class="btn-secondary" onclick="toggleFavContact('${id}')">
        ${c.fav ? '💛 Favori Kaldır' : '⭐ Favoriye Ekle'}
      </button>
    </div>
    <button class="btn-secondary btn-danger" onclick="deleteContact('${id}')">🗑️ Kişiyi Sil</button>
  `);
  openModal('detailModal');
}

/* ════════════════════════════════════════════
   BANK CRUD ACTIONS
   ════════════════════════════════════════════ */
function openAddModal() {
  M.HapticFeedback.impact('light');
  document.getElementById('addModalTitle').textContent = 'Yeni Banka Hesabı';
  document.getElementById('editId').value = '';
  ['fBankName','fIBAN','fOwner','fAccNum','fBranch','fBranchCode','fDesc','fTag','fNote','fSwift'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const cur = document.getElementById('fCurrency');
  if (cur) cur.value = 'TRY';
  clearIBANValidation();
  initColorPicker('colorPick');
  openModal('addModal');
}

function openEditModal(id) {
  const b = AS.banks.find(x => x.id === id);
  if (!b) return;
  document.getElementById('addModalTitle').textContent = 'Hesabı Düzenle';
  document.getElementById('editId').value = id;
  setInputValue('fBankName',   b.name);
  setInputValue('fIBAN',       M.formatIBAN(b.iban));
  setInputValue('fOwner',      b.owner     || '');
  setInputValue('fAccNum',     b.accNum    || '');
  setInputValue('fBranch',     b.branch    || '');
  setInputValue('fBranchCode', b.branchCode|| '');
  setInputValue('fDesc',       b.desc      || '');
  setInputValue('fTag',        b.tag       || '');
  setInputValue('fNote',       b.note      || '');
  setInputValue('fSwift',      b.swiftCode || '');
  setInputValue('fCurrency',   b.currency  || 'TRY');
  initColorPicker('colorPick');
  const dot = [...document.querySelectorAll('#colorPick .color-dot')].find(d => d.dataset.color === (b.color || M.SYSTEM_COLORS[0].hex));
  if (dot) selectColor(dot.dataset.color, dot, 'colorPick');
  clearIBANValidation();
  closeModal('detailModal');
  openModal('addModal');
}

function saveBank() {
  const name    = document.getElementById('fBankName').value.trim();
  const ibanRaw = document.getElementById('fIBAN').value.trim();
  if (!name) { showToast('⚠️ Banka adı zorunludur'); M.HapticFeedback.notification('error'); return; }

  const validation = M.validateIBAN(ibanRaw);
  if (!validation.valid) {
    showToast(`⚠️ ${validation.error}`);
    M.HapticFeedback.notification('error');
    const inp = document.getElementById('fIBAN');
    if (inp) inp.classList.add('invalid');
    return;
  }

  M.HapticFeedback.notification('success');

  const editId = document.getElementById('editId').value;
  const partial = {
    id         : editId || undefined,
    name,
    iban       : validation.iban,
    owner      : document.getElementById('fOwner').value.trim(),
    accNum     : document.getElementById('fAccNum').value.trim(),
    branch     : document.getElementById('fBranch').value.trim(),
    branchCode : document.getElementById('fBranchCode').value.trim(),
    currency   : document.getElementById('fCurrency').value,
    desc       : document.getElementById('fDesc').value.trim(),
    tag        : document.getElementById('fTag').value.trim(),
    note       : document.getElementById('fNote').value.trim(),
    swiftCode  : (document.getElementById('fSwift') || {}).value?.trim() || '',
    color      : getSelectedColor('colorPick'),
  };

  if (editId) {
    AS.updateBank(editId, partial);
    showToast('✅ Hesap güncellendi');
  } else {
    AS.addBank(partial);
    showToast('✅ Hesap eklendi');
  }

  renderAll();
  closeModal('addModal');
  showLiveActivity(AS.banks.find(b => b.name === name), 'done');
}

function deleteBank(id) {
  const b = AS.banks.find(x => x.id === id);
  if (!b) return;
  if (!confirm('Bu hesabı silmek istediğinizden emin misiniz?')) return;
  M.HapticFeedback.notification('warning');
  AS.pushUndo({ type: 'deleteBank', bank: JSON.parse(JSON.stringify(b)) });
  AS.deleteBank(id);
  renderAll();
  closeModal('detailModal');
  showUndoBar('🗑️ Hesap silindi');
}

function toggleFav(id) {
  M.HapticFeedback.impact('medium');
  AS.toggleFav(id);
  renderAll();
  openDetail(id);
}

function togglePin(id) {
  M.HapticFeedback.impact('light');
  const b = AS.banks.find(x => x.id === id);
  if (!b) return;
  AS.updateBank(id, { pinned: !b.pinned });
  renderAll();
  openDetail(id);
  showToast(b.pinned ? '📌 Sabitleme kaldırıldı' : '📌 Hesap sabitlendi');
}

function duplicateBank(id) {
  M.HapticFeedback.impact('light');
  AS.duplicateBank(id);
  renderAll();
  closeModal('detailModal');
  showToast('📋 Hesap kopyalandı');
}

/* ════════════════════════════════════════════
   IBAN VALIDATION UX
   ════════════════════════════════════════════ */
function formatIBANInput(input) {
  const clean = input.value.replace(/\s/g, '').toUpperCase();
  input.value = clean.match(/.{1,4}/g)?.join(' ') || clean;
  validateIBANInput(input);
}

function validateIBANInput(input) {
  const raw = input.value.replace(/\s/g, '').toUpperCase();
  if (!raw) { clearIBANValidation(); return; }
  if (raw.length < 26) {
    input.classList.remove('valid', 'invalid');
    return;
  }
  const result = M.validateIBAN(raw);
  input.classList.toggle('valid',   result.valid);
  input.classList.toggle('invalid', !result.valid);
  setElText('ibanValidMsg', result.valid ? '✓ Geçerli IBAN' : result.error);
  const msg = document.getElementById('ibanValidMsg');
  if (msg) msg.style.color = result.valid ? 'var(--green)' : 'var(--red)';
}

function clearIBANValidation() {
  const inp = document.getElementById('fIBAN');
  if (inp) { inp.classList.remove('valid','invalid'); }
  setElText('ibanValidMsg', '');
}

function autoBankColor(name) {
  const col = M.getBankColor(name);
  const dot = [...document.querySelectorAll('#colorPick .color-dot')].find(d => d.dataset.color === col);
  if (dot) selectColor(col, dot, 'colorPick');
}

/* ════════════════════════════════════════════
   CONTACT CRUD ACTIONS
   ════════════════════════════════════════════ */
let tempContactBankLinks = [];

function openAddContactModal() {
  M.HapticFeedback.impact('light');
  document.getElementById('addContactTitle').textContent = 'Yeni Kişi';
  document.getElementById('editContactId').value = '';
  ['cName','cPhone','cEmail','cNote'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  tempContactBankLinks = [];
  renderContactBankLinks();
  populateContactBankSelect();
  initColorPicker('contactColorPick');
  openModal('addContactModal');
}

function openEditContactModal(id) {
  const c = AS.contacts.find(x => x.id === id);
  if (!c) return;
  document.getElementById('addContactTitle').textContent = 'Kişiyi Düzenle';
  document.getElementById('editContactId').value = id;
  setInputValue('cName',  c.name);
  setInputValue('cPhone', c.phone || '');
  setInputValue('cEmail', c.email || '');
  setInputValue('cNote',  c.note  || '');
  tempContactBankLinks = [...(c.bankIds || [])];
  renderContactBankLinks();
  populateContactBankSelect();
  initColorPicker('contactColorPick');
  const dot = [...document.querySelectorAll('#contactColorPick .color-dot')].find(d => d.dataset.color === c.color) || document.querySelector('#contactColorPick .color-dot');
  if (dot) selectColor(dot.dataset.color, dot, 'contactColorPick');
  closeModal('detailModal');
  openModal('addContactModal');
}

function populateContactBankSelect() {
  const sel = document.getElementById('cBankLink');
  if (!sel) return;
  sel.innerHTML = '<option value="">IBAN ekle…</option>' +
    AS.banks.filter(b => !tempContactBankLinks.includes(b.id))
      .map(b => `<option value="${b.id}">${escHtml(b.name)} – ${M.formatIBAN(b.iban).slice(0,12)}…</option>`)
      .join('');
}

function addContactBankLink(sel) {
  if (!sel.value) return;
  if (!tempContactBankLinks.includes(sel.value)) tempContactBankLinks.push(sel.value);
  sel.value = '';
  renderContactBankLinks();
  populateContactBankSelect();
}

function removeContactBankLink(id) {
  tempContactBankLinks = tempContactBankLinks.filter(x => x !== id);
  renderContactBankLinks();
  populateContactBankSelect();
}

function renderContactBankLinks() {
  const el = document.getElementById('contactBankLinks');
  if (!el) return;
  el.innerHTML = tempContactBankLinks.map(bid => {
    const b = AS.banks.find(x => x.id === bid);
    return b ? `<div style="display:flex;align-items:center;gap:6px;background:var(--blue-light);border-radius:8px;padding:5px 10px;font-size:13px;color:var(--blue)">
      <span>${escHtml(b.name)}</span>
      <button onclick="removeContactBankLink('${bid}')" style="background:none;border:none;cursor:pointer;color:var(--blue);font-size:14px;line-height:1" aria-label="${b.name} kaldır">✕</button>
    </div>` : '';
  }).join('');
}

function saveContact() {
  const name = document.getElementById('cName').value.trim();
  if (!name) { showToast('⚠️ Ad soyad zorunludur'); M.HapticFeedback.notification('error'); return; }
  M.HapticFeedback.notification('success');
  const editId = document.getElementById('editContactId').value;
  const partial = {
    name,
    phone  : document.getElementById('cPhone').value.trim(),
    email  : document.getElementById('cEmail').value.trim(),
    note   : document.getElementById('cNote').value.trim(),
    bankIds: [...tempContactBankLinks],
    color  : getSelectedColor('contactColorPick'),
  };
  if (editId) { AS.updateContact(editId, partial); showToast('✅ Kişi güncellendi'); }
  else        { AS.addContact(partial);            showToast('✅ Kişi eklendi'); }
  renderAll();
  closeModal('addContactModal');
}

function deleteContact(id) {
  if (!confirm('Bu kişiyi silmek istediğinizden emin misiniz?')) return;
  M.HapticFeedback.notification('warning');
  AS.deleteContact(id);
  renderAll();
  closeModal('detailModal');
  showToast('🗑️ Kişi silindi');
}

function toggleFavContact(id) {
  M.HapticFeedback.impact('medium');
  const c = AS.contacts.find(x => x.id === id);
  if (!c) return;
  AS.updateContact(id, { fav: !c.fav });
  renderAll();
  openContactDetail(id);
}

/* ════════════════════════════════════════════
   COPY / SHARE / QR
   ════════════════════════════════════════════ */
function copyIBAN(id) {
  const b = AS.banks.find(x => x.id === id);
  if (!b) return;
  M.HapticFeedback.impact('medium');

  const text = b.iban.replace(/\s/g, '');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      AS.addHistory('copy', b);
      showToast('✅ IBAN kopyalandı!');
      showLiveActivity(b, 'done');
    }).catch(() => fallbackCopy(b));
  } else {
    fallbackCopy(b);
  }
}

function fallbackCopy(b) {
  const el = document.createElement('textarea');
  el.value = b.iban.replace(/\s/g, '');
  Object.assign(el.style, { position:'fixed', top:'-999px', opacity:0 });
  document.body.appendChild(el);
  el.focus(); el.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(el);
  AS.addHistory('copy', b);
  showToast('✅ IBAN kopyalandı!');
}

function openShare(id) {
  const b = AS.banks.find(x => x.id === id);
  if (!b) return;
  AS.ui.currentBankId   = id;
  AS.ui.currentShareText = M.buildShareText(b, AS.settings.includeOwner);

  M.HapticFeedback.impact('light');

  if (AS.settings.defaultShare && AS.settings.defaultShare !== 'ask') {
    shareVia(AS.settings.defaultShare);
    return;
  }

  setElText('shareContent', AS.ui.currentShareText);
  closeModal('detailModal');
  openModal('shareModal');
}

function shareVia(method) {
  const text = AS.ui.currentShareText;
  const b    = AS.banks.find(x => x.id === AS.ui.currentBankId);
  M.HapticFeedback.impact('medium');

  switch (method) {
    case 'copy':
      navigator.clipboard?.writeText(text).catch(() => {});
      showToast('✅ Kopyalandı!');
      break;
    case 'whatsapp':
      window.open('https://wa.me/?text=' + encodeURIComponent(text));
      break;
    case 'telegram':
      window.open('https://t.me/share/url?text=' + encodeURIComponent(text));
      break;
    case 'sms':
      window.open('sms:?body=' + encodeURIComponent(text));
      break;
    case 'mail':
      window.open(`mailto:?subject=${encodeURIComponent('IBAN Bilgileri')}&body=${encodeURIComponent(text)}`);
      break;
    case 'signal':
      window.open('https://signal.me/#p/' + encodeURIComponent(text));
      break;
    case 'airdrop':
    case 'native':
      if (navigator.share) {
        navigator.share({
          title: 'IBAN Bilgileri',
          text,
          url: b ? M.UniversalLinks.shareURL(b.iban) : undefined,
        }).catch(() => {});
      } else {
        showToast('⚠️ Bu tarayıcıda desteklenmiyor');
      }
      break;
    case 'pdf':
      exportSinglePDF(AS.ui.currentBankId);
      break;
    case 'qr':
      showQR();
      return;
  }

  if (b && method !== 'pdf') AS.addHistory('share', b, method);
  closeModal('shareModal');
}

function showQR() { closeModal('shareModal'); openQR(AS.ui.currentBankId); }

function openQR(id) {
  const b = AS.banks.find(x => x.id === id);
  if (!b) return;
  AS.ui.currentBankId = id;
  M.HapticFeedback.impact('light');
  setElText('qrIbanText', M.formatIBAN(b.iban));
  generateQR(b.iban, b.color || M.getBankColor(b.name));
  openModal('qrModal');
}

function generateQR(text, accentColor = '#007AFF') {
  const canvas = document.getElementById('qrCanvas');
  if (!canvas) return;
  const ctx  = canvas.getContext('2d');
  const size = 220; const m = 25; const mod = size / m;
  canvas.width = size; canvas.height = size;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#1C1C1E';

  const h   = [...text].reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0);
  const rng = s => { const x = Math.sin(s + h) * 10000; return x - Math.floor(x); };

  for (let r = 0; r < m; r++) {
    for (let c = 0; c < m; c++) {
      const inFinder = (r < 7 && c < 7) || (r < 7 && c >= m - 7) || (r >= m - 7 && c < 7);
      if (inFinder) {
        const fr = r % 7, fc = c % 7;
        if (fr === 0 || fr === 6 || fc === 0 || fc === 6 || (fr >= 2 && fr <= 4 && fc >= 2 && fc <= 4)) {
          ctx.fillStyle = '#1C1C1E';
          ctx.beginPath();
          ctx.roundRect(c * mod + 1, r * mod + 1, mod - 2, mod - 2, 2);
          ctx.fill();
        }
      } else if (rng(r * m + c) > 0.45) {
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.roundRect(c * mod + 1, r * mod + 1, mod - 2, mod - 2, 2);
        ctx.fill();
      }
    }
  }

  // Center logo
  const cx = size / 2, cy = size / 2, r2 = 18;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(cx, cy, r2 + 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = accentColor;
  ctx.beginPath(); ctx.arc(cx, cy, r2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px -apple-system';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('₺', cx, cy + 1);
}

function downloadQR() {
  const a = document.createElement('a');
  a.download = 'iban-qr.png';
  a.href = document.getElementById('qrCanvas').toDataURL('image/png');
  a.click();
  M.HapticFeedback.impact('light');
  showToast('📥 QR indirildi');
}

function shareQR() {
  const canvas = document.getElementById('qrCanvas');
  canvas.toBlob(blob => {
    const file = new File([blob], 'iban-qr.png', { type: 'image/png' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: 'IBAN QR Kodu' }).catch(() => {});
    } else {
      downloadQR();
    }
  });
}

/* ════════════════════════════════════════════
   LIVE ACTIVITIES / DYNAMIC ISLAND
   ════════════════════════════════════════════ */
function showLiveActivity(bank, action) {
  if (!bank) return;
  const attrs = M.buildLiveActivityAttributes(bank, action);
  const banner = document.getElementById('liveBanner');
  if (!banner) return;

  document.getElementById('liveBannerTitle').textContent = attrs.dynamicIsland.expanded.header;
  document.getElementById('liveBannerIban').textContent  = M.formatIBAN(bank.iban);
  banner.classList.add('show');

  clearTimeout(liveActivityTimer);
  liveActivityTimer = setTimeout(() => banner.classList.remove('show'), 2500);
}

/* ════════════════════════════════════════════
   BULK MODE
   ════════════════════════════════════════════ */
function toggleBulkMode() {
  AS.ui.bulkMode = !AS.ui.bulkMode;
  AS.ui.selectedBanks.clear();
  M.HapticFeedback.impact('light');
  const bulkBar = document.getElementById('bulkBar');
  if (bulkBar) bulkBar.classList.toggle('show', AS.ui.bulkMode);
  const btn = document.getElementById('bulkToggleBtn');
  if (btn) btn.style.background = AS.ui.bulkMode ? 'var(--blue-light)' : 'var(--gray-fill2)';
  renderBanks();
  if (!AS.ui.bulkMode) showToast('Seçim modu kapatıldı');
  else showToast('Kartlara dokunarak seçin');
}

function toggleSelectBank(id, e) {
  e.stopPropagation();
  M.HapticFeedback.selection();
  if (AS.ui.selectedBanks.has(id)) AS.ui.selectedBanks.delete(id);
  else AS.ui.selectedBanks.add(id);
  setElText('bulkCount', `${AS.ui.selectedBanks.size} seçili`);
  renderBanks();
}

function bulkShare() {
  if (!AS.ui.selectedBanks.size) { showToast('⚠️ Önce hesap seçin'); return; }
  const banks = [...AS.ui.selectedBanks].map(id => AS.banks.find(b => b.id === id)).filter(Boolean);
  AS.ui.currentShareText = banks.map(b =>
    `🏦 ${b.name}\n👤 ${b.owner || '—'}\n📋 IBAN: ${M.formatIBAN(b.iban)}\n💱 ${b.currency || 'TRY'}`
  ).join('\n\n─────────────\n\n');
  setElText('shareContent', AS.ui.currentShareText);
  openModal('shareModal');
}

function bulkExport() {
  if (!AS.ui.selectedBanks.size) { showToast('⚠️ Önce hesap seçin'); return; }
  const banks = [...AS.ui.selectedBanks].map(id => AS.banks.find(b => b.id === id)).filter(Boolean);
  const csv = ['Banka Adı,IBAN,Hesap Sahibi,Para Birimi', ...banks.map(b =>
    [b.name, M.formatIBAN(b.iban), b.owner || '', b.currency || 'TRY'].map(v => `"${v}"`).join(',')
  )].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `iban-secili-${M.dateString()}.csv`;
  a.click();
  showToast('📊 Seçili hesaplar dışa aktarıldı');
}

function bulkDelete() {
  if (!AS.ui.selectedBanks.size) { showToast('⚠️ Önce hesap seçin'); return; }
  if (!confirm(`${AS.ui.selectedBanks.size} hesabı silmek istediğinizden emin misiniz?`)) return;
  M.HapticFeedback.notification('warning');
  const deleted = AS.banks.filter(b => AS.ui.selectedBanks.has(b.id));
  AS.pushUndo({ type: 'bulkDelete', banks: JSON.parse(JSON.stringify(deleted)) });
  deleted.forEach(b => AS.deleteBank(b.id));
  AS.ui.selectedBanks.clear();
  AS.ui.bulkMode = false;
  const bulkBar = document.getElementById('bulkBar');
  if (bulkBar) bulkBar.classList.remove('show');
  renderAll();
  showUndoBar(`${deleted.length} hesap silindi`);
}

/* ════════════════════════════════════════════
   SORT / FILTER
   ════════════════════════════════════════════ */
function filterBanks(q) {
  AS.ui.searchQuery = q;
  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) clearBtn.classList.toggle('show', !!q);
  renderBanks();
}

function clearSearch() {
  const inp = document.getElementById('bankSearch');
  if (inp) inp.value = '';
  filterBanks('');
}

function filterByTag(el, tag) {
  M.HapticFeedback.selection();
  AS.ui.bankFilter = tag;
  document.querySelectorAll('#screen-banks .chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderBanks();
}

function filterContacts(q)    { AS.ui.contactSearch = q; renderContacts(); }
function filterContactsTag(el, tag) {
  M.HapticFeedback.selection();
  AS.ui.contactFilter = tag;
  document.querySelectorAll('#screen-contacts .chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderContacts();
}

function filterHistory(el, type) {
  M.HapticFeedback.selection();
  AS.ui.historyFilter = type;
  document.querySelectorAll('#screen-history .chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderHistory();
}

function toggleSort() {
  const options = [
    { key:'recent', label:'🕐 Son eklenen' },
    { key:'az',     label:'🔤 A → Z'       },
    { key:'za',     label:'🔤 Z → A'       },
    { key:'fav',    label:'⭐ Favoriler önce' },
    { key:'used',   label:'⏱ Son kullanılan' },
  ];
  setElHTML('sortOptions', options.map(o => `
    <div class="sort-option${AS.ui.sortMode === o.key ? ' active' : ''}" onclick="setSortMode('${o.key}')" role="option" aria-selected="${AS.ui.sortMode === o.key}">
      <span>${o.label}</span>
      ${AS.ui.sortMode === o.key ? '<svg viewBox="0 0 24 24" width="20" height="20" style="stroke:var(--blue);fill:none;stroke-width:2.5"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
    </div>`).join(''));
  openModal('sortModal');
}

function setSortMode(mode) {
  M.HapticFeedback.selection();
  AS.ui.sortMode = mode;
  closeModal('sortModal');
  renderBanks();
  showToast('Sıralama güncellendi');
}

/* ════════════════════════════════════════════
   SETTINGS ACTIONS
   ════════════════════════════════════════════ */
function toggleSetting(key) {
  M.HapticFeedback.selection();
  const val = AS.toggleSetting(key);
  applySettings();
  showToast(val ? '✅ Açıldı' : '❌ Kapatıldı');
}

function openChangePinModal() {
  ['oldPin','newPin','newPin2'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  openModal('changePinModal');
}

function changePin() {
  const oldP  = document.getElementById('oldPin').value;
  const newP  = document.getElementById('newPin').value;
  const newP2 = document.getElementById('newPin2').value;
  if (oldP !== AS.settings.pinCode) { showToast('⚠️ Mevcut şifre yanlış');  M.HapticFeedback.notification('error'); return; }
  if (newP.length !== 4)             { showToast('⚠️ Şifre 4 haneli olmalı'); M.HapticFeedback.notification('error'); return; }
  if (newP !== newP2)                { showToast('⚠️ Şifreler eşleşmiyor');   M.HapticFeedback.notification('error'); return; }
  M.HapticFeedback.notification('success');
  AS.updateSetting('pinCode', newP);
  closeModal('changePinModal');
  showToast('✅ Şifre değiştirildi');
}

function openDefaultShareModal() {
  const opts = [
    { key:'ask',     label:'Her seferinde sor', icon:'❓' },
    { key:'copy',    label:'Kopyala',           icon:'📋' },
    { key:'whatsapp',label:'WhatsApp',          icon:'💬' },
    { key:'telegram',label:'Telegram',          icon:'✈️' },
    { key:'sms',     label:'SMS',               icon:'✉️' },
    { key:'mail',    label:'E-posta',           icon:'📧' },
    { key:'native',  label:'Sistem paylaşımı',  icon:'↗️' },
  ];
  setElHTML('defShareList', `<div class="list-card" style="margin:0">${opts.map(o => `
    <div class="list-item" onclick="setDefaultShare('${o.key}')">
      <div class="list-item-icon" style="background:var(--gray-fill2);font-size:20px">${o.icon}</div>
      <div class="list-item-content"><div class="list-item-title">${o.label}</div></div>
      ${AS.settings.defaultShare === o.key ? '<svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:var(--blue);fill:none;stroke-width:2.5"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
    </div>`).join('')}</div>`);
  openModal('defaultShareModal');
}

function setDefaultShare(key) {
  M.HapticFeedback.selection();
  AS.updateSetting('defaultShare', key);
  applySettings();
  closeModal('defaultShareModal');
  showToast('✅ Kaydedildi');
}

function openFontModal() {
  const opts = [
    { k:'xsmall', l:'Çok Küçük', sz:13 },
    { k:'small',  l:'Küçük',     sz:14 },
    { k:'normal', l:'Normal',    sz:17 },
    { k:'large',  l:'Büyük',     sz:19 },
    { k:'xlarge', l:'Çok Büyük', sz:22 },
  ];
  setElHTML('fontList', `<div class="list-card" style="margin:0">${opts.map(o => `
    <div class="list-item" onclick="setFontSize('${o.k}')">
      <div class="list-item-content"><div class="list-item-title" style="font-size:${o.sz}px">${o.l}</div></div>
      ${AS.settings.fontSize === o.k ? '<svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:var(--blue);fill:none;stroke-width:2.5"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
    </div>`).join('')}</div>`);
  openModal('fontModal');
}

function setFontSize(k) {
  M.HapticFeedback.selection();
  AS.updateSetting('fontSize', k);
  applySettings();
  closeModal('fontModal');
  showToast('✅ Yazı boyutu güncellendi');
}

function clearData() {
  if (!confirm('TÜM verileriniz silinecek! Bu işlem geri alınamaz.')) return;
  if (!confirm('Emin misiniz?')) return;
  M.HapticFeedback.notification('warning');
  AS.banks = []; AS.contacts = []; AS.history = [];
  AS.stats = M.defaultStats();
  AS.save();
  renderAll();
  showToast('🗑️ Tüm veriler silindi');
}

function clearHistory() {
  if (!confirm('Tüm geçmişi silmek istediğinizden emin misiniz?')) return;
  M.HapticFeedback.notification('warning');
  AS.clearHistory();
  renderAll();
  showToast('🗑️ Geçmiş temizlendi');
}

/* ════════════════════════════════════════════
   LOCK / PIN / BIOMETRIC
   ════════════════════════════════════════════ */
function showLock() {
  pinEntry = '';
  updatePinDots();
  document.getElementById('lockScreen').classList.add('active');
}

function hideLock() {
  document.getElementById('lockScreen').classList.remove('active');
  M.HapticFeedback.notification('success');
}

function pinInput(digit) {
  if (pinEntry.length >= 4) return;
  M.HapticFeedback.selection();
  pinEntry += digit;
  updatePinDots();
  if (pinEntry.length === 4) {
    setTimeout(() => {
      if (pinEntry === AS.settings.pinCode) {
        hideLock();
        pinEntry = '';
        showToast('✅ Giriş başarılı');
      } else {
        M.HapticFeedback.notification('error');
        showToast('❌ Yanlış şifre');
        pinEntry = '';
        updatePinDots();
        updatePinDotsError();
      }
    }, 150);
  }
}

function pinDelete() {
  pinEntry = pinEntry.slice(0, -1);
  M.HapticFeedback.selection();
  updatePinDots();
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const d = document.getElementById('d' + i);
    if (d) { d.classList.toggle('filled', i < pinEntry.length); d.classList.remove('error'); }
  }
}

function updatePinDotsError() {
  for (let i = 0; i < 4; i++) {
    const d = document.getElementById('d' + i);
    if (d) { d.classList.add('error'); setTimeout(() => d.classList.remove('error'), 500); }
  }
}

async function biometricAuth() {
  M.HapticFeedback.impact('medium');
  const result = await M.BiometricAuth.authenticate();
  if (result.success) {
    hideLock();
    pinEntry = '';
    showToast(`🔓 ${result.type === 'faceID' ? 'Face ID' : 'Touch ID'} doğrulandı`);
  } else {
    showToast('❌ Biyometrik doğrulama başarısız');
    M.HapticFeedback.notification('error');
  }
}

/* ════════════════════════════════════════════
   EXPORT / IMPORT
   ════════════════════════════════════════════ */
function openExportModal() { openModal('exportModal'); }
function openImportModal() { document.getElementById('importFile').click(); }

function exportJSON() { AS.exportJSON(); showToast('📦 JSON dışa aktarıldı'); closeModal('exportModal'); }
function exportCSV()  { AS.exportCSV();  showToast('📊 CSV dışa aktarıldı');  closeModal('exportModal'); }

function exportPDF() {
  const content = AS.banks.map(b =>
    `${b.name}\nIBAN: ${M.formatIBAN(b.iban)}\nHesap Sahibi: ${b.owner || '—'}\nPara Birimi: ${b.currency || 'TRY'}\n${'─'.repeat(40)}`
  ).join('\n\n');
  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>IBAN Listesi</title>
  <style>body{font-family:-apple-system,Arial;padding:30px;max-width:600px;margin:0 auto}h1{font-size:20px}pre{font-size:13px;line-height:1.7;white-space:pre-wrap}@media print{button{display:none}}</style>
  </head><body><h1>🏦 IBAN Listesi</h1>
  <p style="color:#666;margin-bottom:16px">Oluşturulma: ${new Date().toLocaleDateString('tr-TR')} · Toplam: ${AS.banks.length} hesap</p>
  <pre>${content}</pre><br><button onclick="window.print()" style="background:#007AFF;color:#fff;border:none;border-radius:10px;padding:12px 24px;font-size:16px;cursor:pointer">Yazdır / PDF Kaydet</button>
  </body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
  else   { showToast('⚠️ Pop-up engellendi, lütfen izin verin'); }
  closeModal('exportModal');
}

function exportSinglePDF(id) {
  const b = AS.banks.find(x => x.id === id);
  if (!b) return;
  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>IBAN</title>
  <style>body{font-family:-apple-system,Arial;padding:40px;max-width:500px;margin:0 auto}h2{margin-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:18px}td{padding:10px 12px;border-bottom:1px solid #eee;font-size:14px}td:first-child{color:#666;font-weight:bold;width:130px}.iban{font-family:monospace;font-size:16px;font-weight:bold;color:#007AFF;letter-spacing:1px}@media print{button{display:none}}</style>
  </head><body><h2>🏦 ${b.name}</h2><p style="color:#666;margin:0">${new Date().toLocaleDateString('tr-TR')}</p>
  <table>
    <tr><td>IBAN</td><td class="iban">${M.formatIBAN(b.iban)}</td></tr>
    <tr><td>Hesap Sahibi</td><td>${b.owner || '—'}</td></tr>
    <tr><td>Para Birimi</td><td>${b.currency || 'TRY'}</td></tr>
    ${b.branch ? `<tr><td>Şube</td><td>${b.branch}</td></tr>` : ''}
    ${b.swiftCode ? `<tr><td>SWIFT/BIC</td><td>${b.swiftCode}</td></tr>` : ''}
  </table><br>
  <button onclick="window.print()" style="background:#007AFF;color:#fff;border:none;border-radius:10px;padding:12px 24px;font-size:16px;cursor:pointer">Yazdır / PDF Kaydet</button>
  </body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

function importJSON(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const count = AS.importJSON(e.target.result);
      renderAll();
      showToast(`✅ ${count} hesap içe aktarıldı`);
      M.HapticFeedback.notification('success');
    } catch (err) {
      showToast('⚠️ ' + err.message);
      M.HapticFeedback.notification('error');
    }
    input.value = '';
  };
  reader.readAsText(file);
}

/* ════════════════════════════════════════════
   NFC
   ════════════════════════════════════════════ */
function openNFCModal() {
  const el = document.getElementById('nfcSelectBank');
  if (el) el.innerHTML = `<select class="form-input" id="nfcBankSel">
    ${AS.banks.length
      ? '<option value="">IBAN seçin…</option>' + AS.banks.map(b => `<option value="${b.id}">${escHtml(b.name)} – ${M.formatIBAN(b.iban).slice(0,12)}…</option>`).join('')
      : '<option>Önce hesap ekleyin</option>'}
    </select>`;
  openModal('nfcModal');
}

function simulateNFC() {
  const id = document.getElementById('nfcBankSel')?.value;
  if (!id) { showToast('⚠️ Önce bir IBAN seçin'); return; }
  const b = AS.banks.find(x => x.id === id);
  if (!b) return;
  M.HapticFeedback.impact('heavy');
  closeModal('nfcModal');
  showToast('📡 NFC gönderildi: ' + M.formatIBAN(b.iban).slice(0, 10) + '…');
  AS.addHistory('share', b, 'nfc');
}

function openScanModal() {
  showToast('📷 Kamera QR okuma için yerel uygulama gereklidir');
}

/* ════════════════════════════════════════════
   UNDO
   ════════════════════════════════════════════ */
function showUndoBar(msg) {
  setElText('undoMsg', msg);
  const bar = document.getElementById('undoBar');
  if (bar) bar.classList.add('show');
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    if (bar) bar.classList.remove('show');
    AS.ui.undoStack = [];
  }, 4500);
}

function undoAction() {
  clearTimeout(undoTimer);
  const bar = document.getElementById('undoBar');
  if (bar) bar.classList.remove('show');
  const last = AS.popUndo();
  if (!last) return;
  M.HapticFeedback.notification('success');
  if (last.type === 'deleteBank') {
    AS.banks.unshift(M.createBankAccount ? IBANModel.createBankAccount(last.bank) : last.bank);
    AS.save(); renderAll();
    showToast('↩️ Geri alındı');
  } else if (last.type === 'bulkDelete') {
    last.banks.forEach(b => AS.banks.unshift(b));
    AS.save(); renderAll();
    showToast(`↩️ ${last.banks.length} hesap geri alındı`);
  }
}

/* ════════════════════════════════════════════
   TOAST
   ════════════════════════════════════════════ */
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

/* ════════════════════════════════════════════
   MODALS
   ════════════════════════════════════════════ */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); }
}

/* ════════════════════════════════════════════
   COLOR PICKER
   ════════════════════════════════════════════ */
function initColorPicker(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = M.SYSTEM_COLORS.map(c =>
    `<div class="color-dot" style="background:${c.hex}" data-color="${c.hex}"
      onclick="selectColor('${c.hex}',this,'${elId}')"
      role="radio" aria-label="${c.name}" title="${c.name}"></div>`
  ).join('');
  selectColor(M.SYSTEM_COLORS[0].hex, el.children[0], elId);
}

function selectColor(hex, el, picker) {
  const pid = picker || 'colorPick';
  document.querySelectorAll(`#${pid} .color-dot`).forEach(d => {
    d.classList.remove('sel');
    d.style.removeProperty('box-shadow');
    d.setAttribute('aria-checked', 'false');
  });
  el.classList.add('sel');
  el.style.boxShadow = `0 0 0 2.5px ${hex}`;
  el.setAttribute('aria-checked', 'true');
}

function getSelectedColor(picker) {
  return document.querySelector(`#${picker || 'colorPick'} .color-dot.sel`)?.dataset.color || '#007AFF';
}

/* ════════════════════════════════════════════
   DRAG & DROP (iPad)
   ════════════════════════════════════════════ */
function initDragAndDrop() {
  // Delegated drag events on bankList
  const bankList = document.getElementById('bankList');
  if (!bankList) return;

  bankList.addEventListener('dragover', e => {
    e.preventDefault();
    const target = e.target.closest('.bank-card');
    if (target) target.classList.add('drag-over');
  });

  bankList.addEventListener('dragleave', e => {
    const target = e.target.closest('.bank-card');
    if (target) target.classList.remove('drag-over');
  });

  bankList.addEventListener('drop', e => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    const target    = e.target.closest('.bank-card');
    if (!target || !draggedId) return;
    target.classList.remove('drag-over');
    const targetId = target.dataset.bankId;
    if (!targetId || draggedId === targetId) return;

    // Reorder banks
    const draggedIdx = AS.banks.findIndex(b => b.id === draggedId);
    const targetIdx  = AS.banks.findIndex(b => b.id === targetId);
    if (draggedIdx === -1 || targetIdx === -1) return;
    const [dragged] = AS.banks.splice(draggedIdx, 1);
    AS.banks.splice(targetIdx, 0, dragged);
    AS.save();
    renderBanks();
    M.HapticFeedback.impact('medium');
  });
}

function handleDragStart(e, bankId) {
  e.dataTransfer.setData('text/plain', bankId);
  e.dataTransfer.effectAllowed = 'move';
  // Build drag item payload for drop targets outside the app
  const b = AS.banks.find(x => x.id === bankId);
  if (b) {
    const dragItem = M.buildDragItem(b);
    e.dataTransfer.setData('text/vcard', dragItem.itemProvider.vCard);
  }
  M.HapticFeedback.impact('light');
}

/* ════════════════════════════════════════════
   KEYBOARD SHORTCUTS (iPad / Mac)
   ════════════════════════════════════════════ */
function handleKeyboard(e) {
  if (e.metaKey || e.ctrlKey) {
    switch (e.key) {
      case 'n': e.preventDefault(); openAddModal(); break;
      case 'f': e.preventDefault(); document.getElementById('bankSearch')?.focus(); break;
      case '1': e.preventDefault(); switchTab('home');     break;
      case '2': e.preventDefault(); switchTab('banks');    break;
      case '3': e.preventDefault(); switchTab('contacts'); break;
      case '4': e.preventDefault(); switchTab('history'); break;
      case '5': e.preventDefault(); switchTab('settings'); break;
    }
  }
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
}

/* ════════════════════════════════════════════
   UTILITY HELPERS
   ════════════════════════════════════════════ */
function setElText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setElHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function setInputValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function escHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ── SIRI SHORTCUT STUBS (called from Capacitor native bridge) ── */
window.SiriShortcutHandler = {
  copyIBANByBankName(name) {
    const result = M.SiriIntents.copyIBANByBankName(name, AS);
    if (result.success) { copyIBAN(result.bank.id); }
    else { showToast(`⚠️ "${name}" bulunamadı`); }
  },
  getLastUsedIBAN() {
    const result = M.SiriIntents.getLastUsedIBAN(AS);
    if (result.success) { openDetail(result.bank.id); }
  },
  getFavoriteAccount() {
    const result = M.SiriIntents.getFavoriteAccount(AS);
    if (result.success) { openDetail(result.bank.id); }
  },
  openQRByBankName(name) {
    const result = M.SiriIntents.openQRByBankName(name, AS);
    if (result.success) { openQR(result.bank.id); }
  },
};

/* ── WIDGET ACTION HANDLER (WidgetKit Intent → Capacitor) ── */
window.WidgetActionHandler = {
  copyIBAN(bankId) { copyIBAN(bankId); },
  openQR(bankId)   { openQR(bankId);   },
  openApp(tab)     { switchTab(tab || 'home'); },
};

/* ── START ── */
document.addEventListener('DOMContentLoaded', init);
