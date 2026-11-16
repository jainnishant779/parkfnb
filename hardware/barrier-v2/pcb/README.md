# PARKFNB V2 controller PCB

100 x 80 mm, 2 layers, all through-hole. ESP32 DevKit V1 + 74AHCT125 level shift + sense/protection for the IBT-2.
Motor current does not flow through this board (battery -> fuse -> switch -> IBT-2 directly).

## Files (`out/`)
| File | Use |
|---|---|
| `PARKFNB_V2_Controller_PCB.pdf` | 7 sheets: spec, schematic, top/bottom views, drill table, wiring, bring-up, netlist |
| `PARKFNB_V2_CTRL.kicad_pcb` | KiCad 8 board (placed + routed, GND plane as an unfilled zone) |
| `gerbers/`, `PARKFNB_V2_CTRL_gerbers.zip` | Gerber + Excellon drill, ready for a fab |
| `PARKFNB_V2_CTRL_BOM.csv`, `..._netlist.csv` | BOM and netlist |

## Rebuild
```
pip install shapely numpy matplotlib kiutils gerbonara
python build.py     # route + DRC + export + verify
python report.py    # also rebuilds the PDF
```
Edit `placement.py` (positions) or `design.py` (parts, nets, footprints) and re-run.

## What was verified (and what was not)
Verified here: own DRC (clearance 0.25, edge, annular ring, hole-to-hole, keep-outs, opens, GND plane), the
`.kicad_pcb` parsed with kiutils and connectivity rebuilt independently (no shorts / opens), every Gerber and drill
file re-read with gerbonara and rendered.

NOT verified: KiCad itself was not available. Open the board in KiCad, press **B** (fill zones), run **Inspect > DRC**.
Footprints are generic through-hole footprints from standard pitches: check each one against the real part
(ESP32 header row spacing 25.4 vs 22.86, buzzer pitch, screw terminal, PTC, electrolytics, TVS/diode lead drill).
No thermal, EMC or in-shell test has been done.

## Rev A changes (V2 scope)
- Three position sensors for the 0 - 90 - 180 deg motion: J4 = 0 deg (GPIO32), J10 = 90 deg / locked (GPIO13),
  J5 = 180 deg (GPIO33). All Hall sensors run on 5 V with open-collector outputs pulled up to 3V3.
- Battery = the V1 4 x 18650 holder (assumed 4S, 16.8 V full): TVS P6KE20A, divider 100k/18k (16.8 V -> 2.56 V).
  Input range 7-17 V, so a 2S pack also works.

## Firmware
See sheet 1 of the PDF: new pins are GPIO27 (motor enable), 13/32/33 (0/90/180 deg sensors), 35 (battery ADC),
4 (red LED), 23 (tamper). `config.h` today clamps motion to 0-90 deg; 0-90-180 needs a firmware change.
With a 4S pack limit PWM_MAX to ~180 so the 12 V motor sees ~12 V average.
