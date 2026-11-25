#!/bin/sh
# Corre k6-escritura.js a varios ritmos y guarda el resumen de cada uno en resultados/<etiqueta>-<rate>.txt
# Uso (desde loadtest/, con el stack de compose.yml arriba): sh correr-escritura.sh <etiqueta> [ritmos...]
# Ej.: sh correr-escritura.sh sin-indices 10 20 30
ETIQUETA=${1:?etiqueta}
shift
RITMOS=${*:-10 20 30}
DIR=$(pwd -W 2>/dev/null || pwd)
mkdir -p resultados
for RATE in $RITMOS; do
  echo "== $ETIQUETA  $RATE envíos/s"
  MSYS_NO_PATHCONV=1 docker run --rm --network udf-loadtest_default -v "$DIR:/scripts" \
    -e RATE="$RATE" -e DURACION="${DURACION:-90s}" -e DATOS=/scripts/tokens-escritura.json \
    grafana/k6:1.3.0 run -q /scripts/k6-escritura.js > "resultados/$ETIQUETA-$RATE.txt" 2>&1
  grep -E "t_envio\.|http_req_failed\.|iterations\.|dropped_iterations|envios_rechazados" "resultados/$ETIQUETA-$RATE.txt"
  sleep 10
done
