/* Shared logic for index-v2.html (plain-text copy only) */

window.SECTION_TITLES = {
  needs: 'Needs',
  safety: 'Safety & Compliance',
  system_characteristics: 'System Characteristics'
};
window.ORDERED_SECTIONS = ['needs','safety','system_characteristics'];
window.OPTIONS = {
  needs: [
    'Better water pressure','Faster hot water delivery','More usable space',
    'Lower running costs','Easier controls','Quieter operation','Future-ready system'
  ],
  safety: ['No hazards declared','Ladder access required','Scaffold required','Electrical isolation present'],
  system_characteristics: ['Combi','System (with cylinder)','Heat-only (regular)','Open-vented','Sealed (expansion vessel)']
};

window.STATE = { selected:{}, manualNotes:{} };
ORDERED_SECTIONS.forEach(k=>{ STATE.selected[k]=[]; STATE.manualNotes[k]=''; });

window.togglePick = function(k, line, checked){
  const arr = STATE.selected[k]||(STATE.selected[k]=[]);
  const i = arr.indexOf(line);
  if (checked && i<0) arr.push(line);
  if (!checked && i>=0) arr.splice(i,1);
};

function decodePct(s){ return String(s).replace(/%([0-9A-F]{2})/gi,(_,h)=>String.fromCharCode(parseInt(h,16))); }
function joinPlain(lines, notes){
  const arr = [...(lines||[])];
  if (notes && notes.trim()) notes.split('\n').map(s=>s.trim()).filter(Boolean).forEach(s=>arr.push(s));
  return Array.from(new Set(arr.map(s=>decodePct(s).replace(/\s+/g,' ').trim()).filter(Boolean))).join('; ');
}

window.buildSectionPlainText = function(sectionKey){
  return joinPlain(STATE.selected[sectionKey]||[], STATE.manualNotes[sectionKey]||'');
};
window.copySectionToClipboard = async function(sectionKey){
  const text = buildSectionPlainText(sectionKey);
  const ta = document.getElementById('copy_box_section') || document.getElementById('copy_box_'+sectionKey);
  if (ta) ta.value = text;
  try { await navigator.clipboard.writeText(text); } catch {}
};
window.copyAllCompletedSections = function(){
  const keys = ORDERED_SECTIONS.filter(k => (STATE.selected[k]?.length || (STATE.manualNotes[k]||'').trim()));
  const block = keys.map(k => `${SECTION_TITLES[k]}: ${buildSectionPlainText(k)}`).join('\n');
  const ta = document.getElementById('copy_box_all');
  if (ta) ta.value = block;
  navigator.clipboard.writeText(block).catch(()=>{});
};
window.currentKey = () => (document.getElementById('sec')?.value) || ORDERED_SECTIONS[0];