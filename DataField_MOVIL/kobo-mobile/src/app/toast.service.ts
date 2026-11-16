import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

/** Diálogo propio que reemplaza confirm() y prompt() del navegador. */
export interface DialogRequest {
  kind: 'confirm' | 'prompt';
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  tone: 'danger' | 'primary';
  value: string;
  inputLabel: string;
  inputType: string;
  resolve: (value: boolean | string | null) => void;
}

export interface DialogOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'danger' | 'primary';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  toasts = signal<Toast[]>([]);
  dialog = signal<DialogRequest | null>(null);
  private counter = 0;

  show(message: string, type: ToastType = 'success', durationMs?: number) {
    const id = ++this.counter;
    const duration = durationMs ?? (type === 'error' || type === 'warning' ? 6000 : 3500);
    this.toasts.update(t => [...t.filter(item => item.message !== message), { id, message, type }].slice(-3));
    setTimeout(() => this.dismiss(id), duration);
  }

  dismiss(id: number) {
    this.toasts.update(t => t.filter(toast => toast.id !== id));
  }

  /** Confirmación con el estilo de la app; resuelve true si la persona acepta. */
  confirm(options: DialogOptions): Promise<boolean> {
    return this.open('confirm', options, '', '', 'text').then(value => value === true);
  }

  /** Pide un dato con el estilo de la app; resuelve el texto o null si se cancela. */
  prompt(options: DialogOptions & { label: string; value?: string; type?: string }): Promise<string | null> {
    return this.open('prompt', options, options.value ?? '', options.label, options.type ?? 'text')
      .then(value => (typeof value === 'string' ? value : null));
  }

  private open(kind: DialogRequest['kind'], options: DialogOptions, value: string, inputLabel: string, inputType: string): Promise<boolean | string | null> {
    this.dialog()?.resolve(null);
    return new Promise(resolve => {
      this.dialog.set({
        kind,
        title: options.title,
        message: options.message ?? '',
        confirmText: options.confirmText ?? 'Aceptar',
        cancelText: options.cancelText ?? 'Cancelar',
        tone: options.tone ?? 'primary',
        value,
        inputLabel,
        inputType,
        resolve: (answer) => {
          this.dialog.set(null);
          resolve(answer);
        },
      });
    });
  }
}
