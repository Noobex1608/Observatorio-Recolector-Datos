import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';

export type Language = 'es' | 'en';

export interface LanguageOption {
  code: Language;
  name: string;
  flag: string;
}

@Injectable({
  providedIn: 'root'
})
export class LanguageService {
  private readonly translateService = inject(TranslateService);
  private readonly platformId = inject(PLATFORM_ID);
  
  private readonly STORAGE_KEY = 'app_language';
  
  readonly availableLanguages: LanguageOption[] = [
    { code: 'es', name: 'Espanol', flag: 'ES' },
    { code: 'en', name: 'English', flag: 'EN' }
  ];
  
  currentLang = signal<Language>('es');

  constructor() {
    this.translateService.addLangs(this.availableLanguages.map((language) => language.code));
    this.translateService.setFallbackLang('es');
  }

  initialize(): void {
    this.initializeLanguage();
  }

  private initializeLanguage(): void {
    let savedLang: Language | null = null;
    
    if (isPlatformBrowser(this.platformId)) {
      savedLang = localStorage.getItem(this.STORAGE_KEY) as Language | null;
      
      if (!savedLang) {
        // Detectar idioma del navegador
        const browserLang = navigator.language?.split('-')[0];
        savedLang = this.isValidLanguage(browserLang) ? browserLang as Language : 'es';
      }
    } else {
      savedLang = 'es';
    }
    
    this.setLanguage(savedLang);
  }

  setLanguage(lang: Language): void {
    if (!this.isValidLanguage(lang)) {
      lang = 'es';
    }
    
    this.currentLang.set(lang);
    this.translateService.use(lang);
    
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.STORAGE_KEY, lang);
      // Actualizar el atributo lang del documento
      document.documentElement.lang = lang;
    }
  }

  toggleLanguage(): void {
    const newLang = this.currentLang() === 'es' ? 'en' : 'es';
    this.setLanguage(newLang);
  }

  private isValidLanguage(lang: string | undefined | null): lang is Language {
    return lang === 'es' || lang === 'en';
  }

  getCurrentLanguageOption(): LanguageOption {
    return this.availableLanguages.find(l => l.code === this.currentLang()) || this.availableLanguages[0];
  }
}
