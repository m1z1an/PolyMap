import { cp, mkdir, readdir, stat } from 'node:fs/promises';

const source = new URL('../frontend/dist/', import.meta.url);
const target = new URL('../dist/', import.meta.url);
if (!(await stat(new URL('index.html', source))).isFile()) {
  throw new Error('Сначала соберите frontend.');
}

await mkdir(target, { recursive: true });
if ((await readdir(target)).length) {
  throw new Error('Удалите предыдущую папку dist в корне перед подготовкой новой сборки.');
}
await cp(source, target, { recursive: true });
