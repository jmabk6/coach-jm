export { db, CoachJmDatabase } from "./database";

export {
  getAllExercises,
  getActiveExercises,
  getExercise,
  saveExercise,
  archiveExercise,
} from "./repositories/exerciseRepository";

export {
  getAllSessionTemplates,
  getActiveSessionTemplates,
  getSessionTemplate,
  saveSessionTemplate,
  archiveSessionTemplate,
  updateSessionTemplatePositions,
} from "./repositories/sessionTemplateRepository";

export {
  WEEKLY_PROGRAM_ID,
  getWeeklyProgram,
  saveWeeklyProgram,
  getPlannedSession,
  getPlannedSessionsByDate,
  getPlannedSessionsByDateIncludingRemoved,
  getPlannedSessionsBetween,
  savePlannedSession,
  savePlannedSessions,
  getPlannedSessionsFromIncludingRemoved,
  deletePlannedSessions,
  updatePlannedSession,
  updatePlannedSessionStatus,
  removePlannedSession,
} from "./repositories/programRepository";

export {
  getWorkout,
  getWorkoutsByDate,
  getInProgressWorkout,
  getCompletedWorkoutsBetween,
  getCompletedWorkouts,
  saveWorkout,
  updateWorkout,
} from "./repositories/workoutRepository";

export {
  getAllGoals,
  getGoal,
  getGoalByKey,
  saveGoal,
} from "./repositories/goalRepository";

export { getSetting, saveSetting } from "./repositories/settingsRepository";

export {
  getWeightEntries,
  getLatestWeightEntry,
  getFirstWeightEntry,
  getWeightEntry,
  saveWeightEntry,
  updateWeightEntry,
  deleteWeightEntry,
} from "./repositories/weightRepository";




