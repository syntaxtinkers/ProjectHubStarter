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
 const {data:userData,error:userError}=await auth.auth.getUser(token);
 if(userError||!userData.user)return reply(401,{error:"Invalid session."});
 let input:{company_id?:string;leave_id?:string};try{input=await req.json()}catch{return reply(400,{error:"Invalid JSON."})}
 if(!input.company_id||!input.leave_id)return reply(400,{error:"Company and leave request are required."});
 const db=createClient(url,service,{auth:{persistSession:false}});
 const {data:leave}=await db.from("company_leave").select("id,company_id,user_id,start_date,end_date,reason,approval_status").eq("id",input.leave_id).eq("company_id",input.company_id).maybeSingle();
 if(!leave||leave.user_id!==userData.user.id||leave.approval_status!=="pending")return reply(403,{error:"Leave request not authorized."});
 const [{data:company},{data:employee},{data:admins}]=await Promise.all([
 db.from("companies").select("name,slug").eq("id",input.company_id).maybeSingle(),
 db.from("company_members").select("full_name").eq("company_id",input.company_id).eq("user_id",userData.user.id).maybeSingle(),
 db.from("company_members").select("user_id").eq("company_id",input.company_id).eq("role","admin")
 ]);
 if(!company)return reply(404,{error:"Company not found."});
 const ids=(admins||[]).map((x:{user_id:string})=>x.user_id);
 const {data:contacts,error:contactError}=await db.from("company_member_contacts").select("user_id,phone_e164,whatsapp_opted_in").eq("company_id",input.company_id).in("user_id",ids);
 if(contactError)return reply(500,{error:"Admin WhatsApp contacts could not be read."});
 const recipients=(contacts||[]).filter((x:{phone_e164:string|null;whatsapp_opted_in:boolean})=>x.phone_e164&&x.whatsapp_opted_in);
 if(!recipients.length)return reply(200,{sent:0,skipped:true,message:"No opted-in admin WhatsApp contacts are configured."});
 const access=Deno.env.get("WHATSAPP_ACCESS_TOKEN"),phoneId=Deno.env.get("WHATSAPP_PHONE_NUMBER_ID"),version=Deno.env.get("WHATSAPP_API_VERSION"),template=Deno.env.get("WHATSAPP_LEAVE_REQUEST_TEMPLATE_NAME"),appUrl=Deno.env.get("APP_URL");
 if(!access||!phoneId||!version||!template||!appUrl)return reply(503,{error:"WhatsApp credentials, approved leave template, and APP_URL are required."});
 const link=new URL(appUrl);link.searchParams.set("company",company.slug);link.searchParams.set("approveLeave",leave.id);
 const dates=leave.start_date===leave.end_date?leave.start_date:leave.start_date+" to "+leave.end_date;
 const params=[employee?.full_name||userData.user.email||"Employee",company.name,dates,leave.reason||"No reason provided",link.toString()];
 let sent=0;const errors:string[]=[];
 for(const person of recipients as Array<{user_id:string;phone_e164:string}>){
  const response=await fetch("https://graph.facebook.com/"+version+"/"+phoneId+"/messages",{method:"POST",headers:{Authorization:"Bearer "+access,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",to:person.phone_e164.replace(/[^0-9]/g,""),type:"template",template:{name:template,language:{code:"en"},components:[{type:"body",parameters:params.map(text=>({type:"text",text:String(text).slice(0,900)}))}]}})});
  if(response.ok)sent++;else errors.push(person.user_id);
 }
 if(!sent)return reply(502,{error:"WhatsApp could not deliver to the configured admins.",failed:errors.length});
 return reply(200,{sent,failed:errors.length});
});
