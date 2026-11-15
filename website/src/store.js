import { create } from 'zustand'
import { guessQuality } from './quality'
import { sound } from './sound'
import { allPanels, zones } from './content'

const TOTAL_RELICS = 5 // 4 pedestal zones + 1 golden orb

// phase: 'title'    → cinematic flyover behind the title screen
//        'entering' → camera dives down to the player
//        'playing'  → player has control
export const useGame = create((set, get) => ({
  phase: 'title',
  introVideoPlaying: true, // true while intro.mp4 is playing so WebGL/Physics pauses for 0-lag video
  finishIntroVideo: () => set({ introVideoPlaying: false }),
  quality: guessQuality(), // 'high' | 'low'
  setQuality: (quality) => set({ quality }),
  started: false, // true once the player has control
  near: null,     // id of the artifact / orb / broom / guardian the player is next to
  open: null,     // id of the panel that is open
  discovered: [], // ids of discovered relics (out of the 5 core relics)
  mounted: false, // true when riding the Enchanted Broomstick
  muted: false,   // audio mute state
  duelHits: 0,    // number of times the player's spell hit the Dark Archmage
  banner: null,   // { title, subtitle, color, key } for RPG achievement popups
  teleportReq: null, // { x, z, yaw, ts } for Apparate fast-travel

  showBanner: (title, subtitle, color = '#e9c27a') =>
    set({ banner: { title, subtitle, color, key: Date.now() + Math.random() } }),

  enter: () => {
    const s = get()
    if (s.phase !== 'title') return
    sound.playDive()
    set({ phase: 'entering', introVideoPlaying: false })
  },

  play: () => {
    sound.startAmbience()
    set({
      phase: 'playing',
      started: true,
      banner: {
        title: 'THE ARENA AWAKENS',
        subtitle: 'Awaken all 5 Arcane Relics or press [F] to cast spells',
        color: '#e9c27a',
        key: Date.now(),
      },
    })
  },

  setNear: (near) => {
    const prev = get().near
    if (near && near !== prev && !get().open) {
      sound.playNearZone(near)
    }
    set({ near })
  },

  openZone: (id) => {
    if (!id) return
    const s = get()
    const panel = allPanels.find((p) => p.id === id)
    const isCoreRelic = zones.some((z) => z.id === id) || id === 'contact'
    const isNew = isCoreRelic && !s.discovered.includes(id)
    const nextDiscovered = isNew ? [...s.discovered, id] : s.discovered

    sound.playOpenPanel(isNew, id === 'contact')

    let banner = s.banner
    if (isNew && panel) {
      if (nextDiscovered.length === TOTAL_RELICS) {
        setTimeout(() => sound.playTrialComplete(), 450)
        banner = {
          title: 'ARCHMAGE ASCENDED · 5 / 5 RELICS',
          subtitle: 'You have mastered every relic in the Arena!',
          color: '#ffd54a',
          key: Date.now(),
        }
      } else {
        banner = {
          title: `RELIC AWAKENED (${nextDiscovered.length}/${TOTAL_RELICS})`,
          subtitle: `${panel.title} — ${panel.subtitle}`,
          color: panel.color || '#e9c27a',
          key: Date.now(),
        }
      }
    }

    set({ open: id, discovered: nextDiscovered, banner })
  },

  close: () => {
    if (get().open) sound.playClosePanel()
    set({ open: null })
  },

  toggleBroom: (forceState) => {
    const next = typeof forceState === 'boolean' ? forceState : !get().mounted
    sound.playBroomToggle(next)
    set({
      mounted: next,
      banner: next
        ? {
            title: 'NIMBUS BROOMSTICK MOUNTED',
            subtitle: 'Hold [Space] to ascend · [C] to descend · [B] to dismount',
            color: '#ffd54a',
            key: Date.now(),
          }
        : null,
    })
  },

  registerDuelHit: () => {
    const hits = get().duelHits + 1
    const quotes = [
      '“Impressive reflexes, apprentice... but have you read the Ancient Tome?”',
      '“Your Stupefy carries the spark of an AI Conjurer!”',
      '“My arcane shield holds! Press [E] before me if you dare inspect your trial.”',
      '“Wield the Wand, uncork the Flask, and seize the Golden Orb!”',
    ]
    set({
      duelHits: hits,
      banner: {
        title: `ARCANE SHIELD STRUCK (×${hits})`,
        subtitle: quotes[(hits - 1) % quotes.length],
        color: '#ff4961',
        key: Date.now(),
      },
    })
  },

  teleportTo: (x, z, label, color) => {
    sound.playTeleport()
    set({
      open: null,
      teleportReq: { x, z, ts: Date.now() },
      banner: label
        ? {
            title: `APPARATED TO ${label.toUpperCase()}`,
            subtitle: 'Press [E] to inspect this relic',
            color: color || '#e9c27a',
            key: Date.now(),
          }
        : get().banner,
    })
  },

  toggleMute: () => {
    const muted = sound.toggleMute()
    set({ muted })
  },
}))

if (import.meta.env.DEV) window.__game = useGame
