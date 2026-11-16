# Parking-occupancy sensing 2025-26: market snapshot aur upgrade path

Single-camera CV market ka sabse cost-effective occupancy solution hai (1 camera 50-150 spaces, effective ~$10-50/space), lekin "correctness" (angle/diagonal/straddle detection) abhi thin, underserved niche hai — sirf 2 vendors (Parquery, Parksol) isko explicitly market karte hain.

## Market landscape (tech-type wise)

- **Ultrasonic**: $300-500/space, kabhi $500-1,000+ infra/signage saath — [ITS DOT](https://www.itskrs.its.dot.gov/2020-sc00464). 97-99.9% claims generic; weather (ice/mud echo-block) aur overhead-infra dependency limits.
- **Magnetometer/pucks** (Urbiotica, Libelium, Fybr, Nedap): 98-99% accuracy, battery 5-10 yrs (Urbiotica field avg 8.33 yrs, 1,205 units) — [Urbiotica](https://urbiotica.com/us/blog/service-life-of-parking-sensors-from-estimates-to-evidence/). Cost $100-350/space + $5-15/yr — [Winsparking](https://winsparking.com/blog/parking-lot-iot-sensors-2026). **Motorcycles/low-metal vehicles miss** — physics-fundamental limit.
- **LiDAR fixed-unit** (Outsight+Innoviz): niche, light-independent, coverage 4-8 se 50 spaces/unit (sources contradict) — [Innoviz](https://innoviz.tech/applications/parking-management). $/space ya accuracy% public nahi.
- **Single/multi-camera 2D CV** (Cleverciti, ParKam, Parkinto, Milesight, Park Assist): dominant category, 98-99.9% vendor-claimed accuracy, 50-150 spaces/camera outdoor, 1-6 indoor per-bay — [Parklio review](https://parklio.com/en/blog/top-10-camera-based-parking-occupancy-detection-systems-2024-review-guide). 2025 M&A: ParkHelp ne Cleverciti acquire kiya (Nov 2025).
- **Stereo/depth (RGB-D, ToF)**: emerging, LIPS Corporation example — depth/volume measure karta hai, shadow-immune claim — [LIPS](https://www.lips-hci.com/post/the-3d-revolution-in-parking-why-precision-occupancy-is-a-measurement-problem-not-just-a-vision-task). Accuracy/price public nahi — early-stage category.
- **"3D hologram" sensors**: **REAL CATEGORY NAHI HAI.** Yeh term ya depth-camera marketing-conflation hai, ya "holographic parking permits" (anti-counterfeit tag, occupancy se unrelated) se confuse ho raha hai. Genuine holographic parking sensor nahi mila.

## Single-camera CV limitations aur mitigations

- Failure modes: occlusion, oblique-angle distortion, night (−23 pts), rain (−15.6 pts), fog (85.7% weekday, worst), damaged markings (−14.85 pts) — [CRPS-D](https://arxiv.org/html/2509.13133v1).
- CRPS-D par baseline 87.20% AP deta hai vs 98.64% easy dataset — PKLot/CNRPark 97-99% "ceiling" hain, field expectation nahi.
- Mitigations: (1) multi-camera 10-20% overlap — occlusion isi se sabse kam hota hai; (2) BEV/homography GAN/learned-decoder se refine karo, raw IPM ke bajaye; (3) Kalman filter + Hungarian/DeepSORT tracking, 50-frame occlusion-survival precedent — [Paidi et al.](https://doi.org/10.1155/2021/1812647); (4) polygon/OBB bounding-box ke bajaye — HPS-Net F1 0.99 PS2.0 par — [arXiv](https://arxiv.org/html/2310.11629v1).
- Camera height/angle: 12m se kam mounting par occlusion ground-level jaisa rehta; sirf near-overhead (~10m+ nadir) genuinely kam karta hai. Ek single fixed camera occlusion aur distortion dono saath minimize nahi kar sakta.

## Parking-correctness/diagonal-parking startups — thin niche, yeh khud finding hai

- Sirf 2 vendor: **Parquery** (Swiss, angled/across/protruding detection occupancy-robustness feature bundle karta hai, 95%→99% on-site tuning) — [Parquery](https://parquery.com/parquery-and-ai/) — aur **Parksol** (Lithuania, dedicated violation product, technical detail undisclosed).
- Standard method: 2012 Xerox/Modaxo patent (sabse detailed source) — reference-line angle vs vehicle-axis angle, threshold compare — [Google Patents](https://patents.google.com/patent/US20130266187A1/en). 2023-26 mein koi naya peer-reviewed paper angle-violation par nahi mila.
- **FLAG — "Parkobot" mismatch**: Aapka reference "Parkobot" Kolkata-based IoT hardware startup hai (physical smart barriers/locks, booking model), CV company nahi — [Inc42](https://inc42.com/company/parkobot/). Koi source isko angle/correctness detection se connect nahi karta — agar matlab koi aur company thi, please confirm.
- Adjacent goldmine: Automated Valet Parking (AVP) research mein scoring formulas already hain — width-confidence, parallelism, door-clearance symmetry — overhead-camera correctness-check ke liye directly adapt ho sakte hain, but kisi ne abhi repurpose nahi kiya — [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC13259402/).

## Prioritized upgrades (impact/effort, highest pehle)

1. **Bounding box → OBB/polygon**: system already oriented-footprint use karta hai — YOLO-OBB ya HPS-Net-style 4-point polygon adopt karo (precedent F1 0.99). Low effort, high gain — [Ultralytics OBB](https://docs.ultralytics.com/tasks/obb).
2. **Kalman-filter tracklet smoothing** (~50-frame occlusion-survival precedent): momentary occlusion mein ID zinda rakhta hai. Medium-low effort, bada occlusion-robustness impact.
3. **AVP-style correctness scoring**: angle-threshold + width/parallelism confidence + symmetric-clearance score — exact underserved gap fill karta hai. Medium effort, high differentiation.
4. **Homography/BEV recalibration**: intrinsics/extrinsics audit karo, GAN/learned-decoder correction add karo far-slot distortion ke liye. Medium effort, accuracy-ceiling improve.
5. **Camera placement audit** (perpendicular-to-row + 10-20% overlap): coverage gap hai toh dusra camera add karo. Low-medium effort, sabse strong occlusion-mitigation lever.
6. **Realistic-condition retraining**: CRPS-D-style data (angled, night, rain, damaged markings) par fine-tune karo. Semi-supervised approach kam labels mein 79.75% AP deta hai. Medium-high effort, most honest fix.
7. **(Optional) Depth-camera pilot** high-occlusion bays ke liye (LIPS/RealSense/ZED2): occlusion-immune, pricing/accuracy public nahi — ROI unclear, last priority.

## Sources

- Urbiotica: https://urbiotica.com/us/blog/service-life-of-parking-sensors-from-estimates-to-evidence/
- Winsparking: https://winsparking.com/blog/parking-lot-iot-sensors-2026
- Innoviz: https://innoviz.tech/applications/parking-management
- Parklio review: https://parklio.com/en/blog/top-10-camera-based-parking-occupancy-detection-systems-2024-review-guide
- LIPS Corporation: https://www.lips-hci.com/post/the-3d-revolution-in-parking-why-precision-occupancy-is-a-measurement-problem-not-just-a-vision-task
- CRPS-D: https://arxiv.org/html/2509.13133v1
- HPS-Net: https://arxiv.org/html/2310.11629v1
- Xerox/Modaxo patent: https://patents.google.com/patent/US20130266187A1/en
- Parquery: https://parquery.com/parquery-and-ai/
- Parksol: https://parksol.lt/solutions/parking-violation-system/
- Parkobot (Inc42): https://inc42.com/company/parkobot/
- AVP scoring research: https://pmc.ncbi.nlm.nih.gov/articles/PMC13259402/
- ParkHelp/Cleverciti: https://www.businesswire.com/news/home/20251103685043/en/ParkHelp-Acquires-Cleverciti-Creating-the-Worlds-Most-Advanced-Platform-for-Parking-Guidance-and-Curb-Management
