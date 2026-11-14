const html=await (await fetch('https://github.com/Azzdqe999/ZhiJian/actions/runs/43597286502/job/132454401592',{headers:{'User-Agent':'PaperBetween'}})).text()
const m=html.match(/data-name="Setup Android SDK"[\s\S]{0,600}?data-log-url="([^"]*)"/)
console.log('logurl',m?.[1])
if(m?.[1]){
 const u='https://github.com'+m[1]
 const r=await fetch(u,{headers:{'User-Agent':'PaperBetween'},redirect:'follow'})
 console.log('status',r.status,r.headers.get('content-type'))
 const t=await r.text()
 console.log(t.slice(0,2000))
}
