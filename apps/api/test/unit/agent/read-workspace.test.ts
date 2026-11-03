import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OwnedWorkspace, StoppedVideosOutcome } from '../../../src/application/index.js';
import { productionTools, type AgentCollaborators } from '../../../src/agent/index.js';
import { listingBounds, listWorkspace, workspaceItem } from '../../../src/agent/workspace-entries.js';
import { unusedPanelImages } from '../../support/unused-panel-images.js';
import { unusedSheets } from '../../support/unused-sheets.js';

type Version = OwnedWorkspace['assets'][number]['version'];
const base = (id: string, revision = 1) => ({ id, artifactId: `artifact-${id}`, revision, createdBy: 'human' as const, createdAt: '2026-11-01T00:00:00.000Z', dependencies: [] });
const image = (id: string): Version => ({ ...base(id), kind: 'image', media: { contentType: 'image/png', byteSize: 10, width: 640, height: 480 } });
const reference = (id: string, name: string, description: string): Version => ({ ...base(id), kind: 'reference', content: { schemaVersion: 1, subject: { id: 'subject', kind: 'character', name, description, continuityNotes: ['n'] }, references: [] } });
const work = (version: Version, purpose: 'reference' | 'script' | 'storyboard', state: 'draft' | 'approved' = 'draft') => ({ version, use: { id: `use-${version.id}`, versionId: version.id, binding: { purpose }, state }, state: state === 'approved' ? 'Ready' as const : 'Draft' as const });
const workspace = (assets: Version[], extra: Partial<OwnedWorkspace> = {}): OwnedWorkspace => ({ script: null, assets: assets.map(version => work(version, 'reference')), storyboard: { work: null, shots: [] }, videos: [], pendingQuestion: null, activeWork: [], selectionRevision: 0, ...extra } as OwnedWorkspace);

test('items are named by what they are and in order; uploads have no filename, so images are numbered', () => {
  const script: Version = { ...base('s', 3), kind: 'script', content: { schemaVersion: 1, scenes: [{ heading: { setting: 'INT.', location: 'Station', time: 'Night' }, characters: ['Ada'], script: [{ action: 'Ada waits.' }, { dialogue: { character: 'Ada', text: 'Late again.' } }] }] } };
  const listing = listWorkspace(workspace([image('i1'), reference('r1', 'Mara', 'A tall courier.'), image('i2')], {
    script: work(script, 'script', 'approved'),
    storyboard: { work: null, shots: [{ shotId: 'b', order: 5, panels: [{ panelId: 'p', order: 0, description: '', references: [], candidateImageVersions: [image('c1')], approvedImageVersionId: 'c1' }], chosenVideoVersionId: null }, { shotId: 'a', order: 1, panels: [], chosenVideoVersionId: null, candidateVideoVersions: [{ ...base('v1'), kind: 'video', media: { contentType: 'video/mp4', byteSize: 9, width: 1280, height: 720, durationMs: 4200 } }] }] },
  }));
  assert.deepEqual(listing.items.map(item => [item.name, item.use, item.state]), [
    ['Script · Version 3', 'script', 'Ready'], ['Image 1 · Version 1', 'reference', 'Draft'], ['Mara · Version 1', 'reference', 'Draft'], ['Image 2 · Version 1', 'reference', 'Draft'],
    ['Shot 1 · Video · Version 1', 'shot video', 'Draft'], ['Shot 2 · Panel 2.1 · Version 1', 'panel image', 'Ready'],
  ]);
  assert.equal(listing.items[0]!.text, 'INT. Station - Night Ada waits. Ada: Late again.');
  assert.equal(listing.items[1]!.text, 'image/png, 640×480');
  assert.equal(listing.items[4]!.text, 'video/mp4, 1280×720, 4.2 s');
  assert.deepEqual([listing.total, listing.truncated], [6, false]);
});

test('a clip the assistant made is listed as the video\'s next numbered video, with its exact version', () => {
  const made: Version = { ...base('m1'), createdBy: 'assistant', kind: 'video', media: { contentType: 'video/mp4', byteSize: 10, width: 1344, height: 768, durationMs: 4042, hasAudio: true } };
  const clip = { version: made, use: { id: 'use-m1', versionId: 'm1', binding: { purpose: 'video' as const }, state: 'draft' as const }, state: 'Draft' as const };
  const listing = listWorkspace(workspace([image('i1')], { generatedVideos: [clip] }));
  assert.deepEqual(listing.items.map(item => [item.name, item.versionId, item.use, item.state, item.text]), [
    ['Image 1 · Version 1', 'i1', 'reference', 'Draft', 'image/png, 640×480'], ['Video 1 · Version 1', 'm1', 'generated video', 'Draft', 'video/mp4, 1344×768, 4 s'],
  ]);
  assert.equal(workspaceItem(workspace([], { generatedVideos: [clip] }), 'm1')?.name, 'Video 1 · Version 1');
  // Clips are numbered with the video's other videos, so two never share a name.
  const uploaded: Version = { ...base('u1'), kind: 'video', media: { contentType: 'video/mp4', byteSize: 10, width: 1280, height: 720, durationMs: 1000, hasAudio: true } };
  assert.deepEqual(listWorkspace(workspace([uploaded], { generatedVideos: [clip] })).items.map(item => item.name), ['Video 1 · Version 1', 'Video 2 · Version 1']);
});

test('a listing stops at 50 items, then at 16 KiB, and every text stays within 200 characters', () => {
  const many = listWorkspace(workspace(Array.from({ length: 60 }, (_, index) => image(`i${index}`))));
  assert.deepEqual([many.items.length, many.total, many.truncated], [listingBounds.items, 60, true]);
  const long = listWorkspace(workspace(Array.from({ length: 40 }, (_, index) => reference(`r${index}`, `N${index}`, 'é'.repeat(400)))));
  assert.ok(long.items.length < 40 && long.truncated, String(long.items.length));
  assert.ok(Buffer.byteLength(JSON.stringify(long)) <= listingBounds.bytes);
  for (const item of long.items) assert.ok(item.text.length <= listingBounds.text);
  const named = listWorkspace(workspace([reference('r', 'N'.repeat(300), 'd')]));
  assert.ok(named.items[0]!.name.length <= listingBounds.text && named.items[0]!.text.length <= listingBounds.text);
  assert.deepEqual(listWorkspace(workspace([])), { items: [], total: 0, truncated: false });
});

test('item mode returns a used version in full and nothing for any other id', () => {
  const space = workspace([reference('r1', 'Mara', 'A tall courier.'), image('i1')]);
  assert.deepEqual(workspaceItem(space, 'i1'), { name: 'Image 1 · Version 1', kind: 'image', versionId: 'i1', revision: 1, use: 'reference', state: 'Draft', media: { contentType: 'image/png', byteSize: 10, width: 640, height: 480 } });
  assert.equal((workspaceItem(space, 'r1') as { content: { subject: { description: string } } }).content.subject.description, 'A tall courier.');
  assert.equal(workspaceItem(space, 'someone-elses'), null);
});

test('the listing gives the video\'s stopped jobs with their resume ids, only when the server makes videos and they can be read', async () => {
  const tool = productionTools.find(candidate => candidate.id === 'read-workspace')!;
  const scope = { accountId: 'account', videoId: 'video' }, asked: string[][] = [];
  const run = (stopped?: StoppedVideosOutcome) => {
    const collaborators: AgentCollaborators = {
      readWorkspace: async () => ({ kind: 'found', workspace: workspace([image('i1')]) }),
      saveScript: async () => ({ kind: 'unavailable' }), saveStoryboard: async () => ({ kind: 'unavailable' }), sheets: unusedSheets, panelImages: unusedPanelImages, readImageInputs: async () => ({ kind: 'not_found' }), saveGeneratedImage: async () => ({ kind: 'unavailable' }),
      ...(stopped ? { videos: { start: async () => ({ kind: 'not_found' }), resume: async () => ({ kind: 'not_found' }), stopped: async (account: string, video: string) => { asked.push([account, video]); return stopped; } } } : {}),
    };
    const signal = new AbortController().signal;
    return tool.execute({}, { scope, collaborators, signal, abortReason: () => undefined }) as Promise<Record<string, unknown>>;
  };
  const listed = await run({ kind: 'read', jobs: [{ jobId: 'job-2', frames: ['i1'], submittedAt: new Date('2026-11-03T16:34:37Z') }, { jobId: 'job-1', frames: [], submittedAt: new Date('2026-11-03T16:30:11Z') }] });
  assert.deepEqual(listed.stoppedVideos, [{ jobId: 'job-2', frames: ['i1'], submittedAt: '2026-11-03T16:34:37.000Z' }, { jobId: 'job-1', frames: [], submittedAt: '2026-11-03T16:30:11.000Z' }]);
  assert.deepEqual(asked, [['account', 'video']]);
  assert.equal(listed.total, 1);
  for (const quiet of [await run(), await run({ kind: 'read', jobs: [] }), await run({ kind: 'unavailable' })]) {
    assert.equal('stoppedVideos' in quiet, false); assert.equal(quiet.total, 1);
  }
});

test('the listing gives the script\'s subjects with their ids, and 50 subjects with 80-character names stay within 16 KiB', async () => {
  const tool = productionTools.find(candidate => candidate.id === 'read-workspace')!;
  const names = Array.from({ length: 50 }, (_, index) => `${String(index).padStart(2, '0')}${'n'.repeat(78)}`);
  const subjects = names.map((name, index) => ({ id: `${'s'.repeat(80)}-${index}`, kind: index === 0 ? 'character' as const : 'prop' as const, name }));
  const script: Version = { ...base('s'), kind: 'script', content: { schemaVersion: 1, subjects, scenes: [{ heading: { setting: 'INT.', location: 'Station', time: 'Night' }, characters: [names[0]!], script: [{ action: 'Ada waits.' }] }] } };
  const space = workspace(Array.from({ length: 40 }, (_, index) => reference(`r${index}`, `N${index}`, 'é'.repeat(400))), { script: work(script, 'script') });
  const collaborators: AgentCollaborators = { readWorkspace: async () => ({ kind: 'found', workspace: space }), saveScript: async () => ({ kind: 'unavailable' }), saveStoryboard: async () => ({ kind: 'unavailable' }), readImageInputs: async () => ({ kind: 'not_found' }), saveGeneratedImage: async () => ({ kind: 'unavailable' }), sheets: unusedSheets, panelImages: unusedPanelImages };
  const signal = new AbortController().signal;
  const listed = await tool.execute({}, { scope: { accountId: 'a', videoId: 'v' }, collaborators, signal, abortReason: () => undefined }) as { subjects: unknown[]; items: { name: string }[]; truncated: boolean };
  assert.deepEqual(listed.subjects, subjects);
  assert.ok(Buffer.byteLength(JSON.stringify(listed)) <= listingBounds.bytes);
  assert.equal(listed.items[0]?.name, 'Script · Version 1', 'the script still fits beside the subjects');
  assert.ok(listed.truncated);
});

const subjectScript = (subjects: { id: string; kind: 'character' | 'place' | 'prop'; name: string }[]): Version => ({ ...base('s'), kind: 'script', content: { schemaVersion: 1, subjects,
  scenes: [{ heading: { setting: 'INT.', location: 'The Gallery', time: 'Night' }, characters: subjects.filter(subject => subject.kind === 'character').map(subject => subject.name), script: [{ action: 'She waits.' }] }] } });
const sheetVersion = (id: string, subject: string, views: [string, string][]): Version => ({ ...base(id), kind: 'reference', content: { schemaVersion: 1,
  subject: { id: subject, kind: 'character', name: 'Old name', description: 'A courier.', continuityNotes: ['n'] }, references: views.map(([versionId, view]) => ({ versionId, view, notes: [] })) } });
const readTool = productionTools.find(candidate => candidate.id === 'read-workspace')!;
const reading = (space: OwnedWorkspace, readView: AgentCollaborators['sheets']['readView']) => {
  const collaborators: AgentCollaborators = { readWorkspace: async () => ({ kind: 'found', workspace: space }), saveScript: async () => ({ kind: 'unavailable' }), saveStoryboard: async () => ({ kind: 'unavailable' }), readImageInputs: async () => ({ kind: 'not_found' }),
    saveGeneratedImage: async () => ({ kind: 'unavailable' }), sheets: { ...unusedSheets, readView }, panelImages: unusedPanelImages };
  const signal = new AbortController().signal;
  return (input: Record<string, unknown>) => readTool.execute(input, { scope: { accountId: 'a', videoId: 'v' }, collaborators, signal, abortReason: () => undefined }) as Promise<Record<string, unknown>>;
};

test('a sheet\'s images are listed under its subject by name, and item mode reads the sheet, a view and a view whose use moved on', async () => {
  // Mara's sheet lists v1, v2 and v3; v3's own use has moved on to its next version, v3b.
  const sheet = sheetVersion('sh', 'mara', [['v1', 'Full-body front'], ['v2', 'Three-quarter'], ['v3', 'Face close-up']]);
  const v3b: Version = { ...image('v3b'), artifactId: 'artifact-v3', revision: 2 };
  const space = workspace([image('i1'), image('v1'), image('v2'), v3b, image('i5'), sheet], { script: work(subjectScript([{ id: 'mara', kind: 'character', name: 'Mara' }, { id: 'the-gallery', kind: 'place', name: 'The Gallery' }]), 'script') });
  const reads: string[] = [];
  const read = reading(space, async (_account, _video, versionId) => { reads.push(versionId); return { kind: 'found', version: { ...image('v3'), artifactId: 'artifact-v3' } }; });
  const listed = await read({}) as { subjects: unknown[]; items: { name: string; versionId: string }[]; total: number };
  assert.deepEqual(listed.subjects, [
    { id: 'mara', kind: 'character', name: 'Mara', sheet: { versionId: 'sh', views: [{ view: 'Full-body front', versionId: 'v1' }, { view: 'Three-quarter', versionId: 'v2' }, { view: 'Face close-up', versionId: 'v3' }] } },
    { id: 'the-gallery', kind: 'place', name: 'The Gallery' },
  ]);
  // The views aren't items; every other image keeps its number, and the sheet is named by the script's name.
  assert.deepEqual(listed.items.map(item => item.name), ['Script · Version 1', 'Image 1 · Version 1', 'Image 4 · Version 2', 'Image 5 · Version 1', 'Mara · Version 1']);
  assert.equal(listed.total, 5);
  const item = async (versionId: string) => ((await read({ versionId })) as { item?: Record<string, unknown> }).item;
  assert.deepEqual((await item('sh'))?.content, sheet.kind === 'reference' && 'content' in sheet ? sheet.content : undefined);
  assert.deepEqual([(await item('v2'))?.name, (await item('v2'))?.use], ['Mara · Three-quarter', 'reference']);
  assert.deepEqual(reads, [], 'a view the video uses is read from the workspace');
  assert.deepEqual([(await item('v3'))?.name, (await item('v3'))?.use, (await item('v3'))?.revision], ['Mara · Face close-up', 'sheet view', 1]);
  assert.deepEqual(await read({ versionId: 'elsewhere' }), { found: false, reason: 'not_found' });
  assert.ok(reads.every(id => id === 'v3'), 'only a sheet\'s own view is read on its own');
  // The read of a moved-on view can fail like any other read.
  assert.deepEqual(await reading(space, async () => ({ kind: 'unavailable' }))({ versionId: 'v3' }), { found: false, reason: 'unavailable' });
});

test('50 subjects with full sheets stay within 16 KiB, and every sheet image is listed under a subject or as an item', async () => {
  for (const long of [true, false]) {
    const subjects = Array.from({ length: 50 }, (_, index) => ({ id: long ? `${'s'.repeat(80)}-${index}` : `subject-${index}`, kind: 'prop' as const, name: long ? `${String(index).padStart(2, '0')}${'n'.repeat(78)}` : `Prop ${index}` }));
    const views = (index: number) => Array.from({ length: 5 }, (_, view) => [`00000000-0000-4000-8000-${String(index * 10 + view).padStart(12, '0')}`, `${'w'.repeat(76)} ${view}`] as [string, string]);
    const sheets = subjects.map((subject, index) => sheetVersion(`sheet-${index}`, subject.id, views(index)));
    const images = subjects.flatMap((_, index) => views(index).map(([id]) => image(id)));
    // A second sheet for the first subject, and a sheet for a subject the script doesn't list.
    const extra = [sheetVersion('second', subjects[0]!.id, [['x1', 'Back']]), sheetVersion('orphan', 'gone', [['x2', 'Front']])];
    const space = workspace([image('x1'), image('x2'), ...images, ...sheets, ...extra], { script: work(subjectScript(subjects), 'script') });
    const listed = await reading(space, async () => ({ kind: 'not_found' }))({}) as { subjects: { sheet?: { versionId: string; views?: { versionId: string }[] } }[]; items: { name: string; versionId: string }[]; total: number };
    assert.ok(Buffer.byteLength(JSON.stringify(listed)) <= listingBounds.bytes, `long ${long}`);
    assert.equal(listed.subjects.length, 50);
    assert.equal(listed.items[0]?.name, 'Script · Version 1', 'the script still fits beside the subjects');
    // Views listed under a subject aren't items; every other sheet image still is, named by its sheet.
    const underSubjects = new Set(listed.subjects.flatMap(subject => subject.sheet?.views?.map(view => view.versionId) ?? []));
    assert.equal(underSubjects.size > 0, !long, 'short subjects leave room for views; the longest leave none');
    assert.equal(listed.total, 1 + images.length + 2 + sheets.length + extra.length - underSubjects.size);
    assert.ok(!listed.items.some(item => underSubjects.has(item.versionId)));
    const names = new Map(listed.items.map(item => [item.versionId, item.name]));
    assert.deepEqual([names.get('x1'), names.get('x2')], [`${subjects[0]!.name} · Back`, 'Old name · Front'], 'a second sheet\'s and an unlisted subject\'s images are items');
    if (!long) assert.deepEqual(listed.subjects.at(-1)?.sheet, undefined, 'a sheet past the share is left to the items');
  }
});

test('an image is listed with its subjectId only while the script lists that subject, as Assets files it', () => {
  const script = (subjects: { id: string; kind: 'character' | 'place'; name: string }[]): OwnedWorkspace['script'] => work({ ...base('s'), kind: 'script', content: { schemaVersion: 1, subjects,
    scenes: [{ heading: { setting: 'INT.', location: 'Gallery', time: 'Night' }, characters: subjects.filter(subject => subject.kind === 'character').map(subject => subject.name), script: [{ action: 'Mara waits.' }] }] } }, 'script');
  const assets = [{ ...work(image('i1'), 'reference'), subjectId: 'mara' }, { ...work(image('i2'), 'reference'), subjectId: 'gallery' }, work(image('i3'), 'reference')];
  const filed = (subjects: Parameters<typeof script>[0]) => listWorkspace({ ...workspace([]), assets, script: script(subjects) }).items.filter(item => item.kind === 'image').map(item => [item.versionId, item.subjectId]);
  assert.deepEqual(filed([{ id: 'mara', kind: 'character', name: 'Mara' }, { id: 'gallery', kind: 'place', name: 'Gallery' }]), [['i1', 'mara'], ['i2', 'gallery'], ['i3', undefined]]);
  // The Gallery left the script: its image is listed unfiled, under Other.
  assert.deepEqual(filed([{ id: 'mara', kind: 'character', name: 'Mara' }]), [['i1', 'mara'], ['i2', undefined], ['i3', undefined]]);
});

const boardVersion = (shots: unknown[]): Version => ({ ...base('board', 2), createdBy: 'assistant', kind: 'storyboard', content: { schemaVersion: 1, sourceScriptVersionId: 's', shots } } as Version);
const madeImage = (id: string, revision: number, at: string): Version => ({ ...image(id), artifactId: 'artifact-panel', revision, createdBy: 'assistant', createdAt: at });

test('the listing gives the storyboard once, with each Shot\'s ids, text, references and current panel images', async () => {
  const person = image('view-1'), first = madeImage('panel-v1', 1, '2026-11-02T00:00:00.000Z'), second = madeImage('panel-v2', 2, '2026-11-03T00:00:00.000Z');
  const shots = [
    { shotId: 's2', order: 1, intent: 'The key turns.', panels: [{ panelId: 'p3', order: 0, description: 'The key.', references: [], candidateImageVersions: [], approvedImageVersionId: null }], chosenVideoVersionId: null },
    { shotId: 's1', order: 0, intent: 'Mara arrives.', framing: 'wide', action: 'Rain.', references: [{ subjectId: 'mara', role: 'identity', purpose: 'Her face.' }],
      panels: [
        { panelId: 'p2', order: 1, description: 'At the desk.', references: [], candidateImageVersions: [person, second, first], approvedImageVersionId: 'view-1' },
        { panelId: 'p1', order: 0, description: 'In the doorway.', references: [], candidateImageVersions: [first, second], approvedImageVersionId: null },
      ], chosenVideoVersionId: null },
  ];
  const board = boardVersion(shots);
  const space = workspace([], { storyboard: { work: work(board, 'storyboard'), shots } } as Partial<OwnedWorkspace>);
  const listed = await reading(space, async () => ({ kind: 'not_found' }))({}) as { storyboard: unknown; items: { name: string; use: string }[] };
  assert.deepEqual(listed.storyboard, { name: 'Storyboard · Version 2', versionId: 'board', state: 'Draft', detail: 'panels', truncated: false, shots: [
    { shotId: 's1', intent: 'Mara arrives.', framing: 'wide', references: [{ subjectId: 'mara', role: 'identity' }], panels: [
      { panelId: 'p1', description: 'In the doorway.', imageVersionId: 'panel-v2' }, { panelId: 'p2', description: 'At the desk.', imageVersionId: 'view-1' },
    ] },
    { shotId: 's2', intent: 'The key turns.', panels: [{ panelId: 'p3', description: 'The key.' }] },
  ] });
  // The storyboard is not listed again as an item; each panel's images stay items.
  assert.ok(!listed.items.some(item => item.use === 'storyboard'));
  assert.deepEqual(listed.items.map(item => item.name), ['Shot 1 · Panel 1.1 · Version 1', 'Shot 1 · Panel 1.1 · Version 2', 'Shot 1 · Panel 1.2 · Version 1']);
  assert.deepEqual(((await reading(space, async () => ({ kind: 'not_found' }))({ versionId: 'board' })) as { item: { content: unknown } }).item.content, 'content' in board ? board.content : undefined);
});

test('a 100-Shot storyboard with 200-character intents steps down, says truncated, and stays within 16 KiB', async () => {
  const shotsOf = (count: number, intent: string, idLength = 30) => Array.from({ length: count }, (_, index) => ({ shotId: `${'s'.repeat(idLength)}-${String(index).padStart(3, '0')}`, order: index, intent, framing: 'wide',
    panels: [{ panelId: `${'p'.repeat(30)}-${index}a`, order: 0, description: 'd'.repeat(200), references: [], candidateImageVersions: [], approvedImageVersionId: null }], chosenVideoVersionId: null }));
  const list = async (shots: ReturnType<typeof shotsOf>) => {
    const space = workspace(Array.from({ length: 30 }, (_, index) => image(`i${index}`)), { storyboard: { work: work(boardVersion(shots), 'storyboard'), shots } } as Partial<OwnedWorkspace>);
    const listed = await reading(space, async () => ({ kind: 'not_found' }))({}) as { storyboard: { detail: string; truncated: boolean; shots: Record<string, unknown>[] }; items: unknown[] };
    assert.ok(Buffer.byteLength(JSON.stringify(listed)) <= listingBounds.bytes, String(Buffer.byteLength(JSON.stringify(listed))));
    assert.ok(listed.items.length > 0, 'items still fit beside the storyboard');
    return listed.storyboard;
  };
  const full = await list(shotsOf(3, 'Mara arrives.'));
  assert.deepEqual([full.detail, full.truncated, full.shots.length], ['panels', false, 3]);
  // Twelve Shots with panels fit beside the items: the storyboard takes the room the listing has left.
  const twelve = await list(shotsOf(12, 'Mara arrives.'));
  assert.deepEqual([twelve.detail, twelve.truncated, twelve.shots.length], ['panels', false, 12]);
  const intents = await list(shotsOf(40, 'i'.repeat(250)));
  assert.deepEqual([intents.detail, intents.truncated, intents.shots.length, Object.keys(intents.shots[0]!)], ['intents', true, 40, ['shotId', 'intent']]);
  assert.ok(intents.shots.every(shot => (shot.intent as string).length === listingBounds.text), 'each intent is clipped to 200 characters');
  const ids = await list(shotsOf(100, 'é'.repeat(200)));
  assert.deepEqual([ids.detail, ids.truncated, ids.shots.length, Object.keys(ids.shots[0]!)], ['ids', true, 100, ['shotId']]);
  // Shot ids of up to 200 characters: only the first Shots fit.
  const first = await list(shotsOf(100, 'é'.repeat(200), 190));
  assert.equal(first.detail, 'ids'); assert.ok(first.truncated);
  assert.ok(first.shots.length > 0 && first.shots.length < 100, String(first.shots.length));
  assert.deepEqual(first.shots.map(shot => shot.shotId), shotsOf(first.shots.length, '', 190).map(shot => shot.shotId), 'the first Shots in order');
});

test('beside subjects with sheets and stopped videos, a 100-Shot storyboard steps down and the listing stays within 16 KiB', async () => {
  const subjects = Array.from({ length: 30 }, (_, index) => ({ id: `${'m'.repeat(60)}-${index}`, kind: 'character' as const, name: `${'N'.repeat(70)}${index}` }));
  const sheets = subjects.map((subject, index) => ({ ...sheetVersion(`sh${index}`, subject.id, [[`v${index}a`, 'Full-body front'], [`v${index}b`, 'Face close-up']]) }));
  const shots = Array.from({ length: 100 }, (_, index) => ({ shotId: `${'s'.repeat(30)}-${index}`, order: index, intent: 'i'.repeat(200), framing: 'wide',
    panels: [{ panelId: `${'p'.repeat(30)}-${index}`, order: 0, description: 'd'.repeat(200), references: [], candidateImageVersions: [], approvedImageVersionId: null }], chosenVideoVersionId: null }));
  const views = sheets.flatMap((_, index) => [image(`v${index}a`), image(`v${index}b`)]);
  const space = workspace([...views, ...sheets, ...Array.from({ length: 20 }, (_, index) => image(`i${index}`))], { script: work(subjectScript(subjects), 'script'), storyboard: { work: work(boardVersion(shots), 'storyboard'), shots } } as Partial<OwnedWorkspace>);
  const collaborators: AgentCollaborators = { readWorkspace: async () => ({ kind: 'found', workspace: space }), saveScript: async () => ({ kind: 'unavailable' }), saveStoryboard: async () => ({ kind: 'unavailable' }), readImageInputs: async () => ({ kind: 'not_found' }), saveGeneratedImage: async () => ({ kind: 'unavailable' }), sheets: unusedSheets, panelImages: unusedPanelImages,
    videos: { start: async () => ({ kind: 'not_found' }), resume: async () => ({ kind: 'not_found' }), stopped: async () => ({ kind: 'read', jobs: Array.from({ length: 10 }, (_, index) => ({ jobId: `job-${index}`, frames: [`i${index}`], submittedAt: new Date('2026-11-03T16:34:37Z') })) }) } };
  const listed = await readTool.execute({}, { scope: { accountId: 'a', videoId: 'v' }, collaborators, signal: new AbortController().signal, abortReason: () => undefined }) as { subjects: unknown[]; stoppedVideos: unknown[]; storyboard: { detail: string; truncated: boolean; shots: unknown[] }; items: unknown[] };
  assert.equal(listed.subjects.length, 30); assert.equal(listed.stoppedVideos.length, 10);
  assert.ok(Buffer.byteLength(JSON.stringify(listed)) <= listingBounds.bytes, String(Buffer.byteLength(JSON.stringify(listed))));
  assert.ok(listed.storyboard.truncated && listed.storyboard.detail !== 'panels' && listed.storyboard.shots.length > 0);
  assert.ok(listed.items.length > 0, 'items still fit beside the storyboard');
});
