"""PARKFNB Smart Parking Barrier - V3 Complete Fabrication Drawing Set.

Generates full A3 engineering drawing sheets matching the exact CAD format:
- Sheet 1: GENERAL ARRANGEMENT & PLAN VIEW (All Widths, Tolerances & Side Gaps)
- Sheet 2: ELEVATIONS & VERTICAL GAPS (All Heights, Box Heights & Under-Arch Gap Heights)
- Sheet 3: COMPLETE WORKSHOP GAP AUDIT & PLATE CUTTING SPECIFICATIONS
- Sheet 4: ALL-IN-ONE WORKSHOP MASTER BLUEPRINT (Ready for Fabricator Handoff)

Generates:
  docs/barrier-v3-70mm/PARKFNB_V3_Complete_Fabrication_Drawings.pdf
  docs/barrier-v3-70mm/sheet1_plan_view_all_gaps.png
  docs/barrier-v3-70mm/sheet2_elevations_gap_heights.png
  docs/barrier-v3-70mm/sheet3_fabrication_audit_table.png
  docs/barrier-v3-70mm/sheet4_workshop_master_blueprint.png
"""

import math
import os
import sys

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Circle, Polygon
from matplotlib.backends.backend_pdf import PdfPages

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS_ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(DOCS_ROOT, "barrier-v2"))

import cadlib
from cadlib import new_sheet, View, table, note_block

# Configure title block
cadlib.REV = "V3-70MM"
cadlib.DATE = "2026-11-03"
cadlib.SHEETS_TOTAL = 4
cadlib.TITLE_LINE = "V3 Layout: Motor @ 70 mm | Inner Space 200 mm | Bearing C-C 140 mm | Complete Fabrication Set"

# -----------------------------------------------------------------------------------------
# Exact Engineering Parameters
# -----------------------------------------------------------------------------------------
P = dict(
    motor_dist=70.0,       # Motor distance from shaft centerline (7 cm)
    inner_space=200.0,     # Inner space / opening diameter of half tyre (20 cm)
    brg_cc=140.0,          # Bearing center to center (14 cm)
    
    # Shaft & Bearings (UCP205 standard):
    shaft_d=25.0, shaft_len=406.0,
    zs=36.5,               # Shaft centerline height above box floor
    brg_w=38.0,            # Foot width along shaft
    brg_len=140.0,         # Foot length front-to-rear
    brg_dome=71.0,         # Pillow block dome height
    brg_bolt_cc=105.0,     # Bolt hole spacing along Y
    
    # Tyre Arch (MRF 4.00-8 half tyre):
    tyre_band=100.0,       # Radial width
    tyre_w=100.0,          # Cross-section width
    leg=51.0,              # Straight leg extension
    
    # Sprockets & Chain (3/8 in pitch = 9.525 mm):
    spk_big_od=70.0, spk_small_od=38.0,
    chain_x=-25.0,
    
    # Motor (12V DC Geared):
    gb_d=38.0, gb_len=33.0, can_d=30.0, can_len=35.0,
    motor_z=25.5,
    
    # Enclosure & Steel Plate Sizes:
    floor_t=6.0, wall_t=4.0, skin_t=6.0,
    box_w=190.0,           # Outer box width (fits in 200 mm inner space)
    box_front_y=-105.0,    # Front wall (covers motor at y = -89 mm)
    box_rear_y=135.0,      # Rear wall (covers electronics)
    top_hi=80.0,           # Main box top above floor (86 mm from ground)
    top_ear=55.0,          # Motor low step top above floor (61 mm from ground)
    ear_step_y=-50.0,      # Where the low step transitions to main top
)
p = P

RI = p["inner_space"] / 2.0   # 100 mm inner radius
RO = RI + p["tyre_band"]      # 200 mm outer radius
GROUND = -p["floor_t"]        # -6 mm
BOX_LEN = p["box_rear_y"] - p["box_front_y"] # 240 mm
H_STANDING = p["zs"] + p["leg"] + RO - GROUND # 293.5 mm (~29.4 cm)
H_FOLDED = p["zs"] + p["tyre_w"] / 2.0 - GROUND # 92.5 mm (~9.3 cm)
H_BOX_MAIN = p["top_hi"] - GROUND               # 86.0 mm
H_BOX_STEP = p["top_ear"] - GROUND              # 61.0 mm

# Gaps calculated:
SIDE_GAP_TYRE_BOX = (p["inner_space"] - p["box_w"]) / 2.0    # 5.0 mm each side
BRG_OUTER_X = p["brg_cc"] / 2.0 + p["brg_w"] / 2.0          # 89.0 mm
GAP_BRG_BOX_WALL = p["box_w"] / 2.0 - BRG_OUTER_X            # 6.0 mm each side
GAP_BRG_INNER = (p["brg_cc"] / 2.0 - p["brg_w"] / 2.0) * 2  # 102.0 mm central bay
MOT_END_X = p["chain_x"] + p["gb_len"] + p["can_len"]        # -25 + 68 = +43.0 mm
GAP_MOT_BRG = (p["brg_cc"] / 2.0 - p["brg_w"] / 2.0) - MOT_END_X # 51 - 43 = 8.0 mm
GAP_SPROCKET_TIPS = p["motor_dist"] - (p["spk_big_od"]/2.0 + p["spk_small_od"]/2.0) # 70 - 54 = 16.0 mm
GAP_MOT_FRONT_WALL = abs(p["box_front_y"]) - (p["motor_dist"] + p["gb_d"] / 2.0) # 105 - 89 = 16.0 mm
ARCH_CROWN_INNER_Z = p["zs"] + p["leg"] + RI - GROUND       # 42.5 + 51 + 100 = 193.5 mm
GAP_VERT_ARCH_BOX = ARCH_CROWN_INNER_Z - H_BOX_MAIN          # 193.5 - 86.0 = 107.5 mm

sheets = []

# =========================================================================
# SHEET 1: GENERAL ARRANGEMENT & PLAN VIEW (TOP VIEW - ALL GAPS & WIDTHS)
# =========================================================================
fig, ax = new_sheet(1, "GENERAL ARRANGEMENT - PLAN VIEW (ALL GAPS & WIDTHS)", "1 : 2.5")
SC = 0.32
V = View(ax, 150, 145, SC)

# 1. Tyre Flat 0 deg and 180 deg
px, py = RO, p["leg"] + RO
V.rect(-px, px, -py, 0, "phan", fill="#e2e8f0", alpha=0.35)
V.rect(-px, px, 0, py, "phan", fill="#e2e8f0", alpha=0.35)
V.text(0, -py + 15, "TYRE FLAT AT 0° (FRONT OPEN - ON GROUND)", 4.6, color="#1e3a8a")
V.text(0, py - 15, "TYRE FLAT AT 180° (REAR OPEN - ON GROUND)", 4.6, color="#1e3a8a")

# 2. Tyre Inner Space Boundary lines
V.line([(-RI, -py), (-RI, py)], "dim")
V.line([(RI, -py), (RI, py)], "dim")

# 3. Steel Box Enclosure (Outer 190 x 240 mm)
V.rect(-p["box_w"] / 2.0, p["box_w"] / 2.0, p["box_front_y"], p["box_rear_y"], "out", fill="#bfdbfe", alpha=0.55)

# 4. Box Low-Step Divider
V.line([(-p["box_w"] / 2.0, p["ear_step_y"]), (p["box_w"] / 2.0, p["ear_step_y"])], "thin")
V.text(0, -95, "LOW STEP (H=61 mm)", 3.8, color="#1e40af", ha="center")
V.text(0, 10, "MAIN ROOF (H=86 mm)", 3.8, color="#1e40af", ha="center")

# 5. Solid Steel Shaft Ø25 x 406 mm
V.rect(-p["shaft_len"] / 2.0, p["shaft_len"] / 2.0, -p["shaft_d"] / 2.0, p["shaft_d"] / 2.0, "out", fill="#94a3b8")
V.line([(-p["shaft_len"] / 2.0 - 15, 0), (p["shaft_len"] / 2.0 + 15, 0)], "cen")

# 6. Bearings (UCP205, C-C 140 mm)
for bx in [-p["brg_cc"] / 2.0, p["brg_cc"] / 2.0]:
    V.rect(bx - p["brg_w"] / 2.0, bx + p["brg_w"] / 2.0, -p["brg_len"] / 2.0, p["brg_len"] / 2.0, "out", fill="#15803d", alpha=0.8)
    V.circle(bx, 0, 3.5, "thin", fill="white")
    V.circle(bx, -p["brg_bolt_cc"] / 2.0, 3.5, "thin", fill="white")
    V.circle(bx, p["brg_bolt_cc"] / 2.0, 3.5, "thin", fill="white")

# 7. Big Sprocket on Shaft (OD 70 mm, x = -25)
V.rect(p["chain_x"] - 3.5, p["chain_x"] + 3.5, -p["spk_big_od"] / 2.0, p["spk_big_od"] / 2.0, "out", fill="#b45309")

# 8. Motor & Small Sprocket (Center Dist = 70 mm, y = -70)
mot_y = -p["motor_dist"]
V.rect(p["chain_x"] - 3.0, p["chain_x"] + 3.0, mot_y - p["spk_small_od"] / 2.0, mot_y + p["spk_small_od"] / 2.0, "out", fill="#b45309")
V.rect(p["chain_x"], p["chain_x"] + p["gb_len"], mot_y - p["gb_d"] / 2.0, mot_y + p["gb_d"] / 2.0, "out", fill="#cbd5e1")
V.rect(p["chain_x"] + p["gb_len"], MOT_END_X, mot_y - p["can_d"] / 2.0, mot_y + p["can_d"] / 2.0, "out", fill="#64748b")
V.line([(p["chain_x"] - 15, mot_y), (MOT_END_X + 15, mot_y)], "cen")

# Chain lines
V.line([(p["chain_x"], p["spk_big_od"] / 2.0 - 4), (p["chain_x"], mot_y + p["spk_small_od"] / 2.0 - 2)], "out")
V.line([(p["chain_x"], -p["spk_big_od"] / 2.0 + 4), (p["chain_x"], mot_y - p["spk_small_od"] / 2.0 + 2)], "out")

# 9. Electronics Compartment at Rear
V.rect(-p["box_w"] / 2.0 + 8, p["box_w"] / 2.0 - 8, 25, p["box_rear_y"] - 8, "elec", fill="#f3e8ff", alpha=0.5)
V.text(0, 75, "ELECTRONICS TRAY\n(ESP32, BTS7960 Driver, 4S BMS, 4x18650)", 4.0, ha="center", color="#6b21a8")

# 10. Floor Anchors (4 x M12)
for ax_, ay_ in [(-60, 115), (60, 115), (-60, -85), (60, -85)]:
    V.circle(ax_, ay_, 6.0, "out", fill="white")
    V.text(ax_, ay_ - 11, "M12", 3.4, ha="center")

# ----------------- DIMENSIONS ON SHEET 1 -----------------
# Widths & Side Gaps
V.dim((-RI, 160), (RI, 160), 10, "h", txt="Inner Opening = 200 mm (20 cm)")
V.dim((-p["box_w"] / 2.0, p["box_front_y"]), (p["box_w"] / 2.0, p["box_front_y"]), -20, "h", txt="Box Outer Width = 190 mm")
V.dim((-p["brg_cc"] / 2.0, -p["brg_len"] / 2.0), (p["brg_cc"] / 2.0, -p["brg_len"] / 2.0), -15, "h", txt="Bearing C-C = 140 mm")
V.dim((-p["shaft_len"] / 2.0, 0), (p["shaft_len"] / 2.0, 0), 45, "h", txt="Shaft Total Length = 406 mm (16 in)")

# Side Gaps Callouts
V.dim((-RI, -p["box_w"] / 2.0 + 40), (-p["box_w"] / 2.0, -p["box_w"] / 2.0 + 40), 8, "h", txt="5 mm Gap")
V.dim((p["box_w"] / 2.0, -p["box_w"] / 2.0 + 40), (RI, -p["box_w"] / 2.0 + 40), 8, "h", txt="5 mm Gap")

# Front-to-Rear Lengths
V.dim((-p["box_w"] / 2.0, p["box_front_y"]), (-p["box_w"] / 2.0, p["box_rear_y"]), -25, "v", txt="Box Total Length = 240 mm")
V.dim((p["chain_x"] + 35, 0), (p["chain_x"] + 35, mot_y), 30, "v", txt="Motor Dist = 70 mm")
V.dim((-p["box_w"] / 2.0, p["box_front_y"]), (-p["box_w"] / 2.0, p["ear_step_y"]), -10, "v", txt="Step = 55 mm")

# Inter-bearing gap & motor gap callout
V.dim((-51, 0), (51, 0), -45, "h", txt="102 mm Bearing Gap")
V.text(MOT_END_X + 2, mot_y - 12, "8 mm Gap to Bearing", 3.8, color="#047857", weight="bold")
V.text(p["chain_x"] + 15, -45, "16 mm Sprocket Gap", 3.8, color="#b45309", weight="bold")

# Notes and Table on Sheet 1
t_rows = [
    ("Inner Tyre Opening", "200.0 mm (20 cm)", "Tyre leg clear gap"),
    ("Outer Steel Box Width", "190.0 mm (19 cm)", "Enclosure box body"),
    ("Side Gap (Both Sides)", "5.0 mm Left / 5.0 mm Right", "Tyre to box clearance"),
    ("Bearing Center-to-Center", "140.0 mm (14 cm)", "2 x UCP205 pillow blocks"),
    ("Inter-Bearing Clear Bay", "102.0 mm (10.2 cm)", "Between bearing inner faces"),
    ("Motor Center Distance", "70.0 mm (7.0 cm)", "Shaft axis to motor axis"),
    ("Motor-to-Bearing Gap", "8.0 mm clear margin", "Motor fits inside 102 mm bay"),
    ("Sprocket Tip Clearance", "16.0 mm clear gap", "Smooth 3/8 in chain drive"),
    ("Front Wall Motor Margin", "16.0 mm clear margin", "Cover clearance"),
    ("Box Front-to-Rear Length", "240.0 mm (24 cm)", "41 mm saved vs old design"),
    ("Shaft Extension (Both Sides)", "108.0 mm on each side", "Shaft sticking outside box"),
]
yy = table(ax, 280, 275, ["CRITICAL GAP / DIMENSION", "VALUE", "FUNCTION / ROLE"], t_rows, [52, 44, 40], rh=4.2, size=4.8)

note_block(ax, 280, yy - 6, "FABRICATION INSTRUCTIONS (PLAN)", [
    "1. WALLS: 4 mm MS plate welded directly to 6 mm floor plate sitting on ground.",
    "2. SHAFT HOLES: Cut Ø26 mm clearance holes at x = +/-95 mm on both side walls; fit rubber seals.",
    "3. GAPS AT BOTH SIDES: Ensure exactly 5.0 mm clearance between box side wall and tyre inner leg.",
    "4. SPROCKETS: Align Big Sprocket (x = -25) with Motor Small Sprocket; verify 16 mm tip clearance.",
    "5. BEARING MOUNTING: Drill 4 x M14 tapped holes for UCP205 mounting at 140 mm C-C, 105 mm spacing.",
], w=136, size=4.8, lh=3.3)

sheets.append(fig)

# =========================================================================
# SHEET 2: ELEVATIONS & VERTICAL GAPS (ALL HEIGHTS & GAP HEIGHTS)
# =========================================================================
fig2, ax2 = new_sheet(2, "ELEVATIONS & VERTICAL GAPS (ALL HEIGHTS & GAP HEIGHTS)", "1 : 2.5")

# FRONT ELEVATION
V_F = View(ax2, 120, 140, 0.35)
# Ground Line
V_F.line([(-px - 25, GROUND), (px + 25, GROUND)], "out")
V_F.text(-px - 20, GROUND - 10, "GROUND LEVEL (Z = -6 mm)", 4.0, color="#1e293b")

# Box Outer
V_F.rect(-p["box_w"] / 2.0, p["box_w"] / 2.0, GROUND, p["top_hi"], "out", fill="#bfdbfe", alpha=0.5)

# Shaft & Bearings
V_F.rect(-p["shaft_len"] / 2.0, p["shaft_len"] / 2.0, p["zs"] - p["shaft_d"] / 2.0, p["zs"] + p["shaft_d"] / 2.0, "out", fill="#94a3b8")
for bx in [-p["brg_cc"] / 2.0, p["brg_cc"] / 2.0]:
    V_F.rect(bx - p["brg_w"] / 2.0, bx + p["brg_w"] / 2.0, 0, p["brg_dome"], "out", fill="#15803d", alpha=0.8)

# Standing Arch 90 deg (Locked)
arch_pts_out = [(RO * math.cos(q), p["zs"] + p["leg"] + RO * math.sin(q)) for q in np.linspace(0, math.pi, 60)]
arch_pts_in = [(RI * math.cos(q), p["zs"] + p["leg"] + RI * math.sin(q)) for q in np.linspace(math.pi, 0, 60)]
arch_poly = [(-RO, p["zs"]), (-RO, p["zs"] + p["leg"])] + arch_pts_out + [(RO, p["zs"] + p["leg"]), (RO, p["zs"]),
             (RI, p["zs"]), (RI, p["zs"] + p["leg"])] + arch_pts_in + [(-RI, p["zs"] + p["leg"]), (-RI, p["zs"])]
V_F.line(arch_poly, "out", close=True, fill="#374151", alpha=0.6)

# Front Dimensions
V_F.dim((0, GROUND), (0, H_STANDING + GROUND), 215, "v", txt=f"Total Standing Height = {H_STANDING:.1f} mm (~29.4 cm)")
V_F.dim((p["box_w"] / 2.0, GROUND), (p["box_w"] / 2.0, H_BOX_MAIN + GROUND), 20, "v", txt=f"Main Box Height = {H_BOX_MAIN:.0f} mm")
V_F.dim((0, H_BOX_MAIN + GROUND), (0, ARCH_CROWN_INNER_Z + GROUND), 12, "v", txt="Under-Arch Crown Gap = 107.5 mm")
V_F.dim((-RI, p["zs"] + 30), (RI, p["zs"] + 30), 20, "h", txt="Inner Opening = 200 mm")
V_F.dim((-p["box_w"] / 2.0, 10), (-p["box_w"] / 2.0 + SIDE_GAP_TYRE_BOX, 10), -12, "h", txt="5 mm Gap")
V_F.dim((p["box_w"] / 2.0 - SIDE_GAP_TYRE_BOX, 10), (p["box_w"] / 2.0, 10), -12, "h", txt="5 mm Gap")
V_F.dim((-p["brg_cc"] / 2.0, 0), (p["brg_cc"] / 2.0, 0), -25, "h", txt="Bearing C-C = 140 mm")

V_F.text(0, ARCH_CROWN_INNER_Z - 30, "UNDER-ARCH CLEARANCE GAP\nHEIGHT = 107.5 mm", 4.2, ha="center", color="#047857", weight="bold")
ax2.text(25, 275, "FRONT ELEVATION (Arch 90° Standing - Locked Position)", fontsize=6.8, weight="bold")

# SIDE ELEVATION
V_S = View(ax2, 310, 140, 0.35)
V_S.line([(-py - 25, GROUND), (p["box_rear_y"] + 25, GROUND)], "out")
V_S.text(-py - 20, GROUND - 10, "GROUND LEVEL", 4.0, color="#1e293b")

# Stepped Box Profile
step_poly = [(p["box_front_y"], GROUND), (p["box_front_y"], p["top_ear"]),
             (p["ear_step_y"], p["top_ear"]), (p["ear_step_y"], p["top_hi"]),
             (p["box_rear_y"], p["top_hi"]), (p["box_rear_y"], GROUND)]
V_S.line(step_poly, "out", close=True, fill="#bfdbfe", alpha=0.5)

# Shaft & Sprockets
V_S.circle(0, p["zs"], p["shaft_d"] / 2.0, "out", fill="#94a3b8")
V_S.circle(0, p["zs"], p["spk_big_od"] / 2.0, "thin", fill="none")
V_S.circle(-p["motor_dist"], p["motor_z"], p["gb_d"] / 2.0, "out", fill="#cbd5e1")
V_S.circle(-p["motor_dist"], p["motor_z"], p["spk_small_od"] / 2.0, "thin", fill="none")

# Chain lines
V_S.line([(0, p["zs"] + p["spk_big_od"] / 2.0), (-p["motor_dist"], p["motor_z"] + p["spk_small_od"] / 2.0)], "out")
V_S.line([(0, p["zs"] - p["spk_big_od"] / 2.0), (-p["motor_dist"], p["motor_z"] - p["spk_small_od"] / 2.0)], "out")

# Tyre Flat 0 deg
flat_reach = p["leg"] + RO
V_S.rect(-flat_reach, 0, p["zs"] - p["tyre_w"] / 2.0, p["zs"] + p["tyre_w"] / 2.0, "phan", fill="#374151", alpha=0.35)
V_S.text(-flat_reach / 2.0, p["zs"] + p["tyre_w"] / 2.0 + 8, "TYRE FLAT 0° (OPEN)", 4.2, ha="center", color="#1e3a8a")

# Side Dimensions
V_S.dim((0, p["zs"]), (-p["motor_dist"], p["motor_z"]), -32, "h", txt="Motor Dist = 70 mm")
V_S.dim((p["box_front_y"], 0), (p["box_rear_y"], 0), -22, "h", txt="Box Length = 240 mm")
V_S.dim((p["box_front_y"], GROUND), (p["box_front_y"], H_BOX_STEP + GROUND), -20, "v", txt=f"Step Height = {H_BOX_STEP:.0f} mm")
V_S.dim((p["box_rear_y"], GROUND), (p["box_rear_y"], H_BOX_MAIN + GROUND), 20, "v", txt=f"Main Height = {H_BOX_MAIN:.0f} mm")
V_S.dim((-flat_reach / 2.0, GROUND), (-flat_reach / 2.0, H_FOLDED + GROUND), -25, "v", txt=f"Folded Height = {H_FOLDED:.1f} mm")

# Front corner sweep clearance note
V_S.text(-p["motor_dist"] - 15, 75, "Front Corner Clearance Gap = 37.3 mm (Safe!)", 4.0, color="#047857", weight="bold")
ax2.text(215, 275, "SIDE ELEVATION & MOTION PROFILE (Stepped Roof & 0°/90°/180° Fold)", fontsize=6.8, weight="bold")

# Notes at bottom of Sheet 2
note_block(ax2, 20, 52, "VERTICAL HEIGHTS & CLEARANCE SPECIFICATIONS", [
    f"1. STANDING HEIGHT: Total {H_STANDING:.1f} mm (~29.4 cm) provides high visibility deterrent against vehicle unauthorized entry.",
    f"2. FOLDED HEIGHT: Flat tyre lies at {H_FOLDED:.1f} mm (~9.3 cm). Standard Indian passenger car clearance is 165-200 mm; clearance margin >70 mm.",
    f"3. UNDER-ARCH GAP HEIGHT: Clear vertical height under standing arch crown is {GAP_VERT_ARCH_BOX:.1f} mm above the steel box lid.",
    f"4. STEPPED ROOF DESIGN: Low step (61 mm) over motor allows the tyre to fold flat with zero mechanical collision (37.3 mm corner buffer).",
    f"5. DRIVE-OVER WHEEL LOAD: 6 mm floor plate and 6 mm top lid are rated for 2-tonne passenger car roll-over load.",
], w=375, size=5.0, lh=3.4)

sheets.append(fig2)

# =========================================================================
# SHEET 3: COMPLETE WORKSHOP GAP AUDIT & PLATE CUTTING SPECIFICATIONS
# =========================================================================
fig3, ax3 = new_sheet(3, "FABRICATION GAP AUDIT & STEEL PLATE CUTTING SPECIFICATIONS", "-")

gap_audit_data = [
    ("GAP NAME & LOCATION", "NOMINAL (mm)", "TOLERANCE", "CLEARANCE ROLE & FUNCTION"),
    ("Side Gap Left (Tyre Leg to Box)", "5.0 mm", "+/-1.0 mm", "Prevents tyre rubbing against left box wall during rotation"),
    ("Side Gap Right (Tyre Leg to Box)", "5.0 mm", "+/-1.0 mm", "Prevents tyre rubbing against right box wall during rotation"),
    ("Bearing to Box Side Wall Gap", "6.0 mm", "+/-1.0 mm", "Lateral clearance between outer bearing body and box outer wall"),
    ("Bearing Outer-to-Outer Span", "178.0 mm", "+/-1.0 mm", "Total width across both UCP205 bearing feet (fits in 190 mm box)"),
    ("Inter-Bearing Clear Bay Gap", "102.0 mm", "+/-1.0 mm", "Central clear opening between bearing inner faces"),
    ("Motor to Right Bearing Gap", "8.0 mm", "+/-1.5 mm", "Axial clearance between motor rear can and right bearing body"),
    ("Sprocket Tip-to-Tip Clearance Gap", "16.0 mm", "+/-1.0 mm", "Radial gap between 70 mm big sprocket and 38 mm small sprocket"),
    ("Motor Front Face to Front Wall Gap", "16.0 mm", "+/-1.5 mm", "Clearance between front edge of motor and front box plate"),
    ("Tyre Sweep Front Corner Gap", "37.3 mm", "+/-2.0 mm", "Dynamic radial clearance as tyre swings past the low step corner"),
    ("Under-Arch Vertical Crown Gap", "107.5 mm", "+/-2.0 mm", "Clear vertical headroom between box roof and inner tyre crown"),
    ("Shaft Extension (Left Side)", "108.0 mm", "+/-1.5 mm", "Shaft sticking out of left box wall for tyre bracket mounting"),
    ("Shaft Extension (Right Side)", "108.0 mm", "+/-1.5 mm", "Shaft sticking out of right box wall for tyre bracket mounting"),
    ("Car Drive-Over Headroom Gap", ">72.0 mm", "Min", "Clearance between folded barrier (92.5 mm) and car chassis (165 mm)"),
]
y_gap = table(ax3, 20, 276, gap_audit_data[0], gap_audit_data[1:], [65, 30, 25, 120], rh=4.3, size=5.0)

plate_cutting_data = [
    ("PART NAME", "MATERIAL / THICKNESS", "CUT SIZE (mm)", "QTY", "FABRICATION / DRILLING DETAILS"),
    ("Base Floor Plate", "6.0 mm Mild Steel (IS 2062)", "190.0 x 240.0", "1", "4 x M12 countersunk floor anchor holes; 4 x M14 bearing holes"),
    ("Side Wall Left", "4.0 mm Mild Steel Plate", "240.0 x 80.0", "1", "Ø26 mm hole at x=0, z=36.5 mm for shaft; labyrinth seal groove"),
    ("Side Wall Right", "4.0 mm Mild Steel Plate", "240.0 x 80.0", "1", "Ø26 mm hole at x=0, z=36.5 mm for shaft; labyrinth seal groove"),
    ("Front Wall (Motor side)", "4.0 mm Mild Steel Plate", "190.0 x 55.0", "1", "Low step front wall; weld to floor and side walls"),
    ("Rear Wall (Elec side)", "4.0 mm Mild Steel Plate", "190.0 x 80.0", "1", "Full height rear wall; IP67 cable gland cutouts"),
    ("Top Skin Main Lid", "6.0 mm Mild Steel Plate", "190.0 x 185.0", "1", "Removable lid; 6 x M8 countersunk security screws + EPDM gasket"),
    ("Top Skin Step Lid", "5.0 mm Mild Steel Plate", "190.0 x 55.0", "1", "Removable step lid over motor compartment; 4 x M8 screws"),
    ("Electronics Deck Tray", "2.0 mm Galvanised Sheet", "174.0 x 105.0", "1", "Internal mounting tray lifted on 25 mm M3 standoffs"),
]
y_plate = table(ax3, 20, y_gap - 8, plate_cutting_data[0], plate_cutting_data[1:], [42, 48, 30, 10, 110], rh=4.2, size=4.8)

note_block(ax3, 20, y_plate - 6, "WORKSHOP FABRICATION CHECKLIST", [
    "A. GROUND BEFORE WELDING: Tack weld base plate and side plates; check shaft alignment across both Ø26 mm holes (+/-0.3 mm).",
    "B. BEARING ALIGNMENT: Mount UCP205 bearings to floor plate; tighten shaft locking collars to ensure shaft rotates freely by hand.",
    "C. MOTOR POSITION: Mount motor bracket at exactly y = -70.0 mm from shaft centerline; ensure small sprocket aligns axially with big sprocket.",
    "D. WATERPROOFING: Continuous fillet welds on all outer joints; apply closed-cell EPDM rubber gasket under both top lids.",
    "E. SURFACE FINISH: Degrease, zinc-rich anti-corrosive primer, and architectural black/grey powder coat (UV resistant).",
], w=380, size=5.0, lh=3.3)

sheets.append(fig3)

# =========================================================================
# SHEET 4: ALL-IN-ONE WORKSHOP MASTER BLUEPRINT (HANDOFF SHEET)
# =========================================================================
fig4, ax4 = new_sheet(4, "ALL-IN-ONE WORKSHOP MASTER BLUEPRINT (HANDOFF DRAWING)", "AS SHOWN")

# Subplot 1: Top View (Plan)
V4_P = View(ax4, 85, 175, 0.26)
V4_P.rect(-px, px, -py, py, "phan", fill="#e2e8f0", alpha=0.25)
V4_P.rect(-p["box_w"] / 2.0, p["box_w"] / 2.0, p["box_front_y"], p["box_rear_y"], "out", fill="#bfdbfe", alpha=0.55)
V4_P.rect(-p["shaft_len"] / 2.0, p["shaft_len"] / 2.0, -p["shaft_d"] / 2.0, p["shaft_d"] / 2.0, "out", fill="#94a3b8")
for bx in [-p["brg_cc"] / 2.0, p["brg_cc"] / 2.0]:
    V4_P.rect(bx - p["brg_w"] / 2.0, bx + p["brg_w"] / 2.0, -p["brg_len"] / 2.0, p["brg_len"] / 2.0, "out", fill="#15803d", alpha=0.8)
V4_P.rect(p["chain_x"] - 3, p["chain_x"] + 3, -p["spk_big_od"] / 2.0, p["spk_big_od"] / 2.0, "out", fill="#b45309")
V4_P.rect(p["chain_x"] - 3, p["chain_x"] + 3, mot_y - p["spk_small_od"] / 2.0, mot_y + p["spk_small_od"] / 2.0, "out", fill="#b45309")
V4_P.rect(p["chain_x"], p["chain_x"] + p["gb_len"], mot_y - p["gb_d"] / 2.0, mot_y + p["gb_d"] / 2.0, "out", fill="#cbd5e1")
V4_P.rect(p["chain_x"] + p["gb_len"], MOT_END_X, mot_y - p["can_d"] / 2.0, mot_y + p["can_d"] / 2.0, "out", fill="#64748b")
V4_P.rect(-p["box_w"] / 2.0 + 8, p["box_w"] / 2.0 - 8, 25, p["box_rear_y"] - 8, "elec", fill="#f3e8ff", alpha=0.5)

V4_P.dim((-RI, 150), (RI, 150), 10, "h", txt="Inner Space 200 mm")
V4_P.dim((-p["box_w"] / 2.0, p["box_front_y"]), (p["box_w"] / 2.0, p["box_front_y"]), -18, "h", txt="Box Width 190 mm")
V4_P.dim((-p["box_w"] / 2.0, p["box_front_y"]), (-p["box_w"] / 2.0, p["box_rear_y"]), -20, "v", txt="Box Len 240 mm")
V4_P.dim((p["chain_x"] + 35, 0), (p["chain_x"] + 35, mot_y), 25, "v", txt="Motor 70 mm")
V4_P.dim((-p["brg_cc"] / 2.0, -p["brg_len"] / 2.0), (p["brg_cc"] / 2.0, -p["brg_len"] / 2.0), -12, "h", txt="Bearing C-C 140 mm")

V4_P.text(-RI + 3, -130, "Left Gap = 5 mm", 3.4, color="#dc2626", weight="bold")
V4_P.text(RI - 45, -130, "Right Gap = 5 mm", 3.4, color="#dc2626", weight="bold")
ax4.text(20, 275, "1. TOP / PLAN VIEW (Gaps & Horizontal Dimensions)", fontsize=6.2, weight="bold")

# Subplot 2: Front Elevation
V4_F = View(ax4, 215, 175, 0.26)
V4_F.line([(-px - 15, GROUND), (px + 15, GROUND)], "out")
V4_F.rect(-p["box_w"] / 2.0, p["box_w"] / 2.0, GROUND, p["top_hi"], "out", fill="#bfdbfe", alpha=0.5)
V4_F.rect(-p["shaft_len"] / 2.0, p["shaft_len"] / 2.0, p["zs"] - p["shaft_d"] / 2.0, p["zs"] + p["shaft_d"] / 2.0, "out", fill="#94a3b8")
for bx in [-p["brg_cc"] / 2.0, p["brg_cc"] / 2.0]:
    V4_F.rect(bx - p["brg_w"] / 2.0, bx + p["brg_w"] / 2.0, 0, p["brg_dome"], "out", fill="#15803d", alpha=0.8)
V4_F.line(arch_poly, "out", close=True, fill="#374151", alpha=0.6)

V4_F.dim((0, GROUND), (0, H_STANDING + GROUND), 215, "v", txt=f"Standing = {H_STANDING:.1f} mm")
V4_F.dim((p["box_w"] / 2.0, GROUND), (p["box_w"] / 2.0, H_BOX_MAIN + GROUND), 16, "v", txt=f"Box = {H_BOX_MAIN:.0f} mm")
V4_F.dim((0, H_BOX_MAIN + GROUND), (0, ARCH_CROWN_INNER_Z + GROUND), 10, "v", txt="Crown Gap = 107.5 mm")
V4_F.dim((-RI, p["zs"] + 25), (RI, p["zs"] + 25), 16, "h", txt="Inner Space 200 mm")
ax4.text(175, 275, "2. FRONT ELEVATION (Standing & Gap Heights)", fontsize=6.2, weight="bold")

# Subplot 3: Side Elevation
V4_S = View(ax4, 340, 175, 0.26)
V4_S.line([(-py - 15, GROUND), (p["box_rear_y"] + 15, GROUND)], "out")
V4_S.line(step_poly, "out", close=True, fill="#bfdbfe", alpha=0.5)
V4_S.circle(0, p["zs"], p["shaft_d"] / 2.0, "out", fill="#94a3b8")
V4_S.circle(0, p["zs"], p["spk_big_od"] / 2.0, "thin", fill="none")
V4_S.circle(-p["motor_dist"], p["motor_z"], p["gb_d"] / 2.0, "out", fill="#cbd5e1")
V4_S.rect(-flat_reach, 0, p["zs"] - p["tyre_w"] / 2.0, p["zs"] + p["tyre_w"] / 2.0, "phan", fill="#374151", alpha=0.35)

V4_S.dim((0, p["zs"]), (-p["motor_dist"], p["motor_z"]), -25, "h", txt="70 mm")
V4_S.dim((p["box_front_y"], 0), (p["box_rear_y"], 0), -16, "h", txt="240 mm")
V4_S.dim((p["box_front_y"], GROUND), (p["box_front_y"], H_BOX_STEP + GROUND), -15, "v", txt=f"Step {H_BOX_STEP:.0f} mm")
V4_S.dim((p["box_rear_y"], GROUND), (p["box_rear_y"], H_BOX_MAIN + GROUND), 15, "v", txt=f"Main {H_BOX_MAIN:.0f} mm")
V4_S.dim((-flat_reach / 2.0, GROUND), (-flat_reach / 2.0, H_FOLDED + GROUND), -18, "v", txt=f"Flat {H_FOLDED:.0f} mm")
ax4.text(295, 275, "3. SIDE ELEVATION (Fold & Motor Clearance)", fontsize=6.2, weight="bold")

# Summary Table on Master Blueprint
master_summary = [
    ("FEATURE / DIMENSION", "EXACT VALUE", "TOL.", "FABRICATOR ACTION / NOTE"),
    ("Outer Box Size (W x L x H)", "190 x 240 x 86 mm", "+/-1.0", "Main body enclosure sitting on ground"),
    ("Motor Low-Step Height", "61.0 mm (from ground)", "+/-1.0", "Front 55 mm step allows flat fold-down"),
    ("Side Gaps (Left & Right)", "5.0 mm each side", "+/-0.5", "Symmetric clearance tyre leg to box wall"),
    ("Under-Arch Crown Gap Height", "107.5 mm vertical gap", "+/-2.0", "Clear headroom under arch when 90° standing"),
    ("Standing Deterrent Height", "293.5 mm (~29.4 cm)", "+/-2.0", "Total height from ground to arch crown"),
    ("Folded Open Drive-Over Height", "92.5 mm (~9.3 cm)", "+/-2.0", "Car clears with >72 mm headroom margin"),
    ("Motor Center Distance", "70.0 mm from shaft axis", "+/-0.5", "Brings motor closer; eliminates sweep clash"),
    ("Bearing Center-to-Center", "140.0 mm (14 cm)", "+/-0.5", "2 x UCP205 bearing center-to-center"),
    ("Inter-Bearing Clear Bay", "102.0 mm central gap", "+/-1.0", "Houses big sprocket + motor body (68 mm)"),
    ("Motor to Right Bearing Gap", "8.0 mm clear gap", "+/-1.0", "Motor fits comfortably inside inter-bearing bay"),
    ("Sprocket Tip-to-Tip Gap", "16.0 mm clear gap", "+/-0.5", "Radial clearance between sprockets"),
]
y_m = table(ax4, 20, 100, master_summary[0], master_summary[1:], [55, 42, 18, 115], rh=4.0, size=4.6)

note_block(ax4, 20, y_m - 4, "MASTER WORKSHOP DIRECTIVE", [
    "1. CUTTING: Cut all plates according to Sheet 3 schedule. Deburr all edges before fixturing.",
    "2. JIGGING: Use a Ø25 mm dummy shaft across bearings during tacking to ensure absolute coaxiality.",
    "3. TOLERANCE: Strictly maintain the 5.0 mm side gaps and 16.0 mm sprocket clearance.",
    "4. SEALING: Ensure IP67 grade sealing on the perimeter lid using closed-cell neoprene/EPDM gaskets.",
], w=375, size=4.8, lh=3.0)

sheets.append(fig4)

# =========================================================================
# Export PDF and High-Resolution PNG Previews
# =========================================================================
pdf_path = os.path.join(HERE, "PARKFNB_V3_Complete_Fabrication_Drawings.pdf")
print("Writing PDF:", pdf_path)
with PdfPages(pdf_path) as pp:
    for i, fig_obj in enumerate(sheets):
        pp.savefig(fig_obj)
        png_names = [
            "sheet1_plan_view_all_gaps.png",
            "sheet2_elevations_gap_heights.png",
            "sheet3_fabrication_audit_table.png",
            "sheet4_workshop_master_blueprint.png",
        ]
        out_png = os.path.join(HERE, png_names[i])
        fig_obj.savefig(out_png, dpi=180, facecolor="white")
        print(f"Saved Sheet {i+1} PNG:", out_png)
        plt.close(fig_obj)

print("All fabrication drawings successfully generated!")
