import { A11yModule } from '@angular/cdk/a11y';
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, OnDestroy } from '@angular/core';
import { AppNotification, NotificationKind, NotificationService } from '@core/services/notification.service';

const ICONS: Record<NotificationKind, string> = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
const LABELS: Record<NotificationKind, string> = { success: 'Listo', error: 'Error', warning: 'Atención', info: 'Aviso' };

/** Muestra las notificaciones y el diálogo de confirmación del NotificationService. */
@Component({
  selector: 'app-notification-host',
  standalone: true,
  imports: [A11yModule, NgTemplateOutlet],
  templateUrl: './notification-host.component.html',
  styleUrl: './notification-host.component.scss',
})
export class NotificationHostComponent implements OnDestroy {
  readonly notify = inject(NotificationService);
  /** Éxitos y avisos se anuncian con cortesía; errores y advertencias, de inmediato. */
  readonly polite = computed(() => this.notify.notifications().filter((item) => item.kind === 'success' || item.kind === 'info'));
  readonly urgent = computed(() => this.notify.notifications().filter((item) => item.kind === 'error' || item.kind === 'warning'));

  private readonly timers = new Map<number, { handle: ReturnType<typeof setTimeout> | null; remaining: number; started: number }>();

  private readonly schedule = effect(() => {
    const items = this.notify.notifications();
    for (const item of items) {
      if (!this.timers.has(item.id) && item.duration > 0) {
        this.timers.set(item.id, { handle: null, remaining: item.duration, started: 0 });
        this.resume(item);
      }
    }
    for (const id of [...this.timers.keys()]) {
      if (!items.some((item) => item.id === id)) this.clear(id);
    }
  });

  /** Pausa el cierre automático mientras el puntero o el foco están sobre la notificación (WCAG 2.2.1). */
  pause(item: AppNotification): void {
    const timer = this.timers.get(item.id);
    if (!timer?.handle) return;
    clearTimeout(timer.handle);
    timer.handle = null;
    timer.remaining = Math.max(1500, timer.remaining - (Date.now() - timer.started));
  }

  resume(item: AppNotification): void {
    const timer = this.timers.get(item.id);
    if (!timer || timer.handle) return;
    timer.started = Date.now();
    timer.handle = setTimeout(() => this.notify.dismiss(item.id), timer.remaining);
  }

  iconOf(item: AppNotification): string {
    return ICONS[item.kind];
  }

  titleOf(item: AppNotification): string {
    return item.title || LABELS[item.kind];
  }

  answer(accepted: boolean): void {
    this.notify.confirmation()?.resolve(accepted);
  }

  ngOnDestroy(): void {
    for (const id of [...this.timers.keys()]) this.clear(id);
  }

  private clear(id: number): void {
    const timer = this.timers.get(id);
    if (timer?.handle) clearTimeout(timer.handle);
    this.timers.delete(id);
  }
}
