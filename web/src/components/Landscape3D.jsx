import React, { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { makeGP } from '../lib/gp.js'

// Axes: X = oxygen %, Z = pressure psi, Y = predicted burning-rate constant K (mm²/s)
// Uncertainty shown as fog combines (a) the Gaussian-process variance and (b) distance from conditions that
// were actually tested (applicability domain), so the model never looks confident where NASA never measured.
const O2R = [10, 40], PR = [3, 30], KR = [0.1, 1.1], N = 46, H = 4.2
const sx = o2 => ((o2 - O2R[0]) / (O2R[1] - O2R[0]) - 0.5) * 10
const sz = p => ((p - PR[0]) / (PR[1] - PR[0]) - 0.5) * 10
const sy = k => Math.min(1.15, Math.max(0, (k - KR[0]) / (KR[1] - KR[0]))) * H
const END_COLOR = { Extinction: '#ff6b5e', Completion: '#5fd39a', Disruption: '#c9c9c9' }
const DOMAIN = { o2: 3, psi: 2.5, co2: 0.08, he: 0.08 } // "near a tested condition" scales

function ramp(t) { // deep blue -> cyan -> amber -> hot white
  const s = [[0, '#1d3f99'], [0.35, '#3f8ff0'], [0.6, '#7fd3f7'], [0.85, '#f2a541'], [1, '#ffe7c2']]
  for (let i = 1; i < s.length; i++) if (t <= s[i][0]) {
    const f = (t - s[i - 1][0]) / (s[i][0] - s[i - 1][0])
    return new THREE.Color(s[i - 1][1]).lerp(new THREE.Color(s[i][1]), f)
  }
  return new THREE.Color(s[s.length - 1][1])
}
const softDot = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d'); const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
})()

function Surface({ grid }) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = [], col = [], idx = []
    const fog = new THREE.Color('#39415a')
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const c = grid[i * N + j]
      pos.push(sx(c.o2), sy(c.mean), sz(c.psi))
      const k = ramp(Math.min(1, Math.max(0, (c.mean - KR[0]) / (KR[1] - KR[0]))))
      k.lerp(fog, Math.min(0.7, Math.max(0, c.u - 0.25) * 1.1)) // colour fades into fog where evidence is thin
      col.push(k.r, k.g, k.b)
    }
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < N - 1; j++) {
      const a = i * N + j, b = a + 1, c = a + N, d = c + 1
      idx.push(a, c, b, b, c, d)
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.setIndex(idx); g.computeVertexNormals()
    return g
  }, [grid])
  return <group>
    <mesh geometry={geom}><meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.55} metalness={0.05} emissive="#0b1a3a" emissiveIntensity={0.35} /></mesh>
    <mesh geometry={geom}><meshBasicMaterial color="#9fb6e8" wireframe transparent opacity={0.06} /></mesh>
  </group>
}

function Fog({ grid }) {
  const geom = useMemo(() => {
    const pos = []
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (const c of grid) {
      const n = (c.u > 0.55 ? 1 : 0) + (c.u > 0.8 ? 1 : 0) + (c.u > 0.93 ? 1 : 0)
      for (let k = 0; k < n; k++) pos.push(sx(c.o2) + (rnd() - 0.5) * 0.35, sy(c.mean) + 0.15 + rnd() * 0.9 * c.u, sz(c.psi) + (rnd() - 0.5) * 0.35)
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g
  }, [grid])
  return <points geometry={geom}><pointsMaterial map={softDot} size={0.7} color="#b9c6e6" transparent opacity={0.07} depthWrite={false} blending={THREE.AdditiveBlending} /></points>
}

function Axes() {
  const ticksO2 = [10, 15, 20, 25, 30, 35, 40], ticksP = [5, 10, 15, 20, 25, 30], ticksK = [0.1, 0.35, 0.6, 0.85, 1.1]
  const lab = { color: '#7c87a0', fontSize: 11, pointerEvents: 'none' }
  return <group>
    <Line points={[[-5, 0, 5.3], [5, 0, 5.3]]} color="#3a4e78" />
    <Line points={[[-5.3, 0, -5], [-5.3, 0, 5]]} color="#3a4e78" />
    <Line points={[[-5.3, 0, 5.3], [-5.3, H, 5.3]]} color="#3a4e78" />
    {ticksO2.map(t => <Html key={'o' + t} position={[sx(t), 0, 5.75]} center style={lab}>{t}</Html>)}
    {ticksP.map(t => <Html key={'p' + t} position={[-5.8, 0, sz(t)]} center style={lab}>{t}</Html>)}
    {ticksK.map(t => <Html key={'k' + t} position={[-5.75, sy(t), 5.3]} center style={lab}>{t}</Html>)}
    <Html position={[0, 0, 6.5]} center style={{ ...lab, color: '#aeb9cf', fontSize: 12, whiteSpace: 'nowrap' }}>Oxygen (%)</Html>
    <Html position={[-6.7, 0, 0]} center style={{ ...lab, color: '#aeb9cf', fontSize: 12, whiteSpace: 'nowrap' }}>Pressure (psi)</Html>
    <Html position={[-5.3, H + 0.55, 5.3]} style={{ ...lab, color: '#aeb9cf', fontSize: 12, whiteSpace: 'nowrap', transform: 'translate(-10px,-50%)' }}>Burning rate K (mm²/s)</Html>
  </group>
}

function TestedFootprint({ pts }) { // tested (O2, psi) cells drawn on the floor
  return pts.map((p, i) => <mesh key={i} position={[sx(Math.min(40, p.o2)), 0.005, sz(Math.min(30, p.p))]} rotation={[-Math.PI / 2, 0, 0]}>
    <circleGeometry args={[0.07, 10]} /><meshBasicMaterial color="#5f6f94" transparent opacity={0.6} />
  </mesh>)
}

export default function Landscape({ data, hab }) {
  const gp = useMemo(() => makeGP(data.gp), [data])
  const m = data.gp
  const [fuel, setFuel] = useState('Heptane')
  const [co2, setCo2] = useState(0)
  const [he, setHe] = useState(0)
  const [spin, setSpin] = useState(() => !location.search.includes('shot'))
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

  // next-best experiments: most uncertain cells in a habitat-relevant window, spread apart
  const best = useMemo(() => {
    const cand = grid.filter(c => c.o2 >= 14 && c.o2 <= 40 && c.psi >= 4 && c.psi <= 22 && c.o2 / 100 + co2 + he <= 1)
      .map(c => ({ ...c, score: c.u * (0.6 + 0.4 * Math.exp(-0.5 * (((c.o2 - hab.o2) / 8) ** 2 + ((c.psi - hab.psi) / 6) ** 2))) }))
      .sort((a, b) => b.score - a.score)
    const picks = []
    for (const c of cand) { if (picks.every(p => Math.abs(p.o2 - c.o2) > 5 || Math.abs(p.psi - c.psi) > 3)) picks.push(c); if (picks.length === 3) break }
    return picks
  }, [grid, hab, co2, he])

  const habA = hab.o2 <= 100 ? assess(hab.o2, hab.psi) : null
  const habIn = gp.inRange([hab.o2 / 100, hab.psi / 14.696, co2, he, fuel === 'Heptane' ? 1 : 0])
  const near = p => Math.abs(p.co2 - co2) <= 0.06 && Math.abs(p.he - he) <= 0.06
  const coveredPct = Math.round(100 * grid.filter(c => c.u < 0.5).length / grid.length)

  return (
    <div className="grid-main">
      <div className="canvas3d" onPointerDown={() => setSpin(false)}>
        <div className="overlay">Drag to rotate · scroll to zoom · surface = Gaussian-process prediction · fog = uncertainty (model + distance from tested conditions) · dots = real FLEX tests</div>
        <div className="overlay" style={{ top: 'auto', bottom: 12, left: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>K {KR[0]}</span><span style={{ width: 140, height: 8, borderRadius: 4, background: 'linear-gradient(90deg,#1d3f99,#3f8ff0,#7fd3f7,#f2a541,#ffe7c2)' }} /><span>{KR[1]} mm²/s</span>
          <span style={{ marginLeft: 12 }}>{coveredPct}% of this map is well supported by tests</span>
        </div>
        <Canvas camera={{ position: [11.5, 7.8, 12.5], fov: 40 }} dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }}>
          <color attach="background" args={['#03050b']} />
          <fog attach="fog" args={['#03050b', 18, 34]} />
          <ambientLight intensity={0.5} /><directionalLight position={[6, 12, 6]} intensity={1.2} /><pointLight position={[-6, 5, -6]} intensity={0.8} color="#4f8de8" />
          <Surface grid={grid} />
          <Fog grid={grid} />
          <Axes />
          <TestedFootprint pts={fuelPts} />
          <gridHelper args={[10, 10, '#1b2540', '#111827']} />
          {fuelPts.map((p, i) => (
            <mesh key={i} position={[sx(Math.min(40, p.o2)), sy(p.K), sz(Math.min(30, p.p))]}>
              <sphereGeometry args={[near(p) ? 0.1 : 0.055, 14, 14]} />
              <meshBasicMaterial color={END_COLOR[p.end] || '#ffffff'} transparent opacity={near(p) ? 1 : 0.22} />
            </mesh>
          ))}
          {hab.o2 <= 40 && hab.psi <= 30 && <group>
            <Line points={[[sx(hab.o2), 0, sz(hab.psi)], [sx(hab.o2), H + 0.6, sz(hab.psi)]]} color="#F2A541" lineWidth={2.5} />
            <mesh position={[sx(hab.o2), sy(habA.mean), sz(hab.psi)]}><sphereGeometry args={[0.14, 20, 20]} /><meshBasicMaterial color="#F2A541" /></mesh>
            <Html position={[sx(hab.o2), H + 0.85, sz(hab.psi)]} center style={{ color: '#F2A541', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', pointerEvents: 'none' }}>{hab.name}</Html>
          </group>}
          {best.map((b, i) => (
            <group key={i} position={[sx(b.o2), sy(b.mean) + 0.03, sz(b.psi)]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.24, 0.36, 40]} /><meshBasicMaterial color="#5fd39a" side={THREE.DoubleSide} /></mesh>
              <Html position={[0, 0.5, 0]} center style={{ color: '#5fd39a', fontSize: 12, fontWeight: 600, pointerEvents: 'none' }}>#{i + 1}</Html>
            </group>
          ))}
          <OrbitControls enableDamping makeDefault target={[0, 1.4, 0]} autoRotate={spin} autoRotateSpeed={0.6} minDistance={7} maxDistance={26} maxPolarAngle={Math.PI * 0.49} />
        </Canvas>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="panel">
          <h2>Model inputs</h2>
          <div className="small muted" style={{ marginBottom: 8 }}>Droplet-flame burning rate learned from NASA FLEX (PSI-69). Move the sliders: the surface, fog and recommendations are recomputed live in your browser.</div>
          <label className="small">Fuel&nbsp;<select value={fuel} onChange={e => setFuel(e.target.value)}><option>Heptane</option><option>Methanol</option></select></label>
          <label className="slider" style={{ marginTop: 8 }}><span>CO₂ suppressant <b>{(co2 * 100).toFixed(0)}%</b> <span className="dim">(tested {m.trainRanges.co2.map(v => (v * 100).toFixed(0)).join('–')}%)</span></span>
            <input type="range" min="0" max="0.7" step="0.01" value={co2} onChange={e => setCo2(+e.target.value)} /></label>
          <label className="slider"><span>Helium diluent <b>{(he * 100).toFixed(0)}%</b> <span className="dim">(tested {m.trainRanges.he.map(v => (v * 100).toFixed(0)).join('–')}%)</span></span>
            <input type="range" min="0" max="0.45" step="0.01" value={he} onChange={e => setHe(+e.target.value)} /></label>
          <div className="legend" style={{ marginTop: 8 }}>
            <span><i style={{ background: '#ff6b5e' }} />extinguished</span><span><i style={{ background: '#5fd39a' }} />burned to completion</span><span><i style={{ background: '#c9c9c9' }} />disruption</span>
          </div>
        </div>

        <div className="panel">
          <h2>At {hab.name}</h2>
          {habA && <>
            <div className="stat">{habA.mean.toFixed(2)} <span style={{ fontSize: 14 }} className="muted">± {(1.96 * habA.std).toFixed(2)} mm²/s</span></div>
            <div className="small muted">Predicted {fuel.toLowerCase()} droplet burning rate (GP 95% interval) at {hab.o2}% O₂, {hab.psi} psi{co2 ? `, ${(co2 * 100).toFixed(0)}% CO₂` : ''}.</div>
            <div className="kv" style={{ marginTop: 8 }}>
              <div>Test support</div><div className={habA.support > 0.5 ? 'good' : habA.support > 0.15 ? 'warn' : 'alert'}>{(habA.support * 100).toFixed(0)}% <span className="dim">(nearness to a real test)</span></div>
              <div>Overall uncertainty</div><div className={habA.u < 0.4 ? 'good' : habA.u < 0.7 ? 'warn' : 'alert'}>{(habA.u * 100).toFixed(0)}%</div>
            </div>
            {habA.nearest && <div className="small muted" style={{ marginTop: 6 }}>Nearest real test: <b>{habA.nearest.o2.toFixed(0)}% O₂, {habA.nearest.p.toFixed(1)} psi</b>{habA.nearest.co2 ? `, ${(habA.nearest.co2 * 100).toFixed(0)}% CO₂` : ''} (FLEX {habA.nearest.id}, K = {habA.nearest.K} mm²/s, {habA.nearest.end.toLowerCase()}).</div>}
            <div className={'small ' + (habIn ? 'good' : habA.support > 0.5 ? 'warn' : 'alert')} style={{ marginTop: 6 }}>
              {habIn ? 'Inside the tested range: backed by nearby measurements.' : habA.support > 0.5 ? 'Short extrapolation: just outside the tested range, close to real tests. Use with care.' : 'Far beyond tested conditions: the GP interval understates the risk. Trust the fog, not the number.'}
            </div>
          </>}
          {hab.g > 0.01 && <div className="small warn" style={{ marginTop: 6 }}>All FLEX data is microgravity. At {hab.g.toFixed(2)} g, buoyancy adds convection, which generally raises burning rates; NASA researchers also suggest solid-material flame spread may peak near lunar gravity. Treat this as a microgravity reference, not a lunar prediction.</div>}
        </div>

        <div className="panel">
          <h2>Next-best experiments</h2>
          <div className="small muted">Most uncertain conditions (14–40% O₂, 4–22 psi), weighted toward {hab.name}. A test at #1 would reduce uncertainty the most.</div>
          <table className="t" style={{ marginTop: 6 }}><thead><tr><th>#</th><th>O₂ %</th><th>psi</th><th>pred. K</th><th>uncertainty</th></tr></thead>
            <tbody>{best.map((b, i) => <tr key={i}><td className="good">{i + 1}</td><td>{b.o2.toFixed(1)}</td><td>{b.psi.toFixed(1)}</td><td>{b.mean.toFixed(2)}</td><td>{(b.u * 100).toFixed(0)}%</td></tr>)}</tbody></table>
        </div>

        <div className="panel">
          <h2>How good is the model?</h2>
          <div className="small muted">5-fold cross-validation on {m.n} FLEX tests (each test predicted by a model that never saw it):</div>
          <div className="kv" style={{ marginTop: 6 }}>
            <div>R²</div><div>{m.cv.r2}</div>
            <div>Mean abs. error</div><div>{m.cv.mae} mm²/s</div>
            <div>95% interval hit rate</div><div>{(m.cv.coverage95 * 100).toFixed(1)}% <span className="dim">(ideal 95%)</span></div>
          </div>
          <div className="small dim" style={{ marginTop: 6 }}>Scope: liquid-fuel droplets only. PSI's solid-material tables don't record flame-spread rates, so solid flammability isn't modeled here.</div>
        </div>
      </div>
    </div>
  )
}
