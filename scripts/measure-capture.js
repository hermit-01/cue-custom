// One-off: what does a real capture on THIS machine actually weigh?
// Run: npx electron scripts/measure-capture.js
const { app, nativeImage } = require('electron');
const { captureScreenshot } = require('../src/screen');

const MB = 1048576;

app.whenReady().then(async () => {
  const url = await captureScreenshot();
  if (!url) { console.log('capture returned null — grant screen recording permission and retry'); app.quit(); return; }
  const img = nativeImage.createFromDataURL(url);
  const { width, height } = img.getSize();
  const report = (label, dataUrl, w, h) => {
    const mb = dataUrl.length / MB;
    console.log(`${label.padEnd(8)} ${String(w).padStart(5)}x${String(h).padEnd(5)}  one=${mb.toFixed(2)} MB  six=${(mb * 6).toFixed(2)} MB  ${(mb * 6) > 18 ? 'OVER 18MB budget' : 'fits'}`);
  };
  report('full', url, width, height);
  for (const edge of [2560, 2048, 1600]) {
    const r = img.resize({ width: edge, quality: 'best' });
    const s = r.getSize();
    report(String(edge), r.toDataURL(), s.width, s.height);
  }
  app.quit();
});
