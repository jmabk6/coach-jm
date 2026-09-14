import { saveExercise } from "../../db/repositories/exerciseRepository";
import { saveWeeklyProgram } from "../../db/repositories/programRepository";
import { saveWorkout } from "../../db/repositories/workoutRepository";
import { saveSessionTemplate } from "../../db/repositories/sessionTemplateRepository";
import type {
  Exercise,
  SessionTemplate,
  WeeklyProgram,
  WorkoutSession,
} from "../../domain";

export async function seedValidationData(
  now: string = new Date().toISOString(),
): Promise<void> {
  const exercises: Exercise[] = [
    {
      id: "squat",
      name: "Squat",
      zone: "Jambes",
      movement: "Squat",
      equipment: "Barre",
      location: "Salle",
      mode: "series",
      measurementType: "load_reps",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "tirage-vertical",
      name: "Tirage vertical",
      zone: "Dos",
      movement: "Tirage",
      equipment: "Poulie",
      location: "Salle",
      mode: "series",
      measurementType: "load_reps",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "planche",
      name: "Planche",
      zone: "Core",
      movement: "Gainage",
      equipment: "Poids du corps",
      location: "Salle",
      mode: "series",
      measurementType: "duration",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "tapis",
      name: "Tapis",
      zone: "Jambes",
      movement: "Charnière",
      equipment: "Machine",
      location: "Salle",
      mode: "steps",
      measurementType: "duration_speed_incline",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const exercise of exercises) {
    await saveExercise(exercise);
  }

  const template: SessionTemplate = {
    id: "muscu-a",
    name: "Muscu A",
    category: "Musculation",
    status: "active",
    position: 0,
    blocks: [
      {
        id: "muscu-a-note-1",
        kind: "note",
        position: 0,
        title: "Échauffement",
        text: "Faire un échauffement cardio avant la musculation.",
      },
      {
        id: "muscu-a-squat",
        kind: "exercise",
        position: 1,
        exerciseId: "squat",
        instructions: {
          shape: "reps",
          sets: 3,
          reps: {
            min: 8,
            max: 12,
          },
          targetRpe: {
            min: 6,
            max: 8,
          },
          restBetweenSetsSec: 90,
        },
      },
      {
        id: "muscu-a-group-1",
        kind: "group",
        position: 2,
        name: "Tirage + gainage",
        rounds: 3,
        restBetweenRoundsSec: 90,
        children: [
          {
            id: "muscu-a-group-1-tirage",
            position: 0,
            exerciseId: "tirage-vertical",
            instructions: {
              shape: "reps",
              reps: {
                min: 8,
                max: 12,
              },
              targetRpe: {
                min: 6,
                max: 8,
              },
            },
          },
          {
            id: "muscu-a-group-1-planche",
            position: 1,
            exerciseId: "planche",
            instructions: {
              shape: "duration",
              durationSec: 45,
              targetRpe: {
                min: 6,
                max: 8,
              },
            },
          },
        ],
      },
      {
        id: "muscu-a-tapis",
        kind: "exercise",
        position: 3,
        exerciseId: "tapis",
        instructions: {
          shape: "steps",
          steps: [
            {
              id: "muscu-a-tapis-step-1",
              position: 0,
              durationSec: 180,
              speedKmh: 4.5,
              inclinePercent: 0,
            },
            {
              id: "muscu-a-tapis-step-2",
              position: 1,
              durationSec: 240,
              speedKmh: 5,
              inclinePercent: 5,
            },
            {
              id: "muscu-a-tapis-step-3",
              position: 2,
              durationSec: 180,
              speedKmh: 5,
              inclinePercent: 15,
            },
          ],
        },
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  await saveSessionTemplate(template);

  const program: Omit<WeeklyProgram, "id"> = {
    name: "Programme principal",
    days: [
      {
        weekday: "monday",
        sessionTemplateId: "muscu-a",
      },
      { weekday: "tuesday" },
      { weekday: "wednesday" },
      { weekday: "thursday" },
      { weekday: "friday" },
      { weekday: "saturday" },
      { weekday: "sunday" },
    ],
    createdAt: now,
    updatedAt: now,
  };

  await saveWeeklyProgram(program);

  const squatWorkouts: WorkoutSession[] = [
    {
      id: "validation-squat-2026-09-01",
      source: "free",
      status: "completed",
      date: "2026-09-01",
      startedAt: "2026-09-01T18:00:00.000Z",
      completedAt: "2026-09-01T18:45:00.000Z",
      lastActionAt: "2026-09-01T18:45:00.000Z",
      activeDurationSec: 2700,
      blocks: [
        {
          id: "validation-squat-2026-09-01-block",
          kind: "exercise",
          position: 0,
          addedDuringWorkout: false,
          exerciseId: "squat",
          status: "performed",
          snapshotInstructions: {
            shape: "reps",
            sets: 3,
            reps: {
              min: 8,
              max: 12,
            },
            targetRpe: {
              min: 6,
              max: 8,
            },
            restBetweenSetsSec: 90,
          },
          series: [
            {
              id: "validation-squat-2026-09-01-s1",
              position: 0,
              status: "completed",
              load: {
                kind: "total",
                kg: 20,
              },
              reps: 12,
              rpe: 6,
              completedAt: "2026-09-01T18:10:00.000Z",
            },
            {
              id: "validation-squat-2026-09-01-s2",
              position: 1,
              status: "completed",
              load: {
                kind: "total",
                kg: 25,
              },
              reps: 10,
              rpe: 7,
              completedAt: "2026-09-01T18:15:00.000Z",
            },
            {
              id: "validation-squat-2026-09-01-s3",
              position: 2,
              status: "completed",
              load: {
                kind: "total",
                kg: 25,
              },
              reps: 10,
              rpe: 8,
              completedAt: "2026-09-01T18:20:00.000Z",
            },
          ],
        },
      ],
      createdAt: "2026-09-01T18:00:00.000Z",
      updatedAt: "2026-09-01T18:45:00.000Z",
    },
    {
      id: "validation-squat-2026-09-07",
      source: "free",
      status: "completed",
      date: "2026-09-07",
      startedAt: "2026-09-07T18:00:00.000Z",
      completedAt: "2026-09-07T18:45:00.000Z",
      lastActionAt: "2026-09-07T18:45:00.000Z",
      activeDurationSec: 2700,
      blocks: [
        {
          id: "validation-squat-2026-09-07-block",
          kind: "exercise",
          position: 0,
          addedDuringWorkout: false,
          exerciseId: "squat",
          status: "performed",
          snapshotInstructions: {
            shape: "reps",
            sets: 3,
            reps: {
              min: 8,
              max: 12,
            },
            targetRpe: {
              min: 6,
              max: 8,
            },
            restBetweenSetsSec: 90,
          },
          series: [
            {
              id: "validation-squat-2026-09-07-s1",
              position: 0,
              status: "completed",
              load: {
                kind: "total",
                kg: 25,
              },
              reps: 12,
              rpe: 6,
              completedAt: "2026-09-07T18:10:00.000Z",
            },
            {
              id: "validation-squat-2026-09-07-s2",
              position: 1,
              status: "completed",
              load: {
                kind: "total",
                kg: 30,
              },
              reps: 10,
              rpe: 7,
              completedAt: "2026-09-07T18:15:00.000Z",
            },
            {
              id: "validation-squat-2026-09-07-s3",
              position: 2,
              status: "completed",
              load: {
                kind: "total",
                kg: 30,
              },
              reps: 8,
              rpe: 8,
              completedAt: "2026-09-07T18:20:00.000Z",
            },
          ],
        },
      ],
      createdAt: "2026-09-07T18:00:00.000Z",
      updatedAt: "2026-09-07T18:45:00.000Z",
    },
    {
      id: "validation-squat-2026-09-13",
      source: "free",
      status: "completed",
      date: "2026-09-13",
      startedAt: "2026-09-13T18:00:00.000Z",
      completedAt: "2026-09-13T18:45:00.000Z",
      lastActionAt: "2026-09-13T18:45:00.000Z",
      activeDurationSec: 2700,
      blocks: [
        {
          id: "validation-squat-2026-09-13-block",
          kind: "exercise",
          position: 0,
          addedDuringWorkout: false,
          exerciseId: "squat",
          status: "performed",
          snapshotInstructions: {
            shape: "reps",
            sets: 3,
            reps: {
              min: 8,
              max: 12,
            },
            targetRpe: {
              min: 6,
              max: 8,
            },
            restBetweenSetsSec: 90,
          },
          series: [
            {
              id: "validation-squat-2026-09-13-s1",
              position: 0,
              status: "completed",
              load: {
                kind: "total",
                kg: 30,
              },
              reps: 12,
              rpe: 6,
              completedAt: "2026-09-13T18:10:00.000Z",
            },
            {
              id: "validation-squat-2026-09-13-s2",
              position: 1,
              status: "completed",
              load: {
                kind: "total",
                kg: 35,
              },
              reps: 10,
              rpe: 7,
              completedAt: "2026-09-13T18:15:00.000Z",
            },
            {
              id: "validation-squat-2026-09-13-s3",
              position: 2,
              status: "completed",
              load: {
                kind: "total",
                kg: 35,
              },
              reps: 8,
              rpe: 8,
              completedAt: "2026-09-13T18:20:00.000Z",
            },
          ],
        },
      ],
      createdAt: "2026-09-13T18:00:00.000Z",
      updatedAt: "2026-09-13T18:45:00.000Z",
    },
  ];

  for (const workout of squatWorkouts) {
    await saveWorkout(workout);
  }
}