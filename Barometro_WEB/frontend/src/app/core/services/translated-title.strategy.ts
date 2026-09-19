import { Injectable, Injector, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';

@Injectable()
export class TranslatedTitleStrategy extends TitleStrategy {
  private readonly injector = inject(Injector);
  private readonly title = inject(Title);
  private lastSnapshot: RouterStateSnapshot | null = null;
  private translate: TranslateService | null = null;
  private listeningToLanguageChanges = false;

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.lastSnapshot = snapshot;
    this.applyTitle();
  }

  private applyTitle(): void {
    if (!this.lastSnapshot) {
      return;
    }

    const titleKey = this.buildTitle(this.lastSnapshot);
    if (!titleKey) {
      return;
    }

    this.title.setTitle(this.getTranslate().instant(titleKey));
  }

  private getTranslate(): TranslateService {
    this.translate ??= this.injector.get(TranslateService);

    if (!this.listeningToLanguageChanges) {
      this.listeningToLanguageChanges = true;
      this.translate.onLangChange.subscribe(() => this.applyTitle());
    }

    return this.translate;
  }
}
