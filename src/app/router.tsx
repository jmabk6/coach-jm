import { createHashRouter } from "react-router-dom";
import { AppShell } from "./AppShell";
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
import { WorkoutBlockDetailScreen } from "../features/workout/WorkoutBlockDetailScreen";
import { WorkoutScreen } from "../features/workout/WorkoutScreen";
import { QuickExerciseScreen } from "../features/workout/QuickExerciseScreen";
import { TodayScreen } from "../features/today/TodayScreen";
import { ProgressionScreen } from "../features/progression/ProgressionScreen";
import { HistoryScreen } from "../features/progression/HistoryScreen";
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
      { path: "seance/exercice-rapide", element: <QuickExerciseScreen /> },
      { path: "programme", element: <ProgramScreen /> },
      { path: "programme/programmation", element: <WeeklyProgramScreen /> },
      { path: "workouts/:workoutId", element: <WorkoutRecapScreen /> },
      { path: "workouts/:workoutId/blocks/:blockId", element: <WorkoutBlockDetailScreen /> },
      { path: "progression", element: <ProgressionScreen /> },
      { path: "historique", element: <HistoryScreen /> },
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
