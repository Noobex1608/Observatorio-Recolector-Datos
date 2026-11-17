# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Dos aplicaciones web del mismo producto: el panel web de gestión (`DataField_WEB/frontend`, Angular) y la app de recolección en campo (`DataField_MOVIL/kobo-mobile`, PWA instalable en el teléfono). Ambas son web; la PWA no es una app nativa.

## Users

Dos usuarios principales, con el mismo peso. Cada aplicación se optimiza para el suyo:

- **Líderes de proyecto (panel web).** Docentes e investigadores de ULEAM, y los administradores que los apoyan. Trabajan en una computadora: crean proyectos y formularios, delimitan zonas en el mapa, asignan encuestadores y metas, supervisan el avance y analizan y exportan respuestas.
- **Encuestadores en campo (PWA).** Estudiantes y personal externo que llenan encuestas con el celular, casa por casa, a menudo con señal débil o sin ella, al aire libre y con prisa. Necesitan saber qué les toca, en qué zona y cuánto les falta, y no perder nada de lo que capturan.

Otros participantes: supervisores (revisan el recorrido de los encuestadores), administradores y superadministradores (usuarios, roles, auditoría), y personas que responden un formulario público por enlace, sin cuenta.

## Product Purpose

Plataforma de la Universidad Laica Eloy Alfaro de Manabí (ULEAM) para diseñar formularios, recolectar datos en territorio y analizarlos, al estilo de KoboToolbox / Google Forms pero pensada para levantamientos de campo de la universidad. El éxito es un levantamiento completo y confiable: cada encuesta en su zona, con su encuestador identificado, sin datos perdidos por falta de señal, y con los resultados listos para analizar y exportar.

## Positioning

Lo que un servicio genérico de formularios no ofrece:

- **Territorio como parte del formulario.** Zonas delimitadas con las capas oficiales del INEC (provincia, cantón, parroquia, sector, manzana) o con radio GPS, y verificación de que el encuestador está dentro de su zona.
- **Supervisión de campo.** Recorrido GPS de cada encuestador por día (inicio, reanudaciones, fin) con alertas de salida de zona y de GPS impreciso.
- **Infraestructura institucional de ULEAM.** Acceso con la cuenta Microsoft 365 de la universidad, archivos de las respuestas en el SharePoint de ULEAM y correo desde un buzón institucional: los datos quedan en la infraestructura de la universidad.
- **Recolección sin conexión.** La PWA descarga los formularios y guarda respuestas, borradores, fotos, audio y video en el teléfono hasta tener señal.

## Operating Context

- **Flujo:** proyecto → ficha técnica validada → formularios (constructor) → zonas y encuestadores → publicar → recolección (PWA, web o enlace público) → supervisión → respuestas, gráficos y exportación (CSV/XLSX, PDF).
- **Estados de formulario:** Borrador, Implementado (en código `DEPLOYED`) y Archivado.
- **Roles globales:** Super administrador, Administrador, Líder de proyecto, Supervisor y Recolector. Dentro de un proyecto también hay delegados y supervisores asignados.
- **Cuentas:** las internas (`@uleam.edu.ec`, `@live.uleam.edu.ec`, `@dn.uleam.edu.ec`) entran con Microsoft 365. Las externas entran con correo y contraseña creada desde una invitación. Los externos solo pueden ser recolectores o supervisores. El registro público está cerrado: el acceso lo aprueba un administrador.
- **Ambiente de uso:** panel web en oficina, con pantallas de escritorio; PWA en celulares de gama variada, a pleno sol y con conectividad intermitente.
- **Idioma de la interfaz:** español (el panel web también ofrece inglés).
- **Infraestructura de DIIT (TI de ULEAM):** Entra ID, buzón de notificaciones y biblioteca de SharePoint. Los identificadores de producción los pone DIIT en su pipeline.

## Capabilities and Constraints

- **Tipos de pregunta:** texto (con formatos de correo, cédula y teléfono de Ecuador), número, opción única y múltiple, Likert, ranking, calificación, fecha, hora, fecha y hora, GPS, multimedia (foto, audio, video), firma, código de barras, nota y cálculo; con saltos y preguntas condicionales.
- **Video:** duración máxima configurable por pregunta (5 a 120 s). Tamaño máximo de 30 MB por archivo y 35 MB por respuesta.
- **Mapa:** Leaflet con capas INEC y búsqueda de lugares sobre OpenStreetMap. Se debe respetar la política de uso de Nominatim: no autocompletar contra su API.
- **Términos del producto:** proyecto, formulario, ficha técnica, zona, delimitación, encuestador/recolector, líder, delegado, supervisor, respuesta, borrador, implementar/publicar.
- **Sin decidir:** dominio y alojamiento definitivos de producción (hoy Netlify y Render, en transición a la infraestructura de ULEAM).

## Brand Commitments

- **Nombre oficial:** **ULEAM DataField**. "Barómetro" es un nombre anterior y no debe reaparecer en la interfaz.
- **Identidad:** pertenece a la Universidad Laica Eloy Alfaro de Manabí; usa el logotipo de ULEAM y fotos del campus.
- **Voz:** español claro, directo y en segunda persona; en los mensajes, la acción y la solución antes que la jerga técnica.

## Evidence on Hand

- **Logotipos y fotos:** `DataField_WEB/frontend/public/ULEAM.png`, `DataField_WEB/frontend/public/fondo_banner.png`, `DataField_MOVIL/kobo-mobile/public/login-uleam.png` y `DataField_MOVIL/kobo-mobile/public/login-campus.png`.
- **Documentación de uso:** `Documentacion_Barometro_ULEAM.md` y `DataField_WEB/MANUAL_DE_USO_WEB.md`. Usan el nombre anterior.
- **Guía de diseño del panel web:** `DataField_WEB/docs/diseño.md`, alineada con `DESIGN.md` (raíz), que es la referencia principal.
- **Capas cartográficas del INEC:** incluidas en el proyecto.
- **No existen:** testimonios, métricas de uso ni casos publicados. No inventarlos.

## Product Principles

1. **Ningún dato se pierde en el campo.** Lo capturado se guarda en el teléfono al instante y se valida ahí mismo (tamaño, duración, campos obligatorios), no recién al sincronizar.
2. **El territorio es parte del dato.** Zona, ubicación y encuestador acompañan a cada respuesta, y la interfaz los hace visibles y verificables.
3. **Cada aplicación para su usuario.** El panel web es denso y escaneable para gestionar y analizar; la PWA es directa, de una mano y legible al sol para recolectar.
4. **Institucional y confiable.** Acceso con la cuenta de ULEAM, permisos por rol explicados en la interfaz y datos en la infraestructura de la universidad.
5. **Errores que dicen qué hacer.** Cada mensaje nombra el problema y el siguiente paso, en el lenguaje del trabajo de campo.

## Accessibility & Inclusion

- **Norma exigida:** WCAG 2.1 nivel AA en el panel web y en la PWA.
- **Prácticas mínimas:** etiquetas visibles, foco de teclado visible, contraste suficiente (también al sol en la PWA), objetivos táctiles de al menos 44 px, mensajes de estado anunciados a lectores de pantalla y respeto de `prefers-reduced-motion`.
