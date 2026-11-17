// Falla si `npm audit` reporta avisos high/critical, salvo los IDs GHSA pasados como argumentos.
// npm audit no tiene --ignore (bun audit sí); se usa solo para avisos sin versión corregida publicada.
// Uso: node .github/ci/npm-audit-high.mjs GHSA-xxxx-xxxx-xxxx [...]
import { execFileSync } from 'node:child_process';

const ignored = new Set(process.argv.slice(2).map((id) => id.toUpperCase()));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

let raw;
try {
  raw = execFileSync(npm, ['audit', '--json'], { encoding: 'utf8', shell: process.platform === 'win32' });
} catch (error) {
  // npm audit sale con código 1 cuando encuentra avisos; el JSON sigue en stdout.
  raw = error.stdout;
  if (!raw) throw error;
}

const report = JSON.parse(raw);
const blocking = new Map();
const skipped = new Set();

for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== 'object' || !['high', 'critical'].includes(via.severity)) continue;
    const id = String(via.url ?? '').split('/').pop().toUpperCase();
    if (ignored.has(id)) {
      skipped.add(`${id} (${via.name})`);
    } else {
      blocking.set(`${id}|${via.name}`, `${via.severity}: ${via.name} ${via.range} - ${via.title} ${via.url}`);
    }
  }
}

for (const id of skipped) console.log(`Ignorado (sin versión corregida): ${id}`);

if (blocking.size > 0) {
  console.error('Avisos high/critical sin resolver:');
  for (const line of blocking.values()) console.error(`  ${line}`);
  process.exit(1);
}

console.log('npm audit: sin avisos high/critical pendientes.');
