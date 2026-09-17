import os
import math
import subprocess
import numpy as np
import scipy.io.wavfile as wavfile
from PIL import Image, ImageDraw, ImageFont
import cv2
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
OUTPUT_MP4 = r"c:\Users\nishant\Documents\parkbnb\ParkFNB_Hindi_Demo_Video.mp4"
TEMP_RAW_VIDEO = "temp_hindi_raw_video.mp4"
TEMP_MASTER_AUDIO = "temp_hindi_audio/master_audio_90s.wav"
FONT_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
FONT_REGULAR = r"C:\Windows\Fonts\segoeui.ttf"

WIDTH = 1920
HEIGHT = 1080
FPS = 30

SCENES = [
    {
        "id": 1,
        "image": r"C:\Users\nishant\.gemini\antigravity\brain\bb601042-b6a1-4256-be2a-0b3c9e42424c\hindi_clip1_congestion_1789647450553.jpg",
        "audio": "temp_hindi_audio/hvo_1.wav",
        "duration": 6.0,
        "start_crop": {"scale": 1.15, "cx": 0.50, "cy": 0.40},
        "end_crop":   {"scale": 1.05, "cx": 0.50, "cy": 0.60},
        "overlay": None
    },
    {
        "id": 2,
        "image": r"C:\Users\nishant\.gemini\antigravity\brain\bb601042-b6a1-4256-be2a-0b3c9e42424c\hindi_clip2_driver_1789647472949.jpg",
        "audio": "temp_hindi_audio/hvo_2.wav",
        "duration": 6.0,
        "start_crop": {"scale": 1.05, "cx": 0.50, "cy": 0.50},
        "end_crop":   {"scale": 1.20, "cx": 0.52, "cy": 0.48},
        "overlay": {"time_offset": 3.0, "duration": 3.0, "text": "17 minutes — average parking search time", "style": "stat"}
    },
    {
        "id": 3,
        "image": r"C:\Users\nishant\.gemini\antigravity\brain\bb601042-b6a1-4256-be2a-0b3c9e42424c\hindi_clip3_driveway_1789647518325.jpg",
        "audio": "temp_hindi_audio/hvo_3.wav",
        "duration": 6.0,
        "start_crop": {"scale": 1.08, "cx": 0.50, "cy": 0.60},
        "end_crop":   {"scale": 1.18, "cx": 0.54, "cy": 0.52},
        "overlay": None
    },
    {
        "id": 4,
        "image": r"C:\Users\nishant\.gemini\antigravity\brain\bb601042-b6a1-4256-be2a-0b3c9e42424c\hindi_clip4_barrier_1789647540518.jpg",
        "audio": "temp_hindi_audio/hvo_4.wav",
        "duration": 6.0,
        "start_crop": {"scale": 1.12, "cx": 0.50, "cy": 0.60},
        "end_crop":   {"scale": 1.04, "cx": 0.50, "cy": 0.45},
        "overlay": None
    },
    {
        "id": 5,
        "image": r"apps\admin\dist\hero\suv_valet.jpg",
        "audio": "temp_hindi_audio/hvo_5.wav",
        "duration": 6.0,
        "start_crop": {"scale": 1.14, "cx": 0.50, "cy": 0.50},
        "end_crop":   {"scale": 1.05, "cx": 0.50, "cy": 0.45},
        "overlay": None
    },
    {
        "id": 6,
        "image": "screen_consumer.png",
        "audio": "temp_hindi_audio/hvo_6.wav",
        "duration": 10.0,
        "start_crop": {"scale": 1.00, "cx": 0.50, "cy": 0.50},
        "end_crop":   {"scale": 1.06, "cx": 0.50, "cy": 0.50},
        "overlay": {"time_offset": 3.0, "duration": 5.0, "text": "Consumer App", "style": "tag"}
    },
    {
        "id": 7,
        "image": "screen_owner.png",
        "audio": "temp_hindi_audio/hvo_7.wav",
        "duration": 8.0,
        "start_crop": {"scale": 1.00, "cx": 0.50, "cy": 0.50},
        "end_crop":   {"scale": 1.06, "cx": 0.50, "cy": 0.50},
        "overlay": {"time_offset": 2.0, "duration": 5.0, "text": "Owner App", "style": "tag"}
    },
    {
        "id": 8,
        "image": "screen_admin_kyc.png",
        "audio": "temp_hindi_audio/hvo_8.wav",
        "duration": 7.0,
        "start_crop": {"scale": 1.00, "cx": 0.50, "cy": 0.50},
        "end_crop":   {"scale": 1.05, "cx": 0.52, "cy": 0.52},
        "overlay": {"time_offset": 2.0, "duration": 4.5, "text": "Admin Panel", "style": "tag"}
    },
    {
        "id": 9,
        "image": r"apps\admin\dist\hero\smart_lock.jpg",
        "audio": "temp_hindi_audio/hvo_9.wav",
        "duration": 6.0,
        "start_crop": {"scale": 1.15, "cx": 0.50, "cy": 0.50},
        "end_crop":   {"scale": 1.06, "cx": 0.50, "cy": 0.45},
        "overlay": None
    },
    {
        "id": 10,
        "image": "screen_anpr_allow.png",
        "audio": "temp_hindi_audio/hvo_10.wav",
        "duration": 6.0,
        "start_crop": {"scale": 1.00, "cx": 0.50, "cy": 0.50},
        "end_crop":   {"scale": 1.05, "cx": 0.50, "cy": 0.50},
        "overlay": {"time_offset": 3.0, "duration": 3.0, "text": "98.1 F1 — our detector vs 89.0 generic", "style": "stat"}
    },
    {
        "id": 11,
        "image": "screen_anpr_deny.png",
        "audio": "temp_hindi_audio/hvo_11.wav",
        "duration": 5.0,
        "start_crop": {"scale": 1.00, "cx": 0.50, "cy": 0.50},
        "end_crop":   {"scale": 1.05, "cx": 0.50, "cy": 0.50},
        "overlay": {"time_offset": 2.0, "duration": 2.8, "text": "Access denied — logged", "style": "alert"}
    },
    {
        "id": 12,
        "image": r"apps\admin\dist\hero\parking_bg.jpg",
        "audio": "temp_hindi_audio/hvo_12.wav",
        "duration": 7.0,
        "start_crop": {"scale": 1.10, "cx": 0.50, "cy": 0.55},
        "end_crop":   {"scale": 1.03, "cx": 0.50, "cy": 0.45},
        "overlay": None
    },
    {
        "id": 13,
        "image": r"apps\admin\dist\hero\deck_bg.jpg",
        "audio": "temp_hindi_audio/hvo_13.wav",
        "duration": 11.0,
        "start_crop": {"scale": 1.25, "cx": 0.50, "cy": 0.50},
        "end_crop":   {"scale": 1.02, "cx": 0.50, "cy": 0.50},
        "overlay": {"time_offset": 7.0, "duration": 4.0, "text": "logo", "style": "logo"}
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

def apply_clean_overlay(frame_bgr, scene, sec_in_scene, logo_img):
    overlay_info = scene.get("overlay")
    if not overlay_info:
        return frame_bgr
        
    t_start = overlay_info["time_offset"]
    t_dur = overlay_info["duration"]
    
    if sec_in_scene < t_start or sec_in_scene > (t_start + t_dur):
        return frame_bgr
        
    # Calculate smooth fade in / fade out alpha
    rel_t = sec_in_scene - t_start
    if rel_t < 0.4:
        alpha = rel_t / 0.4
    elif rel_t > (t_dur - 0.4):
        alpha = (t_dur - rel_t) / 0.4
    else:
        alpha = 1.0
    alpha = max(0.0, min(1.0, alpha))
    
    img_pil = Image.fromarray(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(img_pil, "RGBA")
    
    style = overlay_info["style"]
    text = overlay_info["text"]
    font_bold_large = ImageFont.truetype(FONT_BOLD, 36)
    font_bold_tag = ImageFont.truetype(FONT_BOLD, 28)
    
    if style == "logo" and logo_img is not None:
        # Centered ParkFNB Logo
        lw, lh = 360, 360
        resized_logo = logo_img.resize((lw, lh), Image.Resampling.LANCZOS)
        lx = (WIDTH - lw) // 2
        ly = (HEIGHT - lh) // 2 - 40
        
        # Soft dark backdrop circle
        draw.ellipse([lx - 40, ly - 40, lx + lw + 40, ly + lh + 40], fill=(10, 20, 35, int(220 * alpha)))
        
        # Paste logo with alpha
        logo_rgba = np.array(resized_logo)
        logo_rgba[:, :, 3] = (logo_rgba[:, :, 3] * alpha).astype(np.uint8)
        logo_with_alpha = Image.fromarray(logo_rgba)
        img_pil.paste(logo_with_alpha, (lx, ly), logo_with_alpha)
        
        # Subtitle under logo
        d_brand = ImageDraw.Draw(img_pil, "RGBA")
        brand_font = ImageFont.truetype(FONT_BOLD, 38)
        sub_font = ImageFont.truetype(FONT_REGULAR, 26)
        d_brand.text(((WIDTH - 180) // 2, ly + lh + 50), "ParkFNB", font=brand_font, fill=(255, 255, 255, int(255 * alpha)))
        d_brand.text(((WIDTH - 360) // 2, ly + lh + 95), "PARKING KA OPERATING SYSTEM", font=sub_font, fill=(0, 210, 180, int(240 * alpha)))
        
    elif style == "stat":
        # Floating Stat Pill (Bottom Center)
        pw, ph = 780, 80
        px = (WIDTH - pw) // 2
        py = HEIGHT - 160
        draw.rounded_rectangle([px, py, px + pw, py + ph], radius=16, fill=(10, 20, 35, int(230 * alpha)), outline=(255, 255, 255, int(50 * alpha)), width=2)
        # Highlight accent bar
        draw.rounded_rectangle([px + 10, py + 12, px + 18, py + ph - 12], radius=4, fill=(0, 210, 180, int(255 * alpha)))
        draw.text((px + 38, py + 18), text, font=font_bold_large, fill=(255, 255, 255, int(255 * alpha)))
        
    elif style == "alert":
        # Access Denied Badge (Red)
        pw, ph = 480, 75
        px = (WIDTH - pw) // 2
        py = HEIGHT - 160
        draw.rounded_rectangle([px, py, px + pw, py + ph], radius=16, fill=(153, 27, 27, int(240 * alpha)), outline=(239, 68, 68, int(180 * alpha)), width=2)
        draw.text((px + 45, py + 16), text, font=font_bold_tag, fill=(255, 255, 255, int(255 * alpha)))
        
    elif style == "tag":
        # Simple clean tag (Top Right / Center Bottom)
        pw, ph = 320, 68
        px = (WIDTH - pw) // 2
        py = HEIGHT - 140
        draw.rounded_rectangle([px, py, px + pw, py + ph], radius=14, fill=(15, 23, 42, int(230 * alpha)), outline=(0, 210, 180, int(140 * alpha)), width=2)
        draw.text((px + 50, py + 14), text, font=font_bold_tag, fill=(255, 255, 255, int(255 * alpha)))

    return cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)

def build_soundtrack(sample_rate=44100):
    print("Synthesizing 90-second Hindi master soundtrack...")
    total_duration = sum(s["duration"] for s in SCENES) # 90.0s
    total_samples = int(total_duration * sample_rate)
    master_voice = np.zeros(total_samples, dtype=np.float32)

    cur_time = 0.0
    for scene in SCENES:
        vo_path = scene["audio"]
        if os.path.exists(vo_path):
            sr, vo_data = wavfile.read(vo_path)
            if vo_data.ndim > 1:
                vo_data = vo_data.mean(axis=1)
            vo_data = vo_data.astype(np.float32) / 32768.0
            
            start_samp = int((cur_time + 0.25) * sample_rate)
            end_samp = min(total_samples, start_samp + len(vo_data))
            master_voice[start_samp:end_samp] += vo_data[:end_samp - start_samp]
            
        cur_time += scene["duration"]

    bgm_path = "temp_hindi_audio/bgm_90s.wav"
    bgm_sr, bgm_data = wavfile.read(bgm_path)
    if bgm_data.ndim > 1:
        bgm_data = bgm_data.mean(axis=1)
    bgm_data = bgm_data.astype(np.float32) / 32768.0
    bgm_track = bgm_data[:total_samples]

    # Dynamic ducking
    voice_envelope = np.abs(master_voice)
    kernel_size = int(0.5 * sample_rate)
    kernel = np.ones(kernel_size) / kernel_size
    smoothed_env = np.convolve(voice_envelope, kernel, mode="same")
    ducking = 1.0 - np.clip(smoothed_env * 2.8, 0.0, 0.60)

    final_audio = (master_voice * 0.95) + (bgm_track * 0.22 * ducking)
    final_audio = np.tanh(final_audio * 1.15) * 0.95
    
    fade_samps = int(2.0 * sample_rate)
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

    logo_path = "new_ui/logo (1).png"
    logo_img = Image.open(logo_path).convert("RGBA") if os.path.exists(logo_path) else None

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

            # Crossfade
            frames_remaining = scene_frames - f
            if next_img is not None and frames_remaining <= CROSSFADE_FRAMES:
                fade_t = (CROSSFADE_FRAMES - frames_remaining) / float(CROSSFADE_FRAMES)
                n_sc = next_scene["start_crop"]["scale"]
                n_cx = next_scene["start_crop"]["cx"]
                n_cy = next_scene["start_crop"]["cy"]
                next_frame_pil = crop_and_resize(next_img, n_sc, n_cx, n_cy, WIDTH, HEIGHT)
                next_frame_bgr = cv2.cvtColor(np.array(next_frame_pil), cv2.COLOR_RGB2BGR)
                frame_bgr = cv2.addWeighted(frame_bgr, 1.0 - fade_t, next_frame_bgr, fade_t, 0)

            # Apply clean post-production text overlay at exact timestamps
            sec_in_scene = f / float(FPS)
            final_frame = apply_clean_overlay(frame_bgr, scene, sec_in_scene, logo_img)

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
    
    print("Final Hindi 90-Second Demo MP4 generated successfully!")
    print(f"File Location: {OUTPUT_MP4}")
    
    if os.path.exists(TEMP_RAW_VIDEO):
        os.remove(TEMP_RAW_VIDEO)

if __name__ == "__main__":
    build_soundtrack()
    render_video()
    mux_final_mp4()
