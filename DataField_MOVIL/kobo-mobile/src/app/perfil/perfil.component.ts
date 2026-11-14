import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { AuthService } from '../auth.service';
import { ThemeService } from '../theme.service';
import { ToastService } from '../toast.service';
import { TranslatePipe } from '../translate.pipe';
import { ApiService } from '../api.service';

@Component({
  selector: 'app-perfil',
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './perfil.component.html',
  styleUrls: ['./perfil.component.css']
})
export class PerfilComponent implements OnInit {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private router = inject(Router);
  private location = inject(Location);
  private cdr = inject(ChangeDetectorRef);
  private toast = inject(ToastService);
  theme = inject(ThemeService);

  nombre = '';
  email = '';
  telefono = '';
  cargo = '';
  bio = '';
  guardando = false;
  cargando = true;

  ngOnInit() {
    this.nombre = this.auth.obtenerUsuario() || '';
    this.email = this.auth.obtenerEmail() || '';
    this.cargando = false;
  }

  regresar() {
    this.location.back();
  }

  async guardar() {
    if (!this.nombre.trim()) {
      this.toast.show('El nombre es obligatorio.');
      return;
    }
    this.guardando = true;
    this.cdr.detectChanges();
    try {
      const servidor = this.auth.obtenerUrlServidor();
      if (!servidor) {
        this.toast.show('No hay servidor configurado.');
        this.guardando = false;
        this.cdr.detectChanges();
        return;
      }
      await this.api.updateProfile(servidor, {
        name: this.nombre,
        telefono: this.telefono,
        cargo: this.cargo,
        bio: this.bio,
      });
      this.auth.actualizarUsuario(this.nombre);
      this.toast.show('Perfil actualizado.');
      this.location.back();
    } catch (e: any) {
      this.toast.show('Error al guardar: ' + (e?.message || 'desconocido'));
    }
    this.guardando = false;
    this.cdr.detectChanges();
  }
}
