import React, { useEffect, useRef, useState } from 'react'
import { createConversation, loadListening, loadVoice, onSpeechProgress } from '../lib/voice2.js'
import { createVoice, voiceSupported } from '../lib/voice.js'
import { createLive } from '../lib/live.js'

// EMBER Copilot: the assistant that OPERATES the dashboard (Gemini function calling; every tool runs on real data in
// the browser). It sets the scenario, renders the 3D hardware in real time, runs the models and reports the result.
// It is a different job from "Ask the evidence", which reads the research text and returns one cited answer.
// Voice: open-source in-browser models (Whisper listens, Kokoro-82M speaks), barge-in and queued turns.
// SI disclosure: written with assistance from Claude (Anthropic).
const TOOL_LABEL = { set_scenario: 'Setting scenario', navigate: 'Opening view', explore_3d: 'Rendering 3D', what_if: 'Running what-if', search_psi: 'Searching PSI',
  get_investigation: 'Opening investigation', gap_stats: 'Analysing gaps', rank_for_scenario: 'Ranking evidence', next_best_experiments: 'Planning the test campaign', readiness: 'Checking readiness', compare: 'Comparing' }
const STATUS_Q = /\b(are you (still )?(working|there|on it|done)|still working|status|how long|what are you doing|you there)\b/i
const STOP_Q = /^(stop|cancel|never ?mind|forget it|be quiet|quiet|shut up)\b/i
export const COPILOT_TRY = ['Pull up the rover and take it apart.', 'Open FLEX, cut it open and apply Moon-base air.', 'Are we ready for a Moon base?']

// open the copilot from anywhere in the app, optionally with a request to run
export const askCopilot = text => window.dispatchEvent(new CustomEvent('ember:ask', { detail: text || '' }))

export default function Copilot({ executors, voiceOn, setVoiceOn, onVoiceState }) {
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(false)
  const [log, setLog] = useState([])
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [vstate, setVstate] = useState('idle')
  const [interim, setInterim] = useState(null)
  const [dl, setDl] = useState(null) // first-use model download progress, 0..1
  const contents = useRef([]), sticky = useRef(null), conv = useRef(null), logEnd = useRef(null)
  const busyRef = useRef(false), queue = useRef([]), stepRef = useRef('thinking'), submitRef = useRef(null)
  const execRef = useRef(executors); execRef.current = executors

  // replies are plain text: undo any LaTeX the model slips in
  const plain = t => String(t).replace(/\\pm/g, '±').replace(/\\times/g, '×').replace(/\\text\{([^}]*)\}/g, '$1').replace(/\^2/g, '²').replace(/\$/g, '').replace(/\*\*/g, '').replace(/ {2,}/g, ' ')
  const push = (who, text) => setLog(l => [...l.slice(-60), { who, text: who === 'ember' ? plain(text) : text }])
  // live voice: transcripts arrive in pieces; grow the current line until the turn ends
  const grow = (who, chunk) => setLog(l => { const last = l[l.length - 1]
    if (last && last.who === who && last.live) return [...l.slice(0, -1), { ...last, text: last.text + chunk }]
    return [...l.slice(-60), { who, text: String(chunk).trimStart(), live: true }] })
  const seal = () => setLog(l => l.map(m => (m.live ? { ...m, live: false } : m)))
  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'end' }) }, [log, interim])
  useEffect(() => { onVoiceState?.(vstate) }, [vstate])
  useEffect(() => { if (open) setSeen(true) }, [open])
  const say = t => { if (conv.current?.enabled) conv.current.speak(plain(t)) }

  async function post(mode) {
    const r = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: contents.current, mode, model: sticky.current }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
    return j
  }

  async function turn(text, mode) {
    busyRef.current = true; setBusy(true); stepRef.current = 'thinking it through'
    contents.current.push({ role: 'user', parts: [{ text }] })
    try {
      for (let step = 0; step < 6; step++) {
        let j
        try { j = await post(mode) } catch (e) {
          if (!sticky.current) throw e
          sticky.current = null; contents.current = [{ role: 'user', parts: [{ text }] }]; j = await post(mode)
        }
        sticky.current = j.model
        contents.current.push(j.content)
        const calls = j.content.parts.filter(p => p.functionCall)
        if (!calls.length) {
          const reply = j.content.parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim() || 'Done.'
          push('ember', reply); say(reply)
          break
        }
        const responses = []
        for (const { functionCall: fc } of calls) {
          stepRef.current = (TOOL_LABEL[fc.name] || fc.name).toLowerCase()
          let result
          try { result = execRef.current[fc.name] ? await execRef.current[fc.name](fc.args || {}) : { error: 'unknown tool' } } catch (e) { result = { error: String(e.message || e) } }
          push('tool', `${TOOL_LABEL[fc.name] || fc.name}${fc.args?.investigation || fc.args?.id || fc.args?.experiment ? ' · ' + (fc.args.investigation || fc.args.id || fc.args.experiment) : ''}${fc.args?.preset ? ' · ' + fc.args.preset : ''}${fc.args?.target && fc.args.target !== 'experiment' ? ' · ' + fc.args.target : ''}`)
          responses.push({ functionResponse: { name: fc.name, response: { result } } })
        }
        contents.current.push({ role: 'user', parts: responses })
      }
    } catch (e) {
      const m = 'I could not reach the AI service just now. Please try again.'
      push('ember', m + ' (' + String(e.message || e).slice(0, 120) + ')'); say(m)
    } finally {
      busyRef.current = false; setBusy(false)
      if (contents.current.length > 40) {
        const i = contents.current.findIndex((c, k) => k > contents.current.length - 24 && c.role === 'user' && c.parts.some(p => p.text))
        if (i > 0) contents.current = contents.current.slice(i)
      }
      const next = queue.current.shift(); if (next) { push('you', next.text); turn(next.text, next.mode) }
    }
  }

  function submit(text, mode) {
    const t = String(text || '').trim(); if (!t) return
    if (conv.current?.live) { push('you', t); conv.current.sendText(t); return }
    if (STOP_Q.test(t)) { conv.current?.stopSpeaking?.(); queue.current = []; push('you', t); push('ember', 'Okay, stopped.'); return }
    if (busyRef.current && STATUS_Q.test(t)) { push('you', t); const r = `Still on it. I'm ${stepRef.current}.`; push('ember', r); say(r); return }
    if (busyRef.current) { queue.current.push({ text: t, mode }); push('tool', 'Queued: I\'ll answer this next'); return }
    push('you', t); turn(t, mode)
  }
  submitRef.current = submit

  // any view can open the copilot and hand it a request (window event 'ember:ask')
  useEffect(() => {
    const on = e => { setOpen(true); if (e.detail) submitRef.current(String(e.detail), 'text') }
    window.addEventListener('ember:ask', on); return () => window.removeEventListener('ember:ask', on)
  }, [])

  // voice mode (driven from the header toggle): everything said is transcribed and acted on
  useEffect(() => {
    if (!voiceOn) { conv.current?.stop(); conv.current = null; return }
    let cancelled = false
    const handlers = {
      onState: setVstate,
      onInterim: t => setInterim(t),
      onError: m => push('tool', m),
      onHeard: (text, { woke }) => {
        setOpen(true)
        const t = String(text || '').trim()
        if (!t) { if (woke) { const g = 'Yes? What are we working on?'; push('ember', g); say(g) } return }
        submitRef.current(t, 'voice')
      },
    }
    ;(async () => {
      // 1. real-time voice with Gemini Live (speech in, speech out, interruptible, same tools)
      try {
        setVstate('thinking')
        const lv = await createLive({ executors: execRef.current, onState: setVstate,
          onUser: t => grow('you', t), onEmber: t => grow('ember', t), onTurnEnd: seal,
          onTool: (name, a) => { seal(); push('tool', `${TOOL_LABEL[name] || name}${a?.investigation || a?.experiment ? ' · ' + (a.investigation || a.experiment) : ''}${a?.preset ? ' · ' + a.preset : ''}${a?.target && a.target !== 'experiment' ? ' · ' + a.target : ''}`) },
          onError: m => push('tool', m),
          onClose: m => { push('tool', 'Live voice ended: ' + m); conv.current = null; setVoiceOn(false) } })
        if (cancelled) return lv.stop()
        conv.current = lv; setOpen(true)
        push('tool', 'Live voice on. Just talk; you can interrupt me any time.')
        return
      } catch (e) {
        if (cancelled) return
        if (/permission|notallowed|denied/i.test(String(e?.name || '') + String(e?.message || ''))) { setOpen(true); setVstate('denied'); push('tool', 'The microphone is blocked. Allow it from the icon in the address bar, then switch Voice on again.'); setVoiceOn(false); return }
        push('tool', 'Live voice unavailable (' + String(e.message || e).slice(0, 140) + '). Using the in-browser voice instead.')
      }
      // 2. fallback: open-source models in the browser
      const c = createConversation(handlers)
      conv.current = c
      const ok = await c.start()
      if (cancelled) return c.stop()
      if (ok) {
        setOpen(true)
        // fetch the models now (cached after the first time): listening first, because that is what the user needs first
        const files = {}, off = onSpeechProgress(p => { files[p.what + p.file] = p; const v = Object.values(files); setDl(v.reduce((a, f) => a + f.loaded, 0) / v.reduce((a, f) => a + f.total, 0)) })
        loadListening().then(() => { if (!cancelled) push('ember', 'Voice is on. Just talk: I transcribe what you say and act on it. Switch Voice off when you are done.') })
          .catch(e => push('tool', 'The listening model failed to load: ' + e.message))
        Promise.allSettled([loadListening(), loadVoice()]).then(r => { off(); setDl(null); if (r[1].status === 'rejected') push('tool', 'The voice model failed to load, so replies stay as text: ' + r[1].reason?.message) })
        return
      }
      if (voiceSupported()) { // fallback: browser speech recognition + synthesis
        const old = createVoice({ onState: setVstate, onInterim: t => setInterim(t), onWake: () => handlers.onHeard('', { woke: true }), onUtterance: t => { setInterim(null); submitRef.current(t, 'voice') } })
        conv.current = old; old.start(); setOpen(true); push('tool', 'Using the browser voice (lower quality): this browser cannot run the open-source models.')
      } else { push('tool', 'The microphone is blocked or unavailable in this browser.'); setOpen(true); setVoiceOn(false) }
    })()
    return () => { cancelled = true }
  }, [voiceOn])

  const status = voiceOn ? ({ listening: 'listening', hearing: 'hearing you', transcribing: 'transcribing', speaking: 'speaking (talk to interrupt)', thinking: 'thinking', denied: 'microphone blocked' }[vstate] || vstate) : 'operates the dashboard'
  return <>
    {!open && !seen && <button className="orb-label" onClick={() => setOpen(true)}>Copilot <span>renders 3D live</span></button>}
    <button className={'orb ' + vstate} title="EMBER Copilot" onClick={() => setOpen(o => !o)} aria-label="Open EMBER Copilot"><span /></button>
    {open && <aside className="copilot" aria-label="EMBER Copilot">
      <header>
        <div><b>EMBER Copilot</b> <span className="dim small">{status}</span></div>
        <button className="x" onClick={() => setOpen(false)} aria-label="Close">×</button>
      </header>
      <div className="log">
        {!log.length && <div className="hint">
          <p className="pitch"><b>I operate EMBER for you.</b> Ask in plain words, typed or spoken, and I render the 3D hardware in real time, set the air, cut it open, run the models and tell you what happens.</p>
          <div className="try">{COPILOT_TRY.map(t => <button key={t} className="chip small" onClick={() => submit(t, 'text')}>{t}</button>)}</div>
          <p className="note">Need a cited answer from the research text instead? That is a different job: use <a href="#ask" onClick={() => setOpen(false)}>Ask the evidence</a>.</p>
        </div>}
        {log.map((m, i) => <div key={i} className={'msg ' + m.who}>{m.text}</div>)}
        {interim && <div className="msg you interim">{interim}…</div>}
        {voiceOn && vstate === 'transcribing' && !interim && <div className="msg tool">Transcribing…</div>}
        {dl != null && dl < 1 && <div className="msg tool">Downloading the open-source voice models, first time only: {Math.round(dl * 100)} %</div>}
        {busy && <div className="msg tool">{stepRef.current}…</div>}
        <div ref={logEnd} />
      </div>
      <form onSubmit={e => { e.preventDefault(); const t = input; setInput(''); submit(t, voiceOn ? 'voice' : 'text') }}>
        <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder={voiceOn ? 'Speak, or type here…' : 'Tell me what to do…'} aria-label="Message the copilot" />
        <button className="btn primary" disabled={!input.trim()}>Send</button>
      </form>
      <div className="credit">Replies by Google Gemini (SI) on NASA PSI data. Live voice by Gemini Live (SI speech); fallback voice by Kokoro-82M and Whisper in your browser.</div>
    </aside>}
  </>
}
