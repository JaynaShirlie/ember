import React, { useEffect, useMemo, useRef, useState } from 'react'
import { makeGP } from '../lib/gp.js'
import { planCampaign, campaignTargets, groupPicks } from '../lib/campaign.js'
import Workbench from './Workbench.jsx'
import Campaign from './Campaign.jsx'
import { More } from './ui.jsx'

// Axes: X = oxygen %, Z = pressure psi, Y = predicted burning-rate constant K (mm²/s)
// Uncertainty combines (a) the Gaussian-process variance and (b) distance from conditions that were actually tested
// (applicability domain), so the model never looks confident where NASA never measured.
const O2R = [10, 40], PR = [3, 30], N = 46
const DOMAIN = { o2: 3, psi: 2.5, co2: 0.08, he: 0.08 } // "near a tested condition" scales

// The landscape as a machine-kit page (public/machines/landscape.html): the app computes everything below and streams
// it in over a same-origin bridge; the page only draws it and lets the stylus call assess() live.
function LandscapeFrame({ payload }) {
  const ref = useRef(null), [ready, setReady] = useState(false), [shown, setShown] = useState(false)
  const L = () => { try { return ref.current?.contentWindow?.EMBER_LANDSCAPE } catch { return null } }
  const onLoad = () => {
    const t0 = performance.now()
    const poll = () => { const w = ref.current?.contentWindow; if (!w) return; if (w.EMBER_LANDSCAPE && w.__lab) { setReady(true); return } if (performance.now() - t0 < 20000) setTimeout(poll, 80) }
    poll()
  }
  useEffect(() => { if (ready) { L()?.setData(payload); if (!shown) setTimeout(() => setShown(true), 300) } }, [ready, payload.stamp, payload.hab, payload.grid, payload.best])
  return <div style={{ position: 'absolute', inset: 0, background: '#0d0e10', borderRadius: 'inherit', overflow: 'hidden' }}>
    {!shown && <div className="small" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#8e8c86' }}>Loading the model…</div>}
    <iframe ref={ref} title="Flammability landscape" src={'/machines/landscape.html?embed=1&v=' + __BUILD__} onLoad={onLoad}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, opacity: shown ? 1 : 0, transition: 'opacity .35s ease' }} />
  </div>
}

export default function Landscape({ data, hab }) {
  const [m, setM] = useState(data.gp)
  const gp = useMemo(() => makeGP(m), [m])
  const [fuel, setFuel] = useState('Heptane')
  const [co2, setCo2] = useState(0)
  const [he, setHe] = useState(0)
  const prior = Math.sqrt(m.constant) * m.yStd // GP uncertainty far from all data
  const fuelPts = useMemo(() => m.points.filter(p => p.fuel === fuel), [m, fuel])

  // combined uncertainty in [0,1]: GP variance + applicability-domain distance
  const assess = useMemo(() => (o2, psi) => {
    const r = gp.predict([o2 / 100, psi / 14.696, co2, he, fuel === 'Heptane' ? 1 : 0])
    let d2 = Infinity, nearest = null
    for (const p of fuelPts) {
      const a = (o2 - p.o2) / DOMAIN.o2, b = (psi - p.p) / DOMAIN.psi, c = (co2 - p.co2) / DOMAIN.co2, e = (he - p.he) / DOMAIN.he
      const v = a * a + b * b + c * c + e * e; if (v < d2) { d2 = v; nearest = p }
    }
    const support = Math.exp(-0.5 * d2), uGP = Math.min(1, r.std / prior)
    return { ...r, support, uGP, nearest, u: Math.min(1, Math.sqrt(uGP * uGP + (1 - support) * (1 - support))) }
  }, [gp, fuelPts, co2, he, fuel, prior])

  const grid = useMemo(() => {
    const g = []
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const o2 = O2R[0] + (O2R[1] - O2R[0]) * i / (N - 1), psi = PR[0] + (PR[1] - PR[0]) * j / (N - 1)
      g.push({ o2, psi, ...assess(o2, psi) })
    }
    return g
  }, [assess])

  // the rings on the sculpture are the first three distinct tests of the optimal five-test campaign (see Campaign)
  const best = useMemo(() => groupPicks(planCampaign(m, { targets: campaignTargets(hab), fuel, co2, he, n: 5 }).picks).slice(0, 3)
    .map(p => ({ ...p, ...assess(p.o2, p.psi) })), [m, hab.o2, hab.psi, hab.name, fuel, co2, he, assess])

  const habA = assess(hab.o2, hab.psi)
  const habIn = gp.inRange([hab.o2 / 100, hab.psi / 14.696, co2, he, fuel === 'Heptane' ? 1 : 0])
  const near = p => Math.abs(p.co2 - co2) <= 0.06 && Math.abs(p.he - he) <= 0.06

  return (
    <div className="grid-main">
      <div className="canvas3d">
        <LandscapeFrame payload={{ grid, N, pts: fuelPts.map(p => ({ o2: p.o2, p: p.p, K: p.K, end: p.end, user: !!p.user, near: near(p) })), best, hab, fuel, assess, stamp: `${fuel}|${co2}|${he}|${m.n}` }} />
      </div>

      <div className="side">
        <div className="panel">
          <h2>At {hab.name}</h2>
          <div className="stat">{habA.mean.toFixed(2)} <small>± {(1.96 * habA.std).toFixed(2)} mm²/s</small></div>
          <p className="small muted" style={{ marginTop: 6 }}>{fuel} droplet burning rate, with its 95% band.</p>
          <div className="kv" style={{ marginTop: 12 }}>
            <div>Test support</div><div className={habA.support > 0.5 ? '' : habA.support > 0.15 ? 'warn' : 'alert'}><b>{(habA.support * 100).toFixed(0)}%</b></div>
            {habA.nearest && <><div>Nearest test</div><div>{habA.nearest.o2.toFixed(0)}% O₂ · {habA.nearest.p.toFixed(1)} psi</div></>}
          </div>
          <p className={'small ' + (habIn ? 'muted' : habA.support > 0.5 ? 'warn' : 'alert')} style={{ marginTop: 10 }}>
            {habIn ? 'Inside the tested range.' : habA.support > 0.5 ? 'Just outside the tested range. Use with care.' : 'Far beyond tested conditions. The band understates the risk.'}
            {hab.g > 0.01 && ` Microgravity data only: this is a reference, not a ${hab.g.toFixed(2)} g prediction.`}
          </p>
        </div>

        <div className="panel">
          <h2>Fly these tests next</h2>
          <Campaign model={m} hab={hab} fuel={fuel} co2={co2} he={he} />
        </div>

        <More panel title="Fuel and suppressants">
          <label className="small">Fuel&nbsp;<select value={fuel} onChange={e => setFuel(e.target.value)}><option>Heptane</option><option>Methanol</option></select></label>
          <label className="slider" style={{ marginTop: 10, maxWidth: 'none' }}><span>CO₂ suppressant <b>{(co2 * 100).toFixed(0)}%</b> <span className="dim">(tested {m.trainRanges.co2.map(v => (v * 100).toFixed(0)).join('–')}%)</span></span>
            <input type="range" min="0" max="0.7" step="0.01" value={co2} onChange={e => setCo2(+e.target.value)} /></label>
          <label className="slider" style={{ maxWidth: 'none' }}><span>Helium diluent <b>{(he * 100).toFixed(0)}%</b> <span className="dim">(tested {m.trainRanges.he.map(v => (v * 100).toFixed(0)).join('–')}%)</span></span>
            <input type="range" min="0" max="0.45" step="0.01" value={he} onChange={e => setHe(+e.target.value)} /></label>
        </More>

        <Workbench base={data.gp} model={m} setModel={setM} clf={data.clf} hab={hab} />

        <More panel title="How good is the model?">
          <div className="kv">
            <div>R²</div><div>{m.cv.r2}</div>
            <div>Mean abs. error</div><div>{m.cv.mae} mm²/s</div>
            <div>95% band hit rate</div><div>{(m.cv.coverage95 * 100).toFixed(1)}% <span className="dim">(ideal 95%)</span></div>
          </div>
          <p className="small dim" style={{ marginTop: 8 }}>5-fold cross-validation on {m.n} NASA FLEX tests (PSI-69): each test is predicted by a model that never saw it. Liquid droplets only. PSI's solid-material tables record no flame-spread rates, so solids are not modelled.</p>
        </More>
      </div>
    </div>
  )
}
