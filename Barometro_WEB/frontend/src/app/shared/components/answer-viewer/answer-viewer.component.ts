import { CommonModule, DatePipe } from '@angular/common';
import { Component, Input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormQuestion } from '@core/services/form.service';

interface GpsCoords {
  lat: number;
  lng: number;
  accuracy?: number;
}

@Component({
  selector: 'app-answer-viewer',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, DatePipe],
  template: `
    <div class="answer-viewer-root">
      @switch (questionType) {
        @case ('NOTE') {
          <span class="note-placeholder">
            <mat-icon class="inline-icon">info_outline</mat-icon>
            (Texto informativo, sin respuesta)
          </span>
        }

        @case ('DATE') {
          @if (parsedDate) {
            <span class="date-badge">
              <mat-icon class="inline-icon">calendar_today</mat-icon>
              {{ parsedDate | date: 'dd/MM/yyyy' }}
            </span>
          } @else {
            <span class="text-value">{{ formattedValue || '-' }}</span>
          }
        }

        @case ('TIME') {
          <span class="time-badge">
            <mat-icon class="inline-icon">schedule</mat-icon>
            {{ formattedValue || '-' }}
          </span>
        }

        @case ('DATETIME') {
          @if (parsedDate) {
            <span class="datetime-badge">
              <mat-icon class="inline-icon">event_repeat</mat-icon>
              {{ parsedDate | date: 'dd/MM/yyyy HH:mm' }}
            </span>
          } @else {
            <span class="text-value">{{ formattedValue || '-' }}</span>
          }
        }

        @case ('GPS') {
          @if (gpsCoords) {
            <div class="gps-container">
              <span class="gps-coords">
                <mat-icon class="inline-icon text-red-500">location_on</mat-icon>
                {{ gpsCoords.lat }}, {{ gpsCoords.lng }}
                @if (gpsCoords.accuracy) {
                  <small class="accuracy">(&plusmn;{{ gpsCoords.accuracy }}m)</small>
                }
              </span>
              <a
                [href]="'https://www.google.com/maps?q=' + gpsCoords.lat + ',' + gpsCoords.lng"
                target="_blank"
                rel="noopener noreferrer"
                class="btn-maps-link"
                title="Abrir en Google Maps"
              >
                <mat-icon>open_in_new</mat-icon>
                <span>Google Maps</span>
              </a>
            </div>
          } @else {
            <span class="text-value">{{ formattedValue || '-' }}</span>
          }
        }

        @case ('MULTIMEDIA') {
          @if (isAudioMedia) {
            <div class="audio-player-wrapper">
              <audio controls [src]="mediaUrl" class="native-audio-player"></audio>
            </div>
          } @else if (isImageMedia) {
            <div class="media-thumbnail-container">
              <img
                [src]="mediaUrl"
                alt="Vista previa multimedia"
                class="media-thumbnail"
                (click)="openImageModal(mediaUrl)"
              />
              <button type="button" class="btn-zoom" (click)="openImageModal(mediaUrl)">
                <mat-icon>zoom_in</mat-icon>
              </button>
            </div>
          } @else {
            <span class="text-value">{{ formattedValue || '-' }}</span>
          }
        }

        @case ('SIGNATURE') {
          @if (signatureUrl) {
            <div class="signature-container">
              <div class="signature-thumbnail-box" (click)="openImageModal(signatureUrl)">
                <img [src]="signatureUrl" alt="Firma digital" class="signature-img" />
              </div>
              <button type="button" class="btn-signature-view" (click)="openImageModal(signatureUrl)">
                <mat-icon>draw</mat-icon>
                <span>Ver firma completa</span>
              </button>
            </div>
          } @else {
            <span class="text-value">{{ formattedValue || '-' }}</span>
          }
        }

        @case ('RANKING') {
          @if (rankingList.length > 0) {
            <ol class="ranking-list">
              @for (item of rankingList; track $index) {
                <li class="ranking-item">
                  <span class="ranking-badge">{{ $index + 1 }}º</span>
                  <span class="ranking-label">{{ item }}</span>
                </li>
              }
            </ol>
          } @else {
            <span class="text-value">{{ formattedValue || '-' }}</span>
          }
        }

        @case ('RATING') {
          @if (ratingValue !== null) {
            <div class="rating-display">
              @if (isStarRating) {
                <div class="stars-row">
                  @for (star of starArray; track $index) {
                    <mat-icon class="star-icon" [class.filled]="$index < ratingValue">
                      {{ $index < ratingValue ? 'star' : 'star_border' }}
                    </mat-icon>
                  }
                </div>
              }
              <span class="rating-score">({{ ratingValue }}/{{ maxRating }})</span>
            </div>
          } @else {
            <span class="text-value">{{ formattedValue || '-' }}</span>
          }
        }

        @case ('BARCODE') {
          @if (formattedValue) {
            <div class="barcode-container">
              <code class="barcode-code">{{ formattedValue }}</code>
              <button type="button" class="btn-copy" (click)="copyToClipboard(formattedValue)">
                <mat-icon>{{ copied() ? 'check' : 'content_copy' }}</mat-icon>
                <span>{{ copied() ? 'Copiado' : 'Copiar' }}</span>
              </button>
            </div>
          } @else {
            <span class="text-value">-</span>
          }
        }

        @case ('CALCULATE') {
          @if (formattedValue) {
            <span class="calculate-badge">
              <mat-icon class="inline-icon">calculate</mat-icon>
              <strong>{{ formattedValue }}</strong>
              <small class="calc-tag">(Cálculo automático)</small>
            </span>
          } @else {
            <span class="text-value">-</span>
          }
        }

        @default {
          <span class="text-value">{{ formattedValue || '-' }}</span>
        }
      }

      <!-- Lightbox Modal para Firma e Imágenes -->
      @if (activeModalUrl()) {
        <div class="lightbox-overlay" (click)="closeModal()">
          <div class="lightbox-content" (click)="$event.stopPropagation()">
            <button type="button" class="lightbox-close" (click)="closeModal()">
              <mat-icon>close</mat-icon>
            </button>
            <img [src]="activeModalUrl()" alt="Vista ampliada" class="lightbox-img" />
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .answer-viewer-root {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.9rem;
    }

    .inline-icon {
      font-size: 1.1rem;
      width: 1.1rem;
      height: 1.1rem;
      vertical-align: middle;
      display: inline-block;
    }

    .note-placeholder {
      color: #94a3b8;
      font-style: italic;
      font-size: 0.85rem;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }

    .date-badge, .time-badge, .datetime-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background-color: #f1f5f9;
      color: #334155;
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      font-weight: 500;
    }

    .gps-container {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .gps-coords {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-family: monospace;
      background-color: #fef2f2;
      color: #991b1b;
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
      font-weight: 600;

      .accuracy {
        color: #b91c1c;
        font-weight: normal;
        margin-left: 0.2rem;
      }
    }

    .btn-maps-link {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      background-color: #2563eb;
      color: #ffffff;
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      text-decoration: none;
      transition: background-color 0.2s;

      &:hover {
        background-color: #1d4ed8;
      }

      mat-icon {
        font-size: 0.9rem;
        width: 0.9rem;
        height: 0.9rem;
      }
    }

    .media-thumbnail-container {
      position: relative;
      display: inline-block;

      .media-thumbnail {
        max-width: 90px;
        max-height: 70px;
        border-radius: 6px;
        border: 1px solid #cbd5e1;
        object-fit: cover;
        cursor: pointer;
        transition: transform 0.2s;

        &:hover {
          transform: scale(1.04);
        }
      }

      .btn-zoom {
        position: absolute;
        bottom: 2px;
        right: 2px;
        background: rgba(0, 0, 0, 0.6);
        color: #fff;
        border: none;
        border-radius: 4px;
        padding: 2px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;

        mat-icon {
          font-size: 1rem;
          width: 1rem;
          height: 1rem;
        }
      }
    }

    .audio-player-wrapper {
      .native-audio-player {
        height: 36px;
        max-width: 220px;
      }
    }

    .signature-container {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .signature-thumbnail-box {
      background-color: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 4px;
      cursor: pointer;

      .signature-img {
        max-height: 40px;
        max-width: 120px;
        object-fit: contain;
      }
    }

    .btn-signature-view {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      background: none;
      border: 1px solid #94a3b8;
      color: #475569;
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
      font-size: 0.75rem;
      cursor: pointer;

      &:hover {
        background-color: #f8fafc;
        color: #1e293b;
      }

      mat-icon {
        font-size: 0.9rem;
        width: 0.9rem;
        height: 0.9rem;
      }
    }

    .ranking-list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .ranking-item {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      background-color: #f8fafc;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      border-left: 3px solid #3b82f6;
    }

    .ranking-badge {
      font-weight: 700;
      color: #2563eb;
      font-size: 0.75rem;
    }

    .ranking-label {
      color: #334155;
      font-size: 0.85rem;
    }

    .rating-display {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }

    .stars-row {
      display: inline-flex;
      align-items: center;
      color: #cbd5e1;

      .star-icon {
        font-size: 1.2rem;
        width: 1.2rem;
        height: 1.2rem;

        &.filled {
          color: #f59e0b;
        }
      }
    }

    .rating-score {
      font-weight: 600;
      color: #475569;
      font-size: 0.85rem;
    }

    .barcode-container {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;

      .barcode-code {
        background-color: #f1f5f9;
        color: #0f172a;
        font-family: monospace;
        padding: 0.2rem 0.4rem;
        border-radius: 4px;
        font-weight: 600;
        font-size: 0.85rem;
        letter-spacing: 0.05em;
      }

      .btn-copy {
        display: inline-flex;
        align-items: center;
        gap: 0.2rem;
        background: none;
        border: 1px solid #cbd5e1;
        color: #475569;
        border-radius: 4px;
        padding: 0.15rem 0.4rem;
        font-size: 0.75rem;
        cursor: pointer;

        &:hover {
          background-color: #f8fafc;
        }

        mat-icon {
          font-size: 0.85rem;
          width: 0.85rem;
          height: 0.85rem;
        }
      }
    }

    .calculate-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background-color: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1d4ed8;
      padding: 0.2rem 0.5rem;
      border-radius: 6px;

      .calc-tag {
        font-size: 0.75rem;
        color: #3b82f6;
      }
    }

    .lightbox-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }

    .lightbox-content {
      position: relative;
      max-width: 90vw;
      max-height: 90vh;
      background: #ffffff;
      padding: 0.5rem;
      border-radius: 8px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);

      .lightbox-img {
        max-width: 100%;
        max-height: 80vh;
        object-fit: contain;
        display: block;
      }

      .lightbox-close {
        position: absolute;
        top: -12px;
        right: -12px;
        background: #ef4444;
        color: #ffffff;
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
      }
    }
  `],
})
export class AnswerViewerComponent {
  @Input({ required: true }) question!: FormQuestion;
  @Input() value: any;
  @Input() formattedValue: string = '';

  copied = signal(false);
  activeModalUrl = signal<string | null>(null);

  get questionType(): FormQuestion['type'] {
    return this.question?.type || 'TEXT';
  }

  get parsedDate(): Date | null {
    if (!this.value && !this.formattedValue) return null;
    const raw = this.value || this.formattedValue;
    const dateObj = new Date(raw);
    return isNaN(dateObj.getTime()) ? null : dateObj;
  }

  get gpsCoords(): GpsCoords | null {
    if (!this.value) {
      if (this.formattedValue && this.formattedValue.includes(',')) {
        const parts = this.formattedValue.split(',').map((p) => parseFloat(p.trim()));
        if (!isNaN(parts[0]) && !isNaN(parts[1])) {
          return { lat: parts[0], lng: parts[1] };
        }
      }
      return null;
    }

    if (typeof this.value === 'object' && this.value !== null) {
      const lat = parseFloat(this.value.lat);
      const lng = parseFloat(this.value.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        return {
          lat,
          lng,
          accuracy: this.value.accuracy ? Math.round(parseFloat(this.value.accuracy)) : undefined,
        };
      }
    }

    if (Array.isArray(this.value) && this.value.length >= 2) {
      const lat = parseFloat(this.value[0]);
      const lng = parseFloat(this.value[1]);
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }

    return null;
  }

  get mediaUrl(): string {
    if (!this.value) return this.formattedValue || '';
    if (typeof this.value === 'string') return this.value;
    if (typeof this.value === 'object' && this.value !== null) {
      return this.value.dataUrl || this.value.url || this.value.data || '';
    }
    return '';
  }

  get isAudioMedia(): boolean {
    const url = this.mediaUrl;
    const allowed = this.question?.properties?.allowed_media;
    if (allowed === 'audio') return true;
    if (url.startsWith('data:audio/') || url.match(/\.(webm|mp4|mp3|ogg|aac|wav)$/i)) return true;
    if (typeof this.value === 'object' && this.value?.type === 'audio') return true;
    return false;
  }

  get isImageMedia(): boolean {
    const url = this.mediaUrl;
    const allowed = this.question?.properties?.allowed_media;
    if (allowed === 'image') return true;
    if (url.startsWith('data:image/') || url.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i)) return true;
    if (typeof this.value === 'object' && this.value?.type === 'image') return true;
    return Boolean(url && !this.isAudioMedia);
  }

  get signatureUrl(): string {
    if (!this.value) return this.formattedValue || '';
    if (typeof this.value === 'string') return this.value;
    if (typeof this.value === 'object' && this.value !== null) {
      return this.value.dataUrl || this.value.url || this.value.data || '';
    }
    return '';
  }

  get rankingList(): string[] {
    if (Array.isArray(this.value)) {
      return this.value.map(String);
    }
    if (typeof this.value === 'string' && this.value.trim()) {
      try {
        const parsed = JSON.parse(this.value);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {
        return this.value.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
    if (this.formattedValue) {
      return this.formattedValue.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [];
  }

  get ratingValue(): number | null {
    const val = this.value !== undefined && this.value !== null ? this.value : this.formattedValue;
    const num = parseFloat(val);
    return isNaN(num) ? null : Math.round(num);
  }

  get maxRating(): number {
    return this.question?.properties?.max_rating || 5;
  }

  get isStarRating(): boolean {
    return (this.question?.properties?.icon_type || 'star') === 'star';
  }

  get starArray(): number[] {
    return Array.from({ length: this.maxRating }, (_, i) => i);
  }

  copyToClipboard(text: string): void {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  openImageModal(url: string): void {
    if (url) {
      this.activeModalUrl.set(url);
    }
  }

  closeModal(): void {
    this.activeModalUrl.set(null);
  }
}
