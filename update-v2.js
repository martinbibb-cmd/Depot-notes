(()=>{ // fully scoped to #depotV2
  const ROOT = document.getElementById('depotV2'); if(!ROOT) return;
  const $ = s => ROOT.querySelector(s); const $$ = s => [...ROOT.querySelectorAll(s)];
  const semi = (c,t)=>`${c}; ${t}`;

  /* ------------ CONFIG ------------ */
  // Exact Depot section order (right-hand stack & target dropdown)
  const DEPOT_SECTIONS = [
    'Needs',
    'Working at heights',
    'System characteristics',
    'Components that require assistance',
    'Restrictions',
    'Hazards',
    'Delivery',
    'Office',
    'Boiler and controls',
    'Flue',
    'Pipe work',
    'Disruption',
    'Customer actions',
    'Special'
  ];

  // Map Options.txt categories -> default Depot section
  // (kept strict to your wording; add aliases if you have alternates in Options.txt)
  const MAP_CATEGORY_TO_SECTION = {
    // core categories
    needs: 'Needs',
    working_at_heights: 'Working at heights',
    system_characteristics: 'System characteristics',
    components_that_require_assistance: 'Components that require assistance',
    restrictions: 'Restrictions',
    hazards: 'Hazards',
    delivery: 'Delivery',
    office: 'Office',
    boiler_and_controls: 'Boiler and controls',
    flue: 'Flue',
    pipe_work: 'Pipe work',
    disruption: 'Disruption',
    customer_actions: 'Customer actions',
    special: 'Special',

    // common aliases (safe extras; remove if not needed)
    boiler: 'Boiler and controls',
    controls: 'Boiler and controls',
    wah: 'Working at heights',
    making_good: 'Special' // if you have a [making_good] bucket and want it in Special
  };

  // Normalize a category token from Options.txt -> lookup key above
  const norm = s => (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'_');

  /* ------------ STATE ------------ */
  const state = {
    options: {},             // { [category]: [{code,text}] }
    staged: new Set(),       // selected items in current source list (strings "CODE; text")
    currentDept: null,       // current Options.txt category
    sections: {}             // { [section]: { ticks:Set<string>, note:string } }
  };
  const ensure = s => (state.sections[s] ??= { ticks:new Set(), note:'' });

  /* ------------ TABS (Simple / Pro) ------------ */
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
    // Target depot sections dropdown in your exact order
    $("#tgtSection").innerHTML = DEPOT_SECTIONS.map(s=>`<option>${s}</option>`).join('');
    // Create section cards in your exact order
    DEPOT_SECTIONS.forEach(s => ensure(s));
    renderSectionsStack();

    // Wire left-hand controls
    $("#srcDept").addEventListener('change', onDeptChange);
    $("#srcFilter").addEventListener('input', ()=>{ renderSrcList(); reflectSelCount(); });

    $("#btnSelectAll").addEventListener('click', ()=>{ // select all visible
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

    // Load Options.txt and hydrate departments in stable order
    await loadOptions();
    hydrateDeptDropdown();           // orders by DEPOT_SECTIONS via mapping, then anything unmapped alphabetically
    // Set initial dept and default target based on mapping
    if($("#srcDept").options.length){
      $("#srcDept").selectedIndex = 0;
      onDeptChange();
    }
  });

  /* ------------ OPTIONS LOADER (KISS flat) ------------ */
  async function loadOptions(){
    const txt = await fetch('Options.txt', {cache:'no-store'}).then(r=>r.text());
    let cat = null;
    txt.split(/\r?\n/).forEach(line=>{
      const s = line.trim(); if(!s || s.startsWith('#')) return;
      const hdr = s.match(/^\[([^\]]+)\]$/);
      if(hdr){ cat = norm(hdr[1].trim()); state.options[cat] ??= []; return; }
      if(!cat) return;
      const parts = s.split('|').map(x=>x.trim());
      if(parts.length>=3){ const [code,,specific]=parts; if(code && specific) state.options[cat].push({code, text:specific}); }
    });
  }

  /* ------------ LEFT: DEPT DROPDOWN + SOURCE LIST ------------ */
  function hydrateDeptDropdown(){
    const cats = Object.keys(state.options);

    // Group cats by mapped section to control order: all cats whose map exists follow the section order; unmapped go after (alpha)
    const mapped = [];
    const unmapped = [];
    for(const c of cats){
      const sec = MAP_CATEGORY_TO_SECTION[c];
      if(sec) mapped.push([c, sec]);
      else unmapped.push(c);
    }

    // Sort mapped by the section order index, then within each section keep original order
    const secIndex = new Map(DEPOT_SECTIONS.map((s,i)=>[s,i]));
    mapped.sort((a,b)=> (secIndex.get(a[1]) - secIndex.get(b[1])) || a[0].localeCompare(b[0]));

    // Sort unmapped alphabetically at the end
    unmapped.sort((a,b)=>a.localeCompare(b));

    const orderedCats = [...mapped.map(([c])=>c), ...unmapped];

    $("#srcDept").innerHTML = orderedCats.map(c=>{
      const label = prettifyCat(c);
      return `<option value="${c}">${label}</option>`;
    }).join('');
  }

  function prettifyCat(c){
    // convert snake_case to Title Case for display
    return c.replace(/_/g,' ').replace(/\b[a-z]/g, ch=>ch.toUpperCase());
  }

  function onDeptChange(){
    state.currentDept = $("#srcDept").value;
    state.staged.clear();
    $("#srcFilter").value = '';
    // Auto-pick default target using the mapping (falls back to same as before)
    const mapped = MAP_CATEGORY_TO_SECTION[state.currentDept];
    if(mapped && DEPOT_SECTIONS.includes(mapped)){
      $("#tgtSection").value = mapped;
    }else{
      // default to first section if mapping is missing
      $("#tgtSection").selectedIndex = 0;
    }
    renderSrcList(); reflectSelCount();
  }

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
  function flashSend(msg){ const n=$("#sendStatus"); n.textContent=msg; n.classList.remove('muted'); setTimeout(()=>{ n.textContent=''; n.classList.add('muted'); }, 1600); }

  /* ------------ RIGHT: ALL DEPOT SECTIONS STACK ------------ */
  function renderSectionsStack(){
    const host = $("#sectionsStack");
    host.innerHTML = DEPOT_SECTIONS.map(section => sectionCardMarkup(section)).join('');
    // bind per-section controls + initial render
    DEPOT_SECTIONS.forEach(section => { bindSectionCard(section); updateSectionCard(section); });
  }

  function sectionCardMarkup(section){
    const key = sectionKey(section);
    return `
      <div class="sectionCard" id="${key}">
        <h3>${section}</h3>
        <div class="grid2">
          <label>Notes (optional; appears first as <code>NOTE;</code>)
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
    card.querySelector(`[data-includehdr="${section}"]`).addEventListener('change', ()=>updateSectionCard(section));
  }

  function updateSectionCard(section){
    ensure(section);
    const card = $("#"+sectionKey(section));
    const ta = card.querySelector(`[data-out="${section}"]`);
    const includeHeader = card.querySelector(`[data-includehdr="${section}"]`).checked;
    const lines = [];
    if(includeHeader) lines.push(`[${section}]`);
    const note = state.sections[section].note; if(note) lines.push(`NOTE; ${note}`);
    const arr = [...state.sections[section].ticks];
    // Sort globally if the top toggle is ticked
    if($("#sortLines")?.checked) arr.sort((a,b)=>a.localeCompare(b));
    lines.push(...arr);
    ta.value = lines.join('\n');
  }

  function sectionKey(s){ return 'sec_' + s.toLowerCase().replace(/[^a-z0-9]+/g,'_'); }
})();