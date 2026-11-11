// Rebuild an EMPTY in-memory database from migrations, never the operator DB.
// --write refreshes the typed schema/snapshots after reviewed additive migrations.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {sqliteTable,text,integer,index,uniqueIndex,primaryKey,foreignKey,check} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
import {generateSQLiteDrizzleJson} from 'drizzle-kit/api';
const write=process.argv.includes('--write'),database=new DatabaseSync(':memory:');
const migrations=readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort(),journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));
const camel=s=>s.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
function model(){
 const tables=database.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all(),objects={},source=["// Generated from reviewed migrations by scripts/schema-contract.mjs --write.","import {sqliteTable,text,integer,index,uniqueIndex,primaryKey,foreignKey,check} from 'drizzle-orm/sqlite-core';","import {sql} from 'drizzle-orm';"];
 for(const table of tables){
  const columns=database.prepare(`PRAGMA table_info('${table.name}')`).all(),pks=columns.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk),properties={},lines=[],extras=[],extraCode=[];
  for(const c of columns){
   const type=c.type.toLowerCase().includes('int')?'integer':'text';let column=(type==='integer'?integer:text)(c.name),code=`${type}(${JSON.stringify(c.name)})`;
   if(c.notnull){column=column.notNull();code+='.notNull()';}if(c.pk&&pks.length===1){column=column.primaryKey();code+='.primaryKey()';}
   if(c.dflt_value!==null){const raw=c.dflt_value;let value;if(/^[-+]?\d+(?:\.\d+)?$/.test(raw))value=Number(raw);else if(raw.startsWith("'")&&raw.endsWith("'"))value=raw.slice(1,-1).replace(/''/g,"'");
    if(value!==undefined){column=column.default(value);code+=`.default(${JSON.stringify(value)})`;}else{column=column.default(sql.raw(raw));code+=`.default(sql.raw(${JSON.stringify(raw)}))`;}}
   properties[c.name]=column;lines.push(`  ${JSON.stringify(c.name)}:${code}`);
  }
  if(pks.length>1){extras.push(t=>primaryKey({columns:pks.map(c=>t[c.name])}));extraCode.push(`primaryKey({columns:[${pks.map(c=>`t[${JSON.stringify(c.name)}]`).join(',')}]})`);}
  for(const idx of database.prepare(`PRAGMA index_list('${table.name}')`).all()){
   if(idx.origin==='pk')continue;const cols=database.prepare(`PRAGMA index_info('${idx.name}')`).all();if(cols.some(c=>!c.name))throw new Error('Expression index requires explicit schema support.');
   const name=idx.name.startsWith('sqlite_autoindex')?`${table.name}_${cols.map(c=>c.name).join('_')}_unique`:idx.name,definition=database.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(idx.name)?.sql,where=definition?.match(/\bWHERE\s+([\s\S]+)/i)?.[1],factory=idx.unique?uniqueIndex:index;
   extras.push(t=>{const built=factory(name).on(...cols.map(c=>t[c.name]));return where?built.where(sql.raw(where)):built;});
   extraCode.push(`${idx.unique?'uniqueIndex':'index'}(${JSON.stringify(name)}).on(${cols.map(c=>`t[${JSON.stringify(c.name)}]`).join(',')})${where?`.where(sql.raw(${JSON.stringify(where)}))`:''}`);
  }
  const foreignGroups=new Map();for(const f of database.prepare(`PRAGMA foreign_key_list('${table.name}')`).all()){const group=foreignGroups.get(f.id)||[];group.push(f);foreignGroups.set(f.id,group);}
  for(const fs of foreignGroups.values()){fs.sort((a,b)=>a.seq-b.seq);const name=`${table.name}_${fs.map(f=>f.from).join('_')}_fk`,first=fs[0];extras.push(t=>foreignKey({name,columns:fs.map(f=>t[f.from]),foreignColumns:fs.map(f=>objects[f.table][f.to])}).onDelete(first.on_delete.toLowerCase()).onUpdate(first.on_update.toLowerCase()));extraCode.push(`foreignKey({name:${JSON.stringify(name)},columns:[${fs.map(f=>`t[${JSON.stringify(f.from)}]`).join(',')}],foreignColumns:[${fs.map(f=>`${camel(f.table)}[${JSON.stringify(f.to)}]`).join(',')}]}).onDelete(${JSON.stringify(first.on_delete.toLowerCase())}).onUpdate(${JSON.stringify(first.on_update.toLowerCase())})`);}
  // Balanced CHECK extraction preserves quoted values and nested expressions.
  let offset=0,number=0;while(true){const found=/\bCHECK\s*\(/ig;found.lastIndex=offset;const m=found.exec(table.sql);if(!m)break;let i=found.lastIndex,depth=1,quote=false,start=i;for(;i<table.sql.length&&depth;i++){const ch=table.sql[i];if(ch==="'"){if(quote&&table.sql[i+1]==="'"){i++;continue;}quote=!quote;}if(!quote){if(ch==='(')depth++;if(ch===')')depth--;}}const expression=table.sql.slice(start,i-1),name=`${table.name}_check_${number++}`;extras.push(()=>check(name,sql.raw(expression)));extraCode.push(`check(${JSON.stringify(name)},sql.raw(${JSON.stringify(expression)}))`);offset=i;}
  objects[table.name]=sqliteTable(table.name,properties,t=>extras.map(build=>build(t)));
  source.push(`export const ${camel(table.name)}=sqliteTable(${JSON.stringify(table.name)},{\n${lines.join(',\n')}\n},t=>[${extraCode.join(',\n')}]);`);
 }
 return {objects,source:source.join('\n')+'\n'};
}
let lastId=JSON.parse(readFileSync('drizzle/meta/0007_snapshot.json','utf8')).id,latest;
for(const file of migrations){database.exec(readFileSync(`drizzle/${file}`,'utf8'));const n=Number(file.slice(0,4));if(n<8)continue;const generated=model(),snapshot=await generateSQLiteDrizzleJson(generated.objects,lastId);latest=generated;
 if(write){writeFileSync(`drizzle/meta/${file.slice(0,4)}_snapshot.json`,JSON.stringify(snapshot,null,2)+'\n');lastId=snapshot.id;if(!journal.entries.some(e=>e.tag===file.slice(0,-4)))journal.entries.push({idx:n,version:'6',when:Date.UTC(2026,9,23)+n,tag:file.slice(0,-4),breakpoints:true});}
}
if(write){writeFileSync('db/schema.ts',latest.source);writeFileSync('drizzle/meta/_journal.json',JSON.stringify(journal,null,2)+'\n');console.log('Updated schema contract and additive migration metadata. No operator data changed.');}
else{
 const source=await import('../db/schema.ts'),declared=await generateSQLiteDrizzleJson(source),actual=await generateSQLiteDrizzleJson(model().objects);
 if(JSON.stringify(declared.tables)!==JSON.stringify(actual.tables))throw new Error('Typed schema differs from the migrated database. Review migrations and run schema-contract --write.');
 if(migrations.some(f=>!journal.entries.some(e=>e.tag===f.slice(0,-4))))throw new Error('Migration journal is incomplete.');
 console.log(`Schema contract passed: ${migrations.length} migrations, ${Object.keys(actual.tables).length} tables.`);
}
database.close();
