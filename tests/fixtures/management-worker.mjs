import { DatabaseSync } from "node:sqlite";
const management=await import(process.argv[2]),groups=await import(process.argv[3]);
const db=new DatabaseSync(process.argv[4]);db.exec("PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000");
process.stdout.write("ready\n");let input="";process.stdin.on("data",chunk=>input+=chunk);process.stdin.on("end",()=>{try{const job=JSON.parse(input),request=new Request(job.origin,{method:"POST",headers:{origin:job.origin,cookie:job.cookie,...(job.contextKey?{"x-watchnext-context":job.contextKey}:{})}});
  if(job.operation==="rotate")management.rotateGroupInvite(db,request,job.generation,job.origin);
  else if(job.operation==="remove")management.removeParticipant(db,request,job.memberId,job.generation,job.origin);
  else groups.joinAccountGroup(db,request,job.revision,job.origin);
  process.stdout.write('{"committed":true}\n');
}catch{process.stdout.write('{"committed":false}\n');}finally{db.close();}});
