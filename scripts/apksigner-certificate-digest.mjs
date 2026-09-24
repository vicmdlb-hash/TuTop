export function extractApkSignerDigest(output, kind, expectedHexLength) {
  const normalizedKind=String(kind||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const lines=String(output||'').split(/\r?\n/);
  const candidates=lines.filter((line)=>{
    const upper=line.toUpperCase();
    const compact=upper.replace(/[^A-Z0-9]/g,'');
    return upper.includes('CERTIFICATE')
      && upper.includes('DIGEST')
      && compact.includes(normalizedKind);
  });
  for(const line of candidates){
    const digestMarker=line.toLowerCase().lastIndexOf('digest');
    const tail=digestMarker>=0 ? line.slice(digestMarker+'digest'.length) : line;
    const value=tail.replace(/^[^0-9A-Fa-f]*/,'').replace(/[^0-9A-Fa-f]/g,'').toUpperCase();
    if(new RegExp('^[0-9A-F]{'+expectedHexLength+'}$').test(value)) return value;
  }
  const observed=candidates.map((line)=>line.replace(/[0-9A-Fa-f]{12,}/g,'[HEX]')).join(' | ').slice(0,500);
  throw new Error('APK_CERT_'+normalizedKind+'_INVALID'+(observed?':'+observed:''));
}
