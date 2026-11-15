import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html, Edges, Line } from '@react-three/drei'
import * as THREE from 'three'
import { HABITAT_SCENES, hostOf, apparatusOf, cm, widthFromName } from '../lib/scenes.js'
import { FlameShell } from '../lib/flame.jsx'
import { zoneStats } from '../lib/score.js'
import { HABITATS } from '../lib/habitats.js'
import { askCopilot } from './Copilot.jsx'

// Stark-Expo-style holographic explorer. Habitats are procedural (approximate public dimensions);
// experiment apparatus is generated on the spot from the selected PSI test row's recorded values.
// SI disclosure: written with assistance from Claude (Anthropic).
const HOLO = '#7fd3f7', HOT = '#f2a541', S = 0.25 // metres -> scene units for habitats

function HoloMat({ hot, hover }) {
  return <meshBasicMaterial color={hot ? HOT : HOLO} transparent opacity={hot ? 0.22 : hover ? 0.16 : 0.07} depthWrite={false} side={THREE.DoubleSide} />
}
function Geo({ p, lo }) {
  if (p.kind === 'cyl') return <cylinderGeometry args={[p.dia * S / 2, p.dia * S / 2, p.len * S, lo ? 12 : 28, lo ? Math.max(2, Math.round(p.len / 1.5)) : 1]} />
  if (p.kind === 'dome') return <sphereGeometry args={[p.dia * S / 2, lo ? 14 : 28, lo ? 6 : 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
  if (p.kind === 'box') return <boxGeometry args={p.size.map(v => v * S)} />
  return null
}
const ROT = { x: [0, 0, Math.PI / 2], y: [0, 0, 0], z: [Math.PI / 2, 0, 0] }

function Part({ p, center, explode, selected, hosting, onPick }) {
  const g = useRef(), [hover, setHover] = useState(false)
  const base = p.pos.map(v => v * S)
  const dir = base.map((v, i) => v - center[i]); const len = Math.hypot(...dir) || 1
  const target = explode ? base.map((v, i) => v + dir[i] / len * (2.2 + len * 0.6)) : base
  useFrame(() => { if (g.current) g.current.position.lerp(new THREE.Vector3(...target), 0.08) })
  const hot = selected || hosting
  const events = { onClick: e => { e.stopPropagation(); onPick(p.id) }, onPointerOver: e => { e.stopPropagation(); setHover(true) }, onPointerOut: () => setHover(false) }
  let body
  if (p.kind === 'arrays') {
    body = <group>{[-1, 1].flatMap(side => [0.62, 0.92].map(f => (
      <group key={side + '' + f} position={[0, 0, side * 45 * S * f]}>
        {[-1, 1].map(k => <mesh key={k} position={[k * 6.5 * S, 0, 0]} {...events}><boxGeometry args={[11 * S, 0.05, 4 * S]} /><HoloMat hot={hot} hover={hover} /><Edges color={hot ? HOT : HOLO} /></mesh>)}
      </group>)))}</group>
  } else if (p.kind === 'chassis') {
    body = <group {...events}>{[-2, 0, 2].flatMap(x => [-1.6, 1.6].map(z => <mesh key={x + ',' + z} position={[x * 0.9 * S * 4, 0, z * S * 4 * 0.5]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.55 * S * 4 * 0.5, 0.55 * S * 4 * 0.5, 0.4, 20]} /><HoloMat hot={hot} hover={hover} /><Edges color={hot ? HOT : HOLO} /></mesh>))}</group>
  } else {
    body = <group rotation={ROT[p.axis] || [0, 0, 0]}>
      <mesh {...events}><Geo p={p} /><HoloMat hot={hot} hover={hover} /><Edges color={hot ? HOT : HOLO} threshold={20} /></mesh>
      {p.kind !== 'box' && <mesh><Geo p={p} lo /><meshBasicMaterial color={hot ? HOT : HOLO} wireframe transparent opacity={hot ? 0.45 : hover ? 0.35 : 0.2} depthWrite={false} /></mesh>}
    </group>
  }
  return <group ref={g} position={base}>
    {body}
    {(hover || selected || hosting || explode) && <Html center position={[0, (p.dia || 3) * S * 0.75 + 0.25, 0]} style={{ pointerEvents: 'none' }}>
      <div className={'holo-label' + (hot ? ' hot' : '')}>{p.name}{hosting ? ' · hosts this experiment' : ''}</div></Html>}
  </group>
}

function Habitat({ scene, explode, selected, onPick, host }) {
  const pts = scene.parts.filter(p => p.pos)
  const center = useMemo(() => [0, 1, 2].map(i => pts.reduce((a, p) => a + p.pos[i] * S, 0) / pts.length), [scene])
  return <group>{scene.parts.map(p => <Part key={p.id} p={p} center={center} explode={explode} selected={selected === p.id} hosting={!!host && p.host?.includes(host)} onPick={onPick} />)}</group>
}

// ---------- apparatus generated from a test row ----------
function Flow({ length, speed, z0 = 0, count = 40, spread = 1, dir = 1 }) {
  const ref = useRef()
  const seeds = useMemo(() => Array.from({ length: count }, () => [Math.random() * length - length / 2, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread]), [count, length, spread])
  useFrame((_, dt) => {
    if (!ref.current) return
    ref.current.children.forEach((m, i) => { m.position.x += dir * dt * Math.max(0.15, speed); if (m.position.x > length / 2) m.position.x = -length / 2; if (m.position.x < -length / 2) m.position.x = length / 2 })
  })
  return <group ref={ref} position={[0, 0, z0]}>{seeds.map((s, i) => <mesh key={i} position={s}><sphereGeometry args={[0.025, 6, 6]} /><meshBasicMaterial color="#9fdcff" transparent opacity={0.7} /></mesh>)}</group>
}
const Label = ({ position, children, hot }) => <Html center position={position} style={{ pointerEvents: 'none' }}><div className={'holo-label' + (hot ? ' hot' : '')}>{children}</div></Html>

function Apparatus({ kind, inv, row, onPart }) {
  const o = row?.out || {}
  const click = (id, text) => ({ onClick: e => { e.stopPropagation(); onPart({ id, text }) } })
  const duct = (L, Hh) => <mesh {...click('duct', 'Flow duct (schematic size). Air is pushed past the sample at the recorded speed.')}><boxGeometry args={[L, Hh, Hh]} /><meshBasicMaterial color={HOLO} transparent opacity={0.05} depthWrite={false} /><Edges color={HOLO} /></mesh>
  if (kind === 'droplet') {
    const d0 = o.d0_mm || 3, r = 0.35
    return <group>
      <mesh {...click('chamber', 'CIR combustion chamber filled with the recorded gas mixture.')}><cylinderGeometry args={[2.4, 2.4, 3.6, 40, 1, true]} /><meshBasicMaterial color={HOLO} transparent opacity={0.05} side={THREE.DoubleSide} depthWrite={false} /><Edges color={HOLO} /></mesh>
      <mesh {...click('droplet', `Fuel droplet: ${row.fuel}, initial diameter ${d0} mm${o.K_mm2s ? `, burning-rate constant ${o.K_mm2s} mm²/s` : ''}.`)}><sphereGeometry args={[r, 32, 32]} /><meshStandardMaterial color="#e9d9b5" roughness={0.2} /></mesh>
      <group {...click('flame', `Spherical diffusion flame (standoff illustrative). ${o.dext_mm != null ? `Recorded extinction at ${o.dext_mm} mm droplet diameter.` : ''} Outcome: ${o.end || 'n/a'}.`)}><FlameShell radius={r * 5} color={(row.co2 || 0) > 0.05 ? '#6f95ff' : '#4f8de8'} /></group>
      {[-1, 1].map(s => <mesh key={s} position={[s * 2.2, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.03, 0.04, 1.6, 10]} /><meshStandardMaterial color="#9aa6bf" /></mesh>)}
      <Label position={[0, 2.25, 0]}>d₀ {d0} mm · {row.o2Pct?.toFixed(1)}% O₂ · {row.pressurePsi?.toFixed(1)} psi{row.co2 ? ` · ${(row.co2 * 100).toFixed(0)}% CO₂` : ''}{row.he ? ` · ${(row.he * 100).toFixed(0)}% He` : ''}</Label>
    </group>
  }
  if (kind === 'burner') {
    const inverse = /inverse/.test(row.config || '')
    return <group>
      <mesh {...click('chamber', 'ACME chamber in the Combustion Integrated Rack.')}><cylinderGeometry args={[2.4, 2.4, 3.6, 40, 1, true]} /><meshBasicMaterial color={HOLO} transparent opacity={0.05} side={THREE.DoubleSide} depthWrite={false} /><Edges color={HOLO} /></mesh>
      <mesh {...click('burner', `Porous spherical burner. ${inverse ? 'Inverse flame: oxidizer flows OUT of the burner into a fuel atmosphere.' : 'Normal flame: fuel flows out into the oxidizer.'}`)}><sphereGeometry args={[0.3, 24, 24]} /><meshStandardMaterial color="#8a6a4a" roughness={0.9} /></mesh>
      <mesh position={[0, -1.1, 0]}><cylinderGeometry args={[0.05, 0.05, 1.6, 10]} /><meshStandardMaterial color="#9aa6bf" /></mesh>
      <group {...click('flame', `Spherical ${inverse ? 'inverse' : 'normal'} diffusion flame. Fuel: ${row.fuel}. Hot ignition: ${o.hotIgnition ?? 'n/a'}.`)}><FlameShell radius={inverse ? 0.7 : 1.15} color={String(o.coolFlame || '').toLowerCase() === 'yes' ? '#9b7bff' : '#4f8de8'} /></group>
      <Label position={[0, 2.25, 0]}>{row.fuel} · {row.o2Pct?.toFixed(1)}% O₂{inverse ? ' (oxidizer stream)' : ''} · {row.pressurePsi ? row.pressurePsi.toFixed(1) + ' psi' : 'pressure n/a'}</Label>
    </group>
  }
  if (kind === 'saffire') {
    const L = (cm(o.length) || 94) / 25, W = (cm(o.width) || 40.6) / 25, flow = row.flowCmS || 20
    const opposed = /opposed/i.test(o.direction || '')
    return <group>
      {duct(6.5, 2.6)}
      <mesh {...click('sample', `Sample card: ${row.fuel}, thickness ${o.thickness || 'n/a'}. Size from the PSI record: ${o.length || '?'} × ${o.width || '?'}.`)}><boxGeometry args={[L, 0.02, W]} /><meshStandardMaterial color="#d9c7a3" side={THREE.DoubleSide} /></mesh>
      <Flow length={6.4} speed={flow / 12} spread={2.2} count={60} />
      <group position={[opposed ? L / 2 - 0.2 : -L / 2 + 0.2, 0.12, 0]} {...click('flame', `${opposed ? 'Opposed' : 'Concurrent'}-flow flame front: it spreads ${opposed ? 'against' : 'with'} the ${flow} cm/s air flow.`)}><FlameShell radius={0.35} scale={[0.6, 0.5, W * 1.3]} color={HOT} intensity={1.1} /></group>
      <Label position={[0, 1.6, 0]}>{row.table} · {row.fuel} · air {flow} cm/s {opposed ? '(opposed)' : '(concurrent)'} · {row.o2Pct?.toFixed(1)}% O₂</Label>
    </group>
  }
  if (kind === 'bass') {
    const w = (widthFromName(row.fuel) || 2) / 4
    return <group>
      {duct(5, 1.6)}
      <mesh {...click('sample', `Sample: ${row.fuel}. Width parsed from the PSI record.`)}><boxGeometry args={[1.8, 0.015, w]} /><meshStandardMaterial color="#d9c7a3" side={THREE.DoubleSide} /></mesh>
      <Flow length={4.9} speed={0.6} spread={1.4} count={45} />
      <group position={[0.9, 0.08, 0]} {...click('flame', 'BASS reported that flames in microgravity burn as "oval balls" rather than upward cones.')}><FlameShell radius={0.4} scale={[1.2, 0.8, 1]} color={HOT} intensity={1.1} /></group>
      <Label position={[0, 1.2, 0]}>{row.table} · {row.fuel} · {row.o2Pct != null ? row.o2Pct.toFixed(1) + '% O₂' : 'O₂ n/a'}{o.fanDisplay ? ` · fan setting ${o.fanDisplay}` : ''}</Label>
    </group>
  }
  if (kind === 'coflow') {
    const air = row.flowCmS || 20
    return <group>
      {duct(5, 1.6)}
      <mesh position={[-1.6, 0, 0]} rotation={[0, 0, Math.PI / 2]} {...click('nozzle', `Fuel nozzle${o.nozzle_mm ? ` ${o.nozzle_mm.toFixed(2)} mm` : ''}; fuel ${row.fuel}${o.fuelRate_mg_s ? ` at ${o.fuelRate_mg_s} mg/s` : ''}.`)}><cylinderGeometry args={[0.06, 0.06, 0.9, 16]} /><meshStandardMaterial color="#9aa6bf" /></mesh>
      <group position={[-0.6, 0, 0]} {...click('flame', 'Co-flow jet diffusion flame: SPICE measured when it starts to emit soot (the smoke point).')}><FlameShell radius={0.3} scale={[3.2, 0.7, 0.7]} color={HOT} intensity={1.2} /></group>
      <Flow length={4.9} speed={air / 25} spread={1.4} count={45} />
      <Label position={[0, 1.2, 0]}>{row.table} · {row.fuel} · co-flow air {air?.toFixed?.(1) ?? air} cm/s</Label>
    </group>
  }
  if (kind === 'smoke') {
    const v = row.flowCmS || 8
    return <group>
      {duct(5, 1.6)}
      <mesh {...click('sample', `Heated sample: ${row.fuel}. SAME heated materials until they smoked, then measured particle sizes.`)}><boxGeometry args={[0.5, 0.15, 0.3]} /><meshStandardMaterial color="#c9a36b" /></mesh>
      <Flow length={4.9} speed={v / 10} spread={0.6} count={70} />
      <Label position={[0, 1.2, 0]}>{row.table} · {row.fuel} · inlet {v} cm/s</Label>
    </group>
  }
  return <Label position={[0, 0, 0]}>This investigation's table has no apparatus geometry to reconstruct.</Label>
}

// ---------- photoreal machine pages (Machine Skill kit, public/machines/*.html), driven over a same-origin bridge ----------
const MACHINES = { droplet: '/machines/flex.html', burner: '/machines/acme.html', saffire: '/machines/saffire.html', bass: '/machines/msg.html', coflow: '/machines/msg.html' }
const HAB_MACHINES = { iss: '/machines/iss.html', moon: '/machines/moon.html', rover: '/machines/rover.html' }
const ANY_HOST = ['CIR', 'MSG', 'CYGNUS']
// parts of the ISS page that hosted combustion experiments -> the facility codes used by hostOf()
const PART_HOSTS = { 'Combustion Integrated Rack': ['CIR'], 'Microgravity Science Glovebox': ['MSG'], 'Destiny laboratory': ['CIR', 'MSG'], 'Saffire flow unit': ['CYGNUS'], 'Cygnus cargo vehicle': ['CYGNUS'], 'Science lab': ANY_HOST, 'Combustion glovebox': ANY_HOST }
const MODES = ['cut', 'xray', 'labels', 'explode']
// Double-buffered: a new apparatus page loads hidden under the current one and fades in only once it has
// drawn frames, so switching experiments never shows an empty (black) page while three.js loads.
function MachineFrame(props) {
  const { src, whatIf, onPart, zone } = props
  const [layers, setLayers] = useState(() => [{ src, id: 0, shown: false }])
  // the page reads models from window.EMBER (parent); numbers always come from EMBER's what-if engine
  useEffect(() => { window.EMBER = { whatIf, onPart, zone, onReady: () => {} }; return () => { delete window.EMBER } }, [whatIf, onPart, zone])
  useEffect(() => { setLayers(L => L[L.length - 1].src === src ? L : [...L, { src, id: L[L.length - 1].id + 1, shown: false }]) }, [src])
  const onShown = useCallback(id => setLayers(L => L.filter(l => l.id >= id).map(l => l.id === id ? { ...l, shown: true } : l)), [])
  const top = layers[layers.length - 1]
  return <div style={{ position: 'absolute', inset: 0, background: '#0d0e10', borderRadius: 'inherit', overflow: 'hidden' }}>
    {!layers.some(l => l.shown) && <div className="small" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#8e8c86' }}>Loading 3D…</div>}
    {layers.map(l => <MachineLayer key={l.id} {...props} src={l.src} id={l.id} live={l.id === top.id} onShown={onShown} />)}
  </div>
}

function MachineLayer({ src, id, live, onShown, row, hab, show, applyKey, follow }) {
  const ref = useRef(null), [ready, setReady] = useState(false), [shown, setShown] = useState(false)
  const m = () => { try { return ref.current?.contentWindow?.EMBER_MACHINE } catch { return null } }
  const onLoad = () => {
    const t0 = performance.now()
    const poll = () => {
      let w = null; try { w = ref.current?.contentWindow } catch { /* gone */ }
      if (!w) return
      const lab = w.__lab
      // reveal after the page has rendered a few frames (or after 4 s as a fallback)
      if (w.EMBER_MACHINE && lab && (lab.time > 0.25 || performance.now() - t0 > 4000)) { setReady(true); return }
      setTimeout(poll, 80)
    }
    poll()
  }
  useEffect(() => { if (live && ready && row) m()?.setRow(row) }, [live, ready, row])
  // fade in a moment after the row is applied, so the old model stays up until the new one is built
  useEffect(() => { if (!ready || shown) return; const t = setTimeout(() => { setShown(true); onShown(id) }, 300); return () => clearTimeout(t) }, [ready, shown])
  useEffect(() => { if (live && ready && applyKey) m()?.setScenario({ o2: hab.o2, psi: hab.psi, name: hab.name }) }, [live, ready, applyKey])
  // habitat pages follow the scenario row: the cabin air is the scenario
  useEffect(() => { if (live && ready && follow) m()?.setScenario({ o2: Math.min(hab.o2, 50), psi: hab.psi, g: hab.g, name: hab.name }) }, [live, ready, follow, hab.o2, hab.psi, hab.g, hab.name])
  useEffect(() => { const x = m(); if (!live || !ready || !x) return; for (const k of MODES) x.mode(k, show.includes(k)); x.mode('break', show.includes('break')) }, [live, ready, show.join(',')])
  return <iframe ref={ref} title="3D machine" src={src + '?embed=1&v=' + __BUILD__} onLoad={onLoad}
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, borderRadius: 'inherit', background: '#0d0e10',
      opacity: shown ? 1 : 0, transition: 'opacity .35s ease', pointerEvents: live && shown ? 'auto' : 'none', zIndex: id }} />
}

export default function Explorer({ data, hab, setHab, testsByInv, explorer, setExplorer, whatIf }) {
  const scene = HABITAT_SCENES[explorer.target] || HABITAT_SCENES.iss
  const invs = useMemo(() => data.invs.filter(i => (testsByInv[i.accession] || []).length && hostOf(i)), [data, testsByInv])
  const inv = data.invs.find(i => i.accession === explorer.experiment) || null
  const rows = useMemo(() => (inv ? (testsByInv[inv.accession] || []).filter(t => !t.matrix) : []), [inv, testsByInv])
  const [rowIdx, setRowIdx] = useState(0)
  const [info, setInfo] = useState(null)
  const [result, setResult] = useState(null)
  useEffect(() => { setRowIdx(0); setResult(null) }, [explorer.experiment])
  useEffect(() => { if (explorer.module) { const p = scene.parts.find(p => p.id === explorer.module || p.name.toLowerCase().includes(String(explorer.module).toLowerCase())); if (p) setInfo({ id: p.id, title: p.name, text: p.info }) } }, [explorer.module, scene])
  const row = rows[rowIdx]
  const host = inv ? hostOf(inv) : null
  const view = explorer.experiment && explorer.focus === 'apparatus' ? 'apparatus' : 'habitat'
  const set = patch => setExplorer(e => ({ ...e, ...patch }))
  const [applyKey, setApplyKey] = useState(0)
  useEffect(() => { if (explorer.show?.includes('apply_scenario')) setApplyKey(k => k + 1) }, [explorer.show])
  const kind = inv ? apparatusOf(inv, rows) : null
  const machineSrc = view === 'apparatus' ? MACHINES[kind] : HAB_MACHINES[explorer.target] || null
  const habShow = view === 'habitat' ? [...(explorer.show || []), ...(explorer.explode ? ['explode'] : []), ...(host ? ['xray', 'labels'] : [])] : (explorer.show || [])
  const solidMax = useMemo(() => Math.max(...data.tests.filter(t => t.fuelClass === 'solid' && t.o2Pct).map(t => t.o2Pct)), [data])
  const zone = useCallback(h => { const z = zoneStats(data.tests, h); return { total: z.total, solid: z.by.solid, solidMax } }, [data, solidMax])
  const onPart = useCallback(p => setInfo({ id: p.name, title: p.name, text: p.text }), [])
  const run = () => setApplyKey(k => k + 1) || setResult(whatIf({ scenario: hab, investigation: inv.accession, fuel: row?.fuel, co2: row?.co2 || 0, he: row?.he || 0, d0: row?.out?.d0_mm }))

  return (
    <div className="grid-main explorer">
      <div className="canvas3d holo">
        {!machineSrc && <div className="overlay">{view === 'habitat' ? `${scene.name} · approximate scale · click any module · ${explorer.explode ? 'exploded view' : 'assembled'}` : `${inv.acronym || inv.accession} apparatus · generated from PSI test row ${rowIdx + 1}/${rows.length} · click any part`}</div>}
        {!machineSrc && <div className="overlay" style={{ top: 'auto', bottom: 10 }}>Scenario: {hab.name} · {hab.o2}% O₂ · {hab.psi} psi · {hab.g.toFixed(2)} g</div>}
        {machineSrc ? <MachineFrame src={machineSrc} row={view === 'apparatus' ? row : null} hab={hab} whatIf={whatIf} zone={zone} follow={view === 'habitat'} show={habShow} applyKey={applyKey} onPart={onPart} /> :
        <Canvas camera={{ position: view === 'habitat' ? (explorer.target === 'iss' ? [16, 10, 18] : [11, 8, 13]) : [4.5, 3, 6], fov: 42 }} onPointerMissed={() => setInfo(null)} key={view + explorer.target}>
          <color attach="background" args={['#02040a']} />
          <ambientLight intensity={0.7} /><directionalLight position={[5, 10, 5]} intensity={0.8} />
          <gridHelper args={[60, 60, '#123049', '#0a1a2c']} position={[0, view === 'habitat' ? -3 : -2.2, 0]} />
          {view === 'habitat'
            ? <Habitat scene={scene} explode={explorer.explode} selected={info?.id} host={host} onPick={id => { const p = scene.parts.find(p => p.id === id); setInfo({ id, title: p.name, text: p.info }) }} />
            : <Apparatus kind={apparatusOf(inv, rows)} inv={inv} row={row} onPart={p => setInfo({ id: p.id, title: p.id, text: p.text })} />}
          <OrbitControls enableDamping makeDefault autoRotate={!info} autoRotateSpeed={0.4} />
        </Canvas>}
      </div>

      <div className="side">
        <div className="panel">
          <h2>Habitat</h2>
          <div className="chips">
            {[['iss', 'ISS'], ['moon', 'Moon base'], ['rover', 'Rover']].map(([id, n]) =>
              <button key={id} className={'chip' + (explorer.target === id && view === 'habitat' ? ' on' : '')} onClick={() => { set({ target: id, focus: 'habitat' }); const p = HABITATS.find(h => h.id === id); if (p && setHab) setHab({ ...p }) }}>{n}</button>)}
            <button className={'chip' + (explorer.explode ? ' on' : '')} onClick={() => set({ explode: !explorer.explode, focus: 'habitat' })}>{explorer.explode ? 'Assemble' : 'Explode'}</button>
          </div>
          <div className="dim small" style={{ marginTop: 10 }}>{machineSrc && view === 'habitat' ? 'The cabin air follows the scenario. Click a module to see what ran there.' : scene.atmosphereNote}</div>
        </div>

        <div className="panel">
          <h2>Experiment</h2>
          <select value={explorer.experiment || ''} onChange={e => set({ experiment: e.target.value || null, focus: e.target.value ? 'apparatus' : 'habitat' })} style={{ width: '100%' }}>
            <option value="">Choose a PSI investigation…</option>
            {invs.map(i => <option key={i.accession} value={i.accession}>{i.acronym || i.accession} · {i.accession}</option>)}
          </select>
          {inv && <>
            <div className="chips" style={{ marginTop: 8 }}>
              <button className={'chip' + (view === 'apparatus' ? ' on' : '')} onClick={() => set({ focus: 'apparatus' })}>Apparatus</button>
              <button className={'chip' + (view === 'habitat' ? ' on' : '')} onClick={() => set({ focus: 'habitat' })}>Where it ran ({host === 'CYGNUS' ? 'Cygnus' : host === 'CIR' ? 'CIR · Destiny' : 'Glovebox'})</button>
            </div>
            <label className="small dim" style={{ display: 'block', marginTop: 8 }}>Test row from the PSI table
              <select value={rowIdx} onChange={e => setRowIdx(+e.target.value)} style={{ width: '100%', marginTop: 4 }}>
                {rows.slice(0, 400).map((r, i) => <option key={r.id} value={i}>{i + 1}. {String(r.fuel).slice(0, 28)} · {r.o2Pct != null ? r.o2Pct.toFixed(1) + '% O₂' : 'O₂ n/a'}{r.pressurePsi ? ' · ' + r.pressurePsi.toFixed(1) + ' psi' : ''}{r.flowCmS ? ' · ' + r.flowCmS + ' cm/s' : ''}</option>)}
              </select></label>
            <button className="btn primary" style={{ marginTop: 12, width: '100%' }} onClick={run}>Apply {hab.name} air</button>
          </>}
        </div>

        <div className="panel">
          <h2>Or tell the copilot</h2>
          <div className="small muted">It renders these models in real time from what you ask, typed or spoken.</div>
          <div className="chips" style={{ marginTop: 10 }}>
            {['Pull up the rover and take it apart.', 'Show the Moon base in x-ray with labels.'].map(t => <button key={t} className="chip small" onClick={() => askCopilot(t)}>{t}</button>)}
          </div>
        </div>

        {result && <div className="panel">
          <h2>At {result.scenario.o2}% O₂, {result.scenario.psi} psi</h2>
          {result.models.map((m, i) => <div key={i} className="small" style={{ marginBottom: 6 }}>
            {m.value == null ? <span className="warn">{m.output}</span>
              : <><b className="score">{m.units ? `${m.value} ± ${m.plusMinus95} ${m.units}` : `${Math.round(m.value * 100)}%`}</b> {m.output}<div className="dim">{m.model} · CV {m.validation?.auc ? `AUC ${m.validation.auc}` : `R² ${m.validation?.r2}`}</div></>}
          </div>)}
          {result.nearestRealTests?.[0] && <div className="small muted">Nearest real test: {result.nearestRealTests[0].fuel} at {result.nearestRealTests[0].o2Pct}% O₂, {result.nearestRealTests[0].psi} psi ({result.nearestRealTests[0].basis}).</div>}
          {result.flags.map((f, i) => <div key={i} className="small warn" style={{ marginTop: 6 }}>{f}</div>)}
        </div>}

        {info && <div className="panel">
          <h2 style={{ textTransform: 'capitalize' }}>{info.title}</h2>
          <div className="small muted">{info.text}</div>
          {PART_HOSTS[info.title] && <div className="chips" style={{ marginTop: 12 }}>
            {invs.filter(i => PART_HOSTS[info.title].includes(hostOf(i))).map(i => <button key={i.accession} className="chip" onClick={() => set({ experiment: i.accession, focus: 'apparatus' })}>{i.acronym || i.accession}</button>)}
          </div>}
        </div>}
      </div>
    </div>
  )
}
