import { createClient } from "npm:@supabase/supabase-js@2";
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const reply=(status:number,data:Record<string,unknown>)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers});
 if(req.method!=="POST")return reply(405,{error:"POST required"});
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 if(!url||!anon||!service)return reply(500,{error:"Supabase secrets are missing."});
 if(!token)return reply(401,{error:"Sign in required."});
 const auth=createClient(url,anon,{auth:{persistSession:false}});
 const {data:who,error:whoError}=await auth.auth.getUser(token);
 if(whoError||!who.user)return reply(401,{error:"Invalid session."});
 let input:{company_id?:string;leave_id?:string};try{input=await req.json()}catch{return reply(400,{error:"Invalid JSON."})}
 if(!input.company_id||!input.leave_id)return reply(400,{error:"Company and leave request are required."});
 const db=createClient(url,service,{auth:{persistSession:false}});
 const [{data:leave},{data:company},{data:adminMember}]=await Promise.all([
 db.from("company_leave").select("id,company_id,user_id,start_date,end_date,approval_status").eq("id",input.leave_id).eq("company_id",input.company_id).maybeSingle(),
 db.from("companies").select("name").eq("id",input.company_id).maybeSingle(),
 db.from("company_members").select("user_id").eq("company_id",input.company_id).eq("user_id",who.user.id).eq("role","admin").maybeSingle()
 ]);
 if(!leave||!company||!adminMember||!["approved","rejected"].includes(leave.approval_status))return reply(403,{error:"Leave decision is not authorized."});
 const {data:contacts}=await db.from("company_member_contacts").select("phone_e164,whatsapp_opted_in").eq("company_id",input.company_id).eq("user_id",leave.user_id).maybeSingle();
 if(!contacts?.phone_e164||!contacts.whatsapp_opted_in)return reply(200,{sent:false,skipped:true,message:"Employee has no opted-in WhatsApp contact."});
 const access=Deno.env.get("WHATSAPP_ACCESS_TOKEN"),phoneId=Deno.env.get("WHATSAPP_PHONE_NUMBER_ID"),version=Deno.env.get("WHATSAPP_API_VERSION"),template=Deno.env.get("WHATSAPP_LEAVE_DECISION_TEMPLATE_NAME");
 if(!access||!phoneId||!version||!template)return reply(503,{error:"WhatsApp credentials and approved leave decision template are required."});
 const dates=leave.start_date===leave.end_date?leave.start_date:leave.start_date+" to "+leave.end_date;
 const {data:employee}=await db.from("company_members").select("full_name").eq("company_id",input.company_id).eq("user_id",leave.user_id).maybeSingle();
 const params=[employee?.full_name||"Employee",company.name,dates,leave.approval_status];
 const response=await fetch("https://graph.facebook.com/"+version+"/"+phoneId+"/messages",{method:"POST",headers:{Authorization:"Bearer "+access,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",to:contacts.phone_e164.replace(/[^0-9]/g,""),type:"template",template:{name:template,language:{code:"en"},components:[{type:"body",parameters:params.map(text=>({type:"text",text:String(text).slice(0,900)}))}]}})});
 if(!response.ok)return reply(502,{error:"WhatsApp delivery failed."});
 return reply(200,{sent:true});
});
