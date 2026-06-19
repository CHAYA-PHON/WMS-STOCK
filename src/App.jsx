import { useState, useEffect, useContext, createContext, useRef } from "react";
import * as XLSX from "xlsx";

// ─── Context & Constants ──────────────────────────────────────────────────────
const AppContext = createContext(null);
const API_URL_KEY = "wms_api_url";
const USER_KEY = "wms_user";
const DEFAULT_API = "https://script.google.com/macros/s/AKfycbye_UVkaqYnvuZNkW7E8o0VNzqeSN4uhJ0GE_lRVnPBbBJ-s3-mdP4Ixh1pkvxyuHYbPw/exec";

// ─── Theme ────────────────────────────────────────────────────────────────────
const C = {
  navy:"#0f2d5c", navyDark:"#091e42", navyLight:"#1a4a8a",
  blue:"#1e6fd9", blueLight:"#e8f0fd", blueMid:"#3a8aef",
  white:"#ffffff", offWhite:"#f5f7fc",
  gray50:"#f8f9fa", gray100:"#e9ecef", gray300:"#ced4da",
  gray500:"#6c757d", gray700:"#495057", gray900:"#212529",
  success:"#198754", successLight:"#d1e7dd",
  warning:"#fd7e14", warningLight:"#fff3cd",
  danger:"#dc3545", dangerLight:"#f8d7da",
  info:"#0891b2", infoLight:"#cff4fc",
  purple:"#7c3aed", purpleLight:"#ede9fe",
  teal:"#0f766e", tealLight:"#ccfbf1",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const stripSpaces = (s) => (s||"").replace(/\s+/g,"").trim();
const nowTH = () => new Date().toLocaleString("th-TH",{hour12:false});
const genKey = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}`;

// ─── Fuzzy Matching (Levenshtein Distance) ────────────────────────────────────
const levenshtein = (a, b) => {
  const arr = [];
  for (let i = 0; i <= b.length; i++) arr[i] = [i];
  for (let j = 0; j <= a.length; j++) arr[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      arr[i][j] = Math.min(arr[i][j - 1] + 1, arr[i - 1][j] + 1, arr[i - 1][j - 1] + cost);
    }
  }
  return arr[b.length][a.length];
};

const findSimilarPartNo = (input, products, maxDistance = 3) => {
  const cleaned = stripSpaces(input).toUpperCase();
  if (cleaned.length === 0) return [];
  
  const scored = products
    .map(p => {
      const partNo = stripSpaces(p["Part No."]).toUpperCase();
      // Exact match (highest priority)
      if (partNo === cleaned) return { product: p, score: 0, type: "exact" };
      // Starts with match
      if (partNo.startsWith(cleaned) || cleaned.startsWith(partNo)) return { product: p, score: 1, type: "startswith" };
      // Contains match
      if (partNo.includes(cleaned) || cleaned.includes(partNo)) return { product: p, score: 2, type: "contains" };
      // Levenshtein distance
      const dist = levenshtein(cleaned, partNo);
      if (dist <= maxDistance) return { product: p, score: 3 + dist, type: "fuzzy" };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score);
  
  return scored.slice(0, 10).map(s => s.product); // Return top 10 matches
};

const apiPost = async (apiUrl, payload) => {
  try {
    await fetch(apiUrl, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload), mode:"no-cors" });
    return true;
  } catch { return false; }
};

const toast = (msg, type="info", duration=3200) => {
  document.querySelectorAll(".wms-toast").forEach(e=>e.remove());
  const el = document.createElement("div");
  el.className = "wms-toast";
  const bg = {success:C.success,error:C.danger,warning:C.warning,info:C.blue}[type]||C.blue;
  const icons = {success:"✅",error:"❌",warning:"⚠️",info:"ℹ️"};
  Object.assign(el.style, {
    position:"fixed",bottom:"76px",left:"50%",transform:"translateX(-50%)",
    background:bg,color:"#fff",padding:"11px 18px",borderRadius:"10px",
    fontSize:"13px",zIndex:"9999",maxWidth:"340px",width:"90%",textAlign:"center",
    fontWeight:"600",boxShadow:"0 4px 16px rgba(0,0,0,0.25)",opacity:"1",
    transition:"opacity 0.3s",lineHeight:"1.5",
  });
  el.textContent = `${icons[type]||""} ${msg}`;
  document.body.appendChild(el);
  setTimeout(()=>{ el.style.opacity="0"; setTimeout(()=>el.remove(),300); },duration);
};

const confirmModal = (title, body, onOk, onCancel) => {
  const ov = document.createElement("div");
  Object.assign(ov.style,{position:"fixed",inset:"0",background:"rgba(0,0,0,0.6)",zIndex:"10000",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"});
  ov.innerHTML=`<div style="background:#fff;border-radius:16px;padding:22px;max-width:340px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.2)">
    <div style="font-size:17px;font-weight:700;color:${C.navy};margin-bottom:10px">${title}</div>
    <div style="font-size:14px;color:${C.gray700};line-height:1.6;margin-bottom:20px">${body}</div>
    <div style="display:flex;gap:10px">
      <button id="c-cancel" style="flex:1;padding:11px;border:1.5px solid ${C.gray300};border-radius:9px;background:#fff;font-size:14px;cursor:pointer;font-weight:600;color:${C.gray700}">ยกเลิก</button>
      <button id="c-ok" style="flex:1;padding:11px;border:none;border-radius:9px;background:${C.blue};color:#fff;font-size:14px;cursor:pointer;font-weight:700">ยืนยัน</button>
    </div></div>`;
  document.body.appendChild(ov);
  ov.querySelector("#c-ok").onclick=()=>{ov.remove();onOk&&onOk();};
  ov.querySelector("#c-cancel").onclick=()=>{ov.remove();onCancel&&onCancel();};
};

// ─── Shared UI ────────────────────────────────────────────────────────────────
const Card=({children,style={},onClick})=>(
  <div onClick={onClick} style={{background:C.white,borderRadius:"13px",border:`1px solid ${C.gray100}`,padding:"15px",marginBottom:"11px",boxShadow:"0 1px 5px rgba(0,0,0,0.05)",cursor:onClick?"pointer":"default",...style}}>{children}</div>
);
const Btn=({children,onClick,color=C.blue,tc=C.white,style={},disabled=false,sm=false})=>(
  <button onClick={onClick} disabled={disabled} style={{background:disabled?C.gray300:color,color:disabled?C.gray500:tc,border:"none",borderRadius:"9px",padding:sm?"9px 14px":"13px 20px",fontSize:sm?"13px":"15px",fontWeight:"700",cursor:disabled?"not-allowed":"pointer",width:"100%",transition:"opacity .15s",...style}}>{children}</button>
);
const Field=({label,value,onChange,placeholder,type="text",style={},readOnly=false})=>(
  <div style={{marginBottom:"12px"}}>
    {label&&<div style={{fontSize:"11px",fontWeight:"700",color:C.gray500,marginBottom:"5px",textTransform:"uppercase",letterSpacing:"0.6px"}}>{label}</div>}
    <input type={type} value={value} onChange={e=>onChange&&onChange(e.target.value)} placeholder={placeholder} readOnly={readOnly}
      style={{width:"100%",padding:"11px 13px",borderRadius:"9px",border:`1.5px solid ${readOnly?C.gray100:C.gray300}`,fontSize:"14px",color:C.gray900,background:readOnly?C.gray50:C.white,boxSizing:"border-box",...style}}/>
  </div>
);
const Sel=({label,value,onChange,options,placeholder="-- เลือก --"})=>(
  <div style={{marginBottom:"12px"}}>
    {label&&<div style={{fontSize:"11px",fontWeight:"700",color:C.gray500,marginBottom:"5px",textTransform:"uppercase",letterSpacing:"0.6px"}}>{label}</div>}
    <select value={value} onChange={e=>onChange(e.target.value)} style={{width:"100%",padding:"11px 13px",borderRadius:"9px",border:`1.5px solid ${C.gray300}`,fontSize:"14px",color:C.gray900,background:C.white,appearance:"none"}}>
      <option value="">{placeholder}</option>
      {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
    </select>
  </div>
);
const Badge=({label,color=C.blue,bg=C.blueLight,style={}})=>(
  <span style={{fontSize:"10px",fontWeight:"700",padding:"3px 9px",borderRadius:"99px",background:bg,color,letterSpacing:"0.3px",...style}}>{label}</span>
);
const Row=({label,value,border=true})=>(
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:border?`1px solid ${C.gray100}`:"none"}}>
    <span style={{fontSize:"12px",color:C.gray500}}>{label}</span>
    <span style={{fontSize:"13px",fontWeight:"600",color:C.gray900,maxWidth:"65%",textAlign:"right",wordBreak:"break-all"}}>{value||"-"}</span>
  </div>
);
const Empty=({icon="📦",title,sub})=>(
  <div style={{textAlign:"center",padding:"40px 20px",color:C.gray500}}>
    <div style={{fontSize:"42px",marginBottom:"10px"}}>{icon}</div>
    <div style={{fontSize:"15px",fontWeight:"700",color:C.gray700}}>{title}</div>
    {sub&&<div style={{fontSize:"12px",marginTop:"5px"}}>{sub}</div>}
  </div>
);
const InfoBox=({children,color=C.blue,bg=C.blueLight})=>(
  <div style={{background:bg,border:`1px solid ${color}22`,borderRadius:"10px",padding:"12px 14px",marginBottom:"12px",fontSize:"13px",color,lineHeight:"1.6"}}>{children}</div>
);

// ─── Part Select Drawer ───────────────────────────────────────────────────────
const PartDrawer=({matches,onSelect,onClose})=>(
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:9000,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
    <div style={{background:C.white,borderRadius:"20px 20px 0 0",padding:"20px",maxHeight:"65vh",overflowY:"auto"}}>
      <div style={{width:"36px",height:"4px",background:C.gray300,borderRadius:"2px",margin:"0 auto 16px"}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
        <div style={{fontSize:"16px",fontWeight:"700",color:C.navy}}>พบ {matches.length} รายการที่ตรงกัน</div>
        <button onClick={onClose} style={{background:C.gray100,border:"none",borderRadius:"50%",width:"32px",height:"32px",cursor:"pointer",fontSize:"16px"}}>✕</button>
      </div>
      <div style={{fontSize:"12px",color:C.gray500,marginBottom:"12px"}}>เลือกรายการที่ต้องการ</div>
      {matches.map((m,i)=>(
        <div key={i} onClick={()=>onSelect(m)} style={{padding:"13px",borderRadius:"11px",border:`1.5px solid ${C.gray100}`,marginBottom:"8px",cursor:"pointer",background:C.gray50}}>
          <div style={{fontWeight:"700",color:C.navy,fontSize:"15px"}}>{m["Part No."]}</div>
          <div style={{fontSize:"13px",color:C.gray700,marginTop:"3px"}}>{m["Part Name"]}</div>
          <div style={{display:"flex",gap:"6px",marginTop:"6px",flexWrap:"wrap"}}>
            <Badge label={`SAP: ${m["SAP No."]||"-"}`}/>
            <Badge label={m["Package"]||"-"} color={C.navyLight} bg="rgba(30,111,217,0.1)"/>
            {m["BD/BZ/CP"]&&<Badge label={m["BD/BZ/CP"]} color={C.purple} bg={C.purpleLight}/>}
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ─── QR Scanner ───────────────────────────────────────────────────────────────
const QRScanner=({onScan,label="สแกน QR Code",products=[]})=>{
  const [manual,setManual]=useState("");
  const [scanning,setScanning]=useState(false);
  const [suggestions,setSuggestions]=useState([]);
  const scanRef=useRef(null);
  const divId=useRef("qr-"+Math.random().toString(36).substr(2,8));
  
  const updateSuggestions=(val)=>{
    setManual(val);
    if(val.trim().length>=2&&products.length>0){
      const matches=findSimilarPartNo(val,products,3);
      setSuggestions(matches.slice(0,5));
    } else {
      setSuggestions([]);
    }
  };
  
  useEffect(()=>{
    if(scanning&&window.Html5Qrcode){
      const s=new window.Html5Qrcode(divId.current);
      scanRef.current=s;
      s.start({facingMode:"environment"},{fps:12,qrbox:220},
        (text)=>{s.stop();setScanning(false);onScan(stripSpaces(text));setSuggestions([]);setManual("");},
        ()=>{}
      ).catch(()=>{toast("ไม่สามารถเข้าถึงกล้องได้","error");setScanning(false);});
      return()=>{s.stop().catch(()=>{});};
    }
  },[scanning]);
  
  return(
    <div>
      <div style={{fontSize:"12px",fontWeight:"700",color:C.gray500,marginBottom:"8px",textTransform:"uppercase",letterSpacing:"0.5px"}}>{label}</div>
      {scanning?<div><div id={divId.current} style={{borderRadius:"10px",overflow:"hidden",marginBottom:"10px"}}/><Btn onClick={()=>setScanning(false)} color={C.gray500} sm>⏹ หยุดสแกน</Btn></div>:
      <div>
        <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
          <input value={manual} onChange={e=>updateSuggestions(e.target.value)} placeholder="พิมพ์ / สแกน..."
            style={{flex:1,padding:"11px 13px",borderRadius:"9px",border:`1.5px solid ${C.gray300}`,fontSize:"14px"}}
            onKeyDown={e=>{if(e.key==="Enter"&&manual.trim()){onScan(stripSpaces(manual));setSuggestions([]);setManual("");}}}/>
          <button onClick={()=>{if(manual.trim()){onScan(stripSpaces(manual));setSuggestions([]);setManual("");}}}
            style={{padding:"11px 14px",background:C.navy,color:C.white,border:"none",borderRadius:"9px",fontWeight:"700",fontSize:"13px",cursor:"pointer",whiteSpace:"nowrap"}}>ตกลง</button>
        </div>
        {suggestions.length>0&&(
          <div style={{background:C.blueLight,borderRadius:"9px",padding:"10px",marginBottom:"10px",maxHeight:"200px",overflowY:"auto"}}>
            <div style={{fontSize:"11px",fontWeight:"700",color:C.navy,marginBottom:"8px"}}>💡 {suggestions.length} รายการที่ใกล้เคียง:</div>
            {suggestions.map((s,i)=>(
              <div key={i} onClick={()=>{onScan(stripSpaces(s["Part No."]));setSuggestions([]);setManual("");}} 
                style={{padding:"8px",background:C.white,borderRadius:"7px",marginBottom:"6px",cursor:"pointer",border:`1px solid ${C.blue}22`,transition:"all .15s"}}>
                <div style={{fontSize:"12px",fontWeight:"700",color:C.navy}}>{s["Part No."]}</div>
                <div style={{fontSize:"11px",color:C.gray600,marginTop:"2px"}}>{s["Part Name"]}</div>
              </div>
            ))}
          </div>
        )}
        <button onClick={()=>setScanning(!scanning)}
          style={{width:"100%",padding:"10px",background:scanning?C.dangerLight:C.blueLight,color:scanning?C.danger:C.blue,border:`1.5px solid ${scanning?C.danger:C.blue}22`,borderRadius:"9px",fontSize:"13px",fontWeight:"700",cursor:"pointer"}}>
          {scanning?"📷 กำลังสแกน...":"📷 เปิดกล้องสแกน"}
        </button>
      </div>}
    </div>
  );
};

// ─── Demo Data Store ──────────────────────────────────────────────────────────
const DEMO_PRODUCTS = [
  {"BD/BZ/CP":"BD","Custumer":"Toyota","SAP No.":"SAP-1001","Part No.":"1118337001 CTC","Part Name":"Connector Type C Blue","Old Stock":200,"IN":48,"OUT":36,"UP_DATE":"2025-06-15","Balance":212,"Full Box":12,"Package":"Box A","Type & Size":"Box 30x20x15"},
  {"BD/BZ/CP":"BD","Custumer":"Toyota","SAP No.":"SAP-1002","Part No.":"1118337001 SCT","Part Name":"Connector Type C Silver","Old Stock":100,"IN":24,"OUT":12,"UP_DATE":"2025-06-14","Balance":112,"Full Box":24,"Package":"Box B","Type & Size":"Box 25x15x10"},
  {"BD/BZ/CP":"BZ","Custumer":"Honda","SAP No.":"SAP-2001","Part No.":"2234567890","Part Name":"Cable USB-C 1m Black","Old Stock":500,"IN":100,"OUT":75,"UP_DATE":"2025-06-15","Balance":525,"Full Box":50,"Package":"Pallet","Type & Size":"Pallet Small"},
  {"BD/BZ/CP":"CP","Custumer":"Nissan","SAP No.":"SAP-3001","Part No.":"3345678901","Part Name":"Relay Module A","Old Stock":80,"IN":20,"OUT":15,"UP_DATE":"2025-06-13","Balance":85,"Full Box":10,"Package":"Box C","Type & Size":"Box 20x20x20"},
  {"BD/BZ/CP":"BD","Custumer":"Toyota","SAP No.":"SAP-1003","Part No.":"1118337001A CTC","Part Name":"Connector Type C+ Blue","Old Stock":50,"IN":0,"OUT":10,"UP_DATE":"2025-06-12","Balance":40,"Full Box":12,"Package":"Box A","Type & Size":"Box 30x20x15"},
];
const DEMO_EMPLOYEES = [
  {"Employee ID":"EMP001","Full Name":"สมชาย ใจดี","Department":"Warehouse","PIN":"123456","Role":"admin","Shift_work":"A","Shift_DAY&Nigth":"Day"},
  {"Employee ID":"EMP002","Full Name":"สมหญิง รักงาน","Department":"Receiving","PIN":"654321","Role":"worker","Shift_work":"B","Shift_DAY&Nigth":"Night"},
  {"Employee ID":"EMP003","Full Name":"มานะ ขยันดี","Department":"Shipping","PIN":"111222","Role":"worker","Shift_work":"A","Shift_DAY&Nigth":"Day"},
];
const DEMO_LOCATIONS = [
  {"Custumer":"Toyota","SAP No.":"SAP-1001","Part No.":"1118337001 CTC","Part Name":"Connector Type C Blue","location":"A-01-01","IN":48,"Out":36,"Balance":12},
  {"Custumer":"Honda","SAP No.":"SAP-2001","Part No.":"2234567890","Part Name":"Cable USB-C 1m Black","location":"B-02-03","IN":100,"Out":75,"Balance":25},
  {"Custumer":"Toyota","SAP No.":"SAP-1002","Part No.":"1118337001 SCT","Part Name":"Connector Type C Silver","location":"A-01-02","IN":24,"Out":12,"Balance":12},
  {"Custumer":"Nissan","SAP No.":"SAP-3001","Part No.":"3345678901","Part Name":"Relay Module A","location":"C-03-01","IN":20,"Out":15,"Balance":5},
];
const DEMO_TRANSACTIONS_IN = [
  {"Type_IN":"Normal","LABAL_KEY":"KEY-20250615-001","LABAL_Scan":"BOX-001","Part_No._Scan":"1118337001 CTC","Part No.":"1118337001 CTC","Q'ty":12,"By":"EMP001","Shift":"A","Day_Time":"2025-06-15 08:30","q'ty_Box":12,"Package Type & Size":"Box A","Location":"A-01-01"},
  {"Type_IN":"Normal","LABAL_KEY":"KEY-20250615-002","LABAL_Scan":"BOX-002","Part_No._Scan":"2234567890","Part No.":"2234567890","Q'ty":50,"By":"EMP002","Shift":"B","Day_Time":"2025-06-15 10:00","q'ty_Box":50,"Package Type & Size":"Pallet","Location":"B-02-03"},
];
const DEMO_TRANSACTIONS_OUT = [
  {"Type_OUT":"Normal","LABAL_KEY":"KEY-OUT-001","LABAL_Scan":"BOX-001","Part_No._Scan":"1118337001 CTC","Part No.":"1118337001 CTC","Q'ty":12,"By":"EMP001","Shift":"A","Day_Time":"2025-06-15 13:00","q'ty_Box":12,"Package Type & Size":"Box A","Location":"A-01-01"},
];
const DEMO_SCHEDULE = [
  {"Key_ID":"SCH-001","Shift_work":"A","Shift_DAY&Nigth":"Day","start":"06:00","end":"18:00","approve_By":"EMP001","approve_day_time":"2025-06-01 09:00"},
  {"Key_ID":"SCH-002","Shift_work":"B","Shift_DAY&Nigth":"Night","start":"18:00","end":"06:00","approve_By":"EMP001","approve_day_time":"2025-06-01 09:00"},
  {"Key_ID":"SCH-003","Shift_work":"C","Shift_DAY&Nigth":"Day","start":"08:00","end":"17:00","approve_By":"EMP001","approve_day_time":"2025-06-01 09:00"},
];

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN: LOGIN
// ═══════════════════════════════════════════════════════════════════════════════
const LoginScreen=()=>{
  const {login}=useContext(AppContext);
  const [empId,setEmpId]=useState("");
  const [pin,setPin]=useState("");
  const [loading,setLoading]=useState(false);
  const handleLogin=async()=>{
    if(!empId||pin.length!==6){toast("กรุณากรอก Employee ID และ PIN 6 หลัก","warning");return;}
    setLoading(true);
    const found=DEMO_EMPLOYEES.find(u=>u["Employee ID"]===empId&&u["PIN"]===pin);
    if(found){login(found);toast(`ยินดีต้อนรับ ${found["Full Name"]}`,"success");}
    else toast("Employee ID หรือ PIN ไม่ถูกต้อง","error");
    setLoading(false);
  };
  return(
    <div style={{minHeight:"100vh",background:`linear-gradient(155deg,${C.navyDark} 0%,${C.navyLight} 100%)`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <div style={{width:"100%",maxWidth:"380px"}}>
        <div style={{textAlign:"center",marginBottom:"36px"}}>
          <div style={{width:"76px",height:"76px",background:"rgba(255,255,255,0.12)",borderRadius:"20px",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:"38px",border:"1.5px solid rgba(255,255,255,0.2)"}}>🏭</div>
          <div style={{fontSize:"26px",fontWeight:"800",color:C.white,letterSpacing:"-0.5px"}}>WMS คลังสินค้า</div>
          <div style={{fontSize:"13px",color:"rgba(255,255,255,0.55)",marginTop:"5px"}}>Warehouse Management System v2.1</div>
        </div>
        <div style={{background:"rgba(255,255,255,0.09)",backdropFilter:"blur(12px)",borderRadius:"18px",padding:"26px",border:"1px solid rgba(255,255,255,0.15)"}}>
          {[{label:"Employee ID",val:empId,set:setEmpId,ph:"เช่น EMP001",t:"text"},{label:"PIN (6 หลัก)",val:pin,set:(v)=>setPin(v.replace(/\D/g,"").slice(0,6)),ph:"••••••",t:"password"}].map(f=>(
            <div key={f.label} style={{marginBottom:"16px"}}>
              <div style={{fontSize:"11px",fontWeight:"700",color:"rgba(255,255,255,0.65)",marginBottom:"6px",textTransform:"uppercase",letterSpacing:"0.6px"}}>{f.label}</div>
              <input type={f.t} value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph}
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                style={{width:"100%",padding:"13px 15px",borderRadius:"10px",border:"1.5px solid rgba(255,255,255,0.2)",fontSize:"15px",background:"rgba(255,255,255,0.1)",color:C.white,boxSizing:"border-box",letterSpacing:f.t==="password"?"8px":"normal"}}/>
            </div>
          ))}
          <button onClick={handleLogin} disabled={loading} style={{width:"100%",padding:"14px",borderRadius:"11px",background:C.blue,color:C.white,border:"none",fontSize:"16px",fontWeight:"800",cursor:"pointer",marginTop:"6px",opacity:loading?.7:1}}>
            {loading?"กำลังตรวจสอบ...":"เข้าสู่ระบบ"}
          </button>
        </div>
        <div style={{textAlign:"center",marginTop:"14px",fontSize:"12px",color:"rgba(255,255,255,0.35)"}}>Demo: EMP001 / 123456 (Admin)</div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN: DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
const DashboardScreen=()=>{
  const {user,transIn,transOut,products}=useContext(AppContext);
  const today=new Date().toISOString().slice(0,10);
  const todayIn=transIn.filter(t=>t["Day_Time"]?.startsWith(today));
  const todayOut=transOut.filter(t=>t["Day_Time"]?.startsWith(today));
  const totalInQty=todayIn.reduce((s,t)=>s+(t["Q'ty"]||0),0);
  const totalOutQty=todayOut.reduce((s,t)=>s+(t["Q'ty"]||0),0);
  const allRecent=[...transIn.map(t=>({...t,_type:"IN"})),...transOut.map(t=>({...t,_type:"OUT"}))].sort((a,b)=>(b["Day_Time"]||"").localeCompare(a["Day_Time"]||"")).slice(0,8);
  const stats=[
    {label:"รับเข้าวันนี้",val:totalInQty,unit:"ชิ้น",icon:"📥",col:C.success,bg:C.successLight},
    {label:"โอนออกวันนี้",val:totalOutQty,unit:"ชิ้น",icon:"📤",col:C.danger,bg:C.dangerLight},
    {label:"รายการสินค้า",val:products.length,unit:"SKU",icon:"🗂️",col:C.blue,bg:C.blueLight},
    {label:"TX วันนี้",val:todayIn.length+todayOut.length,unit:"รายการ",icon:"📋",col:C.purple,bg:C.purpleLight},
  ];
  return(
    <div>
      <div style={{background:`linear-gradient(135deg,${C.navyDark},${C.navyLight})`,padding:"20px 16px 30px"}}>
        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.55)"}}>ยินดีต้อนรับกลับ</div>
        <div style={{fontSize:"21px",fontWeight:"800",color:C.white,marginTop:"2px"}}>{user?.["Full Name"]}</div>
        <div style={{display:"flex",gap:"8px",marginTop:"6px",flexWrap:"wrap"}}>
          <Badge label={user?.["Department"]} color={C.white} bg="rgba(255,255,255,0.15)"/>
          <Badge label={`กะ ${user?.["Shift_work"]} (${user?.["Shift_DAY&Nigth"]})`} color={C.white} bg="rgba(255,255,255,0.15)"/>
          <Badge label={user?.["Role"]==="admin"?"Admin":"Worker"} color={C.navy} bg="rgba(255,255,255,0.9)"/>
        </div>
        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.45)",marginTop:"8px"}}>{new Date().toLocaleDateString("th-TH",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
      </div>
      <div style={{padding:"0 11px",marginTop:"-16px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"11px"}}>
          {stats.map((s,i)=>(
            <div key={i} style={{background:C.white,borderRadius:"13px",padding:"14px",border:`1px solid ${C.gray100}`,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
              <div style={{fontSize:"22px",marginBottom:"6px"}}>{s.icon}</div>
              <div style={{fontSize:"24px",fontWeight:"800",color:s.col}}>{s.val.toLocaleString()}</div>
              <div style={{fontSize:"11px",color:C.gray500,marginTop:"1px"}}>{s.unit}</div>
              <div style={{fontSize:"11px",fontWeight:"700",color:C.gray700,marginTop:"5px"}}>{s.label}</div>
            </div>
          ))}
        </div>
        <Card>
          <div style={{fontSize:"14px",fontWeight:"700",color:C.navy,marginBottom:"12px"}}>🕐 รายการล่าสุด</div>
          {allRecent.length===0?<Empty icon="📋" title="ยังไม่มีรายการ"/>:allRecent.map((r,i)=>{
            const isIN=r._type==="IN";
            return(
              <div key={i} style={{display:"flex",alignItems:"center",gap:"11px",padding:"9px 0",borderBottom:i<allRecent.length-1?`1px solid ${C.gray100}`:"none"}}>
                <div style={{width:"34px",height:"34px",borderRadius:"8px",background:isIN?C.successLight:C.dangerLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"16px",flexShrink:0}}>{isIN?"📥":"📤"}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:"12px",fontWeight:"700",color:C.gray900,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r["Part No."]||"-"}</div>
                  <div style={{fontSize:"11px",color:C.gray500}}>{r["By"]} · {r["Shift"]} · {r["Location"]||"-"}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:"15px",fontWeight:"800",color:isIN?C.success:C.danger}}>{isIN?"+":"-"}{r["Q'ty"]}</div>
                  <div style={{fontSize:"10px",color:C.gray500}}>{r["Day_Time"]?.slice(11,16)||"-"}</div>
                </div>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN: PRODUCT CATALOG
// ═══════════════════════════════════════════════════════════════════════════════
const ProductScreen=()=>{
  const {apiUrl,products,setProducts}=useContext(AppContext);
  const [search,setSearch]=useState("");
  const [custFilter,setCustFilter]=useState("");
  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState(null);
  const blank={"BD/BZ/CP":"","Custumer":"","SAP No.":"","Part No.":"","Part Name":"","Old Stock":0,"IN":0,"OUT":0,"UP_DATE":new Date().toISOString().slice(0,10),"Balance":0,"Full Box":0,"Package":"","Type & Size":""};
  const [form,setForm]=useState(blank);
  const [loading,setLoading]=useState(false);

  const customers=[...new Set(products.map(p=>p["Custumer"]).filter(Boolean))];
  const filtered=products.filter(p=>{
    const q=search.toLowerCase();
    const matchSearch=!search||[p["SAP No."],p["Part No."],p["Part Name"],p["Custumer"]].some(v=>(v||"").toLowerCase().includes(q));
    const matchCust=!custFilter||p["Custumer"]===custFilter;
    return matchSearch&&matchCust;
  });

  const openNew=()=>{setEditing(null);setForm({...blank});setShowForm(true);};
  const openEdit=(p)=>{setEditing(p["Part No."]);setForm({...p});setShowForm(true);};
  const F=(k,v)=>setForm(f=>({...f,[k]:v}));

  const save=async()=>{
    if(!form["Part No."]||!form["Part Name"]){toast("กรุณากรอก Part No. และ Part Name","warning");return;}
    setLoading(true);
    const bal=Number(form["Old Stock"])+Number(form["IN"])-Number(form["OUT"]);
    const updated={...form,"Balance":bal,"UP_DATE":new Date().toISOString().slice(0,10)};
    if(editing){
      setProducts(ps=>ps.map(p=>p["Part No."]===editing?updated:p));
    } else {
      if(products.find(p=>p["Part No."]===form["Part No."])){toast("Part No. นี้มีอยู่แล้ว","error");setLoading(false);return;}
      setProducts(ps=>[...ps,updated]);
    }
    await apiPost(apiUrl,{action:editing?"updateProduct":"addProduct",data:updated});
    toast(editing?"อัปเดตสินค้าสำเร็จ":"เพิ่มสินค้าสำเร็จ","success");
    setShowForm(false);setLoading(false);
  };

  const del=(partNo)=>confirmModal("ยืนยันลบสินค้า",`ลบ <b>${partNo}</b> ออกจากระบบ?`,()=>{
    setProducts(ps=>ps.filter(p=>p["Part No."]!==partNo));
    apiPost(apiUrl,{action:"deleteProduct",partNo});
    toast("ลบสำเร็จ","success");
  });

  const bdColor={"BD":C.blue,"BZ":C.teal,"CP":C.purple};
  const bdBg={"BD":C.blueLight,"BZ":C.tealLight,"CP":C.purpleLight};

  if(showForm)return(
    <div>
      <div style={{background:C.navy,padding:"15px 16px",display:"flex",alignItems:"center",gap:"12px",position:"sticky",top:0,zIndex:10}}>
        <button onClick={()=>setShowForm(false)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:"9px",color:C.white,width:"36px",height:"36px",fontSize:"20px",cursor:"pointer",flexShrink:0}}>←</button>
        <div style={{fontSize:"17px",fontWeight:"700",color:C.white}}>{editing?"แก้ไขสินค้า":"เพิ่มสินค้าใหม่"}</div>
      </div>
      <div style={{padding:"16px 14px 80px"}}>
        <Sel label="BD/BZ/CP" value={form["BD/BZ/CP"]} onChange={v=>F("BD/BZ/CP",v)} options={["BD","BZ","CP"]}/>
        <Field label="Customer" value={form["Custumer"]} onChange={v=>F("Custumer",v)} placeholder="เช่น Toyota"/>
        <Field label="SAP No." value={form["SAP No."]} onChange={v=>F("SAP No.",v)} placeholder="เช่น SAP-1001"/>
        <Field label="Part No. *" value={form["Part No."]} onChange={v=>F("Part No.",v)} placeholder="เช่น 1118337001 CTC"/>
        <Field label="Part Name *" value={form["Part Name"]} onChange={v=>F("Part Name",v)} placeholder="ชื่อสินค้า"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
          <Field label="Old Stock" value={form["Old Stock"]} onChange={v=>F("Old Stock",Number(v))} type="number"/>
          <Field label="Full Box" value={form["Full Box"]} onChange={v=>F("Full Box",Number(v))} type="number"/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
          <Field label="IN" value={form["IN"]} onChange={v=>F("IN",Number(v))} type="number"/>
          <Field label="OUT" value={form["OUT"]} onChange={v=>F("OUT",Number(v))} type="number"/>
        </div>
        <div style={{background:C.blueLight,borderRadius:"10px",padding:"12px",marginBottom:"12px"}}>
          <span style={{fontSize:"12px",color:C.gray500}}>Balance (คำนวณอัตโนมัติ): </span>
          <span style={{fontSize:"18px",fontWeight:"800",color:C.navy}}>{Number(form["Old Stock"])+Number(form["IN"])-Number(form["OUT"])}</span>
        </div>
        <Field label="Package" value={form["Package"]} onChange={v=>F("Package",v)} placeholder="เช่น Box A"/>
        <Field label="Type & Size" value={form["Type & Size"]} onChange={v=>F("Type & Size",v)} placeholder="เช่น Box 30x20x15"/>
        <Field label="UP_DATE" value={form["UP_DATE"]} onChange={v=>F("UP_DATE",v)} type="date"/>
        <Btn onClick={save} disabled={loading} style={{marginTop:"10px"}}>{loading?"กำลังบันทึก...":"💾 บันทึก"}</Btn>
      </div>
    </div>
  );

  return(
    <div>
      <div style={{background:C.navy,padding:"15px 14px 12px",position:"sticky",top:0,zIndex:10}}>
        <div style={{fontSize:"17px",fontWeight:"700",color:C.white,marginBottom:"10px"}}>🗂️ รายการสินค้า ({filtered.length})</div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 SAP / Part No. / ชื่อสินค้า / Customer"
          style={{width:"100%",padding:"10px 13px",borderRadius:"9px",border:"none",fontSize:"13px",background:"rgba(255,255,255,0.14)",color:C.white,boxSizing:"border-box",marginBottom:"8px"}}/>
        <div style={{display:"flex",gap:"6px",overflowX:"auto",paddingBottom:"2px"}}>
          <button onClick={()=>setCustFilter("")} style={{padding:"5px 12px",borderRadius:"99px",border:"none",background:!custFilter?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.2)",color:!custFilter?C.navy:C.white,fontSize:"12px",fontWeight:"700",cursor:"pointer",whiteSpace:"nowrap"}}>ทั้งหมด</button>
          {customers.map(c=>(
            <button key={c} onClick={()=>setCustFilter(c===custFilter?"":c)} style={{padding:"5px 12px",borderRadius:"99px",border:"none",background:custFilter===c?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.2)",color:custFilter===c?C.navy:C.white,fontSize:"12px",fontWeight:"700",cursor:"pointer",whiteSpace:"nowrap"}}>{c}</button>
          ))}
        </div>
      </div>
      <div style={{padding:"11px 11px 4px"}}>
        <Btn onClick={openNew} sm style={{marginBottom:"10px"}}>+ เพิ่มสินค้าใหม่</Btn>
      </div>
      <div style={{padding:"0 11px 80px"}}>
        {filtered.length===0?<Empty icon="📦" title="ไม่พบสินค้า" sub="ลองค้นหาคำอื่น"/>:filtered.map((p,i)=>(
          <Card key={i}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"8px"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",gap:"6px",marginBottom:"5px",flexWrap:"wrap"}}>
                  {p["BD/BZ/CP"]&&<Badge label={p["BD/BZ/CP"]} color={bdColor[p["BD/BZ/CP"]]||C.blue} bg={bdBg[p["BD/BZ/CP"]]||C.blueLight}/>}
                  {p["Custumer"]&&<Badge label={p["Custumer"]} color={C.gray700} bg={C.gray100}/>}
                </div>
                <div style={{fontSize:"15px",fontWeight:"800",color:C.navy,wordBreak:"break-all"}}>{p["Part No."]}</div>
                <div style={{fontSize:"12px",color:C.gray700,marginTop:"3px"}}>{p["Part Name"]}</div>
                <div style={{fontSize:"11px",color:C.gray500,marginTop:"2px"}}>{p["SAP No."]}</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0,marginLeft:"10px"}}>
                <div style={{fontSize:"22px",fontWeight:"800",color:p["Balance"]>0?C.navy:C.danger}}>{(p["Balance"]||0).toLocaleString()}</div>
                <div style={{fontSize:"10px",color:C.gray500}}>Balance</div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"5px",marginBottom:"10px"}}>
              {[["Old",p["Old Stock"]],["+IN",p["IN"]||0],["-OUT",p["OUT"]||0],["Box",p["Full Box"]]].map(([k,v])=>(
                <div key={k} style={{background:C.gray50,borderRadius:"7px",padding:"6px",textAlign:"center"}}>
                  <div style={{fontSize:"10px",color:C.gray500,fontWeight:"600"}}>{k}</div>
                  <div style={{fontSize:"13px",fontWeight:"700",color:C.gray900,marginTop:"2px"}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:"5px",marginBottom:"6px"}}>
              <span style={{fontSize:"11px",color:C.gray500,background:C.gray50,padding:"4px 8px",borderRadius:"6px"}}>{p["Package"]}</span>
              <span style={{fontSize:"11px",color:C.gray500,background:C.gray50,padding:"4px 8px",borderRadius:"6px"}}>{p["Type & Size"]}</span>
            </div>
            <div style={{fontSize:"10px",color:C.gray500,marginBottom:"10px"}}>อัปเดต: {p["UP_DATE"]}</div>
            <div style={{display:"flex",gap:"7px"}}>
              <button onClick={()=>openEdit(p)} style={{flex:1,padding:"9px",background:C.blueLight,color:C.blue,border:"none",borderRadius:"8px",fontSize:"12px",fontWeight:"700",cursor:"pointer"}}>✏️ แก้ไข</button>
              <button onClick={()=>del(p["Part No."])} style={{flex:1,padding:"9px",background:C.dangerLight,color:C.danger,border:"none",borderRadius:"8px",fontSize:"12px",fontWeight:"700",cursor:"pointer"}}>🗑️ ลบ</button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN: INBOUND
// ═══════════════════════════════════════════════════════════════════════════════
const InboundScreen=()=>{
  const {apiUrl,user,products,setTransIn,locations}=useContext(AppContext);
  const [step,setStep]=useState(1);
  const [selectedPart,setSelectedPart]=useState(null);
  const [partMatches,setPartMatches]=useState([]);
  const [qtyBox,setQtyBox]=useState(0);
  const [typeIN,setTypeIN]=useState("Normal");
  const [items,setItems]=useState([]);
  const [location,setLocation]=useState("");
  const [loading,setLoading]=useState(false);

  const findParts=(code)=>{
    const matches = findSimilarPartNo(code, products, 3);
    return matches;
  };

  const handleQR2=(code)=>{
    const matches=findParts(code);
    if(matches.length===0){toast("ไม่พบสินค้า: "+code,"error");return;}
    if(matches.length===1){applyPart(matches[0]);}
    else setPartMatches(matches);
  };

  const applyPart=(p)=>{
    setSelectedPart(p);setQtyBox(p["Full Box"]||0);setPartMatches([]);setStep(2);
    const loc=locations.find(l=>stripSpaces(l["Part No."])===stripSpaces(p["Part No."]));
    if(loc)setLocation(loc["location"]||"");
    toast(`เลือก: ${p["Part No."]}`,"success");
  };

  const handleQR1=(code)=>{
    if(!code)return;
    if(items.find(i=>i["LABAL_Scan"]===code)){toast("QR1 นี้ถูกเพิ่มแล้ว","warning");return;}
    setItems(prev=>[...prev,{"LABAL_Scan":code,"Q'ty":qtyBox}]);
    toast(`เพิ่ม ${code} (${qtyBox} ชิ้น)`,"success");
  };

  const updateItemQty=(scan,qty)=>setItems(prev=>prev.map(i=>i["LABAL_Scan"]===scan?{...i,"Q'ty":Number(qty)}:i));

  const save=async()=>{
    if(!items.length){toast("กรุณาสแกน QR1 อย่างน้อย 1 รายการ","warning");return;}
    if(!location){toast("กรุณาระบุ Location","warning");return;}
    setLoading(true);
    const newTx=items.map(item=>({
      "Type_IN":typeIN,
      "LABAL_KEY":genKey("KEY"),
      "LABAL_Scan":item["LABAL_Scan"],
      "Part_No._Scan":selectedPart?.["Part No."],
      "Part No.":selectedPart?.["Part No."],
      "Q'ty":item["Q'ty"],
      "By":user?.["Employee ID"],
      "Shift":user?.["Shift_work"],
      "Day_Time":nowTH(),
      "q'ty_Box":qtyBox,
      "Package Type & Size":selectedPart?.["Type & Size"],
      "Location":location,
    }));
    await apiPost(apiUrl,{action:"inbound",transactions:newTx,employeeId:user?.["Employee ID"]});
    setTransIn(p=>[...p,...newTx]);
    toast(`✅ บันทึกรับเข้า ${items.length} กล่อง · ${items.reduce((s,i)=>s+i["Q'ty"],0)} ชิ้น`,"success",5000);
    setStep(1);setSelectedPart(null);setItems([]);setQtyBox(0);setLocation("");
    setLoading(false);
  };

  const StepDots=()=>(
    <div style={{display:"flex",alignItems:"center",padding:"0 16px",marginBottom:"12px"}}>
      {["QR2 สินค้า","ยืนยันข้อมูล","QR1 กล่อง","บันทึก"].map((s,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",flex:i<3?1:"none"}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
            <div style={{width:"26px",height:"26px",borderRadius:"50%",background:step>i+1?C.success:step===i+1?C.white:"rgba(255,255,255,0.25)",color:step===i+1?C.navy:step>i+1?C.white:"rgba(255,255,255,0.6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:"800"}}>{step>i+1?"✓":i+1}</div>
            <div style={{fontSize:"9px",color:step===i+1?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.4)",marginTop:"3px",whiteSpace:"nowrap"}}>{s}</div>
          </div>
          {i<3&&<div style={{height:"2px",flex:1,background:step>i+1?C.success:"rgba(255,255,255,0.2)",margin:"0 4px",marginBottom:"14px"}}/>}
        </div>
      ))}
    </div>
  );

  return(
    <div>
      {partMatches.length>0&&<PartDrawer matches={partMatches} onSelect={applyPart} onClose={()=>setPartMatches([])}/>}
      <div style={{background:C.navy,padding:"15px 14px 14px",position:"sticky",top:0,zIndex:10}}>
        <div style={{fontSize:"17px",fontWeight:"700",color:C.white,marginBottom:"12px"}}>📥 รับสินค้าเข้า (Inbound)</div>
        <StepDots/>
      </div>
      <div style={{padding:"11px 11px 80px"}}>
        {step===1&&(
          <Card>
            <div style={{fontSize:"14px",fontWeight:"700",color:C.navy,marginBottom:"12px"}}>ขั้นตอนที่ 1: สแกน QR2 (Part No.)</div>
            <Sel label="ประเภทการรับเข้า" value={typeIN} onChange={setTypeIN} options={["Normal","Return","Transfer"]}/>
            <QRScanner label="สแกน QR2 หรือพิมพ์ Part No." onScan={handleQR2} products={products}/>
          </Card>
        )}
        {step===2&&selectedPart&&(
          <Card>
            <div style={{fontSize:"14px",fontWeight:"700",color:C.navy,marginBottom:"12px"}}>ขั้นตอนที่ 2: ยืนยันข้อมูลสินค้า</div>
            <div style={{background:C.blueLight,borderRadius:"11px",padding:"14px",marginBottom:"14px"}}>
              <div style={{display:"flex",gap:"6px",marginBottom:"7px",flexWrap:"wrap"}}>
                <Badge label={selectedPart["BD/BZ/CP"]} color={C.blue} bg="rgba(30,111,217,0.15)"/>
                <Badge label={selectedPart["Custumer"]} color={C.navy} bg="rgba(15,45,92,0.1)"/>
              </div>
              <div style={{fontSize:"17px",fontWeight:"800",color:C.navy}}>{selectedPart["Part No."]}</div>
              <div style={{fontSize:"13px",color:C.gray700,marginTop:"4px"}}>{selectedPart["Part Name"]}</div>
              {[["SAP No.",selectedPart["SAP No."]],["Package",selectedPart["Package"]],["Type & Size",selectedPart["Type & Size"]],["Balance",selectedPart["Balance"]]].map(([k,v])=>(
                <Row key={k} label={k} value={v}/>
              ))}
            </div>
            <Sel label="ประเภทการรับเข้า" value={typeIN} onChange={setTypeIN} options={["Normal","Return","Transfer"]}/>
            <Field label="จำนวนต่อกล่อง (Q'ty/Box)" value={qtyBox} onChange={v=>setQtyBox(Number(v))} type="number"/>
            <Field label="Location *" value={location} onChange={setLocation} placeholder="เช่น A-01-01"/>
            <div style={{display:"flex",gap:"8px"}}>
              <Btn onClick={()=>{setStep(1);setSelectedPart(null);}} color={C.gray500} sm style={{flex:1}}>← กลับ</Btn>
              <Btn onClick={()=>setStep(3)} style={{flex:1}}>ถัดไป →</Btn>
            </div>
          </Card>
        )}
        {step===3&&(
          <>
            <Card>
              <div style={{fontSize:"14px",fontWeight:"700",color:C.navy,marginBottom:"4px"}}>ขั้นตอนที่ 3: สแกน QR1 (Key ID กล่อง)</div>
              <InfoBox>{selectedPart?.["Part No."]} · {qtyBox} ชิ้น/กล่อง · {location}</InfoBox>
              <QRScanner label="สแกน QR1 — สแกนต่อเนื่องได้หลายกล่อง" onScan={handleQR1}/>
            </Card>
            {items.length>0&&(
              <Card>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
                  <div style={{fontSize:"14px",fontWeight:"700",color:C.navy}}>รายการ ({items.length} กล่อง)</div>
                  <Badge label={`รวม ${items.reduce((s,i)=>s+i["Q'ty"],0)} ชิ้น`} color={C.success} bg={C.successLight}/>
                </div>
                {items.map((item,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 0",borderBottom:`1px solid ${C.gray100}`}}>
                    <div style={{fontSize:"20px"}}>📦</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"13px",fontWeight:"700",color:C.gray900,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item["LABAL_Scan"]}</div>
                    </div>
                    <input type="number" value={item["Q'ty"]} onChange={e=>updateItemQty(item["LABAL_Scan"],e.target.value)}
                      style={{width:"60px",padding:"6px",borderRadius:"7px",border:`1.5px solid ${C.gray300}`,fontSize:"13px",textAlign:"center",fontWeight:"700"}}/>
                    <span style={{fontSize:"11px",color:C.gray500}}>ชิ้น</span>
                    <button onClick={()=>setItems(p=>p.filter(x=>x["LABAL_Scan"]!==item["LABAL_Scan"]))}
                      style={{background:C.dangerLight,border:"none",borderRadius:"7px",color:C.danger,padding:"6px 10px",cursor:"pointer",fontSize:"13px",fontWeight:"700"}}>✕</button>
                  </div>
                ))}
                <Btn onClick={()=>setStep(4)} style={{marginTop:"12px"}} color={C.navy}>ถัดไป → ตรวจสอบ</Btn>
              </Card>
            )}
          </>
        )}
        {step===4&&(
          <Card>
            <div style={{fontSize:"14px",fontWeight:"700",color:C.navy,marginBottom:"14px"}}>ขั้นตอนที่ 4: ยืนยันการบันทึก</div>
            <div style={{background:C.successLight,borderRadius:"11px",padding:"16px",marginBottom:"14px"}}>
              {[["Type_IN",typeIN],["Part No.",selectedPart?.["Part No."]],["Part Name",selectedPart?.["Part Name"]],["Location",location],["By",user?.["Employee ID"]],["Shift",user?.["Shift_work"]],["Day_Time",nowTH()]].map(([k,v])=>(<Row key={k} label={k} value={v}/>))}
              <div style={{borderTop:`2px solid ${C.success}`,marginTop:"8px",paddingTop:"10px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
                <div style={{textAlign:"center"}}><div style={{fontSize:"11px",color:C.gray500}}>กล่อง</div><div style={{fontSize:"26px",fontWeight:"800",color:C.navy}}>{items.length}</div></div>
                <div style={{textAlign:"center"}}><div style={{fontSize:"11px",color:C.gray500}}>รวมชิ้น</div><div style={{fontSize:"26px",fontWeight:"800",color:C.success}}>{items.reduce((s,i)=>s+i["Q'ty"],0)}</div></div>
              </div>
            </div>
            <Btn onClick={save} disabled={loading} color={C.success}>{loading?"กำลังบันทึก...":"✅ บันทึกรับเข้า"}</Btn>
            <Btn onClick={()=>setStep(3)} color={C.gray500} sm style={{marginTop:"8px"}}>← กลับแก้ไข</Btn>
          </Card>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN: OUTBOUND
// ═══════════════════════════════════════════════════════════════════════════════
const OutboundScreen=()=>{
  const {apiUrl,user,products,setTransOut}=useContext(AppContext);
  const [scanned,setScanned]=useState([]);
  const [loading,setLoading]=useState(false);
  const [locQuery,setLocQuery]=useState(null);
  const [manualLoc,setManualLoc]=useState("");
  const [typeOUT,setTypeOUT]=useState("Normal");

  const demoBoxMap={
    "BOX-001":{"Part No.":"1118337001 CTC","Q'ty":12,"Location":"A-01-01"},
    "BOX-002":{"Part No.":"2234567890","Q'ty":50,"Location":"B-02-03"},
    "BOX-003":{"Part No.":"1118337001 SCT","Q'ty":24,"Location":null},
  };

  const findBox=(keyId)=>{
    const demo=demoBoxMap[keyId];
    if(demo){
      const prod=products.find(p=>p["Part No."]===demo["Part No."]);
      return{...demo,product:prod};
    }
    return null;
  };

  const handleQR1=(code)=>{
    if(scanned.find(i=>i["LABAL_Scan"]===code)){toast("สแกนซ้ำ: "+code,"warning");return;}
    const box=findBox(code);
    if(!box){toast("ไม่พบ Key ID: "+code,"error");return;}
    if(!box["Location"]){setLocQuery({keyId:code,...box});return;}
    addItem(code,box,box["Location"]);
  };

  const addItem=(keyId,box,loc)=>{
    const prod=box.product||products.find(p=>p["Part No."]===box["Part No."]);
    setScanned(prev=>[...prev,{
      "LABAL_Scan":keyId,
      "Part No.":box["Part No."],
      "Part Name":prod?.["Part Name"]||"",
      "SAP No.":prod?.["SAP No."]||"",
      "Q'ty":box["Q'ty"],
      "Location":loc,
      "Package Type & Size":prod?.["Type & Size"]||"",
    }]);
    toast(`เพิ่ม ${keyId} สำเร็จ`,"success");
  };

  const confirmLoc=()=>{
    if(!manualLoc){toast("กรุณาระบุ Location","warning");return;}
    addItem(locQuery.keyId,locQuery,manualLoc);
    setLocQuery(null);setManualLoc("");
  };

  const summary=scanned.reduce((acc,item)=>{
    const k=item["Part No."];
    acc[k]=acc[k]||{...item,boxes:0,totalQty:0};
    acc[k].boxes+=1;acc[k].totalQty+=item["Q'ty"];
    return acc;
  },{});

  const saveOut=async()=>{
    if(!scanned.length){toast("กรุณาสแกน QR1 อย่างน้อย 1 รายการ","warning");return;}
    setLoading(true);
    const newTx=scanned.map(item=>({
      "Type_OUT":typeOUT,
      "LABAL_KEY":genKey("KEY"),
      "LABAL_Scan":item["LABAL_Scan"],
      "Part_No._Scan":item["Part No."],
      "Part No.":item["Part No."],
      "Q'ty":item["Q'ty"],
      "By":user?.["Employee ID"],
      "Shift":user?.["Shift_work"],
      "Day_Time":nowTH(),
      "q'ty_Box":item["Q'ty"],
      "Package Type & Size":item["Package Type & Size"],
      "Location":item["Location"],
    }));
    await apiPost(apiUrl,{action:"outbound",transactions:newTx,employeeId:user?.["Employee ID"]});
    setTransOut(p=>[...p,...newTx]);
    toast(`✅ โอนออก ${scanned.length} กล่อง · ${scanned.reduce((s,i)=>s+i["Q'ty"],0)} ชิ้น`,"success",5000);
    setScanned([]);setLoading(false);
  };

  return(
    <div>
      {locQuery&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:9000,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
          <div style={{background:C.white,borderRadius:"16px",padding:"22px",width:"100%",maxWidth:"340px"}}>
            <div style={{fontSize:"16px",fontWeight:"800",color:C.warning,marginBottom:"10px"}}>⚠️ ไม่พบ Location</div>
            <div style={{fontSize:"13px",color:C.gray700,marginBottom:"16px",lineHeight:"1.6"}}><b>{locQuery.keyId}</b><br/>ไม่มีข้อมูล Location ในระบบ<br/>นำสินค้ามาจากชั้นวางไหน?</div>
            <Field label="Location" value={manualLoc} onChange={setManualLoc} placeholder="เช่น A-01-01"/>
            <div style={{display:"flex",gap:"8px"}}>
              <Btn onClick={()=>{setLocQuery(null);setManualLoc("");}} color={C.gray500} sm style={{flex:1}}>ยกเลิก</Btn>
              <Btn onClick={confirmLoc} sm style={{flex:1}}>ยืนยัน</Btn>
            </div>
          </div>
        </div>
      )}
      <div style={{background:C.navy,padding:"15px 14px",position:"sticky",top:0,zIndex:10}}>
        <div style={{fontSize:"17px",fontWeight:"700",color:C.white}}>📤 โอนสินค้าออก (Outbound)</div>
        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.55)",marginTop:"4px"}}>สแกน QR1 (Key ID) เพื่อเพิ่มรายการโอนออก</div>
      </div>
      <div style={{padding:"11px 11px 80px"}}>
        <Card>
          <Sel label="ประเภทการโอนออก" value={typeOUT} onChange={setTypeOUT} options={["Normal","Return","Transfer","Scrap"]}/>
          <QRScanner label="สแกน QR1 (Key ID กล่อง)" onScan={handleQR1}/>
        </Card>
        {Object.values(summary).length>0&&(
          <Card style={{border:`2px solid ${C.danger}22`}}>
            <div style={{fontSize:"14px",fontWeight:"700",color:C.navy,marginBottom:"12px"}}>📊 สรุปรายการโอนออก</div>
            {Object.values(summary).map((s,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.gray100}`}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:"13px",fontWeight:"700",color:C.navy,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s["Part No."]}</div>
                  <div style={{fontSize:"11px",color:C.gray500}}>{s["Part Name"]} · {s.boxes} กล่อง</div>
                </div>
                <div style={{fontSize:"20px",fontWeight:"800",color:C.danger,flexShrink:0}}>{s.totalQty} ชิ้น</div>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",padding:"12px 0 0",borderTop:`2px solid ${C.navy}`,marginTop:"6px"}}>
              <span style={{fontSize:"14px",fontWeight:"800",color:C.navy}}>รวมทั้งสิ้น</span>
              <span style={{fontSize:"20px",fontWeight:"800",color:C.navy}}>{scanned.reduce((s,i)=>s+i["Q'ty"],0).toLocaleString()} ชิ้น</span>
            </div>
          </Card>
        )}
        {scanned.length>0&&(
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
              <div style={{fontSize:"14px",fontWeight:"700",color:C.navy}}>รายการ QR1 ({scanned.length})</div>
              <button onClick={()=>confirmModal("ล้างรายการ","ยืนยันล้างรายการทั้งหมด?",()=>setScanned([]))} style={{background:C.dangerLight,border:"none",borderRadius:"7px",color:C.danger,padding:"6px 10px",cursor:"pointer",fontSize:"12px",fontWeight:"700"}}>ล้างทั้งหมด</button>
            </div>
            {scanned.map((item,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 0",borderBottom:`1px solid ${C.gray100}`}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:"12px",fontWeight:"700",color:C.gray900,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item["LABAL_Scan"]}</div>
                  <div style={{fontSize:"11px",color:C.gray500}}>{item["Part No."]} · {item["Q'ty"]} ชิ้น · 📍{item["Location"]}</div>
                </div>
                <button onClick={()=>setScanned(p=>p.filter(x=>x["LABAL_Scan"]!==item["LABAL_Scan"]))} style={{background:C.dangerLight,border:"none",borderRadius:"7px",color:C.danger,padding:"6px 10px",cursor:"pointer",fontSize:"13px",fontWeight:"700",flexShrink:0}}>✕</button>
              </div>
            ))}
            <Btn onClick={saveOut} disabled={loading} color={C.danger} style={{marginTop:"12px"}}>{loading?"กำลังบันทึก...":"✅ ยืนยันโอนออก"}</Btn>
          </Card>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN: LOCATION MONITOR
// ═══════════════════════════════════════════════════════════════════════════════
const LocationScreen=()=>{
  const {apiUrl,user,locations,setLocations,products}=useContext(AppContext);
  const [search,setSearch]=useState("");
  const [moveItem,setMoveItem]=useState(null);
  const [newLoc,setNewLoc]=useState("");
  const [showAdd,setShowAdd]=useState(false);
  const [newLocForm,setNewLocForm]=useState({"Custumer":"","SAP No.":"","Part No.":"","Part Name":"","location":"","IN":0,"Out":0,"Balance":0});

  const filtered=locations.filter(l=>{
    const q=search.toLowerCase();
    return!search||[l["location"],l["Part No."],l["Part Name"],l["Custumer"]].some(v=>(v||"").toLowerCase().includes(q));
  });

  const grouped=filtered.reduce((acc,l)=>{
    const key=l["location"]||"ไม่ระบุ";
    acc[key]=acc[key]||[];acc[key].push(l);
    return acc;
  },{});

  const doMove=()=>{
    if(!newLoc){toast("กรุณาระบุ Location ปลายทาง","warning");return;}
    setLocations(prev=>prev.map(l=>l["location"]===moveItem["location"]&&l["Part No."]===moveItem["Part No."]?{...l,"location":newLoc}:l));
    apiPost(apiUrl,{action:"moveLocation",partNo:moveItem["Part No."],from:moveItem["location"],to:newLoc,by:user?.["Employee ID"]});
    toast(`✅ ย้าย ${moveItem["Part No."]} → ${newLoc}`,"success");
    setMoveItem(null);setNewLoc("");
  };

  const addLocation=()=>{
    if(!newLocForm["location"]||!newLocForm["Part No."]){toast("กรุณากรอก Location และ Part No.","warning");return;}
    const prod=products.find(p=>stripSpaces(p["Part No."])===stripSpaces(newLocForm["Part No."]));
    const full={...newLocForm,"Part Name":prod?.["Part Name"]||newLocForm["Part Name"],"SAP No.":prod?.["SAP No."]||newLocForm["SAP No."],"Custumer":prod?.["Custumer"]||newLocForm["Custumer"]};
    setLocations(prev=>[...prev,full]);
    apiPost(apiUrl,{action:"addLocation",data:full});
    toast(`เพิ่ม Location ${full["location"]} สำเร็จ`,"success");
    setShowAdd(false);
  };

  const delLocation=(l)=>confirmModal("ลบ Location",`ลบ ${l["location"]} (${l["Part No."]})?`,()=>{
    setLocations(prev=>prev.filter(x=>!(x["location"]===l["location"]&&x["Part No."]===l["Part No."])));
    apiPost(apiUrl,{action:"deleteLocation",location:l["location"],partNo:l["Part No."]});
    toast("ลบ Location สำเร็จ","success");
  });

  return(
    <div>
      {moveItem&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:9000,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
          <div style={{background:C.white,borderRadius:"16px",padding:"22px",width:"100%",maxWidth:"340px"}}>
            <div style={{fontSize:"16px",fontWeight:"800",color:C.navy,marginBottom:"10px"}}>🔄 ย้ายสินค้า</div>
            <InfoBox><b>{moveItem["Part No."]}</b><br/>จาก <b>{moveItem["location"]}</b> → ปลายทาง</InfoBox>
            <Field label="Location ปลายทาง" value={newLoc} onChange={setNewLoc} placeholder="เช่น A-01-02"/>
            <div style={{display:"flex",gap:"8px"}}>
              <Btn onClick={()=>{setMoveItem(null);setNewLoc("");}} color={C.gray500} sm style={{flex:1}}>ยกเลิก</Btn>
              <Btn onClick={doMove} sm style={{flex:1}}>✅ ย้าย</Btn>
            </div>
          </div>
        </div>
      )}
      <div style={{background:C.navy,padding:"15px 14px 12px",position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
          <div style={{fontSize:"17px",fontWeight:"700",color:C.white}}>🏗️ ตรวจสอบชั้นวาง</div>
          {user?.["Role"]==="admin"&&<button onClick={()=>setShowAdd(!showAdd)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:"8px",color:C.white,padding:"7px 12px",fontSize:"12px",fontWeight:"700",cursor:"pointer"}}>+ เพิ่ม</button>}
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ค้นหา Location / Part No. / Customer"
          style={{width:"100%",padding:"10px 13px",borderRadius:"9px",border:"none",fontSize:"13px",background:"rgba(255,255,255,0.14)",color:C.white,boxSizing:"border-box"}}/>
      </div>
      <div style={{padding:"11px 11px 80px"}}>
        {showAdd&&user?.["Role"]==="admin"&&(
          <Card style={{border:`2px solid ${C.blue}`}}>
            <div style={{fontSize:"14px",fontWeight:"700",color:C.navy,marginBottom:"12px"}}>เพิ่ม Location ใหม่</div>
            {[["location","Location ID *","เช่น D-04-01"],["Part No.","Part No. *","เช่น 1118337001 CTC"],["Custumer","Customer","เช่น Toyota"],["SAP No.","SAP No.","เช่น SAP-1001"]].map(([k,l,ph])=>(
              <Field key={k} label={l} value={newLocForm[k]} onChange={v=>setNewLocForm(f=>({...f,[k]:v}))} placeholder={ph}/>
            ))}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px"}}>
              {[["IN","IN"],["Out","Out"],["Balance","Balance"]].map(([k,l])=>(
                <Field key={k} label={l} value={newLocForm[k]} onChange={v=>setNewLocForm(f=>({...f,[k]:Number(v)}))} type="number"/>
              ))}
            </div>
            <Btn onClick={addLocation} sm>เพิ่ม Location</Btn>
          </Card>
        )}
        {Object.entries(grouped).length===0?<Empty icon="🏗️" title="ไม่พบข้อมูล Location"/>:
        Object.entries(grouped).map(([locId,items])=>(
          <Card key={locId}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
              <div>
                <div style={{fontSize:"16px",fontWeight:"800",color:C.navy}}>📍 {locId}</div>
                <div style={{fontSize:"11px",color:C.gray500}}>{items.length} รายการ</div>
              </div>
              <Badge label={`Balance: ${items.reduce((s,i)=>s+i["Balance"],0)}`} color={C.success} bg={C.successLight}/>
            </div>
            {items.map((item,j)=>(
              <div key={j} style={{padding:"10px 0",borderBottom:j<items.length-1?`1px solid ${C.gray100}`:"none"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"6px"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:"13px",fontWeight:"700",color:C.navy,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item["Part No."]}</div>
                    <div style={{fontSize:"11px",color:C.gray500}}>{item["Part Name"]} · {item["Custumer"]}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0,marginLeft:"10px"}}>
                    <div style={{fontSize:"16px",fontWeight:"800",color:C.navy}}>{item["Balance"]}</div>
                    <div style={{fontSize:"10px",color:C.gray500}}>Balance</div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"5px",marginBottom:"8px"}}>
                  {[["IN",item["IN"],C.success,C.successLight],["-Out",item["Out"],C.danger,C.dangerLight],["Bal",item["Balance"],C.blue,C.blueLight]].map(([k,v,col,bg])=>(
                    <div key={k} style={{background:bg,borderRadius:"6px",padding:"5px",textAlign:"center"}}>
                      <div style={{fontSize:"9px",color:col,fontWeight:"700"}}>{k}</div>
                      <div style={{fontSize:"13px",fontWeight:"800",color:col}}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:"6px"}}>
                  <button onClick={()=>{setMoveItem(item);setNewLoc("");}} style={{flex:1,padding:"7px",background:C.blueLight,color:C.blue,border:"none",borderRadius:"7px",fontSize:"11px",fontWeight:"700",cursor:"pointer"}}>🔄 ย้าย</button>
                  {user?.["Role"]==="admin"&&<button onClick={()=>delLocation(item)} style={{flex:1,padding:"7px",background:C.dangerLight,color:C.danger,border:"none",borderRadius:"7px",fontSize:"11px",fontWeight:"700",cursor:"pointer"}}>🗑️ ลบ</button>}
                </div>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN: MERGE / SPLIT
// ═══════════════════════════════════════════════════════════════════════════════
const MergeSplitScreen=()=>{
  const {apiUrl,user}=useContext(AppContext);
  const [mode,setMode]=useState("merge");
  const [src,setSrc]=useState(null);
  const [tgt,setTgt]=useState(null);
  const [qty,setQty]=useState(0);
  const [loading,setLoading]=useState(false);
  const demoBoxes={"BOX-001":{"Part No.":"1118337001 CTC","Q'ty":12,"Location":"A-01-01"},"BOX-002":{"Part No.":"2234567890","Q'ty":50,"Location":"B-02-03"}};
  const findBox=(code)=>{const b=demoBoxes[code];return b?{keyId:code,...b}:null;};
  const handleSrc=(code)=>{const b=findBox(code);b?setSrc(b):toast("ไม่พบ Key ID: "+code,"error");};
  const handleTgt=(code)=>{
    const b=findBox(code);
    if(!b){toast("ไม่พบ Key ID: "+code,"error");return;}
    if(b.keyId===src?.keyId){toast("ต้นทางและปลายทางต้องไม่เป็นกล่องเดียวกัน","error");return;}
    if(mode==="merge"&&b["Part No."]!==src?.["Part No."]){toast("Merge ต้องเป็น Part No. เดียวกัน","warning");return;}
    setTgt(b);
  };
  const execute=async()=>{
    if(!src||!tgt||!qty){toast("กรุณากรอกข้อมูลให้ครบ","warning");return;}
    if(qty>src["Q'ty"]){toast("จำนวนมากกว่าที่มีในกล่อง","error");return;}
    setLoading(true);
    await apiPost(apiUrl,{action:mode,sourceKeyId:src.keyId,targetKeyId:tgt.keyId,qty,by:user?.["Employee ID"],shift:user?.["Shift_work"],dayTime:nowTH()});
    toast(`✅ ${mode==="merge"?"รวม":"แยก"}สำเร็จ ${qty} ชิ้น จาก ${src.keyId} → ${tgt.keyId}`,"success",5000);
    setSrc(null);setTgt(null);setQty(0);setLoading(false);
  };
  return(
    <div>
      <div style={{background:C.navy,padding:"15px 14px",position:"sticky",top:0,zIndex:10}}>
        <div style={{fontSize:"17px",fontWeight:"700",color:C.white}}>🔄 รวม / แยกสินค้า (Merge / Split)</div>
      </div>
      <div style={{padding:"11px 11px 80px"}}>
        <Card>
          <div style={{display:"flex",gap:"10px",marginBottom:"16px"}}>
            {[{v:"merge",l:"รวมงาน (Merge)"},{v:"split",l:"แยกงาน (Split)"}].map(m=>(
              <button key={m.v} onClick={()=>setMode(m.v)} style={{flex:1,padding:"12px 6px",borderRadius:"10px",border:`2px solid ${mode===m.v?C.blue:C.gray100}`,background:mode===m.v?C.blueLight:C.white,color:mode===m.v?C.blue:C.gray700,fontWeight:"700",fontSize:"13px",cursor:"pointer"}}>{m.l}</button>
            ))}
          </div>
          <div style={{fontSize:"14px",fontWeight:"700",color:C.navy,marginBottom:"10px"}}>กล่องต้นทาง (Source QR1)</div>
          <QRScanner label="สแกน QR1 กล่องต้นทาง" onScan={handleSrc}/>
          {src&&<div style={{background:C.blueLight,borderRadius:"9px",padding:"11px",marginTop:"10px"}}><div style={{fontWeight:"700",color:C.navy}}>{src.keyId}</div><div style={{fontSize:"12px",color:C.gray700}}>{src["Part No."]} · {src["Q'ty"]} ชิ้น · 📍{src["Location"]}</div></div>}
        </Card>
        {src&&(
          <Card>
            <Field label={`จำนวน (สูงสุด ${src["Q'ty"]} ชิ้น)`} value={qty} onChange={v=>setQty(Math.min(Number(v),src["Q'ty"]))} type="number"/>
            <div style={{fontSize:"14px",fontWeight:"700",color:C.navy,marginBottom:"10px"}}>กล่องปลายทาง (Target QR1)</div>
            <QRScanner label="สแกน QR1 กล่องปลายทาง" onScan={handleTgt}/>
            {tgt&&<div style={{background:C.successLight,borderRadius:"9px",padding:"11px",marginTop:"10px"}}><div style={{fontWeight:"700",color:C.success}}>{tgt.keyId}</div><div style={{fontSize:"12px",color:C.gray700}}>{tgt["Part No."]} · {tgt["Q'ty"]} ชิ้น · 📍{tgt["Location"]}</div></div>}
            {src&&tgt&&qty>0&&(
              <Btn onClick={execute} disabled={loading} color={mode==="merge"?C.blue:C.warning} style={{marginTop:"14px"}}>
                {loading?"กำลังดำเนินการ...":`✅ ยืนยัน${mode==="merge"?"รวม":"แยก"} ${qty} ชิ้น`}
              </Btn>
            )}
          </Card>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN: EMPLOYEE
// ═══════════════════════════════════════════════════════════════════════════════
const EmployeeScreen=()=>{
  const {employees,setEmployees}=useContext(AppContext);
  const blank={"Employee ID":"","Full Name":"","Department":"","PIN":"","Role":"worker","Shift_work":"A","Shift_DAY&Nigth":"Day"};
  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState(blank);
  const [search,setSearch]=useState("");
  const F=(k,v)=>setForm(f=>({...f,[k]:v}));

  const filtered=employees.filter(e=>{
    const q=search.toLowerCase();
    return!search||[e["Employee ID"],e["Full Name"],e["Department"]].some(v=>(v||"").toLowerCase().includes(q));
  });

  const openEdit=(e)=>{setEditing(e["Employee ID"]);setForm({...e});setShowForm(true);};

  const save=()=>{
    if(!form["Employee ID"]||!form["Full Name"]||form["PIN"].length!==6){toast("กรุณากรอกข้อมูลให้ครบ (PIN 6 หลัก)","warning");return;}
    if(editing){setEmployees(p=>p.map(e=>e["Employee ID"]===editing?{...e,...form}:e));}
    else{
      if(employees.find(e=>e["Employee ID"]===form["Employee ID"])){toast("Employee ID นี้มีอยู่แล้ว","error");return;}
      setEmployees(p=>[...p,form]);
    }
    apiPost("",{action:editing?"updateEmployee":"addEmployee",data:form});
    toast("บันทึกสำเร็จ","success");setShowForm(false);
  };

  const resign=(id)=>confirmModal("แจ้งออก",`ยืนยันแจ้งออก ${id}?`,()=>{
    setEmployees(p=>p.map(e=>e["Employee ID"]===id?{...e,"Status":"resigned"}:e));
    toast("แจ้งออกสำเร็จ","success");
  });
  const del=(id)=>confirmModal("ลบพนักงาน",`ยืนยันลบ ${id}?`,()=>{
    setEmployees(p=>p.filter(e=>e["Employee ID"]!==id));
    toast("ลบสำเร็จ","success");
  });

  const shiftColor={"A":C.blue,"B":C.purple,"C":C.teal};
  const shiftBg={"A":C.blueLight,"B":C.purpleLight,"C":C.tealLight};
  const roleColor={"admin":C.navy,"worker":C.blue};

  if(showForm)return(
    <div>
      <div style={{background:C.navy,padding:"15px 16px",display:"flex",alignItems:"center",gap:"12px",position:"sticky",top:0,zIndex:10}}>
        <button onClick={()=>setShowForm(false)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:"9px",color:C.white,width:"36px",height:"36px",fontSize:"20px",cursor:"pointer",flexShrink:0}}>←</button>
        <div style={{fontSize:"17px",fontWeight:"700",color:C.white}}>{editing?"แก้ไขพนักงาน":"เพิ่มพนักงานใหม่"}</div>
      </div>
      <div style={{padding:"16px 14px 80px"}}>
        <Field label="Employee ID *" value={form["Employee ID"]} onChange={v=>F("Employee ID",v)} placeholder="เช่น EMP004" readOnly={!!editing}/>
        <Field label="Full Name *" value={form["Full Name"]} onChange={v=>F("Full Name",v)} placeholder="ชื่อ-นามสกุล"/>
        <Sel label="Department" value={form["Department"]} onChange={v=>F("Department",v)} options={["Warehouse","Receiving","Shipping","Logistics","QC","Admin"]}/>
        <Sel label="Role" value={form["Role"]} onChange={v=>F("Role",v)} options={[{value:"admin",label:"Admin"},{value:"worker",label:"Worker"}]}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
          <Sel label="Shift_work" value={form["Shift_work"]} onChange={v=>F("Shift_work",v)} options={["A","B","C","D"]}/>
          <Sel label="Shift_DAY&Nigth" value={form["Shift_DAY&Nigth"]} onChange={v=>F("Shift_DAY&Nigth",v)} options={["Day","Night"]}/>
        </div>
        <Field label="PIN (6 หลัก) *" value={form["PIN"]} onChange={v=>F("PIN",v.replace(/\D/g,"").slice(0,6))} type="password" placeholder="••••••"/>
        <Btn onClick={save} style={{marginTop:"8px"}}>💾 บันทึก</Btn>
      </div>
    </div>
  );

  return(
    <div>
      <div style={{background:C.navy,padding:"15px 14px 12px",position:"sticky",top:0,zIndex:10}}>
        <div style={{fontSize:"17px",fontWeight:"700",color:C.white,marginBottom:"10px"}}>👥 จัดการพนักงาน ({employees.length})</div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ค้นหา ID / ชื่อ / แผนก"
          style={{width:"100%",padding:"10px 13px",borderRadius:"9px",border:"none",fontSize:"13px",background:"rgba(255,255,255,0.14)",color:C.white,boxSizing:"border-box"}}/>
      </div>
      <div style={{padding:"11px 11px 4px"}}><Btn onClick={()=>{setEditing(null);setForm(blank);setShowForm(true);}} sm style={{marginBottom:"10px"}}>+ เพิ่มพนักงานใหม่</Btn></div>
      <div style={{padding:"0 11px 80px"}}>
        {filtered.length===0?<Empty icon="👥" title="ไม่พบพนักงาน"/>:filtered.map((e,i)=>(
          <Card key={i}>
            <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"10px"}}>
              <div style={{width:"46px",height:"46px",background:C.blueLight,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"19px",fontWeight:"800",color:C.blue,flexShrink:0}}>{(e["Full Name"]||"?").charAt(0)}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:"15px",fontWeight:"800",color:C.navy,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e["Full Name"]}</div>
                <div style={{fontSize:"12px",color:C.gray500}}>{e["Employee ID"]} · {e["Department"]}</div>
                <div style={{display:"flex",gap:"5px",marginTop:"5px",flexWrap:"wrap"}}>
                  <Badge label={e["Role"]==="admin"?"Admin":"Worker"} color={roleColor[e["Role"]]||C.blue} bg={C.blueLight}/>
                  <Badge label={`กะ ${e["Shift_work"]}`} color={shiftColor[e["Shift_work"]]||C.blue} bg={shiftBg[e["Shift_work"]]||C.blueLight}/>
                  <Badge label={e["Shift_DAY&Nigth"]} color={e["Shift_DAY&Nigth"]==="Day"?C.warning:C.purple} bg={e["Shift_DAY&Nigth"]==="Day"?C.warningLight:C.purpleLight}/>
                  {e["Status"]==="resigned"&&<Badge label="ออกแล้ว" color={C.danger} bg={C.dangerLight}/>}
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
              <button onClick={()=>openEdit(e)} style={{flex:1,minWidth:"70px",padding:"8px",background:C.blueLight,color:C.blue,border:"none",borderRadius:"8px",fontSize:"12px",fontWeight:"700",cursor:"pointer"}}>✏️ แก้ไข</button>
              {e["Status"]!=="resigned"&&<button onClick={()=>resign(e["Employee ID"])} style={{flex:1,minWidth:"70px",padding:"8px",background:C.warningLight,color:C.warning,border:"none",borderRadius:"8px",fontSize:"12px",fontWeight:"700",cursor:"pointer"}}>📋 แจ้งออก</button>}
              <button onClick={()=>del(e["Employee ID"])} style={{flex:1,minWidth:"70px",padding:"8px",background:C.dangerLight,color:C.danger,border:"none",borderRadius:"8px",fontSize:"12px",fontWeight:"700",cursor:"pointer"}}>🗑️ ลบ</button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN: WORK SCHEDULE
// ═══════════════════════════════════════════════════════════════════════════════
const ScheduleScreen=()=>{
  const {apiUrl,user,schedules,setSchedules}=useContext(AppContext);
  const blank={"Key_ID":"","Shift_work":"A","Shift_DAY&Nigth":"Day","start":"06:00","end":"18:00","approve_By":"","approve_day_time":""};
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState(blank);
  const [rotationMode,setRotationMode]=useState("single"); // single, rotate7, rotate14, customEnd
  const [rotationEndDate,setRotationEndDate]=useState(new Date(Date.now()+7*86400000).toISOString().slice(0,10));
  const [nextShifts,setNextShifts]=useState([]); // Preview
  const F=(k,v)=>setForm(f=>({...f,[k]:v}));

  const generateRotation=(shiftData,mode,endDate)=>{
    const result=[shiftData];
    const startDate=new Date();
    const end=new Date(endDate);
    
    if(mode==="rotate7"){
      let currentDate=new Date(startDate);
      while(currentDate<end){
        currentDate.setDate(currentDate.getDate()+7);
        result.push({...shiftData,Key_ID:genKey("SCH")});
      }
    } else if(mode==="rotate14"){
      let currentDate=new Date(startDate);
      while(currentDate<end){
        currentDate.setDate(currentDate.getDate()+14);
        result.push({...shiftData,Key_ID:genKey("SCH")});
      }
    }
    return result;
  };

  const handleRotationModeChange=(mode)=>{
    setRotationMode(mode);
    if(form["Shift_work"]&&form["start"]&&form["end"]){
      const shiftData={...form,"Key_ID":genKey("SCH"),"approve_By":user?.["Employee ID"],"approve_day_time":nowTH()};
      const generated=generateRotation(shiftData,mode,rotationEndDate);
      setNextShifts(generated);
    }
  };

  const save=()=>{
    if(!form["Shift_work"]||!form["start"]||!form["end"]){toast("กรุณากรอกข้อมูลให้ครบ","warning");return;}
    
    let toSave=[];
    if(rotationMode==="single"){
      const full={...form,"Key_ID":form["Key_ID"]||genKey("SCH"),"approve_By":user?.["Employee ID"],"approve_day_time":nowTH()};
      toSave=[full];
    } else {
      toSave=generateRotation({...form,"approve_By":user?.["Employee ID"],"approve_day_time":nowTH()},rotationMode,rotationEndDate);
    }

    // Check for overlaps
    const allSchedules=[...schedules,...toSave];
    const shifts=["A","B","C","D"];
    let hasOverlap=false;
    
    shifts.forEach(shift=>{
      const shiftSchedules=allSchedules.filter(s=>s["Shift_work"]===shift);
      for(let i=0;i<shiftSchedules.length;i++){
        for(let j=i+1;j<shiftSchedules.length;j++){
          const s1=shiftSchedules[i];const s2=shiftSchedules[j];
          if(s1["Shift_DAY&Nigth"]===s2["Shift_DAY&Nigth"]){
            if((s1["start"]<s2["end"]&&s1["end"]>s2["start"])){
              hasOverlap=true;
              break;
            }
          }
        }
      }
    });

    if(hasOverlap){toast("⚠️ เวลากะ "+form["Shift_work"]+" ทับซ้อนกับ shift อื่น","error");return;}

    toSave.forEach(s=>{
      const exists=schedules.find(x=>x["Key_ID"]===s["Key_ID"]);
      if(!exists)setSchedules(prev=>[s,...prev]);
    });
    
    apiPost(apiUrl,{action:"saveScheduleRotation",data:toSave});
    toast(`✅ บันทึก ${toSave.length} รอบกะสำเร็จ`,"success");
    setShowForm(false);
    setForm(blank);
    setNextShifts([]);
    setRotationMode("single");
  };

  const del=(id)=>confirmModal("ลบตารางกะ",`ยืนยันลบ ${id}?`,()=>{
    setSchedules(prev=>prev.filter(s=>s["Key_ID"]!==id));
    toast("ลบสำเร็จ","success");
  });

  const shiftCol={"A":C.blue,"B":C.purple,"C":C.teal,"D":C.warning};
  const shiftBg={"A":C.blueLight,"B":C.purpleLight,"C":C.tealLight,"D":C.warningLight};

  return(
    <div>
      <div style={{background:C.navy,padding:"15px 14px",position:"sticky",top:0,zIndex:10}}>
        <div style={{fontSize:"17px",fontWeight:"700",color:C.white}}>🕐 ตารางกะการทำงาน</div>
        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.55)",marginTop:"4px"}}>{schedules.length} รอบกะ</div>
      </div>
      <div style={{padding:"11px 11px 80px"}}>
        {user?.["Role"]==="admin"||user?.["Role"]==="leader"?(
          <>
            <Btn onClick={()=>{setForm(blank);setShowForm(!showForm);setNextShifts([]);}} sm style={{marginBottom:"10px"}}>+ เพิ่มตารางกะ</Btn>
            {showForm&&(
              <Card style={{border:`2px solid ${C.blue}`}}>
                <div style={{fontSize:"14px",fontWeight:"700",color:C.navy,marginBottom:"12px"}}>🕐 เพิ่ม / แก้ไขตารางกะ</div>
                
                <div style={{fontSize:"12px",fontWeight:"700",color:C.gray700,marginBottom:"8px"}}>📅 รูปแบบการหมุนกะ</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"8px",marginBottom:"14px"}}>
                  {[{v:"single",l:"🔹 กะเดียว"},{v:"rotate7",l:"🔄 หมุน 7 วัน"},{v:"rotate14",l:"🔄 หมุน 14 วัน"}].map(m=>(
                    <button key={m.v} onClick={()=>handleRotationModeChange(m.v)} style={{padding:"10px 6px",borderRadius:"9px",border:`2px solid ${rotationMode===m.v?C.blue:C.gray100}`,background:rotationMode===m.v?C.blueLight:C.white,color:rotationMode===m.v?C.blue:C.gray700,fontWeight:"700",fontSize:"12px",cursor:"pointer"}}>{m.l}</button>
                  ))}
                </div>

                <Field label="Key_ID (ว่างเพื่อสร้างใหม่)" value={form["Key_ID"]} onChange={v=>F("Key_ID",v)} placeholder="เช่น SCH-001"/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
                  <Sel label="Shift_work" value={form["Shift_work"]} onChange={v=>{F("Shift_work",v);if(nextShifts.length>0)handleRotationModeChange(rotationMode);}} options={["A","B","C","D"]}/>
                  <Sel label="Shift_DAY&Nigth" value={form["Shift_DAY&Nigth"]} onChange={v=>F("Shift_DAY&Nigth",v)} options={["Day","Night"]}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
                  <Field label="start (เวลาเริ่ม)" value={form["start"]} onChange={v=>{F("start",v);if(nextShifts.length>0)handleRotationModeChange(rotationMode);}} type="time"/>
                  <Field label="end (เวลาสิ้นสุด)" value={form["end"]} onChange={v=>{F("end",v);if(nextShifts.length>0)handleRotationModeChange(rotationMode);}} type="time"/>
                </div>

                {(rotationMode==="rotate7"||rotationMode==="rotate14")&&(
                  <Field label={`หมุนกะจนถึงวันที่ (${rotationMode==="rotate7"?"ทุก 7 วัน":"ทุก 14 วัน"})`} value={rotationEndDate} onChange={v=>{setRotationEndDate(v);if(form["Shift_work"]&&form["start"]&&form["end"])handleRotationModeChange(rotationMode);}} type="date"/>
                )}

                {nextShifts.length>1&&(
                  <Card style={{background:C.blueLight,border:`1px solid ${C.blue}33`,marginBottom:"10px"}}>
                    <div style={{fontSize:"12px",fontWeight:"700",color:C.navy,marginBottom:"8px"}}>📋 ตัวอย่าง {nextShifts.length} รอบกะที่จะสร้าง:</div>
                    {nextShifts.slice(0,5).map((s,i)=>(
                      <div key={i} style={{fontSize:"11px",color:C.gray700,padding:"4px 0",borderBottom:i<Math.min(5,nextShifts.length-1)?`1px solid ${C.blue}22`:"none"}}>
                        <Badge label={`${s["Shift_work"]}`} color={shiftCol[s["Shift_work"]]||C.blue} bg={shiftBg[s["Shift_work"]]||C.blueLight}/> 
                        <span style={{marginLeft:"8px"}}>{s["start"]} - {s["end"]} ({s["Shift_DAY&Nigth"]})</span>
                      </div>
                    ))}
                    {nextShifts.length>5&&<div style={{fontSize:"10px",color:C.gray500,padding:"4px 0"}}>... และอีก {nextShifts.length-5} รอบ</div>}
                  </Card>
                )}

                <Btn onClick={save} sm>💾 บันทึกตารางกะ{nextShifts.length>1?` (${nextShifts.length} รอบ)`:""}</Btn>
              </Card>
            )}
          </>
        ):null}
        
        {schedules.map((s,i)=>(
          <Card key={i}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
              <div>
                <div style={{fontSize:"16px",fontWeight:"800",color:C.navy}}>กะ {s["Shift_work"]}</div>
                <div style={{fontSize:"11px",color:C.gray500}}>{s["Key_ID"]}</div>
              </div>
              <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
                <Badge label={s["Shift_work"]} color={shiftCol[s["Shift_work"]]||C.blue} bg={shiftBg[s["Shift_work"]]||C.blueLight}/>
                <Badge label={s["Shift_DAY&Nigth"]} color={s["Shift_DAY&Nigth"]==="Day"?C.warning:C.purple} bg={s["Shift_DAY&Nigth"]==="Day"?C.warningLight:C.purpleLight}/>
              </div>
            </div>
            <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
              <div style={{flex:1,background:C.successLight,borderRadius:"9px",padding:"10px",textAlign:"center"}}>
                <div style={{fontSize:"10px",color:C.success,fontWeight:"700"}}>เริ่ม</div>
                <div style={{fontSize:"20px",fontWeight:"800",color:C.success}}>{s["start"]}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",fontSize:"16px"}}>→</div>
              <div style={{flex:1,background:C.dangerLight,borderRadius:"9px",padding:"10px",textAlign:"center"}}>
                <div style={{fontSize:"10px",color:C.danger,fontWeight:"700"}}>สิ้นสุด</div>
                <div style={{fontSize:"20px",fontWeight:"800",color:C.danger}}>{s["end"]}</div>
              </div>
            </div>
            <Row label="อนุมัติโดย" value={s["approve_By"]}/>
            <Row label="วันที่อนุมัติ" value={s["approve_day_time"]} border={false}/>
            {(user?.["Role"]==="admin"||user?.["Role"]==="leader")&&(
              <div style={{display:"flex",gap:"7px",marginTop:"10px"}}>
                <button onClick={()=>{setForm({...s});setShowForm(true);}} style={{flex:1,padding:"8px",background:C.blueLight,color:C.blue,border:"none",borderRadius:"8px",fontSize:"12px",fontWeight:"700",cursor:"pointer"}}>✏️ แก้ไข</button>
                <button onClick={()=>del(s["Key_ID"])} style={{flex:1,padding:"8px",background:C.dangerLight,color:C.danger,border:"none",borderRadius:"8px",fontSize:"12px",fontWeight:"700",cursor:"pointer"}}>🗑️ ลบ</button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN: DISCREPANCY / ADJUSTMENT
// ═══════════════════════════════════════════════════════════════════════════════
const AdjustmentScreen=()=>{
  const {apiUrl,user,products,adjustments,setAdjustments,setEditLogs}=useContext(AppContext);
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({"Part_No.":"","Q'ty":0});
  const F=(k,v)=>setForm(f=>({...f,[k]:v}));

  const submit=()=>{
    if(!form["Part_No."]||form["Q'ty"]===undefined){toast("กรุณากรอก Part No. และจำนวน","warning");return;}
    const prod=products.find(p=>stripSpaces(p["Part No."])===stripSpaces(form["Part_No."]));
    const sysQty=prod?.["Balance"]||0;
    const dif=Number(form["Q'ty"])-sysQty;
    const rec={"KEY_ID":genKey("ADJ"),"Part_No.":form["Part_No."],"Q'ty":Number(form["Q'ty"]),"stock_Q'ty":sysQty,"DIF":dif,"by":user?.["Employee ID"],"Day_Time":nowTH(),"approve_By":"","approve_day_time":"","Status":"pending"};
    setAdjustments(prev=>[rec,...prev]);
    apiPost(apiUrl,{action:"requestAdjustment",data:rec});
    toast("ส่งคำขอปรับยอดสำเร็จ","success");setShowForm(false);setForm({"Part_No.":"","Q'ty":0});
  };

  const approve=(key)=>{
    const rec=adjustments.find(a=>a["KEY_ID"]===key);
    if(!rec)return;
    const before=JSON.stringify(rec);
    const updated={...rec,"approve_By":user?.["Employee ID"],"approve_day_time":nowTH(),"Status":"approved"};
    setAdjustments(prev=>prev.map(a=>a["KEY_ID"]===key?updated:a));
    setEditLogs(prev=>[{Key_ID:genKey("LOG"),Type_EDI:"ApproveAdj","TLABAL_KEY":key,"Part_No.":rec["Part_No."],"Q'ty":rec["Q'ty"],By:user?.["Employee ID"],Shift:user?.["Shift_work"],Day_Time:nowTH(),DataBefore:before,DataAfter:JSON.stringify(updated)},...prev]);
    apiPost(apiUrl,{action:"approveAdjustment",keyId:key,by:user?.["Employee ID"],dayTime:nowTH()});
    toast("อนุมัติปรับยอดสำเร็จ","success");
  };

  const reject=(key)=>confirmModal("ปฏิเสธ","ยืนยันปฏิเสธคำขอนี้?",()=>{
    setAdjustments(prev=>prev.map(a=>a["KEY_ID"]===key?{...a,"approve_By":user?.["Employee ID"],"approve_day_time":nowTH(),"Status":"rejected"}:a));
    toast("ปฏิเสธคำขอแล้ว","warning");
  });

  const statBadge={"pending":{l:"รออนุมัติ",c:C.warning,b:C.warningLight},"approved":{l:"อนุมัติแล้ว",c:C.success,b:C.successLight},"rejected":{l:"ปฏิเสธ",c:C.danger,b:C.dangerLight}};
  const pending=adjustments.filter(a=>a["Status"]==="pending").length;

  return(
    <div>
      <div style={{background:C.navy,padding:"15px 14px",position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:"17px",fontWeight:"700",color:C.white}}>⚖️ ขอปรับยอดสต๊อก</div>
            <div style={{fontSize:"12px",color:"rgba(255,255,255,0.55)",marginTop:"3px"}}>discrepancy_requests</div>
          </div>
          {pending>0&&<div style={{background:C.danger,color:C.white,borderRadius:"99px",padding:"4px 12px",fontSize:"12px",fontWeight:"800"}}>{pending} รอ</div>}
        </div>
      </div>
      <div style={{padding:"11px 11px 80px"}}>
        <Btn onClick={()=>setShowForm(!showForm)} sm style={{marginBottom:"10px"}}>+ ส่งคำขอปรับยอด</Btn>
        {showForm&&(
          <Card style={{border:`2px solid ${C.blue}`}}>
            <div style={{fontSize:"14px",fontWeight:"700",color:C.navy,marginBottom:"12px"}}>📋 แบบฟอร์มขอปรับยอด</div>
            <Field label="Part_No. *" value={form["Part_No."]} onChange={v=>F("Part_No.",v)} placeholder="เช่น 1118337001 CTC"/>
            {form["Part_No."]&&(()=>{
              const p=products.find(x=>stripSpaces(x["Part No."])===stripSpaces(form["Part_No."]));
              return p?<InfoBox>ยอดในระบบ: <b>{p["Balance"]} ชิ้น</b> · {p["Part Name"]}</InfoBox>:null;
            })()}
            <Field label="จำนวนที่นับได้จริง (Q'ty)" value={form["Q'ty"]} onChange={v=>F("Q'ty",Number(v))} type="number" placeholder="กรอกจำนวนจริงที่นับได้"/>
            <Btn onClick={submit} color={C.blue}>📤 ส่งคำขอ</Btn>
          </Card>
        )}
        {adjustments.map((a,i)=>{
          const s=statBadge[a["Status"]]||statBadge.pending;
          const dif=a["DIF"]||0;
          return(
            <Card key={i}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"10px"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:"14px",fontWeight:"800",color:C.navy,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a["Part_No."]}</div>
                  <div style={{fontSize:"11px",color:C.gray500}}>{a["KEY_ID"]}</div>
                </div>
                <Badge label={s.l} color={s.c} bg={s.b}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"7px",marginBottom:"10px"}}>
                <div style={{background:C.dangerLight,borderRadius:"8px",padding:"9px",textAlign:"center"}}><div style={{fontSize:"10px",color:C.danger,fontWeight:"700"}}>ยอดระบบ</div><div style={{fontSize:"18px",fontWeight:"800",color:C.danger}}>{a["stock_Q'ty"]||0}</div></div>
                <div style={{background:C.successLight,borderRadius:"8px",padding:"9px",textAlign:"center"}}><div style={{fontSize:"10px",color:C.success,fontWeight:"700"}}>ยอดจริง</div><div style={{fontSize:"18px",fontWeight:"800",color:C.success}}>{a["Q'ty"]||0}</div></div>
                <div style={{background:dif<0?C.dangerLight:dif>0?C.successLight:C.gray100,borderRadius:"8px",padding:"9px",textAlign:"center"}}><div style={{fontSize:"10px",color:dif<0?C.danger:dif>0?C.success:C.gray500,fontWeight:"700"}}>DIF</div><div style={{fontSize:"18px",fontWeight:"800",color:dif<0?C.danger:dif>0?C.success:C.gray700}}>{dif>0?"+":""}{dif}</div></div>
              </div>
              {[["by",a["by"]],["Day_Time",a["Day_Time"]],["approve_By",a["approve_By"]||"-"],["approve_day_time",a["approve_day_time"]||"-"]].map(([k,v])=>(<Row key={k} label={k} value={v}/>))}
              {a["Status"]==="pending"&&user?.["Role"]==="admin"&&(
                <div style={{display:"flex",gap:"8px",marginTop:"10px"}}>
                  <button onClick={()=>approve(a["KEY_ID"])} style={{flex:1,padding:"10px",background:C.successLight,color:C.success,border:`1.5px solid ${C.success}44`,borderRadius:"9px",fontSize:"13px",fontWeight:"800",cursor:"pointer"}}>✅ อนุมัติ</button>
                  <button onClick={()=>reject(a["KEY_ID"])} style={{flex:1,padding:"10px",background:C.dangerLight,color:C.danger,border:`1.5px solid ${C.danger}44`,borderRadius:"9px",fontSize:"13px",fontWeight:"800",cursor:"pointer"}}>❌ ปฏิเสธ</button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN: EDIT LOGS (Audit Trail)
// ═══════════════════════════════════════════════════════════════════════════════
const EditLogsScreen=()=>{
  const {editLogs}=useContext(AppContext);
  const [selected,setSelected]=useState(null);
  const typeColor={"Edit":C.warning,"Delete":C.danger,"ApproveAdj":C.success,"Transfer":C.blue};
  return(
    <div>
      <div style={{background:C.navy,padding:"15px 14px",position:"sticky",top:0,zIndex:10}}>
        <div style={{fontSize:"17px",fontWeight:"700",color:C.white}}>🔍 Audit Trail</div>
        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.55)",marginTop:"3px"}}>edit_logs · บันทึกการแก้ไข</div>
      </div>
      {selected&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:9000,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
          <div style={{background:C.white,borderRadius:"20px 20px 0 0",padding:"20px",maxHeight:"75vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
              <div style={{fontSize:"16px",fontWeight:"800",color:C.navy}}>รายละเอียดบันทึก</div>
              <button onClick={()=>setSelected(null)} style={{background:C.gray100,border:"none",borderRadius:"50%",width:"32px",height:"32px",cursor:"pointer",fontSize:"16px"}}>✕</button>
            </div>
            {[["Key_ID",selected["Key_ID"]],["Type_EDI",selected["Type_EDI"]],["TLABAL_KEY",selected["TLABAL_KEY"]],["Part_No.",selected["Part_No."]],["Q'ty",selected["Q'ty"]],["By",selected["By"]],["Shift",selected["Shift"]],["Day_Time",selected["Day_Time"]],["q'ty_Box",selected["q'ty_Box"]],["Package Type & Size",selected["Package Type & Size"]],["Location",selected["Location"]]].map(([k,v])=>(<Row key={k} label={k} value={v}/>))}
            {selected["DataBefore"]&&<div style={{marginTop:"12px"}}><div style={{fontSize:"12px",fontWeight:"700",color:C.danger,marginBottom:"6px"}}>Before:</div><pre style={{background:C.gray50,borderRadius:"8px",padding:"10px",fontSize:"11px",overflowX:"auto",color:C.gray700,wordBreak:"break-all",whiteSpace:"pre-wrap"}}>{selected["DataBefore"]}</pre></div>}
            {selected["DataAfter"]&&<div style={{marginTop:"10px"}}><div style={{fontSize:"12px",fontWeight:"700",color:C.success,marginBottom:"6px"}}>After:</div><pre style={{background:C.gray50,borderRadius:"8px",padding:"10px",fontSize:"11px",overflowX:"auto",color:C.gray700,wordBreak:"break-all",whiteSpace:"pre-wrap"}}>{selected["DataAfter"]}</pre></div>}
          </div>
        </div>
      )}
      <div style={{padding:"11px 11px 80px"}}>
        {editLogs.length===0?<Empty icon="📋" title="ยังไม่มี Audit Log" sub="การแก้ไขจะถูกบันทึกไว้ที่นี่"/>:
        editLogs.map((log,i)=>{
          const tc=typeColor[log["Type_EDI"]]||C.gray700;
          return(
            <Card key={i} onClick={()=>setSelected(log)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"7px"}}>
                <Badge label={log["Type_EDI"]||"Log"} color={tc} bg={tc+"22"}/>
                <span style={{fontSize:"11px",color:C.gray500}}>{log["Day_Time"]}</span>
              </div>
              <div style={{fontSize:"13px",fontWeight:"700",color:C.navy,marginBottom:"3px"}}>{log["Part_No."]||"-"}</div>
              <div style={{fontSize:"12px",color:C.gray500}}>{log["TLABAL_KEY"]} · By: {log["By"]} · กะ {log["Shift"]}</div>
              <div style={{fontSize:"11px",color:C.blue,marginTop:"6px",fontWeight:"600"}}>แตะเพื่อดูรายละเอียด →</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN: REPORTS (Excel)
// ═══════════════════════════════════════════════════════════════════════════════
const ReportScreen=()=>{
  const {transIn,transOut,products,locations}=useContext(AppContext);
  const [startDate,setStartDate]=useState(new Date(Date.now()-7*86400000).toISOString().slice(0,10));
  const [endDate,setEndDate]=useState(new Date().toISOString().slice(0,10));
  const [reportType,setReportType]=useState("stock");
  const [generating,setGenerating]=useState(false);

  const getDates=()=>{
    const dates=[];const cur=new Date(startDate);const end=new Date(endDate);
    while(cur<=end){dates.push(cur.toISOString().slice(0,10));cur.setDate(cur.getDate()+1);}
    return dates;
  };

  const generateStockReport=()=>{
    const dates=getDates();
    const headers=["Item","Part No.","Part Name","Customer","SAP No.","Old Stock",...dates.flatMap(d=>[`${d}_IN`,`${d}_OUT`,`${d}_Balance`]),"Final Balance"];
    const rows=[headers];
    products.forEach((p,idx)=>{
      const row=[idx+1,p["Part No."],p["Part Name"],p["Custumer"],p["SAP No."],p["Old Stock"]||0];
      let bal=p["Old Stock"]||0;
      dates.forEach(d=>{
        const inQty=transIn.filter(t=>t["Part No."]===p["Part No."]&&t["Day_Time"]?.startsWith(d)).reduce((s,t)=>s+(t["Q'ty"]||0),0);
        const outQty=transOut.filter(t=>t["Part No."]===p["Part No."]&&t["Day_Time"]?.startsWith(d)).reduce((s,t)=>s+(t["Q'ty"]||0),0);
        bal+=inQty-outQty;row.push(inQty,outQty,bal);
      });
      row.push(bal);rows.push(row);
    });
    return rows;
  };

  const generateTxReport=(type)=>{
    const tx=type==="IN"?transIn:transOut;
    const filtered=tx.filter(t=>(t["Day_Time"]||"").slice(0,10)>=startDate&&(t["Day_Time"]||"").slice(0,10)<=endDate);
    const key=type==="IN"?"Type_IN":"Type_OUT";
    const headers=["No.",key,"LABAL_KEY","LABAL_Scan","Part_No._Scan","Part No.","Q'ty","By","Shift","Day_Time","q'ty_Box","Package Type & Size","Location"];
    const rows=[headers,...filtered.map((t,i)=>headers.map((h,j)=>j===0?i+1:(t[h]!==undefined?t[h]:"")))];
    return rows;
  };

  const generateLocationReport=()=>{
    const headers=["No.","Customer","SAP No.","Part No.","Part Name","location","IN","Out","Balance"];
    return[headers,...locations.map((l,i)=>[i+1,l["Custumer"],l["SAP No."],l["Part No."],l["Part Name"],l["location"],l["IN"],l["Out"],l["Balance"]])];
  };

  const doGenerate=()=>{
    setGenerating(true);
    try{
      const wb=XLSX.utils.book_new();
      const addSheet=(name,rows)=>{
        const ws=XLSX.utils.aoa_to_sheet(rows);
        ws["!cols"]=rows[0].map(()=>({wch:16}));
        XLSX.utils.book_append_sheet(wb,ws,name);
      };
      if(reportType==="stock"||reportType==="all")addSheet("Stock Report",generateStockReport());
      if(reportType==="in"||reportType==="all")addSheet("Transactions IN",generateTxReport("IN"));
      if(reportType==="out"||reportType==="all")addSheet("Transactions OUT",generateTxReport("OUT"));
      if(reportType==="location"||reportType==="all")addSheet("Location",generateLocationReport());
      XLSX.writeFile(wb,`WMS_Report_${startDate}_${endDate}.xlsx`);
      toast("✅ ดาวน์โหลด Excel สำเร็จ","success");
    }catch(e){toast("เกิดข้อผิดพลาด: "+e.message,"error");}
    setGenerating(false);
  };

  const dates=getDates();
  const preview=generateStockReport().slice(0,4);

  return(
    <div>
      <div style={{background:C.navy,padding:"15px 14px",position:"sticky",top:0,zIndex:10}}>
        <div style={{fontSize:"17px",fontWeight:"700",color:C.white}}>📊 รายงาน Excel</div>
        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.55)",marginTop:"4px"}}>SheetJS — ดาวน์โหลด .xlsx</div>
      </div>
      <div style={{padding:"11px 11px 80px"}}>
        <Card>
          <div style={{fontSize:"14px",fontWeight:"700",color:C.navy,marginBottom:"14px"}}>🗓️ เลือกช่วงวันที่</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
            <Field label="วันเริ่มต้น" value={startDate} onChange={setStartDate} type="date"/>
            <Field label="วันสิ้นสุด" value={endDate} onChange={setEndDate} type="date"/>
          </div>
          <Sel label="ประเภทรายงาน" value={reportType} onChange={setReportType} options={[{value:"stock",label:"📦 Stock (In/Out/Balance)"},{value:"in",label:"📥 Transactions IN"},{value:"out",label:"📤 Transactions OUT"},{value:"location",label:"🏗️ Location Report"},{value:"all",label:"📋 ทุกรายงาน (All Sheets)"}]}/>
          <InfoBox color={C.success} bg={C.successLight}>
            📋 {dates.length} วัน · {products.length} SKU · {transIn.length} IN · {transOut.length} OUT
          </InfoBox>
          <Btn onClick={doGenerate} disabled={generating} color={C.success}>{generating?"กำลังสร้างไฟล์...":"📥 ดาวน์โหลด Excel"}</Btn>
        </Card>
        <Card>
          <div style={{fontSize:"13px",fontWeight:"700",color:C.navy,marginBottom:"10px"}}>ตัวอย่าง Stock Report</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:"10px",tableLayout:"fixed",minWidth:"500px"}}>
              <tbody>
                {preview.map((row,ri)=>(
                  <tr key={ri} style={{background:ri===0?C.navy:ri%2===0?C.gray50:C.white}}>
                    {row.slice(0,8).map((cell,ci)=>(
                      <td key={ci} style={{padding:"6px 5px",color:ri===0?C.white:C.gray900,fontWeight:ri===0||ci===1?"700":"400",borderBottom:`1px solid ${C.gray100}`,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {cell}
                      </td>
                    ))}
                    <td style={{padding:"6px 5px",color:ri===0?C.white:C.gray500}}>...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN: SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════
const SettingsScreen=()=>{
  const {apiUrl,setApiUrl,user,logout}=useContext(AppContext);
  const [url,setUrl]=useState(apiUrl);
  const save=()=>{setApiUrl(url);localStorage.setItem(API_URL_KEY,url);toast("บันทึก API URL สำเร็จ","success");};
  return(
    <div>
      <div style={{background:C.navy,padding:"15px 14px",position:"sticky",top:0,zIndex:10}}>
        <div style={{fontSize:"17px",fontWeight:"700",color:C.white}}>⚙️ ตั้งค่าระบบ</div>
      </div>
      <div style={{padding:"11px 11px 80px"}}>
        <Card>
          <div style={{display:"flex",alignItems:"center",gap:"13px",marginBottom:"14px"}}>
            <div style={{width:"50px",height:"50px",background:C.blueLight,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"22px",fontWeight:"800",color:C.blue,flexShrink:0}}>{(user?.["Full Name"]||"?").charAt(0)}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:"16px",fontWeight:"800",color:C.navy}}>{user?.["Full Name"]}</div>
              <div style={{fontSize:"12px",color:C.gray500}}>{user?.["Employee ID"]} · {user?.["Department"]}</div>
              <div style={{display:"flex",gap:"5px",marginTop:"5px"}}>
                <Badge label={user?.["Role"]||"worker"} color={C.navy} bg={C.blueLight}/>
                <Badge label={`กะ ${user?.["Shift_work"]}`} color={C.blue} bg={C.blueLight}/>
              </div>
            </div>
          </div>
          <Btn onClick={logout} color={C.danger} sm>🚪 ออกจากระบบ</Btn>
        </Card>
        <Card>
          <div style={{fontSize:"14px",fontWeight:"700",color:C.navy,marginBottom:"5px"}}>🔗 Google Apps Script API URL</div>
          <div style={{fontSize:"12px",color:C.gray500,marginBottom:"12px"}}>วาง URL ของ Deployed Web App</div>
          <textarea value={url} onChange={e=>setUrl(e.target.value)} rows={5}
            style={{width:"100%",padding:"11px 13px",borderRadius:"9px",border:`1.5px solid ${C.gray300}`,fontSize:"11px",fontFamily:"monospace",boxSizing:"border-box",resize:"vertical",color:C.gray900}}/>
          <Btn onClick={save} style={{marginTop:"10px"}}>💾 บันทึก URL</Btn>
        </Card>
        <Card>
          <div style={{fontSize:"14px",fontWeight:"700",color:C.navy,marginBottom:"12px"}}>📋 Sheet ที่ใช้ในระบบ</div>
          {[["products","Product Catalog"],["employees","Employee Management"],["transactions IN","Stock Inbound"],["transactions OUT","Stock Outbound"],["discrepancy_requests","Stock Adjustment"],["Location","Location/Shelf"],["Work_schedule","Shift Schedule"],["LOCATION_ID","Location Master"],["edit_logs","Audit Trail"]].map(([k,v])=>(
            <div key={k} style={{padding:"10px 0",borderBottom:`1px solid ${C.gray100}`,display:"flex",justifyContent:"space-between"}}>
              <span style={{fontSize:"12px",fontWeight:"600",color:C.gray700}}>{k}</span>
              <span style={{fontSize:"12px",color:C.gray500}}>{v}</span>
            </div>
          ))}
        </Card>
        <Card>
          <div style={{fontSize:"12px",color:C.gray500,lineHeight:"1.8"}}>
            <div style={{fontWeight:"700",color:C.navy,marginBottom:"8px"}}>ℹ️ คำแนะนำการใช้</div>
            • KEY Format: Customer-Part No<br/>
            • Shift: Day (8:30-20:30), Night (20:30-8:30)<br/>
            • BOI: แสดงการเลือกลูกค้าหรือลาเบลที่ค้างไว้<br/>
            • ปิดบิลระบบ: อัตโนมัติทุกวันที่ 1 ของเดือน<br/>
            • บันทึกการแก้ไข: ลงเข้า edit_logs อัตโนมัติ
          </div>
        </Card>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// NAV + APP SHELL
// ═══════════════════════════════════════════════════════════════════════════════
const MAIN_NAV=[
  {id:"dashboard",label:"หน้าหลัก",icon:"🏠"},
  {id:"inbound",label:"รับเข้า",icon:"📥"},
  {id:"outbound",label:"โอนออก",icon:"📤"},
  {id:"more",label:"เพิ่มเติม",icon:"☰"},
];
const MORE_ITEMS=[
  {id:"product",label:"สินค้า",icon:"🗂️"},
  {id:"location",label:"ชั้นวาง",icon:"🏗️"},
  {id:"employee",label:"พนักงาน",icon:"👥"},
  {id:"schedule",label:"ตารางกะ",icon:"🕐"},
  {id:"adjustment",label:"ปรับยอด",icon:"⚖️"},
  {id:"editlogs",label:"Audit Log",icon:"🔍"},
  {id:"report",label:"รายงาน",icon:"📊"},
  {id:"settings",label:"ตั้งค่า",icon:"⚙️"},
];

const AppShell=()=>{
  const {user,adjustments}=useContext(AppContext);
  const [screen,setScreen]=useState("dashboard");
  const [showMore,setShowMore]=useState(false);
  const pendingAdj=adjustments.filter(a=>a["Status"]==="pending").length;
  const go=(id)=>{setScreen(id);setShowMore(false);};
  const SCREENS={
    dashboard:<DashboardScreen/>,product:<ProductScreen/>,inbound:<InboundScreen/>,outbound:<OutboundScreen/>,
    location:<LocationScreen/>,employee:<EmployeeScreen/>,schedule:<ScheduleScreen/>,
    adjustment:<AdjustmentScreen/>,editlogs:<EditLogsScreen/>,report:<ReportScreen/>,settings:<SettingsScreen/>
  };
  return(
    <div style={{maxWidth:"480px",margin:"0 auto",background:C.offWhite,minHeight:"100vh",position:"relative"}}>
      {showMore&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:500}} onClick={()=>setShowMore(false)}>
          <div style={{position:"absolute",bottom:"64px",left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:"480px",background:C.white,borderRadius:"22px 22px 0 0",padding:"18px 14px 10px"}} onClick={e=>e.stopPropagation()}>
            <div style={{width:"36px",height:"4px",background:C.gray300,borderRadius:"2px",margin:"0 auto 16px"}}/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px"}}>
              {MORE_ITEMS.map(m=>(
                <button key={m.id} onClick={()=>go(m.id)} style={{background:screen===m.id?C.blueLight:C.gray50,border:`1.5px solid ${screen===m.id?C.blue:C.gray100}`,borderRadius:"13px",padding:"12px 6px",cursor:"pointer",textAlign:"center",position:"relative"}}>
                  <div style={{fontSize:"26px",marginBottom:"5px"}}>{m.icon}</div>
                  <div style={{fontSize:"11px",color:screen===m.id?C.blue:C.gray700,fontWeight:"700"}}>{m.label}</div>
                  {m.id==="adjustment"&&pendingAdj>0&&<div style={{position:"absolute",top:"8px",right:"8px",background:C.danger,color:C.white,borderRadius:"99px",fontSize:"9px",fontWeight:"800",padding:"2px 5px",minWidth:"16px",textAlign:"center"}}>{pendingAdj}</div>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <div style={{paddingBottom:"64px",minHeight:"100vh"}}>{SCREENS[screen]||<DashboardScreen/>}</div>
      <nav style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:"480px",background:C.white,borderTop:`1px solid ${C.gray100}`,display:"flex",zIndex:400,boxShadow:"0 -2px 12px rgba(0,0,0,0.06)"}}>
        {MAIN_NAV.map(n=>{
          const isMore=n.id==="more";const active=isMore?showMore:screen===n.id;
          return(
            <button key={n.id} onClick={()=>isMore?setShowMore(!showMore):go(n.id)} style={{flex:1,padding:"9px 0 7px",background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:"3px"}}>
              <div style={{fontSize:"23px",transition:"transform .15s",transform:active?"scale(1.18)":"scale(1)"}}>{n.icon}</div>
              <div style={{fontSize:"10px",fontWeight:"700",color:active?C.blue:C.gray500}}>{n.label}</div>
              {active&&<div style={{width:"22px",height:"2.5px",background:C.blue,borderRadius:"2px"}}/>}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════════════════════
export default function App(){
  const [user,setUser]=useState(()=>{try{return JSON.parse(localStorage.getItem(USER_KEY));}catch{return null;}});
  const [apiUrl,setApiUrl]=useState(()=>localStorage.getItem(API_URL_KEY)||DEFAULT_API);
  const [products,setProducts]=useState(DEMO_PRODUCTS);
  const [employees,setEmployees]=useState(DEMO_EMPLOYEES);
  const [locations,setLocations]=useState(DEMO_LOCATIONS);
  const [transIn,setTransIn]=useState(DEMO_TRANSACTIONS_IN);
  const [transOut,setTransOut]=useState(DEMO_TRANSACTIONS_OUT);
  const [adjustments,setAdjustments]=useState([]);
  const [editLogs,setEditLogs]=useState([]);
  const [schedules,setSchedules]=useState(DEMO_SCHEDULE);

  const login=(u)=>{setUser(u);localStorage.setItem(USER_KEY,JSON.stringify(u));};
  const logout=()=>confirmModal("ออกจากระบบ","ยืนยันการออกจากระบบ?",()=>{setUser(null);localStorage.removeItem(USER_KEY);});

  useEffect(()=>{
    if(!document.getElementById("wms-qr-script")){
      const s=document.createElement("script");s.id="wms-qr-script";
      s.src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
      document.head.appendChild(s);
    }
  },[]);

  const ctx={user,apiUrl,setApiUrl,login,logout,products,setProducts,employees,setEmployees,locations,setLocations,transIn,setTransIn,transOut,setTransOut,adjustments,setAdjustments,editLogs,setEditLogs,schedules,setSchedules};

  return(
    <AppContext.Provider value={ctx}>
      <div style={{fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",background:C.offWhite,minHeight:"100vh"}}>
        {!user?<LoginScreen/>:<AppShell/>}
      </div>
    </AppContext.Provider>
  );
}
