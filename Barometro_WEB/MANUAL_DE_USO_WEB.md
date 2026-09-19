# Manual de Uso — Barometro ULEAM WEB

Plataforma de formularios dinámicos y recolección de datos para ULEAM — panel administrativo web.

- **Web (administradores/gestores)**: https://barometro.netlify.app

> Para la app de recolección en campo, consulta el manual de la parte móvil (`Barometro_MOVIL/kobo-mobile/MANUAL_DE_USO.md`).

---

## 1. Roles del Sistema

| Rol | Nombre visible | Acceso | ¿Qué puede hacer? |
|-----|-----------------|--------|-------------------|
| **SUPER_ADMIN** | Super administrador | Web | Crea usuarios, gestiona todo |
| **ADMIN** | Administrador | Web | Crea proyectos, gestiona formularios |
| **PROJECT** | Líder | Web | Gestiona formularios de sus proyectos |
| **RECOLECTOR** | Recolector | Web y Móvil | Recolecta datos y completa formularios |

---

## 2. Inicio de sesión

1. Abre https://barometro.netlify.app
2. Ingresa **correo** y **contraseña** proporcionados por el administrador
3. Haz clic en **Iniciar sesión**

---

## 3. Dashboard

Después del login ves el panel principal con:
- **Mis formularios** — formularios que creaste
- **Formularios compartidos** — formularios que otros compartieron contigo
- Buscador y filtros por estado (Borrador/Implementado/Archivado)

---

## 4. Proyectos

Los formularios se organizan dentro de **proyectos**.

**Crear proyecto** (ADMIN o SUPER_ADMIN):
1. Ve a la sección **Proyectos**
2. Haz clic en **Nuevo proyecto**
3. Ingresa nombre, descripción y asigna líderes
4. Guarda

---

## 5. Formularios

**Crear formulario**:
1. Desde el Dashboard haz clic en **Nuevo formulario**
2. Selecciona el proyecto al que pertenecerá
3. Ingresa título y opcionalmente una descripción
4. Agrega preguntas:
   - **Texto** — respuesta libre corta
   - **Número** — respuesta numérica
   - **Opción múltiple** — selección única o múltiple
   - **Likert** — escala de valoración con filas y columnas
5. Configura si es **paso a paso** (una pregunta por vez)
6. Guarda el formulario

**Implementar formulario**: Una vez listo, cambia su estado a **Implementado** para que quede disponible para recolectar respuestas (por enlace público o vía app móvil).

**Compartir formulario** (PROJECT o ADMIN):
1. Abre el formulario
2. En la sección **Compartir**, ingresa el correo del usuario
3. Selecciona el rol:
   - **Líder (PROJECT)** — puede editar el formulario
   - **Recolector (RECOLECTOR)** — solo puede recolectar respuestas
4. Asigna **respuestas objetivo** (opcional)
5. Confirma

**Enlace público de recolección**: en "Mis formularios", cada formulario implementado tiene un botón **"Ver enlace"** que genera una URL pública (ej. `barometro.netlify.app/collect/...`). Cualquier persona con ese enlace puede llenar el formulario desde su navegador, sin necesidad de cuenta.

**Ver respuestas**: En la lista de formularios, haz clic en **Resultados** para ver gráficos y datos recolectados.

---

## 6. Usuarios (solo SUPER_ADMIN)

En **Usuarios** puedes:
- **Crear usuario**: nombre, correo, contraseña y rol
- **Editar usuario**: cambiar datos, activar/desactivar
- **Cambiar rol**: de un usuario existente
- **Eliminar usuario**: solo si no tiene formularios asociados

---

## 7. Perfil

En **Configuración** puedes:
- Editar tu nombre, teléfono, cargo y biografía
- Subir foto de perfil
- Cambiar tema claro/oscuro

---

## 8. Flujo de trabajo típico

```
SUPER_ADMIN/ADMIN crea proyecto
  → ADMIN/Líder crea formularios dentro del proyecto
    → ADMIN/Líder implementa el formulario
      → ADMIN/Líder comparte con Recolectores
        → Recolector recolecta datos (desde app móvil o enlace público)
          → ADMIN/Líder revisa resultados en el dashboard web
```

---

## 9. Solución de problemas

| Problema | Causa | Solución |
|----------|-------|----------|
| Error "No autenticado" | Token expirado | Cierra sesión y vuelve a iniciar |
| No puedo iniciar sesión | Credenciales incorrectas | Contacta al administrador |
| Formulario no se implementa | Debe pertenecer a un proyecto | Asígnale un proyecto primero |
| La página tarda en cargar la primera vez del día | El servidor gratuito "se duerme" tras inactividad | Espera 30-50 segundos en el primer intento; los siguientes son rápidos |

---

## 10. Cuenta inicial

Las credenciales del Super Admin se gestionan por separado y no se documentan en este archivo público. Solicítalas al administrador del proyecto.
