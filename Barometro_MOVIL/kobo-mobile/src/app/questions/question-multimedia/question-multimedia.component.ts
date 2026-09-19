import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  computed,
  effect,
  inject,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormQuestion } from '../../db.service';
import { MediaStorageService, MultimediaPayload } from '../../services/media-storage.service';

export type MultimediaTab = 'photo' | 'audio';

@Component({
  selector: 'app-question-multimedia',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './question-multimedia.component.html',
  styleUrls: ['./question-multimedia.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuestionMultimediaComponent implements OnDestroy {
  private mediaStorage = inject(MediaStorageService);

  // Signal Inputs
  question = input.required<FormQuestion>();
  value = input<MultimediaPayload | null>(null);
  disabled = input<boolean>(false);

  // Signal Output
  valueChange = output<MultimediaPayload | null>();

  // State Signals
  readonly activeTab = signal<MultimediaTab>('photo');
  readonly currentMedia = signal<MultimediaPayload | null>(null);
  readonly previewUrl = signal<string | null>(null);

  // Audio recorder state signals
  readonly isRecording = signal<boolean>(false);
  readonly recordingTimeSeconds = signal<number>(0);
  readonly errorMessage = signal<string | null>(null);

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingInterval: any = null;

  readonly formattedRecordingTime = computed(() => {
    const totalSecs = this.recordingTimeSeconds();
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  });

  constructor() {
    effect(async () => {
      const val = this.value();
      if (val) {
        this.currentMedia.set(val);
        if (val.objectUrl) {
          this.previewUrl.set(val.objectUrl);
        } else if (val.blobId) {
          const record = await this.mediaStorage.getMediaBlobById(val.blobId);
          if (record) {
            const url = this.mediaStorage.createObjectUrl(record.blob);
            this.previewUrl.set(url);
          }
        }
      } else {
        this.currentMedia.set(null);
        this.previewUrl.set(null);
      }
    });

    effect(() => {
      const q = this.question();
      if (q.media_type === 'AUDIO') {
        this.activeTab.set('audio');
      } else {
        this.activeTab.set('photo');
      }
    });
  }

  ngOnDestroy(): void {
    this.stopRecordingTimer();
    const url = this.previewUrl();
    if (url) {
      this.mediaStorage.revokeObjectUrl(url);
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    if (!inputEl.files || inputEl.files.length === 0) return;

    const file = inputEl.files[0];
    const mediaType = file.type.startsWith('image/') ? 'IMAGE' : file.type.startsWith('audio/') ? 'AUDIO' : 'VIDEO';

    try {
      const payload = await this.mediaStorage.saveMultimediaFile(this.question().id, file, mediaType);
      this.currentMedia.set(payload);
      this.previewUrl.set(payload.objectUrl || null);
      this.valueChange.emit(payload);
    } catch (err: any) {
      this.errorMessage.set(err?.message || 'Error al guardar el archivo multimedia.');
    }
  }

  private getSupportedAudioMimeType(): string {
    const candidates = [
      'audio/mp4',
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/aac',
      'audio/ogg'
    ];

    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
      for (const type of candidates) {
        if (MediaRecorder.isTypeSupported(type)) {
          return type;
        }
      }
    }

    return 'audio/mp4';
  }

  async startAudioRecording(): Promise<void> {
    if (this.disabled() || this.isRecording()) return;

    this.errorMessage.set(null);
    this.audioChunks = [];

    try {
      const mimeType = this.getSupportedAudioMimeType();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream, { mimeType });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        stream.getTracks().forEach((track) => track.stop());

        const ext = mimeType.includes('mp4') || mimeType.includes('aac') ? 'mp4' : 'webm';
        const payload = await this.mediaStorage.saveMultimediaFile(
          this.question().id,
          audioBlob,
          'AUDIO',
          undefined,
          `audio_${Date.now()}.${ext}`
        );

        this.currentMedia.set(payload);
        this.previewUrl.set(payload.objectUrl || null);
        this.valueChange.emit(payload);
      };

      this.mediaRecorder.start();
      this.isRecording.set(true);
      this.recordingTimeSeconds.set(0);

      this.recordingInterval = setInterval(() => {
        this.recordingTimeSeconds.update((t) => t + 1);
      }, 1000);
    } catch (err: any) {
      this.errorMessage.set('No se pudo acceder al micrófono. Verifique los permisos de su navegador.');
    }
  }

  stopAudioRecording(): void {
    if (!this.mediaRecorder || !this.isRecording()) return;

    this.stopRecordingTimer();
    this.mediaRecorder.stop();
    this.isRecording.set(false);
  }

  private stopRecordingTimer(): void {
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }
  }

  async removeMedia(): Promise<void> {
    if (this.disabled()) return;
    const media = this.currentMedia();
    if (media?.blobId) {
      await this.mediaStorage.deleteMediaBlob(media.blobId);
    }

    const url = this.previewUrl();
    if (url) {
      this.mediaStorage.revokeObjectUrl(url);
    }

    this.currentMedia.set(null);
    this.previewUrl.set(null);
    this.valueChange.emit(null);
  }
}
