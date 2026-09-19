# Base de Datos - Plataforma de Formularios

La base de datos actual soporta un flujo de formularios dinamicos y respuestas flexibles.

## Entidades principales

| Tabla | Proposito |
| --- | --- |
| `users` | Usuarios del sistema con rol global `SUPER_ADMIN`, `ADMIN` o `USER` |
| `perfiles` | Datos extendidos del usuario |
| `forms` | Formularios creados por usuarios autenticados |
| `form_questions` | Preguntas dinamicas de cada formulario |
| `form_responses` | Respuestas enviadas por el enlace publico |
| `form_user_shares` | Comparticion de formularios con rol `EDITOR` o `LECTOR` |

## Estados de formulario

| Estado | Descripcion |
| --- | --- |
| `DRAFT` | Editable, aun no publicado |
| `DEPLOYED` | Publicado y disponible por enlace publico |
| `ARCHIVED` | Cerrado para recoleccion activa |

## Preguntas

Las preguntas se ordenan por posicion y pueden incluir opciones cuando el tipo lo requiere.

Tipos esperados:

- Texto corto/largo.
- Numero.
- Seleccion unica.
- Seleccion multiple.
- Escala tipo Likert.

## Respuestas

Las respuestas almacenan el payload en formato flexible para soportar formularios con estructura variable. Esto permite agregar o quitar preguntas sin alterar el esquema fisico de respuestas.

## Usuarios y acceso

- El registro publico esta deshabilitado.
- Los usuarios se crean desde el panel administrativo.
- El login usa Sanctum.
- `SUPER_ADMIN` administra usuarios, administradores y puede moderar todos los formularios.
- `ADMIN` administra usuarios normales.
- `USER` administra sus formularios e invita colaboradores.
- Los formularios pueden compartirse con otros usuarios registrados como `EDITOR` o `LECTOR`.

## Seed

El endpoint activo de seed esta enfocado en crear o asegurar el usuario super admin:

```text
POST /api/seed/admin
```

Debe enviarse `X-Seed-Token` cuando el entorno lo exija.

## Modulos retirados

El antiguo flujo de observatorio fue retirado del backend activo. La base nueva debe enfocarse en usuarios, perfiles, formularios, preguntas, respuestas y comparticion.
