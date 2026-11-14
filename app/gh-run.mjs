const id=43597615615
const r=await fetch('https://api.github.com/repos/Azzdqe999/ZhiJian/actions/runs/'+id+'/jobs',{headers:{'User-Agent':'PaperBetween'}})
const j=await r.json()
for(const job of j.jobs||[]){ console.log('JOB',job.id,job.conclusion); for(const s of job.steps||[]) console.log(' ',s.number,s.name,s.conclusion) }
