# ASTRA: War of Lanka — playable 3D prototype

A Ramayana-inspired 3D fighting game. Choose **Rama** (Dharma Sena) or **Ravana** (Rakshasa Sena), pick one of four
arenas from the epic, and fight best of 3 rounds against an AI opponent.

This is the **prototype / vertical slice** from the game plan: built in the browser with Three.js so the combat
can be tested right away. The rig names, move data and game rules are laid out so they can carry over to Unreal Engine 5 later.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. For a production build: `npm run build` (output in `dist/`).

## Menu

- **Connect Wallet** (top right): Phantom, MetaMask, Core, Solflare, Backpack or any Solana Wallet Standard wallet, on **Solana Devnet**. It shows your address and devnet balance and has a **+ SOL** airdrop button.
- **BEGIN YATRA** is the only main button. It opens the hub with all three modes:
  - **The Journey:** the adventure as Rama.
  - **Yuddha:** the real-time arena duel (pick a fighter, arena and difficulty).
  - **Dharma Yuddha:** on-chain hidden-move duels.
- A **controls panel** on the left lists every key for the mode you're playing. Press **H** to hide or show it.

## Controls (Yuddha)

| Action | Keys |
|---|---|
| Move (lock-on to enemy) | W A S D / arrow keys |
| Light attack (3-hit combo) | J / left mouse |
| Heavy attack (breaks guard) | K / right mouse |
| Block — tap just before a hit to **parry** | L / Shift (hold) |
| Dodge (brief invincibility) | Space (+ direction) |
| Astra special (costs Prana) | U / E — hold to charge Rama's Mantra Arrow |
| Ultimate (full Prana) | I / Q |
| Pause / mute | Esc / M |

## Fighters

| | Rama | Ravana |
|---|---|---|
| Weapon | Kodanda bow (left hand) | Chandrahasa crescent sword |
| Light combo | Bow sweep → back-sweep → kick | Slash → back-slash → thrust |
| Heavy | Overhead bow smash + shockwave | Overhead "Kailash" smash + shockwave |
| Special | **Mantra Arrow** (hold to charge, 11→24 dmg) | **Agneyastra** exploding fireball |
| Ultimate | **Brahmastra** divine beam (34 dmg) | **Chandrahasa Storm** — orbiting moon-blades |
| Passive | Faster, 105 HP, cheaper astras | **Dashanana** — a head falls and he rises at 15 HP once per round |

Ultimates have divine armour (can't be interrupted, take half damage).

## Yatra — adventure mode

Open **BEGIN YATRA → The Journey**. Play as Rama on a journey through four connected zones:
**Ayodhya → Ram Setu → Ashoka Vatika → Lanka**. Defeat the rakshasas in each zone to open the golden gate,
then run through it to the next zone. Ravana waits in burning Lanka as the final boss.

| Key | Action |
|---|---|
| Arrow keys (or WASD) | Run (the camera follows Rama) |
| Enter (hold) | Shoot arrows; they auto-aim at the nearest enemy in front |
| Shift | Sneak. Crouch inside a bush to become **HIDDEN** |
| Space | Roll (brief invincibility) |
| Q | Brahmastra beam (fills from kills) |

- **Stealth:** enemies have vision cones (shown on the minimap). Running near them makes noise. `?` means suspicious, `!` means they've spotted you. Arrows on an unaware enemy deal **×3 damage (stealth shot)**.
- **Minimap** (top right): Rama is the **red dot**, enemies are yellow/orange dots with vision cones, Ravana is purple, bushes are green, cover is grey, and the gate is a gold square.
- **Ravana boss:** sword slashes, fireball volleys, summons rakshasas, the Chandrahasa Storm below half health, and he rises once when a head falls.

## Dharma Yuddha: on-chain hidden-move duels (Solana + MagicBlock)

Open **BEGIN YATRA → Dharma Yuddha**. This mode uses **only warriors of the two armies, never the revered central
figures**: **Angada** and **Neela** (Vanara Sena) against **Indrajit** and **Kumbhakarna** (Rakshasa Sena).
Ram Setu is left out of this mode's arenas because its stones carry Rama's name.

Every beat, both warriors pick a move in secret (keys **1–5**):

| Move | Beats | Loses to |
|---|---|---|
| Strike | Heavy, Evade | Guard, Astra |
| Heavy (guard-breaker) | Guard | Strike, Evade |
| Guard (parry) | Strike; halves an Astra | Heavy |
| Evade | Heavy, Astra | Strike |
| Astra (costs prana) | Strike, Heavy | Evade |

Then both moves are revealed at once and the exchange plays out in 3D. Prana builds every beat (faster when both
players hold back). Each warrior has different health and damage (see `src/duel/roster.js`).

**Modes**
- **Practice:** offline against a bot. Works now, no wallet needed.
- **On-chain vs bot:** a solo devnet demo. A second burner wallet in your browser plays the bot, so every move is a real transaction on the private rollup.
- **On-chain PvP:** create a duel (optional SOL stake) and share the code; the other player joins with it.
- **Watch & bet:** spectators back a side in a pari-mutuel pool until the duel begins.

**Wallets:** connect **Phantom, MetaMask, Solflare or Backpack** (anything that supports the Solana Wallet Standard), set to **Devnet**.
Your wallet approves the transactions that move your SOL: create/join with your stake, bets, and bet claims.
In the same approval it registers a short-lived **session key** on-chain (`create_duel` / `join_duel` take its public key).
The session key signs the many fast rollup actions (hidden moves, reveals, next beat), so you aren't asked to approve every beat.
At the end of the duel, whatever SOL is left on the session key is sent back to your wallet.

**How it uses MagicBlock** (`onchain/programs/dharma-yuddha`, built on the pattern of MagicBlock's private Rock-Paper-Scissors example)
- **Private Ephemeral Rollup (TEE):** each player's move account is readable only by its owner until `reveal_beat` resolves both, so nobody can see the other move first.
- **Ephemeral Rollup:** every move, reveal and beat runs on the rollup with no fees. The finished duel is committed back to Solana (`undelegate_all`).
- **VRF:** a verifiable "omen" at the start gives one side +25 prana and picks the battlefield.
- **Solana base layer:** stakes, the spectator betting pool, payouts (`claim_pot`, `claim_bet`), plus a timeout win if a player stalls.

**Build and deploy the program** (needs Rust, the Solana CLI and Anchor 1.0.2):
```bash
solana config set --url devnet
solana airdrop 2
npm run chain:test      # rules unit tests (Rust)
npm run chain:build     # anchor build + copies the IDL into src/duel/idl/
npm run chain:deploy
```
Reload the game after deploying: the on-chain modes switch on once `src/duel/idl/dharma_yuddha.json` exists.
`npm run test:rules` checks that the browser rules (`src/duel/rules.js`) give the same results as the Rust ones.

## Arenas

| Arena | Setting | Twist |
|---|---|---|
| **Ashoka Vatika** | Ravana's moonlit garden: Ashoka trees, diya pillars, lotus pond, fireflies | Classic circular arena |
| **Ram Setu** | The bridge of floating stones inscribed *राम*, stormy sea, rain, lightning, Lanka glowing on the horizon | No railings: heavy knockback throws you into the sea (12 damage, then back on the bridge) |
| **Lanka Dahan** | Ravana's golden city burning, smoke, embers, the demon-faced torana gate | Fire patches spread over the round; standing in them costs 7 HP/s |
| **Ayodhya** | Palace courtyard of the Sun dynasty at sunset: marble and rangoli floor, golden Surya emblem, Sarayu river with floating diyas, marigold petals | Square arena, no hazards |

Choose one in the menu (or **Random**). The menu background switches to show the arena you pick.

## Combat rules
- **Prana** (blue bar) fills when you deal damage, take damage, and slowly over time. Specials cost 20–25, ultimates need 100.
- **Block** cuts damage to ~12%. **Parry** (block within 0.22 s of a hit) staggers the attacker and gives +15 Prana.
- **Heavy** attacks break a guard. **Dodge** gives ~0.3 s of invincibility.

## Code map

| File | What it does |
|---|---|
| `src/main.js` | Game loop, rounds, camera, projectiles, Brahmastra beam, HUD |
| `src/fighter.js` | Fighter state machine: movement, combos, block/parry, dodge, astras, damage |
| `src/characters.js` | Procedural 3D models (Rama, ten-headed Ravana, bow, crescent sword) + all move data |
| `src/animation.js` | Procedural pose animation (every attack is a keyframed pose function) |
| `src/arenas/` | One file per arena plus `common.js` (textures, sky, bounds) and `index.js` (registry) |
| `src/adventure/` | Yatra mode: `zones.js` (layouts, patrols), `enemy.js` (stealth AI, Ravana boss), `index.js` (Rama controls, arrows, gates, minimap, HUD) |
| `src/duel/` | Dharma Yuddha: `roster.js` (side-character models + stats), `rules.js` (beat resolution, bot), `mode.js` (3D beats, lobby, HUD), `chain.js` (Solana/MagicBlock client) |
| `onchain/` | Anchor program for Dharma Yuddha (private rollup moves, VRF omen, stakes, spectator pool) |
| `src/ai.js` | Opponent AI with Easy / Normal / Hard reaction times |
| `src/vfx.js` | GPU particles, shockwave rings, impact lights |
| `src/audio.js` | Synthesized SFX, conch, temple bell, tanpura drone + dhol rhythm |

**Balancing:** all damage, range and timing numbers are in the `FIGHTERS` table in `src/characters.js`.

## Next steps (from the game plan)
1. Replace the procedural models with sculpted/MetaHuman characters and motion-captured Kalaripayattu animations.
2. Add Hanuman, Lakshmana, Indrajit, Kumbhakarna and more arenas (Kishkindha, Dandaka forest, Dronagiri).
3. Online 1v1 with rollback netcode.
4. Solana layer (cosmetic skins, tournaments) — off the combat path, never pay-to-win.
