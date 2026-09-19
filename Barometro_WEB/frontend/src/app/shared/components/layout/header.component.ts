import { CommonModule } from '@angular/common';
import { Component, inject, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '@core/services/auth.service';
import { LanguageService } from '@core/services/language.service';
import { ThemeService } from '@core/services/theme.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule,
    TranslateModule,
  ],
  template: `
    <header class="header">
      <div class="header-content">
        <!-- Left section -->
        <div class="header-left">
          <button class="menu-btn" (click)="toggleSidenav.emit()" [matTooltip]="'layout.header.menu' | translate">
            <mat-icon>menu</mat-icon>
          </button>

          <a routerLink="/admin/dashboard" class="brand">
            <div class="brand-logo">
              <img src="ULEAM.png" alt="ULEAM" class="brand-img" />
            </div>
            <div class="brand-text">
              <span class="brand-name">{{ 'layout.header.brand' | translate }}</span>
              <span class="brand-subtitle">{{ 'layout.header.brandSubtitle' | translate }}</span>
            </div>
          </a>
        </div>

        <!-- Right section -->
        <div class="header-right">
          <!-- Language selector -->
          <button
            class="lang-btn"
            [matMenuTriggerFor]="langMenu"
            [matTooltip]="'language.select' | translate"
          >
            <mat-icon>language</mat-icon>
            <span class="lang-code">{{ languageService.currentLang().toUpperCase() }}</span>
          </button>

          <mat-menu #langMenu="matMenu">
            @for (lang of languageService.availableLanguages; track lang.code) {
              <button mat-menu-item (click)="languageService.setLanguage(lang.code)" [class.active]="languageService.currentLang() === lang.code">
                <span class="lang-flag">{{ lang.flag }}</span>
                <span>{{ lang.name }}</span>
                @if (languageService.currentLang() === lang.code) {
                  <mat-icon class="check-icon">check</mat-icon>
                }
              </button>
            }
          </mat-menu>

          <!-- Theme toggle -->
          <button
            class="theme-btn"
            (click)="themeService.toggleTheme()"
            [matTooltip]="(themeService.isDark() ? 'layout.header.themeLight' : 'layout.header.themeDark') | translate"
          >
            <mat-icon class="theme-icon">
              {{ themeService.isDark() ? 'light_mode' : 'dark_mode' }}
            </mat-icon>
          </button>

          <!-- User menu -->
          @if (authService.user(); as user) {
            <button class="user-btn" [matMenuTriggerFor]="userMenu">
              <div class="user-avatar">
                <span>{{ user.name.charAt(0).toUpperCase() }}</span>
              </div>
              <div class="user-info">
                <span class="user-name">{{ user.name }}</span>
                <span class="user-role">{{ roleLabel(user.rol) | translate }}</span>
              </div>
              <mat-icon class="dropdown-icon">expand_more</mat-icon>
            </button>

            <mat-menu #userMenu="matMenu" class="user-menu">
              <div class="menu-header">
                <div class="menu-avatar">
                  <span>{{ user.name.charAt(0).toUpperCase() }}</span>
                </div>
                <div class="menu-user-info">
                  <span class="menu-user-name">{{ user.name }}</span>
                  <span class="menu-user-email">{{ user.email }}</span>
                </div>
              </div>

              <mat-divider></mat-divider>

              <button mat-menu-item routerLink="/perfil" class="menu-item">
                <mat-icon>person_outline</mat-icon>
                <span>{{ 'layout.header.profile' | translate }}</span>
              </button>

              <button mat-menu-item routerLink="/admin/configuracion" class="menu-item">
                <mat-icon>settings</mat-icon>
                <span>{{ 'layout.header.settings' | translate }}</span>
              </button>

              <mat-divider></mat-divider>

              <button mat-menu-item (click)="logout()" class="menu-item logout">
                <mat-icon>logout</mat-icon>
                <span>{{ 'auth.logout' | translate }}</span>
              </button>
            </mat-menu>
          }
        </div>
      </div>
    </header>
  `,
  styles: [
    `
      .header {
        height: 64px;
        background: var(--bg-secondary);
        border-bottom: 1px solid var(--border-color);
      }

      .header-content {
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 1rem;
        max-width: 100%;
      }

      .header-left {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .menu-btn {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        border-radius: var(--radius-md);
        cursor: pointer;
        color: var(--text-secondary);
        transition: all var(--transition-fast);
      }

      .menu-btn:hover {
        background: var(--hover-bg);
        color: var(--text-primary);
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        text-decoration: none;
        padding: 0.5rem;
        border-radius: var(--radius-md);
        transition: all var(--transition-fast);
      }

      .brand:hover {
        background: var(--hover-bg);
      }

      .brand-logo {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .brand-img {
        height: 36px;
        width: auto;
        object-fit: contain;
      }

      .brand-text {
        display: none;
        flex-direction: column;
        line-height: 1.2;
      }

      @media (min-width: 768px) {
        .brand-text {
          display: flex;
        }
      }

      .brand-name {
        font-size: 1.125rem;
        font-weight: 700;
        color: var(--text-primary);
        letter-spacing: -0.025em;
      }

      .brand-subtitle {
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--primary-600);
      }

      .header-right {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .lang-btn {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.5rem;
        border: none;
        background: transparent;
        border-radius: var(--radius-md);
        cursor: pointer;
        color: var(--text-secondary);
        transition: all var(--transition-fast);
      }

      .lang-btn:hover {
        background: var(--hover-bg);
        color: var(--primary-600);
      }

      .lang-code {
        font-size: 0.75rem;
        font-weight: 600;
      }

      .lang-flag {
        font-size: 1.25rem;
        margin-right: 0.5rem;
      }

      ::ng-deep .mat-mdc-menu-item.active {
        background: var(--hover-bg);
      }

      .check-icon {
        margin-left: auto;
        color: var(--primary-600);
      }

      .theme-btn {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        border-radius: var(--radius-md);
        cursor: pointer;
        color: var(--text-secondary);
        transition: all var(--transition-fast);
      }

      .theme-btn:hover {
        background: var(--hover-bg);
        color: var(--primary-600);
      }

      .theme-icon {
        font-size: 22px;
        transition: transform var(--transition-normal);
      }

      .theme-btn:hover .theme-icon {
        transform: rotate(15deg);
      }

      .user-btn {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.375rem 0.75rem;
        border: 1px solid var(--border-color);
        background: var(--bg-secondary);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all var(--transition-fast);
      }

      .user-btn:hover {
        border-color: var(--border-hover);
        background: var(--hover-bg);
      }

      .user-avatar {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--primary-600);
        border-radius: var(--radius-full);
        color: white;
        font-weight: 600;
        font-size: 0.875rem;
      }

      .user-info {
        display: none;
        flex-direction: column;
        text-align: left;
        line-height: 1.25;
      }

      @media (min-width: 768px) {
        .user-info {
          display: flex;
        }
      }

      .user-name {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--text-primary);
      }

      .user-role {
        font-size: 0.75rem;
        color: var(--text-tertiary);
      }

      .dropdown-icon {
        color: var(--text-tertiary);
        font-size: 20px;
        transition: transform var(--transition-fast);
      }

      .user-btn:hover .dropdown-icon {
        color: var(--text-secondary);
      }

      /* Menu styles */
      ::ng-deep .user-menu {
        min-width: 240px;
        margin-top: 0.5rem;
      }

      .menu-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem;
      }

      .menu-avatar {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--primary-600);
        border-radius: var(--radius-full);
        color: white;
        font-weight: 600;
        font-size: 1.25rem;
      }

      .menu-user-info {
        display: flex;
        flex-direction: column;
      }

      .menu-user-name {
        font-weight: 600;
        color: var(--text-primary);
      }

      .menu-user-email {
        font-size: 0.875rem;
        color: var(--text-secondary);
      }

      ::ng-deep .menu-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem !important;
      }

      ::ng-deep .menu-item mat-icon {
        color: var(--text-secondary);
        margin-right: 0 !important;
      }

      ::ng-deep .menu-item.logout {
        color: var(--error-color) !important;
      }

      ::ng-deep .menu-item.logout mat-icon {
        color: var(--error-color) !important;
      }
    `,
  ],
})
export class HeaderComponent {
  authService = inject(AuthService);
  themeService = inject(ThemeService);
  languageService = inject(LanguageService);
  toggleSidenav = output<void>();

  roleLabel(role: string): string {
    const labels: Record<string, string> = {
      SUPER_ADMIN: 'profile.roles.superAdmin',
      ADMIN: 'profile.roles.admin',
      PROJECT: 'profile.roles.project',
      RECOLECTOR: 'profile.roles.recolector',
    };

    return labels[role] ?? 'profile.roles.recolector';
  }

  logout(): void {
    this.authService.logout().subscribe();
  }
}
