'use strict';

// ─── State machine ───────────────────────────────────────────────────────────
const STATE = {
  IDLE: 'idle',
  AWAITING_YEAR: 'awaiting_year',
  CHOOSING_GOVERNORATE: 'choosing_governorate',
  CHOOSING_REGION: 'choosing_region',
  CHOOSING_NEIGHBORHOOD: 'choosing_neighborhood',
  CHOOSING_AGE_GROUP: 'choosing_age_group',
  SHOWING_RESULT: 'showing_result',
};

let state = STATE.IDLE;
let uploadId = null;
let targetYear = null;
let choices = { governorate: null, region: null, neighborhood: null, age_group: null };

// ─── DOM refs ────────────────────────────────────────────────────────────────
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const statusBar = document.getElementById('status-bar');
const chatBox = document.getElementById('chat-box');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const resetBtn = document.getElementById('reset-btn');
const backBtn = document.getElementById('back-btn');
const resultsSection = document.getElementById('results-section');
const loadingOverlay = document.getElementById('loading-overlay');

// ─── Upload ──────────────────────────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); handleFile(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

async function handleFile(file) {
  if (!file) return;
  showStatus('جارٍ رفع الملف…', '');
  showLoading('جارٍ تحليل الملف…');
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await fetch('/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'خطأ في الرفع');
    uploadId = data.upload_id;
    showStatus(`✓ تم رفع الملف: ${data.row_count} صف، السنوات ${data.year_range[0]}–${data.year_range[1]}`, 'success');
    dropZone.querySelector('p').textContent = `✓ ${file.name} — جاهز`;
    transitionTo(STATE.IDLE);
    addBotMessage('تم رفع الملف بنجاح! اكتب سؤالك الآن، مثال: «ما عدد السكان المتوقع في عام 2030؟»');
  } catch (e) {
    showStatus(e.message, 'error');
  } finally {
    hideLoading();
  }
}

// ─── Chat ────────────────────────────────────────────────────────────────────
sendBtn.addEventListener('click', handleUserInput);
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleUserInput(); });
resetBtn.addEventListener('click', resetAll);
backBtn.addEventListener('click', goBack);

function handleUserInput() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  addUserMessage(text);

  if (!uploadId) { addBotMessage('يرجى رفع ملف البيانات أولًا.'); return; }

  if (state === STATE.IDLE || state === STATE.AWAITING_YEAR) {
    const yearMatch = text.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      targetYear = parseInt(yearMatch[1]);
      addBotMessage(`السنة المستهدفة: ${targetYear}. الآن اختر المحافظة:`);
      askGovernorate();
    } else {
      transitionTo(STATE.AWAITING_YEAR);
      addBotMessage('لم أتمكن من استخراج السنة. أدخل السنة المستهدفة للتنبؤ (مثال: 2030):');
    }
  } else if (state === STATE.AWAITING_YEAR) {
    const yearMatch = text.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      targetYear = parseInt(yearMatch[1]);
      addBotMessage(`السنة المستهدفة: ${targetYear}. الآن اختر المحافظة:`);
      askGovernorate();
    } else {
      addBotMessage('أدخل سنة صحيحة من أربعة أرقام (مثال: 2028):');
    }
  }
}

async function askGovernorate() {
  transitionTo(STATE.CHOOSING_GOVERNORATE);
  showLoading();
  try {
    const res = await fetch(`/options/regions?upload_id=${uploadId}&governorate=_`);
    // We need governorates from the upload response — we stored them in the status
    // Instead fetch from upload info kept in DOM
    const govRes = await fetch(`/options/regions?upload_id=${uploadId}&governorate=__dummy__`);
    // Actually just re-upload isn't practical; we stored governorates at upload time
    const govs = window._governorates || [];
    hideLoading();
    showOptions(govs, val => { choices.governorate = val; addUserMessage(val); askRegion(); });
  } catch {
    hideLoading();
  }
}

async function askRegion() {
  transitionTo(STATE.CHOOSING_REGION);
  showLoading();
  try {
    const res = await fetch(`/options/regions?upload_id=${uploadId}&governorate=${encodeURIComponent(choices.governorate)}`);
    const data = await res.json();
    hideLoading();
    addBotMessage('اختر المنطقة:');
    showOptions(data.regions, val => { choices.region = val; addUserMessage(val); askNeighborhood(); });
  } catch (e) {
    hideLoading();
    addBotMessage('خطأ في جلب المناطق.');
  }
}

async function askNeighborhood() {
  transitionTo(STATE.CHOOSING_NEIGHBORHOOD);
  showLoading();
  try {
    const url = `/options/neighborhoods?upload_id=${uploadId}&governorate=${encodeURIComponent(choices.governorate)}&region=${encodeURIComponent(choices.region)}`;
    const res = await fetch(url);
    const data = await res.json();
    hideLoading();
    addBotMessage('اختر الحي:');
    showOptions(data.neighborhoods, val => { choices.neighborhood = val; addUserMessage(val); askAgeGroup(); });
  } catch (e) {
    hideLoading();
    addBotMessage('خطأ في جلب الأحياء.');
  }
}

async function askAgeGroup() {
  transitionTo(STATE.CHOOSING_AGE_GROUP);
  showLoading();
  try {
    const res = await fetch(`/options/age_groups?upload_id=${uploadId}`);
    const data = await res.json();
    hideLoading();
    addBotMessage('اختر الفئة العمرية:');
    showOptions(data.age_groups, val => { choices.age_group = val; addUserMessage(val); runForecast(); });
  } catch (e) {
    hideLoading();
    addBotMessage('خطأ في جلب الفئات العمرية.');
  }
}

async function runForecast() {
  transitionTo(STATE.SHOWING_RESULT);
  showLoading('جارٍ تشغيل نموذج ARIMA…');
  addBotMessage(`جارٍ حساب التنبؤ لعام ${targetYear}…`);
  try {
    const body = {
      upload_id: uploadId,
      governorate: choices.governorate,
      region: choices.region,
      neighborhood: choices.neighborhood,
      age_group: choices.age_group,
      target_year: targetYear,
      order: 'auto',
      confidence: 95,
    };
    const res = await fetch('/forecast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'خطأ في التنبؤ');
    hideLoading();
    displayResults(data);
  } catch (e) {
    hideLoading();
    addBotMessage(`خطأ: ${e.message}`);
  }
}

// ─── Display results ──────────────────────────────────────────────────────────
function displayResults(data) {
  addBotMessage('تم! النتائج معروضة أدناه.');
  resultsSection.style.display = 'block';
  resultsSection.scrollIntoView({ behavior: 'smooth' });

  // Summary cards
  const lastForecast = data.forecast.length ? data.forecast[data.forecast.length - 1] : null;
  document.getElementById('sc-combination').textContent = data.combination;
  document.getElementById('sc-order').textContent = `(${data.selected_order.join(',')})`;
  document.getElementById('sc-aic').textContent = data.aic ? data.aic.toFixed(1) : '—';
  document.getElementById('sc-points').textContent = data.data_points;
  document.getElementById('sc-target').textContent = lastForecast
    ? `${lastForecast.value.toLocaleString('ar-SA', {maximumFractionDigits: 0})} نسمة`
    : (data.historical.length ? data.historical[data.historical.length-1].value.toLocaleString('ar-SA', {maximumFractionDigits:0}) + ' نسمة' : '—');

  if (data.message) {
    document.getElementById('forecast-message').textContent = data.message;
    document.getElementById('forecast-message').style.display = 'block';
  } else {
    document.getElementById('forecast-message').style.display = 'none';
  }

  buildChart(data);
  buildTable(data);

  // CSV download link
  const dlBtn = document.getElementById('download-csv-btn');
  const params = new URLSearchParams({
    upload_id: uploadId,
    governorate: choices.governorate,
    region: choices.region,
    neighborhood: choices.neighborhood,
    age_group: choices.age_group,
    target_year: targetYear,
  });
  dlBtn.onclick = () => window.location = `/download_csv?${params}`;
}

function buildChart(data) {
  const histYears = data.historical.map(p => p.year);
  const histVals = data.historical.map(p => p.value);
  const fcYears = data.forecast.map(p => p.year);
  const fcVals = data.forecast.map(p => p.value);
  const fcLo = data.forecast.map(p => p.lower);
  const fcHi = data.forecast.map(p => p.upper);

  const traces = [
    { x: histYears, y: histVals, name: 'القيم التاريخية', mode: 'lines+markers', line: { color: '#1a56db', width: 2.5 }, marker: { size: 6 } },
  ];

  if (fcYears.length) {
    // Join last historical point to forecast line for continuity
    const joinX = [histYears[histYears.length-1], ...fcYears];
    const joinY = [histVals[histVals.length-1], ...fcVals];
    const joinLo = [histVals[histVals.length-1], ...fcLo];
    const joinHi = [histVals[histVals.length-1], ...fcHi];

    traces.push({
      x: [...joinX, ...joinX.slice().reverse()],
      y: [...joinHi, ...joinLo.slice().reverse()],
      fill: 'toself', fillcolor: 'rgba(26,86,219,0.12)',
      line: { color: 'transparent' }, name: 'مجال الثقة 95%', hoverinfo: 'skip',
    });
    traces.push({
      x: joinX, y: joinY, name: 'التنبؤ', mode: 'lines+markers',
      line: { color: '#e53e3e', dash: 'dash', width: 2.5 }, marker: { size: 7, symbol: 'diamond' },
    });
  }

  const layout = {
    title: { text: `تقدير السكان — ${data.combination}`, font: { size: 14 } },
    xaxis: { title: 'السنة', tickformat: 'd' },
    yaxis: { title: 'عدد السكان' },
    legend: { x: 0, y: 1.15, orientation: 'h' },
    margin: { t: 60, r: 20, l: 60, b: 50 },
    font: { family: 'Segoe UI, Tahoma, Arial' },
  };
  Plotly.newPlot('forecast-chart', traces, layout, { responsive: true, displayModeBar: false });
}

function buildTable(data) {
  const tbody = document.getElementById('results-tbody');
  tbody.innerHTML = '';
  const allPoints = [
    ...data.historical.map(p => ({ ...p, is_forecast: false })),
    ...data.forecast.map(p => ({ ...p, is_forecast: true })),
  ];
  for (const pt of allPoints) {
    const tr = document.createElement('tr');
    if (pt.is_forecast) tr.classList.add('forecast-row');
    const fmt = v => v != null ? Math.round(v).toLocaleString('ar-SA') : '—';
    tr.innerHTML = `<td>${pt.year}</td><td>${fmt(pt.value)}</td><td>${fmt(pt.lower)}</td><td>${fmt(pt.upper)}</td><td>${pt.is_forecast ? 'تنبؤ' : 'فعلي'}</td>`;
    tbody.appendChild(tr);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function addBotMessage(text) {
  const div = document.createElement('div');
  div.className = 'bubble bot';
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function addUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'bubble user';
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function showOptions(options, onSelect) {
  const wrap = document.createElement('div');
  wrap.className = 'bubble bot';
  const grid = document.createElement('div');
  grid.className = 'options-grid';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'opt-btn';
    btn.textContent = opt;
    btn.addEventListener('click', () => {
      // Disable all buttons in this group
      wrap.querySelectorAll('.opt-btn').forEach(b => { b.disabled = true; b.style.opacity = '0.6'; });
      onSelect(opt);
    });
    grid.appendChild(btn);
  });
  wrap.appendChild(grid);
  chatBox.appendChild(wrap);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function showStatus(msg, type) {
  statusBar.textContent = msg;
  statusBar.className = 'status-bar show';
  if (type) statusBar.classList.add(type);
}

function showLoading(msg = 'جارٍ التحميل…') {
  document.getElementById('loading-msg').textContent = msg;
  loadingOverlay.classList.add('show');
}
function hideLoading() { loadingOverlay.classList.remove('show'); }

function transitionTo(newState) { state = newState; }

function resetAll() {
  choices = { governorate: null, region: null, neighborhood: null, age_group: null };
  targetYear = null;
  transitionTo(STATE.IDLE);
  chatBox.innerHTML = '';
  resultsSection.style.display = 'none';
  addBotMessage('تم إعادة التعيين. اكتب سؤالك الجديد:');
}

function goBack() {
  // Simple back: go to previous step
  const steps = [STATE.CHOOSING_GOVERNORATE, STATE.CHOOSING_REGION, STATE.CHOOSING_NEIGHBORHOOD, STATE.CHOOSING_AGE_GROUP, STATE.SHOWING_RESULT];
  const idx = steps.indexOf(state);
  if (idx <= 0) { addBotMessage('أنت في بداية المحادثة.'); return; }
  const prev = steps[idx - 1];
  transitionTo(prev);
  if (prev === STATE.CHOOSING_GOVERNORATE) { choices = { governorate: null, region: null, neighborhood: null, age_group: null }; addBotMessage('اختر المحافظة مجددًا:'); askGovernorate(); }
  else if (prev === STATE.CHOOSING_REGION) { choices.region = null; choices.neighborhood = null; choices.age_group = null; addBotMessage('اختر المنطقة مجددًا:'); askRegion(); }
  else if (prev === STATE.CHOOSING_NEIGHBORHOOD) { choices.neighborhood = null; choices.age_group = null; addBotMessage('اختر الحي مجددًا:'); askNeighborhood(); }
  else if (prev === STATE.CHOOSING_AGE_GROUP) { choices.age_group = null; addBotMessage('اختر الفئة العمرية مجددًا:'); askAgeGroup(); }
}
