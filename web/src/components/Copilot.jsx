import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createVoice, voiceSupported } from '../lib/voice.js'

// EMBER copilot: agentic assistant (Gemini function calling, tools run on real data in the browser)
// with always-on "Hey Ember" voice mode and barge-in. SI disclosure: written with assistance from Claude (Anthropic).
const TOOL_LABEL = { set_scenario: 'Set scenario', navigate: 'Opened view', explore_3d: '3D explorer', what_if: 'What-if analysis', search_psi: 'Searched PSI',
  get_investigation: 'Opened investigation', gap_stats: 'Gap analysis', rank_for_scenario: 'Ranked evidence', next_best_experiments: 'Next-best experiments', compare: 'Compare' }

function readPref(k, d) { try { return localStorage.getItem(k) ?? d } catch { return d } }
function writePref(k, v) { try { localStorage.setItem(k, v) } catch {} }

export default function Copilot({ executors }) {
  const [open, setOpen] = useState(false)
  const [log, setLog] = useState([])            // {who:'you'|'ember'|'tool', text}
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [vstate, setVstate] = useState('idle')  // idle | listening | speaking | thinking | denied
  const [interim, setInterim] = useState('')
  const [address, setAddress] = useState(() => readPref('ember-address', ''))
  const contents = useRef([]), sticky = useRef(null), voice = useRef(null), logEnd = useRef(null)
  const execRef = useRef(executors); execRef.current = executors
  const addrRef = useRef(address); addrRef.current = address

  const push = (who, text) => setLog(l => [...l.slice(-60), { who, text, at: Date.now() }])
  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'end' }) }, [log, interim])

  async function post(mode) {
    const r = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: contents.current, mode, address: addrRef.current, model: sticky.current }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
    return j
  }

  async function turn(text, mode) {
    if (!text.trim()) return
    push('you', text); setBusy(true); setVstate(v => (v === 'denied' ? v : 'thinking'))
    contents.current.push({ role: 'user', parts: [{ text }] })
    try {
      for (let step = 0; step < 6; step++) {
        let j
        try { j = await post(mode) } catch (e) {
          if (!sticky.current) throw e
          sticky.current = null; contents.current = [{ role: 'user', parts: [{ text }] }]; j = await post(mode) // model switched: restart context cleanly
        }
        sticky.current = j.model
        contents.current.push(j.content)
        const calls = j.content.parts.filter(p => p.functionCall)
        if (!calls.length) {
          const reply = j.content.parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim() || 'Done.'
          push('ember', reply)
          if (mode === 'voice' && voice.current) voice.current.speak(reply)
          else setVstate(voice.current?.enabled ? 'listening' : 'idle')
          break
        }
        const responses = []
        for (const { functionCall: fc } of calls) {
          let result
          try { result = execRef.current[fc.name] ? await execRef.current[fc.name](fc.args || {}) : { error: 'unknown tool' } }
          catch (e) { result = { error: String(e.message || e) } }
          push('tool', `${TOOL_LABEL[fc.name] || fc.name}${fc.args?.investigation || fc.args?.id ? ' · ' + (fc.args.investigation || fc.args.id) : ''}${fc.args?.preset ? ' · ' + fc.args.preset : ''}${fc.args?.target ? ' · ' + fc.args.target : ''}`)
          responses.push({ functionResponse: { name: fc.name, response: { result } } })
        }
        contents.current.push({ role: 'user', parts: responses })
      }
    } catch (e) {
      push('ember', 'I could not reach the AI service just now. ' + String(e.message || e))
      setVstate(voice.current?.enabled ? 'listening' : 'idle')
    } finally {
      setBusy(false)
      if (contents.current.length > 40) { // trim old history at a clean user-text boundary
        const i = contents.current.findIndex((c, k) => k > contents.current.length - 24 && c.role === 'user' && c.parts.some(p => p.text))
        if (i > 0) contents.current = contents.current.slice(i)
      }
    }
  }

  const supported = useMemo(() => voiceSupported(), [])
  function toggleVoice() {
    if (voice.current?.enabled) { voice.current.stop(); voice.current = null; setVstate('idle'); return }
    voice.current = createVoice({
      onState: setVstate,
      onInterim: t => setInterim(t),
      onWake: () => { setOpen(true); setInterim(''); const a = addrRef.current; const line = `Yes${a ? ' ' + a : ''}? What are we working on?`; push('ember', line); voice.current.speak(line) },
      onUtterance: t => { setInterim(''); setOpen(true); turn(t, 'voice') },
    })
    if (voice.current.start()) { setOpen(true); push('ember', 'Conversation mode is on. Say "Hey Ember" any time.') }
  }
  useEffect(() => () => voice.current?.stop(), [])

  const orbClass = 'orb ' + vstate
  return <>
    <button className={orbClass} title="EMBER copilot" onClick={() => setOpen(o => !o)} aria-label="Open EMBER copilot"><span /></button>
    {open && <aside className="copilot">
      <header>
        <div><b>EMBER</b> <span className="dim small">copilot · {vstate === 'listening' ? 'listening for "Hey Ember"' : vstate}</span></div>
        <button className="x" onClick={() => setOpen(false)} aria-label="Close">×</button>
      </header>
      <div className="log">
        {!log.length && <div className="hint">Ask me to run the data, not just talk about it. Try:<br />
          “Pull up the ISS, raise oxygen to 30% and pressure to 12 psi. What happens with the BASS-II test?”<br />
          “Where are we flying blind for the rover?” · “Compare BASS and Saffire.”</div>}
        {log.map((m, i) => <div key={i} className={'msg ' + m.who}>{m.who === 'tool' ? '⚙ ' : ''}{m.text}</div>)}
        {interim && <div className="msg you interim">{interim}…</div>}
        {busy && <div className="msg tool">thinking…</div>}
        <div ref={logEnd} />
      </div>
      <form onSubmit={e => { e.preventDefault(); const t = input; setInput(''); turn(t, voice.current?.enabled ? 'voice' : 'text') }}>
        <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Type, or switch on conversation mode…" disabled={busy} />
        <button className="btn primary" disabled={busy || !input.trim()}>Send</button>
      </form>
      <footer>
        {supported
          ? <button className={'btn ' + (voice.current?.enabled ? 'on' : '')} onClick={toggleVoice}>{voice.current?.enabled ? '● Conversation mode on' : '🎙 Conversation mode'}</button>
          : <span className="dim small">Voice needs Chrome or Edge.</span>}
        <label className="small dim">Call me&nbsp;
          <select value={address} onChange={e => { setAddress(e.target.value); writePref('ember-address', e.target.value) }}>
            <option value="">(nothing)</option><option>sir</option><option>ma'am</option><option>boss</option><option>doctor</option>
          </select></label>
        {vstate === 'denied' && <span className="alert small">Microphone blocked: allow it in the address bar.</span>}
      </footer>
      <div className="dim small" style={{ padding: '0 12px 10px' }}>Replies by Google Gemini (SI) using EMBER's tools on NASA PSI data. Voice uses your browser's speech service.</div>
    </aside>}
  </>
}
