/* =========================
   CONFIG
========================= */
const CONFIG = {
  OPTIONS_URL: 'Options.txt', // KISS flat list in repo root
  DEFAULT_SECTIONS: [
    'Customer Summary',
    'Boiler',
    'Flue',
    'Condensate',
    'Gas',
    'Heating Circuit',
    'Cylinder',
    'Controls',
    'Electrical',
    'WAH',
    'Access & Parking',
    'Asbestos',
    'Disposal',
    'Making Good',
    'Notes / Caveats'
  ],
  // Set at runtime from the input box; fallback to blank (will show prompt in copy box)
  GPT_URL: ''
};

/* =========================
   STATE
========================= */
const state = {
  viewMode: 'simple',                 // 'simple' | 'pro'
  activeSection: null,                // string
  sections: {},                       // { [section]: { ticks:Set<string>, note:string } }
  optionsIndex: {},                   // { [category]: [{code,text}] }
  // mapping section -> "native" category (optional)
  sectionCategory: {},                // { [section]: 'category' }
};

/* Ensure section bucket exists */
function ensureSection(section){
  state.sections[section] ??= { ticks:new Set(), note:'' };
}

/* Semicolon line */
const semi = (code, text) => `${code}; ${text}`;

/* =========================
   INIT
========================= */
window.addEventListener('DOMContentLoaded', async () => {
  wireDom();
  populateSections();
  setActiveSection(CONFIG.DEFAULT_SECTIONS[0]);
  await loadOptionsTxt(CONFIG.OPTIONS_URL);
  hydrateSelectors();
  renderSimple(); renderPro(); updateCounts();
});

/* =========================
   DOM WIRES
========================= */
let el = {};
function wireDom(){
  el.sectionSelect = document.getElementById('sectionSelect');
  el.simplePane = document.getElementById('simplePane');
  el.proPane = document.getElementById('proPane');

  el.simpleList = document.getElementById('simpleList');
  el.simpleNote = document.getElementById('simpleNote');
  el.attachFromCategorySimple = document.getElementById('attachFromCategorySimple');
  el.btnAttachSimple = document.getElementById('btnAttachSimple');
  el.simpleCount = document.getElementById('simpleCount');

  el.proSearch = document.getElementById('proSearch');
  el.proCategory = document.getElementById('proCategory');
  el.proList = document.getElementById('proList');
  el.btnAddVisible = document.getElementById('btnAddVisible');
  el.proCount = document.getElementById('proCount');

  el.includeHeaders = document.getElementById('includeHeaders');
  el.sortLines = document.getElementById('sortLines');
  el.copyOutput = document.getElementById('copyOutput');
  el.btnCopyToClipboard = document.getElementById('btnCopyToClipboard');
  el.status = document.getElementById('status');

  el.btnCopySection = document.getElementById('btnCopySection');
  el.btnSummariseSection = document.getElementById('btnSummariseSection');
  el.btnCopySectionPro = document.getElementById('btnCopySectionPro');
  el.btnSummariseSectionPro = document.getElementById('btnSummariseSectionPro');

  el.btnSummariseDepot = document.getElementById('btnSummariseDepot');
  el.btnSummariseCustomer = document.getElementById('btnSummariseCustomer');
  el.gptUrl = document.getElementById('gptUrl');

  // Toggle views
  document.querySelectorAll('input[name="viewMode"]').forEach(r => {
    r.addEventListener('change', e => {
      state.viewMode = e.target.value;
      renderView();
    });
  });

  // Section change
  el.sectionSelect.addEventListener('change', () => {
    setActiveSection(el.sectionSelect.value);
  });

  // Simple note
  el.simpleNote.addEventListener('input', e => {
    const s = state.activeSection; ensureSection(s);
    state.sections[s].note = e.target.value.trim();
  });

  // Simple attach
  el.attachFromCategorySimple.addEventListener('change', () => {
    el.btnAttachSimple.disabled = !el.attachFromCategorySimple.value;
  });
  el.btnAttachSimple.addEventListener('click', () => {
    const cat = el.attachFromCategorySimple.value;
    if(!cat) return;
    attachCategoryToSection(cat, state.activeSection);
    el.attachFromCategorySimple.value = '';
    el.btnAttachSimple.disabled = true;
    buildCopyForSection(state.activeSection);
  });

  // Simple copy
  el.btnCopySection.addEventListener('click', () => {
    buildCopyForSection(state.activeSection);
  });
  el.btnSummariseSection.addEventListener('click', () => summariseSection(state.activeSection));

  // Pro wires
  el.proSearch.addEventListener('input', renderProList);
  el.proCategory.addEventListener('change', renderProList);
  el.btnAddVisible.addEventListener('click', () => {
    const visible = [...el.proList.querySelectorAll('.item')]
      .filter(n => !n.classList.contains('hidden'))
      .map(n => ({ code:n.dataset.code, text:n.dataset.text }));
    const s = state.activeSection; ensureSection(s);
    visible.forEach(it => state.sections[s].ticks.add(semi(it.code, it.text)));
    updateCounts();
    buildCopyForSection(s);
  });
  el.btnCopySectionPro.addEventListener('click', () => buildCopyForSection(state.activeSection));
  el.btnSummariseSectionPro.addEventListener('click', () => summariseSection(state.activeSection));

  // Copy to clipboard
  el.btnCopyToClipboard.addEventListener('click', () => {
    el.copyOutput.select();
    document.execCommand('copy');
    flash('Copied to clipboard', 'ok');
  });

  // Whole-job summaries
  el.btnSummariseDepot.addEventListener('click', () => summariseWholeJob(false));
  el.btnSummariseCustomer.addEventListener('click', () => summariseWholeJob(true));

  // GPT URL
  el.gptUrl.addEventListener('change', () => { CONFIG.GPT_URL = el.gptUrl.value.trim(); });
}

/* =========================
   SECTIONS
========================= */
function populateSections(){
  el.sectionSelect.innerHTML = CONFIG.DEFAULT_SECTIONS.map(s => `<option>${s}</option>`).join('');
}

function setActiveSection(section){
  state.activeSection = section;
  ensureSection(section);
  // Set a "native" category guess = section name lowercased token
  const guess = section.toLowerCase().replace(/[^a-z0-9]+/g,'_');
  state.sectionCategory[section] ??= guess;
  renderSimple();
  renderPro();
  updateCounts();
}

/* =========================
   VIEW RENDER
========================= */
function renderView(){
  const simple = state.viewMode === 'simple';
  el.simplePane.classList.toggle('hidden', !simple);
  el.proPane.classList.toggle('hidden', simple);
}

/* ===== SIMPLE ===== */
function renderSimple(){
  renderView();
  // Fill simple tick list from the "native" category OR fallback to same-name category if exists
  const section = state.activeSection;
  const nativeCat = pickBestCategoryForSection(section);
  const items = (state.optionsIndex[nativeCat] || []);
  const chosen = state.sections[section]?.ticks ?? new Set();

  el.simpleList.innerHTML = items.map(it => {
    const id = `chk_${section}_${it.code}`;
    const checked = chosen.has(semi(it.code, it.text)) ? 'checked' : '';
    return `<label class="item"><input type="checkbox" id="${id}" data-code="${it.code}" data-text="${it.text}" ${checked}> ${it.code} – ${it.text}</label>`;
  }).join('') || `<div class="muted" style="padding:.5rem">No items in <strong>${nativeCat}</strong>. Use “Attach” to pull from other categories.</div>`;

  // bind checkboxes
  el.simpleList.querySelectorAll('input[type="checkbox"]').forEach(chk => {
    chk.addEventListener('change', e => {
      const code = e.target.dataset.code;
      const text = e.target.dataset.text;
      const s = state.activeSection; ensureSection(s);
      const line = semi(code, text);
      if(e.target.checked) state.sections[s].ticks.add(line);
      else state.sections[s].ticks.delete(line);
      updateCounts();
    });
  });

  // note
  el.simpleNote.value = state.sections[section]?.note ?? '';

  // Attach selector
  hydrateAttachSelect(el.attachFromCategorySimple);
}

/* Pick best category for a given section name */
function pickBestCategoryForSection(section){
  const set = new Set(Object.keys(state.optionsIndex));
  const direct = section.toLowerCase().replace(/[^a-z0-9]+/g,'_');
  if (set.has(direct)) return direct;

  // Some common aliases
  const alias = {
    wah: 'working_at_heights',
    gas: 'gas',
    boiler: 'boiler',
    flue: 'flue',
    controls: 'controls',
    electrical: 'electrical',
    cylinder: 'cylinder',
    making_good: 'making_good',
  };
  if (alias[direct] && set.has(alias[direct])) return alias[direct];

  // fallback to first category
  return Object.keys(state.optionsIndex)[0] || direct;
}

/* ===== PRO ===== */
function renderPro(){
  // categories list
  const cats = Object.keys(state.optionsIndex).sort();
  el.proCategory.innerHTML = `<option value="">All categories</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join('');
  renderProList();
}

function renderProList(){
  const q = (el.proSearch.value || '').toLowerCase();
  const cat = el.proCategory.value;
  const entries = [];
  for(const [category, arr] of Object.entries(state.optionsIndex)){
    if(cat && category !== cat) continue;
    for(const it of arr){
      entries.push({ category, ...it });
    }
  }
  const filtered = entries.filter(e => !q || e.code.toLowerCase().includes(q) || e.text.toLowerCase().includes(q) || e.category.toLowerCase().includes(q));
  el.proList.innerHTML = filtered.map(e => {
    const id = `pro_${e.category}_${e.code}`;
    return `<div class="item" id="${id}" data-code="${e.code}" data-text="${e.text}">
      <button data-add="${e.code}" title="Add to current section">+</button>
      <div>
        <div><strong>${e.code}</strong> — ${e.text}</div>
        <div class="muted">${e.category}</div>
      </div>
    </div>`;
  }).join('') || `<div class="muted" style="padding:.5rem">No items match.</div>`;

  // wire add buttons
  el.proList.querySelectorAll('button[data-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.add;
      const node = btn.closest('.item');
      const text = node.dataset.text;
      const s = state.activeSection; ensureSection(s);
      state.sections[s].ticks.add(semi(code, text));
      updateCounts();
      buildCopyForSection(s);
    });
  });
}

/* Attach full category to section */
function attachCategoryToSection(category, section){
  ensureSection(section);
  const items = state.optionsIndex[category] || [];
  for(const it of items) state.sections[section].ticks.add(semi(it.code, it.text));
  updateCounts();
}

/* =========================
   OPTIONS.TXT LOADER
========================= */
/*
KISS flat format:
[category_name]
CODE | Category | Specific text
*/
async function loadOptionsTxt(url){
  const res = await fetch(url, { cache:'no-store' });
  const txt = await res.text();

  const lines = txt.split(/\r?\n/);
  let cat = null;
  for(const raw of lines){
    const line = raw.trim();
    if(!line || line.startsWith('#')) continue;
    const hdr = line.match(/^\[([^\]]+)\]$/);
    if(hdr){
      cat = hdr[1].trim();
      state.optionsIndex[cat] ??= [];
      continue;
    }
    if(!cat) continue;
    const parts = line.split('|').map(s => s.trim());
    if(parts.length >= 3){
      const [code, , specific] = parts;
      if(code && specific){
        state.optionsIndex[cat].push({ code, text: specific });
      }
    }
  }
}

/* Hydrate the "attach from category" select */
function hydrateAttachSelect(selectEl){
  const opts = Object.keys(state.optionsIndex).sort()
    .map(c => `<option value="${c}">${c}</option>`).join('');
  selectEl.innerHTML = `<option value="">+ Attach items from another category…</option>${opts}`;
}

function hydrateSelectors(){
  hydrateAttachSelect(el.attachFromCategorySimple);
}

/* =========================
   COPY OUTPUT
========================= */
function buildCopyForSection(section){
  ensureSection(section);
  const { ticks, note } = state.sections[section];

  const lines = [];
  if(el.includeHeaders.checked) lines.push(`[${section}]`);
  if(note) lines.push(`NOTE; ${note}`);
  const arr = Array.from(ticks);
  if(el.sortLines.checked) arr.sort((a,b)=>a.localeCompare(b));
  lines.push(...arr);

  el.copyOutput.value = lines.join('\n');
}

/* Helpful counts UI */
function updateCounts(){
  const s = state.activeSection; ensureSection(s);
  const n = state.sections[s].ticks.size;
  el.simpleCount.textContent = `${n} selected`;
  el.proCount.textContent = `${n} selected`;
}

/* =========================
   GPT SUMMARIES (Cloudflare)
========================= */
function buildCustomerPrompt(pairs){
  return [
`SYSTEM: You are a UK heating adviser writing a short, clear customer summary.`,
`TONE: Friendly, factual, avoid jargon.`,
`LENGTH: 6–10 concise bullets.`,
`INCLUDE: boiler type/location, flue works, controls, water/pressure caveats, best-advice notes, access/WAH, making-good.`,
`EXCLUDE: internal codes; no prices.`,
`INPUT (semicolon items):`,
pairs.map(([id, data])=>{
  const items = Array.from(data.ticks).join('\n');
  const note = data.note ? `NOTE; ${data.note}` : '';
  return `[# ${id}]\n${note}\n${items}`;
}).join(`\n\n`)
  ].join('\n');
}

function buildDepotPrompt(pairs){
  return [
`SYSTEM: Generate DEPOT-READY notes (British Gas style) in terse semicolon lines.`,
`FORMAT: Keep semicolon items; group by [Section]; include engineer-critical caveats; no pricing.`,
`INPUT:`,
pairs.map(([id, data])=>{
  const items = Array.from(data.ticks).join('\n');
  const note = data.note ? `NOTE; ${data.note}` : '';
  return `[# ${id}]\n${note}\n${items}`;
}).join(`\n\n`),
`OUTPUT: Return only final notes, grouped by [Section], ready to paste.`
].join('\n');
}

async function summariseSection(section){
  ensureSection(section);
  const pairs = [[section, state.sections[section]]];
  const prompt = buildCustomerPrompt(pairs);
  await sendToCFOrShowPrompt(prompt, `Summary – ${section}`);
}

async function summariseWholeJob(customerFacing){
  const pairs = Object.entries(state.sections).filter(([,v]) => v.note || v.ticks.size);
  if(!pairs.length){ flash('Nothing selected yet', 'note'); return; }
  const prompt = customerFacing ? buildCustomerPrompt(pairs) : buildDepotPrompt(pairs);
  await sendToCFOrShowPrompt(prompt, customerFacing ? 'Customer Summary' : 'Depot Summary');
}

async function sendToCFOrShowPrompt(prompt, label){
  const url = (CONFIG.GPT_URL || '').trim();
  if(!url){
    el.copyOutput.value = `# ${label}\n\n${prompt}`;
    flash('No CF URL set — prompt shown in copy box', 'note');
    return;
  }
  try{
    const res = await fetch(url, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ prompt })
    });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(()=> ({}));
    const text = data.text || data.output || data.result || (data.choices?.[0]?.message?.content) || '';
    if(text){
      el.copyOutput.value = text.trim();
      flash('Summary ready', 'ok');
    }else{
      el.copyOutput.value = `# ${label}\n\n${prompt}`;
      flash('CF response empty — showing prompt instead', 'note');
    }
  }catch(err){
    el.copyOutput.value = `# ${label}\n\n${prompt}`;
    flash(`CF error — showing prompt instead (${err.message})`, 'danger');
  }
}

/* =========================
   UTIL
========================= */
function flash(msg, kind='ok'){
  el.status.textContent = msg;
  el.status.className = `small ${kind}`;
  setTimeout(()=>{ el.status.textContent=''; el.status.className='small muted'; }, 3000);
}