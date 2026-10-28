import { createSingleClipPlayer } from '@workprint/player';
import type { PlayerSnapshot, PlayerSource } from '@workprint/player';

const nativeLoad = HTMLMediaElement.prototype.load;
let loadCount = 0;
HTMLMediaElement.prototype.load = function load(this: HTMLMediaElement) { loadCount += 1; return nativeLoad.call(this); };
const video = document.createElement('video');
video.preload = 'metadata';
video.setAttribute('data-player-test', 'true');
const added: { type: string; listener: EventListenerOrEventListenerObject }[] = [];
const removed: { type: string; listener: EventListenerOrEventListenerObject }[] = [];
const nativeAdd = video.addEventListener.bind(video);
const nativeRemove = video.removeEventListener.bind(video);
video.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => { added.push({ type, listener }); nativeAdd(type, listener, options); }) as typeof video.addEventListener;
video.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => { removed.push({ type, listener }); nativeRemove(type, listener, options); }) as typeof video.removeEventListener;
document.body.append(video);
const player = createSingleClipPlayer(video);
let events = 0;
const statuses: string[] = [];
const rejections: string[] = [];
player.subscribe((snapshot) => { events += 1; statuses.push(snapshot.status); });
let pending: { reject(error: DOMException): void; resolve(): void } | null = null;
const nativePlay = video.play.bind(video);
const recordedPlay = () => nativePlay().catch((error: unknown) => { rejections.push(error instanceof DOMException ? error.name : 'unknown'); throw error; });
video.play = recordedPlay;
(window as unknown as { playerTest: unknown }).playerTest = {
  setSource(source: PlayerSource) { player.setSource(source); },
  play() { player.play(); },
  pause() { player.pause(); },
  seek(positionMs: number) { player.seek(positionMs); },
  dispose() { player.dispose(); },
  snapshot(): PlayerSnapshot { return player.current(); },
  events() { return events; },
  deferPlay() { video.play = () => new Promise((resolve, reject) => { pending = { resolve: () => resolve(), reject }; }); },
  rejectPlay(name: string) { pending?.reject(new DOMException(name, name)); },
  resolvePlay() { pending?.resolve(); },
  resetPlay() { video.play = recordedPlay; },
  dispatch(type: string) { video.dispatchEvent(new Event(type)); },
  src() { return video.getAttribute('src'); },
  paused() { return video.paused; },
  loadCalls() { return loadCount; },
  readyState() { return video.readyState; },
  statuses() { return [...statuses]; },
  rejections() { return [...rejections]; },
  listeners() { return { added: added.length, removed: removed.length, remaining: added.filter((entry) => !removed.some((gone) => gone.type === entry.type && gone.listener === entry.listener)).length }; },
};
