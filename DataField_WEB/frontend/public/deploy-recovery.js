(function () {
  const retryKey = 'uleam:chunk-reload-at';
  const retryWindowMs = 60_000;
  let recovering = false;

  function showNotice() {
    if (document.querySelector('.deploy-recovery-notice')) return;
    if (!document.body) {
      window.addEventListener('DOMContentLoaded', showNotice, { once: true });
      return;
    }

    const notice = document.createElement('div');
    notice.className = 'deploy-recovery-notice';
    notice.setAttribute('role', 'alert');

    const message = document.createElement('span');
    message.textContent = 'No se pudo cargar una parte de la aplicación. Recarga la página para obtener la versión actual.';

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Recargar';
    button.addEventListener('click', () => window.location.reload());

    notice.append(message, button);
    document.body.appendChild(notice);
  }

  function recover() {
    if (recovering) return;
    recovering = true;

    try {
      const lastRetry = Number(window.sessionStorage.getItem(retryKey) || 0);
      if (Date.now() - lastRetry > retryWindowMs) {
        window.sessionStorage.setItem(retryKey, String(Date.now()));
        window.location.reload();
        return;
      }
    } catch {
      // If session storage is unavailable, avoid an automatic reload loop.
    }

    showNotice();
  }

  function isChunkError(reason) {
    return /Failed to fetch dynamically imported module|Importing a module script failed|Failed to load module script|ChunkLoadError|Loading chunk/i.test(String(reason?.message || reason || ''));
  }

  window.addEventListener('error', (event) => {
    const target = event.target;
    if (
      (target instanceof HTMLScriptElement && target.type === 'module' && target.src.endsWith('.js')) ||
      isChunkError(event.error || event.message)
    ) {
      recover();
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkError(event.reason)) recover();
  });

  window.addEventListener('app-chunk-error', recover);
})();
