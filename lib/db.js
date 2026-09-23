/**
 * Lightweight file-based JSON database.
 * Dipilih (bukan SQLite/Mongo) supaya aplikasi bisa langsung "npm install && npm start"
 * di server desa/kelurahan tanpa perlu compiler native / database server terpisah.
 * Untuk skala lebih besar, ganti implementasi ini dengan PostgreSQL/MySQL
 * tanpa mengubah kode di routes (karena semua akses lewat fungsi di file ini).
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function ensureFile(name) {
  const fp = filePath(name);
  if (!fs.existsSync(fp)) fs.writeFileSync(fp, '[]', 'utf-8');
  return fp;
}

function readCollection(name) {
  const fp = ensureFile(name);
  try {
    const raw = fs.readFileSync(fp, 'utf-8');
    return raw.trim() ? JSON.parse(raw) : [];
  } catch (e) {
    console.error(`Gagal membaca koleksi ${name}:`, e.message);
    return [];
  }
}

function writeCollection(name, data) {
  const fp = ensureFile(name);
  const tmp = `${fp}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, fp);
  return data;
}

function insert(name, record) {
  const items = readCollection(name);
  items.push(record);
  writeCollection(name, items);
  return record;
}

function update(name, id, patch) {
  const items = readCollection(name);
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch, updatedAt: new Date().toISOString() };
  writeCollection(name, items);
  return items[idx];
}

function remove(name, id) {
  const items = readCollection(name);
  const next = items.filter((i) => i.id !== id);
  writeCollection(name, next);
  return next.length !== items.length;
}

function findById(name, id) {
  return readCollection(name).find((i) => i.id === id) || null;
}

function genId(prefix = '') {
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${id}` : id;
}

module.exports = { readCollection, writeCollection, insert, update, remove, findById, genId };
