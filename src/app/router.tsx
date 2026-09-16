import { createHashRouter } from "react-router-dom";
import { AppShell } from "./AppShell";
import { Screen } from "./Screen";
import { ExercisesScreen } from "../features/exercises/ExercisesScreen";
import { ExerciseDetailScreen } from "../features/exercises/ExerciseDetailScreen";
import { ExerciseCreateScreen } from "../features/exercises/ExerciseCreateScreen";
import { ExerciseEditScreen } from "../features/exercises/ExerciseEditScreen";
import { PlusScreen } from "../features/plus/PlusScreen";
import { SessionsScreen } from "../features/sessions/SessionsScreen";
import { SessionCreateScreen } from "../features/sessions/SessionCreateScreen";
import { SessionEditScreen } from "../features/sessions/SessionEditScreen";
import { SessionDetailScreen } from "../features/sessions/SessionDetailScreen";
import { SessionNoteScreen } from "../features/sessions/SessionNoteScreen";
import { BlockEditScreen } from "../features/sessions/BlockEditScreen";

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
      { path: "sessions/new", element: <SessionCreateScreen /> },
      { path: "sessions/:sessionId/edit", element: <SessionEditScreen /> },
      { path: "sessions/:sessionId", element: <SessionDetailScreen /> },
      { path: "sessions/:sessionId/notes/:blockId", element: <SessionNoteScreen /> },
      {
        path: "sessions/:sessionId/blocks/:blockId",
        element: <BlockEditScreen />,
      },
      {
        path: "sessions/:sessionId/groups/:blockId",
        element: <Screen title="Modifier le groupe" />,
      },
      {
        path: "sessions/:sessionId/groups/:groupId/children/:childId",
        element: <BlockEditScreen />,
      },
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
