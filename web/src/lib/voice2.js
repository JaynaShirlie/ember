// EMBER conversation engine: always-on mic with echo cancellation, energy-based voice activity detection,
// end-of-turn detection and barge-in. Listening (Whisper base.en) and the voice (Kokoro-82M) are open-source models
// that run in the browser, each in its own Web Worker (see speech.worker.js), so a reply being synthesised never
// blocks the transcription of what the user says next. No keys, no server.
// With Voice on, everything the user says is transcribed and handed over; "Hey Ember" is optional and stripped.
// SI disclosure: written with assistance from Claude (Anthropic).
const WAKE = /^\s*(hey|hi|okay|ok|yo)?[\s,]*(ember|amber|embar|emba|ember's|umber)\b[\s,.!?]*/i
const INCOMPLETE = /\b(and|or|but|so|the|a|an|to|of|for|with|if|is|um|uh|like|then|because|what|which|on|in|at)\s*$/i

// mic chunks -> one mono Float32Array at 16 kHz (what Whisper expects)
function to16k(chunks, inRate, outRate = 16000) {
  const len = chunks.reduce((a, c) => a + c.length, 0), all = new Float32Array(len); let off = 0
  for (const c of chunks) { all.set(c, off); off += c.length }
  const ratio = inRate / outRate, out = new Float32Array(Math.floor(len / ratio))
  for (let i = 0; i < out.length; i++) { // box filter over each output sample's span (cheap anti-alias)
    const a = Math.floor(i * ratio), b = Math.min(len, Math.floor((i + 1) * ratio)); let sum = 0
    for (let j = a; j < b; j++) sum += all[j]
    out[i] = b > a ? sum / (b - a) : all[a] || 0
  }
  return out
}

// two workers from the same module: 'stt' loads only Whisper, 'tts' loads only Kokoro
const workers = {}, waiting = new Map(), listeners = new Set()
let seq = 0
function speech(kind) {
  if (workers[kind]) return workers[kind]
  const w = new Worker(new URL('./speech.worker.js', import.meta.url), { type: 'module' })
  w.onmessage = ({ data }) => {
    if (data.type === 'progress') { listeners.forEach(f => f(data)); return }
    const p = waiting.get(data.id); if (!p) return
    waiting.delete(data.id); data.ok ? p.res(data) : p.rej(new Error(data.error))
  }
  w.onerror = e => { for (const [id, p] of waiting) { waiting.delete(id); p.rej(new Error(e.message || 'speech worker failed')) } }
  return (workers[kind] = w)
}
const ask = (kind, msg, transfer) => new Promise((res, rej) => { const id = ++seq; waiting.set(id, { res, rej }); speech(kind).postMessage({ ...msg, id }, transfer || []) })
export const onSpeechProgress = f => { listeners.add(f); return () => listeners.delete(f) }
export const loadListening = () => ask('stt', { type: 'load', tts: false })
export const loadVoice = () => ask('tts', { type: 'load', stt: false })
export const loadSpeech = () => Promise.all([loadListening(), loadVoice()])

export async function voiceStatus() {
  const ok = typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined'
  return { stt: ok, tts: ok }
}

// callbacks: onState(s), onHeard(text, {woke}), onInterim(text|null), onError(msg)
export function createConversation({ onState, onHeard, onInterim, onError }) {
  let ctx = null, stream, src, proc, enabled = false, speaking = false, audioEl = null, ttsQueue = [], has = { stt: false, tts: false }
  let inSpeech = false, speechMs = 0, silenceMs = 0, floor = 0.004, peak = 0, chunks = [], preroll = [], pendingText = '', pendingTimer = null
  let lastSpoken = '', spokeAt = 0
  const END_SILENCE = 800, MIN_SPEECH = 280, MAX_MS = 20000, BARGE_MS = 260
  const state = s => onState?.(s)

  function stopSpeaking() {
    ttsQueue = []; speaking = false
    if (audioEl) { audioEl.pause(); audioEl = null }
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel()
  }

  async function speak(text) {
    stopSpeaking()
    const clean = String(text || '').replace(/\[[^\]]*\]/g, '').replace(/[*_#`]/g, '').trim(); if (!clean || !ctx) return
    lastSpoken = clean; spokeAt = Date.now()
    const parts = (clean.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [clean]).reduce((acc, s) => { // ~2 sentences per chunk
      if (acc.length && (acc[acc.length - 1] + s).length < 220) acc[acc.length - 1] += ' ' + s.trim(); else acc.push(s.trim()); return acc }, [])
    speaking = true; state('speaking'); ttsQueue = parts.slice()
    if (!has.tts) {
      parts.forEach((p, i) => { const u = new SpeechSynthesisUtterance(p); u.rate = 1.03; if (i === parts.length - 1) u.onend = () => { speaking = false; spokeAt = Date.now(); state(enabled ? 'listening' : 'idle') }; speechSynthesis.speak(u) })
      return
    }
    const fetchAudio = t => ask('tts', { type: 'tts', text: t, voice: 'af_heart' })
    let next = fetchAudio(ttsQueue.shift())
    while (speaking) {
      let clip; try { clip = await next } catch (e) { onError?.('Voice: ' + e.message); break }
      if (!speaking || !ctx) break
      const following = ttsQueue.length ? fetchAudio(ttsQueue.shift()) : null // synthesise the next chunk while this one plays
      const buf = ctx.createBuffer(1, clip.audio.length, clip.rate); buf.copyToChannel(clip.audio, 0)
      const node = ctx.createBufferSource(); node.buffer = buf; node.connect(ctx.destination)
      audioEl = { pause: () => { try { node.stop() } catch {} } }
      await new Promise(res => { node.onended = res; node.start() })
      if (!following) break
      next = following
    }
    speaking = false; audioEl = null; spokeAt = Date.now(); state(enabled ? 'listening' : 'idle')
  }

  async function transcribe(wav) {
    state('transcribing')
    const j = await ask('stt', { type: 'stt', audio: wav }, [wav.buffer])
    return j.text || ''
  }

  // the mic can pick up EMBER's own voice: drop a transcript that is mostly the words EMBER just spoke
  function isEcho(text) {
    if (!lastSpoken || Date.now() - spokeAt > 12000) return false
    const said = new Set(lastSpoken.toLowerCase().match(/[a-z0-9']+/g) || []), w = text.toLowerCase().match(/[a-z0-9']+/g) || []
    return w.length >= 4 && w.filter(x => said.has(x)).length / w.length > 0.75
  }

  function deliver(text) {
    const t = String(text || '').trim(); if (!t || /^[.\s]*$/.test(t) || /^\[.*\]$/.test(t) || isEcho(t)) return
    const woke = WAKE.test(t)
    onHeard?.(woke ? t.replace(WAKE, '').trim() : t, { woke })
  }

  async function endUtterance() {
    const rate = ctx.sampleRate, audio = chunks, ms = speechMs; chunks = []
    if (ms < MIN_SPEECH) { state(speaking ? 'speaking' : 'listening'); return }
    try {
      const text = (await transcribe(to16k(audio, rate))).trim()
      state(!enabled ? 'idle' : speaking ? 'speaking' : 'listening')
      if (!text || /^[.\s]*$/.test(text)) return
      clearTimeout(pendingTimer)
      pendingText = (pendingText + ' ' + text).trim()
      onInterim?.(pendingText)
      // looks unfinished? wait a little for the rest of the sentence (not once Voice has been switched off)
      const wait = enabled && INCOMPLETE.test(pendingText.replace(/[.!?,]+$/, '')) ? 1500 : 0
      pendingTimer = setTimeout(() => { const t = pendingText; pendingText = ''; onInterim?.(null); deliver(t) }, wait)
    } catch (e) { onError?.('Could not transcribe: ' + e.message); state(enabled ? 'listening' : 'idle') }
  }

  function onAudio(e) {
    const x = e.inputBuffer.getChannelData(0), frame = new Float32Array(x)
    let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]
    const rms = Math.sqrt(s / x.length), ms = (x.length / ctx.sampleRate) * 1000
    const thr = Math.max(floor * 3.2, speaking ? 0.03 : 0.012)
    if (!inSpeech) {
      floor = floor * 0.98 + Math.min(rms, 0.05) * 0.02
      preroll.push(frame); if (preroll.length > 6) preroll.shift()
      if (rms > thr) { speechMs += ms; if (speechMs > (speaking ? BARGE_MS : 120)) { inSpeech = true; peak = rms; silenceMs = 0; chunks = [...preroll]; if (speaking) stopSpeaking(); state('hearing') } }
      else speechMs = 0
    } else {
      chunks.push(frame); speechMs += ms
      // "quiet" is judged against how loud this speaker has been, not only against a fixed level:
      // room noise (or a mic's automatic gain creeping up) can sit above the fixed level for ever
      peak = Math.max(peak * 0.997, rms)
      const quiet = rms < Math.max(thr * 0.75, peak * 0.3)
      silenceMs = quiet ? silenceMs + ms : 0
      if (silenceMs > END_SILENCE || speechMs > MAX_MS) { inSpeech = false; silenceMs = 0; endUtterance(); speechMs = 0; preroll = [] }
    }
  }

  async function start() {
    has = await voiceStatus()
    if (!has.stt) { onError?.('This browser cannot run the open-source voice models.'); return false }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
    } catch { state('denied'); return false }
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') { try { await ctx.resume() } catch {} }
    src = ctx.createMediaStreamSource(stream)
    proc = ctx.createScriptProcessor(2048, 1, 1); proc.onaudioprocess = onAudio
    src.connect(proc); proc.connect(ctx.destination)
    enabled = true; state('listening'); return true
  }

  // Stop listening. Whatever was said before Stop still counts: it is transcribed and handed over.
  function stop() {
    if (!ctx) { enabled = false; return }
    const rate = ctx.sampleRate, audio = inSpeech && chunks.length ? chunks : null, ms = speechMs, tail = pendingText
    enabled = false; stopSpeaking(); clearTimeout(pendingTimer); pendingText = ''
    inSpeech = false; chunks = []; speechMs = 0; silenceMs = 0
    try { proc.onaudioprocess = null; proc.disconnect(); src.disconnect(); stream.getTracks().forEach(t => t.stop()); ctx.close() } catch {}
    ctx = null
    if (audio && ms >= MIN_SPEECH) {
      onInterim?.('Transcribing what you said')
      transcribe(to16k(audio, rate))
        .then(t => { onInterim?.(null); state('idle'); deliver((tail + ' ' + t).trim()) })
        .catch(e => { onInterim?.(null); state('idle'); onError?.('Could not transcribe: ' + e.message) })
    } else { onInterim?.(null); state('idle'); if (tail) deliver(tail) }
  }
  return { start, stop, speak, stopSpeaking, get enabled() { return enabled } }
}
