(function () {
  "use strict";

  const DB_NAME = "med-camera-check";
  const DB_VERSION = 2;
  let dbPromise;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("medicines")) {
          const store = db.createObjectStore("medicines", { keyPath: "id" });
          store.createIndex("name", "name", { unique: false });
        }
        // v2: ค่า AI ของภาพจำลอง (สร้างใหม่ได้เสมอ จึงไม่รวมในไฟล์สำรอง)
        if (!db.objectStoreNames.contains("augments")) db.createObjectStore("augments", { keyPath: "id" });
        if (!db.objectStoreNames.contains("history")) {
          const store = db.createObjectStore("history", { keyPath: "id" });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function all(storeName) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async function put(storeName, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(value);
      request.onsuccess = () => resolve(value);
      request.onerror = () => reject(request.error);
    });
  }

  async function remove(storeName, id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, "readwrite").objectStore(storeName).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function clear(storeName) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, "readwrite").objectStore(storeName).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function exportAll() {
    return {
      schema: 1,
      exportedAt: new Date().toISOString(),
      medicines: await all("medicines"),
      history: await all("history")
    };
  }

  async function importAll(payload) {
    if (!payload || payload.schema !== 1 || !Array.isArray(payload.medicines)) {
      throw new Error("รูปแบบไฟล์สำรองไม่ถูกต้อง");
    }
    await clear("medicines");
    await clear("history");
    await clear("augments");
    for (const item of payload.medicines) await put("medicines", item);
    for (const item of payload.history || []) await put("history", item);
  }

  window.MedDB = { open, all, put, remove, clear, exportAll, importAll };
})();
