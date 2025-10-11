/* Core data + plain-text copy logic for index.html */

window.SECTION_TITLES = {
  needs: 'Needs',
  safety: 'Safety & Compliance',
  system_characteristics: 'System Characteristics'
};

// Keep these three sections; add more if you like.
window.ORDERED_SECTIONS = ['needs','safety','system_characteristics'];

// Example option bank (safe to edit/expand)
window.OPTIONS = {
  needs: [
    'Better water pressure',
    'Faster hot water delivery',
    'More usable space',
    'Lower running costs',
    'Easier controls',
    'Quieter operation',
    'Future-ready system'
  ],
  safety: [
    'No hazards declared',
    'Ladder access required',
    'Scaffold required',
    'Electrical isolation present'
  ],
  system_characteristics: [
    'Combi',
    'System (with cylinder)',
    'Heat-only (regular)',
    'Open-vented',
    'Sealed (expansion vessel)'
  ]
};

// Selected state + manual notes
window.STATE = { selected:{}, manualNotes:{} };
ORDERED_SECTIONS.forEach(k=>{ STATE.selected[k]=[]; STATE.manualNotes[k]=''; });

// toggler
window.togglePick = function(sectionKey, line, checked){
  const arr = STATE.selected[sectionKey] || (STATE.selected[sectionKey]=[]);
  const i = arr.indexOf(line);
  if (checked && i<0) arr.push(line);
  if (!checked && i>=0) arr.splice(i,1);
};

// route any line to any section
window.addLineToSection = function(line, target){
  const arr = STATE.selected[target] || (STATE.selected[target]=[]);
  if (!arr.includes(line)) arr.push(line);
};

// ======== PLAIN-TEXT COPY LOGIC ========
function decodePct(s){ return String(s).replace(/%([0-9A-F]{2})/gi,(_,h)=>String.fromCharCode(parseInt(h,16))); }
function joinPlain(lines, notes){
  const arr = [...(lines||[])];
  if (notes && notes.trim()){ notes.split('\n').map(s=>s.trim()).filter(Boolean).forEach(s=>arr.push(s)); }
  return Array.from(new Set(arr.map(s=>decodePct(s).replace(/\s+/g,' ').trim()).filter(Boolean))).join('; ');
}

window.buildSectionPlainText = function(sectionKey){
  const sel = (STATE.selected[sectionKey]||[]);
  const notes = (STATE.manualNotes[sectionKey]||'');
  return joinPlain(sel, notes);
};

window.copySectionToClipboard = async function(sectionKey){
  const text = buildSectionPlainText(sectionKey);
  const ta = document.getElementById('copy_box_section') || document.getElementById('copy_box_'+sectionKey);
  if (ta) ta.value = text; // textarea.value => plain text
  try { await navigator.clipboard.writeText(text); } catch {}
};

window.copyAllCompletedSections = function(){
  const keys = ORDERED_SECTIONS.filter(k => (STATE.selected[k]?.length || (STATE.manualNotes[k]||'').trim()));
  const block = keys.map(k => `${SECTION_TITLES[k]}: ${buildSectionPlainText(k)}`).join('\n');
  const ta = document.getElementById('copy_box_all');
  if (ta) ta.value = block;
  navigator.clipboard.writeText(block).catch(()=>{});
};