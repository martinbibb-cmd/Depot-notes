(()=>{ // fully scoped to #depotV2
  const ROOT = document.getElementById('depotV2'); if(!ROOT) return;
  const $ = s => ROOT.querySelector(s); const $$ = s => [...ROOT.querySelectorAll(s)];
  const semi = (c,t)=>`${c}; ${t}`;

  /* ------------ CONFIG ------------ */
  const CONFIG = {
    OPTIONS_URL: 'Options.txt',
    DEPOT_SECTIONS: [
      'Customer Summary','Boiler','Flue','Condensate','Gas','Heating Circuit',
      'Cylinder','Controls','Electrical','WAH','Access & Parking','Asbestos',
      'Disposal','Making Good','Notes / Caveats'
    ]
  };

  /* ------------ STATE ------------ */
  const state = {
    options: {},             // { [category]: [{code,text}] }
    staged: new Set(),       // selected items (strings "CODE; text") in current source view
    currentDept: null,       // category currently shown
    sections: {}             // { [section]: { ticks:Set<string>, note:string } }
  };
  const ensure = s => (state.sections[s] ??= { ticks:new Set(), note:'' });

  /* ------------ TABS ------------ */
  $$(".tab").forEach(btn=>{
    btn.addEventListener('click', ()=>{
      $$(".tab").forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      $$(".pane").forEach(p=>p.classList.remove('active'));
      $("#pane-"+tab).classList.add('active');
    });
  });

  /* ------------ BOOT ------------ */
  window.addEventListener('DOMContentLoaded', async ()=>{
    // hydrate target depot sections
    $("#tgtSection").innerHTML = CONFIG.DEPOT_SECTIONS.map(s=>`<option>${s}</option>`).join('');
    CONFIG.DEPOT_SECTIONS.forEach(s => ensure(s));

    // render the stack of all depot sections (right-hand side)
    renderSectionsStack();

    // events
    $("#srcDept").addEventListener('change', ()=>{ state.currentDept = $("#srcDept").value; state.staged.clear(); $("#srcFilter").value=''; renderSrcList(); reflectSelCount(); });
    $("#srcFilter").addEventListener('input', ()=>{ renderSrcList(); reflectSelCount(); });

    $("#btnSelectAll").addEventListener('click', ()=>{ // select all visible items in current filter
      $("#srcList").querySelectorAll('input[type="checkbox"]').forEach(chk=>{
        const line = semi(chk.dataset.code, chk.dataset.text);
        chk.checked = true; state.staged.add(line);
      });
      reflectSelCount();
    });

    $("#btnClearVisible").addEventListener('click', ()=>{ // clear only visible
      $("#srcList").querySelectorAll('input[type="checkbox"]').forEach(chk=>{
        const line = semi(chk.dataset.code, chk.dataset.text);
        chk.checked = false; state.staged.delete(line);
      });
      reflectSelCount();
    });

    $("#btnSend").addEventListener('click', ()=>{
      const tgt = $("#tgtSection").value;
      if(!tgt || state.staged.size===0){ flashSend('Nothing to send'); return; }
      ensure(tgt);
      state.staged.forEach(line => state.sections[tgt].ticks.add(line));
      state.staged.clear();
      renderSrcList(); reflectSelCount();
      updateSectionCard(tgt);
      flashSend(`Sent to [${tgt}]`);
    });

    // load options and hydrate source departments
    await loadOptions();
    const cats = Object.keys(state.options).sort();
    $("#srcDept").innerHTML = cats.map(c=>`<option value="${c}">${c}</option>`).join('');
    state.currentDept = cats[0] || null;
    renderSrcList();
    reflectSelCount();
  });

  /* ------------ OPTIONS LOADER (KISS flat) ------------ */
  async function loadOptions(){
    const txt = await fetch(CONFIG.OPTIONS_URL, {cache:'no-store'}).then(r=>r.text());
    let cat = null;
    txt.split(/\r?\n/).forEach(line=>{
      const s = line.trim(); if(!s || s.startsWith('#')) return;
      const hdr = s.match(/^\[([^\]]+)\]$/);
      if(hdr){ cat = hdr[1].trim(); state.options[cat] ??= []; return; }
      if(!cat) return;
      const parts = s.split('|').map(x=>x.trim());
      if(parts.length>=3){ const [code,,specific]=parts; if(code && specific) state.options[cat].push({code, text:specific}); }
    });
  }

  /* ------------ LEFT: SOURCE (department) LIST ------------ */
  function renderSrcList(){
    const dept = state.currentDept; const q = ($("#srcFilter").value||'').toLowerCase();
    const items = dept ? (state.options[dept] || []) : [];
    const filtered = items.filter(it => !q || it.code.toLowerCase().includes(q) || it.text.toLowerCase().includes(q));
    $("#srcList").innerHTML = filtered.length ? filtered.map(it=>{
      const line = semi(it.code, it.text);
      const checked = state.staged.has(line) ? 'checked' : '';
      return `<label class="item"><input type="checkbox" data-code="${it.code}" data-text="${it.text}" ${checked}> <strong>${it.code}</strong> — ${it.text}</label>`;
    }).join('') : `<div class="muted" style="padding:.5rem">No items match.</div>`;

    // bind checkboxes
    $("#srcList").querySelectorAll('input[type="checkbox"]').forEach(chk=>{
      chk.addEventListener('change', e=>{
        const line = semi(e.target.dataset.code, e.target.dataset.text);
        if(e.target.checked) state.staged.add(line); else state.staged.delete(line);
        reflectSelCount();
      });
    });
  }
  function reflectSelCount(){ $("#selCount").textContent = `${state.staged.size} selected`; }
  function flashSend(msg){ const n=$("#sendStatus"); n.textContent=msg; n.classList.remove('muted'); setTimeout(()=>{ n.textContent=''; n.classList.add('muted'); }, 2000); }

  /* ------------ RIGHT: ALL DEPOT SECTIONS STACK ------------ */
  function renderSectionsStack(){
    const host = $("#sectionsStack");
    host.innerHTML = CONFIG.DEPOT_SECTIONS.map(section => sectionCardMarkup(section)).join('');
    // bind per-section controls
    CONFIG.DEPOT_SECTIONS.forEach(section => bindSectionCard(section));
    // initial fill
    CONFIG.DEPOT_SECTIONS.forEach(section => updateSectionCard(section));
  }

  function sectionCardMarkup(section){
    const key = sectionKey(section);
    return `
      <div class="sectionCard" id="${key}">
        <h3>${section}</h3>
        <div class="grid2">
          <label>Notes (optional, appears first as <code>NOTE;</code>)
            <textarea data-note="${section}" rows="2" placeholder="One-liner notes for ${section}"></textarea>
          </label>
          <div class="actions" style="align-items:flex-end">
            <button data-copy="${section}" class="primary">Copy</button>
            <button data-clear="${section}">Clear items</button>
            <label class="muted"><input data-includehdr="${section}" type="checkbox" checked> Include header</label>
          </div>
        </div>
        <textarea data-out="${section}" rows="7" readonly></textarea>
      </div>
    `;
  }

  function bindSectionCard(section){
    const card = $("#"+sectionKey(section));
    card.querySelector(`[data-note="${section}"]`).addEventListener('input', e=>{
      ensure(section); state.sections[section].note = e.target.value.trim(); updateSectionCard(section);
    });
    card.querySelector(`[data-copy="${section}"]`).addEventListener('click', ()=>{
      const ta = card.querySelector(`[data-out="${section}"]`); ta.select(); document.execCommand('copy');
    });
    card.querySelector(`[data-clear="${section}"]`).addEventListener('click', ()=>{
      ensure(section); state.sections[section].ticks.clear(); updateSectionCard(section);
    });
    // include header checkbox affects only this card’s render
    card.querySelector(`[data-includehdr="${section}"]`).addEventListener('change', ()=>updateSectionCard(section));
  }

  function updateSectionCard(section){
    ensure(section);
    const card = $("#"+sectionKey(section));
    const ta = card.querySelector(`[data-out="${section}"]`);
    const includeHeader = card.querySelector(`[data-includehdr="${section}"]`).checked;
    const lines = [];
    if(includeHeader) lines.push(`[${section}]`);
    if(state.sections[section].note) lines.push(`NOTE; ${state.sections[section].note}`);
    const arr = [...state.sections[section].ticks];
    if($("#sortLines").checked) arr.sort((a,b)=>a.localeCompare(b));
    lines.push(...arr);
    ta.value = lines.join('\n');
  }

  function sectionKey(s){ return 'sec_' + s.toLowerCase().replace(/[^a-z0-9]+/g,'_'); }
})();