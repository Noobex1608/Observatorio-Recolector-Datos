import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { A11yModule } from '@angular/cdk/a11y';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { AuthService } from '@core/services/auth.service';
import { Form, FormService } from '@core/services/form.service';
import { CollectorCandidate, CollectorImportRow, Project, ProjectCollector, ProjectMember, ProjectService, ProjectTechnicalSheet, ProjectZone, ProjectZonePayload } from '@core/services/project.service';
import { SupervisionCollectorsComponent } from './supervision/supervision-collectors.component';
import { MapGeofenceSelectorComponent, GeofenceSelectionEvent } from '@shared/components/map-geofence-selector/map-geofence-selector.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

/** La fecha de fin no puede ser anterior a la de inicio (mismo criterio que after_or_equal en el backend). */
function endDateNotBeforeStart(group: AbstractControl): ValidationErrors | null {
  const start = group.get('start_date')?.value;
  const end = group.get('end_date')?.value;
  // Las fechas llegan como 'YYYY-MM-DD', así que la comparación de texto respeta el orden cronológico.
  return start && end && end < start ? { endBeforeStart: true } : null;
}

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [
    A11yModule,
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTabsModule,
    MatChipsModule,
    MapGeofenceSelectorComponent,
    SupervisionCollectorsComponent,
    TranslateModule,
  ],
  template: `
    <section class="projects-page">
      <header class="page-header">
        <div>
          <span class="eyebrow">Gestión de proyectos</span>
          <h1>{{ 'projects.title' | translate }}</h1>
          <p>{{ 'projects.subtitle' | translate }}</p>
        </div>
        <div class="page-kpis">
          <article>
            <mat-icon>folder_managed</mat-icon>
            <span>Proyectos</span>
            <strong>{{ projects().length }}</strong>
          </article>
          <article>
            <mat-icon>description</mat-icon>
            <span>Formularios</span>
            <strong>{{ totalForms() }}</strong>
          </article>
          <article>
            <mat-icon>supervisor_account</mat-icon>
            <span>Líderes</span>
            <strong>{{ projectLeaders().length }}</strong>
          </article>
        </div>
      </header>

      @if (canManageProjects() || editingProject()) {
        <form class="project-form" [formGroup]="projectForm" (ngSubmit)="saveProject()">
          <div class="project-form-heading">
            <span class="form-icon">
              <mat-icon>{{ editingProject() ? 'edit_note' : 'create_new_folder' }}</mat-icon>
            </span>
            <div>
              <strong>{{ (editingProject() ? 'projects.editProject' : 'projects.create') | translate }}</strong>
              <p>Define el alcance, descripción y responsables del proyecto.</p>
            </div>
          </div>

          <div class="project-fields">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'projects.name' | translate }}</mat-label>
              <input matInput formControlName="name" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'projects.description' | translate }}</mat-label>
              <textarea matInput rows="2" formControlName="description"></textarea>
            </mat-form-field>

            @if (canManageProjects()) {
              <mat-form-field appearance="outline">
                <mat-label>{{ 'projects.leader' | translate }}</mat-label>
                <mat-select formControlName="leader_ids" multiple>
                  @for (leader of projectLeaders(); track leader.id) {
                    <mat-option [value]="leader.id">{{ leader.name }} - {{ leader.email }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            }
            @if (editingProject() && canAssignMembers()) {
              <mat-form-field appearance="outline">
                <mat-label>Delegados del proyecto</mat-label>
                <mat-select formControlName="delegate_ids" multiple>
                  @for (user of assignableUsers(); track user.id) {
                    @if (user.rol === 'PROJECT') { <mat-option [value]="user.id">{{ user.name }} — {{ user.email }}</mat-option> }
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Supervisores del proyecto</mat-label>
                <mat-select formControlName="supervisor_ids" multiple>
                  @for (user of assignableUsers(); track user.id) {
                    @if (user.rol === 'SUPERVISOR') { <mat-option [value]="user.id">{{ user.name }} — {{ user.email }}</mat-option> }
                  }
                </mat-select>
              </mat-form-field>
            }
          </div>

          <div class="form-actions">
            @if (editingProject()) {
              <button mat-stroked-button type="button" (click)="cancelEdit()">{{ 'common.buttons.cancel' | translate }}</button>
            }
            <button mat-flat-button color="primary" type="submit" [disabled]="projectForm.invalid || saving()">
              <mat-icon>{{ editingProject() ? 'save' : 'add' }}</mat-icon>
              {{ (editingProject() ? 'projects.save' : 'projects.create') | translate }}
            </button>
          </div>
        </form>
      }

      @if (loading()) {
        <div class="loading-state">
          <mat-spinner diameter="36"></mat-spinner>
        </div>
      } @else {
        <div class="projects-layout">
          <div class="project-list">
            @for (project of projects(); track project.id) {
              <button
                type="button"
                class="project-row"
                [class.active]="selectedProject()?.id === project.id"
                (click)="selectProject(project)"
              >
                <span>
                  <strong>{{ project.name }}</strong>
                  <small>{{ project.description || ('projects.noDescription' | translate) }}</small>
                </span>
                <em>{{ 'projects.formsCount' | translate: { count: project.forms_count ?? 0 } }}</em>
              </button>
            } @empty {
              <div class="empty-state">
                <mat-icon>folder_open</mat-icon>
                <p>{{ 'projects.noVisible' | translate }}</p>
              </div>
            }
          </div>

          @if (selectedProject(); as project) {
            <mat-card class="project-panel">
              <div class="panel-header">
                <div class="panel-heading">
                  <h2>{{ project.name }}</h2>
                  @if (selectedForm(); as form) {
                    <p>Formulario seleccionado: <strong>{{ form.title }}</strong></p>
                  }
                  <small>{{ 'projects.formsCount' | translate: { count: project.forms?.length ?? project.forms_count ?? 0 } }}</small>
                </div>
                @if (technicalSheet(); as sheet) {
                  <span class="status-badge" [class]="sheet.status.toLowerCase()">
                    <mat-icon>{{ sheet.status === 'VALIDATED' ? 'verified' : 'pending_actions' }}</mat-icon>
                    {{ 'projects.technicalSheet.statuses.' + sheet.status | translate }}
                  </span>
                }
              </div>

              <mat-card-content class="panel-content">
                <mat-tab-group animationDuration="200ms" [(selectedIndex)]="selectedTabIndex">
                  <!-- PESTAÑA 1: FICHA TÉCNICA DEL PROYECTO (una por proyecto) -->
                  <mat-tab>
                    <ng-template mat-tab-label>
                      <mat-icon class="tab-icon">assignment_turned_in</mat-icon>
                      Ficha Técnica
                    </ng-template>

                    <div class="tab-body">
                      <p class="muted">Una sola ficha para todo el proyecto. Al validarla se habilitan las preguntas, las zonas y la publicación de todos sus formularios; cada formulario define sus fechas dentro de este periodo.</p>
                      <form [formGroup]="technicalSheetForm" (ngSubmit)="saveTechnicalSheet()" class="sheet-form">
                        <div class="sheet-banner" [class.validated]="technicalSheet()?.status === 'VALIDATED'">
                          <mat-icon>{{ technicalSheet()?.status === 'VALIDATED' ? 'verified_user' : 'info' }}</mat-icon>
                          <div>
                            <strong>{{ 'projects.technicalSheet.title' | translate }}</strong>
                            <p>
                              @if (technicalSheet()?.status === 'VALIDATED') {
                                {{ 'projects.technicalSheet.validatedInfo' | translate: { name: technicalSheet()?.validator?.name || 'Administrador', date: (technicalSheet()?.validated_at | date:'medium') } }}
                              } @else {
                                {{ 'projects.technicalSheet.draftNotice' | translate }}
                              }
                            </p>
                          </div>
                        </div>

                        <fieldset class="sheet-fields" [disabled]="!editingSheet() || !canEditSelectedProject()" style="border:0;padding:0;margin:0">
                          <mat-form-field appearance="outline" class="full-width">
                            <mat-label>{{ 'projects.technicalSheet.description' | translate }}</mat-label>
                            <textarea
                              matInput
                              rows="4"
                              formControlName="description"
                              [placeholder]="'projects.technicalSheet.descriptionPlaceholder' | translate"
                            ></textarea>
                          </mat-form-field>

                          <div class="date-row">
                            <mat-form-field appearance="outline">
                              <mat-label>{{ 'projects.technicalSheet.startDate' | translate }}</mat-label>
                              <input matInput type="date" formControlName="start_date" />
                            </mat-form-field>

                            <mat-form-field appearance="outline">
                              <mat-label>{{ 'projects.technicalSheet.endDate' | translate }}</mat-label>
                              <input matInput type="date" formControlName="end_date" [min]="technicalSheetForm.value.start_date || null" />
                              @if (technicalSheetForm.hasError('endBeforeStart')) {
                                <mat-hint class="sheet-date-error" style="color: var(--mat-sys-error, #b3261e)">{{ 'projects.technicalSheet.endBeforeStart' | translate }}</mat-hint>
                              }
                            </mat-form-field>

                            <mat-form-field appearance="outline">
                              <mat-label>{{ 'projects.technicalSheet.targetSampleSize' | translate }}</mat-label>
                              <input matInput type="number" formControlName="target_sample_size" placeholder="Ej. 500" />
                            </mat-form-field>
                          </div>
                        </fieldset>

                        <div class="sheet-actions">
                          @if (editingSheet() && canEditSelectedProject()) { <button
                            mat-flat-button
                            color="primary"
                            type="submit"
                            [disabled]="technicalSheetForm.invalid || savingSheet()"
                          >
                            <mat-icon>save</mat-icon>
                            {{ 'projects.technicalSheet.saveDraft' | translate }}
                          </button> }

                          @if (!editingSheet() && canEditSelectedProject()) {
                            <button mat-stroked-button type="button" (click)="editingSheet.set(true)">
                              <mat-icon>edit</mat-icon> Editar ficha
                            </button>
                          }

                          @if (canLeadSelectedProject() && technicalSheet()?.id && technicalSheet()?.status !== 'VALIDATED' && !editingSheet()) {
                            <button
                              mat-flat-button
                              color="accent"
                              type="button"
                              [disabled]="validatingSheet() || !technicalSheet()?.start_date || !technicalSheet()?.end_date"
                              (click)="validateTechnicalSheet()"
                            >
                              <mat-icon>check_circle</mat-icon>
                              {{ 'projects.technicalSheet.validateButton' | translate }}
                            </button>
                          }
                        </div>
                        @if (editingSheet() && technicalSheet()?.status === 'VALIDATED') {
                          <p class="muted">Al guardar cambios la ficha vuelve a borrador: los formularios en borrador no podrán editarse ni publicarse hasta que el líder la valide de nuevo. Los formularios ya publicados siguen recibiendo encuestas.</p>
                        }
                      </form>

                      <!-- Fechas propias de cada formulario, dentro del periodo del proyecto -->
                      <section class="panel-section form-periods">
                        <div class="section-title">
                          <h2>Periodo de cada formulario</h2>
                          @if (canCreateFormsInProject(project)) {
                            <button mat-stroked-button type="button" (click)="openNewFormModal(project)">
                              <mat-icon>add_circle</mat-icon> {{ 'projects.newForm' | translate }}
                            </button>
                          }
                        </div>
                        <p class="muted">
                          Deben estar dentro del periodo del proyecto
                          @if (technicalSheet()?.start_date && technicalSheet()?.end_date) {
                            ({{ technicalSheet()?.start_date | date:'dd/MM/yyyy' }} al {{ technicalSheet()?.end_date | date:'dd/MM/yyyy' }})
                          }. Un formulario sin fechas propias toma el periodo del proyecto al publicarse.
                        </p>
                        @for (form of project.forms ?? []; track form.id) {
                          <div class="form-period-row">
                            <div class="form-period-title">
                              <strong>{{ form.title }}</strong>
                              <small [class]="'form-state-badge ' + form.state.toLowerCase()">{{ formStateLabel(form.state) }}</small>
                            </div>
                            <mat-form-field appearance="outline">
                              <mat-label>Inicio</mat-label>
                              <input matInput type="date"
                                [value]="formPeriodValue(form, 'start_date')"
                                (change)="setFormPeriod(form, 'start_date', $event)"
                                [min]="technicalSheet()?.start_date || null"
                                [max]="technicalSheet()?.end_date || null"
                                [disabled]="form.state === 'DEPLOYED' || !canEditSelectedProject()" />
                            </mat-form-field>
                            <mat-form-field appearance="outline">
                              <mat-label>Fin</mat-label>
                              <input matInput type="date"
                                [value]="formPeriodValue(form, 'end_date')"
                                (change)="setFormPeriod(form, 'end_date', $event)"
                                [min]="formPeriodValue(form, 'start_date') || technicalSheet()?.start_date || null"
                                [max]="technicalSheet()?.end_date || null"
                                [disabled]="form.state === 'DEPLOYED' || !canEditSelectedProject()" />
                            </mat-form-field>
                            @if (form.state === 'DEPLOYED') {
                              <small class="muted">Publicado: archívalo para cambiar sus fechas.</small>
                            } @else if (canEditSelectedProject()) {
                              <button mat-stroked-button type="button"
                                [disabled]="!formPeriodDirty(form) || savingFormPeriodId() === form.id"
                                (click)="saveFormPeriod(form)">
                                <mat-icon>save</mat-icon> Guardar fechas
                              </button>
                            }
                          </div>
                        } @empty {
                          <p class="muted">Este proyecto aún no tiene formularios.</p>
                        }
                      </section>
                    </div>
                  </mat-tab>

                  <!-- PESTAÑA 2: FORMULARIOS Y MIEMBROS -->
                  <mat-tab>
                    <ng-template mat-tab-label>
                      <mat-icon class="tab-icon">assignment</mat-icon>
                      Formularios y Miembros
                    </ng-template>

                    <section class="panel-section">
                      <div class="section-title">
                        <h2>{{ 'common.labels.forms' | translate }}</h2>
                        @if (canCreateFormsInProject(project)) {
                          <button mat-stroked-button type="button" (click)="openNewFormModal(project)">
                            <mat-icon>add_circle</mat-icon>
                            {{ 'projects.newForm' | translate }}
                          </button>
                        }
                      </div>

                      @if ((project.forms ?? []).length > 0) {
                        <div class="form-list">
                          @for (form of project.forms; track form.id) {
                            <a class="form-item" [routerLink]="technicalSheet()?.status === 'VALIDATED' || form.state === 'DEPLOYED' ? ['/admin/forms', form.id, 'edit'] : null" (click)="technicalSheet()?.status !== 'VALIDATED' && form.state !== 'DEPLOYED' ? selectFormAndSheet(form.id) : null">
                              <div class="form-item-info">
                                <strong>{{ form.title }}</strong>
                                @if (form.start_date || form.end_date) {
                                  <span class="form-item-dates">
                                    <mat-icon>calendar_today</mat-icon>
                                    {{ form.start_date ? (form.start_date | date:'dd/MM/yyyy') : 'Inmediato' }}
                                    —
                                    {{ form.end_date ? (form.end_date | date:'dd/MM/yyyy') : 'Sin límite' }}
                                  </span>
                                }
                              </div>
                              <small [class]="'form-state-badge ' + form.state.toLowerCase()">{{ formStateLabel(form.state) }}</small>
                            </a>
                          }
                        </div>
                      } @else {
                        <p class="muted">{{ 'projects.visibleFormsEmpty' | translate }}</p>
                      }
                    </section>

                    <section class="panel-section">
                      <div class="section-title">
                        <h2>{{ 'common.labels.members' | translate }}</h2>
                        <span>{{ 'projects.membersCount' | translate: { count: project.members?.length ?? 0 } }}</span>
                      </div>

                      @if (canAssignMembers()) {
                        <div class="collector-panel">
                          <h3>Encuestadores del proyecto</h3>
                          <div class="collector-actions">
                            <button mat-stroked-button type="button" (click)="downloadCollectorTemplate()">Descargar plantilla Excel</button>
                            <label class="collector-upload">Importar Excel (.xlsx)
                              <input type="file" accept=".xlsx" (change)="chooseCollectorFile($event)" />
                            </label>
                          </div>
                          @if (collectorPreview().length) {
                            <div class="collector-preview">
                              <strong>Vista previa: {{ collectorPreview().length }} fila(s)</strong>
                              @for (row of collectorPreview(); track row.row) {
                                <div class="collector-row" [class.collector-invalid]="row.errors.length">
                                  <span>{{ row.row }}. {{ row.name }} · {{ row.cedula }} · {{ row.email }} ({{ row.status }})</span>
                                  @if (row.errors.length) { <small>{{ row.errors.join(' ') }}</small> }
                                </div>
                              }
                              <button mat-flat-button type="button" [disabled]="!collectorPreviewValid() || collectorBusy()" (click)="confirmCollectorImport()">Confirmar importación</button>
                            </div>
                          }
                          @if (collectorCredentials().length) {
                            <div class="collector-preview">
                              <strong>{{ collectorCredentials().length }} cuenta(s) nueva(s). Descarga las claves temporales ahora; no se volverán a mostrar.</strong>
                              <button mat-flat-button type="button" (click)="downloadCollectorCredentials()">Descargar credenciales CSV</button>
                            </div>
                          }
                          <!-- Agregar usuarios encuestadores que ya tienen cuenta -->
                          <div class="collector-toolbar">
                            <button mat-stroked-button type="button" (click)="toggleAddExisting()">
                              <mat-icon>person_add</mat-icon> {{ showAddExisting() ? 'Cerrar' : 'Agregar usuarios existentes' }}
                            </button>
                          </div>
                          @if (showAddExisting()) {
                            <div class="collector-preview">
                              <strong>Agregar encuestadores que ya tienen cuenta</strong>
                              <input class="collector-search" type="search" placeholder="Buscar por nombre, correo o cédula..."
                                [value]="candidateSearch()" (input)="onCandidateSearch($event)" aria-label="Buscar usuarios existentes" />
                              @for (candidate of candidates(); track candidate.id) {
                                <label class="collector-form">
                                  <input type="checkbox" [checked]="selectedCandidateIds().includes(candidate.id)" (change)="toggleCandidate(candidate.id)" />
                                  {{ candidate.name }} · {{ candidate.cedula || 'sin cédula' }} · {{ candidate.email }}
                                </label>
                              } @empty {
                                <small class="muted">{{ candidateSearch() ? 'No hay encuestadores fuera del proyecto con esa búsqueda.' : 'No hay más encuestadores activos fuera del proyecto.' }}</small>
                              }
                              <button mat-flat-button type="button" [disabled]="!selectedCandidateIds().length || collectorBusy()" (click)="addExistingCollectors()">
                                Agregar {{ selectedCandidateIds().length || '' }} al proyecto
                              </button>
                            </div>
                          }

                          <!-- Búsqueda, selección masiva y paginación del equipo -->
                          <div class="collector-toolbar">
                            <input class="collector-search" type="search" placeholder="Buscar en el equipo por nombre, correo o cédula..."
                              [value]="collectorSearch()" (input)="onCollectorSearch($event)" aria-label="Buscar encuestadores del proyecto" />
                            <button mat-stroked-button type="button" [disabled]="collectorBusy()" (click)="selectAllCollectors()">
                              <mat-icon>select_all</mat-icon> Seleccionar todos{{ collectorSearch() ? ' (búsqueda)' : '' }}
                            </button>
                            <button mat-stroked-button type="button" (click)="selectCollectorPage()">Seleccionar página</button>
                            @if (selectedCollectorIds().length) {
                              <button mat-stroked-button type="button" (click)="selectedCollectorIds.set([])">
                                <mat-icon>deselect</mat-icon> Quitar selección ({{ selectedCollectorIds().length }})
                              </button>
                            }
                          </div>
                          @for (collector of collectorPageItems(); track collector.id) {
                            <div class="collector-row">
                              <label><input type="checkbox" [checked]="selectedCollectorIds().includes(collector.id)" [disabled]="!collector.is_active" (change)="toggleCollectorSelection(collector.id)" /></label>
                              @if (editingCollectorId() === collector.id) {
                                <input #collectorName [value]="collector.name" aria-label="Nombre del encuestador" />
                                <input #collectorEmail [value]="collector.email" aria-label="Correo del encuestador" />
                                <input #collectorCedula [value]="collector.cedula" aria-label="Cédula del encuestador" />
                                <button type="button" (click)="saveCollector(collector, collectorName.value, collectorEmail.value, collectorCedula.value)">Guardar</button>
                                <button type="button" (click)="editingCollectorId.set(null)">Cancelar</button>
                              } @else {
                                <span><strong>{{ collector.name }}</strong> · {{ collector.cedula }} · {{ collector.email }}<br /><small>{{ collector.is_active ? 'Activo' : 'Inactivo' }} · {{ collector.form_ids.length }} formulario(s)</small></span>
                                <button type="button" (click)="editingCollectorId.set(collector.id)">Editar</button>
                                <button type="button" (click)="setCollectorActive(collector, !collector.is_active)">{{ collector.is_active ? 'Desactivar' : 'Activar' }}</button>
                                <button type="button" (click)="removeCollector(collector)">Quitar</button>
                              }
                            </div>
                          } @empty {
                            <p class="muted">{{ collectorSearch() ? 'Ningún encuestador del proyecto coincide con la búsqueda.' : 'Este proyecto aún no tiene encuestadores. Impórtalos con la plantilla o agrega usuarios existentes.' }}</p>
                          }
                          @if (collectorPagination(); as pagination) {
                            @if (pagination.last_page > 1) {
                              <div class="collector-pager">
                                <button mat-stroked-button type="button" [disabled]="pagination.current_page <= 1" (click)="goToCollectorPage(pagination.current_page - 1)">Anterior</button>
                                <span>Página {{ pagination.current_page }} de {{ pagination.last_page }} · {{ pagination.total }} encuestadores</span>
                                <button mat-stroked-button type="button" [disabled]="pagination.current_page >= pagination.last_page" (click)="goToCollectorPage(pagination.current_page + 1)">Siguiente</button>
                              </div>
                            } @else {
                              <small class="muted">{{ pagination.total }} encuestador(es)</small>
                            }
                          }
                          @if (collectors().length && (project.forms ?? []).length) {
                            <div class="collector-preview">
                              <strong>Repartir formularios a los encuestadores seleccionados</strong>
                              @for (form of project.forms ?? []; track form.id) {
                                <label class="collector-form"><input type="checkbox" [checked]="selectedCollectorFormIds().includes(form.id)" (change)="toggleCollectorFormSelection(form.id)" />{{ form.title }}</label>
                              }
                              <button mat-flat-button type="button" [disabled]="!selectedCollectorIds().length || !selectedCollectorFormIds().length || collectorBusy()" (click)="assignCollectorForms()">Asignar formularios</button>
                            </div>
                          }
                        </div>
                      }

                      @if ((project.members ?? []).length > 0) {
                        <div class="members-table">
                          @for (member of project.members; track member.role + '-' + member.user_id + '-' + (member.form_id ?? 'project')) {
                            <div class="member-row">
                              <span>
                                <strong>{{ member.name }}</strong>
                                <small>{{ member.email }}</small>
                              </span>
                              <span class="member-role">{{ roleLabel(member.role) }}</span>
                              <em>{{ member.form_title || scopeLabel(member.scope) }}</em>
                            </div>
                          }
                        </div>
                      } @else {
                        <p class="muted">{{ 'projects.noMembers' | translate }}</p>
                      }
                    </section>
                  </mat-tab>

                  <!-- PESTAÑA 3: DELIMITACIÓN MULTIZONA Y ENCUESTADORES -->
                  <mat-tab>
                    <ng-template mat-tab-label>
                      <mat-icon class="tab-icon">map</mat-icon>
                      Delimitación Multizona
                    </ng-template>

                    <div class="tab-body">
                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>Primero seleccione el formulario</mat-label>
                        <mat-select [value]="selectedFormId()" (selectionChange)="selectForm($event.value)">
                          @for (form of project.forms ?? []; track form.id) {
                            <mat-option [value]="form.id">{{ form.title }}</mat-option>
                          }
                        </mat-select>
                      </mat-form-field>
                      @if (selectedFormId() && technicalSheet()?.status !== 'VALIDATED') {
                        <div class="zone-prerequisite">
                          <p>La ficha técnica del proyecto debe estar validada antes de delimitar zonas.</p>
                          @if (canLeadSelectedProject()) {
                            <button mat-stroked-button type="button" (click)="selectedTabIndex = 0">
                              <mat-icon>assignment_turned_in</mat-icon>
                              Ir a ficha técnica para validarla
                            </button>
                          } @else {
                            <p>Solicita al líder del proyecto que valide la ficha técnica.</p>
                          }
                        </div>
                      }
                      <!-- Resumen de Encuestadores y Zonas -->
                      <div class="zone-kpis">
                        <article class="kpi-card">
                          <mat-icon>place</mat-icon>
                          <span>Zonas Delimitadas</span>
                          <strong>{{ zones().length }}</strong>
                        </article>
                        <article class="kpi-card">
                          <mat-icon>group</mat-icon>
                          <span>Pool Encuestadores</span>
                          <strong>{{ allEnumerators().length }}</strong>
                        </article>
                        <article class="kpi-card">
                          <mat-icon>person_pin_circle</mat-icon>
                          <span>Asignados por Zonas</span>
                          <strong>{{ totalAssignedCount() }}</strong>
                        </article>
                      </div>

                      <div class="zone-action-bar">
                        <h3>{{ 'projects.zones.title' | translate }}</h3>
                        @if (canLeadSelectedProject() && selectedFormId() && technicalSheet()?.status === 'VALIDATED') {
                          <button mat-flat-button color="primary" type="button" (click)="openCreateZoneForm()">
                            <mat-icon>add_location_alt</mat-icon>
                            {{ 'projects.zones.addZone' | translate }}
                          </button>
                        }
                      </div>

                      @if (showZoneForm()) {
                        <mat-card class="zone-builder-card">
                          <mat-card-header>
                            <mat-card-title>{{ (editingZone() ? 'projects.zones.editZone' : 'projects.zones.addZone') | translate }}</mat-card-title>
                          </mat-card-header>

                          <mat-card-content class="zone-form-content">
                            <form [formGroup]="zoneForm" class="zone-inputs">
                              <div class="form-grid">
                                <mat-form-field appearance="outline">
                                  <mat-label>{{ 'projects.zones.zoneName' | translate }} *</mat-label>
                                  <input matInput formControlName="name" [placeholder]="'projects.zones.zoneNamePlaceholder' | translate" />
                                </mat-form-field>

                                <mat-form-field appearance="outline">
                                  <mat-label>{{ 'projects.zones.targetResponses' | translate }}</mat-label>
                                  <input matInput type="number" formControlName="target_responses" placeholder="Ej. 100" />
                                </mat-form-field>

                                <mat-form-field appearance="outline">
                                  <mat-label>Cuota de Encuestadores (Cantidad)</mat-label>
                                  <input matInput type="number" formControlName="assigned_count" placeholder="Ej. 50" />
                                </mat-form-field>

                                <mat-form-field appearance="outline">
                                  <mat-label>{{ 'projects.zones.zoneDescription' | translate }}</mat-label>
                                  <input matInput formControlName="description" placeholder="Notas sobre la zona..." />
                                </mat-form-field>
                              </div>

                              <!-- Asignación Híbrida de Encuestadores para 100+ Personas -->
                              <div class="enumerators-picker">
                                <div class="picker-header">
                                  <h4>
                                    <mat-icon>person_add</mat-icon>
                                    Asignar Encuestadores Especificos ({{ selectedEnumeratorIds().length }}{{ zoneForm.value.assigned_count ? ' / cuota ' + zoneForm.value.assigned_count : '' }} seleccionados de {{ allEnumerators().length }} del proyecto)
                                  </h4>
                                  <div class="picker-actions">
                                    <button mat-stroked-button type="button" (click)="selectAllEnumerators()">
                                      <mat-icon>select_all</mat-icon> Seleccionar Todos
                                    </button>
                                    <button mat-stroked-button type="button" (click)="clearSelectedEnumerators()">
                                      <mat-icon>deselect</mat-icon> Limpiar
                                    </button>
                                  </div>
                                </div>

                                <div class="enumerator-search-box">
                                  <mat-form-field appearance="outline" class="w-full">
                                    <mat-label>Buscar encuestador por nombre, correo o rol...</mat-label>
                                    <input matInput [value]="enumeratorSearchQuery()" (input)="onSearchEnumerator($event)" placeholder="Ej. Steven, recolector..." />
                                    <mat-icon matPrefix>search</mat-icon>
                                    @if (enumeratorSearchQuery()) {
                                      <button mat-icon-button matSuffix (click)="enumeratorSearchQuery.set('')" type="button" aria-label="Limpiar búsqueda">
                                        <mat-icon>close</mat-icon>
                                      </button>
                                    }
                                  </mat-form-field>
                                </div>

                                <div class="enumerators-chips">
                                  @for (enumUser of filteredEnumerators(); track enumUser.id) {
                                    <label class="enumerator-checkbox" [class.selected]="isEnumeratorSelected(enumUser.id)">
                                      <input
                                        type="checkbox"
                                        [checked]="isEnumeratorSelected(enumUser.id)"
                                        (change)="toggleEnumeratorSelection(enumUser.id, $event)"
                                      />
                                      <span>{{ enumUser.name }} <small class="muted">({{ enumUser.email }})</small></span>
                                    </label>
                                  } @empty {
                                    @if (allEnumerators().length === 0) {
                                      <p class="muted">Este proyecto aún no tiene encuestadores activos. Impórtalos desde la pestaña Encuestadores.</p>
                                    } @else {
                                      <p class="muted">No se encontraron encuestadores con la búsqueda realizada.</p>
                                    }
                                  }
                                </div>
                              </div>

                              <!-- Mapa de Delimitación GPS -->
                              <div class="map-wrapper">
                                <h4>
                                  <mat-icon>location_searching</mat-icon>
                                  Delimitación Espacial en Mapa
                                </h4>
                                <app-map-geofence-selector
                                  [zoneName]="zoneForm.value.name || ''"
                                  [targetLat]="zoneForm.value.target_lat || null"
                                  [targetLng]="zoneForm.value.target_lng || null"
                                  [radiusMeters]="zoneForm.value.radius_meters || 500"
                                  [initialManzanas]="zoneManzanaCodes()"
                                  (geofenceChange)="onGeofenceChange($event)"
                                ></app-map-geofence-selector>
                              </div>
                            </form>
                          </mat-card-content>

                          <mat-card-actions align="end">
                            <button mat-stroked-button type="button" (click)="cancelZoneForm()">
                              {{ 'common.buttons.cancel' | translate }}
                            </button>
                            <button mat-flat-button color="primary" type="button" [disabled]="zoneForm.invalid || savingZone()" (click)="saveZone()">
                              <mat-icon>save</mat-icon>
                              {{ 'common.buttons.save' | translate }}
                            </button>
                          </mat-card-actions>
                        </mat-card>
                      }

                      <!-- Lista de Zonas Delimitadas -->
                      <div class="zones-grid">
                        @for (zone of zones(); track zone.id) {
                          <mat-card class="zone-card">
                            <mat-card-header>
                              <mat-icon mat-card-avatar color="primary">pin_drop</mat-icon>
                              <mat-card-title>{{ zone.name }}</mat-card-title>
                              <mat-card-subtitle>{{ zone.description || 'Zona delimitada' }}</mat-card-subtitle>
                            </mat-card-header>

                            <mat-card-content class="zone-card-body">
                              <div class="zone-details">
                                <span class="badge" [class.polygon]="zone.geofence_type === 'manzana_polygon'">
                                  <mat-icon>{{ zone.geofence_type === 'manzana_polygon' ? 'polyline' : 'radar' }}</mat-icon>
                                  {{ zone.geofence_type === 'manzana_polygon' ? ('Polígono INEC' + (manzanaCount(zone) > 1 ? ' (' + manzanaCount(zone) + ' manzanas)' : '')) : ('Radio GPS (' + zone.radius_meters + 'm)') }}
                                </span>

                                @if (zone.target_responses) {
                                  <span class="quota">Meta: {{ zone.target_responses }} encuestas</span>
                                }
                                @if (zone.assigned_count) {
                                  <span class="quota">Cuota: {{ zone.assigned_count }} encuestadores</span>
                                }
                              </div>

                              <div class="zone-users">
                                <strong>
                                  <mat-icon>groups</mat-icon>
                                  Encuestadores Asignados ({{ zone.assigned_users?.length ?? 0 }}):
                                </strong>
                                <div class="user-pills">
                                  @for (user of zone.assigned_users; track user.id) {
                                    <span class="user-pill">{{ user.name }}</span>
                                  } @empty {
                                    <em class="muted">Sin encuestadores asignados específicamente (cuota libre).</em>
                                  }
                                </div>
                              </div>
                            </mat-card-content>

                            @if (canLeadSelectedProject()) {
                              <mat-card-actions align="end">
                                <button mat-button type="button" (click)="editZone(zone)">
                                  <mat-icon>edit</mat-icon>
                                  {{ 'common.buttons.edit' | translate }}
                                </button>
                                <button mat-button color="warn" type="button" (click)="deleteZone(zone)">
                                  <mat-icon>delete</mat-icon>
                                  {{ 'common.buttons.delete' | translate }}
                                </button>
                              </mat-card-actions>
                            }
                          </mat-card>
                        } @empty {
                          @if (!showZoneForm()) {
                            <div class="empty-zones-banner">
                              <mat-icon>map_search</mat-icon>
                              <p>{{ 'projects.zones.noZones' | translate }}</p>
                            </div>
                          }
                        }
                      </div>
                      @if (canLeadSelectedProject() && selectedFormId() && zones().length > 0) {
                        <mat-card class="zone-builder-card">
                          <mat-card-content>
                            <h3>Designación aleatoria de encuestadores</h3>
                            <p>La delimitación está lista. Seleccione el equipo y revise la distribución antes de confirmarla.</p>
                            <mat-form-field appearance="outline" class="full-width">
                              <mat-label>Encuestadores</mat-label>
                              <mat-select multiple [value]="randomCandidateIds()" (selectionChange)="randomCandidateIds.set($event.value)">
                                @for (user of allEnumerators(); track user.id) {
                                  <mat-option [value]="user.id">{{ user.name }} — {{ user.email }}</mat-option>
                                }
                              </mat-select>
                            </mat-form-field>
                            <button mat-stroked-button type="button" [disabled]="randomCandidateIds().length === 0" (click)="previewRandomAssignment()">Previsualizar distribución</button>
                            @if (randomPreview(); as preview) {
                              @for (zone of zones(); track zone.id) {
                                <p><strong>{{ zone.name }}:</strong> {{ preview.assignments[zone.id!]?.length ?? 0 }} encuestadores</p>
                              }
                              <button mat-flat-button color="primary" type="button" (click)="confirmRandomAssignment()">Confirmar designación</button>
                            }
                          </mat-card-content>
                        </mat-card>
                      }
                      @if (canLeadSelectedProject() && selectedForm()?.state === 'DRAFT' && zones().length > 0) {
                        <button mat-flat-button color="primary" type="button" (click)="publishSelectedForm()">Publicar encuesta</button>
                      }
                    </div>
                  </mat-tab>
                  @if (authService.isSupervisor() || canLeadSelectedProject() || canManageProjects()) {
                    <mat-tab>
                      <ng-template mat-tab-label><mat-icon class="tab-icon">track_changes</mat-icon> Supervisión</ng-template>
                      <div class="tab-body">
                        <app-supervision-collectors [projectId]="project.id" [forms]="project.forms ?? []" [initialFormId]="selectedFormId()" />
                      </div>
                    </mat-tab>
                  }
                </mat-tab-group>
              </mat-card-content>

              @if (canEditSelectedProject()) {
                <mat-card-actions align="end" class="panel-footer">
                  <button mat-button type="button" (click)="editProject(project)">
                    <mat-icon>edit</mat-icon>
                    {{ 'projects.editProject' | translate }}
                  </button>

                  @if (canDeleteProjects()) {
                    <button mat-button color="warn" type="button" (click)="deleteProject(project)">
                      <mat-icon>delete</mat-icon>
                      {{ 'projects.deleteProjectButton' | translate }}
                    </button>
                  }
                </mat-card-actions>
              }
            </mat-card>
          } @else {
            <mat-card class="project-panel empty-panel">
              <mat-icon>ads_click</mat-icon>
              <p>{{ 'projects.selectPrompt' | translate }}</p>
            </mat-card>
          }
        </div>
      }

      @if (showNewFormModal()) {
        <div class="modal-backdrop" (click)="closeNewFormModal()" (keydown.escape)="closeNewFormModal()">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-form-title" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
            <header class="modal-header">
              <div class="modal-header-icon">
                <mat-icon>assignment_add</mat-icon>
              </div>
              <div class="modal-header-text">
                <h3 id="new-form-title">Nuevo Formulario de Recolección</h3>
                <p>Proyecto: <strong>{{ newFormProjectName() }}</strong></p>
              </div>
              <button type="button" class="close-icon-btn" aria-label="Cerrar" (click)="closeNewFormModal()">
                <mat-icon>close</mat-icon>
              </button>
            </header>

            <form [formGroup]="newFormForm" (ngSubmit)="submitNewForm()" class="modal-body-form">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Título del Formulario</mat-label>
                <input matInput formControlName="title" placeholder="Ej: Diagnóstico Comunitario 2026" required />
                <mat-icon matPrefix>title</mat-icon>
                @if (newFormForm.get('title')?.hasError('required') && newFormForm.get('title')?.touched) {
                  <mat-error>El título del formulario es obligatorio</mat-error>
                }
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Descripción u Objetivo</mat-label>
                <textarea matInput formControlName="description" rows="2" placeholder="Objetivo general del instrumento de recolección"></textarea>
                <mat-icon matPrefix>description</mat-icon>
              </mat-form-field>

              <div class="date-row">
                <mat-form-field appearance="outline">
                  <mat-label>Fecha de inicio (opcional)</mat-label>
                  <input matInput type="date" formControlName="start_date"
                    [min]="technicalSheet()?.start_date || null" [max]="technicalSheet()?.end_date || null" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Fecha de fin (opcional)</mat-label>
                  <input matInput type="date" formControlName="end_date"
                    [min]="newFormForm.value.start_date || technicalSheet()?.start_date || null" [max]="technicalSheet()?.end_date || null" />
                </mat-form-field>
              </div>

              <p>El formulario se creará en borrador. Sus fechas deben estar dentro del periodo de la ficha técnica del proyecto; si las dejas vacías, usará ese periodo al publicarse. Las preguntas se habilitan cuando el líder valida la ficha del proyecto.</p>

              <footer class="modal-actions">
                <button mat-button type="button" (click)="closeNewFormModal()" [disabled]="savingNewForm()">
                  Cancelar
                </button>
                <button mat-flat-button color="primary" type="submit" [disabled]="savingNewForm() || newFormForm.invalid">
                  <mat-icon>arrow_forward</mat-icon>
                  <span>{{ savingNewForm() ? 'Creando formulario...' : 'Crear formulario' }}</span>
                </button>
              </footer>
            </form>
          </div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .projects-page {
        padding: 2rem;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        min-width: 0;
        gap: 1.4rem;
        background:
          linear-gradient(180deg, rgba(0, 89, 168, 0.05), transparent 280px),
          var(--bg-primary);
        min-height: 100%;
      }

      .page-header {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 1.5rem;
        flex-wrap: wrap;
      }

      .page-header h1 {
        margin: 0.1rem 0 0.35rem;
        font-size: 1.875rem;
        color: var(--text-primary);
      }

      .page-header p,
      .muted {
        color: var(--text-secondary);
      }

      .eyebrow {
        color: var(--primary-text-600);
        font-size: 0.75rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .page-kpis {
        display: grid;
        grid-template-columns: repeat(3, minmax(120px, 1fr));
        gap: 0.75rem;
      }

      .page-kpis article {
        min-width: 130px;
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.15rem 0.55rem;
        align-items: center;
        padding: 0.75rem 0.85rem;
        border: 1px solid var(--card-border);
        border-radius: var(--radius-lg);
        background: var(--card-bg);
        box-shadow: 0 10px 28px var(--shadow-color);
      }

      .page-kpis mat-icon {
        grid-row: span 2;
        color: var(--primary-text-600);
        font-size: 20px;
        width: 20px;
        height: 20px;
      }

      .page-kpis span {
        color: var(--text-secondary);
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
      }

      .page-kpis strong {
        color: var(--text-primary);
        font-size: 1.1rem;
      }

      .project-form {
        display: grid;
        grid-template-columns: minmax(220px, 0.7fr) minmax(0, 1.5fr) auto;
        gap: 1rem;
        align-items: center;
        padding: 1rem 1.1rem;
        border: 1px solid var(--card-border);
        border-radius: var(--radius-lg);
        background: var(--card-bg);
        box-shadow: 0 12px 30px var(--shadow-color);
      }

      .project-form-heading {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        min-width: 0;
      }

      .project-form-heading strong {
        display: block;
        color: var(--text-primary);
        font-size: 1rem;
      }

      .project-form-heading p {
        margin: 0.2rem 0 0;
        color: var(--text-secondary);
        font-size: 0.82rem;
        line-height: 1.35;
      }

      .form-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 42px;
        height: 42px;
        border-radius: var(--radius-lg);
        background: var(--primary-50);
        color: var(--primary-text-700);
        border: 1px solid var(--primary-100);
      }

      .project-fields {
        display: grid;
        grid-template-columns: minmax(160px, 0.8fr) minmax(220px, 1.1fr) minmax(220px, 1fr);
        gap: 0.8rem;
      }

      .form-actions {
        display: flex;
        gap: 0.5rem;
        justify-content: flex-end;
        padding-top: 0.35rem;
      }

      .loading-state,
      .empty-state,
      .empty-panel {
        display: grid;
        place-items: center;
        min-height: 220px;
        color: var(--text-secondary);
      }

      .projects-layout {
        display: grid;
        grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
        gap: 1.1rem;
        align-items: start;
        min-width: 0;
      }

      .projects-layout > * {
        min-width: 0;
      }

      .project-list {
        display: grid;
        gap: 0.5rem;
        padding: 0.75rem;
        border: 1px solid var(--card-border);
        border-radius: var(--radius-lg);
        background: var(--card-bg);
      }

      .project-row {
        width: 100%;
        border: 1px solid transparent;
        background: var(--bg-secondary);
        color: var(--text-primary);
        border-radius: var(--radius-md);
        padding: 0.85rem;
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        text-align: left;
        cursor: pointer;
        transition: border-color var(--transition-fast), background var(--transition-fast), box-shadow var(--transition-fast);
      }

      .project-row.active,
      .project-row:hover {
        border-color: var(--primary-300);
        background: var(--primary-50);
        box-shadow: 0 8px 18px var(--shadow-color);
      }

      .project-row span,
      .member-row span {
        display: grid;
        min-width: 0;
        gap: 0.2rem;
      }

      .project-row strong,
      .project-row small {
        overflow-wrap: anywhere;
      }

      .project-row small,
      .project-row em,
      .member-row small,
      .member-row em {
        color: var(--text-secondary);
        font-size: 0.8rem;
      }

      .project-panel {
        min-width: 0;
        border-radius: var(--radius-md);
        border: 1px solid var(--card-border);
        background: var(--card-bg);
        box-shadow: 0 12px 30px var(--shadow-color);
      }

      .panel-header {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 1.2rem 1.5rem 0.5rem;
        text-align: left;
      }

      .panel-heading {
        min-width: 0;
      }

      .panel-heading h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        overflow-wrap: anywhere;
      }

      .panel-heading p {
        margin: 0.25rem 0;
        color: var(--text-secondary);
        overflow-wrap: anywhere;
      }

      .panel-heading strong {
        color: var(--text-primary);
      }

      .panel-heading small {
        color: var(--text-secondary);
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.35rem 0.8rem;
        border-radius: 9999px;
        font-size: 0.78rem;
        font-weight: 700;
        background: rgba(100, 116, 139, 0.12);
        color: var(--text-secondary);
      }

      .status-badge mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      .status-badge.validated {
        background: rgba(16, 185, 129, 0.15);
        color: #047857;
      }

      :host-context(.dark) .status-badge.validated {
        color: #34d399;
      }

      .panel-content {
        min-width: 0;
        padding: 0 1.2rem 1.2rem;
      }

      .panel-content mat-tab-group {
        display: block;
        min-width: 0;
        max-width: 100%;
      }

      .tab-icon {
        margin-right: 0.4rem;
      }

      .tab-body {
        padding: 1.2rem 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        min-width: 0;
        gap: 1.2rem;
      }

      .sheet-form {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 1.25rem;
        min-width: 0;
      }

      .sheet-banner {
        display: flex;
        align-items: flex-start;
        gap: 0.85rem;
        padding: 1rem;
        border-radius: var(--radius-md);
        background: var(--primary-50, rgba(0, 89, 168, 0.08));
        border: 1px solid var(--primary-200, rgba(0, 89, 168, 0.2));
        color: var(--text-primary);
      }

      .sheet-banner.validated {
        background: rgba(16, 185, 129, 0.08);
        border-color: rgba(16, 185, 129, 0.3);
      }

      .sheet-banner mat-icon {
        color: var(--primary-text-600);
      }

      .sheet-fields {
        display: grid;
        gap: 1rem;
      }

      .full-width {
        width: 100%;
      }

      .collector-panel { margin: 1rem 0; padding: 1rem; border: 1px solid var(--card-border); border-radius: var(--radius-md); }
      .collector-panel h3 { margin: 0 0 .75rem; }
      .collector-actions, .collector-row { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; }
      .collector-row { padding: .6rem 0; border-bottom: 1px solid var(--card-border); }
      .collector-toolbar { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; margin: .75rem 0; }
      .collector-search { flex: 1; min-width: 220px; padding: .55rem .7rem; border: 1px solid var(--card-border); border-radius: 6px; background: transparent; color: inherit; }
      .collector-pager { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; justify-content: center; margin-top: .75rem; }
      .collector-row span { flex: 1; min-width: 200px; }
      .collector-row small { color: var(--text-secondary); }
      .collector-row button { border: 0; background: transparent; color: var(--primary-text-600); cursor: pointer; }
      .collector-row input:not([type=checkbox]) { max-width: 200px; padding: .4rem; border: 1px solid var(--card-border); border-radius: 4px; }
      .collector-invalid { color: #b91c1c; }
      .collector-upload { cursor: pointer; border: 1px solid var(--card-border); padding: .5rem .8rem; border-radius: 5px; }
      .collector-upload input { position: absolute; width: 1px; height: 1px; opacity: 0; }
      .collector-preview { display: grid; gap: .6rem; margin: .8rem 0; padding: .75rem; background: var(--bg-secondary); border-radius: var(--radius-md); }
      .collector-preview button { justify-self: start; }
      .collector-form { display: flex; gap: .5rem; align-items: center; }

      .date-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 1rem;
      }

      .sheet-actions {
        display: flex;
        gap: 0.8rem;
        justify-content: flex-end;
      }

      .sheet-actions a[mat-flat-button],
      .sheet-actions a[mat-flat-button]:visited {
        color: #ffffff !important;
      }

      .zone-prerequisite {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem 1rem;
        padding: 0.8rem 1rem;
        border: 1px solid var(--card-border);
        border-radius: var(--radius-md);
        background: var(--bg-secondary);
      }

      .zone-prerequisite p {
        margin: 0;
        color: var(--text-secondary);
      }

      .zone-kpis {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.85rem;
      }

      .kpi-card {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.2rem 0.6rem;
        align-items: center;
        padding: 0.75rem 0.9rem;
        border: 1px solid var(--card-border);
        border-radius: var(--radius-md);
        background: var(--bg-secondary);
      }

      .kpi-card mat-icon {
        grid-row: span 2;
        color: var(--primary-text-600);
      }

      .kpi-card span {
        font-size: 0.75rem;
        color: var(--text-secondary);
        font-weight: 700;
        text-transform: uppercase;
      }

      .kpi-card strong {
        font-size: 1.15rem;
        color: var(--text-primary);
      }

      .zone-action-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        justify-content: space-between;
        align-items: center;
      }

      .zone-action-bar h3 {
        margin: 0;
        font-size: 1.05rem;
      }

      .zone-builder-card {
        min-width: 0;
        border: 1px solid var(--primary-300);
        box-shadow: 0 12px 32px var(--shadow-color);
        background: var(--card-bg);
      }

      .zone-form-content {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        min-width: 0;
        gap: 1.2rem;
        padding-top: 0.5rem;
      }

      .zone-inputs,
      .enumerators-picker,
      .map-wrapper,
      app-map-geofence-selector {
        min-width: 0;
        max-width: 100%;
      }

      .form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.8rem;
      }

      .form-grid mat-form-field {
        min-width: 0;
      }

      .col-span-2 {
        grid-column: span 2;
      }

      .picker-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-bottom: 0.6rem;
      }

      .picker-header h4 {
        margin: 0;
      }

      .picker-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }

      .enumerator-search-box {
        margin-bottom: 0.6rem;
      }

      .enumerator-search-box mat-form-field {
        width: 100%;
      }

      .enumerators-picker h4,
      .map-wrapper h4 {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin: 0 0 0.6rem;
        font-size: 0.92rem;
        color: var(--text-primary);
      }

      .enumerators-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
        padding: 0.8rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        max-height: 160px;
        overflow-y: auto;
      }

      .enumerator-checkbox {
        display: flex;
        min-width: 0;
        max-width: 100%;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.82rem;
        padding: 0.35rem 0.6rem;
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease;
      }

      .enumerator-checkbox.selected {
        background: var(--primary-50);
        border-color: var(--primary-400);
        font-weight: 600;
      }

      .enumerator-checkbox span {
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .map-wrapper {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 0.5rem;
      }

      .zones-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
        gap: 1rem;
      }

      .zone-card {
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
      }

      .zone-details {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
        margin-bottom: 0.75rem;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.2rem 0.55rem;
        border-radius: var(--radius-full);
        font-size: 0.72rem;
        font-weight: 700;
        background: rgba(59, 130, 246, 0.12);
        color: #2563eb;
      }

      .badge mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }

      .badge.polygon {
        background: rgba(16, 185, 129, 0.12);
        color: #059669;
      }

      .quota {
        font-size: 0.78rem;
        color: var(--text-secondary);
        font-weight: 600;
      }

      .zone-users {
        display: grid;
        gap: 0.4rem;
        font-size: 0.82rem;
      }

      .zone-users strong {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        font-size: 0.8rem;
      }

      .user-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
      }

      .user-pill {
        padding: 0.15rem 0.5rem;
        background: var(--bg-tertiary);
        border-radius: var(--radius-sm);
        font-size: 0.75rem;
      }

      .empty-zones-banner {
        grid-column: 1 / -1;
        display: grid;
        place-items: center;
        padding: 2.5rem;
        border: 2px dashed var(--border-color);
        border-radius: var(--radius-lg);
        color: var(--text-secondary);
        text-align: center;
      }

      .empty-zones-banner mat-icon {
        font-size: 36px;
        width: 36px;
        height: 36px;
        margin-bottom: 0.5rem;
      }

      .panel-section {
        display: grid;
        gap: 0.75rem;
        padding: 1rem 0;
        border-top: 1px solid var(--border-color);
      }

      .section-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }

      .section-title h2 {
        margin: 0;
        font-size: 1rem;
      }

      .form-list,
      .members-table {
        display: grid;
        gap: 0.5rem;
      }

      .form-item,
      .member-row {
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        padding: 0.75rem;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 0.75rem;
        align-items: center;
        text-decoration: none;
        color: var(--text-primary);
        background: var(--bg-primary);
      }

      .form-item:hover {
        border-color: var(--primary-300);
        background: var(--hover-bg);
      }

      .member-role {
        background: var(--bg-tertiary);
        border-radius: var(--radius-full);
        padding: 0.25rem 0.65rem;
        font-size: 0.75rem;
        font-weight: 700;
      }

      @media (max-width: 1600px) {
        .project-form,
        .projects-layout {
          grid-template-columns: minmax(0, 1fr);
        }

        .project-list {
          grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
        }
      }

      @media (max-width: 1250px) {
        .form-grid {
          grid-template-columns: minmax(0, 1fr);
        }

        .col-span-2 {
          grid-column: auto;
        }
      }

      @media (max-width: 900px) {
        .project-form,
        .project-fields,
        .form-item,
        .member-row {
          grid-template-columns: 1fr;
        }

        .col-span-2 {
          grid-column: span 1;
        }

        .page-kpis,
        .zone-kpis {
          width: 100%;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
        }

        .form-actions {
          justify-content: flex-start;
        }
      }

      .modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1100;
        background: rgba(15, 23, 42, 0.65);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.25rem;
        animation: fadeIn 0.15s ease-out;
      }

      .modal-card {
        background: var(--card-bg, #ffffff);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-xl, 16px);
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        width: 100%;
        max-width: 620px;
        max-height: 90vh;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
      }

      .modal-header {
        display: flex;
        align-items: center;
        gap: 0.85rem;
        padding: 1.25rem 1.5rem;
        border-bottom: 1px solid var(--border-color);
        background: var(--bg-secondary, #f8fafc);
      }

      .modal-header-icon {
        width: 44px;
        height: 44px;
        border-radius: var(--radius-lg, 12px);
        background: var(--primary-50, #f0fdf4);
        color: var(--primary-600, #16a34a);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        border: 1px solid var(--primary-100, #dcfce7);
      }

      .modal-header-text {
        flex: 1;
        min-width: 0;
      }

      .modal-header-text h3 {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 700;
        color: var(--text-primary);
      }

      .modal-header-text p {
        margin: 0.2rem 0 0;
        font-size: 0.85rem;
        color: var(--text-secondary);
      }

      .close-icon-btn {
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 0.35rem;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .close-icon-btn:hover {
        background: var(--hover-bg, rgba(0, 0, 0, 0.05));
        color: var(--text-primary);
      }

      .modal-body-form {
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1.1rem;
      }

      .full-width {
        width: 100%;
      }

      .consent-config-card {
        background: var(--bg-secondary, #f8fafc);
        border: 1px solid var(--border-color, #e2e8f0);
        border-radius: var(--radius-lg, 12px);
        padding: 1.1rem;
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
      }

      .consent-toggle-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }

      .consent-toggle-info {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
      }

      .consent-icon {
        color: var(--primary-600, #16a34a);
        font-size: 24px;
        width: 24px;
        height: 24px;
        flex-shrink: 0;
        margin-top: 2px;
      }

      .consent-toggle-info strong {
        display: block;
        font-size: 0.95rem;
        color: var(--text-primary);
      }

      .consent-toggle-info p {
        margin: 0.2rem 0 0;
        font-size: 0.82rem;
        color: var(--text-secondary);
        line-height: 1.35;
      }

      .consent-text-section {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        padding-top: 0.6rem;
        border-top: 1px dashed var(--border-color);
      }

      .consent-tip {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        background: rgba(14, 165, 233, 0.08);
        border: 1px solid rgba(14, 165, 233, 0.2);
        border-radius: var(--radius-md, 8px);
        padding: 0.65rem 0.85rem;
        font-size: 0.8rem;
        color: #0369a1;
      }

      .consent-tip mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        margin-top: 1px;
      }

      .dates-config-card {
        background: var(--bg-secondary, #f8fafc);
        border: 1px solid var(--border-color, #e2e8f0);
        border-radius: var(--radius-lg, 12px);
        padding: 1.1rem;
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
      }

      .dates-header {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
      }

      .dates-icon {
        color: #2563eb;
        font-size: 24px;
        width: 24px;
        height: 24px;
        flex-shrink: 0;
        margin-top: 2px;
      }

      .dates-header strong {
        display: block;
        font-size: 0.95rem;
        color: var(--text-primary);
      }

      .dates-header p {
        margin: 0.2rem 0 0;
        font-size: 0.82rem;
        color: var(--text-secondary);
        line-height: 1.35;
      }

      .dates-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-top: 0.25rem;
      }

      @media (max-width: 600px) {
        .dates-grid {
          grid-template-columns: 1fr;
        }
      }

      .form-item-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .form-period-row {
        display: grid;
        grid-template-columns: minmax(180px, 2fr) minmax(150px, 1fr) minmax(150px, 1fr) auto;
        gap: 12px;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
      }

      .form-period-row mat-form-field {
        margin-bottom: -1.25em;
      }

      .form-period-title {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      @media (max-width: 760px) {
        .form-period-row {
          grid-template-columns: 1fr;
        }
      }

      .form-item-dates {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.76rem;
        color: var(--text-secondary);
      }

      .form-item-dates mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }

      .form-state-badge {
        padding: 0.25rem 0.6rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      .form-state-badge.deployed {
        background: rgba(22, 163, 74, 0.12);
        color: #16a34a;
      }

      .form-state-badge.draft {
        background: rgba(234, 179, 8, 0.15);
        color: #b45309;
      }

      .form-state-badge.archived {
        background: rgba(100, 116, 139, 0.15);
        color: #475569;
      }

      .modal-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--border-color);
      }
    `,
  ],
})
export class ProjectListComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly projectService = inject(ProjectService);
  private readonly formService = inject(FormService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);

  showNewFormModal = signal(false);
  newFormProjectId = signal<string | null>(null);
  newFormProjectName = signal('');
  savingNewForm = signal(false);

  newFormForm = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
    start_date: [new Date().toISOString().split('T')[0]],
    end_date: [''],
    require_consent: [true],
    consent_text: [
      'Buenos días/tardes. Somos de la Universidad Laica Eloy Alfaro de Manabí (ULEAM). Estamos realizando una investigación académica y comunitaria. Su participación es completamente voluntaria y sus respuestas serán tratadas de manera anónima y confidencial. ¿Acepta participar en esta encuesta?',
    ],
  });

  projects = signal<Project[]>([]);
  projectLeaders = signal<Array<{ id: number; name: string; email: string }>>([]);
  /**
   * Encuestadores que se pueden asignar a zonas: el equipo activo del proyecto (pestaña Encuestadores).
   * Al editar una zona se añaden quienes ya estaban en ella aunque no sean del equipo, para no perderlos.
   */
  allEnumerators = computed<Array<{ id: number; name: string; email: string; rol: string }>>(() => {
    const team = this.collectors()
      .filter((collector) => collector.is_active)
      .map((collector) => ({ id: collector.id, name: collector.name, email: collector.email, rol: 'RECOLECTOR' }));
    const teamIds = new Set(team.map((user) => user.id));
    const legacy = (this.editingZone()?.assigned_users ?? [])
      .filter((user) => !teamIds.has(user.id))
      .map((user) => ({ id: user.id, name: user.name, email: user.email, rol: 'Fuera del equipo del proyecto' }));
    return [...team, ...legacy];
  });
  assignableUsers = signal<Array<{ id: number; name: string; email: string; rol: string }>>([]);
  selectedProject = signal<Project | null>(null);
  collectors = signal<ProjectCollector[]>([]);
  collectorFile = signal<File | null>(null);
  collectorPreview = signal<CollectorImportRow[]>([]);
  collectorPreviewValid = signal(false);
  collectorCredentials = signal<Array<{ name: string; email: string; password: string }>>([]);
  collectorBusy = signal(false);
  editingCollectorId = signal<number | null>(null);
  selectedCollectorIds = signal<number[]>([]);
  selectedCollectorFormIds = signal<string[]>([]);
  technicalSheet = signal<ProjectTechnicalSheet | null>(null);
  selectedFormId = signal<string | null>(null);
  selectedForm = computed(() => this.selectedProject()?.forms?.find((form) => form.id === this.selectedFormId()) ?? null);
  randomCandidateIds = signal<number[]>([]);
  randomPreview = signal<{ seed: string; assignments: Record<string, number[]> } | null>(null);
  editingSheet = signal(false);
  zones = signal<ProjectZone[]>([]);

  loading = signal(true);
  saving = signal(false);
  editingProject = signal<Project | null>(null);

  selectedTabIndex = 0;
  savingSheet = signal(false);
  validatingSheet = signal(false);

  showZoneForm = signal(false);
  editingZone = signal<ProjectZone | null>(null);
  savingZone = signal(false);
  selectedEnumeratorIds = signal<number[]>([]);
  enumeratorSearchQuery = signal<string>('');

  filteredEnumerators = computed(() => {
    const query = this.enumeratorSearchQuery().toLowerCase().trim();
    const all = this.allEnumerators();
    if (!query) return all;
    return all.filter(
      (u) =>
        u.name.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query) ||
        u.rol?.toLowerCase().includes(query),
    );
  });

  canManageProjects = computed(() => this.authService.isAdmin());
  canAssignMembers = computed(() => {
    const project = this.selectedProject();
    const id = this.authService.user()?.id;
    return this.authService.isAdmin() || !!project?.leaders?.some((leader) => leader.id === id);
  });
  canLeadSelectedProject = computed(() => {
    const project = this.selectedProject();
    const id = this.authService.user()?.id;
    return !!project?.leaders?.some((leader) => leader.id === id);
  });
  canEditSelectedProject = computed(() => {
    const project = this.selectedProject();
    const id = this.authService.user()?.id;
    return this.authService.isAdmin() || !!project?.leaders?.some((leader) => leader.id === id)
      || !!project?.delegates?.some((delegate) => delegate.id === id);
  });
  canDeleteProjects = computed(() => this.authService.isSuperAdmin());
  totalForms = computed(() =>
    this.projects().reduce((total, project) => total + (project.forms?.length ?? project.forms_count ?? 0), 0),
  );

  totalAssignedCount = computed(() => {
    const assignedSet = new Set<number>();
    for (const z of this.zones()) {
      for (const u of z.assigned_users ?? []) {
        assignedSet.add(u.id);
      }
    }
    return assignedSet.size;
  });

  projectForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
    leader_ids: [[] as number[]],
    delegate_ids: [[] as number[]],
    supervisor_ids: [[] as number[]],
  });

  technicalSheetForm = this.fb.group({
    description: [''],
    start_date: [''],
    end_date: [''],
    target_sample_size: [null as number | null],
  }, { validators: [endDateNotBeforeStart] });

  zoneForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
    geofence_type: ['radius' as 'radius' | 'manzana_polygon' | 'custom_polygon'],
    target_lat: [null as number | null],
    target_lng: [null as number | null],
    radius_meters: [500],
    hierarchy_json: [null as any],
    geometry_json: [null as any],
    target_responses: [null as number | null],
    assigned_count: [null as number | null],
  });

  ngOnInit(): void {
    this.selectedFormId.set(this.route.snapshot.queryParamMap.get('form'));
    this.selectedTabIndex = this.authService.isSupervisor() ? 3
      : this.route.snapshot.queryParamMap.get('tab') === 'zones' ? 2
      : this.route.snapshot.queryParamMap.get('tab') === 'supervision' ? 3 : 0;
    this.loadProjects();
    if (this.canManageProjects()) {
      this.loadProjectLeaders();
    }
  }

  ngOnDestroy(): void {
    // Sin suscripciones de larga duración: la supervisión vive en su propio componente.
  }

  loadProjects(): void {
    this.loading.set(true);
    this.projectService.getProjects().subscribe({
      next: (projects) => {
        this.projects.set(projects);
        this.loading.set(false);
        if (projects.length > 0 && !this.selectedProject()) {
          const requestedProject = projects.find((project) => project.id === this.route.snapshot.queryParamMap.get('project'));
          this.selectProject(requestedProject ?? projects[0]);
        }
      },
      error: () => {
        this.snackBar.open(this.translate.instant('projects.errors.load'), this.translate.instant('common.buttons.close'), { duration: 3000 });
        this.loading.set(false);
      },
    });
  }

  loadProjectLeaders(): void {
    this.projectService.getProjectLeaders().subscribe({
      next: (leaders) => {
        this.projectLeaders.set(leaders.map((leader) => ({ id: leader.id, name: leader.name, email: leader.email })));
      },
    });
  }

  loadAllEnumerators(projectId: string): void {
    this.projectService.getAssignableUsers(projectId).subscribe({
      next: (users) => {
        this.assignableUsers.set(users);
      },
      error: () => { this.assignableUsers.set([]); },
    });
  }

  private loadCollectors(projectId: string): void {
    // Lista completa: la usa el selector de encuestadores de las zonas.
    this.projectService.getCollectors(projectId).subscribe({
      next: (collectors) => this.collectors.set(collectors),
      error: () => this.snackBar.open('No se pudieron cargar los encuestadores', 'Cerrar', { duration: 3500 }),
    });
    this.loadCollectorPage(projectId);
  }

  // --- Equipo de encuestadores: página visible, búsqueda y selección masiva ---
  collectorPageItems = signal<ProjectCollector[]>([]);
  collectorPagination = signal<{ current_page: number; last_page: number; per_page: number; total: number } | null>(null);
  collectorSearch = signal('');
  private collectorPageNumber = 1;
  private collectorSearchTimer: ReturnType<typeof setTimeout> | null = null;

  private loadCollectorPage(projectId: string): void {
    this.projectService.getCollectorPage(projectId, this.collectorPageNumber, this.collectorSearch()).subscribe({
      next: (page) => {
        // Si la página quedó vacía (por ejemplo tras quitar al último), volver a la anterior.
        if (!page.data.length && page.pagination.current_page > 1) {
          this.collectorPageNumber = page.pagination.last_page;
          this.loadCollectorPage(projectId);
          return;
        }
        this.collectorPageItems.set(page.data);
        this.collectorPagination.set(page.pagination);
      },
      error: () => this.snackBar.open('No se pudieron cargar los encuestadores', 'Cerrar', { duration: 3500 }),
    });
  }

  goToCollectorPage(page: number): void {
    const project = this.selectedProject();
    if (!project) return;
    this.collectorPageNumber = page;
    this.loadCollectorPage(project.id);
  }

  onCollectorSearch(event: Event): void {
    this.collectorSearch.set((event.target as HTMLInputElement).value);
    if (this.collectorSearchTimer) clearTimeout(this.collectorSearchTimer);
    this.collectorSearchTimer = setTimeout(() => this.goToCollectorPage(1), 300);
  }

  /** Selecciona a todos los encuestadores activos (todas las páginas), respetando la búsqueda. */
  selectAllCollectors(): void {
    const project = this.selectedProject();
    if (!project) return;
    this.collectorBusy.set(true);
    this.projectService.getCollectorIds(project.id, this.collectorSearch()).subscribe({
      next: (ids) => {
        this.collectorBusy.set(false);
        this.selectedCollectorIds.set(ids);
        this.snackBar.open(`${ids.length} encuestador(es) activo(s) seleccionados`, 'Cerrar', { duration: 3000 });
      },
      error: () => {
        this.collectorBusy.set(false);
        this.snackBar.open('No se pudo seleccionar a todos', 'Cerrar', { duration: 3500 });
      },
    });
  }

  selectCollectorPage(): void {
    const pageIds = this.collectorPageItems().filter((c) => c.is_active).map((c) => c.id);
    this.selectedCollectorIds.update((ids) => [...new Set([...ids, ...pageIds])]);
  }

  // --- Agregar usuarios existentes al equipo ---
  showAddExisting = signal(false);
  candidates = signal<CollectorCandidate[]>([]);
  candidateSearch = signal('');
  selectedCandidateIds = signal<number[]>([]);
  private candidateSearchTimer: ReturnType<typeof setTimeout> | null = null;

  toggleAddExisting(): void {
    this.showAddExisting.update((open) => !open);
    if (this.showAddExisting()) this.loadCandidates();
  }

  private loadCandidates(): void {
    const project = this.selectedProject();
    if (!project) return;
    this.projectService.getCollectorCandidates(project.id, this.candidateSearch()).subscribe({
      next: (users) => this.candidates.set(users),
      error: () => this.snackBar.open('No se pudieron buscar usuarios', 'Cerrar', { duration: 3500 }),
    });
  }

  onCandidateSearch(event: Event): void {
    this.candidateSearch.set((event.target as HTMLInputElement).value);
    if (this.candidateSearchTimer) clearTimeout(this.candidateSearchTimer);
    this.candidateSearchTimer = setTimeout(() => this.loadCandidates(), 300);
  }

  toggleCandidate(id: number): void {
    this.selectedCandidateIds.update((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  }

  addExistingCollectors(): void {
    const project = this.selectedProject();
    const ids = this.selectedCandidateIds();
    if (!project || !ids.length) return;
    this.collectorBusy.set(true);
    this.projectService.attachCollectors(project.id, ids).subscribe({
      next: (result) => {
        this.collectorBusy.set(false);
        this.selectedCandidateIds.set([]);
        this.loadCandidates();
        this.loadCollectors(project.id);
        this.snackBar.open(`${result.added} encuestador(es) agregados al proyecto`, 'Cerrar', { duration: 3000 });
      },
      error: (error) => {
        this.collectorBusy.set(false);
        this.snackBar.open(error?.error?.message || 'No se pudieron agregar los encuestadores', 'Cerrar', { duration: 4000 });
      },
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  downloadCollectorTemplate(): void {
    const project = this.selectedProject();
    if (!project) return;
    this.projectService.getCollectorTemplate(project.id).subscribe({
      next: (blob) => this.downloadBlob(blob, 'plantilla-encuestadores.xlsx'),
      error: () => this.snackBar.open('No se pudo descargar la plantilla', 'Cerrar', { duration: 3500 }),
    });
  }

  chooseCollectorFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    const project = this.selectedProject();
    if (!file || !project) return;
    this.collectorFile.set(file);
    this.collectorPreview.set([]);
    this.collectorCredentials.set([]);
    this.collectorBusy.set(true);
    this.projectService.importCollectors(project.id, file, true).subscribe({
      next: (result) => {
        this.collectorPreview.set(result.rows ?? []);
        this.collectorPreviewValid.set(!!result.valid);
        this.collectorBusy.set(false);
      },
      error: (error) => {
        this.collectorBusy.set(false);
        this.snackBar.open(error?.error?.message || 'No se pudo leer el archivo', 'Cerrar', { duration: 5000 });
      },
    });
    (event.target as HTMLInputElement).value = '';
  }

  confirmCollectorImport(): void {
    const project = this.selectedProject();
    const file = this.collectorFile();
    if (!project || !file || !this.collectorPreviewValid()) return;
    this.collectorBusy.set(true);
    this.projectService.importCollectors(project.id, file, false).subscribe({
      next: (result) => {
        this.collectorBusy.set(false);
        this.collectorCredentials.set(result.credentials ?? []);
        this.collectorPreview.set([]);
        this.collectorFile.set(null);
        this.loadCollectors(project.id);
        this.loadAllEnumerators(project.id);
        this.snackBar.open(`${result.imported} encuestador(es) importados`, 'Cerrar', { duration: 3500 });
      },
      error: (error) => {
        this.collectorBusy.set(false);
        this.snackBar.open(error?.error?.message || 'No se pudo importar', 'Cerrar', { duration: 5000 });
      },
    });
  }

  downloadCollectorCredentials(): void {
    const rows = [['Nombre', 'Correo', 'Contrasena temporal'], ...this.collectorCredentials().map((item) => [item.name, item.email, item.password])];
    const csv = '\uFEFF' + rows.map((row) => row.map((value) => {
      const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
      return `"${safe.replaceAll('"', '""')}"`;
    }).join(',')).join('\r\n');
    this.downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'credenciales-encuestadores.csv');
    this.collectorCredentials.set([]);
  }

  toggleCollectorSelection(id: number): void {
    this.selectedCollectorIds.update((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  }

  toggleCollectorFormSelection(id: string): void {
    this.selectedCollectorFormIds.update((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  }

  saveCollector(collector: ProjectCollector, name: string, email: string, cedula: string): void {
    const project = this.selectedProject();
    if (!project) return;
    this.projectService.updateCollector(project.id, collector.id, { name: name.trim(), email: email.trim(), cedula: cedula.trim() }).subscribe({
      next: () => { this.editingCollectorId.set(null); this.loadCollectors(project.id); this.snackBar.open('Encuestador actualizado', 'Cerrar', { duration: 3000 }); },
      error: (error) => this.snackBar.open(error?.error?.message || 'No se pudo actualizar', 'Cerrar', { duration: 4000 }),
    });
  }

  setCollectorActive(collector: ProjectCollector, active: boolean): void {
    const project = this.selectedProject();
    if (!project) return;
    this.projectService.updateCollector(project.id, collector.id, { is_active: active }).subscribe({
      next: () => { this.selectedCollectorIds.update((ids) => ids.filter((id) => id !== collector.id)); this.loadCollectors(project.id); },
      error: (error) => this.snackBar.open(error?.error?.message || 'No se pudo cambiar el estado', 'Cerrar', { duration: 4000 }),
    });
  }

  removeCollector(collector: ProjectCollector): void {
    const project = this.selectedProject();
    if (!project || !confirm(`¿Quitar a ${collector.name} de este proyecto?`)) return;
    this.projectService.removeCollector(project.id, collector.id).subscribe({
      next: () => { this.selectedCollectorIds.update((ids) => ids.filter((id) => id !== collector.id)); this.loadCollectors(project.id); this.selectProject(project); },
      error: (error) => this.snackBar.open(error?.error?.message || 'No se pudo quitar', 'Cerrar', { duration: 4000 }),
    });
  }

  assignCollectorForms(): void {
    const project = this.selectedProject();
    if (!project) return;
    this.collectorBusy.set(true);
    this.projectService.assignCollectorForms(project.id, this.selectedCollectorIds(), this.selectedCollectorFormIds()).subscribe({
      next: (result) => { this.collectorBusy.set(false); this.loadCollectors(project.id); this.selectProject(project); this.snackBar.open(`${result.assigned} asignación(es) nuevas`, 'Cerrar', { duration: 3500 }); },
      error: (error) => { this.collectorBusy.set(false); this.snackBar.open(error?.error?.message || 'No se pudieron asignar formularios', 'Cerrar', { duration: 4000 }); },
    });
  }

  selectProject(project: Project): void {
    const changedProject = this.selectedProject()?.id !== project.id;
    this.collectorFile.set(null);
    this.collectorPreview.set([]);
    if (changedProject) this.collectorCredentials.set([]);
    this.selectedCollectorIds.set([]);
    this.selectedCollectorFormIds.set([]);
    if (changedProject) {
      this.collectorPageNumber = 1;
      this.collectorSearch.set('');
      this.showAddExisting.set(false);
      this.selectedCandidateIds.set([]);
    }
    this.projectService.getProject(project.id).subscribe({
      next: (detail) => {
        this.selectedProject.set(detail);
        if (this.canAssignMembers()) this.loadCollectors(detail.id);
        else this.collectors.set([]);
        this.loadAllEnumerators(detail.id);
        this.loadTechnicalSheet(detail.id);
        const firstForm = detail.forms?.find((form) => form.id === this.selectedFormId()) ?? detail.forms?.[0];
        this.selectForm(firstForm?.id ?? null);
      },
      error: () => this.snackBar.open(this.translate.instant('projects.errors.loadProject'), this.translate.instant('common.buttons.close'), { duration: 3000 }),
    });
  }

  selectForm(formId: string | null): void {
    this.selectedFormId.set(formId);
    this.randomPreview.set(null);
    this.zones.set([]);
    if (!formId) return;
    const project = this.selectedProject();
    if (project) this.loadZones(project.id);
  }

  previewRandomAssignment(): void {
    const project = this.selectedProject();
    const formId = this.selectedFormId();
    if (!project || !formId) return;
    this.projectService.randomAssignZones(project.id, formId, this.randomCandidateIds(), null, true).subscribe({
      next: (result) => this.randomPreview.set(result),
      error: (err) => this.snackBar.open(err?.error?.message || 'No se pudo previsualizar la designación', 'Cerrar', { duration: 3500 }),
    });
  }

  confirmRandomAssignment(): void {
    const project = this.selectedProject();
    const formId = this.selectedFormId();
    const preview = this.randomPreview();
    if (!project || !formId || !preview) return;
    this.projectService.randomAssignZones(project.id, formId, this.randomCandidateIds(), preview.seed, false).subscribe({
      next: () => { this.randomPreview.set(null); this.loadZones(project.id); this.snackBar.open('Designación confirmada', 'Cerrar', { duration: 3000 }); },
      error: (err) => this.snackBar.open(err?.error?.message || 'No se pudo confirmar', 'Cerrar', { duration: 3500 }),
    });
  }

  publishSelectedForm(): void {
    const formId = this.selectedFormId();
    const project = this.selectedProject();
    if (!formId || !project) return;
    this.formService.deployForm(formId).subscribe({
      next: () => { this.snackBar.open('Encuesta publicada', 'Cerrar', { duration: 3000 }); this.selectProject(project); },
      error: (err) => this.snackBar.open(err?.error?.message || 'No se pudo publicar', 'Cerrar', { duration: 4000 }),
    });
  }

  selectFormAndSheet(formId: string): void {
    this.selectForm(formId);
    this.selectedTabIndex = 0;
  }

  /** Ficha técnica única del proyecto. */
  loadTechnicalSheet(projectId: string): void {
    this.projectService.getProjectTechnicalSheet(projectId).subscribe({
      next: (sheet) => {
        this.technicalSheet.set(sheet);
        this.editingSheet.set(!sheet.id);
        if (sheet) {
          this.technicalSheetForm.patchValue({
            description: sheet.description ?? '',
            start_date: sheet.start_date ?? '',
            end_date: sheet.end_date ?? '',
            target_sample_size: sheet.target_sample_size ?? null,
          });
        } else {
          this.technicalSheetForm.reset();
        }
      },
      error: () => {
        this.technicalSheet.set(null);
        this.editingSheet.set(true);
        this.technicalSheetForm.reset();
      },
    });
  }

  loadZones(projectId: string): void {
    this.projectService.getProjectZones(projectId, this.selectedFormId() ?? undefined).subscribe({
      next: (zones) => {
        this.zones.set(zones);
      },
      error: () => {
        this.zones.set([]);
      },
    });
  }

  saveProject(): void {
    if (this.projectForm.invalid || this.saving()) return;

    this.saving.set(true);
    const payload = {
      name: this.projectForm.value.name ?? '',
      description: this.projectForm.value.description ?? null,
      ...(this.canManageProjects() ? { leader_ids: this.projectForm.value.leader_ids ?? [] } : {}),
      ...(this.canAssignMembers() && this.editingProject() ? {
        delegate_ids: this.projectForm.value.delegate_ids ?? [],
        supervisor_ids: this.projectForm.value.supervisor_ids ?? [],
      } : {}),
    };
    const current = this.editingProject();
    const request = current
      ? this.projectService.updateProject(current.id, payload)
      : this.projectService.createProject(payload);

    request.subscribe({
      next: (project) => {
        this.snackBar.open(this.translate.instant(current ? 'projects.messages.updated' : 'projects.messages.created'), this.translate.instant('common.buttons.close'), {
          duration: 3000,
        });
        this.cancelEdit();
        this.loadProjects();
        this.selectProject(project);
        this.saving.set(false);
      },
      error: (error) => {
        this.snackBar.open(error?.error?.message || this.translate.instant('projects.errors.save'), this.translate.instant('common.buttons.close'), {
          duration: 3000,
        });
        this.saving.set(false);
      },
    });
  }

  saveTechnicalSheet(): void {
    const projectId = this.selectedProject()?.id;
    if (!projectId || this.savingSheet() || !this.editingSheet()) return;
    if (this.technicalSheetForm.invalid) {
      this.technicalSheetForm.markAllAsTouched();
      return;
    }

    this.savingSheet.set(true);
    const payload = {
      description: this.technicalSheetForm.value.description ?? null,
      start_date: this.technicalSheetForm.value.start_date ?? null,
      end_date: this.technicalSheetForm.value.end_date ?? null,
      target_sample_size: this.technicalSheetForm.value.target_sample_size ?? null,
    };

    this.projectService.saveProjectTechnicalSheet(projectId, payload).subscribe({
      next: (sheet) => {
        this.technicalSheet.set(sheet);
        this.editingSheet.set(false);
        this.savingSheet.set(false);
        this.snackBar.open('Ficha técnica guardada correctamente', this.translate.instant('common.buttons.close'), { duration: 3000 });
      },
      error: (err) => {
        this.savingSheet.set(false);
        this.snackBar.open(err?.error?.message || 'Error al guardar ficha técnica', this.translate.instant('common.buttons.close'), { duration: 3500 });
      },
    });
  }

  validateTechnicalSheet(): void {
    const projectId = this.selectedProject()?.id;
    if (!projectId || this.validatingSheet() || this.editingSheet()) return;

    this.validatingSheet.set(true);
    this.projectService.validateProjectTechnicalSheet(projectId).subscribe({
      next: (sheet) => {
        this.technicalSheet.set(sheet);
        this.validatingSheet.set(false);
        this.snackBar.open('Ficha técnica validada exitosamente', this.translate.instant('common.buttons.close'), { duration: 3000 });
      },
      error: (err) => {
        this.validatingSheet.set(false);
        this.snackBar.open(err?.error?.message || 'Debe definir fechas de inicio y fin para validar', this.translate.instant('common.buttons.close'), { duration: 3500 });
      },
    });
  }

  /** Fechas en edición por formulario (aún sin guardar). */
  formPeriodDrafts = signal<Record<string, { start_date: string; end_date: string }>>({});
  savingFormPeriodId = signal<string | null>(null);

  private savedFormPeriod(form: Form): { start_date: string; end_date: string } {
    return { start_date: (form.start_date ?? '').slice(0, 10), end_date: (form.end_date ?? '').slice(0, 10) };
  }

  formPeriodValue(form: Form, field: 'start_date' | 'end_date'): string {
    return (this.formPeriodDrafts()[form.id] ?? this.savedFormPeriod(form))[field];
  }

  setFormPeriod(form: Form, field: 'start_date' | 'end_date', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const current = this.formPeriodDrafts()[form.id] ?? this.savedFormPeriod(form);
    this.formPeriodDrafts.update((drafts) => ({ ...drafts, [form.id]: { ...current, [field]: value } }));
  }

  formPeriodDirty(form: Form): boolean {
    const draft = this.formPeriodDrafts()[form.id];
    const saved = this.savedFormPeriod(form);
    return !!draft && (draft.start_date !== saved.start_date || draft.end_date !== saved.end_date);
  }

  saveFormPeriod(form: Form): void {
    const draft = this.formPeriodDrafts()[form.id];
    const project = this.selectedProject();
    if (!draft || !project || this.savingFormPeriodId()) return;
    if (draft.start_date && draft.end_date && draft.end_date < draft.start_date) {
      this.snackBar.open('La fecha de fin no puede ser anterior a la fecha de inicio.', this.translate.instant('common.buttons.close'), { duration: 3500 });
      return;
    }
    this.savingFormPeriodId.set(form.id);
    this.formService.updateForm(form.id, { start_date: draft.start_date || null, end_date: draft.end_date || null }).subscribe({
      next: () => {
        this.savingFormPeriodId.set(null);
        this.formPeriodDrafts.update(({ [form.id]: _saved, ...rest }) => rest);
        this.snackBar.open(`Fechas de «${form.title}» guardadas.`, this.translate.instant('common.buttons.close'), { duration: 3000 });
        this.selectProject(project);
      },
      error: (err) => {
        this.savingFormPeriodId.set(null);
        this.snackBar.open(err?.error?.message || 'No se pudieron guardar las fechas.', this.translate.instant('common.buttons.close'), { duration: 4000 });
      },
    });
  }

  openCreateZoneForm(): void {
    this.editingZone.set(null);
    this.selectedEnumeratorIds.set([]);
    this.enumeratorSearchQuery.set('');
    this.zoneForm.reset({
      name: '',
      description: '',
      geofence_type: 'radius',
      target_lat: -0.95382,
      target_lng: -80.74561,
      radius_meters: 500,
      hierarchy_json: null,
      geometry_json: null,
      target_responses: null,
      assigned_count: null,
    });
    this.showZoneForm.set(true);
  }

  editZone(zone: ProjectZone): void {
    this.editingZone.set(zone);
    const assignedIds = (zone.assigned_users ?? []).map((u) => u.id);
    this.selectedEnumeratorIds.set(assignedIds);
    this.enumeratorSearchQuery.set('');

    this.zoneForm.patchValue({
      name: zone.name,
      description: zone.description ?? '',
      geofence_type: zone.geofence_type ?? 'radius',
      target_lat: zone.target_lat ?? null,
      target_lng: zone.target_lng ?? null,
      radius_meters: zone.radius_meters ?? 500,
      hierarchy_json: zone.hierarchy_json ?? null,
      geometry_json: zone.geometry_json ?? null,
      target_responses: zone.target_responses ?? null,
      assigned_count: zone.assigned_count ?? (assignedIds.length || null),
    });

    this.showZoneForm.set(true);
  }

  cancelZoneForm(): void {
    this.showZoneForm.set(false);
    this.editingZone.set(null);
    this.selectedEnumeratorIds.set([]);
    this.enumeratorSearchQuery.set('');
  }

  /** Cuota de encuestadores escrita en la zona (null = sin límite). */
  private zoneEnumeratorQuota(): number | null {
    const quota = Number(this.zoneForm.value.assigned_count);
    return Number.isFinite(quota) && quota > 0 ? Math.floor(quota) : null;
  }

  /** Marca los encuestadores visibles (respeta la búsqueda) sin pasar de la cuota de la zona. */
  selectAllEnumerators(): void {
    const current = this.selectedEnumeratorIds();
    const visible = this.filteredEnumerators().map((u) => u.id).filter((id) => !current.includes(id));
    const quota = this.zoneEnumeratorQuota();
    const room = quota === null ? visible.length : Math.max(0, quota - current.length);
    this.selectedEnumeratorIds.set([...current, ...visible.slice(0, room)]);
    if (visible.length > room) {
      this.snackBar.open(
        `Se seleccionaron ${current.length + room} encuestadores: es la cuota de la zona. Aumenta la cuota para incluir más.`,
        this.translate.instant('common.buttons.close'),
        { duration: 4000 },
      );
    }
  }

  clearSelectedEnumerators(): void {
    this.selectedEnumeratorIds.set([]);
  }

  onSearchEnumerator(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.enumeratorSearchQuery.set(val);
  }

  isEnumeratorSelected(userId: number): boolean {
    return this.selectedEnumeratorIds().includes(userId);
  }

  toggleEnumeratorSelection(userId: number, event?: Event): void {
    const current = this.selectedEnumeratorIds();
    if (current.includes(userId)) {
      this.selectedEnumeratorIds.set(current.filter((id) => id !== userId));
      return;
    }
    const quota = this.zoneEnumeratorQuota();
    if (quota !== null && current.length >= quota) {
      // Deshacer la marca del checkbox: la selección no cambió.
      if (event?.target instanceof HTMLInputElement) event.target.checked = false;
      this.snackBar.open(
        `La zona ya tiene su cuota de ${quota} encuestadores. Aumenta la cuota o quita a alguien.`,
        this.translate.instant('common.buttons.close'),
        { duration: 4000 },
      );
      return;
    }
    this.selectedEnumeratorIds.set([...current, userId]);
  }

  /** Manzanas de la zona en edición (zonas antiguas guardaban solo `manzana`). */
  zoneManzanaCodes(): string[] {
    const hierarchy = this.zoneForm.value.hierarchy_json as { manzana?: string; manzanas?: string[] } | null | undefined;
    if (this.zoneForm.value.geofence_type !== 'manzana_polygon' || !hierarchy) return [];
    if (Array.isArray(hierarchy.manzanas) && hierarchy.manzanas.length) return hierarchy.manzanas;
    return hierarchy.manzana ? [hierarchy.manzana] : [];
  }

  manzanaCount(zone: { hierarchy_json?: { manzana?: string; manzanas?: string[] } | null }): number {
    const hierarchy = zone.hierarchy_json;
    if (Array.isArray(hierarchy?.manzanas) && hierarchy.manzanas.length) return hierarchy.manzanas.length;
    return hierarchy?.manzana ? 1 : 0;
  }

  onGeofenceChange(event: GeofenceSelectionEvent): void {
    const isManzana = event.properties?.['geofence_type'] === 'manzana_polygon';
    this.zoneForm.patchValue({
      geofence_type: isManzana ? 'manzana_polygon' : 'radius',
      target_lat: event.target_lat,
      target_lng: event.target_lng,
      radius_meters: event.radius_meters || 500,
      hierarchy_json: event.hierarchy ?? null,
      geometry_json: event.properties?.['polygon_geometry'] ?? null,
    });
  }

  saveZone(): void {
    const project = this.selectedProject();
    const formId = this.selectedFormId();
    if (!project || !formId || this.zoneForm.invalid || this.savingZone()) return;

    this.savingZone.set(true);
    const val = this.zoneForm.value;
    const payload: ProjectZonePayload = {
      form_id: formId,
      name: val.name ?? '',
      description: val.description ?? null,
      geofence_type: val.geofence_type ?? 'radius',
      target_lat: val.target_lat ?? null,
      target_lng: val.target_lng ?? null,
      radius_meters: val.radius_meters ?? 500,
      hierarchy_json: val.hierarchy_json ?? null,
      geometry_json: val.geometry_json ?? null,
      target_responses: val.target_responses ?? null,
      assigned_count: val.assigned_count ?? (this.selectedEnumeratorIds().length || null),
      assigned_user_ids: this.selectedEnumeratorIds(),
    };

    const currentZone = this.editingZone();
    const req = currentZone
      ? this.projectService.updateProjectZone(project.id, currentZone.id!, payload)
      : this.projectService.createProjectZone(project.id, payload);

    req.subscribe({
      next: () => {
        this.savingZone.set(false);
        this.snackBar.open(currentZone ? 'Zona actualizada' : 'Zona creada exitosamente', this.translate.instant('common.buttons.close'), { duration: 3000 });
        this.cancelZoneForm();
        this.loadZones(project.id);
      },
      error: (err) => {
        this.savingZone.set(false);
        this.snackBar.open(err?.error?.message || 'Error al guardar zona', this.translate.instant('common.buttons.close'), { duration: 3500 });
      },
    });
  }

  deleteZone(zone: ProjectZone): void {
    const project = this.selectedProject();
    if (!project || !zone.id) return;

    const confirmed = window.confirm(`¿Estás seguro de eliminar la zona "${zone.name}"?`);
    if (!confirmed) return;

    this.projectService.deleteProjectZone(project.id, zone.id).subscribe({
      next: () => {
        this.snackBar.open('Zona eliminada correctamente', this.translate.instant('common.buttons.close'), { duration: 3000 });
        this.loadZones(project.id);
      },
      error: (err) => {
        this.snackBar.open(err?.error?.message || 'Error al eliminar zona', this.translate.instant('common.buttons.close'), { duration: 3500 });
      },
    });
  }

  editProject(project: Project): void {
    this.editingProject.set(project);
    this.projectForm.patchValue({
      name: project.name,
      description: project.description ?? '',
      leader_ids: (project.leaders ?? []).map((leader) => leader.id),
      delegate_ids: (project.delegates ?? []).map((user) => user.id),
      supervisor_ids: (project.supervisors ?? []).map((user) => user.id),
    });
  }

  cancelEdit(): void {
    this.editingProject.set(null);
    this.projectForm.reset({
      name: '',
      description: '',
      leader_ids: [],
      delegate_ids: [],
      supervisor_ids: [],
    });
  }

  canCreateFormsInProject(project: Project): boolean {
    const id = this.authService.user()?.id;
    return this.authService.isAdmin() || !!project.leaders?.some((user) => user.id === id)
      || !!project.delegates?.some((user) => user.id === id);
  }

  openNewFormModal(project: Project): void {
    this.newFormProjectId.set(project.id);
    this.newFormProjectName.set(project.name);
    this.newFormForm.reset({
      title: '',
      description: '',
      start_date: '',
      end_date: '',
      require_consent: true,
      consent_text:
        'Buenos días/tardes. Somos de la Universidad Laica Eloy Alfaro de Manabí (ULEAM). Estamos realizando una investigación académica y comunitaria. Su participación es completamente voluntaria y sus respuestas serán tratadas de manera anónima y confidencial. ¿Acepta participar en esta encuesta?',
    });
    this.showNewFormModal.set(true);
  }

  closeNewFormModal(): void {
    this.showNewFormModal.set(false);
  }

  submitNewForm(): void {
    if (this.newFormForm.invalid) {
      this.newFormForm.markAllAsTouched();
      return;
    }
    const projectId = this.newFormProjectId();
    if (!projectId) return;

    const raw = this.newFormForm.getRawValue();

    if (raw.start_date && raw.end_date && raw.start_date > raw.end_date) {
      this.snackBar.open('La fecha de fin no puede ser anterior a la fecha de inicio', this.translate.instant('common.buttons.close'), { duration: 3500 });
      return;
    }

    this.savingNewForm.set(true);
    this.formService
      .createForm({
        title: (raw.title || '').trim(),
        description: (raw.description || '').trim() || undefined,
        project_id: projectId,
        step_by_step: true,
        start_date: raw.start_date || null,
        end_date: raw.end_date || null,
        require_consent: true,
        consent_text: (raw.consent_text || '').trim(),
      })
      .subscribe({
        next: (createdForm) => {
          this.savingNewForm.set(false);
          this.showNewFormModal.set(false);
          this.snackBar.open(
            this.technicalSheet()?.status === 'VALIDATED'
              ? 'Formulario creado en borrador.'
              : 'Formulario creado en borrador. Complete y valide la ficha técnica del proyecto para editar sus preguntas.',
            this.translate.instant('common.buttons.close'),
            { duration: 3500 },
          );
          this.selectedFormId.set(createdForm.id);
          this.selectedTabIndex = 0;
          const project = this.selectedProject();
          if (project) this.selectProject(project);
        },
        error: (err) => {
          this.savingNewForm.set(false);
          this.snackBar.open(err?.error?.message || 'Error al crear el formulario', this.translate.instant('common.buttons.close'), { duration: 3500 });
        },
      });
  }

  deleteProject(project: Project): void {
    if (!this.canDeleteProjects()) {
      return;
    }

    const confirmed = window.confirm('Estas seguro que quieres eliminar el proyecto ?');
    if (!confirmed) {
      return;
    }

    this.projectService.deleteProject(project.id).subscribe({
      next: () => {
        this.snackBar.open('Proyecto eliminado exitosamente', this.translate.instant('common.buttons.close'), { duration: 3000 });

        if (this.selectedProject()?.id === project.id) {
          this.selectedProject.set(null);
        }

        this.cancelEdit();
        this.loadProjects();
      },
      error: (error) => {
        this.snackBar.open(error?.error?.message || 'No se pudo eliminar el proyecto', this.translate.instant('common.buttons.close'), {
          duration: 3500,
        });
      },
    });
  }

  roleLabel(role: string): string {
    const labels: Record<string, string> = {
      PROJECT: this.translate.instant('projects.roles.PROJECT'),
      EDITOR: this.translate.instant('projects.roles.PROJECT'),
      RECOLECTOR: this.translate.instant('projects.roles.RECOLECTOR'),
      DELEGADO: 'Delegado',
      SUPERVISOR: 'Supervisor',
    };

    return labels[role] ?? role;
  }

  formStateLabel(state: string): string {
    const labels: Record<string, string> = {
      DRAFT: this.translate.instant('projects.formStates.DRAFT'),
      DEPLOYED: this.translate.instant('projects.formStates.DEPLOYED'),
      ARCHIVED: this.translate.instant('projects.formStates.ARCHIVED'),
    };

    return labels[state] ?? state;
  }

  scopeLabel(scope: ProjectMember['scope']): string {
    const labels: Record<string, string> = {
      Proyecto: this.translate.instant('projects.scopes.project'),
      Formulario: this.translate.instant('projects.scopes.form'),
    };

    return labels[scope] ?? scope;
  }
}
