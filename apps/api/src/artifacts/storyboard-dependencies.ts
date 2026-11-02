import type { z } from 'zod';
import type { savedStoryboardContentSchema } from '@workprint/contracts';

type Plan = z.infer<typeof savedStoryboardContentSchema>;

/** The subjects a storyboard's Shots name, once each, in plan order. */
export const shotSubjects = (plan: Plan): string[] => [...new Set(plan.shots.flatMap(shot => (shot.references ?? []).map(reference => reference.subjectId)))];

/** The reference versions a storyboard's panels name, once each, in plan order. */
export const panelReferences = (plan: Plan): string[] => [...new Set(plan.shots.flatMap(shot => shot.panels.flatMap(panel => panel.references)))];

/** A storyboard's dependencies: its source script, its panels' references, then the sheets of the subjects its Shots name. */
export const storyboardDependencies = (plan: Plan, sheets: readonly string[]): string[] => [...new Set([plan.sourceScriptVersionId, ...panelReferences(plan), ...sheets])];
