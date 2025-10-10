(()=>{ // fully scoped to #depotV2
  const ROOT = document.getElementById('depotV2'); if(!ROOT) return;
  const $ = s => ROOT.querySelector(s); const $$ = s => [...ROOT.querySelectorAll(s)];
  const semi = (c,t)=>`${c}; ${t}`;

  /* ------------ CONFIG ------------ */
  const CONFIG = {
    OPTIONS_URL: 'Options.txt',
    SECTIONS: [
      'Customer Summary','Boiler','Flue','Condensate','Gas','Heating Circuit',
      'Cylinder','Controls','Electrical','WAH','Access & Parking','Asbestos',
      'Disposal','Making Good','Notes / Caveats'
    ]
  };

  /* ------------ STATE ------------ */
  const state = {
    active: null,
    sections: {},        // { [section]: { ticks:Set<string>, note:string } }
    options: {},         // { [category]: [{code,text}] }
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
    // Populate sections
    $("#s_section").innerHTML = CONFIG.SECTIONS.map(s=>`<option>${s}</option>`).join('');
    state.active = CONFIG.SECTIONS[0]; ensure(state.active);

    // Wire simple events
    $("#s_section").addEventListener('change', e => { state.active = e.target.value; ensure(state.active); renderSimpleList(); reflectNote(); updateCounts(); buildOut(); });
    $("#s_note").addEventListener('input', e => { ensure(state.active); state.sections[state.active].note = e.target.value.trim(); buildOut(); });
    $("#s_attach").addEventListener('change', e => { $("#s_attach_btn").disabled = !e.target.value; });
    $("#s_attach_btn").addEventListener('click', ()=>{
      const cat = $("#s_attach").value; if(!cat) return;
      (state.options[cat]||[]).forEach(it => state.sections[state.active].ticks.add(semi(it.code, it.text)));
      $("#s_attach").value=''; $("#s_attach_btn").disabled=true;
      renderSimpleList(); updateCounts(); buildOut();
    });
    $("#s_copy").addEventListener('click', buildOut);
    $("#copy_clip").addEventListener('click', ()=>{ $("#s_out").select(); document.execCommand('copy'); setStatus('Copied'); });

    $("#sum_depot").addEventListener('click', ()=>summarise(false));
    $("#sum_customer").addEventListener('click', ()=>summarise(true));

    // Load options and hydrate selectors
    await loadOptions();
    hydrateAttachSelect();
    renderSimpleList(); reflectNote(); buildOut();
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
      if(parts.length>=3){ const [code,,specific] = parts; if(code && specific) state.options[cat].push({code, text:specific}); }
    });
  }
  function hydrateAttachSelect(){
    $("#s_attach").innerHTML = `<option value="">+ Attach items from another category…</option>` +
      Object.keys(state.options).sort().map(c=>`<option value="${c}">${c}</option>`).join('');
  }

  /* ------------ SIMPLE LIST (quote-tool style) ------------ */
  function bestCategoryForSection(section){
    const cats = new Set(Object.keys(state.options));
    const direct = section.toLowerCase().replace(/[^a-z0-9]+/g,'_');
    const alias = { wah:'working_at_heights', making_good:'making_good' };
    if(cats.has(direct)) return direct;
    if(alias[direct] && cats.has(alias[direct])) return alias[direct];
    return Object.keys(state.options)[0] || direct;
  }

  function renderSimpleList(){
    const section = state.active; ensure(section);
    const cat = bestCategoryForSection(section);
    const items = state.options[cat] || [];
    const chosen = state.sections[section].ticks;

    $("#s_list").innerHTML = items.length
      ? items.map(it=>{
          const id = `s_${section}_${it.code}`;
          const checked = chosen.has(semi(it.code,it.text)) ? 'checked' : '';
          return `<label class="item"><input type="checkbox" id="${id}" data-code="${it.code}" data-text="${it.text}" ${checked}> ${it.code} — ${it.text}</label>`;
        }).join('')
      : `<div class="muted" style="padding:.5rem">No items in <strong>${cat}</strong>. Use “Attach”.</div>`;

    // Bind ticks
    $("#s_list").querySelectorAll('input[type="checkbox"]').forEach(chk=>{
      chk.addEventListener('change', e=>{
        const {code, text} = e.target.dataset;
        const line = semi(code, text);
        if(e.target.checked) chosen.add(line); else chosen.delete(line);
        updateCounts(); buildOut();
      });
    });
    updateCounts();
  }

  function reflectNote(){ $("#s_note").value = state.sections[state.active]?.note ?? ''; }

  function updateCounts(){ $("#s_count").textContent = `${state.sections[state.active].ticks.size} selected`; }

  /* ------------ COPY OUTPUT ------------ */
  function buildOut(){
    const s = state.active; ensure(s);
    const lines = [];
    if($("#s_headers").checked) lines.push(`[${s}]`);
    if(state.sections[s].note) lines.push(`NOTE; ${state.sections[s].note}`);
    const arr = [...state.sections[s].ticks];
    if($("#s_sort").checked) arr.sort((a,b)=>a.localeCompare(b));
    lines.push(...arr);
    $("#s_out").value = lines.join('\n');
  }

  /* ------------ SUMMARIES (optional CF Worker) ------------ */
  function buildPairs(){ return Object.entries(state.sections).filter(([,v])=>v.note || v.ticks.size); }
  function customerPrompt(pairs){
    return [
      `SYSTEM: You are a UK heating adviser writing a short, clear customer summary.`,
      `TONE: Friendly, factual, avoid jargon.`,
      `LENGTH: 6–10 concise bullets.`,
      `INCLUDE: boiler type/location, flue works, controls, water/pressure caveats, best-advice notes, access/WAH, making-good.`,
      `EXCLUDE: internal codes; no prices.`,
      `INPUT (semicolon items):`,
      pairs.map(([id,d])=>{
        const note = d.note ? `NOTE; ${d.note}\n` : '';
        return `[# ${id}]\n${note}${[...d.ticks].join('\n')}`;
      }).join('\n\n')
    ].join('\n');
  }
  function depotPrompt(pairs){
    return [
      `SYSTEM: Generate DEPOT-READY notes (British Gas style) in terse semicolon lines.`,
      `FORMAT: Keep semicolon items; group by [Section]; include engineer-critical caveats; no pricing.`,
      `INPUT:`,
      pairs.map(([id,d])=>{
        const note = d.note ? `NOTE; ${d.note}\n` : '';
        return `[# ${id}]\n${note}${[...d.ticks].join('\n')}`;
      }).join('\n\n'),
      `OUTPUT: Return only final notes, grouped by [Section], ready to paste.`
    ].join('\n');
  }

  async function summarise(customer){
    const pairs = buildPairs();
    if(!pairs.length){ setStatus('Nothing selected yet'); return; }
    const url = ($("#cf_url").value || '').trim();
    const prompt = customer ? customerPrompt(pairs) : depotPrompt(pairs);

    if(!url){
      $("#s_out").value = `# ${customer ? 'Customer Summary' : 'Depot Summary'}\n\n${prompt}`;
      setStatus('No CF URL set — showing prompt'); return;
    }
    try{
      const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prompt }) });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(()=>({}));
      const text = data.text || data.output || data.result || (data.choices?.[0]?.message?.content) || '';
      $("#s_out").value = (text || `# Summary\n\n${prompt}`).trim();
      setStatus(text ? 'Summary ready' : 'Empty response — prompt shown');
    }catch(err){
      $("#s_out").value = `# ${customer ? 'Customer Summary' : 'Depot Summary'}\n\n${prompt}`;
      setStatus(`CF error — prompt shown (${err.message})`);
    }
  }

  function setStatus(msg){ const n=$("#s_status"); n.textContent=msg; n.classList.remove('muted'); setTimeout(()=>{ n.textContent=''; n.classList.add('muted'); }, 2500); }
})();