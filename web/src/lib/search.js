// BM25 retrieval over harvested PSI investigation text (runs in the browser).
const STOP = new Set('the a an of and or to in on for with is are was were be by as at from that this it its into what how why which can do does we our their than then there these those will would should about under over'.split(' '))
function tok(s) {
  const tf = {}; let len = 0
  for (const w of String(s || '').toLowerCase().match(/[a-z0-9\-]+/g) || []) { if (STOP.has(w) || w.length < 2) continue; tf[w] = (tf[w] || 0) + 1; len++ }
  return { tf, len }
}
export function makeSearch(invs) {
  const docs = invs.map(i => ({ id: i.accession, ...tok([i.acronym, i.title, i.subArea, i.objective, i.approach, i.hypothesis, i.impacts, i.hardware, i.fuels.join(' '), i.fuelClasses.join(' '), i.pillars.join(' ')].join('\n')) }))
  const df = {}; docs.forEach(d => Object.keys(d.tf).forEach(w => (df[w] = (df[w] || 0) + 1)))
  const avg = docs.reduce((a, d) => a + d.len, 0) / docs.length, N = docs.length
  return function search(q, k = 5) {
    const qt = Object.keys(tok(q).tf)
    return docs.map(d => {
      let s = 0
      for (const w of qt) {
        const f = d.tf[w] || 0; if (!f) continue
        const idf = Math.log(1 + (N - (df[w] || 0) + 0.5) / ((df[w] || 0) + 0.5))
        s += idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.len / avg))
      }
      return { id: d.id, score: s }
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k)
  }
}
