import { useState, useRef, useEffect, useCallback, useMemo } from "react";

const API_URL = "https://script.google.com/macros/s/AKfycbynZ_pJpYYjDDMdKDbgbZlCvCJtHu41viiuiGjtVLAynIB1HUjA1HbCGx7jt5bRXxOY4A/exec";
const APP_PASSWORD = "3103"; // ★ 비밀번호 (변경하려면 여기 수정)

// ── API ──────────────────────────────────────────────
async function apiGet() {
  try {
    const res = await fetch(`${API_URL}?action=getAll`, { redirect:'follow' });
    return JSON.parse(await res.text());
  } catch(e) { return { error: e.toString() }; }
}
async function apiSave(data) {
  // ★ POST 방식으로 변경 (데이터 크기 제한 없음)
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify({ action:'saveAll', data }),
    });
    return JSON.parse(await res.text());
  } catch(e) { return { error: e.toString() }; }
}

// ── 공휴일 ───────────────────────────────────────────
const KR_HOLIDAYS = new Set([
  '2024-12-25','2025-01-01','2025-01-28','2025-01-29','2025-01-30',
  '2025-03-01','2025-05-05','2025-05-06','2025-06-06','2025-08-15',
  '2025-10-03','2025-10-06','2025-10-07','2025-10-08','2025-10-09','2025-12-25',
  '2026-01-01','2026-02-17','2026-02-18','2026-02-19',
  '2026-03-01','2026-05-05','2026-06-06','2026-08-17','2026-10-03','2026-10-09','2026-12-25',
  '2027-01-01','2027-01-27','2027-01-28','2027-01-29',
  '2027-03-01','2027-05-05','2027-06-06','2027-08-16','2027-10-03','2027-10-09','2027-12-25',
]);
const dKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const isWorkDay = (d) => d.getDay()!==0 && d.getDay()!==6 && !KR_HOLIDAYS.has(dKey(d));

// ── 날짜 정규화 ──────────────────────────────────────
const normDate = (v) => {
  try {
    if (!v && v!==0) return '';
    const s = String(v).trim();
    if (!s||s==='undefined'||s==='null') return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (s.includes('T')) return s.substring(0,10);
    if (s.includes('/')) {
      const p=s.split('/');
      if (p.length===3) {
        if (p[0].length===4) return `${p[0]}-${p[1].padStart(2,'0')}-${p[2].padStart(2,'0')}`;
        return `${p[2]}-${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}`;
      }
    }
    if (!isNaN(Number(s))&&Number(s)>1000) { const d=new Date((Number(s)-25569)*86400000); return dKey(d); }
  } catch(e) {}
  return '';
};
const fmtD = (d) => {
  try {
    if (!d) return '';
    const dt = typeof d==='string'?new Date(d+'T00:00:00'):d;
    if (isNaN(dt.getTime())) return '';
    return `${dt.getMonth()+1}/${dt.getDate()}`;
  } catch(e) { return ''; }
};
const fmtFull = (d) => {
  try {
    if (!d) return '';
    const dt = typeof d==='string'?new Date(d+'T00:00:00'):d;
    if (isNaN(dt.getTime())) return '';
    const dow=['일','월','화','수','목','금','토'];
    return `${dt.getMonth()+1}/${dt.getDate()}(${dow[dt.getDay()]})`;
  } catch(e) { return ''; }
};

// ── 평일 배열 ────────────────────────────────────────
const TODAY = new Date(); TODAY.setHours(0,0,0,0);
function buildWD() {
  const days=[]; let ti=0;
  const s=new Date(+TODAY-100*86400000), e=new Date(+TODAY+280*86400000);
  let d=new Date(s);
  while(+d<=+e) {
    if (isWorkDay(d)) { if(+d===+TODAY) ti=days.length; days.push(new Date(d)); }
    d=new Date(+d+86400000);
  }
  if (!days[ti]||+days[ti]!==+TODAY) { for(let i=0;i<days.length;i++){if(+days[i]>=+TODAY){ti=i;break;}} }
  return {days,todayIdx:ti};
}
const {days:WD,todayIdx:TDX}=buildWD();
const TWD=WD.length;

const toBool=(v)=>v===true||v==='TRUE'||v==='true'||v===1||v==='1';
const toInt=(v,def=0)=>{const n=parseInt(v);return isNaN(n)?def:n;};
const dateToWd=(ds)=>{
  try{const s=normDate(ds);if(!s)return TDX;const idx=WD.findIndex(d=>dKey(d)===s);return idx>=0?idx:TDX;}
  catch(e){return TDX;}
};
const dateToWdEnd=(ds)=>{
  try{const s=normDate(ds);if(!s)return TDX+1;let last=TDX;for(let i=0;i<WD.length;i++){if(dKey(WD[i])<=s)last=i;}return last+1;}
  catch(e){return TDX+1;}
};
const wdToDate=(wd)=>WD[wd]?dKey(WD[wd]):dKey(WD[TDX]);

const HATCH=`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Cline x1='0' y1='8' x2='8' y2='0' stroke='%23ef4444' stroke-width='1.2' stroke-opacity='0.35'/%3E%3C/svg%3E")`;

const STATUS_MAP={
  hope:     {label:'희망예약',bg:'#fef9c3',border:'#fbbf24',text:'#92400e'},
  urgent:   {label:'중요예약',bg:'#fff7ed',border:'#f97316',text:'#9a3412'},
  confirmed:{label:'확정',   bg:'#f0fdf4',border:'#22c55e',text:'#166534'},
  ongoing:  {label:'진행중', bg:'#eff6ff',border:'#3b82f6',text:'#1e40af'},
  done:     {label:'완료',   bg:'#f0f9ff',border:'#7dd3fc',text:'#0c4a6e'},
  closed:   {label:'종료',   bg:'#f8fafc',border:'#94a3b8',text:'#475569'},
};
const GROUPS=[
  {id:1,label:'상시근무',bgRow:'#fff',bgAlt:'#f0f7ff',accent:'#3b82f6'},
  {id:2,label:'선택근무',bgRow:'#fff',bgAlt:'#f0fdf8',accent:'#10b981'},
  {id:3,label:'대기가능',bgRow:'#fff',bgAlt:'#f5f3ff',accent:'#8b5cf6'},
  {id:4,label:'단기근무',bgRow:'#fff',bgAlt:'#fefce8',accent:'#f59e0b'},
];
const ROW_H=30,DATE_H=28,WORKER_W=172,PANEL_W=252;

const autoStatus=(s)=>{
  try{
    if(!s||s.status==='closed') return s;
    const end=(s.startWd||0)+(s.durWd||0);
    if(end<=TDX) return {...s,status:'done'};
    if((s.startWd||0)<=TDX&&end>TDX&&s.status==='confirmed') return {...s,status:'ongoing'};
  }catch(e){}
  return s;
};
const dayLbl=(i)=>{
  try{
    const d=WD[i];if(!d)return '';
    if(i===0||WD[i-1].getMonth()!==d.getMonth()) return `${d.getMonth()+1}월`;
    if(d.getDate()%7===1) return String(d.getDate());
  }catch(e){}
  return '';
};

let _wid=100,_sid=100,_uid=100,_uvid=100;
const iStyle=(x={})=>({padding:'3px 6px',border:'1px solid #c7d2fe',borderRadius:5,fontSize:11,background:'#f0f0ff',outline:'none',fontFamily:'inherit',...x});

// ── 파싱 ─────────────────────────────────────────────
function parseWorkers(raw){
  return (Array.isArray(raw)?raw:[]).map(w=>{
    try{return {id:toInt(w.id,_wid++),name:String(w.name||''),area:String(w.area||''),group:toInt(w.group,1),inactive:toBool(w.inactive)};}
    catch(e){return null;}
  }).filter(Boolean);
}
function parseSchedules(raw){
  return (Array.isArray(raw)?raw:[]).map(s=>{
    try{
      return autoStatus({
        id:toInt(s.id,_sid++),wid:toInt(s.wid,0),
        client:String(s.client||''),
        startWd:dateToWd(s.startDate),
        durWd:Math.max(1,toInt(s.durWd,10)),
        status:STATUS_MAP[s.status]?s.status:'hope',
        memo:String(s.memo||''),
        expectedBirth:normDate(s.expectedBirth),
        serviceStart:normDate(s.serviceStart||s.actualBirth||''),
        birthConfirm:toBool(s.birthConfirm),firstVisit:toBool(s.firstVisit),
        midCheck:toBool(s.midCheck),happycall:toBool(s.happycall),
      });
    }catch(e){return null;}
  }).filter(Boolean);
}
function parseWaiting(raw){
  return (Array.isArray(raw)?raw:[]).map(w=>{
    try{return {id:toInt(w.id,_uid++),name:String(w.name||''),expectedBirth:normDate(w.expectedBirth),serviceStart:normDate(w.serviceStart||''),durWd:Math.max(1,toInt(w.durWd,10)),memo:String(w.memo||'')};}
    catch(e){return null;}
  }).filter(Boolean);
}
function parseUnavail(raw){
  return (Array.isArray(raw)?raw:[]).map(u=>{
    try{return {id:toInt(u.id,_uvid++),wid:toInt(u.wid,0),startDate:normDate(u.startDate),endDate:normDate(u.endDate),reason:String(u.reason||'근무불가')};}
    catch(e){return null;}
  }).filter(Boolean);
}

export default function App(){
  // ── 인증 ────────────────────────────────────────────
  const [authenticated,setAuthenticated]=useState(()=>{
    try{return sessionStorage.getItem('sanmo_auth')===APP_PASSWORD;}catch(e){return false;}
  });
  const [pwInput,setPwInput]=useState('');
  const [pwError, setPwError]=useState(false);

  // ── 데이터 ──────────────────────────────────────────
  const [workers,   setWorkers]   =useState([]);
  const [schedules, setSchedules] =useState([]);
  const [waiting,   setWaiting]   =useState([]);
  const [unavail,   setUnavail]   =useState([]);
  const [loadState, setLoadState] =useState('loading');
  const [saveState, setSaveState] =useState('idle');
  const [errMsg,    setErrMsg]    =useState('');
  const [warnMsg,   setWarnMsg]   =useState('');

  // ── UI ──────────────────────────────────────────────
  const [panelOpen, setPanelOpen] =useState(true);
  const [selected,  setSelected]  =useState(null);
  const [editMode,  setEditMode]  =useState(false);
  const [inactiveOpen,setInactiveOpen]=useState(false);
  const [addWOpen,  setAddWOpen]  =useState(false);
  const [addWaitOpen,setAddWaitOpen]=useState(false);
  const [editWId,   setEditWId]   =useState(null);
  const [editWVal,  setEditWVal]  =useState({name:'',area:'',group:1});
  const [hoverWId,  setHoverWId]  =useState(null);
  const [newW,      setNewW]      =useState({name:'',area:'',group:1});
  const [newWait,   setNewWait]   =useState({name:'',expectedBirth:'',serviceStart:'',durWd:10,memo:'',customDur:''});
  const [search,    setSearch]    =useState('');
  const [searchIdx, setSearchIdx] =useState(0);
  const [ctxMenu,   setCtxMenu]   =useState(null);
  const [confirm,   setConfirm]   =useState(null);
  const [dragWait,  setDragWait]  =useState(null);
  const [tooltip,   setTooltip]   =useState(null);
  const [addUnavailWid,setAddUnavailWid]=useState(null);
  const [newUnavail,setNewUnavail]=useState({startDate:'',endDate:'',reason:''});

  // ── 이동 모드 ────────────────────────────────────────
  const [moveMode,  setMoveMode]  =useState(null); // {type:'date'|'worker', sid}
  const [dragging,  setDragging]  =useState(null);
  const [dragOff,   setDragOff]   =useState(0);
  const [dragDate,  setDragDate]  =useState(null); // 드래그 중 날짜 팝업
  const [dragTargetWid,setDragTargetWid]=useState(null); // 관리사 이동 대상

  // ── 스크롤 ──────────────────────────────────────────
  const [dayW,      setDayW]      =useState(22);
  const [sbDrag,    setSbDrag]    =useState(false);
  const [sbSX,      setSbSX]      =useState(0);
  const [sbSL,      setSbSL]      =useState(0);
  const [ganttSL,   setGanttSL]   =useState(0);
  const [ganttVW,   setGanttVW]   =useState(800);

  const ganttRef   =useRef(null);
  const workerRef  =useRef(null);
  const wrapRef    =useRef(null);
  const dateHdrRef =useRef(null);
  const sbRef      =useRef(null);
  const syncV      =useRef(false);
  const saveTimer  =useRef(null);
  const isPan      =useRef(false);
  const panStartX  =useRef(0);
  const panStartSL =useRef(0);

  // ── 비밀번호 확인 ────────────────────────────────────
  const checkPw=()=>{
    if(pwInput===APP_PASSWORD){
      try{sessionStorage.setItem('sanmo_auth',APP_PASSWORD);}catch(e){}
      setAuthenticated(true);setPwError(false);
    }else{setPwError(true);setPwInput('');}
  };

  // ── 데이터 로드 ──────────────────────────────────────
  const loadData=useCallback(()=>{
    setLoadState('loading');
    apiGet().then(data=>{
      if(!data||data.error){setErrMsg(data?.error||'오류');setLoadState('error');return;}
      try{
        const ws=parseWorkers(data.workers);
        const ss=parseSchedules(data.schedules);
        const wt=parseWaiting(data.waiting);
        const uv=parseUnavail(data.unavail||[]);
        if(ws.length>0) _wid=Math.max(...ws.map(w=>w.id))+1;
        if(ss.length>0) _sid=Math.max(...ss.map(s=>s.id))+1;
        if(wt.length>0) _uid=Math.max(...wt.map(w=>w.id))+1;
        if(uv.length>0) _uvid=Math.max(...uv.map(u=>u.id))+1;
        setWorkers(ws);setSchedules(ss);setWaiting(wt);setUnavail(uv);
        setLoadState('ok');
      }catch(e){setErrMsg(String(e));setLoadState('error');}
    }).catch(e=>{setErrMsg(String(e));setLoadState('error');});
  },[]);

  useEffect(()=>{ if(authenticated) loadData(); },[authenticated]);

  // ★ 데이터 로드 완료 후 스크롤 위치 설정
  useEffect(()=>{
    if(loadState!=='ok') return;
    const t=setTimeout(()=>{
      if(!ganttRef.current) return;
      const sl=Math.max(0,(TDX-5)*dayW);
      ganttRef.current.scrollLeft=sl;
      if(dateHdrRef.current) dateHdrRef.current.scrollLeft=sl;
    },150);
    return()=>clearTimeout(t);
  },[loadState]);

  // ★ 5분마다 백그라운드 갱신 (다중기기 안전)
  useEffect(()=>{
    if(loadState!=='ok') return;
    const interval=setInterval(async()=>{
      try{
        const data=await apiGet();
        if(!data||data.error) return;
        const fw=parseWorkers(data.workers);
        const fs=parseSchedules(data.schedules);
        const ft=parseWaiting(data.waiting);
        const fu=parseUnavail(data.unavail||[]);
        // 새로운 id만 추가 (기존 데이터 덮어쓰지 않음)
        setWorkers(prev=>{const ids=new Set(prev.map(w=>w.id));const nw=fw.filter(w=>!ids.has(w.id));return nw.length?[...prev,...nw]:prev;});
        setSchedules(prev=>{const ids=new Set(prev.map(s=>s.id));const nw=fs.filter(s=>!ids.has(s.id));return nw.length?[...prev,...nw]:prev;});
        setWaiting(prev=>{const ids=new Set(prev.map(w=>w.id));const nw=ft.filter(w=>!ids.has(w.id));return nw.length?[...prev,...nw]:prev;});
        setUnavail(prev=>{const ids=new Set(prev.map(u=>u.id));const nw=fu.filter(u=>!ids.has(u.id));return nw.length?[...prev,...nw]:prev;});
      }catch(e){}
    },5*60*1000);
    return()=>clearInterval(interval);
  },[loadState]);

  // ── 저장 ─────────────────────────────────────────────
  const triggerSave=useCallback((ws,ss,wt,uv)=>{
    if(saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current=setTimeout(async()=>{
      try{
        const r=await apiSave({workers:ws,schedules:ss.map(s=>({...s,startDate:wdToDate(s.startWd)})),waiting:wt,unavail:uv});
        if(r?.error) setSaveState('error');
        else{setSaveState('saved');setTimeout(()=>setSaveState('idle'),2000);}
      }catch(e){setSaveState('error');}
    },2000);
  },[]);

  const setW    =(fn)=>setWorkers(p=>{const n=typeof fn==='function'?fn(p):fn;triggerSave(n,schedules,waiting,unavail);return n;});
  const setSch  =(fn)=>setSchedules(p=>{const n=typeof fn==='function'?fn(p):fn;triggerSave(workers,n,waiting,unavail);return n;});
  const setWait =(fn)=>setWaiting(p=>{const n=typeof fn==='function'?fn(p):fn;triggerSave(workers,schedules,n,unavail);return n;});
  const setUnavl=(fn)=>setUnavail(p=>{const n=typeof fn==='function'?fn(p):fn;triggerSave(workers,schedules,waiting,n);return n;});

  // ── 간트 스크롤 이동 헬퍼 ────────────────────────────
  const scrollToWd=(wd)=>{
    if(!ganttRef.current) return;
    ganttRef.current.scrollTo({left:Math.max(0,(wd-3)*dayW),behavior:'smooth'});
  };

  // ── dayW ─────────────────────────────────────────────
  useEffect(()=>{
    const calc=()=>{if(!wrapRef.current)return;setDayW(Math.max(16,Math.floor((wrapRef.current.offsetWidth-WORKER_W)/44)));};
    calc();const ro=new ResizeObserver(calc);if(wrapRef.current)ro.observe(wrapRef.current);return()=>ro.disconnect();
  },[panelOpen]);
  useEffect(()=>{
    if(!ganttRef.current||dayW<16||loadState!=='ok')return;
    const sl=Math.max(0,(TDX-5)*dayW);
    ganttRef.current.scrollLeft=sl;if(dateHdrRef.current)dateHdrRef.current.scrollLeft=sl;
  },[dayW]);

  // ── 스크롤 동기화 ────────────────────────────────────
  const onGScroll=useCallback(()=>{
    if(!ganttRef.current)return;
    if(syncV.current)return;syncV.current=true;
    if(workerRef.current)workerRef.current.scrollTop=ganttRef.current.scrollTop;
    syncV.current=false;
    if(dateHdrRef.current)dateHdrRef.current.scrollLeft=ganttRef.current.scrollLeft;
    setGanttSL(ganttRef.current.scrollLeft);setGanttVW(ganttRef.current.clientWidth);
  },[]);
  const onWScroll=useCallback(()=>{
    if(!workerRef.current||!ganttRef.current)return;
    if(syncV.current)return;syncV.current=true;
    ganttRef.current.scrollTop=workerRef.current.scrollTop;syncV.current=false;
  },[]);
  useEffect(()=>{
    const el=ganttRef.current;if(!el)return;
    const u=()=>{setGanttSL(el.scrollLeft);setGanttVW(el.clientWidth);};
    u();el.addEventListener('scroll',u,{passive:true});return()=>el.removeEventListener('scroll',u);
  },[dayW]);

  // ── 스크롤바 ─────────────────────────────────────────
  const totalW=TWD*dayW;
  const thumbW=Math.max(40,Math.min(ganttVW,ganttVW/totalW*ganttVW));
  const thumbMax=Math.max(1,ganttVW-thumbW);
  const thumbX=totalW>ganttVW?(ganttSL/(totalW-ganttVW))*thumbMax:0;
  const densityMap=useMemo(()=>{
    const m=new Array(TWD).fill(0);
    schedules.forEach(s=>{for(let i=s.startWd||0;i<(s.startWd||0)+(s.durWd||0)&&i<TWD;i++)if(i>=0)m[i]++;});
    return m;
  },[schedules]);
  useEffect(()=>{
    if(!sbDrag)return;
    const mv=(e)=>{const sl=Math.max(0,Math.min(totalW-ganttVW,sbSL+((e.clientX-sbSX)/thumbMax)*(totalW-ganttVW)));if(ganttRef.current)ganttRef.current.scrollLeft=sl;if(dateHdrRef.current)dateHdrRef.current.scrollLeft=sl;};
    const up=()=>setSbDrag(false);
    window.addEventListener('mousemove',mv);window.addEventListener('mouseup',up);
    return()=>{window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up);};
  },[sbDrag,sbSX,sbSL,thumbMax,totalW,ganttVW]);

  // ── 전역 클릭: 이동모드/컨텍스트 메뉴 닫기 ────────────
  useEffect(()=>{
    const h=(e)=>{
      if(!e.target.closest('.ctx-menu'))setCtxMenu(null);
      if(!e.target.closest('.move-mode-block')&&!e.target.closest('.ctx-menu')){
        if(moveMode&&!dragging){setMoveMode(null);setDragTargetWid(null);}
      }
    };
    window.addEventListener('mousedown',h);return()=>window.removeEventListener('mousedown',h);
  },[moveMode,dragging]);

  // ── 근무불가 맵 ──────────────────────────────────────
  const unavailMap=useMemo(()=>{
    const map={};
    unavail.forEach(u=>{
      try{
        if(!u||!u.wid)return;
        const startWd=dateToWd(u.startDate),endWd=dateToWdEnd(u.endDate);
        if(!map[u.wid])map[u.wid]=[];
        map[u.wid].push({id:u.id,startWd,endWd,reason:u.reason||'근무불가'});
      }catch(e){}
    });
    return map;
  },[unavail]);
  const checkUnavailConflict=(wid,startWd,durWd)=>{
    return (unavailMap[wid]||[]).some(u=>u.startWd<startWd+durWd&&u.endWd>startWd);
  };

  // ── 검색 ─────────────────────────────────────────────
  const q=search.trim().toLowerCase();
  const searchHits=useMemo(()=>{
    if(!q)return[];
    return schedules.filter(s=>s&&(s.client||'').toLowerCase().includes(q))
      .sort((a,b)=>Math.abs((a.startWd||0)-TDX)-Math.abs((b.startWd||0)-TDX));
  },[schedules,q]);
  useEffect(()=>{
    setSearchIdx(0);
    if(searchHits.length&&ganttRef.current)
      ganttRef.current.scrollTo({left:Math.max(0,((searchHits[0].startWd||0)-2)*dayW),behavior:'smooth'});
  },[search]);
  const goHit=(dir)=>{
    if(!searchHits.length)return;
    const n=(searchIdx+dir+searchHits.length)%searchHits.length;
    setSearchIdx(n);
    if(ganttRef.current)ganttRef.current.scrollTo({left:Math.max(0,((searchHits[n].startWd||0)-2)*dayW),behavior:'smooth'});
  };

  // ── 관리사 정렬 ──────────────────────────────────────
  const activeWorkers=useMemo(()=>{
    const list=workers.filter(w=>w&&!w.inactive);
    if(!q)return[...list].sort((a,b)=>(a.group||1)!==(b.group||1)?(a.group||1)-(b.group||1):(a.name||'').localeCompare(b.name||'','ko'));
    const mw=new Set([
      ...schedules.filter(s=>s&&(s.client||'').toLowerCase().includes(q)).map(s=>s.wid),
      ...list.filter(w=>w&&(w.name||'').toLowerCase().includes(q)).map(w=>w.id),
    ]);
    return[...list.filter(w=>mw.has(w.id)),...list.filter(w=>!mw.has(w.id)).sort((a,b)=>(a.group||1)!==(b.group||1)?(a.group||1)-(b.group||1):(a.name||'').localeCompare(b.name||'','ko'))];
  },[workers,schedules,q]);
  const inactiveW=workers.filter(w=>w&&w.inactive);
  const visibleW=[...activeWorkers,...(inactiveOpen?inactiveW:[])];

  // ── 일정 조작 ────────────────────────────────────────
  const selSch=schedules.find(s=>s&&s.id===selected);
  const updSch=(patch)=>setSch(p=>p.map(s=>s&&s.id===selected?{...s,...patch}:s));
  const delSch=(id)=>{setSch(p=>p.filter(s=>s&&s.id!==id));if(selected===id){setSelected(null);setEditMode(false);}};
  const sendToWaiting=(sch)=>{setWait(p=>[...p,{id:_uid++,name:sch.client||'',expectedBirth:sch.expectedBirth||'',serviceStart:sch.serviceStart||'',durWd:sch.durWd||10,memo:sch.memo||''}]);delSch(sch.id);};

  // ── 이동 모드 드래그 ─────────────────────────────────
  const onBlockMouseDown=(e,sch)=>{
    e.stopPropagation();
    setSelected(sch.id);setEditMode(false);
    // 이동모드가 활성화된 해당 블록만 드래그 허용
    if(moveMode&&moveMode.sid===sch.id){
      e.preventDefault();
      setDragOff(e.clientX-e.currentTarget.getBoundingClientRect().left);
      setDragging(sch.id);
      if(moveMode.type==='date') setDragDate(fmtFull(WD[sch.startWd]));
    }
  };

  // ── 전역 마우스 이동 ─────────────────────────────────
  const onGlobalMouseMove=useCallback((e)=>{
    // 패닝
    if(isPan.current&&ganttRef.current){
      const newSL=Math.max(0,panStartSL.current+(panStartX.current-e.clientX));
      ganttRef.current.scrollLeft=newSL;
      if(dateHdrRef.current)dateHdrRef.current.scrollLeft=newSL;
    }
    // 날짜 이동 드래그
    if(dragging&&moveMode?.type==='date'&&ganttRef.current){
      const ni=Math.max(0,Math.min(TWD-1,Math.round((e.clientX-ganttRef.current.getBoundingClientRect().left+ganttRef.current.scrollLeft-dragOff)/dayW)));
      setSch(p=>p.map(s=>s&&s.id===dragging?{...s,startWd:ni}:s));
      setDragDate(WD[ni]?fmtFull(WD[ni]):'');
    }
    // 관리사 이동 드래그 (Y 기반)
    if(dragging&&moveMode?.type==='worker'&&ganttRef.current){
      const rect=ganttRef.current.getBoundingClientRect();
      const relY=e.clientY-rect.top+ganttRef.current.scrollTop;
      let cumY=0;
      for(let i=0;i<visibleW.length;i++){
        const w=visibleW[i];if(!w)continue;
        const prev=visibleW[i-1];
        if(!prev||prev.group!==w.group) cumY+=3;
        if(relY>=cumY&&relY<cumY+ROW_H){setDragTargetWid(w.id);break;}
        cumY+=ROW_H;
      }
    }
  },[dragging,moveMode,dragOff,dayW,visibleW]);

  const onGlobalMouseUp=useCallback(()=>{
    // 패닝 종료
    isPan.current=false;
    // 드래그 종료
    if(dragging){
      // 관리사 이동 완료
      if(moveMode?.type==='worker'&&dragTargetWid){
        setSch(p=>p.map(s=>s&&s.id===dragging?{...s,wid:dragTargetWid}:s));
        if(checkUnavailConflict(dragTargetWid,schedules.find(s=>s?.id===dragging)?.startWd||0,schedules.find(s=>s?.id===dragging)?.durWd||0)){
          setWarnMsg('⚠️ 해당 기간에 근무불가 일정이 있습니다!');setTimeout(()=>setWarnMsg(''),5000);
        }
      }
      setDragging(null);setDragDate(null);setDragTargetWid(null);
    }
  },[dragging,moveMode,dragTargetWid,schedules]);

  // ── 간트 패닝 시작 ────────────────────────────────────
  const onGanttMouseDown=(e)=>{
    if(e.button!==0)return;
    if(e.target.closest('.sch-block')||e.target.closest('.unavail-block'))return;
    isPan.current=true;
    panStartX.current=e.clientX;
    panStartSL.current=ganttRef.current?.scrollLeft||0;
  };

  // ── 우클릭 메뉴 ──────────────────────────────────────
  const onRightClick=(e,sch)=>{
    e.preventDefault();e.stopPropagation();
    setCtxMenu({x:e.clientX,y:e.clientY,sid:sch.id});
    setSelected(sch.id);
  };
  const setDur=(sid,dur)=>{setSch(p=>p.map(s=>s&&s.id===sid?{...s,durWd:dur}:s));setCtxMenu(null);};
  const activateMoveMode=(type)=>{
    if(ctxMenu){setMoveMode({type,sid:ctxMenu.sid});setCtxMenu(null);}
  };

  // ── 대기 → 배정 드래그 ───────────────────────────────
  const onWaitDragStart=(e,wc)=>{setDragWait(wc.id);e.dataTransfer.effectAllowed='move';};
  const onRowDragOver=(e)=>{if(dragWait!==null)e.preventDefault();};
  const onRowDrop=(e,wid)=>{
    if(dragWait===null||!ganttRef.current)return;e.preventDefault();
    const sw=Math.max(0,Math.min(TWD-1,Math.round((e.clientX-ganttRef.current.getBoundingClientRect().left+ganttRef.current.scrollLeft)/dayW)));
    const wc=waiting.find(w=>w&&w.id===dragWait);if(!wc)return;
    const newSch=autoStatus({id:_sid++,wid,client:wc.name||'',startWd:sw,durWd:wc.durWd||10,status:'hope',memo:wc.memo||'',expectedBirth:wc.expectedBirth||'',serviceStart:wc.serviceStart||'',birthConfirm:false,firstVisit:false,midCheck:false,happycall:false});
    setSch(p=>[...p,newSch]);
    setWait(p=>p.filter(w=>w&&w.id!==dragWait));setDragWait(null);
    if(checkUnavailConflict(wid,sw,wc.durWd||10)){setWarnMsg('⚠️ 해당 기간에 근무불가 일정이 있습니다!');setTimeout(()=>setWarnMsg(''),5000);}
  };

  // ── 관리사 조작 ──────────────────────────────────────
  const doAddWorker=()=>{if(!newW.name.trim())return;setW(p=>[...p,{id:_wid++,name:newW.name.trim(),area:newW.area.trim(),group:+newW.group,inactive:false}]);setNewW({name:'',area:'',group:1});setAddWOpen(false);};
  const saveEdit=(id)=>{setW(p=>p.map(w=>w&&w.id===id?{...w,...editWVal,group:+editWVal.group}:w));setEditWId(null);};
  const deleteWorker=(w)=>{
    if(schedules.some(s=>s&&s.wid===w.id&&!['done','closed'].includes(s.status)))return alert('진행 중인 일정이 있습니다.');
    setConfirm({msg:`"${w.name}" 관리사를 삭제할까요?`,onOk:()=>setW(p=>p.filter(x=>x&&x.id!==w.id)),okLabel:'삭제',okColor:'#dc2626'});
  };

  // ── 근무불가 ─────────────────────────────────────────
  const doAddUnavail=()=>{
    if(!addUnavailWid||!newUnavail.startDate||!newUnavail.endDate)return;
    if(newUnavail.startDate>newUnavail.endDate){setWarnMsg('종료일이 시작일보다 빠릅니다.');setTimeout(()=>setWarnMsg(''),3000);return;}
    setUnavl(p=>[...p,{id:_uvid++,wid:addUnavailWid,startDate:newUnavail.startDate,endDate:newUnavail.endDate,reason:newUnavail.reason||'근무불가'}]);
    setNewUnavail({startDate:'',endDate:'',reason:''});setAddUnavailWid(null);
  };
  const delUnavail=(uid)=>setUnavl(p=>p.filter(u=>u&&u.id!==uid));

  const saveColor=saveState==='saving'?'#f59e0b':saveState==='saved'?'#22c55e':saveState==='error'?'#dc2626':'transparent';
  const saveText=saveState==='saving'?'저장 중...':saveState==='saved'?'✓ 저장됨':saveState==='error'?'저장 실패':'';

  // ── 비밀번호 화면 ─────────────────────────────────────
  if(!authenticated) return(
    <div style={{height:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:"'Apple SD Gothic Neo',sans-serif",background:'linear-gradient(135deg,#1e3a5f,#1e40af)',gap:16}}>
      <div style={{width:56,height:56,borderRadius:16,background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28}}>🔐</div>
      <div style={{fontSize:18,fontWeight:800,color:'#fff'}}>산모신생아 인력 현황판</div>
      <div style={{background:'rgba(255,255,255,0.1)',borderRadius:16,padding:'24px 28px',display:'flex',flexDirection:'column',gap:12,alignItems:'center',width:240}}>
        <div style={{fontSize:13,color:'rgba(255,255,255,0.8)',fontWeight:600}}>비밀번호 4자리 입력</div>
        <input
          type="password" maxLength={4} value={pwInput}
          onChange={e=>{setPwInput(e.target.value);setPwError(false);}}
          onKeyDown={e=>e.key==='Enter'&&checkPw()}
          style={{width:'100%',padding:'10px',border:`2px solid ${pwError?'#f87171':'rgba(255,255,255,0.3)'}`,borderRadius:10,fontSize:22,textAlign:'center',letterSpacing:8,background:'rgba(255,255,255,0.1)',color:'#fff',outline:'none',fontFamily:'inherit'}}
          autoFocus placeholder="••••"
        />
        {pwError&&<div style={{fontSize:11,color:'#fca5a5',fontWeight:700}}>비밀번호가 틀렸습니다</div>}
        <button onClick={checkPw} style={{width:'100%',padding:'10px',borderRadius:10,background:'#3b82f6',color:'#fff',border:'none',fontSize:14,fontWeight:800,cursor:'pointer'}}>확인</button>
      </div>
    </div>
  );

  if(loadState==='loading') return(
    <div style={{height:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:"'Apple SD Gothic Neo',sans-serif",background:'#f1f5f9',gap:16}}>
      <div style={{width:44,height:44,borderRadius:12,background:'linear-gradient(135deg,#3b82f6,#6366f1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,color:'#fff'}}>♡</div>
      <div style={{fontSize:16,fontWeight:800}}>산모신생아 인력 현황판</div>
      <div style={{fontSize:13,color:'#64748b'}}>데이터 불러오는 중...</div>
      <div style={{width:40,height:40,border:'4px solid #e2e8f0',borderTop:'4px solid #3b82f6',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  if(loadState==='error') return(
    <div style={{height:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:"'Apple SD Gothic Neo',sans-serif",background:'#f1f5f9',gap:12}}>
      <div style={{fontSize:32}}>⚠️</div>
      <div style={{fontSize:16,fontWeight:800,color:'#dc2626'}}>데이터 불러오기 실패</div>
      <div style={{fontSize:11,color:'#64748b',maxWidth:300,textAlign:'center',wordBreak:'break-all'}}>{errMsg}</div>
      <button onClick={loadData} style={{padding:'8px 20px',borderRadius:8,background:'#3b82f6',color:'#fff',border:'none',cursor:'pointer',fontSize:13,fontWeight:700}}>다시 시도</button>
    </div>
  );

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100vh',fontFamily:"'Apple SD Gothic Neo','Malgun Gothic',sans-serif",background:'#f1f5f9',color:'#1e293b',overflow:'hidden'}}
      onMouseMove={onGlobalMouseMove} onMouseUp={onGlobalMouseUp}>
      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{display:none}
        *{scrollbar-width:none;-ms-overflow-style:none}
        input,textarea,select{-webkit-user-select:text;user-select:text}
        .wrow:hover .wact{opacity:1!important}
        button{transition:all 0.12s}
        .scroll-y{overflow-y:auto;-webkit-overflow-scrolling:touch}
        .scroll-xy{overflow:auto;-webkit-overflow-scrolling:touch}
      `}</style>

      {/* 경고 토스트 */}
      {warnMsg&&<div style={{position:'fixed',top:50,left:'50%',transform:'translateX(-50%)',background:'#fef3c7',border:'2px solid #f59e0b',borderRadius:10,padding:'10px 18px',fontSize:12,fontWeight:700,color:'#92400e',zIndex:3000,boxShadow:'0 4px 16px rgba(0,0,0,0.15)',display:'flex',alignItems:'center',gap:8}}>
        {warnMsg}<button onClick={()=>setWarnMsg('')} style={{border:'none',background:'none',cursor:'pointer',color:'#92400e',fontSize:16,padding:0,lineHeight:1}}>×</button>
      </div>}

      {/* ★ 드래그 날짜 팝업 */}
      {dragDate&&<div style={{position:'fixed',top:48,left:'50%',transform:'translateX(-50%)',background:'#1e293b',color:'#fff',padding:'6px 16px',borderRadius:20,fontSize:14,fontWeight:800,zIndex:4000,pointerEvents:'none',boxShadow:'0 4px 16px rgba(0,0,0,0.3)',letterSpacing:1}}>
        📅 {dragDate}
        {moveMode?.type==='worker'&&dragTargetWid&&<span style={{marginLeft:8,fontSize:12,color:'#93c5fd'}}>→ {workers.find(w=>w.id===dragTargetWid)?.name||''}</span>}
      </div>}

      {/* HEADER */}
      <header style={{display:'flex',alignItems:'center',gap:8,padding:'0 12px',height:40,background:'#fff',borderBottom:'1px solid #e2e8f0',flexShrink:0,zIndex:20,boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
        <button onClick={()=>setPanelOpen(v=>!v)} style={{width:26,height:26,border:'1px solid #e2e8f0',borderRadius:6,background:panelOpen?'#eff6ff':'#f8fafc',color:panelOpen?'#3b82f6':'#94a3b8',cursor:'pointer',fontSize:13,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700}}>
          {panelOpen?'◀':'▶'}
        </button>
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
        {/* 이동모드 표시 */}
        {moveMode&&<div style={{display:'flex',alignItems:'center',gap:6,padding:'3px 10px',borderRadius:20,background:moveMode.type==='date'?'#eff6ff':'#f0fdf4',border:`1.5px solid ${moveMode.type==='date'?'#93c5fd':'#86efac'}`,flexShrink:0}}>
          <span style={{fontSize:11,fontWeight:700,color:moveMode.type==='date'?'#1d4ed8':'#166534'}}>{moveMode.type==='date'?'📅 날짜이동':'👤 배정이동'} 모드</span>
          <button onClick={()=>{setMoveMode(null);setDragTargetWid(null);}} style={{border:'none',background:'none',cursor:'pointer',color:'#94a3b8',fontSize:14,padding:0,lineHeight:1}}>×</button>
        </div>}
        {saveText&&<span style={{fontSize:10,fontWeight:700,color:saveColor,flexShrink:0,marginLeft:4}}>{saveText}</span>}
        <div style={{display:'flex',gap:3,alignItems:'center',marginLeft:'auto',flexShrink:0,flexWrap:'wrap'}}>
          {Object.entries(STATUS_MAP).map(([k,v])=><span key={k} style={{padding:'1px 5px',borderRadius:20,fontSize:9,fontWeight:700,background:v.bg,border:`1.5px solid ${v.border}`,color:v.text,whiteSpace:'nowrap'}}>{v.label}</span>)}
          <span style={{padding:'1px 5px',borderRadius:20,fontSize:9,fontWeight:700,background:'#fff1f2',border:'1.5px solid #fca5a5',color:'#dc2626',whiteSpace:'nowrap'}}>🚫근무불가</span>
        </div>
      </header>

      {/* BODY */}
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {/* LEFT PANEL */}
        <div style={{width:panelOpen?PANEL_W:0,flexShrink:0,display:'flex',flexDirection:'column',background:'#fff',borderRight:panelOpen?'1px solid #e2e8f0':'none',overflow:'hidden',transition:'width 0.2s ease'}}>

          {/* 일정 상세 */}
          {selSch&&<div className="scroll-y" style={{flexShrink:0,maxHeight:600,borderBottom:'2px solid #e2e8f0',padding:'10px 12px',display:'flex',flexDirection:'column',gap:7}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontWeight:800,fontSize:12}}>일정 상세</span>
                {editMode&&<span style={{fontSize:9,background:'#e0e7ff',color:'#4338ca',padding:'1px 6px',borderRadius:10,fontWeight:700}}>수정중</span>}
              </div>
              <button onClick={()=>{setSelected(null);setEditMode(false);}} style={{border:'none',background:'none',cursor:'pointer',color:'#94a3b8',fontSize:18,padding:0,lineHeight:1}}>×</button>
            </div>
            <div style={{padding:'7px 9px',borderRadius:8,background:STATUS_MAP[selSch.status]?.bg||'#f8fafc',border:`1.5px solid ${STATUS_MAP[selSch.status]?.border||'#94a3b8'}`}}>
              <div style={{fontSize:9,fontWeight:800,color:STATUS_MAP[selSch.status]?.text||'#475569',marginBottom:1}}>{STATUS_MAP[selSch.status]?.label||''}</div>
              {editMode?<input value={selSch.client||''} onChange={e=>updSch({client:e.target.value})} style={iStyle({fontWeight:800,fontSize:13,width:'100%',marginBottom:2})}/>:<div style={{fontWeight:800,fontSize:14}}>{selSch.client}</div>}
              <div style={{fontSize:10,color:'#64748b',marginTop:1}}>{WD[selSch.startWd]?fmtD(WD[selSch.startWd]):'?'} ~ {WD[(selSch.startWd||0)+(selSch.durWd||0)-1]?fmtD(WD[(selSch.startWd||0)+(selSch.durWd||0)-1]):'?'} (평일 {selSch.durWd}일)</div>
            </div>
            <div>
              <div style={{fontSize:9,color:'#94a3b8',fontWeight:700,marginBottom:2}}>배정 관리사</div>
              <select value={selSch.wid||''} onChange={e=>updSch({wid:+e.target.value})} style={{width:'100%',padding:'3px 5px',border:'1px solid #e2e8f0',borderRadius:5,fontSize:11,background:'#f8fafc'}}>
                {workers.filter(w=>w&&!w.inactive).map(w=><option key={w.id} value={w.id}>{w.name} ({w.area})</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:9,color:'#94a3b8',fontWeight:700,marginBottom:2}}>상태</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                {Object.entries(STATUS_MAP).map(([k,v])=><button key={k} onClick={()=>updSch({status:k})} style={{padding:'2px 5px',borderRadius:10,fontSize:9,fontWeight:700,cursor:'pointer',border:`1.5px solid ${v.border}`,background:selSch.status===k?v.border:v.bg,color:selSch.status===k?'#fff':v.text}}>{v.label}</button>)}
              </div>
            </div>
            {/* ★ 출산예정일 + 서비스시작일 */}
            <div style={{display:'flex',gap:4}}>
              <div style={{flex:1}}>
                <div style={{fontSize:9,color:'#94a3b8',fontWeight:700,marginBottom:1}}>출산예정일</div>
                <input type="date" value={selSch.expectedBirth||''} onChange={e=>updSch({expectedBirth:e.target.value})} style={{width:'100%',padding:'2px 3px',border:'1px solid #e2e8f0',borderRadius:5,fontSize:9,background:'#f8fafc'}}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:9,color:'#94a3b8',fontWeight:700,marginBottom:1}}>서비스시작일</div>
                {/* ★ 시작일 변경 시 간트 일정바도 이동 */}
                <input type="date" value={selSch.serviceStart||''} onChange={e=>{
                  const nd=e.target.value;
                  const newWd=dateToWd(nd);
                  updSch({serviceStart:nd,startWd:newWd});
                  setTimeout(()=>scrollToWd(newWd),100);
                }} style={{width:'100%',padding:'2px 3px',border:'1px solid #c7d2fe',borderRadius:5,fontSize:9,background:'#f0f0ff'}}/>
              </div>
            </div>
            <div>
              <div style={{fontSize:9,color:'#94a3b8',fontWeight:700,marginBottom:2}}>서비스 기간 (평일)</div>
              <div style={{display:'flex',gap:3,alignItems:'center'}}>
                {[10,15,20].map(n=><button key={n} onClick={()=>updSch({durWd:n})} style={{padding:'2px 7px',borderRadius:5,fontSize:10,fontWeight:700,cursor:'pointer',border:'1.5px solid #e2e8f0',background:selSch.durWd===n?'#3b82f6':'#f8fafc',color:selSch.durWd===n?'#fff':'#334155'}}>{n}일</button>)}
                <input type="number" value={selSch.durWd||10} onChange={e=>updSch({durWd:Math.max(1,+e.target.value)})} style={{width:40,padding:'2px 3px',border:'1px solid #e2e8f0',borderRadius:5,fontSize:10}}/>
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
              {editMode?<textarea value={selSch.memo||''} onChange={e=>updSch({memo:e.target.value})} style={{width:'100%',height:48,border:'1px solid #c7d2fe',borderRadius:6,padding:'4px 6px',fontSize:10,resize:'none',fontFamily:'inherit',color:'#334155',outline:'none',background:'#f0f0ff',lineHeight:1.5}}/>
              :<div style={{fontSize:10,color:'#475569',padding:'4px 6px',background:'#f8fafc',borderRadius:6,border:'1px solid #f1f5f9',minHeight:28,lineHeight:1.5}}>{selSch.memo||'-'}</div>}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:2}}>
              <button onClick={()=>setEditMode(v=>!v)} style={{padding:'5px',borderRadius:6,fontSize:11,fontWeight:700,cursor:'pointer',border:`1.5px solid ${editMode?'#6366f1':'#c7d2fe'}`,background:editMode?'#6366f1':'#eef2ff',color:editMode?'#fff':'#4338ca'}}>✏️ {editMode?'수정 완료':'정보 수정'}</button>
              <button onClick={()=>setConfirm({msg:`"${selSch.client}"을 배정 대기로 되돌릴까요?`,onOk:()=>sendToWaiting(selSch),okLabel:'되돌리기',okColor:'#f59e0b'})} style={{padding:'5px',borderRadius:6,fontSize:11,fontWeight:700,cursor:'pointer',border:'1.5px solid #fde68a',background:'#fffbeb',color:'#92400e'}}>⏪ 대기로 되돌리기</button>
              <button onClick={()=>setConfirm({msg:`"${selSch.client}" 일정을 삭제할까요?`,onOk:()=>delSch(selSch.id),okLabel:'삭제',okColor:'#dc2626'})} style={{padding:'5px',borderRadius:6,fontSize:11,fontWeight:700,cursor:'pointer',border:'1.5px solid #fca5a5',background:'#fff5f5',color:'#dc2626'}}>🗑️ 일정 삭제</button>
            </div>
          </div>}

          {/* 대기 산모 */}
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minHeight:0}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 11px',background:'#fffbeb',flexShrink:0,borderBottom:'1px solid #fde68a'}}>
              <span style={{fontSize:11,fontWeight:800,color:'#d97706'}}>⏳ 배정 대기 ({waiting.length})</span>
              <button onClick={()=>setAddWaitOpen(v=>!v)} style={{padding:'2px 8px',borderRadius:5,fontSize:10,fontWeight:700,border:'1.5px solid #f59e0b',background:addWaitOpen?'#f59e0b':'#fffbeb',color:addWaitOpen?'#fff':'#92400e',cursor:'pointer'}}>+ 추가</button>
            </div>
            {addWaitOpen&&<div style={{padding:'7px 10px',background:'#fffbeb',borderBottom:'1px solid #fde68a',display:'flex',flexDirection:'column',gap:5,flexShrink:0}}>
              <input placeholder="산모 이름" value={newWait.name} onChange={e=>setNewWait(p=>({...p,name:e.target.value}))} style={{padding:'3px 6px',border:'1px solid #fde68a',borderRadius:5,fontSize:11}}/>
              <div style={{display:'flex',gap:4}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:8,color:'#92400e',marginBottom:1,fontWeight:700}}>출산예정일</div>
                  <input type="date" value={newWait.expectedBirth} onChange={e=>setNewWait(p=>({...p,expectedBirth:e.target.value}))} style={{width:'100%',padding:'3px',border:'1px solid #fde68a',borderRadius:5,fontSize:10}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:8,color:'#92400e',marginBottom:1,fontWeight:700}}>서비스시작일</div>
                  <input type="date" value={newWait.serviceStart} onChange={e=>setNewWait(p=>({...p,serviceStart:e.target.value}))} style={{width:'100%',padding:'3px',border:'1px solid #fde68a',borderRadius:5,fontSize:10}}/>
                </div>
              </div>
              {/* ★ 기간 선택 - 10/15/20/직접입력 */}
              <div>
                <div style={{fontSize:8,color:'#92400e',marginBottom:2,fontWeight:700}}>서비스 기간</div>
                <div style={{display:'flex',gap:3,alignItems:'center'}}>
                  {[10,15,20].map(n=><button key={n} onClick={()=>setNewWait(p=>({...p,durWd:n,customDur:''}))} style={{padding:'2px 7px',borderRadius:5,fontSize:10,fontWeight:700,cursor:'pointer',border:'1.5px solid #fde68a',background:newWait.durWd===n&&!newWait.customDur?'#f59e0b':'#fffbeb',color:newWait.durWd===n&&!newWait.customDur?'#fff':'#92400e'}}>{n}일</button>)}
                  <input type="number" min={1} placeholder="기타" value={newWait.customDur} onChange={e=>{const v=e.target.value;setNewWait(p=>({...p,customDur:v,durWd:v?Math.max(1,+v):p.durWd}));}} style={{width:44,padding:'2px 4px',border:'1px solid #fde68a',borderRadius:5,fontSize:10}}/>
                  {newWait.customDur&&<span style={{fontSize:9,color:'#92400e'}}>일</span>}
                </div>
              </div>
              <input placeholder="메모" value={newWait.memo} onChange={e=>setNewWait(p=>({...p,memo:e.target.value}))} style={{padding:'3px 6px',border:'1px solid #fde68a',borderRadius:5,fontSize:11}}/>
              <div style={{display:'flex',gap:4}}>
                <button onClick={()=>{if(!newWait.name.trim())return;setWait(p=>[...p,{id:_uid++,name:newWait.name.trim(),expectedBirth:newWait.expectedBirth,serviceStart:newWait.serviceStart,durWd:newWait.durWd||10,memo:newWait.memo}]);setNewWait({name:'',expectedBirth:'',serviceStart:'',durWd:10,memo:'',customDur:''});setAddWaitOpen(false);}} style={{flex:1,padding:'4px',borderRadius:5,fontSize:11,fontWeight:700,background:'#f59e0b',color:'#fff',border:'none',cursor:'pointer'}}>저장</button>
                <button onClick={()=>setAddWaitOpen(false)} style={{padding:'4px 8px',borderRadius:5,fontSize:11,background:'#e2e8f0',color:'#475569',border:'none',cursor:'pointer'}}>취소</button>
              </div>
            </div>}
            <div className="scroll-y" style={{flex:1,padding:'5px 7px',minHeight:0}}>
              {waiting.length===0?<div style={{color:'#94a3b8',fontSize:10,textAlign:'center',padding:'16px 0'}}>대기 중인 산모 없음</div>
              :waiting.map(wc=>wc&&(
                <div key={wc.id} draggable onDragStart={e=>onWaitDragStart(e,wc)} style={{padding:'6px 8px',marginBottom:5,borderRadius:7,background:'#fffbeb',border:'1.5px solid #fde68a',cursor:'grab',fontSize:11}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontWeight:700}}>{wc.name}</span>
                    <div style={{display:'flex',gap:4,alignItems:'center'}}>
                      <span style={{fontSize:9,background:'#fef3c7',border:'1px solid #fde68a',borderRadius:10,padding:'1px 5px',color:'#92400e'}}>{wc.durWd}일</span>
                      <button onClick={()=>setConfirm({msg:`"${wc.name}" 대기를 삭제할까요?`,onOk:()=>setWait(p=>p.filter(w=>w&&w.id!==wc.id)),okLabel:'삭제',okColor:'#dc2626'})} style={{border:'none',background:'none',cursor:'pointer',color:'#fca5a5',fontSize:14,padding:0,lineHeight:1}}>×</button>
                    </div>
                  </div>
                  <div style={{fontSize:9,color:'#92400e',marginTop:2}}>
                    예정:{wc.expectedBirth?fmtD(new Date(wc.expectedBirth+'T00:00:00')):'-'}
                    {wc.serviceStart?` 시작:${fmtD(new Date(wc.serviceStart+'T00:00:00'))}`:''}
                    {wc.memo?` · ${wc.memo}`:''}
                  </div>
                  <div style={{fontSize:9,color:'#94a3b8',marginTop:1}}>↔ 관리사 행으로 드래그해서 배정</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* GANTT */}
        <div ref={wrapRef} style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>
          {/* 스크롤바 */}
          <div style={{display:'flex',height:20,flexShrink:0,background:'#f8fafc',borderBottom:'1px solid #e2e8f0',zIndex:16}}>
            <div style={{width:WORKER_W,flexShrink:0,borderRight:'1px solid #e2e8f0'}}/>
            <div style={{flex:1,display:'flex',alignItems:'center',padding:'0 8px'}}>
              <div ref={sbRef}
                onClick={e=>{if(!sbRef.current||sbDrag)return;const r=Math.max(0,Math.min(1,(e.clientX-sbRef.current.getBoundingClientRect().left-thumbW/2)/(ganttVW-thumbW)));const sl=r*(totalW-ganttVW);if(ganttRef.current)ganttRef.current.scrollLeft=sl;if(dateHdrRef.current)dateHdrRef.current.scrollLeft=sl;}}
                style={{flex:1,height:10,background:'#f1f5f9',borderRadius:5,position:'relative',cursor:'pointer',overflow:'hidden'}}>
                {densityMap.map((cnt,i)=>{if(!cnt)return null;const mx=Math.max(...densityMap,1);return<div key={i} style={{position:'absolute',left:`${(i/TWD)*100}%`,bottom:0,width:`${(1/TWD)*100}%`,height:Math.round((cnt/mx)*7),background:'#93c5fd',opacity:0.55,borderRadius:1}}/>;} )}
                <div style={{position:'absolute',left:`${(TDX/TWD)*100}%`,top:0,width:2,height:'100%',background:'#3b82f6',borderRadius:1,zIndex:3}}/>
                <div onMouseDown={e=>{e.preventDefault();setSbDrag(true);setSbSX(e.clientX);setSbSL(ganttRef.current?.scrollLeft||0);}} style={{position:'absolute',left:thumbX,top:1,width:thumbW,height:8,background:'#3b82f6',borderRadius:4,cursor:sbDrag?'grabbing':'grab',zIndex:4,opacity:0.7}}/>
              </div>
            </div>
          </div>

          {/* 날짜 헤더 */}
          <div style={{display:'flex',height:DATE_H,flexShrink:0,zIndex:15,background:'#fff',borderBottom:'1px solid #e2e8f0',boxShadow:'0 2px 4px rgba(0,0,0,0.04)'}}>
            <div style={{width:WORKER_W,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 7px 0 9px',borderRight:'1px solid #e2e8f0',background:'#f8fafc'}}>
              <span style={{fontSize:11,fontWeight:800,color:'#64748b'}}>관리사</span>
              <button onClick={()=>setAddWOpen(v=>!v)} style={{padding:'2px 7px',borderRadius:5,fontSize:10,fontWeight:700,border:'1.5px solid #3b82f6',background:addWOpen?'#3b82f6':'#eff6ff',color:addWOpen?'#fff':'#1d4ed8',cursor:'pointer'}}>+ 추가</button>
            </div>
            <div ref={dateHdrRef} style={{flex:1,overflowX:'hidden',overflowY:'hidden',background:'#f8fafc'}}>
              <div style={{width:TWD*dayW,display:'flex',height:'100%'}}>
                {WD.map((d,i)=>{const isT=i===TDX,lbl=dayLbl(i),isMon=lbl&&lbl.includes('월');return<div key={i} style={{width:dayW,flexShrink:0,textAlign:'center',fontSize:9,fontWeight:isT||isMon?700:400,color:isT?'#2563eb':isMon?'#1e293b':'#94a3b8',borderRight:isMon?'1px solid #e2e8f0':'1px solid #f8fafc',background:isT?'#eff6ff':isMon?'#fafafa':'transparent',display:'flex',alignItems:'center',justifyContent:'center',position:'relative'}}>{lbl||(isT?'▼':'')}{isT&&<div style={{position:'absolute',bottom:0,left:'50%',transform:'translateX(-50%)',width:2,height:3,background:'#3b82f6',borderRadius:1}}/>}</div>;})}
              </div>
            </div>
          </div>

          {addWOpen&&<div style={{padding:'5px 9px',background:'#f0f9ff',borderBottom:'1px solid #bae6fd',display:'flex',gap:5,alignItems:'center',flexShrink:0,flexWrap:'wrap'}}>
            <input placeholder="이름" value={newW.name} onChange={e=>setNewW(p=>({...p,name:e.target.value}))} style={{padding:'3px 6px',border:'1px solid #bae6fd',borderRadius:5,fontSize:11,width:60}}/>
            <input placeholder="지역" value={newW.area} onChange={e=>setNewW(p=>({...p,area:e.target.value}))} style={{padding:'3px 6px',border:'1px solid #bae6fd',borderRadius:5,fontSize:11,width:76}}/>
            <select value={newW.group} onChange={e=>setNewW(p=>({...p,group:+e.target.value}))} style={{padding:'3px',border:'1px solid #bae6fd',borderRadius:5,fontSize:11}}>{GROUPS.map(g=><option key={g.id} value={g.id}>G{g.id} {g.label}</option>)}</select>
            <button onClick={doAddWorker} style={{padding:'3px 9px',borderRadius:5,fontSize:11,fontWeight:700,background:'#3b82f6',color:'#fff',border:'none',cursor:'pointer'}}>저장</button>
            <button onClick={()=>setAddWOpen(false)} style={{padding:'3px 7px',borderRadius:5,fontSize:11,background:'#e2e8f0',color:'#475569',border:'none',cursor:'pointer'}}>취소</button>
          </div>}

          {/* 관리사 + 간트 본문 */}
          <div style={{display:'flex',flex:1,overflow:'hidden',minHeight:0}}>
            {/* 관리사 열 */}
            <div ref={workerRef} onScroll={onWScroll} className="scroll-y" style={{width:WORKER_W,flexShrink:0,background:'#fff',borderRight:'1px solid #e2e8f0',overflowX:'hidden'}}>
              {visibleW.map((w,i)=>{
                if(!w)return null;
                const g=GROUPS.find(g=>g.id===w.group)||GROUPS[0],prev=visibleW[i-1],showSep=!prev||prev.group!==w.group,isEdit=editWId===w.id;
                const isMatch=q&&((w.name||'').toLowerCase().includes(q)||schedules.some(s=>s&&s.wid===w.id&&(s.client||'').toLowerCase().includes(q)));
                const hasUnavail=(unavailMap[w.id]||[]).length>0;
                const isDropTarget=moveMode?.type==='worker'&&dragTargetWid===w.id;
                return(
                  <div key={w.id}>
                    {showSep&&<div style={{height:3,background:`linear-gradient(90deg,${g.accent}55,transparent)`,borderTop:i>0?`2px solid ${g.accent}44`:'none'}}/>}
                    <div className="wrow" style={{height:ROW_H,display:'flex',alignItems:'center',padding:'0 5px',borderBottom:'1px solid #f1f5f9',background:isDropTarget?'#dcfce7':isMatch?'#fef9c3':i%2===0?g.bgRow:g.bgAlt,gap:3,position:'relative',outline:isDropTarget?'2px solid #22c55e':'none'}} onMouseEnter={()=>{setHoverWId(w.id);if(moveMode?.type==='worker'&&dragging)setDragTargetWid(w.id);}} onMouseLeave={()=>setHoverWId(null)}>
                      {isEdit?(
                        <><input value={editWVal.name} onChange={e=>setEditWVal(p=>({...p,name:e.target.value}))} style={{width:42,padding:'2px 3px',border:'1px solid #93c5fd',borderRadius:4,fontSize:10}}/><input value={editWVal.area} onChange={e=>setEditWVal(p=>({...p,area:e.target.value}))} style={{flex:1,padding:'2px 3px',border:'1px solid #93c5fd',borderRadius:4,fontSize:9,minWidth:0}}/><select value={editWVal.group} onChange={e=>setEditWVal(p=>({...p,group:+e.target.value}))} style={{width:22,padding:'1px',border:'1px solid #93c5fd',borderRadius:3,fontSize:9}}>{[1,2,3,4].map(n=><option key={n} value={n}>{n}</option>)}</select><button onClick={()=>saveEdit(w.id)} style={{padding:'1px 3px',borderRadius:3,background:'#3b82f6',color:'#fff',border:'none',cursor:'pointer',fontSize:9}}>✓</button><button onClick={()=>setEditWId(null)} style={{padding:'1px 3px',borderRadius:3,background:'#e2e8f0',color:'#475569',border:'none',cursor:'pointer',fontSize:9}}>✗</button></>
                      ):(
                        <><div style={{width:3,height:16,borderRadius:2,background:g.accent,flexShrink:0}}/>
                        <span style={{fontWeight:700,fontSize:11,whiteSpace:'nowrap'}}>{w.name}</span>
                        {hasUnavail&&<span title="근무불가 일정 있음" style={{fontSize:9,color:'#dc2626',flexShrink:0}}>🚫</span>}
                        <span style={{fontSize:9,color:'#94a3b8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1,minWidth:0}}>{w.area}</span>
                        {hoverWId===w.id&&<div className="wact" style={{display:'flex',gap:2,flexShrink:0}}>
                          <button onClick={()=>{setEditWId(w.id);setEditWVal({name:w.name,area:w.area,group:w.group});}} style={{padding:'1px 3px',border:'1px solid #e2e8f0',borderRadius:3,background:'#fff',cursor:'pointer',fontSize:9,lineHeight:1}}>✏️</button>
                          <button onClick={()=>{setAddUnavailWid(w.id);setNewUnavail({startDate:'',endDate:'',reason:''});}} title="근무불가 추가" style={{padding:'1px 3px',border:'1px solid #fca5a5',borderRadius:3,background:'#fff1f2',cursor:'pointer',fontSize:9,lineHeight:1}}>🚫</button>
                          <button onClick={()=>deleteWorker(w)} style={{padding:'1px 3px',border:'1px solid #fca5a5',borderRadius:3,background:'#fff5f5',cursor:'pointer',fontSize:9,lineHeight:1}}>🗑</button>
                        </div>}</>
                      )}
                    </div>
                  </div>
                );
              })}
              {inactiveW.length>0&&<button onClick={()=>setInactiveOpen(v=>!v)} style={{width:'100%',height:24,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 10px',background:'#f1f5f9',border:'none',borderTop:'2px dashed #cbd5e1',cursor:'pointer',fontSize:10,fontWeight:700,color:'#64748b'}}><span>📁 비활성 ({inactiveW.length}명)</span><span>{inactiveOpen?'▲':'▼'}</span></button>}
            </div>

            {/* 간트 본문 */}
            <div ref={ganttRef} onScroll={onGScroll} onMouseDown={onGanttMouseDown}
              className="scroll-xy" style={{flex:1,position:'relative',cursor:dragging?'grabbing':isPan.current?'grabbing':'grab',userSelect:'none'}}>
              <div style={{width:TWD*dayW,minWidth:'100%'}}>
                {visibleW.map((w,i)=>{
                  if(!w)return null;
                  const g=GROUPS.find(g=>g.id===w.group)||GROUPS[0],prev=visibleW[i-1],showSep=!prev||prev.group!==w.group;
                  const wSchs=schedules.filter(s=>s&&s.wid===w.id);
                  const wUnavail=unavailMap[w.id]||[];
                  const isMatch=q&&((w.name||'').toLowerCase().includes(q)||wSchs.some(s=>s&&(s.client||'').toLowerCase().includes(q)));
                  const isDropTarget=moveMode?.type==='worker'&&dragTargetWid===w.id;
                  return(
                    <div key={w.id}>
                      {showSep&&i>0&&<div style={{height:3,background:`linear-gradient(90deg,${g.accent}44,transparent)`,borderTop:`2px solid ${g.accent}44`}}/>}
                      <div style={{height:ROW_H,position:'relative',borderBottom:'1px solid #f1f5f9',background:isDropTarget?'rgba(34,197,94,0.08)':isMatch?'#fefce8':i%2===0?'#fff':'#fafbfc'}} onDragOver={onRowDragOver} onDrop={e=>onRowDrop(e,w.id)}>
                        <div style={{position:'absolute',left:TDX*dayW+dayW/2,top:0,width:1.5,height:'100%',background:'#bfdbfe',zIndex:1,pointerEvents:'none'}}/>
                        {WD.map((_,di)=>di%5===0?<div key={di} style={{position:'absolute',left:di*dayW,top:0,width:1,height:'100%',background:'#f1f5f9',zIndex:0,pointerEvents:'none'}}/>:null)}
                        {/* 근무불가 빗금 */}
                        {wUnavail.map((u,ui)=>(
                          <div key={ui} className="unavail-block"
                            style={{position:'absolute',left:u.startWd*dayW,top:0,width:(u.endWd-u.startWd)*dayW,height:'100%',background:HATCH,backgroundColor:'rgba(254,226,226,0.35)',zIndex:2,cursor:'default'}}
                            onMouseEnter={e=>setTooltip({x:e.clientX,y:e.clientY,text:`🚫 ${u.reason}`})}
                            onMouseMove={e=>setTooltip({x:e.clientX,y:e.clientY,text:`🚫 ${u.reason}`})}
                            onMouseLeave={()=>setTooltip(null)}
                            onContextMenu={e=>{e.preventDefault();setConfirm({msg:`"${u.reason}" 근무불가를 삭제할까요?`,onOk:()=>delUnavail(u.id),okLabel:'삭제',okColor:'#dc2626'});}}
                          />
                        ))}
                        {/* 일정 블록 */}
                        {wSchs.map(sch=>{
                          if(!sch)return null;
                          const st=STATUS_MAP[sch.status]||STATUS_MAP.hope;
                          const isSel=selected===sch.id,isHit=q&&(sch.client||'').toLowerCase().includes(q),curHit=isHit&&searchHits[searchIdx]?.id===sch.id;
                          // ★ 과거(완료) + 진행중 모두 잠금 - 이동모드를 통해서만 이동 가능
                          const isLocked=(sch.startWd||0)<=TDX;
                          const hasConflict=checkUnavailConflict(w.id,sch.startWd||0,sch.durWd||0);
                          const isMoveModeTarget=moveMode&&moveMode.sid===sch.id;
                          const moveBorderColor=moveMode?.type==='date'?'#3b82f6':'#22c55e';
                          return(
                            <div key={sch.id}
                              className={`sch-block${isMoveModeTarget?' move-mode-block':''}`}
                              onMouseDown={e=>onBlockMouseDown(e,sch)}
                              onContextMenu={e=>onRightClick(e,sch)}
                              style={{
                                position:'absolute',left:(sch.startWd||0)*dayW+1,top:4,
                                height:22,width:Math.max(6,(sch.durWd||1)*dayW-2),
                                borderRadius:5,background:st.bg,
                                border:`${isMoveModeTarget?2.5:curHit?2.5:1.5}px solid ${isMoveModeTarget?moveBorderColor:isSel||isHit?st.text:hasConflict?'#ef4444':st.border}`,
                                cursor:isMoveModeTarget?'grab':isLocked?'pointer':'default',
                                zIndex:isSel||curHit||isMoveModeTarget?5:3,
                                display:'flex',alignItems:'center',paddingLeft:5,overflow:'hidden',
                                boxShadow:isMoveModeTarget?`0 0 0 3px ${moveBorderColor}44`:isSel?`0 0 0 2px ${st.border},0 2px 6px rgba(0,0,0,0.1)`:hasConflict?'0 0 0 1.5px #ef4444':'0 1px 2px rgba(0,0,0,0.05)',
                                opacity:(sch.startWd||0)+(sch.durWd||0)<=TDX?0.65:1,
                              }}>
                              {hasConflict&&<span style={{fontSize:8,marginRight:2,flexShrink:0}}>⚠️</span>}
                              {isLocked&&!isMoveModeTarget&&<span style={{fontSize:7,marginRight:2,flexShrink:0,opacity:0.5}}>🔒</span>}
                              <span style={{fontSize:9,fontWeight:700,color:st.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{sch.client}</span>
                            </div>
                          );
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

      {/* 툴팁 */}
      {tooltip&&<div style={{position:'fixed',left:tooltip.x+12,top:tooltip.y-8,background:'#1e293b',color:'#fff',padding:'4px 10px',borderRadius:6,fontSize:11,fontWeight:600,zIndex:4000,pointerEvents:'none',whiteSpace:'nowrap',boxShadow:'0 2px 8px rgba(0,0,0,0.25)'}}>{tooltip.text}</div>}

      {/* 근무불가 추가 모달 */}
      {addUnavailWid&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.3)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}}>
        <div style={{background:'#fff',borderRadius:12,padding:'20px 22px',boxShadow:'0 8px 24px rgba(0,0,0,0.15)',width:300}}>
          <div style={{fontWeight:800,fontSize:14,marginBottom:12,color:'#dc2626'}}>🚫 근무불가 기간 추가</div>
          <div style={{fontSize:11,color:'#64748b',marginBottom:10}}>{workers.find(w=>w.id===addUnavailWid)?.name} 관리사</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <div><div style={{fontSize:10,color:'#94a3b8',fontWeight:700,marginBottom:2}}>시작일</div><input type="date" value={newUnavail.startDate} onChange={e=>setNewUnavail(p=>({...p,startDate:e.target.value}))} style={{width:'100%',padding:'5px 8px',border:'1px solid #e2e8f0',borderRadius:6,fontSize:12}}/></div>
            <div><div style={{fontSize:10,color:'#94a3b8',fontWeight:700,marginBottom:2}}>종료일</div><input type="date" value={newUnavail.endDate} onChange={e=>setNewUnavail(p=>({...p,endDate:e.target.value}))} style={{width:'100%',padding:'5px 8px',border:'1px solid #e2e8f0',borderRadius:6,fontSize:12}}/></div>
            <div><div style={{fontSize:10,color:'#94a3b8',fontWeight:700,marginBottom:2}}>사유</div><input placeholder="예: 개인휴가, 교육, 병원" value={newUnavail.reason} onChange={e=>setNewUnavail(p=>({...p,reason:e.target.value}))} style={{width:'100%',padding:'5px 8px',border:'1px solid #e2e8f0',borderRadius:6,fontSize:12}}/></div>
          </div>
          {(unavail.filter(u=>u.wid===addUnavailWid)).length>0&&<div style={{marginTop:10,padding:'6px 8px',background:'#fef2f2',borderRadius:6,border:'1px solid #fecaca'}}>
            <div style={{fontSize:9,fontWeight:700,color:'#dc2626',marginBottom:4}}>등록된 근무불가</div>
            {unavail.filter(u=>u.wid===addUnavailWid).map(u=>(
              <div key={u.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:9,color:'#475569',marginBottom:2}}>
                <span>{u.startDate} ~ {u.endDate} · {u.reason}</span>
                <button onClick={()=>delUnavail(u.id)} style={{border:'none',background:'none',cursor:'pointer',color:'#fca5a5',fontSize:12,padding:'0 2px',lineHeight:1}}>×</button>
              </div>
            ))}
          </div>}
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:14}}>
            <button onClick={()=>setAddUnavailWid(null)} style={{padding:'6px 14px',borderRadius:6,border:'1px solid #e2e8f0',background:'#f8fafc',fontSize:12,cursor:'pointer'}}>닫기</button>
            <button onClick={doAddUnavail} style={{padding:'6px 14px',borderRadius:6,border:'none',background:'#dc2626',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>추가</button>
          </div>
        </div>
      </div>}

      {/* ★ 우클릭 메뉴 (이동옵션 + 기간변경) */}
      {ctxMenu&&<div className="ctx-menu" style={{position:'fixed',left:ctxMenu.x,top:ctxMenu.y,background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,boxShadow:'0 4px 16px rgba(0,0,0,0.12)',zIndex:1000,minWidth:160,overflow:'hidden'}}>
        <div style={{padding:'5px 10px',fontSize:9,fontWeight:700,color:'#94a3b8',borderBottom:'1px solid #f1f5f9',background:'#f8fafc'}}>
          {schedules.find(s=>s?.id===ctxMenu.sid)?.client||'일정'}
        </div>
        {/* 이동 옵션 */}
        <button onClick={()=>activateMoveMode('date')} style={{display:'block',width:'100%',padding:'8px 14px',border:'none',background:moveMode?.type==='date'&&moveMode?.sid===ctxMenu.sid?'#eff6ff':'#fff',textAlign:'left',fontSize:12,fontWeight:700,color:'#1d4ed8',cursor:'pointer',borderBottom:'1px solid #f8fafc'}}>
          📅 날짜 이동 {moveMode?.type==='date'&&moveMode?.sid===ctxMenu.sid?'(활성)':''}
        </button>
        <button onClick={()=>activateMoveMode('worker')} style={{display:'block',width:'100%',padding:'8px 14px',border:'none',background:moveMode?.type==='worker'&&moveMode?.sid===ctxMenu.sid?'#f0fdf4':'#fff',textAlign:'left',fontSize:12,fontWeight:700,color:'#166534',cursor:'pointer',borderBottom:'2px solid #e2e8f0'}}>
          👤 배정 이동 {moveMode?.type==='worker'&&moveMode?.sid===ctxMenu.sid?'(활성)':''}
        </button>
        {/* 기간 변경 */}
        <div style={{padding:'4px 10px',fontSize:9,fontWeight:700,color:'#94a3b8'}}>기간 변경 (평일)</div>
        {[10,15,20].map(n=>{const cur=schedules.find(s=>s&&s.id===ctxMenu.sid)?.durWd;return<button key={n} onClick={()=>setDur(ctxMenu.sid,n)} style={{display:'block',width:'100%',padding:'6px 14px',border:'none',background:cur===n?'#eff6ff':'#fff',textAlign:'left',fontSize:12,fontWeight:cur===n?700:400,color:cur===n?'#2563eb':'#334155',cursor:'pointer',borderBottom:'1px solid #f8fafc'}}>{n}일 {cur===n?'✓':''}</button>;})}
        <div style={{borderTop:'1px solid #f1f5f9',display:'flex',gap:4,padding:'5px 8px'}}>
          <input type="number" min={1} placeholder="직접입력" onKeyDown={e=>{if(e.key==='Enter'&&+e.target.value>0)setDur(ctxMenu.sid,+e.target.value);}} style={{flex:1,padding:'3px 5px',border:'1px solid #e2e8f0',borderRadius:5,fontSize:11}}/>
          <button onClick={e=>{const inp=e.currentTarget.previousSibling;if(+inp.value>0)setDur(ctxMenu.sid,+inp.value);}} style={{padding:'3px 7px',borderRadius:5,background:'#3b82f6',color:'#fff',border:'none',fontSize:11,cursor:'pointer'}}>적용</button>
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
