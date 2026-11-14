import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const msg = event?.message || (event as any)?.error?.message || '';
    if (msg.includes('ResizeObserver') || msg.includes('undelivered notifications')) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  });
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

