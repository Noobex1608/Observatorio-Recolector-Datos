import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { MediaStorageService } from '../../services/media-storage.service';
import { QuestionMultimediaComponent } from './question-multimedia.component';

describe('Pregunta multimedia: límites de video', () => {
  const storage = {
    saveMultimediaFile: vi.fn(),
    getMediaBlobById: vi.fn(),
    createObjectUrl: vi.fn(() => 'blob:x'),
    revokeObjectUrl: vi.fn(),
    deleteMediaBlob: vi.fn(),
  };

  function build(properties: Record<string, unknown>) {
    TestBed.configureTestingModule({ providers: [{ provide: MediaStorageService, useValue: storage }] });
    const fixture = TestBed.createComponent(QuestionMultimediaComponent);
    fixture.componentRef.setInput('question', { id: 'q1', type: 'MULTIMEDIA', label: 'Video', order: 0, properties });
    return fixture.componentInstance;
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
  });

  it('usa la duración configurada en la pregunta, entre 5 y 120 segundos', () => {
    expect(build({}).maxVideoSeconds()).toBe(60);
    TestBed.resetTestingModule();
    expect(build({ max_video_seconds: 90 }).maxVideoSeconds()).toBe(90);
    TestBed.resetTestingModule();
    expect(build({ max_video_seconds: 600 }).maxVideoSeconds()).toBe(120);
    TestBed.resetTestingModule();
    expect(build({ max_video_seconds: 1 }).maxVideoSeconds()).toBe(5);
  });

  it('rechaza en el teléfono un archivo más pesado que el máximo, sin esperar a sincronizar', async () => {
    const component = build({ max_file_size_mb: 1 });
    const big = new File([new Uint8Array(2 * 1024 * 1024)], 'video.mp4', { type: 'video/mp4' });
    const input = { files: [big], value: 'video.mp4' } as unknown as HTMLInputElement;

    await component.onFileSelected({ target: input } as unknown as Event);

    expect(storage.saveMultimediaFile).not.toHaveBeenCalled();
    expect(component.errorMessage()).toContain('el máximo es 1 MB');
  });
});

describe('MediaStorageService.blobToDataUrl', () => {
  it('envía el tipo sin parámetros de códec (el servidor no acepta "audio/webm;codecs=opus")', async () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(MediaStorageService);

    const dataUrl = await service.blobToDataUrl(new Blob(['abc'], { type: 'audio/webm;codecs=opus' }));

    expect(dataUrl.startsWith('data:audio/webm;base64,')).toBe(true);
    TestBed.resetTestingModule();
  });
});
