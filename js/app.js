/**
 * ADRC REC Speaker Series Dashboard
 * Data persists in localStorage; initial load from data/speakers.json
 */

const STORAGE_KEY = 'adrc-rec-speaker-series-v3';
const DATA_VERSION = '2026-09-02-v7';
const VERSION_KEY = 'adrc-rec-data-version';

const CONFIG = {
  recordingsAccessUrl: 'https://uscedu-my.sharepoint.com/shared?listurl=https%3A%2F%2Fuscedu%2Dmy%2Esharepoint%2Ecom%2Fpersonal%2Fchangell%5Fusc%5Fedu%2FDocuments&e=5%3A7cf79c4a1354421c8bb8c7cabf18356c&sharingv2=true&fromShare=true&at=9&id=%2Fpersonal%2Fchangell%5Fusc%5Fedu%2FDocuments%2FNeurobehavior%20Conference%2FADRC%20REC%20Training%20Core&FolderCTID=0x0120005B95EFCE83E1EC4585EE44F71B3E15D4',
  recordingsContactEmail: 'John.Ringman@med.usc.edu',
  recordingsContactName: 'the ADRC REC team',
};
const META_KEY = 'adrc-rec-meta';
const DEFAULT_YEAR = '2026-2027';

let data = {};
let meta = { lastUpdated: null };
let currentYear = DEFAULT_YEAR;
let editingId = null;

// ── Data layer ──────────────────────────────────────────────

async function loadData() {
  if (localStorage.getItem(VERSION_KEY) !== DATA_VERSION) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(META_KEY);
    localStorage.setItem(VERSION_KEY, DATA_VERSION);
  }

  const storedMeta = localStorage.getItem(META_KEY);
  if (storedMeta) {
    try {
      meta = JSON.parse(storedMeta);
    } catch {
      localStorage.removeItem(META_KEY);
    }
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      data = JSON.parse(stored);
      extractMetaFromData();
      return;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  const res = await fetch('data/speakers.json');
  if (!res.ok) throw new Error('Could not load speakers.json');
  const loaded = await res.json();
  extractMetaFromPayload(loaded);
  saveData(false, false);
}

function extractMetaFromPayload(payload) {
  if (payload._meta) {
    meta.lastUpdated = payload._meta.lastUpdated || null;
    delete payload._meta;
  }
  data = payload;
}

function extractMetaFromData() {
  if (data._meta) {
    meta.lastUpdated = data._meta.lastUpdated || meta.lastUpdated;
    delete data._meta;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}

function touchLastUpdated() {
  meta.lastUpdated = new Date().toISOString();
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

function saveData(showToast = true, touchMeta = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  if (touchMeta) touchLastUpdated();
  if (showToast) showToastMsg('Changes saved');
  renderLastUpdated();
}

function getYears() {
  return Object.keys(data).filter(k => k !== '_meta').sort((a, b) => b.localeCompare(a));
}

function getEntries(year) {
  return (data[year]?.entries || []).slice();
}

function cleanData() {
  let changed = false;
  Object.keys(data).forEach(year => {
    if (year === '_meta' || !data[year]?.entries) return;
    const before = data[year].entries.length;
    data[year].entries = data[year].entries.filter(e => e.entryType !== 'blocked');
    data[year].entries.forEach(e => delete e.entryType);
    if (data[year].entries.length !== before) changed = true;
  });
  if (changed) saveData(false, false);
}

function generateId(year) {
  const entries = getEntries(year);
  const nums = entries.map(e => parseInt(e.id.split('-').pop(), 10)).filter(n => !isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `${year}-${next}`;
}

function upsertEntry(year, entry) {
  if (!data[year]) {
    data[year] = { label: `ADRC REC ${year}`, entries: [] };
  }
  const idx = data[year].entries.findIndex(e => e.id === entry.id);
  if (idx >= 0) {
    data[year].entries[idx] = entry;
  } else {
    data[year].entries.push(entry);
  }
  sortEntries(year);
  saveData();
}

function deleteEntry(year, id) {
  if (!data[year]) return;
  data[year].entries = data[year].entries.filter(e => e.id !== id);
  saveData();
}

function sortEntries(year) {
  if (!data[year]) return;
  data[year].entries.sort((a, b) => {
    const da = parseDate(a.date);
    const db = parseDate(b.date);
    if (da && db) return da - db;
    if (da) return -1;
    if (db) return 1;
    return 0;
  });
}

// ── Utilities ───────────────────────────────────────────────

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str + 'T12:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(str) {
  const d = parseDate(str);
  if (!d) return str || '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDay(str) {
  const d = parseDate(str);
  if (!d) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

function isUpcoming(str) {
  const d = parseDate(str);
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d >= today;
}

function isPast(str) {
  const d = parseDate(str);
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

function formatLastUpdated(iso) {
  if (!iso) return formatToday();
  const d = new Date(iso);
  if (isNaN(d.getTime())) return formatToday();
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatToday() {
  return new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function getSpeakerEntries(year) {
  return getEntries(year);
}

function getBookedEntries(year) {
  return getSpeakerEntries(year).filter(e => e.status !== 'Open' && e.name !== 'Open slot');
}

function getUpcomingSpeakers(year) {
  return getSpeakerEntries(year).filter(e => isUpcoming(e.date) && e.status !== 'Open');
}

function getOpenSlots(year) {
  return getSpeakerEntries(year).filter(e => e.status === 'Open' && isUpcoming(e.date));
}

function getPastSpeakers(year) {
  return getSpeakerEntries(year).filter(e => isPast(e.date) && e.status !== 'Open');
}

function isArchiveYear(year) {
  return getUpcomingSpeakers(year).length === 0 && getOpenSlots(year).length === 0 && getPastSpeakers(year).length > 0;
}

function inferFromEmail(email) {
  const domainMap = {
    'usc.edu': ['USC', 'Internal'],
    'med.usc.edu': ['USC', 'Internal'],
    'ucla.edu': ['UCLA', 'External'],
    'g.ucla.edu': ['UCLA', 'External'],
    'mednet.ucla.edu': ['UCLA', 'External'],
    'uci.edu': ['UC Irvine', 'External'],
    'ucsd.edu': ['UC San Diego', 'External'],
    'health.ucsd.edu': ['UC San Diego', 'External'],
    'ucsf.edu': ['UCSF', 'External'],
    'ucsb.edu': ['UC Santa Barbara', 'External'],
    'uw.edu': ['University of Washington', 'External'],
    'mayo.edu': ['Mayo Clinic', 'External'],
    'wustl.edu': ['Washington University in St. Louis', 'External'],
    'cumc.columbia.edu': ['Columbia University', 'External'],
    'wayne.edu': ['Wayne State University', 'External'],
    'uky.edu': ['University of Kentucky', 'External'],
    'brown.edu': ['Brown University', 'External'],
    'rush.edu': ['Rush University', 'External'],
    'duke.edu': ['Duke University', 'External'],
    'ucf.edu': ['University of Central Florida', 'External'],
    'clemson.edu': ['Clemson University', 'External'],
    'utdallas.edu': ['UT Dallas', 'External'],
    'bannerhealth.com': ['Banner Health', 'External'],
  };

  if (!email || !email.includes('@')) return { affiliation: '', speakerType: '' };
  const domain = email.split('@').pop().toLowerCase();
  if (domainMap[domain]) {
    return { affiliation: domainMap[domain][0], speakerType: domainMap[domain][1] };
  }
  if (domain === 'usc.edu' || domain.endsWith('.usc.edu')) {
    return { affiliation: 'USC', speakerType: 'Internal' };
  }
  const base = domain.split('.')[0];
  const affiliation = base.length <= 4 ? base.toUpperCase() : base.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return { affiliation, speakerType: 'External' };
}

function inferFromTalkType(talkType) {
  const talk = (talkType || '').toLowerCase();
  if (!talk) return { affiliation: '', speakerType: '' };
  if (talk.includes('external') || talk.includes('national webinar')) {
    return { affiliation: 'External institution', speakerType: 'External' };
  }
  return { affiliation: 'USC', speakerType: 'Internal' };
}

function inferFromName(name) {
  if (!name || name === 'Open slot') return { affiliation: '', speakerType: '' };

  const guestMatch = name.match(/\(guest,\s*([^)]+)\)/i);
  if (guestMatch) {
    return { affiliation: guestMatch[1].trim(), speakerType: 'External' };
  }

  const lowered = name.toLowerCase();
  if (lowered.includes('guest') || lowered.includes('external')) {
    return { affiliation: 'External institution', speakerType: 'External' };
  }

  return { affiliation: 'USC', speakerType: 'Internal' };
}

function enrichEntry(entry) {
  if (entry.status === 'Open' || entry.name === 'Open slot') {
    entry.affiliation = entry.affiliation || '';
    entry.speakerType = entry.speakerType || '';
    return entry;
  }

  let affiliation = entry.affiliation || '';
  let speakerType = entry.speakerType || '';
  const fromEmail = inferFromEmail(entry.email);
  const fromTalk = inferFromTalkType(entry.talkType);
  const fromName = inferFromName(entry.name);

  if (!affiliation) affiliation = fromEmail.affiliation || fromTalk.affiliation || fromName.affiliation;
  if (!speakerType) speakerType = fromEmail.speakerType || fromTalk.speakerType || fromName.speakerType;

  entry.affiliation = affiliation || '';
  entry.speakerType = speakerType || '';
  return entry;
}

function enrichAllData() {
  Object.keys(data).forEach(year => {
    if (year === '_meta') return;
    data[year].entries = data[year].entries.map(e => enrichEntry({ ...e }));
  });
}

function escapeHtml(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function getTypeBadgeClass(talkType) {
  const t = (talkType || '').toLowerCase();
  if (t.includes('invited')) return 'invited';
  if (t.includes('external')) return 'external';
  if (t.includes('career')) return 'career';
  if (t.includes('case')) return 'case';
  return '';
}

function hasRecordingAccess(entry) {
  if (!entry || entry.status === 'Open' || entry.name === 'Open slot') return false;
  if (isUpcoming(entry.date)) return false;
  return Boolean((entry.recordingUrl || '').trim() || CONFIG.recordingsAccessUrl);
}

function getRecordingCellHtml(entry) {
  if (!hasRecordingAccess(entry)) return '—';

  const directUrl = (entry.recordingUrl || '').trim();
  const url = directUrl || CONFIG.recordingsAccessUrl;
  const label = directUrl ? 'Watch' : 'Archive';
  const title = directUrl
    ? 'Open this seminar recording on OneDrive'
    : 'Open ADRC REC recordings folder on OneDrive';

  return `<a class="recording-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(title)}">${label}</a>`;
}

function getAllTalkTypes() {
  const types = new Set();
  Object.values(data).forEach(year => {
    year.entries.forEach(e => {
      if (e.talkType) types.add(e.talkType);
    });
  });
  return [...types].sort();
}

function showToastMsg(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast' + (type ? ` ${type}` : '');
  clearTimeout(showToastMsg._timer);
  showToastMsg._timer = setTimeout(() => toast.classList.add('hidden'), 2500);
}

// ── Render ──────────────────────────────────────────────────

function renderYearTabs() {
  const container = document.getElementById('year-tabs');
  const years = getYears();
  if (!years.includes(currentYear)) currentYear = years[0];

  container.innerHTML = years.map(y =>
    `<button type="button" class="year-tab${y === currentYear ? ' active' : ''}" data-year="${y}" role="tab">${y}</button>`
  ).join('');

  container.querySelectorAll('.year-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentYear = btn.dataset.year;
      render();
    });
  });
}

function renderLastUpdated() {
  document.getElementById('last-updated-value').textContent = formatLastUpdated(meta.lastUpdated);

  const statusEl = document.getElementById('season-status');
  if (isArchiveYear(currentYear)) {
    statusEl.textContent = 'Past season — not active schedule';
    statusEl.className = 'season-status archive';
  } else if (getUpcomingSpeakers(currentYear).length > 0) {
    statusEl.textContent = 'Active schedule';
    statusEl.className = 'season-status active';
  } else {
    statusEl.textContent = '';
    statusEl.className = 'season-status';
  }
}

function renderStats() {
  const booked = getBookedEntries(currentYear);
  const internal = booked.filter(e => e.speakerType === 'Internal').length;
  const external = booked.filter(e => e.speakerType === 'External').length;
  const openSlots = getOpenSlots(currentYear).length;
  const upcoming = getUpcomingSpeakers(currentYear).length;
  const past = getPastSpeakers(currentYear).length;
  const fourthValue = openSlots || upcoming || past;
  const fourthLabel = openSlots ? 'Open slots' : upcoming ? 'Upcoming talks' : 'Completed talks';

  document.getElementById('stats-bar').innerHTML = `
    <div class="stat-card highlight">
      <div class="stat-value">${booked.length}</div>
      <div class="stat-label">Total speakers</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${internal}</div>
      <div class="stat-label">USC (internal)</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${external}</div>
      <div class="stat-label">External</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${fourthValue}</div>
      <div class="stat-label">${fourthLabel}</div>
    </div>
  `;
}

function renderTypeFilter() {
  const select = document.getElementById('filter-type');
  const current = select.value;
  const types = getAllTalkTypes();
  select.innerHTML = '<option value="">All talk types</option>' +
    types.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  select.value = current;
}

function getFilteredEntries() {
  const search = document.getElementById('search-input').value.toLowerCase().trim();
  const typeFilter = document.getElementById('filter-type').value;
  const speakerTypeFilter = document.getElementById('filter-speaker-type').value;
  const upcomingOnly = document.getElementById('upcoming-only').checked;

  return getEntries(currentYear).filter(e => {
    if (typeFilter && e.talkType !== typeFilter) return false;
    if (speakerTypeFilter && e.speakerType !== speakerTypeFilter) return false;
    if (upcomingOnly && !isUpcoming(e.date)) return false;
    if (search) {
      const hay = `${e.name} ${e.email} ${e.title} ${e.talkType} ${e.affiliation} ${e.speakerType}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

function renderTable() {
  const entries = getFilteredEntries();
  const tbody = document.getElementById('schedule-body');
  const empty = document.getElementById('empty-state');
  const table = document.getElementById('schedule-table');

  document.getElementById('year-title').textContent = data[currentYear]?.label || currentYear;
  document.getElementById('entry-count').textContent = `${entries.length} of ${getEntries(currentYear).length} entries`;

  if (entries.length === 0) {
    tbody.innerHTML = '';
    table.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  table.classList.remove('hidden');
  empty.classList.add('hidden');

  tbody.innerHTML = entries.map(e => {
    const isOpen = e.status === 'Open';
    const upcoming = !isOpen && isUpcoming(e.date);
    const past = !isOpen && isPast(e.date);
    const rowClass = isOpen ? 'row-open' : upcoming ? 'row-upcoming' : past ? 'row-past' : '';
    const statusLabel = e.status || (isOpen ? 'Open' : upcoming ? 'Booked' : past ? 'Past' : 'Booked');
    const badgeClass = isOpen ? 'open' : upcoming ? 'scheduled' : past ? 'past' : getTypeBadgeClass(e.talkType);

    const emailHtml = e.email
      ? `<span class="speaker-email"><a href="mailto:${escapeHtml(e.email)}">${escapeHtml(e.email)}</a></span>`
      : '';

    const semesterHtml = e.semester
      ? `<span class="day-name">${escapeHtml(e.semester)}</span>`
      : '';

    const typeBadgeClass = e.speakerType === 'Internal' ? 'internal' : e.speakerType === 'External' ? 'external' : '';

    return `
      <tr class="${rowClass}" data-id="${e.id}">
        <td class="date-cell">
          ${formatDate(e.date)}
          <span class="day-name">${formatDay(e.date)}${upcoming ? ' · Upcoming' : past ? ' · Past' : isOpen ? ' · Open' : ''}</span>
          ${semesterHtml}
        </td>
        <td class="speaker-cell">
          <span class="speaker-name">${escapeHtml(e.name || 'Open slot')}</span>
          ${emailHtml}
        </td>
        <td class="affiliation-cell">
          <span class="affiliation-name">${escapeHtml(e.affiliation || '—')}</span>
        </td>
        <td class="type-cell">
          ${e.speakerType ? `<span class="type-badge ${typeBadgeClass}">${escapeHtml(e.speakerType)}</span>` : '—'}
        </td>
        <td class="title-cell">${escapeHtml((e.title || 'Topic TBD').replace(/^"|"$/g, ''))}</td>
        <td><span class="type-badge ${badgeClass}">${escapeHtml(statusLabel)}</span></td>
        <td class="recording-cell">${getRecordingCellHtml(e)}</td>
        <td class="actions-col">
          <div class="row-actions">
            <button type="button" class="btn-icon btn-edit" title="Edit" data-id="${e.id}">✎</button>
            <button type="button" class="btn-icon btn-delete" title="Delete" data-id="${e.id}">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => openModal(currentYear, btn.dataset.id));
  });
  tbody.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => confirmDelete(currentYear, btn.dataset.id));
  });
}

function render() {
  renderLastUpdated();
  renderYearTabs();
  renderStats();
  renderTypeFilter();
  renderTable();
}

// ── Modal ───────────────────────────────────────────────────

function openModal(year, id = null) {
  editingId = id;
  const form = document.getElementById('entry-form');
  form.reset();

  document.getElementById('entry-year').value = year;
  document.getElementById('modal-title').textContent = id ? 'Edit Entry' : 'Add Entry';
  document.getElementById('btn-delete-entry').classList.toggle('hidden', !id);

  if (id) {
    const entry = getEntries(year).find(e => e.id === id);
    if (entry) populateForm(entry);
  }

  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('entry-date').focus();
}

function populateForm(entry) {
  document.getElementById('entry-id').value = entry.id;
  document.getElementById('entry-name').value = entry.name || '';
  document.getElementById('entry-email').value = entry.email || '';
  document.getElementById('entry-date').value = parseDate(entry.date) ? entry.date : '';
  document.getElementById('entry-title').value = entry.title || '';
  document.getElementById('entry-affiliation').value = entry.affiliation || '';
  document.getElementById('entry-speaker-type').value = entry.speakerType || '';
  document.getElementById('entry-recording-url').value = entry.recordingUrl || '';

  const presetTypes = ['Invited Speaker', 'External Speaker', 'Career Development', 'Case Conference', 'National Webinar', 'Journal Club'];
  const talkSelect = document.getElementById('entry-talk-type');
  if (entry.talkType && !presetTypes.some(p => entry.talkType.startsWith(p))) {
    talkSelect.value = 'Other';
    document.getElementById('entry-talk-type-custom').value = entry.talkType;
    document.getElementById('custom-type-row').classList.remove('hidden');
  } else {
    const match = presetTypes.find(p => entry.talkType?.startsWith(p)) || '';
    talkSelect.value = match;
    document.getElementById('custom-type-row').classList.add('hidden');
  }
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  editingId = null;
}

function getFormEntry() {
  const year = document.getElementById('entry-year').value;
  const id = document.getElementById('entry-id').value || generateId(year);

  const sel = document.getElementById('entry-talk-type').value;
  const talkType = sel === 'Other'
    ? document.getElementById('entry-talk-type-custom').value.trim()
    : sel;

  let affiliation = document.getElementById('entry-affiliation').value.trim();
  let speakerType = document.getElementById('entry-speaker-type').value;
  const email = document.getElementById('entry-email').value.trim();
  const inferred = inferFromEmail(email);
  if (!affiliation) affiliation = inferred.affiliation;
  if (!speakerType) speakerType = inferred.speakerType;

  const recordingUrl = document.getElementById('entry-recording-url').value.trim();

  return {
    id,
    name: document.getElementById('entry-name').value.trim(),
    email,
    date: document.getElementById('entry-date').value,
    title: document.getElementById('entry-title').value.trim(),
    talkType,
    affiliation,
    speakerType,
    status: 'Booked',
    recordingUrl,
  };
}

function confirmDelete(year, id) {
  const entry = getEntries(year).find(e => e.id === id);
  const label = entry?.name || entry?.title || 'this entry';
  if (confirm(`Delete "${label}"? This cannot be undone.`)) {
    deleteEntry(year, id);
    closeModal();
    render();
    showToastMsg('Entry deleted');
  }
}

// ── Export ──────────────────────────────────────────────────

function exportJSON() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'adrc-rec-speaker-series.json');
  showToastMsg('JSON exported', 'success');
}

function exportCSV() {
  const entries = getEntries(currentYear);
  const headers = ['Date', 'Name', 'Email', 'Affiliation', 'Speaker Type', 'Title', 'Talk Type', 'Status', 'Recording URL'];
  const rows = entries.map(e =>
    [e.date, e.name, e.email, e.affiliation, e.speakerType, e.title, e.talkType, e.status, e.recordingUrl]
      .map(v => `"${(v || '').replace(/"/g, '""')}"`)
      .join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  downloadBlob(blob, `adrc-rec-${currentYear}.csv`);
  showToastMsg('CSV exported', 'success');
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Init ────────────────────────────────────────────────────

function bindEvents() {
  const recordingsLink = document.getElementById('recordings-access-link');
  if (recordingsLink && CONFIG.recordingsAccessUrl) {
    recordingsLink.href = CONFIG.recordingsAccessUrl;
    recordingsLink.target = '_blank';
    recordingsLink.rel = 'noopener noreferrer';
    recordingsLink.title = 'Open ADRC REC Training Core recordings on USC OneDrive';
  }

  document.getElementById('btn-add-entry').addEventListener('click', () => openModal(currentYear));
  document.getElementById('btn-add-from-empty').addEventListener('click', () => openModal(currentYear));
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.getElementById('entry-talk-type').addEventListener('change', e => {
    document.getElementById('custom-type-row').classList.toggle('hidden', e.target.value !== 'Other');
  });

  document.getElementById('entry-email').addEventListener('blur', e => {
    const inferred = inferFromEmail(e.target.value.trim());
    if (!document.getElementById('entry-affiliation').value && inferred.affiliation) {
      document.getElementById('entry-affiliation').value = inferred.affiliation;
    }
    if (!document.getElementById('entry-speaker-type').value && inferred.speakerType) {
      document.getElementById('entry-speaker-type').value = inferred.speakerType;
    }
  });

  document.getElementById('entry-form').addEventListener('submit', e => {
    e.preventDefault();
    const year = document.getElementById('entry-year').value;
    const entry = getFormEntry();
    if (!entry.name) {
      showToastMsg('Please enter a speaker name');
      return;
    }
    upsertEntry(year, entry);
    closeModal();
    render();
  });

  document.getElementById('btn-delete-entry').addEventListener('click', () => {
    const year = document.getElementById('entry-year').value;
    const id = document.getElementById('entry-id').value;
    if (id) confirmDelete(year, id);
  });

  document.getElementById('search-input').addEventListener('input', renderTable);
  document.getElementById('filter-type').addEventListener('change', renderTable);
  document.getElementById('filter-speaker-type').addEventListener('change', renderTable);
  document.getElementById('upcoming-only').addEventListener('change', renderTable);

  document.getElementById('btn-export-json').addEventListener('click', exportJSON);
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}

async function init() {
  try {
    await loadData();
    cleanData();
    enrichAllData();
    touchLastUpdated();
    bindEvents();
    render();
  } catch (err) {
    document.querySelector('.main').innerHTML =
      `<div class="empty-state"><p>Failed to load data: ${err.message}</p>
       <p>Run a local server: <code>python3 -m http.server 8080</code></p></div>`;
  }
}

init();
