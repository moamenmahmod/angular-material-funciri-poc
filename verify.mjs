import {readFileSync, writeFileSync} from 'node:fs';
import {chromium} from 'playwright-core';

const APP_URL = 'http://localhost:4216//127.0.0.1:4217/collect';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({headless: true, executablePath: CHROME});
const page = await browser.newPage();
const browserRequests = [];
const pageMessages = [];

page.on('console', message => pageMessages.push(`console:${message.type()}:${message.text()}`));
page.on('pageerror', error => pageMessages.push(`pageerror:${error.stack ?? error.message}`));

page.on('request', request => {
  if (request.url().startsWith('http://127.0.0.1:4217/collect')) {
    browserRequests.push({url: request.url(), resourceType: request.resourceType()});
  }
});

await page.goto(APP_URL, {waitUntil: 'domcontentloaded'});
let completionError = '';
try {
  await page.waitForFunction(() => document.documentElement.dataset.pocComplete === 'true', null, {
    timeout: 5000,
  });
} catch (error) {
  completionError = String(error);
}
await page.waitForTimeout(500);

const domEvidence = await page.evaluate(() => window.__queryLeakEvidence);
const visibleText = await page.locator('body').innerText();
const loggerHits = JSON.parse(readFileSync(new URL('./logger-hits.json', import.meta.url), 'utf8'));
const nonce = domEvidence?.nonce ?? '';
const initialHit = loggerHits.find(hit => hit.requestTarget === '/collect');
const nonceHit = loggerHits.find(hit => hit.requestTarget.includes(`fresh_nonce=${nonce}`));

const assertions = {
  exactMaterialVersion: JSON.parse(
    readFileSync(new URL('./node_modules/@angular/material/package.json', import.meta.url), 'utf8'),
  ).version === '22.1.6',
  nonceGeneratedAfterInitialUrl: Boolean(
    nonce && !domEvidence.initialUrl.includes(nonce) && !domEvidence.initialFill.includes(nonce),
  ),
  historyAddedNonceToSearch: Boolean(domEvidence?.replacedUrl.includes(`?fresh_nonce=${nonce}`)),
  matIconRewroteFuncIri: Boolean(domEvidence?.rewrittenFill.includes(`?fresh_nonce=${nonce}#fresh-gradient`)),
  loggerSawInitialRequestWithoutNonce: Boolean(initialHit),
  separateLoggerReceivedFreshNonce: Boolean(nonceHit),
  loggerRequestIsCrossSite: nonceHit?.secFetchSite === 'cross-site',
  browserObservedPaintFetchWithNonce: browserRequests.some(request =>
    request.url.includes(`fresh_nonce=${nonce}`),
  ),
};

const output = {
  testedAt: new Date().toISOString(),
  appUrl: APP_URL,
  domEvidence,
  visibleText,
  completionError,
  browserRequests,
  pageMessages,
  loggerHits,
  assertions,
  passed: Object.values(assertions).every(Boolean),
};

writeFileSync(new URL('./verification-result.json', import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
await browser.close();

if (!output.passed) {
  process.exitCode = 1;
}
