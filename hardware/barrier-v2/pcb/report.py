"""PARKFNB V2 controller PCB - design package PDF (A3 landscape).   python report.py   (runs build.py first)"""
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Rectangle

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from design import *            # noqa
from placement import PLACEMENT, ANTENNA_KEEPOUT
import build
from schematic import draw_groups
from render_gerber import composite

REV, DATE = "A", "2026-10-26"
TOTAL = 7


def frame(no, title):
    fig = plt.figure(figsize=(420 / 25.4, 297 / 25.4))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 420)
    ax.set_ylim(0, 297)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.add_patch(Rectangle((10, 10), 400, 277, fc="none", ec="#111", lw=1.0))
    x0, y0, w, h = 250, 10, 160, 30
    ax.add_patch(Rectangle((x0, y0), w, h, fc="white", ec="#111", lw=0.8, zorder=3))
    for yy in (y0 + 10, y0 + 20):
        ax.plot([x0, x0 + w], [yy, yy], color="#111", lw=0.4, zorder=4)
    ax.plot([x0 + 120, x0 + 120], [y0, y0 + 20], color="#111", lw=0.4, zorder=4)
    T = lambda x, y, s, **k: ax.text(x, y, s, zorder=5, va="center", **k)
    T(x0 + 3, y0 + 25, "PARKFNB V2  -  CONTROLLER PCB  (100 x 80 mm, 2 layers)", fontsize=7.2, weight="bold")
    T(x0 + 3, y0 + 15, title, fontsize=7.4, weight="bold")
    T(x0 + 123, y0 + 15, f"SHEET {no} / {TOTAL}", fontsize=6.5, weight="bold")
    T(x0 + 3, y0 + 5, "STATUS: DESIGN FOR REVIEW - run KiCad DRC and verify footprints before ordering", fontsize=4.8, color="#a02020", weight="bold")
    T(x0 + 123, y0 + 5, f"REV {REV}   {DATE}", fontsize=6)
    return fig, ax


def table(ax, x, y, cols, rows, widths, rh=4.4, size=5.2, head="#1f3f6f"):
    W = sum(widths)
    ax.add_patch(Rectangle((x, y - rh), W, rh, fc=head, ec="#111", lw=0.4))
    xx = x
    for c, w in zip(cols, widths):
        ax.text(xx + 1.2, y - rh / 2, c, fontsize=size, color="white", weight="bold", va="center")
        xx += w
    yy = y - rh
    for i, r in enumerate(rows):
        nl = max(str(c).count("\n") + 1 for c in r)
        hh = rh * (1 + 0.72 * (nl - 1))
        ax.add_patch(Rectangle((x, yy - hh), W, hh, fc="#f1f4f8" if i % 2 else "white", ec="#999", lw=0.25))
        xx = x
        for c, w in zip(r, widths):
            ax.text(xx + 1.2, yy - hh / 2, str(c), fontsize=size, va="center", linespacing=1.05)
            xx += w
        yy -= hh
    xx = x
    for w in widths[:-1]:
        xx += w
        ax.plot([xx, xx], [y, yy], color="#999", lw=0.25)
    ax.add_patch(Rectangle((x, yy), W, y - yy, fc="none", ec="#111", lw=0.4))
    return yy


def notes(ax, x, y, title, lines, size=5.4, lh=3.3):
    ax.text(x, y, title, fontsize=6.8, weight="bold", va="top")
    yy = y - 5.5
    for ln in lines:
        ax.text(x, yy, ln, fontsize=size, va="top")
        yy -= lh * (ln.count("\n") + 1)
    return yy


GPIO_MAP = [
    ("GPIO25", "D25", "PWM_R_IN -> U2 1A -> RPWM", "config.h PIN_MOTOR_IN1 = 25 (unchanged)"),
    ("GPIO26", "D26", "PWM_L_IN -> U2 2A -> LPWM", "config.h PIN_MOTOR_IN2 = 26 (unchanged)"),
    ("GPIO27", "D27", "EN_IN -> U2 3A -> R_EN + L_EN", "NEW: set HIGH before moving, LOW after stop"),
    ("GPIO32", "D32", "HALL_0 (arch at 0 deg rest, active LOW)", "NEW: 0 deg sensor (was PIN_LIMIT_DOWN)"),
    ("GPIO33", "D33", "HALL_180 (180 deg rest, active LOW)", "NEW: 180 deg sensor"),
    ("GPIO13", "D13", "HALL_90 (standing = LOCKED, active LOW)", "NEW: 90 deg sensor (was PIN_LIMIT_UP)"),
    ("GPIO34", "D34", "ISENSE_F (motor current, ADC1)", "PIN_CURRENT = 34 (input only)"),
    ("GPIO35", "D35", "VSENSE (battery / 6.56, ADC1)", "NEW: analogRead, 16.8 V -> 2.56 V"),
    ("GPIO21", "D21", "SDA  (MPU6050)", "PIN_SDA = 21 (unchanged)"),
    ("GPIO22", "D22", "SCL  (MPU6050)", "PIN_SCL = 22 (unchanged)"),
    ("GPIO18", "D18", "LED_G (J7.1 via 330R)", "PIN_LED -> 18"),
    ("GPIO4", "D4", "LED_R (J7.2 via 330R)", "NEW: fault LED"),
    ("GPIO19", "D19", "BUZ_DRV -> BC547 -> buzzer", "PIN_BUZZER = 19 (tone() works: passive buzzer)"),
    ("GPIO23", "D23", "TAMPER (J8, active LOW)", "NEW: lid switch"),
    ("others", "EN,D2,D5,D12-15,TX/RX,VP,VN", "not connected", "boot-strapping pins left free on purpose"),
]


def main():
    res = build.main()
    parts, router = res["parts"], res["router"]
    P = {p.ref: p for p in parts}
    G = os.path.join(build.OUT, "gerbers", build.PREFIX + "-")
    pdf_path = os.path.join(build.OUT, "PARKFNB_V2_Controller_PCB.pdf")
    figs = []

    # ------------------------------------------------------------------ 1  overview
    fig, ax = frame(1, "OVERVIEW, SPECIFICATION, VERIFICATION")
    ax.text(20, 278, "PARKFNB V2 controller PCB", fontsize=18, weight="bold", va="top")
    ax.text(20, 268, "ESP32 + 74AHCT125 level shift + sense / protection for the IBT-2 motor driver. All through-hole, hand-solderable.",
            fontsize=8.2, va="top", color="#333")
    nets = res["nets"]
    spec = [
        ("Board", "100 x 80 mm, 1.6 mm FR4, 2 layers, 1 oz copper, HASL or ENIG"),
        ("Rules used", f"track 0.3 mm (power 0.8, 3V3 0.4), clearance {CLEARANCE} mm, via {VIA_D}/{VIA_DRILL}, edge 0.4 mm"),
        ("Stack", "Top: components + routing.  Bottom: GND plane + a few signal tracks"),
        ("Parts", f"{len([p for p in parts if p.fp != 'MOUNT'])} components, {sum(len(p.pads) for p in parts)} holes, "
                  f"{len(nets)} nets, {len(router.tracks)} track segments, {len(router.vias)} vias"),
        ("Antenna", "ESP32 DevKit overhangs the top edge by ~5 mm; copper keep-out under the antenna, both layers"),
        ("Mounting", "4 x M3 at 4 mm from the edges (screw-head keep-out dia 6.5)"),
        ("Motor power", "NOT on this board: battery -> fuse -> switch -> IBT-2 B+/B- directly. PCB carries logic only (< 0.5 A)"),
        ("Supply", "J1 battery 7-17 V (V1 4-cell holder, 4S = 16.8 V full) -> PTC -> Schottky -> LM2596 module (off-board, 5.1 V) -> 5 V rail -> ESP32 VIN via Schottky"),
    ]
    yy = table(ax, 20, 258, ["ITEM", "VALUE"], spec, [26, 160], rh=4.5, size=5.3)
    ver = [
        ("Router + own DRC", f"{len(res['problems'])} problems (clearance {CLEARANCE}, edge, annular ring, holes, keep-outs, opens, GND plane)"),
        ("KiCad file", res["kmsg"][0]),
        ("Independent re-check", res["kmsg"][1].replace("independent ", "") + "; " + res["kmsg"][2].replace("independent ", "")),
        ("Gerbers", f"{len(res['gfiles'])} files re-read with gerbonara without errors; rendered on sheets 4-5"),
        ("NOT done", "KiCad DRC/ERC (KiCad is not installed here), footprint check against real parts, thermal test, EMC"),
    ]
    yy = table(ax, 20, yy - 8, ["CHECK", "RESULT"], ver, [26, 160], rh=4.5, size=5.3)
    yy = notes(ax, 20, yy - 8, "HOW THIS WAS MADE", [
        "generate_pcb.py = design.py (footprints + netlist) + placement.py + router.py (grid A*, 2 layers) + check.py (shapely DRC)",
        "+ export_kicad.py + export_gerber.py.  Edit placement.py or design.py and run  python build.py  to redo everything.",
        "Open  out/PARKFNB_V2_CTRL.kicad_pcb  in KiCad 8, press B (fill zones), run DRC.  Gerbers are in out/gerbers/ (zip them for the fab).",
    ], size=5.4)
    gp = [(a, b, c, d) for (a, b, c, d) in GPIO_MAP]
    table(ax, 215, 258, ["ESP32 PIN", "DEVKIT", "FUNCTION ON THIS PCB", "FIRMWARE (config.h)"], [(a, b, c, d) for a, b, c, d in gp],
          [18, 28, 62, 62], rh=4.4, size=4.9)
    notes(ax, 215, 168, "WHY THESE CHOICES", [
        "74AHCT125 at 5 V: 3.3 V GPIO is a valid HIGH for AHCT inputs; IBT-2 inputs need 5 V logic.",
        "Input pull-downs keep the motor OFF while the ESP32 boots (pins float).  EN has its own pull-down.",
        "Hall sensors run from 5 V (A3144 needs >= 4.5 V); open-collector outputs are pulled up to 3V3, so GPIO stays safe.",
        "GY-521 gets 5 V (its own LDO makes 3.3 V and its own I2C pull-ups); R16/R17 are DNP-by-default options.",
        "Current sense: R10 1k to GND converts the BTS7960 IS current (about 1/8500 of motor current) to volts:",
        "  20 A -> 2.35 V.  Fit R10 only if the IBT-2 has no IS resistor of its own (measure with a meter, power off).",
        "ADC1 pins (34/35) used for analog: ADC2 does not work together with Wi-Fi.",
        "Battery divider 100k/18k: 16.8 V -> 2.56 V at GPIO35 (also reads a 2S pack).  TVS P6KE20A: 17.1 V stand-off.",
        "D5 keeps USB power and the buck from fighting each other when you plug a cable in.",
    ], size=5.3)
    figs.append(fig)

    # ------------------------------------------------------------------ 2,3 schematic
    fig, ax = frame(2, "SCHEMATIC 1 / 2 - POWER, ESP32")
    draw_groups(ax, parts, [
        ("1  BATTERY INPUT AND PROTECTION", ["J1", "F1", "D2", "D1", "C1", "C3", "TP1", "TP6"], 0),
        ("2  BATTERY VOLTAGE SENSE", ["R1", "R2", "C4"], 0),
        ("3  BUCK MODULE INTERFACE (module off-board)", ["J3", "J9", "C2", "C10", "TP2", "D5", "TP3", "TP4"], 1),
        ("4  POWER LED", ["R20", "D6"], 1),
        ("5  ESP32 DEVKIT V1", ["ESP1"], 2),
    ], 14, 280, 132, 40)
    ax.text(300, 100, "Net flags: the same name on two pins means they are connected.\nGND = bottom-layer plane.\n"
            "Pin 1 of the DevKit is the top-left header pin (EN) with the USB connector at the bottom.",
            fontsize=5.2, va="top", color="#444")
    figs.append(fig)
    fig, ax = frame(3, "SCHEMATIC 2 / 2 - DRIVER, SENSORS, INDICATORS")
    draw_groups(ax, parts, [
        ("6  MOTOR-DRIVER LEVEL SHIFT", ["U2", "C5", "R3", "R4", "R5", "R6", "R7", "R8", "R9"], 0),
        ("7  IBT-2 CONNECTOR + CURRENT SENSE", ["J2", "R10", "R11", "C6", "TP5"], 1),
        ("8  HALL 0 deg (rest, front)", ["J4", "R12", "R14", "C7"], 1),
        ("9  HALL 180 deg (rest, rear)", ["J5", "R13", "R15", "C8"], 2),
        ("10  IMU POD (I2C)", ["J6", "R16", "R17"], 2),
        ("11  TAMPER", ["J8", "R24", "R25", "C9"], 2),
        ("12  STATUS LED + BUZZER", ["J7", "R18", "R19", "BZ1", "Q1", "R21", "R23", "D7"], 3),
        ("13  HALL 90 deg (standing = LOCKED)", ["J10", "R26", "R27", "C11"], 0),
    ], 14, 280, 98, 40)
    figs.append(fig)

    # ------------------------------------------------------------------ 4 top view
    fig, ax = frame(4, "TOP VIEW - COMPONENT SIDE (rendered from the Gerber files)")
    a2 = fig.add_axes([0.03, 0.14, 0.62, 0.78])
    a2.set_facecolor("#0b3d1a")
    composite(a2, [(G + "F_Cu.gbr", "#d94a4a", 1.0), (G + "F_Silkscreen.gbr", "#ffffff", 0.95), (G + "Edge_Cuts.gbr", "#ffe066", 1.0)],
              xlim=(-6, 106), ylim=(-6, 90), px_per_mm=14)
    a2.set_xticks(range(0, 101, 10))
    a2.set_yticks(range(0, 81, 10))
    a2.tick_params(labelsize=5)
    a2.grid(True, color="#ffffff", alpha=0.08, lw=0.3)
    ex, ey = 58.42, 76.2
    a2.annotate("", xy=(0, -3.5), xytext=(100, -3.5), arrowprops=dict(arrowstyle="<->", lw=0.5, color="w"))
    a2.text(50, -5.2, "100", color="w", fontsize=6, ha="center")
    a2.annotate("", xy=(103.5, 0), xytext=(103.5, 80), arrowprops=dict(arrowstyle="<->", lw=0.5, color="w"))
    a2.text(105, 40, "80", color="w", fontsize=6, rotation=90, va="center")
    a2.text(72, 86.5, "ESP32 antenna end overhangs the board edge (~5 mm)", color="#6cf", fontsize=5.5, ha="center")
    a2.text(70, 12.5, "USB plug zone: keep clear (x 64-78, y 8-31)", color="#ff9", fontsize=5, ha="center")
    ax.text(285, 262, "BOARD DATA", fontsize=7, weight="bold", va="top")
    holes = [(P[h].x, P[h].y) for h in ("H1", "H2", "H3", "H4")]
    rows = [("Outline", "100 x 80 mm"), ("Mounting holes", "4 x dia 3.2 (M3) at " + ", ".join(f"({x:g},{y:g})" for x, y in holes)),
            ("ESP32 header 1", f"pin 1 at ({P['ESP1'].x:.2f}, {P['ESP1'].y:.2f}), 15 pins down, pitch 2.54"),
            ("ESP32 header 2", f"{ESP_ROW} mm to the right of header 1  (MEASURE your board)"),
            ("J1 battery", f"({P['J1'].x:.2f}, {P['J1'].y:.2f}), screw terminal 5.08, pin 1 = BAT+"),
            ("Bottom connectors", "J2 IBT-2 (8), J4 Hall 0, J5 Hall 180, (J10 Hall 90 on the left edge), J6 IMU, J7 LEDs, J8 tamper at y = 5.08"),
            ("Antenna keep-out", "x 56-87, y 77.4-80, no copper on either layer")]
    yy = table(ax, 285, 256, ["ITEM", "VALUE"], rows, [28, 97], rh=4.6, size=4.9)
    dr = [(f"{d:.2f}", n) for d, n in sorted({(pd.drill, 0) for pt in parts for pd in pt.pads}.__iter__().__next__() and [])] if False else []
    counts = {}
    for pt in parts:
        for pd in pt.pads:
            if pd.drill:
                counts[round(pd.drill, 2)] = counts.get(round(pd.drill, 2), 0) + 1
    counts[round(VIA_DRILL, 2)] = counts.get(round(VIA_DRILL, 2), 0) + len(router.vias)
    drill_rows = [(f"{d:.2f}", "plated", n) for d, n in sorted(counts.items())] + [("3.20", "non-plated", 4)]
    yy = table(ax, 285, yy - 8, ["DRILL mm", "TYPE", "COUNT"], drill_rows, [28, 40, 57], rh=4.4, size=5.0)
    notes(ax, 285, yy - 8, "ASSEMBLY NOTES", [
        "1  Solder low parts first (resistors, diodes, caps), then headers, then electrolytics,",
        "    TVS and the ESP32 headers.  Fit female headers for the DevKit, do not solder it directly.",
        "2  Observe polarity: diodes (band = cathode = square pad), C1/C2 (+ = square pad),",
        "    BC547 (flat face: C B E left to right as placed), LED D6 (square pad = cathode).",
        "3  Set the buck module to 5.1 V on the bench BEFORE connecting it to J9.",
        "4  Fit R10 / R16 / R17 only after checking the IBT-2 and GY-521 modules.",
        "5  Screw terminal J1: pin 1 = BAT+ (square pad), pin 2 = GND.",
    ], size=5.0, lh=3.2)
    figs.append(fig)

    # ------------------------------------------------------------------ 5 bottom view
    fig, ax = frame(5, "BOTTOM VIEW - GND PLANE (rendered from the Gerber files)")
    a2 = fig.add_axes([0.03, 0.14, 0.62, 0.78])
    a2.set_facecolor("#0b3d1a")
    composite(a2, [(G + "B_Cu.gbr", "#3a78e0", 1.0), (G + "Edge_Cuts.gbr", "#ffe066", 1.0)], xlim=(-6, 106), ylim=(-6, 90), px_per_mm=14)
    a2.set_xticks(range(0, 101, 10))
    a2.set_yticks(range(0, 81, 10))
    a2.tick_params(labelsize=5)
    a2.text(70, 86.5, "no copper under the antenna", color="#6cf", fontsize=5.5, ha="center")
    ax.text(285, 262, "BOTTOM LAYER", fontsize=7, weight="bold", va="top")
    notes(ax, 285, 256, "WHAT YOU ARE LOOKING AT", [
        "Blue = copper (GND plane with thermal spokes on every GND pad, plus a few signal tracks).",
        "Dark rings around holes = clearance to foreign nets or thermal relief.",
        "Viewed from the top (not mirrored), as in the Gerber coordinate system.",
        "",
        "Plane rules:  clearance 0.25 mm to other nets, 0.4 mm to the board edge,",
        "  3.25 mm radius around each M3 hole, nothing under the antenna.",
        "",
        "KiCad: the .kicad_pcb contains the plane as a zone but unfilled.",
        "  Press B (Fill all zones) after opening, then run Inspect > DRC.",
    ], size=5.2)
    bom_rows = []
    import csv
    with open(os.path.join(build.OUT, f"{build.PREFIX}_BOM.csv"), encoding="utf8") as fh:
        for r in list(csv.reader(fh))[1:]:
            if r and r[0] and not r[0].startswith("OFF"):
                bom_rows.append((r[0][:26] + ("..." if len(r[0]) > 26 else ""), r[1][:30], r[3]))
    table(ax, 285, 200, ["REFERENCES", "VALUE", "QTY"], bom_rows, [48, 62, 15], rh=3.6, size=4.4)
    figs.append(fig)

    # ------------------------------------------------------------------ 6 wiring + bring-up
    fig, ax = frame(6, "WIRING TO THE REST OF THE UNIT, BRING-UP TEST")
    wiring = [
        ("J1", "1 BAT+, 2 GND", "From the fused, switched battery lead (after SW1).  GND = battery negative post (star point)"),
        ("J3 / J9", "VIN,GND / 5V,GND", "To the LM2596 module IN+/IN- and OUT+/OUT-.  Set the module to 5.1 V first"),
        ("J2", "1 RPWM  2 LPWM  3 R_EN  4 L_EN", "IBT-2 header pins RPWM, LPWM, R_EN, L_EN (3 and 4 are tied together on the PCB)"),
        ("", "5 R_IS  6 L_IS  7 VCC  8 GND", "IBT-2 R_IS, L_IS (joined on PCB), VCC (5 V logic), GND (logic ground)"),
        ("J4/J10/J5", "1 +5V  2 GND  3 OUT", "A3144 / US5881 Hall sensor: VCC, GND, OUT.  J4 = 0 deg, J10 = 90 deg (locked), J5 = 180 deg"),
        ("J6", "1 +5V  2 GND  3 SDA  4 SCL", "GY-521: VCC, GND, SDA, SCL (leave XDA/XCL/AD0/INT open, AD0 low = 0x68)"),
        ("J7", "1 LED G  2 LED R  3 GND", "Two LEDs with their cathodes joined to pin 3; the 330 R are on the PCB"),
        ("J8", "1 SW  2 GND", "Lid micro-switch: pressed (closed to GND) while the lid is shut; opening the lid releases it -> GPIO23 HIGH = alarm"),
    ]
    yy = table(ax, 20, 276, ["CONNECTOR", "PINS", "GOES TO"], wiring, [20, 52, 112], rh=4.8, size=4.9)
    yy = notes(ax, 20, yy - 6, "BRING-UP: NO ESP32, NO MODULES FIRST", [
        "1  Visual check, then continuity: GND to VIN, GND to +5V, GND to +3V3 must NOT beep (before any parts are powered).",
        "2  Power J1 from a bench supply at 9 V, 100 mA limit.  VIN (TP1) should read ~ 8.6 V (diode drop), PTC stays cool.",
        "3  Reverse the supply briefly with the current limit still on: nothing should conduct (D2 blocks, TVS is behind it).",
        "4  Connect the buck module, check TP2 = 5.1 V.  Then fit the ESP32 on its headers: TP3 must read 3.3 V.",
        "5  Flash the firmware over USB (first time) or OTA.  Check Serial for Wi-Fi and the angle.",
        "6  Connect the IBT-2 with the MOTOR DISCONNECTED: with GPIO27 low, RPWM and LPWM must be 0 V at J2 (boot-safe).",
        "7  Connect the motor on a bench supply with current limit.  Move 0 -> 90 -> 180 deg, log ISENSE_F (TP5) and battery voltage.",
        "8  Hall sensors: wave the magnet; GPIO32 / 13 / 33 should go LOW.  Tamper: open the switch -> GPIO23 goes HIGH.",
        "9  Measure motor stall current, then set the fuse, wire gauge and switch rating from it (not from the module rating).",
    ], size=5.4, lh=3.5)
    notes(ax, 20, yy - 6, "FIRMWARE CHANGES NEEDED (config.h / .ino)", [
        "Position sensors (INPUT_PULLUP, active LOW): 0 deg = GPIO32, 90 deg (locked) = GPIO13, 180 deg = GPIO33.",
        "Range becomes 0 - 90 - 180: two open targets (0, 180), locked = 90 (today config.h clamps 0..90).",
        "NEW pin 27: motor enable (HIGH before PWM, LOW when stopped / fault).  NEW 35: battery ADC.  NEW 4: red LED.  NEW 23: tamper.",
        "PIN_CURRENT 34, PIN_BUZZER 19, PIN_LED 18.  With a 4S pack (16.8 V) limit PWM_MAX to ~180 for the 12 V motor.",
    ], size=5.4, lh=3.5)
    notes(ax, 215, 276, "OPEN ITEMS - DO BEFORE ORDERING BOARDS", [
        "1  Check every footprint against the real part: ESP32 header row spacing (25.4 vs 22.86), buzzer pitch,",
        "    screw terminal, PTC, electrolytic caps, TVS and diode lead pitch/drill.  Footprints here are generic.",
        "2  Open the .kicad_pcb in KiCad, fill zones, run DRC.  KiCad was not available to me, so my own DRC is not a substitute.",
        "3  Confirm the LM2596 module output voltage range and that you accept ~0.25 V drop through D5 into the DevKit VIN.",
        "4  Decide whether D2 + 1.1 A PTC are enough protection or add a P-MOSFET reverse-polarity stage later.",
        "5  Hall sensor part (A3144 vs US5881): both are open-collector, check supply range and pinout of the exact one you buy.",
        "6  Add a second TVS or a bigger one if the motor line shares the battery lead (motor spikes reach the 12 V rail).",
        "7  Motor current never touches this board: keep the motor leads away from the logic cables inside the shell.",
        "8  EMC and thermal tests inside the closed shell are not covered by this design.",
    ], size=5.3, lh=3.4)
    figs.append(fig)

    # ------------------------------------------------------------------ 7 netlist
    fig, ax = frame(7, "NETLIST")
    rows = []
    for n in sorted(nets):
        rows.append((n, NET_W.get(n, DEFAULT_W) if n != "GND" else "plane", " ".join(nets[n])))
    half = (len(rows) + 1) // 2
    table(ax, 14, 280, ["NET", "W", "PINS"], rows[:half], [30, 10, 150], rh=4.2, size=4.6)
    table(ax, 215, 280, ["NET", "W", "PINS"], rows[half:], [30, 10, 150], rh=4.2, size=4.6)
    figs.append(fig)

    with PdfPages(pdf_path) as pdf:
        for f in figs:
            pdf.savefig(f)
    for i, f in enumerate(figs, 1):
        f.savefig(os.path.join(build.OUT, f"preview_pcb_sheet{i}.png"), dpi=90)
        plt.close(f)
    print("wrote", pdf_path)


if __name__ == "__main__":
    main()
