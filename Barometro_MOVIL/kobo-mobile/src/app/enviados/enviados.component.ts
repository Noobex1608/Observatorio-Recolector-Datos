import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DbService, SavedResponse } from '../db.service';
import { ThemeService } from '../theme.service';
import { ToastService } from '../toast.service';
import { TranslatePipe } from '../translate.pipe';

@Component({
  selector: 'app-enviados',
  imports: [CommonModule, TranslatePipe],
  templateUrl: './enviados.component.html',
  styleUrls: ['./enviados.component.css']
})
export class EnviadosComponent implements OnInit {
  private db = inject(DbService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private toast = inject(ToastService);
  theme = inject(ThemeService);

  enviados: SavedResponse[] = [];
  cargando = true;

  async ngOnInit() {
    await this.cargarEnviados();
  }

  async cargarEnviados() {
    this.enviados = await this.db.responses
      .where('estado')
      .equals('enviado')
      .toArray();
    this.cargando = false;
    this.cdr.detectChanges();
  }

  async borrarTodos() {
    if (this.enviados.length === 0) return;
    if (!confirm('¿Eliminar todas las notificaciones de envíos?')) return;

    const ids = this.enviados.map(e => e.id).filter((id): id is number => id !== undefined);
    await this.db.responses.bulkDelete(ids);
    await this.cargarEnviados();
    this.toast.show('Notificaciones de envíos eliminadas.');
  }

  volver() {
    this.router.navigate(['/']);
  }
}
