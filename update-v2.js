(()=>{ // fully scoped to #depotV2
  const ROOT = document.getElementById('depotV2'); if(!ROOT) return;
  const $ = s => ROOT.querySelector(s); const $$ = s => [...ROOT.querySelectorAll(s)];
  const semi = (c,t)=>`${c}; ${t}`;
  const norm = s => (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'_');
  const pretty = c => c.replace(/_/g,' ').replace(/\b[a-z]/g, m=>m.toUpperCase());

  // Cloudflare Worker endpoint
  const RECOMMEND_URL = 'https://survey-brain-api.martinbibb.workers.dev/api/recommend';

  // Sections (exact order)
  const DEPOT_SECTIONS = [
    'Needs','Working at heights','System characteristics','Components that require assistance',
    'Restrictions','Hazards','Delivery','Office','Boiler and controls','Flue',
    'Pipe work','Disruption','Customer actions','Special'
  ];

  // Category → Section (includes aliases)
  const MAP_CATEGORY_TO_SECTION = {
    needs:'Needs', working_at_heights:'Working at heights', system_characteristics:'System characteristics',
    components_that_require_assistance:'Components that require assistance', restrictions:'Restrictions', hazards:'Hazards',
    delivery:'Delivery', office:'Office', boiler_and_controls:'Boiler and controls',
    boiler:'Boiler and controls', controls:'Boiler and controls',
    flue:'Flue', pipe_work:'Pipe work', disruption:'Disruption', customer_actions:'Customer actions',
    special:'Special', wah:'Working at heights', making_good:'Special'
  };

  // State
  const state = { options:{}, staged:new Set(), currentDept:null, sections:{} };
  const ensure = s => (state.sections[s] ??= { ticks:new Set(), note:'' });

  // Tabs
  $$(".tab").forEach(btn=>{
    btn.addEventListener('click', ()=>{
      $$(".tab").forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const tab=btn.dataset.tab;
      $$(".pane").forEach(p=>p.classList.remove('active'));
      $("#pane-"+tab).classList.add('active');
    });
  });

  // Boot
  window.addEventListener('DOMContentLoaded', async ()=>{
    // ensure summary cards start hidden (no reserved height)
    const sc = $("#summaryCard"); if(sc) sc.style.display = 'none';
    const psc = $("#proSummaryCard"); if(psc) psc.style.display = 'none';

    $("#tgtSection").innerHTML = DEPOT_SECTIONS.map(s=>`<option>${s}</option>`).join('');
    DEPOT_SECTIONS.forEach(s=>ensure(s));
    renderSectionsStack();

    // Simple left controls
    $("#srcDept").addEventListener('change', onDeptChange);
    $("#srcFilter").addEventListener('input', ()=>{ renderSrcList(); reflectSelCount(); });
    $("#btnSelectAll").addEventListener('click', ()=>{
      $("#srcList").querySelectorAll('input[type=checkbox]').forEach(chk=>{
        const line=semi(chk.dataset.code,chk.dataset.text);
        chk.checked=true; state.staged.add(line);
      });
      reflectSelCount();
    });
    $("#btnClearVisible").addEventListener('click', ()=>{
      $("#srcList").querySelectorAll('input[type=checkbox]').forEach(chk=>{
        const line=semi(chk.dataset.code,chk.dataset.text);
        chk.checked=false; state.staged.delete(line);
      });
      reflectSelCount();
    });
    $("#btnSend").addEventListener('click', ()=>{
      const tgt=$("#tgtSection").value;
      if(!tgt || state.staged.size===0){ flashSend('Nothing to send'); return; }
      ensure(tgt);
      state.staged.forEach(l=>state.sections[tgt].ticks.add(l));
      state.staged.clear();
      renderSrcList(); reflectSelCount(); updateSectionCard(tgt);
      flashSend(`Sent to [${tgt}]`);
    });

    // GPT (Simple + Pro)
    $("#btnCustomerSummary").addEventListener('click', ()=>runSummary(false, true));
    $("#btnDepotSummary").addEventListener('click', ()=>runSummary(true,  true));
    $("#copySummary").addEventListener('click', ()=>{ $("#summaryOut").select(); document.execCommand('copy'); setSummaryStatus('Copied'); });
    $("#btnProCustomerSummary").addEventListener('click', ()=>runSummary(false, false));
    $("#btnProDepotSummary").addEventListener('click', ()=>runSummary(true,  false));
    $("#copyProSummary").addEventListener('click', ()=>{ $("#proSummaryOut").select(); document.execCommand('copy'); setProSummaryStatus('Copied'); });

    // Load options + depts
    await loadOptions();
    hydrateDeptDropdown();
    if($("#srcDept").options.length){ $("#srcDept").selectedIndex=0; onDeptChange(); }
  });

  // Options loader
  async function loadOptions(){
    const txt = await fetch('Options.txt',{cache:'no-store'}).then(r=>r.text());
    let cat=null;
    txt.split(/\r?\n/).forEach(line=>{
      const s=line.trim(); if(!s || s.startsWith('#')) return;
      const hdr=s.match(/^\[([^\]]+)\]$/);
      if(hdr){ cat=norm(hdr[1].trim()); state.options[cat] ??= []; return; }
      if(!cat) return;
      const parts=s.split('|').map(x=>x.trim());
      if(parts.length>=3){
        const [code,,specific]=parts;
        if(code && specific) state.options[cat].push({code,text:specific});
      }
    });
  }
  function hydrateDeptDropdown(){
    const cats=Object.keys(state.options);
    const mapped=[], unmapped=[];
    const secIndex=new Map(DEPOT_SECTIONS.map((s,i)=>[s,i]));
    for(const c of cats){
      const sec=MAP_CATEGORY_TO_SECTION[c];
      if(sec) mapped.push([c,sec]); else unmapped.push(c);
    }
    mapped.sort((a,b)=> (secIndex.get(a[1]) - secIndex.get(b[1])) || a[0].localeCompare(b[0]));
    unmapped.sort((a,b)=>a.localeCompare(b));
    const ordered=[...mapped.map(([c])=>c), ...unmapped];
    $("#srcDept").innerHTML = ordered.map(c=>`<option value="${c}">${pretty(c)}</option>`).join('');
  }

  // Source list
  function onDeptChange(){
    state.currentDept = $("#srcDept").value;
    state.staged.clear(); $("#srcFilter").value='';
    const mapped = MAP_CATEGORY_TO_SECTION[state.currentDept];
    if(mapped && DEPOT_SECTIONS.includes(mapped)) $("#tgtSection").value = mapped;
    else $("#tgtSection").selectedIndex=0;
    renderSrcList(); reflectSelCount();
  }
  function renderSrcList(){
    const dept=state.currentDept; const q=($("#srcFilter").value||'').toLowerCase();
    const items = dept ? (state.options[dept]||[]) : [];
    const filtered = items.filter(it=>!q || it.code.toLowerCase().includes(q) || it.text.toLowerCase().includes(q));
    $("#srcList").innerHTML = filtered.length ? filtered.map(it=>{
      const line=semi(it.code,it.text); const checked = state.staged.has(line)?'checked':'';
      return `<label class="item"><input type="checkbox" data-code="${it.code}" data-text="${it.text}" ${checked}> <strong>${it.code}</strong> — ${it.text}</label>`;
    }).join('') : `<div class="muted" style="padding:.5rem">No items match.</div>`;
    $("#srcList").querySelectorAll('input[type=checkbox]').forEach(chk=>{
      chk.addEventListener('change', e=>{
        const line=semi(e.target.dataset.code,e.target.dataset.text);
        if(e.target.checked) state.staged.add(line); else state.staged.delete(line);
        reflectSelCount();
      });
    });
  }
  function reflectSelCount(){ $("#selCount").textContent = `${state.staged.size} selected`; }
  function flashSend(msg){ const n=$("#sendStatus"); n.textContent=msg; n.classList.remove('muted'); setTimeout(()=>{ n.textContent=''; n.classList.add('muted'); }, 1600); }

  // Sections stack
  function renderSectionsStack(){
    const host=$("#sectionsStack");
    host.innerHTML = DEPOT_SECTIONS.map(s=>sectionCardMarkup(s)).join('');
    DEPOT_SECTIONS.forEach(s=>{ bindSectionCard(s); updateSectionCard(s); });
  }
  function sectionCardMarkup(section){
    const key = keyOf(section);
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
    const card=$("#"+keyOf(section));
    card.querySelector(`[data-note="${section}"]`).addEventListener('input', e=>{
      ensure(section); state.sections[section].note = e.target.value.trim();
      updateSectionCard(section);
    });
    card.querySelector(`[data-copy="${section}"]`).addEventListener('click', ()=>{
      const ta = card.querySelector(`[data-out="${section}"]`);
      ta.select(); document.execCommand('copy');
    });
    card.querySelector(`[data-clear="${section}"]`).addEventListener('click', ()=>{
      ensure(section); state.sections[section].ticks.clear();
      updateSectionCard(section);
    });
    card.querySelector(`[data-includehdr="${section}"]`).addEventListener('change', ()=>{
      updateSectionCard(section);
    });
  }
  function updateSectionCard(section){
    ensure(section);
    const card=$("#"+keyOf(section)); const ta=card.querySelector(`[data-out="${section}"]`);
    const includeHeader = card.querySelector(`[data-includehdr="${section}"]`).checked;
    const lines=[];
    if(includeHeader) lines.push(`[${section}]`);
    const note = state.sections[section].note; if(note) lines.push(`NOTE; ${note}`);
    const arr=[...state.sections[section].ticks];
    if($("#sortLines")?.checked) arr.sort((a,b)=>a.localeCompare(b));
    lines.push(...arr);
    ta.value = lines.join('\n');
  }
  const keyOf = s => 'sec_' + s.toLowerCase().replace(/[^a-z0-9]+/g,'_');

  // GPT
  function buildPairs(){ return Object.entries(state.sections).filter(([,v])=>v.note || v.ticks.size); }
  function promptCustomer(pairs){
    return [
      `SYSTEM: You are a UK heating adviser writing a short, clear customer summary.`,
      `TONE: Friendly, factual, avoid jargon.`,
      `LENGTH: 6–10 concise bullets.`,
      `INCLUDE: boiler/controls, flue, water/pressure caveats, access/WAH, restrictions & hazards, delivery/office if relevant, customer actions, special notes.`,
      `EXCLUDE: internal codes; no prices.`,
      `INPUT (semicolon items):`,
      pairs.map(([id,d])=>{
        const note = d.note ? `NOTE; ${d.note}\n` : '';
        return `[# ${id}]\n${note}${[...d.ticks].join('\n')}`;
      }).join('\n\n')
    ].join('\n');
  }
  function promptDepot(pairs){
    return [
      `SYSTEM: Generate DEPOT-READY notes (British Gas style) as terse semicolon lines.`,
      `FORMAT: Keep semicolon items; group by [Section]; include engineer-critical caveats; no pricing.`,
      `INPUT:`,
      pairs.map(([id,d])=>{
        const note = d.note ? `NOTE; ${d.note}\n` : '';
        return `[# ${id}]\n${note}${[...d.ticks].join('\n')}`;
      }).join('\n\n'),
      `OUTPUT: Return only final notes, grouped by [Section], ready to paste.`
    ].join('\n');
  }

  // Prefer in-page connector, else Cloudflare Worker
  async function recommend(prompt, mode='summary'){
    try{
      if (window.Recommendations?.request) {
        const t=await window.Recommendations.request(prompt);
        if(t) return String(t).trim();
      }
      if (window.Recommendations?.generate){
        const r=await window.Recommendations.generate({prompt,mode});
        const t=r?.text||r?.output||r?.result;
        if(t) return String(t).trim();
      }
      if (window.RecsConnector?.request){
        const r=await window.RecsConnector.request({prompt,mode});
        const t=r?.text||r?.output||r?.result;
        if(t) return String(t).trim();
      }
    }catch(_){/* fall through */}

    for(const body of [{notes:prompt,mode},{prompt,mode}]){
      try{
        const res = await fetch(RECOMMEND_URL, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(body)
        });
        const data = res.ok ? await res.json().catch(()=> ({})) : {};
        const text = data.text || data.output || data.result || (data.choices?.[0]?.message?.content);
        if(text) return String(text).trim();
      }catch(_){/* try next */}
    }
    return '';
  }

  async function runSummary(depotStyle, isSimplePane){
    const pairs = buildPairs();
    const out = isSimplePane ? $("#summaryOut") : $("#proSummaryOut");
    const card = isSimplePane ? $("#summaryCard") : $("#proSummaryCard");
    const setStatus = isSimplePane ? setSummaryStatus : setProSummaryStatus;

    const pasted = (!isSimplePane && $("#proPaste").value.trim()) || '';
    let prompt;
    if(pasted){
      prompt = depotStyle
        ? `SYSTEM: Convert the input into DEPOT-READY semicolon lines grouped by [Section]. INPUT:\n${pasted}`
        : `SYSTEM: Create a short, clear customer-friendly summary (6–10 bullets) from the input. INPUT:\n${pasted}`;
    }else{
      if(!pairs.length){ card.style.display='block'; out.value='(No items yet)'; setStatus(''); return; }
      prompt = depotStyle ? promptDepot(pairs) : promptCustomer(pairs);
    }

    card.style.display='block';
    const text = await recommend(prompt, depotStyle ? 'depot' : 'customer');
    if(text){ out.value=text; setStatus('Summary ready'); }
    else { out.value = `# ${depotStyle ? 'Depot' : 'Customer'} Summary (prompt)\n\n${prompt}`; setStatus('API returned no text — showing prompt.'); }
  }

  function setSummaryStatus(m){ const n=$("#summaryStatus"); n.textContent=m; n.classList.remove('muted'); setTimeout(()=>{ n.textContent=''; n.classList.add('muted'); }, 2500); }
  function setProSummaryStatus(m){ const n=$("#proSummaryStatus"); n.textContent=m; n.classList.remove('muted'); setTimeout(()=>{ n.textContent=''; n.classList.add('muted'); }, 2500); }
})();