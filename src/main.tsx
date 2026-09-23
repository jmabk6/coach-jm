import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { MigrationFailureScreen } from "./app/MigrationFailureScreen";
import { db } from "./db/database";
import { seedExerciseCatalog } from "./features/exercises/seedExerciseCatalog";
import { seedRpeScale } from "./features/strength/seedRpeScale";
import "./index.css";

async function bootstrap() {
  const root = createRoot(document.getElementById("root")!);

  /* Ouverture explicite, avant tout seed (SCHEMA_DEXIE_V3_MIGRATION.md
     § 4.1) : c'est ici que la migration v2 → v3 s'exécute. Un refus de la
     garde, une base bloquée ou tout autre échec affichent l'écran d'échec,
     sans aucun seed ni aucune écriture. */
  db.on("blocked", () => {
    root.render(<MigrationFailureScreen blocked />);
  });

  try {
    await db.open();
  } catch (error) {
    root.render(<MigrationFailureScreen error={error} />);
    return;
  }

  await seedExerciseCatalog();
  await seedRpeScale();

  /* Console de recette : restauration d'une sauvegarde dans la base de
     cet origin (serveur de développement). Absent du build de production. */
  if (import.meta.env.DEV) {
    const { installDevRestore } = await import("./features/backup/devRestore");
    installDevRestore(db);
  }

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
