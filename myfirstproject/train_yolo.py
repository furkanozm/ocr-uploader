from ultralytics import YOLO

model = YOLO("yolov8n.pt")  # Modeli önce tanımla

model.train(
    data="/Users/furkanozm/Desktop/ocr-uploader/myfirstproject/data.yaml",  # <-- DÜZELTİLDİ
    epochs=50,
    imgsz=640,
    batch=8,
    device="cpu"
)
