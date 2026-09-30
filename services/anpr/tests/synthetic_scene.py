"""
A tiny pinhole-camera renderer for parking scenes with exact ground truth.

World frame: X to the right, Y away from the camera along the ground, Z up.
The camera sits at (cam_x, 0, height) and looks along +Y, pitched down by `tilt`.
A car is a body box plus four wheel boxes; its segmentation mask is the union of
the projected boxes, which is exactly the silhouette a perfect segmenter would
return (the silhouette of a union is the union of the silhouettes).
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np

W, H_IMG = 1376, 768
FOCAL = 1000.0


@dataclass
class Camera:
    height: float = 6.0
    tilt_deg: float = 45.0
    cam_x: float = 0.0

    def project(self, pts3d) -> np.ndarray:
        p = np.asarray(pts3d, dtype=np.float64).reshape(-1, 3)
        t = math.radians(self.tilt_deg)
        x = p[:, 0] - self.cam_x
        y = p[:, 1]
        z = p[:, 2] - self.height
        fwd = y * math.cos(t) - z * math.sin(t)
        up = y * math.sin(t) + z * math.cos(t)
        u = W / 2.0 + FOCAL * x / fwd
        v = H_IMG / 2.0 - FOCAL * up / fwd
        return np.stack([u, v], axis=1)


@dataclass
class Stall:
    x_center: float          # lateral centre of the stall, metres
    y_near: float            # distance of the stall's near edge from the camera
    width: float = 2.5
    length: float = 5.0

    def corners(self) -> np.ndarray:
        """Ground corners: near-left, near-right, far-right, far-left."""
        x0, x1 = self.x_center - self.width / 2, self.x_center + self.width / 2
        y0, y1 = self.y_near, self.y_near + self.length
        return np.array([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], float)


@dataclass
class Car:
    x: float                 # lateral position of the car's centre
    y: float                 # longitudinal position of the car's centre
    yaw_deg: float = 0.0     # rotation about its centre; 0 = parallel to the stall
    length: float = 4.4
    width: float = 1.8
    body_z: tuple = (0.3, 1.5)
    wheelbase: float = 2.6
    track: float = 1.55
    wheel_len: float = 0.6
    wheel_w: float = 0.25
    wheel_h: float = 0.6

    def _to_world(self, local_xy: np.ndarray) -> np.ndarray:
        th = math.radians(self.yaw_deg)
        c, s = math.cos(th), math.sin(th)
        rot = np.array([[c, -s], [s, c]])
        return local_xy @ rot.T + np.array([self.x, self.y])

    def _box(self, cx, cy, sx, sy, z0, z1) -> np.ndarray:
        local = np.array([[cx - sx / 2, cy - sy / 2], [cx + sx / 2, cy - sy / 2],
                          [cx + sx / 2, cy + sy / 2], [cx - sx / 2, cy + sy / 2]])
        xy = self._to_world(local)
        return np.array([[x, y, z] for z in (z0, z1) for x, y in xy])

    def boxes(self) -> list[np.ndarray]:
        out = [self._box(0, 0, self.width, self.length, *self.body_z)]
        for sx in (-self.track / 2, self.track / 2):
            for sy in (-self.wheelbase / 2, self.wheelbase / 2):
                out.append(self._box(sx, sy, self.wheel_w, self.wheel_len, 0.0, self.wheel_h))
        return out

    def ground_rect(self) -> np.ndarray:
        """The car's true footprint corners on the ground."""
        local = np.array([[-self.width / 2, -self.length / 2], [self.width / 2, -self.length / 2],
                          [self.width / 2, self.length / 2], [-self.width / 2, self.length / 2]])
        return self._to_world(local)


def render_mask(cam: Camera, car: Car) -> np.ndarray:
    mask = np.zeros((H_IMG, W), np.uint8)
    for box in car.boxes():
        uv = cam.project(box)
        hull = cv2.convexHull(uv.astype(np.float32)).astype(np.int32)
        cv2.fillConvexPoly(mask, hull, 1)
    return mask


def bay_polygon(cam: Camera, stall: Stall) -> list[list[float]]:
    return cam.project(stall.corners()).tolist()


def true_crossing(car: Car, stall: Stall) -> dict:
    """Ground-truth overshoot of the car's real footprint past each stall edge."""
    g = car.ground_rect()
    x0, x1 = stall.x_center - stall.width / 2, stall.x_center + stall.width / 2
    y0, y1 = stall.y_near, stall.y_near + stall.length
    return {
        "left": max(0.0, x0 - g[:, 0].min()),
        "right": max(0.0, g[:, 0].max() - x1),
        "near": max(0.0, y0 - g[:, 1].min()),
        "far": max(0.0, g[:, 1].max() - y1),
    }


def parked(stall: Stall, dx: float = 0.0, yaw_deg: float = 0.0, rear_gap: float = 0.3, **kw) -> Car:
    """A car in `stall`, shifted sideways by dx, rotated about its centre."""
    length = kw.get("length", 4.4)
    return Car(x=stall.x_center + dx, y=stall.y_near + rear_gap + length / 2, yaw_deg=yaw_deg, **kw)
