/* Plain-text export utilities for Depot Notes (no URI encoding) */

window.SECTION_TITLES = window.SECTION_TITLES || {
  needs: 'Needs',
  safety: 'Safety & Compliance',
  system_characteristics: 'System Characteristics'
};
window.ORDERED_SECTIONS = window.ORDERED_SECTIONS || Object.keys(SECTION_TITLES);

window.STATE = window.STATE || { selected:{}, manualNotes:{} };

/** Build a section’s plain-text line: “a; b; c” */
function buildSectionPlainText(sectionKey){
  const picks = (STATE.selected[sectionKey] ?? []).slice();
  const manual = (STATE.manualNotes?.[sectionKey] ?? '').trim();
  if (manual) {
    manual.split('\n').map(s => s.trim()).filter(Boolean).forEach(s => picks.push(s));
  }
  const out = Array.from(new Set(
    picks.map(s =>
      s.replace(/\s+/g,' ')
       .replace(/%([0-9A-F]{2})/gi, (_,h)=>String.fromCharCode(parseInt(h,16)))
       .trim()
    ).filter(Boolean)
  )).join('; ');
  return out;
}

/** Copy one section to clipboard and show it in that section’s textarea */
async function copySectionToClipboard(sectionKey){
  const text = buildSectionPlainText(sectionKey);
  const ta = document.getElementById('copy_box_'+sectionKey);
  if (ta) ta.value = text;
  try { await navigator.clipboard.writeText(text); } catch {}
}

/** Copy all completed sections as “Title: a; b; c” on newline-delimited block */
function copyAllCompletedSections(){
  const keys = ORDERED_SECTIONS.filter(k => (STATE.selected[k]?.length || (STATE.manualNotes?.[k]||'').trim()));
  const block = keys.map(k => `${SECTION_TITLES[k]}: ${buildSectionPlainText(k)}`).join('\n');
  const ta = document.getElementById('copy_box_all');
  if (ta) ta.value = block;
  navigator.clipboard.writeText(block).catch(()=>{});
}

/** Route any option to any target section */
function addLineToSection(lineText, targetSectionKey){
  if (!STATE.selected[targetSectionKey]) STATE.selected[targetSectionKey] = [];
  STATE.selected[targetSectionKey].push(lineText);
}

window.buildSectionPlainText = buildSectionPlainText;
window.copySectionToClipboard = copySectionToClipboard;
window.copyAllCompletedSections = copyAllCompletedSections;
window.addLineToSection = addLineToSection;