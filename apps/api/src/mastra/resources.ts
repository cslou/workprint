import { Mastra } from '@mastra/core';

/** Extends the one native owner lifecycle; no separate signal handler, loop or scheduler. */
export class ResourceMastra extends Mastra {
  #closing:Promise<void>|undefined;
  constructor(config:ConstructorParameters<typeof Mastra>[0],private readonly resources:{before():Promise<void>;after():Promise<void>}){super(config);}
  override shutdown(options?:Parameters<Mastra['shutdown']>[0]):Promise<void>{
    return this.#closing??=(async()=>{
      const failures:Error[]=[];
      try{await this.resources.before();}catch{failures.push(new Error('Backend media/storage cleanup incomplete; owned references retained'));}
      try{await super.shutdown(options);}catch{failures.push(new Error('Native backend shutdown incomplete'));}
      try{await this.resources.after();}catch{failures.push(new Error('Backend database cleanup incomplete'));}
      if(failures.length)throw new AggregateError(failures,'Backend shutdown incomplete');
    })();
  }
}
