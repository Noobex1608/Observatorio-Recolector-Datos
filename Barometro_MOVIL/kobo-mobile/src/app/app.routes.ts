import { Routes } from '@angular/router';
import { InicioComponent } from './inicio/inicio.component';
import { ListaEncuestasComponent } from './lista-encuestas/lista-encuestas.component';
import { ListoParaEnviarComponent } from './listo-para-enviar/listo-para-enviar.component';
import { LlenarEncuestaComponent } from './llenar-encuesta/llenar-encuesta.component';
import { LoginComponent } from './login/login.component';
import { AjustesComponent } from './ajustes/ajustes.component';
import { PerfilComponent } from './perfil/perfil.component';
import { BorradoresComponent } from './borradores/borradores.component';
import { EnviadosComponent } from './enviados/enviados.component';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', component: InicioComponent, canActivate: [authGuard] },
  { path: 'lista', component: ListaEncuestasComponent, canActivate: [authGuard] },
  { path: 'listo-para-enviar', component: ListoParaEnviarComponent, canActivate: [authGuard] },
  { path: 'llenar/:id', component: LlenarEncuestaComponent, canActivate: [authGuard] },
  { path: 'borradores', component: BorradoresComponent, canActivate: [authGuard] },
  { path: 'enviados', component: EnviadosComponent, canActivate: [authGuard] },
  { path: 'ajustes', component: AjustesComponent, canActivate: [authGuard] },
  { path: 'perfil', component: PerfilComponent, canActivate: [authGuard] }
];
