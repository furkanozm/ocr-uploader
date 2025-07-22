FROM python:3.11-slim

# Sistem kütüphanelerini yükle
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Proje dosyalarını kopyala
COPY . /app

# Python bağımlılıklarını yükle
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# Uygulamayı başlat
CMD ["python", "main.py"] 