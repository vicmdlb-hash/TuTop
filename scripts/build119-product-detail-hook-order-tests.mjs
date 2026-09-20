import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync('src/components/ProductDetail.tsx','utf8');
const productGuard=source.indexOf('if (!product) return null;');
assert(productGuard>0,'ProductDetail must retain a null-product render guard');

for(const marker of ['useMemo(', 'useEffect(() => {\n    if (!product) return;', 'useEffect(() => {\n    let cancelled = false;']){
  const index=source.indexOf(marker);
  assert(index>=0,`missing hook marker: ${marker}`);
  assert(index<productGuard,`hook must execute before ProductDetail null return: ${marker}`);
}
assert.doesNotMatch(source.slice(0,productGuard),/if \(!selectedProductId\) return null;/);
console.log('PASS ProductDetail keeps hooks unconditional before empty-selection return');
