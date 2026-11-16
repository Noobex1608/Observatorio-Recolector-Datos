import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { ProjectService, SupervisionCollector, SupervisionCollectorPage } from '@core/services/project.service';

/** Pestaña Supervisión: encuestadores del proyecto; cada uno abre la pantalla de su recorrido. */
@Component({
  selector: 'app-supervision-collectors',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule, MatSelectModule],
  template: `
    <p class="intro">
      Elige un encuestador para ver el recorrido GPS de sus encuestas por día y si las hizo dentro de la zona asignada.
      La app toma un punto GPS al iniciar cada encuesta, cada vez que se retoma su borrador y al finalizarla,
      también sin internet; los puntos llegan al sincronizar.
    </p>
    <div class="filters">
      <mat-form-field appearance="outline">
        <mat-label>Formulario</mat-label>
        <mat-select [value]="formId()" (selectionChange)="setForm($event.value)">
          <mat-option [value]="null">Todos los formularios</mat-option>
          @for (form of forms(); track form.id) { <mat-option [value]="form.id">{{ form.title }}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Buscar encuestador</mat-label>
        <input matInput [value]="query()" (input)="search($any($event.target).value)" placeholder="Nombre, correo o cédula" />
        <mat-icon matSuffix aria-hidden="true">search</mat-icon>
      </mat-form-field>
    </div>

    @if (loading() && !page()) {
      <div class="state"><mat-spinner diameter="28" /> Cargando encuestadores…</div>
    } @else if (error()) {
      <p class="state error" role="alert">{{ error() }}</p>
    } @else if (page(); as data) {
      @if (data.data.length === 0) {
        <p class="state">No hay encuestadores {{ query() ? 'que coincidan con la búsqueda' : 'en este proyecto' }}.</p>
      } @else {
        <ul class="collector-list" [attr.aria-busy]="loading()">
          @for (collector of data.data; track collector.id) {
            <li>
              <a class="collector-card" [routerLink]="['/admin/proyectos', projectId(), 'supervision', collector.id]"
                 [queryParams]="formId() ? { form: formId() } : {}" [attr.aria-label]="'Ver recorrido de ' + collector.name">
                <span class="avatar" aria-hidden="true">{{ initials(collector) }}</span>
                <span class="who">
                  <strong>{{ collector.name }}</strong>
                  <small>{{ collector.email }}</small>
                  @if (collector.zones.length) { <small class="zones">Zonas: {{ collector.zones.join(', ') }}</small> }
                </span>
                <span class="stats">
                  <span><b>{{ collector.responses }}</b> encuestas</span>
                  <span><b>{{ collector.today }}</b> hoy</span>
                  @if (collector.outside > 0) {
                    <span class="warn"><mat-icon aria-hidden="true">warning</mat-icon>{{ collector.outside }} fuera de zona</span>
                  }
                  <span class="muted">
                    @if (collector.last_activity) { Última: {{ collector.last_activity | date:'dd/MM/yyyy HH:mm' }} } @else { Sin encuestas }
                  </span>
                </span>
                <mat-icon class="go" aria-hidden="true">chevron_right</mat-icon>
              </a>
            </li>
          }
        </ul>
        @if (data.pagination.last_page > 1) {
          <nav class="pager" aria-label="Paginación de encuestadores">
            <button mat-stroked-button type="button" [disabled]="data.pagination.current_page <= 1" (click)="go(data.pagination.current_page - 1)">Anterior</button>
            <span>Página {{ data.pagination.current_page }} de {{ data.pagination.last_page }} · {{ data.pagination.total }} encuestadores</span>
            <button mat-stroked-button type="button" [disabled]="data.pagination.current_page >= data.pagination.last_page" (click)="go(data.pagination.current_page + 1)">Siguiente</button>
          </nav>
        }
      }
    }
  `,
  styles: [`
    :host { display: block; }
    .intro { margin: 0 0 1rem; color: var(--text-secondary); }
    .filters { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0.75rem; }
    @media (max-width: 720px) { .filters { grid-template-columns: 1fr; } }
    .state { display: flex; align-items: center; gap: 0.6rem; color: var(--text-secondary); padding: 1rem 0; }
    .state.error { color: var(--error-color); }
    .collector-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
    .collector-list[aria-busy='true'] { opacity: 0.6; }
    .collector-card {
      display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 0.9rem;
      padding: 0.8rem 1rem; border: 1px solid var(--card-border); border-radius: var(--radius-lg);
      background: var(--card-bg); color: var(--text-primary); text-decoration: none;
      transition: border-color var(--transition-fast), background var(--transition-fast);
    }
    .collector-card:hover { border-color: var(--primary-300); background: var(--hover-bg); }
    .avatar {
      width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center;
      background: var(--primary-100); color: var(--primary-text-700); font-weight: 700;
    }
    .who { display: flex; flex-direction: column; min-width: 0; }
    .who small { color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .stats { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.35rem 0.9rem; font-size: 0.85rem; color: var(--text-secondary); }
    .stats b { color: var(--text-primary); }
    .stats .warn { display: inline-flex; align-items: center; gap: 0.2rem; color: var(--warning-color); font-weight: 600; }
    .stats .warn mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .stats .muted { flex-basis: 100%; text-align: right; }
    .go { color: var(--text-tertiary); }
    @media (max-width: 720px) {
      .collector-card { grid-template-columns: auto minmax(0, 1fr) auto; }
      .stats { grid-column: 1 / -1; justify-content: flex-start; }
      .stats .muted { text-align: left; }
      .go { grid-row: 1; grid-column: 3; }
    }
    .pager { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-top: 0.9rem; color: var(--text-secondary); flex-wrap: wrap; }
  `],
})
export class SupervisionCollectorsComponent implements OnDestroy {
  private projects = inject(ProjectService);

  projectId = input.required<string>();
  forms = input<{ id: string; title: string }[]>([]);
  initialFormId = input<string | null>(null);

  formId = signal<string | null>(null);
  query = signal('');
  page = signal<SupervisionCollectorPage | null>(null);
  loading = signal(false);
  error = signal('');
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const projectId = this.projectId();
      const initial = this.initialFormId();
      untracked(() => {
        this.formId.set(initial);
        this.page.set(null);
        if (projectId) this.load(1);
      });
    });
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  setForm(formId: string | null): void {
    this.formId.set(formId);
    this.load(1);
  }

  search(value: string): void {
    this.query.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(1), 300);
  }

  go(page: number): void {
    this.load(page);
  }

  initials(collector: SupervisionCollector): string {
    return collector.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join('');
  }

  private load(page: number): void {
    this.loading.set(true);
    this.error.set('');
    this.projects.getSupervisionCollectors(this.projectId(), { formId: this.formId(), q: this.query().trim(), page }).subscribe({
      next: (data) => { this.page.set(data); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'No se pudo cargar la lista de encuestadores.');
      },
    });
  }
}
