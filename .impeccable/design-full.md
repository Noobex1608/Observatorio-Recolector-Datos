---
name: ULEAM DataField
description: Libreta de campo institucional para diseñar formularios, recolectar en territorio y analizar datos de la ULEAM.
colors:
  institutional-blue: "#0059a8"
  institutional-blue-deep: "#005689"
  institutional-blue-ink: "#004499"
  institutional-blue-sky: "#46a4ff"
  institutional-blue-mid: "#167cca"
  blue-mist: "#eef7ff"
  blue-haze: "#dceeff"
  navy-night: "#082f59"
  uleam-red: "#bc1421"
  uleam-red-dark: "#8f101a"
  field-green: "#16805c"
  amber-ochre: "#a16207"
  paper-blue: "#f1f6fb"
  paper-white: "#ffffff"
  input-wash: "#f8fbff"
  ink-navy: "#172b44"
  slate-ink: "#4e6277"
  slate-quiet: "#5b6f84"
  rule-line: "#dce7f1"
  rule-line-strong: "#a9c3da"
  hover-wash: "#eaf4ff"
  night-ground: "#071527"
  night-surface: "#10243d"
  night-rule: "#263d58"
  night-text: "#f3f8ff"
  night-text-soft: "#bdd0e4"
  night-link: "#86c3ff"
typography:
  headline:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: "2.5rem"
    letterSpacing: "0"
  title:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: "1.75rem"
  body:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
  body-compact:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.3
  control:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  chip: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.institutional-blue}"
    textColor: "{colors.paper-white}"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    height: "40px"
    padding: "0 20px"
  button-primary-hover:
    backgroundColor: "{colors.institutional-blue-deep}"
    textColor: "{colors.paper-white}"
  button-stroked:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink-navy}"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    height: "40px"
    padding: "0 16px"
  button-stroked-hover:
    backgroundColor: "{colors.hover-wash}"
  text-field:
    backgroundColor: "{colors.input-wash}"
    textColor: "{colors.ink-navy}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    height: "56px"
  card:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.lg}"
    padding: "16px"
  nav-item-active:
    backgroundColor: "{colors.blue-mist}"
    textColor: "{colors.institutional-blue-deep}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  status-chip:
    backgroundColor: "{colors.blue-mist}"
    textColor: "{colors.institutional-blue}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  person-chip:
    backgroundColor: "{colors.blue-mist}"
    textColor: "{colors.ink-navy}"
    typography: "{typography.body-compact}"
    rounded: "{rounded.chip}"
    padding: "5px 4px 5px 6px"
---

# Design System: ULEAM DataField

## Overview

**Creative North Star: "La libreta de campo"**

DataField se ve y se comporta como la libreta de un equipo de levantamiento: papel azulado claro, tinta azul marino, reglas finas que ordenan la información y un solo color institucional para lo que se puede hacer. Es una herramienta de trabajo, no una vitrina. El dato, el territorio y el avance del equipo están siempre en primer plano, y la interfaz se retira para que se lean.

La densidad es alta en el panel web, porque los líderes gestionan proyectos, zonas, encuestadores y respuestas en una sola jornada. La app de campo (PWA) aplica el mismo vocabulario con más aire, controles más grandes y lectura a pleno sol. El azul institucional de la ULEAM manda; el rojo ULEAM es escaso y significativo: la marca y lo que no se puede deshacer. Las superficies son planas y se separan con bordes finos; la profundidad aparece solo cuando un panel pide atención o una acción responde al cursor.

El sistema funciona en claro y en oscuro con los mismos roles. En oscuro el papel se vuelve azul noche y el texto de marca se aclara para conservar el contraste AA.

**Key Characteristics:**
- Papel azulado claro y tinta azul marino; nunca gris neutro puro.
- Un acento de acción: el azul institucional. El rojo ULEAM es escaso.
- Plano con bordes finos; sombra suave solo en paneles destacados y al pasar sobre la acción principal.
- Esquinas discretas (8px) en controles, tarjetas y campos; pastillas solo para estados.
- Etiquetas visibles, estados de carga y error junto a la acción que los produce.
- Mismos roles en tema claro y oscuro, con contraste WCAG 2.1 AA.

## Colors

Una paleta institucional de azules sobre papel azulado, con un rojo de marca reservado y tres colores de estado.

### Primary
- **Azul institucional** (`institutional-blue`): botones principales, enlaces, foco, elemento activo de la navegación y selección. Es el único color de acción.
- **Azul profundo** (`institutional-blue-deep`): hover de la acción principal y texto sobre fondos de bruma azul (navegación activa, chips).
- **Azul tinta** (`institutional-blue-ink`): títulos de marca y énfasis en avisos informativos.
- **Azul cielo** (`institutional-blue-sky`): acción principal en tema oscuro y realces sobre azul noche.
- **Bruma azul / Neblina azul** (`blue-mist`, `blue-haze`): fondos de selección, del elemento activo y de los chips de personas.

### Secondary
- **Rojo ULEAM** (`uleam-red`): identidad de la universidad (logotipo, momentos de marca), errores y acciones destructivas. Nunca para acciones normales.

### Tertiary
- **Verde de campo** (`field-green`): éxito, "dentro de zona", formularios implementados.
- **Ocre ámbar** (`amber-ochre`): advertencias no bloqueantes, borradores, GPS impreciso.

### Neutral
- **Papel azulado** (`paper-blue`): fondo de la aplicación.
- **Papel blanco** (`paper-white`): tarjetas, paneles y la cabecera.
- **Lavado de campo** (`input-wash`): fondo de los campos de texto.
- **Tinta azul marino** (`ink-navy`): texto principal y títulos.
- **Pizarra** (`slate-ink`): texto secundario y descripciones.
- **Pizarra tenue** (`slate-quiet`): texto terciario y metadatos (4.8:1 sobre papel azulado).
- **Regla** (`rule-line`): bordes de tarjetas y divisores. **Regla marcada** (`rule-line-strong`): borde al pasar el cursor.
- **Lavado hover** (`hover-wash`): fondo de filas, botones de texto y elementos al pasar el cursor.
- **Tema oscuro:** suelo azul noche (`night-ground`), superficie (`night-surface`), regla (`night-rule`), texto (`night-text`, `night-text-soft`) y enlaces de marca aclarados (`night-link`).

### Named Rules
**The Una Sola Tinta Rule.** El azul institucional es el único color de acción. Si dos cosas compiten por ser "la acción principal", una de ellas no lo es.

**The Rojo Que Cuesta Rule.** El rojo ULEAM se usa solo para la marca, los errores y lo que no se puede deshacer (eliminar, rechazar). Un botón rojo debe significar "cuidado".

**The Papel, No Gris Rule.** Los fondos y textos neutros llevan un tinte azul (papel azulado, pizarra). No introducir grises neutros puros.

## Typography

**Body Font:** Inter (con system-ui y Segoe UI como respaldo)
**Control Font:** Inter (botones, campos, pestañas y menús de Angular Material)

**Character:** una sola sans de trabajo, neutra y legible en datos y formularios. La jerarquía sale del peso (700 en títulos, 600 en controles) y del tamaño, no de una fuente de exhibición.

**Carga:** Inter se carga desde Google Fonts (pesos 400, 500, 600 y 700) y se expone como `--font-sans`. Las variables de fuente de Angular Material apuntan a ese token, y el tema `material-theme.scss` usa la misma familia, así que ningún control queda en Roboto. La PWA usa la fuente del sistema.

### Hierarchy
- **Headline** (700, 2.25rem / 2.5rem; 1.875rem en pantallas pequeñas): título de página ("Proyectos", "Usuarios").
- **Title** (700, 1.15–1.25rem): títulos de panel y de tarjeta ("Editar proyecto", "Solicitudes de acceso").
- **Body** (400, 1rem, interlineado 1.625): párrafos y descripciones, en pizarra (`slate-ink`).
- **Body compact** (400, 0.82–0.9rem): ayudas de campo, filas de tabla, metadatos y correos.
- **Label** (700, 0.75rem, mayúsculas): rótulos de indicadores y estados ("PROYECTOS", "BORRADOR").

### Named Rules
**The Peso, No Fuente Rule.** La jerarquía se construye con peso y tamaño dentro de la misma familia. No hay fuente de exhibición en la interfaz.

## Layout

- **Estructura del panel web:** barra lateral fija con la navegación por secciones, cabecera superior (logotipo, idioma, tema, usuario) y contenido de ancho fluido sobre papel azulado.
- **Páginas de gestión:** encabezado con título e indicadores breves, y debajo un esquema de lista y detalle (por ejemplo, lista de proyectos a la izquierda, entre 280 y 340px, y ficha a la derecha). Bajo 1600px pasa a una columna.
- **Formularios y editores:** campos agrupados en bloques con título ("Datos del proyecto", "Responsables"); dos columnas en escritorio y una bajo 1100px.
- **Ritmo:** separaciones de 8, 16, 24 y 32px. Grupos apretados (8px entre campo y ayuda) y separación generosa entre bloques (16–24px).
- **PWA:** una columna a ancho completo, barra superior con progreso de la encuesta y acciones fijas abajo; botones de al menos 44px de alto.
- **Móvil:** márgenes laterales de 16px y sin desplazamiento horizontal.

## Elevation & Depth

Sistema plano con bordes. Las superficies se separan con reglas finas de 1px (`rule-line`) y con el cambio entre papel azulado y papel blanco, no con sombras. La sombra aparece en dos casos: paneles que piden atención (el editor de proyecto, formularios destacados) y como respuesta al cursor sobre la acción principal. En tema oscuro las tarjetas no llevan sombra.

### Shadow Vocabulary
- **Panel destacado** (`box-shadow: 0 12px 30px var(--shadow-color)`, azul al 9%): editores y formularios principales de una página.
- **Respuesta de acción** (`box-shadow: 0 4px 12px var(--shadow-color)` con `translateY(-1px)`): hover del botón principal.
- **Línea de apoyo** (`box-shadow: 0 1px 0 var(--shadow-color)`): hover de tarjetas.

### Named Rules
**The Plano Por Defecto Rule.** En reposo, todo es plano con borde. Una sombra debe responder a una pregunta: ¿este panel pide atención o esta acción responde al cursor?

**The Un Solo Borde Rule.** Una superficie declara su elevación una sola vez: borde o sombra destacada, nunca un borde marcado bajo una sombra ancha.

## Shapes

Esquinas discretas y funcionales. Controles, campos y tarjetas usan 8px (`rounded.lg`); la navegación, 6px (`rounded.md`). Las pastillas totalmente redondeadas (`rounded.full`) quedan para estados y contadores. Los chips de personas usan 12px (`rounded.chip`), y los avatares e iniciales son círculos. Los bordes son de 1px; el borde discontinuo solo separa subbloques dentro de un mismo panel.

## Components

### Buttons
Directos y confiables: la acción se nombra con un verbo y un icono cuando es común (guardar, compartir, exportar).
- **Shape:** esquinas discretas (8px), 40px de alto en el panel web y al menos 44px en la PWA.
- **Primary:** fondo azul institucional, texto blanco 600, icono blanco a la izquierda. Una por grupo de acciones, a la derecha.
- **Hover / Focus:** pasa a azul profundo, sube 1px y gana la sombra de respuesta; el foco de teclado es un anillo azul visible.
- **Stroked (secundario):** fondo blanco, borde de regla y texto tinta; en hover, lavado azul y regla marcada. Para "Cancelar" y alternativas.
- **Text / Icon:** sin borde, texto tinta, lavado azul en hover. Para acciones de fila y cerrar.
- **Destructive:** rojo ULEAM (ver The Rojo Que Cuesta Rule), siempre con confirmación.

### Chips
- **Estado:** pastilla en mayúsculas 0.75rem/700 con fondo tenue y texto del color de estado. Borrador en ámbar, Implementado en verde y Archivado en gris pizarra.
- **Persona (editor de proyecto):** chip de 12px con inicial en círculo azul, nombre en 600 y correo en pizarra debajo, sobre bruma azul con borde neblina; botón para quitar.
- **Tipo de cuenta (Usuarios):** pastilla pequeña: Microsoft 365 en azul, Externo en lavado neutro y Pendiente de confirmar en ámbar.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** papel blanco sobre papel azulado; en oscuro, superficie azul noche.
- **Shadow Strategy:** plano en reposo (ver Elevation & Depth).
- **Border:** 1px de regla.
- **Internal Padding:** 16px en tarjetas y 20–24px en paneles de edición. No se anidan tarjetas dentro de tarjetas.

### Inputs / Fields
- **Style:** Angular Material "outline", fondo de lavado de campo, borde de regla y esquinas de 8px; etiqueta flotante siempre visible.
- **Focus:** el borde pasa a azul medio (`institutional-blue-mid`).
- **Error / Disabled:** mensaje de error en rojo bajo el campo, que dice cómo corregirlo. Deshabilitado con opacidad reducida.
- **Selectores múltiples de personas:** muestran "N seleccionados" en el campo, la lista con nombre y correo en dos líneas, y las personas elegidas como chips debajo.

### Navigation
- **Barra lateral:** grupos con rótulo en mayúsculas; ítems con icono y texto tinta.
- **Activo:** fondo de bruma azul, texto azul profundo e icono en un cuadro azul institucional, con esquinas de 6px.
- **Hover:** lavado azul.
- **Móvil:** la barra lateral se pliega tras el botón de menú.
- **PWA:** barra superior con título, progreso y acciones en la parte inferior de la pantalla.

### Panel de edición (signature)
El mismo panel sirve para crear y para editar (por ejemplo, "Nuevo proyecto" y "Editar proyecto"). Se abre desde una acción principal en el encabezado de la página, nunca como un formulario siempre visible. Es un panel blanco con borde y sombra destacada:
- **Encabezado:** título, contexto (por ejemplo, el nombre del proyecto) y botón para cerrar.
- **Cuerpo:** bloques con título y separados por una regla vertical en escritorio.
- **Pie:** acciones alineadas a la derecha.

Al abrirse, la página se desplaza hasta él y enfoca el primer campo; al cerrarse, el foco vuelve a quien lo abrió.

## Do's and Don'ts

### Do:
- **Do** usar el azul institucional como único color de acción y de foco.
- **Do** separar superficies con bordes de 1px y el cambio papel azulado / papel blanco antes que con sombras.
- **Do** mantener esquinas de 8px en controles, campos y tarjetas, y pastillas solo para estados y contadores.
- **Do** mostrar etiquetas visibles en todos los campos y el estado de carga o error junto a la acción que lo produce.
- **Do** definir cada color nuevo en ambos temas, con contraste WCAG 2.1 AA (texto de marca aclarado en oscuro).
- **Do** dar a la PWA objetivos táctiles de al menos 44px y textos legibles al sol.
- **Do** llevar al usuario al panel que abre una acción (desplazamiento y foco) y devolverlo al cerrarlo.

### Don't:
- **Don't** usar el rojo ULEAM en acciones normales, botones principales ni decoración.
- **Don't** introducir grises neutros puros ni una segunda familia tipográfica de exhibición.
- **Don't** anidar tarjetas dentro de tarjetas ni sumar sombra ancha a un borde marcado.
- **Don't** truncar nombres y correos de personas en selectores: mostrarlos completos en dos líneas o como chips.
- **Don't** mostrar el nombre "Barómetro" en la interfaz; el producto es ULEAM DataField.
