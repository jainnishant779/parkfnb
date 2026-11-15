# Parkbnb V3 — First-Principles Mechanism Invention Dossier

**Brief:** invent a new mechanical architecture for a smart parking lock. Motor must never
carry structural load, ideally must not move the barrier at all. Minimum parts, 10-year
outdoor life, Indian fabrication (laser + bend + weld), off-the-shelf components.

---

## 1. First Principles — Deleting the Assumptions

Assume parking locks were never invented. What does physics actually demand?

### 1.1 The energy question (the whole design turns on this)

Barrier: **m = 5 kg**, CG at **0.25 m** from pivot, tip at **0.45 m**, inertia **J ≈ 0.4 kg·m²**.

```
Energy to raise the barrier 0° → 90°:  E = m·g·h = 5 × 9.81 × 0.25 = 12.3 J
```

**12.3 joules.** One AA cell stores ~10,000 J. A car tyre rolling 30 mm delivers ~100 J.
A human blink of effort is more than this.

> **Therefore the motor in every existing parking lock does not exist to supply energy.**
> It exists because those designs chose a geometry in which the actuator must deliver the
> *full torque continuously through the stroke, and then hold position.* Energy was never
> the constraint. Torque delivery and state-holding were — and both can be solved with
> geometry instead of electricity.

### 1.2 The four questions, answered

| Question | Answer that drives the architecture |
|---|---|
| Can gravity do the work? | Yes, one way (down). Free. |
| Where does the *up* energy come from? | The same 12.3 J the barrier gave up when it fell — if a spring catches it. A counterbalance is not a "helper"; it is an **energy see-saw** with a nearly free round trip. |
| Can geometry replace the motor? | Yes. Once the spring stores the fall energy, only ~10% of the energy is missing (friction + bias). That deficit is ~1.5 J. |
| Where does 1.5 J come from, free? | **The car.** It arrives and departs exactly when the state must change, and it can spare 100 J without the driver noticing. |
| Can one part do several jobs? | The barrier can be its own treadle, its own cam, its own striker carrier. |
| Can structural load bypass moving parts? | Yes — with fold direction + hard stops, the vehicle load never touches spring, latch or actuator. |

### 1.3 The reframe

A parking lock is **not a lifting machine**. It is a **two-state latching machine** whose
state changes are paid for by gravity and by the vehicle. The electronics' only job is to
*permit* a state change — a pulse, not a stroke.

---

## 2. Concept Generation — 10 Architectures

### C1 — Direct Motorized Rotation (the incumbent, as baseline)
**Principle:** worm gearmotor rotates the barrier through its full arc; worm self-locks to hold.
**Diagram**
```
Motor → Worm → Wheel → Barrier ↺          Load: Barrier → Wheel → Worm → Motor mounts
```
**Advantages:** simple control, proven, arbitrary duty.
**Disadvantages:** motor+gearbox in *both* the motion and the structural path; largest BOM
block; gear wear; battery must run a motor; stall/jam is a service call.
**Manufacturing:** medium (needs gear housing). **Moving parts:** ~8.
**Patent potential:** none (saturated art).

### C2 — Leadscrew / Self-Locking Actuator
**Principle:** linear actuator drives a crank; screw lead angle below friction angle self-locks.
```
Motor → Screw → Nut → Crank → Barrier      Load: Barrier → Crank → Nut → Screw (locked)
```
**Advantages:** holds without power; high mechanical advantage.
**Disadvantages:** motor still runs the *entire* stroke (violates the brief); screw exposed
to grit; slow; back-driven impact loads pass through the nut threads.
**Manufacturing:** medium. **Moving parts:** ~7. **Patent:** none.

### C3 — Rising Bollard / Telescopic Post
**Principle:** vertical post rises out of a sleeve.
```
Post ↑↓ inside sleeve, load: Post → Sleeve → Pit walls → Ground
```
**Advantages:** superb structural load path (pure shear into a buried sleeve); very strong.
**Disadvantages:** **requires excavation** — kills surface-mount retrofit, the entire market.
Sleeve fills with water and silt.
**Manufacturing:** hard (civil work). **Moving parts:** 3. **Patent:** none. ❌ Out of scope.

### C4 — Over-Center Toggle (bistable snap)
**Principle:** barrier is one link of a toggle; spring is stable UP and stable DOWN, unstable
between. Actuator only pushes the linkage past dead-center; the spring completes the throw.
```
        Barrier
          │
   Link ──●── Spring       past centre → snaps to opposite state
          │
       Chassis
```
**Advantages:** actuator energy ≈ only what is needed to cross centre; self-holding at both
ends by geometry (load pushes the toggle harder into its stop).
**Disadvantages:** snap action is violent (uncontrolled energy release — safety); a toggle
used as the *security* lock is defeated by hammering it past centre; tuning drifts with wear.
**Manufacturing:** easy. **Moving parts:** ~6. **Patent:** low (industrial toggle clamp art).
*Verdict: reject as a lock; the "cross-centre trip" idea survives into the final design as
the release principle.*

### C5 — Constant-Force Spring + Cosine Cam ("weightless barrier")
**Principle:** gravity torque varies as `12.3·cos θ`. Wrap a cable on a **cam whose radius
follows cos θ**, pull it with a constant-force (or ordinary coil) spring → spring torque
tracks gravity *exactly*, at every angle.
```
   Spring ══cable══⟨CAM r(θ)=R·cosθ⟩── Barrier
   Net torque ≈ 0 everywhere → barrier stays wherever you leave it
```
**Advantages:** true weightlessness; the cam is a **2D laser-cut plate — zero machining**;
uses a ₹30 coil spring instead of ₹300 torsion springs; net torque curve becomes a *design
variable* (you can dial in any bias you like by editing the profile in CAD).
**Disadvantages:** cable is a wear/fatigue item and must be captive in a groove; single
cable failure = sudden loss of balance.
**Manufacturing:** **very easy** (the hardest part is a laser profile).
**Moving parts:** 4. **Patent potential:** low alone (anglepoise/garage-door art) —
**high in combination** (see C10).

### C6 — Four-Bar Rising Arc
**Principle:** barrier carried on a four-bar so it translates as it rises, folding into a
lower stack height.
**Advantages:** lower folded height; the coupler curve can be shaped.
**Disadvantages:** 4 pivots = 4× the wear, slop and cost; harder to seal; no gain that a
single pivot + cam cannot already give.
**Manufacturing:** medium. **Moving parts:** ~8. **Patent:** low.

### C7 — Self-Energizing Wedge Chock
**Principle:** a wedge whose reaction against the ground increases with the pushing load —
the harder the car pushes, the harder it grips.
**Advantages:** structurally elegant; zero holding power.
**Disadvantages:** **self-energizing = release force grows with load** — the actuator can
never release it after a hard push. Works in one direction only. Needs ground friction that
wet/oily tarmac does not guarantee.
**Manufacturing:** easy. **Moving parts:** 2. **Patent:** medium. ❌ Fails releasability.

### C8 — Rotary Drum Barrier
**Principle:** the barrier is a segment of a rotating drum; the drum shell is simultaneously
structure, weather seal and bearing surface.
```
   ╭───────╮      dirt/water shed by rotation; slot always faces down when open
   │  ███  │ ⟳
   ╰───────╯
```
**Advantages:** genuinely excellent ingress protection (no exposed hinge line); one part is
structure + enclosure + seal.
**Disadvantages:** rolled/formed shell needs tooling (breaks the no-tooling rule); large
swept volume; heavy.
**Manufacturing:** hard at low volume. **Moving parts:** 3. **Patent:** medium.
*Verdict: revisit at 10k+ volume when tooling amortises.*

### C9 — Human-Powered Counterbalance (V2-M, current baseline)
**Principle:** ~90% counterbalance; driver lifts the residual ~2 kg-f; rotary latch holds.
**Advantages:** cheapest possible; no actuator except the release solenoid; proven.
**Disadvantages:** requires a human action every departure — the one thing the ₹25k
incumbent does *not* require. Competitive weakness, not an engineering one.
**Manufacturing:** easy. **Moving parts:** 5. **Patent:** low.

### C10 — ⭐ **TreadCycle: Vehicle-Cycled Neutral-Balance Barrier (VC-NBB)**
**Principle — the invention.** Combine three things that individually are unremarkable and
together remove every remaining actuator:

1. **Cam-cable counterbalance (from C5)** tuned to ~88% — the barrier is nearly weightless
   but retains a deliberate *fall* bias.
2. **The barrier's last 30 mm of travel is a treadle stroke.** When the barrier lies flat it
   stands 30 mm proud. The next wheel that rolls over it presses it those 30 mm down onto
   steel stops — and that stroke **winds a small kick spring through a one-way pawl.**
   The vehicle refuels the mechanism every single time it passes.
3. **One solenoid releases whichever latch is currently engaged** (up-latch or down-latch),
   because only one can ever be engaged. One actuator, two functions, one app button.

```
                    ┌── cam-cable counterbalance (88%, fall-biased)
   U-BARRIER ───────┤
   (also treadle,   ├── kick spring  ←── one-way pawl ←── 30 mm treadle stroke (wheel)
    also cam plate, │
    also striker)   └── rotary claw latch ↔ down pawl  ←── ONE solenoid (pulse only)

   Vehicle impact ─▶ over-travel HARD STOP ─▶ chassis ─▶ anchors ─▶ concrete
   Wheel 1000 kg  ─▶ bottom-out STEEL STOPS (spring/pawl/latch never see it)
```

**Cycle:** unlock pulse → barrier falls by gravity (damped by the counterbalance itself) →
car rolls over, pressing the treadle stroke → **spring charged, barrier held down** → car
clear → release → barrier rises gently on stored energy → claw latch snaps → SECURE.
Every pass pays for the next rise.

**Advantages:** no motor anywhere, ever; no human lift; fully automatic in both directions;
actuator moves ~4 mm and only unblocks a pawl; the wheel load, the vehicle impact and the
spring force are three *separate* paths that never meet; the barrier is one part doing four
jobs.
**Disadvantages:** the treadle stroke is a moving interface at ground level (grit/water);
the auto-rise needs a departure trigger (see §5.3); barrier must be rated for wheel load.
**Manufacturing:** easy — laser, bend, weld, one shaft, catalogue springs and latch.
**Moving parts:** 6 (barrier, cam-cable, kick spring + pawl, claw, pawl, solenoid armature).
**Patent potential:** **high** — the specific combination *"vehicle-stroke-charged
counterbalanced barrier with load-isolating bottom-out stops and a single state-agnostic
release actuator"* is not, to my knowledge, existing parking-lock art.

---

## 3. Concept Comparison (1 = poor, 5 = excellent)

| | C1 Motor | C2 Screw | C3 Bollard | C4 Toggle | C5 Cam-CB | C6 4-Bar | C7 Wedge | C8 Drum | C9 Manual | **C10 TreadCycle** |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Power (less is better) | 1 | 2 | 2 | 5 | 5 | 4 | 5 | 3 | 5 | **5** |
| Simplicity | 2 | 2 | 3 | 4 | 5 | 2 | 5 | 4 | 5 | **4** |
| Reliability | 3 | 3 | 4 | 3 | 4 | 3 | 2 | 4 | 4 | **4** |
| Maintenance | 2 | 2 | 2 | 4 | 4 | 3 | 4 | 4 | 5 | **4** |
| Weight | 2 | 3 | 1 | 4 | 5 | 3 | 4 | 2 | 5 | **4** |
| Cost | 1 | 2 | 1 | 4 | 5 | 3 | 5 | 2 | 5 | **4** |
| Manufacturability (India) | 3 | 3 | 1 | 5 | 5 | 3 | 5 | 2 | 5 | **5** |
| Weather resistance | 3 | 2 | 2 | 4 | 4 | 3 | 3 | 5 | 4 | **3** |
| Safety | 4 | 4 | 3 | 1 | 5 | 4 | 3 | 3 | 5 | **4** |
| Serviceability | 2 | 2 | 1 | 4 | 5 | 3 | 4 | 3 | 5 | **4** |
| Service life | 3 | 3 | 5 | 3 | 4 | 3 | 3 | 4 | 4 | **4** |
| Patentability | 1 | 1 | 1 | 2 | 2 | 2 | 3 | 3 | 1 | **5** |
| **Total (60 max)** | 27 | 29 | 26 | 43 | 53 | 36 | 46 | 39 | 53 | **50** |

**Reading the table honestly:** C5 and C9 score highest because they are the *simplest*.
C10 scores 50 and is the only concept that reaches **fully automatic with zero motor** —
it spends 3 points of weather-resistance and simplicity to buy the one feature the market
actually compares against the ₹24,999 incumbent. C10 *contains* C5 and degrades gracefully
to C9 if the treadle subsystem is deleted. **That containment is why it wins**: it is not a
riskier bet, it is the same bet with an optional extra stage.

---

## 4. Force & Load Analysis (C10)

### 4.1 Three isolated load paths

```
① VEHICLE IMPACT (barrier up, someone noses in)
   2000 N at 0.45 m = 900 N·m
   Barrier folds TOWARD THE STREET, so impact rotates it PAST vertical into a hard stop.
   Path: Barrier → over-travel stop → chassis → 4×M10 anchors → concrete
   Seen by latch: ZERO.

② WHEEL DRIVE-OVER (barrier flat, 1000 kg)
   Barrier bottoms on steel stops at end of the 30 mm treadle stroke.
   Path: Tyre → barrier skin → bottom-out stops → chassis rails → anchors → concrete
   Seen by kick spring / pawl / latch: ZERO (they are past their travel limit).

③ TAMPER (human forcing the raised barrier down)
   700 N two-handed at 0.47 m = 329 N·m → at 100 mm striker radius = 3.3 kN on the claw
   Door-class automotive latch rated 9–11 kN → SF ≈ 3.
   This is the ONLY case the latch is designed for.
```

### 4.2 Component force ledger

| Member | Peak force/torque | Governing case | Margin |
|---|---|---|---|
| Pivot shaft Ø20 EN8 | ≤ 150 N·m bending | residual after hard stop | SF > 2.5 |
| Over-travel hard stop | 900 N·m | vehicle impact | sized by gusset, SF 2 |
| Bottom-out stops | 9.8 kN | wheel | direct bearing into chassis |
| Rotary claw + striker | 3.3 kN | tamper | SF ≈ 3 |
| Counterbalance cable | 12.3 N·m ÷ 0.08 m cam ≈ 155 N | static | 2 mm rope, 3 kN MBL, SF > 15 |
| Kick spring | 2.5 J stored, ~25 N·m | charging | ≤ 40% yield |
| Treadle pawl | 123 N | charging | trivial |
| **Solenoid** | **≤ 5 N over 4 mm** | pawl release | the weakest, smallest, cheapest part — by design |

**Weakest member (deliberate):** the counterbalance cable. It is the one part whose failure
changes behaviour — see §8 FMEA and the two-cable redundancy decision.

### 4.3 Governing numbers (computed)

| Quantity | Value |
|---|---|
| Raise energy | 12.3 J |
| Counterbalance setpoint | 88% → net 1.47 N·m |
| Tip force during rise | **3.3 N ≈ 0.33 kg-f** (a finger stops it) |
| Rise time (undamped) | 0.9 s → tuned to ~2 s with pivot friction |
| Impact energy if it strikes a hand | 2.3 J — must be verified against door-safety limits (§11) |
| Kick-spring energy required | 1.47 J deficit ÷ 60% eff = **2.45 J** |
| Treadle: 30 mm stroke @ 200 mm radius | **82 N (8.3 kg-f) = 2.3% of one 3500 N wheel** — the driver cannot feel it |

---

## 5. Optimization Loop — Removing Parts Until It Breaks

**Pass 1 — delete the drive motor.** Replaced by gravity (down) + stored energy (up). ✅

**Pass 2 — delete the torsion springs.** Replaced by cam + cable + 2 coil springs: cheaper
(₹120 vs ₹300), exact cosine tracking, profile editable in CAD. ✅

**Pass 3 — delete the rotary damper.** At 88% counterbalance the descent is already
gravity-limited (~1 s, 2.3 J into rubber stops). ✅

**Pass 4 — delete the kick spring?** ❌ **Reverted.** Tried setting the counterbalance
*rise*-biased so the barrier self-raises with no kick spring. But then nothing makes it
fall: gravity is cancelled, and a barrier that folds toward the street cannot be pushed
down by an approaching car. The alternative — folding toward the space so the car noses it
down — puts the full 900 N·m vehicle load onto the latch, destroying load isolation.
**The kick spring is therefore not decoration; it is what buys fall-bias and latch
protection simultaneously.** Kept.

**Pass 5 — delete the down-latch.** Merged into the release/timing module: the part that
holds the barrier down *is* the escapement pawl. One part, two functions. ✅

**Pass 6 — delete the second solenoid.** One solenoid, one release bar, both pawls. Only one
latch is ever engaged, so a single pulse is always unambiguous. ✅

**Pass 7 — delete the separate treadle plate.** The barrier itself is the treadle. ✅

**Pass 8 — delete the separate cam plate.** The cam profile is cut into the barrier's own
pivot bracket. One laser part carries the pivot bore, the cam groove, the striker mount and
the magnet pocket. ✅

**Stop condition reached:** every remaining part fails a delete test.

---

## 6. Final Architecture

### 6.1 Exploded view (top → bottom)

```
1  U-Barrier weldment (tube arch + tread plate)   ← barrier, treadle, impact member
2  Pivot bracket L & R (laser)                    ← pivot bore + cam groove + striker + magnet
3  Striker pin Ø10 hardened
4  Pivot shaft Ø20 EN8  +  2 × Oilite bushings  +  circlips
5  Counterbalance cassette: 2 × wire rope + 2 × coil springs + turnbuckle adjuster
6  Kick spring + one-way pawl + ratchet segment
7  Escapement / delay-release module  (also the down-latch)
8  Rotary claw latch (automotive, door class) + release bar
9  Mini solenoid (4 mm stroke, ≤ 5 N)
10 Central hub ≤ 120 mm — houses 6-9 + PCB + 18650   ← also the magnet shroud
11 Chassis rails + over-travel hard stop + bottom-out stops (laser + bend + weld)
12 Base plate + 4 × M10 wedge anchors + rubber pads
```

### 6.2 State diagram

```
        ┌───────────────── SECURE (up, claw+pawl, spring discharged) ─────────────────┐
        │  solenoid pulse → release bar → claw pawl                                   │
        ▼                                                                             │
   FALLING (gravity, net 1.47 N·m, ~1–2 s, damped by counterbalance)                  │
        │                                                                             │
        ▼                                                                             │
   FLAT-ARMED (30 mm proud, kick spring uncharged)                                    │
        │  wheel rolls over → 30 mm treadle stroke → pawl ratchets                    │
        ▼                                                                             │
   DOWN-CHARGED (held by escapement pawl, kick spring holding 2.45 J)                 │
        │  escapement times out (no new press for T seconds)  OR  app pulse           │
        ▼                                                                             │
   RISING (kick spring + counterbalance, tip force 0.33 kg-f, ~2 s, buzzer)  ─────────┘
                                     claw snaps on striker → microswitch = SECURE
```

### 6.3 Sequences

**Opening:** authenticated command → 1 s warning tone → solenoid pulse (≤1 A, 200 ms) →
claw releases → barrier falls to flat-armed.
**Entry:** car drives in; each axle presses the 30 mm stroke; first press charges the kick
spring, later presses free-wheel on the ratchet; barrier bottoms on steel stops under load.
**Closing:** escapement (or app) releases the down pawl → barrier rises in ~2 s → cam ramp
cocks the claw → claw snaps, pawl drops → microswitch confirms → app shows SECURE.
**Exit:** same as opening; the exit pass recharges the spring, so the barrier re-secures the
empty bay by itself.

---

## 7. Materials

| Part | Material | Reason |
|---|---|---|
| Barrier arch | ERW steel tube Ø32 × 2 mm | Impact energy absorption, light |
| Tread plate | 2.5 mm HR sheet, ribbed | Wheel load, weldable |
| Pivot brackets / cam | 5 mm laser-cut MS | Cam groove needs section, no machining |
| Pivot shaft | EN8 (C45) | 385 MPa yield, ground stock, cheap |
| Bushings | Oilite bronze | Self-lubricating, grit-tolerant, replaceable |
| Counterbalance rope | 2 mm SS 7×19 wire rope | 3 kN MBL, corrosion, flexible |
| Springs | EN 10270-1 SH music wire, zinc + wax | Fatigue at ≤ 40% yield, outdoor |
| Claw & striker | Case-hardened steel (as supplied) | Wear + 3.3 kN tamper |
| Chassis / base | 2.5–3 mm galvanised or powder-coated MS | Cost, weldability |
| Stops | Steel + replaceable rubber pad | Sacrificial, serviceable |
| Fasteners | SS304 / zinc | Coastal, monsoon |

---

## 8. FMEA

| # | Failure mode | Cause | Effect | Detection | Mitigation |
|---|---|---|---|---|---|
| 1 | **Counterbalance cable break** | Fatigue at cam groove | Barrier becomes heavy; if up and then unlocked, falls fast (2.3 J → 12 J) | Rise time out of band; user notices weight | **Two independent cables + two springs** (₹100) — single failure leaves 50% balance; rubber end stops sized for the unbalanced case |
| 2 | Kick spring / pawl failure | Fatigue, grit | Barrier will not auto-rise | Up-microswitch never confirms after release → alert | Degrades to C9: barrier can be lifted by hand (0.33 kg-f residual) — **product still works** |
| 3 | Escapement jams | Silt, ice | No auto-close (or premature close) | Timeout mismatch vs latch switch | Escapement is a *bolt-on module*: delete it and the app pulse closes the barrier |
| 4 | Claw jam | Grit/ice | Will not unlock | Solenoid fired, no motion on Hall → alert | Drainage slots, sealed hub, **key override rotates the pawl directly** |
| 5 | Solenoid burnout | Coil, over-duty | No remote unlock | No current pulse | 200 ms pulse duty; key override |
| 6 | Treadle stroke silts up | Sand, leaves | Spring never charges | Same as #2 | Open-bottom design (debris falls through), 8 mm clearances, no blind pockets |
| 7 | Bushing wear | Years, grit | Slop, striker misalign | Service inspection | ±1.5 mm latch capture window; bushings press-out replaceable |
| 8 | Hard-stop deformation | Repeated vehicle strikes | Lock geometry shift | Visual + impact log | Gusseted stop, replaceable rubber pad |
| 9 | **Barrier rises against an obstruction** | Pet, foot, bumper | Contact | — | **Inherent: 0.33 kg-f tip force**, 2 s rise, buzzer. Not a "safety system" — a safety *property* of low stored energy |
| 10 | Water in electronics | Seal failure | Dead unit | Battery telemetry | Hub is above the flood plane, IP55 potted PCB, drained |

---

## 9. DFM Recommendations

- **Three laser thicknesses only:** 2.5 mm (skin/chassis), 5 mm (brackets/cam), 3 mm (base).
- **No CNC milling anywhere.** The cam is a laser profile; the only turned parts are the
  shaft and striker pin (both centreless-ground bar, cut to length).
- **Tab-and-slot self-fixturing** on every weld joint — removes fixture cost and holds the
  0.3 mm pivot-bore alignment.
- **One shaft size, one bushing size, one fastener family** (M8 structural, M6 covers).
- **Buy, don't make:** latch, springs, rope, bushings, anchors, solenoid, escapement/damper.
  Make only: 11 laser parts, 2 turned parts.
- Powder coat after weld; mask bores; press bushings last.

**Indicative BOM:** steel ₹750 · latch ₹300 · counterbalance cassette ₹150 · kick spring +
pawl ₹90 · escapement module ₹200 (optional) · solenoid ₹120 · key override ₹100 ·
PCB ₹500 · battery ₹250 · hardware ₹200 → **₹2,460 without escapement, ₹2,660 with.**
Holds the ₹2–3k target *and* deletes the motor.

---

## 10. Assembly, Maintenance, Prototype & Test

**Assembly (target 22 min):** weld chassis → weld barrier → powder coat → press bushings →
shaft + circlips → hang barrier → fit cam ropes, tension to spec with turnbuckle →
fit kick spring & pawl → fit latch, set striker shim to ±1.5 mm → fit hub, PCB, battery →
function test 20 cycles → anchor template + packaging.

**Maintenance:** grease bushings and inspect ropes at 12 months; rubber pads at ~5 years;
battery at ~3 years. All from the top after removing the hub cover — **no need to unbolt
the unit from the ground**.

**Prototype plan**
| Stage | Build | Question it answers |
|---|---|---|
| P0 | Cardboard + plywood 1:1 linkage | Fold direction, hub height, straddle clearance |
| P1 | Steel mule, counterbalance only, no electronics | Does the cam profile hold ≤ 0.5 kg-f across 90°? |
| P2 | Add kick spring + treadle | Does one wheel pass reliably store 2.45 J? |
| P3 | Add latch + solenoid + escapement | Full autonomous cycle, 500 cycles |
| P4 | Pilot 10 units, real driveways | Grit, monsoon, user behaviour |

**Test plan**

| Test | Requirement |
|---|---|
| Cycle life | 20,000 cycles, force drift < 15% |
| Drive-over | 1,000 kg per wheel × 5,000 passes, zero permanent set |
| Impact | 2,000 N at 450 mm — hard stop deforms, latch must not release |
| Tamper | 700 N two-handed jerk × 50, pry bar, hammer |
| Magnet attack | N52 magnet on all six faces — must not release |
| Ingress | IP55 spray + dust; 500 h salt spray |
| Thermal | −5 °C to +60 °C, verify counterbalance and escapement timing |
| Safety | Rise-force ≤ 0.5 kg-f, obstruction stall test, **third-party check vs powered-door impact limits** |
| Battery | ≥ 3 years modelled from measured sleep current |

---

## 11. Honest Risk Register

1. **The treadle stroke is the riskiest new interface** — a ground-level moving joint in a
   grit environment. Mitigated by open-bottom geometry (debris falls out, nothing to clog)
   and by the fact that its failure degrades the product to the working C9 baseline rather
   than bricking it. **This must be the first thing P2 tries to destroy.**
2. **Auto-rise safety needs certification, not assertion.** 2.3 J and 0.33 kg-f are low, but
   a barrier that rises unattended in a public driveway deserves an independent check against
   powered-gate/door impact standards before pilot sale.
3. **Patent claims must be searched before filing.** Cam counterbalance, ratchets and rotary
   latches are all old art individually. What may be defensible is the *combination*:
   vehicle-stroke charging + load-isolating bottom-out stops + a single state-agnostic
   release actuator on a counterbalanced parking barrier. Treat §2-C10 as the disclosure
   draft for a prior-art search, not as a granted claim.
4. **Escapement timing in cold/silt** is the least predictable part; it is deliberately a
   bolt-on module so the product can ship without it.

---

## 12. Future Improvements

Solar lid on the hub (the hub is already the only sun-facing surface) · LTE/LoRa for the
commercial SKU · load-cell in the tread plate to sense occupancy for free · drum-shell
variant (C8) once volume justifies tooling · fleet analytics from the impact log ·
bike/two-wheeler variant using the same hub and a shorter arch.
