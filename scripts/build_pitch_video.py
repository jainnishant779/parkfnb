import os
import math
import subprocess
import numpy as np
import scipy.io.wavfile as wavfile
from PIL import Image, ImageDraw, ImageFont
import cv2
import imageio_ffmpeg

# Paths
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
OUTPUT_MP4 = r"c:\Users\nishant\Documents\parkbnb\ParkBnB_Pitch_Deck_Video.mp4"
TEMP_RAW_VIDEO = "temp_raw_video.mp4"
TEMP_MASTER_AUDIO = "temp_audio/master_audio.wav"
FONT_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
FONT_REGULAR = r"C:\Windows\Fonts\segoeui.ttf"

WIDTH = 1920
HEIGHT = 1080
FPS = 30

SCENES = [
    {
        "id": 1,
        "image": r"C:\Users\nishant\.gemini\antigravity\brain\bb601042-b6a1-4256-be2a-0b3c9e42424c\parking_crunch_clip1_1789642683729.jpg",
        "audio": "temp_audio/scene1.wav",
        "duration": 7.6,
        "section": "01 // THE URBAN CRISIS",
        "phase": "THE PROBLEM",
        "title": "30% of City Traffic is Circling for Parking",
        "subtitle": "Severe Congestion · Lost Productivity · Carbon Waste",
        "theme_color": (0, 122, 255),
        "start_crop": {"scale": 1.15, "cx": 0.45, "cy": 0.35},
        "end_crop":   {"scale": 1.05, "cx": 0.52, "cy": 0.62},
        "sfx": "drone_hit"
    },
    {
        "id": 2,
        "image": r"C:\Users\nishant\.gemini\antigravity\brain\bb601042-b6a1-4256-be2a-0b3c9e42424c\driver_dilemma_clip2_1789642702563.jpg",
        "audio": "temp_audio/scene2.wav",
        "duration": 6.4,
        "section": "02 // THE DRIVER DILEMMA",
        "phase": "THE PROBLEM",
        "title": "Hours Lost & Peak Driver Frustration",
        "subtitle": "Unpredictable Rates · Zero Spot Transparency · Friction",
        "theme_color": (255, 90, 50),
        "start_crop": {"scale": 1.05, "cx": 0.50, "cy": 0.50},
        "end_crop":   {"scale": 1.25, "cx": 0.53, "cy": 0.48},
        "sfx": "subtle_tick"
    },
    {
        "id": 3,
        "image": r"C:\Users\nishant\.gemini\antigravity\brain\bb601042-b6a1-4256-be2a-0b3c9e42424c\idle_driveway_clip3_1789642719587.jpg",
        "audio": "temp_audio/scene3.wav",
        "duration": 6.6,
        "section": "03 // UNLOCKING IDLE SUPPLY",
        "phase": "THE OPPORTUNITY",
        "title": "Millions of Private Driveways Sit Locked & Empty",
        "subtitle": "Latent Residential Supply · Prime Urban Locations · Untapped Real Estate",
        "theme_color": (0, 210, 180),
        "start_crop": {"scale": 1.12, "cx": 0.32, "cy": 0.60},
        "end_crop":   {"scale": 1.06, "cx": 0.60, "cy": 0.48},
        "sfx": "warm_chime"
    },
    {
        "id": 4,
        "image": r"C:\Users\nishant\.gemini\antigravity\brain\bb601042-b6a1-4256-be2a-0b3c9e42424c\space_optimizer_clip4_1789642767944.jpg",
        "audio": "temp_audio/scene4.wav",
        "duration": 8.8,
        "section": "04 // SPACE OPTIMIZER ENGINE",
        "phase": "THE OPPORTUNITY",
        "title": "AI Algorithmic Spatial Layout & Yield Maximization",
        "subtitle": "Automated Blueprinting · Dynamic Vehicle Flow · Turnkey Monetization",
        "theme_color": (0, 210, 180),
        "start_crop": {"scale": 1.18, "cx": 0.42, "cy": 0.45},
        "end_crop":   {"scale": 1.03, "cx": 0.56, "cy": 0.53},
        "sfx": "tech_sweep"
    },
    {
        "id": 5,
        "image": r"C:\Users\nishant\.gemini\antigravity\brain\bb601042-b6a1-4256-be2a-0b3c9e42424c\app_ui_demo_clip_1789643876494.jpg",
        "audio": "temp_audio/scene5.wav",
        "duration": 7.0,
        "section": "05 // LIVE MOBILE APP PROOF",
        "phase": "LIVE PRODUCT",
        "title": "Search · One-Tap Unlock · FASTag / UPI Auto-Pay",
        "subtitle": "Reserve Verified Spots in Under 15 Seconds with Instant Smart Access",
        "theme_color": (0, 220, 140),
        "start_crop": {"scale": 1.05, "cx": 0.50, "cy": 0.50},
        "end_crop":   {"scale": 1.18, "cx": 0.52, "cy": 0.54},
        "sfx": "ui_unlock"
    },
    {
        "id": 6,
        "image": r"C:\Users\nishant\.gemini\antigravity\brain\bb601042-b6a1-4256-be2a-0b3c9e42424c\smart_barrier_clip5_1789642787080.jpg",
        "audio": "temp_audio/scene6.wav",
        "duration": 5.5,
        "section": "06 // AUTONOMOUS HARDWARE",
        "phase": "THE TECHNOLOGY",
        "title": "IoT Floor Bollards & Connected Boom Barriers",
        "subtitle": "Sub-Second Cloud Activation · Fail-Safe Mesh · Commercial Reliability",
        "theme_color": (0, 180, 255),
        "start_crop": {"scale": 1.14, "cx": 0.38, "cy": 0.68},
        "end_crop":   {"scale": 1.05, "cx": 0.56, "cy": 0.42},
        "sfx": "subtle_tick"
    },
    {
        "id": 7,
        "image": r"C:\Users\nishant\.gemini\antigravity\brain\bb601042-b6a1-4256-be2a-0b3c9e42424c\edge_cctv_clip6_1789642806272.jpg",
        "audio": "temp_audio/scene7.wav",
        "duration": 6.3,
        "section": "07 // EDGE COMPUTER VISION",
        "phase": "THE TECHNOLOGY",
        "title": "Real-Time CCTV Occupancy & Telemetry AI",
        "subtitle": "Automated License Plate Recognition · Zero-Sensor Retrofit · 99.4% Accuracy",
        "theme_color": (0, 230, 200),
        "start_crop": {"scale": 1.12, "cx": 0.62, "cy": 0.35},
        "end_crop":   {"scale": 1.04, "cx": 0.45, "cy": 0.55},
        "sfx": "radar_ping"
    },
    {
        "id": 8,
        "image": r"C:\Users\nishant\.gemini\antigravity\brain\bb601042-b6a1-4256-be2a-0b3c9e42424c\entry_settle_clip7_1789642828422.jpg",
        "audio": "temp_audio/scene8.wav",
        "duration": 5.3,
        "section": "08 // FRICTIONLESS SETTLEMENT",
        "phase": "THE RESOLUTION",
        "title": "Frictionless Driver Entry · Passive Host Earnings",
        "subtitle": "Instant Settlement to Bank Accounts · Dynamic Surge Pricing · 100% Digital",
        "theme_color": (0, 215, 120),
        "start_crop": {"scale": 1.15, "cx": 0.40, "cy": 0.60},
        "end_crop":   {"scale": 1.05, "cx": 0.55, "cy": 0.44},
        "sfx": "coin_sparkle"
    },
    {
        "id": 9,
        "image": r"C:\Users\nishant\.gemini\antigravity\brain\bb601042-b6a1-4256-be2a-0b3c9e42424c\city_scale_clip8_1789642853315.jpg",
        "audio": "temp_audio/scene9.wav",
        "duration": 6.0,
        "section": "09 // CONNECTED CITY GRID",
        "phase": "NETWORK SCALE",
        "title": "The Decentralized Smart Parking Network",
        "subtitle": "Scalable Across Tier 1 & 2 Metros · Unlocking Thousands of Urban Micro-Hubs",
        "theme_color": (0, 210, 255),
        "start_crop": {"scale": 1.30, "cx": 0.50, "cy": 0.50},
        "end_crop":   {"scale": 1.00, "cx": 0.50, "cy": 0.50},
        "sfx": "chord_swell"
    }
]

def ease_in_out(t):
    return (1.0 - math.cos(math.pi * t)) / 2.0

def crop_and_resize(pil_img, scale, cx, cy, out_w, out_h):
    orig_w, orig_h = pil_img.size
    crop_w = orig_w / scale
    crop_h = orig_h / scale
    
    left = cx * orig_w - crop_w / 2.0
    top = cy * orig_h - crop_h / 2.0
    
    left = max(0, min(orig_w - crop_w, left))
    top = max(0, min(orig_h - crop_h, top))
    right = left + crop_w
    bottom = top + crop_h
    
    cropped = pil_img.crop((left, top, right, bottom))
    return cropped.resize((out_w, out_h), Image.Resampling.BICUBIC)

def draw_hud(frame_bgr, scene, progress_ratio, video_progress):
    img_pil = Image.fromarray(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(img_pil, "RGBA")
    
    try:
        font_tag = ImageFont.truetype(FONT_BOLD, 22)
        font_title = ImageFont.truetype(FONT_BOLD, 36)
        font_subtitle = ImageFont.truetype(FONT_REGULAR, 24)
        font_brand = ImageFont.truetype(FONT_BOLD, 26)
        font_brand_sub = ImageFont.truetype(FONT_REGULAR, 18)
    except:
        font_tag = ImageFont.load_default()
        font_title = ImageFont.load_default()
        font_subtitle = ImageFont.load_default()
        font_brand = ImageFont.load_default()
        font_brand_sub = ImageFont.load_default()

    # 1. Top Header Bar
    draw.rounded_rectangle([40, 36, 420, 96], radius=16, fill=(10, 25, 47, 220), outline=(255, 255, 255, 45), width=1)
    draw.ellipse([64, 57, 78, 71], fill=(0, 210, 180, 255))
    draw.text((92, 45), "PARKBnB", font=font_brand, fill=(255, 255, 255, 255))
    draw.text((94, 72), "AI PARKING PLATFORM", font=font_brand_sub, fill=(0, 210, 180, 240))

    # Phase indicator on top right
    phase_text = f"PITCH DECK // {scene['phase']}"
    draw.rounded_rectangle([WIDTH - 420, 36, WIDTH - 40, 96], radius=16, fill=(10, 25, 47, 220), outline=(255, 255, 255, 45), width=1)
    draw.text((WIDTH - 390, 54), phase_text, font=font_tag, fill=(255, 160, 40, 255))

    # 2. Lower Third Card
    slide_progress = min(1.0, progress_ratio * 4.0)
    card_alpha = int(225 * slide_progress)
    card_x1 = 50
    card_y1 = HEIGHT - 220
    card_x2 = 1200
    card_y2 = HEIGHT - 65
    
    draw.rounded_rectangle([card_x1, card_y1, card_x2, card_y2], radius=20, fill=(8, 18, 36, card_alpha), outline=(255, 255, 255, int(45 * slide_progress)), width=1)
    accent_r, accent_g, accent_b = scene["theme_color"]
    draw.rounded_rectangle([card_x1 + 12, card_y1 + 16, card_x1 + 22, card_y2 - 16], radius=4, fill=(accent_r, accent_g, accent_b, card_alpha))

    draw.text((card_x1 + 38, card_y1 + 18), scene["section"], font=font_tag, fill=(0, 210, 180, card_alpha))
    draw.text((card_x1 + 38, card_y1 + 48), scene["title"], font=font_title, fill=(255, 255, 255, card_alpha))
    draw.text((card_x1 + 38, card_y1 + 96), scene["subtitle"], font=font_subtitle, fill=(185, 205, 225, card_alpha))

    # 3. Bottom Progress Bar
    bar_y = HEIGHT - 8
    draw.rectangle([0, bar_y, WIDTH, HEIGHT], fill=(15, 28, 50, 255))
    progress_w = int(WIDTH * video_progress)
    if progress_w > 0:
        draw.rectangle([0, bar_y, progress_w, HEIGHT], fill=(0, 210, 180, 255))

    return cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)

def build_soundtrack(sample_rate=44100):
    print("Synthesizing audio layers & SFX...")
    total_duration = sum(s["duration"] for s in SCENES)
    total_samples = int(total_duration * sample_rate)
    master_voice = np.zeros(total_samples, dtype=np.float32)
    master_sfx = np.zeros(total_samples, dtype=np.float32)

    cur_time = 0.0
    for scene in SCENES:
        vo_path = scene["audio"]
        if os.path.exists(vo_path):
            sr, vo_data = wavfile.read(vo_path)
            if vo_data.ndim > 1:
                vo_data = vo_data.mean(axis=1)
            vo_data = vo_data.astype(np.float32) / 32768.0
            
            start_samp = int((cur_time + 0.30) * sample_rate)
            end_samp = min(total_samples, start_samp + len(vo_data))
            master_voice[start_samp:end_samp] += vo_data[:end_samp - start_samp]
        
        sfx_start = int((cur_time + 0.05) * sample_rate)
        sfx_type = scene.get("sfx", "")
        
        if sfx_type == "drone_hit":
            dur = int(1.5 * sample_rate)
            t_sfx = np.linspace(0, 1.5, dur)
            sig = 0.35 * np.sin(2 * np.pi * 55 * t_sfx) * np.exp(-t_sfx * 2.5)
            end_sfx = min(total_samples, sfx_start + dur)
            master_sfx[sfx_start:end_sfx] += sig[:end_sfx - sfx_start]
            
        elif sfx_type == "tech_sweep":
            dur = int(1.2 * sample_rate)
            t_sfx = np.linspace(0, 1.2, dur)
            freqs = np.linspace(350, 1600, dur)
            sig = 0.15 * np.sin(2 * np.pi * freqs * t_sfx) * np.exp(-t_sfx * 2.0)
            end_sfx = min(total_samples, sfx_start + dur)
            master_sfx[sfx_start:end_sfx] += sig[:end_sfx - sfx_start]
            
        elif sfx_type == "ui_unlock":
            for freq_offset, delay in [(1046.5, 0.0), (1318.5, 0.12)]:
                dur = int(0.6 * sample_rate)
                t_sfx = np.linspace(0, 0.6, dur)
                sig = 0.22 * np.sin(2 * np.pi * freq_offset * t_sfx) * np.exp(-t_sfx * 6.0)
                sub_start = sfx_start + int(delay * sample_rate)
                end_sfx = min(total_samples, sub_start + dur)
                master_sfx[sub_start:end_sfx] += sig[:end_sfx - sub_start]
                
        elif sfx_type == "radar_ping":
            dur = int(1.0 * sample_rate)
            t_sfx = np.linspace(0, 1.0, dur)
            sig = 0.18 * np.sin(2 * np.pi * 1400 * t_sfx) * np.exp(-t_sfx * 4.5)
            end_sfx = min(total_samples, sfx_start + dur)
            master_sfx[sfx_start:end_sfx] += sig[:end_sfx - sfx_start]
            
        elif sfx_type == "coin_sparkle":
            for f, delay in [(1800, 0.0), (2200, 0.08), (2700, 0.16), (3400, 0.24)]:
                dur = int(0.5 * sample_rate)
                t_sfx = np.linspace(0, 0.5, dur)
                sig = 0.16 * np.sin(2 * np.pi * f * t_sfx) * np.exp(-t_sfx * 7.0)
                sub_start = sfx_start + int(delay * sample_rate)
                end_sfx = min(total_samples, sub_start + dur)
                master_sfx[sub_start:end_sfx] += sig[:end_sfx - sub_start]
                
        elif sfx_type == "chord_swell":
            dur = int(3.5 * sample_rate)
            t_sfx = np.linspace(0, 3.5, dur)
            sig = 0.0
            for f in [65.4, 130.8, 196.0, 261.6, 329.6, 392.0]:
                sig += 0.05 * np.sin(2 * np.pi * f * t_sfx)
            sig *= np.exp(-t_sfx * 0.7)
            end_sfx = min(total_samples, sfx_start + dur)
            master_sfx[sfx_start:end_sfx] += sig[:end_sfx - sfx_start]

        cur_time += scene["duration"]

    bgm_path = "temp_audio/background_music.wav"
    bgm_sr, bgm_data = wavfile.read(bgm_path)
    if bgm_data.ndim > 1:
        bgm_data = bgm_data.mean(axis=1)
    bgm_data = bgm_data.astype(np.float32) / 32768.0

    if len(bgm_data) < total_samples:
        repeats = int(math.ceil(total_samples / len(bgm_data)))
        bgm_data = np.tile(bgm_data, repeats)
    bgm_track = bgm_data[:total_samples]

    voice_envelope = np.abs(master_voice)
    kernel_size = int(0.4 * sample_rate)
    kernel = np.ones(kernel_size) / kernel_size
    smoothed_env = np.convolve(voice_envelope, kernel, mode="same")
    ducking = 1.0 - np.clip(smoothed_env * 2.5, 0.0, 0.65)

    final_audio = (master_voice * 0.95) + (bgm_track * 0.28 * ducking) + (master_sfx * 0.75)
    final_audio = np.tanh(final_audio * 1.2) * 0.95
    
    fade_samps = int(1.5 * sample_rate)
    final_audio[-fade_samps:] *= np.linspace(1.0, 0.0, fade_samps)

    final_audio_int16 = (final_audio * 32767.0).astype(np.int16)
    wavfile.write(TEMP_MASTER_AUDIO, sample_rate, final_audio_int16)
    print("Master soundtrack generated:", TEMP_MASTER_AUDIO)

def render_video():
    print("Loading source images...")
    pil_images = {}
    for s in SCENES:
        img_path = s["image"]
        pil_images[s["id"]] = Image.open(img_path).convert("RGB")

    total_duration = sum(s["duration"] for s in SCENES)
    total_frames = int(total_duration * FPS)
    print(f"Total video duration: {total_duration:.1f}s | Total frames: {total_frames}")

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(TEMP_RAW_VIDEO, fourcc, float(FPS), (WIDTH, HEIGHT))

    global_frame = 0
    CROSSFADE_FRAMES = 12

    for scene_idx, scene in enumerate(SCENES):
        scene_frames = int(scene["duration"] * FPS)
        print(f"Rendering Scene {scene['id']} ({scene_frames} frames)...")
        img_src = pil_images[scene["id"]]
        
        next_img = None
        next_scene = None
        if scene_idx < len(SCENES) - 1:
            next_scene = SCENES[scene_idx + 1]
            next_img = pil_images[next_scene["id"]]

        for f in range(scene_frames):
            prog = f / float(scene_frames)
            eased_prog = ease_in_out(prog)

            sc = scene["start_crop"]["scale"] + (scene["end_crop"]["scale"] - scene["start_crop"]["scale"]) * eased_prog
            cx = scene["start_crop"]["cx"] + (scene["end_crop"]["cx"] - scene["start_crop"]["cx"]) * eased_prog
            cy = scene["start_crop"]["cy"] + (scene["end_crop"]["cy"] - scene["start_crop"]["cy"]) * eased_prog

            frame_pil = crop_and_resize(img_src, sc, cx, cy, WIDTH, HEIGHT)
            frame_bgr = cv2.cvtColor(np.array(frame_pil), cv2.COLOR_RGB2BGR)

            frames_remaining = scene_frames - f
            if next_img is not None and frames_remaining <= CROSSFADE_FRAMES:
                fade_t = (CROSSFADE_FRAMES - frames_remaining) / float(CROSSFADE_FRAMES)
                n_sc = next_scene["start_crop"]["scale"]
                n_cx = next_scene["start_crop"]["cx"]
                n_cy = next_scene["start_crop"]["cy"]
                next_frame_pil = crop_and_resize(next_img, n_sc, n_cx, n_cy, WIDTH, HEIGHT)
                next_frame_bgr = cv2.cvtColor(np.array(next_frame_pil), cv2.COLOR_RGB2BGR)
                frame_bgr = cv2.addWeighted(frame_bgr, 1.0 - fade_t, next_frame_bgr, fade_t, 0)

            video_prog = global_frame / float(total_frames)
            final_frame = draw_hud(frame_bgr, scene, prog, video_prog)

            out.write(final_frame)
            global_frame += 1

    out.release()
    print("Raw video render complete:", TEMP_RAW_VIDEO)

def mux_final_mp4():
    print("Muxing video & audio into final broadcast MP4...")
    cmd = [
        FFMPEG,
        "-y",
        "-i", TEMP_RAW_VIDEO,
        "-i", TEMP_MASTER_AUDIO,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "256k",
        "-movflags", "+faststart",
        "-shortest",
        OUTPUT_MP4
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        print("FFmpeg Error:", res.stderr)
        raise RuntimeError("FFmpeg muxing failed.")
    
    print("Final MP4 generated successfully!")
    print(f"File Location: {OUTPUT_MP4}")
    
    if os.path.exists(TEMP_RAW_VIDEO):
        os.remove(TEMP_RAW_VIDEO)

if __name__ == "__main__":
    build_soundtrack()
    render_video()
    mux_final_mp4()
