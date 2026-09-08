# ============================================================
# PARKING SPACE OPTIMIZER — LOCAL WEB APP (v3)
# Run:  python app.py   ->  http://localhost:5000
# Adds: SQLite project save/load, PDF report, DXF export,
#       waitress production server.
# ============================================================
import io
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify, request, send_file, send_from_directory

from optimizer import optimize

app = Flask(__name__, static_folder="static")
DB_PATH = Path(__file__).parent / "projects.db"

SLOT_COLORS = {
    "standard": "#2563eb", "accessible": "#0ea5e9", "transfer": "#93c5fd",
    "ev": "#16a34a", "island": "#15803d",
}


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS projects ("
        " id INTEGER PRIMARY KEY,"
        " name TEXT UNIQUE NOT NULL,"
        " data TEXT NOT NULL,"
        " updated TEXT NOT NULL)"
    )
    return conn


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/api/optimize", methods=["POST"])
def api_optimize():
    payload = request.get_json(force=True)
    try:
        result = optimize(
            payload.get("boundary", []),
            payload.get("obstacles", []),
            options=payload.get("options") or {},
        )
        return jsonify({"ok": True, "result": result})
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": f"Internal error: {e}"}), 500


# ------------------------------------------------------------
# PROJECTS (save / load)
# ------------------------------------------------------------
@app.route("/api/projects", methods=["GET"])
def list_projects():
    with db() as conn:
        rows = conn.execute(
            "SELECT id, name, updated FROM projects ORDER BY updated DESC"
        ).fetchall()
    return jsonify({"ok": True, "projects": [
        {"id": r[0], "name": r[1], "updated": r[2]} for r in rows
    ]})


@app.route("/api/projects", methods=["POST"])
def save_project():
    payload = request.get_json(force=True)
    name = (payload.get("name") or "").strip()
    data = payload.get("data")
    if not name or data is None:
        return jsonify({"ok": False, "error": "name and data required"}), 400
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with db() as conn:
        conn.execute(
            "INSERT INTO projects(name, data, updated) VALUES(?,?,?) "
            "ON CONFLICT(name) DO UPDATE SET data=excluded.data, "
            "updated=excluded.updated",
            (name, json.dumps(data), now),
        )
    return jsonify({"ok": True, "name": name})


@app.route("/api/projects/<int:pid>", methods=["GET"])
def load_project(pid):
    with db() as conn:
        row = conn.execute(
            "SELECT name, data FROM projects WHERE id=?", (pid,)
        ).fetchone()
    if not row:
        return jsonify({"ok": False, "error": "not found"}), 404
    return jsonify({"ok": True, "name": row[0], "data": json.loads(row[1])})


@app.route("/api/projects/<int:pid>", methods=["DELETE"])
def delete_project(pid):
    with db() as conn:
        conn.execute("DELETE FROM projects WHERE id=?", (pid,))
    return jsonify({"ok": True})


# ------------------------------------------------------------
# EXPORTS — shared helpers
# ------------------------------------------------------------
def paths_to_utm(result):
    """Re-project the result's lat/lng paths into UTM metres."""
    from pyproj import Transformer

    epsg = result["stats"]["epsg"]
    tr = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)

    def ring(path):
        return [tr.transform(p["lng"], p["lat"]) for p in path]

    def pt(p):
        return tr.transform(p["lng"], p["lat"])

    out = {
        "site": ring(result["site"]),
        "obstacles": [ring(p) for p in result["obstacles"]],
        "aisles": [ring(p) for p in result["aisles"]],
        "spine": [ring(p) for p in result["spine"]],
        "slots": [
            {"type": s["type"], "id": s.get("id"),
             "ring": ring(s["path"]), "center": pt(s["center"])}
            for s in result["slots"]
        ],
        "entry": pt(result["entry"]),
        "exit": pt(result["exit"]) if result.get("exit") else None,
    }
    xs = [x for x, _ in out["site"]]
    ys = [y for _, y in out["site"]]
    out["origin"] = (min(xs), min(ys))
    return out


# ------------------------------------------------------------
# PDF REPORT
# ------------------------------------------------------------
@app.route("/api/report", methods=["POST"])
def api_report():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages

    payload = request.get_json(force=True)
    result = payload.get("result")
    revenue = payload.get("revenue") or {}
    project = payload.get("project_name") or "Parking Layout"
    if not result:
        return jsonify({"ok": False, "error": "result required"}), 400

    g = paths_to_utm(result)
    ox, oy = g["origin"]
    st = result["stats"]

    buf = io.BytesIO()
    with PdfPages(buf) as pdf:
        # ---- page 1: site plan ----
        fig, ax = plt.subplots(figsize=(11.69, 8.27))  # A4 landscape
        sx = [x - ox for x, _ in g["site"]]
        sy = [y - oy for _, y in g["site"]]
        ax.fill(sx, sy, color="#dcfce7", alpha=.4, zorder=0)
        ax.plot(sx, sy, color="#16a34a", lw=2.5, zorder=5)
        for r in g["spine"]:
            ax.fill([x - ox for x, _ in r], [y - oy for _, y in r],
                    color="#9333ea", alpha=.2, zorder=1)
        for r in g["aisles"]:
            ax.plot([x - ox for x, _ in r], [y - oy for _, y in r],
                    color="#ca8a04", lw=1, ls="--", zorder=2)
        for s in g["slots"]:
            xs_ = [x - ox for x, _ in s["ring"]]
            ys_ = [y - oy for _, y in s["ring"]]
            ax.fill(xs_, ys_, color=SLOT_COLORS.get(s["type"], "#2563eb"),
                    alpha=.55, zorder=3)
            ax.plot(xs_, ys_, color="#1e3a8a", lw=.4, zorder=4)
            if s["id"]:
                cx, cy = s["center"]
                ax.text(cx - ox, cy - oy, str(s["id"]), fontsize=5,
                        ha="center", va="center", zorder=6)
        for r in g["obstacles"]:
            ax.fill([x - ox for x, _ in r], [y - oy for _, y in r],
                    color="#ea580c", alpha=.5, zorder=4)
        ex, ey = g["entry"]
        ax.plot(ex - ox, ey - oy, marker="o", ms=12, color="#f59e0b",
                mec="black", zorder=7)
        ax.annotate("ENTRY", (ex - ox, ey - oy), textcoords="offset points",
                    xytext=(8, 8), fontsize=9, fontweight="bold")
        if g["exit"]:
            xx, xy = g["exit"]
            ax.plot(xx - ox, xy - oy, marker="o", ms=12, color="#f87171",
                    mec="black", zorder=7)
            ax.annotate("EXIT", (xx - ox, xy - oy),
                        textcoords="offset points", xytext=(8, 8),
                        fontsize=9, fontweight="bold")
        ax.set_title(
            f"{project} — {st['n_slots']} stalls @ {st['angle']:.0f}°",
            fontsize=15, fontweight="bold")
        ax.set_xlabel("metres")
        ax.set_ylabel("metres")
        ax.set_aspect("equal")
        ax.grid(alpha=.25)
        pdf.savefig(fig)
        plt.close(fig)

        # ---- page 2: stats ----
        fig, ax = plt.subplots(figsize=(8.27, 11.69))  # A4 portrait
        ax.axis("off")
        lines = [
            ("PARKING LAYOUT REPORT", ""),
            (f"Project: {project}", ""),
            (f"Generated: {datetime.now().strftime('%d %b %Y %H:%M')}", ""),
            ("", ""),
            ("Rule pack", st.get("rule_pack", "-")),
            ("Total stalls", str(st["n_slots"])),
            ("  standard", str(st["n_standard"])),
            ("  accessible", str(st["n_accessible"])),
            ("  EV", str(st["n_ev"])),
            ("Transfer bays / islands",
             f"{st['n_transfer']} / {st['n_islands']}"),
            ("Stall size", f"{st['slot_width_m']} x {st['slot_length_m']} m"),
            ("Parking angle", f"{st['angle']:.1f} deg"),
            ("Circulation",
             f"{st['circulation'].replace('_', '-')}, {st['access_mode']} access"),
            ("Aisle width", f"{st['aisle_width_m']} m"),
            ("Turning check", st.get("turning_check", "-")),
            ("Plot area", f"{st['plot_area_m2']} m2"),
            ("Obstacle area", f"{st['obstacle_area_m2']} m2"),
            ("Usable area", f"{st['usable_area_m2']} m2"),
            ("Area per stall", f"{st['area_per_slot_m2']} m2 "
             f"(benchmark {st['benchmark_m2'][0]}-{st['benchmark_m2'][1]})"),
            ("ECS upper bound", str(st["ecs_upper_bound"])),
        ]
        if revenue.get("monthly"):
            lines += [
                ("", ""),
                ("REVENUE ESTIMATE", ""),
                ("Monthly", f"Rs {revenue['monthly']:,.0f}"),
                ("Yearly", f"Rs {revenue['monthly'] * 12:,.0f}"),
                ("Assumptions", revenue.get("assumptions", "")),
            ]
        y = 0.96
        for label, value in lines:
            if label and not value:
                ax.text(0.05, y, label, fontsize=13, fontweight="bold",
                        transform=ax.transAxes)
            elif label:
                ax.text(0.07, y, label, fontsize=10, transform=ax.transAxes)
                ax.text(0.60, y, value, fontsize=10, fontweight="bold",
                        transform=ax.transAxes)
            y -= 0.028
        for i, w in enumerate(result.get("warnings", [])):
            ax.text(0.05, y - 0.01 - i * 0.025, "! " + w, fontsize=8.5,
                    color="#b45309", transform=ax.transAxes)
        ax.text(0.05, 0.04,
                "DISCLAIMER: Concept plan generated from user-marked satellite\n"
                "imagery (georeferencing accuracy typically +/-1-3 m). Dimensions\n"
                "follow published standards but are NOT a substitute for a site\n"
                "survey or local-authority approval.",
                fontsize=8, color="#666", transform=ax.transAxes)
        pdf.savefig(fig)
        plt.close(fig)

    buf.seek(0)
    return send_file(buf, mimetype="application/pdf", as_attachment=True,
                     download_name="parking_report.pdf")


# ------------------------------------------------------------
# DXF EXPORT
# ------------------------------------------------------------
@app.route("/api/dxf", methods=["POST"])
def api_dxf():
    import ezdxf

    payload = request.get_json(force=True)
    result = payload.get("result")
    if not result:
        return jsonify({"ok": False, "error": "result required"}), 400

    g = paths_to_utm(result)
    ox, oy = g["origin"]

    doc = ezdxf.new("R2010", setup=True)
    doc.header["$INSUNITS"] = 6  # metres
    msp = doc.modelspace()
    layers = {
        "SITE": 3, "OBSTACLES": 30, "AISLES": 2, "ACCESS_LANE": 6,
        "SLOTS_STANDARD": 5, "SLOTS_ACCESSIBLE": 4, "SLOTS_EV": 3,
        "SLOTS_TRANSFER": 8, "ISLANDS": 92, "TEXT": 7, "NOTES": 9,
    }
    for name, color in layers.items():
        doc.layers.add(name, color=color)

    def add_ring(ring, layer):
        pts = [(x - ox, y - oy) for x, y in ring]
        msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": layer})

    add_ring(g["site"], "SITE")
    for r in g["obstacles"]:
        add_ring(r, "OBSTACLES")
    for r in g["aisles"]:
        add_ring(r, "AISLES")
    for r in g["spine"]:
        add_ring(r, "ACCESS_LANE")
    layer_for = {"standard": "SLOTS_STANDARD", "accessible": "SLOTS_ACCESSIBLE",
                 "ev": "SLOTS_EV", "transfer": "SLOTS_TRANSFER",
                 "island": "ISLANDS"}
    for s in g["slots"]:
        add_ring(s["ring"], layer_for.get(s["type"], "SLOTS_STANDARD"))
        if s["id"]:
            cx, cy = s["center"]
            msp.add_text(
                str(s["id"]), height=0.6,
                dxfattribs={"layer": "TEXT"},
            ).set_placement((cx - ox, cy - oy), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)
    ex, ey = g["entry"]
    msp.add_circle((ex - ox, ey - oy), radius=1.0,
                   dxfattribs={"layer": "NOTES"})
    msp.add_text("ENTRY", height=1.0, dxfattribs={"layer": "NOTES"}).set_placement(
        (ex - ox + 1.5, ey - oy))
    epsg = result["stats"]["epsg"]
    msp.add_text(
        f"Origin = EPSG:{epsg} E{ox:.2f} N{oy:.2f} | units: metres | "
        "concept plan, verify on site",
        height=0.8, dxfattribs={"layer": "NOTES"},
    ).set_placement((0, -4))

    buf = io.StringIO()
    doc.write(buf)
    data = buf.getvalue().encode("utf-8")
    return send_file(io.BytesIO(data), mimetype="application/dxf",
                     as_attachment=True, download_name="parking_layout.dxf")


if __name__ == "__main__":
    try:
        from waitress import serve
        print("Serving on http://127.0.0.1:5000 (waitress)")
        serve(app, host="127.0.0.1", port=5000, threads=8)
    except ImportError:
        app.run(host="127.0.0.1", port=5000, debug=False)
