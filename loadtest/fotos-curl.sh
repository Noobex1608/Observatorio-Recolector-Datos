#!/bin/sh
# Envíos con foto medidos con curl (complementa k6-fotos.js). k6 arma cada JSON de ~40 MB en su motor de
# JavaScript y con fotos de 30 MB se queda sin memoria antes que la API; curl envía el cuerpo desde disco.
# Uso (desde loadtest/, con la copia local arriba y tokens.json sembrado): sh fotos-curl.sh
# Deja resultados/fotos-curl.txt y resultados/recursos-fotos-curl-30mb-*.csv
set -u
cd "$(dirname "$0")"
R=resultados
mkdir -p "$R" fotos/cuerpos

python -I - <<'EOF'
import base64, json, uuid
d = json.load(open("tokens.json", encoding="utf-8"))
form = d["media_form"]
fotos = {mb: "data:image/png;base64," + base64.b64encode(open(f"fotos/foto-{mb}mb.png", "rb").read()).decode() for mb in (1, 5, 30)}
def cuerpo(mb):
    data = {"_consentimiento_aceptado": True}
    for q in form["questions"]:
        if q["type"] == "MULTIMEDIA":
            if mb: data[q["id"]] = {"dataUrl": fotos[mb], "mediaType": "IMAGE"}
        else:
            data[q["id"]] = "Dato de prueba curl"
    return json.dumps({"client_submission_id": str(uuid.uuid4()), "form_id": form["id"], "data": data})
# Cada archivo lleva su propio client_submission_id (si se repitiera, la API devolvería el envío existente).
for mb in (1, 5, 30):
    for i in range(1, 4):
        open(f"fotos/cuerpos/seq-{mb}mb-{i}.json", "w").write(cuerpo(mb))
for n in (1, 4, 8, 12):
    for i in range(1, n + 1):
        open(f"fotos/cuerpos/par{n}-30mb-{i}.json", "w").write(cuerpo(30))
# Un token distinto por envío paralelo (límite de 30 envíos/min por persona y formulario).
with open("fotos/cuerpos/tokens.txt", "w") as f:
    f.write("\n".join(u["token"] for u in d["users"][:16]))
EOF

API=udf-loadtest-api-1
curl_en_red() {
  MSYS_NO_PATHCONV=1 docker run --rm --network udf-loadtest_default -v "$(pwd -W 2>/dev/null || pwd)/fotos/cuerpos:/c:ro" \
    --entrypoint sh udf-api-base -c "$1"
}
FORMATO='%{http_code} subida=%{size_upload}B total=%{time_total}s'

{
  echo "== Envíos uno a la vez (3 por tamaño): código HTTP, bytes subidos y tiempo total"
  for mb in 1 5 30; do
    for i in 1 2 3; do
      printf '%s MB #%s: ' "$mb" "$i"
      curl_en_red "curl -s -o /dev/null -w '$FORMATO' -X POST http://api:8080/api/mobile/submit \
        -H 'Authorization: Bearer '\$(sed -n ${i}p /c/tokens.txt) -H 'Accept: application/json' \
        -H 'Content-Type: application/json' -H 'X-Forwarded-For: 203.0.113.$i' --data-binary @/c/seq-${mb}mb-$i.json"
      echo
    done
  done
} | tee "$R/fotos-curl.txt"

for n in 1 4 8 12; do
  echo "== $n envíos de 30 MB a la vez" | tee -a "$R/fotos-curl.txt"
  archivo="$R/recursos-fotos-curl-30mb-x$n.csv"
  echo "hora,contenedor,cpu,memoria" > "$archivo"
  ( while :; do docker stats --no-stream --format "{{.Name}},{{.CPUPerc}},{{.MemUsage}}" "$API" | sed "s/^/$(date '+%H:%M:%S'),/" >> "$archivo"; done ) &
  MUESTREO=$!
  inicio=$(date +%s)
  curl_en_red "for i in \$(seq 1 $n); do
      curl -s -o /dev/null -w \"#\$i $FORMATO\n\" -X POST http://api:8080/api/mobile/submit \
        -H \"Authorization: Bearer \$(sed -n \${i}p /c/tokens.txt)\" -H 'Accept: application/json' \
        -H 'Content-Type: application/json' -H \"X-Forwarded-For: 203.0.114.\$i\" --data-binary @/c/par$n-30mb-\$i.json &
    done; wait" | tee -a "$R/fotos-curl.txt"
  echo "tanda completa en $(( $(date +%s) - inicio )) s" | tee -a "$R/fotos-curl.txt"
  kill "$MUESTREO" 2>/dev/null; wait "$MUESTREO" 2>/dev/null
  echo "memoria máxima de la API: $(awk -F, 'NR>1{split($4,a," "); print a[1]}' "$archivo" | sort -h | tail -1)" | tee -a "$R/fotos-curl.txt"
  echo "oom_contenedor=$(docker inspect -f '{{.State.OOMKilled}}' $API) workers_terminados_por_senal=$(docker logs $API 2>&1 | grep -c 'exited on signal')" | tee -a "$R/fotos-curl.txt"
  sleep 15
done
rm -rf fotos/cuerpos
