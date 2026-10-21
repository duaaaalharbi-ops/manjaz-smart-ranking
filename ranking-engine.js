/* المفاضلة الذكية – deterministic, side-effect-free scheduling engine.
   This is a SCHOOL configuration aid, not a statement of Ministry policy.
   No names or live school records are embedded here.
*/
(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.SmartRankingEngine=api;
})(typeof window!=="undefined"?window:null,function(){
  "use strict";
  const DEFAULTS=Object.freeze({
    maxDailyLong:5,maxDailyShort:4,normalWeeklyCap:24,advancedWeeklyCap:22,expertWeeklyCap:18,
    grade3Demand:11,grade2Demand:13,grade1Demand:20,
    repeatLowLoadCount:2,weights:{week:30,term:10,daily:18,workload:0.35,consecutive:9},
    fullCadre:false,disallowAdjacentOriginal:false
  });
  function norm(value){
    return String(value||"").trim().replace(/[أإآ]/g,"ا").replace(/ة/g,"ه")
      .replace(/ى/g,"ي").replace(/\s+/g,"").replace(/[ًٌٍَُِّْـ]/g,"");
  }
  function dateValue(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||"")))throw Error("التاريخ غير صحيح.");
    const d=new Date(value+"T12:00:00Z");
    if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw Error("التاريخ غير صحيح.");
    return d;
  }
  function dayKey(date){
    const k=["sun","mon","tue","wed","thu","fri","sat"][dateValue(date).getUTCDay()];
    if(k==="fri"||k==="sat")throw Error("المفاضلة المدرسية متاحة من الأحد إلى الخميس فقط.");
    return k;
  }
  function weekBounds(date){
    const d=dateValue(date),dow=d.getUTCDay();d.setUTCDate(d.getUTCDate()-dow);
    const start=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);
    return [start,d.toISOString().slice(0,10)];
  }
  function stage(className){
    const v=norm(className);
    if(v.startsWith("اول")||v.startsWith("1")||v.startsWith("اولي"))return 1;
    if(v.startsWith("ثاني")||v.startsWith("2"))return 2;
    if(v.startsWith("ثالث")||v.startsWith("3"))return 3;
    return 0;
  }
  function teacherId(t){return String(t.id||t.teacher_id||"");}
  function assignedId(a){return String(a.assigned_teacher_id||a.assignedTeacherId||"");}
  function absentId(a){return String(a.absent_teacher_id||a.absentTeacherId||"");}
  function currentAssignments(all,date){
    return (all||[]).filter(a=>a.status!=="cancelled"&&a.status!=="ملغي"
      &&a.status!=="draft"&&a.assignment_date<=date&&assignedId(a));
  }
  function countAssignments(rows,id,start,end){
    return rows.filter(a=>assignedId(a)===id&&a.assignment_date>=start&&a.assignment_date<=end).length;
  }
  function rankCap(t,settings){
    const r=norm(t.employee_rank||t.rank);
    const cap=typeof t.weekly_cap==="number"?t.weekly_cap
      :r.includes("خبير")?settings.expertWeeklyCap:r.includes("متقدم")?settings.advancedWeeklyCap:settings.normalWeeklyCap;
    return Math.min(cap,r.includes("خبير")?settings.expertWeeklyCap:r.includes("متقدم")?settings.advancedWeeklyCap:settings.normalWeeklyCap);
  }
  function activeRules(t,all,date){
    const id=teacherId(t);
    return (all||[]).filter(r=>String(r.teacher_id)===id&&r.active!==false
      &&(!r.start_date||r.start_date<=date)&&(!r.end_date||r.end_date>=date));
  }
  function ruleValue(r){return r.rule_details||r.details||{};}
  function ruleByCode(rs,code){return rs.find(r=>r.rule_code===code);}
  function exceptionDegree(rs){
    const r=ruleByCode(rs,"exception_grade");
    const value=Number(r?ruleValue(r).degree:0);
    return [1,2,3].includes(value)?value:0;
  }
  function scheduleOf(t){return Array.isArray(t.schedule)?t.schedule:null;}
  function occupiedOriginal(t,day,period){
    const sch=scheduleOf(t);
    return sch?sch.some(x=>x.day_key===day&&Number(x.period)===period):true;
  }
  function ownClass(t,c){
    return (scheduleOf(t)||[]).some(s=>norm(s.class_name)===norm(c)&&norm(c)!=="");
  }
  function prefTier(t,rs,v){
    const r=ruleByCode(rs,"stage_preference");
    if(!r)return 0;
    const tiers=ruleValue(r).tiers;
    if(!Array.isArray(tiers))return 0;
    const current="stage:"+stage(v.class_name);
    const own=ownClass(t,v.class_name);
    for(let i=0;i<tiers.length;i++){
      const group=Array.isArray(tiers[i])?tiers[i]:[tiers[i]];
      if(group.includes(current)||(own&&group.includes("own")))return i;
    }
    return tiers.length;
  }
  function previousAbsenceMissed(t,date,absences){
    const id=teacherId(t),[start]=weekBounds(date);
    const days=new Set((absences||[]).filter(a=>absentId(a)===id&&a.status!=="cancelled"
      &&a.absence_date>=start&&a.absence_date<date).map(a=>a.absence_date));
    let missed=0;
    days.forEach(d=>{
      const dow=dayKey(d);
      missed+=(scheduleOf(t)||[]).filter(x=>x.day_key===dow&&String(x.class_name||"").trim()).length;
    });
    return missed;
  }
  function evaluateCandidate(t,v,context,allowTier){
    const id=teacherId(t),s=context.settings,day=context.day,date=context.date;
    const rs=activeRules(t,context.rules,date);
    const reasons=[];
    if(!id||t.active===false)return {ok:false,reason:"سجل المعلمة غير نشط"};
    if(id===String(v.absent_teacher_id))return {ok:false,reason:"المعلمة غائبة عن الحصة"};
    if((context.absences||[]).some(a=>absentId(a)===id&&a.absence_date===date&&a.status!=="cancelled"))
      return {ok:false,reason:"المعلمة غائبة في يوم الإسناد"};
    if(ruleByCode(rs,"total_exclusion")||ruleByCode(rs,"secondment"))
      return {ok:false,reason:"استبعاد قطعي معتمد"};
    if(scheduleOf(t)===null)return {ok:false,reason:"الجدول الأصلي غير موثق"};
    if(occupiedOriginal(t,day,Number(v.period)))
      return {ok:false,reason:"تعارض مع الحصة الأصلية أو النشاط"};
    if(ruleByCode(rs,"breastfeeding")&&((day==="sun"||day==="mon")&&Number(v.period)===7
      ||(["tue","wed","thu"].includes(day)&&Number(v.period)===6)))
      return {ok:false,reason:"قيد ساعة الرضاعة"};
    if(s.disallowAdjacentOriginal&&[Number(v.period)-1,Number(v.period)+1].some(p=>p>0&&occupiedOriginal(t,day,p)))
      return {ok:false,reason:"قيد عدم التتابع مع الحصص الأصلية"};
    if(ruleByCode(rs,"class_only")){
      const allowed=ruleValue(ruleByCode(rs,"class_only")).stages||[];
      if(!allowed.includes(stage(v.class_name)))return {ok:false,reason:"مرحلة غير مسموحة بموجب قيد إلزامي"};
    }
    const base=Number(t.original_weekly_load);
    if(!Number.isInteger(base)||base<0)return {ok:false,reason:"النصاب الأصلي غير موثق"};
    const wk=context.counts(id,"week"),dy=context.counts(id,"day");
    const maxWeek=rankCap(t,s);
    if(base+wk>=maxWeek)return {ok:false,reason:"استيفاء السقف الأسبوعي"};
    const origDaily=scheduleOf(t).filter(c=>c.day_key===day&&String(c.class_name||"").trim()).length;
    if(origDaily+dy>=(day==="sun"||day==="mon"?s.maxDailyLong:s.maxDailyShort))
      return {ok:false,reason:"استيفاء السقف اليومي"};
    if(context.occupiedSlots.has(id+"|"+v.period))
      return {ok:false,reason:"لديها احتياط آخر في الحصة نفسها"};
    if(context.sameTeacherClass.has(id+"|"+norm(v.class_name)))
      return {ok:false,reason:"تكرار احتياط الفصل للمعلمة في اليوم"};
    const deg=exceptionDegree(rs);
    let tier=0;
    if(deg===3){
      tier=1;
      if(base>=15)return {ok:false,reason:"درجة ٣ مخصصة للنصاب الأقل من ١٥"};
      if(context.demand<s.grade3Demand)return {ok:false,reason:"لم تبلغ الحاجة حد مراجعة الاستثناء ٣"};
      if(!context.lowLoadRepeated)return {ok:false,reason:"لم يثبت تكرار إسناد الاحتياط للأقل نصابًا"};
    }else if(deg===2){
      tier=2;
      if(context.demand<s.grade2Demand)return {ok:false,reason:"لم تبلغ الحاجة مستوى الضرورة"};
      if(!previousAbsenceMissed(t,date,context.absences))return {ok:false,reason:"لا يوجد نقص أسبوعي موثق بسبب غياب سابق"};
      if(wk>1)return {ok:false,reason:"تكرر إسناد الاحتياط خلال الأسبوع"};
    }else if(deg===1){
      tier=3;
      if(context.demand<s.grade1Demand)return {ok:false,reason:"لم تبلغ الحاجة مستوى الضرورة القصوى"};
    }
    if(tier>allowTier)return {ok:false,reason:"درجة الاستثناء محمية في المرحلة الحالية"};
    const wr=context.weekStart,term=context.termStart;
    const hist=context.history;
    const termCount=countAssignments(hist,id,term,date)+context.plannedFor(id);
    const adj=context.planned.some(z=>z.assigned_teacher_id===id&&Math.abs(z.period-v.period)===1)?1:0;
    const weights=s.weights;
    const score=(wk*weights.week)+(termCount*weights.term)+(dy*weights.daily)
      +((base+wk)*weights.workload)+(adj*weights.consecutive);
    reasons.push("مستوفية شروط الأهلية","السقف الأسبوعي "+(base+wk)+"/"+maxWeek,"تكليفات الأسبوع "+wk);
    if(tier)reasons.push("رفع درجة الاستثناء "+deg+" وفق شروط الضرورة");
    return {ok:true,tier,score,preference:prefTier(t,rs,v),reasons};
  }
  function validateScenario(input){
    const date=String(input.date||"");const day=dayKey(date);
    const vacancies=input.vacancies||[];
    if(!Array.isArray(vacancies)||vacancies.length>120)throw Error("عدد الحصص غير صالح (الحد الأقصى ١٢٠).");
    if(!Array.isArray(input.teachers)||input.teachers.length>400)throw Error("كشف المعلمات غير صالح.");
    const seen=new Set(),limit=(day==="sun"||day==="mon")?7:6;
    for(const v of vacancies){
      if(!Number.isInteger(Number(v.period))||Number(v.period)<1||Number(v.period)>limit||
        !String(v.class_name||"").trim()||!v.absent_teacher_id)throw Error("بيانات إحدى الحصص غير مكتملة أو خارج جدول اليوم.");
      const key=v.period+"|"+norm(v.class_name);
      if(seen.has(key))throw Error("حصة مكررة للفصل نفسه في الفترة نفسها.");
      seen.add(key);
    }
    return day;
  }
  function simulate(input){
    const day=validateScenario(input),date=input.date;
    const settings={...DEFAULTS,...(input.settings||{}),weights:{...DEFAULTS.weights,...(input.settings?.weights||{})}};
    const history=currentAssignments(input.assignments||[],date);
    const [weekStart]=weekBounds(date);
    const planned=[],uncovered=[],rules=input.rules||[],absences=input.absences||[];
    const occupiedSlots=new Set(),sameTeacherClass=new Set();
    history.filter(a=>a.assignment_date===date).forEach(a=>{
      occupiedSlots.add(assignedId(a)+"|"+a.period);
      sameTeacherClass.add(assignedId(a)+"|"+norm(a.class_name));
    });
    const lowLoadRepeated=(input.teachers||[]).some(t=>Number(t.original_weekly_load)<15
      &&countAssignments(history,teacherId(t),weekStart,date)>=settings.repeatLowLoadCount);
    const demand=input.vacancies.length+history.filter(a=>a.assignment_date===date).length;
    const context={
      settings,day,date,history,planned,rules,absences,demand,weekStart,
      termStart:settings.termStart&&settings.termStart<=date?settings.termStart:weekStart,
      occupiedSlots,sameTeacherClass,lowLoadRepeated,
      plannedFor:id=>planned.filter(a=>a.assigned_teacher_id===id).length,
      counts:(id,scope)=>scope==="day"?
        countAssignments(history,id,date,date)+planned.filter(a=>a.assigned_teacher_id===id).length:
        countAssignments(history,id,weekStart,date)+planned.filter(a=>a.assigned_teacher_id===id).length
    };
    const vacancies=(input.vacancies||[]).map((v,i)=>({...v,id:v.id||"v"+(i+1)}));
    // Most constrained vacancies first; stable tie-breaking avoids dependence on input order.
    vacancies.sort((a,b)=>{
      const count=v=>(input.teachers||[]).filter(t=>evaluateCandidate(t,v,context,3).ok).length;
      return count(a)-count(b)||a.period-b.period||norm(a.class_name).localeCompare(norm(b.class_name),"ar");
    });
    for(const v of vacancies){
      const sameExisting=history.some(a=>a.assignment_date===date&&Number(a.period)===Number(v.period)
        &&norm(a.class_name)===norm(v.class_name));
      if(sameExisting){uncovered.push({...v,reason:"الحصة مسندة مسبقًا في السجل المعتمد"});continue;}
      let best=null,stageUsed=0;
      for(let tier=0;tier<=3;tier++){
        const candidates=(input.teachers||[]).map(t=>({teacher:t,...evaluateCandidate(t,v,context,tier)}))
          .filter(c=>c.ok).sort((a,b)=>a.tier-b.tier||a.score-b.score
            ||norm(a.teacher.full_name).localeCompare(norm(b.teacher.full_name),"ar")||teacherId(a.teacher).localeCompare(teacherId(b.teacher)));
        if(candidates.length){best=candidates[0];stageUsed=tier;break;}
      }
      if(!best){uncovered.push({...v,reason:"لا توجد معلمة مؤهلة ضمن السقوف وشروط الضرورة الحالية"});continue;}
      const a={
        id:v.id,period:Number(v.period),class_name:String(v.class_name),
        absent_teacher_id:String(v.absent_teacher_id),assigned_teacher_id:teacherId(best.teacher),
        assigned_name:best.teacher.full_name||"",tier:best.tier,
        base_score:Number(best.score.toFixed(2)),preference_rank:best.preference,
        reasons:best.reasons,stage_used:stageUsed
      };
      planned.push(a);
      occupiedSlots.add(a.assigned_teacher_id+"|"+a.period);
      sameTeacherClass.add(a.assigned_teacher_id+"|"+norm(a.class_name));
    }
    const baseSnapshot=planned.map(x=>({id:x.id,teacher_id:x.assigned_teacher_id,period:x.period,class_name:x.class_name}));
    // Secondary optimization can only exchange already-selected teachers. Never changes
    // who was selected, their assignment count, or the baseline fairness result.
    function validSwap(a,b,ta,tb){
      if(a.assigned_teacher_id===b.assigned_teacher_id)return false;
      const compatible=(t,target,own)=>{
        if(occupiedOriginal(t,day,target.period))return false;
        const rs=activeRules(t,rules,date);
        if(ruleByCode(rs,"breastfeeding")&&(((day==="sun"||day==="mon")&&Number(target.period)===7)||(["tue","wed","thu"].includes(day)&&Number(target.period)===6)))return false;
        if(settings.disallowAdjacentOriginal&&[Number(target.period)-1,Number(target.period)+1].some(p=>p>0&&occupiedOriginal(t,day,p)))return false;
        if(ruleByCode(rs,"class_only")&&!((ruleValue(ruleByCode(rs,"class_only")).stages||[]).includes(stage(target.class_name))))return false;
        for(const x of planned){
          if(x===own||x===target)continue;
          if(x.assigned_teacher_id===teacherId(t)&&
            (x.period===target.period||norm(x.class_name)===norm(target.class_name)))return false;
        }
        if(history.some(x=>x.assignment_date===date&&assignedId(x)===teacherId(t)&&
          (Number(x.period)===target.period||norm(x.class_name)===norm(target.class_name))))return false;
        return true;
      };
      return compatible(ta,b,a)&&compatible(tb,a,b);
    }
    let changes=0;
    for(let round=0;round<Math.min(planned.length,12);round++){
      let improved=false;
      outer:for(let i=0;i<planned.length;i++){
        for(let j=i+1;j<planned.length;j++){
          const a=planned[i],b=planned[j];
          const ta=input.teachers.find(t=>teacherId(t)===a.assigned_teacher_id);
          const tb=input.teachers.find(t=>teacherId(t)===b.assigned_teacher_id);
          if(!ta||!tb||!validSwap(a,b,ta,tb))continue;
          const ar=activeRules(ta,rules,date),br=activeRules(tb,rules,date);
          const before=prefTier(ta,ar,a)+prefTier(tb,br,b);
          const after=prefTier(ta,ar,b)+prefTier(tb,br,a);
          if(after>=before)continue;
          const first={assigned_teacher_id:a.assigned_teacher_id,assigned_name:a.assigned_name,tier:a.tier,
            base_score:a.base_score,reasons:a.reasons};
          const second={assigned_teacher_id:b.assigned_teacher_id,assigned_name:b.assigned_name,tier:b.tier,
            base_score:b.base_score,reasons:b.reasons};
          Object.assign(a,second,{preference_rank:prefTier(tb,br,a),
            reasons:[...second.reasons,"تبادل تنظيمي محفوظ العدالة"]});
          Object.assign(b,first,{preference_rank:prefTier(ta,ar,b),
            reasons:[...first.reasons,"تبادل تنظيمي محفوظ العدالة"]});
          changes++;improved=true;break outer;
        }
      }
      if(!improved)break;
    }
    const finalIds=planned.map(x=>x.assigned_teacher_id).sort().join("|");
    const originalIds=baseSnapshot.map(x=>x.teacher_id).sort().join("|");
    if(finalIds!==originalIds)throw Error("خطأ تحقق: تبدّل المستحقات أثناء تحسين الفصول.");
    // Check class/period/teacher invariants after all exchanges.
    const finalKeys=new Set();
    for(const a of planned){
      const key=a.assigned_teacher_id+"|"+a.period;
      if(finalKeys.has(key))throw Error("خطأ تحقق: تعارض تكليفات في الفترة نفسها.");
      finalKeys.add(key);
    }
    return {
      date,version:"2.0.0-pilot",approval_ready:false,
      policy_status:"بانتظار اعتماد الحدود النهائية واستيراد كشف المعلمات",
      requested:vacancies.length,covered:planned.length,uncovered:uncovered.length,
      swaps:changes,stage_optimization:"تفضيلات تنظيمية لاحقة لا تغيّر عدد التكليفات لكل معلمة",
      baseline:baseSnapshot,assignments:planned,unfilled:uncovered,
      diagnostics:{dailyDemand:demand,lowLoadRepeated,thresholds:{grade3:settings.grade3Demand,grade2:settings.grade2Demand,grade1:settings.grade1Demand}},
      note:"نتيجة محاكاة فقط، لا تنتج تكليفًا رسميًا ولا تنشر بيانات في منجز."
    };
  }
  return {simulate,stage,norm,weekBounds,defaultSettings:()=>JSON.parse(JSON.stringify(DEFAULTS))};
});
