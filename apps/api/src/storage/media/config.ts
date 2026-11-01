import { createMediaSandbox } from './sandbox.js';
import { MediaProcessError } from './errors.js';

/** Backend-only explicit local qualification inputs. No download, PATH or version fallback. */
export async function configuredMediaSandbox(environment:Readonly<Record<string,string|undefined>>){
  const fields=['MEDIA_TOOLCHAIN_DIRECTORY','MEDIA_DOCKER_PATH','MEDIA_ARCHIVE_PATH'] as const;
  if(fields.every(field=>environment[field]===undefined))return undefined;
  if(!environment.MEDIA_TOOLCHAIN_DIRECTORY || !environment.MEDIA_DOCKER_PATH)throw new MediaProcessError('unavailable');
  return createMediaSandbox({toolchainDirectory:environment.MEDIA_TOOLCHAIN_DIRECTORY,dockerPath:environment.MEDIA_DOCKER_PATH,...(environment.MEDIA_ARCHIVE_PATH?{archivePath:environment.MEDIA_ARCHIVE_PATH}:{})});
}
