import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { seedExerciseCatalog } from "./features/exercises/seedExerciseCatalog";
import "./index.css";

async function bootstrap() {
  await seedExerciseCatalog();

  /* Console de recette : restauration d'une sauvegarde dans la base de
     cet origin (serveur de développement). Absent du build de production. */
  if (import.meta.env.DEV) {
    const [{ installDevRestore }, { db }] = await Promise.all([
      import("./features/backup/devRestore"),
      import("./db/database"),
    ]);
    installDevRestore(db);
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();