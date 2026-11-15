// ─────────────────────────────────────────────────────────────────────────────
//  Procedural Web Audio Engine — Ambience, Spatial SFX, Spells & RPG UI Cues
// ─────────────────────────────────────────────────────────────────────────────

class SoundEngine {
  constructor() {
    this.ctx = null
    this.master = null
    this.reverb = null
    this.sfxGain = null
    this.ambGain = null
    this.muted = false
    this.ambienceStarted = false
    this._chimeTimer = null
    this._lastHover = 0
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
      return this.ctx
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    try {
      this.ctx = new AudioCtx()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.85
      this.master.connect(this.ctx.destination)

      // Dry/wet buses
      this.sfxGain = this.ctx.createGain()
      this.sfxGain.gain.value = 0.9
      this.sfxGain.connect(this.master)

      this.ambGain = this.ctx.createGain()
      this.ambGain.gain.value = 0.55
      this.ambGain.connect(this.master)

      // Algorithmic cathedral / gothic arena impulse response (2.6s tail)
      this.reverb = this._createReverb(2.6, 2.4)
      const revGain = this.ctx.createGain()
      revGain.gain.value = 0.42
      this.reverb.connect(revGain)
      revGain.connect(this.master)
    } catch {
      return null
    }
    return this.ctx
  }

  _createReverb(duration = 2.4, decay = 2.2) {
    const ctx = this.ctx
    const rate = ctx.sampleRate
    const length = Math.floor(rate * duration)
    const impulse = ctx.createBuffer(2, length, rate)
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch)
      for (let i = 0; i < length; i++) {
        const env = Math.pow(1 - i / length, decay)
        data[i] = (Math.random() * 2 - 1) * env * 0.6
      }
    }
    const convolver = ctx.createConvolver()
    convolver.buffer = impulse
    return convolver
  }

  _noiseBuffer(seconds = 2, type = 'pink') {
    const ctx = this.ctx
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const out = buf.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      if (type === 'white') {
        out[i] = w
      } else {
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.96900 * b2 + w * 0.1538520
        b3 = 0.86650 * b3 + w * 0.3104856
        b4 = 0.55000 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.0168980
        out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.04
        b6 = w * 0.115926
      }
    }
    return buf
  }

  setMuted(muted) {
    this.muted = muted
    if (this.ctx && this.master) {
      const t = this.ctx.currentTime
      this.master.gain.setTargetAtTime(muted ? 0 : 0.85, t, 0.08)
    }
  }

  toggleMute() {
    this.init()
    this.setMuted(!this.muted)
    if (!this.muted) this.playClick()
    return this.muted
  }

  // ── Ambient Gothic Arena Soundscape ──
  startAmbience() {
    const ctx = this.init()
    if (!ctx || this.ambienceStarted) return
    this.ambienceStarted = true

    const now = ctx.currentTime
    // 1. Deep nocturnal wind (filtered pink noise with slow LFO)
    const windSrc = ctx.createBufferSource()
    windSrc.buffer = this._noiseBuffer(6, 'pink')
    windSrc.loop = true

    const windFilter = ctx.createBiquadFilter()
    windFilter.type = 'bandpass'
    windFilter.frequency.value = 240
    windFilter.Q.value = 2.8

    const windLfo = ctx.createOscillator()
    windLfo.frequency.value = 0.11
    const windLfoGain = ctx.createGain()
    windLfoGain.gain.value = 110
    windLfo.connect(windLfoGain)
    windLfoGain.connect(windFilter.frequency)
    windLfo.start(now)

    const windGain = ctx.createGain()
    windGain.gain.setValueAtTime(0.001, now)
    windGain.gain.exponentialRampToValueAtTime(0.18, now + 3.0)

    windSrc.connect(windFilter)
    windFilter.connect(windGain)
    windGain.connect(this.ambGain)
    windSrc.start(now)

    // 2. Warm mystical E-Dorian pad drone (E2, B2, G3, F#3)
    const freqs = [82.41, 123.47, 164.81, 196.0]
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator()
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle'
      osc.frequency.value = f
      osc.detune.value = (idx - 1.5) * 6

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 420

      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, now)
      g.gain.exponentialRampToValueAtTime(idx === 0 ? 0.08 : 0.032, now + 4.0)

      osc.connect(filter)
      filter.connect(g)
      g.connect(this.ambGain)
      if (this.reverb) g.connect(this.reverb)
      osc.start(now)
    })

    // 3. Occasional distant celesta / music-box notes (E Dorian scale)
    const scale = [329.63, 369.99, 392.00, 440.00, 493.88, 554.37, 587.33, 659.25, 783.99]
    const scheduleChime = () => {
      if (!this.ctx || !this.ambienceStarted) return
      if (!this.muted && this.ctx.state === 'running') {
        const t = this.ctx.currentTime
        const note = scale[Math.floor(Math.random() * scale.length)]
        this._playCelestaNote(note, t, 0.045)
        if (Math.random() > 0.45) {
          const second = scale[Math.floor(Math.random() * scale.length)]
          this._playCelestaNote(second, t + 0.38 + Math.random() * 0.25, 0.035)
        }
      }
      this._chimeTimer = setTimeout(scheduleChime, 3400 + Math.random() * 4200)
    }
    this._chimeTimer = setTimeout(scheduleChime, 2200)
  }

  _playCelestaNote(freq, startTime, peak = 0.06) {
    const ctx = this.ctx
    if (!ctx) return
    const osc = ctx.createOscillator()
    const sub = ctx.createOscillator()
    osc.type = 'sine'
    sub.type = 'triangle'
    osc.frequency.setValueAtTime(freq, startTime)
    sub.frequency.setValueAtTime(freq * 2, startTime)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, startTime)
    gain.gain.linearRampToValueAtTime(peak, startTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 2.8)

    const subGain = ctx.createGain()
    subGain.gain.setValueAtTime(peak * 0.25, startTime)
    subGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.7)

    osc.connect(gain)
    sub.connect(subGain)
    subGain.connect(gain)
    gain.connect(this.ambGain)
    if (this.reverb) gain.connect(this.reverb)

    osc.start(startTime)
    sub.start(startTime)
    osc.stop(startTime + 2.9)
    sub.stop(startTime + 0.8)
  }

  // ── Cinematic Camera Dive (Title -> Arena) ──
  playDive() {
    const ctx = this.init()
    if (!ctx) return
    this.startAmbience()
    const t = ctx.currentTime

    // Deep sub-bass cinematic impact
    const sub = ctx.createOscillator()
    sub.type = 'sine'
    sub.frequency.setValueAtTime(110, t)
    sub.frequency.exponentialRampToValueAtTime(34, t + 2.4)
    const subGain = ctx.createGain()
    subGain.gain.setValueAtTime(0.001, t)
    subGain.gain.linearRampToValueAtTime(0.42, t + 0.08)
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 2.7)
    sub.connect(subGain)
    subGain.connect(this.sfxGain)
    sub.start(t)
    sub.stop(t + 2.8)

    // Swooping wind rush
    const noise = ctx.createBufferSource()
    noise.buffer = this._noiseBuffer(3.2, 'pink')
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 1.6
    filter.frequency.setValueAtTime(180, t)
    filter.frequency.exponentialRampToValueAtTime(950, t + 1.4)
    filter.frequency.exponentialRampToValueAtTime(220, t + 3.0)
    const nGain = ctx.createGain()
    nGain.gain.setValueAtTime(0.001, t)
    nGain.gain.linearRampToValueAtTime(0.28, t + 1.2)
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 3.1)
    noise.connect(filter)
    filter.connect(nGain)
    nGain.connect(this.sfxGain)
    noise.start(t)
    noise.stop(t + 3.2)

    // Magical harp glissando
    const notes = [246.94, 293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25, 739.99, 987.77]
    notes.forEach((n, i) => {
      this._playCelestaNote(n, t + 0.12 + i * 0.14, 0.085)
    })
  }

  // ── Stone Courtyard Footsteps ──
  playFootstep(sprinting = false) {
    const ctx = this.init()
    if (!ctx || this.muted) return
    const t = ctx.currentTime

    // Low stone thud
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    const baseFreq = (sprinting ? 105 : 88) + (Math.random() - 0.5) * 18
    osc.frequency.setValueAtTime(baseFreq, t)
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.09)

    const oscGain = ctx.createGain()
    const vol = sprinting ? 0.16 : 0.1
    oscGain.gain.setValueAtTime(vol, t)
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1)

    osc.connect(oscGain)
    oscGain.connect(this.sfxGain)
    osc.start(t)
    osc.stop(t + 0.11)

    // Crisp stone grit tap
    const noise = ctx.createBufferSource()
    noise.buffer = this._noiseBuffer(0.09, 'pink')
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 900 + Math.random() * 500
    filter.Q.value = 1.8

    const nGain = ctx.createGain()
    nGain.gain.setValueAtTime(sprinting ? 0.12 : 0.07, t)
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.075)

    noise.connect(filter)
    filter.connect(nGain)
    nGain.connect(this.sfxGain)
    noise.start(t)
    noise.stop(t + 0.085)
  }

  // ── Jump / Levitate Whoosh ──
  playJump(isBroom = false) {
    const ctx = this.init()
    if (!ctx || this.muted) return
    const t = ctx.currentTime

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(isBroom ? 240 : 160, t)
    osc.frequency.exponentialRampToValueAtTime(isBroom ? 560 : 380, t + 0.28)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.001, t)
    gain.gain.linearRampToValueAtTime(0.14, t + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32)

    osc.connect(gain)
    gain.connect(this.sfxGain)
    if (this.reverb) gain.connect(this.reverb)
    osc.start(t)
    osc.stop(t + 0.34)
  }

  // ── Mount / Dismount Enchanted Broomstick ──
  playBroomToggle(mounting = true) {
    const ctx = this.init()
    if (!ctx || this.muted) return
    const t = ctx.currentTime
    const notes = mounting ? [329.63, 440, 554.37, 659.25] : [554.37, 440, 329.63]
    notes.forEach((f, i) => {
      this._playCelestaNote(f, t + i * 0.07, 0.09)
    })
    this.playJump(mounting)
  }

  // ── Wand Spell Cast ("Stupefy / Lumos Bolt") ──
  playSpellCast() {
    const ctx = this.init()
    if (!ctx || this.muted) return
    const t = ctx.currentTime

    // 1. Crystalline laser-chime sweep
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(920, t)
    osc.frequency.exponentialRampToValueAtTime(210, t + 0.32)

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(1600, t)
    filter.frequency.exponentialRampToValueAtTime(420, t + 0.32)
    filter.Q.value = 3.5

    const g = ctx.createGain()
    g.gain.setValueAtTime(0.24, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34)

    osc.connect(filter)
    filter.connect(g)
    g.connect(this.sfxGain)
    if (this.reverb) g.connect(this.reverb)
    osc.start(t)
    osc.stop(t + 0.35)

    // 2. High magical sparkle harmonic
    this._playCelestaNote(1174.66, t, 0.09)
    this._playCelestaNote(1567.98, t + 0.05, 0.07)

    // 3. Wand whip air burst
    const noise = ctx.createBufferSource()
    noise.buffer = this._noiseBuffer(0.22, 'white')
    const nf = ctx.createBiquadFilter()
    nf.type = 'highpass'
    nf.frequency.value = 1800
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.14, t)
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
    noise.connect(nf)
    nf.connect(ng)
    ng.connect(this.sfxGain)
    noise.start(t)
    noise.stop(t + 0.2)
  }

  // ── Spell Impact / Relic Ring / Dark Wizard Shield Deflection ──
  playSpellHit(isDarkWizard = false) {
    const ctx = this.init()
    if (!ctx || this.muted) return
    const t = ctx.currentTime

    // Resonant impact boom
    const osc = ctx.createOscillator()
    osc.type = isDarkWizard ? 'sawtooth' : 'triangle'
    osc.frequency.setValueAtTime(isDarkWizard ? 190 : 280, t)
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.45)

    const g = ctx.createGain()
    g.gain.setValueAtTime(0.26, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.48)
    osc.connect(g)
    g.connect(this.sfxGain)
    if (this.reverb) g.connect(this.reverb)
    osc.start(t)
    osc.stop(t + 0.5)

    // Harmonic ring
    const ring = isDarkWizard ? [311.13, 466.16, 622.25] : [523.25, 659.25, 783.99, 1046.5]
    ring.forEach((f, i) => this._playCelestaNote(f, t + i * 0.04, 0.08))
  }

  // ── Approaching a Pedestal Relic or Golden Orb ──
  playNearZone(id) {
    const ctx = this.init()
    if (!ctx || this.muted) return
    const t = ctx.currentTime
    const pitchMap = {
      about: [329.63, 493.88],
      projects: [369.99, 554.37],
      skills: [392.00, 587.33],
      experience: [440.00, 659.25],
      contact: [587.33, 880.00, 1174.66],
      dark_wizard: [164.81, 233.08],
      broom: [493.88, 739.99],
    }
    const notes = pitchMap[id] || [392.0, 587.33]
    notes.forEach((f, i) => this._playCelestaNote(f, t + i * 0.08, 0.075))
  }

  // ── Opening a Relic Panel / First-Time Discovery Fanfare ──
  playOpenPanel(isNewDiscovery = false, isOrb = false) {
    const ctx = this.init()
    if (!ctx || this.muted) return
    const t = ctx.currentTime

    // Parchment / Grimoire whoosh
    const noise = ctx.createBufferSource()
    noise.buffer = this._noiseBuffer(0.35, 'pink')
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(600, t)
    filter.frequency.exponentialRampToValueAtTime(1400, t + 0.28)
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.12, t)
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.32)
    noise.connect(filter)
    filter.connect(ng)
    ng.connect(this.sfxGain)
    noise.start(t)
    noise.stop(t + 0.34)

    if (isOrb) {
      // Golden Orb caught fanfare!
      const chord = [587.33, 739.99, 880.0, 1174.66, 1479.98]
      chord.forEach((f, i) => this._playCelestaNote(f, t + i * 0.07, 0.11))
    } else if (isNewDiscovery) {
      // Relic Awakened RPG chord
      const chord = [329.63, 415.30, 493.88, 659.25, 830.61]
      chord.forEach((f, i) => this._playCelestaNote(f, t + i * 0.08, 0.1))
    } else {
      // Standard tome open
      this._playCelestaNote(329.63, t, 0.08)
      this._playCelestaNote(493.88, t + 0.08, 0.08)
      this._playCelestaNote(659.25, t + 0.16, 0.07)
    }
  }

  playClosePanel() {
    const ctx = this.init()
    if (!ctx || this.muted) return
    const t = ctx.currentTime
    this._playCelestaNote(493.88, t, 0.06)
    this._playCelestaNote(329.63, t + 0.07, 0.06)
  }

  // ── All 5 Relics Discovered: Grand Archmage Fanfare ──
  playTrialComplete() {
    const ctx = this.init()
    if (!ctx || this.muted) return
    const t = ctx.currentTime
    const fanfare = [329.63, 392.0, 493.88, 659.25, 587.33, 783.99, 987.77, 1318.51]
    fanfare.forEach((f, i) => {
      this._playCelestaNote(f, t + i * 0.11, 0.12)
    })
  }

  // ── Apparate / Fast-Travel Teleport ──
  playTeleport() {
    const ctx = this.init()
    if (!ctx || this.muted) return
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(120, t)
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.18)
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.35)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.22, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.36)
    osc.connect(g)
    g.connect(this.sfxGain)
    if (this.reverb) g.connect(this.reverb)
    osc.start(t)
    osc.stop(t + 0.38)
    this._playCelestaNote(659.25, t + 0.1, 0.08)
    this._playCelestaNote(987.77, t + 0.18, 0.08)
  }

  // ── UI Card Hover & Click ──
  playHover() {
    const nowMs = performance.now()
    if (nowMs - this._lastHover < 55) return
    this._lastHover = nowMs
    const ctx = this.init()
    if (!ctx || this.muted) return
    const t = ctx.currentTime
    this._playCelestaNote(1046.5 + Math.random() * 120, t, 0.025)
  }

  playClick() {
    const ctx = this.init()
    if (!ctx || this.muted) return
    const t = ctx.currentTime
    this._playCelestaNote(659.25, t, 0.065)
    this._playCelestaNote(987.77, t + 0.045, 0.055)
  }
}

export const sound = new SoundEngine()
