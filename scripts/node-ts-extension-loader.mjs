import path from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  try { return await nextResolve(specifier, context); }
  catch (error) {
    const relative=specifier.startsWith('./')||specifier.startsWith('../');
    if(!relative||path.extname(specifier)) throw error;
    for(const ext of ['.ts','.tsx','.js','.mjs']){
      try{return await nextResolve(specifier+ext,context);}catch{}
    }
    throw error;
  }
}
