/**
 * The first page of a PDF as a small picture (a data URL), drawn with the
 * vendored pdf.js, for thumbnails and previews. Cached per URL.
 *
 *   const src = await pdfFirstPage(url, 320)  -> 'data:image/png;base64,...' or null
 */
let lib = null;
const done = new Map();
async function pdfjs() {
  if (!lib) {
    lib = await import('../../vendor/pdfjs/pdf.min.mjs');
    lib.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  }
  return lib;
}
export function pdfFirstPage(url, width = 320) {
  const k = `${url}|${width}`;
  if (!done.has(k)) {
    done.set(k, (async () => {
      try {
        const L = await pdfjs();
        const doc = await L.getDocument({ url, isEvalSupported: false }).promise;
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: (width * 2) / base.width });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        const out = canvas.toDataURL('image/png');
        doc.destroy();
        return out;
      } catch { return null; }
    })());
  }
  return done.get(k);
}
