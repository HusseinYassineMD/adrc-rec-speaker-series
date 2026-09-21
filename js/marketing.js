/**
 * ADRC REC Flyer & LinkedIn workflow
 */

const STORAGE_KEY = 'adrc-rec-speaker-series-v3';
const DATA_VERSION = '2026-09-21-v13';
const VERSION_KEY = 'adrc-rec-data-version';

const CONFIG = {
  scheduleDashboardUrl: 'https://husseinyassinemd.github.io/adrc-rec-speaker-series/',
  defaultMeetingTime: '1:00 P.M. – 2:00 P.M. PST',
  marketingContactName: 'Aishwarya',
  marketingContactEmail: '',
  coordinatorName: 'Sahar Nikkhah Bahrami',
  coordinatorEmail: 'nikkhahb@usc.edu',
};

let data = {};
let selectedYear = null;
let selectedId = null;
let uploadedHeadshotDataUrl = null;

const fields = [
  'flyer-name',
  'flyer-prof-title',
  'flyer-institution',
  'flyer-talk-title',
  'flyer-bio',
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

function formatEventLine(str) {
  const d = parseDate(str);
  if (!d) return 'Date TBD, ADRC REC Zoom Seminar';
  const label = d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return `${label}, ADRC REC Zoom Seminar`;
}

function renderTitleLines(text) {
  const lines = (text || '')
    .split(/\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    return '<p>Professional title</p>';
  }
  return lines.map(line => `<p>${escapeHtml(line)}</p>`).join('');
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

function clearUploadedHeadshot() {
  uploadedHeadshotDataUrl = null;
  const fileInput = document.getElementById('flyer-headshot-file');
  if (fileInput) fileInput.value = '';
}

function getHeadshotSource() {
  if (uploadedHeadshotDataUrl) return uploadedHeadshotDataUrl;
  return document.getElementById('flyer-headshot').value.trim();
}

function setHeadshotFieldsFromEntry(url) {
  clearUploadedHeadshot();
  const value = url || '';
  if (value.startsWith('data:')) {
    uploadedHeadshotDataUrl = value;
    document.getElementById('flyer-headshot').value = '';
  } else {
    document.getElementById('flyer-headshot').value = value;
  }
}

function handleHeadshotFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Please choose an image file');
    event.target.value = '';
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    showToast('Image must be under 5 MB');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    uploadedHeadshotDataUrl = reader.result;
    document.getElementById('flyer-headshot').value = '';
    updatePreview();
    renderLinkedIn();
  };
  reader.onerror = () => showToast('Could not read that image');
  reader.readAsDataURL(file);
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

  setHeadshotFieldsFromEntry(entry.headshotUrl || '');
  document.getElementById('flyer-name').value = formatDisplayName(entry.name || '');
  document.getElementById('flyer-prof-title').value = entry.professionalTitle || '';
  document.getElementById('flyer-institution').value = entry.affiliation || '';
  document.getElementById('flyer-talk-title').value = cleanTalkTitle(entry.title);
  document.getElementById('flyer-bio').value = entry.flyerBio || '';
  document.getElementById('flyer-date').value = entry.date || '';
  document.getElementById('flyer-time').value = entry.meetingTime || CONFIG.defaultMeetingTime;
  document.getElementById('flyer-link').value = entry.meetingLink || '';

  updatePreview();
  renderLinkedIn();
}

function readForm() {
  return {
    headshotUrl: getHeadshotSource(),
    name: document.getElementById('flyer-name').value.trim(),
    professionalTitle: document.getElementById('flyer-prof-title').value.trim(),
    institution: document.getElementById('flyer-institution').value.trim(),
    talkTitle: document.getElementById('flyer-talk-title').value.trim(),
    bio: document.getElementById('flyer-bio').value.trim(),
    date: document.getElementById('flyer-date').value,
    time: document.getElementById('flyer-time').value.trim() || CONFIG.defaultMeetingTime,
    meetingLink: document.getElementById('flyer-link').value.trim(),
  };
}

const FLYER_FIT_BASE = {
  bio: 16,
  talk: 17,
  prof: 10.5,
  event: 18,
  org: 20,
  name: 16,
  date: 15,
  time: 15,
  zoom: 16,
};

const FLYER_FIT_MIN = {
  bio: 3.5,
  talk: 6,
  prof: 4.5,
  event: 8,
  org: 9,
  name: 7,
  date: 7,
  time: 7,
  zoom: 7,
};

function resetFlyerFitStyles() {
  const sheet = document.querySelector('.flyer-sheet');
  const selectors = [
    '#flyer-preview-bio',
    '#flyer-preview-talk-title',
    '#flyer-preview-event-line',
    '#flyer-preview-name',
    '#flyer-preview-date',
    '#flyer-preview-time',
    '#flyer-preview-link',
    '.flyer-org-title',
    '.flyer-speaker-titles p',
    '.flyer-event',
    '.flyer-speaker-block',
    '.flyer-speaker-name',
    '.flyer-speaker-date',
    '.flyer-speaker-time',
    '.flyer-zoom-link',
    '.flyer-bio',
  ];

  selectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      el.style.fontSize = '';
      el.style.lineHeight = '';
      el.style.marginTop = '';
      el.style.marginBottom = '';
    });
  });

  if (sheet) sheet.style.padding = '';

  const photo = document.querySelector('.flyer-speaker-photo');
  if (photo) {
    photo.style.width = '';
    photo.style.height = '';
  }

  const logo = document.querySelector('.flyer-adrc-logo');
  if (logo) logo.style.height = '';
}

function flyerOverflows() {
  const sheet = document.querySelector('.flyer-sheet');
  const bioSection = document.querySelector('.flyer-bio');
  const bioP = document.getElementById('flyer-preview-bio');

  if (bioP && bioSection && bioP.scrollHeight > bioSection.clientHeight + 1) {
    return true;
  }

  const clipped = [
    document.getElementById('flyer-preview-talk-title'),
    document.getElementById('flyer-preview-event-line'),
    document.querySelector('.flyer-org-title'),
    ...document.querySelectorAll('.flyer-speaker-titles p'),
  ];

  for (const el of clipped) {
    if (el && el.scrollHeight > el.clientHeight + 1) return true;
  }

  if (sheet) {
    const footer = document.querySelector('.flyer-seminar-footer');
    if (footer) {
      const sheetRect = sheet.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      if (footerRect.bottom > sheetRect.bottom + 0.5) return true;
    }
  }

  return false;
}

function applyFlyerFitSizes(cur) {
  const bioP = document.getElementById('flyer-preview-bio');
  const talkTitle = document.getElementById('flyer-preview-talk-title');
  const eventLine = document.getElementById('flyer-preview-event-line');
  const orgTitle = document.querySelector('.flyer-org-title');
  const nameEl = document.getElementById('flyer-preview-name');
  const dateEl = document.getElementById('flyer-preview-date');
  const timeEl = document.getElementById('flyer-preview-time');
  const zoomEl = document.getElementById('flyer-preview-link');

  if (bioP) {
    bioP.style.fontSize = `${cur.bio}px`;
    bioP.style.lineHeight = cur.bio <= 7 ? '1.18' : cur.bio <= 10 ? '1.28' : '1.45';
    bioP.style.hyphens = 'none';
    bioP.style.webkitHyphens = 'none';
    bioP.style.overflowWrap = 'normal';
    bioP.style.wordBreak = 'normal';
  }
  if (talkTitle) {
    talkTitle.style.fontSize = `${cur.talk}px`;
    talkTitle.style.lineHeight = cur.talk <= 9 ? '1.2' : '1.35';
  }
  if (eventLine) eventLine.style.fontSize = `${cur.event}px`;
  if (orgTitle) orgTitle.style.fontSize = `${cur.org}px`;
  if (nameEl) nameEl.style.fontSize = `${cur.name}px`;
  if (dateEl) dateEl.style.fontSize = `${cur.date}px`;
  if (timeEl) timeEl.style.fontSize = `${cur.time}px`;
  if (zoomEl) zoomEl.style.fontSize = `${cur.zoom}px`;

  document.querySelectorAll('.flyer-speaker-titles p').forEach(p => {
    p.style.fontSize = `${cur.prof}px`;
    p.style.lineHeight = cur.prof <= 7 ? '1.2' : '1.4';
  });
}

function tightenFlyerLayout(step) {
  const sheet = document.querySelector('.flyer-sheet');
  const event = document.querySelector('.flyer-event');
  const speakerBlock = document.querySelector('.flyer-speaker-block');
  const speakerInfo = document.querySelector('.flyer-speaker-info');
  const photo = document.querySelector('.flyer-speaker-photo');
  const logo = document.querySelector('.flyer-adrc-logo');

  if (sheet) {
    const padTop = Math.max(12, 26 - step * 2);
    const padBottom = Math.max(8, 18 - step);
    sheet.style.padding = `${padTop}px 36px ${padBottom}px`;
  }

  if (event) {
    event.style.marginTop = `${Math.max(8, 22 - step * 2)}px`;
    event.style.marginBottom = `${Math.max(6, 18 - step * 2)}px`;
  }

  if (speakerBlock) {
    speakerBlock.style.marginBottom = `${Math.max(6, 16 - step * 2)}px`;
  }

  if (speakerInfo) {
    const dateEl = document.querySelector('.flyer-speaker-date');
    const timeEl = document.querySelector('.flyer-speaker-time');
    if (dateEl) {
      dateEl.style.marginTop = `${Math.max(4, 18 - step * 3)}px`;
      dateEl.style.marginBottom = `${Math.max(2, 4 - step)}px`;
    }
    if (timeEl) {
      timeEl.style.marginTop = '0';
      timeEl.style.marginBottom = `${Math.max(2, 14 - step * 2)}px`;
    }
  }

  if (photo) {
    const height = Math.max(88, 201 - step * 14);
    const width = Math.round(height * (184 / 201));
    photo.style.height = `${height}px`;
    photo.style.width = `${width}px`;
  }

  if (logo) {
    logo.style.height = `${Math.max(22, 38 - step * 2)}px`;
  }
}

function fitFlyerToPage() {
  const sheet = document.querySelector('.flyer-sheet');
  if (!sheet) return;

  resetFlyerFitStyles();

  const cur = { ...FLYER_FIT_BASE };
  applyFlyerFitSizes(cur);
  if (!flyerOverflows()) return;

  const shrinkKeys = ['bio', 'prof', 'talk', 'event', 'name', 'date', 'time', 'zoom', 'org'];

  for (const key of shrinkKeys) {
    for (let size = FLYER_FIT_BASE[key]; size >= FLYER_FIT_MIN[key]; size -= 0.25) {
      cur[key] = size;
      applyFlyerFitSizes(cur);
      if (!flyerOverflows()) return;
    }
    cur[key] = FLYER_FIT_MIN[key];
  }

  for (let step = 1; step <= 10; step += 1) {
    tightenFlyerLayout(step);
    applyFlyerFitSizes(cur);
    if (!flyerOverflows()) return;
  }

  for (let scale = 0.95; scale >= 0.45; scale -= 0.025) {
    shrinkKeys.forEach(key => {
      cur[key] = Math.max(FLYER_FIT_MIN[key], FLYER_FIT_BASE[key] * scale);
    });
    applyFlyerFitSizes(cur);
    if (!flyerOverflows()) return;
  }

  for (let bio = FLYER_FIT_MIN.bio; bio >= 3; bio -= 0.25) {
    cur.bio = bio;
    applyFlyerFitSizes(cur);
    if (!flyerOverflows()) return;
  }
}

function scheduleFlyerFit() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fitFlyerToPage();
      void document.querySelector('.flyer-sheet')?.offsetHeight;
    });
  });
}

function updatePreview() {
  const f = readForm();
  const name = f.name || 'Speaker Name, MD';
  const talkTitle = f.talkTitle || 'Talk title';
  const dateLabel = f.date ? formatDateLong(f.date) : 'Date TBD';
  const eventLine = formatEventLine(f.date);
  const bioText = f.bio || 'Speaker bio and seminar description.';

  document.getElementById('flyer-preview-event-line').textContent = eventLine;
  document.getElementById('flyer-preview-talk-title').textContent = talkTitle;
  document.getElementById('flyer-preview-name').textContent = name;
  document.getElementById('flyer-preview-titles').innerHTML = renderTitleLines(f.professionalTitle);
  document.getElementById('flyer-preview-date').textContent = dateLabel;
  document.getElementById('flyer-preview-time').textContent = f.time;
  document.getElementById('flyer-preview-link').textContent = 'Zoom Meeting Link';
  document.getElementById('flyer-preview-bio').textContent = bioText;

  const speakerImg = document.getElementById('flyer-headshot-img');
  const placeholder = document.getElementById('flyer-headshot-placeholder');

  if (f.headshotUrl) {
    if (f.headshotUrl.startsWith('data:')) {
      speakerImg.removeAttribute('crossOrigin');
    } else {
      speakerImg.crossOrigin = 'anonymous';
    }
    speakerImg.src = f.headshotUrl;
    speakerImg.alt = name;
    speakerImg.hidden = false;
    placeholder.hidden = true;
    speakerImg.onload = () => scheduleFlyerFit();
    speakerImg.onerror = () => {
      speakerImg.hidden = true;
      placeholder.hidden = false;
      scheduleFlyerFit();
    };
  } else {
    speakerImg.hidden = true;
    speakerImg.removeAttribute('src');
    placeholder.hidden = false;
  }

  scheduleFlyerFit();
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
  entry.flyerBio = f.bio;
  if (f.talkTitle) entry.title = f.talkTitle;
  if (f.institution) entry.affiliation = f.institution;

  data[selectedYear].entries[idx] = entry;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  showToast('Saved to schedule entry (local)');
}

function slugifyFilename(str) {
  return (str || 'seminar')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'seminar';
}

function buildFlyerFilename() {
  const f = readForm();
  return `adrc-rec-flyer-${f.date || 'undated'}-${slugifyFilename(f.name)}.pdf`;
}

function getJsPDFConstructor() {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  if (typeof window.jsPDF === 'function') return window.jsPDF;
  return null;
}

async function downloadFlyer() {
  const btn = document.getElementById('btn-download-flyer');
  const flyer = document.querySelector('#flyer .flyer-sheet') || document.getElementById('flyer');

  if (typeof window.html2canvas !== 'function') {
    showToast('Download tools failed to load — refresh the page');
    return;
  }

  const JsPDF = getJsPDFConstructor();

  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Preparing…';

  try {
    resetFlyerFitStyles();
    fitFlyerToPage();
    await new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        fitFlyerToPage();
        requestAnimationFrame(resolve);
      }));
    });

    const canvas = await html2canvas(flyer, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: 612,
      height: 792,
      windowWidth: 612,
      windowHeight: 792,
    });

    if (JsPDF) {
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new JsPDF({
        orientation: 'portrait',
        unit: 'in',
        format: 'letter',
        compress: true,
      });
      pdf.addImage(imgData, 'JPEG', 0, 0, 8.5, 11);
      pdf.save(buildFlyerFilename());
      showToast('Flyer downloaded');
      return;
    }

    const pngName = buildFlyerFilename().replace(/\.pdf$/i, '.png');
    const link = document.createElement('a');
    link.download = pngName;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('Flyer downloaded (PNG)');
  } catch (err) {
    console.error(err);
    showToast('Download failed — try a smaller headshot or use an uploaded image');
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

function bindEvents() {
  document.getElementById('select-talk').addEventListener('change', e => {
    if (!e.target.value) return;
    const [year, id] = e.target.value.split('|');
    loadEntry(year, id);
  });

  document.getElementById('flyer-headshot').addEventListener('input', () => {
    if (document.getElementById('flyer-headshot').value.trim()) {
      clearUploadedHeadshot();
    }
    updatePreview();
    renderLinkedIn();
  });

  document.getElementById('flyer-headshot-file').addEventListener('change', handleHeadshotFileChange);

  document.getElementById('btn-clear-headshot').addEventListener('click', () => {
    clearUploadedHeadshot();
    document.getElementById('flyer-headshot').value = '';
    updatePreview();
    renderLinkedIn();
  });

  fields.forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      updatePreview();
      renderLinkedIn();
    });
  });

  document.getElementById('btn-save-to-entry').addEventListener('click', saveToEntry);
  document.getElementById('btn-download-flyer').addEventListener('click', downloadFlyer);
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
