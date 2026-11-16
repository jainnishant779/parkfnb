"""PARKFNB V2 controller PCB - footprints, netlist and placement.

Board 100 x 80 mm, 2 layers, all through-hole (hand-solderable prototype).
Coordinates: mm, origin bottom-left, +y up, rotation counter-clockwise.

Every footprint here is a simple generic through-hole footprint built from standard pitches.
CHECK EACH ONE AGAINST THE REAL PART'S DATASHEET before ordering boards (see README.md).
"""
import math

BOARD_W, BOARD_H = 100.0, 80.0
GRID = 0.635                       # routing grid = 1/4 of 2.54 mm
CLEARANCE = 0.25
ESP_ROW = 25.4                     # DevKit header row spacing - MEASURE YOUR BOARD (22.86 or 25.4)

NET_W = {                          # track widths; default 0.3
    "VBAT": 0.8, "VBAT_F": 0.8, "VIN": 0.8, "+5V": 0.8, "+5V_ESP": 0.8, "+3V3": 0.4,
}
DEFAULT_W = 0.3
VIA_D, VIA_DRILL = 0.8, 0.4


# ------------------------------------------------------------------ footprints
# pad: (num, x, y, shape 'c'|'r', size, drill)   silk: ('line', pts, closed) | ('circle', cx, cy, r)
def _rect(x0, y0, x1, y1):
    return ("line", [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], True)


def fp_hdr(n, pitch=2.54, pad=1.7, drill=1.0):
    pads = [(str(i + 1), i * pitch, 0.0, "r" if i == 0 else "c", pad, drill) for i in range(n)]
    return pads, [_rect(-pitch / 2, -pitch / 2, n * pitch - pitch / 2, pitch / 2)]


def fp_screw2():
    pads = [("1", 0.0, 0.0, "r", 2.6, 1.4), ("2", 5.08, 0.0, "c", 2.6, 1.4)]
    return pads, [_rect(-3.0, -4.2, 8.1, 4.2)]


def fp_dip14():
    pads = []
    for i in range(7):
        pads.append((str(i + 1), 0.0, -i * 2.54, "r" if i == 0 else "c", 1.6, 0.9))
    for i in range(7):
        pads.append((str(8 + i), 7.62, -(6 - i) * 2.54, "c", 1.6, 0.9))
    silk = [("line", [(-1.4, 1.4), (9.0, 1.4), (9.0, -16.6), (-1.4, -16.6)], True)]
    return pads, silk


def fp_axial(pitch=10.16):
    pads = [("1", 0.0, 0.0, "r", 1.7, 0.9), ("2", pitch, 0.0, "c", 1.7, 0.9)]
    return pads, [_rect(pitch / 2 - 3.2, -1.2, pitch / 2 + 3.2, 1.2)]


def fp_cap_mlcc(pitch=5.08):
    pads = [("1", 0.0, 0.0, "r", 1.7, 0.9), ("2", pitch, 0.0, "c", 1.7, 0.9)]
    return pads, [_rect(0.6, -1.6, pitch - 0.6, 1.6)]


def fp_elec(pitch, dia):
    pads = [("1", 0.0, 0.0, "r", 1.8, 1.0), ("2", pitch, 0.0, "c", 1.8, 1.0)]
    return pads, [("circle", pitch / 2, 0.0, dia / 2)]


def fp_diode(pitch=10.16, pad=1.8, drill=1.0, body=(2.0, 8.2)):
    """pad 1 = cathode (square, banded end), pad 2 = anode."""
    pads = [("1", 0.0, 0.0, "r", pad, drill), ("2", pitch, 0.0, "c", pad, drill)]
    x0, x1 = (pitch - (body[1] - body[0])) / 2, (pitch + (body[1] - body[0])) / 2
    return pads, [_rect(x0, -1.6, x1, 1.6), ("line", [(x0 + 1.0, -1.6), (x0 + 1.0, 1.6)], False)]


def fp_led3():
    pads = [("1", 0.0, 0.0, "r", 1.7, 0.9), ("2", 2.54, 0.0, "c", 1.7, 0.9)]
    return pads, [("circle", 1.27, 0.0, 2.0)]


def fp_to92():
    pads = [(str(i + 1), i * 2.54, 0.0, "r" if i == 0 else "c", 1.5, 0.9) for i in range(3)]
    return pads, [("line", [(-0.5, -1.2), (5.6, -1.2), (5.6, 2.4), (-0.5, 2.4)], True)]


def fp_buzzer():
    pads = [("1", 0.0, 0.0, "r", 2.0, 1.1), ("2", 7.6, 0.0, "c", 2.0, 1.1)]
    return pads, [("circle", 3.8, 0.0, 6.0)]


def fp_tp():
    return [("1", 0.0, 0.0, "c", 2.0, 1.0)], [("circle", 0.0, 0.0, 1.6)]


def fp_ptc():
    pads = [("1", 0.0, 0.0, "r", 1.8, 1.0), ("2", 5.08, 0.0, "c", 1.8, 1.0)]
    return pads, [_rect(-1.5, -2.2, 6.6, 2.2)]


def fp_esp32():
    """30-pin ESP32 DevKit V1 on two 1x15 female headers.  Origin = top-left pin; USB end is at the bottom."""
    pads = []
    for i in range(15):
        pads.append((str(i + 1), 0.0, -i * 2.54, "r" if i == 0 else "c", 1.7, 1.0))
        pads.append((str(16 + i), ESP_ROW, -i * 2.54, "c", 1.7, 1.0))
    mw = 28.0
    x0 = (ESP_ROW - mw) / 2
    return pads, [_rect(x0, 9.0, x0 + mw, -45.6), _rect(-1.27, 1.27, 1.27 + ESP_ROW, -14 * 2.54 - 1.27)]


FOOTPRINTS = {
    "HDR2": lambda: fp_hdr(2), "HDR3": lambda: fp_hdr(3), "HDR4": lambda: fp_hdr(4), "HDR8": lambda: fp_hdr(8),
    "SCREW2": fp_screw2, "DIP14": fp_dip14, "R": fp_axial, "C100N": fp_cap_mlcc,
    "C470": lambda: fp_elec(5.0, 10.0), "C220": lambda: fp_elec(2.5, 6.3),
    "D41": lambda: fp_diode(10.16, 1.8, 1.0, (2.0, 8.2)), "DO15": lambda: fp_diode(10.16, 2.0, 1.1, (1.5, 8.7)),
    "D35": lambda: fp_diode(7.62, 1.6, 0.9, (1.5, 6.1)), "LED3": fp_led3, "TO92": fp_to92,
    "BUZZER": fp_buzzer, "TP": fp_tp, "PTC": fp_ptc, "ESP32": fp_esp32,
    "MOUNT": lambda: ([], [("circle", 0.0, 0.0, 3.0)]),
}


class Pad:
    def __init__(self, ref, num, x, y, shape, size, drill, net):
        self.ref, self.num, self.x, self.y = ref, num, x, y
        self.shape, self.size, self.drill, self.net = shape, size, drill, net


class Part:
    def __init__(self, ref, value, fp, x, y, rot, pins, note=""):
        self.ref, self.value, self.fp, self.x, self.y, self.rot, self.pins, self.note = ref, value, fp, x, y, rot, pins, note
        pads, silk = FOOTPRINTS[fp]()
        c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))

        def tf(px, py):
            return x + px * c - py * s, y + px * s + py * c

        self.pads = []
        for (num, px, py, shape, size, drill) in pads:
            gx, gy = tf(px, py)
            self.pads.append(Pad(ref, num, gx, gy, shape, size, drill, pins.get(num, "")))
        self.silk = []
        for it in silk:
            if it[0] == "line":
                self.silk.append(("line", [tf(*q) for q in it[1]], it[2]))
            else:
                gx, gy = tf(it[1], it[2])
                self.silk.append(("circle", gx, gy, it[3]))
        xs = [q[0] for it in self.silk if it[0] == "line" for q in it[1]] + \
             [it[1] + d * it[3] for it in self.silk if it[0] == "circle" for d in (-1, 1)]
        ys = [q[1] for it in self.silk if it[0] == "line" for q in it[1]] + \
             [it[2] + d * it[3] for it in self.silk if it[0] == "circle" for d in (-1, 1)]
        self.bbox = (min(xs), min(ys), max(xs), max(ys)) if xs else (x, y, x, y)


ESP_LEFT = ["", "", "", "ISENSE_F", "VSENSE", "HALL_0", "HALL_180", "PWM_R_IN", "PWM_L_IN", "EN_IN", "", "", "HALL_90",
            "GND", "+5V_ESP"]
ESP_RIGHT = ["TAMPER", "SCL", "", "", "SDA", "BUZ_DRV", "LED_G", "", "", "", "LED_R", "", "", "GND", "+3V3"]
ESP_NAMES_L = ["EN", "VP", "VN", "D34", "D35", "D32", "D33", "D25", "D26", "D27", "D14", "D12", "D13", "GND", "VIN"]
ESP_NAMES_R = ["D23", "D22", "TX0", "RX0", "D21", "D19", "D18", "D5", "TX2", "RX2", "D4", "D2", "D15", "GND", "3V3"]


def build_parts(P):
    """P: dict ref -> (x, y, rot).  Returns the list of parts (netlist embedded)."""
    esp = {str(i + 1): n for i, n in enumerate(ESP_LEFT)}
    esp.update({str(16 + i): n for i, n in enumerate(ESP_RIGHT)})
    spec = [
        # ref, value, footprint, pins
        ("J1", "BAT IN 7-17V 5.08 2P", "SCREW2", {"1": "VBAT", "2": "GND"}),
        ("F1", "PTC 1.1A hold", "PTC", {"1": "VBAT", "2": "VBAT_F"}),
        ("D2", "1N5819", "D41", {"1": "VIN", "2": "VBAT_F"}),
        ("D1", "P6KE20A TVS", "DO15", {"1": "VIN", "2": "GND"}),
        ("C1", "470uF 25V", "C470", {"1": "VIN", "2": "GND"}),
        ("C3", "100nF", "C100N", {"1": "VIN", "2": "GND"}),
        ("J3", "BUCK IN", "HDR2", {"1": "VIN", "2": "GND"}),
        ("J9", "BUCK OUT", "HDR2", {"1": "+5V", "2": "GND"}),
        ("C2", "220uF 10V", "C220", {"1": "+5V", "2": "GND"}),
        ("C10", "100nF", "C100N", {"1": "+5V", "2": "GND"}),
        ("D5", "1N5817", "D41", {"1": "+5V_ESP", "2": "+5V"}),
        ("R20", "1k", "R", {"1": "+5V", "2": "LED_PWR_A"}),
        ("D6", "LED 3mm green", "LED3", {"1": "GND", "2": "LED_PWR_A"}),
        ("R1", "100k", "R", {"1": "VIN", "2": "VSENSE"}),
        ("R2", "18k", "R", {"1": "VSENSE", "2": "GND"}),
        ("C4", "100nF", "C100N", {"1": "VSENSE", "2": "GND"}),
        ("ESP1", "ESP32 DevKit V1 30-pin", "ESP32", esp),
        ("U2", "74AHCT125N", "DIP14", {"1": "GND", "2": "PWM_R_IN", "3": "PWM_R_BUF", "4": "GND", "5": "PWM_L_IN",
                                       "6": "PWM_L_BUF", "7": "GND", "8": "EN_BUF", "9": "EN_IN", "10": "GND",
                                       "11": "", "12": "GND", "13": "+5V", "14": "+5V"}),
        ("C5", "100nF", "C100N", {"1": "+5V", "2": "GND"}),
        ("R3", "10k", "R", {"1": "PWM_R_IN", "2": "GND"}),
        ("R4", "10k", "R", {"1": "PWM_L_IN", "2": "GND"}),
        ("R5", "10k", "R", {"1": "EN_IN", "2": "GND"}),
        ("R6", "10k", "R", {"1": "EN_BUF", "2": "GND"}),
        ("R7", "100R", "R", {"1": "PWM_R_BUF", "2": "RPWM"}),
        ("R8", "100R", "R", {"1": "PWM_L_BUF", "2": "LPWM"}),
        ("R9", "100R", "R", {"1": "EN_BUF", "2": "MOT_EN"}),
        ("J2", "IBT-2 CTRL 1x8", "HDR8", {"1": "RPWM", "2": "LPWM", "3": "MOT_EN", "4": "MOT_EN", "5": "ISENSE",
                                          "6": "ISENSE", "7": "+5V", "8": "GND"}),
        ("R10", "1k (DNP if IBT-2 has IS resistor)", "R", {"1": "ISENSE", "2": "GND"}),
        ("R11", "1k", "R", {"1": "ISENSE", "2": "ISENSE_F"}),
        ("C6", "100nF", "C100N", {"1": "ISENSE_F", "2": "GND"}),
        ("J4", "HALL 0deg 3P", "HDR3", {"1": "+5V", "2": "GND", "3": "HALL_0_RAW"}),
        ("R12", "10k", "R", {"1": "+3V3", "2": "HALL_0_RAW"}),
        ("R14", "1k", "R", {"1": "HALL_0_RAW", "2": "HALL_0"}),
        ("C7", "100nF", "C100N", {"1": "HALL_0", "2": "GND"}),
        ("J5", "HALL 180deg 3P", "HDR3", {"1": "+5V", "2": "GND", "3": "HALL_180_RAW"}),
        ("R13", "10k", "R", {"1": "+3V3", "2": "HALL_180_RAW"}),
        ("R15", "1k", "R", {"1": "HALL_180_RAW", "2": "HALL_180"}),
        ("C8", "100nF", "C100N", {"1": "HALL_180", "2": "GND"}),
        ("J10", "HALL 90deg 3P", "HDR3", {"1": "+5V", "2": "GND", "3": "HALL_90_RAW"}),
        ("R26", "10k", "R", {"1": "+3V3", "2": "HALL_90_RAW"}),
        ("R27", "1k", "R", {"1": "HALL_90_RAW", "2": "HALL_90"}),
        ("C11", "100nF", "C100N", {"1": "HALL_90", "2": "GND"}),
        ("J6", "IMU POD 4P", "HDR4", {"1": "+5V", "2": "GND", "3": "SDA", "4": "SCL"}),
        ("R16", "4.7k (DNP if GY-521 has pull-ups)", "R", {"1": "SDA", "2": "+3V3"}),
        ("R17", "4.7k (DNP if GY-521 has pull-ups)", "R", {"1": "SCL", "2": "+3V3"}),
        ("J7", "STATUS LED 3P", "HDR3", {"1": "LED_G_A", "2": "LED_R_A", "3": "GND"}),
        ("R18", "330R", "R", {"1": "LED_G", "2": "LED_G_A"}),
        ("R19", "330R", "R", {"1": "LED_R", "2": "LED_R_A"}),
        ("BZ1", "Buzzer 12mm 5V", "BUZZER", {"1": "+5V", "2": "BUZ_C"}),
        ("Q1", "BC547", "TO92", {"1": "BUZ_C", "2": "BUZ_B", "3": "GND"}),
        ("R21", "1k", "R", {"1": "BUZ_DRV", "2": "BUZ_B"}),
        ("R23", "10k", "R", {"1": "BUZ_B", "2": "GND"}),
        ("D7", "1N4148", "D35", {"1": "+5V", "2": "BUZ_C"}),
        ("J8", "TAMPER 2P", "HDR2", {"1": "TAMPER_RAW", "2": "GND"}),
        ("R24", "10k", "R", {"1": "+3V3", "2": "TAMPER_RAW"}),
        ("R25", "1k", "R", {"1": "TAMPER_RAW", "2": "TAMPER"}),
        ("C9", "100nF", "C100N", {"1": "TAMPER", "2": "GND"}),
        ("TP1", "VIN", "TP", {"1": "VIN"}), ("TP2", "+5V", "TP", {"1": "+5V"}),
        ("TP3", "+3V3", "TP", {"1": "+3V3"}), ("TP4", "GND", "TP", {"1": "GND"}),
        ("TP5", "ISENSE_F", "TP", {"1": "ISENSE_F"}), ("TP6", "VBAT_F", "TP", {"1": "VBAT_F"}),
        ("H1", "M3", "MOUNT", {}), ("H2", "M3", "MOUNT", {}), ("H3", "M3", "MOUNT", {}), ("H4", "M3", "MOUNT", {}),
    ]
    parts = []
    for ref, value, fp, pins in spec:
        x, y, rot = P[ref]
        parts.append(Part(ref, value, fp, x, y, rot, pins))
    return parts
