import { useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { useGame } from './store'
import { profile, zones, contact, guardian, allPanels } from './content'
import { world } from './arena'
import { sound } from './sound'

const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ'
const CORE_RELICS = [...zones, contact]

/** Corner filigree SVG ornament for RPG cards and grimoire panels */
function CornerOrnament({ className }) {
  return (
    <svg className={className} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <path d="M2 34V8C2 4.686 4.686 2 8 2H34" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 28V10C6 7.79 7.79 6 10 6H28" stroke="currentColor" strokeWidth="1" strokeOpacity="0.6" />
      <rect x="4" y="4" width="4" height="4" transform="rotate(45 6 6)" fill="currentColor" />
    </svg>
  )
}

/** Spinning rune seal that fills up as the arena loads */
function RuneLoader({ progress }) {
  const r = 120
  const circ = 2 * Math.PI * r
  return (
    <div className="loader">
      <svg viewBox="-160 -160 320 320" className="loader__svg">
        <defs>
          <path id="runePath" d="M 0,-138 a 138,138 0 1,1 -0.01,0" />
        </defs>
        <g className="loader__spin-slow">
          <text className="loader__runes">
            <textPath href="#runePath">{(RUNES + RUNES).split('').join(' ')}</textPath>
          </text>
        </g>
        <circle r={r} className="loader__track" />
        <circle
          r={r}
          className="loader__fill"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - progress / 100)}
          transform="rotate(-90)"
        />
        <g className="loader__spin-rev">
          <circle r="96" className="loader__dash" />
          <polygon
            className="loader__star"
            points={Array.from({ length: 7 }, (_, i) => {
              const a = (i * 3 * Math.PI * 2) / 7 - Math.PI / 2
              return `${Math.cos(a) * 92},${Math.sin(a) * 92}`
            }).join(' ')}
          />
        </g>
      </svg>
      <div className="loader__pct">{Math.round(progress)}<span>%</span></div>
      <div className="loader__text">Raising the arena</div>
    </div>
  )
}

function Intro() {
  const { progress, active } = useProgress()
  const phase = useGame((s) => s.phase)
  const enter = useGame((s) => s.enter)
  const finishIntroVideo = useGame((s) => s.finishIntroVideo)
  const videoRef = useRef()
  const [videoEnded, setVideoEnded] = useState(false)
  const ready = !active && progress >= 100

  useEffect(() => {
    if (!ready || !videoRef.current) return
    // Wait one beat after 3D shader/mesh upload finishes so video playback starts with zero GPU contention
    const timer = setTimeout(() => {
      videoRef.current?.play().catch(() => {
        setVideoEnded(true)
        finishIntroVideo()
      })
    }, 120)
    return () => clearTimeout(timer)
  }, [ready, finishIntroVideo])

  useEffect(() => {
    if (phase !== 'title' && videoRef.current) {
      videoRef.current.pause()
    }
  }, [phase])

  useEffect(() => {
    if (!ready || phase !== 'title') return
    const go = (e) => {
      if (e.type === 'keydown' && !['Enter', 'Space'].includes(e.code)) return
      enter()
      Promise.resolve(document.querySelector('canvas')?.requestPointerLock?.()).catch(() => {})
    }
    window.addEventListener('keydown', go)
    window.addEventListener('pointerdown', go)
    return () => {
      window.removeEventListener('keydown', go)
      window.removeEventListener('pointerdown', go)
    }
  }, [ready, phase, enter])

  if (phase === 'playing') return null
  const leaving = phase === 'entering'

  const handleVideoEnd = () => {
    setVideoEnded(true)
    finishIntroVideo()
  }

  return (
    <div className={`cine ${ready ? 'is-ready' : ''} ${leaving ? 'is-leaving' : ''}`}>
      {/* Cinematic Intro Video (plays once while 3D WebGL is paused, then fades to live 3D arena) */}
      <video
        ref={videoRef}
        className={`cine__video ${videoEnded ? 'is-ended' : ''}`}
        src="/intro.mp4"
        muted
        playsInline
        preload="auto"
        onEnded={handleVideoEnd}
        onError={handleVideoEnd}
      />

      <div className="cine__bar cine__bar--top" />
      <div className="cine__bar cine__bar--bottom">
        {ready && !leaving && (
          <div className="cine__keys">
            <span><kbd>W A S D</kbd> move</span>
            <span><kbd>Shift</kbd> sprint</span>
            <span><kbd>Space</kbd> jump / fly</span>
            <span><kbd>F</kbd> cast spell</span>
            <span><kbd>B</kbd> broomstick</span>
            <span><kbd>E</kbd> interact</span>
          </div>
        )}
      </div>

      {/* loading veil */}
      <div className="cine__veil">
        <RuneLoader progress={progress} />
      </div>

      {ready && (
        <div className="cine__title">
          <div className="cine__eyebrow">{profile.titleRank}</div>
          <h1 className="cine__name" aria-label={profile.name}>
            {profile.name.split('').map((ch, i) => (
              <span key={i} style={{ animationDelay: `${0.5 + i * 0.07}s` }}>{ch === ' ' ? '\u00A0' : ch}</span>
            ))}
          </h1>
          <div className="cine__rule" />
          <div className="cine__role">{profile.role}</div>
          <p className="cine__tagline">{profile.tagline}</p>
          <div className="cine__press">
            <span>✦</span> Press <kbd>Enter</kbd> or Click to Enter the Arena <span>✦</span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Skyrim / Hogwarts Legacy style Top Compass Bar showing cardinal directions & live 3D markers */
function CompassHUD() {
  const stripRef = useRef()
  const markerRefs = useRef({})
  const distRef = useRef()
  const near = useGame((s) => s.near)
  const discovered = useGame((s) => s.discovered)

  const compassPoints = [
    { label: 'N', angle: 0 },
    { label: 'NE', angle: Math.PI * 0.25 },
    { label: 'E', angle: Math.PI * 0.5 },
    { label: 'SE', angle: Math.PI * 0.75 },
    { label: 'S', angle: Math.PI },
    { label: 'SW', angle: -Math.PI * 0.75 },
    { label: 'W', angle: -Math.PI * 0.5 },
    { label: 'NW', angle: -Math.PI * 0.25 },
  ]

  useEffect(() => {
    let raf = 0
    const update = () => {
      const yaw = world.camYaw || 0
      const px = world.playerPos.x
      const pz = world.playerPos.z

      // Position cardinal ticks
      compassPoints.forEach((pt) => {
        const el = markerRefs.current[`card-${pt.label}`]
        if (!el) return
        let diff = pt.angle - yaw
        diff = Math.atan2(Math.sin(diff), Math.cos(diff))
        const visible = Math.abs(diff) < 1.15
        el.style.opacity = visible ? String(1 - Math.abs(diff) / 1.15) : '0'
        el.style.transform = `translate(-50%, -50%) translateX(${diff * 155}px)`
      })

      // Position live relic & NPC markers
      const targets = [
        ...zones.map((z) => ({ id: z.id, x: z.position[0], z: z.position[2] })),
        { id: contact.id, x: world.orb.x, z: world.orb.z },
        { id: guardian.id, x: guardian.position[0], z: guardian.position[2] },
      ]

      let closestDist = Infinity
      let closestName = ''

      targets.forEach((t) => {
        const el = markerRefs.current[`poi-${t.id}`]
        if (!el) return
        const dx = t.x - px
        const dz = t.z - pz
        const dist = Math.hypot(dx, dz)
        if (dist < closestDist && t.id !== guardian.id) {
          closestDist = dist
          const found = CORE_RELICS.find((r) => r.id === t.id)
          if (found) closestName = `${found.subtitle} (${Math.round(dist)}m)`
        }
        // Camera looks along (-sin(yaw), -cos(yaw))
        const targetAngle = Math.atan2(-dx, -dz)
        let diff = yaw - targetAngle
        diff = Math.atan2(Math.sin(diff), Math.cos(diff))
        const clamped = Math.max(-1.05, Math.min(1.05, diff))
        const edgeFade = Math.abs(diff) > 1.05 ? 0.35 : 1
        el.style.opacity = String(edgeFade)
        el.style.transform = `translate(-50%, -50%) translateX(${clamped * 155}px)`
      })

      if (distRef.current && closestName) {
        distRef.current.textContent = `Nearest Relic: ${closestName}`
      }

      raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [])

  const poiList = [
    ...zones.map((z) => ({ id: z.id, icon: z.icon, color: z.color, title: z.subtitle })),
    { id: contact.id, icon: contact.icon, color: contact.color, title: contact.subtitle },
    { id: guardian.id, icon: guardian.icon, color: guardian.color, title: 'Overseer' },
  ]

  return (
    <div className="compass" aria-hidden="true">
      <div className="compass__frame" ref={stripRef}>
        <div className="compass__center-tick" />
        {compassPoints.map((pt) => (
          <span
            key={pt.label}
            ref={(el) => (markerRefs.current[`card-${pt.label}`] = el)}
            className={`compass__cardinal ${pt.label.length === 1 ? 'is-major' : ''}`}
          >
            {pt.label}
          </span>
        ))}
        {poiList.map((poi) => {
          const isDisc = discovered.includes(poi.id)
          const isNear = near === poi.id
          return (
            <span
              key={poi.id}
              ref={(el) => (markerRefs.current[`poi-${poi.id}`] = el)}
              className={`compass__poi ${isDisc ? 'is-discovered' : ''} ${isNear ? 'is-near' : ''}`}
              style={{ '--c': poi.color }}
              title={poi.title}
            >
              {poi.icon}
            </span>
          )
        })}
      </div>
      <div className="compass__sub" ref={distRef}>Explore the Arena</div>
    </div>
  )
}

/** Achievement / Discovery Banner Toast */
function BannerToast() {
  const banner = useGame((s) => s.banner)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!banner) return
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), 3800)
    return () => clearTimeout(timer)
  }, [banner])

  if (!banner) return null
  return (
    <div key={banner.key} className={`rpg-banner ${visible ? 'is-visible' : ''}`} style={{ '--c': banner.color }}>
      <div className="rpg-banner__line" />
      <div className="rpg-banner__eyebrow">✦ {banner.title} ✦</div>
      <div className="rpg-banner__sub">{banner.subtitle}</div>
      <div className="rpg-banner__line" />
    </div>
  )
}

/** Prompt shown when standing next to an interactive relic, broomstick, or the Dark Archmage */
function Prompt() {
  const near = useGame((s) => s.near)
  const open = useGame((s) => s.open)
  const started = useGame((s) => s.started)
  const toggleBroom = useGame((s) => s.toggleBroom)
  const openZone = useGame((s) => s.openZone)

  if (!started || !near || open) return null

  if (near === 'broom') {
    return (
      <div
        className="prompt is-clickable"
        style={{ '--c': '#ffd54a' }}
        onClick={() => toggleBroom(true)}
      >
        <kbd>E</kbd> or <kbd>B</kbd> Mount <strong>Nimbus Broomstick</strong>
      </div>
    )
  }

  const zone = allPanels.find((z) => z.id === near)
  if (!zone) return null
  return (
    <div
      className="prompt is-clickable"
      style={{ '--c': zone.color }}
      onClick={() => openZone(zone.id)}
    >
      <span className="prompt__icon">{zone.icon}</span>
      <kbd>E</kbd> {zone.verb} <strong>{zone.title}</strong>
      <span className="prompt__sub">({zone.subtitle})</span>
    </div>
  )
}

/** Rich RPG Grimoire Content for each Relic Panel */
function PanelBody({ zone, onSelectZone }) {
  const [copied, setCopied] = useState(false)
  const discovered = useGame((s) => s.discovered)
  const duelHits = useGame((s) => s.duelHits)
  const teleportTo = useGame((s) => s.teleportTo)

  const handleCopy = (val) => {
    sound.playClick()
    navigator.clipboard?.writeText(val).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  switch (zone.type) {
    case 'about':
      return (
        <div className="grimoire-section">
          {/* RPG Character Sheet Stat Row */}
          <div className="stat-grid">
            {profile.stats.map((st) => (
              <div key={st.label} className="stat-box" onMouseEnter={() => sound.playHover()}>
                <div className="stat-box__label">{st.label}</div>
                <div className="stat-box__val">{st.value}</div>
              </div>
            ))}
          </div>

          <div className="manuscript">
            {zone.paragraphs.map((p, i) => (
              <p key={i} className={i === 0 ? 'manuscript__lead' : ''}>{p}</p>
            ))}
          </div>

          {zone.highlights && (
            <>
              <div className="section-divider"><span>✦ ROYAL MERITS & HONORS ✦</span></div>
              <ul className="highlights">
                {zone.highlights.map((h) => (
                  <li key={h.text} className="trophy-card" onMouseEnter={() => sound.playHover()}>
                    <CornerOrnament className="card-corner card-corner--tl" />
                    <CornerOrnament className="card-corner card-corner--br" />
                    <div className="trophy-card__emblem">{h.icon || '🏆'}</div>
                    <div className="trophy-card__content">
                      <div className="trophy-card__head">
                        <span className="trophy-card__badge">{h.label}</span>
                        {h.tier && <span className="trophy-card__tier">{h.tier} HONOR</span>}
                      </div>
                      <div className="trophy-card__text">{h.text}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )

    case 'projects':
      return (
        <div className="cards">
          {zone.items.map((it, idx) => (
            <a
              key={it.title}
              className="card"
              href={it.link}
              target="_blank"
              rel="noreferrer"
              onMouseEnter={() => sound.playHover()}
              onClick={() => sound.playClick()}
            >
              <CornerOrnament className="card-corner card-corner--tl" />
              <CornerOrnament className="card-corner card-corner--tr" />
              <CornerOrnament className="card-corner card-corner--bl" />
              <CornerOrnament className="card-corner card-corner--br" />

              <div className="card__topbar">
                <span className="card__rarity">★ {it.rarity || `SPELL RELIC 0${idx + 1}`}</span>
                <span className="card__power">⚡ {it.power || 95} PWR</span>
              </div>

              <div className="card__hero">
                <div className="card__sigil">{it.icon || '🪄'}</div>
                <div>
                  <div className="card__school">{it.school || 'Arcane Engineering'}</div>
                  <h3 className="card__title">{it.title}</h3>
                </div>
              </div>

              <p className="card__desc">{it.desc}</p>

              <div className="card__runes-label">Socketed Enchantments</div>
              <div className="tags">
                {it.tags.map((t) => (
                  <span key={t}>❖ {t}</span>
                ))}
              </div>

              {it.cta && (
                <div className="card__cta">
                  <span>✦ {it.cta}</span>
                  <span className="card__arrow">→</span>
                </div>
              )}
            </a>
          ))}
        </div>
      )

    case 'skills':
      return (
        <div className="skills">
          {zone.groups.map((g) => (
            <div key={g.name} className="skill-card" onMouseEnter={() => sound.playHover()}>
              <CornerOrnament className="card-corner card-corner--tl" />
              <CornerOrnament className="card-corner card-corner--br" />
              <div className="skill-card__head">
                <div className="skill-card__title-wrap">
                  <span className="skill-card__icon">{g.icon || '⚗️'}</span>
                  <div>
                    <h3>{g.name}</h3>
                    <div className="skill-card__rank">{g.level || 'MASTER'} DISCIPLINE</div>
                  </div>
                </div>
                <div className="skill-card__pct">{g.mastery || 92}%</div>
              </div>
              <div className="skill-card__bar">
                <div className="skill-card__bar-fill" style={{ width: `${g.mastery || 92}%` }} />
              </div>
              <div className="tags">
                {g.items.map((t) => (
                  <span key={t} onMouseEnter={() => sound.playHover()}>✦ {t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )

    case 'experience':
      return (
        <ol className="timeline">
          {zone.items.map((it) => (
            <li key={it.role + it.org} className="timeline-card" onMouseEnter={() => sound.playHover()}>
              <CornerOrnament className="card-corner card-corner--tl" />
              <CornerOrnament className="card-corner card-corner--br" />
              <div className="timeline__meta">
                <span className="timeline__rank">⚜ {it.rank || 'GUILD EXPEDITION'}</span>
                <span className="timeline__period">ERA · {it.period}</span>
              </div>
              <div className="timeline__head">
                <h3>{it.role}</h3>
              </div>
              <div className="timeline__org">{it.org}</div>
              <p>{it.desc}</p>
            </li>
          ))}
        </ol>
      )

    case 'contact':
      return (
        <div className="grimoire-section">
          {zone.intro && <p className="contact-intro">{zone.intro}</p>}
          <ul className="links">
            {zone.links.map((l) => (
              <li key={l.label} className="contact-card" onMouseEnter={() => sound.playHover()}>
                <CornerOrnament className="card-corner card-corner--tl" />
                <CornerOrnament className="card-corner card-corner--br" />
                <div className="contact-card__left">
                  <span className="contact-card__icon">{l.icon || '✨'}</span>
                  <div>
                    <div className="contact-card__label">{l.label}</div>
                    {l.href ? (
                      <a
                        className="contact-card__val"
                        href={l.href}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => sound.playClick()}
                      >
                        {l.value}
                      </a>
                    ) : (
                      <b className="contact-card__val">{l.value}</b>
                    )}
                  </div>
                </div>
                <div className="contact-card__actions">
                  {l.copyable && (
                    <button
                      type="button"
                      className="rpg-btn rpg-btn--sm"
                      onClick={() => handleCopy(l.value)}
                    >
                      {copied ? '✓ Copied Scroll!' : 'Copy Owl Address'}
                    </button>
                  )}
                  {l.href && (
                    <a
                      className="rpg-btn rpg-btn--sm"
                      href={l.href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => sound.playClick()}
                    >
                      Open Portal →
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )

    case 'guardian':
      return (
        <div className="grimoire-section">
          <div className="guardian-status">
            <div className="stat-box">
              <div className="stat-box__label">Relics Awakened</div>
              <div className="stat-box__val">{discovered.length} / 5 Core Relics</div>
            </div>
            <div className="stat-box">
              <div className="stat-box__label">Spells Struck on Shield</div>
              <div className="stat-box__val">{duelHits} {duelHits === 1 ? 'Strike' : 'Strikes'}</div>
            </div>
            <div className="stat-box">
              <div className="stat-box__label">Trial Rank</div>
              <div className="stat-box__val">
                {discovered.length >= 5 ? '👑 GRAND ARCHMAGE' : discovered.length >= 3 ? '⚔️ ADEPT CONJURER' : '🪄 INITIATE'}
              </div>
            </div>
          </div>

          <p className="manuscript__lead">
            {discovered.length >= 5
              ? '“You have awakened all five relics of Abhijith Nagula’s sanctum! Every tome, wand, elixir, chronicle, and the Golden Orb answers to your call.”'
              : '“Seek out the five glowing relics across this arena—or use my Astral Portals below to inspect or Apparate directly to any relic:”'}
          </p>

          <div className="section-divider"><span>✦ ASTRAL PORTALS TO THE FIVE RELICS ✦</span></div>
          <div className="guardian-relics">
            {CORE_RELICS.map((r) => {
              const isAwakened = discovered.includes(r.id)
              return (
                <div
                  key={r.id}
                  className={`guardian-relic-card ${isAwakened ? 'is-awakened' : ''}`}
                  style={{ '--c': r.color }}
                  onMouseEnter={() => sound.playHover()}
                >
                  <div className="guardian-relic-card__head">
                    <span className="guardian-relic-card__icon">{r.icon}</span>
                    <div>
                      <div className="guardian-relic-card__sub">RELIC {r.numeral} · {r.subtitle}</div>
                      <h4>{r.title}</h4>
                    </div>
                    <span className="guardian-relic-card__status">
                      {isAwakened ? '✦ AWAKENED' : 'UNSEALED'}
                    </span>
                  </div>
                  <div className="guardian-relic-card__actions">
                    <button
                      type="button"
                      className="rpg-btn rpg-btn--sm"
                      onClick={() => {
                        sound.playClick()
                        onSelectZone(r.id)
                      }}
                    >
                      Inspect Grimoire
                    </button>
                    {r.position && (
                      <button
                        type="button"
                        className="rpg-btn rpg-btn--sm rpg-btn--ghost"
                        onClick={() => teleportTo(r.position[0] * 0.72, r.position[2] * 0.72 + 1.8, r.title, r.color)}
                      >
                        Apparate Here ⚡
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )

    default:
      return null
  }
}

function Panel() {
  const open = useGame((s) => s.open)
  const close = useGame((s) => s.close)
  const openZone = useGame((s) => s.openZone)
  const discovered = useGame((s) => s.discovered)
  const zone = allPanels.find((z) => z.id === open)
  if (!zone) return null

  return (
    <div className="panel-wrap" onClick={close}>
      <div className="panel" style={{ '--c': zone.color }} onClick={(e) => e.stopPropagation()}>
        <CornerOrnament className="panel__corner panel__corner--tl" />
        <CornerOrnament className="panel__corner panel__corner--tr" />
        <CornerOrnament className="panel__corner panel__corner--bl" />
        <CornerOrnament className="panel__corner panel__corner--br" />

        {/* Relic Switcher Navigation Bar inside the Grimoire */}
        <div className="panel__nav">
          {CORE_RELICS.map((r) => {
            const active = r.id === zone.id
            const isDisc = discovered.includes(r.id)
            return (
              <button
                key={r.id}
                type="button"
                className={`panel__tab ${active ? 'is-active' : ''} ${isDisc ? 'is-discovered' : ''}`}
                style={{ '--tc': r.color }}
                onMouseEnter={() => sound.playHover()}
                onClick={() => openZone(r.id)}
              >
                <span className="panel__tab-icon">{r.icon}</span>
                <span className="panel__tab-label">{r.subtitle}</span>
                {isDisc && <span className="panel__tab-dot" />}
              </button>
            )
          })}
          <button
            type="button"
            className={`panel__tab ${zone.id === guardian.id ? 'is-active' : ''}`}
            style={{ '--tc': guardian.color }}
            onMouseEnter={() => sound.playHover()}
            onClick={() => openZone(guardian.id)}
          >
            <span className="panel__tab-icon">{guardian.icon}</span>
            <span className="panel__tab-label">Overseer</span>
          </button>
        </div>

        <button
          className="panel__close"
          onClick={close}
          onMouseEnter={() => sound.playHover()}
          aria-label="Close"
        >
          ×
        </button>

        {/* Ornate Grimoire Header */}
        <div className="panel__header">
          <div className="panel__crest">
            <span>{zone.icon || '✦'}</span>
          </div>
          <div className="panel__header-text">
            <div className="panel__badges">
              {zone.numeral && <span className="panel__rarity">RELIC {zone.numeral} · {zone.rarity}</span>}
              <span className="panel__sub">{zone.subtitle}</span>
            </div>
            <h2 className="panel__title">{zone.title}</h2>
            {zone.lore && <p className="panel__lore">{zone.lore}</p>}
          </div>
        </div>

        <div className="panel__divider" />

        <div className="panel__body">
          <PanelBody zone={zone} onSelectZone={(id) => openZone(id)} />
        </div>

        <div className="panel__footer">
          <div className="panel__hint">
            Press <kbd>Esc</kbd> or <kbd>E</kbd> to return to the Arena · Switch relics with <kbd>1</kbd>–<kbd>5</kbd>
          </div>
          <button type="button" className="rpg-btn" onClick={close}>
            Close Grimoire
          </button>
        </div>
      </div>
    </div>
  )
}

/** Top-Right Quest Tracker & Relic Progression + Audio / Quality Controls */
function QuestHUD() {
  const discovered = useGame((s) => s.discovered)
  const openZone = useGame((s) => s.openZone)
  const muted = useGame((s) => s.muted)
  const toggleMute = useGame((s) => s.toggleMute)
  const quality = useGame((s) => s.quality)
  const setQuality = useGame((s) => s.setQuality)

  const count = discovered.length
  const complete = count >= 5

  return (
    <div className="quest-hud">
      <div className="quest-hud__controls">
        <button
          type="button"
          className={`hud-pill ${muted ? 'is-muted' : ''}`}
          onClick={toggleMute}
          title="Toggle Sound Effects & Ambience [M]"
        >
          <span>{muted ? '🔇' : '🔊'}</span>
          <span>{muted ? 'Audio Muted' : 'Sound On'}</span>
          <kbd>M</kbd>
        </button>
        <button
          type="button"
          className="hud-pill"
          onClick={() => {
            sound.playClick()
            setQuality(quality === 'high' ? 'low' : 'high')
          }}
          title="Toggle Graphics Quality Tier"
        >
          <span>✨</span>
          <span>{quality === 'high' ? 'High FX' : 'Fast FX'}</span>
        </button>
      </div>

      <div className={`quest-card ${complete ? 'is-complete' : ''}`}>
        <div className="quest-card__head">
          <span className="quest-card__tag">{complete ? '★ QUEST COMPLETE' : '◆ ACTIVE TRIAL'}</span>
          <span className="quest-card__count">{count} / 5</span>
        </div>
        <div className="quest-card__title">
          {complete ? 'Master of the Five Relics' : 'Awaken the Five Relics'}
        </div>
        <div className="quest-card__bar">
          <div className="quest-card__bar-fill" style={{ width: `${(count / 5) * 100}%` }} />
        </div>
        <div className="quest-card__slots">
          {CORE_RELICS.map((r) => {
            const unlocked = discovered.includes(r.id)
            return (
              <button
                key={r.id}
                type="button"
                className={`quest-slot ${unlocked ? 'is-unlocked' : ''}`}
                style={{ '--c': r.color }}
                onMouseEnter={() => sound.playHover()}
                onClick={() => openZone(r.id)}
                title={`${r.title} (${r.subtitle}) — Click to open [${r.hotkey}]`}
              >
                <span className="quest-slot__icon">{r.icon}</span>
                <span className="quest-slot__label">{r.subtitle}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Bottom-Center RPG Spell & Fast-Travel Action Hotbar */
function ActionHotbar() {
  const discovered = useGame((s) => s.discovered)
  const mounted = useGame((s) => s.mounted)
  const toggleBroom = useGame((s) => s.toggleBroom)
  const openZone = useGame((s) => s.openZone)
  const teleportTo = useGame((s) => s.teleportTo)

  const handleRelicSlot = (r) => {
    if (discovered.includes(r.id) || r.id === contact.id) {
      openZone(r.id)
    } else if (r.position) {
      teleportTo(r.position[0] * 0.72, r.position[2] * 0.72 + 1.8, r.title, r.color)
    }
  }

  return (
    <div className="hotbar">
      {CORE_RELICS.map((r) => {
        const unlocked = discovered.includes(r.id)
        return (
          <button
            key={r.id}
            type="button"
            className={`hotbar__slot ${unlocked ? 'is-unlocked' : ''}`}
            style={{ '--c': r.color }}
            onMouseEnter={() => sound.playHover()}
            onClick={() => handleRelicSlot(r)}
            title={unlocked ? `Open ${r.title} [${r.hotkey}]` : `Apparate to ${r.title} [${r.hotkey}]`}
          >
            <kbd className="hotbar__key">{r.hotkey}</kbd>
            <span className="hotbar__icon">{r.icon}</span>
            <span className="hotbar__name">{r.subtitle}</span>
          </button>
        )
      })}

      <div className="hotbar__sep" />

      <button
        type="button"
        className="hotbar__slot hotbar__slot--spell"
        style={{ '--c': '#7fb2ff' }}
        onMouseEnter={() => sound.playHover()}
        onClick={() => window.__castSpell?.()}
        title="Cast Arcane Bolt [F or Left-Click]"
      >
        <kbd className="hotbar__key">F</kbd>
        <span className="hotbar__icon">⚡</span>
        <span className="hotbar__name">Stupefy</span>
      </button>

      <button
        type="button"
        className={`hotbar__slot ${mounted ? 'is-active-mount' : ''}`}
        style={{ '--c': '#ffd54a' }}
        onMouseEnter={() => sound.playHover()}
        onClick={() => toggleBroom()}
        title="Summon / Dismount Nimbus Broomstick [B]"
      >
        <kbd className="hotbar__key">B</kbd>
        <span className="hotbar__icon">🧹</span>
        <span className="hotbar__name">{mounted ? 'Dismount' : 'Nimbus'}</span>
      </button>
    </div>
  )
}

export default function UI() {
  useEffect(() => {
    const onKey = (e) => {
      const s = useGame.getState()
      if (!s.started) return

      // Mute toggle [M]
      if (e.code === 'KeyM') {
        s.toggleMute()
        return
      }

      // Broomstick toggle [B]
      if (e.code === 'KeyB' && !s.open) {
        s.toggleBroom()
        return
      }

      // Number keys 1-5: open or Apparate to relic
      if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(e.code)) {
        const idx = Number(e.code.replace('Digit', '')) - 1
        const r = CORE_RELICS[idx]
        if (r) {
          if (s.open === r.id) {
            s.close()
          } else {
            s.openZone(r.id)
            document.exitPointerLock?.()
          }
        }
        return
      }

      // Interact [E]
      if (e.code === 'KeyE') {
        if (s.open) {
          s.close()
          Promise.resolve(document.querySelector('canvas')?.requestPointerLock?.()).catch(() => {})
        } else if (s.near === 'broom') {
          s.toggleBroom(true)
        } else if (s.near) {
          s.openZone(s.near)
          document.exitPointerLock?.()
        }
      }

      if (e.code === 'Escape' && s.open) s.close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const started = useGame((s) => s.started)
  const open = useGame((s) => s.open)
  const mounted = useGame((s) => s.mounted)
  const discovered = useGame((s) => s.discovered)

  return (
    <>
      <Intro />
      {started && !open && <CompassHUD />}
      <BannerToast />
      <Prompt />
      <Panel />

      {started && !open && <div className="reticle" aria-hidden="true" />}

      {started && (
        <>
          <QuestHUD />
          <ActionHotbar />
          <div className="hud">
            <div className="hud__card">
              <div className="hud__avatar">🧙‍♂️</div>
              <div className="hud__info">
                <div className="hud__rank">LVL {20 + discovered.length} · ARCHMAGE</div>
                <div className="hud__name">{profile.name}</div>
                <div className="hud__bars">
                  <div className="hud__bar hud__bar--hp"><span /></div>
                  <div className="hud__bar hud__bar--mana"><span /></div>
                </div>
                <div className="hud__stance">
                  {mounted ? '⚡ Flying on Nimbus Broomstick ([Space] Up · [C] Down)' : '🚶Exploring Arena ([F] Cast Spell · [B] Summon Broom)'}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
