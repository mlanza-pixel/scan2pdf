const commonWords = new Set('a an and are at about be by can could did do does find for from give has have how i in is it me of on or please show tell that the this to was were what when where which who will with would you pdf document'.split(' '));

function terms(text) {
  return text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

export async function indexPdfPassages(pdf, cancelled = () => false) {
  const passages = [];
  for (let page = 1; page <= pdf.numPages && !cancelled(); page++) {
    const content = await (await pdf.getPage(page)).getTextContent();
    const words = content.items.map(item => item.str || '').join(' ').match(/\S+/g) || [];
    for (let offset = 0; offset < words.length; offset += 40) {
      const text = words.slice(offset, offset + 55).join(' ');
      passages.push({ page, text, words: new Set(terms(text)) });
      if (offset + 55 >= words.length) break;
    }
  }
  return passages;
}

export function findPdfPassages(passages, question) {
  const query = [...new Set(terms(question).filter(word => !commonWords.has(word)))];
  if (!query.length) return [];
  const minimum = Math.ceil(query.length / 2);
  const ranked = passages.map(passage => ({
    passage, score: query.filter(word => passage.words.has(word)).length,
  })).filter(hit => hit.score >= minimum).sort((a, b) => b.score - a.score);
  const pages = new Set();
  const hits = [];
  for (const { passage } of ranked) {
    if (pages.has(passage.page)) continue;
    pages.add(passage.page);
    hits.push(passage);
    if (hits.length === 3) break;
  }
  return hits;
}
