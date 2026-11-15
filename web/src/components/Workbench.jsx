import React, { useMemo, useState } from 'react'
import { makeGP, makeAssessor, retrainGP, parseTestsCSV } from '../lib/gp.js'
import { makeClassifier } from '../lib/models.js'

// Scientist workbench: query any conditions, and add your own tests (CSV or manual) to retrain the model in-browser.
// SI disclosure: written with assistance from Claude (Anthropic).
const TEMPLATE = 'fuel,o2_pct,pressure_psi,co2,he,K_mm2s\nHeptane,34,8.2,0,0,0.78\n'

export default function Workbench({ base, model, setModel, clf, hab }) {
  const [q, setQ] = useState({ fuel: 'Heptane', o2: hab.o2 > 40 ? 30 : hab.o2, psi: hab.psi, co2: 0, he: 0, d0: 3 })
  const [mine, setMine] = useState([])
  const [row, setRow] = useState({ fuel: 'Heptane', o2: '', p: '', co2: 0, he: 0, K: '' })
  const [msg, setMsg] = useState(null)
  const gp = useMemo(() => makeGP(model), [model])
  const assess = useMemo(() => makeAssessor(gp, model, model.points), [gp, model])
  const ext = useMemo(() => makeClassifier(clf.extinction), [clf])
  const r = assess({ o2: +q.o2, psi: +q.psi, co2: +q.co2, he: +q.he, fuel: q.fuel })
  const e = ext({ o2Pct: +q.o2, pressurePsi: +q.psi, co2: +q.co2, he: +q.he, d0_mm: +q.d0, heptane: q.fuel === 'Heptane' ? 1 : 0 })
  const num = (k, v) => setQ(s => ({ ...s, [k]: v }))

  function retrain(list) {
    const t0 = performance.now()
    try { setModel(list.length ? retrainGP(base, list) : base); setMsg({ ok: true, text: list.length ? `Retrained on ${base.n} NASA + ${list.length} of your tests in ${Math.round(performance.now() - t0)} ms. The surface, band and campaign now include your data.` : 'Reset to the NASA-only model.' }) }
    catch (err) { setMsg({ ok: false, text: String(err.message || err) }) }
  }
  function addRows(rows) { const next = [...mine, ...rows]; setMine(next); retrain(next) }
  async function onFile(f) { try { addRows(parseTestsCSV(await f.text())) } catch (err) { setMsg({ ok: false, text: String(err.message || err) }) } }

  return <>
    <div className="panel">
      <h2>Ask the model</h2>
      <div className="formgrid">
        <label>Fuel<select value={q.fuel} onChange={e => num('fuel', e.target.value)}><option>Heptane</option><option>Methanol</option></select></label>
        <label>O₂ %<input type="number" step="0.5" value={q.o2} onChange={e => num('o2', e.target.value)} /></label>
        <label>Pressure psi<input type="number" step="0.1" value={q.psi} onChange={e => num('psi', e.target.value)} /></label>
        <label>CO₂ frac<input type="number" step="0.01" min="0" max="0.7" value={q.co2} onChange={e => num('co2', e.target.value)} /></label>
        <label>He frac<input type="number" step="0.01" min="0" max="0.45" value={q.he} onChange={e => num('he', e.target.value)} /></label>
        <label>Droplet d₀ mm<input type="number" step="0.1" value={q.d0} onChange={e => num('d0', e.target.value)} /></label>
      </div>
      <div className="kv" style={{ marginTop: 10 }}>
        <div>Burning rate K</div><div><b>{r.mean.toFixed(3)}</b> ± {(1.96 * r.std).toFixed(3)} mm²/s</div>
        <div>P(self-extinguish)</div><div><b>{Math.round(e.p * 100)}%</b> <span className="dim">(AUC {clf.extinction.cv.auc})</span></div>
        <div>Test support</div><div className={r.support > 0.5 ? 'good' : r.support > 0.15 ? 'warn' : 'alert'}>{Math.round(r.support * 100)}%{r.nearest && <span className="dim"> · nearest {r.nearest.o2.toFixed(0)}% / {r.nearest.p.toFixed(1)} psi</span>}</div>
      </div>
      {(!r.inRange || e.outside.length > 0) && <div className="small warn" style={{ marginTop: 6 }}>Outside the tested range: treat as extrapolation.</div>}
    </div>

    <details className="panel more">
      <summary>Add your own tests</summary>
      <div className="small muted">Upload a CSV or add a row. The model retrains in your browser; nothing is uploaded.</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="btn">Upload CSV<input type="file" accept=".csv,text/csv" hidden onChange={e => e.target.files[0] && onFile(e.target.files[0])} /></label>
        <a className="small" href={'data:text/csv;charset=utf-8,' + encodeURIComponent(TEMPLATE)} download="ember_tests_template.csv">CSV template</a>
        {mine.length > 0 && <button className="btn" onClick={() => { setMine([]); retrain([]) }}>Reset ({mine.length})</button>}
      </div>
      <div className="formgrid" style={{ marginTop: 8 }}>
        <label>Fuel<select value={row.fuel} onChange={e => setRow({ ...row, fuel: e.target.value })}><option>Heptane</option><option>Methanol</option></select></label>
        <label>O₂ %<input type="number" value={row.o2} onChange={e => setRow({ ...row, o2: e.target.value })} /></label>
        <label>psi<input type="number" value={row.p} onChange={e => setRow({ ...row, p: e.target.value })} /></label>
        <label>CO₂<input type="number" step="0.01" value={row.co2} onChange={e => setRow({ ...row, co2: e.target.value })} /></label>
        <label>He<input type="number" step="0.01" value={row.he} onChange={e => setRow({ ...row, he: e.target.value })} /></label>
        <label>K mm²/s<input type="number" step="0.01" value={row.K} onChange={e => setRow({ ...row, K: e.target.value })} /></label>
      </div>
      <button className="btn primary" style={{ marginTop: 8 }} disabled={!(+row.o2 > 0 && +row.p > 0 && +row.K > 0)}
        onClick={() => addRows([{ fuel: row.fuel, o2: +row.o2, p: +row.p, co2: +row.co2 || 0, he: +row.he || 0, K: +row.K, id: 'user-' + (mine.length + 1) }])}>Add test & retrain</button>
      {msg && <div className={'small ' + (msg.ok ? 'good' : 'alert')} style={{ marginTop: 8 }}>{msg.text}</div>}
      <div style={{ height: 14 }} />
    </details>
  </>
}
