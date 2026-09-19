import {
  Component,
  ElementRef,
  ViewChild,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  effect,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormQuestion } from '../../db.service';

export type BarcodeStatus = 'idle' | 'scanning' | 'scanned' | 'manual' | 'error';

declare global {
  interface Window {
    BarcodeDetector?: any;
  }
}

@Component({
  selector: 'app-question-barcode',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './question-barcode.component.html',
  styleUrls: ['./question-barcode.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuestionBarcodeComponent implements OnDestroy {
  @ViewChild('videoElement') videoRef!: ElementRef<HTMLVideoElement>;

  // Signal Inputs
  question = input.required<FormQuestion>();
  value = input<string | null>(null);
  disabled = input<boolean>(false);

  // Signal Output
  valueChange = output<string | null>();

  // State Signals
  readonly status = signal<BarcodeStatus>('idle');
  readonly scannedCode = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly manualCodeInput = signal<string>('');

  private mediaStream: MediaStream | null = null;
  private barcodeDetector: any = null;
  private animFrameId: number | null = null;

  readonly isBarcodeDetectorSupported = signal<boolean>(typeof window !== 'undefined' && 'BarcodeDetector' in window);

  constructor() {
    effect(() => {
      const val = this.value();
      if (val) {
        this.scannedCode.set(val);
        this.status.set('scanned');
      }
    });
  }

  ngOnDestroy(): void {
    this.stopScanner();
  }

  async startScanner(): Promise<void> {
    if (this.disabled()) return;

    this.errorMessage.set(null);

    if (!this.isBarcodeDetectorSupported()) {
      this.status.set('manual');
      this.errorMessage.set('El navegador no soporta BarcodeDetector. Por favor, utilice el ingreso manual.');
      return;
    }

    try {
      this.barcodeDetector = new window.BarcodeDetector({
        formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e']
      });

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });

      this.status.set('scanning');

      setTimeout(() => {
        if (this.videoRef && this.mediaStream) {
          const video = this.videoRef.nativeElement;
          video.srcObject = this.mediaStream;
          video.play().then(() => {
            this.detectFrame();
          });
        }
      }, 100);
    } catch (err: any) {
      this.stopScanner();
      this.status.set('manual');
      this.errorMessage.set('No se pudo acceder a la cámara. Por favor, ingrese el código manualmente.');
    }
  }

  private detectFrame(): void {
    if (this.status() !== 'scanning' || !this.videoRef || !this.barcodeDetector) return;

    const video = this.videoRef.nativeElement;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      this.barcodeDetector
        .detect(video)
        .then((barcodes: any[]) => {
          if (barcodes && barcodes.length > 0) {
            const codeValue = barcodes[0].rawValue;
            this.scannedCode.set(codeValue);
            this.status.set('scanned');
            this.valueChange.emit(codeValue);
            this.stopScanner();
          } else {
            this.animFrameId = requestAnimationFrame(() => this.detectFrame());
          }
        })
        .catch(() => {
          this.animFrameId = requestAnimationFrame(() => this.detectFrame());
        });
    } else {
      this.animFrameId = requestAnimationFrame(() => this.detectFrame());
    }
  }

  stopScanner(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.status() === 'scanning') {
      this.status.set('idle');
    }
  }

  enableManualEntry(): void {
    if (this.disabled()) return;
    this.stopScanner();
    this.status.set('manual');
    this.manualCodeInput.set(this.scannedCode() || '');
  }

  saveManualCode(): void {
    const code = this.manualCodeInput().trim();
    if (!code) {
      this.errorMessage.set('Por favor, ingrese un código válido.');
      return;
    }

    this.scannedCode.set(code);
    this.status.set('scanned');
    this.errorMessage.set(null);
    this.valueChange.emit(code);
  }

  clearCode(): void {
    if (this.disabled()) return;
    this.stopScanner();
    this.scannedCode.set(null);
    this.manualCodeInput.set('');
    this.status.set('idle');
    this.errorMessage.set(null);
    this.valueChange.emit(null);
  }
}
