// Voice layer: always-on wake word ("Hey Ember"), speech-to-text, text-to-speech with barge-in.
// Uses the browser Web Speech API (Chrome/Edge). SI disclosure: written with assistance from Claude (Anthropic).
const WAKE = /\b(hey|hi|okay|ok|yo)?\s*(ember|amber|embar|emba|member)\b/i

export function voiceSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition) && 'speechSynthesis' in window
}

export function pickVoice() {
  const vs = speechSynthesis.getVoices()
  const pref = [/Google UK English Male/, /Microsoft Ryan/, /Microsoft George/, /en-GB.*Male/i, /Daniel/, /en-GB/, /Google US English/, /en-US/]
  for (const p of pref) { const v = vs.find(v => p.test(v.name) || p.test(v.lang + ' ' + v.name)); if (v) return v }
  return vs[0] || null
}

// Creates a controller. callbacks: onWake(), onUtterance(text), onState(state), onInterim(text)
export function createVoice({ onWake, onUtterance, onState, onInterim }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  let rec = null, enabled = false, awakeUntil = 0, speaking = false, spokenText = ''
  let voice = null
  speechSynthesis.onvoiceschanged = () => { voice = pickVoice() }
  voice = pickVoice()

  const state = s => onState?.(s)
  function stopSpeaking() { if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel(); speaking = false }

  function speak(text, { onEnd } = {}) {
    stopSpeaking()
    const clean = String(text || '').replace(/\[[^\]]*\]/g, '').replace(/[*_#`]/g, '').trim()
    if (!clean) return onEnd?.()
    // speak sentence by sentence so barge-in cuts in quickly
    const parts = clean.match(/[^.!?]+[.!?]*/g) || [clean]
    spokenText = clean.toLowerCase(); speaking = true; state('speaking')
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p.trim()); if (voice) u.voice = voice
      u.rate = 1.04; u.pitch = 0.95
      if (i === parts.length - 1) u.onend = () => { speaking = false; awakeUntil = Date.now() + 8000; state(enabled ? 'listening' : 'idle'); onEnd?.() }
      speechSynthesis.speak(u)
    })
  }

  function start() {
    if (!SR) return false
    enabled = true
    rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US'
    rec.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const txt = e.results[i][0].transcript.trim(), isFinal = e.results[i].isFinal
        if (!txt) continue
        // barge-in: user starts talking over EMBER (ignore our own voice leaking into the mic)
        if (speaking) {
          const words = txt.toLowerCase().split(/\s+/).filter(w => w.length > 2)
          const echo = words.length && words.every(w => spokenText.includes(w))
          if (!echo && words.length >= 2) { stopSpeaking(); state('listening') } else continue
        }
        onInterim?.(txt)
        if (!isFinal) continue
        const woke = WAKE.test(txt)
        const rest = txt.replace(WAKE, '').replace(/^[\s,.]+/, '').trim()
        if (woke && rest.split(/\s+/).length < 2) { awakeUntil = Date.now() + 10000; onWake?.(); continue }
        if (woke || Date.now() < awakeUntil) { awakeUntil = Date.now() + 10000; onUtterance?.(woke ? rest : txt) }
      }
    }
    rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { enabled = false; state('denied') } }
    rec.onend = () => { if (enabled) try { rec.start() } catch {} }
    try { rec.start(); state('listening') } catch {}
    return true
  }
  function stop() { enabled = false; awakeUntil = 0; try { rec?.stop() } catch {}; stopSpeaking(); state('idle') }
  return { start, stop, speak, stopSpeaking, wake: () => { awakeUntil = Date.now() + 10000 }, get enabled() { return enabled } }
}
