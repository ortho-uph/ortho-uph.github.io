const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');

const props = new Map();
const cache = new Map();
const context = {
  console,
  Date,
  JSON,
  Math,
  String,
  Number,
  Array,
  Object,
  RegExp,
  PropertiesService: { getScriptProperties: () => ({
    getProperty: key => props.has(key) ? props.get(key) : null,
    setProperty: (key, value) => props.set(key, String(value)),
    deleteProperty: key => props.delete(key),
  }) },
  CacheService: { getScriptCache: () => ({
    get: key => cache.has(key) ? cache.get(key) : null,
    put: (key, value) => cache.set(key, String(value)),
    remove: key => cache.delete(key),
  }) },
  Utilities: {
    Charset: { UTF_8: 'utf8' },
    DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (_algorithm, value) => [...crypto.createHash('sha256').update(String(value)).digest()],
    getUuid: () => crypto.randomUUID(),
    formatDate: () => '2026',
  },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('apps-script-backend.gs', 'utf8'), context);

const admin = { id: 'bootstrap-admin', name: 'Admin test', role: 'admin' };
const first = context.tkaUserCreate_(admin, { name: 'Admin One', role: 'viewer', password: 'Admin1234' });
assert.equal(first.ok, 1);
assert.equal(first.user.role, 'admin', 'first permanent user must be an admin');
assert(!props.get('TKA_USERS').includes('Admin1234'), 'password must never be stored in clear text');

const viewer = context.tkaUserCreate_(first.user, { name: 'Viewer One', role: 'viewer', password: 'Viewer1234' });
assert.equal(viewer.ok, 1);
assert.equal(viewer.user.role, 'viewer');
assert.equal(context.tkaUserCreate_(first.user, { name: 'Weak', role: 'viewer', password: '12345678' }).err, 'invalid_user');

const login = context.tkaLogin_('Viewer1234');
assert.equal(login.ok, 1);
assert.equal(login.user.role, 'viewer');
assert.equal(context.tkaHandle_({ action: 'tkaUserList', session: login.session }).err, 'forbidden');
assert.equal(context.tkaLogin_('wrong-password').err, 'unauthorized');
console.log('TKA backend auth/role smoke tests passed');
