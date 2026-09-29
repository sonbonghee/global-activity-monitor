'use strict';
let offset=0;
const queue=document.getElementById('queue'),status=document.getElementById('status'),progress=document.getElementById('progress');
const relevanceKo={uncertain:'불확실',relevant:'관련 있음',irrelevant:'관련 없음'};
const categoryKo={Unclassified:'미분류','Armed Conflict':'무력 충돌','Military Operations':'군사 작전','Civil Unrest':'시민 소요','Humanitarian Crisis':'인도주의 위기',Disaster:'재난',Diplomacy:'외교'};
const sliceKo={ambiguous:'모호함','routine-sports':'일반 스포츠',entertainment:'연예·오락','routine-news':'일반 뉴스','mixed-context':'혼합 맥락',event:'사건'};
const reasonKo={'location-mention-only':'지역 언급만 확인됨','unsupported-language':'지원하지 않는 언어','historical-hypothetical-or-opinion':'과거·가정·의견 보도','routine-sports-or-entertainment':'일반 스포츠·연예','negated-or-disputed-impact':'피해 부정 또는 논쟁 중','insufficient-event-context':'사건 맥락 부족','violence-without-geopolitical-or-major-crisis-context':'주요 위기 맥락 부족','impact-not-established':'피해 규모 미확인','explicit-reported-event':'사건 보도 확인','provisional-rubric':'잠정 평가 기준','two-distinct-reporting-origins':'독립 보도 출처 2곳 이상','insufficient-independent-current-evidence':'현재 독립 근거 부족','model-relevance-gate':'모델 관련성 확인'};
function element(tag,text,parent){const el=document.createElement(tag);el.textContent=text;parent.appendChild(el);return el;}
function field(parent,name,value,options,textarea=false){const label=element('label',name,parent);const el=document.createElement(options?'select':textarea?'textarea':'input');if(options)for(const [key,text] of options)el.add(new Option(text,key));el.value=value??'';label.appendChild(el);return el;}
function choices(values,labels){return values.map(value=>[value,labels[value]||value]);}
async function load(){
    status.textContent='불러오는 중…';
    const response=await fetch(`/api/review?limit=25&offset=${offset}&reviewed=${document.getElementById('reviewed').checked}`);
    if(!response.ok){status.textContent='검토 목록을 불러오지 못했습니다: '+response.status;return;}
    const data=await response.json();queue.replaceChildren();
    status.textContent=data.items.length?`${data.items.length}건 · 저장 버튼을 눌러야 변경 사항이 반영됩니다.`:'이 목록에 보도가 없습니다. 먼저 자료 수집을 실행하세요.';
    for(const row of data.items){
        const a=row.article,s=row.label||{},suggested=a.classification;
        const card=element('article','',queue);element('h2',a.title,card);
        element('p',`${a.publisher} · ${a.publishedAt || '게시 날짜 미상'} · ${a.language}`,card).className='meta';
        const link=element('a','원문 열기',card);
        try{const u=new URL(a.url);if(['https:','http:'].includes(u.protocol)){link.href=u.href;link.target='_blank';link.rel='noopener noreferrer';}}catch{}
        element('blockquote',a.snippet || '인용문이 없습니다. 원문을 확인하세요.',card);
        element('p',`자동 제안: ${relevanceKo[suggested.relevance]||suggested.relevance} · ${categoryKo[suggested.category]||'미분류'} · ${suggested.score ?? '미상'} (${suggested.reasons.map(reason=>reasonKo[reason]||reason).join(', ')})`,card);
        const relevance=field(card,'관련성',s.relevance||'uncertain',choices(['uncertain','relevant','irrelevant'],relevanceKo));
        const category=field(card,'유형',s.category||suggested.category||'Unclassified',choices(Object.keys(categoryKo),categoryKo));
        const score=field(card,'보도 기반 위험도',s.score??'unknown',choices(['unknown','2','5','8','10'],{unknown:'미상'}));
        const slice=field(card,'평가 구분',s.slice||'ambiguous',choices(Object.keys(sliceKo),sliceKo));
        const storyId=field(card,'사건 묶음 ID',s.storyId||a.storyId);
        const location=field(card,'보도된 사건 위치 (불확실하면 비워 두기)',s.location||'');
        const evidence=field(card,'근거 인용문',s.evidence||'',null,true);
        const notes=field(card,'메모',s.notes||'',null,true);
        const save=element('button','검토 결과 저장',card),feedback=element('p','',card);
        save.addEventListener('click',async()=>{
            save.disabled=true;
            try{
                const result=await fetch('/api/review/'+a.id,{method:'POST',headers:{'Content-Type':'application/json','X-Review-Request':'1'},body:JSON.stringify({revision:row.revision,label:{relevance:relevance.value,category:category.value,score:score.value==='unknown'?null:Number(score.value),slice:slice.value,storyId:storyId.value.trim(),location:location.value.trim(),evidence:evidence.value.trim(),notes:notes.value.trim()}})});
                const body=await result.json();if(!result.ok)throw new Error(body.error);row.revision=body.revision;feedback.textContent='저장됨 · 수정 '+body.revision+'회';
            }catch(error){feedback.textContent=error.message;}finally{save.disabled=false;loadStats();}
        });
    }
}
async function loadStats(){
    try{
        const response=await fetch('/api/review/stats');if(!response.ok)throw new Error(response.status);
        const data=await response.json(),p=data.progress;
        progress.textContent=`검토 ${data.reviewed}/${data.total} · 관련 ${p.relevant.value}/${p.relevant.target} · 무관 ${p.irrelevant.value}/${p.irrelevant.target} · 스포츠 ${p['routine-sports'].value}/${p['routine-sports'].target} · 사건 ${p.event.value}/${p.event.target}`;
    }catch(error){progress.textContent='검토 진행 상황을 불러오지 못했습니다: '+error.message;}
}
document.getElementById('reviewed').addEventListener('change',()=>{offset=0;load().catch(e=>status.textContent=e.message);});
document.getElementById('next').addEventListener('click',()=>{if(document.getElementById('reviewed').checked)offset+=25;else offset=0;load().catch(e=>status.textContent=e.message);});
document.getElementById('export').addEventListener('click',async()=>{try{const r=await fetch('/api/review/export');if(!r.ok)throw new Error('내보내기에 실패했습니다');const data=await r.json();const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='reviewed-labels.json';a.click();URL.revokeObjectURL(url);}catch(e){status.textContent=e.message;}});
Promise.all([load(),loadStats()]).catch(e=>status.textContent=e.message);
