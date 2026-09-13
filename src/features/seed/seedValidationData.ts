import { saveExercise } from "../../db/repositories/exerciseRepository";
import { saveWeeklyProgram } from "../../db/repositories/programRepository";
import { saveSessionTemplate } from "../../db/repositories/sessionTemplateRepository";
import type {
  Exercise,
  SessionTemplate,
  WeeklyProgram,
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
}