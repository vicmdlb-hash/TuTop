import path from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const isRelative=specifier.startsWith('./')||specifier.startsWith('../');
    const hasExtension=Boolean(path.extname(specifier));
    if(!isRelative||hasExtension) throw error;
    for(const ext of ['.ts','.tsx','.js','.mjs']){
      try{return await nextResolve(specifier+ext,context);}catch{}
    }
    throw error;
  }
}
