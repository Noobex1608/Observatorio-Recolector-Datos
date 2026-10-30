import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DbService, SavedResponse } from '../db.service';
import { ThemeService } from '../theme.service';
import { TranslatePipe } from '../translate.pipe';

@Component({
  selector: 'app-borradores',
  imports: [CommonModule, TranslatePipe],
  templateUrl: './borradores.component.html',
  styleUrls: ['./borradores.component.css']
})
export class BorradoresComponent implements OnInit {
  private db = inject(DbService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  theme = inject(ThemeService);

  borradores: SavedResponse[] = [];
  cargando = true;

  ngOnInit(): void {
    void this.inicializar();
  }

  private async inicializar(): Promise<void> {
    this.borradores = await this.db.responses
      .where('estado')
      .equals('borrador')
      .toArray();
    this.cargando = false;
    this.cdr.detectChanges();
  }

  continuar(form: SavedResponse) {
    void this.router.navigate(['/llenar', form.formId], { queryParams: { continue: 'true' } });
  }

  async eliminar(id: number | undefined) {
    if (id === undefined) return;
    if (!confirm('¿Eliminar este borrador?')) return;
    await this.db.transaction('rw', this.db.responses, this.db.mediaBlobs, async () => {
      await this.db.responses.delete(id);
      await this.db.mediaBlobs.where('responseId').equals(id).delete();
    });
    this.borradores = await this.db.responses
      .where('estado')
      .equals('borrador')
      .toArray();
    this.cdr.detectChanges();
  }

  volver() {
    void this.router.navigate(['/']);
  }
}
