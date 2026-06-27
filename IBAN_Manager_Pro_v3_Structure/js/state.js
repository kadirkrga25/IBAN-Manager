/**
 * IBAN Manager Pro — State & Storage Layer
 * Mirrors Swift @Observable AppModel + SwiftData / CloudKit persistence.
 *
 * State management pattern follows iOS architecture:
 *   - Single source of truth (AppState)
 *   - Reactive updates (equivalent to @Published / Observation)
 *   - Persistence via localStorage (→ SwiftData in native)
 *   - iCloud sync stubs (→ CloudKit in native)
 */

class AppStateManager {
  constructor() {
    // Core state — mirrors Swift @Observable class AppModel
    this.banks    = [];
    this.contacts = [];
    this.history  = [];
    this.settings = IBANModel.defaultSettings();
    this.stats    = IBANModel.defaultStats();

    // UI state — not persisted (Swift @State)
    this.ui = {
      activeTab       : 'home',
      searchQuery     : '',
      bankFilter      : 'all',
      sortMode        : 'recent',
      contactSearch   : '',
      contactFilter   : 'all',
      historyFilter   : 'all',
      bulkMode        : false,
      selectedBanks   : new Set(),
      currentBankId   : null,
      currentShareText: '',
      pinEntry        : '',
      undoStack       : [],
      undoTimer       : null,
      tempContactBankLinks: [],
      isLoading       : false,
    };
  }

  // ── PERSISTENCE ──────────────────────────────

  save() {
    try {
      const payload = {
        version  : IBANModel.APP_VERSION,
        banks    : this.banks,
        contacts : this.contacts,
        history  : this.history,
        settings : { ...this.settings, pinCode: undefined },   // Keychain separation
        pinCode  : this.settings.pinCode,                       // Isolated key (future Keychain)
        stats    : this.stats,
        savedAt  : Date.now(),
      };
      localStorage.setItem(IBANModel.STORAGE_KEY, JSON.stringify(payload));

      // Stub: iCloud sync
      if (this.settings.iCloudSync) {
        this._syncToiCloud(payload);
      }

      // Stub: update Spotlight index
      this._updateSpotlightIndex();

      // Stub: update widget data
      this._updateWidgetData();

      return true;
    } catch (e) {
      console.error('[AppState] save failed:', e);
      return false;
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(IBANModel.STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);

      // Migrate old v2 data if needed
      const migrated = this._migrate(data);

      this.banks    = (migrated.banks    || []).map(b => IBANModel.createBankAccount(b));
      this.contacts = (migrated.contacts || []).map(c => IBANModel.createContact(c));
      this.history  = migrated.history  || [];
      this.stats    = { ...IBANModel.defaultStats(), ...(migrated.stats || {}) };
      this.settings = { ...IBANModel.defaultSettings(), ...(migrated.settings || {}),
        pinCode: migrated.pinCode || '1234' };

      return true;
    } catch (e) {
      console.error('[AppState] load failed:', e);
      return false;
    }
  }

  _migrate(data) {
    // v1 → v2 → v3 migration chain
    if (!data.version || data.version < '3.0') {
      // Ensure all banks have new fields
      if (data.banks) {
        data.banks = data.banks.map(b => ({
          swiftCode: '', bicCode: '', pinned: false,
          updatedAt: b.createdAt || Date.now(),
          lastUsedAt: null, iCloudSynced: false, syncVersion: 1,
          ...b,
        }));
      }
    }
    return data;
  }

  // ── BANK CRUD ─────────────────────────────────

  addBank(partial) {
    const bank = IBANModel.createBankAccount(partial);
    this.banks.unshift(bank);
    this._trackMonthlyActivity();
    this.save();
    return bank;
  }

  updateBank(id, partial) {
    const idx = this.banks.findIndex(b => b.id === id);
    if (idx === -1) return null;
    const updated = IBANModel.createBankAccount({ ...this.banks[idx], ...partial, updatedAt: Date.now() });
    this.banks[idx] = updated;
    this.save();
    return updated;
  }

  deleteBank(id) {
    const bank = this.banks.find(b => b.id === id);
    if (!bank) return null;
    this.banks = this.banks.filter(b => b.id !== id);
    this.save();
    return bank;
  }

  toggleFav(id) {
    const bank = this.banks.find(b => b.id === id);
    if (!bank) return;
    bank.fav = !bank.fav;
    bank.updatedAt = Date.now();
    this.save();
  }

  duplicateBank(id) {
    const bank = this.banks.find(b => b.id === id);
    if (!bank) return null;
    const copy = IBANModel.createBankAccount({
      ...JSON.parse(JSON.stringify(bank)),
      id: IBANModel.uid(),
      name: bank.name + ' (Kopya)',
      fav: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    this.banks.unshift(copy);
    this.save();
    return copy;
  }

  getBanksByFilter(filter, query, sort) {
    let result = [...this.banks];

    // Search
    if (query) {
      const q = query.toLowerCase().replace(/\s/g, '');
      result = result.filter(b =>
        b.name.toLowerCase().includes(q) ||
        (b.owner || '').toLowerCase().includes(q) ||
        (b.iban || '').replace(/\s/g, '').toLowerCase().includes(q) ||
        (b.desc || '').toLowerCase().includes(q) ||
        (b.tag  || '').toLowerCase().includes(q) ||
        (b.accNum || '').includes(q)
      );
    }

    // Filter
    if      (filter === 'fav')    result = result.filter(b => b.fav);
    else if (filter === 'pinned') result = result.filter(b => b.pinned);
    else if (filter !== 'all')    result = result.filter(b => b.currency === filter);

    // Sort
    const s = sort || this.ui.sortMode;
    if      (s === 'az')     result.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    else if (s === 'za')     result.sort((a, b) => b.name.localeCompare(a.name, 'tr'));
    else if (s === 'fav')    result.sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0));
    else if (s === 'used')   result.sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
    else                     result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // Pinned always on top
    result.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

    return result;
  }

  // ── CONTACT CRUD ──────────────────────────────

  addContact(partial) {
    const contact = IBANModel.createContact(partial);
    this.contacts.unshift(contact);
    this.save();
    return contact;
  }

  updateContact(id, partial) {
    const idx = this.contacts.findIndex(c => c.id === id);
    if (idx === -1) return null;
    this.contacts[idx] = IBANModel.createContact({ ...this.contacts[idx], ...partial, updatedAt: Date.now() });
    this.save();
    return this.contacts[idx];
  }

  deleteContact(id) {
    this.contacts = this.contacts.filter(c => c.id !== id);
    this.save();
  }

  // ── HISTORY ──────────────────────────────────

  addHistory(type, bank, via = null) {
    if (!bank) return;
    const entry = IBANModel.createHistoryEntry(type, bank, via);
    this.history.unshift(entry);
    if (this.history.length > 500) this.history = this.history.slice(0, 500);

    // Update stats
    if (type === 'copy')  this.stats.copies++;
    if (type === 'share') this.stats.shares++;
    if (type === 'view')  this.stats.views++;

    // Update bank lastUsedAt
    const b = this.banks.find(b => b.id === bank.id);
    if (b) b.lastUsedAt = Date.now();

    this._trackMonthlyActivity();
    this.save();
    return entry;
  }

  getHistoryByFilter(filter) {
    if (filter === 'all') return this.history;
    return this.history.filter(h => h.type === filter);
  }

  clearHistory() {
    this.history = [];
    this.save();
  }

  // ── SETTINGS ─────────────────────────────────

  toggleSetting(key) {
    this.settings[key] = !this.settings[key];
    this.save();
    return this.settings[key];
  }

  updateSetting(key, value) {
    this.settings[key] = value;
    this.save();
  }

  // ── EXPORT / IMPORT ──────────────────────────

  exportJSON() {
    const data = {
      version  : IBANModel.APP_VERSION,
      exportedAt: new Date().toISOString(),
      banks    : this.banks,
      contacts : this.contacts,
      history  : this.history.slice(0, 100),
      stats    : this.stats,
    };
    this._downloadFile(
      `iban-backup-${IBANModel.dateString()}.json`,
      JSON.stringify(data, null, 2),
      'application/json'
    );
  }

  exportCSV() {
    const headers = ['Banka Adı','IBAN','Hesap Sahibi','Şube','Hesap No','Para Birimi','Açıklama','Etiket','Swift/BIC'];
    const rows = this.banks.map(b => [
      b.name, IBANModel.formatIBAN(b.iban), b.owner || '', b.branch || '',
      b.accNum || '', b.currency || 'TRY', b.desc || '', b.tag || '',
      b.swiftCode || b.bicCode || ''
    ].map(v => `"${v}"`).join(','));
    this._downloadFile(
      `iban-export-${IBANModel.dateString()}.csv`,
      [headers.join(','), ...rows].join('\n'),
      'text/csv;charset=utf-8'
    );
  }

  importJSON(jsonStr) {
    const data = JSON.parse(jsonStr);
    if (!data.banks || !Array.isArray(data.banks)) {
      throw new Error('Geçersiz dosya formatı');
    }
    const newBanks = data.banks.filter(b => !this.banks.find(x => x.id === b.id));
    this.banks = [...this.banks, ...newBanks.map(b => IBANModel.createBankAccount(b))];
    if (data.contacts && Array.isArray(data.contacts)) {
      const nc = data.contacts.filter(c => !this.contacts.find(x => x.id === c.id));
      this.contacts = [...this.contacts, ...nc.map(c => IBANModel.createContact(c))];
    }
    if (data.stats) this.stats = { ...this.stats, ...data.stats };
    this.save();
    return newBanks.length;
  }

  // ── UNDO ─────────────────────────────────────

  pushUndo(action) {
    this.ui.undoStack = [action];  // Keep last 1 undo (iOS behavior)
  }

  popUndo() {
    return this.ui.undoStack.pop();
  }

  // ── SEED DATA ────────────────────────────────

  seedDemoData() {
    const b1 = this.addBank({ name:'Ziraat Bankası',  iban:'TR330006100519786457841326', owner:'Ahmet Yılmaz', branch:'Merkez',     branchCode:'0061', accNum:'5197864578',  currency:'TRY', desc:'Maaş Hesabı',  tag:'kişisel',  note:'Ana hesap', fav:true  });
    const b2 = this.addBank({ name:'Garanti BBVA',    iban:'TR660006200119000006672330', owner:'Ahmet Yılmaz', branch:'Atatürk Blv.',branchCode:'0062', accNum:'1900000667',  currency:'TRY', desc:'Tasarruf',     tag:'tasarruf', note:'',          fav:false });
    const b3 = this.addBank({ name:'İş Bankası',      iban:'TR320006400000142981000002', owner:'Ahmet Yılmaz', branch:'Kızılay',    branchCode:'0064', accNum:'142981000002', currency:'USD', desc:'Döviz Hesabı', tag:'döviz',    note:'',          fav:true  });
    const b4 = this.addBank({ name:'Akbank',          iban:'TR590004600155888000167353', owner:'Fatma Yılmaz', branch:'Beşiktaş',   branchCode:'0046', accNum:'5588800016',  currency:'EUR', desc:'Euro Hesabı',  tag:'döviz',    note:'Eş hesabı', fav:false });

    this.addContact({ name:'Ali Kaya',    phone:'+90 532 111 22 33', email:'ali@example.com',  bankIds:[b1.id], note:'',             fav:true,  lastUsed: Date.now()-86400000   });
    this.addContact({ name:'Ayşe Demir', phone:'+90 541 222 33 44', email:'ayse@example.com', bankIds:[b2.id, b3.id], note:'İş arkadaşı', fav:false, lastUsed: Date.now()-86400000*3 });

    this.addHistory('copy',  b1, null);
    this.addHistory('share', b3, 'whatsapp');
    this.addHistory('view',  b2, null);

    this.stats.activity = [2, 5, 3, 8, 4, 6, 7, 3, 5, 9, 4, 6];
    this.save();
  }

  // ── PRIVATE HELPERS ───────────────────────────

  _trackMonthlyActivity() {
    const month = new Date().getMonth();
    if (!this.stats.activity) this.stats.activity = new Array(12).fill(0);
    this.stats.activity[month] = (this.stats.activity[month] || 0) + 1;
    const day = new Date().getDay();
    if (!this.stats.weeklyActivity) this.stats.weeklyActivity = new Array(7).fill(0);
    this.stats.weeklyActivity[day] = (this.stats.weeklyActivity[day] || 0) + 1;
  }

  _downloadFile(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Stubs for native bridges
  _syncToiCloud(payload)     { /* CloudKit CKModifyRecordsOperation */ }
  _updateSpotlightIndex()    { /* CSSearchableIndex.default().indexSearchableItems(...) */ }
  _updateWidgetData()        {
    // WidgetKit: WidgetCenter.shared.reloadAllTimelines()
    const snapshot = IBANModel.buildWidgetSnapshot({
      banks: this.banks, history: this.history, settings: this.settings
    });
    try { sessionStorage.setItem('widgetSnapshot', JSON.stringify(snapshot)); } catch(e) {}
  }
}

// Singleton instance — mirrors Swift @Environment(\.modelContext)
window.AppState = new AppStateManager();
