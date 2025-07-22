"use client";
import React, { useRef, useState, useEffect } from "react";

type Step = "front" | "back" | "done";

export default function CustomCamera({
  onCapture,
}: {
  onCapture?: (images: { front: string; back: string }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState<Step>("front");
  const [images, setImages] = useState<{ front: string | null; back: string | null }>({
    front: null,
    back: null,
  });
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kamerayı başlat
  const startCamera = async () => {
    setError(null);
    if (streaming) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setStreaming(true);
      }
    } catch (err) {
      setError("Kamera erişimi reddedildi veya bulunamadı. Lütfen tarayıcıdan izin verin ve HTTPS/localhost kullanın.");
    }
  };

  // Fotoğraf çek
  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video.videoWidth || !video.videoHeight) {
      setError("Kamera hazır değil.");
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    setImages((prev) => {
      const updated = { ...prev, [step]: dataUrl };
      if (step === "front") setStep("back");
      else setStep("done");
      return updated;
    });
  };

  // Kamera akışını durdur
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
      setStreaming(false);
    }
  };

  // Bileşen unmount olunca kamerayı kapat
  useEffect(() => {
    return () => stopCamera();
  }, []);

  // step 'done' olduğunda ve iki fotoğraf da çekildiğinde callback'i tetikle
  useEffect(() => {
    if (step === "done" && images.front && images.back && onCapture) {
      onCapture({ front: images.front, back: images.back });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, images.front, images.back]);

  return (
    <div style={{ textAlign: "center" }}>
      {error && <div className="text-red-600 font-medium mb-2">{error}</div>}
      {step !== "done" && (
        <>
          <div style={{ position: "relative", display: "inline-block" }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              style={{
                width: "100%",
                maxWidth: 320,
                borderRadius: 12,
                background: "#222",
                minHeight: 180,
              }}
            />
            {/* Adım yönlendirme yazısı video üstünde, ortalanmış ve yarı saydam arka planla */}
            <div
              style={{
                position: "absolute",
                top: 12,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(0,0,0,0.55)",
                color: "#fff",
                padding: "6px 18px",
                borderRadius: 16,
                fontSize: 16,
                fontWeight: 500,
                zIndex: 2,
                pointerEvents: "none",
                letterSpacing: 0.2,
              }}
            >
              {step === "front" ? "Ön yüzü çekin" : "Arka yüzü çekin"}
            </div>
            {streaming && (
              <button
                onClick={capture}
                style={{
                  position: "absolute",
                  bottom: 16,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: "50%",
                  width: 64,
                  height: 64,
                  fontSize: 24,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-label="Fotoğraf Çek"
              >
                📸
              </button>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {!streaming ? (
              <button className="btn btn-primary w-full" onClick={startCamera}>
                Kamerayı Aç
              </button>
            ) : (
              <button className="btn btn-danger w-full" onClick={stopCamera}>
                Kamerayı Kapat
              </button>
            )}
          </div>
        </>
      )}
      <canvas ref={canvasRef} style={{ display: "none" }} />
      {step === "done" && (
        <div>
          {images.front && (
            <>
              <h4>Ön Yüz</h4>
              <img src={images.front} alt="Ön Yüz" width={200} className="rounded shadow" />
            </>
          )}
          {images.back && (
            <>
              <h4>Arka Yüz</h4>
              <img src={images.back} alt="Arka Yüz" width={200} className="rounded shadow" />
            </>
          )}
          <div>
            <button
              className="btn btn-secondary mt-2"
              onClick={() => {
                setStep("front");
                setImages({ front: null, back: null });
                setError(null);
                startCamera();
              }}
            >
              Tekrar Çek
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 