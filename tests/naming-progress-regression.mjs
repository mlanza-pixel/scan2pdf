import assert from 'node:assert/strict';
import {documentName,pdfFilename} from '../js/filenames.js';
import {ocrProgressState} from '../js/ocr-progress.js';
assert.equal(pdfFilename('test.pdf.pdf'),'test.pdf');assert.equal(documentName('CON.pdf'),'_CON');assert.equal(documentName('NUL.txt'),'_NUL.txt');assert.equal(documentName('test<>:"/\\|?*.pdf'),'test_________');assert.equal(documentName('  ... '),'Untitled document');assert.equal([...documentName('😀'.repeat(130))].length,120);
assert.equal(ocrProgressState({status:'loading language traineddata',progress:.9},0,3).percent,0);assert(ocrProgressState({status:'loading language traineddata',progress:.9},0,3).indeterminate);
assert.equal(ocrProgressState({status:'recognizing text',progress:.5},1,3).percent,50);
assert.equal(ocrProgressState({status:'recognizing text',progress:2},2,3).percent,100);
console.log('PASS: portable names, extension handling, reserved names, Unicode limits, loading-vs-recognition progress');
