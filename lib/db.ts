
import fs from 'fs';
import path from 'path';

const DB = path.join(process.cwd(), 'tmp-db.json');

export function readDB(){
  try { return JSON.parse(fs.readFileSync(DB,'utf-8')); } catch(e){ return { threads:{}, messages:{}, escrows:{} }; }
}
export function writeDB(data){
  fs.writeFileSync(DB, JSON.stringify(data,null,2));
}
export function uid(){ return Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
