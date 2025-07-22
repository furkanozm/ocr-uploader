"use client"

import { useEffect, useState, useRef } from "react"
import Image from "next/image"
import { CreditCard, Upload } from "lucide-react"
import { CheckCircle, User } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import CustomCamera from "@/components/CustomCamera";
import { useIsMobile } from "@/hooks/use-mobile";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { jsPDF } from "jspdf";

// Backend'den dönen veri tipi
interface OcrResult {
  fields: {
    tckn: string
    ad: string
    soyad: string
    ana_adi: string
    baba_adi: string
    dogum_tarihi: string
    cinsiyet?: string
  }
  warnings: string[]
  avatar_base64: string // data:image/png;base64,...
  cropped_card_base64: string // ön yüz
  cropped_card_back_base64?: string // arka yüz
}

export default function OcrUploaderPage() {
  const [showCropped, setShowCropped] = useState(false);
  // Mobil için
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  // Masaüstü için
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false);
  const isMobile = useIsMobile();
  const [accordionOpen, setAccordionOpen] = useState({ front: true, back: true });
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { setIsClient(true); }, []);

  // Sonuçlar gelince accordionları kapat (sadece masaüstü için)
  useEffect(() => {
    if (ocrResult && !isMobile) setAccordionOpen({ front: false, back: false });
  }, [ocrResult, isMobile]);

  // Kamera ile çekilen fotoğrafları al (mobil)
  const handleCameraCapture = (images: { front: string; back: string }) => {
    setFrontImage(images.front);
    setBackImage(images.back);
  };

  // Dosya seçildiğinde state'e al (masaüstü)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, side: "front" | "back") => {
    if (e.target.files && e.target.files[0]) {
      if (side === "front") setFrontFile(e.target.files[0])
      else setBackFile(e.target.files[0])
    }
  }

  // Yükle ve OCR'a gönder
  const handleOcrUpload = async () => {
    setLoading(true)
    setError(null)
    setOcrResult(null)
    setProgress(10);
    if (progressRef.current) clearInterval(progressRef.current);
    progressRef.current = setInterval(() => {
      setProgress((old) => (old < 90 ? old + 10 : old));
    }, 500);
    const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
    if (isMobile) {
      // Mobilde base64 ile
      if (!frontImage || !backImage) {
        setError("Lütfen hem ön hem arka yüz fotoğraflarını çekin.")
        setLoading(false)
        return
      }
      try {
        const formData = new FormData()
        // Base64 string'i File'a çevir
        const base64ToFile = (base64: string, filename: string) => {
          const arr = base64.split(",");
          const match = arr[0].match(/:(.*?);/);
          const mime = match ? match[1] : "";
          const bstr = atob(arr[1]);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) u8arr[n] = bstr.charCodeAt(n);
          return new File([u8arr], filename, { type: mime });
        };
        formData.append("front", base64ToFile(frontImage, "front.png"));
        formData.append("back", base64ToFile(backImage, "back.png"));
        const res = await fetch(`${API_URL}/ocr`, {
          method: "POST",
          body: formData,
        })
        const data = await res.json()
        let mainData = data;
        if (data.data) mainData = data.data;
        if (!res.ok) {
          setError(mainData?.detail || mainData?.error || "OCR işlemi başarısız oldu.")
        } else if (mainData.fields || mainData.tckn || mainData.ad || mainData.soyad) {
          setOcrResult(
            mainData.fields
              ? mainData
              : {
                  fields: {
                    tckn: mainData.tckn || "",
                    ad: mainData.ad || "",
                    soyad: mainData.soyad || "",
                    ana_adi: mainData.ana_adi || "",
                    baba_adi: mainData.baba_adi || "",
                    dogum_tarihi: mainData.dogum_tarihi || "",
                    cinsiyet: mainData.cinsiyet || ""
                  },
                  warnings: mainData.warnings || [],
                  avatar_base64: mainData.avatar_base64 || "",
                  cropped_card_base64: mainData.cropped_card_base64 || "",
                  cropped_card_back_base64: mainData.cropped_card_back_base64 || "",
                }
          )
        } else {
          setError("Kimlikten veri okunamadı veya eksik veri döndü.")
        }
      } catch (err: any) {
        setError(err.message || "Bilinmeyen hata")
      } finally {
        if (progressRef.current) clearInterval(progressRef.current);
        setProgress(100);
        setTimeout(() => setLoading(false), 400);
      }
    } else {
      // Masaüstü için File ile
    if (!frontFile || !backFile) {
      setError("Lütfen hem ön hem arka yüz dosyalarını seçin.")
      setLoading(false)
      return
    }
    try {
      const formData = new FormData()
      formData.append("front", frontFile)
      formData.append("back", backFile)
      const res = await fetch(`${API_URL}/ocr`, {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      let mainData = data;
      if (data.data) mainData = data.data;
      if (!res.ok) {
        setError(mainData?.detail || mainData?.error || "OCR işlemi başarısız oldu.")
      } else if (mainData.fields || mainData.tckn || mainData.ad || mainData.soyad) {
        setOcrResult(
          mainData.fields
            ? mainData
            : {
                fields: {
                  tckn: mainData.tckn || "",
                  ad: mainData.ad || "",
                  soyad: mainData.soyad || "",
                  ana_adi: mainData.ana_adi || "",
                  baba_adi: mainData.baba_adi || "",
                  dogum_tarihi: mainData.dogum_tarihi || "",
                  cinsiyet: mainData.cinsiyet || ""
                },
                warnings: mainData.warnings || [],
                avatar_base64: mainData.avatar_base64 || "",
                cropped_card_base64: mainData.cropped_card_base64 || "",
                cropped_card_back_base64: mainData.cropped_card_back_base64 || "",
              }
        )
      } else {
        setError("Kimlikten veri okunamadı veya eksik veri döndü.")
      }
    } catch (err: any) {
      setError(err.message || "Bilinmeyen hata")
    } finally {
      if (progressRef.current) clearInterval(progressRef.current);
      setProgress(100);
      setTimeout(() => setLoading(false), 400);
      }
    }
  }

  // Alanları eksik veya şüpheli kontrolü
  const isFieldMissing = (field: string) => !field || field.length < 2

  useEffect(() => {
    console.log('OCR RESULT:', ocrResult);
  }, [ocrResult]);

  // jsPDF ile PDF oluşturucu
  const handleDownloadPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    // Her iki görseli de tek sayfada yanyana ekle
    let x = 10;
    if (ocrResult?.cropped_card_base64) {
      doc.addImage(ocrResult.cropped_card_base64, "PNG", x, 20, 90, 60);
      x += 100;
    }
    if (ocrResult?.cropped_card_back_base64) {
      doc.addImage(ocrResult.cropped_card_back_base64, "PNG", x, 20, 90, 60);
    }
    doc.save("kimlikarkalionlü.pdf");
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center font-sans">
      {/* Header tamamen kaldırıldı */}

      {/* Main content */}
      <main className="flex-1 w-full max-w-4xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          {/* Title */}
        <div className="flex flex-col items-center gap-3 mb-6 mt-4">
          <h1 className="text-2xl font-bold text-gray-800 text-center w-full">Kimlik OCR Yükleyici</h1>
          </div>

          {/* Tabs */}
          <div className="w-full max-w-4xl mx-auto mb-8 flex flex-col items-center">
            <div className="flex items-center space-x-4 mb-8">
              <Label htmlFor="ocr-switch" className="text-gray-700 font-medium">Bilgiler</Label>
              <Switch
                id="ocr-switch"
                checked={showCropped}
                onCheckedChange={setShowCropped}
              />
              <Label htmlFor="ocr-switch" className="text-gray-700 font-medium">Kırpılmış Görseller</Label>
            </div>
            {!showCropped ? (
              <div className="flex flex-col items-center gap-6 w-full">
                {/* Avatar */}
                <Avatar className="w-24 h-24 border-4 border-white shadow-md">
                  {ocrResult?.avatar_base64 ? (
                    <AvatarImage src={ocrResult.avatar_base64} alt="User Avatar" />
                  ) : (
                    <AvatarImage src="/placeholder.svg?height=96&width=96" alt="User Avatar" />
                  )}
                  <AvatarFallback>CN</AvatarFallback>
                </Avatar>

                {/* Mobilde CustomCamera, masaüstünde dosya yükleme alanları */}
                {isClient && (
                  <div className="flex flex-col gap-6 w-full max-w-md mt-2">
                    {isMobile ? (
                      <>
                        <CustomCamera onCapture={handleCameraCapture} />
                      </>
                    ) : (
                      <Accordion type="multiple" value={Object.entries(accordionOpen).filter(([k, v]) => v).map(([k]) => k)} onValueChange={vals => setAccordionOpen({ front: vals.includes('front'), back: vals.includes('back') })}>
                        <AccordionItem value="front">
                          <AccordionTrigger>Ön Yüz Yükle</AccordionTrigger>
                          <AccordionContent>
                            <div className="flex flex-col items-center w-full">
                              <label
                                htmlFor="front-upload"
                                className="w-full p-4 border-2 border-dashed border-blue-500 bg-blue-50 rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-blue-100 transition-colors relative"
                              >
                                {frontFile && (
                                  <CheckCircle className="absolute top-2 right-2 text-green-600 w-6 h-6" />
                                )}
                                <Upload className="w-8 h-8 text-blue-600" />
                                <span className="text-blue-600 font-medium text-center text-xs">Ön Yüz Fotoğrafı veya Dosya Seçin</span>
                                <input
                                  id="front-upload"
                                  type="file"
                                  accept="image/*"
                                  className="sr-only"
                                  onChange={e => handleFileChange(e, "front")}
                                />
                              </label>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="back">
                          <AccordionTrigger>Arka Yüz Yükle</AccordionTrigger>
                          <AccordionContent>
                            <div className="flex flex-col items-center w-full">
                              <label
                                htmlFor="back-upload"
                                className="w-full p-4 border-2 border-dashed border-green-500 bg-green-50 rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-green-100 transition-colors relative"
                              >
                                {backFile && (
                                  <CheckCircle className="absolute top-2 right-2 text-green-600 w-6 h-6" />
                                )}
                                <Upload className="w-8 h-8 text-green-600" />
                                <span className="text-green-600 font-medium text-center text-xs">Arka Yüz Fotoğrafı veya Dosya Seçin</span>
                                <input
                                  id="back-upload"
                                  type="file"
                                  accept="image/*"
                                  className="sr-only"
                                  onChange={e => handleFileChange(e, "back")}
                                />
                              </label>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    )}
                  </div>
                )}

                {/* OCR'a gönder butonu */}
                <Button
                  className="w-full max-w-md bg-blue-600 text-white hover:bg-blue-700 shadow-sm mt-2"
                  onClick={handleOcrUpload}
                  disabled={loading || (isMobile ? (!frontImage || !backImage) : (!frontFile || !backFile))}
                >
                  {loading ? "Yükleniyor..." : "Kimlikten Oku"}
                </Button>
                {loading && (
                  <div className="w-full max-w-md px-2 mt-4 bg-white rounded border border-black/20 p-1">
                    <div className="relative w-full h-2 bg-gray-200 rounded">
                      <div
                        className="absolute left-0 top-0 h-2 bg-[#14213d] rounded transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Hata veya uyarı */}
                {error && <div className="text-red-600 font-medium mt-2">{error}</div>}
                {ocrResult?.warnings && ocrResult.warnings.length > 0 && (
                  <div className="text-yellow-600 font-medium mt-2">
                    {ocrResult.warnings.map((w, i) => (
                      <div key={i}>{w}</div>
                    ))}
                  </div>
                )}

                {/* OCR Sonuç Kartı */}
                {ocrResult?.fields && (
                  <Card className="w-full max-w-md p-6 mt-4 shadow-md rounded-lg bg-white">
                    <CardContent className="p-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                      <div className="text-gray-600 font-medium">Ad / Name</div>
                      <div className={cn("text-gray-800 font-semibold", isFieldMissing(ocrResult?.fields?.ad) && "text-red-600")}>{ocrResult?.fields?.ad || "-"}</div>

                      <div className="text-gray-600 font-medium">Soyad / Surname</div>
                      <div className={cn("text-gray-800 font-semibold", isFieldMissing(ocrResult?.fields?.soyad) && "text-red-600")}>{ocrResult?.fields?.soyad || "-"}</div>

                      <div className="text-gray-600 font-medium">Ana Adı / Mother's Name</div>
                      <div className={cn("text-gray-800 font-semibold", isFieldMissing(ocrResult?.fields?.ana_adi) && "text-red-600")}>{ocrResult?.fields?.ana_adi || "-"}</div>

                      <div className="text-gray-600 font-medium">Baba Adı / Father's Name</div>
                      <div className={cn("text-gray-800 font-semibold", isFieldMissing(ocrResult?.fields?.baba_adi) && "text-red-600")}>{ocrResult?.fields?.baba_adi || "-"}</div>

                      <div className="text-gray-600 font-medium">TCKN</div>
                      <div className={cn("text-gray-800 font-semibold", isFieldMissing(ocrResult?.fields?.tckn) && "text-red-600")}>{ocrResult?.fields?.tckn || "-"}</div>

                      <div className="text-gray-600 font-medium">Doğum Tarihi / Date of Birth</div>
                      <div className={cn("text-gray-800 font-semibold", isFieldMissing(ocrResult?.fields?.dogum_tarihi) && "text-red-600")}>{ocrResult?.fields?.dogum_tarihi || "-"}</div>

                      <div className="text-gray-600 font-medium">Cinsiyet / Gender</div>
                      <div className={cn("text-gray-800 font-semibold", isFieldMissing(ocrResult?.fields?.cinsiyet || "") && "text-red-600")}>{ocrResult?.fields?.cinsiyet || "-"}</div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-8 min-h-[300px] w-full">
                <div className="flex flex-row gap-6">
                  {ocrResult?.cropped_card_base64 && (
                    <Card className="flex flex-col items-center gap-2 p-4 shadow-md">
                      <span className="flex items-center gap-1 text-gray-700 font-medium text-base">
                        <CreditCard className="w-4 h-4 mr-1 text-blue-600" /> Kırpılmış Ön Yüz
                      </span>
                      <Image
                        src={ocrResult.cropped_card_base64}
                        alt="Kırpılmış Ön Yüz"
                        width={220}
                        height={140}
                        className="rounded-lg border shadow"
                      />
                    </Card>
                  )}
                  {ocrResult?.cropped_card_back_base64 && (
                    <Card className="flex flex-col items-center gap-2 p-4 shadow-md">
                      <span className="flex items-center gap-1 text-gray-700 font-medium text-base">
                        <CreditCard className="w-4 h-4 mr-1 text-green-600" /> Kırpılmış Arka Yüz
                      </span>
                      <Image
                        src={ocrResult.cropped_card_back_base64}
                        alt="Kırpılmış Arka Yüz"
                        width={220}
                        height={140}
                        className="rounded-lg border shadow"
                      />
                    </Card>
                  )}
                </div>
                {/* PDF İndir Butonu (pdfmake) */}
                <Button
                  className="mt-4"
                  onClick={handleDownloadPdf}
                  disabled={
                    !ocrResult?.cropped_card_base64 && !ocrResult?.cropped_card_back_base64
                  }
                >
                  PDF Olarak İndir
                </Button>
              </div>
            )}
          </div>
      </main>
    </div>
  )
} 