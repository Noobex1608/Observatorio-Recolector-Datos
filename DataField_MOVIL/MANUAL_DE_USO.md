# Manual de uso — App Móvil de Recolección (ULEAM PWA)

Guía **paso a paso** para recolectores que van a usar la aplicación móvil para llenar y enviar encuestas desde el campo.

---

## Resumen rápido (los 5 pasos esenciales)

1. **Recibe tus datos de acceso** del administrador (URL del servidor, usuario y contraseña).
2. **Abre la app** en tu celular o computadora.
3. **Inicia sesión** con la URL del servidor, tu usuario y tu contraseña.
4. **Descarga los formularios** que te asignaron.
5. **Llena las encuestas** (puedes hacerlo sin internet) y **envíalas** cuando vuelvas a tener señal.

---

## 1. ¿Qué es esta app?

Es una **aplicación de recolección de datos** que funciona en el navegador del celular o la computadora (PWA). Te permite:

- **Descargar formularios** a tu dispositivo.
- **Llenarlos sin conexión a internet** (la usas en el campo, con señal o sin ella).
- **Guardar borradores** y continuar después.
- **Enviar las respuestas** cuando tengas conexión.

Todo lo que envías llega al **servidor central** (donde el administrador puede verlo) y se replica a la nube.

---

## 2. ¿Quién te da las credenciales?

**Tú no te registras por tu cuenta.** El acceso te lo entrega el **administrador de la plataforma** (la persona encargada de gestionar el sistema). Él debe darte **3 datos**:

| Dato | Qué es | Ejemplo |
|------|--------|---------|
| **URL del servidor** | La dirección donde está instalado el sistema (sin `/api`) | `http://192.168.1.10:8000` |
| **Usuario** | Tu correo electrónico dentro del sistema | `recolector@uleam.edu.ec` |
| **Contraseña** | La clave que asignó el administrador | (la que te entregue) |

> 💡 Si no tienes estos datos, **pídele al administrador** que cree tu cuenta y te entregue tus credenciales. Sin ellas no podrás entrar.

---

## 3. ¿Cómo abro la app?

- En tu **celular**: abre el navegador (Chrome, Safari, Edge) y escribe la **dirección de la app** que te indique el administrador (ej. `http://192.168.1.10:4201`).
- En tu **computadora**: lo mismo, desde el navegador.

> Hay **dos direcciones diferentes** y es importante no confundirlas:
>
> | Dirección | Es para... | Ejemplo |
> |-----------|------------|---------|
> | **URL de la app** | Abrir la aplicación móvil en el navegador | `http://192.168.1.10:4201` |
> | **URL del servidor** | Iniciar sesión (campo de la app) | `http://192.168.1.10:8000` |
>
> La **URL del servidor termina en `8000`** y la **app en `4201`**. Ninguna lleva `/api` al final.

---

## 4. Iniciar sesión (paso a paso)

1. Abre la app en el navegador.
2. Verás la pantalla de acceso. Completa los **3 campos**:

   - **URL del Servidor**: pega la dirección que te dio el administrador, **sin `/api`**.
     - ✅ Correcto: `http://192.168.1.10:8000`
     - ❌ Incorrecto: `http://192.168.1.10:8000/api`
   - **Usuario**: tu correo, ej. `recolector@uleam.edu.ec`.
   - **Contraseña**: la que te entregó el administrador.
3. Pulsa **Acceder**.
4. Si todo está bien, entras a la pantalla de **Inicio**.

> ⚠️ Necesitas internet **solo para este primer ingreso**. Después de entrar, la app funciona sin conexión.
>
> Si sale un error, revisa la sección **Problemas comunes** al final.

---

## 5. Pantalla de inicio (cómo se ve)

Al entrar verás:

- **Indicador de conexión**: verde (en línea) o gris (sin conexión).
- En la parte superior:
  - **ES / EN**: cambia el idioma (Español / English).
  - **🌙 / ☀️**: modo oscuro.
  - **Avatar (tu inicial)**: abre el menú con **Perfil**, **Ajustes**, **Acerca de** y **Cerrar sesión**.
- Las **opciones principales**:

| Opción | Icono | Para qué sirve |
|--------|-------|----------------|
| **Llenar nuevo formulario** | `+` | Ver las encuestas descargadas y empezar a llenar. |
| **Borradores** | ✏️ | Encuestas a medias para continuar después. |
| **Listo para enviar** | 📨 | Encuestas terminadas pendientes de enviar. |
| **Enviado** | ✅ | Historial de encuestas ya enviadas. |
| **Descargar formulario** | ⬇️ | Bajar formularios nuevos desde el servidor. |
| **Borrar formulario** | 🗑️ | Eliminar formularios del dispositivo (solo local). |

---

## 6. Descargar los formularios

1. En el inicio, pulsa **⬇️ Descargar formulario**.
2. Aparece la lista de formularios **que el administrador te asignó** (no ves los de los demás).
3. **Marca con la casilla** los que necesites o pulsa **Seleccionar todos**.
4. Pulsa **Descargar (N)**.

> Los formularios quedan guardados en tu dispositivo y **se usan sin internet**. Solo se descargan los formularios en estado **desplegado (DEPLOYED)** que estén compartidos contigo. Si no ves ninguno, pídele al administrador que te asigne formularios.

---

## 7. Llenar un formulario

1. Pulsa **`+` Llenar nuevo formulario**.
2. Elige la encuesta. Verás cuántas preguntas tiene y, si te asignaron un límite, tu avance (`X / Y respuestas`).
3. Responde las preguntas en orden. Las **obligatorias** tienen un `*` rojo.
4. Al terminar usa **Guardar Borrador** o **Guardar y Enviar** (sección 9).

> Si alcanzaste el límite de respuestas asignado, la app te lo avisa y bloquea el formulario hasta que el administrador lo reactive.

---

## 8. Tipos de preguntas

| Tipo | Cómo se responde | Ejemplo |
|------|------------------|---------|
| **Texto** | Escribes en un cuadro | Nombre, comentario |
| **Número** | Escribes un valor numérico | Edad, cantidad |
| **Opción única** | Marcas **una** opción (círculo) | Sí / No |
| **Opción múltiple** | Marcas **una o varias** (casillas) | Intereses, actividades |
| **Escala Likert** | Tabla de filas y columnas; marcas una casilla por fila | "Totalmente de acuerdo…" |

---

## 9. Guardar borrador o guardar y enviar

Al final del formulario:

- **💾 Guardar Borrador**: guarda lo respondido a medias. Puedes cerrar la app y **continuar luego** desde **Borradores**.
- **✅ Guardar y Enviar**: valida las obligatorias y pasa la encuesta a **Listo para enviar** (aún no se sube; tú decides cuándo).

---

## 10. Borradores

En **✏️ Borradores**:
- **▶ Continuar**: sigue llenando donde quedaste.
- **🗑**: borra el borrador (se pierde lo respondido).

---

## 11. Enviar las encuestas (Listo para enviar)

1. Entra a **📨 Listo para enviar**.
2. Marca las encuestas que quieras subir (o **Seleccionar todos**).
3. Pulsa **Enviar (N)** y verás el progreso `Enviando X / Y...`.
4. Al terminar pasan a **✅ Enviado**.

> Necesitas internet para enviar. Si no hay señal, déjalas ahí y envíalas cuando vuelvas a tener conexión.

---

## 12. Enviados (historial)

En **✅ Enviado** verás el historial de encuestas subidas (fecha y duración). El botón **🗑️ Borrar notificaciones** limpia ese registro **solo del dispositivo**; no borra los datos del servidor.

---

## 13. Borrar formularios del dispositivo

En **🗑️ Borrar formulario**, marca los que quieras quitar de tu dispositivo y confirma.

> ⚠️ La eliminación es **solo local**. No borra nada del servidor. Si lo necesitas de nuevo, vuelve a descargarlo.

---

## 14. Ajustes

En **⚙️ Ajustes** (menú del avatar):

- **🌐 Idioma**: Español / English.
- **🌙/☀️ Modo oscuro**: tema claro u oscuro.
- **☁️ URL del servidor**: cambiar la dirección del servidor (te la da el administrador).
- **🗑️ Borrar formularios**: limpiar el dispositivo.
- **ℹ️ Acerca de**: versión de la app.

---

## 15. Perfil

En **👤 Perfil** (menú del avatar) puedes editar **Nombre** (obligatorio), **Teléfono**, **Cargo** y **Bio**. El **correo no se puede cambiar** desde la app. Guarda con el botón inferior.

---

## 16. Trabajo sin conexión (resumen del flujo)

1. **Con internet**: inicia sesión y descarga los formularios.
2. **En el campo (sin internet)**: llena las encuestas y usa **Guardar Borrador** o **Guardar y Enviar**; todo queda guardado en el dispositivo.
3. **Con internet de nuevo**: entra a **📨 Listo para enviar** y pulsa **Enviar**.

---

## 17. Problemas comunes (y qué hacer)

| Problema | Qué significa | Qué hacer |
|----------|---------------|-----------|
| **"No puedo iniciar sesión"** | La URL, usuario o contraseña son incorrectos, o no hay internet. | Verifica que la URL **no tenga `/api`**, revisa tus datos y que tengas señal. Pide ayuda al administrador. |
| **"No aparecen formularios"** | El administrador no te ha asignado formularios o no los ha desplegado. | Pídele al administrador que te comparta formularios desplegados. |
| **"No puedo llenar un formulario"** | Alcanzaste el límite de respuestas asignado. | Espera a que el administrador lo reactive. |
| **"Las respuestas no se envían"** | No hay conexión a internet. | Revisa la señal y vuelve a intentar desde **Listo para enviar**. |
| **"¿Dónde consigo la URL del servidor?"** | Es un dato que solo da el administrador. | Solicítala junto con tus credenciales. |
| **"¿Puedo usar la app en el campo?"** | Sí. La app funciona sin internet. | Descarga los formularios antes de salir al campo. |

---

## 18. ¿Quién hace qué?

| Persona | Responsabilidad |
|---------|-----------------|
| **Administrador** | Crea las cuentas, entrega credenciales y URL, despliega formularios, los comparte y define límites de respuestas. |
| **Recolector (tú)** | Inicia sesión, descarga formularios, los llena y envía las respuestas. |
