import { CommonModule } from '@angular/common';
import { Component, HostListener, inject, signal, ViewChild } from '@angular/core';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { RouterOutlet } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ThemeService } from '@core/services/theme.service';
import { HeaderComponent } from './header.component';
import { SidebarComponent } from './sidebar.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, MatSidenavModule, HeaderComponent, SidebarComponent, TranslateModule],
  template: `
    <div class="layout-container">
      <!-- Header fijo -->
      <app-header (toggleSidenav)="toggleSidenav()" class="layout-header"></app-header>

      <!-- Container principal -->
      <mat-sidenav-container class="layout-body">
        <!-- Sidebar -->
        <mat-sidenav
          #sidenav
          [mode]="isMobile() ? 'over' : 'side'"
          [opened]="!isMobile() && sidenavOpen()"
          class="layout-sidenav"
          [fixedInViewport]="true"
          [fixedTopGap]="64"
        >
          <app-sidebar (navigate)="onNavigate()"></app-sidebar>
        </mat-sidenav>

        <!-- Contenido principal -->
        <mat-sidenav-content class="layout-content">
          <main class="layout-main animate-fade-in">
            <router-outlet></router-outlet>
          </main>
        </mat-sidenav-content>
      </mat-sidenav-container>
    </div>
  `,
  styles: [
    `
      .layout-container {
        height: 100vh;
        display: flex;
        flex-direction: column;
        background-color: var(--bg-primary);
      }

      .layout-header {
        position: sticky;
        top: 0;
        z-index: 1000;
        flex-shrink: 0;
      }

      .layout-body {
        flex: 1;
        height: calc(100vh - 64px);
      }

      .layout-sidenav {
        width: 264px;
        background: var(--bg-secondary) !important;
        border-right: 1px solid var(--border-color) !important;
      }

      .layout-content {
        background-color: var(--bg-primary) !important;
        overflow-y: auto;
      }

      .layout-main {
        padding: 1.5rem;
        min-height: 100%;
      }

      @media (min-width: 1024px) {
        .layout-main {
          padding: 2rem 2.25rem;
        }
      }

      @media (max-width: 1023px) {
        .layout-sidenav {
          width: 264px;
        }
      }
    `,
  ],
})
export class MainLayoutComponent {
  @ViewChild('sidenav') sidenav!: MatSidenav;

  private themeService = inject(ThemeService);

  sidenavOpen = signal(true);
  isMobile = signal(false);

  constructor() {
    this.checkScreenSize();
  }

  @HostListener('window:resize')
  onResize() {
    this.checkScreenSize();
  }

  private checkScreenSize(): void {
    if (typeof window !== 'undefined') {
      this.isMobile.set(window.innerWidth < 1024);
    }
  }

  toggleSidenav(): void {
    if (this.isMobile()) {
      this.sidenav.toggle();
    } else {
      this.sidenavOpen.update((v) => !v);
    }
  }

  onNavigate(): void {
    if (this.isMobile()) {
      this.sidenav.close();
    }
  }
}
