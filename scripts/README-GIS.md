# Regenerar particiones GIS

La fuente cruda se mantiene fuera de Git. Para reproducir las particiones, instale Python 3 con GDAL/`osgeo` y disponga del GeoPackage oficial en `resource/gis/MGN26_sirgas.gpkg`, o pase su ruta con `--input`. GDAL identifica el CRS de las capas usadas en el archivo actual como EPSG:31992. Confirme este dato con el proveedor antes de publicar; si recibe otra versión, pase su CRS real con `--source-epsg`. El script rechaza capas cuyo CRS no coincida.

Desde la raíz del proyecto:

```sh
python scripts/export-gis-partitioned.py --input resource/gis/MGN26_sirgas.gpkg --output Barometro_WEB/frontend/public/assets/gis --source-epsg 31992
```

El comando genera `manifest.json` con SHA-256 de la fuente y de cada salida en EPSG:4326. Compare el manifiesto entre ejecuciones antes de desplegar y registre el nombre, licencia, fecha y versión del GeoPackage de origen. Una capa vacía o ausente en el navegador debe investigarse: el selector muestra errores de carga explícitos. El caché del navegador conserva como máximo ocho capas procesadas simultáneamente.

La cartografía todavía se copia dentro del artefacto Angular. Antes de llevarla al servidor universitario, mida el tamaño total y sirva las particiones grandes desde almacenamiento/CDN separado con caché HTTP y versionado del manifiesto. Esta regeneración no certifica exactitud geodésica: requiere comprobación cartográfica con puntos conocidos.
