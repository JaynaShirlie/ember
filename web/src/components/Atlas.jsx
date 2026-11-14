import React, { useMemo, useState } from 'react'
import { rankInvestigations, MATERIAL_WEIGHT, SCALE } from '../lib/score.js'
import { PILLAR_COLORS, FUEL_COLORS } from '../lib/habitats.js'

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

export default function Atlas({ data, hab, testsByInv, focus, setFocus }) {
  const ranked = useMemo(() => rankInvestigations(data.invs, testsByInv, hab), [data, testsByInv, hab])
  const [sel, setSel] = useState(focus || ranked[0]?.inv.accession)
  const [cmp, setCmp] = useState([])
  const [q, setQ] = useState('')
  const cur = ranked.find(r => r.inv.accession === (focus || sel)) || ranked[0]
  const shown = ranked.filter(r => !q || (r.inv.title + r.inv.acronym + r.inv.fuels.join(' ') + r.inv.accession).toLowerCase().includes(q.toLowerCase()))
  const toggleCmp = a => setCmp(c => c.includes(a) ? c.filter(x => x !== a) : [...c, a].slice(-3))
  const pick = a => { setSel(a); setFocus(null) }

  return (
    <div className="grid2">
      <div className="panel">
        <h2>Most relevant to: {hab.name} <span className="dim small">({hab.o2}% O₂ · {hab.psi} psi)</span></h2>
        <input type="text" placeholder="Filter by name, fuel, PSI id…" value={q} onChange={e => setQ(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
        <div className="list">
          {shown.map(r => (
            <div key={r.inv.accession} className={'row' + (cur?.inv.accession === r.inv.accession ? ' on' : '')} onClick={() => pick(r.inv.accession)}>
              <div className="t">
                <b>{r.inv.acronym || r.inv.accession}</b>
                <span className="score">{r.score.toFixed(0)}</span>
              </div>
              <div className="dim small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.inv.accession} · {r.inv.title}</div>
              <div className="bar"><i style={{ width: Math.max(2, r.score) + '%' }} /></div>
              <div>
                {r.inv.pillars.map(p => <span key={p} className="pill" style={{ color: PILLAR_COLORS[p] }}>{p}</span>)}
                {r.inv.fuelClasses.map(c => <span key={c} className="pill" style={{ color: FUEL_COLORS[c] }}>{c}</span>)}
                <label className="small dim" style={{ float: 'right', marginTop: 3 }} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={cmp.includes(r.inv.accession)} onChange={() => toggleCmp(r.inv.accession)} /> compare
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
  return (
    <div className="panel">
      <div className="tag">{inv.accession} · {inv.projectType} {inv.subArea ? '· ' + inv.subArea : ''}</div>
      <h2 style={{ fontSize: 20, fontWeight: 400, margin: '4px 0 8px' }}>{inv.title}</h2>
      <div className="small" style={{ marginBottom: 8 }}>
        <a href={inv.url} target="_blank" rel="noreferrer">Open in NASA PSI ↗</a>
        {inv.doi && <> · DOI <a href={'https://doi.org/' + inv.doi} target="_blank" rel="noreferrer">{inv.doi}</a></>}
        {inv.totalSize ? ` · dataset ${(inv.totalSize / 1e9 >= 1 ? (inv.totalSize / 1e9).toFixed(1) + ' GB' : (inv.totalSize / 1e6).toFixed(0) + ' MB')}` : ''}
      </div>

      <h3>Why this rank · score {r.score.toFixed(1)}</h3>
      <div className="small muted">
        Score = 100 × closeness <b>{parts.closeness.toFixed(2)}</b> × material <b>{parts.material.toFixed(2)}</b> × evidence <b>{parts.evidence.toFixed(2)}</b>.
        {' '}Closeness = exp(−½[(ΔO₂/{SCALE.o2})² + (Δp/{SCALE.psi})²]) for the closest test, discounted when a value is assumed rather than measured.
        {' '}Material weights: solid {MATERIAL_WEIGHT.solid}, liquid {MATERIAL_WEIGHT.liquid}, gas {MATERIAL_WEIGHT.gas}. Evidence = log₁₀(1+tests)/2, capped at 1.
        {bestTest && <> Closest test: <b>{bestTest.fuel}</b> at {fmt(bestTest.o2Pct)}% O₂, {fmt(bestTest.pressurePsi)} psi ({bestTest.o2Basis}/{bestTest.pressureBasis}).</>}
        {parts.closeness === 0 && <span className="warn"> No test in this investigation reports both ambient O₂ and pressure, so closeness cannot be computed.</span>}
        {hab.g > 0.01 && <span className="warn"> Note: all PSI flight tests are microgravity (≈0 g); none were run at {hab.g.toFixed(2)} g.</span>}
      </div>

      <h3>Test conditions (from the experimental table)</h3>
      <div className="kv">
        <div>Tests / flames</div><div>{inv.nTests.toLocaleString()} {inv.nRows !== inv.nTests && <span className="dim">({inv.nRows} table rows)</span>}</div>
        <div>Fuels</div><div>{inv.fuels.slice(0, 12).join(', ') || '—'}</div>
        <div>O₂ range (%)</div><div>{range(inv.o2Range)}{inv.oxidizerStreamO2Range && <span className="dim"> · inverse-flame oxidizer stream {range(inv.oxidizerStreamO2Range)}</span>}</div>
        <div>Pressure (psi)</div><div>{range(inv.pressureRange)}</div>
        <div>Air flow (cm/s)</div><div>{range(flowRange(tests))}</div>
        <div>Measured outputs</div><div>{outs.join(', ') || '—'}</div>
        <div>Hardware</div><div>{inv.hardware || '—'}</div>
        <div>Dates</div><div>{inv.start || '?'} → {inv.end || '?'}</div>
      </div>

      {inv.objective && <><h3>Objectives</h3><div className="prose">{inv.objective}</div></>}
      {inv.approach && <><h3>Approach</h3><div className="prose">{inv.approach}</div></>}
      {inv.impacts && <><h3>Research impact / Earth benefits</h3><div className="prose">{inv.impacts}</div></>}

      {sample.length > 0 && <>
        <h3>First {sample.length} test rows</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="t"><thead><tr><th>Table</th><th>Fuel</th><th>Config</th><th>O₂ %</th><th>psi</th><th>flow cm/s</th><th>basis</th></tr></thead>
            <tbody>{sample.map(t => <tr key={t.id}><td>{t.table}</td><td>{t.fuel}</td><td>{t.config}</td><td>{fmt(t.o2Pct)}</td><td>{fmt(t.pressurePsi)}</td><td>{fmt(t.flowCmS)}</td><td className="dim">{t.o2Basis}</td></tr>)}</tbody>
          </table>
        </div>
      </>}

      {inv.publications?.length > 0 && <>
        <h3>Publications ({inv.publications.length})</h3>
        <ul className="small muted" style={{ paddingLeft: 18, margin: 0 }}>
          {inv.publications.slice(0, 8).map((p, i) => <li key={i}>{p.doi ? <a href={'https://doi.org/' + p.doi} target="_blank" rel="noreferrer">{p.title}</a> : p.title}</li>)}
        </ul>
      </>}
    </div>
  )
}

function Compare({ ids, data, testsByInv, clear }) {
  const invs = ids.map(id => data.invs.find(i => i.accession === id))
  const rows = [
    ['Pillar', i => i.pillars.join(', ')],
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
      <h2>Compare investigations <button className="btn small" style={{ float: 'right' }} onClick={clear}>Clear</button></h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="t">
          <thead><tr><th></th>{invs.map(i => <th key={i.accession} style={{ color: 'var(--ink)' }}>{i.acronym || i.accession}</th>)}</tr></thead>
          <tbody>{rows.map(([k, f]) => {
            const vals = invs.map(i => String(f(i)))
            const same = vals.every(v => v === vals[0])
            return <tr key={k}><td className="dim">{k}</td>{vals.map((v, n) => <td key={n} style={{ color: same ? 'var(--muted)' : 'var(--ink)' }}>{v}</td>)}</tr>
          })}</tbody>
        </table>
      </div>
      <div className="dim small" style={{ marginTop: 6 }}>Rows in white differ between investigations; grey rows are the same.</div>
    </div>
  )
}
