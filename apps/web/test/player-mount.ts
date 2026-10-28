import { createSingleClipPlayer } from '@workprint/player';
import type { PlayerSnapshot, PlayerSource } from '@workprint/player';

const nativeLoad = HTMLMediaElement.prototype.load;
let loadCount = 0;
HTMLMediaElement.prototype.load = function load(this: HTMLMediaElement) { loadCount += 1; return nativeLoad.call(this); };
const video = document.createElement('video');
video.preload = 'metadata';
video.setAttribute('data-player-test', 'true');
document.body.append(video);
const player = createSingleClipPlayer(video);
let events = 0;
player.subscribe(() => { events += 1; });
let pending: { reject(error: DOMException): void; resolve(): void } | null = null;
const nativePlay = video.play.bind(video);
(window as unknown as { playerTest: unknown }).playerTest = {
  setSource(source: PlayerSource) { player.setSource(source); },
  play() { player.play(); },
  seek(positionMs: number) { player.seek(positionMs); },
  dispose() { player.dispose(); },
  snapshot(): PlayerSnapshot { return player.current(); },
  events() { return events; },
  deferPlay() { video.play = () => new Promise((resolve, reject) => { pending = { resolve: () => resolve(), reject }; }); },
  rejectPlay(name: string) { pending?.reject(new DOMException(name, name)); },
  resolvePlay() { pending?.resolve(); },
  resetPlay() { video.play = nativePlay; },
  dispatch(type: string) { video.dispatchEvent(new Event(type)); },
  src() { return video.getAttribute('src'); },
  paused() { return video.paused; },
  loadCalls() { return loadCount; },
  readyState() { return video.readyState; },
};
