import React, { useMemo, useState } from 'react'
import { rankInvestigations, MATERIAL_WEIGHT, SCALE } from '../lib/score.js'
import { More } from './ui.jsx'

const fmt = (v, d = 1) => (v == null ? '—' : Number(v).toFixed(d))
const range = r => (r ? `${fmt(r[0])} – ${fmt(r[1])}` : 'not in table')

function measuredOutputs(tests) {
  const keys = new Set()
  for (const t of tests || []) for (const [k, v] of Object.entries(t.out || {})) if (v !== null && v !== '' && v !== undefined) keys.add(k)
  return [...keys]
}
function flowRange(tests) {
  const f = (tests || []).map(t => t.flowCmS).filter(v => v != null)
  return f.length ? [Math.min(...f), Math.max(...f)] : null
}

export default function Atlas({ data, hab, testsByInv, focus, setFocus, cmp, setCmp }) {
  const ranked = useMemo(() => rankInvestigations(data.invs, testsByInv, hab), [data, testsByInv, hab])
  const [sel, setSel] = useState(focus || ranked[0]?.inv.accession)
  const [q, setQ] = useState('')
  const cur = ranked.find(r => r.inv.accession === (focus || sel)) || ranked[0]
  const shown = ranked.filter(r => !q || (r.inv.title + r.inv.acronym + r.inv.fuels.join(' ') + r.inv.accession).toLowerCase().includes(q.toLowerCase()))
  const toggleCmp = a => setCmp(c => c.includes(a) ? c.filter(x => x !== a) : [...c, a].slice(-3))
  const pick = a => { setSel(a); setFocus(null) }

  return (
    <div className="grid2">
      <div className="panel">
        <h2>Ranked for {hab.name}</h2>
        <input type="text" placeholder="Filter by name, fuel or PSI id" value={q} onChange={e => setQ(e.target.value)} style={{ width: '100%', marginBottom: 12 }} aria-label="Filter investigations" />
        <div className="list scroll">
          {shown.map(r => (
            <div key={r.inv.accession} className={'row' + (cur?.inv.accession === r.inv.accession ? ' on' : '')} onClick={() => pick(r.inv.accession)}>
              <div className="t">
                <b>{r.inv.acronym || r.inv.accession}</b>
                <span className="score">{r.score.toFixed(0)}</span>
              </div>
              <div className="dim small clip">{r.inv.title}</div>
              <div className="bar"><i style={{ width: Math.max(2, r.score) + '%' }} /></div>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                {r.inv.fuelClasses.map(c => <span key={c} className="pill">{c}</span>)}
                {r.inv.pillars.slice(0, 2).map(p => <span key={p} className="pill dim">{p}</span>)}
                <label className="small dim" style={{ marginLeft: 'auto', marginTop: 8 }} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={cmp.includes(r.inv.accession)} onChange={() => toggleCmp(r.inv.accession)} /> compare
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {cmp.length >= 2 && <Compare ids={cmp} data={data} testsByInv={testsByInv} clear={() => setCmp([])} />}
        {cur && <Detail r={cur} tests={testsByInv[cur.inv.accession]} hab={hab} />}
      </div>
    </div>
  )
}

function Detail({ r, tests, hab }) {
  const { inv, parts, bestTest } = r
  const outs = measuredOutputs(tests)
  const sample = (tests || []).filter(t => !t.matrix).slice(0, 12)
  const size = inv.totalSize ? (inv.totalSize >= 2 ** 40 ? (inv.totalSize / 2 ** 40).toFixed(2) + ' TB' : inv.totalSize >= 2 ** 30 ? (inv.totalSize / 2 ** 30).toFixed(2) + ' GB' : (inv.totalSize / 2 ** 20).toFixed(0) + ' MB') : null
  return (
    <div className="panel">
      <div className="tag">{inv.accession}{inv.acronym ? ' · ' + inv.acronym : ''}</div>
      <h2 style={{ fontSize: 24, lineHeight: 1.2, margin: '4px 0 10px' }}>{inv.title}</h2>
      <div className="small" style={{ marginBottom: 18 }}>
        <a href={inv.url} target="_blank" rel="noreferrer">NASA PSI page</a>
        {inv.doi && <> · <a href={'https://doi.org/' + inv.doi} target="_blank" rel="noreferrer">DOI {inv.doi}</a></>}
        {size && <span className="dim"> · {size} on PSI</span>}
      </div>

      <div className="meters">
        <div className="meter"><span>Relevance score</span><b>{r.score.toFixed(1)}</b></div>
        <div className="meter"><span>Closeness to this air</span><b>{parts.closeness.toFixed(2)}</b></div>
        <div className="meter"><span>Tests</span><b>{inv.nTests.toLocaleString()}</b></div>
      </div>
      {bestTest && <p className="small muted" style={{ marginBottom: 6 }}>Closest test: {bestTest.fuel} at {fmt(bestTest.o2Pct)}% O₂, {fmt(bestTest.pressurePsi)} psi.</p>}
      {parts.closeness === 0 && <p className="small warn" style={{ marginBottom: 6 }}>No test here records both ambient oxygen and pressure, so closeness cannot be computed.</p>}
      {hab.g > 0.01 && <p className="small warn" style={{ marginBottom: 6 }}>Flown in microgravity. Nothing was run at {hab.g.toFixed(2)} g.</p>}

      <div className="kv" style={{ margin: '16px 0 18px' }}>
        <div>Fuels</div><div>{inv.fuels.slice(0, 8).join(', ') || '—'}</div>
        <div>Oxygen (%)</div><div>{range(inv.o2Range)}{inv.oxidizerStreamO2Range && <span className="dim"> · oxidizer stream {range(inv.oxidizerStreamO2Range)}</span>}</div>
        <div>Pressure (psi)</div><div>{range(inv.pressureRange)}</div>
        <div>Air flow (cm/s)</div><div>{range(flowRange(tests))}</div>
        <div>Hardware</div><div>{inv.hardware || '—'}</div>
      </div>

      <More title="How the score is computed">
        <p className="small muted">Score = 100 × closeness {parts.closeness.toFixed(2)} × material {parts.material.toFixed(2)} × evidence {parts.evidence.toFixed(2)}.
          Closeness = exp(−½[(ΔO₂/{SCALE.o2})² + (Δp/{SCALE.psi})²]) for the closest test, discounted when a value is assumed rather than measured.
          Material weights: solid {MATERIAL_WEIGHT.solid}, liquid {MATERIAL_WEIGHT.liquid}, gas {MATERIAL_WEIGHT.gas}. Evidence = log₁₀(1 + tests)/2, capped at 1.
          {bestTest && <> Closest test basis: {bestTest.o2Basis} oxygen, {bestTest.pressureBasis} pressure.</>}</p>
      </More>
      {inv.objective && <More title="Objectives"><div className="prose">{inv.objective}</div></More>}
      {inv.approach && <More title="Approach"><div className="prose">{inv.approach}</div></More>}
      {inv.impacts && <More title="Impact and Earth benefits"><div className="prose">{inv.impacts}</div></More>}
      {sample.length > 0 && <More title={`Test rows (first ${sample.length}) and measured outputs`}>
        <p className="small muted" style={{ marginBottom: 8 }}>Measured: {outs.join(', ') || '—'}. Flown {inv.start || '?'} to {inv.end || '?'}.</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="t"><thead><tr><th>Table</th><th>Fuel</th><th>Config</th><th>O₂ %</th><th>psi</th><th>cm/s</th><th>basis</th></tr></thead>
            <tbody>{sample.map(t => <tr key={t.id}><td>{t.table}</td><td>{t.fuel}</td><td>{t.config}</td><td>{fmt(t.o2Pct)}</td><td>{fmt(t.pressurePsi)}</td><td>{fmt(t.flowCmS)}</td><td className="dim">{t.o2Basis}</td></tr>)}</tbody>
          </table>
        </div>
      </More>}
      {inv.publications?.length > 0 && <More title={`Publications (${inv.publications.length})`}>
        <ul className="small muted" style={{ paddingLeft: 18, margin: 0 }}>
          {inv.publications.slice(0, 8).map((p, i) => <li key={i}>{p.doi ? <a href={'https://doi.org/' + p.doi} target="_blank" rel="noreferrer">{p.title}</a> : p.title}</li>)}
        </ul>
      </More>}
    </div>
  )
}

function Compare({ ids, data, testsByInv, clear }) {
  const invs = ids.map(id => data.invs.find(i => i.accession === id))
  const rows = [
    ['Fuel class', i => i.fuelClasses.join(', ')],
    ['Fuels', i => i.fuels.slice(0, 6).join(', ')],
    ['Configuration', i => [...new Set((testsByInv[i.accession] || []).map(t => t.config))].join(', ')],
    ['O₂ range %', i => range(i.o2Range)],
    ['Pressure psi', i => range(i.pressureRange)],
    ['Flow cm/s', i => range(flowRange(testsByInv[i.accession]))],
    ['Tests', i => i.nTests],
    ['Measured', i => measuredOutputs(testsByInv[i.accession]).join(', ')],
    ['Hardware', i => i.hardware || '—'],
  ]
  return (
    <div className="panel">
      <h2 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>Compare <button className="btn small" onClick={clear}>Clear</button></h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="t">
          <thead><tr><th></th>{invs.map(i => <th key={i.accession} style={{ color: 'var(--ink)', fontWeight: 600 }}>{i.acronym || i.accession}</th>)}</tr></thead>
          <tbody>{rows.map(([k, f]) => {
            const vals = invs.map(i => String(f(i)))
            const same = vals.every(v => v === vals[0])
            return <tr key={k}><td className="dim">{k}</td>{vals.map((v, n) => <td key={n} style={{ color: same ? 'var(--dim)' : 'var(--ink)', fontWeight: same ? 400 : 500 }}>{v}</td>)}</tr>
          })}</tbody>
        </table>
      </div>
      <div className="dim small" style={{ marginTop: 8 }}>Rows in black differ between investigations.</div>
    </div>
  )
}
