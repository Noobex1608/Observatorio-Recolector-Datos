# Documentación — Formularios ULEAM (Barómetro)

Guía simple de uso para la plataforma de recolección de datos de la Universidad Laica Eloy Alfaro de Manabí (ULEAM). El sistema tiene **dos partes**: una plataforma **web** (para administrar y ver resultados) y una **app móvil** (para recolectar datos en campo, incluso sin internet).

---

## 1. ¿Qué hace el sistema?

Permite crear formularios de encuestas, publicarlos, y que las respuestas se recolecten de tres formas:

- Desde la **web**, por un administrador o líder de proyecto.
- Desde un **enlace público** que cualquier persona abre en su navegador (sin necesidad de cuenta).
- Desde la **app móvil**, usada por recolectores en campo, incluso **sin conexión a internet**.

---

## 2. Parte Web

**Enlace:** `https://barometro.netlify.app`

### 2.1 Roles de usuario

| Rol | Qué puede hacer |
|---|---|
| **Super administrador** | Control total: usuarios, proyectos, configuración y datos. |
| **Administrador** | Gestiona proyectos, líderes y formularios. |
| **Líder** *(antes "Project Leader")* | Gestiona formularios y permisos dentro de sus propios proyectos. |
| **Recolector** *(antes "Usuario")* | Recolecta datos y edita solo con permiso explícito. |

### 2.2 Flujo básico de uso

1. **Iniciar sesión** con correo y contraseña en la página principal.
2. **Crear un proyecto** (menú "Proyectos") — es el contenedor donde viven los formularios relacionados.
3. **Crear un formulario** (menú "Nuevo formulario"), asociarlo a un proyecto, y agregar las preguntas necesarias (texto, opción múltiple, escala, etc.).
4. **Implementar el formulario** — al pasar de "Borrador" a "Implementado", el formulario queda disponible para recolectar respuestas.
5. **Compartir el enlace de recolección**: en "Mis formularios", cada formulario implementado tiene un botón **"Ver enlace"** que genera una URL pública (ej. `barometro.netlify.app/collect/...`). Cualquier persona con ese enlace puede llenar el formulario desde su navegador, sin necesidad de cuenta.
6. **Ver resultados**: el botón "Resultados" muestra las respuestas recolectadas, con gráficos y exportación.
7. **Archivar** un formulario cuando ya no se necesite seguir recolectando (los datos existentes no se pierden).

### 2.3 Gestión de usuarios

Solo los roles **Administrador** y **Super administrador** pueden entrar a la sección **"Usuarios"** para:
- Crear nuevas cuentas (nombre, correo, contraseña, rol).
- Cambiar el rol de un usuario existente.
- Activar/desactivar cuentas (una cuenta desactivada no puede iniciar sesión).
- Eliminar usuarios.

---

## 3. Parte Móvil (App PWA)

**Enlace:** `https://barometromovil.netlify.app`

Es una aplicación web progresiva (PWA) pensada para **recolectores en campo**, con la ventaja de que funciona **sin internet** una vez que los formularios se descargaron.

### 3.1 Primer uso (requiere internet)

1. Abrir el enlace de la app móvil desde el navegador del celular.
2. En la pantalla de inicio, completar:
   - **URL del Servidor**: `https://barometro-9ro8.onrender.com`
   - **Usuario**: el correo asignado por el administrador.
   - **Contraseña**: la que te haya dado el administrador.
3. Presionar **Iniciar sesión**.

> Consejo: para instalarla como app (ícono en el celular), el navegador suele mostrar la opción "Agregar a pantalla de inicio" — así se abre como una app normal y funciona offline.

### 3.2 Flujo de trabajo típico

1. **Descargar formularios**: desde el menú de inicio, elegir "Descargar formulario" y marcar cuáles se van a usar. Quedan guardados en el celular.
2. **Llenar un formulario**: ir a "Llenar nuevo formulario", elegir uno de los descargados, y responder las preguntas. Funciona **sin internet**.
3. Al terminar, hay dos opciones:
   - **Guardar borrador** → queda guardado para continuar después.
   - **Guardar y enviar** → queda listo para sincronizar en cuanto haya internet.
4. **Sincronizar**: ir a "Listo para enviar", seleccionar los formularios pendientes, y enviarlos. Esto requiere conexión a internet — apenas la haya, se suben al servidor.
5. Los formularios ya enviados aparecen en la sección **"Enviados"** como historial.

### 3.3 Otras funciones

- **Borradores**: ver, continuar llenando o eliminar formularios guardados a medias.
- **Ajustes**: cambiar idioma (Español/Inglés), activar modo oscuro, o cambiar la URL del servidor.

---

## 4. Enlace público de recolección (sin app ni cuenta)

Cuando un formulario está "Implementado" en la web, se puede compartir un enlace directo (ej. `https://barometro.netlify.app/collect/xxxxx`) para que **cualquier persona** lo llene desde su navegador — celular o computadora — sin necesitar usuario ni contraseña. Ideal para encuestas abiertas al público general.

---

## 5. Preguntas frecuentes

**¿Qué pasa si olvido mi contraseña?**
Debe contactar a un Administrador o Super administrador para que la restablezca desde la sección "Usuarios".

**¿Puedo usar la app móvil sin internet todo el tiempo?**
Sí, para llenar formularios ya descargados. Solo se necesita internet para: iniciar sesión la primera vez, descargar formularios nuevos, y sincronizar respuestas ya llenadas.

**¿Se pierden mis respuestas si se cierra la app sin enviarlas?**
No, mientras se haya usado "Guardar borrador" o "Guardar y enviar", quedan almacenadas en el celular hasta que se sincronicen o se eliminen manualmente.

**La plataforma web tarda en cargar la primera vez del día, ¿es normal?**
Sí. El servidor "se duerme" tras un rato sin uso para ahorrar recursos, y la primera petición del día puede tardar unos 30-50 segundos en "despertarlo". Los siguientes intentos son rápidos.
