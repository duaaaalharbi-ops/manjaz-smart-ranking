/* M-Fair 1.0 — independent setup and secure connection test.
 * No Manjaz production endpoints, shared storage or shared code.
 * Public publishable key only; access is enforced by Supabase RLS.
 */
(()=>{
  "use strict";
  const CFG=window.MFAIR_CONFIG;
  const $=id=>document.getElementById(id);
  const SESSION_KEY="mfair_admin_session_v1";
  const apiBase=CFG?.url;
  const publicKey=CFG?.publishableKey;
  let session=null;
  let refreshing=null;

  function showStatus(text,tone=""){
    const el=$("connectStatus");
    el.textContent=text;el.className="notice"+(tone?" "+tone:"");
  }
  function showMessage(id,text,tone=""){
    const el=$(id);
    el.textContent=text;el.className="form-message"+(tone?" "+tone:"");
  }
  function loadSession(){
    try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||"null")||null;}
    catch(_){return null;}
  }
  function saveSession(value){
    session=value;
    if(value)sessionStorage.setItem(SESSION_KEY,JSON.stringify(value));
    else sessionStorage.removeItem(SESSION_KEY);
  }
  function headers(token){
    return {"apikey":publicKey,"Content-Type":"application/json",
      ...(token?{"Authorization":"Bearer "+token}:{})};
  }
  async function refreshAccess(){
    if(refreshing)return refreshing;
    refreshing=(async()=>{
      if(!session?.refresh_token)throw new Error("انتهت صلاحية الجلسة. أعيدي تسجيل الدخول.");
      const result=await fetch(apiBase+"/auth/v1/token?grant_type=refresh_token",{
        method:"POST",headers:headers(),cache:"no-store",
        body:JSON.stringify({refresh_token:session.refresh_token})
      });
      if(!result.ok){saveSession(null);throw new Error("انتهت صلاحية الجلسة. أعيدي تسجيل الدخول.");}
      const fresh=await result.json();
      saveSession(fresh);return fresh.access_token;
    })();
    try{return await refreshing;}finally{refreshing=null;}
  }
  async function securedGet(table,query,preferCount=false,attempt=0){
    if(!session?.access_token)throw new Error("يلزم تسجيل الدخول.");
    const h=headers(session.access_token);
    if(preferCount)h.Prefer="count=exact";
    const response=await fetch(apiBase+"/rest/v1/"+table+"?"+query,{
      method:"GET",headers:h,cache:"no-store"
    });
    if(response.status===401&&attempt===0){
      await refreshAccess();
      return securedGet(table,query,preferCount,1);
    }
    if(!response.ok){
      if(response.status===401)throw new Error("انتهت الجلسة؛ أعيدي تسجيل الدخول.");
      if(response.status===403)throw new Error("الصلاحية غير كافية لقراءة البيانات.");
      throw new Error("تعذر قراءة "+table+" (HTTP "+response.status+").");
    }
    return {rows:await response.json(),range:response.headers.get("content-range")||""};
  }
  async function verifyMember(){
    const uid=session?.user?.id;
    if(!uid)throw new Error("حساب المستخدم غير مكتمل.");
    const q=new URLSearchParams({select:"user_id,role",user_id:"eq."+uid,limit:"1"});
    const r=await securedGet("mfair_members",q.toString());
    return r.rows?.[0]?.role==="admin";
  }
  async function queryCount(table){
    const q=new URLSearchParams({select:"id",limit:"1"});
    const r=await securedGet(table,q.toString(),true);
    const n=Number(r.range.split("/").pop());
    return Number.isInteger(n)&&n>=0?n:r.rows.length;
  }
  function teacherRow(t){
    const row=document.createElement("div");row.className="teacher-entry";
    const name=document.createElement("strong");name.textContent=t.full_name||"—";
    const load=document.createElement("span");load.textContent="النصاب: "+(t.original_weekly_load??"—");
    row.append(name,load);return row;
  }
  async function refreshDashboard(){
    showMessage("adminMessage","جارٍ التحقق من جداول المشروع المستقل...");
    $("btnRefresh").disabled=true;
    try{
      if(!(await verifyMember()))throw new Error("لا توجد صلاحية إدارة معتمدة لهذا الحساب.");
      const [teachers,assignments,absences]=await Promise.all([
        securedGet("mfair_teachers","select=id,full_name,original_weekly_load&order=full_name.asc&limit=100"),
        queryCount("mfair_assignments"),
        queryCount("mfair_absences")
      ]);
      $("teacherCount").textContent=String(teachers.rows.length);
      $("assignmentCount").textContent=String(assignments);
      $("absenceCount").textContent=String(absences);
      const list=$("teacherList");list.replaceChildren();
      if(!teachers.rows.length){
        const note=document.createElement("p");
        note.className="muted";
        note.textContent="لا توجد بيانات كادر بعد. الاتصال يعمل والقاعدة جاهزة للاستيراد المراجع.";
        list.append(note);
      }else teachers.rows.forEach(t=>list.append(teacherRow(t)));
      showMessage("adminMessage","تم التحقق من الصلاحيات وقراءة جداول M-Fair بنجاح.","success");
    }catch(error){showMessage("adminMessage",error.message||"تعذر تحميل البيانات.","error");}
    finally{$("btnRefresh").disabled=false;}
  }
  async function showAdmin(){
    if(!(await verifyMember())){
      saveSession(null);
      throw new Error("تم التحقق من الحساب، لكنه غير مضاف بصلاحية admin في M-Fair. يجب تفعيل العضوية من لوحة Supabase أولًا.");
    }
    $("loginArea").hidden=true;
    $("adminArea").hidden=false;
    $("adminIdentity").textContent=session.user?.email||"حساب الإدارة";
    await refreshDashboard();
  }
  async function login(event){
    event.preventDefault();
    const btn=$("btnLogin");btn.disabled=true;
    showMessage("loginMessage","جارٍ التحقق من بيانات الدخول...");
    try{
      const email=$("email").value.trim(),password=$("password").value;
      const response=await fetch(apiBase+"/auth/v1/token?grant_type=password",{
        method:"POST",headers:headers(),cache:"no-store",
        body:JSON.stringify({email,password})
      });
      if(!response.ok)throw new Error("تعذر تسجيل الدخول. تحققي من بيانات الحساب وتفعيله في المشروع الجديد.");
      saveSession(await response.json());
      $("password").value="";
      await showAdmin();
      showMessage("loginMessage","");
    }catch(error){
      saveSession(null);$("loginArea").hidden=false;$("adminArea").hidden=true;
      showMessage("loginMessage",error.message||"تعذر تسجيل الدخول.","error");
    }finally{btn.disabled=false;}
  }
  async function logout(){
    const old=session;
    saveSession(null);
    $("adminArea").hidden=true;$("loginArea").hidden=false;
    $("password").value="";showMessage("loginMessage","تم تسجيل الخروج.");
    if(old?.access_token){
      try{await fetch(apiBase+"/auth/v1/logout",{
        method:"POST",headers:headers(old.access_token),cache:"no-store"
      });}catch(_){}
    }
  }
  async function checkHealth(){
    if(!apiBase||!publicKey){showStatus("إعدادات الاتصال غير مكتملة.","error");return;}
    try{
      const r=await fetch(apiBase+"/auth/v1/health",{
        headers:{"apikey":publicKey},cache:"no-store"
      });
      if(!r.ok)throw new Error("HTTP "+r.status);
      showStatus("الاتصال بمشروع Supabase المستقل متاح. عرض البيانات يتطلب دخول الإدارة.","success");
    }catch(_){showStatus("تعذر الوصول إلى خدمة المصادقة. تحققي من الاتصال وإعدادات النشر.","error");}
  }
  async function init(){
    $("loginForm").addEventListener("submit",login);
    $("btnLogout").addEventListener("click",logout);
    $("btnRefresh").addEventListener("click",refreshDashboard);
    if(!CFG){showStatus("ملف التهيئة غير موجود.","error");return;}
    await checkHealth();
    session=loadSession();
    if(session){
      try{await showAdmin();}
      catch(_){saveSession(null);$("loginArea").hidden=false;$("adminArea").hidden=true;}
    }
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
