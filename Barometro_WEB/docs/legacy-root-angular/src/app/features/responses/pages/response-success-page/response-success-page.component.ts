import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-response-success-page',
  imports: [RouterLink],
  template: `
    <section class="success-page">
      <h2>Respuesta enviada</h2>
      <p>Tu encuesta se registró correctamente. Gracias por participar.</p>
      <a routerLink="/dashboard">Ir al tablero</a>
    </section>
  `,
  styles: `
    .success-page {
      display: grid;
      gap: 0.8rem;
      max-width: 560px;
      margin: 2rem auto;
      padding: 1rem;
      border: 1px solid #dbe2ea;
      border-radius: 0.75rem;
      background: #fff;
    }
  `,
})
export class ResponseSuccessPageComponent {}
