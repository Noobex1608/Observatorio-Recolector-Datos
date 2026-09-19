import { Injectable, inject } from '@angular/core';
import { DbService, MediaBlob } from '../db.service';

export interface SignaturePayload {
  type: 'signature';
  dataUrl: string;
  blobId: string;
  mimeType: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class MediaStorageService {
  private db = inject(DbService);

  dataUrlToBlob(dataUrl: string): Blob {
    const parts = dataUrl.split(';base64,');
    const contentType = parts[0].split(':')[1] || 'image/png';
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);

    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }

    return new Blob([uInt8Array], { type: contentType });
  }

  blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async saveMediaBlob(
    questionId: string,
    blob: Blob,
    mimeType: string = 'image/png',
    responseId?: number,
    fileName?: string
  ): Promise<string> {
    const blobId = `media_${questionId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const mediaRecord: MediaBlob = {
      blobId,
      questionId,
      responseId,
      blob,
      mimeType,
      fileName,
      createdAt: new Date().toISOString()
    };

    await this.db.mediaBlobs.add(mediaRecord);
    return blobId;
  }

  async saveSignatureDataUrl(questionId: string, dataUrl: string, responseId?: number): Promise<SignaturePayload> {
    const blob = this.dataUrlToBlob(dataUrl);
    const blobId = await this.saveMediaBlob(questionId, blob, 'image/png', responseId, `signature_${questionId}.png`);

    return {
      type: 'signature',
      dataUrl,
      blobId,
      mimeType: 'image/png',
      createdAt: new Date().toISOString()
    };
  }

  async getMediaBlobById(blobId: string): Promise<MediaBlob | undefined> {
    return this.db.mediaBlobs.where('blobId').equals(blobId).first();
  }

  async getMediaBlobsByQuestion(questionId: string): Promise<MediaBlob[]> {
    return this.db.mediaBlobs.where('questionId').equals(questionId).toArray();
  }

  async deleteMediaBlob(blobId: string): Promise<void> {
    await this.db.mediaBlobs.where('blobId').equals(blobId).delete();
  }

  createObjectUrl(blob: Blob): string {
    return URL.createObjectURL(blob);
  }

  revokeObjectUrl(url: string): void {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }
}
