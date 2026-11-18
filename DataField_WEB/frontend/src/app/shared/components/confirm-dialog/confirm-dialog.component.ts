import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: 'primary' | 'accent' | 'warn';
  icon?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatDialogModule, MatIconModule, TranslateModule],
  template: `
    <h2 mat-dialog-title>
      <!-- El flex va en un contenedor interno: en el título, el ::before de Material contaría como elemento y desplazaría el texto. -->
      <span class="confirm-title">
        @if (data.icon) {
          <mat-icon [color]="data.confirmColor || 'primary'" aria-hidden="true">{{ data.icon }}</mat-icon>
        }
        <span>{{ data.title }}</span>
      </span>
    </h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="onCancel()">
        {{ data.cancelText || ('common.buttons.cancel' | translate) }}
      </button>
      <button mat-flat-button [color]="data.confirmColor || 'primary'" (click)="onConfirm()">
        {{ data.confirmText || ('common.buttons.confirm' | translate) }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      /* Mismo margen izquierdo (24px) para título, mensaje y botones. */
      h2[mat-dialog-title] {
        margin: 0;
        padding: 1.25rem 1.5rem 0.5rem;
        font-size: 1.125rem;
        font-weight: 700;
        line-height: 1.4;
        color: var(--text-primary);
      }

      h2[mat-dialog-title]::before {
        display: none;
      }

      .confirm-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      mat-dialog-content {
        padding: 0 1.5rem;
      }

      mat-dialog-content p {
        margin: 0;
        line-height: 1.5;
        color: var(--text-secondary);
        overflow-wrap: anywhere;
      }

      mat-dialog-actions {
        min-height: 0;
        padding: 1.25rem 1.5rem 1.25rem;
        gap: 0.5rem;
      }
    `,
  ],
})
export class ConfirmDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ConfirmDialogComponent>);
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onConfirm(): void {
    this.dialogRef.close(true);
  }
}
