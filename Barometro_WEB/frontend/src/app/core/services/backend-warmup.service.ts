import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { Observable, ReplaySubject } from 'rxjs';
import { take } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class BackendWarmupService {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);

  private readonly healthUrl = `${environment.apiUrl}/health`;
  private readonly subject = new ReplaySubject<true>(1);
  private started = false;
  private completed = false;

  ready$(): Observable<true> {
    if (!this.started) {
      this.started = true;
      this.startWarmup();
    }

    return this.subject.asObservable().pipe(take(1));
  }

  private startWarmup(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.completeWarmup();
      return;
    }

    this.attempt(0);
  }

  private attempt(n: number): void {
    this.http.get(this.healthUrl).subscribe({
      next: () => this.completeWarmup(),
      error: () => {
        if (n >= 8) {
          this.completeWarmup();
          return;
        }

        const delay = Math.min(1000 * 1.5 ** n, 8000);
        setTimeout(() => this.attempt(n + 1), delay);
      },
    });
  }

  private completeWarmup(): void {
    if (this.completed) {
      return;
    }

    this.completed = true;
    this.subject.next(true);
    this.subject.complete();
  }
}
