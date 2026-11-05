import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('js/device-self-test.js','utf8');
for(const id of ['selfTestDialog','selfTestMode','selfTestRun','selfTestStop','selfTestResults','selfTestSummary','selfTestCopy','selfTestExport']) assert.ok(html.includes(`id="${id}"`),`Missing ${id}`);
for(const s of ['imageBlob','testPdf(10,true)','testPdf(100)','lastReport','navigator.clipboard.writeText','URL.createObjectURL']) assert.ok(js.includes(s),`Missing ${s}`);
assert.ok(fs.readFileSync('sw.js','utf8').includes('device-self-test.js'));
console.log('Device Self-Test structural checks passed');
