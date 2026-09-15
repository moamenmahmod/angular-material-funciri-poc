# Angular Material 22.1.6 cross-origin FuncIRI PoC

This local-only reproduction uses the published `@angular/material@22.1.6`. It demonstrates that
`MatIcon.ngAfterViewChecked()` copies a query value generated *after initial render* into an SVG
FuncIRI whose `//`-prefixed pathname resolves at a separate origin. The browser then sends that
fresh value to a loopback-only logger.

It also verifies that a CORS-enabled SVG response from that origin can control the affected icon's
paint. This is limited icon-presentation integrity; it is not script execution or arbitrary DOM
control.

Both servers bind explicitly to `127.0.0.1`; no production service is contacted. The tested page is
served as `localhost` so Chromium records the logger request as cross-site.

```bash
npm install
npm run build
npm run serve
# In a second shell:
npm run verify
# Optional: compare two CORS-enabled SVG responses and the resulting icon pixels.
npm run check:integrity
```

The verification command writes `verification-result.json`; the logger writes
`logger-hits.json`. The integrity check writes `integrity-result.json` and two small screenshots.

The checked-in evidence shows:

- all eight nonce-leak assertions passing;
- a newly generated 128-bit value appearing in a cross-site GET only after
  `history.replaceState` and a subsequent `MatIcon` rewrite;
- red and green attacker responses producing average icon RGB values of `(255, 5, 5)` and
  `(5, 255, 5)`, respectively.

Preconditions are a `MatIcon` SVG containing a FuncIRI such as `fill="url(#id)"`, an application
that serves a browser-visible `//`-prefixed SPA route, a CSP that permits the resource request, and
a user opening the crafted link.
