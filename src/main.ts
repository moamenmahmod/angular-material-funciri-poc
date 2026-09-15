import {bootstrapApplication} from '@angular/platform-browser';
import {ChangeDetectorRef, Component, inject} from '@angular/core';
import {MatIconModule, MatIconRegistry} from '@angular/material/icon';
import {DomSanitizer} from '@angular/platform-browser';

declare global {
  interface Window {
    __queryLeakEvidence?: {
      initialUrl: string;
      initialFill: string;
      nonce: string;
      replacedUrl: string;
      rewrittenFill: string;
    };
  }
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <h1>Angular Material 22.1.6 dynamic query leak</h1>
    <p>This page and the logger bind only to <code>127.0.0.1</code>.</p>
    <div class="status" id="initial-url">Initial URL: {{initialUrl}}</div>
    <div class="status" id="initial-fill">Initial fill: {{initialFill}}</div>
    <div class="status" id="nonce">Fresh nonce: {{nonce}}</div>
    <div class="status" id="rewritten-fill">Rewritten fill: {{rewrittenFill}}</div>
    <div class="status" id="phase">Phase: {{phase}}</div>
    <mat-icon svgIcon="gradient-icon" aria-label="gradient test icon"></mat-icon>
  `,
})
class App {
  private readonly changeDetector = inject(ChangeDetectorRef);
  initialUrl = location.href;
  initialFill = '(waiting for first MatIcon rewrite)';
  nonce = '(not generated)';
  rewrittenFill = '(waiting for URL change)';
  phase = 'initial render';

  constructor() {
    const registry = inject(MatIconRegistry);
    const sanitizer = inject(DomSanitizer);

    registry.addSvgIconLiteral(
      'gradient-icon',
      sanitizer.bypassSecurityTrustHtml(
        '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">' +
          '<defs><linearGradient id="fresh-gradient"><stop stop-color="#e91e63"/>' +
          '<stop offset="1" stop-color="#3f51b5"/></linearGradient></defs>' +
          '<rect width="48" height="48" fill="url(#fresh-gradient)"/></svg>',
      ),
    );

    this.waitForInitialRewrite();
  }

  private waitForInitialRewrite(): void {
    const poll = (): void => {
      const rect = document.querySelector('mat-icon svg rect');
      const fill = rect?.getAttribute('fill');
      if (!fill || !fill.includes('#fresh-gradient')) {
        setTimeout(poll, 20);
        return;
      }

      this.initialFill = fill;
      this.phase = 'initial rewrite observed; nonce still does not exist';

      // Generate the value only after the app and icon have completed their first render.
      // It was not present in the navigation URL or the initial logger request.
      setTimeout(() => {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        this.nonce = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        // Use an absolute same-origin URL. Passing the `//`-prefixed pathname as a
        // relative URL would itself be parsed as a protocol-relative cross-origin URL.
        const nextUrl = `${location.origin}${location.pathname}?fresh_nonce=${this.nonce}`;
        history.replaceState({generatedAfterRender: true}, '', nextUrl);
        this.phase = 'fresh nonce added with history.replaceState';
        this.changeDetector.detectChanges();

        // The explicit post-navigation render traverses MatIcon, whose ngAfterViewChecked
        // sees pathname+search change and rewrites the FuncIRI.
        setTimeout(() => {
          const updatedRect = document.querySelector('mat-icon svg rect');
          this.rewrittenFill = updatedRect?.getAttribute('fill') ?? '(rect missing)';
          this.phase = this.rewrittenFill.includes(this.nonce)
            ? 'confirmed: MatIcon rewrote the FuncIRI with the fresh nonce'
            : 'failed: fresh nonce absent from rewritten FuncIRI';
          this.changeDetector.detectChanges();
          window.__queryLeakEvidence = {
            initialUrl: this.initialUrl,
            initialFill: this.initialFill,
            nonce: this.nonce,
            replacedUrl: location.href,
            rewrittenFill: this.rewrittenFill,
          };
          document.documentElement.dataset['pocComplete'] = 'true';
        }, 100);
      }, 100);
    };

    setTimeout(poll, 0);
  }
}

bootstrapApplication(App).catch(error => console.error(error));
