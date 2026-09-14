import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { seedExerciseCatalog } from "./features/exercises/seedExerciseCatalog";
import "./index.css";

async function bootstrap() {
  await seedExerciseCatalog();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();