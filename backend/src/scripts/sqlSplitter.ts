export function splitSql(source:string):string[]{
  const statements:string[]=[];let delimiter=';';let buffer='';
  for(const line of source.split(/\r?\n/)){
    if(/^\s*--/.test(line))continue;
    const directive=line.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if(directive){delimiter=directive[1]!;continue;}
    buffer+=line+'\n';
    let index:number;
    while((index=buffer.indexOf(delimiter))>=0){
      const statement=buffer.slice(0,index).trim();buffer=buffer.slice(index+delimiter.length);
      if(statement)statements.push(statement);
    }
  }
  if(buffer.trim())statements.push(buffer.trim());
  return statements;
}
