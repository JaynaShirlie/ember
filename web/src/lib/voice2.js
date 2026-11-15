// EMBER conversation engine: always-on mic with echo cancellation, energy-based voice activity detection,
// end-of-turn detection, ElevenLabs speech-to-text + natural TTS, wake word and barge-in.
// Falls back to the browser's speech synthesis when the server has no ElevenLabs key.
// SI disclosure: written with assistance from Claude (Anthropic).
const WAKE = /\b(hey|hi|okay|ok|yo)?[\s,]*(ember|amber|embar|emba|ember's|umber)\b[\s,.!?]*/i
const INCOMPLETE = /\b(and|or|but|so|the|a|an|to|of|for|with|if|is|um|uh|like|then|because|what|which|on|in|at)\s*$/i

function encodeWav(chunks, inRate, outRate = 16000) {
  const len = chunks.reduce((a, c) => a + c.length, 0), ratio = inRate / outRate, outLen = Math.floor(len / ratio)
  const pcm = new Int16Array(outLen); let ci = 0, off = 0, pos = 0
  const all = new Float32Array(len); for (const c of chunks) { all.set(c, off); off += c.length }
  for (let i = 0; i < outLen; i++) { const s = all[Math.floor(i * ratio)] || 0; pcm[i] = Math.max(-1, Math.min(1, s)) * 0x7fff }
  const buf = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(buf), w = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)))
  w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, outRate, true); v.setUint32(28, outRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, pcm.length * 2, true)
  new Int16Array(buf, 44).set(pcm); void ci; void pos
  return new Blob([buf], { type: 'audio/wav' })
}

export async function voiceStatus() {
  try { return await (await fetch('/api/voice?op=status')).json() } catch { return { stt: false, tts: false } }
}

// callbacks: onState(s), onHeard(text, {woke}), onInterim(text|null), onError(msg)
export function createConversation({ onState, onHeard, onInterim, onError }) {
  let ctx, stream, src, proc, enabled = false, speaking = false, audioEl = null, ttsQueue = [], hasEL = { stt: false, tts: false }
  let inSpeech = false, speechMs = 0, silenceMs = 0, floor = 0.004, chunks = [], preroll = [], pendingText = '', pendingTimer = null
  const END_SILENCE = 900, MIN_SPEECH = 280, MAX_MS = 30000, BARGE_MS = 260
  const state = s => onState?.(s)

  function stopSpeaking() {
    ttsQueue = []; speaking = false
    if (audioEl) { audioEl.pause(); audioEl.src = ''; audioEl = null }
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel()
  }

  async function speak(text) {
    stopSpeaking()
    const clean = String(text || '').replace(/\[[^\]]*\]/g, '').replace(/[*_#`]/g, '').trim(); if (!clean) return
    const parts = (clean.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [clean]).reduce((acc, s) => { // ~2 sentences per chunk
      if (acc.length && (acc[acc.length - 1] + s).length < 220) acc[acc.length - 1] += ' ' + s.trim(); else acc.push(s.trim()); return acc }, [])
    speaking = true; state('speaking'); ttsQueue = parts.slice()
    if (!hasEL.tts) {
      parts.forEach((p, i) => { const u = new SpeechSynthesisUtterance(p); u.rate = 1.03; if (i === parts.length - 1) u.onend = () => { speaking = false; state(enabled ? 'listening' : 'idle') }; speechSynthesis.speak(u) })
      return
    }
    const fetchAudio = t => fetch('/api/voice?op=tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }) })
      .then(r => r.ok ? r.blob() : r.json().then(j => Promise.reject(new Error(j.error))))
    let next = fetchAudio(ttsQueue.shift())
    while (speaking) {
      let blob; try { blob = await next } catch (e) { onError?.('Voice: ' + e.message); break }
      if (!speaking) break
      const following = ttsQueue.length ? fetchAudio(ttsQueue.shift()) : null // prefetch next chunk while this one plays
      audioEl = new Audio(URL.createObjectURL(blob))
      await new Promise(res => { audioEl.onended = res; audioEl.onerror = res; audioEl.play().catch(res) })
      if (!following) break
      next = following
    }
    speaking = false; audioEl = null; state(enabled ? 'listening' : 'idle')
  }

  async function transcribe(wav) {
    state('transcribing')
    const r = await fetch('/api/voice?op=stt', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || `STT ${r.status}`)
    return j.text || ''
  }

  function deliver(text) {
    const woke = WAKE.test(text)
    onHeard?.(woke ? text.replace(WAKE, ' ').replace(/^\s*[,.]?\s*/, '').trim() : text.trim(), { woke })
  }

  async function endUtterance() {
    const rate = ctx.sampleRate, audio = chunks; chunks = []
    if (speechMs < MIN_SPEECH) { state(speaking ? 'speaking' : 'listening'); return }
    try {
      const text = (await transcribe(encodeWav(audio, rate))).trim()
      state(speaking ? 'speaking' : 'listening')
      if (!text || /^[.\s]*$/.test(text)) return
      clearTimeout(pendingTimer)
      pendingText = (pendingText + ' ' + text).trim()
      onInterim?.(pendingText)
      // looks unfinished? wait a little for the rest of the sentence
      const wait = INCOMPLETE.test(pendingText.replace(/[.!?,]+$/, '')) ? 1800 : 0
      pendingTimer = setTimeout(() => { const t = pendingText; pendingText = ''; onInterim?.(null); deliver(t) }, wait)
    } catch (e) { onError?.(e.message); state('listening') }
  }

  function onAudio(e) {
    const x = e.inputBuffer.getChannelData(0), frame = new Float32Array(x)
    let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]
    const rms = Math.sqrt(s / x.length), ms = (x.length / ctx.sampleRate) * 1000
    const thr = Math.max(floor * 3.2, speaking ? 0.03 : 0.012)
    if (!inSpeech) {
      floor = floor * 0.98 + Math.min(rms, 0.05) * 0.02
      preroll.push(frame); if (preroll.length > 6) preroll.shift()
      if (rms > thr) { speechMs += ms; if (speechMs > (speaking ? BARGE_MS : 120)) { inSpeech = true; chunks = [...preroll]; if (speaking) stopSpeaking(); state('hearing') } }
      else speechMs = 0
    } else {
      chunks.push(frame); speechMs += ms
      silenceMs = rms > thr * 0.75 ? 0 : silenceMs + ms
      if (silenceMs > END_SILENCE || speechMs > MAX_MS) { inSpeech = false; silenceMs = 0; endUtterance(); speechMs = 0; preroll = [] }
    }
  }

  async function start() {
    hasEL = await voiceStatus()
    if (!hasEL.stt) { onError?.('Add ELEVENLABS_API_KEY on the server for accurate dictation and a natural voice.'); return false }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
    } catch { state('denied'); return false }
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    src = ctx.createMediaStreamSource(stream)
    proc = ctx.createScriptProcessor(2048, 1, 1); proc.onaudioprocess = onAudio
    src.connect(proc); proc.connect(ctx.destination)
    enabled = true; state('listening'); return true
  }
  function stop() {
    enabled = false; stopSpeaking(); clearTimeout(pendingTimer)
    try { proc?.disconnect(); src?.disconnect(); stream?.getTracks().forEach(t => t.stop()); ctx?.close() } catch {}
    state('idle')
  }
  return { start, stop, speak, stopSpeaking, get enabled() { return enabled } }
}
