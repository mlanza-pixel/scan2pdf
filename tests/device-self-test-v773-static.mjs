import fs from 'node:fs';import assert from 'node:assert/strict';
const s=fs.readFileSync('js/device-self-test.js','utf8');const h=fs.readFileSync('index.html','utf8');
for(const needle of ['testOcrRepeated','testOcr','captureAllWorkspaces','image-backed PDF','on-device-self-test-3']) assert(s.includes(needle),needle);
for(const needle of ['selfTestCapture','selfTestScreenshots','7.73']) assert(h.includes(needle),needle);
console.log('v7.73 diagnostics structural checks passed');
