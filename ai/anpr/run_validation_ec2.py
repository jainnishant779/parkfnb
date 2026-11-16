import json
import sys
from pathlib import Path

sys.path.insert(0, "/opt/parkfnb-anpr")
from calibration import fit_site_calibration
from contact import VEHICLE_HEIGHT_PRIOR_M

with open("/opt/parkfnb-anpr/parkfnb_phone-1_bays_mapped.json") as f:
    cfg = json.load(f)

cal = fit_site_calibration(cfg["bays"], tuple(cfg["frame_size"]))

print("Method:", cal.method)
print("Focal length:", round(cal.camera.focal_px, 1), "px")
print("Height:", round(cal.camera.height_m, 2), "m")
print("Pitch:", round(cal.camera.pitch_deg, 2), "deg")
print("Roll:", round(cal.camera.roll_deg, 2), "deg")

good_bays = [bid for bid, b in cal.bays.items() if b.status == "good"]
print(f"Good bays ({len(good_bays)}/7):", good_bays)
assert len(good_bays) >= 2, "Safety gate failed!"
print("Safety gate check: PASSED (>= 2 good bays)")

# Test 3D cuboid projection
for bid in ("Bay-01", "Bay-02", "Bay-03", "Bay-04"):
    pts = cal.bays[bid].frame.corners
    base = cal.project_stall(bid, [[0, 0], [2.5, 0], [2.5, 5.0], [0, 5.0]], z=0.0)
    roof = cal.project_stall(bid, [[0, 0], [2.5, 0], [2.5, 5.0], [0, 5.0]], z=VEHICLE_HEIGHT_PRIOR_M)
    assert base is not None and roof is not None
print("3D extrusion test on EC2: PASSED")
