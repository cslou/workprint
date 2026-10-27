import { createBackend } from '../../src/mastra/backend.js';
import { controlledModel } from './controlled-model.js';

const directory = process.env.QUALIFICATION_DIRECTORY;
if (!directory) throw new Error('Qualification directory required by test composition');
export const mastra = await createBackend(process.env, controlledModel(directory));
