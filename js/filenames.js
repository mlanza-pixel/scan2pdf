export function documentName(value,fallback='Untitled document') {
  const clean=x=>String(x??'').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'_').trim().replace(/[.\s]+$/g,'').replace(/(?:\.pdf)+$/gi,'').replace(/[.\s]+$/g,'');
  let name=clean(value)||clean(fallback)||'Untitled document';
  if(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name))name='_'+name;
  return [...name].slice(0,120).join('').replace(/[.\s]+$/g,'')||'Untitled document';
}
export const pdfFilename=value=>`${documentName(value)}.pdf`;
