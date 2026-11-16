import cv2
from detector import get_detector, normalise_plate

img_path = r'C:/Users/nishant/.gemini/antigravity/brain/741a86d5-6214-4af3-8f92-119283044c07/.user_uploaded/media_1790066665668.jpg'
frame = cv2.imread(img_path)
det = get_detector()

raw_cars = det.vehicles(frame, conf=0.10, imgsz=1280)
print(f'Cars found: {len(raw_cars)}')

# For each car, let's crop the car region and run plate detection on the car crop!
# (Cropping the car first gives much higher pixel resolution for distant plates!)
for i, car in enumerate(raw_cars):
    cx1, cy1, cx2, cy2, cconf = [int(v) if j < 4 else v for j, v in enumerate(car)]
    pad = 10
    h, w = frame.shape[:2]
    car_crop = frame[max(0, cy1-pad):min(h, cy2+pad), max(0, cx1-pad):min(w, cx2+pad)]

    # Read plate in this car crop
    read_res = det.read(car_crop, conf=0.05)
    print(f'Car {i} (box [{cx1}, {cy1}, {cx2}, {cy2}]):')
    if read_res.plate or read_res.raw_text:
        print(f'   -> Plate: {read_res.plate} (Raw: {read_res.raw_text}, OCR Conf: {read_res.ocr_conf:.2f}, Valid: {read_res.valid_format})')
    else:
        print('   -> No plate recognized')
