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
import { reducirFoto } from '../../utils/reducir-foto';

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
  /** Mientras se reduce una foto recién tomada (tarda ~1 s en teléfonos modestos). */
  readonly reduciendo = signal(false);

  // Audio recorder state signals
  readonly isRecording = signal<boolean>(false);
  readonly recordingTimeSeconds = signal<number>(0);
  readonly errorMessage = signal<string | null>(null);

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingInterval: any = null;

  // Grabación de video dentro de la app (con límite de duración y calidad acotada)
  readonly isVideoRecording = signal<boolean>(false);
  readonly videoCameraOpen = signal<boolean>(false);
  readonly videoSeconds = signal<number>(0);
  readonly cameraStream = signal<MediaStream | null>(null);
  private videoRecorder: MediaRecorder | null = null;
  private videoChunks: Blob[] = [];
  private videoInterval: any = null;
  private videoStartedAt = 0;

  /** Duración máxima de video de la pregunta: 5 a 120 s (60 por defecto). */
  readonly maxVideoSeconds = computed(() => {
    const seconds = Math.round(Number((this.question() as any)?.properties?.max_video_seconds ?? 60));
    return Number.isFinite(seconds) ? Math.min(120, Math.max(5, seconds)) : 60;
  });

  /** Tamaño máximo por archivo: el de la pregunta, con tope de 30 MB (igual que el servidor). */
  readonly maxFileMb = computed(() => {
    const mb = Number((this.question() as any)?.properties?.max_file_size_mb ?? 20);
    return Math.min(30, Math.max(1, Number.isFinite(mb) ? mb : 20));
  });

  readonly videoRemaining = computed(() => this.formatSeconds(Math.max(0, this.maxVideoSeconds() - this.videoSeconds())));
  readonly videoLimitLabel = computed(() => this.formatSeconds(this.maxVideoSeconds()));
  readonly canRecordVideoInApp = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia;

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
    this.closeVideoCamera();
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

    const original = inputEl.files[0];
    const mediaType = original.type.startsWith('image/') ? 'IMAGE' : original.type.startsWith('audio/') ? 'AUDIO' : 'VIDEO';
    // Las fotos se reducen antes de revisar el límite: una de 30 MB queda en ~0,5 MB y sí cabe.
    if (mediaType === 'IMAGE') this.reduciendo.set(true);
    const file = mediaType === 'IMAGE' ? await reducirFoto(original).finally(() => this.reduciendo.set(false)) : original;

    // Se valida aquí, sin señal en campo: si no, el archivo solo fallaría al sincronizar.
    if (file.size > this.maxFileMb() * 1024 * 1024) {
      this.errorMessage.set(`El archivo pesa ${(file.size / (1024 * 1024)).toFixed(1)} MB; el máximo es ${this.maxFileMb()} MB.`
        + (mediaType === 'VIDEO' && this.canRecordVideoInApp ? ' Grábalo con "Grabar video" para que ocupe menos.' : ''));
      inputEl.value = '';
      return;
    }
    if (mediaType === 'VIDEO') {
      const duration = await this.readVideoDuration(file);
      if (duration !== null && duration > this.maxVideoSeconds() + 0.5) {
        this.errorMessage.set(`El video dura ${Math.round(duration)} s; el máximo para esta pregunta es ${this.maxVideoSeconds()} s.`);
        inputEl.value = '';
        return;
      }
    }

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
      void this.startAudioRecording();
    } else if (media?.mediaType === 'VIDEO' && this.canRecordVideoInApp) {
      await this.removeMedia();
      this.activeTab.set('video');
      void this.openVideoCamera();
    } else {
      const inputId = media?.mediaType === 'VIDEO' ? `file-input-video-${this.question().id}` : `file-input-${this.question().id}`;
      const fileInput = (document.getElementById(inputId) || document.getElementById(`file-input-${this.question().id}`)) as HTMLInputElement;
      if (fileInput) {
        fileInput.click();
      }
    }
  }

  // ---- Video grabado en la app: 720p y ~1 Mbps, así 120 s ocupan ~16 MB y caben en el límite ----

  private getSupportedVideoMimeType(): string {
    const candidates = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported?.(type)) return type;
    }
    return '';
  }

  /** Abre la cámara trasera con vista previa; la grabación empieza con "Grabar". */
  async openVideoCamera(): Promise<void> {
    if (this.disabled() || this.videoCameraOpen()) return;
    this.errorMessage.set(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
        audio: true,
      });
      this.cameraStream.set(stream);
      this.videoCameraOpen.set(true);
    } catch {
      this.errorMessage.set('No se pudo abrir la cámara. Revise los permisos de cámara y micrófono, o use "Subir desde galería".');
    }
  }

  startVideoRecording(): void {
    const stream = this.cameraStream();
    if (!stream || this.isVideoRecording()) return;
    const mimeType = this.getSupportedVideoMimeType();
    try {
      this.videoRecorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 1_000_000, audioBitsPerSecond: 64_000,
      });
    } catch {
      this.videoRecorder = new MediaRecorder(stream);
    }
    this.videoChunks = [];
    this.videoRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.videoChunks.push(event.data);
    };
    this.videoRecorder.onstop = () => void this.saveRecordedVideo();
    this.videoRecorder.start(1000);
    this.isVideoRecording.set(true);
    this.videoSeconds.set(0);
    this.videoStartedAt = Date.now();
    this.videoInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.videoStartedAt) / 1000);
      this.videoSeconds.set(Math.min(elapsed, this.maxVideoSeconds()));
      // Se detiene sola al llegar al límite de la pregunta.
      if (elapsed >= this.maxVideoSeconds()) this.stopVideoRecording();
    }, 250);
  }

  stopVideoRecording(): void {
    if (!this.videoRecorder || !this.isVideoRecording()) return;
    clearInterval(this.videoInterval);
    this.videoInterval = null;
    this.isVideoRecording.set(false);
    if (this.videoRecorder.state !== 'inactive') this.videoRecorder.stop();
  }

  closeVideoCamera(): void {
    if (this.isVideoRecording()) {
      // Cerrar sin guardar: se descarta lo grabado.
      if (this.videoRecorder) this.videoRecorder.onstop = null;
      this.stopVideoRecording();
    }
    clearInterval(this.videoInterval);
    this.cameraStream()?.getTracks().forEach((track) => track.stop());
    this.cameraStream.set(null);
    this.videoCameraOpen.set(false);
  }

  private async saveRecordedVideo(): Promise<void> {
    const type = (this.videoRecorder?.mimeType || this.getSupportedVideoMimeType() || 'video/webm').split(';')[0];
    const blob = new Blob(this.videoChunks, { type });
    this.videoChunks = [];
    this.closeVideoCamera();
    if (blob.size === 0) {
      this.errorMessage.set('No se grabó ningún video. Inténtelo de nuevo.');
      return;
    }
    if (blob.size > this.maxFileMb() * 1024 * 1024) {
      this.errorMessage.set(`El video pesa ${(blob.size / (1024 * 1024)).toFixed(1)} MB y supera el máximo de ${this.maxFileMb()} MB. Grabe uno más corto.`);
      return;
    }
    try {
      this.mediaSize.set(blob.size);
      const extension = type === 'video/mp4' ? 'mp4' : 'webm';
      const payload = await this.mediaStorage.saveMultimediaFile(this.question().id, blob, 'VIDEO', undefined, `video_${Date.now()}.${extension}`);
      this.currentMedia.set(payload);
      this.setPreviewUrl(payload.objectUrl || null);
      this.valueChange.emit(payload);
      this.errorMessage.set(null);
    } catch (err: any) {
      this.errorMessage.set(err?.message || 'Error al guardar el video.');
    }
  }

  private readVideoDuration(file: Blob): Promise<number | null> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      let settled = false;
      const done = (value: number | null) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(url);
        resolve(value);
      };
      video.preload = 'metadata';
      video.muted = true;
      video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
      video.onerror = () => done(null);
      setTimeout(() => done(null), 8000);
      video.src = url;
    });
  }

  private formatSeconds(total: number): string {
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
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

