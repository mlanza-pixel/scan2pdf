import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../../js/help-system.js',import.meta.url),'utf8');
const data=JSON.parse(fs.readFileSync(new URL('../../docs/Tour-Steps-v7.7.json',import.meta.url)));
let count=0;
for(const [page,steps] of Object.entries(data)){
 assert.ok(js.includes(`${page}: {`),`missing ${page} tour`);
 for(const [ws,selector,title,body] of steps){
  assert.equal(ws,page);assert.ok(js.includes(title),`missing title ${title}`);
  if(selector){const id=selector.match(/^#([\w-]+)/);if(id)assert.ok(html.includes(`id="${id[1]}"`),`missing ${selector}`);
   const group=selector.match(/data-group="([\w-]+)"/);if(group)assert.ok(html.includes(`data-group="${group[1]}"`),`missing group ${selector}`);}
  count++;
 }
}
for(const group of ['content','extract','pages','properties','combine','batch'])assert.ok(html.includes(`data-group="${group}"`));
assert.ok(js.includes('data-wt="back"')&&js.includes('data-wt="next"')&&js.includes('data-wt="skip"'));
console.log(`PASS: ${count} tour steps, six categories, Back/Next/Skip contract`);
