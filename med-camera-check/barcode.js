/*
 * MedBarcode — อ่านบาร์โค้ด / QR / GS1 DataMatrix จากภาพกล้อง (ทำงานในเครื่อง ไม่ต้องใช้เน็ต)
 * ใช้ zxing-wasm (โหลดจาก jsDelivr) เพราะ Chrome/Edge บน Windows ไม่มี BarcodeDetector ในตัว
 */
(function () {
  "use strict";

  let ready = null;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const FORMATS = ["EAN13", "EAN8", "UPCA", "UPCE", "Code128", "Code39", "ITF", "QRCode", "DataMatrix", "DataBar", "DataBarExp"];

  const CDN = "https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.4/dist/";

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src; el.async = true;
      el.onload = resolve; el.onerror = () => reject(new Error("โหลด " + src + " ไม่สำเร็จ"));
      document.head.appendChild(el);
    });
  }

  function load() {
    if (ready) return ready;
    ready = (async () => {
      // ถ้าไม่มีไฟล์ vendor/zxing ในเว็บ ให้โหลดจาก CDN แทน (ต้องต่ออินเทอร์เน็ต)
      if (!window.ZXingWASM) await loadScript(CDN + "iife/reader/index.js");
      if (!window.ZXingWASM) throw new Error("ไม่พบตัวอ่านบาร์โค้ด");
      ZXingWASM.prepareZXingModule({
        overrides: { locateFile: (path, prefix) => path.endsWith(".wasm") ? CDN + "reader/" + path : prefix + path },
        fireImmediately: true
      });
      canvas.width = 8; canvas.height = 8;
      await ZXingWASM.readBarcodes(ctx.getImageData(0, 0, 8, 8), { formats: ["QRCode"] });
      return true;
    })().catch(error => { ready = null; throw error; });
    return ready;
  }

  // ทำให้รหัสเทียบกันได้: ตัวเลข 8/12/13/14 หลัก → GTIN-14, GS1 (01)xxxxxxxxxxxxxx → GTIN-14
  function normalize(raw) {
    let text = String(raw || "").replace(/^\][A-Za-z]\d/, "").replace(/[\u001d\s]/g, "").trim();
    const gs1 = text.match(/^\(?01\)?(\d{14})/);
    if (gs1) return gs1[1];
    if (/^\d{8}$|^\d{12,14}$/.test(text)) return text.padStart(14, "0");
    return text.toUpperCase();
  }

  // อ่านจากวิดีโอ/รูปภาพ — ครอปตามซูมที่ใช้ แล้วย่อให้ไม่เกิน 1280px เพื่อความเร็ว
  async function scan(source, zoom = 1) {
    await load();
    const sw = source.videoWidth || source.naturalWidth || source.width;
    const sh = source.videoHeight || source.naturalHeight || source.height;
    if (!sw || !sh) return [];
    const z = Math.max(1, Math.min(2.5, Number(zoom) || 1));
    const cw = sw / z, ch = sh / z;
    const scale = Math.min(1, 1280 / cw);
    canvas.width = Math.round(cw * scale);
    canvas.height = Math.round(ch * scale);
    ctx.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, canvas.width, canvas.height);
    const results = await ZXingWASM.readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), {
      formats: FORMATS, tryHarder: true, tryRotate: true, tryInvert: false, maxNumberOfSymbols: 4
    });
    return results.filter(r => r.isValid && r.text).map(r => ({ text: r.text, format: r.format, code: normalize(r.text) }));
  }

  window.MedBarcode = { load, scan, normalize, isReady: () => Boolean(ready) };
})();
