// v7.7 accessible opt-in interaction audio; off by default.
const key='docuscan-sound-mode';let mode=localStorage.getItem(key)||'off';let ctx;
const control=document.getElementById('btnSoundMode');
function label(){if(control){control.textContent='Sound: '+(mode==='off'?'Off':mode==='buttons'?'Buttons':'Buttons + typing');control.setAttribute('aria-label',control.textContent)}}
function tone(){try{ctx??=new (window.AudioContext||window.webkitAudioContext)();const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=690;g.gain.setValueAtTime(0.018,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.028);o.connect(g).connect(ctx.destination);o.start();o.stop(ctx.currentTime+0.03)}catch{}}
control?.addEventListener('click',()=>{mode=mode==='off'?'buttons':mode==='buttons'?'typing':'off';localStorage.setItem(key,mode);label();if(mode!=='off')tone()});
document.addEventListener('click',e=>{if(mode!=='off'&&e.target.closest('button,a,[role="button"],summary')&&!e.target.closest('#btnSoundMode'))tone()},true);
document.addEventListener('keydown',e=>{if(mode!=='typing'||e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;const el=e.target;if(el.matches('input,textarea')&&el.type!=='password'&&el.type!=='email'&&el.type!=='tel'&&e.key.length===1)tone()},true);label();
