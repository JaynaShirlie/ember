import React, { useEffect, useMemo, useRef, useState } from 'react'
import { HABITATS } from './lib/habitats.js'
import HabitatBar from './components/HabitatBar.jsx'
import Brief from './components/Brief.jsx'
import Atlas from './components/Atlas.jsx'
import GapMap from './components/GapMap.jsx'
import Landscape from './components/Landscape3D.jsx'
import Explorer from './components/Explorer.jsx'
import Ask from './components/Ask.jsx'
import Copilot from './components/Copilot.jsx'
import { More } from './components/ui.jsx'
import { makeGP, makeAssessor } from './lib/gp.js'
import { makeSearch } from './lib/search.js'
import { makeWhatIf } from './lib/whatif.js'
import { makeExecutors } from './lib/agentTools.js'

const TABS = [
  ['brief', 'Brief'],
  ['atlas', 'Evidence'],
  ['gap', 'Gaps'],
  ['landscape', 'Model'],
  ['explorer', 'Hardware'],
  ['ask', 'Ask'],
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
  const [tab, setTab] = useState(() => { const h = location.hash.slice(1); return TABS.some(([id]) => id === h) ? h : 'brief' })
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
  useEffect(() => { if (location.hash.slice(1) !== tab) location.hash = tab; window.scrollTo(0, 0) }, [tab])
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
    return { assess, whatIf, executors: makeExecutors({ data, testsByInv, search, assess, whatIf, getHab: () => habRef.current, setHab, setTab, setCompare, setExplorer, setFocusInv }) }
  }, [data, testsByInv])

  if (err) return <div className="app"><p className="boot alert">Could not load the knowledge base: {err}</p></div>
  if (!data) return <div className="app"><p className="boot">Loading NASA PSI data…</p></div>
  const { meta } = data
  const harvested = new Date(meta.harvestedAt)

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="top">
        <a className="logo" href="#brief" data-enter><span className="mark" />EMBER</a>
        <nav className="tabs" aria-label="Views">
          {TABS.map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>)}
        </nav>
        <button className={'convo' + (voiceOn ? ' on ' + voiceState : '')} onClick={() => setVoiceOn(v => !v)} aria-pressed={voiceOn} title={voiceOn ? 'Stop listening. What you said is still transcribed and acted on.' : 'Talk to the copilot'}>
          <span className="mic" />{voiceOn ? ({ speaking: 'Speaking', hearing: 'Hearing you', transcribing: 'Transcribing' }[voiceState] || 'Listening') + ' · Stop' : voiceState === 'transcribing' ? 'Transcribing' : 'Voice'}
        </button>
      </header>

      <HabitatBar hab={hab} setHab={setHab} />

      <main id="main">
        {tab === 'brief' && <Brief data={data} hab={hab} testsByInv={testsByInv} assess={engine.assess} go={setTab} openInv={a => { setFocusInv(a); setTab('atlas') }} />}
        {tab === 'atlas' && <Atlas data={data} hab={hab} testsByInv={testsByInv} focus={focusInv} setFocus={setFocusInv} cmp={compare} setCmp={setCompare} />}
        {tab === 'gap' && <GapMap data={data} hab={hab} onPick={a => { setFocusInv(a); setTab('atlas') }} />}
        {tab === 'landscape' && <Landscape data={data} hab={hab} />}
        {tab === 'explorer' && <Explorer data={data} hab={hab} setHab={setHab} testsByInv={testsByInv} explorer={explorer} setExplorer={setExplorer} whatIf={engine.whatIf} />}
        {tab === 'ask' && <Ask hab={hab} />}
      </main>

      <footer>
        <p><span className="dot" />Live from NASA PSI · {meta.investigations} investigations · {meta.tables} tables · {meta.testRecords.toLocaleString()} test records · harvested {harvested.toUTCString().slice(5, 16)}. An independent student project for NASA Space Apps 2026, not endorsed by NASA.</p>
        <More title="About the data and the SI used">
          <p>Data: NASA Physical Sciences Informatics (PSI) Combustion Science repository (CC0), harvested automatically; each investigation links to its PSI page and DOI.</p>
          <p>All PSI flight data is microgravity. No partial-gravity combustion data exists in PSI yet, so Moon and Mars values are bounded, not measured.</p>
          <p>Habitat atmospheres are design inputs from the challenge statement and NASA exploration-atmosphere planning values.</p>
          <p>SI disclosure: code written with assistance from Claude (Anthropic); in-app answers generated by Google Gemini from PSI content; voice by Kokoro-82M and Whisper running in the browser.</p>
        </More>
      </footer>
      {engine && <Copilot executors={engine.executors} voiceOn={voiceOn} setVoiceOn={setVoiceOn} onVoiceState={setVoiceState} />}
    </div>
  )
}
