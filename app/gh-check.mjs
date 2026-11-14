const r=await fetch('https://api.github.com/repos/Azzdqe999/ZhiJian/check-runs/132454401592',{headers:{'User-Agent':'PaperBetween','Accept':'application/vnd.github+json'}})
console.log(r.status)
const j=await r.json()
console.log(JSON.stringify(j).slice(0,2500))
