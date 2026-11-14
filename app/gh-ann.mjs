const r=await fetch('https://api.github.com/repos/Azzdqe999/ZhiJian/check-runs/132455379083/annotations',{headers:{'User-Agent':'PaperBetween'}})
const j=await r.json(); for(const a of j) console.log(a.annotation_level+': '+a.message)
