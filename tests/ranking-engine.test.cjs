/* Regression tests — no database or real teacher data. */
const assert=require("node:assert/strict");
const E=require("../ranking-engine.js");
const date="2026-10-21";
const teacher=(id,name,load=12,rank="معلم")=>({id,full_name:name,original_weekly_load:load,employee_rank:rank,active:true,schedule:[]});
const vacancy=(id,period,cls,absent="ABSENT")=>({id,period,class_name:cls,absent_teacher_id:absent});
const simulate=x=>E.simulate({date,teachers:[],vacancies:[],rules:[],absences:[],assignments:[],...x});
function test(label,fn){fn();console.log("PASS "+label);}
test("baseline fairness prefers smaller weekly burden",()=>{
 const t=[teacher("a","معلمة أ"),teacher("b","معلمة ب")];
 const assignments=[{assignment_date:"2026-10-19",assigned_teacher_id:"a",period:4,class_name:"أول1",status:"approved"}];
 const r=simulate({teachers:t,vacancies:[vacancy("v1",1,"أول2")],assignments});
 assert.equal(r.assignments[0].assigned_teacher_id,"b");
});
test("hard exclusion outranks every preference and need",()=>{
 const t=[teacher("a","معلمة أ")];
 const r=simulate({teachers:t,vacancies:[vacancy("v1",1,"أول2")],rules:[
  {teacher_id:"a",rule_code:"total_exclusion",active:true,rule_details:{}}
 ]});
 assert.equal(r.covered,0);
});
test("original lessons and activity periods are blocked",()=>{
 const t=[teacher("a","معلمة أ"),teacher("b","معلمة ب")];
 t[0].schedule=[{day_key:"wed",period:1,class_name:"ثاني1",activity:true}];
 const r=simulate({teachers:t,vacancies:[vacancy("v1",1,"أول2")]});
 assert.equal(r.assignments[0].assigned_teacher_id,"b");
});
test("weekly rank cap (advanced 22) cannot be bypassed",()=>{
 const t=[teacher("a","معلمة أ",22,"معلم متقدم")];
 const r=simulate({teachers:t,vacancies:[vacancy("v1",1,"أول2")]});
 assert.equal(r.covered,0);
});
test("no same teacher at the same period and duplicate class period fails",()=>{
 const t=[teacher("a","معلمة أ"),teacher("b","معلمة ب")];
 const r=simulate({teachers:t,vacancies:[vacancy("v1",1,"أول1"),vacancy("v2",1,"ثاني1")]});
 assert.equal(r.covered,2);
 assert.equal(new Set(r.assignments.map(a=>a.assigned_teacher_id)).size,2);
 assert.throws(()=>simulate({teachers:t,vacancies:[vacancy("v1",1,"أول1"),vacancy("v2",1,"أول1")]}));
});
test("stage preference optimizes only among already selected teachers",()=>{
 const a=teacher("a","ألف"),b=teacher("b","باء");
 const rules=[
 {teacher_id:"a",rule_type:"priority",rule_code:"stage_preference",active:true,rule_details:{tiers:[["stage:2"],["stage:1"]]}},
 {teacher_id:"b",rule_type:"priority",rule_code:"stage_preference",active:true,rule_details:{tiers:[["stage:1"],["stage:2"]]}}
 ];
 const r=simulate({teachers:[a,b],rules,vacancies:[vacancy("v1",1,"أول2"),vacancy("v2",1,"ثاني2")]});
 assert.equal(r.covered,2);
 assert.deepEqual(r.assignments.map(a=>a.assigned_teacher_id).sort(),r.baseline.map(a=>a.teacher_id).sort());
 const byClass=Object.fromEntries(r.assignments.map(a=>[E.stage(a.class_name),a.assigned_teacher_id]));
 assert.equal(byClass[1],"b");assert.equal(byClass[2],"a");
});
test("flexible exception cannot unlock by volume without repeated low-load assignments",()=>{
 const t=[teacher("a","معلمة أ",10)];
 const rules=[{teacher_id:"a",rule_code:"exception_policy",active:true,rule_details:{kind:"flexible"}}];
 const vacancies=Array.from({length:11},(_,i)=>vacancy("v"+i,1+(i%6),"أول"+(i+1)));
 const r=simulate({teachers:t,rules,vacancies});
 assert.equal(r.covered,0);
});
test("flexible exception unlocks only after repeated low-load substitutions",()=>{
 const t=[teacher("a","معلمة أ",10)];
 const rules=[{teacher_id:"a",rule_code:"exception_policy",active:true,rule_details:{kind:"flexible"}}];
 const assignments=[{assignment_date:"2026-10-18",assigned_teacher_id:"a",period:4,class_name:"أول1",status:"approved"},
 {assignment_date:"2026-10-19",assigned_teacher_id:"a",period:4,class_name:"أول2",status:"approved"}];
 const vacancies=Array.from({length:11},(_,i)=>vacancy("v"+i,1+(i%6),"ثاني"+(i+1)));
 const r=simulate({teachers:t,rules,assignments,vacancies});
 assert.ok(r.covered>0);
});
test("conditional exception requires a documented weekly missed load",()=>{
 const t=[teacher("a","معلمة أ",10)];
 t[0].schedule=[{day_key:"mon",period:2,class_name:"أول2"}];
 const rules=[{teacher_id:"a",rule_code:"exception_policy",active:true,rule_details:{kind:"conditional"}}];
 const vacancies=Array.from({length:13},(_,i)=>vacancy("v"+i,1+(i%6),"ثاني"+(i+1)));
 assert.equal(simulate({teachers:t,rules,vacancies}).covered,0);
 const absences=[{absent_teacher_id:"a",absence_date:"2026-10-19",status:"active"}];
 assert.ok(simulate({teachers:t,rules,vacancies,absences}).covered>0);
});
test("hard absence and nursing hour block even during emergency",()=>{
 const t=[teacher("a","معلمة أ",10)];
 const rules=[{teacher_id:"a",rule_code:"breastfeeding",active:true,rule_details:{}}];
 const vacancies=Array.from({length:13},(_,i)=>vacancy("v"+i,6,"أول"+(i+1)));
 assert.equal(simulate({teachers:t,rules,vacancies}).covered,0);
});
test("no automatic approval or writing to data store",()=>{
 const r=simulate({teachers:[],vacancies:[vacancy("v1",1,"أول1")]});
 assert.equal(r.approval_ready,false);
 assert.equal(r.uncovered,1);
});

test("named exception labels never expose numeric grades",()=>{
 const t=[teacher("a","معلمة أ",10)];
 const rules=[{teacher_id:"a",rule_code:"exception_policy",active:true,rule_details:{kind:"flexible"}}];
 const assignments=[{assignment_date:"2026-10-18",assigned_teacher_id:"a",period:4,class_name:"أول1",status:"approved"},
 {assignment_date:"2026-10-19",assigned_teacher_id:"a",period:4,class_name:"أول2",status:"approved"}];
 const vacancies=Array.from({length:11},(_,i)=>vacancy("v"+i,1+(i%6),"ثاني"+(i+1)));
 const r=simulate({teachers:t,rules,assignments,vacancies});
 assert.equal(r.assignments[0].exception_kind,"flexible");
 assert.equal(r.assignments[0].exception_label,"استثناء مرن");
 assert.equal(r.assignments[0].phase,1);
 assert.ok(!JSON.stringify(r).includes("درجة الاستثناء"));
});
test("protected exception is never raised below critical pressure",()=>{
 const t=[teacher("a","معلمة أ",10)];
 const rules=[{teacher_id:"a",rule_code:"exception_policy",active:true,rule_details:{kind:"protected"}}];
 const vacancies=Array.from({length:19},(_,i)=>vacancy("v"+i,1+(i%6),"ثاني"+(i+1)));
 assert.equal(simulate({teachers:t,rules,vacancies}).covered,0);
 const extended=[...vacancies,vacancy("v20",2,"ثاني 20")];
 assert.ok(simulate({teachers:t,rules,vacancies:extended}).covered>0);
});
test("invalid exception policy never silently becomes an ordinary nomination",()=>{
 const t=[teacher("a","معلمة أ",10)];
 const rules=[{teacher_id:"a",rule_code:"exception_policy",active:true,rule_details:{kind:"unknown"}}];
 assert.equal(simulate({teachers:t,rules,vacancies:[vacancy("v",1,"أول2")]}).covered,0);
});
test("ordinary eligible teacher is chosen before a protected exception in high need",()=>{
 const a=teacher("a","معلمة أ",10),b=teacher("b","معلمة ب",10);
 const rules=[{teacher_id:"a",rule_code:"exception_policy",active:true,rule_details:{kind:"protected"}}];
 const vacancies=Array.from({length:20},(_,i)=>vacancy("v"+i,1+(i%6),"أول"+(i+1)));
 const r=simulate({teachers:[a,b],rules,vacancies});
 assert.equal(r.assignments[0].assigned_teacher_id,"b");
});
