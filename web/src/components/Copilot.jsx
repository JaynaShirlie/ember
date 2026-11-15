import React, { useEffect, useRef, useState } from 'react'
import { createConversation } from '../lib/voice2.js'
import { createVoice, voiceSupported } from '../lib/voice.js'

// EMBER copilot: agentic assistant (Gemini function calling, tools run on real data in the browser)
// with an always-on conversation mode ("Hey Ember"), ElevenLabs voice, barge-in and queued turns.
// SI disclosure: written with assistance from Claude (Anthropic).
export const USER_NAME = 'Jayna'
const TOOL_LABEL = { set_scenario: 'Setting scenario', navigate: 'Opening view', explore_3d: 'Opening 3D explorer', what_if: 'Running what-if', search_psi: 'Searching PSI',
  get_investigation: 'Opening investigation', gap_stats: 'Analysing gaps', rank_for_scenario: 'Ranking evidence', next_best_experiments: 'Finding next-best experiments', compare: 'Comparing' }
const STATUS_Q = /\b(are you (still )?(working|there|on it|done)|still working|status|how long|what are you doing|you there)\b/i
const STOP_Q = /^(stop|cancel|never ?mind|forget it|be quiet|quiet|shut up)\b/i
const FOLLOW_MS = 20000

export default function Copilot({ executors, voiceOn, setVoiceOn, onVoiceState }) {
  const [open, setOpen] = useState(false)
  const [log, setLog] = useState([])
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [vstate, setVstate] = useState('idle')
  const [interim, setInterim] = useState(null)
  const contents = useRef([]), sticky = useRef(null), conv = useRef(null), logEnd = useRef(null)
  const busyRef = useRef(false), queue = useRef([]), stepRef = useRef('thinking'), followUntil = useRef(0)
  const execRef = useRef(executors); execRef.current = executors

  const push = (who, text) => setLog(l => [...l.slice(-60), { who, text }])
  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'end' }) }, [log, interim])
  useEffect(() => { onVoiceState?.(vstate) }, [vstate])
  const say = t => { if (conv.current?.enabled) conv.current.speak(t) }

  async function post(mode) {
    const r = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: contents.current, mode, address: USER_NAME, model: sticky.current }) })
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
          push('ember', reply); say(reply); followUntil.current = Date.now() + FOLLOW_MS
          break
        }
        const responses = []
        for (const { functionCall: fc } of calls) {
          stepRef.current = (TOOL_LABEL[fc.name] || fc.name).toLowerCase()
          let result
          try { result = execRef.current[fc.name] ? await execRef.current[fc.name](fc.args || {}) : { error: 'unknown tool' } } catch (e) { result = { error: String(e.message || e) } }
          push('tool', `${TOOL_LABEL[fc.name] || fc.name}${fc.args?.investigation || fc.args?.id ? ' · ' + (fc.args.investigation || fc.args.id) : ''}${fc.args?.preset ? ' · ' + fc.args.preset : ''}${fc.args?.target && fc.args.target !== 'experiment' ? ' · ' + fc.args.target : ''}`)
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
    const t = text.trim(); if (!t) return
    if (STOP_Q.test(t)) { conv.current?.stopSpeaking(); queue.current = []; push('you', t); push('ember', 'Okay, stopped.'); return }
    if (busyRef.current && STATUS_Q.test(t)) { push('you', t); const r = `Still on it, ${USER_NAME}. I'm ${stepRef.current}.`; push('ember', r); say(r); return }
    if (busyRef.current) { queue.current.push({ text: t, mode }); push('tool', 'Queued: I\'ll answer this next'); return }
    push('you', t); turn(t, mode)
  }

  // conversation mode (driven from the header toggle)
  useEffect(() => {
    if (!voiceOn) { conv.current?.stop(); conv.current = null; setVstate('idle'); return }
    let cancelled = false
    const handlers = {
      onState: setVstate,
      onInterim: t => setInterim(t),
      onError: m => push('tool', m),
      onHeard: (text, { woke }) => {
        const following = Date.now() < followUntil.current
        if (!woke && !following) return // ignore room talk until "Hey Ember"
        setOpen(true)
        if (woke && text.split(/\s+/).filter(Boolean).length < 2) {
          const g = `Yes, ${USER_NAME}? What are we working on?`; push('ember', g); conv.current.speak(g); followUntil.current = Date.now() + FOLLOW_MS; return
        }
        followUntil.current = Date.now() + FOLLOW_MS
        submit(text, 'voice')
      },
    }
    ;(async () => {
      const c = createConversation(handlers)
      conv.current = c
      const ok = await c.start()
      if (cancelled) return c.stop()
      if (ok) { setOpen(true); push('ember', `Conversation mode on. Say "Hey Ember" whenever you need me, ${USER_NAME}.`); return }
      if (voiceSupported()) { // fallback: browser speech recognition + synthesis
        const old = createVoice({ onState: setVstate, onInterim: t => setInterim(t), onWake: () => handlers.onHeard('', { woke: true }), onUtterance: t => { setInterim(null); submit(t, 'voice') } })
        conv.current = old; old.start(); setOpen(true); push('tool', 'Using the browser voice (lower quality) until ElevenLabs is configured.')
      } else { setVoiceOn(false) }
    })()
    return () => { cancelled = true; conv.current?.stop() }
  }, [voiceOn])

  return <>
    <button className={'orb ' + vstate} title="EMBER copilot" onClick={() => setOpen(o => !o)} aria-label="Open EMBER copilot"><span /></button>
    {open && <aside className="copilot">
      <header>
        <div><b>EMBER</b> <span className="dim small">{voiceOn ? { listening: 'listening for “Hey Ember”', hearing: 'hearing you…', transcribing: 'transcribing…', speaking: 'speaking (talk to interrupt)', thinking: 'thinking…', denied: 'microphone blocked' }[vstate] || vstate : 'copilot'}</span></div>
        <button className="x" onClick={() => setOpen(false)} aria-label="Close">×</button>
      </header>
      <div className="log">
        {!log.length && <div className="hint">Ask me to run the data, not just talk about it. Try:<br />
          “Pull up the ISS, raise oxygen to 30% and pressure to 12 psi. What happens with the BASS-II test?”<br />
          “Where are we flying blind for the rover?” · “Compare BASS and Saffire.”</div>}
        {log.map((m, i) => <div key={i} className={'msg ' + m.who}>{m.who === 'tool' ? '⚙ ' : ''}{m.text}</div>)}
        {interim && <div className="msg you interim">{interim}…</div>}
        {busy && <div className="msg tool">{stepRef.current}…</div>}
        <div ref={logEnd} />
      </div>
      <form onSubmit={e => { e.preventDefault(); const t = input; setInput(''); submit(t, voiceOn ? 'voice' : 'text') }}>
        <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder={voiceOn ? 'Speak, or type here…' : 'Type a question…'} />
        <button className="btn primary" disabled={!input.trim()}>Send</button>
      </form>
      <div className="dim small" style={{ padding: '0 14px 10px' }}>Replies by Google Gemini (SI) using EMBER's tools on NASA PSI data · voice by ElevenLabs (SI).</div>
    </aside>}
  </>
}
