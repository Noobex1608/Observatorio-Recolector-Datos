# Sistema de diseño

Guía visual vigente del panel web de **ULEAM DataField**. La referencia completa (tokens, componentes y reglas) está en [`DESIGN.md`](../../DESIGN.md), en la raíz del repositorio; el contexto de producto, en [`PRODUCT.md`](../../PRODUCT.md). Si esta guía y `DESIGN.md` difieren, manda `DESIGN.md`.

## Idea guía: "La libreta de campo"

Una herramienta de trabajo institucional: clara, densa y fácil de escanear, con papel azulado, tinta azul marino y reglas finas. Evitar pantallas tipo vitrina o landing cuando el usuario necesita trabajar con proyectos, formularios, respuestas o usuarios.

## Paleta

Valores de `frontend/src/styles.css` (tema claro). Cada token tiene su equivalente en el tema oscuro.

| Token | Valor | Uso |
| --- | --- | --- |
| Azul institucional `--primary-600` | `#0059a8` | Único color de acción: botones principales, enlaces, foco, selección |
| Azul profundo `--primary-700` | `#005689` | Hover de la acción principal, texto sobre fondos azules |
| Bruma azul `--primary-50` | `#eef7ff` | Elemento activo, selección, chips |
| Rojo ULEAM `--uleam-red` | `#bc1421` | Solo marca, errores y acciones destructivas |
| Verde `--success-color` | `#16805c` | Éxito, dentro de zona, implementado |
| Ámbar `--warning-color` | `#a16207` | Advertencias, borradores, GPS impreciso |
| Papel azulado `--bg-primary` | `#f1f6fb` | Fondo de la aplicación |
| Papel blanco `--card-bg` | `#ffffff` | Tarjetas y paneles |
| Tinta `--text-primary` | `#172b44` | Texto principal |
| Pizarra `--text-secondary` | `#4e6277` | Texto secundario |
| Regla `--card-border` | `#dce7f1` | Bordes y divisores |

- El azul es el único color de acción; el rojo cuesta: no usarlo en acciones normales.
- Los neutros llevan tinte azul; no introducir grises puros.
- No usar colores fijos en los componentes: usar las variables CSS para que funcionen en claro y oscuro.

## Tipografía

- **Inter** en toda la interfaz, incluidos botones, campos, pestañas y menús de Angular Material. Se carga desde Google Fonts en `frontend/src/index.html` (pesos 400, 500, 600 y 700) y se expone como `--font-sans`.
- `styles.css` apunta las variables de fuente de Material (`--mat-*-font`) a `--font-sans`, y `material-theme.scss` usa la misma familia. Para un componente nuevo de Material que siga en Roboto, añadir su variable de fuente ahí.
- La jerarquía sale del peso (700 en títulos, 600 en controles) y del tamaño, no de una segunda fuente.

## Superficies y formas

- Plano con bordes de 1px. Sombra suave solo en paneles destacados (por ejemplo, el editor de proyecto) y al pasar el cursor sobre la acción principal.
- Esquinas de 8px en botones, campos y tarjetas; pastillas solo para estados y contadores.
- No anidar tarjetas dentro de tarjetas.

## Layout

- Barra lateral y cabecera en las áreas autenticadas; contenido de ancho fluido.
- Páginas de gestión con lista y detalle; pasan a una columna en pantallas medianas.
- Editores con bloques titulados; al abrir uno, desplazar la página hasta él y enfocar el primer campo, y devolver el foco al cerrarlo.

## Formularios

- Etiquetas visibles en todos los campos.
- Botones con icono cuando la acción sea común: guardar, eliminar, mover, compartir, exportar.
- Estados de carga y error junto a la acción que los produce; los errores dicen cómo corregir.
- Personas en selectores con nombre y correo completos (dos líneas o chips), nunca truncados.

## Builder

- La pregunta seleccionada debe ser evidente.
- Reordenamiento con controles estables.
- Opciones editables para preguntas de selección.
- Vista previa dentro del mismo flujo, sin ocultar acciones principales.

## Dashboard

- Priorizar búsqueda, estados y acciones rápidas.
- Estados: Borrador, Implementado (`DEPLOYED`) y Archivado.
- El enlace público solo tiene sentido en formularios implementados.

## Respuestas

- Tablas compactas y exportación visible.
- Gráficos simples para lectura rápida.

## Accesibilidad

- WCAG 2.1 nivel AA: contraste suficiente en ambos temas, foco de teclado visible, objetivos táctiles de al menos 44px en la PWA y respeto de `prefers-reduced-motion`.

## Tema

`ThemeService` controla tema claro y oscuro (clase `.dark`). Todo color nuevo se define en ambos temas.

## Archivos relevantes

- `frontend/src/styles.css` (tokens, tema oscuro y ajustes de Material)
- `frontend/src/material-theme.scss`
- `frontend/src/index.html` (carga de Inter)
- `frontend/src/app/core/services/theme.service.ts`
- `frontend/src/app/shared/components/layout/`
- `DESIGN.md` y `.impeccable/design.json` (raíz del repositorio)

Última actualización: noviembre de 2026.
