import { DB_NAME, DB_VERSION, STORES, isoNow } from "../core/schema.js";

let dbPromise;

function createStore(db, name, options = { keyPath: "id" }) {
  if (!db.objectStoreNames.contains(name)) {
    return db.createObjectStore(name, options);
  }
  return null;
}

function upgrade(db, oldVersion, transaction) {
  if (oldVersion < 1) {
    const exercises = createStore(db, STORES.exercises);
    exercises?.createIndex("active", "active", { unique: false });
    exercises?.createIndex("family", "family", { unique: false });
    exercises?.createIndex("movement", "movement", { unique: false });
    exercises?.createIndex("favorite", "favorite", { unique: false });

    const templates = createStore(db, STORES.workoutTemplates);
    templates?.createIndex("active", "active", { unique: false });
    templates?.createIndex("category", "category", { unique: false });

    const planned = createStore(db, STORES.plannedWorkouts);
    planned?.createIndex("date", "date", { unique: false });
    planned?.createIndex("status", "status", { unique: false });
    planned?.createIndex("templateId", "templateId", { unique: false });

    const sessions = createStore(db, STORES.workoutSessions);
    sessions?.createIndex("startedAt", "startedAt", { unique: false });
    sessions?.createIndex("status", "status", { unique: false });
    sessions?.createIndex("templateId", "templateId", { unique: false });
    sessions?.createIndex("plannedWorkoutId", "plannedWorkoutId", { unique: false });

    const goals = createStore(db, STORES.goals);
    goals?.createIndex("status", "status", { unique: false });
    goals?.createIndex("priority", "priority", { unique: false });

    const assessments = createStore(db, STORES.assessments);
    assessments?.createIndex("goalId", "goalId", { unique: false });
    assessments?.createIndex("testId", "testId", { unique: false });
    assessments?.createIndex("date", "date", { unique: false });

    const recommendations = createStore(db, STORES.recommendations);
    recommendations?.createIndex("scopeType", "scopeType", { unique: false });
    recommendations?.createIndex("scopeId", "scopeId", { unique: false });
    recommendations?.createIndex("status", "status", { unique: false });
    recommendations?.createIndex("createdAt", "createdAt", { unique: false });

    createStore(db, STORES.settings);
    createStore(db, STORES.meta);

    transaction.objectStore(STORES.meta).put({
      id: "schema",
      version: 1,
      createdAt: isoNow(),
      lastMigrationAt: isoNow(),
    });
  }
}

export function openCoachDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      upgrade(db, event.oldVersion, request.transaction);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Ouverture de la base bloquée par un autre onglet."));
  });

  return dbPromise;
}

export async function getSchemaMeta() {
  const db = await openCoachDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.meta, "readonly");
    const req = tx.objectStore(STORES.meta).get("schema");
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function put(storeName, value) {
  const db = await openCoachDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction annulée"));
  });
}

export async function get(storeName, id) {
  const db = await openCoachDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(storeName) {
  const db = await openCoachDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}
