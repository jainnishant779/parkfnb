# One steel box over the whole mechanism – fit check (2026-10-27)

Concept (confirmed by the user): one steel box covers shaft, bearings, motor, chain, sprocket and electronics;
the tyre arch folds around its front end (0 deg) and rear end (180 deg) and stands at 90 deg.
Electronics in the rear half; V1 motor + 4 x 18650 holder; shaft not changed.

Picture: `concept_visual.png` (script `concept_visual.py`). All dimensions are Rev E estimates (E), see below.

## What fits
- Box limited by the tyre's swing: at every x the top corner stays >= 8 mm inside the tyre's inner edge
  (checked numerically for 10 -> 170 deg).  Result: ~198 wide x ~262-277 long, top 98 (sprocket 83 + gap + plate),
  or 78 over the bearings; 129 mm above ground at the highest.
- Both bearings (x = +/-65, base 38 x 140), the big sprocket (OD 93), the chain and the shaft passage fit.

## What does NOT fit (on the current estimates)
The V1 motor (body 77.5 long + 26 shaft, dia 45) cannot sit inside the box together with the bearings:
- Left end of the motor body must stay inside the tyre's semicircle: needs the chain plane at x >= +40.
- But the right bearing starts at x = 46, the sprocket + chain edge at x = chain plane + 5, so the gap is negative.
- Left bearing foot (y +/-70) forces the motor centre to y <= -93, which makes the motor stick out of the box.
- Searched bearings 65-76, chain plane 20-60, motor y -110..-79, 3-level top (98 / 78 / 56 over the motor):
  0 feasible combinations, best case margin -1.6 mm at a 4 mm sprocket-bearing overlap.

## Why this is not a final "no"
The tyre/motor/bearing positions are all estimated from photos.  Margins are a few mm, so real measurements can
turn it into a yes (or a clear no).  Measure on V1 (15 minutes):
1. Lay the tyre flat (0 deg) on the board: does it touch the motor or chain?  At what angle does it stop?
2. Motor: x-extent of the body (from the chain sprocket to the rear end of the can) and y-distance from the shaft axis.
3. Bearings: centre-to-centre, and gap from the big sprocket / chain edge to the nearest bearing.
4. Tyre: inner opening radius at its widest, and the length of the straight legs.

## Options if it really does not fit
- A: Rev E (separate drive cover + steel box) – complete, no fit problem.
- B: Replace the motor with a shorter 12 V 30 RPM gearmotor (about 55-60 mm body) – single box then fits.
- C: Tyre rests at ~35-40 deg instead of flat – box can be bigger, but the tyre is not flush for a wheel.
