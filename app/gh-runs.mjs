const r=await fetch('https://api.github.com/repos/Azzdqe999/ZhiJian/actions/runs?per_page=5',{headers:{'User-Agent':'PaperBetween','Accept':'application/vnd.github+json'}})
console.log('status',r.status)
const j=await r.json()
if(!j.workflow_runs){console.log(JSON.stringify(j).slice(0,500));process.exit(0)}
for(const run of j.workflow_runs){console.log(JSON.stringify({id:run.id,name:run.name,event:run.event,status:run.status,conclusion:run.conclusion,head:run.head_branch,created:run.created_at,url:run.html_url}))}
