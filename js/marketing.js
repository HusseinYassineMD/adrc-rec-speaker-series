/**
 * ADRC REC Flyer & LinkedIn workflow
 */

const STORAGE_KEY = 'adrc-rec-speaker-series-v3';
const DATA_VERSION = '2026-09-02-v12';
const VERSION_KEY = 'adrc-rec-data-version';

const CONFIG = {
  scheduleDashboardUrl: 'https://husseinyassinemd.github.io/adrc-rec-speaker-series/',
  defaultMeetingTime: 'Fridays · 1:00–2:00 PM Pacific Time',
  marketingContactName: 'Aishwarya',
  marketingContactEmail: '',
  coordinatorName: 'Sahar Nikkhah Bahrami',
  coordinatorEmail: 'nikkhahb@usc.edu',
};

let data = {};
let selectedYear = null;
let selectedId = null;

const fields = [
  'flyer-headshot',
  'flyer-name',
  'flyer-prof-title',
  'flyer-institution',
  'flyer-talk-title',
  'flyer-date',
  'flyer-time',
  'flyer-link',
];

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str + 'T12:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function formatDateLong(str) {
  const d = parseDate(str);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateShort(str) {
  const d = parseDate(str);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatPostDate(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function cleanTalkTitle(title) {
  return (title || 'Topic TBD').replace(/^"|"$/g, '').trim();
}

function formatDisplayName(name) {
  if (!name) return '';
  return name.replace(/^Dr\.\s*/i, '').replace(/,\s*/g, ' ').trim();
}

function getInitials(name) {
  const parts = formatDisplayName(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function escapeHtml(str) {
  const el = document.createElement('span');
  el.textContent = str || '';
  return el.innerHTML;
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast success';
  setTimeout(() => toast.classList.add('hidden'), 2500);
}

async function loadData() {
  if (localStorage.getItem(VERSION_KEY) !== DATA_VERSION) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(VERSION_KEY, DATA_VERSION);
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      data = JSON.parse(stored);
      if (data._meta) delete data._meta;
      if (isValidData(data)) return;
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  data = await fetchSpeakerJson();
  if (data._meta) delete data._meta;
}

function isValidData(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const years = Object.keys(payload).filter(k => k !== '_meta');
  if (!years.length) return false;
  return years.every(y => Array.isArray(payload[y]?.entries));
}

function getUpcomingEntries() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const items = [];

  Object.keys(data).sort((a, b) => b.localeCompare(a)).forEach(year => {
    (data[year]?.entries || []).forEach(entry => {
      if (entry.status === 'Open' || entry.name === 'Open slot') return;
      const d = parseDate(entry.date);
      if (!d || d < today) return;
      items.push({ year, entry });
    });
  });

  items.sort((a, b) => parseDate(a.entry.date) - parseDate(b.entry.date));
  return items;
}

function populateTalkSelect() {
  const select = document.getElementById('select-talk');
  const items = getUpcomingEntries();

  select.innerHTML = [
    '<option value="">— Select upcoming talk —</option>',
    ...items.map(({ year, entry }) => {
      const label = `${formatDateShort(entry.date)} · ${entry.name} · ${cleanTalkTitle(entry.title).slice(0, 50)}`;
      return `<option value="${year}|${entry.id}">${escapeHtml(label)}</option>`;
    }),
  ].join('');

  const params = new URLSearchParams(window.location.search);
  const year = params.get('year');
  const id = params.get('id');
  if (year && id) {
    const value = `${year}|${id}`;
    if ([...select.options].some(o => o.value === value)) {
      select.value = value;
      loadEntry(year, id);
    }
  } else if (items.length) {
    select.value = `${items[0].year}|${items[0].entry.id}`;
    loadEntry(items[0].year, items[0].entry.id);
  }
}

function loadEntry(year, id) {
  selectedYear = year;
  selectedId = id;
  const entry = (data[year]?.entries || []).find(e => e.id === id);
  if (!entry) return;

  document.getElementById('flyer-headshot').value = entry.headshotUrl || '';
  document.getElementById('flyer-name').value = formatDisplayName(entry.name || '');
  document.getElementById('flyer-prof-title').value = entry.professionalTitle || '';
  document.getElementById('flyer-institution').value = entry.affiliation || '';
  document.getElementById('flyer-talk-title').value = cleanTalkTitle(entry.title);
  document.getElementById('flyer-date').value = entry.date || '';
  document.getElementById('flyer-time').value = entry.meetingTime || CONFIG.defaultMeetingTime;
  document.getElementById('flyer-link').value = entry.meetingLink || '';

  updatePreview();
  renderLinkedIn();
}

function readForm() {
  return {
    headshotUrl: document.getElementById('flyer-headshot').value.trim(),
    name: document.getElementById('flyer-name').value.trim(),
    professionalTitle: document.getElementById('flyer-prof-title').value.trim(),
    institution: document.getElementById('flyer-institution').value.trim(),
    talkTitle: document.getElementById('flyer-talk-title').value.trim(),
    date: document.getElementById('flyer-date').value,
    time: document.getElementById('flyer-time').value.trim() || CONFIG.defaultMeetingTime,
    meetingLink: document.getElementById('flyer-link').value.trim(),
  };
}

function getSeasonLabel(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return 'REC SERIES';
  const month = d.getMonth();
  const year = d.getFullYear();
  let season = 'SPRING';
  if (month >= 8) season = 'FALL';
  else if (month >= 5) season = 'SUMMER';
  return `${season} ${year}`;
}

function formatShortUrl(url) {
  if (!url) return 'adrc.usc.edu';
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function updatePreview() {
  const f = readForm();
  const name = f.name || 'Speaker Name';
  const profTitle = f.professionalTitle || 'Professional title';
  const institution = f.institution || 'Institution';
  const talkTitle = f.talkTitle || 'Talk title';
  const dateLabel = f.date ? formatDateLong(f.date) : '—';
  const linkLabel = f.meetingLink || 'Link coming soon';
  const seasonLabel = getSeasonLabel(f.date);
  const [seasonName, seasonYear] = seasonLabel.split(' ');
  const quotedTitle = talkTitle.startsWith('"') ? talkTitle : `"${talkTitle}"`;

  document.getElementById('flyer-preview-season').textContent = seasonLabel;
  document.getElementById('flyer-preview-lead').textContent =
    seasonYear
      ? `You're invited to the ${seasonName.toLowerCase()} ${seasonYear} ADRC REC Speaker Series seminar.`
      : "You're invited to the ADRC REC Speaker Series seminar.";
  document.getElementById('flyer-preview-name').textContent = name;
  document.getElementById('flyer-preview-prof-title').textContent = profTitle;
  document.getElementById('flyer-preview-institution').textContent = institution;
  document.getElementById('flyer-preview-talk-title').textContent = quotedTitle;
  document.getElementById('flyer-preview-date').textContent = dateLabel;
  document.getElementById('flyer-preview-time').textContent = f.time;
  document.getElementById('flyer-preview-link').textContent = linkLabel;
  document.getElementById('flyer-preview-footer-link').textContent = formatShortUrl(f.meetingLink);
  document.getElementById('flyer-preview-cta').textContent =
    f.meetingLink ? 'Register for this seminar' : 'Registration link coming soon';

  const img = document.getElementById('flyer-headshot-img');
  const placeholder = document.getElementById('flyer-headshot-placeholder');
  const initialsEl = placeholder.querySelector('.flyer-hero-initials');

  if (f.headshotUrl) {
    img.src = f.headshotUrl;
    img.alt = name;
    img.hidden = false;
    placeholder.hidden = true;
    img.onerror = () => {
      img.hidden = true;
      placeholder.hidden = false;
      if (initialsEl) initialsEl.textContent = getInitials(name);
    };
  } else {
    img.hidden = true;
    img.removeAttribute('src');
    placeholder.hidden = false;
    if (initialsEl) initialsEl.textContent = getInitials(name);
  }
}

function buildLinkedInPost(variant) {
  const f = readForm();
  const name = f.name || '[Speaker]';
  const title = f.talkTitle || '[Talk title]';
  const institution = f.institution || '[Institution]';
  const profTitle = f.professionalTitle || '[Title]';
  const date = f.date ? formatDateLong(f.date) : '[Date]';
  const shortDate = f.date ? formatDateShort(f.date) : '[Date]';
  const time = f.time;
  const link = f.meetingLink || '[Registration link]';

  const baseHashtags = '#USCADRC #AlzheimersResearch #Neuroscience #Seminar';

  if (variant === 'twoWeeks') {
    return `📅 Save the date — USC ADRC REC Speaker Series

Join us on ${date} (${time}) for a seminar with ${name}, ${profTitle}, ${institution}.

"${title}"

Register: ${link}

${baseHashtags}`;
  }

  if (variant === 'oneWeek') {
    return `⏰ One week away — USC ADRC REC Speaker Series

Next ${shortDate} · ${time}

${name} (${institution}) presents:
"${title}"

Register: ${link}

${baseHashtags}`;
  }

  return `🔔 Tomorrow — USC ADRC REC Speaker Series

${name}, ${profTitle}, ${institution}
"${title}"

📆 ${date}
🕐 ${time}
🔗 ${link}

${baseHashtags}`;
}

function renderLinkedIn() {
  const f = readForm();
  const dateEl = document.getElementById('linkedin-dates');
  const cardsEl = document.getElementById('linkedin-cards');

  if (!f.date) {
    dateEl.innerHTML = '<span class="linkedin-date-chip">Select a talk date to see posting schedule.</span>';
    cardsEl.innerHTML = '';
    return;
  }

  const variants = [
    { id: 'twoWeeks', label: '2 weeks out', offset: -14 },
    { id: 'oneWeek', label: '1 week out', offset: -7 },
    { id: 'oneDay', label: '1 day out', offset: -1 },
  ];

  dateEl.innerHTML = variants.map(v => {
    const postDate = addDays(f.date, v.offset);
    return `<span class="linkedin-date-chip"><strong>${v.label}:</strong> post on ${formatPostDate(postDate)}</span>`;
  }).join('');

  cardsEl.innerHTML = variants.map(v => {
    const postDate = addDays(f.date, v.offset);
    const text = buildLinkedInPost(v.id);
    return `
      <article class="linkedin-card">
        <h3>${v.label}</h3>
        <p class="post-when">Suggested post date: ${formatPostDate(postDate)}</p>
        <div class="linkedin-post-text" id="post-${v.id}">${escapeHtml(text)}</div>
        <button type="button" class="btn-copy" data-copy="post-${v.id}">Copy post text</button>
      </article>
    `;
  }).join('');

  cardsEl.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', async () => {
      const el = document.getElementById(btn.dataset.copy);
      try {
        await navigator.clipboard.writeText(el.textContent);
        showToast('Copied to clipboard');
      } catch {
        showToast('Copy failed — select text manually');
      }
    });
  });
}

function saveToEntry() {
  if (!selectedYear || !selectedId) {
    showToast('Select a talk from the schedule first');
    return;
  }

  if (!data[selectedYear]?.entries) {
    showToast('Entry not found');
    return;
  }

  const idx = data[selectedYear].entries.findIndex(e => e.id === selectedId);
  if (idx < 0) {
    showToast('Entry not found');
    return;
  }

  const f = readForm();
  const entry = { ...data[selectedYear].entries[idx] };
  entry.headshotUrl = f.headshotUrl;
  entry.professionalTitle = f.professionalTitle;
  entry.meetingLink = f.meetingLink;
  entry.meetingTime = f.time;
  if (f.talkTitle) entry.title = f.talkTitle;
  if (f.institution) entry.affiliation = f.institution;

  data[selectedYear].entries[idx] = entry;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  showToast('Saved to schedule entry (local)');
}

function bindEvents() {
  document.getElementById('select-talk').addEventListener('change', e => {
    if (!e.target.value) return;
    const [year, id] = e.target.value.split('|');
    loadEntry(year, id);
  });

  fields.forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      updatePreview();
      renderLinkedIn();
    });
  });

  document.getElementById('btn-save-to-entry').addEventListener('click', saveToEntry);
  document.getElementById('btn-print-flyer').addEventListener('click', () => window.print());
}

async function init() {
  try {
    await loadData();
    bindEvents();
    populateTalkSelect();
    if (!document.getElementById('select-talk').value) {
      updatePreview();
      renderLinkedIn();
    }
  } catch (err) {
    console.error(err);
    const main = document.querySelector('.marketing-main');
    if (main) {
      main.innerHTML = `
        <div class="panel">
          <p><strong>Flyer page could not load.</strong></p>
          <p>${escapeHtml(err.message || 'Could not load speaker data.')}</p>
          <p><a href="https://husseinyassinemd.github.io/adrc-rec-speaker-series/marketing.html">Open live flyer page</a></p>
        </div>`;
    }
  }
}

init();
