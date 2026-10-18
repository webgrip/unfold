import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinnedOpenCodeVersion } from './opencode-version.mjs';

const platforms = { linux: 'linux', darwin: 'darwin' };
const architectures = { x64: 'x64', arm64: 'arm64' };
const platform = platforms[process.platform];
const architecture = architectures[process.arch];
if (!platform || !architecture) throw new Error(`No OpenCode build for ${process.platform}/${process.arch}`);
const name = `opencode-${platform}-${architecture}`;
const directory = join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'unfold', 'opencode', `${name}-${pinnedOpenCodeVersion}`);
const binary = join(directory, 'package', 'bin', 'opencode');
if (!existsSync(binary)) {
  mkdirSync(directory, { recursive: true });
  execFileSync('npm', ['pack', '--quiet', '--pack-destination', directory, `${name}@${pinnedOpenCodeVersion}`], { stdio: 'inherit' });
  execFileSync('tar', ['-xzf', join(directory, `${name}-${pinnedOpenCodeVersion}.tgz`), '-C', directory], { stdio: 'inherit' });
}
const reported = execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim();
if (reported !== pinnedOpenCodeVersion) throw new Error(`${binary} reports ${reported}, but ops/agent/Dockerfile pins ${pinnedOpenCodeVersion}`);
const tests = fileURLToPath(new URL('../test/opencode-contract.test.ts', import.meta.url));
const run = spawnSync(process.execPath, ['--test', '--test-force-exit', tests], { stdio: 'inherit', env: { ...process.env, UNFOLD_OPENCODE_BINARY: binary } });
process.exit(run.status ?? 1);
