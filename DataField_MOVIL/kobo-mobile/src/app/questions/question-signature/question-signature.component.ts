import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  effect,
  inject,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormQuestion } from '../../db.service';
import { MediaStorageService, SignaturePayload } from '../../services/media-storage.service';

@Component({
  selector: 'app-question-signature',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './question-signature.component.html',
  styleUrls: ['./question-signature.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuestionSignatureComponent implements AfterViewInit, OnDestroy {
  private mediaStorage = inject(MediaStorageService);

  @ViewChild('signatureCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  // Signal Inputs
  question = input.required<FormQuestion>();
  value = input<SignaturePayload | string | null>(null);
  disabled = input<boolean>(false);

  // Signal Output
  valueChange = output<SignaturePayload | null>();

  // State Signals
  readonly isDrawing = signal<boolean>(false);
  readonly isSigned = signal<boolean>(false);
  readonly previewUrl = signal<string | null>(null);

  private ctx: CanvasRenderingContext2D | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    effect(() => {
      const val = this.value();
      if (val) {
        if (typeof val === 'string') {
          this.previewUrl.set(val);
          this.isSigned.set(true);
        } else if (val.dataUrl) {
          this.previewUrl.set(val.dataUrl);
          this.isSigned.set(true);
        }
      } else {
        this.previewUrl.set(null);
        this.isSigned.set(false);
      }
    });
  }

  ngAfterViewInit(): void {
    this.initCanvas();
    this.setupResizeObserver();
  }

  ngOnDestroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  private initCanvas(): void {
    if (!this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d');
    this.resizeCanvas();
  }

  private setupResizeObserver(): void {
    if (!this.canvasRef) return;
    const container = this.canvasRef.nativeElement.parentElement;
    if (!container) return;

    this.resizeObserver = new ResizeObserver(() => {
      this.resizeCanvas();
    });
    this.resizeObserver.observe(container);
  }

  private resizeCanvas(): void {
    if (!this.canvasRef || !this.ctx) return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;

    // Preserve drawing if signed
    const currentData = this.isSigned() && canvas.width > 0 ? canvas.toDataURL() : null;

    canvas.width = rect.width * ratio;
    canvas.height = 200 * ratio;

    this.ctx.scale(ratio, ratio);
    this.ctx.lineWidth = 2.5;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = '#1e293b';

    if (currentData) {
      const img = new Image();
      img.onload = () => {
        this.ctx?.drawImage(img, 0, 0, rect.width, 200);
      };
      img.src = currentData;
    }
  }

  startDrawing(event: MouseEvent | TouchEvent): void {
    if (this.disabled()) return;
    event.preventDefault();
    this.isDrawing.set(true);

    const pos = this.getCoordinates(event);
    if (this.ctx) {
      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
    }
  }

  draw(event: MouseEvent | TouchEvent): void {
    if (!this.isDrawing() || this.disabled() || !this.ctx) return;
    event.preventDefault();

    const pos = this.getCoordinates(event);
    this.ctx.lineTo(pos.x, pos.y);
    this.ctx.stroke();
  }

  stopDrawing(): void {
    if (!this.isDrawing()) return;
    this.isDrawing.set(false);
    this.isSigned.set(true);
    void this.saveSignature();
  }

  clear(): void {
    if (this.disabled()) return;
    if (!this.canvasRef || !this.ctx) return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    this.ctx.clearRect(0, 0, rect.width, 200);
    this.isSigned.set(false);
    this.previewUrl.set(null);
    this.valueChange.emit(null);
  }

  async saveSignature(): Promise<void> {
    if (!this.canvasRef || !this.isSigned()) return;
    const canvas = this.canvasRef.nativeElement;
    const dataUrl = canvas.toDataURL('image/png');
    this.previewUrl.set(dataUrl);

    const payload = await this.mediaStorage.saveSignatureDataUrl(this.question().id, dataUrl);
    this.valueChange.emit(payload);
  }

  private getCoordinates(event: MouseEvent | TouchEvent): { x: number; y: number } {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    let clientX = 0;
    let clientY = 0;

    if ('touches' in event && event.touches.length > 0) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else if ('clientX' in event) {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }
}
