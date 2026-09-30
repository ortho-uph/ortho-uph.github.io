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

  async function embedFromSource(source) {
    const loaded = await load();
    const canvas = MedVision.canvasForImage(source, 224);
    const tensor = loaded.infer(canvas, true);
    try { return normalize(await tensor.data()); }
    finally { tensor.dispose(); }
  }

  function embedFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => embedFromSource(image).then(resolve, reject);
      image.onerror = () => reject(new Error("อ่านภาพอ้างอิงไม่สำเร็จ"));
      image.src = dataUrl;
    });
  }

  window.MedAI = { load, embedFromSource, embedFromDataUrl, isReady: () => Boolean(model) };
})();
