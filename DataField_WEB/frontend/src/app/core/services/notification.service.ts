import { Injectable, signal } from '@angular/core';

export type NotificationKind = 'success' | 'error' | 'warning' | 'info';

export interface AppNotification {
  id: number;
  kind: NotificationKind;
  message: string;
  title?: string;
  /** Milisegundos antes de cerrarse sola; 0 = queda hasta que se cierre. */
  duration: number;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** 'danger' para acciones que borran o no se pueden deshacer. */
  tone?: 'danger' | 'primary';
}

export interface PendingConfirmation extends Required<Omit<ConfirmOptions, 'tone'>> {
  tone: 'danger' | 'primary';
  resolve: (accepted: boolean) => void;
}

const DURATIONS: Record<NotificationKind, number> = { success: 4000, info: 5000, warning: 7000, error: 8000 };
const MAX_VISIBLE = 4;

/**
 * Notificaciones del sistema (reemplazan alert(), confirm() y los snackbars).
 * Las muestra <app-notification-host>, montado una sola vez en la raíz de la aplicación.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly notifications = signal<AppNotification[]>([]);
  readonly confirmation = signal<PendingConfirmation | null>(null);
  private nextId = 1;

  success(message: string, title?: string): number {
    return this.show('success', message, title);
  }

  error(message: string, title?: string): number {
    return this.show('error', message, title);
  }

  warning(message: string, title?: string): number {
    return this.show('warning', message, title);
  }

  info(message: string, title?: string): number {
    return this.show('info', message, title);
  }

  show(kind: NotificationKind, message: string, title?: string, duration = DURATIONS[kind]): number {
    const id = this.nextId++;
    this.notifications.update((items) => {
      // Un mensaje idéntico que ya está visible no se repite.
      const others = items.filter((item) => !(item.kind === kind && item.message === message));
      return [...others, { id, kind, message, title, duration }].slice(-MAX_VISIBLE);
    });
    return id;
  }

  dismiss(id: number): void {
    this.notifications.update((items) => items.filter((item) => item.id !== id));
  }

  /** Diálogo de confirmación propio; resuelve true si la persona acepta. */
  confirm(options: ConfirmOptions): Promise<boolean> {
    this.confirmation()?.resolve(false);
    return new Promise<boolean>((resolve) => {
      this.confirmation.set({
        title: options.title,
        message: options.message,
        confirmText: options.confirmText ?? 'Aceptar',
        cancelText: options.cancelText ?? 'Cancelar',
        tone: options.tone ?? 'primary',
        resolve: (accepted) => {
          this.confirmation.set(null);
          resolve(accepted);
        },
      });
    });
  }
}
