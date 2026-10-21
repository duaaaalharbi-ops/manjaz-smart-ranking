/* Smart Ranking studio v2: simulation-only, no writes or imports. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const E=window.SmartRankingEngine,CFG=window.MFAIR_CONFIG;
const S={source:"none",teachers:[],rules:[],absences:[],assignments:[],settings:[],last:null};
function el(tag,value,cls){const x=document.createElement(tag);if(value!==undefined)x.textContent=value;if(cls)x.className=cls;return x;}
function status(s,tone){const e=$("studioStatus");e.textContent=s;e.className="notice"+(tone?" "+tone:"");}
function today(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
function init(){
 if(!E||!CFG||!$("studioPanel"))return;
 $("studioDate").value=today();
 $("studioDemo").addEventListener("click",demo);
 $("studioLoad").addEventListener("click",load);
 $("studioRun").addEventListener("click",run);
 $("studioExport").addEventListener("click",downloadCSV);
}
function demo(){
 const date=$("studioDate").value;
 const dow=new Date(date+"T12:00:00Z").getUTCDay();
 if(dow===5||dow===6)$("studioDate").value="2026-10-21";
 S.source="demo";
 S.teachers=[
  {id:"d1",full_name:"معلمة تجريبية أ",original_weekly_load:12,employee_rank:"معلم",schedule:[],active:true},
  {id:"d2",full_name:"معلمة تجريبية ب",original_weekly_load:12,employee_rank:"معلم",schedule:[],active:true},
  {id:"d3",full_name:"معلمة تجريبية ج",original_weekly_load:18,employee_rank:"معلم متقدم",schedule:[],active:true},
  {id:"d4",full_name:"معلمة تجريبية د",original_weekly_load:24,employee_rank:"معلم",schedule:[],active:true}
 ];
 S.rules=[
  {teacher_id:"d1",active:true,rule_code:"stage_preference",rule_details:{tiers:[["stage:2"],["stage:1"],["stage:3"]]}},
  {teacher_id:"d2",active:true,rule_code:"stage_preference",rule_details:{tiers:[["stage:1","stage:3"],["stage:2"]]}},
  {teacher_id:"d3",active:true,rule_code:"stage_preference",rule_details:{tiers:[["own"],["stage:2"]]}},
  {teacher_id:"d4",active:true,rule_code:"total_exclusion",rule_details:{reason:"النصاب مكتمل"}}
 ];
 S.assignments=[];S.absences=[];
 $("studioVacancies").value="1 | أول 1 | غائبة تجريبية\n1 | ثاني 1 | غائبة تجريبية\n2 | ثالث 1 | غائبة تجريبية";
 status("تم تحميل مثال بأسماء افتراضية فقط؛ لا توجد قراءة أو كتابة لسجلات المعلمات.","success");
 run();
}
function savedSession(){try{return JSON.parse(sessionStorage.getItem("mfair_admin_session_v1")||"null");}catch(_){return null;}}
function headers(token){return {"apikey":CFG.publishableKey,"Authorization":"Bearer "+token,"Content-Type":"application/json"};}
async function getPage(table,offset,attempt){
 let auth=savedSession();if(!auth?.access_token)throw Error("يلزم تسجيل الدخول للإدارة.");
 const q=new URLSearchParams({select:"*",limit:"500",offset:String(offset)});
 const res=await fetch(CFG.url+"/rest/v1/"+table+"?"+q,{headers:headers(auth.access_token),cache:"no-store"});
 if(res.status===401&&!attempt&&auth.refresh_token){
  const renewed=await fetch(CFG.url+"/auth/v1/token?grant_type=refresh_token",{
   method:"POST",headers:{"apikey":CFG.publishableKey,"Content-Type":"application/json"},
   body:JSON.stringify({refresh_token:auth.refresh_token})});
  if(!renewed.ok)throw Error("انتهت الجلسة؛ أعيدي تسجيل الدخول.");
  auth=await renewed.json();sessionStorage.setItem("mfair_admin_session_v1",JSON.stringify(auth));
  return getPage(table,offset,true);
 }
 if(!res.ok)throw Error("تعذر قراءة "+table+"؛ رمز الاستجابة "+res.status);
 return res.json();
}
async function getAll(table){
 let data=[];
 for(let offset=0;offset<5000;offset+=500){
  const page=await getPage(table,offset,false);data.push(...page);
  if(page.length<500)return data;
 }
 throw Error("عدد سجلات كبير، يلزم مراجعة حد القراءة.");
}
async function load(){
 $("studioLoad").disabled=true;status("جارٍ فحص بيانات المشروع المستقل للقراءة فقط...");
 try{
  const tables=["mfair_teachers","mfair_schedules","mfair_exclusions","mfair_absences","mfair_assignments","mfair_settings"];
  const [teachers,schedules,rules,absences,assignments,settings]=await Promise.all(tables.map(getAll));
  S.teachers=teachers.map(t=>({...t,schedule:schedules.filter(s=>s.teacher_id===t.id)}));
  S.rules=rules;S.absences=absences;S.assignments=assignments;S.settings=settings;
  const roster=settings.find(x=>x.setting_key==="roster_approved")?.setting_value?.approved===true;
  const policy=settings.find(x=>x.setting_key==="policy_approved")?.setting_value?.approved===true;
  if(!teachers.length||!roster||!policy){
   S.source="none";S.last=null;$("studioResults").replaceChildren();$("studioExport").disabled=true;
   status("توجد "+teachers.length+" معلمة في قاعدة المفاضلة. المحاكاة الحقيقية مُعلّقة حتى اعتماد سجل المعلمات والضوابط صراحةً؛ يمكنك تجربة المثال الافتراضي.");
  }else{S.source="live";status("تكوّن الكادر المعتمد من "+teachers.length+" معلمة. القراءة مستقلة وآمنة.","success");}
 }catch(err){S.source="none";status(err.message||"تعذر الاتصال بالمشروع.","error");}
 finally{$("studioLoad").disabled=false;}
}
function parseVacancies(date){
 const rows=$("studioVacancies").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(!rows.length)throw Error("أدخلي حصص الاحتياط المطلوبة.");
 if(rows.length>120)throw Error("حد المحاكاة ١٢٠ حصة.");
 const days=["sun","mon","tue","wed","thu","fri","sat"];
 const day=days[new Date(date+"T12:00:00Z").getUTCDay()];
 return rows.map((line,i)=>{
  const v=line.split("|").map(x=>x.trim());
  if(v.length!==3||!v[0]||!v[1]||!v[2])throw Error("صيغة السطر "+(i+1)+" يجب أن تكون «الحصة | الفصل | المعلمة الغائبة».");
  let id="demo-absent";
  if(S.source==="live"){
   const teacher=S.teachers.find(t=>E.norm(t.full_name)===E.norm(v[2]));
   if(!teacher)throw Error("المعلمة الغائبة غير موجودة في الكادر، السطر "+(i+1));
   if(!S.absences.some(a=>a.absent_teacher_id===teacher.id&&a.absence_date===date&&a.status==="active"))
    throw Error("لم يسجل غياب المعلمة في قاعدة البيانات للسطر "+(i+1));
   if(!teacher.schedule.some(c=>c.day_key===day&&Number(c.period)===Number(v[0])&&E.norm(c.class_name)===E.norm(v[1])))
    throw Error("الحصة لا تطابق جدول المعلمة الغائبة في السطر "+(i+1));
   id=teacher.id;
  }
  return {id:"vacancy-"+(i+1),period:Number(v[0]),class_name:v[1],absent_teacher_id:id};
 });
}
function run(){
 try{
  if(S.source==="none")throw Error("بيانات الكادر غير معتمدة. ابدئي بالمثال التجريبي.");
  const date=$("studioDate").value;
  // Exceptions are governed by named policies and capacity shortfall.
  // Preview thresholds are engine defaults only, never an admin edit here.
  const result=E.simulate({
   date,teachers:S.teachers,rules:S.rules,absences:S.absences,assignments:S.assignments,
   vacancies:parseVacancies(date),settings:{}
  });
  S.last=result;render(result);$("studioExport").disabled=false;
  status("انتهت المحاكاة: "+result.covered+" مسندة، و"+result.uncovered+" غير مسندة. لم تُحفظ تكليفات.","success");
 }catch(err){S.last=null;$("studioExport").disabled=true;$("studioResults").replaceChildren();status(err.message||"تعذرت المحاكاة.","error");}
}
function render(result){
 const place=$("studioResults");place.replaceChildren();
 const wrap=el("div",undefined,"studio-results");wrap.append(el("h3","نتيجة المحاكاة – "+result.date));
 const cards=el("div",undefined,"studio-counters");
 [["المطلوبة",result.requested],["المسندة",result.covered],["غير المسندة",result.uncovered],["تبادل تنظيمي",result.swaps]].forEach(row=>{
  const c=el("div",undefined,"studio-counter");c.append(el("span",row[0]),el("strong",String(row[1])));cards.append(c);
 });
 wrap.append(cards);
 const scroll=el("div",undefined,"studio-table-scroll"),table=el("table"),thead=el("thead"),tr=el("tr");
 ["الحصة","الفصل","المعلمة المستحقة","الاستثناء","سبب الترشيح أو عدمه"].forEach(x=>tr.append(el("th",x)));
 thead.append(tr);table.append(thead);
 const body=el("tbody");
 result.assignments.forEach(a=>{
  const tr=el("tr");[a.period,a.class_name,a.assigned_name,a.exception_label||"دون استثناء",a.reasons.join("؛ ")].forEach(x=>tr.append(el("td",String(x))));
  body.append(tr);
 });
 result.unfilled.forEach(a=>{
  const tr=el("tr",undefined,"uncovered");[a.period,a.class_name,"غير مسندة","—",a.reason].forEach(x=>tr.append(el("td",String(x))));body.append(tr);
 });
 table.append(body);scroll.append(table);wrap.append(scroll);
 wrap.append(el("p","ضمان العدالة: بقيت مجموعة المعلمات المختارات وعدد التكليفات لكل منهن دون تغيير بعد تحسين ملاءمة المراحل.","muted"));
 wrap.append(el("p","نسخة محاكاة فقط؛ الاعتماد والنشر معلقان حتى اعتماد البيانات والضوابط.","muted"));
 place.append(wrap);
}
function csvSafe(value){
 let s=String(value===undefined||value===null?"":value).replace(/[\r\n]/g," ");
 if(/^[=+\-@]/.test(s.trimStart()))s="'"+s;
 return '"'+s.replace(/"/g,'""')+'"';
}
function downloadCSV(){
 if(!S.last)return;
 const r=S.last;
 const lines=[["التاريخ","الحصة","الفصل","المعلمة المسندة","نوع الاستثناء","السبب"]];
 r.assignments.forEach(a=>lines.push([r.date,a.period,a.class_name,a.assigned_name,a.exception_label||"دون استثناء",a.reasons.join("؛ ")]));
 r.unfilled.forEach(a=>lines.push([r.date,a.period,a.class_name,"غير مسندة","—",a.reason]));
 const blob=new Blob(["\ufeff"+lines.map(row=>row.map(csvSafe).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob),link=document.createElement("a");
 link.href=url;link.download="smart-ranking-simulation-"+r.date+".csv";document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1200);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();