import fs from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';

function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
    const p=path.join(dir,e.name);
    return e.isDirectory()?walk(p):[p];
  });
}
function isHookCall(node){
  let found=false;
  function visit(n){
    if(found)return;
    if(ts.isCallExpression(n)){
      const ex=n.expression;
      const name=ts.isIdentifier(ex)?ex.text:ts.isPropertyAccessExpression(ex)?ex.name.text:'';
      if(/^use[A-Z0-9]/.test(name)) {found=true;return;}
    }
    ts.forEachChild(n,visit);
  }
  visit(node);
  return found;
}
function containsReturn(node){
  let found=false;
  function visit(n){
    if(found)return;
    if(ts.isFunctionLike(n) && n!==node)return;
    if(ts.isReturnStatement(n)){found=true;return;}
    ts.forEachChild(n,visit);
  }
  visit(node);
  return found;
}
const findings=[];
for(const file of walk('src').filter(f=>f.endsWith('.tsx'))){
  const source=fs.readFileSync(file,'utf8');
  const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function inspectFunction(name,body){
    if(!body || !ts.isBlock(body))return;
    const statements=[...body.statements];
    let earlyIndex=-1;
    for(let i=0;i<statements.length;i++){
      const st=statements[i];
      if((ts.isIfStatement(st)&&containsReturn(st))||ts.isReturnStatement(st)){
        earlyIndex=i; break;
      }
    }
    if(earlyIndex<0)return;
    const later=[];
    for(let i=earlyIndex+1;i<statements.length;i++) if(isHookCall(statements[i])) later.push(i);
    if(later.length){
      const pos=sf.getLineAndCharacterOfPosition(statements[earlyIndex].getStart(sf));
      findings.push({file,name,line:pos.line+1,early_statement:stat.SyntaxKind[statements[earlyIndex].kind],later_hook_statement_indexes:later});
    }
  }
  function visit(node){
    if(ts.isFunctionDeclaration(node)&&node.name&&/^[A-Z]/.test(node.name.text)) inspectFunction(node.name.text,node.body);
    if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&/^[A-Z]/.test(node.name.text)){
      const init=node.initializer;
      if(init&&(ts.isArrowFunction(init)||ts.isFunctionExpression(init))) inspectFunction(node.name.text,init.body);
    }
    ts.forEachChild(node,visit);
  }
  visit(sf);
}
console.log(JSON.stringify({status:'PASS',finding_count:findings.length,findings}));
if(findings.length)process.exitCode=2;
