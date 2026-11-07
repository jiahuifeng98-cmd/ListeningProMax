import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
await build({ entryPoints: ['src/main/main.ts'], outfile: 'out/main.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'] });
await build({ entryPoints: ['src/main/preload.ts'], outfile: 'out/preload.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'] });
await build({ entryPoints: ['src/main/db-worker.ts'], outfile: 'out/db-worker.cjs', bundle: true, platform: 'node', format: 'cjs' });
await build({ entryPoints: ['src/main/segmenter.ts'], outfile: 'out/segmenter.cjs', bundle: true, platform: 'node', format: 'cjs' });
await viteBuild();
