// Loads .env.local (preferred, git-ignored) or .env for the CLI scripts.
// Next.js loads these files by itself; plain Node scripts need this helper.
// First run convenience: if neither file exists, .env.local is created from
// .env.example with a freshly generated random JWT_SECRET.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

const cwd = process.cwd();
const local = path.join(cwd, '.env.local');
if (!fs.existsSync(local) && !fs.existsSync(path.join(cwd, '.env')) && fs.existsSync(path.join(cwd, '.env.example'))) {
  const template = fs.readFileSync(path.join(cwd, '.env.example'), 'utf8');
  fs.writeFileSync(local, template.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${crypto.randomBytes(32).toString('hex')}`));
  console.log('• created .env.local from .env.example (random JWT_SECRET). Edit DATABASE_URL there if needed.');
}
for (const file of ['.env.local', '.env']) {
  const p = path.join(cwd, file);
  if (fs.existsSync(p)) dotenv.config({ path: p, quiet: true });
}
if (!process.env.DATABASE_URL) {
  console.error('\n✖ DATABASE_URL is not set.\n  Copy .env.example to .env.local and edit it (see README).\n');
  process.exit(1);
}
