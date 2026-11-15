// EMBER speech worker: open-source models running in the visitor's browser, no keys, no server.
//   voice:     Kokoro-82M v1.0 (Apache-2.0, hexgrad) via kokoro-js, ONNX q8 on WebAssembly
//   listening: Whisper base.en (MIT, OpenAI) via transformers.js, ONNX q8
// Weights download once from the Hugging Face hub and are then cached by the browser.
// SI disclosure: written with assistance from Claude (Anthropic). Speech is synthesised (SI).
import { KokoroTTS } from 'kokoro-js'
import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
const TTS_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const STT_ID = 'onnx-community/whisper-base.en'
let tts = null, stt = null

const progress = (what) => (p) => {
  if (p.status === 'progress' && p.total) self.postMessage({ type: 'progress', what, file: p.file, loaded: p.loaded, total: p.total })
}
const loadTTS = () => (tts ??= KokoroTTS.from_pretrained(TTS_ID, { dtype: 'q8', device: 'wasm', progress_callback: progress('voice') }))
const loadSTT = () => (stt ??= pipeline('automatic-speech-recognition', STT_ID, { dtype: 'q8', device: 'wasm', progress_callback: progress('listening') }))

self.onmessage = async ({ data: m }) => {
  try {
    if (m.type === 'load') {
      await Promise.all([m.tts !== false && loadTTS(), m.stt !== false && loadSTT()])
      self.postMessage({ id: m.id, ok: true })
    } else if (m.type === 'tts') {
      const model = await loadTTS()
      const out = await model.generate(m.text, { voice: m.voice || 'af_heart', speed: m.speed || 1 })
      const audio = out.audio
      self.postMessage({ id: m.id, ok: true, audio, rate: out.sampling_rate }, [audio.buffer])
    } else if (m.type === 'stt') {
      const asr = await loadSTT()
      const r = await asr(m.audio)
      self.postMessage({ id: m.id, ok: true, text: String(r.text || '').trim() })
    }
  } catch (e) {
    self.postMessage({ id: m.id, ok: false, error: String(e?.message || e) })
  }
}
