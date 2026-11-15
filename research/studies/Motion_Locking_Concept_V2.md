# Parkbnb — Motion & Locking Mechanism Design Specification (V2)

---

## 1. Design Philosophy

The barrier is **spring-counterbalanced** so that moving it requires almost no energy in either
direction. The structural load path never passes through the spring or the actuator: a passive
steel lock bears all holding loads, and the actuator only releases it. Electronics report
"secure" only when the lock is *confirmed* engaged — never from barrier position alone.

V2 corrects a V1 inconsistency: springs now counterbalance the barrier **upward** (against
gravity). Gravity provides the down stroke; the spring provides most of the up stroke. Springs
never assist gravity downward — that arrangement would make closing fight both gravity and
spring, the worst case for the return mechanism.

**Benchmark:** Parkobot (₹24,999, motorized dome, IP67, 5-ton drive-over). Parkbnb targets the
same job at roughly one-third the price by eliminating the drive motor from the security and
motion path, using tooling-free laser-cut fabrication, and sealing only the electronics rather
than the whole unit.

---

## 2. Concept Evaluation & Trade-off Analysis

This chapter documents why the selected mechanism was chosen. Alternatives were scored on a
weighted decision matrix; scores are 1 (worst) to 5 (best) per criterion.

### 2.1 Motion Mechanism — Weighted Decision Matrix

| Criterion | Weight | Rationale for weight |
|---|:---:|---|
| Cost (BOM + tooling) | 0.25 | Core product thesis: one-third of benchmark price |
| Reliability / service life | 0.20 | Outdoor, unattended, 10-year target |
| Power consumption | 0.15 | Battery-powered, multi-year life expected |
| Mechanical simplicity | 0.15 | Local fabrication, few failure modes |
| Size & drive-over compatibility | 0.15 | Must fold flush; vehicle parks on top |
| Maintenance | 0.10 | Field-serviceable without special tools |

| Mechanism | Cost | Reliability | Power | Simplicity | Size/Drive-over | Maint. | **Weighted Score** | Decision |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Dual Torsion Spring (counterbalance)** | 4 | 4 | 4 | 5 | 5 | 4 | **4.30** | ✅ **Selected** |
| Constant Torque Spring | 2 | 4 | 5 | 3 | 4 | 4 | 3.50 | 🔬 Future study |
| Counterweight | 2 | 5 | 5 | 3 | 1 | 5 | 3.35 | ❌ Rejected |
| Gas Spring | 3 | 2 | 4 | 4 | 4 | 2 | 3.15 | ❌ Rejected |
| Fully Motorized Barrier | 1 | 3 | 1 | 2 | 4 | 2 | 2.10 | ❌ Rejected |

**Rejection rationale (the "why", not just the score):**

- **Fully Motorized** — motor + gearbox + driver + larger battery is the single largest BOM
  block in benchmark products; motor sits in the motion path every cycle, so its failure is
  system failure. Retained only as the *optional close assist* in variant V2-A, outside the
  security load path (slip clutch).
- **Gas Spring** — loses charge over 2–4 years, force varies strongly with temperature
  (outdoor: −5 °C to +55 °C in Indian conditions), and is a sealed non-serviceable part.
  Predictable replacement cost contradicts the low-maintenance goal.
- **Counterweight** — scores well on paper (zero power, near-infinite life) but fails the
  geometry test: a counterweight arm must swing below or behind the pivot, which conflicts
  with a flat, flush, drive-over chassis. Making it fit doubles footprint and shipping weight.
  This is the decisive criterion, and why a high-scoring concept is still rejected.
- **Constant Torque Spring** — technically the ideal counterbalance (flat torque matches a
  lifted load better than a linear torsion spring matches a cosine gravity curve — see §9.2).
  Rejected for V2 only due to limited Indian sourcing and higher cost at low volume. Marked
  for future study: if sourcing improves, it can replace the torsion pack without chassis
  changes.
- **Dual Torsion Spring** — standard catalogue part, near-zero incremental cost, splits load
  symmetrically across both pivot ends, fully enclosed in the chassis. Its one weakness —
  linear torque vs the cosine gravity curve — is handled by preload tuning (§9.2) and only
  needs to cancel ~90% of weight, not 100%.

### 2.2 Lock Evaluation

| Lock Type | Advantages | Limitations | Decision |
|---|---|---|:---:|
| Deadbolt / pin | Simplest possible | Release force rises with side load on the pin — mini solenoid stalls under preload (the classic failure mode this design must avoid) | ❌ Rejected |
| Electromagnetic hold | No moving parts | Consumes power continuously in the *locked* state — inverts the power budget; fails open on battery death | ❌ Rejected |
| Hook lock (single-stage) | Low cost, locally fabricable | Release force still partially load-dependent; moderate wear at hook face | 🔶 Prototype fallback |
| **Automotive rotary latch (claw + pawl)** | Two-stage: release force independent of load on claw; self-engaging on cam ramp; proven 100k+ cycle life; available off-the-shelf (bonnet/door latches, ₹200–400) | Slightly higher part cost than a bent-steel hook | ✅ **Selected** |

### 2.3 Motion Control (Descent) Evaluation

| Method | Behaviour | Decision |
|---|---|:---:|
| Free fall | Fast but unsafe: pinch/impact hazard, end-stop hammering, fatigue | ❌ Unsafe |
| Spring only (over-center) | Snap action; speed uncontrolled, tuning drifts with spring age | ❌ Rejected |
| Gravity only, no counterbalance | Descent OK but return requires full lifting effort or a large motor | ❌ Rejected |
| **Gravity + counterbalance + rotary damper** | Descent driven by ~10% net weight through a damper: slow, quiet, safe; return nearly effortless | ✅ **Selected** |

### 2.4 Load Path Validation

```text
Vehicle Load (impact when up / wheel when down)
      │
      ▼
Barrier ──▶ Pivot Shaft ──▶ Steel Chassis ──▶ Base Plate ──▶ Anchor Bolts ──▶ Concrete
                                                                       
Down position: barrier rests directly in chassis recess —
wheel load bypasses pivot shaft and enters chassis skin directly.

NO structural load on: Torsion Springs · Rotary Damper · Solenoid · Motor (V2-A) · PCB
Holding load (barrier up, locked): carried by claw + striker pin ONLY.
```

### 2.5 Final Selected Architecture

```text
        Counterbalanced U-Barrier
                  │
     Dual Pivot Shaft (bushed, greased)
        │                    │
Dual Torsion Springs    Rotary Damper
 (upward assist)       (descent control)
                  │
   Automotive Rotary Latch (claw + pawl)
                  │
        Mini Solenoid (pawl release only)
                  │
   Laser-cut Steel Chassis + Base Plate
                  │
      M10/M12 Anchors → Concrete
```

---

## 3. Build Variants (shared platform)

Both variants share the same chassis, pivot, barrier, spring pack, lock, and electronics
(~90% common parts). The variant is chosen per market/price point.

| | **V2-M (Semi-Automatic)** | **V2-A (Fully Automatic)** |
|---|---|---|
| Open (barrier down) | App unlock → damped gravity drop | App unlock → damped gravity drop |
| Close (barrier up) | Driver lifts barrier (feels ~1–2 kg thanks to counterbalance); lock auto-snaps | Compact geared DC motor (5–10 W via slip clutch) raises barrier; lock auto-snaps |
| Actuators | 1 × mini solenoid | 1 × mini solenoid + 1 × small gearmotor |
| Power | Multi-year on one battery pack | Larger battery or solar trickle |
| UX cost | One manual lift per departure | None |
| Target retail | ₹8,000–10,000 | ₹14,000–16,000 |

The motor in V2-A only overcomes friction and the small residual imbalance — the counterbalance
does the lifting. The motor is **never** in the security load path; the steel lock alone holds
the barrier up.

---

## 4. Key Components

- Rigid U-shaped barrier (profile rated for full wheel drive-over load when down)
- Dual pivot shaft on bushings, greased, with grease access
- Dual torsion springs (left & right) — **upward counterbalance only**, never structural
- **Rotary damper** on pivot — controls descent speed, eliminates slam and pinch hazard
- Automotive-style **two-stage rotary claw lock** (hardened steel claw + spring-loaded pawl)
- Mini solenoid — releases the *pawl* (low force), never fights the preloaded lock face
- **3-point sensing:** Hall (barrier up) + Hall (barrier down) + microswitch on lock claw
- Keyed manual override (retracts pawl mechanically) for power-loss / battery-dead recovery
- Reinforced laser-cut steel chassis & base plate, with recessed pocket so the barrier sits
  flush when down
- \[V2-A only] Compact worm-gear DC motor + slip clutch + freewheel

---

## 5. Design Principles

- Vehicle impact load path: **Barrier → Pivot → Chassis → Base Plate → Anchors → Ground**
- The **lock** bears the holding load. The spring assists motion. The solenoid releases a
  low-friction pawl. No component does two of these jobs.
- **Two-stage lock release** (claw + pawl, as in car door latches): the solenoid's required
  force is independent of the load pressing on the claw. This removes the classic failure mode
  of solenoid-released locks — release force growing with preload/friction until the solenoid
  stalls.
- **Fail secure:** on power or comms loss the lock stays engaged. Owner recovery is by
  mechanical key, not by electronics.
- Barrier in the down position rests in a chassis recess and is rated for a **1,000 kg wheel
  point load** (drive-over case) — this, not vehicle impact, likely sizes the barrier skin.

---

## 6. Operating Flow

### 6.1 Locked State (Secure)
```
Barrier UP
  │
Claw engaged on striker ── Pawl blocks claw
  │
Lock microswitch = ENGAGED  ← app shows "Secure" only on this signal
```

### 6.2 Unlock & Opening
```
App command (authenticated)
  │
LED/buzzer pre-motion warning (1 s)
  │
Solenoid pulse → pawl retracts → claw releases
  │
Gravity lowers barrier, ROTARY DAMPER limits speed (~3–4 s full travel)
  │
Down Hall sensor confirms → app shows "Open"
```

### 6.3 Open State
```
Barrier DOWN, flush in chassis recess
  │
Vehicle drives over / parks above — barrier carries wheel load into chassis
  │
Springs are wound (energy stored for closing); gravity + shallow detent hold it down
```

### 6.4 Closing
```
V2-M: driver lifts barrier — counterbalance makes it feel ~1–2 kg
V2-A: app command → motor raises barrier via slip clutch
  │
Cam ramp on striker cocks the claw → claw SNAPS closed, pawl drops in (no power needed)
  │
Lock microswitch = ENGAGED → app shows "Secure"
V2-A: if microswitch not seen within timeout → retry once → alert user
```

---

## 7. Sensing, State Logic & Risk Assessment

### 7.1 Sensors

| Signal | Sensor | Purpose |
|---|---|---|
| Barrier up | Hall #1 | Position feedback, motor cutoff (V2-A) |
| Barrier down | Hall #2 | Confirm open, detect forced lift when open |
| Lock engaged | Microswitch on claw | The **only** signal allowed to report "Secure" |
| Tamper | Accelerometer (on main PCB) | Impact/vibration/tilt alarm, event log |

Alert conditions: lock released without command · barrier moved while "Secure" ·
close attempted but lock never confirmed · battery below threshold · repeated impact events.

### 7.2 Risk Assessment & Mitigation

| Risk | Mitigation |
|---|---|
| Spring fatigue | Working stress ≤ 40% of material yield; 20k-cycle life test (§9.2) |
| Lock wear | Hardened steel claw & striker; automotive latch already rated 100k+ cycles |
| Water / dust ingress | Drainage slots in lock pocket; IP55 electronics enclosure; plated fasteners |
| Forced lifting (barrier up) | Rotary latch holds under load; accelerometer tamper alarm + app alert |
| External magnet attack | Solenoid & Hall sensors fully inside steel chassis; verified by magnet test on every face |
| Power failure / dead battery | Fail-secure (stays locked); keyed mechanical override |
| Motor stall / obstruction (V2-A) | Slip clutch + close-timeout detection + retry-then-alert |
| Corrosion (coastal / monsoon) | Powder-coated chassis, stainless or zinc-plated hardware, coated springs |
| Sensor failure | "Secure" requires lock microswitch; position Halls are advisory — a dead Hall degrades UX, not security |
| Unit theft / anchor attack | Tamper-resistant anchor bolts under the (locked) barrier footprint |

---

## 8. CAD Design Requirements

Inputs the CAD model must satisfy before drawings are released for fabrication.

### 8.1 Overall Dimensions
- Footprint ≤ **500 × 450 mm**; folded (down) height ≤ **70 mm** so a standard car (ground
  clearance ≥ 160 mm) clears it and a wheel can roll over it without snagging.
- Raised barrier height **450–500 mm** at the top edge (deterrent height, matches benchmark).
- Barrier must sit **flush in a chassis recess** when down — no lip > 5 mm in the wheel path.

### 8.2 Pivot Geometry
- Through-shaft or twin stub shafts in **EN8 / C45 steel**, running in oil-impregnated bronze
  (Oilite) bushings; shaft diameter from calculation §9.3, minimum **Ø16 mm**.
- Bushings in reamed bores (H8); axial retention by circlips; grease path to each bushing.
- Pivot axis placed so the barrier's CG passes over-center *only* if the detent study (§11,
  item 4) selects that behaviour; default is CG always on the "down" side.

### 8.3 Spring Mounting
- One torsion spring per side, coiled over the shaft; chassis-side leg anchored in an
  **indexed 3-hole preload adjuster** (±15% preload without disassembly).
- Spring never bottoms out coil-to-coil at full travel; ≥ 15% torque margin beyond the
  90° working arc.

### 8.4 Lock Interface
- Striker pin (hardened, Ø8–10 mm) on the barrier; latch body on the chassis.
- Claw engagement depth ≥ **8 mm**; cam lead-in must capture the striker with the barrier
  misaligned up to **±1.5 mm** (weld distortion + bushing wear allowance).
- Solenoid-to-pawl linkage with measurable release force ≤ **5 N** at the pawl under full
  claw load (bench-test requirement, §9.6).

### 8.5 Manufacturing & Tolerances (DFM)
- Two sheet thicknesses only: **3 mm** chassis/base, **2 mm** barrier skin; laser-cut
  tolerance ±0.2 mm; tab-and-slot self-fixturing before welding.
- Pivot bore alignment across the chassis width within **0.3 mm** (weld fixture required).
- No machined parts except shaft, striker pin, and bushing bores.
- Standard fasteners M6/M8; anchors 4 × M10/M12 wedge type; all hardware zinc-plated or SS.

---

## 9. Engineering Calculations (First Pass)

Assumed values are **bold**; replace with measured/CAD values at prototype. Method and
formulas stay valid.

### 9.1 Barrier Weight & Gravity Torque
Assume barrier mass **m = 5 kg** (U-frame, 2 mm skin), CG at **L_cg = 0.25 m** from pivot.

- Gravity torque (max, barrier horizontal): `T_g = m·g·L_cg = 5 × 9.81 × 0.25 ≈ 12.3 N·m`
- Torque varies as `T_g(θ) = 12.3 · cos θ` (θ = 0 horizontal, 90° upright).

### 9.2 Spring Torque & Stress
Target counterbalance **90%** of gravity torque at horizontal:

- Total spring torque at horizontal: `T_s = 0.9 × 12.3 ≈ 11.0 N·m` → **5.5 N·m per spring**.
- Residual lifting force at the barrier top edge (lever **0.45 m**):
  `F = (12.3 − 11.0) / 0.45 ≈ 2.9 N ≈ 0.3 kg-f` — comfortably under the ≤ 2 kg-f target;
  the margin absorbs friction and spring tolerance (catalogue springs are ±10%).
- Because a linear spring cannot track the cosine curve exactly, set the match point at
  θ ≈ 30–45° and verify hand force ≤ 2 kg-f across the full arc in CAD force analysis.
- Spring wire stress: `σ = K_w · 32·M / (π·d³)` (K_w = Wahl factor). Select wire diameter so
  σ ≤ **40% of tensile** for the selected music-wire / EN 10270 grade → expected wire
  **Ø5–6 mm**, verified against 20,000-cycle fatigue test.

### 9.3 Pivot Shaft Sizing
Sizing case is **vehicle push on the raised barrier** (down-position wheel load bypasses the
shaft via the chassis recess — §2.4). Assume push **F = 2,000 N** at height **h = 0.45 m**:

- Overturning moment: `M = F·h = 900 N·m`, shared between the latch striker (majority,
  short lever) and the two pivot ends.
- With the latch reacting ≥ 2/3 of M, each pivot end sees ≤ 150 N·m bending.
- Required shaft diameter (EN8, σ_yield ≈ 385 MPa, SF = 2.5 → σ_allow ≈ 155 MPa):
  `d³ = 32·M_pivot / (π·σ_allow) = 32 × 150×10³ / (π × 155) ≈ 9,860 mm³ → d ≈ 21 mm`
- **Select Ø20–22 mm shaft**; refine once latch/pivot load share is confirmed in CAD.

### 9.4 Anchor Bolt Sizing
Same push case, M = 900 N·m; front anchor pair at **0.30 m** lever from the tipping edge:

- Tension on front pair: `900 / 0.30 = 3,000 N` → **1,500 N per bolt**.
- An M10 wedge anchor in C20/25 concrete holds ≥ 10 kN pull-out → **SF > 6**. Specify
  4 × M10 (M12 where concrete quality is unknown).

### 9.5 Chassis / Drive-over Strength
- Wheel point load **1,000 kg (9.8 kN)** on the folded barrier → barrier skin transfers load
  into the recess edges; check 2 mm skin in local bending with support spacing from CAD, add
  ribs/gussets until permanent set = 0 at 1.5 × load. (FEA or simple plate-bending check.)

### 9.6 Solenoid & Battery Sizing
- Two-stage latch keeps pawl release force ≤ 5 N regardless of claw load → mini solenoid
  pulse **≤ 1 A for ≤ 200 ms** at 5–12 V.
- Charge per event: `1 A × 0.2 s = 0.056 mAh` → even 10 events/day ≈ **0.6 mAh/day**.
- Dominant drain is standby: BLE MCU (ESP32-class, deep sleep + periodic advertise)
  ≈ **50 µA average** ≈ 1.2 mAh/day.
- Total ≈ 2 mAh/day → one **18650 (2,600 mAh)** ≈ 3+ years (V2-M). V2-A adds motor draw
  (~10 W × 3 s ≈ 8 mAh/day at 10 cycles) → 2S pack or solar trickle recommended.

---

## 10. Design Targets (pass/fail for prototype)

| Parameter | Target |
|---|---|
| Counterbalance | Spring cancels 85–95% of barrier weight torque at all angles |
| Residual lift force at handle (V2-M) | ≤ 2 kg-f across full travel |
| Descent time (damped) | 3–4 s, no bounce at end stop |
| Drive-over rating (barrier down) | 1,000 kg point load, no permanent set |
| Impact rating (barrier up, locked) | Survive low-speed bumper contact; sacrificial deformation acceptable, lock must not release |
| Cycle life | 20,000 cycles (≈ 4/day × 10+ years); spring stress ≤ 40% yield |
| Pawl release force | ≤ 5 N under full claw load |
| Solenoid pulse | ≤ 1 A for ≤ 200 ms |
| Standby battery life (V2-M) | ≥ 3 years on one 18650 |
| Fail state | Power loss ⇒ locked; key override always available |

---

## 11. Research Items (V2)

1. Spring rate & preload curve vs barrier angle (counterbalance flatness across travel)
2. Rotary damper selection (torque rating, temperature range) vs orifice/friction alternatives
3. Claw/pawl geometry — adapt an off-the-shelf automotive bonnet/door latch; measure release
   force under load (validates §2.2 selection)
4. Down-position retention: gravity + detent vs light secondary latch (needed if wind or
   spring imbalance can lift the free barrier)
5. Constant-torque-spring sourcing study (the §2.1 future-study item)
6. V2-A motor sizing, slip-clutch torque, and stall/obstruction handling
7. Battery confirmation with measured sleep currents; solar option for V2-A
8. Prototype fatigue test: 20k cycles + drive-over + magnet + pry testing

**Note:** Final spring characteristics, damper rating, and lock geometry to be locked after
CAD force analysis and prototype testing. The architecture guarantees that structural loads
bypass the spring, damper, and actuators at every state of the mechanism.

---

## 12. Cost Engineering — ₹2,000–3,000 BOM Target (V2-Lite)

Business target: **build cost ₹2–3k** at moderate volume, enabling retail ≈ ₹5,500–6,000 —
roughly one-quarter of the ₹24,999 benchmark. This chapter defines what is cut, what is
redesigned, and what is protected to get there. Prices assume **100–500 unit batches**,
Indian sourcing; a one-off prototype will cost ₹6–8k and that is normal.

### 12.1 Target BOM

| # | Part | Spec | Est. cost (₹) |
|---|---|---|---:|
| 1 | Steel set | Laser-cut 2.5 mm chassis + tube-frame barrier, welded, powder-coated (~3.5–4 kg) | 700–900 |
| 2 | Torsion springs × 2 | Catalogue part, ~Ø5 mm wire | 200–300 |
| 3 | Rotary latch + striker | Off-the-shelf automotive bonnet latch | 200–300 |
| 4 | Mini solenoid | 12 V pull type, pulse duty | 100–150 |
| 5 | Key override | Cam lock, shrouded | 80–120 |
| 6 | PCB assembly | ESP32-C3, MOSFET solenoid driver, latch microswitch input, 1 × Hall, buzzer + LED | 450–600 |
| 7 | Battery | 18650 cell + holder + protection | 200–300 |
| 8 | Anchors, fasteners, misc | 4 × M10 wedge + M6/M8 hardware | 150–250 |
| | **Total** | | **2,080–2,920** ✅ |

### 12.2 What V2-Lite cuts (and why it is safe to cut)

| Cut | Saving | Why safe |
|---|---:|---|
| **Rotary damper deleted** | ₹300–600 | Counterbalance raised to ~95% → net descent torque is ~5% of barrier weight, so the drop is inherently slow. Friction washers at the pivot give final tuning. Damper returns only if prototype descent is still too fast. |
| **Accelerometer deleted** | ₹40–80 | Tamper detection degrades to logic-based: latch microswitch open without command, or Hall/latch state mismatch → alert. Loses vibration pre-alarm only. |
| **Second Hall sensor deleted** | ₹20–40 | "Up" is already proven by the latch microswitch (the only signal allowed to mean Secure). Keep only the down-Hall for "Open" confirmation. |
| **Barrier de-rated from 1,000 kg wheel load** | ~1–1.5 kg steel (₹200–400) + simpler skin | Chassis redesign (§12.3): the wheel never touches the barrier at all, so the barrier drops from a skinned panel to a light tube frame. |
| **V2-A (motor variant) dropped at this price point** | motor + driver + bigger battery | Motor alone breaks the budget. V2-A remains a separate up-sell SKU, not part of the ₹2–3k target. |
| Cosmetics | ₹50–100 | Single-colour powder coat, branding by sticker not print. |

### 12.3 Key redesign: wheel load bypasses the barrier entirely

In V2 the folded barrier had to survive a 1,000 kg wheel — which sized its skin and added
mass. V2-Lite changes the geometry instead:

```text
V2:      wheel ──▶ barrier skin ──▶ recess edges ──▶ chassis
V2-Lite: wheel ──▶ chassis rails (either side of a ~40 mm slot)
                    barrier tube sits BELOW rail plane, inside the slot
                    tyre bridges the slot — barrier carries NO wheel load
```

A tyre contact patch easily bridges a 40 mm slot, so the barrier tube (Ø25–32 × 1.5 mm)
never sees the wheel. Result: lighter barrier, less steel, easier lift for the driver —
and the 1,000 kg drive-over rating moves from the barrier to the chassis rails, which are
short, ribbed, and cheap to make strong.

### 12.4 Protected — not negotiable at any price

- Two-stage latch (claw + pawl) — cutting this reintroduces the solenoid-stall failure mode
- Fail-secure on power loss + keyed mechanical override
- Steel shrouding around solenoid and sensors (magnet-attack defence)
- Latch microswitch as the sole source of "Secure"
- Spring stress ≤ 40% yield and the 20k-cycle life target

### 12.5 Revised price ladder

| SKU | BOM | Retail | vs Parkobot ₹24,999 |
|---|---:|---:|---|
| **V2-Lite** (this chapter) | ₹2.1–2.9k | ₹5,500–6,000 | ~4× cheaper |
| V2-M (adds damper, accel., 2nd Hall, panel barrier) | ₹3.5–5k | ₹8,000–10,000 | ~3× cheaper |
| V2-A (adds motor close) | ₹6–8k | ₹14,000–16,000 | ~40% cheaper |

**Launch recommendation:** prototype V2-Lite first. Every part it shares with V2-M/V2-A is
identical, so the up-sell SKUs are additive, not redesigns.

---

## 13. Mechanism Optimization Study & Geometry Freeze (V2.1)

Several advanced mechanism concepts were proposed for differentiation (floating pivot,
bell-crank spring linkage, cam-profiled descent, self-tightening wedge lock, over-center
toggle — the "aircraft landing gear" family). Each was evaluated **quantitatively** against
the design targets. This chapter records the disposition and freezes the final geometry.
Complexity is only accepted where the math shows the simple solution failing a target.

### 13.1 Proposal Disposition

| Proposal | Verdict | Quantitative reason |
|---|:---:|---|
| Floating / sliding pivot | ❌ Rejected | Solves no failing requirement. Adds a sliding joint (slop, dirt jam, wear) exactly where grit exposure is worst, and concentrates impact loads on a small link instead of a Ø20 shaft. Cost up, reliability down, benefit unmeasurable. |
| Bell-crank / four-bar spring linkage | ❌ Rejected (V3 study at best) | Exists to make spring torque track the cosine gravity curve. §13.2 shows a plain linear torsion spring already tracks it within **±0.3 kg-f** at the handle — 15% of the ≤2 kg-f budget. A linkage would buy precision nobody can feel, for 4–6 extra parts. |
| Cam-profiled descent (slow-fast-slow) | ❌ Rejected | §13.3: damperless descent at 92% counterbalance already takes ~1.1 s and ends with ~1.5 J into rubber stops — a door-close, not a slam. A cam adds a machined profile + follower to solve a non-problem. |
| Self-tightening wedge lock | ❌ **Rejected — actively harmful** | A wedge that self-tightens under load raises release force **with** load — precisely the solenoid-stall failure mode the two-stage claw+pawl was chosen to eliminate (§2.2). Adopting it would undo the core locking decision. Anti-rattle is already handled by the latch's rubber buffer. |
| Over-center toggle as the lock | ❌ Rejected | A toggle "lock" is defeated by striking the linkage past its toggle point — unacceptable for a security product, and it adds links. The claw+pawl stays. |
| Over-center / downlock **principle** | ✅ **Adopted — in structural form** | The real insight from landing-gear downlocks is not the linkage, it is *"route the big load into a stop, not into the release mechanism."* Implemented as the fold-direction + hard-stop geometry in §13.4 — zero extra parts. |

### 13.2 Why the Linear Torsion Spring Survives (cosine-tracking analysis)

Gravity torque: `T_g(θ) = 12.3·cos θ` (θ = 0 barrier flat, 90° raised).
Best linear fit (Chebyshev): `T_s(θ) = 11.0 − 7.83·θ  [N·m, θ in rad]`
→ per spring: **preload 5.5 N·m, rate ≈ 3.9 N·m/rad (0.068 N·m/deg)**.

- Maximum mismatch over the full 90° arc: **±1.3 N·m** → at the 0.45 m handle,
  **±2.9 N ≈ ±0.3 kg-f**. The ≤2 kg-f target is met with 6× margin — by a catalogue spring.
- Conclusion: torque-curve shaping (bell crank, cam, constant-torque spring) is precision
  the user cannot feel. Complexity rejected on measurement, not on taste.

### 13.3 Damperless Descent & Down Retention (V2-Lite validation)

At the frozen **92% counterbalance** setpoint (see §13.5), net descent torque ≈ 1.0 N·m
against barrier inertia J ≈ 0.4 kg·m²:

- Fall time ≈ **1.1 s** (slower with pivot friction), end-of-travel energy ≈ **1.5 J** —
  absorbed by two rubber stops (a car door slam is 3–5×this). The rotary damper deletion
  in §12.2 is therefore validated by dynamics, not hope. Friction washers remain the tuning knob.
- **Self-lift check:** catalogue springs are ±10%. At 92% setpoint a +10% spring gives net
  *upward* torque of +0.15 N·m at flat — the free barrier would creep up. Countermeasures
  (both cheap): the indexed preload adjuster (§8.3) tunes this out at assembly, and a ball
  detent holding **≥ 2 N·m** at the down position covers spring drift plus wind flutter.
  This closes research item §11-4.

### 13.4 The Adopted Upgrade: Fold-Direction + Hard-Stop Geometry

**Rule: the barrier folds toward the street (approach side).** The car enters by driving
over the flattened barrier. Consequence of this one choice:

```text
Vehicle impact (nosing into the space, force toward the space):
  rotates the raised barrier PAST vertical, INTO a steel over-travel hard stop
  → load path: barrier → hard stop → chassis → anchors. The latch never sees it.

Human tampering (forcing the barrier flat to steal the spot, force toward the street):
  resisted by the claw+pawl latch — but a human, not a car, is now the latch's
  design load case.
```

- Locked position **90–95°**, over-travel hard stop at **~97°**; the latch capture slot
  allows ~7° of elastic over-push without releasing (bonnet latches do exactly this).
- Latch sizing drops from the vehicle case (2,000 N → 900 N·m, §9.3) to the tamper case:
  **700 N** two-handed jerk at 0.47 m = **330 N·m** → at a **100 mm striker radius**,
  **3.3 kN** on the claw. A door-class automotive latch (9–11 kN rating) gives **SF ≈ 3**
  at ₹250–350.
- The 100 mm striker radius comes from housing the latch in a **central hub ≤ 120 mm tall**
  — legal because cars straddle the unit (Parkobot's dome is 127 mm); only the fold-flat
  barrier must stay under the 70 mm wheel-path envelope. The hub also provides the steel
  shrouding for solenoid + sensors (magnet defence) for free.
- Pivot shaft relief: with the vehicle moment terminating at the hard stop, the Ø20–22 mm
  shaft of §9.3 now carries margin; Ø20 is frozen.

### 13.5 Frozen Geometry (build-to numbers)

| Parameter | Frozen value |
|---|---|
| Fold direction | Toward street / approach side |
| Travel | 0° (flat) → 90–95° (locked), hard stop ~97° |
| Counterbalance setpoint | **92%** nominal + 3-position indexed adjuster (±15%) |
| Springs | 2 × torsion, preload 5.5 N·m, rate 3.9 N·m/rad each, stress ≤ 40% yield |
| Pivot | Fixed shaft Ø20 EN8, Oilite bushings, no floating elements |
| Descent | Damperless, 1–1.5 s, rubber end stops; friction washers for tuning |
| Down retention | Ball detent ≥ 2 N·m |
| Latch | Door-class rotary claw+pawl, striker Ø10 hardened, radius 100 mm, SF ≈ 3 vs tamper |
| Latch housing | Central hub ≤ 120 mm tall (straddle clearance), houses solenoid + electronics |
| Vehicle impact | Never reaches the latch — over-travel hard stop case |

### 13.6 Mechanical FMEA (top failure modes)

| Failure mode | Cause | Effect | Detection | Mitigation |
|---|---|---|---|---|
| Spring fatigue / fracture | Cycling, corrosion | Barrier feels heavy; second spring still carries ~half | User-reported effort; V2-A close-current rise | Dual springs = redundancy; ≤40% yield stress; coated wire |
| Latch jam | Grit/ice in claw | Won't release | Solenoid fires, down-Hall never triggers → app alert | Drainage slots; sealed hub; key override rotates pawl directly |
| Solenoid open/burnout | Coil failure, over-duty | Won't unlock remotely | Driver senses no current pulse | Pulse-only duty (≤200 ms); key override |
| Detent wear | Cycles | Barrier creeps up when open | Down-Hall drops without command → app alert | Hardened ball + replaceable detent insert |
| Bushing wear | Grit, years | Barrier slop, striker misalignment | Visual/service | ±1.5 mm latch capture tolerance (§8.4) absorbs it; bushings field-replaceable |
| Hard-stop deformation | Repeated vehicle strikes | Lock geometry shifts | Visual after impact events | Stop gusseted to chassis; sacrificial rubber pad replaceable |

**Net result of this chapter:** every added-complexity proposal either failed a numbers test
or was absorbed in a zero-part-count form. The mechanism stays at V2-Lite cost — the only
geometry changes (fold direction, hub height, detent) cost ≈ ₹50 and remove the single
largest structural load from the most failure-prone component.
