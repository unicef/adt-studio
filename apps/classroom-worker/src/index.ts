import { z } from "zod"
import { ClassroomRepository } from "./repositories.js"
import { ClassroomService } from "./services.js"
import { materialInput, parentShareInput, participantInput, responseInput, sessionInput, studentInput } from "./schema.js"

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Access-Control-Allow-Origin":"*"}})
const teacher=(request:Request)=>{const value=request.headers.get("X-Teacher-Id");if(!value)throw new ApiError(401,"X-Teacher-Id is required");return value}
class ApiError extends Error { constructor(readonly status:number,message:string){super(message)} }
async function body<T>(request:Request,schema:z.ZodType<T>):Promise<T>{const parsed=schema.safeParse(await request.json());if(!parsed.success)throw new ApiError(400,parsed.error.message);return parsed.data}
const idFrom=(url:URL,pattern:RegExp)=>url.pathname.match(pattern)?.[1]??null
export default { async fetch(request:Request,env:Env):Promise<Response>{
  if(request.method==="OPTIONS")return new Response(null,{headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type,X-Teacher-Id","Access-Control-Allow-Methods":"GET,POST,PUT,DELETE,OPTIONS"}})
  try { const url=new URL(request.url),repo=new ClassroomRepository(env.DB),service=new ClassroomService(repo,env.DB,env.MATERIALS),studentId=idFrom(url,/^\/students\/([^/]+)$/),materialId=idFrom(url,/^\/materials\/([^/]+)$/)
    if(url.pathname==="/students"&&request.method==="GET")return json(await repo.listStudents(teacher(request)))
    if(url.pathname==="/students"&&request.method==="POST")return json(await service.createStudent(teacher(request),await body(request,studentInput) as never),201)
    if(studentId&&request.method==="PUT")return json(await service.updateStudent(studentId,teacher(request),await body(request,studentInput) as never)??notFound())
    if(studentId&&request.method==="DELETE")return json(await repo.deleteStudent(studentId,teacher(request))?{ok:true}:notFound())
    if(url.pathname==="/materials"&&request.method==="GET")return json(await repo.listMaterials(teacher(request)))
    if(url.pathname==="/materials"&&request.method==="POST")return json(await service.createMaterial(teacher(request),await body(request,materialInput) as never),201)
    if(materialId&&request.method==="GET")return json(await repo.material(materialId,teacher(request))??notFound())
    if(materialId&&request.method==="PUT")return json(await service.updateMaterial(materialId,teacher(request),await body(request,materialInput) as never)??notFound())
    if(materialId&&request.method==="DELETE")return json(await repo.deleteMaterial(materialId,teacher(request))?{ok:true}:notFound())
    const syncMaterialId=idFrom(url,/^\/materials\/([^/]+)\/sync$/)
    if(syncMaterialId&&request.method==="POST")return json(await service.retryMaterial(syncMaterialId,teacher(request))??notFound())
    const contentMaterialId=idFrom(url,/^\/materials\/([^/]+)\/content$/)
    if(contentMaterialId&&request.method==="PUT")return json(await service.uploadMaterialContent(contentMaterialId,teacher(request),await request.arrayBuffer())??notFound())
    const deliveryMaterialId=idFrom(url,/^\/materials\/([^/]+)\/deliveries$/)
    if(deliveryMaterialId&&request.method==="POST"){const input=await request.json() as { parentEmail?: string };return json(await service.sendMaterial(teacher(request),deliveryMaterialId,input.parentEmail??""),201)}
    if(url.pathname==="/workspace/analytics"&&request.method==="GET")return json(await service.analytics(teacher(request)))
    if(url.pathname==="/sessions"&&request.method==="POST"){const input=await body(request,sessionInput);return json(await service.createSession(teacher(request),input.materialId,input.durationMinutes ?? 120,url.origin),201)}
    if(url.pathname==="/sessions/join"&&request.method==="POST"){const participant=await service.join(await body(request,participantInput));return participant?json(participant,201):json({error:"Session is unavailable or expired"},404)}
    const participantId=idFrom(url,/^\/participants\/([^/]+)\/complete$/)
    if(participantId&&request.method==="POST")return json(await service.complete(participantId,(await body(request,responseInput)).responses)?{ok:true}:notFound())
    const shareMaterialId=idFrom(url,/^\/materials\/([^/]+)\/parent-shares$/)
    if(shareMaterialId&&request.method==="POST")return json(await service.createParentShare(teacher(request),shareMaterialId,(await body(request,parentShareInput)).expiresAt ?? null,url.origin),201)
    return json({error:"Not found"},404)
  } catch(error){if(error instanceof ApiError)return json({error:error.message},error.status);if(error instanceof Error)return json({error:error.message},400);return json({error:"Unexpected error"},500)}
}} satisfies ExportedHandler<Env>
function notFound():never{throw new ApiError(404,"Not found")}
