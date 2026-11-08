export function ocrProgressState(message={},pageIndex=0,pageCount=1) {
  const raw=String(message.status||'Preparing scan');const recognizing=/recognizing/i.test(raw);
  const stage=recognizing?'Recognizing text':/language|traineddata/i.test(raw)?'Loading language model':/initializ/i.test(raw)?'Preparing OCR':/core/i.test(raw)?'Loading OCR components':/engine|worker|tesseract/i.test(raw)?'Loading OCR engine':raw;
  const progress=Number.isFinite(message.progress)?Math.min(1,Math.max(0,message.progress)):0;
  const percent=Math.round((pageIndex+(recognizing?progress:0))/Math.max(1,pageCount)*100);
  return {label:`${stage}… · page ${pageIndex+1} of ${Math.max(1,pageCount)}${recognizing?` · ${percent}% complete`:''}`,percent,indeterminate:!recognizing};
}
export function updateOcrProgress(status,wrap,bar,message,pageIndex,pageCount) {
  const s=ocrProgressState(message,pageIndex,pageCount);
  if(status){status.textContent=s.label;status.setAttribute('role','status');status.setAttribute('aria-live','polite');}
  if(wrap){wrap.style.display='block';wrap.setAttribute('role','progressbar');wrap.setAttribute('aria-label','OCR progress');wrap.setAttribute('aria-valuemin','0');wrap.setAttribute('aria-valuemax','100');wrap.setAttribute('aria-valuetext',s.label);wrap.classList.toggle('is-loading',s.indeterminate);if(s.indeterminate)wrap.removeAttribute('aria-valuenow');else wrap.setAttribute('aria-valuenow',String(s.percent));}
  if(bar)bar.style.width=(s.indeterminate?35:s.percent)+'%';
}
