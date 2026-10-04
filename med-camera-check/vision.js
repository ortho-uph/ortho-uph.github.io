(function () {
  "use strict";

  const SIZE = 48;

  function cropRect(source, zoom = 1) {
    const sw = source.videoWidth || source.naturalWidth || source.width;
    const sh = source.videoHeight || source.naturalHeight || source.height;
    const targetRatio = 4 / 3;
    let cropW = sw, cropH = sh;
    if (sw / sh > targetRatio) cropW = sh * targetRatio;
    else cropH = sw / targetRatio;
    const safeZoom = Math.max(1, Math.min(2.5, Number(zoom) || 1));
    cropW /= safeZoom;
    cropH /= safeZoom;
    return { sx: (sw - cropW) / 2, sy: (sh - cropH) / 2, cropW, cropH };
  }

  // canvas ชั่วคราวที่ใช้ซ้ำทุกเฟรม (ลดการสร้าง canvas ใหม่ 3 อันต่อเฟรมตอนตรวจสด)
  // ใช้ได้เฉพาะงานที่อ่านค่าออกทันทีแบบ synchronous เท่านั้น
  const scratch = new Map();
  function scratchCanvas(key, size) {
    let c = scratch.get(key);
    if (!c) {
      c = document.createElement("canvas");
      c.width = size; c.height = size;
      scratch.set(key, c);
    }
    return c;
  }

  function canvasForImage(source, size = SIZE, zoom = 1, reuseKey = null) {
    const canvas = reuseKey ? scratchCanvas(reuseKey, size) : document.createElement("canvas");
    if (canvas.width !== size) canvas.width = size;
    if (canvas.height !== size) canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const { sx, sy, cropW, cropH } = cropRect(source, zoom);
    ctx.drawImage(source, sx, sy, cropW, cropH, 0, 0, size, size);
    return canvas;
  }

  function featureFromSource(source, zoom = 1) {
    const canvas = canvasForImage(source, SIZE, zoom, "feature");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
    const gray = new Float32Array(SIZE * SIZE);
    let brightness = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const g = data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114;
      gray[p] = g;
      brightness += g;
    }
    brightness /= gray.length;

    const colorGrid = [];
    const grid = 6;
    const cell = SIZE / grid;
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = gy * cell; y < (gy + 1) * cell; y++) {
          for (let x = gx * cell; x < (gx + 1) * cell; x++) {
            const idx = (Math.floor(y) * SIZE + Math.floor(x)) * 4;
            r += data[idx]; g += data[idx + 1]; b += data[idx + 2]; n++;
          }
        }
        const sum = Math.max(1, r + g + b);
        colorGrid.push(r / sum, g / sum, b / sum, (r + g + b) / (n * 765));
      }
    }

    const edgeGrid = new Array(64).fill(0);
    const orient = new Array(8).fill(0);
    let edgeTotal = 0;
    let sharpness = 0;
    for (let y = 1; y < SIZE - 1; y++) {
      for (let x = 1; x < SIZE - 1; x++) {
        const p = y * SIZE + x;
        const gx = gray[p + 1] - gray[p - 1];
        const gy = gray[p + SIZE] - gray[p - SIZE];
        const mag = Math.sqrt(gx * gx + gy * gy);
        sharpness += mag;
        if (mag > 22) {
          const cellX = Math.min(7, Math.floor(x / (SIZE / 8)));
          const cellY = Math.min(7, Math.floor(y / (SIZE / 8)));
          edgeGrid[cellY * 8 + cellX]++;
          let angle = Math.atan2(gy, gx) + Math.PI;
          orient[Math.min(7, Math.floor(angle / (Math.PI * 2) * 8))] += mag;
          edgeTotal++;
        }
      }
    }
    const maxCellEdges = (SIZE / 8) * (SIZE / 8);
    for (let i = 0; i < edgeGrid.length; i++) edgeGrid[i] /= maxCellEdges;
    const orientSum = orient.reduce((a, b) => a + b, 0) || 1;
    for (let i = 0; i < orient.length; i++) orient[i] /= orientSum;

    const hash = [];
    const hSize = 16;
    const sample = canvasForImage(source, hSize + 1, zoom, "hash");
    const sampleData = sample.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, hSize + 1, hSize).data;
    for (let y = 0; y < hSize; y++) {
      for (let x = 0; x < hSize; x++) {
        const i1 = (y * (hSize + 1) + x) * 4;
        const i2 = i1 + 4;
        const a = sampleData[i1] + sampleData[i1 + 1] + sampleData[i1 + 2];
        const b = sampleData[i2] + sampleData[i2 + 1] + sampleData[i2 + 2];
        hash.push(a > b ? 1 : 0);
      }
    }

    return {
      version: 1,
      colorGrid,
      edgeGrid,
      orient,
      hash,
      quality: {
        brightness: Math.round(brightness),
        sharpness: Math.round(sharpness / ((SIZE - 2) * (SIZE - 2)) * 10) / 10,
        edgeDensity: Math.round(edgeTotal / ((SIZE - 2) * (SIZE - 2)) * 1000) / 1000
      }
    };
  }

  function vectorSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
    return Math.max(0, 1 - diff / a.length);
  }

  function cosine(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, aa = 0, bb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
    return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
  }

  function hashSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let same = 0;
    for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
    return same / a.length;
  }

  function compare(a, b) {
    const color = vectorSimilarity(a.colorGrid, b.colorGrid);
    const edge = vectorSimilarity(a.edgeGrid, b.edgeGrid);
    const orientation = cosine(a.orient, b.orient);
    const hash = hashSimilarity(a.hash, b.hash);
    const raw = color * .32 + edge * .24 + orientation * .2 + hash * .24;
    // Most unrelated packaging still shares a bright rectangular background.
    // Remove that common visual baseline so dissimilar packs do not receive an
    // unsafe high score merely because both are silver blister cards.
    const legacy = Math.max(0, Math.min(1, (raw - .55) / .45));
    if (a.embedding && b.embedding) {
      const embeddingCosine = cosine(a.embedding, b.embedding);
      const aiScore = Math.max(0, Math.min(1, (embeddingCosine - .4) / .6));
      return aiScore * .85 + legacy * .15;
    }
    // Legacy data is only a migration fallback. New and upgraded references
    // always have MobileNet embeddings and use the branch above.
    return legacy;
  }

  function bestAgainst(candidate, references) {
    if (!references || !references.length) return 0;
    const scores = references.map(ref => compare(candidate, ref.feature)).sort((a, b) => b - a);
    // A single accidental close match must not be enough when multiple training
    // examples exist. Average the two closest examples for a more stable class.
    return scores.length >= 2 ? (scores[0] + scores[1]) / 2 : scores[0];
  }

  function qualityWarnings(feature) {
    const warnings = [];
    if (feature.quality.brightness < 55) warnings.push("ภาพมืดเกินไป");
    if (feature.quality.brightness > 225) warnings.push("ภาพสว่างหรือสะท้อนแสงมากเกินไป");
    if (feature.quality.sharpness < 45) warnings.push("ภาพอาจไม่คมชัด");
    if (feature.quality.edgeDensity < .035) warnings.push("วัตถุอาจอยู่ไกลหรือไม่เต็มกรอบ");
    return warnings;
  }

  function cropDataUrl(source, maxWidth = 960, zoom = 1) {
    const { sx, sy, cropW, cropH } = cropRect(source, zoom);
    const width = Math.min(maxWidth, cropW);
    const height = Math.round(width * cropH / cropW);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    canvas.getContext("2d").drawImage(source, sx, sy, cropW, cropH, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", .82);
  }

  function featureFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(featureFromSource(image));
      image.onerror = reject;
      image.src = dataUrl;
    });
  }

  window.MedVision = { cropRect, canvasForImage, featureFromSource, featureFromDataUrl, cropDataUrl, compare, bestAgainst, qualityWarnings };
})();
