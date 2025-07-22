from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import easyocr
import numpy as np
from PIL import Image
import cv2
import base64
import io
import re
from ultralytics import YOLO
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

reader = easyocr.Reader(['tr'], gpu=False)

# Yüz tespiti için Haar Cascade dosyası (OpenCV default path veya backend dizininde olmalı)
FACE_CASCADE_PATH = os.path.join(os.path.dirname(__file__), "haarcascade_frontalface_default.xml")
face_cascade = cv2.CascadeClassifier(FACE_CASCADE_PATH)

def validate_tckn(tckn):
    if not tckn or not tckn.isdigit() or len(tckn) != 11 or tckn[0] == '0':
        return False
    digits = [int(d) for d in tckn]
    if digits[10] != ((sum(digits[:10]) % 10)):
        return False
    if digits[9] != (((sum(digits[0:9:2]) * 7) - sum(digits[1:8:2])) % 10):
        return False
    return True

def extract_fields(lines):
    fields = {
        "tckn": "",
        "ad": "",
        "soyad": "",
        "ana_adi": "",
        "baba_adi": "",
        "dogum_tarihi": "",
        "cinsiyet": ""
    }
    # TCKN
    for line in lines:
        match = re.search(r"([1-9][0-9]{10})", line)
        if match and validate_tckn(match.group(1)):
            fields["tckn"] = match.group(1)
            break
    label_map = {
        "ad": ["ADI", "GIVEN NAME", "GIVEN NAME(S)", "ADİ"],
        "soyad": ["SOYADI", "SURNAME", "SOYADİ"],
        "ana_adi": ["ANA ADI", "MOTHER'S NAME", "ANA ADİ", "MOTRERS", "MOTHRERS", "MOTERS", "AFFE", "FFE"],
        "baba_adi": ["BABA ADI", "FATHER'S NAME", "BABA ADİ", "FATNERS", "FATHERS", "FATERS", "BACZ"],
        "dogum_tarihi": ["DOĞUM TARIHI", "DATE OF BIRTH", "DOGUM TARIHI", "DOĞUM TATİHİ"],
        "cinsiyet": ["CİNSİYET", "GENDER", "GANDER"]
    }
    all_labels = [l for labels in label_map.values() for l in labels]
    def find_value_after_label(label_list, lines, min_length=2):
        for i, line in enumerate(lines):
            line_stripped = line.strip().upper()
            for label in label_list:
                label_stripped = label.strip().upper()
                # Eğer etiket 'ADI' ise, tam kelime olarak (word boundary) eşleşmeli
                if label_stripped == 'ADI':
                    if re.search(r'\bADI\b', line_stripped):
                        match = True
                    else:
                        match = False
                else:
                    match = (line_stripped == label_stripped or label_stripped in line_stripped)
                if match:
                    for j in range(1, 4):
                        if i+j < len(lines):
                            candidate = lines[i+j].strip()
                            candidate_upper = candidate.upper()
                            if (
                                candidate_upper not in all_labels
                                and len(candidate) >= min_length
                                and candidate not in ["-", "(", ")", "(S)"]
                                and not candidate.strip().startswith(('/', ':', '-'))
                                and re.match(r'^[A-Za-zÇĞİÖŞÜçğıöşü ]+$', candidate)
                            ):
                                return candidate
                    break
        return ""
    # Ad, soyad, ana adı, baba adı
    fields["ad"] = find_value_after_label(label_map["ad"], lines, min_length=2)
    fields["soyad"] = find_value_after_label(label_map["soyad"], lines, min_length=2)
    fields["ana_adi"] = find_value_after_label(label_map["ana_adi"], lines, min_length=4)
    fields["baba_adi"] = find_value_after_label(label_map["baba_adi"], lines, min_length=4)
    # Doğum tarihi etiketten sonra gelen ilk tarih formatı
    for i, line in enumerate(lines):
        upper = line.upper()
        for label in label_map["dogum_tarihi"]:
            if label in upper:
                for j in range(1, 4):
                    if i+j < len(lines):
                        candidate = lines[i+j].strip()
                        match = re.search(r"(\d{2}[./-]\d{2}[./-]\d{4})", candidate)
                        if match:
                            fields["dogum_tarihi"] = match.group(1)
                            break
                break
        if fields["dogum_tarihi"]:
            break
    # Eğer etiketten sonra bulunamazsa, regex ile tüm satırlarda ara
    if not fields["dogum_tarihi"]:
        for line in lines:
            match = re.search(r"(\d{2}[./-]\d{2}[./-]\d{4})", line)
            if match:
                fields["dogum_tarihi"] = match.group(1)
                break
    # Cinsiyet etiketten sonra gelen ilk uygun değer
    def normalize_gender(val):
        v = val.replace(" ", "").replace("-", "/").replace(".", "/")
        v = v.replace("\\", "/")
        v = v.upper()
        return v
    erkek_kisaltmalar = ["E/M", "E/M.", "E/M-", "E/M,", "E/M:", "E/M;", "E/M)", "E/M(", "E/M]", "E/M[", "E/M}", "E/M{" ]
    kadin_kisaltmalar = ["K/F", "K/F.", "K/F-", "K/F,", "K/F:", "K/F;", "K/F)", "K/F(", "K/F]", "K/F[", "K/F}", "K/F{" ]
    def is_erkek(val):
        v = normalize_gender(val)
        return v in ["ERKEK", "MALE"] or v.startswith("E/M")
    def is_kadin(val):
        v = normalize_gender(val)
        return v in ["KADIN", "FEMALE"] or v.startswith("K/F")
    for i, line in enumerate(lines):
        upper = line.upper()
        for label in label_map["cinsiyet"]:
            if label in upper:
                for j in range(1, 4):
                    if i+j < len(lines):
                        candidate = lines[i+j].strip().upper()
                        if is_erkek(candidate):
                            fields["cinsiyet"] = "ERKEK"
                            break
                        if is_kadin(candidate):
                            fields["cinsiyet"] = "KADIN"
                            break
                break
        if fields["cinsiyet"]:
            break
    # Eğer etiketten sonra bulunamazsa, satırlarda ara
    if not fields["cinsiyet"]:
        for line in lines:
            upper = line.upper()
            if is_erkek(upper):
                fields["cinsiyet"] = "ERKEK"
                break
            if is_kadin(upper):
                fields["cinsiyet"] = "KADIN"
                break
    # Alanlar kısa veya şüpheli ise boş yap
    for k in fields:
        if fields[k]:
            if k in ["ana_adi", "baba_adi", "ad", "soyad"]:
                if (
                    len(fields[k]) < (4 if k in ["ana_adi", "baba_adi"] else 2)
                    or fields[k].upper() in all_labels
                    or fields[k] in ["-", "(", ")", "(S)"]
                    or fields[k].strip().startswith(('/', ':', '-'))
                    or not re.match(r'^[A-Za-zÇĞİÖŞÜçğıöşü ]+$', fields[k])
                ):
                    fields[k] = ""
            else:
                if (
                    len(fields[k]) < 2
                    or fields[k].upper() in all_labels
                    or fields[k] in ["-", "(", ")", "(S)"]
                    or fields[k].strip().startswith(('/', ':', '-'))
                ):
                    fields[k] = ""
    return fields

def extract_face_base64(image):
    # Yüz tespiti ve kırpma
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=3, minSize=(30, 30))
    print("Yüz tespit edilen kutular:", faces, "Toplam yüz:", len(faces))
    if len(faces) > 0:
        # En soldaki yüz kutusunu seç
        x, y, w, h = sorted(faces, key=lambda rect: rect[0])[0]
        cx = x + w // 2
        cy = y + h // 2
        side = int(max(w, h) * 1.3)
        x1 = max(cx - side // 2, 0)
        y1 = max(cy - side // 2, 0)
        x2 = min(x1 + side, image.shape[1])
        y2 = min(y1 + side, image.shape[0])
        x1 = max(x2 - side, 0)
        y1 = max(y2 - side, 0)
        face_crop = image[y1:y2, x1:x2]
        pil_face = Image.fromarray(face_crop)
        buf = io.BytesIO()
        pil_face.save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    return ""

def extract_card_crop_base64(image):
    # Sadece YOLO ile kart tespiti ve kırpma
    try:
        model_path = '/Users/furkanozm/Desktop/ocr-uploader/myfirstproject/runs/detect/train5/weights/last.pt'  # Kendi model yolunu kullan
        print(f"YOLO model yolu: {model_path}")
        model = YOLO(model_path)
        print("YOLO modeli yüklendi, inference başlatılıyor...")
        results = model(image)
        print("YOLO inference tamamlandı. Sonuçlar işleniyor...")
        for r in results:
            for box in r.boxes:
                print(f"YOLO tespit edilen kutu: {box.xyxy[0]}, skor: {box.conf[0]}")
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                card_crop = image[y1:y2, x1:x2]
                pil_crop = Image.fromarray(card_crop)
                buf = io.BytesIO()
                pil_crop.save(buf, format="PNG")
                print("YOLO ile kart tespit edildi ve kırpıldı.")
                return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
        print("YOLO ile hiç kutu tespit edilemedi.")
        return ""
    except Exception as e:
        print(f"YOLO ile kart tespitinde hata: {e}")
        return ""

@app.post("/ocr")
async def ocr_kimlik(
    front: UploadFile = File(...),
    back: UploadFile = File(None)
):
    try:
        # Ön yüz OCR ve fotoğraf
        pil_img_front = Image.open(front.file).convert("RGB")
        img_front = np.array(pil_img_front)
        lines_front = [line for line in reader.readtext(img_front, detail=0, paragraph=False) if isinstance(line, str)]
        print("OCR FRONT LINES:", lines_front)
        fields_front = extract_fields(lines_front)
        print("FIELDS FRONT:", fields_front)
        print("CİNSİYET FRONT:", fields_front.get("cinsiyet"))
        face_b64 = extract_face_base64(img_front)
        card_crop_front = extract_card_crop_base64(img_front)
        # Arka yüz OCR
        fields_back = {}
        lines_back = []
        card_crop_back = ""
        if back is not None:
            pil_img_back = Image.open(back.file).convert("RGB")
            img_back = np.array(pil_img_back)
            lines_back = [line for line in reader.readtext(img_back, detail=0, paragraph=False) if isinstance(line, str)]
            print("OCR BACK LINES:", lines_back)
            fields_back = extract_fields(lines_back)
            print("FIELDS BACK:", fields_back)
            print("CİNSİYET BACK:", fields_back.get("cinsiyet"))
            card_crop_back = extract_card_crop_base64(img_back)
            print("Arka yüz kırpılmış base64 uzunluğu:", len(card_crop_back))
        # Alanları birleştir (öncelik: ön yüz, sonra arka yüz)
        result = {}
        for key in ["tckn", "ad", "soyad", "ana_adi", "baba_adi", "dogum_tarihi", "cinsiyet"]:
            result[key] = fields_front.get(key, "") or fields_back.get(key, "") or ""
        # Arka yüzde cinsiyet gibi alanlar ön yüzde doluysa, arka yüzde boş bırak
        if result["cinsiyet"]:
            fields_back["cinsiyet"] = ""
        result["photo"] = face_b64
        result["avatar_base64"] = face_b64
        result["card_crop_front"] = card_crop_front
        result["cropped_card_base64"] = card_crop_front
        result["card_crop_back"] = card_crop_back
        result["cropped_card_back_base64"] = card_crop_back
        result["ocr_raw_front"] = "\n".join([l for l in lines_front if isinstance(l, str)])
        if back is not None:
            result["ocr_raw_back"] = "\n".join([str(v) for v in fields_back.values() if isinstance(v, str) and v])
        return {"success": True, "data": result}
    except Exception as e:
        return {"success": False, "error": str(e)}