// Arranque de Swagger UI. Va en un archivo propio para que la CSP no necesite scripts inline.
window.addEventListener('load', function () {
  var container = document.getElementById('swagger-ui');
  window.ui = SwaggerUIBundle({
    url: container.dataset.url,
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    plugins: [SwaggerUIBundle.plugins.DownloadUrl],
    layout: 'StandaloneLayout',
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    validatorUrl: null
  });
});
