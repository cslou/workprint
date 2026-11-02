import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newSubjectId, savedScriptContentSchema, scriptSubjects } from '@workprint/contracts';

const scene = (characters: string[], location = 'The Gallery') => ({ heading: { setting: 'interior', location, time: 'night' }, characters, script: [{ action: 'Mara waits.' }] });
const script = (characters: string[], location?: string) => ({ schemaVersion: 1 as const, scenes: [scene(characters, location)] });

test('a script saved before subjects existed gets its characters, then its location as one place, with ids from their names', () => {
  assert.deepEqual(scriptSubjects(script(['Mara', ' Ben Ode '])), [
    { id: 'mara', kind: 'character', name: 'Mara' }, { id: 'ben-ode', kind: 'character', name: 'Ben Ode' }, { id: 'the-gallery', kind: 'place', name: 'The Gallery' },
  ]);
  // A name that is another subject's (ignoring case) is one subject; ids that clash get -2, -3.
  assert.deepEqual(scriptSubjects(script(['Mara'], ' mara ')).map(subject => subject.id), ['mara']);
  assert.deepEqual(scriptSubjects(script(['Mara!', 'Mara?'])).map(subject => subject.id), ['mara', 'mara-2', 'the-gallery']);
  assert.deepEqual(scriptSubjects(script(['Élodie', '李'])).map(subject => subject.id), ['elodie', 'character', 'the-gallery']);
  assert.equal(newSubjectId('Mara', 'character', new Set(['mara', 'mara-2'])), 'mara-3');
  assert.equal(newSubjectId('x'.repeat(300), 'prop', new Set()).length, 190);
});

test('stored subjects come back in Assets order: characters, then places, then props, each in script order', () => {
  const subjects = [{ id: 'key', kind: 'prop', name: 'The key' }, { id: 'gallery', kind: 'place', name: 'The Gallery' }, { id: 'mara', kind: 'character', name: 'Mara' }, { id: 'bench', kind: 'prop', name: 'Bench' }] as const;
  assert.deepEqual(scriptSubjects({ ...script(['Mara']), subjects: [...subjects] }).map(subject => subject.id), ['mara', 'gallery', 'key', 'bench']);
});

test('the schema keeps subjects distinct and the character subjects equal to the scene\'s characters', () => {
  const subjects = [{ id: 'mara', kind: 'character', name: 'Mara' }, { id: 'gallery', kind: 'place', name: 'The Gallery' }];
  assert.ok(savedScriptContentSchema.safeParse({ ...script(['Mara']), subjects }).success);
  assert.ok(savedScriptContentSchema.safeParse(script(['Mara'])).success, 'a script without subjects still parses');
  for (const [why, value] of [
    ['a duplicate name', [...subjects, { id: 'gallery-2', kind: 'prop', name: ' the gallery ' }]],
    ['a duplicate id', [...subjects, { id: 'gallery', kind: 'prop', name: 'Key' }]],
    ['a character subject missing from characters', [...subjects, { id: 'ben', kind: 'character', name: 'Ben' }]],
    ['a character missing from the subjects', subjects.slice(1)],
    ['an id that is not a slug', [{ ...subjects[0]!, id: 'Mara Vale' }, subjects[1]]],
    ['a name over 80 characters', [subjects[0], { ...subjects[1]!, name: 'x'.repeat(81) }]],
    ['an unknown kind', [subjects[0], { ...subjects[1]!, kind: 'environment' }]],
    ['more than 50 subjects', [subjects[0], ...Array.from({ length: 50 }, (_, n) => ({ id: `p-${n}`, kind: 'prop', name: `Prop ${n}` }))]],
  ] as const) assert.equal(savedScriptContentSchema.safeParse({ ...script(['Mara']), subjects: value }).success, false, why);
});
