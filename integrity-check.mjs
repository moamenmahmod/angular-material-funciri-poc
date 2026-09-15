import {writeFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {chromium} from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({headless: true, executablePath: CHROME});

function summarizePng(buffer) {
  const png = PNG.sync.read(buffer);
  let red = 0;
  let green = 0;
  let blue = 0;
  let opaquePixels = 0;
  for (let offset = 0; offset < png.data.length; offset += 4) {
    if (png.data[offset + 3] === 0) {
      continue;
    }
    red += png.data[offset];
    green += png.data[offset + 1];
    blue += png.data[offset + 2];
    opaquePixels++;
  }
  return {
    width: png.width,
    height: png.height,
    opaquePixels,
    averageRgb: {
      red: Math.round(red / opaquePixels),
      green: Math.round(green / opaquePixels),
      blue: Math.round(blue / opaquePixels),
    },
  };
}

async function capture(name, endpoint) {
  const page = await browser.newPage();
  const requestUrls = [];
  page.on('request', request => {
    if (request.url().startsWith(`http://127.0.0.1:4217/${endpoint}`)) {
      requestUrls.push(request.url());
    }
  });
  await page.goto(`http://localhost:4216//127.0.0.1:4217/${endpoint}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => document.documentElement.dataset.pocComplete === 'true');
  await page.waitForTimeout(250);
  const icon = page.locator('mat-icon');
  const pngBuffer = await icon.screenshot({path: `integrity-${name}.png`});
  const fill = await page.locator('mat-icon svg rect').getAttribute('fill');
  const pixels = summarizePng(pngBuffer);
  await page.close();
  return {endpoint, fill, requestUrls, screenshot: `integrity-${name}.png`, pixels};
}

const redResponse = await capture('red', 'paint-red');
const greenResponse = await capture('green', 'paint-green');
const red = redResponse.pixels.averageRgb;
const green = greenResponse.pixels.averageRgb;
const assertions = {
  bothExternalResourcesFetched: redResponse.requestUrls.length >= 2 && greenResponse.requestUrls.length >= 2,
  redResponseControlsPixels: red.red > red.green + 80 && red.red > red.blue + 80,
  greenResponseControlsPixels: green.green > green.red + 80 && green.green > green.blue + 80,
};
const result = {
  testedAt: new Date().toISOString(),
  redResponse,
  greenResponse,
  assertions,
  externalPaintControlledPixels: Object.values(assertions).every(Boolean),
};

writeFileSync('integrity-result.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
await browser.close();
