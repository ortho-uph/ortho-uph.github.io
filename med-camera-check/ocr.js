(function () {
  "use strict";

  let workerPromise = null;

  function normalize(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function levenshtein(a, b) {
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let diagonal = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const above = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
        diagonal = above;
      }
    }
    return row[b.length];
  }

  function similarity(a, b) {
    a = normalize(a); b = normalize(b);
    if (!a || !b) return 0;
    return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  }

  function significantNameTokens(name) {
    const ignored = new Set(["CAP", "CAPSULE", "TAB", "TABLET", "MG", "MCG", "G", "ML"]);
    return normalize(name).split(" ").filter(token => token.length >= 3 && !ignored.has(token));
  }

  function bestNameScore(text, medicineName) {
    const source = normalize(text).split(" ").filter(Boolean);
    const wanted = significantNameTokens(medicineName);
    if (!source.length || !wanted.length) return 0;
    const tokenCoverage = wanted.reduce((sum, token) => {
      const best = source.reduce((max, candidate) => Math.max(max, similarity(token, candidate)), 0);
      return sum + best;
    }, 0) / wanted.length;
    const phrase = wanted.join(" ");
    let windowScore = 0;
    for (let size = Math.max(1, wanted.length - 1); size <= wanted.length + 1; size++) {
      for (let i = 0; i <= source.length - size; i++) {
        windowScore = Math.max(windowScore, similarity(phrase, source.slice(i, i + size).join(" ")));
      }
    }
    return Math.max(tokenCoverage * .96, windowScore);
  }

  function strengthParts(strength) {
    const value = normalize(strength);
    const number = value.match(/\d+(?:\s*\.\s*\d+)?/)?.[0]?.replace(/\s/g, "") || "";
    const unit = value.match(/\b(MCG|MG|G|ML)\b/)?.[1] || "";
    return { number, unit };
  }

  function strengthScore(text, strength) {
    const normalized = normalize(text);
    const { number, unit } = strengthParts(strength);
    if (!number) return .5;
    const numberFound = new RegExp(`(^| )${number.replace(".", "\\.")}( |$)`).test(normalized);
    const unitFound = !unit || new RegExp(`(^| )${unit}( |$)`).test(normalized);
    return numberFound && unitFound ? 1 : numberFound ? .65 : 0;
  }

  function bestLineForMedicine(lines, medicine) {
    return lines
      .map((line, index) => {
        const nameScore = bestNameScore(line, medicine.name);
        const doseScore = strengthScore(lines.slice(index, index + 2).join(" "), medicine.strength);
        return { line, index, nameScore, doseScore, score: nameScore * .78 + doseScore * .22 };
      })
      .sort((a, b) => b.score - a.score)[0] || { line: "", index: 0, score: 0 };
  }

  function nearbyQuantity(lines, index) {
    const nearby = lines.slice(index, index + 2).join(" ");
    const match = nearby.match(/(?:\[|\b)(\d{1,4})\s*(CAPS?|TABLETS?|TABS?|เม็ด|แคปซูล)(?:\]|\b)/i);
    return match ? `${match[1]} ${match[2]}` : "";
  }

  function matchMedicines(text, medicines) {
    const lines = String(text || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const matches = [];
    for (const medicine of medicines || []) {
      const lineHit = bestLineForMedicine(lines, medicine);
      const fullNameScore = bestNameScore(text, medicine.name);
      const nameScore = Math.max(lineHit.nameScore || 0, fullNameScore);
      const context = lines.slice(lineHit.index, lineHit.index + 2).join(" ");
      const doseScore = strengthScore(context, medicine.strength);
      const score = nameScore * .78 + doseScore * .22;
      if (nameScore >= .68 && doseScore >= .65 && score >= .70) {
        matches.push({
          medicineId: medicine.id,
          score,
          nameScore,
          strengthScore: doseScore,
          quantityText: nearbyQuantity(lines, lineHit.index),
          snippet: lines.slice(Math.max(0, lineHit.index - 1), lineHit.index + 2).join(" · ")
        });
      }
    }
    return matches.sort((a, b) => b.score - a.score);
  }

  function preprocess(source, zoom = 1) {
    const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
    const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
    const safeZoom = Math.max(1, Math.min(2.5, Number(zoom) || 1));
    const cropWidth = sourceWidth / safeZoom;
    const cropHeight = sourceHeight / safeZoom;
    const sx = (sourceWidth - cropWidth) / 2;
    const sy = (sourceHeight - cropHeight) / 2;
    const scale = Math.min(1, 1800 / cropWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cropWidth * scale);
    canvas.height = Math.round(cropHeight * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, sx, sy, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < image.data.length; i += 4) {
      const gray = image.data[i] * .299 + image.data[i + 1] * .587 + image.data[i + 2] * .114;
      const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.55 + 142));
      image.data[i] = image.data[i + 1] = image.data[i + 2] = contrasted;
    }
    context.putImageData(image, 0, 0);
    return canvas;
  }

  async function load(onProgress) {
    if (!window.Tesseract) throw new Error("ไม่พบตัวอ่าน OCR");
    if (!workerPromise) {
      workerPromise = window.Tesseract.createWorker("eng", 1, {
        workerPath: new URL("vendor/tesseract/worker.min.js", document.baseURI).href,
        corePath: new URL("vendor/tesseract-core", document.baseURI).href,
        langPath: new URL("ocr-data", document.baseURI).href,
        logger: message => onProgress?.(message)
      }).then(async worker => {
        await worker.setParameters({ preserve_interword_spaces: "1" });
        return worker;
      }).catch(error => { workerPromise = null; throw error; });
    }
    return workerPromise;
  }

  async function recognize(source, medicines, onProgress, zoom = 1) {
    const worker = await load(onProgress);
    const canvas = preprocess(source, zoom);
    const result = await worker.recognize(canvas, { rotateAuto: true });
    const text = result.data.text || "";
    return { text, confidence: result.data.confidence || 0, matches: matchMedicines(text, medicines) };
  }

  window.MedOCR = { load, recognize, matchMedicines, normalize, similarity };
})();
