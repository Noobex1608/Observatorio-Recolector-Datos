#!/bin/sh
# Corre todas las pruebas de carga del respaldo para TI y guarda los resultados en resultados/.
# Uso (desde loadtest/, con Docker y las imágenes udf-api-base y udf-api-local construidas):
#   sh correr-respaldo.sh          todas las pruebas (~45 min)
#   sh correr-respaldo.sh nuevas   solo la mixta y la de IP compartida (~25 min con la siembra)
# Borra y vuelve a crear la base de la copia local de prueba (no toca ningún servidor real).
SOLO=${1:-todas}
set -u
cd "$(dirname "$0")"
DIR=$(pwd -W 2>/dev/null || pwd)
R=resultados
mkdir -p "$R" fotos
API=udf-loadtest-api-1
DB=udf-loadtest-db-1
K6="grafana/k6:1.3.0"

paso() { echo; echo "=== $(date '+%H:%M:%S') $*"; }

# Muestrea CPU y memoria de la API y la base cada ~2 s mientras corre una prueba.
muestrear() {
  archivo="$R/recursos-$1.csv"
  echo "hora,contenedor,cpu,memoria" > "$archivo"
  while :; do
    docker stats --no-stream --format "{{.Name}},{{.CPUPerc}},{{.MemUsage}}" "$API" "$DB" 2>/dev/null \
      | sed "s/^/$(date '+%H:%M:%S'),/" >> "$archivo"
  done
}

# Ejecuta k6 con muestreo de recursos. $1 = etiqueta, $2 = script, resto = variables -e.
k6run() {
  etiqueta=$1; script=$2; shift 2
  paso "k6 $etiqueta"
  muestrear "$etiqueta" & MUESTREO=$!
  MSYS_NO_PATHCONV=1 docker run --rm --network udf-loadtest_default -v "$DIR:/scripts" "$@" \
    -e DATOS=/scripts/tokens.json "$K6" run --summary-export "/scripts/$R/$etiqueta.json" "/scripts/$script" \
    > "$R/$etiqueta.txt" 2>&1
  echo "k6 terminó con código $?" >> "$R/$etiqueta.txt"
  kill "$MUESTREO" 2>/dev/null; wait "$MUESTREO" 2>/dev/null
  # ¿Se quedó sin memoria algún worker de PHP o el contenedor?
  {
    echo "oom_contenedor=$(docker inspect -f '{{.State.OOMKilled}}' "$API") reinicios=$(docker inspect -f '{{.RestartCount}}' "$API") estado=$(docker inspect -f '{{.State.Status}}' "$API")"
    echo "workers_terminados_por_senal=$(docker logs "$API" 2>&1 | grep -c 'exited on signal')"
  } > "$R/$etiqueta-contenedor.txt"
  grep -E "http_req_failed|http_reqs|t_envio|t_export|estado_|iterations|dropped|vus_max" "$R/$etiqueta.txt" | head -20
  cat "$R/$etiqueta-contenedor.txt"
  sleep 20
}

paso "Entorno"
{
  echo "fecha: $(date '+%Y-%m-%d %H:%M:%S %z')"
  echo "commit: $(git rev-parse --short HEAD) $(git status --porcelain -- ../DataField_WEB/backend ../deploy | grep -q . && echo '(con cambios sin commit en backend/deploy)')"
  echo "cpu_host: $(powershell.exe -NoProfile -Command '(Get-CimInstance Win32_Processor).Name' 2>/dev/null | tr -d '\r')"
  echo "nucleos_logicos_host: $(powershell.exe -NoProfile -Command '(Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors' 2>/dev/null | tr -d '\r')"
  echo "docker: $(docker version --format '{{.Server.Version}}') cpus_vm=$(docker info --format '{{.NCPU}}') memoria_vm=$(docker info --format '{{.MemTotal}}')"
  echo "imagen_api: $(docker image inspect udf-api-local --format '{{.Id}} {{.Created}}' | cut -c1-90)"
  echo "limites: api 1 CPU / 1 GB, db 1 CPU / 2 GB (compose.yml, iguales a deploy/compose.yml)"
  echo "php-fpm: $(grep -E '^pm\.' ../deploy/api/php-fpm.conf | tr '\n' ' ')"
} | tee "$R/entorno.txt"

paso "Fotos de prueba (PNG válidos rellenados hasta 1, 5 y 30 MB)"
python -I - <<'EOF'
import os
base = open("../DataField_MOVIL/kobo-mobile/public/icons/icon-72x72.png", "rb").read()
# 0.5 MB: lo que pesa una foto después de que la PWA la reduce.
for mb in (0.5, 1, 5, 30):
    destino = f"fotos/foto-{mb:g}mb.png"
    tam = int(mb * 1024 * 1024)
    if not os.path.exists(destino) or os.path.getsize(destino) != tam:
        with open(destino, "wb") as f:
            # Bytes después del cierre del PNG: la imagen sigue siendo válida y pesa lo pedido.
            f.write(base + os.urandom(tam - len(base)))
    print(destino, os.path.getsize(destino))
EOF

paso "Copia local limpia (base nueva) y migraciones"
docker compose down -v >/dev/null 2>&1
STUB_DELAY_MS=0 docker compose up -d >/dev/null 2>&1
until docker compose exec -T api php artisan --version >/dev/null 2>&1; do sleep 2; done
docker compose exec -T api php artisan migrate --force 2>&1 | tail -1

paso "Datos: 400 encuestadores, 3 formularios de 20 preguntas, 100.000 respuestas previas"
docker compose exec -T api php loadtest-seed.php 400 100000 > tokens.json
docker compose exec -T db psql -U postgres -d udf -qAt -c "ANALYZE;" -c "select 'respuestas previas: '||count(*) from form_responses;" | tee -a "$R/entorno.txt"

if [ "$SOLO" = "todas" ]; then
# 1) Los «400 usuarios»: ritmo de campo y estrés sin pausas.
k6run campo-400 k6-campo.js -e PERFIL=campo -e VUS=400
k6run estres-400 k6-campo.js -e PERFIL=estres -e VUS=400

# 2) Envíos con foto (almacenamiento simulado sin demora): 1 y 5 MB con k6.
k6run fotos-1mb-60xmin k6-fotos.js -e MB=1 -e POR_MIN=60 -e DURACION=2m
k6run fotos-5mb-30xmin k6-fotos.js -e MB=5 -e POR_MIN=30 -e DURACION=2m
# 30 MB con curl: k6 arma cada JSON de ~40 MB en su motor de JavaScript y se queda sin memoria antes que
# la API (lo comprobamos: k6 terminó con código 137 y la API seguía casi sin uso).
paso "Fotos con curl (1, 5 y 30 MB uno a la vez; 1, 4, 8 y 12 fotos de 30 MB a la vez)"
sh fotos-curl.sh
sleep 20

# 3) Fotos con 3 s de demora por subida (imita la red hacia SharePoint): la subida ocurre con la fila del
#    formulario bloqueada, así que los envíos al mismo formulario esperan a los anteriores.
paso "Almacenamiento simulado con 3 s por subida"
STUB_DELAY_MS=3000 docker compose up -d almacenamiento >/dev/null 2>&1; sleep 5
k6run fotos-5mb-30xmin-demora3s k6-fotos.js -e MB=5 -e POR_MIN=30 -e DURACION=2m
STUB_DELAY_MS=0 docker compose up -d almacenamiento >/dev/null 2>&1; sleep 5

# 4) Exportaciones simultáneas (memoria). Se espera 65 s entre tandas por el límite de 10/min por persona.
k6run export-csv-6 k6-exportaciones.js -e FORMATO=csv -e N=6
sleep 45
k6run export-xlsx-5 k6-exportaciones.js -e FORMATO=xlsx -e N=5
sleep 45
fi

# 5) Mixta: los 400 encuestadores + fotos ya reducidas por la PWA (0,5 MB, 30/min) + 6 exportaciones CSV
#    al minuto 3, todo en la misma corrida. Con 3 s por subida, como la red hacia SharePoint.
paso "Almacenamiento simulado con 3 s por subida (mixta)"
STUB_DELAY_MS=3000 docker compose up -d almacenamiento >/dev/null 2>&1; sleep 5
k6run mixta-400-fotos-export k6-mixta.js -e VUS=400 -e MB=0.5 -e POR_MIN=30 -e N=6 -e FORMATO=csv
STUB_DELAY_MS=0 docker compose up -d almacenamiento >/dev/null 2>&1; sleep 5

# 6) IP compartida: los 400 encuestadores llegan con la MISMA IP (una brigada o un campus detrás de una
#    red). Con el límite antiguo (60 envíos/min por IP) buena parte de los envíos recibía 429; ahora el
#    límite es por persona y no debe haber ninguno.
k6run ip-compartida-400 k6-campo.js -e PERFIL=campo -e VUS=400 -e IP_COMPARTIDA=203.0.113.10

paso "Listo. Resultados en $R/"
ls "$R"
