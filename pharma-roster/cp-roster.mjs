import {CpModel,CpSolver,CpSolverStatus,LinearExpr} from './vendor/cpsat/dist/solver.mjs';
import {approvedPair,initial,calendar,monthlyQuota,readiness,counts} from './engine.mjs?v=rules3';

async function solvePass(s,solver,seconds){
 const model=new CpModel();
 const shifts=initial(s),fixed=counts(s,shifts),{days,total}=calendar(s);
 const {min,max}=monthlyQuota(total,s.people.length);
 const zero=LinearExpr.fromConstant(0);
 const sum=xs=>xs.reduce((acc,x)=>acc.plus(x.toLinearExpr()),zero);
 const rows=s.people.map(()=>Array.from({length:days+1},()=>[null,null,null]));
 const assignments=[],deficits=[],nightTotals=[],pairs=[];
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
     const left=row[d][k],right=row[d+1][next];
     if(left&&right){
      const together=sum([left,right]);
      if(!approvedPair(s,i,d,k,next))model.add(together.le(1));
      else{
       const pair=model.newBoolVar('pair_'+i+'_'+d+'_'+k+'_'+next);
       model.add(together.minus(pair.toLinearExpr()).le(1));
       pairs.push(pair);
      }
     }else if(left&&shifts[i][d+1][next])pairs.push(left);
     else if(right&&shifts[i][d][k])pairs.push(right);
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
 const pairWeight=days+1,fairnessWeight=(pairs.length+1)*pairWeight,coverageWeight=(total+1)*fairnessWeight;
 model.maximize(sum(assignments).times(coverageWeight).minus(sum(deficits).times(fairnessWeight)).minus(sum(pairs).times(pairWeight)).minus(high.toLinearExpr()).plus(low.toLinearExpr()));
 const result=solver.solve(model,{maxTimeInSeconds:seconds});
 if(![CpSolverStatus.FEASIBLE,CpSolverStatus.OPTIMAL].includes(result.status))return null;
 rows.forEach((row,i)=>row.forEach((parts,d)=>parts.forEach((x,k)=>{if(x&&result.value(x))shifts[i][d][k]=true;})));
 const totals=counts(s,shifts);
 return {shifts,coverage:totals.reduce((n,r)=>n+r.total,0),short:totals.reduce((n,r)=>n+Math.max(0,min-r.total),0)};
}

export async function solveCP(s){
 const solver=await CpSolver.create();
 const strict=s.spacing?await solvePass({...s,strictSpacing:true},solver,3):null;
 if(strict&&strict.coverage===calendar(s).total&&!strict.short)return strict.shifts;
 const relaxed=await solvePass(s,solver,8);
 if(strict&&(!relaxed||strict.coverage>relaxed.coverage||
    (strict.coverage===relaxed.coverage&&strict.short<=relaxed.short)))return strict.shifts;
 if(relaxed)return relaxed.shifts;
 throw Error('CP-SAT ยังไม่พบร่างในเวลาที่กำหนด');
}