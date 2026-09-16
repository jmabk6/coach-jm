import { createHashRouter } from "react-router-dom";
import { AppShell } from "./AppShell";
import { Screen } from "./Screen";
import { ExercisesScreen } from "../features/exercises/ExercisesScreen";
import { ExerciseDetailScreen } from "../features/exercises/ExerciseDetailScreen";
import { ExerciseCreateScreen } from "../features/exercises/ExerciseCreateScreen";
import { ExerciseEditScreen } from "../features/exercises/ExerciseEditScreen";
import { PlusScreen } from "../features/plus/PlusScreen";
import { SessionsScreen } from "../features/sessions/SessionsScreen";

export const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Screen title="Aujourd'hui" /> },
      { path: "programme", element: <Screen title="Programme" /> },
      { path: "progression", element: <Screen title="Progression" /> },
      { path: "plus", element: <PlusScreen /> },
      { path: "sessions", element: <SessionsScreen /> },
      { path: "sessions/new", element: <Screen title="Nouvelle séance" /> },
      { path: "sessions/:sessionId", element: <Screen title="Séance" /> },
      { path: "exercises", element: <ExercisesScreen /> },
      {
        path: "exercises/new",
        element: <ExerciseCreateScreen />,
      },
      {
        path: "exercises/:exerciseId/edit",
        element: <ExerciseEditScreen />,
      },
      {
        path: "exercises/:exerciseId",
        element: <ExerciseDetailScreen />,
      },
    ],
  },
]);
