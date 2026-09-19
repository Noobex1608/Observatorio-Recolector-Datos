# Sistema de Diseno

Guia visual vigente para la plataforma de formularios del Observatorio ULEAM.

## Personalidad visual

La aplicacion es una herramienta operativa: debe sentirse clara, densa y facil de escanear. Evitar pantallas tipo landing cuando el usuario necesita trabajar con formularios, respuestas o usuarios.

## Paleta

| Token | Valor | Uso |
| --- | --- | --- |
| ULEAM red | `#C8102E` | Marca, estados criticos seleccionados |
| Primary indigo | `#6366F1` | Acciones principales, foco |
| Success | `#16A34A` | Estados correctos |
| Warning | `#D97706` | Alertas no bloqueantes |
| Danger | `#DC2626` | Errores y acciones destructivas |
| Surface | `#FFFFFF` / `#111827` | Fondos segun tema |

## Layout

- Sidebar y header para areas autenticadas.
- Contenido principal con ancho fluido y espaciado consistente.
- Cards solo para elementos repetidos, modales o paneles realmente enmarcados.
- Evitar cards dentro de cards.

## Formularios

- Inputs con labels visibles.
- Botones con icono cuando la accion sea comun: guardar, eliminar, mover, compartir, exportar.
- Estados de carga y error visibles cerca de la accion que los produce.
- Validaciones claras, sin textos largos explicativos dentro de la interfaz.

## Builder

- La pregunta seleccionada debe ser evidente.
- Reordenamiento con controles estables.
- Opciones editables para preguntas de seleccion.
- Vista previa dentro del mismo flujo, sin ocultar acciones principales.

## Dashboard

- Priorizar busqueda, estados y acciones rapidas.
- Estados principales: borrador, implementado, archivado.
- El enlace publico solo tiene sentido en formularios implementados.

## Respuestas

- Tablas compactas y exportacion visible.
- Graficos simples para lectura rapida.
- No depender de visualizaciones antiguas del observatorio.

## Tema

`ThemeService` controla tema claro/oscuro. Los componentes deben usar variables CSS globales y no colores hardcodeados salvo tokens de marca.

## Archivos relevantes

- `frontend/src/styles.css`
- `frontend/src/material-theme.scss`
- `frontend/src/app/core/services/theme.service.ts`
- `frontend/src/app/shared/components/layout/`

Ultima actualizacion: junio 2026.
