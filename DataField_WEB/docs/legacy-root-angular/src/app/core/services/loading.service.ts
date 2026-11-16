import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly activeRequests = signal(0);

  readonly isLoading = this.activeRequests.asReadonly();

  start(): void {
    this.activeRequests.update((value) => value + 1);
  }

  stop(): void {
    this.activeRequests.update((value) => Math.max(0, value - 1));
  }
}
