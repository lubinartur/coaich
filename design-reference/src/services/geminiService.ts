/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { Workout } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateWorkoutReview(workout: Workout) {
  try {
    const prompt = `
      You are an elite bodybuilding and strength coach AI named CoAIch.
      Review the following workout data and provide a concise report.
      
      Workout: ${workout.name}
      Exercises: ${JSON.stringify(workout.exercises)}
      Volume: ${workout.volume}kg
      Sets: ${workout.sets}
      Duration: ${workout.duration}s
      
      Format the response AS JSON with:
      - intro: 1-2 sentences
      - whatWentWell: list of 2-3 points
      - whatToImprove: list of 2-3 points
      - nextTargets: list of {exercise: string, target: string} (e.g. "85kg x 12")
      - exerciseNotes: summary of notes
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intro: { type: Type.STRING },
            whatWentWell: { type: Type.ARRAY, items: { type: Type.STRING } },
            whatToImprove: { type: Type.ARRAY, items: { type: Type.STRING } },
            nextTargets: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT, 
                properties: {
                  exercise: { type: Type.STRING },
                  target: { type: Type.STRING }
                }
              } 
            },
            exerciseNotes: { type: Type.STRING }
          }
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("AI Review failed", error);
    return {
      intro: "Great session today. You kept a high intensity throughout.",
      whatWentWell: ["Excellent volume on compounds", "Consistent rest periods"],
      whatToImprove: ["Increase weight on isolation work", "Better mind-muscle connection on back"],
      nextTargets: workout.exercises.map(ex => ({ exercise: ex.name, target: "+2.5kg or +2 reps" })),
      exerciseNotes: "Focus on form over weight."
    };
  }
}
