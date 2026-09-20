import fs from 'node:fs';

const path='android/app/build.gradle';
if(!fs.existsSync(path))throw new Error('ANDROID_BUILD_GRADLE_MISSING');
const name=String(process.env.TUTOP_PLAY_VERSION_NAME||'').trim();
const code=Number(process.env.TUTOP_PLAY_VERSION_CODE);
if(!/^\d+\.\d+\.\d+$/.test(name))throw new Error('PLAY_VERSION_NAME_INVALID');
if(!Number.isInteger(code)||code<=90212)throw new Error('PLAY_VERSION_CODE_INVALID');
let source=fs.readFileSync(path,'utf8');
if(!/versionCode\s+\d+/.test(source)||!/versionName\s+["'][^"']+["']/.test(source))throw new Error('ANDROID_VERSION_FIELDS_MISSING');
source=source.replace(/versionCode\s+\d+/,'versionCode '+code);
source=source.replace(/versionName\s+["'][^"']+["']/,'versionName "'+name+'"');
fs.writeFileSync(path,source);
console.log('Android Play version configured: '+name+' / '+code);
