// Keep ownership when flattening saved batches or receiving a finished job.
export function unpackPracticeRecords(records){
  return records.flatMap(record=>(record.problems||[]).map(problem=>({...problem,
    sourceProblemId:record.sourceProblemId||problem.sourceProblemId||'',
    sourceLessonId:record.lessonId||problem.sourceLessonId||'',
  })));
}
export function variantsForProblem(problems,problem,lessons=[]){
  if(!problem?.id)return [];
  const owners=new Map(lessons.filter(Boolean).map(l=>[l.id,l.problemId||l.problem?.id]));
  return problems.filter(p=>!p.knowledgeTopic&&(p.sourceProblemId||owners.get(p.sourceLessonId))===problem.id);
}
