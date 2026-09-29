'use strict';
const Parser = require('rss-parser');
const {createHash} = require('node:crypto');
const parser = new Parser({timeout:12000,headers:{'User-Agent':'KoreanIssueMonitor/1.0'},customFields:{item:[['ht:approx_traffic','approxTraffic']]}});
const pacificDayFormatter = new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'});
function quotaDay(date){
  const parts=Object.fromEntries(pacificDayFormatter.formatToParts(date).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
const WINDOWS = { '1h':3600000, '24h':86400000, '7d':604800000 };
const CATEGORIES = [ ['정치',/대통령|국회|정부|선거|정당|의원|장관|탄핵|정책/], ['사건·사고',/사고|화재|사망|부상|실종|폭발|지진|침수|재난|범죄/], ['행사',/축제|공연|콘서트|전시|행사|개막|대회/], ['경제',/주가|금리|환율|물가|기업|증시|부동산/], ['생활',/날씨|교통|학교|병원|건강|교육|주택/] ];
const STOP = new Set('오늘 최근 관련 대한 한국 서울 뉴스 속보 단독 영상 공개 진행 발표 있다 했다 것으로 대해 그리고 이번 기자 사진 해당 통해 이후 오전 오후 에서 으로 하는 한다 뉴시스 연합뉴스 머니투데이 뉴스1 아시아경제 데일리안 조선일보 중앙일보 동아일보 한겨레 경향신문 서울신문'.split(' '));
function clean(value){return String(value||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,600);}
function briefSummary(title,value){const text=clean(value||title);const withoutRepeatedTitle=text.startsWith(title+' ')?text.slice(title.length).trim():text;return withoutRepeatedTitle.split(/(?<=[.!?。])\s+/).slice(0,2).join(' ').slice(0,300)||title;}
function keywords(text){const words=(clean(text).match(/[가-힣]{2,}|[A-Za-z][A-Za-z0-9]{2,}|#[가-힣A-Za-z0-9_]+/g)||[]).map(w=>w.toLowerCase().replace(/(으로|에서|에게|부터|까지|로|은|는|이|가|을|를)$/,m=>w.length>m.length+1?'':m));const count=new Map();for(const w of words)if(!STOP.has(w))count.set(w,(count.get(w)||0)+1);return [...count].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ko')).slice(0,8).map(x=>x[0]);}
function classify(text){return CATEGORIES.find(([,re])=>re.test(text))?.[0]||'기타';}
function normalized(raw){const url=raw.url||raw.link||'';const title=clean(raw.title);if(!title||!/^https?:\/\//.test(url))return null;const publishedAt=new Date(raw.publishedAt||raw.isoDate||raw.pubDate||Date.now());if(Number.isNaN(+publishedAt))return null;const summary=briefSummary(title,raw.summary||raw.contentSnippet||raw.description);const articleTitle=raw.source==='Google 뉴스'?title.replace(/\s+[-|]\s+[^-|]{2,40}$/,'').trim():title;const topicText=articleTitle+(summary===title?'':' '+summary.replace(title,articleTitle));let parsed;try{parsed=new URL(url);}catch{return null;}for(const name of [...parsed.searchParams.keys()])if(/^utm_|^(ref|fbclid|gclid|si)$/i.test(name))parsed.searchParams.delete(name);parsed.hash='';parsed.searchParams.sort();const key=parsed.toString().replace(/\/$/,'')+(raw.source==='Google 트렌드'?'|'+publishedAt.toISOString():'');const trendTraffic=raw.source==='Google 트렌드'&&/^\d[\d,]*(?:[KMB])?\+$/i.test(raw.approxTraffic||'')?raw.approxTraffic:null;return {id:createHash('sha256').update(key).digest('hex'),title,summary,url,source:raw.source||'뉴스',channel:raw.channel||raw.source||'뉴스',publishedAt:publishedAt.toISOString(),keywords:keywords(topicText),category:classify(topicText),trendTraffic};}
async function newsSearch(query,window){const end=new Date(),start=new Date(end-WINDOWS[window]);const url='https://news.google.com/rss/search?q='+encodeURIComponent(query+' after:'+start.toISOString().slice(0,10))+'&hl=ko&gl=KR&ceid=KR:ko';const feed=await parser.parseURL(url);return (feed.items||[]).slice(0,100).map(item=>({title:item.title,summary:item.contentSnippet||item.content,link:item.link,source:'Google 뉴스',channel:clean(item.title).match(/\s+[-|]\s+([^-|]{2,40})$/)?.[1]||'Google 뉴스',publishedAt:item.isoDate||item.pubDate})).filter(item=>Date.parse(item.publishedAt)>=+start);}
async function youtubeSearch(query,window,key){if(!key)return {items:[],quota:0,status:'unconfigured'};const url=new URL('https://www.googleapis.com/youtube/v3/search');url.search=new URLSearchParams({part:'snippet',q:query,type:'video',order:'date',maxResults:'25',regionCode:'KR',relevanceLanguage:'ko',publishedAfter:new Date(Date.now()-WINDOWS[window]).toISOString(),key}).toString();const res=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!res.ok)throw new Error('YouTube HTTP '+res.status);const data=await res.json();return {items:(data.items||[]).map(x=>({title:x.snippet?.title,summary:x.snippet?.description,url:'https://www.youtube.com/watch?v='+x.id?.videoId,source:'YouTube',channel:x.snippet?.channelTitle,publishedAt:x.snippet?.publishedAt,videoId:x.id?.videoId})),status:'ok'};}
async function trendsSearch(query=''){const feed=await parser.parseURL('https://trends.google.com/trending/rss?geo=KR');return (feed.items||[]).filter(item=>!query||(item.title||'').toLowerCase().includes(query.toLowerCase())).slice(0,100).map(item=>({title:item.title,summary:item.contentSnippet||item.title,url:'https://trends.google.com/trends/explore?geo=KR&q='+encodeURIComponent(item.title||''),source:'Google 트렌드',approxTraffic:item.approxTraffic,publishedAt:item.isoDate||item.pubDate}));}
async function xSearch(query,window,token){const url=new URL('https://api.x.com/2/tweets/search/recent');url.search=new URLSearchParams({query:`${query} lang:ko -is:retweet`,max_results:'25','tweet.fields':'created_at,author_id',start_time:new Date(Date.now()-Math.min(WINDOWS[window],604800000)).toISOString()}).toString();const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error(`X HTTP ${response.status}`);const data=await response.json();return (data.data||[]).map(post=>({title:post.text,summary:post.text,url:`https://x.com/i/status/${post.id}`,source:'X',channel:post.author_id,publishedAt:post.created_at,postId:post.id}));}
function headlineKey(item){return clean(item.title).toLowerCase().replace(/\s*[-|]\s*[^-|]{2,30}$/,'').replace(/[^가-힣a-z0-9]/g,'');}
function nearDuplicate(a,b){if(Math.min(a.length,b.length)<8||Math.min(a.length,b.length)/Math.max(a.length,b.length)<0.75)return false;const pairs=new Set();for(let i=0;i<a.length-1;i++)pairs.add(a.slice(i,i+2));const other=new Set();for(let i=0;i<b.length-1;i++)other.add(b.slice(i,i+2));let common=0;for(const pair of pairs)if(other.has(pair))common++;return 2*common/(pairs.size+other.size)>=0.88;}
function distinctStories(items){
  const prefixes=new Map(),stories=[];
  for(const item of items){
    const key=headlineKey(item),time=Date.parse(item.publishedAt),bucket=prefixes.get(key.slice(0,6))||[];
    const match=key.length>=5?bucket.find(previous=>Math.abs(time-previous.time)<=86400000&&(key===previous.key||nearDuplicate(key,previous.key))):null;
    if(match){
      const story=match.story;
      if(item.source!==story.source||key!==match.key)story.origins.add(item.channel||item.source);
      if(!story.allIds.includes(item.id))story.allIds.push(item.id);
      story.hasTrend ||= item.source==='Google 트렌드';
      story.trendTraffic ||= item.trendTraffic;
    }else{
      const story={...item,origins:new Set([item.channel||item.source]),allIds:[item.id],hasTrend:item.source==='Google 트렌드'};
      stories.push(story);
      bucket.push({key,time,story});prefixes.set(key.slice(0,6),bucket);
    }
  }
  return stories;
}
function clusters(items,window,now=Date.now()){
  const span=WINDOWS[window],current=distinctStories(items.filter(i=>{const age=now-Date.parse(i.publishedAt);return age>=0&&age<=span;})),prior=distinctStories(items.filter(i=>{const age=now-Date.parse(i.publishedAt);return age>span&&age<=2*span;}));
  const counts=new Map();
  for(const item of current)for(const word of new Set(item.keywords.slice(0,5))){let cluster=counts.get(word);if(!cluster)counts.set(word,cluster={keyword:word,items:[],sources:new Set()});cluster.items.push(item);for(const origin of item.origins)cluster.sources.add(origin);}
  return [...counts.values()].filter(cluster=>cluster.items.length>=2||cluster.sources.size>=2||cluster.items.some(item=>item.hasTrend)).map(cluster=>{
    const before=prior.filter(item=>item.keywords.includes(cluster.keyword)).length;
    const growth=before?Math.round((cluster.items.length-before)/before*100):null;
    const score=Math.round(cluster.items.length*2+Math.max(0,growth||0)/50+cluster.sources.size*3);
    const newest=cluster.items.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt))[0];
    return {keyword:cluster.keyword,count:cluster.items.length,previousCount:before,growthPercent:growth,sourceCount:cluster.sources.size,score,category:newest.category,summary:newest.title,updatedAt:newest.publishedAt,trendOnly:cluster.items.length===1&&cluster.sources.size===1&&newest.hasTrend,trendTraffic:cluster.items.find(item=>item.trendTraffic)?.trendTraffic||null,itemIds:cluster.items.flatMap(item=>item.allIds)};
  }).sort((a,b)=>b.score-a.score).slice(0,100);
}
function eventClusters(items,window,now=Date.now()){
  const active=distinctStories(items.filter(item=>{const age=now-Date.parse(item.publishedAt);return age>=0&&age<=WINDOWS[window];}));
  const parent=active.map((_,index)=>index);
  const root=index=>{while(parent[index]!==index){parent[index]=parent[parent[index]];index=parent[index];}return index;};
  const pairOwner=new Map();
  active.forEach((item,index)=>{const terms=[...new Set(item.keywords.slice(0,6))].sort();for(let a=0;a<terms.length;a++)for(let b=a+1;b<terms.length;b++){const key=item.category+'|'+terms[a]+'|'+terms[b];if(pairOwner.has(key))parent[root(index)]=root(pairOwner.get(key));else pairOwner.set(key,index);}});
  const groups=new Map();active.forEach((item,index)=>{const key=root(index);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);});
  return [...groups.values()].filter(group=>group.length>=2).map(group=>{group.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));const sources=[...new Set(group.flatMap(item=>[...item.origins]))],wordCounts=new Map();for(const item of group)for(const word of item.keywords)wordCounts.set(word,(wordCounts.get(word)||0)+1);const terms=[...wordCounts].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([word])=>word);return {id:createHash('sha256').update(terms.join('|')+'|'+group[0].category).digest('hex').slice(0,16),title:group[0].title,summary:group[0].summary,category:group[0].category,keywords:terms,count:group.length,sourceCount:sources.length,sources,score:group.length*2+sources.length*3,updatedAt:group[0].publishedAt,itemIds:group.flatMap(item=>item.allIds)};}).sort((a,b)=>b.score-a.score).slice(0,100);
}
const LOCATIONS=[['서울',37.5665,126.978],['인천',37.4563,126.7052],['수원',37.2636,127.0286],['경기',37.4138,127.5183],['춘천',37.8813,127.7298],['강원',37.8228,128.1555],['대전',36.3504,127.3845],['세종',36.48,127.289],['청주',36.6424,127.489],['충북',36.6357,127.491],['충남',36.6588,126.6728],['전주',35.8242,127.148],['전북',35.7175,127.153],['광주',35.1595,126.8526],['전남',34.8161,126.4629],['대구',35.8714,128.6014],['경북',36.4919,128.8889],['포항',36.019,129.3435],['울산',35.5384,129.3114],['부산',35.1796,129.0756],['경남',35.4606,128.2132],['제주',33.4996,126.5312]];
function locate(text){const found=LOCATIONS.find(([name])=>new RegExp(`(^|[^가-힣])${name}(시|도|특별시|광역시)?(?=$|[^가-힣])`).test(text));return found?{name:found[0],lat:found[1],lng:found[2]}:null;}
function init(db){
  db.exec(`CREATE TABLE IF NOT EXISTS korean_jobs(id INTEGER PRIMARY KEY,query TEXT NOT NULL,window TEXT NOT NULL,sources TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,finished_at TEXT,results INTEGER NOT NULL DEFAULT 0,error TEXT);
    CREATE TABLE IF NOT EXISTS korean_items(id TEXT PRIMARY KEY,data TEXT NOT NULL,first_seen TEXT NOT NULL,last_seen TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS korean_source_items(id TEXT PRIMARY KEY,source TEXT NOT NULL,data TEXT NOT NULL,collected_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS korean_job_items(job_id INTEGER NOT NULL,item_id TEXT NOT NULL,PRIMARY KEY(job_id,item_id));
    CREATE TABLE IF NOT EXISTS korean_logs(id INTEGER PRIMARY KEY,created_at TEXT NOT NULL,level TEXT NOT NULL,source TEXT NOT NULL,message TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS korean_usage(day TEXT PRIMARY KEY,youtube_units INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS korean_api_usage(day TEXT PRIMARY KEY,youtube_search_calls INTEGER NOT NULL DEFAULT 0,x_search_calls INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS korean_source_runs(job_id INTEGER NOT NULL,source TEXT NOT NULL,status TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0,duration_ms INTEGER NOT NULL,error TEXT,PRIMARY KEY(job_id,source));
    CREATE TABLE IF NOT EXISTS korean_issue_snapshots(id INTEGER PRIMARY KEY,window TEXT NOT NULL,keyword TEXT NOT NULL,captured_at TEXT NOT NULL,count INTEGER NOT NULL,previous_count INTEGER NOT NULL,source_count INTEGER NOT NULL,score INTEGER NOT NULL,category TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS korean_event_clusters(id TEXT NOT NULL,window TEXT NOT NULL,captured_at TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(id,window));
    CREATE TABLE IF NOT EXISTS korean_reviews(keyword TEXT PRIMARY KEY,decision TEXT NOT NULL,note TEXT NOT NULL,reviewed_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS korean_items_seen ON korean_items(last_seen);
    CREATE INDEX IF NOT EXISTS korean_issue_history ON korean_issue_snapshots(keyword,window,captured_at);`);
  const legacyTrends=db.prepare("SELECT id,data,first_seen,last_seen FROM korean_items WHERE json_extract(data,'$.source')='Google 트렌드'").all();
  const insertItem=db.prepare('INSERT OR IGNORE INTO korean_items(id,data,first_seen,last_seen) VALUES(?,?,?,?)');
  const insertSource=db.prepare('INSERT OR IGNORE INTO korean_source_items(id,source,data,collected_at) SELECT ?,source,data,collected_at FROM korean_source_items WHERE id=?');
  const insertJobs=db.prepare('INSERT OR IGNORE INTO korean_job_items(job_id,item_id) SELECT job_id,? FROM korean_job_items WHERE item_id=?');
  db.transaction(()=>{for(const row of legacyTrends){const item=JSON.parse(row.data),updated=normalized(item);if(!updated||updated.id===row.id)continue;insertItem.run(updated.id,JSON.stringify({...item,id:updated.id}),row.first_seen,row.last_seen);insertSource.run(updated.id,row.id);insertJobs.run(updated.id,row.id);db.prepare('DELETE FROM korean_job_items WHERE item_id=?').run(row.id);db.prepare('DELETE FROM korean_source_items WHERE id=?').run(row.id);db.prepare('DELETE FROM korean_items WHERE id=?').run(row.id);}})();
}
function createService(db,{searchNews=newsSearch,searchYouTube=youtubeSearch,searchTrends=trendsSearch,searchX=xSearch,now=()=>new Date(),youtubeKey=process.env.YOUTUBE_API_KEY||'',xToken=process.env.X_BEARER_TOKEN||'',dailyBudget=Math.max(1,Number(process.env.YOUTUBE_DAILY_SEARCH_LIMIT)||100)}={}){
  init(db);
  db.prepare("UPDATE korean_jobs SET status='failed',finished_at=datetime('now'),error='서버 재시작으로 작업이 중단되었습니다' WHERE status='running'").run();
  let active=null;
  const log=(level,source,message)=>db.prepare('INSERT INTO korean_logs(created_at,level,source,message) VALUES(?,?,?,?)').run(now().toISOString(),level,source,String(message).slice(0,500));
  const usage=()=>{const day=quotaDay(now()),row=db.prepare('SELECT * FROM korean_api_usage WHERE day=?').get(day);return {day,youtubeSearchCalls:row?.youtube_search_calls||0,xSearchCalls:row?.x_search_calls||0,dailySearchLimit:dailyBudget};};
  function items({limit=100,query='',source='',window='7d'}={}){
    const cutoff=new Date(+now()-WINDOWS[window]).toISOString();
    const clauses=["json_extract(data,'$.publishedAt')>=?"],params=[cutoff];
    if(query){clauses.push("(instr(lower(json_extract(data,'$.title')),?)>0 OR instr(lower(json_extract(data,'$.summary')),?)>0)");params.push(query.toLowerCase(),query.toLowerCase());}
    if(source){clauses.push("instr(lower(json_extract(data,'$.source')),?)>0");params.push(source.toLowerCase());}
    return db.prepare(`SELECT data FROM korean_items WHERE ${clauses.join(' AND ')} ORDER BY json_extract(data,'$.publishedAt') DESC LIMIT ?`).all(...params,limit).map(row=>JSON.parse(row.data));
  }
  function jobItems(id,limit=200){return db.prepare("SELECT i.data FROM korean_job_items j JOIN korean_items i ON i.id=j.item_id WHERE j.job_id=? ORDER BY json_extract(i.data,'$.publishedAt') DESC LIMIT ?").all(id,limit).map(row=>JSON.parse(row.data));}
  function analysisItems(window,periods=1){const cutoff=new Date(+now()-periods*WINDOWS[window]).toISOString();return db.prepare("SELECT data FROM korean_items WHERE json_extract(data,'$.publishedAt')>=? ORDER BY json_extract(data,'$.publishedAt') DESC").all(cutoff).map(row=>JSON.parse(row.data));}
  function issues(window='24h'){const rows=analysisItems(window,2);const reviews=new Map(db.prepare('SELECT * FROM korean_reviews').all().map(r=>[r.keyword,r]));return clusters(rows,window,+now()).map(issue=>({...issue,review:reviews.get(issue.keyword)||null}));}
  function events(window='24h'){const all=analysisItems(window),grouped=eventClusters(all,window,+now()),byId=new Map(all.map(item=>[item.id,item]));return grouped.map(group=>({...group,articles:group.itemIds.map(id=>byId.get(id)).filter(Boolean).slice(0,8)}));}
  function activities(window='24h'){const all=analysisItems(window),byId=new Map(all.map(item=>[item.id,item]));return issues(window).map(issue=>{const coverage=issue.itemIds.map(id=>byId.get(id)).filter(Boolean);const location=locate(coverage.map(item=>item.title+' '+item.summary).join(' '));return {...issue,location,articles:coverage.slice(0,8)};});}
  function snapshot(){for(const window of Object.keys(WINDOWS)){const at=now().toISOString();for(const group of events(window))db.prepare('INSERT INTO korean_event_clusters(id,window,captured_at,data) VALUES(?,?,?,?) ON CONFLICT(id,window) DO UPDATE SET captured_at=excluded.captured_at,data=excluded.data').run(group.id,window,at,JSON.stringify(group));const insert=db.prepare('INSERT INTO korean_issue_snapshots(window,keyword,captured_at,count,previous_count,source_count,score,category) VALUES(?,?,?,?,?,?,?,?)');for(const issue of issues(window))insert.run(window,issue.keyword,at,issue.count,issue.previousCount,issue.sourceCount,issue.score,issue.category);}}
  async function run({query='',window='24h',sources=['news','youtube']}={}){
    query=clean(query);
    if(!WINDOWS[window]||!Array.isArray(sources)||!sources.length||sources.some(s=>!['news','youtube','trends','x'].includes(s))||((sources.some(s=>s!=='trends'))&&(query.length<2||query.length>100)))throw Object.assign(new Error('검색어, 기간 또는 소스를 확인하세요'),{status:400});
    if(active)throw Object.assign(new Error('수집 작업이 실행 중입니다'),{status:409});
    const normalizedSources=[...new Set(sources)].sort();
    const recent=db.prepare("SELECT id,status,results,created_at FROM korean_jobs WHERE query=? AND window=? AND sources=? AND status='done' ORDER BY id DESC LIMIT 1").get(query,window,JSON.stringify(normalizedSources));
    if(recent&&+now()-Date.parse(recent.created_at)<5*60000)return {id:recent.id,status:recent.status,results:recent.results,errors:[],cached:true};
    const promise=(async()=>{
      const job=Number(db.prepare('INSERT INTO korean_jobs(query,window,sources,status,created_at) VALUES(?,?,?,?,?)').run(query,window,JSON.stringify(normalizedSources),'running',now().toISOString()).lastInsertRowid);
      let total=0,success=0;const errors=[];
      for(const source of normalizedSources){
        const started=Date.now();let sourceCount=0,status='ok',errorText=null;
        try{
          let raw=[];
          if(source==='news'){
            for(let attempt=1;attempt<=2;attempt++){try{raw=await searchNews(query,window);break;}catch(error){if(attempt===2)throw error;await new Promise(resolve=>setTimeout(resolve,800));}}
          }else if(source==='trends')raw=await searchTrends(query);
          else if(source==='youtube'){
            if(!youtubeKey)throw new Error('유튜브 API 키가 설정되지 않았습니다');
            if(usage().youtubeSearchCalls>=dailyBudget)throw new Error('유튜브 일일 검색 호출 한도 초과');
            db.prepare('INSERT INTO korean_api_usage(day,youtube_search_calls) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET youtube_search_calls=youtube_search_calls+1').run(quotaDay(now()));
            raw=(await searchYouTube(query,window,youtubeKey)).items;
          }else{
            if(!xToken)throw new Error('X 검색 토큰이 설정되지 않았습니다');
            db.prepare('INSERT INTO korean_api_usage(day,x_search_calls) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET x_search_calls=x_search_calls+1').run(quotaDay(now()));
            raw=await searchX(query,window,xToken);
          }
          for(const candidate of raw){const item=candidate.id?candidate:normalized(candidate);if(!item)continue;const timestamp=now().toISOString();db.prepare('INSERT INTO korean_source_items(id,source,data,collected_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,collected_at=excluded.collected_at').run(item.id,item.source,JSON.stringify(candidate).slice(0,12000),timestamp);db.prepare('INSERT INTO korean_items(id,data,first_seen,last_seen) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,last_seen=excluded.last_seen').run(item.id,JSON.stringify(item),timestamp,timestamp);db.prepare('INSERT OR IGNORE INTO korean_job_items(job_id,item_id) VALUES(?,?)').run(job,item.id);sourceCount++;}
          total+=sourceCount;success++;log('info',source,`${sourceCount}건 수집`);
        }catch(error){status='failed';errorText=error.message;errors.push(`${source}: ${errorText}`);log('error',source,errorText);}
        db.prepare('INSERT INTO korean_source_runs(job_id,source,status,count,duration_ms,error) VALUES(?,?,?,?,?,?)').run(job,source,status,sourceCount,Date.now()-started,errorText);
      }
      const status=errors.length?(success?'partial':'failed'):'done';
      db.prepare('UPDATE korean_jobs SET status=?,finished_at=?,results=?,error=? WHERE id=?').run(status,now().toISOString(),total,errors.join('; ')||null,job);
      snapshot();
      return {id:job,status,results:total,errors,cached:false};
    })();
    active=promise;try{return await promise;}finally{active=null;}
  }
  async function runWhenIdle(options){
    for(;;){
      if(active)try{await active;}catch{}
      try{return await run(options);}
      catch(error){if(error.status!==409)throw error;}
    }
  }
  function review(keyword,decision,note=''){keyword=clean(keyword);note=clean(note);if(!keyword||!['confirmed','dismissed','unreviewed'].includes(decision))throw Object.assign(new Error('검토 내용을 확인하세요'),{status:400});if(decision==='unreviewed'){db.prepare('DELETE FROM korean_reviews WHERE keyword=?').run(keyword);return {keyword,decision};}db.prepare('INSERT INTO korean_reviews(keyword,decision,note,reviewed_at) VALUES(?,?,?,?) ON CONFLICT(keyword) DO UPDATE SET decision=excluded.decision,note=excluded.note,reviewed_at=excluded.reviewed_at').run(keyword,decision,note,now().toISOString());log('info','review',`${keyword}: ${decision}`);return {keyword,decision,note};}
  function history(keyword,window='24h'){return db.prepare('SELECT captured_at,count,previous_count,source_count,score FROM korean_issue_snapshots WHERE keyword=? AND window=? ORDER BY id DESC LIMIT 100').all(keyword,window).reverse();}
  function cleanup(days=30){const cutoff=new Date(+now()-days*86400000).toISOString();db.transaction(()=>{db.prepare('DELETE FROM korean_job_items WHERE job_id IN (SELECT id FROM korean_jobs WHERE created_at<?)').run(cutoff);db.prepare('DELETE FROM korean_source_runs WHERE job_id IN (SELECT id FROM korean_jobs WHERE created_at<?)').run(cutoff);db.prepare('DELETE FROM korean_jobs WHERE created_at<?').run(cutoff);db.prepare('DELETE FROM korean_items WHERE last_seen<?').run(cutoff);db.prepare('DELETE FROM korean_source_items WHERE collected_at<?').run(cutoff);db.prepare('DELETE FROM korean_issue_snapshots WHERE captured_at<?').run(cutoff);db.prepare('DELETE FROM korean_event_clusters WHERE captured_at<?').run(cutoff);db.prepare('DELETE FROM korean_logs WHERE created_at<?').run(cutoff);db.prepare('DELETE FROM korean_api_usage WHERE day<?').run(quotaDay(new Date(cutoff)));})();}
  function operations(){
    const reviewRows=db.prepare('SELECT decision,count(*) n FROM korean_reviews GROUP BY decision').all();
    const reviewCounts=Object.fromEntries(reviewRows.map(row=>[row.decision,row.n]));
    const reviewed=(reviewCounts.confirmed||0)+(reviewCounts.dismissed||0);
    const since=new Date(+now()-86400000).toISOString();
    const stats=new Map(db.prepare("SELECT r.source,count(*) runs,sum(CASE WHEN r.status='failed' THEN 1 ELSE 0 END) failures,round(avg(r.duration_ms)) avg_duration_ms FROM korean_source_runs r JOIN korean_jobs j ON j.id=r.job_id WHERE j.created_at>=? GROUP BY r.source").all(since).map(row=>[row.source,row]));
    const sourceRows=db.prepare('SELECT r.* FROM korean_source_runs r JOIN (SELECT source,max(job_id) id FROM korean_source_runs GROUP BY source) latest ON latest.source=r.source AND latest.id=r.job_id').all().map(row=>{
      const stat=stats.get(row.source);
      return {...row,runs24h:stat?.runs||0,failurePercent:stat?.runs?Math.round(stat.failures/stat.runs*100):null,avgDurationMs:stat?.avg_duration_ms??null};
    });
    return {jobs:db.prepare('SELECT * FROM korean_jobs ORDER BY id DESC LIMIT 20').all().map(j=>({...j,sources:JSON.parse(j.sources)})),logs:db.prepare('SELECT * FROM korean_logs ORDER BY id DESC LIMIT 30').all(),sources:sourceRows,capabilities:{youtube:!!youtubeKey,x:!!xToken},usage:usage(),counts:{items:db.prepare('SELECT count(*) n FROM korean_items').get().n,jobs:db.prepare('SELECT count(*) n FROM korean_jobs').get().n,reviews:reviewCounts},quality:{reviewed,dismissed:reviewCounts.dismissed||0,dismissedPercent:reviewed?Math.round((reviewCounts.dismissed||0)/reviewed*100):null},active:!!active};
  }
  return {run,runWhenIdle,items,jobItems,issues,events,activities,operations,history,review,cleanup,log};
}
module.exports={WINDOWS,normalized,keywords,classify,clusters,eventClusters,createService,trendsSearch,xSearch};
