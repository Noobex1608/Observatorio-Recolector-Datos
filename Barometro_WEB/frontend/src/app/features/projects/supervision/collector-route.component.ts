import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CollectorRoute, ProjectService, RouteSurvey } from '@core/services/project.service';
import { ROUTE_COLORS, RouteMapComponent } from './route-map.component';

/** Pantalla de supervisión de un encuestador: recorrido GPS del día y verificación contra su zona. */
@Component({
  selector: 'app-collector-route',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatProgressSpinnerModule, MatSelectModule, MatTooltipModule, RouteMapComponent],
  template: `
    <div class="page">
      <header class="page-head">
        <a mat-stroked-button [routerLink]="['/admin/proyectos']" [queryParams]="backParams()">
          <mat-icon aria-hidden="true">arrow_back</mat-icon> Volver a Supervisión
        </a>
        <div class="title">
          <span class="eyebrow">Recorrido del encuestador</span>
          <h1>{{ route()?.collector?.name ?? 'Cargando…' }}</h1>
          @if (route()?.collector; as c) { <p>{{ c.email }}@if (c.cedula) { · {{ c.cedula }} }</p> }
        </div>
      </header>

      @if (route(); as data) {
        <section class="filters" aria-label="Filtros del recorrido">
          <mat-form-field appearance="outline">
            <mat-label>Formulario</mat-label>
            <mat-select [value]="formId()" (selectionChange)="changeForm($event.value)">
              <mat-option [value]="null">Todos los formularios</mat-option>
              @for (form of data.forms; track form.id) { <mat-option [value]="form.id">{{ form.title }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <div class="day-picker">
            <button mat-icon-button type="button" [disabled]="!olderDay()" (click)="changeDate(olderDay())" aria-label="Día anterior con encuestas" matTooltip="Día anterior con encuestas">
              <mat-icon aria-hidden="true">chevron_left</mat-icon>
            </button>
            <mat-form-field appearance="outline">
              <mat-label>Día</mat-label>
              <mat-select [value]="data.date" (selectionChange)="changeDate($event.value)">
                @if (!hasDay(data.date)) { <mat-option [value]="data.date">{{ data.date | date:'EEEE dd/MM/yyyy' }} · sin encuestas</mat-option> }
                @for (day of data.days; track day.date) {
                  <mat-option [value]="day.date">{{ day.date | date:'EEEE dd/MM/yyyy' }} · {{ day.surveys }} encuesta{{ day.surveys === 1 ? '' : 's' }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <button mat-icon-button type="button" [disabled]="!newerDay()" (click)="changeDate(newerDay())" aria-label="Día siguiente con encuestas" matTooltip="Día siguiente con encuestas">
              <mat-icon aria-hidden="true">chevron_right</mat-icon>
            </button>
          </div>
        </section>

        <section class="kpis" aria-label="Resumen del día">
          <div class="kpi"><span>Encuestas</span><strong>{{ data.summary.surveys }}</strong>
            <small>{{ data.summary.with_trace }} con trazado GPS</small></div>
          <div class="kpi"><span>Dentro de la zona</span>
            <strong [class.bad]="data.summary.inside_ratio !== null && data.summary.inside_ratio < 0.9">
              {{ data.summary.inside_ratio === null ? '—' : (data.summary.inside_ratio * 100 | number:'1.0-0') + '%' }}</strong>
            <small>{{ data.summary.outside_surveys }} encuesta{{ data.summary.outside_surveys === 1 ? '' : 's' }} con salida de zona</small></div>
          <div class="kpi"><span>Tiempo encuestando</span><strong>{{ duration(data.summary.surveying_seconds) }}</strong>
            <small>@if (data.summary.first_start) { {{ data.summary.first_start | date:'HH:mm' }} – {{ data.summary.last_end | date:'HH:mm' }} } @else { — }</small></div>
          <div class="kpi"><span>Distancia en encuestas</span><strong>{{ distance(data.summary.distance_meters) }}</strong>
            <small>Entre los puntos de inicio, reanudación y fin</small></div>
          <div class="kpi"><span>Alertas</span><strong [class.bad]="data.summary.alerts > 0">{{ data.summary.alerts }}</strong>
            <small>Revisa el detalle en la lista</small></div>
        </section>

        @if (data.surveys.length === 0) {
          <p class="empty">Este encuestador no tiene encuestas en el día seleccionado.</p>
        } @else {
          <section class="layout">
            <div class="map-panel">
              <app-route-map [zones]="data.zones" [surveys]="data.surveys" [selectedId]="selectedId()" (surveySelect)="toggle($event)" />
              <ul class="legend" aria-label="Leyenda del mapa">
                <li><span class="swatch" [style.background]="colors.inside"></span>Dentro de la zona</li>
                <li><span class="swatch" [style.background]="colors.outside"></span>Fuera de la zona</li>
                <li><span class="swatch" [style.background]="colors.zone" style="opacity:.6"></span>Zona asignada</li>
                <li><span class="pin-sample" aria-hidden="true">1</span>Inicio de la encuesta</li>
                <li><span class="dot-sample" aria-hidden="true"></span>Retomó el borrador</li>
                <li><span class="pin-sample end" aria-hidden="true">■</span>Fin de la encuesta</li>
                <li><span class="swatch dashed"></span>Traslado entre encuestas</li>
                <li><span class="swatch" [style.background]="colors.weak"></span>GPS impreciso</li>
              </ul>
            </div>

            <ol class="timeline" aria-label="Encuestas del día">
              @for (survey of data.surveys; track survey.id; let i = $index) {
                <li [class.selected]="selectedId() === survey.id">
                  <button type="button" class="survey" (click)="toggle(survey.id)" [attr.aria-pressed]="selectedId() === survey.id">
                    <span class="num" [class.bad]="hasZoneProblem(survey)" aria-hidden="true">{{ i + 1 }}</span>
                    <span class="body">
                      <span class="row1">
                        <strong>{{ survey.started_at | date:'HH:mm' }}@if (survey.ended_at) { – {{ survey.ended_at | date:'HH:mm' }} }</strong>
                        <span class="zone-tag" [class.bad]="hasZoneProblem(survey)">
                          {{ zoneStatus(survey) }}
                        </span>
                      </span>
                      <span class="row2">{{ survey.form_title }}@if (survey.zone) { · {{ survey.zone.name }} }</span>
                      <span class="row3">
                        <span>{{ survey.summary.duration_seconds === null ? 'Duración desconocida' : duration(survey.summary.duration_seconds) }}</span>
                        <span>{{ distance(survey.summary.distance_meters) }}</span>
                        <span>{{ survey.summary.points }} punto{{ survey.summary.points === 1 ? '' : 's' }} GPS</span>
                        @if (survey.resumed > 0) { <span>Retomada {{ survey.resumed }} {{ survey.resumed === 1 ? 'vez' : 'veces' }}</span> }
                        @if (survey.summary.average_accuracy !== null) { <span>±{{ survey.summary.average_accuracy | number:'1.0-0' }} m</span> }
                      </span>
                      @if (survey.alerts.length) {
                        <span class="alerts">
                          @for (alert of survey.alerts; track alert.code) {
                            <span class="alert"><mat-icon aria-hidden="true">{{ alert.code === 'sin_trazado' || alert.code === 'gps_impreciso' ? 'info' : 'warning' }}</mat-icon>{{ alert.message }}</span>
                          }
                        </span>
                      }
                      @if (survey.justification) { <span class="justification">Justificación: «{{ survey.justification }}»</span> }
                    </span>
                  </button>
                  @if (selectedId() === survey.id) {
                    <a class="open-response" [routerLink]="['/admin/forms', survey.form_id, 'responses']">Ver respuestas del formulario</a>
                  }
                </li>
              }
            </ol>
          </section>
        }
      } @else if (error()) {
        <p class="empty error" role="alert">{{ error() }}</p>
      } @else {
        <div class="empty"><mat-spinner diameter="32" /> Cargando recorrido…</div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .page { max-width: 1440px; margin: 0 auto; padding: 1.5rem; display: grid; gap: 1.1rem; }
    .page-head { display: flex; align-items: flex-start; gap: 1.2rem; flex-wrap: wrap; }
    .title h1 { margin: 0.15rem 0 0; font-size: 1.6rem; color: var(--text-primary); }
    .title p { margin: 0.2rem 0 0; color: var(--text-secondary); }
    .eyebrow { font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 700; color: var(--primary-text-600); }
    .filters { display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-start; }
    .filters > mat-form-field { min-width: 260px; flex: 1 1 260px; }
    .day-picker { display: flex; align-items: center; gap: 0.25rem; flex: 1 1 340px; }
    .day-picker mat-form-field { flex: 1; }
    .day-picker button { margin-top: -1.25rem; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0.75rem; }
    .kpi { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--radius-lg); padding: 0.85rem 1rem; display: grid; gap: 0.15rem; }
    .kpi span { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }
    .kpi strong { font-size: 1.5rem; color: var(--text-primary); }
    .kpi strong.bad { color: var(--error-color); }
    .kpi small { color: var(--text-tertiary); }
    .layout { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(320px, 1fr); gap: 1rem; align-items: start; }
    @media (max-width: 1000px) { .layout { grid-template-columns: 1fr; } }
    .map-panel { position: sticky; top: 1rem; display: grid; gap: 0.6rem; }
    .map-panel app-route-map { height: min(68vh, 640px); }
    .legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; font-size: 0.8rem; color: var(--text-secondary); }
    .legend li { display: inline-flex; align-items: center; gap: 0.4rem; }
    .swatch { width: 22px; height: 5px; border-radius: 3px; display: inline-block; }
    .pin-sample { width: 18px; height: 18px; border-radius: 50%; display: inline-grid; place-items: center; background: #16805c; color: #fff; font-size: 10px; font-weight: 700; }
    .pin-sample.end { border-radius: 4px; background: #24384f; }
    .dot-sample { width: 12px; height: 12px; border-radius: 50%; border: 3px solid #0059a8; background: #fff; display: inline-block; }
    .swatch.dashed { background: repeating-linear-gradient(90deg, #8a99ab 0 6px, transparent 6px 10px); }
    .timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; max-height: calc(68vh + 2.5rem); overflow: auto; }
    .timeline li { border: 1px solid var(--card-border); border-radius: var(--radius-lg); background: var(--card-bg); }
    .timeline li.selected { border-color: var(--primary-400); box-shadow: 0 0 0 2px var(--primary-200); }
    .survey { all: unset; box-sizing: border-box; width: 100%; cursor: pointer; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0.75rem; padding: 0.8rem 0.9rem; }
    .survey:focus-visible { outline: 3px solid var(--focus-ring, #0059a8); outline-offset: 2px; border-radius: var(--radius-lg); }
    .num { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: #16805c; color: #fff; font-weight: 700; font-size: 0.85rem; }
    .num.bad { background: #bc1421; }
    .body { display: grid; gap: 0.25rem; min-width: 0; color: var(--text-primary); }
    .row1 { display: flex; justify-content: space-between; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
    .row2 { color: var(--text-secondary); font-size: 0.88rem; }
    .row3 { display: flex; flex-wrap: wrap; gap: 0.2rem 0.9rem; font-size: 0.82rem; color: var(--text-tertiary); }
    .zone-tag { font-size: 0.75rem; font-weight: 700; padding: 0.15rem 0.55rem; border-radius: 999px; background: var(--success-bg); color: var(--success-color); }
    .zone-tag.bad { background: var(--error-bg, rgba(188,20,33,.1)); color: var(--error-color); }
    .alerts { display: grid; gap: 0.2rem; margin-top: 0.2rem; }
    .alert { display: flex; gap: 0.35rem; align-items: flex-start; font-size: 0.82rem; color: var(--warning-color); }
    .alert mat-icon { font-size: 16px; width: 16px; height: 16px; flex: none; margin-top: 1px; }
    .justification { font-size: 0.82rem; color: var(--text-secondary); font-style: italic; }
    .open-response { display: block; padding: 0 0.9rem 0.8rem 3.6rem; font-size: 0.85rem; color: var(--primary-text-600); }
    .empty { display: flex; gap: 0.6rem; align-items: center; color: var(--text-secondary); padding: 2rem 0; }
    .empty.error { color: var(--error-color); }
    @media (max-width: 600px) { .page { padding: 1rem; } .map-panel { position: static; } .map-panel app-route-map { height: 55vh; } }
  `],
})
export class CollectorRouteComponent {
  private projects = inject(ProjectService);
  private activated = inject(ActivatedRoute);
  private router = inject(Router);

  readonly colors = ROUTE_COLORS;
  private projectId = this.activated.snapshot.paramMap.get('projectId') ?? '';
  private userId = Number(this.activated.snapshot.paramMap.get('userId'));

  route = signal<CollectorRoute | null>(null);
  error = signal('');
  formId = signal<string | null>(this.activated.snapshot.queryParamMap.get('form'));
  selectedId = signal<string | null>(null);

  private dayIndex = computed(() => {
    const data = this.route();
    return data ? data.days.findIndex((day) => day.date === data.date) : -1;
  });
  /** `days` viene del más reciente al más antiguo. */
  olderDay = computed(() => {
    const data = this.route();
    if (!data) return null;
    const index = this.dayIndex();
    if (index >= 0) return data.days[index + 1]?.date ?? null;
    return data.days.find((day) => day.date < data.date)?.date ?? null;
  });
  newerDay = computed(() => {
    const data = this.route();
    if (!data) return null;
    const index = this.dayIndex();
    if (index >= 0) return index > 0 ? data.days[index - 1].date : null;
    return [...data.days].reverse().find((day) => day.date > data.date)?.date ?? null;
  });
  backParams = computed(() => ({ project: this.projectId, tab: 'supervision', ...(this.formId() ? { form: this.formId() } : {}) }));

  constructor() {
    this.load(this.activated.snapshot.queryParamMap.get('date'));
  }

  changeForm(formId: string | null): void {
    this.formId.set(formId);
    this.load(null);
  }

  changeDate(date: string | null): void {
    if (date) this.load(date);
  }

  toggle(id: string): void {
    this.selectedId.update((current) => (current === id ? null : id));
  }

  hasDay(date: string): boolean {
    return !!this.route()?.days.some((day) => day.date === date);
  }

  hasZoneProblem(survey: RouteSurvey): boolean {
    return survey.alerts.some((a) => a.code === 'fuera_de_zona' || a.code === 'salio_de_zona' || a.code === 'excepcion_zona');
  }

  zoneStatus(survey: RouteSurvey): string {
    if (survey.declared_outside) return 'Excepción: fuera de zona';
    const ratio = survey.summary.inside_ratio;
    if (ratio === null) return 'Sin verificación de zona';
    if (ratio === 1) return 'Dentro de la zona';
    return `${Math.round(ratio * 100)}% dentro de la zona`;
  }

  duration(seconds: number): string {
    if (seconds < 60) return `${seconds} s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return h ? `${h} h ${m} min` : `${m} min`;
  }

  distance(meters: number): string {
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
  }

  private load(date: string | null): void {
    this.error.set('');
    this.selectedId.set(null);
    this.projects.getCollectorRoute(this.projectId, this.userId, { formId: this.formId(), date }).subscribe({
      next: (data) => {
        this.route.set(data);
        void this.router.navigate([], {
          relativeTo: this.activated, replaceUrl: true,
          queryParams: { form: this.formId() || null, date: data.date },
        });
      },
      error: (err) => {
        this.route.set(null);
        this.error.set(err?.error?.message || 'No se pudo cargar el recorrido del encuestador.');
      },
    });
  }
}
