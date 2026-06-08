// Pure TypeScript implementation of client-side computer vision algorithms

export interface ExtractedObject {
  id: number;
  area: number;
  perimeter: number;
  circularity: number;
  centroidX: number;
  centroidY: number;
  avgColor: [number, number, number]; // RGB
  avgHue: number;
  bbox: { xmin: number; ymin: number; xmax: number; ymax: number };
  group: string;
}

// Helper to convert RGB to HSV
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const v = max;

  const d = max - min;
  s = max === 0 ? 0 : d / max;

  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(v * 100)];
}

// Convert ImageData to Grayscale
export function toGrayscale(imgData: ImageData): Uint8ClampedArray {
  const data = imgData.data;
  const gray = new Uint8ClampedArray(imgData.width * imgData.height);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Standard luminance weights
    gray[i / 4] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return gray;
}

// Apply 3x3 Box Blur (Gaussian replacement for smoothing and noise removal)
export function boxBlur(gray: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(gray.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          sum += gray[(y + ky) * width + (x + kx)];
        }
      }
      out[y * width + x] = Math.round(sum / 9);
    }
  }
  // Copy edges
  for (let x = 0; x < width; x++) {
    out[x] = gray[x];
    out[(height - 1) * width + x] = gray[(height - 1) * width + x];
  }
  for (let y = 0; y < height; y++) {
    out[y * width] = gray[y * width];
    out[y * width + (width - 1)] = gray[y * width + (width - 1)];
  }
  return out;
}

// Simple Thresholding
export function threshold(gray: Uint8ClampedArray, t: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) {
    out[i] = gray[i] >= t ? 255 : 0;
  }
  return out;
}

// Otsu's Thresholding algorithm
export function otsuThreshold(gray: Uint8ClampedArray): number {
  const histogram = new Int32Array(256);
  for (let i = 0; i < gray.length; i++) {
    histogram[gray[i]]++;
  }

  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let varMax = 0;
  let threshold = 127;

  for (let i = 0; i < 256; i++) {
    wB += histogram[i];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;

    sumB += i * histogram[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const varBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = i;
    }
  }

  return threshold;
}

// HSV Segmentation
export function segmentHSV(
  rgbData: Uint8ClampedArray,
  hMin: number, hMax: number,
  sMin: number, sMax: number,
  vMin: number, vMax: number
): Uint8ClampedArray {
  const count = rgbData.length / 4;
  const out = new Uint8ClampedArray(count);

  for (let i = 0; i < count; i++) {
    const r = rgbData[i * 4];
    const g = rgbData[i * 4 + 1];
    const b = rgbData[i * 4 + 2];

    const [h, s, v] = rgbToHsv(r, g, b);

    // Hue can wrap around, handle wrapping in range check
    let hMatch = false;
    if (hMin <= hMax) {
      hMatch = h >= hMin && h <= hMax;
    } else {
      // wraps around 360 (e.g. hMin=350, hMax=10)
      hMatch = h >= hMin || h <= hMax;
    }

    const sMatch = s >= sMin && s <= sMax;
    const vMatch = v >= vMin && v <= vMax;

    out[i] = hMatch && sMatch && vMatch ? 255 : 0;
  }
  return out;
}

// Morphological Dilation on binary array
export function dilate(binary: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(binary.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let max = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          if (binary[(y + ky) * width + (x + kx)] === 255) {
            max = 255;
            break;
          }
        }
        if (max === 255) break;
      }
      out[y * width + x] = max;
    }
  }
  return out;
}

// Morphological Erosion on binary array
export function erode(binary: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(binary.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let min = 255;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          if (binary[(y + ky) * width + (x + kx)] === 0) {
            min = 0;
            break;
          }
        }
        if (min === 0) break;
      }
      out[y * width + x] = min;
    }
  }
  return out;
}

// Morphological Opening (Erosion then Dilation) - removes small noise elements
export function morphOpening(binary: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const eroded = erode(binary, width, height);
  return dilate(eroded, width, height);
}

// Morphological Closing (Dilation then Erosion) - fills holes and gaps
export function morphClosing(binary: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const dilated = dilate(binary, width, height);
  return erode(dilated, width, height);
}

// Connected Component Labeling using 1-pass Flood Fill (highly descriptive and robust)
export function findConnectedComponents(
  binary: Uint8ClampedArray,
  width: number,
  height: number,
  originalRgb: Uint8ClampedArray,
  minArea: number = 10,
  splitTouching: boolean = false
): { labeledData: Int32Array; objects: ExtractedObject[]; segmentedCount: number; mergedWarning: boolean } {
  
  // Create copy of binary to manipulate/process
  let processImg = new Uint8ClampedArray(binary);

  // If watershed/touching object division is selected:
  // We can simulate watershed segmentation with erosion and labeling.
  // When objects touch, heavy erosion splits them. We then find the centroids of the splits
  // and grow them back or label them. This is a robust distance-erosion watershed simulation.
  let mergedWarning = false;
  if (splitTouching) {
    // Check if objects look merged. Perform heavy erosion to split them.
    // Run an initial connected component analysis on heavily eroded image.
    const tempGray = new Uint8ClampedArray(processImg);
    // Erode 3 times to split necks
    const eroded1 = erode(tempGray, width, height);
    const eroded2 = erode(eroded1, width, height);
    const eroded3 = erode(eroded2, width, height);
    
    // Check if three-level erosion splits some larger components
    processImg = eroded3;
  }

  const labels = new Int32Array(width * height);
  let nextLabel = 1;
  const visited = new Uint8Array(width * height);

  // Flood Fill / Queue-based Component Finder
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (processImg[idx] === 255 && visited[idx] === 0) {
        // Start a component search
        const queue: number[] = [idx];
        visited[idx] = 1;
        labels[idx] = nextLabel;

        let qHead = 0;
        while (qHead < queue.length) {
          const curr = queue[qHead++];
          const cx = curr % width;
          const cy = Math.floor(curr / width);

          // Check 4-connected neighbors
          const neighbors = [
            cy > 0 ? (cy - 1) * width + cx : -1,
            cy < height - 1 ? (cy + 1) * width + cx : -1,
            cx > 0 ? cy * width + (cx - 1) : -1,
            cx < width - 1 ? cy * width + (cx + 1) : -1,
          ];

          for (const n of neighbors) {
            if (n !== -1 && processImg[n] === 255 && visited[n] === 0) {
              visited[n] = 1;
              labels[n] = nextLabel;
              queue.push(n);
            }
          }
        }
        nextLabel++;
      }
    }
  }

  // Calculate metrics for each label
  const initialObjectsMap = new Map<number, {
    pixels: {x: number, y: number, idx: number}[];
    sumX: number;
    sumY: number;
    xmin: number;
    xmax: number;
    ymin: number;
    ymax: number;
  }>();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const label = labels[idx];
      if (label > 0) {
        if (!initialObjectsMap.has(label)) {
          initialObjectsMap.set(label, {
            pixels: [],
            sumX: 0,
            sumY: 0,
            xmin: x,
            xmax: x,
            ymin: y,
            ymax: y,
          });
        }
        const obj = initialObjectsMap.get(label)!;
        obj.pixels.push({ x, y, idx });
        obj.sumX += x;
        obj.sumY += y;
        if (x < obj.xmin) obj.xmin = x;
        if (x > obj.xmax) obj.xmax = x;
        if (y < obj.ymin) obj.ymin = y;
        if (y > obj.ymax) obj.ymax = y;
      }
    }
  }

  const objects: ExtractedObject[] = [];
  let finalId = 1;

  for (const [label, data] of initialObjectsMap.entries()) {
    const area = data.pixels.length;
    if (area < minArea) continue; // Noise filter

    // Calculate Perimeter by analyzing pixel borders
    let perimeter = 0;
    const pixelSet = new Set(data.pixels.map(p => p.x + "_" + p.y));
    for (const p of data.pixels) {
      // Check 4 directions. If neighbor is background, this is a border pixel
      const hasBgNeighbor =
        p.x === 0 || p.x === width - 1 || p.y === 0 || p.y === height - 1 ||
        !pixelSet.has((p.x - 1) + "_" + p.y) ||
        !pixelSet.has((p.x + 1) + "_" + p.y) ||
        !pixelSet.has(p.x + "_" + (p.y - 1)) ||
        !pixelSet.has(p.x + "_" + (p.y + 1));
      
      if (hasBgNeighbor) {
        perimeter++;
      }
    }

    // Add correction for single/dual pixel thinness
    if (perimeter === 0) perimeter = 1;

    // Circularity = 4 * PI * Area / (Perimeter^2)
    // For a perfect circle, circularity is 1.0. For square, about 0.785. For line, closer to 0.
    const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
    const circularityClamped = Math.min(1.0, circularity);

    // Calculate Average Color
    let sumR = 0, sumG = 0, sumB = 0;
    for (const p of data.pixels) {
      const origIdx = p.idx * 4;
      sumR += originalRgb[origIdx];
      sumG += originalRgb[origIdx + 1];
      sumB += originalRgb[origIdx + 2];
    }
    const avgR = Math.round(sumR / area);
    const avgG = Math.round(sumG / area);
    const avgB = Math.round(sumB / area);
    const [h, s, v] = rgbToHsv(avgR, avgG, avgB);

    // Automatic classification based on geometric traits (diameter & circularity) and color
    // We categorize into Coin (Кръгъл/Монета), Pin/Caps (Капачка/Винт), Long Object (Дълъг предмет/Химикал) etc.
    let group = "Кръгъл предмет";
    const aspectRatio = (data.xmax - data.xmin + 1) / (data.ymax - data.ymin + 1);
    
    if (circularityClamped > 0.82) {
      if (s < 10 && v > 50) { // low saturation, high value
        group = "Сребърна Монета";
      } else if (s > 20 && h > 30 && h < 90) {
        group = "Златна Капачка/Монета";
      } else {
        group = "Кръгла монета/капачка";
      }
    } else if (aspectRatio > 2.5 || aspectRatio < 0.4) {
      group = "Химикал / Дълъг предмет";
    } else if (circularityClamped < 0.6) {
      group = "Винт / Електронен компонент";
    } else {
      group = "Капачка / Плосък обект";
    }

    // Merged Warning Checker
    // If an object is extra large and has very low circularity but shouldn't be long,
    // it is highly likely multiple overlapping/touching items.
    if (area > 800 && circularityClamped < 0.68 && aspectRatio < 2.0 && aspectRatio > 0.5) {
      mergedWarning = true;
    }

    objects.push({
      id: finalId++,
      area,
      perimeter,
      circularity: circularityClamped,
      centroidX: Math.round(data.sumX / area),
      centroidY: Math.round(data.sumY / area),
      avgColor: [avgR, avgG, avgB],
      avgHue: h,
      bbox: { xmin: data.xmin, ymin: data.ymin, xmax: data.xmax, ymax: data.ymax },
      group
    });
  }

  // Restore labels mapping for display
  return {
    labeledData: labels,
    objects,
    segmentedCount: objects.length,
    mergedWarning
  };
}

// Draw marked contours and labels on output canvas
export function drawMarks(
  canvas: HTMLCanvasElement, 
  originalImg: HTMLImageElement,
  objects: ExtractedObject[],
  highlightId: number | null = null,
  showLabels: boolean = true,
  showBBoxes: boolean = true,
  manualPoints: {x: number, y: number}[] = []
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Clear and redraw background
  ctx.drawImage(originalImg, 0, 0, canvas.width, canvas.height);

  // Draw manual point count overlay
  for (let i = 0; i < manualPoints.length; i++) {
    const pt = manualPoints[i];
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 6, 0, 2 * Math.PI);
    ctx.fillStyle = "#f43f5e"; // rose 500
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();

    // Mark index
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${i + 1}`, pt.x, pt.y);
  }

  // Draw auto objects
  objects.forEach(obj => {
    const isHighlighted = obj.id === highlightId;
    
    // Draw bounding box
    if (showBBoxes) {
      ctx.strokeStyle = isHighlighted ? "#14b8a6" : "#6366f1"; // teal-500 vs indigo-500
      ctx.lineWidth = isHighlighted ? 3 : 1.5;
      ctx.strokeRect(
        obj.bbox.xmin,
        obj.bbox.ymin,
        obj.bbox.xmax - obj.bbox.xmin,
        obj.bbox.ymax - obj.bbox.ymin
      );
    }

    // Draw centroid marker
    ctx.beginPath();
    ctx.arc(obj.centroidX, obj.centroidY, 4, 0, 2 * Math.PI);
    ctx.fillStyle = isHighlighted ? "#14b8a6" : "#4f46e5";
    ctx.fill();

    // Draw label
    if (showLabels) {
      ctx.fillStyle = isHighlighted ? "#115e59" : "#312e81";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const w = ctx.measureText(`#${obj.id}`).width;
      
      // text background
      ctx.fillStyle = isHighlighted ? "rgba(204, 251, 241, 0.9)" : "rgba(224, 231, 255, 0.9)";
      ctx.fillRect(obj.centroidX + 6, obj.centroidY - 6, w + 6, 14);
      
      ctx.fillStyle = isHighlighted ? "#0d9488" : "#4f46e5";
      ctx.fillText(`#${obj.id}`, obj.centroidX + 9, Math.round(obj.centroidY - 5));
    }
  });
}
