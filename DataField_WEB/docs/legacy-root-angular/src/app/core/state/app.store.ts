import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AppStore {
  readonly appReady = signal(false);

  markReady(): void {
    this.appReady.set(true);
  }
}
