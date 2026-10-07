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

export type MultimediaTab = 'photo' | 'audio' | 'video';

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
  readonly mediaSize = signal<number | null>(null);

  // Audio recorder state signals
  readonly isRecording = signal<boolean>(false);
  readonly recordingTimeSeconds = signal<number>(0);
  readonly errorMessage = signal<string | null>(null);

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingInterval: any = null;

  // Allowed media mode: 'photo' | 'audio' | 'video' | 'both' | 'all'
  readonly allowedMedia = computed<'photo' | 'audio' | 'video' | 'both' | 'all'>(() => {
    const q = this.question();
    const props = (q as any)?.properties;
    const allowedProp = props?.allowed_media?.toLowerCase();

    if (allowedProp === 'image' || allowedProp === 'photo') return 'photo';
    if (allowedProp === 'audio') return 'audio';
    if (allowedProp === 'video') return 'video';
    if (allowedProp === 'both') return 'both';
    if (allowedProp === 'all') return 'all';

    if (q.media_type === 'IMAGE') return 'photo';
    if (q.media_type === 'AUDIO') return 'audio';
    if (q.media_type === 'VIDEO') return 'video';

    return 'all';
  });

  readonly availableTabs = computed<MultimediaTab[]>(() => {
    const allowed = this.allowedMedia();
    if (allowed === 'photo') return ['photo'];
    if (allowed === 'audio') return ['audio'];
    if (allowed === 'video') return ['video'];
    if (allowed === 'both') return ['photo', 'audio'];
    return ['photo', 'audio', 'video'];
  });

  readonly showTabs = computed(() => this.availableTabs().length > 1);

  readonly formattedRecordingTime = computed(() => {
    const totalSecs = this.recordingTimeSeconds();
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  });

  readonly formattedFileSize = computed(() => {
    const bytes = this.mediaSize();
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  });

  constructor() {
    effect(async () => {
      const val = this.value();
      if (val) {
        this.currentMedia.set(val);
        if (val.objectUrl) {
          this.setPreviewUrl(val.objectUrl);
        } else if (val.blobId) {
          const record = await this.mediaStorage.getMediaBlobById(val.blobId);
          if (record) {
            if (record.blob?.size) {
              this.mediaSize.set(record.blob.size);
            }
            const url = this.mediaStorage.createObjectUrl(record.blob);
            this.setPreviewUrl(url);
          }
        }
      } else {
        this.currentMedia.set(null);
        this.setPreviewUrl(null);
        this.mediaSize.set(null);
      }
    });

    effect(() => {
      const tabs = this.availableTabs();
      if (!tabs.includes(this.activeTab())) {
        this.activeTab.set(tabs[0]);
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

  private setPreviewUrl(newUrl: string | null): void {
    const oldUrl = this.previewUrl();
    if (oldUrl && oldUrl !== newUrl) {
      this.mediaStorage.revokeObjectUrl(oldUrl);
    }
    this.previewUrl.set(newUrl);
  }

  async onFileSelected(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    if (!inputEl.files || inputEl.files.length === 0) return;

    const file = inputEl.files[0];
    const mediaType = file.type.startsWith('image/') ? 'IMAGE' : file.type.startsWith('audio/') ? 'AUDIO' : 'VIDEO';

    try {
      this.mediaSize.set(file.size);
      const payload = await this.mediaStorage.saveMultimediaFile(this.question().id, file, mediaType);
      this.currentMedia.set(payload);
      this.setPreviewUrl(payload.objectUrl || null);
      this.valueChange.emit(payload);
      this.errorMessage.set(null);
    } catch (err: any) {
      this.errorMessage.set(err?.message || 'Error al guardar el archivo multimedia.');
    } finally {
      inputEl.value = '';
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

        this.mediaSize.set(audioBlob.size);
        const ext = mimeType.includes('mp4') || mimeType.includes('aac') ? 'mp4' : 'webm';
        const payload = await this.mediaStorage.saveMultimediaFile(
          this.question().id,
          audioBlob,
          'AUDIO',
          undefined,
          `audio_${Date.now()}.${ext}`
        );

        this.currentMedia.set(payload);
        this.setPreviewUrl(payload.objectUrl || null);
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

  async replaceMedia(): Promise<void> {
    if (this.disabled()) return;
    const media = this.currentMedia();
    if (media?.mediaType === 'AUDIO') {
      await this.removeMedia();
      this.startAudioRecording();
    } else {
      const inputId = media?.mediaType === 'VIDEO' ? `file-input-video-${this.question().id}` : `file-input-${this.question().id}`;
      const fileInput = (document.getElementById(inputId) || document.getElementById(`file-input-${this.question().id}`)) as HTMLInputElement;
      if (fileInput) {
        fileInput.click();
      }
    }
  }

  async removeMedia(): Promise<void> {
    if (this.disabled()) return;
    const media = this.currentMedia();
    if (media?.blobId) {
      await this.mediaStorage.deleteMediaBlob(media.blobId);
    }

    this.setPreviewUrl(null);
    this.mediaSize.set(null);
    this.currentMedia.set(null);
    this.valueChange.emit(null);
  }
}

