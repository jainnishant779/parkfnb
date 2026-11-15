# How accurate is it? Record, label, score, and the tape-measure test

Until now nothing in ParkFNB was measured against the truth. There was no occupancy accuracy, no error in centimetres for "over the line",
and no flicker rate. This is how to get those numbers. **Do not quote any figure that did not come out of this.**

## 1. Record a day

On the server, in `/etc/parkfnb-anpr.env`:

```
ANPR_RECORD_S=30
```

then `sudo systemctl restart parkfnb-anpr`. Every 30 s the raw live picture and what the system answered for each bay are kept in
`/var/lib/parkfnb-anpr/record/<camera>/<day>/`. About 150 KB a picture, so about 400 MB a day. The recorder deletes the oldest days past
`ANPR_RECORD_MAX_MB` (1500) or `ANPR_RECORD_DAYS` (14) and stops when less than 1 GB of disk is free. Turn it off by removing the line.

Two kinds of recording:

| Setting | Use it for | Why |
|---|---|---|
| `ANPR_RECORD_S=30`, a whole working day | **Accuracy**: occupancy, the line verdict, by zone | Parked cars do not change in 30 s; many different cars and light |
| `ANPR_RECORD_S=1`, one busy hour | **Flicker and track-number switches** | The tracker is built for about one picture a second; at 30 s it cannot be judged |

The pictures show number plates and people. They are admin-only and are never public.

## 2. Label what you SEE

Open `https://<server>/label` (signed in). Pick the day. For each bay in each picture press:

| Key | Meaning |
|---|---|
| `e` | Empty |
| `c` | Car, inside its lines |
| `t` | Car, close to a line |
| `o` | Car, **over** a line (then `l` / `r` / `f` / `b` for left / right / front (road) / back, or click the button) |
| `n` | Car, but you cannot judge the line |
| `x` | Cannot tell (not scored) |
| `←` `→`, `j` | Previous, next, next unlabelled picture |
| `1`-`9`, or click a bay | Pick a bay |

The system's own answer is **hidden** so it cannot sway you (`s` shows it afterwards). Label only what you are sure of: a wrong label is
worse than a missing one. 150 pictures with all bays is a fair first set; a few of them should be near-line cases, some at dusk.

## 3. Score it

```
curl -b cookie "https://<server>/console/api/record/truth.csv?camera_id=phone-1" -o truth.csv
curl -b cookie "https://<server>/console/api/record/run.jsonl?camera_id=phone-1&day=20261030" -o run.jsonl
python tools/eval_pilot.py --truth truth.csv --log run.jsonl --md report.md
```

(The two links are also buttons on the label page.) That scores **what was running**. The report gives, in total and per zone
(near / middle / far from the camera):

- occupancy precision, recall, false-occupied and false-vacant seconds, and how often the answer was "unclear";
- **over the line**: precision and recall (a "not judged" counts as missed);
- **flicker**: how often an answer changed inside a stretch you labelled as steady, per labelled bay-hour;
- **track-number switches** for the same parked car, per occupied bay-hour;
- how long a real change took to show.

## 4. Try a change before it goes live

Copy a recorded day folder from the server, then run it through the code on your machine:

```
python tools/replay_record.py --record path/to/20261030 --out new.jsonl
python tools/eval_pilot.py --truth truth.csv --log new.jsonl
```

Compare with the report from step 3. **Deploy only if it is not worse**: occupancy precision and recall, the over-the-line figures,
the flicker rate. Add `--sizes sizes.json` (`{"Bay-01": [2.4, 4.8]}`) to see what real stall sizes change.

## 5. The tape-measure test (needs someone on site)

The calibration assumes every stall is 2.5 m x 5.0 m. If the real stalls are 2.4 x 4.6 m every metre the system reports is off by that
share, and the error in centimetres of "over the line" has never been measured.

1. **Measure 3 stalls** with a tape (width between the two painted side lines; length from the road-side line to the back line): one
   near the camera, one in the middle, one far. Enter them on **Devices > Stall sizes** (leave the others empty).
2. **Park one car at known offsets.** In a near bay and in a far bay, place the car so its side is 0, +15, +30 and +50 cm past the
   right line (measure from the line to the tyre or the side of the body at its widest, write it down). Do the same with the front
   bumper 20 cm and 50 cm over the road-side line.
3. **Record one minute at each position** (`ANPR_RECORD_S=5`), noting the time and the offset.
4. **Read off what the system said** for that bay (`crossing_m` in the recorded line, or the console's "Over by").
5. **The result** is the error in cm per offset, near against far, and with the default sizes against the measured ones. Put the table
   below.

| Bay (zone) | True offset | System said | Error | Sizes used |
|---|---|---|---|---|
| | | | | |

Tune `FIT_SIDE_MIN_M` and `FIT_END_TOLERANCE_M` (status.py) and the contact thresholds from this table, **not** by guessing.

## What is still unproven

- Every accuracy figure: none has been measured yet (the first run of the steps above gives the first).
- The metres of the 3D verdict, until the tape-measure table above is filled in.
- The night thresholds, which come from two pictures of one lot.
