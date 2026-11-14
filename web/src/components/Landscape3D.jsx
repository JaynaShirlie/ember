import React, { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { makeGP, nextBestExperiments } from '../lib/gp.js'

// Axes: X = oxygen %, Z = pressure psi, Y = predicted burning-rate constant K (mm²/s)
const O2R = [10, 40], PR = [3, 30], KMAX = 1.2, N = 44
const sx = o2 => ((o2 - O2R[0]) / (O2R[1] - O2R[0]) - 0.5) * 10
const sz = p => ((p - PR[0]) / (PR[1] - PR[0]) - 0.5) * 10
const sy = k => Math.max(0, k) / KMAX * 4
const END_COLOR = { Extinction: '#ff6b5e', Completion: '#5fd39a', Disruption: '#c9c9c9' }

function ramp(t) { // blue -> cyan -> amber
  const a = new THREE.Color('#2b5cc4'), b = new THREE.Color('#7fd3f7'), c = new THREE.Color('#f2a541')
  return t < 0.5 ? a.lerp(b, t * 2) : b.clone().lerp(c, (t - 0.5) * 2)
}

function Surface({ grid }) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = [], col = [], idx = []
    const fog = new THREE.Color('#2a3045')
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const c = grid[i * N + j]
      pos.push(sx(c.o2), sy(c.mean), sz(c.psi))
      const k = ramp(Math.min(1, Math.max(0, c.mean / KMAX)))
      k.lerp(fog, Math.min(1, c.u * 1.1)) // uncertainty fades the colour into fog
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
  return <mesh geometry={geom}><meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.6} metalness={0.05} transparent opacity={0.92} /></mesh>
}

function Fog({ grid }) {
  const geom = useMemo(() => {
    const pos = []
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (const c of grid) {
      const n = Math.floor(c.u * c.u * 7)
      for (let k = 0; k < n; k++) pos.push(sx(c.o2) + (rnd() - 0.5) * 0.4, sy(c.mean) + rnd() * 1.2 * c.u, sz(c.psi) + (rnd() - 0.5) * 0.4)
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g
  }, [grid])
  return <points geometry={geom}><pointsMaterial size={0.09} color="#c8d3ea" transparent opacity={0.28} depthWrite={false} /></points>
}

function Axes() {
  const ticksO2 = [10, 15, 20, 25, 30, 35, 40], ticksP = [5, 10, 15, 20, 25, 30]
  return <group>
    <Line points={[[-5, 0, 5.2], [5, 0, 5.2]]} color="#3a4e78" />
    <Line points={[[-5.2, 0, -5], [-5.2, 0, 5]]} color="#3a4e78" />
    <Line points={[[-5.2, 0, 5.2], [-5.2, 4.2, 5.2]]} color="#3a4e78" />
    {ticksO2.map(t => <Html key={'o' + t} position={[sx(t), 0, 5.6]} center style={{ color: '#7c87a0', fontSize: 11 }}>{t}</Html>)}
    {ticksP.map(t => <Html key={'p' + t} position={[-5.7, 0, sz(t)]} center style={{ color: '#7c87a0', fontSize: 11 }}>{t}</Html>)}
    {[0, 0.4, 0.8, 1.2].map(t => <Html key={'k' + t} position={[-5.6, sy(t), 5.2]} center style={{ color: '#7c87a0', fontSize: 11 }}>{t}</Html>)}
    <Html position={[0, 0, 6.3]} center style={{ color: '#aeb9cf', fontSize: 12, whiteSpace: 'nowrap' }}>Oxygen (%)</Html>
    <Html position={[-6.6, 0, 0]} center style={{ color: '#aeb9cf', fontSize: 12, whiteSpace: 'nowrap' }}>Pressure (psi)</Html>
    <Html position={[-5.4, 4.7, 5.2]} center style={{ color: '#aeb9cf', fontSize: 12, whiteSpace: 'nowrap' }}>Burning rate K (mm²/s)</Html>
  </group>
}

export default function Landscape({ data, hab }) {
  const gp = useMemo(() => makeGP(data.gp), [data])
  const m = data.gp
  const [fuel, setFuel] = useState('Heptane')
  const [co2, setCo2] = useState(0)
  const [he, setHe] = useState(0)

  const grid = useMemo(() => {
    const g = []; let smax = 0
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const o2 = O2R[0] + (O2R[1] - O2R[0]) * i / (N - 1), psi = PR[0] + (PR[1] - PR[0]) * j / (N - 1)
      const r = gp.predict([o2 / 100, psi / 14.696, co2, he, fuel === 'Heptane' ? 1 : 0])
      g.push({ o2, psi, ...r }); smax = Math.max(smax, r.std)
    }
    const prior = Math.sqrt(m.constant) * m.yStd // uncertainty far from all data
    for (const c of g) c.u = Math.min(1, c.std / prior)
    return g
  }, [gp, fuel, co2, he, m])

  const best = useMemo(() => nextBestExperiments(gp, { fuel, co2, he, o2Range: [14, 40], pRange: [4, 22] }), [gp, fuel, co2, he])
  const habPred = hab.o2 <= 100 ? gp.predict([hab.o2 / 100, hab.psi / 14.696, co2, he, fuel === 'Heptane' ? 1 : 0]) : null
  const habIn = gp.inRange([hab.o2 / 100, hab.psi / 14.696, co2, he, fuel === 'Heptane' ? 1 : 0])
  const pts = m.points.filter(p => p.fuel === fuel)
  const near = p => Math.abs(p.co2 - co2) <= 0.06 && Math.abs(p.he - he) <= 0.06
  const prior = Math.sqrt(m.constant) * m.yStd

  return (
    <div className="grid-main">
      <div className="canvas3d">
        <div className="overlay">Drag to rotate · scroll to zoom · surface = Gaussian-process prediction · fog = model uncertainty · dots = real FLEX tests</div>
        <Canvas camera={{ position: [9, 7.5, 10], fov: 42 }}>
          <color attach="background" args={['#03050b']} />
          <ambientLight intensity={0.55} /><directionalLight position={[6, 10, 4]} intensity={1.1} /><pointLight position={[-6, 4, -6]} intensity={0.6} color="#4f8de8" />
          <Surface grid={grid} />
          <Fog grid={grid} />
          <Axes />
          <gridHelper args={[10, 10, '#1b2540', '#121a2e']} position={[0, 0, 0]} />
          {pts.map((p, i) => (
            <mesh key={i} position={[sx(Math.min(40, p.o2)), sy(p.K), sz(Math.min(30, p.p))]}>
              <sphereGeometry args={[near(p) ? 0.09 : 0.05, 12, 12]} />
              <meshBasicMaterial color={END_COLOR[p.end] || '#ffffff'} transparent opacity={near(p) ? 1 : 0.25} />
            </mesh>
          ))}
          {hab.o2 <= 40 && hab.psi <= 30 && <group>
            <Line points={[[sx(hab.o2), 0, sz(hab.psi)], [sx(hab.o2), 4.4, sz(hab.psi)]]} color="#F2A541" lineWidth={2} />
            <Html position={[sx(hab.o2), 4.6, sz(hab.psi)]} center style={{ color: '#F2A541', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{hab.name}</Html>
          </group>}
          {best.map((b, i) => (
            <group key={i} position={[sx(b.o2), sy(b.mean) + 0.02, sz(b.psi)]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.22, 0.32, 32]} /><meshBasicMaterial color="#5fd39a" side={THREE.DoubleSide} /></mesh>
              <Html position={[0, 0.45, 0]} center style={{ color: '#5fd39a', fontSize: 11, fontWeight: 600 }}>#{i + 1}</Html>
            </group>
          ))}
          <OrbitControls enableDamping makeDefault target={[0, 1.2, 0]} />
        </Canvas>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="panel">
          <h2>Model inputs</h2>
          <div className="small muted" style={{ marginBottom: 8 }}>Droplet-flame burning rate learned from NASA FLEX (PSI-69) tests. Move the sliders: the surface is recomputed live in your browser.</div>
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
          {habPred && <>
            <div className="stat">{habPred.mean.toFixed(2)} <span style={{ fontSize: 14 }} className="muted">± {(1.96 * habPred.std).toFixed(2)} mm²/s</span></div>
            <div className="small muted">Predicted {fuel.toLowerCase()} droplet burning rate (95% interval) at {hab.o2}% O₂, {hab.psi} psi{co2 ? `, ${(co2 * 100).toFixed(0)}% CO₂` : ''}.</div>
            <div className={'small ' + (habIn ? 'good' : 'warn')} style={{ marginTop: 6 }}>
              {habIn ? 'Inside the range of tested conditions.' : 'Outside the tested range: this is an extrapolation, so trust the uncertainty, not the number.'}
              {' '}Uncertainty is {(100 * habPred.std / prior).toFixed(0)}% of the no-data level.
            </div>
          </>}
          {hab.g > 0.01 && <div className="small warn" style={{ marginTop: 6 }}>All FLEX data is microgravity. At {hab.g.toFixed(2)} g, buoyancy adds convection, which generally raises burning rates; NASA researchers also suggest solid-material flame spread may peak near lunar gravity. Treat this as a microgravity reference, not a lunar prediction.</div>}
        </div>

        <div className="panel">
          <h2>Next-best experiments</h2>
          <div className="small muted">Conditions (14–40% O₂, 4–22 psi) where the model is most uncertain, so a new test there would teach the most.</div>
          <table className="t" style={{ marginTop: 6 }}><thead><tr><th>#</th><th>O₂ %</th><th>psi</th><th>pred. K</th><th>± (95%)</th></tr></thead>
            <tbody>{best.map((b, i) => <tr key={i}><td className="good">{i + 1}</td><td>{b.o2.toFixed(1)}</td><td>{b.psi.toFixed(1)}</td><td>{b.mean.toFixed(2)}</td><td>{(1.96 * b.std).toFixed(2)}</td></tr>)}</tbody></table>
        </div>

        <div className="panel">
          <h2>How good is the model?</h2>
          <div className="small muted">Checked by 5-fold cross-validation on {m.n} FLEX tests (each test predicted by a model that never saw it):</div>
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
