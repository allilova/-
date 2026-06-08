/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Upload, 
  Image as ImageIcon, 
  Sliders, 
  Eye, 
  CheckCircle, 
  RefreshCw, 
  Table, 
  AlertCircle, 
  Plus, 
  RotateCcw, 
  Sparkles, 
  Layers, 
  Settings2, 
  FileText,
  ChevronRight,
  HelpCircle,
  TrendingUp,
  SlidersHorizontal,
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  toGrayscale, 
  boxBlur, 
  threshold, 
  otsuThreshold, 
  segmentHSV, 
  morphOpening, 
  morphClosing, 
  erode, 
  dilate, 
  findConnectedComponents, 
  drawMarks, 
  ExtractedObject 
} from "./utils/cv";
import { generatePresetDataUrl } from "./utils/presets";

export default function App() {
  // Preset list
  const presets = [
    { id: "coins", name: "Монети", desc: "Разпилени монети с различен цвят/размер (идеално за тестване на Watershed)", type: 'coins' as const },
    { id: "screws", name: "Винтове и шайби", desc: "Детайли с различни геометрични пропорции (високо съотношение)", type: 'screws' as const },
    { id: "caps", name: "Цветни капачки", desc: "Контрастни пластмасови капачки (идеално за HSV цветова сегментация)", type: 'caps' as const }
  ];

  // Application Pipeline Steps
  // 1: Зареждане | 2: Сегментация | 3: Морфология | 4: Анализ и Броене
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Core image states
  const [imageSrc, setImageSrc] = useState<string>("");
  const [selectedPreset, setSelectedPreset] = useState<string>("coins");
  
  // Pipeline settings
  const [blurKernel, setBlurKernel] = useState<number>(3); // 0=none, 3=box blur
  const [segmentMethod, setSegmentMethod] = useState<'manual' | 'otsu' | 'hsv'>('otsu');
  const [manualThreshold, setManualThreshold] = useState<number>(128);
  const [calculatedOtsu, setCalculatedOtsu] = useState<number>(128);
  
  // HSV tuning
  const [hsvRange, setHsvRange] = useState({
    hMin: 0, hMax: 100, // by default looking for yellow-greens
    sMin: 15, sMax: 100,
    vMin: 20, vMax: 100
  });

  // Morphological parameters
  const [morphOp, setMorphOp] = useState<'none' | 'erode' | 'dilate' | 'opening' | 'closing'>('opening');
  const [splitTouching, setSplitTouching] = useState<boolean>(true);

  // Extraction outcomes
  const [extractedObjects, setExtractedObjects] = useState<ExtractedObject[]>([]);
  const [manualPoints, setManualPoints] = useState<{ x: number; y: number }[]>([]);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [mergedWarning, setMergedWarning] = useState<boolean>(false);

  // NEW: Part 2 Custom Filters & Calibration State
  const [minAreaFilter, setMinAreaFilter] = useState<number>(0);
  const [maxAreaFilter, setMaxAreaFilter] = useState<number>(10000);
  const [minCircularityFilter, setMinCircularityFilter] = useState<number>(0.0);
  const [calibratedObjectId, setCalibratedObjectId] = useState<number | null>(null);
  const [calibratedObjectRealSize, setCalibratedObjectRealSize] = useState<string>("24.25");
  const [pxToMmScale, setPxToMmScale] = useState<number | null>(null);

  // Derived state: objects filtering
  const filteredObjects = extractedObjects.filter(obj => {
    return obj.area >= minAreaFilter && 
           obj.area <= maxAreaFilter && 
           obj.circularity >= minCircularityFilter;
  });

  // Visualization overlays
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [showBBoxes, setShowBBoxes] = useState<boolean>(true);

  // Remote AI Report
  const [aiReport, setAiReport] = useState<string>("");
  const [loadingAi, setLoadingAi] = useState<boolean>(false);
  const [errorAi, setErrorAi] = useState<string>("");

  // Refs for drawing
  const originalImageRef = useRef<HTMLImageElement>(null);
  const processCanvasRef = useRef<HTMLCanvasElement>(null);
  const finalCanvasRef = useRef<HTMLCanvasElement>(null);

  // Trigger preset generation on mount
  useEffect(() => {
    loadPreset("coins");
  }, []);

  // Recalculate Otsu and image states whenever image or settings change
  useEffect(() => {
    runSegmentationPipeline();
  }, [imageSrc, blurKernel, segmentMethod, manualThreshold, hsvRange, morphOp, splitTouching]);

  // Redraw final visual overlays whenever counts, manual points or highlights change
  useEffect(() => {
    redrawFinalCanvas();
  }, [filteredObjects, manualPoints, highlightedId, showLabels, showBBoxes]);

  // Load a preset
  const loadPreset = (presetId: string) => {
    setSelectedPreset(presetId);
    const found = presets.find(p => p.id === presetId);
    if (found) {
      const dataUrl = generatePresetDataUrl(found.type);
      setImageSrc(dataUrl);
      setManualPoints([]);
      setAiReport("");
      setErrorAi("");

      // Adjust default settings depending on preset for best initial demo outcome
      if (presetId === "coins") {
        setSegmentMethod("otsu");
        setMorphOp("opening");
        setSplitTouching(true);
      } else if (presetId === "screws") {
        setSegmentMethod("otsu");
        setMorphOp("closing");
        setSplitTouching(false);
      } else if (presetId === "caps") {
        setSegmentMethod("hsv");
        // Look for red/orange/yellow/blue/green
        setHsvRange({ hMin: 0, hMax: 360, sMin: 20, sMax: 100, vMin: 20, vMax: 100 });
        setMorphOp("opening");
        setSplitTouching(false);
      }
    }
  };

  // Upload an image file
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImageSrc(event.target.result as string);
          setSelectedPreset("custom");
          setManualPoints([]);
          setAiReport("");
          setErrorAi("");
          // Reset to standard values
          setSegmentMethod("otsu");
          setMorphOp("opening");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Run the Core CV Image processing Pipeline
  const runSegmentationPipeline = () => {
    const imgElement = originalImageRef.current;
    const canvas = processCanvasRef.current;
    if (!imgElement || !canvas || !imageSrc) return;
    if (!imgElement.complete || imgElement.naturalWidth === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 1. Draw source image on canvas to extract pixels
    canvas.width = imgElement.naturalWidth || imgElement.width || 450;
    canvas.height = imgElement.naturalHeight || imgElement.height || 300;
    ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rgbData = imgData.data;
    const width = canvas.width;
    const height = canvas.height;

    // 2. Preprocess: Gray Scale
    let gray = toGrayscale(imgData);

    // 3. Preprocess: Noise removal (box blur / gaussian approximation)
    if (blurKernel > 0) {
      gray = boxBlur(gray, width, height);
    }

    // 4. Segmentation
    let binary: Uint8ClampedArray;
    let computedThresholdValue = manualThreshold;

    if (segmentMethod === 'otsu') {
      computedThresholdValue = otsuThreshold(gray);
      setCalculatedOtsu(computedThresholdValue);
      binary = threshold(gray, computedThresholdValue);
    } else if (segmentMethod === 'manual') {
      binary = threshold(gray, manualThreshold);
    } else {
      // HSV range segmentation (compares to rgbData)
      binary = segmentHSV(
        rgbData,
        hsvRange.hMin, hsvRange.hMax,
        hsvRange.sMin, hsvRange.sMax,
        hsvRange.vMin, hsvRange.vMax
      );
    }

    // 5. Morphological Operations
    let morphBinary = new Uint8ClampedArray(binary);
    if (morphOp === 'erode') {
      morphBinary = erode(binary, width, height);
    } else if (morphOp === 'dilate') {
      morphBinary = dilate(binary, width, height);
    } else if (morphOp === 'opening') {
      morphBinary = morphOpening(binary, width, height);
    } else if (morphOp === 'closing') {
      morphBinary = morphClosing(binary, width, height);
    }

    // 6. Connected Component Extraction & Metrics Analysis
    const { objects, mergedWarning: warning } = findConnectedComponents(
      morphBinary,
      width,
      height,
      rgbData,
      40, // Minimum area pixels to avoid noise counts
      splitTouching // Emulate watershed separation by recursive erosion-isolation
    );

    setExtractedObjects(objects);
    setMergedWarning(warning);

    // Output visual feedback on intermediate process Canvas (black and white segmentation visual)
    const outImgData = ctx.createImageData(width, height);
    for (let i = 0; i < morphBinary.length; i++) {
      const val = morphBinary[i];
      const o = i * 4;
      outImgData.data[o] = val;     // R
      outImgData.data[o + 1] = val; // G
      outImgData.data[o + 2] = val; // B
      outImgData.data[o + 3] = 255; // A
    }
    ctx.putImageData(outImgData, 0, 0);
  };

  // Overlay contours, IDs, and manual counter points onto Final Display canvas
  const redrawFinalCanvas = () => {
    const finalCanvas = finalCanvasRef.current;
    const imgElement = originalImageRef.current;
    if (!finalCanvas || !imgElement || !imageSrc) return;
    if (!imgElement.complete || imgElement.naturalWidth === 0) return;

    finalCanvas.width = imgElement.naturalWidth || imgElement.width || 450;
    finalCanvas.height = imgElement.naturalHeight || imgElement.height || 300;

    drawMarks(
      finalCanvas,
      imgElement,
      filteredObjects,
      highlightedId,
      showLabels,
      showBBoxes,
      manualPoints
    );
  };

  // Capture user click to place manual marker circles
  const handleFinalCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = finalCanvasRef.current;
    if (!canvas) return;

    // Get true click coordinates relative to Canvas bounding box
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    // Filter points clicking too close to existing ones (or let user erase)
    const thresholdDist = 12;
    const existingIndex = manualPoints.findIndex(pt => {
      const dist = Math.sqrt((pt.x - x) ** 2 + (pt.y - y) ** 2);
      return dist < thresholdDist;
    });

    if (existingIndex !== -1) {
      // Erase point if clicked again
      setManualPoints(manualPoints.filter((_, i) => i !== existingIndex));
    } else {
      // Add point
      setManualPoints([...manualPoints, { x, y }]);
    }
  };

  // Call Express API route `/api/analyze` to request an expert Gemini report
  const requestAiAnalysis = async () => {
    setLoadingAi(true);
    setErrorAi("");
    setAiReport("");

    try {
      const finalCanvas = finalCanvasRef.current;
      const base64Image = finalCanvas ? finalCanvas.toDataURL("image/jpeg", 0.75) : imageSrc;

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64Image,
          autoCount: filteredObjects.length,
          manualCount: manualPoints.length || filteredObjects.length, // default fallback
          objectsData: filteredObjects.slice(0, 15), // send first 15 objects metrics for review
          method: segmentMethod === 'otsu' ? 'Otsu Автоматичен Праг' : segmentMethod === 'manual' ? 'Ръчен Праг' : 'Цветова HSV Сегментация',
          params: {
            blurKernel,
            manualThreshold: segmentMethod === 'manual' ? manualThreshold : calculatedOtsu,
            morphOp,
            splitTouching
          }
        }),
      });

      if (!response.ok) {
        throw new Error("Проблем при връзка със сървъра за AI анализ.");
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setAiReport(data.report || "AI докладът е празен.");
    } catch (err: any) {
      setErrorAi(err.message || "Неуспешен опит за контакт с Gemini модела.");
    } finally {
      setLoadingAi(false);
    }
  };

  // Math helper for accuracy percentage
  const autoCount = filteredObjects.length;
  const manualCountVal = manualPoints.length;
  const accuracy = manualCountVal > 0 
    ? Math.max(0, Math.round((1 - Math.abs(autoCount - manualCountVal) / manualCountVal) * 100))
    : 100;

  // NEW: Part 2 Export to CSV function
  const exportToCsv = () => {
    const headers = [
      "ID",
      "Centroid X",
      "Centroid Y",
      "Area (px)",
      "Area (mm2)",
      "Max Dimension (px)",
      "Max Dimension (mm)",
      "Circularity",
      "Average Color (RGB)",
      "Classification"
    ];

    const rows = filteredObjects.map(obj => {
      const maxDimPx = Math.max(obj.bbox.xmax - obj.bbox.xmin, obj.bbox.ymax - obj.bbox.ymin);
      const areaMm2 = pxToMmScale ? (obj.area / (pxToMmScale * pxToMmScale)).toFixed(2) : "N/A";
      const sizeMm = pxToMmScale ? (maxDimPx / pxToMmScale).toFixed(2) : "N/A";
      return [
        obj.id,
        obj.centroidX,
        obj.centroidY,
        obj.area,
        areaMm2,
        maxDimPx,
        sizeMm,
        obj.circularity.toFixed(3),
        `"rgb(${obj.avgColor.join(",")})"`,
        `"${obj.group}"`
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.join(","))
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `object_analysis_export_${Date.now()}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Simple formatting of Markdown blocks parsed line-by-line
  const renderSimpleMarkdown = (text: string) => {
    return text.split("\n").map((line, i) => {
      if (line.startsWith("### ")) {
        return <h4 key={i} className="text-base font-bold text-slate-800 mt-4 mb-2">{line.replace("### ", "")}</h4>;
      }
      if (line.startsWith("## ")) {
        return <h3 key={i} className="text-lg font-bold text-indigo-600 mt-5 mb-2 border-b pb-1">{line.replace("## ", "")}</h3>;
      }
      if (line.startsWith("# ")) {
        return <h2 key={i} className="text-xl font-bold text-indigo-800 mt-6 mb-3">{line.replace("# ", "")}</h2>;
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return <li key={i} className="ml-5 list-disc text-slate-700 text-sm py-0.5">{line.substring(2)}</li>;
      }
      // Bold syntax handling **text**
      if (line.includes("**")) {
        const parts = line.split("**");
        return (
          <p key={i} className="text-slate-700 text-sm my-1.5 leading-relaxed">
            {parts.map((p, pIdx) => pIdx % 2 === 1 ? <strong key={pIdx} className="font-semibold text-slate-950">{p}</strong> : p)}
          </p>
        );
      }
      return <p key={i} className="text-slate-700 text-sm my-1.5 leading-relaxed">{line}</p>;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900" id="main_app_wrapper">
      {/* Invisible HTML image to load source pixel data asynchronously */}
      {imageSrc ? (
        <img 
          ref={originalImageRef} 
          src={imageSrc} 
          alt="Original Hidden Buffer" 
          className="hidden" 
          onLoad={runSegmentationPipeline}
        />
      ) : null}

      {/* Modern, light-colored Top Navigation Header */}
      <header className="border-b border-slate-200 bg-white shadow-xs sticky top-0 z-40" id="header_section">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-100">
              <Layers className="h-5.5 w-5.5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">Анализатор на Обекти</h1>
              <p className="text-xs text-slate-500 font-medium">Система за сегментиране, броене и морфологична класификация | Компютърно зрение</p>
            </div>
          </div>

          {/* Stepper controls */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            {[
              { id: 1, label: "Изображение" },
              { id: 2, label: "Сегментиране" },
              { id: 3, label: "Морфология" },
              { id: 4, label: "Анализ и Броене" }
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setCurrentStep(st.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  currentStep === st.id 
                    ? "bg-white text-indigo-600 shadow-xs" 
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {st.id}. {st.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Container Workspace */}
      <main className="max-w-7xl mx-auto p-4 lg:p-6" id="workspace_main">
        
        {/* Real-time statistics strip at top of dashboard */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" id="stats_strip">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-4">
            <div className="h-11 w-11 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs font-medium text-slate-400 block">Преброени обекти (Auto)</span>
              <strong className="text-2xl font-black text-slate-900">{filteredObjects.length}</strong>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-4">
            <div className="h-11 w-11 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs font-medium text-slate-400 block">Ръчно маркирани</span>
              <strong className="text-2xl font-black text-rose-600">{manualPoints.length || "—"}</strong>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-4">
            <div className="h-11 w-11 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs font-medium text-slate-400 block">Точност съвпадение</span>
              <strong className="text-2xl font-black text-emerald-600">
                {manualPoints.length > 0 ? `${accuracy}%` : "100%"}
              </strong>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-4">
            <div className="h-11 w-11 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs font-medium text-slate-400 block">Симулация сегмент</span>
              <strong className="text-sm font-semibold text-slate-800 capitalize">
                {segmentMethod === 'otsu' ? 'Автоматичен Otsu' : segmentMethod === 'manual' ? `Праг (= ${manualThreshold})` : 'Цветови спектър HSV'}
              </strong>
            </div>
          </div>
        </div>

        {/* Workspace Layout Grid: Left Settings Panel, Right Previews */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="dashboard_grid">
          
          {/* LEFT CONTAINER: Parameter Controls for current pipeline step */}
          <section className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col gap-5 h-fit" id="controls_card">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-indigo-600 font-bold">
                <Sliders className="h-4.5 w-4.5" />
                <span className="text-sm tracking-tight">Параметри на Стъпка {currentStep}</span>
              </div>
              <HelpCircle className="h-4 w-4 text-slate-400 cursor-pointer hover:text-slate-600" />
            </div>

            {/* PIPELINE CONTROLS SWITCH */}
            <AnimatePresence mode="wait">
              
              {/* STEP 1: LOAD IMAGE */}
              {currentStep === 1 && (
                <motion.div
                  key="step-1"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="flex flex-col gap-4"
                >
                  <div>
                    <label className="text-xs font-bold uppercase text-slate-500 block mb-2">1. Избери Дему Сцена за анализ</label>
                    <div className="flex flex-col gap-2.5">
                      {presets.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => loadPreset(preset.id)}
                          className={`p-3 rounded-xl text-left border transition-all ${
                            selectedPreset === preset.id
                              ? "border-indigo-600 bg-indigo-50/50 shadow-2xs"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800">{preset.name}</span>
                            <div className="h-1.5 w-1.5 rounded-full bg-indigo-600" style={{ opacity: selectedPreset === preset.id ? 1 : 0 }} />
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1 leading-normal">{preset.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <label className="text-xs font-bold uppercase text-slate-500 block mb-2">Или качете собствено изображение</label>
                    <div className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-xl p-4 text-center cursor-pointer transition-all bg-slate-50/50 hover:bg-white relative">
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleImageUpload} 
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <Upload className="h-7 w-7 text-slate-400 mx-auto mb-2" />
                      <span className="text-xs font-bold text-slate-700 block">Изберете файл</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">PNG, JPG, BMP до 10MB</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setCurrentStep(2)}
                    className="w-full mt-2 bg-indigo-600 text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-md shadow-indigo-100 hover:bg-indigo-700 flex items-center justify-center gap-1.5"
                  >
                    Продължи към Сегментиране
                    <ChevronRight className="h-4.5 w-4.5" />
                  </button>
                </motion.div>
              )}

              {/* STEP 2: GRAYSCALE & SEGMENTATION */}
              {currentStep === 2 && (
                <motion.div
                  key="step-2"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="flex flex-col gap-4"
                >
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-2">
                      <Settings2 className="h-3.5 w-3.5 text-indigo-500" />
                      Предобработка на Шума
                    </h4>
                    <label className="text-xs text-slate-500 flex justify-between font-medium mb-1.5">
                      <span>Интра-пикселно размиване (Kernel):</span>
                      <span className="font-bold text-indigo-600">{blurKernel === 0 ? "Деактивирано" : `${blurKernel}x${blurKernel} box`}</span>
                    </label>
                    <input 
                      type="range" 
                      min="0" 
                      max="5" 
                      step="1"
                      value={blurKernel} 
                      onChange={(e) => setBlurKernel(parseInt(e.target.value))}
                      className="w-full accent-indigo-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                    />
                    <p className="text-[9px] text-slate-400 mt-1">
                      Филтрира високите честоти (шум) и заглажда краищата на обектите.
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase text-slate-500 block mb-2">Метод за Сегментиране на фона</label>
                    <div className="grid grid-cols-3 gap-1.5 mb-3 bg-slate-100 p-1 rounded-lg">
                      {[
                        { id: 'otsu', label: 'Оцу' },
                        { id: 'manual', label: 'Ръчен' },
                        { id: 'hsv', label: 'HSV' }
                      ].map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setSegmentMethod(item.id as any)}
                          className={`py-1.5 px-2 rounded-md text-[10px] font-bold text-center transition-all ${
                            segmentMethod === item.id 
                              ? "bg-white text-indigo-600 shadow-xs" 
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    {/* Conditional slider panel depending on method selected */}
                    {segmentMethod === 'manual' && (
                      <div className="bg-indigo-50/50 border border-indigo-100 p-3 rounded-xl flex flex-col gap-2">
                        <label className="text-xs font-bold text-slate-700 flex justify-between">
                          <span>Праг за бинаризация:</span>
                          <span className="text-indigo-600 font-black">{manualThreshold}</span>
                        </label>
                        <input 
                          type="range" 
                          min="10" 
                          max="245" 
                          value={manualThreshold} 
                          onChange={(e) => setManualThreshold(parseInt(e.target.value))}
                          className="w-full accent-indigo-600 h-1.5 bg-slate-200 rounded-lg"
                        />
                        <p className="text-[10px] text-slate-500 leading-normal">
                          Скала на сивото [0-255]. Пиксели с яркост над прага се маркират за бял цвят (обект).
                        </p>
                      </div>
                    )}

                    {segmentMethod === 'otsu' && (
                      <div className="bg-amber-50/30 border border-amber-100 p-3 rounded-xl">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                          <span className="text-xs font-bold text-slate-700">Otsu Оптимална сегментация</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-normal">
                          Алгоритъмът изчислява оптималния глобален праг на базата на разпределението на хистограмата (минимизира вътрекласовата дисперсия).
                        </p>
                        <div className="mt-2.5 flex items-center justify-between text-xs font-bold bg-white p-2 border border-amber-200/60 rounded-lg">
                          <span className="text-slate-500">Изчислен оптимален праг (Т):</span>
                          <span className="text-amber-600 text-sm font-black">{calculatedOtsu}</span>
                        </div>
                      </div>
                    )}

                    {segmentMethod === 'hsv' && (
                      <div className="bg-teal-50/30 border border-teal-100 p-3 rounded-xl flex flex-col gap-3">
                        <div className="flex items-center gap-1 text-teal-600 font-bold text-xs mb-1">
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          <span>Настройки за HSV спектър</span>
                        </div>
                        
                        <div>
                          <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-1">
                            <span>Тон (Hue): {hsvRange.hMin}° - {hsvRange.hMax}°</span>
                          </div>
                          <div className="flex gap-2 items-center">
                            <input 
                              type="range" min="0" max="360" value={hsvRange.hMin}
                              onChange={(e) => setHsvRange({...hsvRange, hMin: parseInt(e.target.value)})}
                              className="w-full accent-teal-600 h-1 bg-slate-200"
                            />
                            <input 
                              type="range" min="0" max="360" value={hsvRange.hMax}
                              onChange={(e) => setHsvRange({...hsvRange, hMax: parseInt(e.target.value)})}
                              className="w-full accent-teal-600 h-1 bg-slate-200"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-1">
                            <span>Наситеност (Sat): {hsvRange.sMin}% - {hsvRange.sMax}%</span>
                          </div>
                          <div className="flex gap-2 items-center">
                            <input 
                              type="range" min="0" max="100" value={hsvRange.sMin}
                              onChange={(e) => setHsvRange({...hsvRange, sMin: parseInt(e.target.value)})}
                              className="w-full accent-teal-600 h-1 bg-slate-200"
                            />
                            <input 
                              type="range" min="0" max="100" value={hsvRange.sMax}
                              onChange={(e) => setHsvRange({...hsvRange, sMax: parseInt(e.target.value)})}
                              className="w-full accent-teal-600 h-1 bg-slate-200"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-1">
                            <span>Яркост (Value): {hsvRange.vMin}% - {hsvRange.vMax}%</span>
                          </div>
                          <div className="flex gap-2 items-center">
                            <input 
                              type="range" min="0" max="100" value={hsvRange.vMin}
                              onChange={(e) => setHsvRange({...hsvRange, vMin: parseInt(e.target.value)})}
                              className="w-full accent-teal-600 h-1 bg-slate-200"
                            />
                            <input 
                              type="range" min="0" max="100" value={hsvRange.vMax}
                              onChange={(e) => setHsvRange({...hsvRange, vMax: parseInt(e.target.value)})}
                              className="w-full accent-teal-600 h-1 bg-slate-200"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setCurrentStep(3)}
                    className="w-full bg-indigo-600 text-white text-xs font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 flex items-center justify-center gap-1.5"
                  >
                    Продължи към Морфология
                    <ChevronRight className="h-4.5 w-4.5" />
                  </button>
                </motion.div>
              )}

              {/* STEP 3: MORPHOLOGICAL FILTERING & WATERHSED SPLIT */}
              {currentStep === 3 && (
                <motion.div
                  key="step-3"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="flex flex-col gap-4"
                >
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <label className="text-xs font-bold uppercase text-slate-500 block mb-2">Морфологичен Филтър</label>
                    <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">
                      Филтрите елиминират дребни сегменти (шумови петна), предотвратяват празнини в обектите или сливат микроскопични контури.
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {[
                        { id: 'none', label: 'Няма филтър (Суров праг)', desc: 'Директно преброяване без маски за заглаждане' },
                        { id: 'erode', label: 'Ерозия (Erosion)', desc: 'Намалява контура; срязва лепкави мостове' },
                        { id: 'dilate', label: 'Дилатация (Dilation)', desc: 'Разширява границите; затваря вътрешни дупки' },
                        { id: 'opening', label: 'Отваряне (Opening)', desc: 'Премахва фин фонов шум; филтрира точки' },
                        { id: 'closing', label: 'Затваряне (Closing)', desc: 'Обединява пукнатини и запълва вътрешните кухини' }
                      ].map((op) => (
                        <button
                          key={op.id}
                          onClick={() => setMorphOp(op.id as any)}
                          className={`p-2.5 text-left rounded-lg text-xs transition-all border ${
                            morphOp === op.id 
                              ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-medium" 
                              : "border-slate-100 hover:bg-slate-100/55"
                          }`}
                        >
                          <span className="font-bold block">{op.label}</span>
                          <span className="text-[9px] text-slate-500">{op.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Watershed separator emulator section */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold uppercase text-slate-700">Сегментиране на слепени обекти</label>
                      <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-extrabold bg-indigo-100 text-indigo-700">WATERSHED</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-normal mb-2.5">
                      Разделя допиращите се или частично припокриващи се части чрез геометрична ерозия на горните точки.
                    </p>
                    <label className="flex items-start gap-2.5 cursor-pointer p-2.5 rounded-lg hover:bg-slate-100 transition-all bg-white border border-slate-200">
                      <input 
                        type="checkbox" 
                        checked={splitTouching} 
                        onChange={(e) => setSplitTouching(e.target.checked)}
                        className="mt-0.5 accent-indigo-600 h-4 w-4"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-700 block">Активирай Разделител (Watershed)</span>
                        <span className="text-[9px] text-slate-400 block mt-0.5 leading-normal">
                          Срязва прешлени и лепкави съединения, типични за монети или разпилени гайки.
                        </span>
                      </div>
                    </label>
                  </div>

                  <button
                    onClick={() => setCurrentStep(4)}
                    className="w-full bg-indigo-600 text-white text-xs font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 flex items-center justify-center gap-1.5"
                  >
                    Продължи към Анализ
                    <ChevronRight className="h-4.5 w-4.5" />
                  </button>
                </motion.div>
              )}

              {/* STEP 4: DETAILED EXPORTED METRICS TABLE & AI REPORTS */}
              {currentStep === 4 && (
                <motion.div
                  key="step-4"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="flex flex-col gap-4"
                >
                  <div className="bg-indigo-50/40 border border-indigo-100 p-4 rounded-xl flex flex-col gap-2">
                    <h5 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-indigo-600" />
                      Изкуствен интелект Анализ
                    </h5>
                    <p className="text-[10px] text-slate-600 leading-relaxed">
                      Генерирайте верификационен технически доклад за грешки и прецизиране на параметрите от модела Gemini, анализиращ снимката.
                    </p>
                    
                    <button
                      onClick={requestAiAnalysis}
                      disabled={loadingAi}
                      className="w-full bg-indigo-600 text-white text-[11px] font-bold py-2 px-3 rounded-lg hover:bg-indigo-700 transition-all disabled:opacity-50 inline-flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      {loadingAi ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          Анализиране по Gemini API...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          Активирай Анализ на грешките
                        </>
                      )}
                    </button>
                  </div>

                  {/* Interactive Segmentation Filtration (Part 2) */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-col gap-3">
                    <label className="text-xs font-bold uppercase text-slate-600 block flex items-center justify-between">
                      <span>Динамични Филтри</span>
                      <span className="text-[9px] font-black text-indigo-600">СТЪПКА 4</span>
                    </label>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      Филтрирайте детекции по площ и кръглост в реално време, за да изчистите останалия шум в кадъра.
                    </p>

                    {/* Area filters */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-750">
                        <span>Мин. Площ: <strong className="text-indigo-650">{minAreaFilter} px²</strong></span>
                      </div>
                      <input 
                        type="range"
                        min="0"
                        max="2000"
                        step="10"
                        value={minAreaFilter}
                        onChange={(e) => setMinAreaFilter(parseInt(e.target.value))}
                        className="accent-indigo-600 h-1 text-slate-200 w-full rounded-lg cursor-pointer bg-slate-200"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-750">
                        <span>Макс. Площ: <strong className="text-indigo-650">{maxAreaFilter} px²</strong></span>
                      </div>
                      <input 
                        type="range"
                        min="500"
                        max="20000"
                        step="100"
                        value={maxAreaFilter}
                        onChange={(e) => setMaxAreaFilter(parseInt(e.target.value))}
                        className="accent-indigo-600 h-1 text-slate-200 w-full rounded-lg cursor-pointer bg-slate-200"
                      />
                    </div>

                    {/* Circularity filter */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-750">
                        <span>Мин. Кръглост: <strong className="text-indigo-650">{minCircularityFilter.toFixed(2)}</strong></span>
                      </div>
                      <input 
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={minCircularityFilter}
                        onChange={(e) => setMinCircularityFilter(parseFloat(e.target.value))}
                        className="accent-indigo-600 h-1 text-slate-200 w-full rounded-lg cursor-pointer bg-slate-200"
                      />
                    </div>
                  </div>

                  {/* Physical Scale Calibration (Part 2) */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-col gap-2.5">
                    <label className="text-xs font-bold uppercase text-slate-600 block flex items-center justify-between">
                      <span>Физическо Калибриране</span>
                      <span className="text-[9px] font-black text-emerald-600">ММ МАЩАБ</span>
                    </label>
                    
                    {calibratedObjectId === null ? (
                      <p className="text-[10px] text-slate-400 leading-normal">
                        💡 Изберете конкретен обект от таблицата или графиката вдясно, за да калибрирате мащаба на пресмятане от пиксели в милиметри (мм).
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-lg text-[10px] leading-normal text-indigo-950">
                          Избран обект за калибриране: <strong className="font-bold">Обект #{calibratedObjectId}</strong>
                          <br />
                          Размер на кутията: <strong className="font-bold">
                            {(() => {
                              const obj = extractedObjects.find(o => o.id === calibratedObjectId);
                              if (!obj) return "N/A";
                              const maxDimPx = Math.max(obj.bbox.xmax - obj.bbox.xmin, obj.bbox.ymax - obj.bbox.ymin);
                              return `${maxDimPx} пиксела`;
                            })()}
                          </strong>
                        </div>

                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-slate-700">Реален размер / диаметър в мм:</span>
                          <div className="flex gap-1.5">
                            <input 
                              type="number"
                              value={calibratedObjectRealSize}
                              onChange={(e) => setCalibratedObjectRealSize(e.target.value)}
                              placeholder="напр. 24.25"
                              className="bg-white border border-slate-200 text-xs px-2 py-1.5 rounded-md focus:ring-1 focus:outline-none w-full font-mono font-semibold"
                            />
                            <button
                              onClick={() => {
                                const obj = extractedObjects.find(o => o.id === calibratedObjectId);
                                if (obj) {
                                  const maxDimPx = Math.max(obj.bbox.xmax - obj.bbox.xmin, obj.bbox.ymax - obj.bbox.ymin);
                                  const realSize = parseFloat(calibratedObjectRealSize);
                                  if (realSize > 0) {
                                    setPxToMmScale(maxDimPx / realSize);
                                  }
                                }
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-md transition-all shadow-3xs cursor-pointer flex-shrink-0"
                            >
                              Приложи
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-slate-500 block">Инструменти за визуализация</label>
                    
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                      <input 
                        type="checkbox" 
                        checked={showLabels} 
                        onChange={(e) => setShowLabels(e.target.checked)}
                        className="accent-indigo-600 h-3.5 w-3.5 cursor-pointer"
                      />
                      Показвай Номерация (#ID)
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                      <input 
                        type="checkbox" 
                        checked={showBBoxes} 
                        onChange={(e) => setShowBBoxes(e.target.checked)}
                        className="accent-indigo-600 h-3.5 w-3.5 cursor-pointer"
                      />
                      Показвай Кутии на обхват (Bounding Box)
                    </label>
                  </div>

                  <button
                    onClick={() => {
                      setManualPoints([]);
                      setAiReport("");
                      setErrorAi("");
                    }}
                    className="border border-slate-200 text-slate-600 hover:text-slate-800 text-xs font-semibold py-2 px-4 rounded-xl flex items-center justify-center gap-1.5 hover:bg-slate-55"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Занули ръчно броене
                  </button>
                </motion.div>
              )}

            </AnimatePresence>

          </section>

          {/* RIGHT CONTAINER: Visualization Canvas windows & Results tables */}
          <section className="lg:col-span-8 flex flex-col gap-6" id="visualization_panel">
            
            {/* The Main Dynamic Previews Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5" id="canvas_card">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5 mb-5">
                <div className="flex items-center gap-2.5">
                  <ImageIcon className="h-5 w-5 text-indigo-500" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Интерактивно Видео Поле</h3>
                    <p className="text-[10px] text-slate-400">Кликни върху изображението в стъпка 4, за да симулираш ръчно преброяване</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-indigo-600" /> Автоматично Преброени: <strong className="text-slate-800 text-xs">{filteredObjects.length}</strong>
                  </span>
                  {manualPoints.length > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-rose-500" /> Ръчно Маркирани: <strong className="text-rose-600 text-xs">{manualPoints.length}</strong>
                    </span>
                  )}
                </div>
              </div>

              {/* Responsive Double Canvas layout depending on pipeline state */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="canvas_views">
                
                {/* 1. Grayscale / Binary segment visual feedback */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center justify-between">
                    <span>1. Обработена Сегментация</span>
                    <span className="text-indigo-600">Модел: {segmentMethod === 'hsv' ? 'HSV' : `Индекс`}</span>
                  </span>
                  <div className="relative bg-slate-950 rounded-xl overflow-hidden aspect-video border border-slate-800 flex items-center justify-center">
                    <canvas 
                      ref={processCanvasRef} 
                      className="max-w-full max-h-full object-contain"
                    />
                    {!imageSrc && (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-xs font-semibold">
                        Няма заредено изображение
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Overlaid visual counters marker canvas */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center justify-between">
                    <span>2. Финално детектиране и Маркери</span>
                    <span className="text-rose-500 text-[9px] font-black">КОМПЮТЪРНО ЗРЕНИЕ</span>
                  </span>
                  <div className="relative bg-slate-950 rounded-xl overflow-hidden aspect-video border border-slate-800 flex items-center justify-center">
                    <canvas 
                      ref={finalCanvasRef} 
                      onClick={handleFinalCanvasClick}
                      className="max-w-full max-h-full object-contain cursor-crosshair"
                    />
                    {!imageSrc && (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-xs font-semibold">
                        Няма заредено изображение
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Warning strip if objects look merged but Watershed isn't active or fails */}
              {mergedWarning && !splitTouching && (
                <div className="mt-4 p-3 rounded-xl bg-amber-55/40 border border-amber-200 text-xs text-amber-850 flex items-start gap-2">
                  <AlertCircle className="h-4.5 w-4.5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold block">Потенциална грешка при припокриващи се обекти!</strong>
                    <span>Изглежда някой от обектите има нестандартно извити контури с ниска кръглост. Активирайте <strong>Разделител (Watershed)</strong> от Стъпка 3 за автоматично разделяне на слепените елементи.</span>
                  </div>
                </div>
              )}

            </div>

            {/* NEW Part 2 Diagnostic Scatter Plot Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5" id="charts_card">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-indigo-600" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Разпределение по Признаци (Кръглост vs Площ)</h3>
                    <p className="text-[10px] text-slate-400">Графика на разпределение за откриване на геометрични клъстери</p>
                  </div>
                </div>
                {filteredObjects.length > 0 && (
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-150 px-2.5 py-1 rounded-lg">
                    {filteredObjects.length} Фигури
                  </span>
                )}
              </div>

              {filteredObjects.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  Няма детектирани обекти за изчертаване на графиката.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="relative w-full h-[180px] bg-slate-50/50 rounded-xl p-3 border border-slate-100">
                    <svg className="w-full h-full overflow-visible" viewBox="0 0 500 160">
                      {/* Legend and Axis Guidelines */}
                      <line x1="45" y1="10" x2="45" y2="135" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
                      <line x1="45" y1="135" x2="480" y2="135" stroke="#cbd5e1" strokeWidth="1" />
                      
                      <text x="12" y="75" className="text-[9px] fill-slate-400 font-bold -rotate-90 origin-center text-center">Площ</text>
                      <text x="240" y="152" className="text-[9px] fill-slate-400 font-bold text-center">Коефициент на Кръглост (0.0 = Силно удължен, 1.0 = Кръгъл)</text>

                      {/* Reference markings on axis */}
                      {[0.2, 0.4, 0.6, 0.8, 1.0].map((val) => {
                        const x = 45 + val * (480 - 45);
                        return (
                          <g key={val}>
                            <line x1={x} y1="135" x2={x} y2="138" stroke="#cbd5e1" strokeWidth="1" />
                            <text x={x} y="146" className="text-[8px] fill-slate-400 font-mono font-bold text-center translate-x-[-8px]">{val.toFixed(1)}</text>
                          </g>
                        );
                      })}

                      <text x="35" y="18" className="text-[8.5px] fill-slate-400 font-mono font-bold text-right text-right">Max</text>
                      <text x="35" y="135" className="text-[8.5px] fill-slate-400 font-mono font-bold text-right text-right">Min</text>

                      {/* Render points */}
                      {filteredObjects.map((obj) => {
                        const maxVal = Math.max(...filteredObjects.map(o => o.area));
                        const minVal = Math.min(...filteredObjects.map(o => o.area)) || 1;
                        const range = (maxVal - minVal) || 1;
                        
                        const cx = 45 + obj.circularity * (480 - 45);
                        const normArea = (obj.area - minVal) / range;
                        const cy = 135 - normArea * (135 - 15);
                        
                        const isHighlighted = highlightedId === obj.id;
                        const isCalibrated = calibratedObjectId === obj.id;

                        // Force fallback avgColor
                        const colors = obj.avgColor && obj.avgColor.length === 3 ? obj.avgColor : [99, 102, 241];

                        return (
                          <g key={obj.id}>
                            <circle
                              cx={cx}
                              cy={cy}
                              r={isHighlighted ? 9 : isCalibrated ? 7 : 5}
                              fill={`rgb(${colors.join(",")})`}
                              className="transition-all duration-150 cursor-pointer hover:scale-130"
                              stroke={isHighlighted ? "#4f46e5" : isCalibrated ? "#10b981" : "#cbd5e1"}
                              strokeWidth={isHighlighted ? 3 : isCalibrated ? 2 : 1}
                              onMouseEnter={() => setHighlightedId(obj.id)}
                              onMouseLeave={() => setHighlightedId(null)}
                              onClick={() => {
                                setCalibratedObjectId(obj.id);
                                setCurrentStep(4);
                              }}
                            />
                            
                            {isHighlighted && (
                              <g style={{ zIndex: 50 }}>
                                <rect 
                                  x={cx > 380 ? cx - 110 : cx + 10} 
                                  y={cy - 20} 
                                  width="100" 
                                  height="30" 
                                  rx="4" 
                                  fill="#1e293b" 
                                />
                                <text 
                                  x={cx > 380 ? cx - 105 : cx + 15} 
                                  y={cy - 10} 
                                  fill="#ffffff" 
                                  className="text-[8.5px] font-bold"
                                >
                                  Обект #{obj.id}
                                </text>
                                <text 
                                  x={cx > 380 ? cx - 105 : cx + 15} 
                                  y={cy} 
                                  fill="#94a3b8" 
                                  className="text-[7.5px] font-mono"
                                >
                                  {pxToMmScale ? `${(obj.area / (pxToMmScale*pxToMmScale)).toFixed(1)} mm²` : `${obj.area} px²`} | {obj.circularity.toFixed(2)} circ
                                </text>
                              </g>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                  <p className="text-[9px] text-slate-400 italic">
                    💡 Прекарайте мишката през кръговете за детайлен преглед. Кликнете, за да изберете еталон за физическа калибрация.
                  </p>
                </div>
              )}
            </div>

            {/* TABULAR RESULTS PANEL (Always rendered at the bottom for beautiful data outputs) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5" id="data_tables_card">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Table className="h-5 w-5 text-indigo-600" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Извлечени Геометрични и Цветови Признаци</h3>
                    <p className="text-[10px] text-slate-400">Кликнете върху ред, за да изберете обекта като калибриращ еталон за физически мм размери</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {filteredObjects.length > 0 && (
                    <button
                      onClick={exportToCsv}
                      className="bg-indigo-50 border border-indigo-150 hover:bg-indigo-100/80 text-indigo-700 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Експортирай CSV
                    </button>
                  )}
                </div>
              </div>

              {pxToMmScale && (
                <div className="mb-4 px-3.5 py-2.5 bg-emerald-50 border border-emerald-150 rounded-xl text-xs text-emerald-850 flex items-center justify-between shadow-2xs">
                  <span className="font-medium">✅ <strong>Активен физически мащаб:</strong> {pxToMmScale.toFixed(2)} пиксела за 1 мм. Всички пресмятания са превърнати в реално време.</span>
                  <button 
                    onClick={() => {
                      setPxToMmScale(null);
                      setCalibratedObjectId(null);
                    }}
                    className="font-bold underline text-emerald-950 hover:text-black cursor-pointer ml-2"
                  >
                    Изчисти мащаба
                  </button>
                </div>
              )}

              {filteredObjects.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  <Info className="h-7 w-7 mx-auto mb-1.5 text-slate-300" />
                  Информационната таблица е празна. Изберете демо сцена или коригирайте филтрите на стъпка 4.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left" id="cv_metrics_table">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[9px] bg-slate-50/50">
                        <th className="py-2.5 px-3">ИД (#)</th>
                        <th className="py-2.5 px-3">Координати (X, Y)</th>
                        <th className="py-2.5 px-3">Изчислена Площ</th>
                        <th className="py-2.5 px-3">Размер (Ø)</th>
                        <th className="py-2.5 px-3">Кръглост (Circularity)</th>
                        <th className="py-2.5 px-3">Цветов Тон</th>
                        <th className="py-2.5 px-3">Класификация</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredObjects.map((obj) => {
                        const maxDimPx = Math.max(obj.bbox.xmax - obj.bbox.xmin, obj.bbox.ymax - obj.bbox.ymin);
                        const areaDisplay = pxToMmScale 
                          ? `${(obj.area / (pxToMmScale * pxToMmScale)).toFixed(2)} mm²` 
                          : `${obj.area} px²`;
                        const sizeDisplay = pxToMmScale 
                          ? `${(maxDimPx / pxToMmScale).toFixed(1)} mm` 
                          : `${maxDimPx} px`;

                        return (
                          <tr 
                            key={obj.id}
                            onMouseEnter={() => setHighlightedId(obj.id)}
                            onMouseLeave={() => setHighlightedId(null)}
                            onClick={() => {
                              setCalibratedObjectId(obj.id);
                              if (currentStep !== 4) {
                                setCurrentStep(4);
                              }
                            }}
                            className={`border-b border-slate-50 hover:bg-indigo-50/40 transition-all cursor-pointer ${
                              highlightedId === obj.id ? "bg-indigo-50/50" : ""
                            } ${calibratedObjectId === obj.id ? "bg-indigo-50 border-l-4 border-indigo-600 font-medium" : ""}`}
                          >
                            <td className="py-2.5 px-3 font-bold text-indigo-600">
                              <span className="flex items-center gap-1.5">
                                #{obj.id}
                                {calibratedObjectId === obj.id && (
                                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-pulse" />
                                )}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 font-mono text-[10px]">{obj.centroidX}, {obj.centroidY}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-800">{areaDisplay}</td>
                            <td className="py-2.5 px-3 font-medium text-slate-700">{sizeDisplay}</td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-1.5">
                                <div className="w-12 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full ${obj.circularity > 0.82 ? "bg-indigo-500" : "bg-amber-500"}`}
                                    style={{ width: `${Math.round(obj.circularity * 100)}%` }}
                                  />
                                </div>
                                <span className="font-bold text-slate-700">{obj.circularity.toFixed(2)}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <span 
                                  className="h-4 w-4 rounded-full border border-slate-300 block shadow-2xs"
                                  style={{ backgroundColor: `rgb(${obj.avgColor.join(",")})` }}
                                />
                                <span className="text-[10px] font-mono text-slate-500">rgb({obj.avgColor.join(",")})</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[9px] ${
                                obj.group.includes("Монета") 
                                  ? "bg-yellow-104 text-yellow-800 border border-yellow-204" 
                                  : obj.group.includes("Химикал") 
                                    ? "bg-sky-100 text-sky-800"
                                    : obj.group.includes("Винт")
                                      ? "bg-slate-100 text-slate-800 border border-slate-200"
                                      : "bg-indigo-100 text-indigo-800"
                              }`}>
                                {obj.group}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

            </div>

            {/* EXPERT AI DOUNMENT ANALYSIS FROM GEMINI ROUTE */}
            <AnimatePresence>
              {(aiReport || loadingAi || errorAi) && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 15 }}
                  className="bg-white rounded-2xl border border-indigo-200/60 shadow-md p-5 flex flex-col gap-4 relative overflow-hidden"
                  id="ai_report_card"
                >
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-indigo-600 animate-pulse" />
                      <h3 className="text-sm font-bold text-indigo-950">
                        Генериран Технически Анализ на изображението
                      </h3>
                    </div>
                    {loadingAi && (
                      <span className="flex items-center gap-1.5 text-xs text-indigo-600 font-bold bg-indigo-50 px-2.5 py-1 rounded-full">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Параметричен отчет...
                      </span>
                    )}
                  </div>

                  {/* AI Output details block */}
                  <div className="border-t border-slate-100 pt-3">
                    {loadingAi ? (
                      <div className="flex flex-col gap-2 py-6 text-center text-slate-500">
                        <RefreshCw className="h-8 w-8 text-indigo-500 animate-spin mx-auto mb-2" />
                        <span className="text-xs font-bold">Изкуственият интелект обработва Вашите данни...</span>
                        <span className="text-[10px] text-slate-400">Това може да отнеме от 2 до 5 секунди.</span>
                      </div>
                    ) : errorAi ? (
                      <div className="p-3 rounded-lg bg-rose-50 text-rose-800 text-xs flex items-center gap-2">
                        <AlertCircle className="h-4.5 w-4.5" />
                        <span>Грешка: {errorAi}</span>
                      </div>
                    ) : (
                      <div className="prose prose-sm max-w-none text-slate-800">
                        {renderSimpleMarkdown(aiReport)}
                      </div>
                    )}
                  </div>

                </motion.div>
              )}
            </AnimatePresence>

          </section>

        </div>

      </main>

      {/* Humble layout footer */}
      <footer className="bg-white border-t border-slate-200 mt-12 py-6 text-center text-xs text-slate-400 font-medium">
        Анализатор на Обекти v1.0.0 | Разработено за Компютърно зрение и Цифрова обработка на изображения.
      </footer>
    </div>
  );
}
