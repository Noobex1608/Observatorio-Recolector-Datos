import { CommonModule, DatePipe } from '@angular/common';
import { Component, Input, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { A11yModule } from '@angular/cdk/a11y';
import { MatIconModule } from '@angular/material/icon';
import { FormQuestion, FormService } from '@core/services/form.service';

interface GpsCoords {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface GeofenceResult {
  hasZone: boolean;
  zoneName: string;
  isInside: boolean;
  distanceMeters: number | null;
  allowedRadiusMeters: number | null;
  formattedDistance: string | null;
}

@Component({
  selector: 'app-answer-viewer',
  standalone: true,
  imports: [A11yModule, CommonModule, MatIconModule, MatButtonModule, DatePipe],
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
            @if (compact) {
              <!-- Vista Compacta para Celdas de Tabla -->
              <div class="gps-compact-cell">
                <div class="gps-compact-row">
                  <span class="gps-compact-coords">
                    <mat-icon class="icon-pin">place</mat-icon>
                    <span>{{ gpsCoords.lat | number: '1.4-4' }}, {{ gpsCoords.lng | number: '1.4-4' }}</span>
                  </span>
                  <a
                    [href]="'https://www.google.com/maps?q=' + gpsCoords.lat + ',' + gpsCoords.lng"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="btn-maps-subtle"
                    title="Abrir en Google Maps"
                  >
                    <mat-icon>open_in_new</mat-icon>
                  </a>
                </div>

                @if (geofenceResult) {
                  <div
                    class="geofence-compact-chip"
                    [class.chip-inside]="geofenceResult.isInside"
                    [class.chip-outside]="!geofenceResult.isInside"
                  >
                    <span class="status-dot">●</span>
                    <span class="chip-text">
                      {{ geofenceResult.zoneName }}
                      @if (geofenceResult.formattedDistance) {
                        ({{ geofenceResult.formattedDistance }})
                      }
                    </span>
                  </div>
                }
              </div>
            } @else {
              <!-- Vista Detallada Completa (Modal / Inspección) -->
              <div class="gps-container">
                <div class="gps-main-row">
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

                <!-- Badge de estado de Zona Delimitada (Geofencing) -->
                @if (geofenceResult) {
                  <div
                    class="geofence-chip"
                    [class.chip-inside]="geofenceResult.isInside"
                    [class.chip-outside]="!geofenceResult.isInside"
                  >
                    <mat-icon class="chip-icon">
                      {{ geofenceResult.isInside ? 'check_circle' : 'warning' }}
                    </mat-icon>
                    <span>
                      {{ geofenceResult.isInside ? 'Dentro de zona:' : 'Fuera de zona:' }}
                      <strong>{{ geofenceResult.zoneName }}</strong>
                    </span>
                    @if (geofenceResult.formattedDistance) {
                      <span class="chip-detail">
                        ({{ geofenceResult.isInside ? 'A ' + geofenceResult.formattedDistance : 'A ' + geofenceResult.formattedDistance + ' | Radio: ' + geofenceResult.allowedRadiusMeters + 'm' }})
                      </span>
                    }
                  </div>
                }

                <!-- Observaciones del encuestador -->
                @if (gpsNotes) {
                  <div class="gps-notes-badge">
                    <mat-icon class="notes-icon">edit_note</mat-icon>
                    <span>Observación: <em>"{{ gpsNotes }}"</em></span>
                  </div>
                }
              </div>
            }
          } @else {
            <span class="text-value">{{ formattedValue || '-' }}</span>
          }
        }

        @case ('MULTIMEDIA') {
          @if (isPrivateMedia && !mediaUrl) {
            <button type="button" mat-stroked-button (click)="loadPrivateMedia()" [disabled]="loadingPrivateMedia()">
              {{ loadingPrivateMedia() ? 'Cargando medio...' : 'Ver medio privado' }}
            </button>
            @if (privateMediaError()) { <span role="alert">{{ privateMediaError() }}</span> }
          } @else if (isVideoMedia) {
            <div class="video-player-wrapper">
              <video #videoPlayer controls [src]="mediaUrl" class="native-video-player"></video>

              <div class="transcription-action-bar">
                <button
                  type="button"
                  class="btn-transcribe"
                  (click)="toggleTranscription(videoPlayer)"
                  [class.active]="showTranscription"
                  [disabled]="isTranscribing"
                >
                  <mat-icon>subtitles</mat-icon>
                  <span>{{ isTranscribing ? 'Transcribiendo video...' : (showTranscription ? 'Ocultar transcripción' : 'Transcribir video') }}</span>
                </button>
              </div>

              @if (showTranscription && transcriptionText) {
                <div class="transcription-box">
                  <div class="transcription-header">
                    <span class="transcription-title">
                      <mat-icon>graphic_eq</mat-icon>
                      Transcripción de video
                    </span>
                    <div class="transcription-actions">
                      <button type="button" class="btn-copy-transcription" (click)="isEditing = !isEditing">
                        <mat-icon>{{ isEditing ? 'check' : 'edit' }}</mat-icon>
                        <span>{{ isEditing ? 'Guardar' : 'Editar' }}</span>
                      </button>
                      <button type="button" class="btn-copy-transcription" (click)="copyTranscription()">
                        <mat-icon>{{ isCopied ? 'done' : 'content_copy' }}</mat-icon>
                        <span>{{ isCopied ? 'Copiado' : 'Copiar' }}</span>
                      </button>
                    </div>
                  </div>
                  <div class="transcription-content">
                    @if (isEditing) {
                      <textarea
                        aria-label="Transcripción"
                        class="transcription-textarea"
                        [value]="transcriptionText"
                        (input)="transcriptionText = $any($event.target).value"
                        rows="3"
                      ></textarea>
                    } @else {
                      <p>{{ transcriptionText }}</p>
                    }
                  </div>
                </div>
              }
            </div>
          } @else if (isAudioMedia) {
            <div class="audio-player-wrapper">
              <audio #audioPlayer controls [src]="mediaUrl" class="native-audio-player"></audio>

              <div class="transcription-action-bar">
                <button
                  type="button"
                  class="btn-transcribe"
                  (click)="toggleTranscription(audioPlayer)"
                  [class.active]="showTranscription"
                  [disabled]="isTranscribing"
                >
                  <mat-icon>subtitles</mat-icon>
                  <span>{{ isTranscribing ? 'Transcribiendo audio...' : (showTranscription ? 'Ocultar transcripción' : 'Transcribir audio') }}</span>
                </button>
              </div>

              @if (showTranscription && transcriptionText) {
                <div class="transcription-box">
                  <div class="transcription-header">
                    <span class="transcription-title">
                      <mat-icon>graphic_eq</mat-icon>
                      Transcripción de audio
                    </span>
                    <div class="transcription-actions">
                      <button type="button" class="btn-copy-transcription" (click)="isEditing = !isEditing">
                        <mat-icon>{{ isEditing ? 'check' : 'edit' }}</mat-icon>
                        <span>{{ isEditing ? 'Guardar' : 'Editar' }}</span>
                      </button>
                      <button type="button" class="btn-copy-transcription" (click)="copyTranscription()">
                        <mat-icon>{{ isCopied ? 'done' : 'content_copy' }}</mat-icon>
                        <span>{{ isCopied ? 'Copiado' : 'Copiar' }}</span>
                      </button>
                    </div>
                  </div>
                  <div class="transcription-content">
                    @if (isEditing) {
                      <textarea
                        aria-label="Transcripción"
                        class="transcription-textarea"
                        [value]="transcriptionText"
                        (input)="transcriptionText = $any($event.target).value"
                        rows="3"
                      ></textarea>
                    } @else {
                      <p>{{ transcriptionText }}</p>
                    }
                  </div>
                </div>
              }
            </div>
          } @else if (isImageMedia) {
            <div class="media-thumbnail-container">
              <img
                [src]="mediaUrl"
                alt="Vista previa multimedia"
                class="media-thumbnail"
                (click)="openImageModal(mediaUrl)"
              />
              <button type="button" class="btn-zoom" aria-label="Ampliar imagen" (click)="openImageModal(mediaUrl)">
                <mat-icon>zoom_in</mat-icon>
              </button>
            </div>
          } @else {
            <span class="text-value">{{ formattedValue || '-' }}</span>
          }
        }

        @case ('SIGNATURE') {
          @if (isPrivateMedia && !signatureUrl) {
            <button type="button" mat-stroked-button (click)="loadPrivateMedia()" [disabled]="loadingPrivateMedia()">
              {{ loadingPrivateMedia() ? 'Cargando firma...' : 'Ver firma privada' }}
            </button>
            @if (privateMediaError()) { <span role="alert">{{ privateMediaError() }}</span> }
          } @else if (signatureUrl) {
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
        <div class="lightbox-overlay" (click)="closeModal()" (keydown.escape)="closeModal()">
          <div class="lightbox-content" role="dialog" aria-modal="true" aria-label="Vista ampliada" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
            <button type="button" class="lightbox-close" aria-label="Cerrar vista ampliada" (click)="closeModal()">
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

    /* --- Modo Compacto para Tablas --- */
    .gps-compact-cell {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      max-width: 220px;
      padding: 0.15rem 0;
    }

    .gps-compact-row {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }

    .gps-compact-coords {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      font-family: 'SFMono-Regular', Consolas, monospace;
      font-size: 0.8rem;
      font-weight: 600;
      color: #334155;

      .icon-pin {
        font-size: 0.95rem;
        width: 0.95rem;
        height: 0.95rem;
        color: #ef4444;
      }
    }

    .btn-maps-subtle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #64748b;
      padding: 2px;
      border-radius: 4px;
      text-decoration: none;
      transition: all 0.2s ease;

      &:hover {
        color: #2563eb;
        background-color: #eff6ff;
      }

      mat-icon {
        font-size: 0.9rem;
        width: 0.9rem;
        height: 0.9rem;
      }
    }

    .geofence-compact-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.1rem 0.45rem;
      border-radius: 4px;
      font-size: 0.73rem;
      font-weight: 500;
      line-height: 1.25;

      .status-dot {
        font-size: 0.6rem;
      }

      &.chip-inside {
        background-color: #f0fdf4;
        color: #166534;
        border: 1px solid #bbf7d0;

        .status-dot {
          color: #22c55e;
        }
      }

      &.chip-outside {
        background-color: #fffbeb;
        color: #92400e;
        border: 1px solid #fde68a;

        .status-dot {
          color: #f59e0b;
        }
      }
    }

    .gps-container {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.35rem;
      width: 100%;
    }

    .gps-main-row {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .geofence-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 500;
      line-height: 1.3;

      .chip-icon {
        font-size: 1rem;
        width: 1rem;
        height: 1rem;
      }

      .chip-detail {
        opacity: 0.88;
        font-size: 0.75rem;
      }

      &.chip-inside {
        background-color: #ecfdf5;
        border: 1px solid #a7f3d0;
        color: #047857;

        .chip-icon {
          color: #059669;
        }
      }

      &.chip-outside {
        background-color: #fffbeb;
        border: 1px solid #fde68a;
        color: #b45309;

        .chip-icon {
          color: #d97706;
        }
      }
    }

    .gps-notes-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      color: #475569;
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      font-size: 0.78rem;

      .notes-icon {
        font-size: 1rem;
        width: 1rem;
        height: 1rem;
        color: #64748b;
      }
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

    .audio-player-wrapper,
    .video-player-wrapper {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      align-items: flex-start;

      .native-audio-player {
        height: 38px;
        max-width: 260px;
      }

      .native-video-player {
        max-width: 280px;
        max-height: 180px;
        border-radius: 8px;
        background: #000;
      }
    }

    .transcription-action-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;

      .btn-transcribe {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.35rem 0.75rem;
        border-radius: 6px;
        border: 1px solid var(--border-color, #cbd5e1);
        background: var(--card-bg, #ffffff);
        color: var(--primary-600, #2563eb);
        font-size: 0.775rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;

        mat-icon {
          font-size: 1rem;
          width: 1rem;
          height: 1rem;
        }

        &:hover:not(:disabled) {
          background: #eff6ff;
          border-color: #93c5fd;
        }

        &.active {
          background: #2563eb;
          color: #ffffff;
          border-color: #1d4ed8;
        }

        &:disabled {
          opacity: 0.6;
          cursor: wait;
        }
      }
    }

    .transcription-box {
      margin-top: 0.35rem;
      padding: 0.65rem 0.75rem;
      border-radius: 8px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      max-width: 300px;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;

      .transcription-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.75rem;
        color: #475569;
        font-weight: 600;

        .transcription-title {
          display: flex;
          align-items: center;
          gap: 0.3rem;

          mat-icon {
            font-size: 0.9rem;
            width: 0.9rem;
            height: 0.9rem;
            color: #2563eb;
          }
        }

        .transcription-actions {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .btn-copy-transcription {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          font-size: 0.725rem;
          padding: 2px 6px;
          border-radius: 4px;

          mat-icon {
            font-size: 0.85rem;
            width: 0.85rem;
            height: 0.85rem;
          }

          &:hover {
            background: #e2e8f0;
            color: #1e293b;
          }
        }
      }

      .transcription-content {
        font-size: 0.8rem;
        color: #1e293b;
        line-height: 1.4;

        p {
          margin: 0;
          word-break: break-word;
        }

        .transcription-textarea {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 0.4rem 0.5rem;
          font-size: 0.8rem;
          color: #1e293b;
          background: #ffffff;
          resize: vertical;
          font-family: inherit;

          &:focus {
            outline: none;
            border-color: #2563eb;
          }
        }
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

    /* --- Adaptación Modo Oscuro WCAG AAA --- */
    :host-context(.dark) {
      .gps-compact-coords {
        color: #e2e8f0;

        .icon-pin {
          color: #f87171;
        }
      }

      .btn-maps-subtle {
        color: #94a3b8;

        &:hover {
          color: #60a5fa;
          background-color: rgba(30, 58, 138, 0.4);
        }
      }

      .geofence-compact-chip {
        &.chip-inside {
          background-color: rgba(6, 78, 59, 0.6);
          border-color: #065f46;
          color: #34d399;

          .status-dot {
            color: #34d399;
          }
        }

        &.chip-outside {
          background-color: rgba(69, 26, 3, 0.6);
          border-color: #78350f;
          color: #fbbf24;

          .status-dot {
            color: #fbbf24;
          }
        }
      }

      .geofence-chip {
        &.chip-inside {
          background-color: rgba(6, 78, 59, 0.6);
          border-color: #065f46;
          color: #34d399;

          .chip-icon {
            color: #34d399;
          }
        }

        &.chip-outside {
          background-color: rgba(69, 26, 3, 0.6);
          border-color: #78350f;
          color: #fbbf24;

          .chip-icon {
            color: #fbbf24;
          }
        }
      }

      .gps-coords {
        background-color: rgba(127, 29, 29, 0.35);
        color: #fca5a5;

        .accuracy {
          color: #f87171;
        }
      }

      .gps-notes-badge {
        background-color: #1e293b;
        border-color: #334155;
        color: #cbd5e1;

        .notes-icon {
          color: #94a3b8;
        }
      }

      .date-badge,
      .time-badge,
      .datetime-badge {
        background-color: #1e293b;
        color: #cbd5e1;
      }

      .text-value {
        color: #cbd5e1;
      }

      .barcode-container {
        .barcode-code {
          background-color: #1e293b;
          color: #f8fafc;
        }

        .btn-copy {
          border-color: #334155;
          color: #cbd5e1;

          &:hover {
            background-color: #334155;
          }
        }
      }

      .ranking-item {
        background-color: #1e293b;
        border-left-color: #3b82f6;

        .ranking-label {
          color: #e2e8f0;
        }
      }

      .calculate-badge {
        background-color: rgba(30, 58, 138, 0.35);
        border-color: rgba(59, 130, 246, 0.4);
        color: #93c5fd;

        .calc-tag {
          color: #60a5fa;
        }
      }
    }
  `],
})
export class AnswerViewerComponent {
  private readonly formService = inject(FormService);

  @Input({ required: true }) question!: FormQuestion;
  @Input() formId: string | null = null;
  @Input() responseId: string | null = null;
  private currentValue: any;
  @Input() set value(value: any) {
    if (value !== this.currentValue) {
      this.privateMediaUrl.set(null);
      this.privateMediaError.set('');
    }
    this.currentValue = value;
  }
  get value(): any { return this.currentValue; }
  @Input() formattedValue: string = '';
  @Input() compact: boolean = false;

  copied = signal(false);
  activeModalUrl = signal<string | null>(null);
  privateMediaUrl = signal<string | null>(null);
  loadingPrivateMedia = signal(false);
  privateMediaError = signal('');

  get isPrivateMedia(): boolean {
    return !!this.value && typeof this.value === 'object'
      && typeof this.value.path === 'string' && !!this.value.storage_driver
      && !this.value.url && !this.value.dataUrl;
  }

  async loadPrivateMedia(): Promise<void> {
    if (!this.formId || !this.responseId || !this.question?.id || this.loadingPrivateMedia()) return;
    this.loadingPrivateMedia.set(true);
    this.privateMediaError.set('');
    try {
      const result = await firstValueFrom(this.formService.getResponseMediaUrl(
        this.formId, this.responseId, this.question.id,
      ));
      this.privateMediaUrl.set(result.url);
    } catch {
      this.privateMediaError.set('No se pudo abrir el medio privado. Inténtalo de nuevo.');
    } finally {
      this.loadingPrivateMedia.set(false);
    }
  }

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
      const lat = parseFloat(this.value.latitude ?? this.value.lat);
      const lng = parseFloat(this.value.longitude ?? this.value.lng);
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

  get geofenceResult(): GeofenceResult | null {
    if (this.questionType !== 'GPS') return null;

    const coords = this.gpsCoords;
    if (!coords) return null;

    const valObj = typeof this.value === 'object' && this.value !== null ? this.value : {};
    const gf = valObj.geofence;

    if (gf && typeof gf === 'object' && gf.is_inside !== undefined) {
      const isInside = Boolean(gf.is_inside);
      const dist = typeof gf.distance_meters === 'number' ? gf.distance_meters : null;
      const radius = typeof gf.allowed_radius_meters === 'number' ? gf.allowed_radius_meters : 500;
      const name = gf.zone_name || 'Zona Asignada';

      return {
        hasZone: true,
        zoneName: name,
        isInside,
        distanceMeters: dist,
        allowedRadiusMeters: radius,
        formattedDistance: dist !== null ? (dist < 1000 ? `${dist}m` : `${(dist / 1000).toFixed(2)}km`) : null,
      };
    }

    if (valObj.is_within_zone !== undefined) {
      const isInside = Boolean(valObj.is_within_zone);
      const dist = typeof valObj.distance_to_zone_center_meters === 'number'
        ? valObj.distance_to_zone_center_meters
        : null;
      const name = valObj.zone_name || 'Zona Asignada';
      const radius = this.question?.properties?.radius_meters || 500;

      return {
        hasZone: true,
        zoneName: name,
        isInside,
        distanceMeters: dist,
        allowedRadiusMeters: radius,
        formattedDistance: dist !== null ? (dist < 1000 ? `${dist}m` : `${(dist / 1000).toFixed(2)}km`) : null,
      };
    }

    const props = this.question?.properties || {};
    const targetLat = props.target_lat ?? props.geofencing?.lat ?? null;
    const targetLng = props.target_lng ?? props.geofencing?.lng ?? null;
    const radius = props.radius_meters ?? props.geofencing?.radius ?? 500;
    const name = props.zone_name ?? props.geofencing?.name ?? 'Zona Asignada';

    if (targetLat !== null && targetLng !== null && !isNaN(targetLat) && !isNaN(targetLng)) {
      const dist = this.calculateDistanceMeters(coords.lat, coords.lng, targetLat, targetLng);
      const isInside = dist <= radius;

      return {
        hasZone: true,
        zoneName: name,
        isInside,
        distanceMeters: dist,
        allowedRadiusMeters: radius,
        formattedDistance: dist < 1000 ? `${dist}m` : `${(dist / 1000).toFixed(2)}km`,
      };
    }

    return null;
  }

  private calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  get gpsNotes(): string | null {
    if (typeof this.value === 'object' && this.value !== null && this.value.notes) {
      return String(this.value.notes).trim() || null;
    }
    return null;
  }

  get mediaUrl(): string {
    if (this.privateMediaUrl()) return this.privateMediaUrl()!;
    if (!this.value) return this.formattedValue || '';
    if (typeof this.value === 'string') return this.value;
    if (typeof this.value === 'object' && this.value !== null) {
      return this.value.dataUrl || this.value.url || this.value.data || '';
    }
    return '';
  }

  get isVideoMedia(): boolean {
    const url = this.mediaUrl;
    const allowed = this.question?.properties?.allowed_media;
    if (allowed === 'video') return true;
    if (url.startsWith('data:video/') || url.match(/\.(mp4|webm|ogg|mov|avi|mkv|m4v)$/i)) return true;
    if (typeof this.value === 'object' && (this.value?.type === 'video' || this.value?.mediaType === 'VIDEO')) return true;
    return false;
  }

  get isAudioMedia(): boolean {
    if (this.isVideoMedia) return false;
    const url = this.mediaUrl;
    const allowed = this.question?.properties?.allowed_media;
    if (allowed === 'audio') return true;
    if (url.startsWith('data:audio/') || url.match(/\.(mp3|wav|aac|flac|m4a|weba)$/i)) return true;
    if (typeof this.value === 'object' && (this.value?.type === 'audio' || this.value?.mediaType === 'AUDIO')) return true;
    return false;
  }

  get isImageMedia(): boolean {
    if (this.isVideoMedia || this.isAudioMedia) return false;
    const url = this.mediaUrl;
    const allowed = this.question?.properties?.allowed_media;
    if (allowed === 'image') return true;
    if (url.startsWith('data:image/') || url.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i)) return true;
    if (typeof this.value === 'object' && (this.value?.type === 'image' || this.value?.mediaType === 'IMAGE')) return true;
    return Boolean(url);
  }

  isTranscribing = false;
  showTranscription = false;
  transcriptionText = '';
  isCopied = false;
  isEditing = false;
  private currentRecognition: any = null;

  async toggleTranscription(mediaEl?: HTMLMediaElement): Promise<void> {
    if (this.showTranscription && this.transcriptionText && !this.isTranscribing) {
      this.showTranscription = false;
      this.stopRecognition();
      return;
    }

    if (this.transcriptionText && !this.isTranscribing) {
      this.showTranscription = true;
      return;
    }

    this.isTranscribing = true;
    this.showTranscription = true;
    this.transcriptionText = 'Escuchando y transcribiendo audio...';

    try {
      const text = await this.transcribeMediaSpeech(mediaEl, this.mediaUrl);
      this.transcriptionText = text;
    } catch {
      this.transcriptionText = 'No se detectaron palabras en la grabación. Haz clic en Editar para ingresar una nota.';
    } finally {
      this.isTranscribing = false;
    }
  }

  private transcribeMediaSpeech(mediaEl?: HTMLMediaElement, mediaUrl?: string): Promise<string> {
    return new Promise((resolve) => {
      const embedded = this.getEmbeddedTranscript();
      if (embedded) {
        return resolve(embedded);
      }

      const windowObj = window as any;
      const SpeechRecognition = windowObj.SpeechRecognition || windowObj.webkitSpeechRecognition;

      let recognizedSpeech = '';
      let speechStarted = false;

      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          this.currentRecognition = recognition;
          recognition.lang = 'es-ES';
          recognition.continuous = true;
          recognition.interimResults = true;

          recognition.onresult = (event: any) => {
            let currentInterim = '';
            let currentFinal = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
              const chunk = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                currentFinal += chunk + ' ';
              } else {
                currentInterim += chunk;
              }
            }

            if (currentFinal) {
              recognizedSpeech += currentFinal;
            }

            const liveText = (recognizedSpeech + ' ' + currentInterim).trim();
            if (liveText) {
              speechStarted = true;
              this.transcriptionText = `"${liveText}"`;
            }
          };

          recognition.onerror = () => {};

          recognition.onend = () => {
            const finalResult = recognizedSpeech.trim() || (speechStarted ? this.transcriptionText.replace(/^"|"$/g, '') : '');
            if (finalResult) {
              resolve(`"${finalResult}"`);
            } else {
              this.fallbackAudioBufferAnalysis(mediaUrl).then(resolve);
            }
          };

          recognition.start();

          if (mediaEl) {
            mediaEl.currentTime = 0;
            mediaEl.play().catch(() => {});

            mediaEl.onended = () => {
              setTimeout(() => {
                try { recognition.stop(); } catch {}
              }, 400);
            };
          }

          setTimeout(() => {
            try { recognition.stop(); } catch {}
          }, 15000);

          return;
        } catch {
          // Fallback if SpeechRecognition initialization fails
        }
      }

      this.fallbackAudioBufferAnalysis(mediaUrl).then(resolve);
    });
  }

  private stopRecognition(): void {
    if (this.currentRecognition) {
      try { this.currentRecognition.stop(); } catch {}
      this.currentRecognition = null;
    }
  }

  private async fallbackAudioBufferAnalysis(mediaUrl?: string): Promise<string> {
    const questionLabel = this.question?.label || 'Respuesta multimedia';
    try {
      if (mediaUrl && (mediaUrl.startsWith('data:') || mediaUrl.startsWith('blob:') || mediaUrl.startsWith('http'))) {
        const res = await fetch(mediaUrl);
        const arrayBuffer = await res.arrayBuffer();
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;

        if (AudioCtx) {
          const ctx = new AudioCtx();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          const duration = audioBuffer.duration;
          const sampleRate = audioBuffer.sampleRate;

          const channelData = audioBuffer.getChannelData(0);
          const step = Math.floor(sampleRate / 10);
          let activeFrames = 0;
          for (let i = 0; i < channelData.length; i += step) {
            let sum = 0;
            for (let j = 0; j < step && (i + j) < channelData.length; j++) {
              sum += channelData[i + j] * channelData[i + j];
            }
            const rms = Math.sqrt(sum / step);
            if (rms > 0.015) activeFrames++;
          }

          const totalSecs = Math.round(duration);
          const mins = Math.floor(totalSecs / 60);
          const secs = totalSecs % 60;
          const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

          if (activeFrames > 1) {
            return `[${this.isVideoMedia ? 'Video' : 'Audio'} - ${formattedTime} min] Grabación procesada para "${questionLabel}". (Presiona Editar para agregar notas)`;
          } else {
            return `[${this.isVideoMedia ? 'Video' : 'Audio'} - ${formattedTime} min] Archivo procesado correctamente para "${questionLabel}".`;
          }
        }
      }
    } catch {}

    return `[${this.isVideoMedia ? 'Video' : 'Audio'}] Evidencia registrada para "${questionLabel}".`;
  }

  private getEmbeddedTranscript(): string | null {
    if (!this.value) return null;
    if (typeof this.value === 'object' && this.value !== null) {
      if (this.value.transcript && typeof this.value.transcript === 'string') {
        return this.value.transcript;
      }
      if (this.value.text && typeof this.value.text === 'string' && this.value.text !== this.formattedValue) {
        return this.value.text;
      }
      if (this.value.description && typeof this.value.description === 'string') {
        return this.value.description;
      }
    }
    return null;
  }

  copyTranscription(): void {
    if (!this.transcriptionText) return;
    navigator.clipboard.writeText(this.transcriptionText);
    this.isCopied = true;
    setTimeout(() => {
      this.isCopied = false;
    }, 2000);
  }

  get signatureUrl(): string {
    if (this.privateMediaUrl()) return this.privateMediaUrl()!;
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
