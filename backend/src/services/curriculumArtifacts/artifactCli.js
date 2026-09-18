const { parseArgs } = require('node:util');
const fs = require('node:fs/promises');
const { createArtifactService, ArtifactServiceError } = require('./artifactService');
const HELP = `Curriculum artifact operations (no .env auto-loading)
Default: dry-run --version ID
Commands: persist --file JSON; inspect --version ID; review --version ID --state STATE --revision N;
          dry-run --version ID; import --version ID
All commands require CURRICULUM_DATABASE_URL and --target host:port/database matching that URL.
Writes (persist/review/import) additionally require --write.
Options: --reviewer REF --notes TEXT --actor REF --select-current
No automatic approval, fallback target, import, or retry.`;
function options(argv, env) {
  const { values: v, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
    help: { type: 'boolean' }, write: { type: 'boolean' }, 'select-current': { type: 'boolean' },
    target: { type: 'string' }, version: { type: 'string' }, file: { type: 'string' }, state: { type: 'string' }, revision: { type: 'string' },
    reviewer: { type: 'string' }, notes: { type: 'string' }, actor: { type: 'string' }
  } });
  if (v.help) return { help: true };
  const command = positionals[0] || 'dry-run';
  if (positionals.length > 1 || !['persist', 'inspect', 'review', 'dry-run', 'import'].includes(command)) throw new ArtifactServiceError('INVALID_COMMAND');
  const write = ['persist', 'review', 'import'].includes(command);
  if (write && !v.write) throw new ArtifactServiceError('EXPLICIT_WRITE_REQUIRED');
  if (!write && v.write) throw new ArtifactServiceError('WRITE_FLAG_NOT_APPLICABLE');
  if (v['select-current'] && command !== 'persist') throw new ArtifactServiceError('INVALID_OPTIONS');
  if (command === 'persist' ? !v.file : !v.version) throw new ArtifactServiceError('MISSING_FILE_OR_VERSION');
  if (command === 'review' && (!v.state || !/^\d+$/.test(v.revision || '') || !Number.isSafeInteger(Number(v.revision)))) throw new ArtifactServiceError('REVIEW_STATE_AND_REVISION_REQUIRED');
  let url;
  try { url = new URL(env.CURRICULUM_DATABASE_URL); } catch { throw new ArtifactServiceError('EXPLICIT_DATABASE_TARGET_REQUIRED'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2 || v.target !== `${url.hostname}:${url.port || '5432'}${url.pathname}`) throw new ArtifactServiceError('DATABASE_TARGET_MISMATCH');
  return { command, values: v, connectionString: env.CURRICULUM_DATABASE_URL };
}
function defaultClient(connectionString) {
  const { PrismaClient, Prisma } = require('@prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  return { db: new PrismaClient({ adapter: new PrismaPg({ connectionString }) }), dbNull: Prisma.DbNull };
}
async function run(argv, { env = process.env, clientFactory = defaultClient } = {}) {
  const o = options(argv, env);
  if (o.help) return HELP;
  // Read/parse local input before opening a client.
  const artifact = o.command === 'persist' ? JSON.parse(await fs.readFile(o.values.file, 'utf8')) : null;
  const { db, dbNull } = clientFactory(o.connectionString), service = createArtifactService(db, { dbNull }), v = o.values;
  try {
    switch (o.command) {
      case 'persist': return await service.persist(artifact, { generatedBy: v.actor, selectCurrent: Boolean(v['select-current']) });
      case 'inspect': return await service.inspect(v.version);
      case 'review': return await service.review(v.version, v.state, { expectedRevision: Number(v.revision), reviewerReference: v.reviewer, notes: v.notes });
      case 'import': return await service.importVersion(v.version, { importedBy: v.actor });
      default: return await service.dryRun(v.version);
    }
  } finally { await db.$disconnect(); }
}
function safeError(error) {
  if (error instanceof ArtifactServiceError) return { error: error.code, ...(error.code === 'IMPORT_BLOCKED' ? { conflicts: error.details.conflicts } : {}) };
  if (['P2002', 'P2034'].includes(error?.code)) return { error: 'CONCURRENT_CONFLICT', instruction: 'Inspect current state and re-plan; no automatic retry performed.' };
  if (error?.code === 'CURRICULUM_ARTIFACT_INVALID') return { error: 'CURRICULUM_ARTIFACT_INVALID' };
  return { error: 'OPERATION_FAILED', instruction: 'Check configuration, input and database availability. Provider details are suppressed.' };
}
if (require.main === module) run(process.argv.slice(2)).then(result => console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2))).catch(error => { console.error(JSON.stringify(safeError(error))); process.exitCode = 1; });
module.exports = { run, options, safeError };
