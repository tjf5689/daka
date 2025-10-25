import React, { useEffect, useMemo, useRef, useState } from 'react'

/** ========= 类型 ========= */
type User = { username:string; passHash:string; createdAt:string };
type Slot = { enabled:boolean; start:string; end:string }; // HH:mm
type Task = { id:string; title:string; category:string; slot:Slot };
type Check = { id:string; date:string; taskId:string; inTime:boolean; makeUp:boolean };
type TemplateItem = { title:string; category:string; slot:Slot };
type Prefs = { avatar?:string; motto?:string; requiredWeekdays?:boolean[]; dayTemplate?:TemplateItem[] };

const uid=()=>Math.random().toString(36).slice(2,10);
const today=()=>{ const d=new Date(); const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; };
const toMin=(hhmm:string)=>{ const [h,m]=hhmm.split(':').map(n=>parseInt(n||'0')); return h*60+m; };
const within=(t:string, s:string, e:string)=>{ const T=toMin(t), S=toMin(s), E=toMin(e); return S<=E? (T>=S && T<=E) : (T>=S || T<=E); };
async function sha256(s:string){ if('crypto' in window && 'subtle' in window.crypto){ const enc=new TextEncoder().encode(s); const buf=await window.crypto.subtle.digest('SHA-256',enc); return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join(''); } return btoa(s); }

/** ========= 本地存储 key ========= */
const LS={
  users:'znldk_users_v1',
  session:'znldk_session_v1',
  tasks:(u:string)=>`znldk_${u}_tasks_v1`,
  checks:(u:string)=>`znldk_${u}_checks_v1`,
  prefs:(u:string)=>`znldk_${u}_prefs_v1`,              // 头像 & 激励语 & 周重复 & 日模板
  planned:(u:string)=>`znldk_${u}_planned_v1`,          // { [date]: TemplateItem[] }
};

/** ========= 小工具 ========= */
function useArrayLS<T>(key:string, init:T[]=[]){
  const [v,setV]=useState<T[]>(()=>{ try{ const s=localStorage.getItem(key); return s?JSON.parse(s):init; }catch{return init;} });
  useEffect(()=>{ localStorage.setItem(key, JSON.stringify(v)); },[key,v]); return [v,setV] as const;
}
function useObjLS<T extends object>(key:string, init:T){
  const [v,setV]=useState<T>(()=>{ try{ const s=localStorage.getItem(key); return s?JSON.parse(s):init; }catch{return init;} });
  useEffect(()=>{ localStorage.setItem(key, JSON.stringify(v)); },[key,v]); return [v,setV] as const;
}
const showToast=(msg:string)=>{ const el=document.getElementById('toast'); if(!el) return;
  el.textContent=msg; el.style.display='block'; el.style.opacity='1';
  setTimeout(()=>{ el!.style.transition='opacity .4s'; el!.style.opacity='0'; setTimeout(()=>{ el!.style.display='none'; el!.style.transition=''; },420)},1500);
}

/** ========= 顶层 ========= */
export default function App(){
  const [users,setUsers]   = useArrayLS<User>(LS.users, []);
  const [session,setSession] = useState<string | null>(()=>localStorage.getItem(LS.session));
  const logged   = users.find(u=>u.username===session) || null;

  const [tasks,setTasks]   = useArrayLS<Task>(LS.tasks(logged?.username||'__'), []);
  const [checks,setChecks] = useArrayLS<Check>(LS.checks(logged?.username||'__'), []);
  const [prefs,setPrefs]   = useObjLS<Prefs>(LS.prefs(logged?.username||'__'), { requiredWeekdays:[true,true,true,true,true,false,false], dayTemplate:[], motto:'加油，每天一点点！' });
  const [planned,setPlanned] = useObjLS<Record<string, TemplateItem[]>>(LS.planned(logged?.username||'__'), {});

  const [tab,setTab] = useState<'tasks'|'stats'|'settings'>('tasks');

  /** 账号切换时载入专属数据 */
  useEffect(()=>{ if(!logged) return;
    setTasks(JSON.parse(localStorage.getItem(LS.tasks(logged.username))||'[]'));
    setChecks(JSON.parse(localStorage.getItem(LS.checks(logged.username))||'[]'));
    setPrefs(JSON.parse(localStorage.getItem(LS.prefs(logged.username))||'{}') || {});
    setPlanned(JSON.parse(localStorage.getItem(LS.planned(logged.username))||'{}') || {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[logged?.username]);

  /** 左右滑动切换 tab */
  const x0 = useRef<number|null>(null);
  const onTouchStart=(e:React.TouchEvent)=>{ x0.current = e.touches[0].clientX; };
  const onTouchEnd=(e:React.TouchEvent)=>{ if(x0.current==null) return; const dx = e.changedTouches[0].clientX - x0.current;
    if(Math.abs(dx)>50){
      const order = ['tasks','stats','settings'] as const;
      const idx = order.indexOf(tab);
      if(dx<0 && idx<order.length-1) setTab(order[idx+1]);
      if(dx>0 && idx>0) setTab(order[idx-1]);
    }
    x0.current=null;
  };

  if(!logged) return <Auth users={users} setUsers={setUsers} setSession={(u)=>{ setSession(u); localStorage.setItem(LS.session, u); }} />;

  /** 今日任务 = 普通任务 + 如果今天被规划(plan)的模板任务（临时呈现，不破坏原任务列表） */
  const todayPlan = planned[today()] || [];
  const todayTasks: Task[] = [
    ...tasks,
    ...todayPlan.map((t,i)=>({ id:'P'+i, title:t.title, category:t.category, slot:t.slot }))
  ];

  return (
    <div className="wrap" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="banner">
        <div className="brand">
          <img src={prefs.avatar || '/src/assets/icon.svg'} alt="" />
          <div>
            <h2 className="title">正能量打卡</h2>
            <div className="motto">{prefs.motto || '加油，每天一点点！'}</div>
          </div>
        </div>
        <div className="fab" onClick={()=>window.dispatchEvent(new CustomEvent('ZN_ADD_TASK'))}>＋</div>
      </div>

      {tab==='tasks'    && <TasksPanel tasks={todayTasks} setTasks={setTasks} checks={checks} setChecks={setChecks} />}
      {tab==='stats'    && <StatsPanel tasks={tasks} checks={checks} />}
      {tab==='settings' && <SettingsPanel user={logged} prefs={prefs} setPrefs={setPrefs} planned={planned} setPlanned={setPlanned} />}

      {/* 底部导航 */}
      <div className="tabbar">
        <div className={'tabbtn '+(tab==='tasks'?'active':'')} onClick={()=>setTab('tasks')}>📋<div>任务</div></div>
        <div className={'tabbtn '+(tab==='stats'?'active':'')} onClick={()=>setTab('stats')}>📊<div>统计</div></div>
        <div className={'tabbtn '+(tab==='settings'?'active':'')} onClick={()=>setTab('settings')}>⚙️<div>设置</div></div>
      </div>
    </div>
  );
}

/** ========= 登录/注册 ========= */
function Auth({users,setUsers,setSession}:{users:User[]; setUsers:(v:User[])=>void; setSession:(u:string)=>void}){
  const [mode,setMode]=useState<'login'|'signup'>('signup');
  const [username,setUsername]=useState(''); const [password,setPassword]=useState('');
  const submit=async()=>{ const u=username.trim(), p=password; if(!u||!p){alert('请输入账号和密码');return;} const h=await sha256(p);
    if(mode==='signup'){ if(users.some(x=>x.username===u)){alert('账号已存在');return;}
      setUsers([...users, { username:u, passHash:h, createdAt:new Date().toISOString() }]); setSession(u);
    }else{ const hit=users.find(x=>x.username===u && x.passHash===h); if(!hit){alert('账号或密码错误');return;} setSession(u); }
  };
  return (
    <div className="wrap" style={{marginTop:40}}>
      <div className="card" style={{padding:24, maxWidth:520, margin:'0 auto'}}>
        <h2 style={{marginTop:0}}>正能量打卡 · {mode==='signup'?'注册新账号':'登录'}</h2>
        <div className="row" style={{marginTop:10}}><input placeholder="账号" value={username} onChange={e=>setUsername(e.target.value)}/></div>
        <div className="row" style={{marginTop:10}}><input type="password" placeholder="密码" value={password} onChange={e=>setPassword(e.target.value)}/></div>
        <div className="row" style={{marginTop:16,gap:10}}>
          <button className="btn" onClick={submit}>{mode==='signup'?'注册并登录':'登录'}</button>
          <button className="btn ghost" onClick={()=>setMode(mode==='signup'?'login':'signup')}>
            {mode==='signup'?'我已有账号，去登录':'没有账号？去注册'}
          </button>
        </div>
        <div className="muted" style={{marginTop:10}}>数据仅存本机，密码本地哈希校验。</div>
      </div>
    </div>
  );
}

/** ========= 任务面板（含：打卡/补做成功弹窗、右上角添加） ========= */
function TasksPanel({tasks,setTasks,checks,setChecks}:{tasks:Task[]; setTasks:(v:Task[])=>void; checks:Check[]; setChecks:(v:Check[])=>void}){
  const [showAdd,setShowAdd]=useState(false);
  const [title,setTitle]=useState(''); const [cat,setCat]=useState('学习');
  const [slotEnabled,setSlotEnabled]=useState(false); const [slotStart,setSlotStart]=useState('08:00'); const [slotEnd,setSlotEnd]=useState('22:00');

  useEffect(()=>{ const h=()=>setShowAdd(true); window.addEventListener('ZN_ADD_TASK', h as any); return ()=>window.removeEventListener('ZN_ADD_TASK', h as any); },[]);
  const add=()=>{ if(!title.trim()){alert('请输入任务名称');return;}
    setTasks([{ id:uid(), title:title.trim(), category:cat, slot:{enabled:slotEnabled,start:slotStart,end:slotEnd} }, ...tasks.filter(t=>!t.id.startsWith('P')) ]);
    setTitle(''); setShowAdd(false);
  };

  const doCheck=(taskId:string, date?:string)=>{
    const d = date || today();
    const now = new Date(); const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const tsk = tasks.find(t=>t.id===taskId)!;
    const inTime = tsk.slot.enabled ? (date? (date===today() && within(hhmm, tsk.slot.start, tsk.slot.end)) : within(hhmm, tsk.slot.start, tsk.slot.end)) : true;
    const makeUp = !!date && date!==today();
    setChecks([{ id:uid(), date:d, taskId, inTime, makeUp }, ...checks]);
    showToast(makeUp?'补做成功 ✅':'打卡成功 ✅');
  };

  const last7 = Array.from({length:7}).map((_,i)=>{ const x=new Date(); x.setDate(x.getDate()-i); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; });

  return (
    <div className="grid" style={{marginTop:12}}>
      {/* 今日任务 */}
      <div className="card" style={{padding:'12px 16px'}}>
        <h3>今日任务打卡</h3>
        {tasks.length===0 && <div className="muted">暂无任务，点右上角「＋」添加吧～</div>}
        {tasks.map(t=>(
          <div key={t.id} className="task-row">
            <div className="task-left">
              <div className="task-title">
                <span className="text">{t.title}</span>
                <span className="pill">{t.category}</span>
                {t.id.startsWith('P') && <span className="pill">模板</span>}
              </div>
              <div className="task-sub">
                {t.slot.enabled ? `时间段：${t.slot.start} - ${t.slot.end}` : '任意时间均可完成'}
              </div>
            </div>
            <div className="row">
              <button className="btn" onClick={()=>doCheck(t.id)}>打卡</button>
              <div className="row">
                <select id={'mk_'+t.id} defaultValue={last7[1]}>
                  {last7.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                <button className="btn ghost" onClick={()=>{ const sel=(document.getElementById('mk_'+t.id) as HTMLSelectElement).value; doCheck(t.id, sel); }}>补做</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 添加任务弹层（简单实现：替代弹窗） */}
      {showAdd && (
        <div className="card" style={{padding:16}}>
          <h3>新增正能量任务</h3>
          <div className="row" style={{flexWrap:'wrap'}}>
            <input placeholder="例如：晨读 / 深蹲 / 背单词" value={title} onChange={e=>setTitle(e.target.value)} style={{flex:1,minWidth:220}}/>
            <select value={cat} onChange={e=>setCat(e.target.value)}>
              <option>学习</option><option>健身</option><option>生活</option><option>其他</option>
            </select>
            <label className="row" style={{gap:6}}><input type="checkbox" checked={slotEnabled} onChange={e=>setSlotEnabled(e.target.checked)}/> 固定时间段</label>
            <input type="time" value={slotStart} disabled={!slotEnabled} onChange={e=>setSlotStart(e.target.value)}/>
            <input type="time" value={slotEnd} disabled={!slotEnabled} onChange={e=>setSlotEnd(e.target.value)}/>
            <button className="btn" onClick={add}>保存</button>
            <button className="btn secondary" onClick={()=>setShowAdd(false)}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** ========= 统计面板（坐标抽样，避免拥挤） ========= */
function StatsPanel({tasks,checks}:{tasks:Task[]; checks:Check[]}){

  const byDay = useMemo(()=>{ const m:Record<string,number>={}; for(const c of checks){ m[c.date]=(m[c.date]||0)+1; } return m; },[checks]);
  const perTask = useMemo(()=>{ const m:Record<string,number>={}; for(const c of checks){ m[c.taskId]=(m[c.taskId]||0)+1; } return m; },[checks]);

  const daysBack=(n:number)=>{ const res:string[]=[]; const d=new Date(); for(let i=n-1;i>=0;i--){ const x=new Date(d); x.setDate(x.getDate()-i); res.push(`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`); } return res; };
  const makeSeries=(keys:string[])=>keys.map(k=>({key:k,value:byDay[k]||0}));

  const week   = makeSeries(daysBack(7));
  const month  = makeSeries(daysBack(30));
  const quarter= makeSeries(daysBack(90));

  const taskRows = tasks
    .filter(t=>!t.id.startsWith('P'))
    .map(t=>({title:t.title,count:perTask[t.id]||0,slot:t.slot.enabled?`${t.slot.start}-${t.slot.end}`:'任意'}))
    .sort((a,b)=>b.count-a.count);

  const Line=({series,label}:{series:{key:string;value:number}[];label:string})=>{
    const max=Math.max(1,...series.map(s=>s.value)); const W=640,H=180,P=28,step=(W-2*P)/Math.max(1,series.length-1);
    const d=series.map((s,i)=>{ const x=P+i*step; const y=H-P-(s.value/max)*(H-2*P); return `${i===0?'M':'L'} ${x} ${y}`; }).join(' ');
    const sampled = series.map((s,i)=>({i,label:s.key.slice(5)})).filter((o,i,arr)=>{
      const n = Math.ceil(arr.length/6); // ~6 个标签以内
      return i===0 || i===Math.floor(arr.length/2) || i===arr.length-1 || i%n===0;
    });
    return (
      <div className="card" style={{padding:16}}>
        <div className="row" style={{justifyContent:'space-between'}}><h3 style={{margin:0}}>{label}</h3><div className="muted">总计 {series.reduce((a,b)=>a+b.value,0)}</div></div>
        <svg width={W} height={H} style={{maxWidth:'100%'}}>
          <rect x="0" y="0" width={W} height={H} fill="#fff" rx="12" stroke="#e5e7eb"/>
          <path d={d} fill="none" stroke="#2563eb" strokeWidth="3"/>
          {series.map((s,i)=>{ const x=P+i*step; const y=H-P-(s.value/max)*(H-2*P); return <circle key={i} cx={x} cy={y} r={3} fill="#2563eb"/>; })}
          {sampled.map(o=>{ const x=P+o.i*step; return <text key={'t'+o.i} x={x} y={H-8} fontSize="10" textAnchor="middle" fill="#64748b">{o.label}</text>; })}
        </svg>
      </div>
    );
  };

  return (
    <div className="grid" style={{marginTop:12}}>
      <Line series={week} label="最近 7 天 · 每日完成数"/>
      <Line series={month} label="最近 30 天 · 每日完成数"/>
      <Line series={quarter} label="最近 90 天 · 每日完成数"/>

      <div className="card" style={{padding:16}}>
        <h3>各任务累计完成次数</h3>
        <table>
          <thead><tr><th style={{textAlign:'left'}}>任务</th><th>累计次数</th><th>时间段</th></tr></thead>
          <tbody>
            {taskRows.map((r,i)=>(<tr key={i}><td style={{textAlign:'left'}}>{r.title}</td><td>{r.count}</td><td>{r.slot}</td></tr>))}
            {taskRows.length===0 && <tr><td colSpan={3}><span className="muted">暂无数据</span></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** ========= 设置面板（头像、激励语、模板 & 应用到周/月，并指定必须的星期） ========= */
function SettingsPanel({user,prefs,setPrefs,planned,setPlanned}:{user:{username:string}; prefs:Prefs; setPrefs:(p:Prefs)=>void; planned:Record<string,TemplateItem[]>; setPlanned:(p:Record<string,TemplateItem[]>)=>void}){
  const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];

  /** 头像上传 */
  const pickAvatar=(file:File)=>{
    const rd=new FileReader(); rd.onload=()=>setPrefs({...prefs, avatar: String(rd.result)}); rd.readAsDataURL(file);
  };

  /** 模板：添加/删除 */
  const addTpl=()=>setPrefs({...prefs, dayTemplate:[...(prefs.dayTemplate||[]), {title:'新任务', category:'学习', slot:{enabled:false,start:'08:00',end:'22:00'}}]});
  const delTpl=(idx:number)=>setPrefs({...prefs, dayTemplate:(prefs.dayTemplate||[]).filter((_,i)=>i!==idx)});
  const updTpl=(idx:number, patch:Partial<TemplateItem>)=>{
    const arr=[...(prefs.dayTemplate||[])]; arr[idx]={...arr[idx], ...patch} as TemplateItem; setPrefs({...prefs, dayTemplate:arr});
  };

  /** 将模板应用到未来 N 天，且只在 requiredWeekdays=true 的日期上生效 */
  const applyTemplate=(days:number)=>{
    const req = prefs.requiredWeekdays || [true,true,true,true,true,false,false];
    const tpl = prefs.dayTemplate || [];
    const out = {...planned};
    const d = new Date();
    for(let i=0;i<days;i++){
      const x = new Date(d); x.setDate(d.getDate()+i);
      const w = x.getDay();
      if(!req[w]) continue; // 不是必须完成的星期
      const key = `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
      out[key] = tpl.map(t=>({ ...t })); // 覆盖当天计划
    }
    setPlanned(out);
    showToast(`模板已应用到未来 ${days} 天 ✅`);
  };

  return (
    <div className="grid" style={{marginTop:12}}>
      <div className="card" style={{padding:16}}>
        <h3>个人资料</h3>
        <div className="row" style={{gap:14,alignItems:'center'}}>
          <img src={prefs.avatar || '/src/assets/icon.svg'} style={{width:64,height:64,borderRadius:14,objectFit:'cover',border:'1px solid #e5e7eb'}}/>
          <label className="btn ghost" style={{position:'relative'}}>
            更换头像
            <input type="file" accept="image/*" style={{position:'absolute',inset:0,opacity:0}} onChange={e=>{ const f=e.target.files?.[0]; if(f) pickAvatar(f); }}/>
          </label>
        </div>
        <div className="row" style={{marginTop:12}}>
          <span className="muted">激励语：</span>
          <input style={{flex:1}} value={prefs.motto || ''} onChange={e=>setPrefs({...prefs, motto:e.target.value})} placeholder="写一句对自己说的话吧"/>
        </div>
      </div>

      <div className="card" style={{padding:16}}>
        <h3>日模板（每天要完成的任务样例）</h3>
        <div className="row" style={{marginBottom:8}}>
          <button className="btn ghost" onClick={addTpl}>添加任务到模板</button>
        </div>
        {(prefs.dayTemplate||[]).length===0 && <div className="muted">暂无模板任务，点击上方按钮添加。</div>}
        {(prefs.dayTemplate||[]).map((t,idx)=>(
          <div key={idx} className="task-row">
            <div className="task-left">
              <div className="task-title">
                <input className="text" value={t.title} onChange={e=>updTpl(idx,{title:e.target.value})}/>
                <select value={t.category} onChange={e=>updTpl(idx,{category:e.target.value})}>
                  <option>学习</option><option>健身</option><option>生活</option><option>其他</option>
                </select>
                <label className="row" style={{gap:6}}>
                  <input type="checkbox" checked={t.slot.enabled} onChange={e=>updTpl(idx,{slot:{...t.slot,enabled:e.target.checked}})}/> 固定时间段
                </label>
                <input type="time" value={t.slot.start} disabled={!t.slot.enabled} onChange={e=>updTpl(idx,{slot:{...t.slot,start:e.target.value}})}/>
                <input type="time" value={t.slot.end}   disabled={!t.slot.enabled} onChange={e=>updTpl(idx,{slot:{...t.slot,end:e.target.value}})}/>
              </div>
            </div>
            <div className="row">
              <button className="btn secondary" onClick={()=>delTpl(idx)}>删除</button>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{padding:16}}>
        <h3>重复规则 & 一键应用</h3>
        <div className="row" style={{flexWrap:'wrap',gap:8}}>
          <span className="muted">一周必须完成的星期：</span>
          {(prefs.requiredWeekdays || [true,true,true,true,true,false,false]).map((v,i)=>{
            const arr = [...(prefs.requiredWeekdays || [true,true,true,true,true,false,false])];
            return <label key={i} className="pill" style={{cursor:'pointer'}}>
              <input style={{marginRight:6}} type="checkbox" checked={v} onChange={e=>{ arr[i]=e.target.checked; setPrefs({...prefs, requiredWeekdays:arr}); }}/>
              {weekdays[i]}
            </label>;
          })}
        </div>
        <div className="row" style={{marginTop:12,gap:8}}>
          <button className="btn" onClick={()=>applyTemplate(7)}>应用到未来 7 天</button>
          <button className="btn" onClick={()=>applyTemplate(30)}>应用到未来 30 天</button>
        </div>
        <div className="muted" style={{marginTop:8}}>
          说明：只有勾选的星期会生成当日计划；当天计划在「任务」页会以 <b>模板</b> 标记显示，可正常打卡/补做。
        </div>
      </div>

      <div className="card" style={{padding:16}}>
        <h3>账户</h3>
        <div className="row"><div>当前账号：</div><strong>{user.username}</strong></div>
        <div className="row" style={{marginTop:12,gap:8}}>
          <button className="btn ghost" onClick={()=>{
            const data = JSON.stringify({
              prefs: JSON.parse(localStorage.getItem(LS.prefs(user.username))||'{}'),
              tasks: JSON.parse(localStorage.getItem(LS.tasks(user.username))||'[]'),
              checks: JSON.parse(localStorage.getItem(LS.checks(user.username))||'[]'),
              planned: JSON.parse(localStorage.getItem(LS.planned(user.username))||'{}'),
            }, null, 2);
            const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));
            a.download=`正能量打卡-备份-${user.username}.json`; a.click();
          }}>导出备份</button>

          <label className="btn ghost" style={{position:'relative'}}>
            导入备份
            <input type="file" accept="application/json" style={{position:'absolute',inset:0,opacity:0}}
                   onChange={e=>{
                     const f=e.target.files?.[0]; if(!f) return;
                     const rd=new FileReader(); rd.onload=()=>{ try{
                       const obj=JSON.parse(String(rd.result||'{}'));
                       if(obj.prefs)   localStorage.setItem(LS.prefs(user.username), JSON.stringify(obj.prefs));
                       if(obj.tasks)   localStorage.setItem(LS.tasks(user.username), JSON.stringify(obj.tasks));
                       if(obj.checks)  localStorage.setItem(LS.checks(user.username), JSON.stringify(obj.checks));
                       if(obj.planned) localStorage.setItem(LS.planned(user.username), JSON.stringify(obj.planned));
                       alert('导入成功'); location.reload();
                     }catch{ alert('导入失败'); } };
                     rd.readAsText(f);
                   }}/>
          </label>

          <button className="btn secondary" onClick={()=>{ localStorage.removeItem(LS.session); location.reload(); }}>退出登录</button>
        </div>
      </div>
    </div>
  );
}
