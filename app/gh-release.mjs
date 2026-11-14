const r=await fetch('https://api.github.com/repos/Azzdqe999/ZhiJian/releases/latest',{headers:{'User-Agent':'PaperBetween'}})
console.log('status',r.status)
const j=await r.json()
console.log(JSON.stringify({tag:j.tag_name,name:j.name,url:j.html_url,assets:(j.assets||[]).map(a=>({name:a.name,size:a.size,url:a.browser_download_url}))},null,1))
