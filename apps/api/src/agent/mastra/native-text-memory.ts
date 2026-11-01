import { isTransientSignalMessage } from '@mastra/core/agent';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';

/** Official Memory recall/lifecycle; its public save hook delegates unchanged native records to the same store. */
class NativeTextMemory extends Memory {
  constructor(private readonly nativeStorage: MastraCompositeStore) {
    super({ storage: nativeStorage, vector: false, options: {
      lastMessages: 20, semanticRecall: false, workingMemory: { enabled: false }, observationalMemory: false, generateTitle: false,
    } });
  }

  override async saveMessages({ messages, memoryConfig }: Parameters<Memory['saveMessages']>[0]) {
    // This binding does not implement auxiliary memory. Never silently bypass its sanitization if enabled later.
    if (memoryConfig?.workingMemory?.enabled || memoryConfig?.semanticRecall || memoryConfig?.observationalMemory) throw new Error('Auxiliary native memory is unavailable');
    const memory = await this.nativeStorage.getStore('memory');
    if (!memory) throw new Error('Native message storage unavailable');
    // Keep native system/transient exclusions. No text rewriting, replacement IDs, secondary rows or SQL.
    return memory.saveMessages({ messages: messages.filter(message => message.role !== 'system' && !isTransientSignalMessage(message)) });
  }
}

export function createNativeTextMemory(storage: MastraCompositeStore): Memory { return new NativeTextMemory(storage); }
