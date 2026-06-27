/**
 * IBAN Manager Pro — Data Model Layer
 * Designed for Swift/SwiftUI/Capacitor migration.
 *
 * Architecture mirrors iOS patterns:
 *   - BankAccount  → Codable struct (Swift)
 *   - Contact      → Codable struct (Swift)
 *   - HistoryEntry → Codable struct (Swift)
 *   - AppState     → @Observable class (Swift)
 *
 * Storage Keys follow iCloud CloudKit record type naming conventions.
 * Siri Shortcuts / App Intents: each action is a named intent (e.g. CopyIBANIntent).
 * Spotlight: each bank is indexed via CSSearchableItem attributes.
 * Widgets: widgetDataSnapshot() returns serialisable state for WidgetKit.
 * Handoff: handoffUserActivity() produces NSUserActivity payload.
 * Live Activities: liveActivityAttributes() returns ActivityAttributes.
 * Keychain bridge: security data is isolated under KEYCHAIN_KEYS.
 */

// ─────────────────────────────────────────────
// CONSTANTS — mirrors Swift enum / static let
// ─────────────────────────────────────────────
const APP_VERSION   = '3.0';
const STORAGE_KEY   = 'com.ibanmanager.appstate.v3'; // Bundle-ID style
const KEYCHAIN_KEYS = {                              // Future Keychain migration
  PIN_CODE          : 'com.ibanmanager.security.pin',
  BIOMETRIC_ENABLED : 'com.ibanmanager.security.biometric',
  PRIVACY_LOCK      : 'com.ibanmanager.security.privacyLock',
};

// Matches Apple's system accent / tint palette
const SYSTEM_COLORS = [
  { name:'Mavi',   hex:'#007AFF', swiftColor:'Color.blue'   },
  { name:'Yeşil',  hex:'#34C759', swiftColor:'Color.green'  },
  { name:'Kırmızı',hex:'#FF3B30', swiftColor:'Color.red'    },
  { name:'Turuncu',hex:'#FF9500', swiftColor:'Color.orange' },
  { name:'Mor',    hex:'#AF52DE', swiftColor:'Color.purple' },
  { name:'Pembe',  hex:'#FF2D55', swiftColor:'Color.pink'   },
  { name:'Açık Mavi',hex:'#5AC8FA',swiftColor:'Color.cyan'  },
  { name:'Nane',   hex:'#4CD964', swiftColor:'Color.mint'   },
  { name:'İndigo', hex:'#5856D6', swiftColor:'Color.indigo' },
  { name:'Sarı',   hex:'#FFCC00', swiftColor:'Color.yellow' },
  { name:'Kahve',  hex:'#A2845E', swiftColor:'Color.brown'  },
  { name:'Siyah',  hex:'#1C1C1E', swiftColor:'Color.primary'},
];

// Turkish bank registry — mirrors a Swift enum with associated colors
const TURKISH_BANKS = {
  'Ziraat Bankası':    { color:'#009944', emoji:'🌾', swift:'zitraat'    },
  'Garanti BBVA':      { color:'#009932', emoji:'💚', swift:'garanti'    },
  'İş Bankası':        { color:'#003087', emoji:'🏦', swift:'isbank'     },
  'Akbank':            { color:'#C8102E', emoji:'🔴', swift:'akbank'     },
  'Yapı Kredi':        { color:'#0059A6', emoji:'🏗️', swift:'yapıkredi' },
  'Halkbank':          { color:'#003087', emoji:'🇹🇷', swift:'halkbank'  },
  'Vakıfbank':         { color:'#5C1E82', emoji:'🏛️', swift:'vakifbank' },
  'Denizbank':         { color:'#006DB7', emoji:'🌊', swift:'denizbank'  },
  'ING Bank':          { color:'#FF6200', emoji:'🦁', swift:'ing'        },
  'QNB Finansbank':    { color:'#8B0000', emoji:'💰', swift:'qnb'        },
  'TEB':               { color:'#003087', emoji:'🔵', swift:'teb'        },
  'HSBC':              { color:'#DB0011', emoji:'🌐', swift:'hsbc'       },
  'Şekerbank':         { color:'#E87722', emoji:'🍬', swift:'sekerbank'  },
  'Odeabank':          { color:'#1A1A2E', emoji:'💎', swift:'odeabank'   },
  'Türkiye Finans':    { color:'#006400', emoji:'☪️', swift:'tkfinans'  },
  'Kuveyt Türk':       { color:'#006400', emoji:'☪️', swift:'kuveytturk'},
  'Albaraka Türk':     { color:'#005B5B', emoji:'☪️', swift:'albaraka'  },
  'Ziraat Katılım':    { color:'#009944', emoji:'🌾', swift:'zikaıtlım' },
  'Fibabanka':         { color:'#FF0066', emoji:'🔶', swift:'fibabanka'  },
  'Burgan Bank':       { color:'#005FAD', emoji:'🏦', swift:'burgan'     },
  'Alternatifbank':    { color:'#CC0000', emoji:'🏦', swift:'alternatif' },
};

// Currency registry
const CURRENCIES = [
  { code:'TRY', symbol:'₺', name:'Türk Lirası' },
  { code:'USD', symbol:'$', name:'Amerikan Doları' },
  { code:'EUR', symbol:'€', name:'Euro' },
  { code:'GBP', symbol:'£', name:'İngiliz Sterlini' },
  { code:'CHF', symbol:'₣', name:'İsviçre Frankı' },
  { code:'JPY', symbol:'¥', name:'Japon Yeni' },
  { code:'AED', symbol:'د.إ', name:'BAE Dirhemi' },
  { code:'SAR', symbol:'﷼', name:'Suudi Riyali' },
];

// ─────────────────────────────────────────────
// FACTORY FUNCTIONS — mirrors Swift struct init
// ─────────────────────────────────────────────

/** BankAccount — mirrors Swift Codable struct */
function createBankAccount(partial = {}) {
  return {
    // Core identity (CloudKit CKRecord fields)
    id          : partial.id          || uid(),
    name        : partial.name        || '',
    iban        : partial.iban        || '',
    owner       : partial.owner       || '',
    currency    : partial.currency    || 'TRY',
    color       : partial.color       || getBankColor(partial.name || ''),

    // Account details
    accNum      : partial.accNum      || '',
    branch      : partial.branch      || '',
    branchCode  : partial.branchCode  || '',
    swiftCode   : partial.swiftCode   || '',  // NEW: for international transfers
    bicCode     : partial.bicCode     || '',  // NEW: BIC/SWIFT code

    // Metadata
    desc        : partial.desc        || '',
    tag         : partial.tag         || '',
    note        : partial.note        || '',
    fav         : partial.fav         || false,
    pinned      : partial.pinned      || false,  // NEW: pin to top (different from fav)

    // Timestamps (ISO8601 for iCloud sync)
    createdAt   : partial.createdAt   || Date.now(),
    updatedAt   : partial.updatedAt   || Date.now(),
    lastUsedAt  : partial.lastUsedAt  || null,

    // iCloud / Sync metadata
    iCloudSynced: partial.iCloudSynced || false,
    syncVersion : partial.syncVersion  || 1,

    // Spotlight indexing attributes
    spotlight   : {
      title     : partial.name        || '',
      subtitle  : partial.iban        || '',
      keywords  : [partial.name, partial.owner, partial.tag, partial.currency].filter(Boolean),
    },

    // Siri Shortcuts / App Intents metadata
    shortcutId  : `copy-iban-${partial.id || ''}`,  // Unique shortcut identifier
    intentData  : {
      bankName  : partial.name  || '',
      iban      : partial.iban  || '',
      owner     : partial.owner || '',
    },
  };
}

/** Contact — mirrors Swift Codable struct */
function createContact(partial = {}) {
  return {
    id          : partial.id      || uid(),
    name        : partial.name    || '',
    phone       : partial.phone   || '',
    email       : partial.email   || '',
    note        : partial.note    || '',
    color       : partial.color   || SYSTEM_COLORS[Math.abs(hashStr(partial.name || '')) % SYSTEM_COLORS.length].hex,
    bankIds     : partial.bankIds || [],
    fav         : partial.fav     || false,
    avatarInitials: partial.name ? getInitials(partial.name) : '?',
    createdAt   : partial.createdAt || Date.now(),
    updatedAt   : partial.updatedAt || Date.now(),
    lastUsed    : partial.lastUsed  || Date.now(),
    iCloudSynced: partial.iCloudSynced || false,
  };
}

/** HistoryEntry — mirrors Swift Codable struct */
function createHistoryEntry(type, bank, via = null) {
  return {
    id       : uid(),
    type,                               // 'copy' | 'share' | 'view'
    bankId   : bank?.id   || '',
    bankName : bank?.name || '',
    iban     : bank?.iban || '',
    via,                                // WhatsApp, Telegram, AirDrop, etc.
    ts       : Date.now(),
    // For Live Activities / Dynamic Island
    displayText : `${bank?.name || ''} · ${formatIBAN(bank?.iban || '').slice(0,10)}…`,
  };
}

/** AppSettings — mirrors UserDefaults / @AppStorage */
function defaultSettings() {
  return {
    // Security (future: Keychain + Secure Enclave)
    lock            : false,
    faceid          : false,
    touchid         : false,         // NEW: separate Touch ID flag
    pinCode         : '1234',        // Future: move to Keychain
    biometricType   : 'none',        // 'faceID' | 'touchID' | 'none'

    // Privacy
    privacy         : false,
    privacyOnBackground: true,        // NEW: blur on app background (iOS feature)

    // Sharing
    includeOwner    : true,
    defaultShare    : 'ask',

    // Appearance
    fontSize        : 'normal',       // 'small' | 'normal' | 'large' | 'xlarge' (Dynamic Type)
    theme           : 'auto',         // 'light' | 'dark' | 'auto'
    reduceMotion    : false,          // Accessibility: Reduce Motion
    highContrast    : false,          // Accessibility: Increase Contrast
    boldText        : false,          // NEW: Accessibility Bold Text
    hapticFeedback  : true,           // NEW: Haptic Engine toggle

    // Backup / iCloud
    autoBackup      : true,
    iCloudSync      : false,          // NEW: iCloud sync toggle
    lastBackupDate  : null,

    // Localisation
    language        : 'tr',
    region          : 'TR',

    // Widget preferences (WidgetKit)
    widgetBankId    : null,           // Primary bank for small widget
    widgetBankIds   : [],             // Banks for medium/large widget

    // Notifications (future: UNUserNotificationCenter)
    notificationsEnabled: false,
  };
}

/** AppStats — mirrors a Swift ObservableObject with @Published */
function defaultStats() {
  return {
    copies   : 0,
    shares   : 0,
    views    : 0,
    activity : new Array(12).fill(0),  // monthly activity (12 months)
    weeklyActivity: new Array(7).fill(0), // NEW: daily activity (Mon–Sun)
  };
}

// ─────────────────────────────────────────────
// APPLE ECOSYSTEM BRIDGE FUNCTIONS
// These are stubs that map directly to Swift APIs
// ─────────────────────────────────────────────

/**
 * Siri Shortcuts / App Intents
 * Each function maps to an AppIntent in Swift.
 * Swift equivalent: struct CopyIBANIntent: AppIntent {}
 */
const SiriIntents = {
  /** "Garanti IBAN'ımı paylaş" */
  copyIBANByBankName(bankName, state) {
    const bank = state.banks.find(b =>
      b.name.toLowerCase().includes(bankName.toLowerCase())
    );
    return bank ? { success: true, bank, intent: 'CopyIBANIntent' } : { success: false };
  },

  /** "Son kullandığım IBAN'ı paylaş" */
  getLastUsedIBAN(state) {
    if (!state.history.length) return { success: false };
    const last = state.history[0];
    const bank = state.banks.find(b => b.id === last.bankId);
    return bank ? { success: true, bank, intent: 'LastUsedIBANIntent' } : { success: false };
  },

  /** "Favori hesabımı aç" */
  getFavoriteAccount(state) {
    const fav = state.banks.find(b => b.fav);
    return fav ? { success: true, bank: fav, intent: 'FavoriteAccountIntent' } : { success: false };
  },

  /** "Akbank QR kodunu aç" */
  openQRByBankName(bankName, state) {
    const bank = state.banks.find(b =>
      b.name.toLowerCase().includes(bankName.toLowerCase())
    );
    return bank ? { success: true, bank, intent: 'OpenQRIntent' } : { success: false };
  },
};

/**
 * Spotlight Search Index
 * Swift equivalent: CSSearchableItem + CSSearchableItemAttributeSet
 */
function buildSpotlightIndex(banks) {
  return banks.map(b => ({
    uniqueIdentifier  : `com.ibanmanager.bank.${b.id}`,
    domainIdentifier  : 'com.ibanmanager.banks',
    attributeSet: {
      title           : b.name,
      contentDescription : `${formatIBAN(b.iban)} · ${b.owner || ''} · ${b.currency}`,
      keywords        : [b.name, b.owner, b.tag, b.currency, b.iban].filter(Boolean),
      thumbnailData   : null,  // Set bank logo in Swift
      userCreated     : true,
    },
  }));
}

/**
 * Handoff — NSUserActivity
 * Swift: view.userActivity(NSUserActivity(activityType: ...))
 */
function buildHandoffActivity(bankId) {
  return {
    activityType    : 'com.ibanmanager.viewbank',
    title           : 'IBAN Manager',
    userInfo        : { bankId },
    isEligibleForHandoff      : true,
    isEligibleForSearch       : true,
    isEligibleForPublicIndexing: false,
    needsSave       : true,
    webpageURL      : `https://ibanmanager.app/bank/${bankId}`, // Universal Link base
  };
}

/**
 * Universal Links
 * Apple App Site Association (AASA) compatible URL scheme.
 * Routes: /bank/:id  /share/:iban  /contact/:id
 */
const UniversalLinks = {
  bankURL      : (id)   => `https://ibanmanager.app/bank/${id}`,
  shareURL     : (iban) => `https://ibanmanager.app/share/${iban.replace(/\s/g, '')}`,
  contactURL   : (id)   => `https://ibanmanager.app/contact/${id}`,
  homeURL      :           'https://ibanmanager.app/',
};

/**
 * WidgetKit Data Snapshot
 * Swift: struct IBANEntry: TimelineEntry {}
 * Sizes: systemSmall, systemMedium, systemLarge, accessoryCircular (Lock Screen), accessoryInline
 */
function buildWidgetSnapshot(state) {
  const favBank = state.banks.find(b => b.id === state.settings.widgetBankId)
    || state.banks.find(b => b.fav)
    || state.banks[0];

  const recentHistory = state.history.slice(0, 1)[0];
  const recentBank    = recentHistory ? state.banks.find(b => b.id === recentHistory.bankId) : null;

  return {
    // systemSmall — single bank IBAN
    small: favBank ? {
      bankName : favBank.name,
      iban     : formatIBAN(favBank.iban),
      ibanRaw  : favBank.iban,
      owner    : favBank.owner,
      color    : favBank.color,
      currency : favBank.currency,
      actions  : ['copyIBAN', 'openQR'],
    } : null,

    // systemMedium — 2 banks + quick actions
    medium: {
      banks: state.banks
        .filter(b => state.settings.widgetBankIds.includes(b.id) || b.fav)
        .slice(0, 2)
        .map(b => ({ id: b.id, name: b.name, iban: formatIBAN(b.iban), color: b.color })),
      actions: ['copyIBAN', 'openQR', 'openApp'],
    },

    // systemLarge — up to 4 banks + history
    large: {
      banks: state.banks.slice(0, 4).map(b => ({
        id: b.id, name: b.name, iban: formatIBAN(b.iban), color: b.color, owner: b.owner,
      })),
      recentBank: recentBank ? { name: recentBank.name, iban: formatIBAN(recentBank.iban) } : null,
      totalCount: state.banks.length,
    },

    // accessoryCircular (Lock Screen / Apple Watch Complication)
    lockScreen: {
      totalBanks : state.banks.length,
      label      : 'IBAN',
      value      : state.banks.length.toString(),
    },

    // Control Center Widget (iOS 18+)
    controlWidget: favBank ? {
      label   : favBank.name.slice(0, 12),
      action  : 'copyIBAN',
      bankId  : favBank.id,
    } : null,
  };
}

/**
 * Live Activities — ActivityAttributes
 * Swift: struct IBANSharingAttributes: ActivityAttributes {}
 */
function buildLiveActivityAttributes(bank, action) {
  return {
    // Static attributes (ActivityAttributes)
    bankName    : bank.name,
    bankColor   : bank.color,
    iban        : formatIBAN(bank.iban),
    owner       : bank.owner,

    // Dynamic state (ContentState)
    contentState: {
      action,             // 'copying' | 'sharing' | 'shared' | 'done'
      timestamp : Date.now(),
      progress  : action === 'done' ? 1.0 : 0.5,
    },

    // Dynamic Island
    dynamicIsland: {
      compactLeading  : bank.name.slice(0, 8),
      compactTrailing : formatIBAN(bank.iban).slice(0, 8),
      minimal         : bank.name.slice(0, 4),
      expanded: {
        header  : `${bank.name} — IBAN ${action === 'done' ? 'Kopyalandı ✓' : 'Kopyalanıyor…'}`,
        body    : formatIBAN(bank.iban),
        footer  : `${bank.owner || ''} · ${bank.currency}`,
      },
    },
  };
}

/**
 * Apple Watch
 * Swift: WKInterfaceController / WatchConnectivity WCSession
 */
function buildWatchPayload(state) {
  return {
    // WKApplicationContext (always-current data)
    applicationContext: {
      banks: state.banks.slice(0, 10).map(b => ({
        id: b.id, name: b.name, iban: b.iban, color: b.color, fav: b.fav,
      })),
      favBank: state.banks.find(b => b.fav) || state.banks[0] || null,
      totalCount: state.banks.length,
    },
    // Complication data (watch face)
    complicationData: {
      label: 'IBAN',
      value: state.banks.length.toString(),
      detail: state.banks.find(b => b.fav)?.name || '',
    },
  };
}

/**
 * Share Sheet — UIActivityViewController items
 * Swift: UIActivityViewController(activityItems: items, applicationActivities: nil)
 */
function buildShareSheetItems(bank, format = 'text') {
  const text = buildShareText(bank, true);
  return {
    text,
    url     : UniversalLinks.shareURL(bank.iban),
    subject : `IBAN Bilgileri — ${bank.name}`,
    // For UIActivity types
    activities: ['copyToPasteboard', 'message', 'mail', 'airDrop', 'addToNotes'],
  };
}

/**
 * Drag & Drop — UIDragItem / UIDropInteraction
 * Swift: UIDragItem(itemProvider: NSItemProvider(object: text as NSString))
 */
function buildDragItem(bank) {
  return {
    itemProvider: {
      // UTType.plainText
      text : `${bank.name}\nIBAN: ${formatIBAN(bank.iban)}\nHesap Sahibi: ${bank.owner}\nPara Birimi: ${bank.currency}`,
      url  : UniversalLinks.bankURL(bank.id),
      // For Contacts app drop target
      vCard: buildVCard(bank),
    },
    previewParameters: {
      visiblePath: null,          // Custom shadow path
      backgroundColor: bank.color,
    },
  };
}

/**
 * Haptic Feedback — UIImpactFeedbackGenerator / UINotificationFeedbackGenerator
 * Swift: UIImpactFeedbackGenerator(style: .medium).impactOccurred()
 */
const HapticFeedback = {
  impact(style = 'medium') {
    // Web API bridge (iOS Safari supports this via navigator.vibrate polyfill in WKWebView)
    const patterns = { light: [10], medium: [15], heavy: [25], rigid: [8], soft: [20] };
    if (navigator.vibrate) navigator.vibrate(patterns[style] || patterns.medium);
  },
  notification(type = 'success') {
    const patterns = { success: [10, 50, 10], warning: [20, 30, 20], error: [15, 30, 15, 30, 15] };
    if (navigator.vibrate) navigator.vibrate(patterns[type] || patterns.success);
  },
  selection() {
    if (navigator.vibrate) navigator.vibrate([5]);
  },
};

/**
 * Face ID / Touch ID — LocalAuthentication
 * Swift: LAContext().evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, ...)
 */
const BiometricAuth = {
  type: 'faceID',   // Detected from device model in Swift
  async authenticate() {
    // Stub — replaced by WKWebView <-> Swift bridge in Capacitor
    // In native: LAContext().evaluatePolicy(...)
    return new Promise(resolve => {
      // Simulate biometric success for web prototype
      setTimeout(() => resolve({ success: true, type: this.type }), 600);
    });
  },
  isAvailable() {
    // In Capacitor: check LAContext().canEvaluatePolicy(...)
    return true;
  },
};

// ─────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function hashStr(s) {
  let h = 0;
  for (const c of s) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return h;
}

function getBankColor(name) {
  return TURKISH_BANKS[name]?.color
    || SYSTEM_COLORS[Math.abs(hashStr(name || '')) % SYSTEM_COLORS.length].hex;
}

function getBankEmoji(name) {
  const known = TURKISH_BANKS[name]?.emoji;
  if (known) return known;
  const l = (name || '').toLowerCase();
  if (l.includes('ziraat'))  return '🌾';
  if (l.includes('garanti')) return '💚';
  if (l.includes('akbank'))  return '🔴';
  if (l.includes('deniz'))   return '🌊';
  if (l.includes('ing'))     return '🦁';
  return '🏦';
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatIBAN(iban) {
  if (!iban) return '';
  const clean = iban.replace(/\s/g, '').toUpperCase();
  return clean.match(/.{1,4}/g)?.join(' ') || clean;
}

function validateIBAN(iban) {
  const c = iban.replace(/\s/g, '').toUpperCase();
  if (!c.startsWith('TR')) return { valid: false, error: 'IBAN TR ile başlamalıdır' };
  if (c.length !== 26)     return { valid: false, error: 'TR IBAN 26 karakter olmalıdır' };
  // ISO 7064 MOD-97 checksum
  try {
    const rearranged = c.slice(4) + c.slice(0, 4);
    const numeric = rearranged.split('').map(ch => {
      const n = parseInt(ch);
      return isNaN(n) ? (ch.charCodeAt(0) - 55).toString() : ch;
    }).join('');
    let remainder = 0;
    for (let i = 0; i < numeric.length; i += 9) {
      remainder = parseInt(String(remainder) + numeric.slice(i, i + 9)) % 97;
    }
    if (remainder !== 1) return { valid: false, error: 'IBAN kontrol hanesi geçersiz' };
  } catch (e) {}
  return { valid: true, iban: c };
}

function buildShareText(bank, includeOwner = true) {
  const lines = [`🏦 ${bank.name}`];
  if (includeOwner && bank.owner) lines.push(`👤 ${bank.owner}`);
  lines.push(`📋 IBAN: ${formatIBAN(bank.iban)}`);
  lines.push(`💱 ${bank.currency || 'TRY'}`);
  if (bank.branch) lines.push(`🏢 ${bank.branch}`);
  if (bank.desc)   lines.push(`📝 ${bank.desc}`);
  return lines.join('\n');
}

function buildVCard(bank) {
  return [
    'BEGIN:VCARD', 'VERSION:3.0',
    `FN:${bank.owner || bank.name}`,
    `ORG:${bank.name}`,
    `NOTE:IBAN: ${formatIBAN(bank.iban)}\\nPara Birimi: ${bank.currency}`,
    'END:VCARD',
  ].join('\r\n');
}

function relativeTime(ts) {
  const d = Date.now() - ts;
  if (d < 60000)      return 'Az önce';
  if (d < 3600000)    return `${Math.floor(d / 60000)} dk önce`;
  if (d < 86400000)   return `${Math.floor(d / 3600000)} sa önce`;
  if (d < 604800000)  return `${Math.floor(d / 86400000)} gün önce`;
  return new Date(ts).toLocaleDateString('tr-TR', { day:'numeric', month:'short' });
}

function dateString() {
  return new Date().toISOString().slice(0, 10);
}

// Export as module-compatible object (Capacitor / ESM ready)
window.IBANModel = {
  // Factories
  createBankAccount, createContact, createHistoryEntry,
  defaultSettings, defaultStats,
  // Apple bridges
  SiriIntents, buildSpotlightIndex, buildHandoffActivity,
  UniversalLinks, buildWidgetSnapshot,
  buildLiveActivityAttributes, buildWatchPayload,
  buildShareSheetItems, buildDragItem,
  HapticFeedback, BiometricAuth,
  // Constants
  SYSTEM_COLORS, TURKISH_BANKS, CURRENCIES, KEYCHAIN_KEYS,
  APP_VERSION, STORAGE_KEY,
  // Utils
  uid, hashStr, getBankColor, getBankEmoji, getInitials,
  formatIBAN, validateIBAN, buildShareText, buildVCard,
  relativeTime, dateString,
};
