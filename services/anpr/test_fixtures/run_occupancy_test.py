"""
Repeatable occupancy tests against fixed venue photos + hand-verified bay
polygons, instead of re-drawing bays in the browser UI every time.

    python test_fixtures/run_occupancy_test.py                  # run all *_bays*.json fixtures
    python test_fixtures/run_occupancy_test.py venue_4car_bays  # run one fixture by stem

Each fixture is a JSON file: {"image": "<file next to it>", "bays": {...},
"expected_states": {"Bay-x": "correct", ...}}  (expected_states is optional --
omit it while first calibrating a fixture, add it once you've eyeballed the
annotated result and confirmed it's right).

Writes "<fixture-name>_result.jpg" next to each fixture so the footprint
shape can be checked visually, and exits non-zero if any expectation fails.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cv2

from detector import get_detector
from occupancy import BayMap, Detection, ParkingIntelligenceEngine, annotate
from segmenter import get_segmenter

HERE = Path(__file__).parent
DEFAULT_IMAGE = "venue_4car.jpg"


def run_fixture(fixture_path: Path, det) -> bool:
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    image_path = HERE / fixture.get("image", DEFAULT_IMAGE)
    frame = cv2.imread(str(image_path))
    if frame is None:
        print(f"[{fixture_path.name}] SKIP -- could not read {image_path}")
        return True

    bm = BayMap(fixture["bays"], view=fixture.get("view", "medium"))

    joint = det.detect_joint(frame, conf=0.15, imgsz=1280)
    dets = []
    for idx, r in enumerate(joint.vehicles):
        d = Detection(*r)
        d.plate = joint.vehicle_plates.get(idx, "")
        d.orientation_degrees = joint.vehicle_orientations.get(idx, 0.0)
        d.orientation_confidence = joint.vehicle_confidences.get(idx, 0.0)
        dets.append(d)

    seg = get_segmenter()
    attached = seg.attach(frame, dets, fixture_path.stem)

    engine = ParkingIntelligenceEngine(bm)
    states = engine.update(dets, image_size=(frame.shape[1], frame.shape[0]))

    print(f"\n=== {fixture_path.name} ({len(dets)} vehicles, {len(states)} bays) ===")
    if seg.available:
        print(f"segmentation: {attached}/{len(dets)} vehicles have a silhouette")
    else:
        print(f"segmentation: OFF ({seg.last_error or 'no weights at ' + str(seg.weights)}) "
              f"-- verdicts use the legacy box-slice estimate")
    expected = fixture.get("expected_states", {})
    ok = True
    for bid, s in states.items():
        exp = expected.get(bid)
        mark = ""
        if exp is not None:
            match = s.state == exp
            ok = ok and match
            mark = "  OK" if match else f"  FAIL (expected {exp})"
        print(f"{bid:20s} {s.state.upper():10s} [{s.geometry_source}] "
              f"crossing={s.line_crossing_m:.2f}m (possible {s.line_crossing_possible_m:.2f}m) "
              f"skew={s.skew_deg} plate={s.plate or '-'}{mark}")
        if s.reason:
            print(f"                     reason: {s.reason}")
        if s.reason_codes:
            print(f"                     codes:  {', '.join(s.reason_codes)}")

    out_image = HERE / f"{fixture_path.stem}_result.jpg"
    img = annotate(frame, bm, states, dets)
    cv2.imwrite(str(out_image), img)
    print(f"annotated result: {out_image}")
    return ok


def main():
    det = get_detector()

    if len(sys.argv) > 1:
        stems = sys.argv[1:]
        fixtures = []
        for s in stems:
            p = Path(s)
            if p.is_file():
                fixtures.append(p)
            elif (HERE / s).is_file():
                fixtures.append(HERE / s)
            elif (HERE / f"{s}.json").is_file():
                fixtures.append(HERE / f"{s}.json")
            else:
                fixtures.append(HERE / s)
    else:
        fixtures = sorted(HERE.glob("*_bays*.json"))

    if not fixtures:
        raise SystemExit("no fixture JSON files found (expected test_fixtures/*_bays*.json)")

    all_ok = True
    for f in fixtures:
        all_ok = run_fixture(f, det) and all_ok

    print()
    if all_ok:
        print("ALL FIXTURES PASSED")
    else:
        print("SOME FIXTURES FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
