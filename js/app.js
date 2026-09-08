import { DB_VERSION, STORES } from "./core/schema.js";
import { getSchemaMeta, openCoachDb } from "./db/db.js";

const $ = (id) => document.getElementById(id);

async function boot() {
  $("app-status").textContent = "Coach JM chargé";
  $("app-status").classList.add("ok");

  try {
    await openCoachDb();
    const meta = await getSchemaMeta();
    $("db-status").textContent = "IndexedDB opérationnelle";
    $("db-status").classList.add("ok");
    $("schema-status").textContent = `v${meta?.version ?? DB_VERSION}`;
  } catch (error) {
    console.error(error);
    $("db-status").textContent = "Erreur de base locale";
    $("db-status").classList.add("error");
    $("schema-status").textContent = "Erreur";
  }

  const stores = $("stores");
  Object.values(STORES).forEach((name) => {
    const el = document.createElement("span");
    el.className = "chip";
    el.textContent = name;
    stores.appendChild(el);
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  });
}

boot();
