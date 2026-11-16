# V1 measurements read from the tape photos (2026-10-27)

Read by zooming into each photo and calibrating against the tape ticks next to the part.  Accuracy is +/-2-3 mm for
things lying next to the tape, worse (+/-5 mm) for parts above the board (perspective).  The tape's hook is slightly
worn (zero is ~3 mm inside the hook) - ignored.

| # | Item | Value read | Photos | Confidence | Earlier estimate |
|---|---|---|---|---|---|
| 1 | Plywood board length | ~58 cm (width not read) | 19, 20 | high | - |
| 2 | UCP205 height to dome top | ~71 mm (so shaft axis 36.5 above the board) | 31 | high | 71 / 36.5 (catalogue) |
| 3 | UCP205 body width along the shaft | 35-39 mm | 21, 22 | high | 38 |
| 4 | **Bearing centre-to-centre** | **138-141 mm** (two independent readings) | 21, 22 | high | 130 (too small) |
| 5 | Chain plane position | ~midway between the bearings (72 mm from the left centre, 68 mm from the right) | 21 | medium | x = 0 |
| 6 | Shaft axis to motor axis | 97-100 mm | 23 | medium-high | 100 |
| 7 | **Chain pitch** | **9.5-10 mm = 3/8 in (#35 / 06B), NOT #25 (6.35)** - rollers read directly under the tape | 23, 24 | medium-high | 6.35 |
| 8 | Chain wrap round the shaft (radius to the roller outside) | ~34 mm, i.e. big sprocket OD ~70 | 23 | medium | OD 93 (too big) |
| 9 | Small sprocket OD | ~38 mm | 23 | medium | 13T, OD 46 |
| 10 | Tooth counts | **not visible** (hubs hide the teeth) | - | - | 44T / 13T (guess) |
| 11 | Motor, mounting plate to shaft pin | ~85 mm | 24 | medium | 77.5 |
| 12 | Motor gearbox length / can length / pin | ~33 / ~35 / ~16 mm | 24 | medium | 33 / 44.5 / - |
| 13 | Motor diameters (gearbox / can) | ~36-38 / ~28-32 mm (parallax +/-3) | 24 | low-medium | 45 / 36 |
| 14 | Motor layout | body runs from the chain plane toward the RIGHT bearing, motor sits in FRONT of that bearing | 20 | high | mirrored |
| 15 | Tyre top above the board (arch standing) | 26-27 cm, so shaft axis to tyre top ~23 cm | 32, 33, 34 | medium | 25.4 |
| 16 | **Tyre inner opening (width)** | **15-17 cm** in photos 21 and 34 | 21, 34 | low (perspective) | 20.3 (sketch: 8 in) |
| 17 | Battery | 4 x 18650 (purple cells) side by side in a plastic holder; wired series or parallel unknown | 29 | high | 4S assumed |
| 18 | Electronics | IBT-2 (HW-039), ESP32 DevKit, TWO LM2596 buck modules, MPU-6050, buzzer, red + green LED on a PY-10x15 cm perfboard | 25-30 | high | - |

## Surprises (change earlier drawings)
- Chain is 3/8 in pitch, not #25: every chain length, sprocket tooth count and Rev E / Rev A drawing that used 6.35 is wrong.
- Bearings are 140 apart, not 130.
- Big sprocket is much smaller than I drew (OD ~70 vs 93), so the cover / box can be ~23 mm lower.
- Tyre opening in the photos looks 15-17 cm wide, but your sketch says 20.3 cm.  If the photos are right, the bearing feet
  (outer edge at x = +/-89) are wider than the opening and the "one box" idea cannot work; if the sketch is right it is tight.

## Still needed (4 measurements, 10 minutes)
1. Tyre opening: straight tape, inner edge to inner edge across the widest point of the hole, tyre lying flat. (decides everything)
2. Count the teeth of both sprockets (or loosen the chain guard-free side and count).
3. Motor: slide a vernier (or hold a ruler to the side, camera straight on): gearbox dia, can dia, plate to pin.
4. Battery: multimeter across the whole holder (about 14.8 V = series, 3.7 V = parallel, 7.4 V = 2S2P).
