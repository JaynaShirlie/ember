import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'

// Schematic (not to scale) 3D twin of the FLEX droplet-combustion setup: MDCA inside the CIR chamber.
// Geometry is representative; every number shown (droplet size, burning rate, extinction, atmosphere)
// comes from the selected FLEX test row in NASA PSI-69.

const PARTS = {
  chamber: { name: 'Combustion chamber (CIR)', text: 'The Combustion Integrated Rack (CIR) of the Fluids and Combustion Facility holds a sealed chamber filled with a controlled atmosphere. FLEX set the pressure (≈0.5–1.5 atm) and the O₂, N₂, CO₂ and He mole fractions for each test, as listed in the experimental table.' },
  needles: { name: 'Droplet deployment needles (MDCA)', text: 'The Multi-user Droplet Combustion Apparatus (MDCA) dispenses fuel through opposed needles to form a droplet, then retracts them. Many FLEX tests used free-floating droplets; others were fiber-supported. Some free droplets were given a slow drift to study sub-buoyant flow.' },
  droplet: { name: 'Fuel droplet', text: 'Initial diameter d₀ is measured per test (≈1–5 mm). As it burns the droplet shrinks following the d²-law: d² = d₀² − K·t, where K is the measured burning-rate constant.' },
  flame: { name: 'Spherical diffusion flame', text: 'Without buoyancy the flame forms a sphere around the droplet, fed by diffusion only. Large droplets can extinguish from radiative heat loss before burning out; FLEX recorded the visible extinction diameter. The shell here is drawn at a representative standoff ratio (illustrative); its timing is from data.' },
  igniters: { name: 'Hot-wire igniters', text: 'Igniters heat briefly to light the droplet, then retract so they do not disturb the flame.' },
  cameras: { name: 'Cameras & radiometer', text: 'Backlit imaging measures droplet diameter over time (giving K); flame imaging and radiometry capture flame size, extinction and radiative heat loss, which FLEX lists among its key measurements.' },
}

function Part({ id, sel, setSel, children, ...props }) {
  const [hov, setHov] = useState(false)
  return <group {...props} onClick={e => { e.stopPropagation(); setSel(id) }} onPointerOver={e => { e.stopPropagation(); setHov(true); document.body.style.cursor = 'pointer' }} onPointerOut={() => { setHov(false); document.body.style.cursor = '' }}>
    {children(hov || sel === id)}
  </group>
}

function Scene({ test, t, sel, setSel }) {
  const d0 = test.d0, K = test.K
  const d2 = Math.max(0, d0 * d0 - K * t)
  const d = Math.sqrt(d2)
  const extinct = test.dext != null && d <= test.dext
  const burning = d > 0.02 && !extinct
  const S = 0.55 // scene units per mm
  const flameR = (burning ? d * 2.6 : 0) * S // representative standoff ~5.2 diameters
  const flicker = useRef()
  useFrame(({ clock }) => { if (flicker.current) flicker.current.material.opacity = burning ? 0.55 + 0.08 * Math.sin(clock.elapsedTime * 9) : 0 })
  const glowCol = test.co2 > 0.05 ? '#5a8cff' : '#4f8de8'
  return <>
    <Part id="chamber" sel={sel} setSel={setSel}>{h => <mesh rotation={[0, 0, 0]}><cylinderGeometry args={[4, 4, 6.4, 48, 1, true]} /><meshStandardMaterial color={h ? '#7fd3f7' : '#3a4e78'} transparent opacity={h ? 0.16 : 0.08} side={THREE.DoubleSide} /></mesh>}</Part>
    <mesh position={[0, 3.2, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[4, 0.04, 8, 64]} /><meshBasicMaterial color="#3a4e78" /></mesh>
    <mesh position={[0, -3.2, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[4, 0.04, 8, 64]} /><meshBasicMaterial color="#3a4e78" /></mesh>
    <Part id="needles" sel={sel} setSel={setSel}>{h => <group>
      {[-1, 1].map(s => <mesh key={s} position={[s * (t < 0.6 ? 0.6 : 2.6), 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.04, 0.06, 2.6, 12]} /><meshStandardMaterial color={h ? '#f2a541' : '#9aa6bf'} metalness={0.8} roughness={0.3} /></mesh>)}
    </group>}</Part>
    <Part id="igniters" sel={sel} setSel={setSel}>{h => <group>
      {[-1, 1].map(s => <mesh key={s} position={[0, s * (t < 0.4 ? 0.9 : 2.4), 0.6]}><torusGeometry args={[0.18, 0.03, 8, 24]} /><meshStandardMaterial color={t < 0.4 ? '#ff7a3d' : h ? '#f2a541' : '#7c87a0'} emissive={t < 0.4 ? '#ff4d00' : '#000'} /></mesh>)}
    </group>}</Part>
    <Part id="droplet" sel={sel} setSel={setSel}>{h => <mesh><sphereGeometry args={[Math.max(0.02, d * S / 2), 32, 32]} /><meshStandardMaterial color={h ? '#ffe2a8' : '#e9d9b5'} roughness={0.15} metalness={0.1} /></mesh>}</Part>
    <Part id="flame" sel={sel} setSel={setSel}>{h => <group>
      <mesh ref={flicker}><sphereGeometry args={[Math.max(0.001, flameR), 48, 48]} /><meshBasicMaterial color={h ? '#a9d4ff' : glowCol} transparent opacity={0.55} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
      <mesh><sphereGeometry args={[Math.max(0.001, flameR * 0.96), 48, 48]} /><meshBasicMaterial color="#1d3f8f" transparent opacity={burning ? 0.25 : 0} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
    </group>}</Part>
    <Part id="cameras" sel={sel} setSel={setSel}>{h => <group>
      {[[0, 0, 4.6], [4.6, 0, 0], [-3.3, 0, -3.3]].map((p, i) => <mesh key={i} position={p}><boxGeometry args={[0.7, 0.5, 0.9]} /><meshStandardMaterial color={h ? '#f2a541' : '#2a3a5c'} /></mesh>)}
    </group>}</Part>
    {burning && <pointLight intensity={2.5} distance={6} color="#6aa0ff" />}
  </>
}

export default function Twin({ data }) {
  const flex = useMemo(() => data.tests.filter(t => t.inv === 'PSI-69' && t.out?.d0_mm && t.out?.K_mm2s), [data])
  const [idx, setIdx] = useState(() => Math.max(0, flex.findIndex(t => t.out.end === 'Extinction' && t.out.dext_mm)))
  const [sel, setSel] = useState('flame')
  const [t, setT] = useState(0)
  const [play, setPlay] = useState(true)
  const raw = flex[idx]
  const test = { d0: raw.out.d0_mm, K: raw.out.K_mm2s, dext: raw.out.dext_mm, co2: raw.co2 || 0, he: raw.he || 0 }
  const tEnd = test.dext != null ? (test.d0 ** 2 - test.dext ** 2) / test.K : test.d0 ** 2 / test.K
  const tShow = Math.min(t, tEnd)
  const dNow = Math.sqrt(Math.max(0, test.d0 ** 2 - test.K * tShow))
  const speed = Math.max(1, tEnd / 8)

  useEffect(() => { setT(0); setPlay(true) }, [idx])
  useEffect(() => {
    if (!play) return
    let raf, last = performance.now()
    const step = now => { setT(v => { const nv = v + (now - last) / 1000 * speed; return nv > tEnd + 1.5 * speed ? 0 : nv }); last = now; raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf)
  }, [play, speed, tEnd])

  // d² vs t chart from this test's measured values
  const W = 300, H = 150, pad = 30
  const xs = v => pad + v / (tEnd * 1.08) * (W - pad - 8), ys = v => H - pad + 6 - v / (test.d0 ** 2) * (H - pad - 12)

  return (
    <div className="grid-main">
      <div className="canvas3d">
        <div className="overlay">Schematic 3D twin (not to scale) · click any part · playback uses this test's measured values</div>
        <Canvas camera={{ position: [5.5, 3.2, 7.5], fov: 45 }} onPointerMissed={() => {}}>
          <color attach="background" args={['#03050b']} />
          <ambientLight intensity={0.5} /><directionalLight position={[5, 8, 5]} intensity={0.9} />
          <Scene test={test} t={tShow} sel={sel} setSel={setSel} />
          <Html position={[0, -3.9, 0]} center style={{ color: '#aeb9cf', fontSize: 12, whiteSpace: 'nowrap' }}>
            t = {tShow.toFixed(1)} s · d = {dNow.toFixed(2)} mm {tShow >= tEnd ? (test.dext != null ? '· flame extinguished' : '· burned out') : ''}
          </Html>
          <OrbitControls enableDamping makeDefault />
        </Canvas>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="panel">
          <h2>Pick a real FLEX test ({flex.length})</h2>
          <select value={idx} onChange={e => setIdx(+e.target.value)} style={{ width: '100%' }}>
            {flex.map((f, i) => <option key={f.id} value={i}>{f.out.flexId} · {f.fuel} · {f.o2Pct?.toFixed(0)}% O₂ · {f.pressurePsi?.toFixed(1)} psi{f.co2 ? ` · ${(f.co2 * 100).toFixed(0)}% CO₂` : ''}{f.he ? ` · ${(f.he * 100).toFixed(0)}% He` : ''} · {f.out.end}</option>)}
          </select>
          <div className="kv" style={{ marginTop: 10 }}>
            <div>Atmosphere</div><div>{raw.o2Pct?.toFixed(1)}% O₂ · {raw.pressurePsi?.toFixed(2)} psi{raw.co2 ? ` · ${(raw.co2 * 100).toFixed(0)}% CO₂` : ''}{raw.he ? ` · ${(raw.he * 100).toFixed(0)}% He` : ''}</div>
            <div>Initial diameter d₀</div><div>{test.d0} mm</div>
            <div>Burning rate K</div><div>{test.K} mm²/s</div>
            <div>Extinction diam.</div><div>{test.dext != null ? test.dext + ' mm' : 'not observed'}</div>
            <div>Recorded burn time</div><div>{raw.out.burn_s ?? '—'} s <span className="dim">(d²-law estimate {tEnd.toFixed(1)} s)</span></div>
            <div>Outcome</div><div className={raw.out.end === 'Extinction' ? 'alert' : 'good'}>{raw.out.end}</div>
            <div>FLEX test id</div><div>{raw.out.flexId} · PSI-69</div>
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => setPlay(p => !p)}>{play ? 'Pause' : 'Play'}</button>
            <button className="btn" onClick={() => setT(0)}>Restart</button>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', marginTop: 8 }}>
            <line x1={pad} y1={H - pad + 6} x2={W - 8} y2={H - pad + 6} stroke="#3a4e78" /><line x1={pad} y1={8} x2={pad} y2={H - pad + 6} stroke="#3a4e78" />
            <line x1={xs(0)} y1={ys(test.d0 ** 2)} x2={xs(tEnd)} y2={ys(Math.max(0, test.d0 ** 2 - test.K * tEnd))} stroke="#4f8de8" strokeWidth="2" />
            {test.dext != null && <line x1={pad} x2={W - 8} y1={ys(test.dext ** 2)} y2={ys(test.dext ** 2)} stroke="#ff6b5e" strokeDasharray="4 3" />}
            <circle cx={xs(tShow)} cy={ys(dNow ** 2)} r="4" fill="#f2a541" />
            <text x={pad} y={H - 6} fill="#7c87a0" fontSize="10">0 s</text><text x={W - 8} y={H - 6} fill="#7c87a0" fontSize="10" textAnchor="end">{tEnd.toFixed(1)} s</text>
            <text x={pad + 4} y={16} fill="#7c87a0" fontSize="10">d² (mm²)</text>
            {test.dext != null && <text x={W - 10} y={ys(test.dext ** 2) - 4} fill="#ff6b5e" fontSize="10" textAnchor="end">extinction</text>}
          </svg>
        </div>
        <div className="panel">
          <h2>{PARTS[sel].name}</h2>
          <div className="small muted">{PARTS[sel].text}</div>
          <div className="small dim" style={{ marginTop: 8 }}>Part descriptions are based on the PSI-69 FLEX objective, approach and hardware fields.</div>
        </div>
      </div>
    </div>
  )
}
