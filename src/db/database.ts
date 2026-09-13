import Dexie, { type Table } from "dexie";

import type {
  Exercise,
  Goal,
  PlannedSession,
  SessionTemplate,
  WeeklyProgram,
  WeightEntry,
  WorkoutSession,
} from "../domain";

export class CoachJmDatabase extends Dexie {
  exercises!: Table<Exercise, string>;
  sessionTemplates!: Table<SessionTemplate, string>;
  weeklyPrograms!: Table<WeeklyProgram, string>;
  plannedSessions!: Table<PlannedSession, string>;
  workouts!: Table<WorkoutSession, string>;
  goals!: Table<Goal, string>;
  weightEntries!: Table<WeightEntry, string>;

  constructor() {
    super("coach-jm");

    /**
     * Version 1 de la base locale.
     *
     * Important :
     * les chaînes ci-dessous définissent uniquement les index IndexedDB.
     * Les autres propriétés des objets sont quand même enregistrées.
     */
    this.version(1).stores({
      exercises:
        "id, name, zone, movement, equipment, location, mode, measurementType, status, updatedAt",

      sessionTemplates:
        "id, name, category, status, position, updatedAt",

      weeklyPrograms:
        "id, name, updatedAt",

      plannedSessions:
        "id, date, sessionTemplateId, status, source, updatedAt",

      workouts:
        "id, date, plannedSessionId, sessionTemplateId, source, status, startedAt, completedAt, updatedAt",

      goals:
        "id, status, dueDate, achievedAt, updatedAt",

      weightEntries:
        "id, &date, kg, updatedAt",
    });
  }
}

export const db = new CoachJmDatabase();

