'use strict';

/* ══════════════════════════════════════════
   STATE
══════════════════════════════════════════ */
const S = {
  IDLE:                  'idle',
  AWAITING_YEAR:         'awaiting_year',
  CHOOSING_GOVERNORATE:  'choosing_governorate',
  CHOOSING_REGION:       'choosing_region',
  CHOOSING_NEIGHBORHOOD: 'choosing_neighborhood',
  CHOOSING_AGE_GROUP:    'choosing_age_group',
  RUNNING_FORECAST:      'running_forecast',
  DONE:                  'done',
};

let chatState        = S.IDLE;
let uploadId         = null;
let uploadName       = null;
let targetYear       = null;
let choices          = { governorate: null, region: null, neighborhood: null, age_group: null };
let lastForecastData = null;

const SCREEN_ORDER = ['upload', 'chat', 'results'];

/* ══════════════════════════════════════════
   SCREEN TRANSITIONS
══════════════════════════════════════════ */
function showScreen(name) {
  const prev   = document.querySelector('.screen.active');
  const target = document.getElementById('screen-' + name);
  if (!target || target === prev) return;

  const prevName = prev ? prev.id.replace('screen-', '') : null;
  const prevIdx  = prevName ? SCREEN_ORDER.indexOf(prevName) : -1;
  const nextIdx  = SCREEN_ORDER.indexOf(name);
  const forward  = nextIdx > prevIdx;

  // In RTL: forward = left side, back = right side
  const enterFrom = forward ? '-48px' : '48px';
  const exitTo    = forward ? '48px'  : '-48px';

  // Prepare incoming (off-screen, invisible)
  target.style.cssText =
    `transform:translateX(${enterFrom});opacity:0;pointer-events:none;transition:none;`;
  void target.offsetHeight; // force reflow

  // Animate outgoing
  if (prev) {
    prev.style.cssText =
      `transform:translateX(${exitTo});opacity:0;pointer-events:none;` +
      `transition:opacity .34s ease,transform .34s cubic-bezier(.22,1,.36,1);`;
    setTimeout(() => {
      prev.classList.remove('active');
      prev.style.cssText = '';
    }, 380);
  }

  // Animate incoming
  target.style.cssText =
    `transform:translateX(${enterFrom});opacity:0;pointer-events:none;` +
    `transition:opacity .4s ease,transform .4s cubic-bezier(.22,1,.36,1);`;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    target.classList.add('active');
    target.style.cssText =
      `transform:translateX(0);opacity:1;pointer-events:all;` +
      `transition:opacity .4s ease,transform .4s cubic-bezier(.22,1,.36,1);`;
    setTimeout(() => { target.style.cssText = ''; }, 440);
  }));

  _updateStepNav(name);
}

function _updateStepNav(name) {
  const map = { upload: 1, chat: 2, results: 3 };
  const cur = map[name] || 1;
  [1, 2, 3].forEach(n => {
    const el = document.getElementById('step-' + n);
    if (!el) return;
    el.classList.toggle('active', n === cur);
    el.classList.toggle('done',   n < cur);
  });
  document.querySelectorAll('.step-connector').forEach((c, i) => {
    c.classList.toggle('done', i < cur - 1);
  });
}

/* ══════════════════════════════════════════
   UPLOAD SCREEN
══════════════════════════════════════════ */
const dropZone    = document.getElementById('drop-zone');
const fileInput   = document.getElementById('file-input');
const statusBar   = document.getElementById('status-bar');
const continueBtn = document.getElementById('upload-continue-btn');
const skipBtn     = document.getElementById('skip-upload-btn');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

async function handleFile(file) {
  if (!file) return;
  showStatus('جارٍ رفع الملف وتحليله…', 'info');
  showLoading('جارٍ معالجة الملف…');
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res  = await fetch('/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'خطأ في رفع الملف');

    uploadId   = data.upload_id;
    uploadName = file.name;
    window._governorates = data.governorates || [];

    showStatus(
      `✓ تم رفع الملف بنجاح — ${data.row_count.toLocaleString('ar')} صف · السنوات ${data.year_range[0]}–${data.year_range[1]}`,
      'success'
    );

    const zoneTitle = dropZone.querySelector('.upload-zone-title');
    if (zoneTitle) zoneTitle.innerHTML = `✓ <strong>${file.name}</strong>`;

    continueBtn.disabled = false;

    // Show file chip in sidebar
    const fileInfo = document.getElementById('sidebar-file-info');
    const fileVal  = document.getElementById('si-file-val');
    if (fileInfo) fileInfo.style.display = 'flex';
    if (fileVal)  fileVal.textContent    = file.name;

  } catch (e) {
    showStatus(e.message, 'error');
  } finally {
    hideLoading();
  }
}

continueBtn.addEventListener('click', () => {
  if (uploadId) gotoChat(false);
});

skipBtn.addEventListener('click', () => {
  uploadId   = null;
  uploadName = null;
  window._governorates = [];
  gotoChat(true);
});

function gotoChat(skipped = false) {
  showScreen('chat');
  clearChat();
  chatState = S.IDLE;
  resetProgSteps();

  if (skipped) {
    addBotMsg('مرحباً! لم يتم رفع ملف بيانات.');
    setTimeout(() => {
      showTyping(700).then(() => {
        addBotMsg('لإجراء التحليل الإحصائي، يجب رفع ملف Excel يحتوي على بيانات سكانية. هل تريد العودة لرفع الملف؟');
        showOptions(['نعم، ارجع لرفع الملف'], val => {
          if (val.includes('نعم')) showScreen('upload');
        });
      });
    }, 200);
  } else {
    addBotMsg(`مرحباً! 🎉 تم تحميل ملف البيانات بنجاح.`);
    setTimeout(() => {
      showTyping(750).then(() => {
        addBotMsg('للبدء في التحليل، أدخل السنة المستهدفة للتنبؤ\n(مثال: ٢٠٣٠ أو 2035)');
        chatState = S.AWAITING_YEAR;
      });
    }, 300);
  }
}

/* ══════════════════════════════════════════
   SIDEBAR PROGRESS
══════════════════════════════════════════ */
const PROG_KEYS = ['year', 'gov', 'region', 'nb', 'age'];
const PROG_ID   = { year: 'prog-year', gov: 'prog-gov', region: 'prog-region', nb: 'prog-nb', age: 'prog-age' };
const VAL_ID    = { year: 'si-year-val', gov: 'si-gov-val', region: 'si-region-val', nb: 'si-nb-val', age: 'si-age-val' };

function updateSidebar(key, value) {
  const valEl = document.getElementById(VAL_ID[key]);
  if (valEl) valEl.textContent = value || '—';

  const stepEl = document.getElementById(PROG_ID[key]);
  if (stepEl) {
    stepEl.classList.remove('active');
    stepEl.classList.add('done');
    stepEl.classList.remove('pending');
  }

  const idx = PROG_KEYS.indexOf(key);
  if (idx < PROG_KEYS.length - 1) {
    const nextEl = document.getElementById(PROG_ID[PROG_KEYS[idx + 1]]);
    if (nextEl && !nextEl.classList.contains('done')) {
      nextEl.classList.add('active');
    }
  }
}

function resetProgSteps() {
  PROG_KEYS.forEach(k => {
    const el  = document.getElementById(PROG_ID[k]);
    const val = document.getElementById(VAL_ID[k]);
    if (el)  el.classList.remove('done', 'active');
    if (val) val.textContent = '—';
  });
  const first = document.getElementById(PROG_ID['year']);
  if (first) first.classList.add('active');
}

/* ══════════════════════════════════════════
   CHAT INPUT
══════════════════════════════════════════ */
document.getElementById('send-btn').addEventListener('click', handleUserInput);
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleUserInput(); }
});

document.getElementById('back-to-upload-btn').addEventListener('click', () => showScreen('upload'));
document.getElementById('reset-session-btn').addEventListener('click', resetSession);

function handleUserInput() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text || chatState === S.RUNNING_FORECAST || chatState === S.DONE) return;
  input.value = '';
  addUserMsg(text);

  if (!uploadId) {
    showTyping(500).then(() =>
      addBotMsg('لا توجد بيانات محملة. يرجى العودة لرفع ملف البيانات أولاً.')
    );
    return;
  }

  if (chatState === S.AWAITING_YEAR || chatState === S.IDLE) {
    const match = text.match(/\b(20\d{2})\b/);
    if (match) {
      targetYear = parseInt(match[1]);
      updateSidebar('year', targetYear);
      showTyping(700).then(() => {
        addBotMsg(`السنة المستهدفة: **${targetYear}** ✓\n\nممتاز! الآن اختر المحافظة:`);
        askGovernorate();
      });
    } else {
      showTyping(400).then(() =>
        addBotMsg('لم أتمكن من تحديد السنة. أرجو إدخال سنة من 4 أرقام (مثال: 2030):')
      );
      chatState = S.AWAITING_YEAR;
    }
  }
}

/* ══════════════════════════════════════════
   WIZARD STEPS
══════════════════════════════════════════ */
async function askGovernorate() {
  chatState = S.CHOOSING_GOVERNORATE;
  const govs = window._governorates || [];
  if (!govs.length) { addBotMsg('لا توجد محافظات في البيانات المحملة.'); return; }
  showOptions(govs, val => {
    choices.governorate = val;
    updateSidebar('gov', val);
    addUserMsg(val);
    showTyping(650).then(() => {
      addBotMsg(`المحافظة: **${val}** ✓\n\nاختر المنطقة:`);
      askRegion();
    });
  });
}

async function askRegion() {
  chatState = S.CHOOSING_REGION;
  try {
    const res  = await fetch(`/options/regions?upload_id=${enc(uploadId)}&governorate=${enc(choices.governorate)}`);
    const data = await res.json();
    showOptions(data.regions, val => {
      choices.region = val;
      updateSidebar('region', val);
      addUserMsg(val);
      showTyping(650).then(() => {
        addBotMsg(`المنطقة: **${val}** ✓\n\nاختر الحي:`);
        askNeighborhood();
      });
    });
  } catch { addBotMsg('خطأ في جلب المناطق. حاول مجدداً.'); }
}

async function askNeighborhood() {
  chatState = S.CHOOSING_NEIGHBORHOOD;
  try {
    const url  = `/options/neighborhoods?upload_id=${enc(uploadId)}&governorate=${enc(choices.governorate)}&region=${enc(choices.region)}`;
    const res  = await fetch(url);
    const data = await res.json();
    showOptions([...data.neighborhoods, 'الكل'], val => {
      choices.neighborhood = val;
      updateSidebar('nb', val);
      addUserMsg(val);
      showTyping(650).then(() => {
        addBotMsg(`الحي: **${val}** ✓\n\nأخيراً، اختر الفئة العمرية:`);
        askAgeGroup();
      });
    });
  } catch { addBotMsg('خطأ في جلب الأحياء. حاول مجدداً.'); }
}

async function askAgeGroup() {
  chatState = S.CHOOSING_AGE_GROUP;
  try {
    const res  = await fetch(`/options/age_groups?upload_id=${enc(uploadId)}`);
    const data = await res.json();
    showOptions([...data.age_groups, 'الكل'], val => {
      choices.age_group = val;
      updateSidebar('age', val);
      addUserMsg(val);
      showTyping(750).then(() => {
        addBotMsg(
          `الفئة العمرية: **${val}** ✓\n\n` +
          `شكراً! جميع المعطيات اكتملت:\n` +
          `• السنة: ${targetYear}\n` +
          `• المحافظة: ${choices.governorate}\n` +
          `• المنطقة: ${choices.region}\n` +
          `• الحي: ${choices.neighborhood}\n` +
          `• الفئة العمرية: ${choices.age_group}\n\n` +
          `جارٍ تشغيل نموذج ARIMA…`
        );
        runForecast();
      });
    });
  } catch { addBotMsg('خطأ في جلب الفئات العمرية. حاول مجدداً.'); }
}

async function runForecast() {
  chatState = S.RUNNING_FORECAST;
  showLoading('جارٍ تشغيل نموذج ARIMA…');
  try {
    const body = {
      upload_id:    uploadId,
      governorate:  choices.governorate,
      region:       choices.region,
      neighborhood: choices.neighborhood,
      age_group:    choices.age_group,
      target_year:  targetYear,
      order:        'auto',
      confidence:   95,
    };
    const res  = await fetch('/forecast', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'خطأ في التنبؤ');

    hideLoading();
    lastForecastData = data;
    chatState = S.DONE;

    const lastFc = data.forecast.length ? data.forecast[data.forecast.length - 1] : null;
    const val    = lastFc
      ? lastFc.value.toLocaleString('ar-SA', { maximumFractionDigits: 0 })
      : '—';

    addBotMsg(
      `✅ اكتمل التحليل بنجاح!\n\n` +
      `التقدير السكاني لعام ${targetYear}: **${val} نسمة**\n` +
      `رتبة نموذج ARIMA: (${data.selected_order.join(',')})\n\n` +
      `انتقل إلى شاشة النتائج لعرض الرسم البياني والجدول التفصيلي.`
    );

    setTimeout(() => {
      showScreen('results');
      displayResults(data);
    }, 1400);

  } catch (e) {
    hideLoading();
    chatState = S.IDLE;
    addBotMsg(`حدث خطأ: ${e.message}\n\nاضغط "جلسة جديدة" للمحاولة مرة أخرى.`);
  }
}

/* ══════════════════════════════════════════
   RESULTS
══════════════════════════════════════════ */
function displayResults(data) {
  const lastFc   = data.forecast.length ? data.forecast[data.forecast.length - 1] : null;
  const fmtNum   = v => v != null ? Math.round(v).toLocaleString('ar-SA') : '—';

  document.getElementById('sc-target').textContent =
    lastFc ? `${fmtNum(lastFc.value)} نسمة (${lastFc.year})` : '—';

  document.getElementById('sc-order').textContent =
    `(${data.selected_order.join(' , ')})`;

  document.getElementById('sc-aic').textContent =
    data.aic ? data.aic.toFixed(1) : '—';

  document.getElementById('sc-points').textContent =
    data.data_points || '—';

  document.getElementById('sc-combination').textContent =
    data.combination || '—';

  const msgEl = document.getElementById('forecast-message');
  if (data.message) {
    msgEl.textContent  = data.message;
    msgEl.style.display = 'block';
  } else {
    msgEl.style.display = 'none';
  }

  buildChart(data);
  buildTable(data);

  document.getElementById('download-csv-btn').onclick = () => {
    const p = new URLSearchParams({
      upload_id:    uploadId,
      governorate:  choices.governorate,
      region:       choices.region,
      neighborhood: choices.neighborhood,
      age_group:    choices.age_group,
      target_year:  targetYear,
    });
    window.location = `/download_csv?${p}`;
  };
}

function buildChart(data) {
  const hY = data.historical.map(p => p.year);
  const hV = data.historical.map(p => p.value);
  const fY = data.forecast.map(p => p.year);
  const fV = data.forecast.map(p => p.value);
  const fL = data.forecast.map(p => p.lower);
  const fH = data.forecast.map(p => p.upper);

  const traces = [{
    x: hY, y: hV,
    name: 'البيانات التاريخية',
    mode: 'lines+markers',
    line:   { color: '#003f7f', width: 2.5 },
    marker: { size: 7, symbol: 'circle', color: '#003f7f' },
  }];

  if (fY.length) {
    const jX = [hY[hY.length - 1], ...fY];
    const jV = [hV[hV.length - 1], ...fV];
    const jL = [hV[hV.length - 1], ...fL];
    const jH = [hV[hV.length - 1], ...fH];

    traces.push({
      x: [...jX, ...jX.slice().reverse()],
      y: [...jH, ...jL.slice().reverse()],
      fill:      'toself',
      fillcolor: 'rgba(0,63,127,0.09)',
      line:      { color: 'transparent' },
      name:      'مجال الثقة 95%',
      hoverinfo: 'skip',
      showlegend: true,
    });
    traces.push({
      x: jX, y: jV,
      name: 'التنبؤ',
      mode: 'lines+markers',
      line:   { color: '#c9a84c', dash: 'dash', width: 2.5 },
      marker: { size: 9, symbol: 'diamond', color: '#c9a84c' },
    });
  }

  Plotly.newPlot('forecast-chart', traces, {
    title: {
      text: `التنبؤ السكاني — ${data.combination || ''}`,
      font: { size: 13, family: 'Cairo, Tahoma, Arial', color: '#003f7f' },
    },
    xaxis: { title: 'السنة', tickformat: 'd', gridcolor: '#f0f2f5', zeroline: false },
    yaxis: { title: 'عدد السكان', gridcolor: '#f0f2f5', zeroline: false },
    legend: { orientation: 'h', x: 0.5, xanchor: 'center', y: 1.16 },
    margin: { t: 72, r: 20, l: 72, b: 50 },
    font:   { family: 'Cairo, Tahoma, Arial', size: 12 },
    plot_bgcolor:  '#fafcff',
    paper_bgcolor: '#ffffff',
    hovermode: 'x unified',
  }, { responsive: true, displayModeBar: false });
}

function buildTable(data) {
  const tbody = document.getElementById('results-tbody');
  tbody.innerHTML = '';
  const all = [
    ...data.historical.map(p => ({ ...p, is_forecast: false })),
    ...data.forecast.map(p => ({ ...p, is_forecast: true })),
  ];
  const fmt = v => v != null ? Math.round(v).toLocaleString('ar-SA') : '—';
  for (const pt of all) {
    const tr = document.createElement('tr');
    if (pt.is_forecast) tr.classList.add('forecast-row');
    tr.innerHTML =
      `<td><strong>${pt.year}</strong></td>` +
      `<td>${fmt(pt.value)}</td>` +
      `<td>${fmt(pt.lower)}</td>` +
      `<td>${fmt(pt.upper)}</td>` +
      `<td><span class="${pt.is_forecast ? 'badge-fc' : 'badge-hist'}">${pt.is_forecast ? 'تنبؤ' : 'فعلي'}</span></td>`;
    tbody.appendChild(tr);
  }
}

/* ══════════════════════════════════════════
   AI ANALYSIS
══════════════════════════════════════════ */
document.getElementById('analyze-btn').addEventListener('click', runAiAnalysis);
document.getElementById('groq-api-key').addEventListener('keydown', e => {
  if (e.key === 'Enter') runAiAnalysis();
});

async function runAiAnalysis() {
  const key = document.getElementById('groq-api-key').value.trim();
  if (!key) { alert('يرجى إدخال مفتاح Groq API أولاً.'); return; }
  if (!lastForecastData) { alert('لا توجد بيانات تنبؤ. أجرِ تحليلاً أولاً.'); return; }

  document.getElementById('ai-loading').style.display        = 'flex';
  document.getElementById('ai-analysis-result').style.display = 'none';
  document.getElementById('analyze-btn').disabled             = true;

  try {
    const res  = await fetch('/ai_analyze', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ api_key: key, forecast_data: lastForecastData }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'خطأ في الذكاء الاصطناعي');

    document.getElementById('ai-text').innerHTML = renderMarkdown(data.analysis);
    document.getElementById('ai-analysis-result').style.display = 'block';

    document.getElementById('ai-analysis-result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  } catch (e) {
    alert(`خطأ: ${e.message}`);
  } finally {
    document.getElementById('ai-loading').style.display = 'none';
    document.getElementById('analyze-btn').disabled     = false;
  }
}

function renderMarkdown(text) {
  return text
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

/* ══════════════════════════════════════════
   RESULTS NAVIGATION
══════════════════════════════════════════ */
document.getElementById('back-to-chat-btn').addEventListener('click', () => showScreen('chat'));
document.getElementById('new-forecast-btn').addEventListener('click', resetSession);

/* ══════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════ */
function clearChat() {
  document.getElementById('chat-box').innerHTML = '';
}

function addBotMsg(text) {
  const box = document.getElementById('chat-box');
  const div = document.createElement('div');
  div.className = 'bubble bot';
  div.innerHTML =
    text.replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') +
    `<span class="bubble-time">${now()}</span>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function addUserMsg(text) {
  const box = document.getElementById('chat-box');
  const div = document.createElement('div');
  div.className = 'bubble user';
  div.innerHTML = escHtml(text) + `<span class="bubble-time">${now()}</span>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function showOptions(options, onSelect) {
  const box  = document.getElementById('chat-box');
  const wrap = document.createElement('div');
  wrap.className = 'bubble bot';
  const grid = document.createElement('div');
  grid.className = 'options-grid';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className   = 'opt-btn';
    btn.textContent = opt;
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('.opt-btn').forEach(b => {
        b.disabled = true;
        b.style.opacity = '0.4';
      });
      btn.style.opacity = '1';
      btn.classList.add('selected');
      onSelect(opt);
    });
    grid.appendChild(btn);
  });
  wrap.appendChild(grid);
  box.appendChild(wrap);
  box.scrollTop = box.scrollHeight;
}

function showTyping(ms = 600) {
  const box = document.getElementById('chat-box');
  const el  = document.createElement('div');
  el.className  = 'typing-bubble';
  el.id         = 'typing-indicator';
  el.innerHTML  = '<span></span><span></span><span></span>';
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
  return new Promise(resolve => setTimeout(() => { el.remove(); resolve(); }, ms));
}

function showStatus(msg, type) {
  statusBar.textContent = msg;
  statusBar.className   = `status-bar show ${type}`;
}

function showLoading(msg = 'جارٍ التحميل…') {
  document.getElementById('loading-msg').textContent = msg;
  document.getElementById('loading-overlay').classList.add('show');
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.remove('show');
}

function resetSession() {
  choices          = { governorate: null, region: null, neighborhood: null, age_group: null };
  targetYear       = null;
  chatState        = S.IDLE;
  lastForecastData = null;
  document.getElementById('ai-analysis-result').style.display = 'none';
  document.getElementById('groq-api-key').value = '';
  clearChat();
  resetProgSteps();
  showScreen('chat');
  if (uploadId) {
    setTimeout(() => {
      addBotMsg('تم إعادة التعيين. أدخل السنة المستهدفة للتنبؤ:');
      chatState = S.AWAITING_YEAR;
    }, 450);
  } else {
    setTimeout(() => {
      addBotMsg('لا توجد بيانات محملة. يرجى العودة لرفع ملف البيانات أولاً.');
    }, 450);
  }
}

function now() {
  return new Date().toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });
}

function enc(v) { return encodeURIComponent(v); }

function escHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
window._governorates = [];
showScreen('upload');
