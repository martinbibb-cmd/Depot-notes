(()=>{ // fully scoped — no globals leaked to v1
  const ROOT = document.getElementById('depotV2'); if(!ROOT) return;

  /* ===== CONFIG ===== */
  const CONFIG = {
    OPTIONS_URL: 'Options.txt',
    DEFAULT_SECTIONS: [
      'Customer Summary','Boiler','Flue','Condensate','Gas','Heating Circuit',
      'Cylinder','Controls','Electrical','WAH','Access & Parking','Asbestos',
      'Disposal','Making Good','Notes / Caveats'
    ],
    GPT_URL: '' // set via UI
  };

  /* ===== STATE ===== */
  const state = {
    viewMode:'simple',
    activeSection:null,
    sections:{},          // { [section]: {ticks:Set<string>, note:string} }
    optionsIndex:{},      // { [category]: [{code,text}] }
    sectionCategory:{},   // { [section]: 'category' }
  };

  /* ===== Utils ===== */
  const $=s=>ROOT.querySelector(s); const $$=s=>Array.from(ROOT.querySelectorAll(s));
  const semi=(c,t)=>`${c}; ${t}`;
  const ensure=s=>(state.sections[s]??={ticks:new Set(), note:''});
  const flash=(m,k='ok')=>{ const s=$('#status'); s.textContent=m; s.className=`small ${k}`; setTimeout(()=>{s.textContent=''; s.className='small muted';},2500); };

  /* ===== Boot ===== */
  window.addEventListener('DOMContentLoaded', async ()=>{
    wire(); populateSections(); setActive(CONFIG.DEFAULT_SECTIONS[0]);
    await loadOptionsTxt(CONFIG.OPTIONS_URL);
    hydrateAttachSelect($('#attachFromCategorySimple'));
    renderSimple(); renderPro(); updateCounts();
  });

  /* ===== Wiring ===== */
  function wire(){
    $$('input[name="viewMode"]').forEach(r=>r.addEventListener('change',e=>{state.viewMode=e.target.value; renderView();}));
    $('#sectionSelect').addEventListener('change',e=>setActive(e.target.value));

    // Simple
    $('#simpleNote').addEventListener('input',e=>{const s=state.activeSection; ensure(s); state.sections[s].note=e.target.value.trim();});
    $('#attachFromCategorySimple').addEventListener('change',e=>{$('#btnAttachSimple').disabled=!e.target.value;});
    $('#btnAttachSimple').addEventListener('click',()=>{const c=$('#attachFromCategorySimple').value; if(!c)return; attachCategoryToSection(c,state.activeSection); $('#attachFromCategorySimple').value=''; $('#btnAttachSimple').disabled=true; buildCopyForSection(state.activeSection);});
    $('#btnCopySection').addEventListener('click',()=>buildCopyForSection(state.activeSection));
    $('#btnSummariseSection').addEventListener('click',()=>summariseSection(state.activeSection));

    // Pro
    $('#proSearch').addEventListener('input',renderProList);
    $('#proCategory').addEventListener('change',renderProList);
    $('#btnAddVisible').addEventListener('click',()=>{const s=state.activeSection; ensure(s); $$('#proList .item').forEach(n=>state.sections[s].ticks.add(semi(n.dataset.code,n.dataset.text))); updateCounts(); buildCopyForSection(s);});
    $('#btnCopySectionPro').addEventListener('click',()=>buildCopyForSection(state.activeSection));
    $('#btnSummariseSectionPro').addEventListener('click',()=>summariseSection(state.activeSection));

    // Output
    $('#btnCopyToClipboard').addEventListener('click',()=>{ $('#copyOutput').select(); document.execCommand('copy'); flash('Copied','ok'); });

    // Whole job + CF URL
    $('#btnSummariseDepot').addEventListener('click',()=>summariseWholeJob(false));
    $('#btnSummariseCustomer').addEventListener('click',()=>summariseWholeJob(true));
    $('#gptUrl').addEventListener('change',e=>{CONFIG.GPT_URL=e.target.value.trim();});
  }

  /* ===== Sections ===== */
  function populateSections(){ $('#sectionSelect').innerHTML=CONFIG.DEFAULT_SECTIONS.map(s=>`<option>${s}</option>`).join(''); }
  function setActive(s){ state.activeSection=s; ensure(s); state.sectionCategory[s]??=s.toLowerCase().replace(/[^a-z0-9]+/g,'_'); renderSimple(); renderPro(); updateCounts(); }
  function renderView(){ const simple = state.viewMode==='simple'; $('#simplePane').classList.toggle('hidden',!simple); $('#proPane').classList.toggle('hidden',simple); }

  /* ===== Simple ===== */
  function bestCategoryForSection(s){
    const cats=new Set(Object.keys(state.optionsIndex));
    const direct=s.toLowerCase().replace(/[^a-z0-9]+/g,'_');
    const alias={wah:'working_at_heights',making_good:'making_good'};
    if(cats.has(direct)) return direct;
    if(alias[direct] && cats.has(alias[direct])) return alias[direct];
    return Object.keys(state.optionsIndex)[0]||direct;
  }
  function renderSimple(){
    renderView();
    const s=state.activeSection, cat=bestCategoryForSection(s), items=state.optionsIndex[cat]||[], chosen=state.sections[s]?.ticks??new Set();
    $('#simpleList').innerHTML=items.map(it=>{const id=`chk_${s}_${it.code}`; const ch=chosen.has(semi(it.code,it.text))?'checked':''; return `<label class="item"><input type="checkbox" id="${id}" data-code="${it.code}" data-text="${it.text}" ${ch}> ${it.code} – ${it.text}</label>`;}).join('') || `<div class="muted" style="padding:.5rem">No items in <strong>${cat}</strong>. Use “Attach”.</div>`;
    $$('#simpleList input[type="checkbox"]').forEach(chk=>chk.addEventListener('change',e=>{const {code,text}=e.target.dataset; const s=state.activeSection; ensure(s); const line=semi(code,text); if(e.target.checked) state.sections[s].ticks.add(line); else state.sections[s].ticks.delete(line); updateCounts();}));
    $('#simpleNote').value=state.sections[s]?.note??'';
  }

  /* ===== Pro ===== */
  function renderPro(){ const cats=Object.keys(state.optionsIndex).sort(); $('#proCategory').innerHTML=`<option value="">All categories</option>`+cats.map(c=>`<option value="${c}">${c}</option>`).join(''); renderProList(); }
  function renderProList(){
    const q=($('#proSearch').value||'').toLowerCase(), cat=$('#proCategory').value; const rows=[];
    for(const [c,arr] of Object.entries(state.optionsIndex)){ if(cat && c!==cat) continue; for(const it of arr) rows.push({category:c, ...it}); }
    const filtered=rows.filter(r=>!q || r.code.toLowerCase().includes(q) || r.text.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
    $('#proList').innerHTML=filtered.map(e=>`<div class="item" data-code="${e.code}" data-text="${e.text}"><button data-add="${e.code}" title="Add">+</button><div><div><strong>${e.code}</strong> — ${e.text}</div><div class="muted">${e.category}</div></div></div>`).join('') || `<div class="muted" style="padding:.5rem">No items match.</div>`;
    $$('#proList button[data-add]').forEach(b=>b.addEventListener('click',()=>{const n=b.closest('.item'); const s=state.activeSection; ensure(s); state.sections[s].ticks.add(semi(b.dataset.add,n.dataset.text)); updateCounts(); buildCopyForSection(s);}));
  }
  function attachCategoryToSection(cat,section){ ensure(section); (state.optionsIndex[cat]||[]).forEach(it=>state.sections[section].ticks.add(semi(it.code,it.text))); updateCounts(); }

  /* ===== Options.txt ===== */
  async function loadOptionsTxt(url){
    const txt=await fetch(url,{cache:'no-store'}).then(r=>r.text());
    const lines=txt.split(/\r?\n/); let cat=null;
    for(const raw of lines){
      const line=raw.trim(); if(!line || line.startsWith('#')) continue;
      const hdr=line.match(/^\[([^\]]+)\]$/); if(hdr){ cat=hdr[1].trim(); state.optionsIndex[cat]??=[]; continue; }
      if(!cat) continue;
      const parts=line.split('|').map(s=>s.trim()); if(parts.length>=3){ const [code,,specific]=parts; if(code && specific) state.optionsIndex[cat].push({code,text:specific}); }
    }
  }
  function hydrateAttachSelect(sel){ sel.innerHTML=`<option value="">+ Attach items from another category…</option>`+Object.keys(state.optionsIndex).sort().map(c=>`<option value="${c}">${c}</option>`).join(''); }

  /* ===== Copy ===== */
  function buildCopyForSection(section){
    ensure(section);
    const {ticks,note}=state.sections[section];
    const lines=[];
    if($('#includeHeaders').checked) lines.push(`[${section}]`);
    if(note) lines.push(`NOTE; ${note}`);
    const arr=Array.from(ticks); if($('#sortLines').checked) arr.sort((a,b)=>a.localeCompare(b));
    lines.push(...arr);
    $('#copyOutput').value=lines.join('\n');
  }
  function updateCounts(){ const s=state.activeSection; ensure(s); $('#simpleCount').textContent=`${state.sections[s].ticks.size} selected`; $('#proCount').textContent=`${state.sections[s].ticks.size} selected`; }

  /* ===== GPT (Cloudflare) ===== */
  const buildCustomerPrompt=pairs=>[
`SYSTEM: You are a UK heating adviser writing a short, clear customer summary.`,
`TONE: Friendly, factual, avoid jargon.`,
`LENGTH: 6–10 concise bullets.`,
`INCLUDE: boiler type/location, flue works, controls, water/pressure caveats, best-advice notes, access/WAH, making-good.`,
`EXCLUDE: internal codes; no prices.`,
`INPUT (semicolon items):`,
pairs.map(([id,d])=>{const items=Array.from(d.ticks).join('\n'); const note=d.note?`NOTE; ${d.note}`:''; return `[# ${id}]\n${note}\n${items}`;}).join('\n\n')
].join('\n');

  const buildDepotPrompt=pairs=>[
`SYSTEM: Generate DEPOT-READY notes (British Gas style) in terse semicolon lines.`,
`FORMAT: Keep semicolon items; group by [Section]; include engineer-critical caveats; no pricing.`,
`INPUT:`,
pairs.map(([id,d])=>{const items=Array.from(d.ticks).join('\n'); const note=d.note?`NOTE; ${d.note}`:''; return `[# ${id}]\n${note}\n${items}`;}).join('\n\n'),
`OUTPUT: Return only final notes, grouped by [Section], ready to paste.`
].join('\n');

  async function summariseSection(section){ ensure(section); const p=buildCustomerPrompt([[section,state.sections[section]]]); await sendToCFOrShow(p,`Summary – ${section}`); }
  async function summariseWholeJob(customerFacing){
    const pairs=Object.entries(state.sections).filter(([,v])=>v.note||v.ticks.size);
    if(!pairs.length){ flash('Nothing selected yet','note'); return; }
    const p=customerFacing?buildCustomerPrompt(pairs):buildDepotPrompt(pairs);
    await sendToCFOrShow(p, customerFacing?'Customer Summary':'Depot Summary');
  }
  async function sendToCFOrShow(prompt,label){
    const url=($('#gptUrl').value||CONFIG.GPT_URL||'').trim();
    if(!url){ $('#copyOutput').value=`# ${label}\n\n${prompt}`; flash('No CF URL set — prompt shown in copy box','note'); return; }
    try{
      const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt})});
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data=await res.json().catch(()=>({}));
      const text=data.text||data.output||data.result||(data.choices?.[0]?.message?.content)||'';
      $('#copyOutput').value=(text||`# ${label}\n\n${prompt}`).trim();
      flash(text?'Summary ready':'CF empty — showing prompt','ok');
    }catch(e){
      $('#copyOutput').value=`# ${label}\n\n${prompt}`;
      flash(`CF error — showing prompt (${e.message})`,'danger');
    }
  }
})(); // end scope