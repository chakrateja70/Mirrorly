import { useEffect, useRef, useState } from 'react'

export const BARS = 28 // waveform bars shown while recording
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'] // first the browser can record
const SPEECH_RMS = 0.015 // ~-36 dBFS: a take that never gets louder than this is room noise, not a voice

/** The browser can record from the mic here (needs a secure context: https or localhost). */
export const canRecord = () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

/** File extension the transcriber recognizes for a recording of this type. */
export const extFor = (type: string) => (type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : 'webm')

export type Take = { blob: Blob; seconds: number; heardVoice: boolean }
type Session = {
  rec: MediaRecorder; stream: MediaStream; ctx: AudioContext; chunks: Blob[]
  raf: number; timer: number; started: number; peak: number; last: number
}

const quiet = () => Array<number>(BARS).fill(0)
const releaseMic = (s: Session) => {
  s.stream.getTracks().forEach((t) => t.stop()) // turns off the browser's "recording" indicator
  void s.ctx.close()
}

/**
 * Records a voice message with a live level meter. `stop()` resolves with the take (null if not recording);
 * at `maxSeconds` it stops by itself and hands the take to `onLimit`.
 */
export function useVoiceRecorder(maxSeconds: number, onLimit: (take: Take) => void) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [levels, setLevels] = useState(quiet)
  const [error, setError] = useState<string | null>(null)
  const session = useRef<Session | null>(null)
  const limit = useRef(onLimit)
  useEffect(() => { limit.current = onLimit })

  const reset = (s: Session) => {
    cancelAnimationFrame(s.raf)
    clearInterval(s.timer)
    session.current = null
    setRecording(false)
    setSeconds(0)
    setLevels(quiet())
  }

  const stop = () => new Promise<Take | null>((resolve) => {
    const s = session.current
    if (!s) return resolve(null)
    s.rec.onstop = () => {
      // read before releasing the mic (that closes the audio graph). If the browser kept it suspended
      // (iOS can), there is no level reading: let the server judge the take instead.
      const measured = s.ctx.state === 'running'
      releaseMic(s)
      resolve({ blob: new Blob(s.chunks, { type: s.rec.mimeType || 'audio/webm' }), seconds: (Date.now() - s.started) / 1000, heardVoice: !measured || s.peak >= SPEECH_RMS })
    }
    s.rec.stop()
    reset(s)
  })

  const cancel = () => {
    const s = session.current
    if (!s) return
    s.rec.onstop = () => releaseMic(s)
    s.rec.stop()
    reset(s)
  }

  const start = async () => {
    if (session.current) return
    setError(null)
    const ctx = new AudioContext() // created inside the tap: iOS only lets audio start from a user gesture
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch (e) {
      void ctx.close()
      const name = (e as DOMException).name
      setError(name === 'NotAllowedError' ? "Microphone access is blocked. Allow it in your browser's site settings to talk to Mirrorly."
        : name === 'NotFoundError' ? 'No microphone found on this device.' : "Couldn't start the microphone.")
      return
    }
    await ctx.resume().catch(() => {})
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t))
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    const s: Session = { rec, stream, ctx, chunks: [], raf: 0, timer: 0, started: Date.now(), peak: 0, last: 0 }
    rec.ondataavailable = (e) => { if (e.data.size) s.chunks.push(e.data) }
    rec.start(250)

    const tick = (t: number) => {
      if (t - s.last > 70) { // ~14 updates a second is plenty for the bars
        s.last = t
        analyser.getFloatTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += v * v
        const rms = Math.sqrt(sum / buf.length)
        s.peak = Math.max(s.peak, rms)
        setLevels((l) => [...l.slice(1), Math.min(1, Math.sqrt(rms) * 2.2)]) // sqrt: quiet speech still moves the bars
      }
      s.raf = requestAnimationFrame(tick)
    }
    s.raf = requestAnimationFrame(tick)
    s.timer = window.setInterval(() => {
      const sec = Math.floor((Date.now() - s.started) / 1000)
      setSeconds(sec)
      if (sec >= maxSeconds) void stop().then((take) => take && limit.current(take))
    }, 200)
    session.current = s
    setRecording(true)
  }

  // leaving the page mid-recording must not leave the mic on
  useEffect(() => () => {
    const s = session.current
    if (!s) return
    cancelAnimationFrame(s.raf)
    clearInterval(s.timer)
    s.rec.onstop = () => releaseMic(s)
    s.rec.stop()
  }, [])

  return { recording, seconds, levels, error, start, stop, cancel }
}
