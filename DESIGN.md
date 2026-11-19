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

<!-- impeccable:design-map -->
Name: ULEAM DataField
Colors: primary: institutional-blue #0059a8; secondary: uleam-red #bc1421; tertiary: field-green #16805c; neutral: paper-blue #f1f6fb; primary: institutional-blue-deep #005689 (+22 more in the sidecar)
Fonts: Inter (headline, title, body, body-compact, label, control)
Spacing: xs 4px, sm 8px, md 16px, lg 24px, xl 32px
Radius: sm 4px, md 6px, lg 8px, chip 12px, full 9999px
North Star: "La libreta de campo"
Rules:
- The Una Sola Tinta Rule. El azul institucional es el único color de acción.
- The Rojo Que Cuesta Rule. El rojo ULEAM se usa solo para la marca, los errores y lo que no se puede deshacer (eliminar, rechazar).
- The Papel, No Gris Rule. Los fondos y textos neutros llevan un tinte azul (papel azulado, pizarra).
- The Peso, No Fuente Rule. La jerarquía se construye con peso y tamaño dentro de la misma familia.
- The Plano Por Defecto Rule. En reposo, todo es plano con borde.
- The Un Solo Borde Rule. Una superficie declara su elevación una sola vez: borde o sombra destacada, nunca un borde marcado bajo una sombra ancha.
Elevation:
- Panel destacado: 0 12px 30px var(--shadow-color)
- Respuesta de acción: 0 4px 12px var(--shadow-color)
- Línea de apoyo: 0 1px 0 var(--shadow-color)
Don't:
- Don't usar el rojo ULEAM en acciones normales, botones principales ni decoración.
- Don't introducir grises neutros puros ni una segunda familia tipográfica de exhibición.
- Don't anidar tarjetas dentro de tarjetas ni sumar sombra ancha a un borde marcado.
- Don't truncar nombres y correos de personas en selectores: mostrarlos completos en dos líneas o como chips.
- Don't mostrar el nombre "Barómetro" en la interfaz; el producto es ULEAM DataField.
Do:
- Do usar el azul institucional como único color de acción y de foco.
- Do separar superficies con bordes de 1px y el cambio papel azulado / papel blanco antes que con sombras.
- Do mantener esquinas de 8px en controles, campos y tarjetas, y pastillas solo para estados y contadores.
- Do mostrar etiquetas visibles en todos los campos y el estado de carga o error junto a la acción que lo produce.
- Do definir cada color nuevo en ambos temas, con contraste WCAG 2.1 AA (texto de marca aclarado en oscuro).
- Do dar a la PWA objetivos táctiles de al menos 44px y textos legibles al sol.
- (+1 more)
Full: .impeccable/design-full.md (read a section when you need its detail)
