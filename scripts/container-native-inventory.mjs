// Build-time ELF/package inventory only. Never connects to a database or API.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, realpathSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const directory = '/usr/local/share/hispafly';
const pins = JSON.parse(readFileSync(`${directory}/runtime-packages.json`, 'utf8'));
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
assert.equal(process.platform, 'linux');
assert.equal(process.arch, 'x64');
const packages = new Map();
function installed(name) {
  const [binary, version, status] = run('dpkg-query', ['-W', '-f=${binary:Package}\t${Version}\t${db:Status-Status}', name]).split('\t');
  assert.equal(status, 'installed', `package not installed: ${name}`);
  const result = { name: binary.split(':')[0], version, binary };
  packages.set(result.name, result);
  return result;
}
for (const [name, version] of Object.entries(pins.packages)) assert.equal(installed(name).version, version);
assert.equal(run('dpkg', ['--verify', 'libssl3']), '', 'libssl3 files differ from installed package records');
function owner(file) {
  const canonical = realpathSync(file);
  const aliases = new Set([file, canonical, canonical.replace(/^\/usr\/lib\//, '/lib/'), canonical.replace(/^\/usr\/lib64\//, '/lib64/')]);
  for (const candidate of aliases) {
    let output;
    try { output = run('dpkg-query', ['-S', candidate]); } catch { continue; }
    for (const line of output.split('\n')) {
      const at = line.indexOf(': /');
      if (at < 0) continue;
      return { manager: 'dpkg', ...installed(line.slice(0, at)) };
    }
  }
  // Bundled npm native libraries (for example sharp/libvips) need npm ownership.
  if (canonical.startsWith('/app/node_modules/')) {
    for (let current = path.dirname(canonical); current.startsWith('/app/node_modules/'); current = path.dirname(current)) {
      const manifest = path.join(current, 'package.json');
      if (!existsSync(manifest)) continue;
      const data = JSON.parse(readFileSync(manifest, 'utf8'));
      if (typeof data.name === 'string' && typeof data.version === 'string') return { manager: 'npm', name: data.name, version: data.version };
    }
  }
  throw new Error(`unattributed runtime library: ${canonical}`);
}
const libraries = new Map();
function record(file) {
  const canonical = realpathSync(file);
  if (!libraries.has(canonical)) libraries.set(canonical, { path: canonical, sha256: hash(canonical), owner: owner(file) });
  return libraries.get(canonical);
}
for (const required of pins.requiredLibraries) {
  const item = record(required.path);
  assert.equal(item.owner.manager, 'dpkg');
  assert.equal(item.owner.name, required.package);
  assert.equal(item.owner.version, pins.packages[required.package]);
}
assert(run('openssl', ['version']).startsWith('OpenSSL 3.0.22 '), 'unexpected OpenSSL runtime');
const binaries = [process.execPath, '/usr/bin/openssl'];
function walk(current) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const file = path.join(current, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && (entry.name.endsWith('.node') || /\.so(?:\.|$)/.test(entry.name))) binaries.push(file);
  }
}
walk('/app/node_modules');
assert(binaries.some((file) => file.endsWith('libquery_engine-debian-openssl-3.0.x.so.node')), 'missing Prisma OpenSSL 3 engine');
for (const binary of binaries) {
  const output = run('ldd', [binary]);
  assert(!output.includes('not found'), `unresolved native library: ${binary}`);
  for (const line of output.split('\n')) {
    const match = line.match(/=>\s+(\/\S+)/) || line.match(/^\s*(\/\S+)/);
    if (match) record(match[1]);
  }
}
writeFileSync(`${directory}/runtime-native-inventory.json`, JSON.stringify({
  platform: pins.platform,
  nodeVersion: process.versions.node,
  nodeBundledOpenSSL: process.versions.openssl,
  packages: [...packages.values()],
  requiredLibraries: pins.requiredLibraries,
  libraries: [...libraries.values()],
  checkedBinaryCount: binaries.length,
}, null, 2) + '\n');
console.log('PASS: installed OpenSSL versions, Prisma engine and native-library ownership');
