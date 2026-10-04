(function () {
  "use strict";

  let model = null;
  let loading = null;

  function normalize(values) {
    let sum = 0;
    for (const value of values) sum += value * value;
    const norm = Math.sqrt(sum) || 1;
    return Array.from(values, value => value / norm);
  }

  async function load() {
    if (model) return model;
    if (loading) return loading;
    loading = (async () => {
      if (!window.tf || !window.mobilenet) throw new Error("ไม่พบ TensorFlow.js หรือ MobileNet");
      await tf.ready();
      model = await mobilenet.load({
        version: 2,
        alpha: 1,
        modelUrl: new URL("model/model.json", document.baseURI).href,
        inputRange: [-1, 1]
      });
      // Warm up once so the first live frame is not delayed by graph setup.
      const warmup = document.createElement("canvas");
      warmup.width = 224; warmup.height = 224;
      const tensor = model.infer(warmup, true);
      await tensor.data(); tensor.dispose();
      return model;
    })();
    try { return await loading; }
    catch (error) { loading = null; throw error; }
  }

  async function embedFromSource(source, zoom = 1) {
    const loaded = await load();
    // infer() อ่านพิกเซลทันที จึงใช้ canvas ซ้ำได้อย่างปลอดภัย
    const canvas = MedVision.canvasForImage(source, 224, zoom, "embed");
    const tensor = loaded.infer(canvas, true);
    try { return normalize(await tensor.data()); }
    finally { tensor.dispose(); }
  }

  // สร้างภาพจำลองจากภาพอ้างอิง 1 ภาพ: หมุนซ้าย/ขวา ซูมเข้า มืดลง สว่างขึ้น
  // ช่วยให้จำยาได้แม้วางเอียงเล็กน้อยหรือแสงเปลี่ยน (เก็บเฉพาะค่า AI ไม่เก็บรูป)
  const VARIANTS = [
    { rot: -9, scale: 1.14 }, { rot: 9, scale: 1.14 }, { rot: 0, scale: 1.18 },
    { rot: 0, scale: 1, filter: "brightness(0.7) contrast(1.1)" },
    { rot: 0, scale: 1, filter: "brightness(1.3) contrast(0.9)" },
    { rot: -4, scale: 1.08, filter: "brightness(0.85)" }
  ];

  function variantCanvas(base, v) {
    const c = document.createElement("canvas");
    c.width = base.width; c.height = base.height;
    const g = c.getContext("2d");
    g.fillStyle = "#808080"; g.fillRect(0, 0, c.width, c.height);
    if (v.filter) g.filter = v.filter;
    g.translate(c.width / 2, c.height / 2);
    g.rotate(v.rot * Math.PI / 180);
    g.scale(v.scale, v.scale);
    g.drawImage(base, -c.width / 2, -c.height / 2);
    return c;
  }

  async function embedVariantsFromSource(source, zoom = 1) {
    const loaded = await load();
    const base = MedVision.canvasForImage(source, 224, zoom);
    const out = [];
    for (const v of VARIANTS) {
      const tensor = loaded.infer(variantCanvas(base, v), true);
      try { out.push(Float32Array.from(normalize(await tensor.data()))); }
      finally { tensor.dispose(); }
    }
    return out;
  }

  function embedVariantsFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => embedVariantsFromSource(image, 1).then(resolve, reject);
      image.onerror = () => reject(new Error("อ่านภาพอ้างอิงไม่สำเร็จ"));
      image.src = dataUrl;
    });
  }

  function embedFromDataUrl(dataUrl, zoom = 1) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => embedFromSource(image, zoom).then(resolve, reject);
      image.onerror = () => reject(new Error("อ่านภาพอ้างอิงไม่สำเร็จ"));
      image.src = dataUrl;
    });
  }

  window.MedAI = { load, embedFromSource, embedFromDataUrl, embedVariantsFromSource, embedVariantsFromDataUrl, isReady: () => Boolean(model) };
})();
