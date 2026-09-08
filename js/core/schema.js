export const DB_NAME = "coach-jm";
export const DB_VERSION = 1;

export const STORES = Object.freeze({
  exercises: "exercises",
  workoutTemplates: "workoutTemplates",
  plannedWorkouts: "plannedWorkouts",
  workoutSessions: "workoutSessions",
  goals: "goals",
  assessments: "assessments",
  recommendations: "recommendations",
  settings: "settings",
  meta: "meta",
});

export const METRIC_TYPES = Object.freeze([
  "weight_reps",
  "reps",
  "duration",
  "distance",
  "cardio",
  "assisted_reps",
  "mobility_test",
  "check",
]);

export const SESSION_STATUS = Object.freeze([
  "in_progress",
  "completed",
  "abandoned",
]);

export const PLANNED_STATUS = Object.freeze([
  "planned",
  "moved",
  "cancelled",
  "completed",
]);

export function isoNow() {
  return new Date().toISOString();
}
