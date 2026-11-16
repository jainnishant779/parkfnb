"""
PARKBNB Camera Calibration & Homography Engine.

Solves perspective distortion in CCTV views by maintaining 4-point ground-plane correspondence:
  Image Pixels (u, v) <---> Metric Ground Plane / Bird's Eye View (X, Y in metres)

Enables:
  1. Direct projection of Space Optimizer metric slots onto CCTV camera perspective
  2. Bird's Eye View (BEV) orthographic visual rendering for operator
  3. Metric distance and true orientation angle measurement independent of camera tilt
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Sequence

import cv2
import numpy as np


class HomographyCalibrator:
    """
    Manages 4-point perspective transform between camera image and metric ground plane.
    """

    def __init__(self, src_points: Sequence[Sequence[float]] | None = None,
                 dst_points: Sequence[Sequence[float]] | None = None):
        self.H = None
        self.H_inv = None
        self.src_points = None
        self.dst_points = None

        if src_points is not None and dst_points is not None:
            self.calibrate(src_points, dst_points)

    @property
    def is_calibrated(self) -> bool:
        return self.H is not None

    def calibrate(self, src_points: Sequence[Sequence[float]],
                  dst_points: Sequence[Sequence[float]]) -> bool:
        """
        Calibrates homography from 4 camera pixel points to 4 metric ground plane points.
        Points must be ordered consistently (e.g. top-left, top-right, bottom-right, bottom-left).
        """
        if len(src_points) != 4 or len(dst_points) != 4:
            raise ValueError("Exactly 4 point correspondences required for homography calibration")

        src = np.array(src_points, dtype=np.float32)
        dst = np.array(dst_points, dtype=np.float32)

        try:
            self.H = cv2.getPerspectiveTransform(src, dst)
            self.H_inv = cv2.getPerspectiveTransform(dst, src)
            self.src_points = [[float(x), float(y)] for x, y in src_points]
            self.dst_points = [[float(x), float(y)] for x, y in dst_points]
            return True
        except Exception as e:
            print(f"[homography] Calibration failed: {e}")
            self.H = None
            self.H_inv = None
            return False

    def calibrate_from_rectangle(self, src_corners: Sequence[Sequence[float]],
                                 real_width_m: float = 10.0,
                                 real_height_m: float = 20.0) -> bool:
        """
        Convenience: Calibrates by mapping 4 clicked corners of a known rectangular area
        (e.g., parking lane or standard double-bay) to metric coordinates [0, 0] -> [W, H].
        """
        dst = [
            [0.0, 0.0],
            [real_width_m, 0.0],
            [real_width_m, real_height_m],
            [0.0, real_height_m]
        ]
        return self.calibrate(src_corners, dst)

    def image_to_ground(self, points: Sequence[Sequence[float]]) -> list[list[float]]:
        """Projects image pixel points (u, v) into ground plane metric coordinates (X, Y)."""
        if self.H is None:
            return [[float(x), float(y)] for x, y in points]
        pts = np.array(points, dtype=np.float32).reshape(-1, 1, 2)
        warped = cv2.perspectiveTransform(pts, self.H)
        return [[float(p[0][0]), float(p[0][1])] for p in warped]

    def ground_to_image(self, points: Sequence[Sequence[float]]) -> list[list[float]]:
        """Projects ground plane metric points (X, Y) back into camera pixel coordinates (u, v)."""
        if self.H_inv is None:
            return [[float(x), float(y)] for x, y in points]
        pts = np.array(points, dtype=np.float32).reshape(-1, 1, 2)
        warped = cv2.perspectiveTransform(pts, self.H_inv)
        return [[float(p[0][0]), float(p[0][1])] for p in warped]

    def warp_bev(self, frame: np.ndarray, out_width: int = 800, out_height: int = 800) -> np.ndarray:
        """Warps camera frame into a top-down Bird's Eye View (BEV) orthographic projection."""
        if self.H is None:
            return frame
        return cv2.warpPerspective(frame, self.H, (out_width, out_height))

    def save(self, filepath: str | Path):
        """Saves calibration parameters to a JSON file."""
        data = {
            "calibrated": self.is_calibrated,
            "src_points": self.src_points,
            "dst_points": self.dst_points,
            "H": self.H.tolist() if self.H is not None else None,
        }
        Path(filepath).write_text(json.dumps(data, indent=2), encoding="utf-8")

    @classmethod
    def load(cls, filepath: str | Path) -> HomographyCalibrator:
        """Loads calibration parameters from a JSON file."""
        path = Path(filepath)
        if not path.exists():
            return cls()
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("src_points") and data.get("dst_points"):
                return cls(data["src_points"], data["dst_points"])
        except Exception as e:
            print(f"[homography] Failed to load calibration from {filepath}: {e}")
        return cls()
