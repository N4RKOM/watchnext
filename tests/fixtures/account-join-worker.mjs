import { DatabaseSync } from "node:sqlite";
const {joinAccountGroup}=await import(process.argv[2]);
const db=new DatabaseSync(process.argv[3]);db.exec("PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000");
process.stdout.write("ready\n");let body="";process.stdin.on("data",value=>body+=value);process.stdin.on("end",()=>{try{const job=JSON.parse(body),request=new Request(job.origin,{method:"POST",headers:{origin:job.origin,cookie:job.cookie}});const result=joinAccountGroup(db,request,job.revision,job.origin);process.stdout.write(JSON.stringify({joined:true,count:result.groups.length})+"\n");}catch{process.stdout.write(JSON.stringify({joined:false})+"\n");}finally{db.close();}});
