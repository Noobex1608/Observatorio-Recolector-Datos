import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
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
import { FormService } from '@core/services/form.service';
import { FieldMonitor, Project, ProjectMember, ProjectService, ProjectTechnicalSheet, ProjectZone, ProjectZonePayload } from '@core/services/project.service';
import { GpsResultsMapComponent } from '../forms/responses/gps-results-map.component';
import { MapGeofenceSelectorComponent, GeofenceSelectionEvent } from '@shared/components/map-geofence-selector/map-geofence-selector.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [
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
    GpsResultsMapComponent,
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
              <mat-card-header class="panel-header">
                <div>
                  <mat-card-title>{{ project.name }}</mat-card-title>
                  <mat-card-subtitle>{{ 'projects.formsCount' | translate: { count: project.forms?.length ?? project.forms_count ?? 0 } }}</mat-card-subtitle>
                </div>
                @if (technicalSheet(); as sheet) {
                  <span class="status-badge" [class]="sheet.status.toLowerCase()">
                    <mat-icon>{{ sheet.status === 'VALIDATED' ? 'verified' : 'pending_actions' }}</mat-icon>
                    {{ 'projects.technicalSheet.statuses.' + sheet.status | translate }}
                  </span>
                }
              </mat-card-header>

              <mat-card-content class="panel-content">
                <mat-tab-group animationDuration="200ms" [(selectedIndex)]="selectedTabIndex">
                  <!-- PESTAÑA 1: FICHA TÉCNICA POR FORMULARIO -->
                  <mat-tab>
                    <ng-template mat-tab-label>
                      <mat-icon class="tab-icon">assignment_turned_in</mat-icon>
                      Ficha Técnica
                    </ng-template>

                    <div class="tab-body">
                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>Formulario de esta ficha técnica</mat-label>
                        <mat-select [value]="selectedFormId()" (selectionChange)="selectForm($event.value)">
                          @for (form of project.forms ?? []; track form.id) {
                            <mat-option [value]="form.id">{{ form.title }}</mat-option>
                          }
                        </mat-select>
                      </mat-form-field>
                      @if (canCreateFormsInProject(project)) {
                        <button mat-stroked-button type="button" (click)="openNewFormModal(project)">
                          <mat-icon>add_circle</mat-icon> Iniciar ficha de una nueva encuesta
                        </button>
                      }
                      @if (selectedFormId()) {
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
                              <input matInput type="date" formControlName="end_date" />
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

                          @if (!editingSheet() && selectedForm()?.state !== 'DEPLOYED' && canEditSelectedProject()) {
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
                          @if (technicalSheet()?.status === 'VALIDATED') {
                            <a mat-flat-button color="primary" [routerLink]="['/admin/forms', selectedFormId(), 'edit']">Continuar al formulario</a>
                          }
                        </div>
                      </form>
                      } @else { <p>Inicia una encuesta para completar su ficha técnica.</p> }
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
                            <a class="form-item" [routerLink]="form.technical_sheet?.status === 'VALIDATED' || form.state === 'DEPLOYED' ? ['/admin/forms', form.id, 'edit'] : null" (click)="form.technical_sheet?.status !== 'VALIDATED' && form.state !== 'DEPLOYED' ? selectFormAndSheet(form.id) : null">
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
                          <p>La ficha técnica de este formulario debe estar validada antes de delimitar zonas.</p>
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
                                    Asignar Encuestadores Especificos ({{ selectedEnumeratorIds().length }} seleccionados de {{ allEnumerators().length }})
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
                                      <button mat-icon-button matSuffix (click)="enumeratorSearchQuery.set('')" type="button">
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
                                        (change)="toggleEnumeratorSelection(enumUser.id)"
                                      />
                                      <span>{{ enumUser.name }} <small class="muted">({{ enumUser.email }})</small></span>
                                    </label>
                                  } @empty {
                                    <p class="muted">No se encontraron encuestadores con la búsqueda realizada.</p>
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
                                  {{ zone.geofence_type === 'manzana_polygon' ? 'Polígono INEC' : ('Radio GPS (' + zone.radius_meters + 'm)') }}
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
                        <mat-form-field appearance="outline" class="full-width">
                          <mat-label>Encuesta a supervisar</mat-label>
                          <mat-select [value]="selectedFormId()" (selectionChange)="selectForm($event.value)">
                            @for (form of project.forms ?? []; track form.id) { <mat-option [value]="form.id">{{ form.title }}</mat-option> }
                          </mat-select>
                        </mat-form-field>
                        <button mat-stroked-button type="button" (click)="loadMonitor()">Actualizar posiciones</button>
                        @if (monitor(); as data) {
                          <p>Se muestran la última ubicación reportada y la hora de cada encuestador. Una posición antigua no indica presencia actual.</p>
                          <app-gps-results-map [points]="monitorPoints()" [zones]="monitorZones()" />
                          @for (collector of data.collectors; track collector.id) {
                            <p><strong>{{ collector.name }}</strong> — {{ collector.active ? 'Jornada activa' : 'Jornada inactiva' }} ·
                              @if (collector.last_position) {
                                X: {{ collector.last_position.longitude }} · Y: {{ collector.last_position.latitude }} ·
                                {{ collector.last_position.recorded_at | date:'dd/MM/yyyy HH:mm:ss' }}
                              } @else { Sin posición reportada }
                            </p>
                          }
                        }
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
        <div class="modal-backdrop" (click)="closeNewFormModal()">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <header class="modal-header">
              <div class="modal-header-icon">
                <mat-icon>assignment_add</mat-icon>
              </div>
              <div class="modal-header-text">
                <h3>Nuevo Formulario de Recolección</h3>
                <p>Proyecto: <strong>{{ newFormProjectName() }}</strong></p>
              </div>
              <button type="button" class="close-icon-btn" (click)="closeNewFormModal()">
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

              <p>El formulario se creará en borrador. Primero completarás la ficha técnica; el líder deberá validarla antes de editar preguntas.</p>

              <footer class="modal-actions">
                <button mat-button type="button" (click)="closeNewFormModal()" [disabled]="savingNewForm()">
                  Cancelar
                </button>
                <button mat-flat-button color="primary" type="submit" [disabled]="savingNewForm() || newFormForm.invalid">
                  <mat-icon>arrow_forward</mat-icon>
                  <span>{{ savingNewForm() ? 'Creando formulario...' : 'Continuar a Ficha Técnica' }}</span>
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
          linear-gradient(180deg, rgba(15, 118, 110, 0.04), transparent 280px),
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
        color: var(--primary-600);
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
        color: var(--primary-600);
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
        color: var(--primary-700);
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
        align-items: center;
        padding: 1.2rem 1.5rem 0.5rem;
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
        color: #059669;
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

      .sheet-banner {
        display: flex;
        align-items: flex-start;
        gap: 0.85rem;
        padding: 1rem;
        border-radius: var(--radius-md);
        background: var(--primary-50, rgba(15, 118, 110, 0.08));
        border: 1px solid var(--primary-200, rgba(15, 118, 110, 0.2));
        color: var(--text-primary);
      }

      .sheet-banner.validated {
        background: rgba(16, 185, 129, 0.08);
        border-color: rgba(16, 185, 129, 0.3);
      }

      .sheet-banner mat-icon {
        color: var(--primary-600);
      }

      .sheet-fields {
        display: grid;
        gap: 1rem;
      }

      .full-width {
        width: 100%;
      }

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
        color: var(--primary-600);
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
  allEnumerators = signal<Array<{ id: number; name: string; email: string; rol: string }>>([]);
  assignableUsers = signal<Array<{ id: number; name: string; email: string; rol: string }>>([]);
  selectedProject = signal<Project | null>(null);
  technicalSheet = signal<ProjectTechnicalSheet | null>(null);
  selectedFormId = signal<string | null>(null);
  selectedForm = computed(() => this.selectedProject()?.forms?.find((form) => form.id === this.selectedFormId()) ?? null);
  randomCandidateIds = signal<number[]>([]);
  randomPreview = signal<{ seed: string; assignments: Record<string, number[]> } | null>(null);
  monitor = signal<FieldMonitor | null>(null);
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  monitorPoints = computed(() => (this.monitor()?.collectors ?? []).flatMap((collector) => collector.last_position ? [{
    responseId: String(collector.id), question: collector.name,
    latitude: collector.last_position.latitude, longitude: collector.last_position.longitude,
    accuracy: collector.last_position.accuracy_meters,
  }] : []));
  monitorZones = computed(() => (this.monitor()?.zones ?? []).map((zone) => ({
    id: zone.id, name: zone.name, target_lat: zone.target_lat, target_lng: zone.target_lng,
    radius_meters: zone.radius_meters, geometry_json: zone.geometry_json,
  })));
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
  });

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
      : this.route.snapshot.queryParamMap.get('tab') === 'zones' ? 2 : 0;
    this.monitorTimer = setInterval(() => { if (this.selectedTabIndex === 3) this.loadMonitor(); }, 15000);
    this.loadProjects();
    if (this.canManageProjects()) {
      this.loadProjectLeaders();
    }
  }

  ngOnDestroy(): void {
    if (this.monitorTimer) clearInterval(this.monitorTimer);
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
        this.allEnumerators.set(users.filter((user) => user.rol === 'RECOLECTOR'));
      },
      error: () => { this.assignableUsers.set([]); this.allEnumerators.set([]); },
    });
  }

  selectProject(project: Project): void {
    this.projectService.getProject(project.id).subscribe({
      next: (detail) => {
        this.selectedProject.set(detail);
        this.loadAllEnumerators(detail.id);
        const firstForm = detail.forms?.find((form) => form.id === this.selectedFormId()) ?? detail.forms?.[0];
        this.selectForm(firstForm?.id ?? null);
        if (this.selectedTabIndex === 3) this.loadMonitor();
      },
      error: () => this.snackBar.open(this.translate.instant('projects.errors.loadProject'), this.translate.instant('common.buttons.close'), { duration: 3000 }),
    });
  }

  selectForm(formId: string | null): void {
    this.selectedFormId.set(formId);
    this.randomPreview.set(null);
    this.technicalSheet.set(null);
    this.zones.set([]);
    if (!formId) return;
    this.loadTechnicalSheet(formId);
    const project = this.selectedProject();
    if (project) this.loadZones(project.id);
    if (this.selectedTabIndex === 3) this.loadMonitor();
  }

  loadMonitor(): void {
    const project = this.selectedProject();
    const formId = this.selectedFormId();
    if (!project || !formId) return;
    this.projectService.getMonitor(project.id, formId).subscribe({
      next: (data) => this.monitor.set(data),
      error: () => this.monitor.set(null),
    });
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

  loadTechnicalSheet(formId: string): void {
    this.projectService.getFormTechnicalSheet(formId).subscribe({
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
    const formId = this.selectedFormId();
    if (!formId || this.savingSheet() || !this.editingSheet()) return;

    this.savingSheet.set(true);
    const payload = {
      description: this.technicalSheetForm.value.description ?? null,
      start_date: this.technicalSheetForm.value.start_date ?? null,
      end_date: this.technicalSheetForm.value.end_date ?? null,
      target_sample_size: this.technicalSheetForm.value.target_sample_size ?? null,
    };

    this.projectService.saveFormTechnicalSheet(formId, payload).subscribe({
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
    const formId = this.selectedFormId();
    if (!formId || this.validatingSheet() || this.editingSheet()) return;

    this.validatingSheet.set(true);
    this.projectService.validateFormTechnicalSheet(formId).subscribe({
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

  selectAllEnumerators(): void {
    const allIds = this.allEnumerators().map((u) => u.id);
    this.selectedEnumeratorIds.set(allIds);
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

  toggleEnumeratorSelection(userId: number): void {
    const current = this.selectedEnumeratorIds();
    if (current.includes(userId)) {
      this.selectedEnumeratorIds.set(current.filter((id) => id !== userId));
    } else {
      this.selectedEnumeratorIds.set([...current, userId]);
    }
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
        start_date: null,
        end_date: null,
        require_consent: true,
        consent_text: (raw.consent_text || '').trim(),
      })
      .subscribe({
        next: (createdForm) => {
          this.savingNewForm.set(false);
          this.showNewFormModal.set(false);
          this.snackBar.open('Formulario guardado en borrador. Complete su ficha técnica.', this.translate.instant('common.buttons.close'), { duration: 3000 });
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
