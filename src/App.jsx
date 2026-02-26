import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ── Google Sheets API URL ────────────────────────────
const API_URL = "https://script.google.com/macros/s/AKfycbynZ_pJpYYjDDMdKDbgbZlCvCJtHu41viiuiGjtVLAynIB1HUjA1HbCGx7jt5bRXxOY4A/exec";

async function apiGet() {
  try {
    const res = await fetch(`${API_URL}?action=getAll`, { redirect: 'follow' });
    return res.json();
  } catch(e) { return { error: e.toString() }; }
}
async function apiSave(data) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(data));
    const res = await fetch(`${API_URL}?action=saveAll&data=${encoded}`, { redirect: 'follow' });
    return res.json();
  } catch(e) { return { error: e.toString() }; }
}

// ── 공휴일 ───────────────────────────────────────────
const KR_HOLIDAYS = new Set([
  '2024-12-25',
  '2025-01-01','2025-01-28','2025-01-29','2025-01-30',
  '2025-03-01','2025-05-05','2025-05-06','2025-06-06',
  '2025-08-15','2025-10-03','2025-10-06','2025-10-07','2025-10-08','2025-10-09','2025-12-25',
  '2026-01-01','2026-02-17','2026-02-18','2026-02-19',
  '2026-03-01','2026-05-05','2026-06-06','2026-08-17','2026-10-03','2026-10-09','2026-12-25',
]);
const dKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const isWorkDay = (d) => d.getDay()!==0 && d.getDay()!==6 && !KR_HOLIDAYS.has(dKey(d));
const fmtD = (d) => { if(!d) return ''; const dt=typeof d==='string'?new Date(d+'T00:00:00'):d; return `${dt.getMonth()+1}/${dt.getDate()}`; };

// ── 평일 배열 ────────────────────────────────────────
const TODAY = new Date(); TODAY.setHours(0,0,0,0);
function buildWD() {
  const days=[]; let todayIdx=0;
  const s=new Date(+TODAY-100*86400000), e=new Date(+TODAY+220*86400000);
  let d=new Date(s);
  while(+d<=+e){ if(isWorkDay(d)){ if(+d===+TODAY) todayIdx=days.length; days.push(new Date(d)); } d=new Date(+d+86400000); }
  if(!days[todayIdx]||+days[todayIdx]!==+TODAY){ for(let i=0;i<days.length;i++){ if(+days[i]>=+TODAY){todayIdx=i;break;} } }
  return {days,todayIdx};
}
const {days:WD,todayIdx:TDX}=buildWD();
const TWD=WD.length;

// startDate(문자열) ↔ startWd(인덱스) 변환
const dateToWd = (dateStr) => {
  if (!dateStr) return TDX;
  const idx = WD.findIndex(d => dKey(d) === dateStr);
  return idx >= 0 ? idx : TDX;
};
const wdToDate = (wd) => WD[wd] ? dKey(WD[wd]) : dKey(WD[TDX]);

// ── 상수 ─────────────────────────────────────────────
const STATUS_MAP = {
  hope:      {label:'희망예약',bg:'#fef9c3',border:'#fbbf24',text:'#92400e'},
  urgent:    {label:'중요예약',bg:'#fff7ed',border:'#f97316',text:'#9a3412'},
  confirmed: {label:'확정',   bg:'#f0fdf4',border:'#22c55e',text:'#166534'},
  ongoing:   {label:'진행중', bg:'#eff6ff',border:'#3b82f6',text:'#1e40af'},
  done:      {label:'완료',   bg:'#f0f9ff',border:'#7dd3fc',text:'#0c4a6e'},
  closed:    {label:'종료',   bg:'#f8fafc',border:'#94a3b8',text:'#475569'},
};
const GROUPS=[
  {id:1,label:'상시근무',bgRow:'#fff',bgAlt:'#f0f7ff',accent:'#3b82f6'},
  {id:2,label:'선택근무',bgRow:'#fff',bgAlt:'#f0fdf8',accent:'#10b981'},
  {id:3,label:'대기가능',bgRow:'#fff',bgAlt:'#f5f3ff',accent:'#8b5cf6'},
  {id:4,label:'단기근무',bgRow:'#fff',bgAlt:'#fefce8',accent:'#f59e0b'},
];
const HATCH=`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Cline x1='0' y1='8' x2='8' y2='0' stroke='%2394a3b8' stroke-width='1.2' stroke-opacity='0.45'/%3E%3C/svg%3E")`;
const ROW_H=30, DATE_H=28, WORKER_W=172;

const autoStatus=(s)=>{
  if(s.status==='closed') return s;
  const end=s.startWd+s.durWd;
  if(end<=TDX) return {...s,status:'done'};
  if(s.startWd<=TDX&&end>TDX&&s.status==='confirmed') return {...s,status:'ongoing'};
  return s;
};
const dayLbl=(i)=>{
  const d=WD[i]; if(!d) return '';
  if(i===0||WD[i-1].getMonth()!==d.getMonth()) return `${d.getMonth()+1}월`;
  if(d.getDate()%7===1) return String(d.getDate());
  return '';
};

let _wid=100,_sid=100,_uid=100;
const iStyle=(extra={})=>({padding:'3px 6px',border:'1px solid #c7d2fe',borderRadius:5,fontSize:11,background:'#f0f0ff',outline:'none',fontFamily:'inherit',...extra});

export default function App(){
  const [workers,  setWorkers]  = useState([]);
  const [schedules,setSchedules]= useState([]);
  const [waiting,  setWaiting]  = useState([]);
  const [loadState,setLoadState]= useState('loading'); // 'loading'|'ok'|'error'
  const [saveState,setSaveState]= useState('idle');    // 'idle'|'saving'|'saved'|'error'
  const [selected, setSelected] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [dragOff,  setDragOff]  = useState(0);
  const [inactiveOpen,setInactiveOpen]=useState(false);
  const [addWOpen, setAddWOpen] = useState(false);
  const [addWaitOpen,setAddWaitOpen]=useState(false);
  const [editWId,  setEditWId]  = useState(null);
  const [editWVal, setEditWVal] = useState({name:'',area:'',group:1});
  const [hoverWId, setHoverWId] = useState(null);
  const [newW,     setNewW]     = useState({name:'',area:'',group:1});
  const [newWait,  setNewWait]  = useState({name:'',expectedBirth:'',durWd:10,memo:''});
  const [search,   setSearch]   = useState('');
  const [searchIdx,setSearchIdx]= useState(0);
  const [ctxMenu,  setCtxMenu]  = useState(null);
  const [confirm,  setConfirm]  = useState(null);
  const [dragWait, setDragWait] = useState(null);
  const [dayW,     setDayW]     = useState(22);
  const [sbDragging,setSbDragging]=useState(false);
  const [sbStartX, setSbStartX] = useState(0);
  const [sbStartSL,setSbStartSL]= useState(0);
  const [ganttSL,  setGanttSL]  = useState(0);
  const [ganttVW,  setGanttVW]  = useState(800);

  const ganttRef  =useRef(null);
  const workerRef =useRef(null);
  const wrapRef   =useRef(null);
  const dateHdrRef=useRef(null);
  const sbTrackRef=useRef(null);
  const syncV     =useRef(false);
  const saveTimer =useRef(null);

  // ── 데이터 불러오기 ──────────────────────────────
  useEffect(()=>{
    setLoadState('loading');
    apiGet().then(data=>{
      if(data.error) throw new Error(data.error);
      // workers
      const ws=(data.workers||[]).map(w=>({
        ...w, id:+w.id, group:+w.group,
        inactive: w.inactive===true||w.inactive==='TRUE'||w.inactive==='true',
      }));
      // schedules: startDate → startWd
      const ss=(data.schedules||[]).map(s=>autoStatus({
        ...s, id:+s.id, wid:+s.wid, durWd:+s.durWd,
        startWd: dateToWd(s.startDate),
        birthConfirm: s.birthConfirm===true||s.birthConfirm==='TRUE'||s.birthConfirm==='true',
        firstVisit:   s.firstVisit===true||s.firstVisit==='TRUE'||s.firstVisit==='true',
        midCheck:     s.midCheck===true||s.midCheck==='TRUE'||s.midCheck==='true',
        happycall:    s.happycall===true||s.happycall==='TRUE'||s.happycall==='true',
      }));
      const wt=(data.waiting||[]).map(w=>({...w,id:+w.id,durWd:+w.durWd}));
      if(ws.length>0) _wid=Math.max(...ws.map(w=>w.id))+1;
      if(ss.length>0) _sid=Math.max(...ss.map(s=>s.id))+1;
      if(wt.length>0) _uid=Math.max(...wt.map(w=>w.id))+1;
      setWorkers(ws);
      setSchedules(ss);
      setWaiting(wt);
      setLoadState('ok');
    }).catch(()=>{
      setLoadState('error');
    });
  },[]);

  // ── 데이터 저장 (디바운스 2초) ──────────────────
  const triggerSave = useCallback((ws, ss, wt) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = setTimeout(async () => {
      try {
        // startWd → startDate 변환
        const payload = {
          workers: ws,
          schedules: ss.map(s=>({ ...s, startDate: wdToDate(s.startWd) })),
          waiting: wt,
        };
        await apiSave(payload);
        setSaveState('saved');
        setTimeout(()=>setSaveState('idle'), 2000);
      } catch {
        setSaveState('error');
      }
    }, 2000);
  }, []);

  const setW = (fn) => setWorkers(p=>{ const n=typeof fn==='function'?fn(p):fn; triggerSave(n,schedules,waiting); return n; });
  const setSch = (fn) => setSchedules(p=>{ const n=typeof fn==='function'?fn(p):fn; triggerSave(workers,n,waiting); return n; });
  const setWait = (fn) => setWaiting(p=>{ const n=typeof fn==='function'?fn(p):fn; triggerSave(workers,schedules,n); return n; });

  // dayW
  useEffect(()=>{
    const calc=()=>{ if(!wrapRef.current) return; setDayW(Math.max(16,Math.floor((wrapRef.current.offsetWidth-WORKER_W)/44))); };
    calc();
    const ro=new ResizeObserver(calc); if(wrapRef.current) ro.observe(wrapRef.current);
    return ()=>ro.disconnect();
  },[]);

  useEffect(()=>{
    if(!ganttRef.current||dayW<16) return;
    const sl=Math.max(0,(TDX-3)*dayW);
    ganttRef.current.scrollLeft=sl;
    if(dateHdrRef.current) dateHdrRef.current.scrollLeft=sl;
  },[dayW]);

  const onGScroll=useCallback(()=>{
    if(syncV.current) return; syncV.current=true;
    if(workerRef.current) workerRef.current.scrollTop=ganttRef.current.scrollTop;
    syncV.current=false;
    if(dateHdrRef.current) dateHdrRef.current.scrollLeft=ganttRef.current.scrollLeft;
    setGanttSL(ganttRef.current.scrollLeft);
    setGanttVW(ganttRef.current.clientWidth);
  },[]);
  const onWScroll=useCallback(()=>{
    if(syncV.current) return; syncV.current=true;
    if(ganttRef.current) ganttRef.current.scrollTop=workerRef.current.scrollTop;
    syncV.current=false;
  },[]);
  useEffect(()=>{
    const el=ganttRef.current; if(!el) return;
    const u=()=>{ setGanttSL(el.scrollLeft); setGanttVW(el.clientWidth); };
    u(); el.addEventListener('scroll',u,{passive:true});
    return ()=>el.removeEventListener('scroll',u);
  },[dayW]);

  // 스크롤바
  const totalW=TWD*dayW, thumbW=Math.max(40,Math.min(ganttVW,ganttVW/totalW*ganttVW));
  const thumbMax=ganttVW-thumbW, thumbX=totalW>ganttVW?(ganttSL/(totalW-ganttVW))*thumbMax:0;
  const densityMap=useMemo(()=>{ const m=new Array(TWD).fill(0); schedules.forEach(s=>{ for(let i=s.startWd;i<s.startWd+s.durWd&&i<TWD;i++) if(i>=0) m[i]++; }); return m; },[schedules]);
  const onSbDown=(e)=>{ e.preventDefault(); setSbDragging(true); setSbStartX(e.clientX); setSbStartSL(ganttRef.current?.scrollLeft||0); };
  useEffect(()=>{
    if(!sbDragging) return;
    const mv=(e)=>{ const sl=Math.max(0,Math.min(totalW-ganttVW,sbStartSL+((e.clientX-sbStartX)/thumbMax)*(totalW-ganttVW))); if(ganttRef.current) ganttRef.current.scrollLeft=sl; if(dateHdrRef.current) dateHdrRef.current.scrollLeft=sl; };
    const up=()=>setSbDragging(false);
    window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up);
    return ()=>{ window.removeEventListener('mousemove',mv); window.removeEventListener('mouseup',up); };
  },[sbDragging,sbStartX,sbStartSL,thumbMax,totalW,ganttVW]);
  const onTrackClick=(e)=>{ if(!sbTrackRef.current||sbDragging) return; const r=Math.max(0,Math.min(1,(e.clientX-sbTrackRef.current.getBoundingClientRect().left-thumbW/2)/(ganttVW-thumbW))); const sl=r*(totalW-ganttVW); if(ganttRef.current) ganttRef.current.scrollLeft=sl; if(dateHdrRef.current) dateHdrRef.current.scrollLeft=sl; };

  useEffect(()=>{ const h=(e)=>{ if(!e.target.closest('.ctx-menu')) setCtxMenu(null); }; window.addEventListener('mousedown',h); return ()=>window.removeEventListener('mousedown',h); },[]);

  // 검색
  const q=search.trim().toLowerCase();
  const searchHits=useMemo(()=>{ if(!q) return []; return schedules.filter(s=>s.client.toLowerCase().includes(q)).sort((a,b)=>Math.abs(a.startWd-TDX)-Math.abs(b.startWd-TDX)); },[schedules,q]);
  useEffect(()=>{ setSearchIdx(0); if(searchHits.length&&ganttRef.current) ganttRef.current.scrollTo({left:Math.max(0,(searchHits[0].startWd-2)*dayW),behavior:'smooth'}); },[search]);
  const goHit=(dir)=>{ if(!searchHits.length) return; const n=(searchIdx+dir+searchHits.length)%searchHits.length; setSearchIdx(n); if(ganttRef.current) ganttRef.current.scrollTo({left:Math.max(0,(searchHits[n].startWd-2)*dayW),behavior:'smooth'}); };

  // 관리사 정렬
  const activeWorkers=useMemo(()=>{
    const list=workers.filter(w=>!w.inactive);
    if(!q) return [...list].sort((a,b)=>a.group!==b.group?a.group-b.group:a.name.localeCompare(b.name,'ko'));
    const mw=new Set([...schedules.filter(s=>s.client.toLowerCase().includes(q)).map(s=>s.wid),...list.filter(w=>w.name.toLowerCase().includes(q)).map(w=>w.id)]);
    return [...list.filter(w=>mw.has(w.id)).sort((a,b)=>{ const aD=schedules.filter(s=>s.wid===a.id&&s.client.toLowerCase().includes(q)).map(s=>Math.abs(s.startWd-TDX)); const bD=schedules.filter(s=>s.wid===b.id&&s.client.toLowerCase().includes(q)).map(s=>Math.abs(s.startWd-TDX)); return Math.min(...(aD.length?aD:[9999]))-Math.min(...(bD.length?bD:[9999])); }),...list.filter(w=>!mw.has(w.id)).sort((a,b)=>a.group!==b.group?a.group-b.group:a.name.localeCompare(b.name,'ko'))];
  },[workers,schedules,q]);
  const inactiveW=workers.filter(w=>w.inactive);
  const visibleW=[...activeWorkers,...(inactiveOpen?inactiveW:[])];

  const selSch=schedules.find(s=>s.id===selected);
  const updSch=(patch)=>setSch(p=>p.map(s=>s.id===selected?{...s,...patch}:s));
  const delSch=(id)=>{ setSch(p=>p.filter(s=>s.id!==id)); if(selected===id){setSelected(null);setEditMode(false);} };
  const sendToWaiting=(sch)=>{ setWait(p=>[...p,{id:_uid++,name:sch.client,expectedBirth:sch.expectedBirth||'',durWd:sch.durWd,memo:sch.memo||''}]); delSch(sch.id); };

  const onBlockDown=(e,sch)=>{ e.stopPropagation(); setDragOff(e.clientX-e.currentTarget.getBoundingClientRect().left); setDragging(sch.id); setSelected(sch.id); setEditMode(false); };
  const onMouseMove=useCallback((e)=>{ if(!dragging||!ganttRef.current) return; const ni=Math.max(0,Math.min(TWD-1,Math.round((e.clientX-ganttRef.current.getBoundingClientRect().left+ganttRef.current.scrollLeft-dragOff)/dayW))); setSch(p=>p.map(s=>s.id===dragging?{...s,startWd:ni}:s)); },[dragging,dragOff,dayW]);
  const onMouseUp=useCallback(()=>setDragging(null),[]);

  const onRightClick=(e,sch)=>{ e.preventDefault(); e.stopPropagation(); setCtxMenu({x:e.clientX,y:e.clientY,sid:sch.id}); setSelected(sch.id); };
  const setDur=(sid,dur)=>{ setSch(p=>p.map(s=>s.id===sid?{...s,durWd:dur}:s)); setCtxMenu(null); };

  const onWaitDragStart=(e,wc)=>{ setDragWait(wc.id); e.dataTransfer.effectAllowed='move'; };
  const onRowDragOver=(e)=>{ if(dragWait!==null) e.preventDefault(); };
  const onRowDrop=(e,wid)=>{ if(dragWait===null) return; e.preventDefault(); const sw=Math.max(0,Math.min(TWD-1,Math.round((e.clientX-ganttRef.current.getBoundingClientRect().left+ganttRef.current.scrollLeft)/dayW))); const wc=waiting.find(w=>w.id===dragWait); if(!wc) return; setSch(p=>[...p,autoStatus({id:_sid++,wid,client:wc.name,startWd:sw,durWd:wc.durWd,status:'hope',memo:wc.memo,expectedBirth:wc.expectedBirth,actualBirth:'',birthConfirm:false,firstVisit:false,midCheck:false,happycall:false})]); setWait(p=>p.filter(w=>w.id!==dragWait)); setDragWait(null); };

  const doAddWorker=()=>{ if(!newW.name.trim()) return; setW(p=>[...p,{id:_wid++,name:newW.name.trim(),area:newW.area.trim(),group:+newW.group,inactive:false}]); setNewW({name:'',area:'',group:1}); setAddWOpen(false); };
  const saveEdit=(id)=>{ setW(p=>p.map(w=>w.id===id?{...w,...editWVal,group:+editWVal.group}:w)); setEditWId(null); };
  const deleteWorker=(w)=>{ if(schedules.some(s=>s.wid===w.id&&!['done','closed'].includes(s.status))) return alert('진행 중인 일정이 있습니다.'); setConfirm({msg:`"${w.name}" 관리사를 삭제할까요?`,onOk:()=>setW(p=>p.filter(x=>x.id!==w.id)),okLabel:'삭제',okColor:'#dc2626'}); };

  // ── 로딩 화면 ────────────────────────────────────
  if(loadState==='loading') return (
    <div style={{height:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:"'Apple SD Gothic Neo',sans-serif",background:'#f1f5f9',gap:16}}>
      <div style={{width:44,height:44,borderRadius:12,background:'linear-gradient(135deg,#3b82f6,#6366f1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,color:'#fff'}}>♡</div>
      <div style={{fontSize:16,fontWeight:800,color:'#1e293b'}}>산모신생아 인력 현황판</div>
      <div style={{fontSize:13,color:'#64748b'}}>데이터 불러오는 중...</div>
      <div style={{width:48,height:48,border:'4px solid #e2e8f0',borderTop:'4px solid #3b82f6',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if(loadState==='error') return (
    <div style={{height:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:"'Apple SD Gothic Neo',sans-serif",background:'#f1f5f9',gap:12}}>
      <div style={{fontSize:32}}>⚠️</div>
      <div style={{fontSize:16,fontWeight:800,color:'#dc2626'}}>데이터 불러오기 실패</div>
      <div style={{fontSize:12,color:'#64748b'}}>인터넷 연결을 확인하고 다시 시도해주세요</div>
      <button onClick={()=>window.location.reload()} style={{padding:'8px 20px',borderRadius:8,background:'#3b82f6',color:'#fff',border:'none',cursor:'pointer',fontSize:13,fontWeight:700}}>다시 시도</button>
    </div>
  );

  // ── 저장 상태 표시 색상 ──────────────────────────
  const saveColor = saveState==='saving'?'#f59e0b':saveState==='saved'?'#22c55e':saveState==='error'?'#dc2626':'transparent';
  const saveText  = saveState==='saving'?'저장 중...':saveState==='saved'?'✓ 저장됨':saveState==='error'?'저장 실패':'';

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',fontFamily:"'Apple SD Gothic Neo','Malgun Gothic',sans-serif",background:'#f1f5f9',color:'#1e293b',overflow:'hidden'}}
      onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
      <style>{`*{box-sizing:border-box}::-webkit-scrollbar{display:none}*{scrollbar-width:none;-ms-overflow-style:none}input,textarea,select{-webkit-user-select:text;user-select:text}.wrow:hover .wact{opacity:1!important}button{transition:all 0.12s}`}</style>

      {/* HEADER */}
      <header style={{display:'flex',alignItems:'center',gap:8,padding:'0 12px',height:40,background:'#fff',borderBottom:'1px solid #e2e8f0',flexShrink:0,zIndex:20,boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
          <div style={{width:22,height:22,borderRadius:6,background:'linear-gradient(135deg,#3b82f6,#6366f1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'#fff',fontWeight:800}}>♡</div>
          <span style={{fontWeight:800,fontSize:13,letterSpacing:'-0.5px',whiteSpace:'nowrap'}}>산모신생아 인력 현황판</span>
        </div>
        <div style={{position:'relative',width:190,flexShrink:0}}>
          <span style={{position:'absolute',left:7,top:'50%',transform:'translateY(-50%)',fontSize:11,color:'#94a3b8'}}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="산모명 · 관리사명..." style={{width:'100%',padding:'4px 26px 4px 24px',border:'1px solid #e2e8f0',borderRadius:8,fontSize:11,outline:'none',background:q?'#f0f9ff':'#f8fafc'}}/>
          {q&&<button onClick={()=>setSearch('')} style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',border:'none',background:'none',cursor:'pointer',color:'#94a3b8',fontSize:14,padding:0}}>×</button>}
        </div>
        {q&&<div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
          <span style={{fontSize:10,color:'#3b82f6',fontWeight:700}}>{searchHits.length>0?`${searchIdx+1}/${searchHits.length}건`:'결과없음'}</span>
          {searchHits.length>1&&<><button onClick={()=>goHit(-1)} style={{padding:'2px 6px',borderRadius:5,border:'1px solid #93c5fd',background:'#eff6ff',color:'#1d4ed8',cursor:'pointer',fontSize:11}}>◀</button><button onClick={()=>goHit(1)} style={{padding:'2px 6px',borderRadius:5,border:'1px solid #93c5fd',background:'#eff6ff',color:'#1d4ed8',cursor:'pointer',fontSize:11}}>▶</button></>}
        </div>}

        {/* 저장 상태 */}
        {saveText&&<span style={{fontSize:10,fontWeight:700,color:saveColor,flexShrink:0}}>{saveText}</span>}

        <div style={{display:'flex',gap:3,alignItems:'center',marginLeft:'auto',flexShrink:0,flexWrap:'wrap'}}>
          {Object.entries(STATUS_MAP).map(([k,v])=><span key={k} style={{padding:'1px 5px',borderRadius:20,fontSize:9,fontWeight:700,background:v.bg,border:`1.5px solid ${v.border}`,color:v.text,whiteSpace:'nowrap'}}>{v.label}</span>)}
          <span style={{padding:'1px 5px',borderRadius:20,fontSize:9,fontWeight:700,background:HATCH,border:'1.5px solid #94a3b8',color:'#475569',marginLeft:1}}>휴가</span>
        </div>
      </header>

      {/* BODY */}
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {/* LEFT PANEL */}
        <div style={{width:252,flexShrink:0,display:'flex',flexDirection:'column',background:'#fff',borderRight:'1px solid #e2e8f0',boxShadow:'2px 0 6px rgba(0,0,0,0.04)',overflow:'hidden'}}>

          {/* 일정 상세 */}
          <div style={{flexShrink:0,maxHeight:selSch?580:0,overflow:'hidden',transition:'max-height 0.25s ease',borderBottom:selSch?'2px solid #e2e8f0':'none'}}>
            {selSch&&(
              <div style={{padding:'10px 12px',display:'flex',flexDirection:'column',gap:7,overflowY:'auto',maxHeight:580}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontWeight:800,fontSize:12}}>일정 상세</span>
                    {editMode&&<span style={{fontSize:9,background:'#e0e7ff',color:'#4338ca',padding:'1px 6px',borderRadius:10,fontWeight:700}}>수정중</span>}
                  </div>
                  <button onClick={()=>{setSelected(null);setEditMode(false);}} style={{border:'none',background:'none',cursor:'pointer',color:'#94a3b8',fontSize:18,padding:0,lineHeight:1}}>×</button>
                </div>
                <div style={{padding:'7px 9px',borderRadius:8,background:STATUS_MAP[selSch.status].bg,border:`1.5px solid ${STATUS_MAP[selSch.status].border}`}}>
                  <div style={{fontSize:9,fontWeight:800,color:STATUS_MAP[selSch.status].text,marginBottom:1}}>{STATUS_MAP[selSch.status].label}</div>
                  {editMode?<input value={selSch.client} onChange={e=>updSch({client:e.target.value})} style={iStyle({fontWeight:800,fontSize:13,width:'100%',marginBottom:2})}/>:<div style={{fontWeight:800,fontSize:14}}>{selSch.client}</div>}
                  <div style={{fontSize:10,color:'#64748b',marginTop:1}}>{WD[selSch.startWd]?fmtD(WD[selSch.startWd]):'?'} ~ {WD[selSch.startWd+selSch.durWd-1]?fmtD(WD[selSch.startWd+selSch.durWd-1]):'?'} (평일 {selSch.durWd}일)</div>
                </div>
                <div>
                  <div style={{fontSize:9,color:'#94a3b8',fontWeight:700,marginBottom:2}}>배정 관리사</div>
                  <select value={selSch.wid} onChange={e=>updSch({wid:+e.target.value})} style={{width:'100%',padding:'3px 5px',border:'1px solid #e2e8f0',borderRadius:5,fontSize:11,background:'#f8fafc'}}>
                    {workers.filter(w=>!w.inactive).map(w=><option key={w.id} value={w.id}>{w.name} ({w.area})</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:9,color:'#94a3b8',fontWeight:700,marginBottom:2}}>상태 변경</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                    {Object.entries(STATUS_MAP).map(([k,v])=><button key={k} onClick={()=>updSch({status:k})} style={{padding:'2px 5px',borderRadius:10,fontSize:9,fontWeight:700,cursor:'pointer',border:`1.5px solid ${v.border}`,background:selSch.status===k?v.border:v.bg,color:selSch.status===k?'#fff':v.text}}>{v.label}</button>)}
                  </div>
                </div>
                <div style={{display:'flex',gap:4}}>
                  {[['expectedBirth','예정일'],['actualBirth','출산일']].map(([f,lbl])=>(
                    <div key={f} style={{flex:1}}>
                      <div style={{fontSize:9,color:'#94a3b8',fontWeight:700,marginBottom:1}}>{lbl}</div>
                      <input type="date" value={selSch[f]||''} onChange={e=>updSch({[f]:e.target.value})} style={{width:'100%',padding:'2px 3px',border:`1px solid ${editMode?'#c7d2fe':'#e2e8f0'}`,borderRadius:5,fontSize:9,background:editMode?'#f0f0ff':'#f8fafc'}}/>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{fontSize:9,color:'#94a3b8',fontWeight:700,marginBottom:2}}>서비스 기간 (평일)</div>
                  <div style={{display:'flex',gap:3,alignItems:'center'}}>
                    {[10,15,20].map(n=><button key={n} onClick={()=>updSch({durWd:n})} style={{padding:'2px 7px',borderRadius:5,fontSize:10,fontWeight:700,cursor:'pointer',border:'1.5px solid #e2e8f0',background:selSch.durWd===n?'#3b82f6':'#f8fafc',color:selSch.durWd===n?'#fff':'#334155'}}>{n}일</button>)}
                    <input type="number" value={selSch.durWd} onChange={e=>updSch({durWd:Math.max(1,+e.target.value)})} style={{width:40,padding:'2px 3px',border:'1px solid #e2e8f0',borderRadius:5,fontSize:10}}/>
                  </div>
                </div>
                <div>
                  <div style={{fontSize:9,color:'#94a3b8',fontWeight:700,marginBottom:2}}>진행 체크</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:'2px 10px'}}>
                    {[['birthConfirm','출산확인'],['firstVisit','첫방문'],['midCheck','중간점검'],['happycall','해피콜']].map(([f,lbl])=>(
                      <label key={f} style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer',fontSize:10}}>
                        <input type="checkbox" checked={!!selSch[f]} onChange={e=>updSch({[f]:e.target.checked})} style={{accentColor:'#22c55e',width:11,height:11}}/>
                        <span style={{color:selSch[f]?'#16a34a':'#334155',fontWeight:selSch[f]?700:400}}>{lbl}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:9,color:'#94a3b8',fontWeight:700,marginBottom:1}}>메모</div>
                  {editMode?<textarea value={selSch.memo} onChange={e=>updSch({memo:e.target.value})} style={{width:'100%',height:48,border:'1px solid #c7d2fe',borderRadius:6,padding:'4px 6px',fontSize:10,resize:'none',fontFamily:'inherit',color:'#334155',outline:'none',background:'#f0f0ff',lineHeight:1.5}}/>:<div style={{fontSize:10,color:'#475569',padding:'4px 6px',background:'#f8fafc',borderRadius:6,border:'1px solid #f1f5f9',minHeight:28,lineHeight:1.5}}>{selSch.memo||'-'}</div>}
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:2}}>
                  <button onClick={()=>setEditMode(v=>!v)} style={{padding:'5px',borderRadius:6,fontSize:11,fontWeight:700,cursor:'pointer',border:`1.5px solid ${editMode?'#6366f1':'#c7d2fe'}`,background:editMode?'#6366f1':'#eef2ff',color:editMode?'#fff':'#4338ca'}}>✏️ {editMode?'수정 완료':'정보 수정'}</button>
                  <button onClick={()=>setConfirm({msg:`"${selSch.client}"을 배정 대기 리스트로 되돌릴까요?`,onOk:()=>sendToWaiting(selSch),okLabel:'되돌리기',okColor:'#f59e0b'})} style={{padding:'5px',borderRadius:6,fontSize:11,fontWeight:700,cursor:'pointer',border:'1.5px solid #fde68a',background:'#fffbeb',color:'#92400e'}}>⏪ 대기로 되돌리기</button>
                  <button onClick={()=>setConfirm({msg:`"${selSch.client}" 일정을 삭제할까요?`,onOk:()=>delSch(selSch.id),okLabel:'삭제',okColor:'#dc2626'})} style={{padding:'5px',borderRadius:6,fontSize:11,fontWeight:700,cursor:'pointer',border:'1.5px solid #fca5a5',background:'#fff5f5',color:'#dc2626'}}>🗑️ 일정 삭제</button>
                </div>
              </div>
            )}
          </div>

          {/* 대기 산모 */}
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 11px',background:'#fffbeb',flexShrink:0,borderBottom:'1px solid #fde68a'}}>
              <span style={{fontSize:11,fontWeight:800,color:'#d97706'}}>⏳ 배정 대기 ({waiting.length})</span>
              <button onClick={()=>setAddWaitOpen(v=>!v)} style={{padding:'2px 8px',borderRadius:5,fontSize:10,fontWeight:700,border:'1.5px solid #f59e0b',background:addWaitOpen?'#f59e0b':'#fffbeb',color:addWaitOpen?'#fff':'#92400e',cursor:'pointer'}}>+ 추가</button>
            </div>
            {addWaitOpen&&(
              <div style={{padding:'7px 10px',background:'#fffbeb',borderBottom:'1px solid #fde68a',display:'flex',flexDirection:'column',gap:4,flexShrink:0}}>
                <input placeholder="산모 이름" value={newWait.name} onChange={e=>setNewWait(p=>({...p,name:e.target.value}))} style={{padding:'3px 6px',border:'1px solid #fde68a',borderRadius:5,fontSize:11}}/>
                <div style={{display:'flex',gap:4}}>
                  <input type="date" value={newWait.expectedBirth} onChange={e=>setNewWait(p=>({...p,expectedBirth:e.target.value}))} style={{flex:1,padding:'3px',border:'1px solid #fde68a',borderRadius:5,fontSize:10}}/>
                  <select value={newWait.durWd} onChange={e=>setNewWait(p=>({...p,durWd:+e.target.value}))} style={{width:52,padding:'3px 1px',border:'1px solid #fde68a',borderRadius:5,fontSize:10}}>{[10,15,20].map(n=><option key={n} value={n}>{n}일</option>)}</select>
                </div>
                <input placeholder="메모" value={newWait.memo} onChange={e=>setNewWait(p=>({...p,memo:e.target.value}))} style={{padding:'3px 6px',border:'1px solid #fde68a',borderRadius:5,fontSize:11}}/>
                <div style={{display:'flex',gap:4}}>
                  <button onClick={()=>{ if(!newWait.name.trim()) return; setWait(p=>[...p,{id:_uid++,...newWait}]); setNewWait({name:'',expectedBirth:'',durWd:10,memo:''}); setAddWaitOpen(false); }} style={{flex:1,padding:'4px',borderRadius:5,fontSize:11,fontWeight:700,background:'#f59e0b',color:'#fff',border:'none',cursor:'pointer'}}>저장</button>
                  <button onClick={()=>setAddWaitOpen(false)} style={{padding:'4px 8px',borderRadius:5,fontSize:11,background:'#e2e8f0',color:'#475569',border:'none',cursor:'pointer'}}>취소</button>
                </div>
              </div>
            )}
            <div style={{overflowY:'auto',flex:1,padding:'5px 7px'}}>
              {waiting.length===0?<div style={{color:'#94a3b8',fontSize:10,textAlign:'center',padding:'16px 0'}}>대기 중인 산모 없음</div>
              :waiting.map(wc=>(
                <div key={wc.id} draggable onDragStart={e=>onWaitDragStart(e,wc)} style={{padding:'6px 8px',marginBottom:5,borderRadius:7,background:'#fffbeb',border:'1.5px solid #fde68a',cursor:'grab',fontSize:11}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontWeight:700}}>{wc.name}</span>
                    <div style={{display:'flex',gap:4,alignItems:'center'}}>
                      <span style={{fontSize:9,background:'#fef3c7',border:'1px solid #fde68a',borderRadius:10,padding:'1px 5px',color:'#92400e'}}>{wc.durWd}일</span>
                      <button onClick={()=>setConfirm({msg:`"${wc.name}" 대기를 삭제할까요?`,onOk:()=>setWait(p=>p.filter(w=>w.id!==wc.id)),okLabel:'삭제',okColor:'#dc2626'})} style={{border:'none',background:'none',cursor:'pointer',color:'#fca5a5',fontSize:14,padding:0,lineHeight:1}}>×</button>
                    </div>
                  </div>
                  <div style={{fontSize:9,color:'#92400e',marginTop:2}}>예정일: {wc.expectedBirth?fmtD(new Date(wc.expectedBirth+'T00:00:00')):'-'} · {wc.memo}</div>
                  <div style={{fontSize:9,color:'#94a3b8',marginTop:1}}>↔ 관리사 행으로 드래그해서 배정</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* GANTT */}
        <div ref={wrapRef} style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {/* 스크롤바 행 */}
          <div style={{display:'flex',height:20,flexShrink:0,background:'#f8fafc',borderBottom:'1px solid #e2e8f0',zIndex:16}}>
            <div style={{width:WORKER_W,flexShrink:0,borderRight:'1px solid #e2e8f0'}}/>
            <div style={{flex:1,display:'flex',alignItems:'center',padding:'0 8px'}}>
              <div ref={sbTrackRef} onClick={onTrackClick} style={{flex:1,height:10,background:'#f1f5f9',borderRadius:5,position:'relative',cursor:'pointer',overflow:'hidden'}}>
                {densityMap.map((cnt,i)=>{ if(!cnt) return null; const mx=Math.max(...densityMap,1); return <div key={i} style={{position:'absolute',left:`${(i/TWD)*100}%`,bottom:0,width:`${(1/TWD)*100}%`,height:Math.round((cnt/mx)*7),background:'#93c5fd',opacity:0.55,borderRadius:1}}/>; })}
                <div style={{position:'absolute',left:`${(TDX/TWD)*100}%`,top:0,width:2,height:'100%',background:'#3b82f6',borderRadius:1,zIndex:3}}/>
                <div onMouseDown={onSbDown} style={{position:'absolute',left:thumbX,top:1,width:thumbW,height:8,background:'#3b82f6',borderRadius:4,cursor:sbDragging?'grabbing':'grab',zIndex:4,opacity:0.7,boxShadow:'0 1px 3px rgba(59,130,246,0.4)',transition:sbDragging?'none':'opacity 0.1s'}}/>
              </div>
            </div>
          </div>

          {/* 관리사+날짜 헤더 (같은 행) */}
          <div style={{display:'flex',height:DATE_H,flexShrink:0,zIndex:15,background:'#fff',borderBottom:'1px solid #e2e8f0',boxShadow:'0 2px 4px rgba(0,0,0,0.04)'}}>
            <div style={{width:WORKER_W,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 7px 0 9px',borderRight:'1px solid #e2e8f0',background:'#f8fafc'}}>
              <span style={{fontSize:11,fontWeight:800,color:'#64748b'}}>관리사</span>
              <button onClick={()=>setAddWOpen(v=>!v)} style={{padding:'2px 7px',borderRadius:5,fontSize:10,fontWeight:700,border:'1.5px solid #3b82f6',background:addWOpen?'#3b82f6':'#eff6ff',color:addWOpen?'#fff':'#1d4ed8',cursor:'pointer'}}>+ 추가</button>
            </div>
            <div ref={dateHdrRef} style={{flex:1,overflowX:'hidden',overflowY:'hidden',background:'#f8fafc'}}>
              <div style={{width:TWD*dayW,display:'flex',height:'100%'}}>
                {WD.map((d,i)=>{ const isToday=i===TDX,lbl=dayLbl(i),isMon=lbl&&lbl.includes('월'); return <div key={i} style={{width:dayW,flexShrink:0,textAlign:'center',fontSize:9,fontWeight:isToday||isMon?700:400,color:isToday?'#2563eb':isMon?'#1e293b':'#94a3b8',borderRight:isMon?'1px solid #e2e8f0':'1px solid #f8fafc',background:isToday?'#eff6ff':isMon?'#fafafa':'transparent',display:'flex',alignItems:'center',justifyContent:'center',position:'relative'}}>{lbl||(isToday?'▼':'')}{isToday&&<div style={{position:'absolute',bottom:0,left:'50%',transform:'translateX(-50%)',width:2,height:3,background:'#3b82f6',borderRadius:1}}/>}</div>; })}
              </div>
            </div>
          </div>

          {addWOpen&&(
            <div style={{padding:'5px 9px',background:'#f0f9ff',borderBottom:'1px solid #bae6fd',display:'flex',gap:5,alignItems:'center',flexShrink:0,flexWrap:'wrap'}}>
              <input placeholder="이름" value={newW.name} onChange={e=>setNewW(p=>({...p,name:e.target.value}))} style={{padding:'3px 6px',border:'1px solid #bae6fd',borderRadius:5,fontSize:11,width:60}}/>
              <input placeholder="지역" value={newW.area} onChange={e=>setNewW(p=>({...p,area:e.target.value}))} style={{padding:'3px 6px',border:'1px solid #bae6fd',borderRadius:5,fontSize:11,width:76}}/>
              <select value={newW.group} onChange={e=>setNewW(p=>({...p,group:+e.target.value}))} style={{padding:'3px 3px',border:'1px solid #bae6fd',borderRadius:5,fontSize:11}}>{GROUPS.map(g=><option key={g.id} value={g.id}>G{g.id} {g.label}</option>)}</select>
              <button onClick={doAddWorker} style={{padding:'3px 9px',borderRadius:5,fontSize:11,fontWeight:700,background:'#3b82f6',color:'#fff',border:'none',cursor:'pointer'}}>저장</button>
              <button onClick={()=>setAddWOpen(false)} style={{padding:'3px 7px',borderRadius:5,fontSize:11,background:'#e2e8f0',color:'#475569',border:'none',cursor:'pointer'}}>취소</button>
            </div>
          )}

          <div style={{display:'flex',flex:1,overflow:'hidden'}}>
            {/* 관리사 고정 열 */}
            <div ref={workerRef} onScroll={onWScroll} style={{width:WORKER_W,flexShrink:0,background:'#fff',borderRight:'1px solid #e2e8f0',overflowY:'auto',overflowX:'hidden'}}>
              {visibleW.map((w,i)=>{
                const g=GROUPS.find(g=>g.id===w.group),prev=visibleW[i-1],showSep=!prev||prev.group!==w.group,isEdit=editWId===w.id;
                const isMatch=q&&(w.name.toLowerCase().includes(q)||schedules.some(s=>s.wid===w.id&&s.client.toLowerCase().includes(q)));
                return (
                  <div key={w.id}>
                    {showSep&&<div style={{height:3,background:`linear-gradient(90deg,${g.accent}55,transparent)`,borderTop:i>0?`2px solid ${g.accent}44`:'none'}}/>}
                    <div className="wrow" style={{height:ROW_H,display:'flex',alignItems:'center',padding:'0 5px',borderBottom:'1px solid #f1f5f9',background:isMatch?'#fef9c3':i%2===0?g.bgRow:g.bgAlt,gap:3,position:'relative',transition:'background 0.15s'}} onMouseEnter={()=>setHoverWId(w.id)} onMouseLeave={()=>setHoverWId(null)}>
                      {isEdit?(
                        <><input value={editWVal.name} onChange={e=>setEditWVal(p=>({...p,name:e.target.value}))} style={{width:42,padding:'2px 3px',border:'1px solid #93c5fd',borderRadius:4,fontSize:10}}/><input value={editWVal.area} onChange={e=>setEditWVal(p=>({...p,area:e.target.value}))} style={{flex:1,padding:'2px 3px',border:'1px solid #93c5fd',borderRadius:4,fontSize:9,minWidth:0}}/><select value={editWVal.group} onChange={e=>setEditWVal(p=>({...p,group:+e.target.value}))} style={{width:22,padding:'1px',border:'1px solid #93c5fd',borderRadius:3,fontSize:9}}>{[1,2,3,4].map(n=><option key={n} value={n}>{n}</option>)}</select><button onClick={()=>saveEdit(w.id)} style={{padding:'1px 3px',borderRadius:3,background:'#3b82f6',color:'#fff',border:'none',cursor:'pointer',fontSize:9}}>✓</button><button onClick={()=>setEditWId(null)} style={{padding:'1px 3px',borderRadius:3,background:'#e2e8f0',color:'#475569',border:'none',cursor:'pointer',fontSize:9}}>✗</button></>
                      ):(
                        <><div style={{width:3,height:16,borderRadius:2,background:g.accent,flexShrink:0}}/><span style={{fontWeight:700,fontSize:11,whiteSpace:'nowrap'}}>{w.name}</span><span style={{fontSize:9,color:'#94a3b8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1,minWidth:0}}>{w.area}</span>
                        {hoverWId===w.id&&<div className="wact" style={{display:'flex',gap:2,flexShrink:0}}><button onClick={()=>{setEditWId(w.id);setEditWVal({name:w.name,area:w.area,group:w.group});}} style={{padding:'1px 3px',border:'1px solid #e2e8f0',borderRadius:3,background:'#fff',cursor:'pointer',fontSize:9,lineHeight:1}}>✏️</button><button onClick={()=>deleteWorker(w)} style={{padding:'1px 3px',border:'1px solid #fca5a5',borderRadius:3,background:'#fff5f5',cursor:'pointer',fontSize:9,lineHeight:1}}>🗑</button></div>}</>
                      )}
                    </div>
                  </div>
                );
              })}
              {inactiveW.length>0&&<button onClick={()=>setInactiveOpen(v=>!v)} style={{width:'100%',height:24,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 10px',background:'#f1f5f9',border:'none',borderTop:'2px dashed #cbd5e1',cursor:'pointer',fontSize:10,fontWeight:700,color:'#64748b'}}><span>📁 비활성 ({inactiveW.length}명)</span><span>{inactiveOpen?'▲':'▼'}</span></button>}
            </div>

            {/* 간트 본문 */}
            <div ref={ganttRef} onScroll={onGScroll} style={{flex:1,overflowX:'auto',overflowY:'auto',position:'relative',cursor:dragging?'grabbing':'default'}}>
              <div style={{width:TWD*dayW,minWidth:'100%'}}>
                {visibleW.map((w,i)=>{
                  const g=GROUPS.find(g=>g.id===w.group),prev=visibleW[i-1],showSep=!prev||prev.group!==w.group;
                  const wSchs=schedules.filter(s=>s.wid===w.id),wUna=unavail?.[w.id]||new Set();
                  const isMatch=q&&(w.name.toLowerCase().includes(q)||wSchs.some(s=>s.client.toLowerCase().includes(q)));
                  return (
                    <div key={w.id}>
                      {showSep&&i>0&&<div style={{height:3,background:`linear-gradient(90deg,${g.accent}44,transparent)`,borderTop:`2px solid ${g.accent}44`}}/>}
                      <div style={{height:ROW_H,position:'relative',borderBottom:'1px solid #f1f5f9',background:isMatch?'#fefce8':i%2===0?'#fff':'#fafbfc',transition:'background 0.15s'}} onDragOver={onRowDragOver} onDrop={e=>onRowDrop(e,w.id)}>
                        <div style={{position:'absolute',left:TDX*dayW+dayW/2,top:0,width:1.5,height:'100%',background:'#bfdbfe',zIndex:1,pointerEvents:'none'}}/>
                        {WD.map((_,di)=>di%5===0?<div key={di} style={{position:'absolute',left:di*dayW,top:0,width:1,height:'100%',background:'#f1f5f9',zIndex:0,pointerEvents:'none'}}/>:null)}
                        {[...wUna].map(idx=><div key={idx} style={{position:'absolute',left:idx*dayW,top:0,width:dayW,height:'100%',zIndex:2,pointerEvents:'none',background:HATCH}}/>)}
                        {wSchs.map(sch=>{
                          const st=STATUS_MAP[sch.status],isSel=selected===sch.id,isHit=q&&sch.client.toLowerCase().includes(q),curHit=isHit&&searchHits[searchIdx]?.id===sch.id;
                          return <div key={sch.id} onMouseDown={e=>onBlockDown(e,sch)} onContextMenu={e=>onRightClick(e,sch)} style={{position:'absolute',left:sch.startWd*dayW+1,top:4,height:22,width:sch.durWd*dayW-2,minWidth:6,borderRadius:5,background:st.bg,border:`${curHit?2.5:1.5}px solid ${isSel||isHit?st.text:st.border}`,cursor:dragging===sch.id?'grabbing':'grab',zIndex:isSel||curHit?5:3,display:'flex',alignItems:'center',paddingLeft:5,overflow:'hidden',boxShadow:isSel?`0 0 0 2px ${st.border},0 2px 6px rgba(0,0,0,0.1)`:curHit?`0 0 0 2.5px ${st.text}`:'0 1px 2px rgba(0,0,0,0.05)',transition:dragging===sch.id?'none':'box-shadow 0.1s'}}><span style={{fontSize:9,fontWeight:700,color:st.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{sch.client}</span></div>;
                        })}
                      </div>
                    </div>
                  );
                })}
                {inactiveW.length>0&&<div style={{height:24,background:'#f1f5f9',borderTop:'2px dashed #cbd5e1'}}/>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 우클릭 메뉴 */}
      {ctxMenu&&<div className="ctx-menu" style={{position:'fixed',left:ctxMenu.x,top:ctxMenu.y,background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,boxShadow:'0 4px 16px rgba(0,0,0,0.12)',zIndex:1000,minWidth:150,overflow:'hidden'}}>
        <div style={{padding:'5px 10px',fontSize:9,fontWeight:700,color:'#94a3b8',borderBottom:'1px solid #f1f5f9',background:'#f8fafc'}}>서비스 기간 변경 (평일)</div>
        {[10,15,20].map(n=>{ const cur=schedules.find(s=>s.id===ctxMenu.sid)?.durWd; return <button key={n} onClick={()=>setDur(ctxMenu.sid,n)} style={{display:'block',width:'100%',padding:'7px 14px',border:'none',background:cur===n?'#eff6ff':'#fff',textAlign:'left',fontSize:12,fontWeight:cur===n?700:400,color:cur===n?'#2563eb':'#334155',cursor:'pointer',borderBottom:'1px solid #f8fafc'}}>{n}일 {cur===n?'✓':''}</button>; })}
        <div style={{borderTop:'1px solid #f1f5f9',display:'flex',gap:4,padding:'5px 8px'}}>
          <input type="number" min={1} placeholder="직접입력" onKeyDown={e=>{ if(e.key==='Enter'&&+e.target.value>0) setDur(ctxMenu.sid,+e.target.value); }} style={{flex:1,padding:'3px 5px',border:'1px solid #e2e8f0',borderRadius:5,fontSize:11}}/>
          <button onClick={e=>{ const inp=e.currentTarget.previousSibling; if(+inp.value>0) setDur(ctxMenu.sid,+inp.value); }} style={{padding:'3px 7px',borderRadius:5,background:'#3b82f6',color:'#fff',border:'none',fontSize:11,cursor:'pointer'}}>적용</button>
        </div>
      </div>}

      {/* 확인창 */}
      {confirm&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.28)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}}>
        <div style={{background:'#fff',borderRadius:12,padding:'20px 22px',boxShadow:'0 8px 24px rgba(0,0,0,0.14)',maxWidth:300,width:'90%'}}>
          <div style={{fontWeight:800,fontSize:14,marginBottom:8}}>확인</div>
          <div style={{fontSize:12,color:'#475569',marginBottom:16}}>{confirm.msg}</div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
            <button onClick={()=>setConfirm(null)} style={{padding:'6px 14px',borderRadius:6,border:'1px solid #e2e8f0',background:'#f8fafc',fontSize:12,cursor:'pointer'}}>취소</button>
            <button onClick={()=>{confirm.onOk();setConfirm(null);}} style={{padding:'6px 14px',borderRadius:6,border:'none',background:confirm.okColor||'#dc2626',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>{confirm.okLabel||'확인'}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
