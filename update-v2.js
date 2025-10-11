/* v2: same behaviour, split for A/B pages */

window.SECTION_TITLES = {
  needs: 'Needs',
  safety: 'Safety & Compliance',
  system_characteristics: 'System Characteristics'
};
window.ORDERED_SECTIONS = ['needs','safety','system_characteristics'];

window.STATE = {
  selected: { needs: [], safety: [], system_characteristics: [] },
  manualNotes: { needs: '', safety: '', system_characteristics: '' }
};

function buildSectionPlainText(sectionKey){
  const picks = (STATE.selected[sectionKey] ?? []).slice();
  const manual = (STATE.manualNotes?.[sectionKey] ?? '').trim();
  if (manual) manual.split('\n').map(s=>s.trim()).filter(Boolean).forEach(s=>picks.push(s));

  return Array.from(new Set(
    picks.map(s =>
      s.replace(/\s+/g,' ')
       .replace(/%([0-9A-F]{2})/gi, (_,h)=>String.fromCharCode(parseInt(h,16)))
       .trim()
    ).filter(Boolean)
  )).join('; ');
}

async function copySectionToClipboard(sectionKey){
  const text = buildSectionPlainText(sectionKey);
  const ta = document.getElementById('copy_box_'+sectionKey);
  if (ta) ta.value = text;
  try { await navigator.clipboard.writeText(text); } catch {}
}

function copyAllCompletedSections(){
  const keys = ORDERED_SECTIONS.filter(k => (STATE.selected[k]?.length || (STATE.manualNotes?.[k]||'').trim()));
  const block = keys.map(k => `${SECTION_TITLES[k]}: ${buildSectionPlainText(k)}`).join('\n');
  const ta = document.getElementById('copy_box_all');
  if (ta) ta.value = block;
  navigator.clipboard.writeText(block).catch(()=>{});
}

function addLineToSection(lineText, targetSectionKey){
  if (!STATE.selected[targetSectionKey]) STATE.selected[targetSectionKey] = [];
  STATE.selected[targetSectionKey].push(lineText);
}

window.buildSectionPlainText = buildSectionPlainText;
window.copySectionToClipboard = copySectionToClipboard;
window.copyAllCompletedSections = copyAllCompletedSections;
window.addLineToSection = addLineToSection;