import React, { useEffect, useMemo, useRef, useState } from 'react'
import { HABITATS } from './lib/habitats.js'
import HabitatBar from './components/HabitatBar.jsx'
import Atlas from './components/Atlas.jsx'
import GapMap from './components/GapMap.jsx'
import Landscape from './components/Landscape3D.jsx'
import Explorer from './components/Explorer.jsx'
import Ask from './components/Ask.jsx'
import Copilot from './components/Copilot.jsx'
import { makeGP, makeAssessor } from './lib/gp.js'
import { makeSearch } from './lib/search.js'
import { makeWhatIf } from './lib/whatif.js'
import { makeExecutors } from './lib/agentTools.js'

const TABS = [
  ['atlas', 'Atlas · ranked evidence'],
  ['gap', 'Evidence-gap map'],
  ['landscape', '3D flammability landscape'],
  ['explorer', '3D explorer'],
  ['ask', 'Ask the Flame'],
]

async function j(path) {
  const r = await fetch(path)
  if (!r.ok) throw new Error(path + ' ' + r.status)
  return r.json()
}

export default function App() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [hab, setHab] = useState({ ...HABITATS[2] })
  const [tab, setTab] = useState(() => (location.hash.slice(1) || 'atlas'))
  const [focusInv, setFocusInv] = useState(null)
  const [compare, setCompare] = useState([])
  const [voiceOn, setVoiceOn] = useState(false)
  const [voiceState, setVoiceState] = useState('idle')
  const [explorer, setExplorer] = useState(() => { const q = new URLSearchParams(location.search)
    return { target: q.get('target') || 'iss', module: q.get('module'), explode: q.has('explode'), experiment: q.get('exp'), focus: q.get('exp') ? 'apparatus' : 'habitat' } })
  const habRef = useRef(hab); habRef.current = hab

  useEffect(() => {
    Promise.all([j('/data/meta.json'), j('/data/investigations.json'), j('/data/tests.json'), j('/data/flex_gp.json'), j('/data/classifiers.json')])
      .then(([meta, invs, tests, gp, clf]) => setData({ meta, invs, tests, gp, clf }))
      .catch(e => setErr(String(e)))
  }, [])
  useEffect(() => { if (location.hash.slice(1) !== tab) location.hash = tab }, [tab])
  useEffect(() => {
    const on = () => { const h = location.hash.slice(1); if (TABS.some(([id]) => id === h)) setTab(h) }
    window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on)
  }, [])

  const testsByInv = useMemo(() => {
    const m = {}
    for (const t of data?.tests || []) (m[t.inv] ||= []).push(t)
    return m
  }, [data])

  const engine = useMemo(() => {
    if (!data) return null
    const gp = makeGP(data.gp), assess = makeAssessor(gp, data.gp), search = makeSearch(data.invs)
    const whatIf = makeWhatIf({ data, testsByInv, assess })
    return { whatIf, executors: makeExecutors({ data, testsByInv, search, assess, whatIf, getHab: () => habRef.current, setHab, setTab, setCompare, setExplorer, setFocusInv }) }
  }, [data, testsByInv])

  if (err) return <div className="app"><p className="alert">Could not load the knowledge base: {err}</p></div>
  if (!data) return <div className="app"><p className="muted">Loading NASA PSI knowledge base…</p></div>
  const { meta } = data
  const harvested = new Date(meta.harvestedAt)

  return (
    <div className="app">
      <header className="top">
        <div className="logo"><div className="mark" /><div><h1>EMBER</h1><small>Evidence Map for Burning Environments in Reduced gravity</small></div></div>
        <div className="live">
          <span className="badge ok"><span className="dot" />Live from NASA PSI · harvested {harvested.toUTCString().slice(5, 22)} UTC</span>
          <span className="badge">{meta.investigations} investigations</span>
          <span className="badge">{meta.tables} experimental tables</span>
          <span className="badge">{meta.testRecords.toLocaleString()} test records</span>
          <button className={'convo' + (voiceOn ? ' on ' + voiceState : '')} onClick={() => setVoiceOn(v => !v)} title="Always-on voice: say “Hey Ember”">
            <span className="mic" />{voiceOn ? (voiceState === 'speaking' ? 'EMBER speaking' : voiceState === 'hearing' ? 'Hearing you…' : 'Conversation on') : 'Conversation mode'}
          </button>
        </div>
      </header>

      <HabitatBar hab={hab} setHab={setHab} />

      <nav className="tabs">
        {TABS.map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </nav>

      {tab === 'atlas' && <Atlas data={data} hab={hab} testsByInv={testsByInv} focus={focusInv} setFocus={setFocusInv} cmp={compare} setCmp={setCompare} />}
      {tab === 'gap' && <GapMap data={data} hab={hab} onPick={a => { setFocusInv(a); setTab('atlas') }} />}
      {tab === 'landscape' && <Landscape data={data} hab={hab} />}
      {tab === 'explorer' && <Explorer data={data} hab={hab} testsByInv={testsByInv} explorer={explorer} setExplorer={setExplorer} whatIf={engine.whatIf} />}
      {tab === 'ask' && <Ask hab={hab} />}

      <footer>
        Data: NASA Physical Sciences Informatics (PSI) Combustion Science repository (CC0), harvested automatically; each investigation links to its PSI page and DOI.
        All PSI flight data is microgravity: no partial-gravity combustion data exists in PSI yet, so Moon/Mars values are bounded, not measured.
        Habitat atmospheres are design inputs from the challenge statement and NASA exploration-atmosphere planning values.
        EMBER is an independent student project for NASA Space Apps 2026 and is not endorsed by NASA.
        SI disclosure: code written with assistance from Claude (Anthropic); in-app answers generated by Google Gemini from PSI content.
      </footer>
      {engine && <Copilot executors={engine.executors} voiceOn={voiceOn} setVoiceOn={setVoiceOn} onVoiceState={setVoiceState} />}
    </div>
  )
}
