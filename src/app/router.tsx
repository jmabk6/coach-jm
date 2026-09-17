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
import { GroupEditScreen } from "../features/sessions/GroupEditScreen";
import { ProgramScreen } from "../features/program/ProgramScreen";
import { WeeklyProgramScreen } from "../features/program/WeeklyProgramScreen";
import { WorkoutRecapScreen } from "../features/workout/WorkoutRecapScreen";
import { WorkoutScreen } from "../features/workout/WorkoutScreen";
import { TodayScreen } from "../features/today/TodayScreen";
import { SessionPreviewScreen } from "../features/today/SessionPreviewScreen";

export const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <TodayScreen /> },
      {
        path: "aujourdhui/apercu/:plannedSessionId",
        element: <SessionPreviewScreen />,
      },
      { path: "seance", element: <WorkoutScreen /> },
      { path: "programme", element: <ProgramScreen /> },
      { path: "programme/programmation", element: <WeeklyProgramScreen /> },
      { path: "workouts/:workoutId", element: <WorkoutRecapScreen /> },
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
        path: "sessions/:sessionId/groups/:groupId",
        element: <GroupEditScreen />,
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
