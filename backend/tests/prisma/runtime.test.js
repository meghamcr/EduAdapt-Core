const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const filename = path.resolve(__dirname, '../../src/prismaClient.js');
const source = fs.readFileSync(filename, 'utf8');
const runtimeUrl = 'postgresql://synthetic:PRIVATE_RUNTIME_PASSWORD@localhost:6543/synthetic';

function harness(env = {}, fileEnv = {}) {
  const calls = { clients: [], adapters: [], dotenv: [], logs: [] };
  class PrismaPg { constructor(options) { calls.adapters.push(options); } }
  class PrismaClient { constructor(options) { calls.clients.push(options); } }
  const context = vm.createContext({ URL, process: { env: { ...env } }, __dirname: path.dirname(filename),
    console: { log: (...args) => calls.logs.push(args), error: (...args) => calls.logs.push(args) },
    require(name) {
      if (name === 'node:path') return path;
      if (name === '@prisma/client') return { PrismaClient };
      if (name === '@prisma/adapter-pg') return { PrismaPg };
      if (name === 'dotenv') return { config(options) {
        calls.dotenv.push(options);
        for (const [key, value] of Object.entries(fileEnv)) if (context.process.env[key] === undefined) context.process.env[key] = value;
      } };
      throw new Error('Unexpected dependency');
    }
  });
  return { calls, load() { context.module = { exports: {} }; vm.runInContext(`(function(){${source}\n})()`, context); return context.module.exports; } };
}

test('CommonJS runtime constructs adapter with DATABASE_URL, never DIRECT_URL', () => {
  const h = harness({ DATABASE_URL: runtimeUrl, DIRECT_URL: 'postgresql://admin:PRIVATE_ADMIN_PASSWORD@localhost/admin' });
  const client = h.load();
  assert.equal(h.calls.clients.length, 1); assert.equal(h.calls.adapters.length, 1);
  assert.equal(h.calls.adapters[0].connectionString, runtimeUrl);
  assert.ok(h.calls.clients[0].adapter); assert.equal(typeof client, 'object');
  assert.equal(h.calls.logs.length, 0);
});

test('backend .env path is stable and process environment takes precedence', () => {
  const h = harness({ DATABASE_URL: runtimeUrl }, { DATABASE_URL: 'postgresql://file@localhost/file' });
  h.load(); assert.equal(h.calls.adapters[0].connectionString, runtimeUrl);
  assert.equal(h.calls.dotenv[0].path, path.resolve(__dirname, '../../.env'));
  assert.equal(h.calls.dotenv[0].quiet, true);
  const fileOnly = harness({}, { DATABASE_URL: runtimeUrl }); fileOnly.load();
  assert.equal(fileOnly.calls.adapters[0].connectionString, runtimeUrl);
});

test('missing, empty and malformed runtime configuration fails without secrets or adapter creation', () => {
  for (const value of [undefined, '', ' ', 'PRIVATE_RUNTIME_PASSWORD', 'https://user:PRIVATE_RUNTIME_PASSWORD@example.invalid/db', 'postgresql://']) {
    const h = harness({ DATABASE_URL: value, DIRECT_URL: runtimeUrl });
    assert.throws(() => h.load(), e => {
      assert.equal(e.code, 'PRISMA_RUNTIME_CONFIG_INVALID');
      assert.equal(String(e.stack).includes('PRIVATE_RUNTIME_PASSWORD'), false);
      assert.equal(e.cause, undefined); return true;
    });
    assert.equal(h.calls.clients.length, 0); assert.equal(h.calls.adapters.length, 0); assert.equal(h.calls.logs.length, 0);
  }
});

test('development reloads share one client and adapter', () => {
  const h = harness({ DATABASE_URL: runtimeUrl, NODE_ENV: 'development' });
  assert.equal(h.load(), h.load()); assert.equal(h.calls.clients.length, 1); assert.equal(h.calls.adapters.length, 1);
});

test('production does not reuse a development global client', () => {
  const h = harness({ DATABASE_URL: runtimeUrl, NODE_ENV: 'production' });
  assert.notEqual(h.load(), h.load()); // Normal production imports use Node's module cache.
  assert.equal(h.calls.clients.length, 2);
});

test('real installed adapter/client construct offline and existing importer import stays compatible', () => {
  const code = `
    const assert = require('node:assert/strict');
    let attempts = 0;
    require('node:net').Socket.prototype.connect = function() { attempts++; throw new Error('Network forbidden in runtime test'); };
    require('node:dns').lookup = function() { attempts++; throw new Error('DNS forbidden in runtime test'); };
    globalThis.fetch = async () => { attempts++; throw new Error('Fetch forbidden in runtime test'); };
    (async () => {
      const client = require('./src/prismaClient');
      assert.equal(require('./src/prismaClient'), client);
      assert.equal(typeof client.$transaction, 'function');
      const importer = require('./src/services/curriculumIngestion/importCurriculumToDatabase');
      assert.equal(typeof importer.importCurriculumFile, 'function');
      assert.equal(typeof importer.sortNodesParentFirst, 'function');
      await client.$disconnect();
      assert.equal(attempts, 0);
    })().catch(() => { process.exitCode = 1; });
  `;
  const result = spawnSync(process.execPath, ['-e', code], {
    cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', timeout: 30000,
    env: { PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: runtimeUrl, DIRECT_URL: runtimeUrl }
  });
  assert.equal(result.status, 0, 'Offline real-client construction/import compatibility failed');
  assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
});
