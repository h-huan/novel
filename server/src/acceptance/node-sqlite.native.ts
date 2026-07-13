import { createRequire } from 'node:module';
const nativeRequire = createRequire(__filename);
export const DatabaseSync = nativeRequire('node:sqlite').DatabaseSync;
