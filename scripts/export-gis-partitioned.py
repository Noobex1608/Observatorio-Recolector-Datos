import argparse
import hashlib
import os
import json
from pathlib import Path
from osgeo import ogr, osr

def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description="Exporta capas GIS particionadas en EPSG:4326")
parser.add_argument("--input", type=Path, default=ROOT / "resource/gis/MGN26_sirgas.gpkg")
parser.add_argument("--output", type=Path, default=ROOT / "Barometro_WEB/frontend/public/assets/gis")
parser.add_argument("--source-epsg", type=int, default=31992)
args = parser.parse_args()
GPKG_PATH = str(args.input.resolve())
OUTPUT_DIR = str(args.output.resolve())

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(os.path.join(OUTPUT_DIR, "sectores"), exist_ok=True)
os.makedirs(os.path.join(OUTPUT_DIR, "manzanas"), exist_ok=True)

src_srs = osr.SpatialReference()
src_srs.ImportFromEPSG(args.source_epsg)
src_srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
tgt_srs = osr.SpatialReference()
tgt_srs.ImportFromEPSG(4326)
tgt_srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
transform = osr.CoordinateTransformation(src_srs, tgt_srs)

ds = ogr.Open(GPKG_PATH)
if not ds:
    raise SystemExit(f"No se pudo abrir GeoPackage: {GPKG_PATH}")


def checked_layer(name: str):
    layer = ds.GetLayerByName(name)
    if layer is None:
        raise RuntimeError(f"Falta la capa requerida: {name}")
    layer_srs = layer.GetSpatialRef()
    if layer_srs is None:
        raise RuntimeError(f"La capa {name} no declara CRS")
    layer_srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    if not layer_srs.IsSame(src_srs):
        raise RuntimeError(f"El CRS de {name} no coincide con EPSG:{args.source_epsg}")
    return layer

print("1. Exporting Parroquias (aream_a)...")
parroquias_lyr = checked_layer("aream_a")
parroquias_features = []

for feat in parroquias_lyr:
    geom = feat.GetGeometryRef()
    if geom:
        if not geom.IsValid():
            raise RuntimeError(f"Geometría de parroquia inválida: {feat.GetFID()}")
        geom.Transform(transform)
        g_str = geom.ExportToJson(options=['COORDINATE_PRECISION=6'])
        g_json = json.loads(g_str)
        p = str(feat.GetField("parroq") or "").strip()
        n = str(feat.GetField("nom_aman") or f"Parroquia {p}").strip()
        parroquias_features.append({
            "type": "Feature",
            "properties": {
                "cod_parroquia": p,
                "parroquia": p,
                "nombre": n
            },
            "geometry": g_json
        })

with open(os.path.join(OUTPUT_DIR, "parroquias.geojson"), "w", encoding="utf-8") as f:
    json.dump({"type": "FeatureCollection", "features": parroquias_features}, f, ensure_ascii=False)
print(f"Exported {len(parroquias_features)} parroquias.")

print("2. Partitioning Sectores (sec_a) by cod_parroquia...")
sectores_lyr = checked_layer("sec_a")
sectores_by_parroquia = {}

count = 0
for feat in sectores_lyr:
    count += 1
    geom = feat.GetGeometryRef()
    if not geom:
        continue
    
    try:
        if not geom.IsValid():
            raise ValueError("Geometría de sector inválida")
        geom.Transform(transform)
        g_str = geom.ExportToJson(options=['COORDINATE_PRECISION=6'])
        g_json = json.loads(g_str)
        sec_code = str(feat.GetField("sec") or "").strip()
        parr_code = str(feat.GetField("parroquia") or "").strip()
        if not parr_code and len(sec_code) >= 6:
            parr_code = sec_code[:6]
        
        if not parr_code:
            continue
        
        feature_item = {
            "type": "Feature",
            "properties": {
                "cod_parroquia": parr_code,
                "parroquia": parr_code,
                "cod_sector": sec_code,
                "sec": sec_code,
                "nombre": f"Sector {sec_code}"
            },
            "geometry": g_json
        }
        
        if parr_code not in sectores_by_parroquia:
            sectores_by_parroquia[parr_code] = []
        sectores_by_parroquia[parr_code].append(feature_item)
    except Exception as exc:
        raise RuntimeError(f"Sector inválido en feature {feat.GetFID()}") from exc

print(f"Writing {len(sectores_by_parroquia)} sector partition files...")
for parr_code, feat_list in sectores_by_parroquia.items():
    filePath = os.path.join(OUTPUT_DIR, "sectores", f"{parr_code}.json")
    with open(filePath, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": feat_list}, f, ensure_ascii=False)

print("3. Partitioning Manzanas (man_a) by cod_parroquia...")
manzanas_lyr = checked_layer("man_a")
manzanas_by_parroquia = {}

count = 0
for feat in manzanas_lyr:
    count += 1
    geom = feat.GetGeometryRef()
    if not geom:
        continue
    
    try:
        if not geom.IsValid():
            raise ValueError("Geometría de manzana inválida")
        geom.Transform(transform)
        g_str = geom.ExportToJson(options=['COORDINATE_PRECISION=6'])
        g_json = json.loads(g_str)
        man_code = str(feat.GetField("man") or "").strip()
        if not man_code or len(man_code) < 6:
            continue
        
        parr_code = man_code[:6]
        sec_code = man_code[:12] if len(man_code) >= 12 else ""
        
        feature_item = {
            "type": "Feature",
            "properties": {
                "cod_parroquia": parr_code,
                "cod_sector": sec_code,
                "cod_manzana": man_code,
                "man": man_code,
                "nombre": f"Manzana {man_code}"
            },
            "geometry": g_json
        }
        
        if parr_code not in manzanas_by_parroquia:
            manzanas_by_parroquia[parr_code] = []
        manzanas_by_parroquia[parr_code].append(feature_item)
    except Exception as exc:
        raise RuntimeError(f"Manzana inválida en feature {feat.GetFID()}") from exc

print(f"Writing {len(manzanas_by_parroquia)} manzana partition files...")
for parr_code, feat_list in manzanas_by_parroquia.items():
    filePath = os.path.join(OUTPUT_DIR, "manzanas", f"{parr_code}.json")
    with open(filePath, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": feat_list}, f, ensure_ascii=False)

print("ALL GIS PARTITIONS EXPORTED SUCCESSFULLY!")

manifest = {
    "source": str(args.input.resolve()),
    "source_sha256": sha256_file(args.input),
    "source_epsg": args.source_epsg,
    "target_epsg": 4326,
    "files": {},
}
for output_file in sorted(args.output.rglob("*.json")) + sorted(args.output.rglob("*.geojson")):
    manifest["files"][str(output_file.relative_to(args.output)).replace("\\", "/")] = {
        "sha256": sha256_file(output_file),
        "bytes": output_file.stat().st_size,
    }
(args.output / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"Manifest: {args.output / 'manifest.json'}")
