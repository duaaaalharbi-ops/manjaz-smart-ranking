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
test("grade 3 is not unlocked by demand alone",()=>{
 const t=[teacher("a","معلمة أ",10)];
 const rules=[{teacher_id:"a",rule_code:"exception_grade",active:true,rule_details:{degree:3}}];
 const vacancies=Array.from({length:11},(_,i)=>vacancy("v"+i,1+(i%6),"أول"+(i+1)));
 const r=simulate({teachers:t,rules,vacancies});
 assert.equal(r.covered,0);
});
test("grade 3 unlocks only with repeated low-load substitutions",()=>{
 const t=[teacher("a","معلمة أ",10)];
 const rules=[{teacher_id:"a",rule_code:"exception_grade",active:true,rule_details:{degree:3}}];
 const assignments=[{assignment_date:"2026-10-18",assigned_teacher_id:"a",period:4,class_name:"أول1",status:"approved"},
 {assignment_date:"2026-10-19",assigned_teacher_id:"a",period:4,class_name:"أول2",status:"approved"}];
 const vacancies=Array.from({length:11},(_,i)=>vacancy("v"+i,1+(i%6),"ثاني"+(i+1)));
 const r=simulate({teachers:t,rules,assignments,vacancies});
 assert.ok(r.covered>0);
});
test("grade 2 needs a previous weekly absence and residual load",()=>{
 const t=[teacher("a","معلمة أ",10)];
 t[0].schedule=[{day_key:"mon",period:2,class_name:"أول2"}];
 const rules=[{teacher_id:"a",rule_code:"exception_grade",active:true,rule_details:{degree:2}}];
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
