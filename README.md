# 🧙‍♂️ Arcane Academy · 3D Wizarding RPG Portfolio

An interactive, dark-fantasy 3D portfolio website built with **React**, **Three.js**, **React Three Fiber (R3F)**, and **Rapier Physics**. Step into an ancient gothic stone arena as an Archmage, cast spell bolts from your wand, summon and fly a rideable Nimbus broomstick in mid-air, awaken glowing pedestal relics, and explore projects and skills in an illuminated RPG Grimoire.

---

## ✨ Features

- **Full-Screen Cinematic Intro**: Smooth cinematic flyover and video intro with zero-lag background WebGL scheduling.
- **Third-Person Wizard Exploration**: Smooth WASD movement, sprint, jump/levitate, and rideable **Nimbus Broomstick** with full mid-air elevation controls (`Space` to ascend, `C` to descend).
- **Procedural Sound Engine**: Dynamic ambient pads, wind, celesta chimes, cathedral convolution reverb, footsteps, broom flight hum, spellcast whooshes, and UI audio via the Web Audio API.
- **Interactive Relics & Pedestals**:
  - 📖 **The Ancient Tome** (About Me & Stat Sheet)
  - 🪄 **The Elder Wand** (Projects & Spell Showcase)
  - ⚗️ **The Emerald Flask** (Technical Skills & Alchemy)
  - 📜 **The Sorcerer's Chronicle** (Experience & History)
  - 🟡 **The Flying Golden Orb** (Contact & Owl Post)
  - 🧙‍♂️ **The Dark Archmage Altar** (Trial Overseer & Fast-Travel Astral Portals)
- **Active Wand Combat**: Press `[F]` or Left-Click to shoot glowing Arcane Spell Bolts that strike the Dark Archmage's reactive energy shield or trigger relic pedestals.
- **Skyrim/Hogwarts Legacy HUD**: Top cardinal compass with live 3D objective markers, bottom action hotbar, sound mute toggle (`[M]`), graphics quality switcher, and achievement toasts.

---

## 🎮 Controls

| Key | Action |
| --- | --- |
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | Move Character |
| <kbd>Shift</kbd> | Sprint / Broom Boost |
| <kbd>Space</kbd> | Jump / Ascend (while flying) |
| <kbd>C</kbd> / <kbd>Ctrl</kbd> | Descend (while flying) |
| <kbd>F</kbd> / <kbd>Left-Click</kbd> | Cast Wand Spell (Stupefy) |
| <kbd>B</kbd> | Summon / Dismount Nimbus Broomstick |
| <kbd>E</kbd> | Inspect Relic / Interact |
| <kbd>1</kbd> – <kbd>5</kbd> | Quick-Select Relics |
| <kbd>M</kbd> | Toggle Sound & Ambience |
| <kbd>Esc</kbd> | Close Grimoire Modal |

---

## 🛠️ Tech Stack

- **Framework**: React 19, Vite
- **3D & Graphics**: Three.js, `@react-three/fiber`, `@react-three/drei`
- **Physics**: `@react-three/rapier` (Rapier.js WASM physics engine)
- **Post-Processing**: `@react-three/postprocessing` (Bloom, Vignette, SMAA, N8AO)
- **State Management**: Zustand
- **Audio**: Custom procedural Web Audio API synthesis and convolver reverb

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm or pnpm

### Installation

```bash
cd website
npm install
npm run dev
```

Visit `http://localhost:5173` in your browser.

### Production Build

```bash
cd website
npm run build
npm run preview
```

---

## 📄 License & Attribution

- **Code License**: Licensed under the [MIT License](LICENSE).
- **Non-Commercial Disclaimer**: This project is a personal developer portfolio and non-commercial educational showcase inspired by fantasy wizarding themes. Harry Potter, Hogwarts, and related intellectual property belong to J.K. Rowling and Warner Bros. Entertainment Inc.
- **3D Assets & Animations**: Mixamo/Adobe and respective 3D artists under Creative Commons Attribution.
