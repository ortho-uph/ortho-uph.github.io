import {CpModel,CpSolver,CpSolverStatus,LinearExpr} from './vendor/cpsat/dist/solver.mjs';
import {approvedPair,initial,calendar,monthlyQuota,readiness,counts} from './engine.mjs?v=pairs1';

export async function solveCP(s){
 const solver=await CpSolver.create(),model=new CpModel();
 const shifts=initial(s),fixed=counts(s,shifts),{days,total}=calendar(s);
 const {min,max}=monthlyQuota(total,s.people.length);
 const zero=LinearExpr.fromConstant(0);
 const sum=xs=>xs.reduce((acc,x)=>acc.plus(x.toLinearExpr()),zero);
 const rows=s.people.map(()=>Array.from({length:days+1},()=>[null,null,null]));
 const assignments=[],deficits=[],nightTotals=[];
 const slots=readiness(s).missing;
 // Shuffle equivalent choices so a new generation may explore another roster.
 for(let i=slots.length-1;i>0;i--){
  const j=Math.floor(Math.random()*(i+1));
  [slots[i],slots[j]]=[slots[j],slots[i]];
 }
 for(const {d,k,count,candidates} of slots){
  const choices=candidates.map(i=>{
   const x=model.newBoolVar('shift_'+i+'_'+d+'_'+k);
   rows[i][d][k]=x;
   assignments.push(x);
   return x;
  });
  model.add(sum(choices).le(count));
 }
 for(const [i,row] of rows.entries()){
  const added=sum(row.flat().filter(Boolean));
  model.add(added.le(Math.max(0,max-fixed[i].total)));
  const deficit=model.newIntVar(0,min,'short_'+i);
  model.add(added.plus(deficit.toLinearExpr()).ge(min-fixed[i].total));
  deficits.push(deficit);
  if(s.people[i].night)nightTotals.push(sum(row.map(r=>r[2]).filter(Boolean)).plus(fixed[i].n));
  for(let d=1;d<=days;d++){
   const busy=row[d].slice(1).filter(Boolean);
   model.add(sum(busy).le(1));
   if(s.spacing&&d<days){
    for(const k of [1,2])for(const next of [1,2]){
     if(row[d][k]&&row[d+1][next]&&!approvedPair(s,i,d,k,next))
      model.add(sum([row[d][k],row[d+1][next]]).le(1));
    }
   }
  }
 }
 for(const pair of s.apart||[]){
  const [a,b]=pair.map(id=>s.people.findIndex(p=>p.id===id));
  if(a<0||b<0)continue;
  for(let d=1;d<=days;d++)model.add(sum([rows[a][d][1],rows[b][d][1]].filter(Boolean)).le(1));
 }
 const low=model.newIntVar(0,days,'night_low'),high=model.newIntVar(0,days,'night_high');
 model.add(high.ge(low.toLinearExpr()));
 for(const nights of nightTotals){model.add(nights.ge(low.toLinearExpr()));model.add(nights.le(high.toLinearExpr()));}
 const fairnessWeight=days+1,coverageWeight=(total+1)*fairnessWeight;
 model.maximize(sum(assignments).times(coverageWeight).minus(sum(deficits).times(fairnessWeight)).minus(high.toLinearExpr()).plus(low.toLinearExpr()));
 const result=solver.solve(model,{maxTimeInSeconds:8});
 if(![CpSolverStatus.FEASIBLE,CpSolverStatus.OPTIMAL].includes(result.status))throw Error('CP-SAT ยังไม่พบร่างในเวลาที่กำหนด');
 rows.forEach((row,i)=>row.forEach((parts,d)=>parts.forEach((x,k)=>{if(x&&result.value(x))shifts[i][d][k]=true;})));
 return shifts;
}
