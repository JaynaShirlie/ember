import React, { useMemo, useState } from 'react'
import { FUEL_COLORS, FUEL_LABEL } from '../lib/habitats.js'
import { zoneStats } from '../lib/score.js'

const W = 820, H = 520, M = { l: 56, r: 18, t: 18, b: 46 }

export default function GapMap({ data, hab, onPick }) {
  const [showAssumed, setShowAssumed] = useState(true)
  const [showInverse, setShowInverse] = useState(false)
  const [hover, setHover] = useState(null)
  const tol = { o2: 4, psi: 2 }
  const zone = useMemo(() => zoneStats(data.tests, hab, tol.o2, tol.psi), [data, hab])

  // aggregate points by (inv, class, rounded O2, rounded psi) so the chart stays readable
  const pts = useMemo(() => {
    const m = new Map()
    for (const t of data.tests) {
      if (t.matrix || t.o2Pct == null || t.pressurePsi == null) continue
      if (t.o2Basis === 'oxidizer-stream' && !showInverse) continue
      const assumed = t.o2Basis === 'assumed-cabin' || t.pressureBasis === 'assumed-cabin'
      if (assumed && !showAssumed) continue
      const key = [t.inv, t.fuelClass, Math.round(t.o2Pct), Math.round(t.pressurePsi * 2) / 2, assumed, t.o2Basis].join('|')
      const p = m.get(key) || { inv: t.inv, cls: t.fuelClass, o2: Math.round(t.o2Pct), psi: Math.round(t.pressurePsi * 2) / 2, n: 0, assumed, stream: t.o2Basis === 'oxidizer-stream' }
      p.n += t.count || 1; m.set(key, p)
    }
    return [...m.values()]
  }, [data, showAssumed, showInverse])

  const yMax = showInverse ? 90 : 45, xMax = 46
  const x = v => M.l + (Math.min(v, xMax) / xMax) * (W - M.l - M.r)
  const y = v => H - M.b - (Math.min(v, yMax) / yMax) * (H - M.t - M.b)
  const acr = Object.fromEntries(data.invs.map(i => [i.accession, i.acronym || i.accession]))
  const solidMax = Math.max(...data.tests.filter(t => t.fuelClass === 'solid' && t.o2Pct).map(t => t.o2Pct))

  return (
    <div className="grid-main">
      <div className="panel">
        <h2>Where NASA has tested, by oxygen and pressure</h2>
        <div className="legend" style={{ marginBottom: 6 }}>
          {['solid', 'liquid', 'gas'].map(c => <span key={c}><i style={{ background: FUEL_COLORS[c] }} />{FUEL_LABEL[c]}</span>)}
          <span><i style={{ border: '2px solid var(--muted)', background: 'transparent' }} />pressure or O₂ assumed (cabin air, not in table)</span>
          <span style={{ marginLeft: 'auto' }}>
            <label><input type="checkbox" checked={showAssumed} onChange={e => setShowAssumed(e.target.checked)} /> assumed-cabin points</label>{'  '}
            <label><input type="checkbox" checked={showInverse} onChange={e => setShowInverse(e.target.checked)} /> inverse-flame O₂ (oxidizer stream)</label>
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
          {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45].map(v => <g key={'x' + v}><line x1={x(v)} x2={x(v)} y1={M.t} y2={H - M.b} stroke="#1b2540" /><text x={x(v)} y={H - M.b + 18} fill="#7c87a0" fontSize="11" textAnchor="middle">{v}</text></g>)}
          {Array.from({ length: yMax / 5 + 1 }, (_, i) => i * 5).map(v => <g key={'y' + v}><line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="#1b2540" /><text x={M.l - 8} y={y(v) + 4} fill="#7c87a0" fontSize="11" textAnchor="end">{v}</text></g>)}
          <text x={(W + M.l) / 2} y={H - 8} fill="#aeb9cf" fontSize="12" textAnchor="middle">Pressure (psi)</text>
          <text x={14} y={(H - M.b + M.t) / 2} fill="#aeb9cf" fontSize="12" textAnchor="middle" transform={`rotate(-90 14 ${(H - M.b + M.t) / 2})`}>Oxygen (% by volume)</text>

          {/* habitat zone */}
          <rect x={x(Math.max(0, hab.psi - tol.psi))} y={y(Math.min(yMax, hab.o2 + tol.o2))} width={x(hab.psi + tol.psi) - x(Math.max(0, hab.psi - tol.psi))}
            height={y(Math.max(0, hab.o2 - tol.o2)) - y(Math.min(yMax, hab.o2 + tol.o2))} fill="rgba(242,165,65,.14)" stroke="#F2A541" strokeDasharray="5 4" />
          <text x={x(hab.psi + tol.psi) + 6} y={y(Math.min(yMax, hab.o2 + tol.o2)) + 12} fill="#F2A541" fontSize="12" fontWeight="600">{hab.name}</text>

          {pts.sort((a, b) => b.n - a.n).map((p, i) => {
            const r = Math.min(16, 3 + Math.sqrt(p.n) * 1.6)
            const jitter = p.cls === 'gas' ? 3 : p.cls === 'liquid' ? -3 : 0
            return <circle key={i} cx={x(p.psi) + jitter} cy={y(p.o2)} r={r}
              fill={p.assumed ? 'transparent' : FUEL_COLORS[p.cls]} fillOpacity={p.cls === 'solid' ? 0.95 : 0.7}
              stroke={p.assumed ? FUEL_COLORS[p.cls] : p.cls === 'solid' ? '#fff' : 'none'} strokeWidth={p.assumed ? 1.6 : 0.8}
              style={{ cursor: 'pointer' }} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onClick={() => onPick(p.inv)} />
          })}
          <circle cx={x(hab.psi)} cy={y(hab.o2)} r="6" fill="#fff" stroke="#F2A541" strokeWidth="2" />
          {hover && <g>
            <rect x={Math.min(x(hover.psi) + 12, W - 230)} y={Math.max(y(hover.o2) - 46, 4)} width="220" height="42" rx="6" fill="#0e162a" stroke="#3a4e78" />
            <text x={Math.min(x(hover.psi) + 22, W - 220)} y={Math.max(y(hover.o2) - 28, 22)} fill="#fff" fontSize="12">{acr[hover.inv]} · {hover.cls} · {hover.n} test{hover.n > 1 ? 's' : ''}</text>
            <text x={Math.min(x(hover.psi) + 22, W - 220)} y={Math.max(y(hover.o2) - 12, 38)} fill="#aeb9cf" fontSize="11">{hover.o2}% O₂ · {hover.psi} psi {hover.assumed ? '(assumed)' : ''}{hover.stream ? ' (oxidizer stream)' : ''}</text>
          </g>}
        </svg>
        <div className="dim small">Click a point to open that investigation. Point size = number of tests. Computed live from {data.meta.testRecords.toLocaleString()} harvested test records.</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="panel">
          <h2>Inside the {hab.name} zone</h2>
          <div className="dim small">±{tol.o2} points O₂, ±{tol.psi} psi around {hab.o2}% / {hab.psi} psi · ambient O₂ only</div>
          <div className="stat" style={{ marginTop: 8 }}>{zone.total}</div><div className="muted small">tests in total</div>
          {['solid', 'liquid', 'gas'].map(c => (
            <div key={c} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 9, background: FUEL_COLORS[c], marginRight: 6 }} />{FUEL_LABEL[c]}</span>
              <b className={c === 'solid' && zone.by.solid === 0 ? 'alert' : ''}>{zone.by[c]}</b>
            </div>
          ))}
          <div className="small muted" style={{ marginTop: 8 }}>From: {zone.invs.map(a => acr[a]).join(', ') || 'none'}</div>
        </div>
        <div className="panel">
          <h2>What this means</h2>
          {zone.by.solid === 0
            ? <p className="small"><b className="alert">No solid-material test</b> (fabrics, plastics: the materials that actually burn in a cabin) has been run near this atmosphere. Every solid sample in PSI was burned at ≤ {solidMax.toFixed(1)}% O₂ and cabin pressure. Evidence here comes only from {zone.total ? 'gas flames and fuel droplets' : 'nothing at all'}, so material-flammability conclusions for this habitat are <b>extrapolations</b>.</p>
            : <p className="small">{zone.by.solid} solid-material tests fall near this atmosphere. Open them in the Atlas to see conditions and outcomes.</p>}
          <p className="small muted">NASA's FM2 experiment (targeted late 2026) plans to burn solid samples on the Moon at lunar-habitat atmosphere: exactly this gap. EMBER re-harvests PSI nightly so new data appears here when released.</p>
        </div>
      </div>
    </div>
  )
}
