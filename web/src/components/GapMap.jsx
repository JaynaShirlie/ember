import React, { useMemo, useState } from 'react'
import { FUEL_COLORS, FUEL_LABEL } from '../lib/habitats.js'
import { zoneStats } from '../lib/score.js'
import { More } from './ui.jsx'

const W = 820, H = 520, M = { l: 56, r: 18, t: 18, b: 46 }
const GRID = '#e8e8ed', AXIS = '#6e6e73', INK = '#1d1d1f'

export default function GapMap({ data, hab, onPick }) {
  const [showAssumed, setShowAssumed] = useState(true)
  const [classes, setClasses] = useState({ solid: true, liquid: true, gas: true })
  const [onlyInv, setOnlyInv] = useState('')
  const [plan, setPlan] = useState([])            // planned campaign: { cls, o2, psi, n }
  const [draft, setDraft] = useState({ cls: 'solid', o2: '', psi: '', n: 3 })
  const [showInverse, setShowInverse] = useState(false)
  const [hover, setHover] = useState(null)
  const [tol, setTol] = useState({ o2: 4, psi: 2 })
  const zone = useMemo(() => zoneStats(data.tests, hab, tol.o2, tol.psi), [data, hab, tol])
  // robustness: how far must the zone grow before the first solid-material test appears?
  const firstSolid = useMemo(() => {
    for (let m = 1; m <= 6; m += 0.25) { const z = zoneStats(data.tests, hab, 4 * m, 2 * m); if (z.by.solid > 0) return { o2: 4 * m, psi: 2 * m, z } }
    return null
  }, [data, hab])

  // aggregate points by (inv, class, rounded O2, rounded psi) so the chart stays readable
  const pts = useMemo(() => {
    const m = new Map()
    for (const t of data.tests) {
      if (t.matrix || t.o2Pct == null || t.pressurePsi == null || !classes[t.fuelClass] || (onlyInv && t.inv !== onlyInv)) continue
      if (t.o2Basis === 'oxidizer-stream' && !showInverse) continue
      const assumed = t.o2Basis === 'assumed-cabin' || t.pressureBasis === 'assumed-cabin'
      if (assumed && !showAssumed) continue
      const key = [t.inv, t.fuelClass, Math.round(t.o2Pct), Math.round(t.pressurePsi * 2) / 2, assumed, t.o2Basis].join('|')
      const p = m.get(key) || { inv: t.inv, cls: t.fuelClass, o2: Math.round(t.o2Pct), psi: Math.round(t.pressurePsi * 2) / 2, n: 0, assumed, stream: t.o2Basis === 'oxidizer-stream' }
      p.n += t.count || 1; m.set(key, p)
    }
    // draw gas first, solids last, so the black solids are never hidden
    const order = { gas: 0, liquid: 1, solid: 2 }
    return [...m.values()].sort((a, b) => (order[a.cls] ?? 0) - (order[b.cls] ?? 0) || b.n - a.n)
  }, [data, showAssumed, showInverse, classes, onlyInv])

  const yMax = showInverse ? 90 : 45, xMax = 46
  const x = v => M.l + (Math.min(v, xMax) / xMax) * (W - M.l - M.r)
  const y = v => H - M.b - (Math.min(v, yMax) / yMax) * (H - M.t - M.b)
  const acr = Object.fromEntries(data.invs.map(i => [i.accession, i.acronym || i.accession]))
  const solidMax = Math.max(...data.tests.filter(t => t.fuelClass === 'solid' && t.o2Pct).map(t => t.o2Pct))
  const zx = x(Math.max(0, hab.psi - tol.psi)), zy = y(Math.min(yMax, hab.o2 + tol.o2))

  return (
    <div className="grid-main">
      <div className="panel">
        <h2>Where NASA has tested</h2>
        <div className="legend" style={{ marginBottom: 10 }}>
          {['solid', 'liquid', 'gas'].map(c => <span key={c}><i style={{ background: FUEL_COLORS[c] }} />{FUEL_LABEL[c]}</span>)}
          <span><i style={{ boxShadow: 'inset 0 0 0 2px #8e8e93', background: 'transparent' }} />conditions assumed</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', background: '#fff', borderRadius: 12 }} role="img" aria-label="Scatter of NASA PSI tests by pressure and oxygen, with the habitat zone outlined">
          {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45].map(v => <g key={'x' + v}><line x1={x(v)} x2={x(v)} y1={M.t} y2={H - M.b} stroke={GRID} /><text x={x(v)} y={H - M.b + 18} fill={AXIS} fontSize="11" textAnchor="middle">{v}</text></g>)}
          {Array.from({ length: yMax / 5 + 1 }, (_, i) => i * 5).map(v => <g key={'y' + v}><line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke={GRID} /><text x={M.l - 8} y={y(v) + 4} fill={AXIS} fontSize="11" textAnchor="end">{v}</text></g>)}
          <text x={(W + M.l) / 2} y={H - 8} fill={AXIS} fontSize="12" textAnchor="middle">Pressure (psi)</text>
          <text x={14} y={(H - M.b + M.t) / 2} fill={AXIS} fontSize="12" textAnchor="middle" transform={`rotate(-90 14 ${(H - M.b + M.t) / 2})`}>Oxygen (% by volume)</text>

          {/* habitat zone */}
          <rect x={zx} y={zy} width={x(hab.psi + tol.psi) - zx} height={y(Math.max(0, hab.o2 - tol.o2)) - zy} fill="rgba(0,0,0,.045)" stroke={INK} strokeWidth="1.5" strokeDasharray="5 4" rx="4" />
          <text x={zx} y={zy - 7} fill={INK} fontSize="13" fontWeight="600">{hab.name}</text>

          {pts.map((p, i) => {
            const r = Math.min(16, 3 + Math.sqrt(p.n) * 1.6)
            const jitter = p.cls === 'gas' ? 3 : p.cls === 'liquid' ? -3 : 0
            return <circle key={i} cx={x(p.psi) + jitter} cy={y(p.o2)} r={r}
              fill={p.assumed ? '#fff' : FUEL_COLORS[p.cls]} fillOpacity={p.assumed ? 0.6 : p.cls === 'solid' ? 1 : 0.85}
              stroke={p.assumed ? (p.cls === 'solid' ? INK : '#8e8e93') : '#fff'} strokeWidth={p.assumed ? 1.8 : 1}
              style={{ cursor: 'pointer' }} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onClick={() => onPick(p.inv)} />
          })}
          <circle cx={x(hab.psi)} cy={y(hab.o2)} r="5" fill="#fff" stroke={INK} strokeWidth="2.5" />
          {plan.map((p, i) => <g key={'pl' + i} transform={`translate(${x(p.psi)},${y(p.o2)}) rotate(45)`}>
            <rect x={-7 - p.n} y={-7 - p.n} width={14 + 2 * p.n} height={14 + 2 * p.n} fill="none" stroke={INK} strokeWidth="2" strokeDasharray="4 2" /></g>)}
          {hover && <g style={{ pointerEvents: 'none' }}>
            <rect x={Math.min(x(hover.psi) + 12, W - 232)} y={Math.max(y(hover.o2) - 48, 4)} width="222" height="44" rx="10" fill="#fff" stroke="rgba(0,0,0,.14)" />
            <text x={Math.min(x(hover.psi) + 24, W - 220)} y={Math.max(y(hover.o2) - 29, 23)} fill={INK} fontSize="12" fontWeight="600">{acr[hover.inv]} · {hover.cls} · {hover.n} test{hover.n > 1 ? 's' : ''}</text>
            <text x={Math.min(x(hover.psi) + 24, W - 220)} y={Math.max(y(hover.o2) - 13, 39)} fill={AXIS} fontSize="11">{hover.o2}% O₂ · {hover.psi} psi {hover.assumed ? '(assumed)' : ''}{hover.stream ? ' (oxidizer stream)' : ''}</text>
          </g>}
        </svg>
        <div className="dim small" style={{ marginTop: 8 }}>Dot size is the number of tests. Click a dot to open its investigation.</div>
      </div>

      <div className="side">
        <div className="panel">
          <h2>Near {hab.name}</h2>
          <div className="stat">{zone.total} <small>tests</small></div>
          {['solid', 'liquid', 'gas'].map(c => (
            <div key={c} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 15 }}>
              <span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 9, background: FUEL_COLORS[c], marginRight: 8 }} />{FUEL_LABEL[c]}</span>
              <b className={c === 'solid' && zone.by.solid === 0 ? 'alert' : ''}>{zone.by[c]}</b>
            </div>
          ))}
          <p className="small" style={{ marginTop: 14 }}>
            {zone.by.solid === 0
              ? <>No solid material has been burned near this air. Every solid in PSI was tested at or below <b>{solidMax.toFixed(1)}% O₂</b>.{firstSolid ? ` The zone must widen to ±${firstSolid.o2} points O₂ and ±${firstSolid.psi} psi to reach the first one.` : ' Even a zone six times wider holds none.'}</>
              : <>{zone.by.solid} solid-material tests fall near this air.</>}
          </p>
          <div style={{ marginTop: 12 }}>
            <More title="Zone size">
              <label className="slider" style={{ maxWidth: 'none' }}><span>Oxygen <b>±{tol.o2} points</b></span>
                <input type="range" min="1" max="12" step="0.5" value={tol.o2} onChange={e => setTol({ ...tol, o2: +e.target.value })} /></label>
              <label className="slider" style={{ maxWidth: 'none', marginTop: 6 }}><span>Pressure <b>±{tol.psi} psi</b></span>
                <input type="range" min="0.5" max="8" step="0.5" value={tol.psi} onChange={e => setTol({ ...tol, psi: +e.target.value })} /></label>
              <div className="small dim" style={{ marginTop: 6 }}>From: {zone.invs.map(a => acr[a]).join(', ') || 'none'}</div>
            </More>
          </div>
        </div>

        <CampaignPlanner hab={hab} plan={plan} setPlan={setPlan} draft={draft} setDraft={setDraft} zone={zone} tol={tol} />

        <More panel title="Filter the map">
          <div className="chips">{['solid', 'liquid', 'gas'].map(c => <button key={c} className={'chip' + (classes[c] ? ' on' : '')} onClick={() => setClasses(s => ({ ...s, [c]: !s[c] }))}>{FUEL_LABEL[c]}</button>)}</div>
          <select value={onlyInv} onChange={e => setOnlyInv(e.target.value)} style={{ width: '100%', marginTop: 10 }} aria-label="Investigation">
            <option value="">All investigations</option>
            {data.invs.filter(i => data.tests.some(t => t.inv === i.accession && t.o2Pct != null && t.pressurePsi != null)).map(i => <option key={i.accession} value={i.accession}>{i.acronym || i.accession}</option>)}
          </select>
          <label className="small" style={{ display: 'block', marginTop: 10 }}><input type="checkbox" checked={showAssumed} onChange={e => setShowAssumed(e.target.checked)} /> Show tests with assumed cabin air</label>
          <label className="small" style={{ display: 'block', marginTop: 4 }}><input type="checkbox" checked={showInverse} onChange={e => setShowInverse(e.target.checked)} /> Show inverse-flame oxidizer streams</label>
        </More>
      </div>
    </div>
  )
}

// Plan a test campaign and see how much of the habitat gap it would close.
function CampaignPlanner({ hab, plan, setPlan, draft, setDraft, zone, tol }) {
  const inZone = p => Math.abs(p.o2 - hab.o2) <= tol.o2 && Math.abs(p.psi - hab.psi) <= tol.psi
  const added = { solid: 0, liquid: 0, gas: 0 }; plan.filter(inZone).forEach(p => (added[p.cls] += p.n))
  const missing = ['solid', 'liquid', 'gas'].filter(c => zone.by[c] === 0)
  const closed = missing.filter(c => added[c] > 0)
  const total = plan.reduce((a, p) => a + p.n, 0), outside = plan.filter(p => !inZone(p)).reduce((a, p) => a + p.n, 0)
  const ok = +draft.o2 > 0 && +draft.psi > 0 && +draft.n > 0
  return <div className="panel">
    <h2>Close the gap</h2>
    <button className="btn primary" style={{ width: '100%' }} onClick={() => setPlan(p => [...p, { cls: 'solid', o2: hab.o2, psi: hab.psi, n: 4 }])}>Plan 4 solid tests at {hab.name}</button>
    {plan.length > 0 && <div className="small" style={{ marginTop: 12 }}>
      <div><b>{total}</b> planned · <b>{total - outside}</b> inside the zone{outside ? <span className="warn"> · {outside} outside</span> : ''}</div>
      <div style={{ marginTop: 4 }}>Solids {zone.by.solid} → <b>{zone.by.solid + added.solid}</b> · liquids {zone.by.liquid} → <b>{zone.by.liquid + added.liquid}</b> · gases {zone.by.gas} → <b>{zone.by.gas + added.gas}</b></div>
      <div className={closed.length ? 'good' : 'warn'} style={{ marginTop: 4 }}>{missing.length === 0 ? 'Every fuel class already has evidence here; extra tests tighten it.' : closed.length === missing.length ? `Closes every empty class (${closed.join(', ')}).` : closed.length ? `Closes ${closed.join(', ')}; still missing ${missing.filter(c => !closed.includes(c)).join(', ')}.` : `Does not reach the empty classes (${missing.join(', ')}).`}</div>
      <button className="btn small" style={{ marginTop: 10 }} onClick={() => setPlan([])}>Clear plan</button>
    </div>}
    <div style={{ marginTop: 14 }}>
      <More title="Add a custom test">
        <div className="formgrid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
          <label>Fuel<select value={draft.cls} onChange={e => setDraft({ ...draft, cls: e.target.value })}><option value="solid">solid</option><option value="liquid">liquid</option><option value="gas">gas</option></select></label>
          <label>O₂ %<input type="number" value={draft.o2} onChange={e => setDraft({ ...draft, o2: e.target.value })} placeholder={hab.o2} /></label>
          <label>psi<input type="number" value={draft.psi} onChange={e => setDraft({ ...draft, psi: e.target.value })} placeholder={hab.psi} /></label>
          <label>tests<input type="number" min="1" value={draft.n} onChange={e => setDraft({ ...draft, n: e.target.value })} /></label>
        </div>
        <button className="btn" style={{ marginTop: 10 }} disabled={!ok} onClick={() => setPlan(p => [...p, { cls: draft.cls, o2: +draft.o2, psi: +draft.psi, n: Math.min(20, +draft.n) }])}>Add to plan</button>
      </More>
    </div>
  </div>
}
