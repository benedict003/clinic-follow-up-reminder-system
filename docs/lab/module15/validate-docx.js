// docs/lab/module15/validate-docx.js
//
// Validates a generated .docx the way Word does, rather than the way a lenient
// markdown converter does. Written after Word refused a package that parsed fine
// everywhere else: the body used the `wp:` prefix for image markup without ever
// declaring it, so document.xml was not well-formed XML.
//
//   node docs/lab/module15/validate-docx.js Module15/Module15.docx
//
// Checks, in order of how often each one has actually broken a file:
//   1. every element prefix is declared (root or inline)
//   2. the XML parses under a strict parser
//   3. every r:embed resolves to a relationship, and IDs are unique
//   4. [Content_Types].xml declares png exactly once and an Override for document.xml
//   5. zip entry names use forward slashes
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('usage: node validate-docx.js <path-to-docx>');
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), 'docxcheck-'));
let failures = 0;
const ok = (msg) => console.log(`  ok    ${msg}`);
const bad = (msg) => { failures += 1; console.log(`  FAIL  ${msg}`); };

try {
  execFileSync('powershell', ['-NoProfile', '-Command',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem; '
    + `[System.IO.Compression.ZipFile]::ExtractToDirectory('${file}', '${work}')`]);

  const docPath = join(work, 'word', 'document.xml');
  const xml = readFileSync(docPath, 'utf8');
  console.log(`${file} (${Math.round(xml.length / 1024)} KB of document XML)`);

  // 1. prefixes
  const root = (xml.match(/<w:document\b[^>]*>/) || [''])[0];
  const declared = new Set([...xml.matchAll(/xmlns:([A-Za-z0-9]+)="/g)].map((m) => m[1]));
  const used = new Set([...xml.matchAll(/<([A-Za-z0-9]+):[A-Za-z0-9]/g)].map((m) => m[1]));
  const missing = [...used].filter((pfx) => !declared.has(pfx));
  if (missing.length === 0) ok(`all prefixes declared (${[...used].join(', ')})`);
  else bad(`undeclared prefix(es): ${missing.join(', ')}`);
  if (root.length === 0) bad('no <w:document> root element');

  // 2. strict parse, run in PowerShell so the result is not entangled with stdout
  const parseScript = join(work, 'parse.ps1');
  writeFileSync(parseScript,
    '$ErrorActionPreference = "Stop"\n'
    + 'try { $null = [xml](Get-Content -Raw -Encoding UTF8 $args[0]); "OK" }\n'
    + 'catch { "ERR " + $_.Exception.Message.Split("`n")[0] }\n');
  const parsed = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', parseScript, docPath], { encoding: 'utf8' }).trim();
  if (parsed.startsWith('OK')) ok('document.xml is well-formed XML');
  else bad(`document.xml parse error: ${parsed.slice(0, 160)}`);

  // 3. image relationships
  const rels = readFileSync(join(work, 'word', '_rels', 'document.xml.rels'), 'utf8');
  const relIds = [...rels.matchAll(/Id="([^"]+)"/g)].map((m) => m[1]);
  const dupes = relIds.filter((id, i) => relIds.indexOf(id) !== i);
  const embeds = [...xml.matchAll(/r:embed="([^"]+)"/g)].map((m) => m[1]);
  const unresolved = embeds.filter((id) => !relIds.includes(id));
  if (dupes.length === 0) ok(`${relIds.length} relationship ids, all unique`);
  else bad(`duplicate relationship id(s): ${[...new Set(dupes)].join(', ')}`);
  if (unresolved.length === 0) ok(`${embeds.length} embedded images, all resolved`);
  else bad(`unresolved r:embed id(s): ${unresolved.join(', ')}`);
  for (const target of [...rels.matchAll(/Target="(media\/[^"]+)"/g)].map((m) => m[1])) {
    try {
      readFileSync(join(work, 'word', target.replace(/\//g, '\\')));
    } catch {
      bad(`relationship points at a missing part: ${target}`);
    }
  }

  // 4. content types
  const ct = readFileSync(join(work, '[Content_Types].xml'), 'utf8');
  const pngDefaults = (ct.match(/Extension="png"/g) || []).length;
  if (pngDefaults === 1) ok('png default declared once');
  else bad(`png default declared ${pngDefaults} times (must be exactly 1)`);
  if (/PartName="\/word\/document\.xml"/.test(ct)) ok('document.xml override present');
  else bad('no Override for /word/document.xml');

  // 5. zip entry names
  const listing = execFileSync('powershell', ['-NoProfile', '-Command',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem; '
    + `[System.IO.Compression.ZipFile]::OpenRead('${file}').Entries | ForEach-Object { $_.FullName }`],
  { encoding: 'utf8' }).trim().split(/\r?\n/);
  const backslashes = listing.filter((n) => n.includes('\\'));
  if (backslashes.length === 0) ok(`${listing.length} zip entries, forward slashes`);
  else bad(`${backslashes.length} entries use backslashes: ${backslashes[0]}`);

  console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} problem(s))`);
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
