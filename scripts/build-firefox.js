import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist/firefox');
const archive = join(root, 'dist/pointa-firefox.zip');
const manifest = JSON.parse(await readFile(join(root, 'extension/manifest.json'), 'utf8'));

manifest.background = { scripts: ['browser-api.js', 'background/background.js'] };
manifest.permissions = manifest.permissions.filter(permission => permission !== 'debugger');
manifest.host_permissions = manifest.host_permissions.map(pattern => pattern.replace(/^http:/, '*:'));
manifest.browser_specific_settings = {
  gecko: {
    id: 'pointa@pointa.dev',
    strict_min_version: '140.0',
    data_collection_permissions: {
      required: ['browsingActivity', 'websiteContent', 'websiteActivity']
    }
  }
};
delete manifest.privacy_policy;

await mkdir(join(root, 'dist'), { recursive: true });
await rm(output, { recursive: true, force: true });
await cp(join(root, 'extension'), output, {
  recursive: true,
  filter: source => !['dist', '.DS_Store'].includes(source.split('/').pop()) && !source.endsWith('.zip')
});
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await rm(archive, { force: true });
execFileSync('zip', ['-qr', archive, '.'], { cwd: output });
console.log(`Firefox extension: ${output}\nUnsigned package: ${archive}`);
