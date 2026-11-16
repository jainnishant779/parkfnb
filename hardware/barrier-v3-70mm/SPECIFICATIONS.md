# PARKFNB Smart Parking Barrier - V3 Layout Specification
**Configuration:** Motor Distance = 70 mm (7 cm) | Inner Space = 200 mm (20 cm) | Bearing C-C = 140 mm (14 cm)  
**Revision:** V3-70mm  
**Status:** VALIDATED FIT (Mechanical & Geometry Checks Passed)  
**Date:** 2026-11-03  

---

## 1. Executive Summary

This specification validates the proposed mechanical configuration for the **PARKFNB Smart Parking Barrier**:
1. **Motor Center Distance:** Reduced from earlier 98.0 mm down to **70.0 mm (7 cm)** from the main shaft axis.
2. **Inner Opening / Clearance Space:** **200.0 mm (20 cm)** between tyre legs.
3. **Bearing Center-to-Center:** **140.0 mm (14 cm)** (UCP205 pillow block bearings).

### Key Result: **Massive Engineering Improvement**
* In the previous Rev F layout, the motor was placed at 98 mm, resulting in an extremely tight clearance of only **2.1 mm** between the front box corner and the swinging tyre arch during fold-down.
* By moving the motor closer to **70 mm**, the front corner clearance increases to **37.3 mm** (safe and comfortable buffer).
* The overall enclosure length shrinks from **281 mm down to 240 mm (saving 41 mm)**, giving a more compact, robust unit.

---

## 2. Dimension Summary Table

| Subsystem / Part | Dimension (mm) | Dimension (cm / in) | Notes |
| :--- | :--- | :--- | :--- |
| **Motor Center Distance** | **70.0 mm** | **7.0 cm** | Shaft axis to motor axis |
| **Inner Tyre Opening** | **200.0 mm** | **20.0 cm (~7.9 in)** | Semicircular opening of half-tyre |
| **Bearing Center-to-Center** | **140.0 mm** | **14.0 cm (~5.5 in)** | 2 × UCP205 pillow blocks at x = ±70 mm |
| **Inter-Bearing Clear Gap** | **102.0 mm** | **10.2 cm** | Gap between bearing inner faces |
| **Motor Assembly Length** | **68.0 mm** | **6.8 cm** | Gearbox 33 mm + Can 35 mm |
| **Outer Steel Box Width** | **190.0 mm** | **19.0 cm** | 5 mm side clearance inside 200 mm tyre opening |
| **Outer Steel Box Length** | **240.0 mm** | **24.0 cm** | Front y = -105 mm to Rear y = +135 mm |
| **Main Box Height** | **86.0 mm** | **8.6 cm** | Over shaft and bearings (Ground to top skin) |
| **Motor Step Height** | **61.0 mm** | **6.1 cm** | Low step over motor |
| **Standing Height (90° Locked)** | **293.5 mm** | **~29.4 cm (~11.6 in)** | Deterrent height above ground |
| **Folded Height (0° / 180° Open)**| **92.5 mm** | **~9.3 cm (~3.6 in)** | Low profile for drive-over clearance |
| **Drive Shaft** | **Ø25 × 406 mm** | **16 inches length** | Solid steel shaft (V1 unchanged) |
| **Big Sprocket (Shaft)** | **OD 70 mm** | **Radius 35 mm** | 3/8" pitch (#35 / 06B) |
| **Small Sprocket (Motor)** | **OD 38 mm** | **Radius 19 mm** | 3/8" pitch (#35 / 06B) |

---

## 3. Engineering Verification Checks

### A. Sprocket Tip-to-Tip Clearance
* Big sprocket outer radius: $R_{\text{big}} = 35.0\text{ mm}$
* Small sprocket outer radius: $R_{\text{small}} = 19.0\text{ mm}$
* Total sprocket radii sum: $35.0 + 19.0 = 54.0\text{ mm}$
* Center-to-center distance: $C = 70.0\text{ mm}$
$$\text{Clearance} = 70.0 - 54.0 = \mathbf{16.0\text{ mm}}$$
$$\rightarrow \mathbf{PASS}\text{ (Sprockets do not touch; chain runs cleanly)}$$

### B. Axial Motor Fitment Inside Bearing Gap
* Left bearing inner face: $x = -51.0\text{ mm}$
* Right bearing inner face: $x = +51.0\text{ mm}$
* Available clear gap: $51.0 - (-51.0) = \mathbf{102.0\text{ mm}}$
* Big sprocket & chain plane placed at $x = -25.0\text{ mm}$
* Motor gearbox & body placed from $x = -25.0\text{ mm}$ to $x = +43.0\text{ mm}$ (Length = $68\text{ mm}$)
* Clearance between motor rear and right bearing inner face:
$$\text{Gap} = 51.0 - 43.0 = \mathbf{8.0\text{ mm}}$$
$$\rightarrow \mathbf{PASS}\text{ (Motor fits completely within the central bay)}$$

### C. Tyre Sweep Margin (Front Corner)
* At crown: Reach from shaft axis = $R_{\text{inner}} + \text{leg} = 100.0 + 51.0 = \mathbf{151.0\text{ mm}}$
* Front box corner: $y = -105.0\text{ mm}$, $z = 80.0\text{ mm}$ ($z_{\text{rel}} = 80.0 - 36.5 = 43.5\text{ mm}$)
* Corner radius from shaft axis: $\sqrt{105.0^2 + 43.5^2} = \mathbf{113.7\text{ mm}}$
$$\text{Margin} = 151.0 - 113.7 = \mathbf{37.3\text{ mm}}$$
$$\rightarrow \mathbf{PASS}\text{ (Rev F was only 2.1 mm; 70 mm motor provides 37.3 mm safe margin)}$$

---

## 4. Generated Drawings in this Folder

1. **[`PARKFNB_V3_Layout_Summary.png`](PARKFNB_V3_Layout_Summary.png)**: Complete 1-sheet engineering blueprint containing Plan View, Side Elevation, Comparison Analysis, and Specification Table.
2. **[`PARKFNB_V3_Plan_View.png`](PARKFNB_V3_Plan_View.png)**: Dedicated high-resolution top view with comprehensive linear dimensions.
3. **[`PARKFNB_V3_Elevation_View.png`](PARKFNB_V3_Elevation_View.png)**: Dedicated front and side elevation drawings with all vertical heights.
4. **[`generate_layout.py`](generate_layout.py)**: Python CAD script used to calculate and generate all technical drawings.
