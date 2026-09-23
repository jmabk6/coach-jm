import { createHashRouter } from "react-router-dom";
import { AppShell } from "./AppShell";
import { ROUTES, routeSegment } from "./paths";
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
import { CardioDetailScreen } from "../features/progression/CardioDetailScreen";
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
      { path: routeSegment(ROUTES.workoutLive), element: <WorkoutScreen /> },
      { path: routeSegment(ROUTES.quickExercise), element: <QuickExerciseScreen /> },
      { path: routeSegment(ROUTES.planning), element: <ProgramScreen /> },
      { path: routeSegment(ROUTES.weeklyProgram), element: <WeeklyProgramScreen /> },
      { path: "workouts/:workoutId", element: <WorkoutRecapScreen /> },
      { path: "workouts/:workoutId/blocks/:blockId", element: <WorkoutBlockDetailScreen /> },
      { path: routeSegment(ROUTES.progression), element: <ProgressionScreen /> },
      { path: routeSegment(ROUTES.history), element: <HistoryScreen /> },
      { path: `${routeSegment(ROUTES.progression)}/cardio/:exerciseId`, element: <CardioDetailScreen /> },
      { path: routeSegment(ROUTES.plus), element: <PlusScreen /> },
      { path: routeSegment(ROUTES.sessions), element: <SessionsScreen /> },
      { path: `${routeSegment(ROUTES.sessions)}/new`, element: <SessionCreateScreen /> },
      { path: `${routeSegment(ROUTES.sessions)}/:sessionId/edit`, element: <SessionEditScreen /> },
      { path: `${routeSegment(ROUTES.sessions)}/:sessionId`, element: <SessionDetailScreen /> },
      { path: `${routeSegment(ROUTES.sessions)}/:sessionId/notes/:blockId`, element: <SessionNoteScreen /> },
      {
        path: `${routeSegment(ROUTES.sessions)}/:sessionId/blocks/:blockId`,
        element: <BlockEditScreen />,
      },
      {
        path: `${routeSegment(ROUTES.sessions)}/:sessionId/groups/:groupId`,
        element: <GroupEditScreen />,
      },
      {
        path: `${routeSegment(ROUTES.sessions)}/:sessionId/groups/:groupId/children/:childId`,
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
