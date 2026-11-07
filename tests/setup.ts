import fs from 'node:fs';
import path from 'node:path';

// Fresh source checkouts do not contain ignored application/cache directories.
fs.mkdirSync(path.resolve('cache'), {recursive:true});
