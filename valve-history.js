/* One archive chart for all eight mapped valve / guide-vane positions. */
(() => {
  const host=document.getElementById('tab-charts');if(!host)return;
  const colors=['#43d9c3','#60a5fa','#ffca58','#ed8ac8','#b7a0ff','#ff956b','#b3dc6b','#e5edf7'];
  const card=document.createElement('article');card.className='valve-history-card';card.id='valveHistoryCard';
  card.innerHTML=`<div class="valve-history-heading"><div><h2>ระดับการเปิดวาล์ว · ทุกจุด</h2><p>7 วาล์วสุญญากาศ + Diffuser Guide Vanes · 0% ปิด / 100% เปิด</p></div><span class="valve-history-source">PI ARCHIVE</span></div>
  <form class="valve-history-controls"><label>ช่วงย้อนหลัง<select id="valvePeriod"><option value="1">1 ชั่วโมง</option><option value="6">6 ชั่วโมง</option><option value="24" selected>24 ชั่วโมง</option><option value="168">7 วัน</option><option value="720">30 วัน</option><option value="17520">2 ปี</option><option value="custom">กำหนดเอง</option></select></label><label>ตั้งแต่<input type="datetime-local" id="valveFrom" required></label><label>ถึง<input type="datetime-local" id="valveTo" required></label><button type="submit" id="valveLoad">ดูข้อมูลย้อนหลัง</button><button type="button" id="valveNow">ถึงเวลาปัจจุบัน</button></form>
  <div class="valve-history-status" role="status" aria-live="polite">เลือกช่วงเวลาเพื่อดูประวัติวาล์วทั้งหมด</div>
  <div class="valve-history-plot"><svg viewBox="0 0 1100 370" preserveAspectRatio="none" role="img" aria-label="กราฟระดับการเปิดวาล์วทุกตัว เปอร์เซ็นต์เทียบเวลา"></svg><div class="valve-history-tooltip" hidden></div></div>
  <div class="valve-history-legend" aria-label="เลือกเส้นวาล์วที่ต้องการแสดง"></div><p class="valve-history-foot">กดชื่อวาล์วเพื่อซ่อน/แสดงเส้น · เลื่อนเมาส์บนกราฟเพื่อดูค่าทุกวาล์ว ณ เวลาเดียวกัน · ช่องว่างหมายถึงไม่มีข้อมูลที่ใช้ได้</p>`;
  host.prepend(card);
  const $=s=>card.querySelector(s),svg=$('svg'),legend=$('.valve-history-legend'),status=$('.valve-history-status'),tooltip=$('.valve-history-tooltip');
  let payload=null,busy=false,loaded=false;const hidden=new Set();
  const inputTime=t=>{const d=new Date(t),pad=x=>String(x).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;};
  const dateLabel=t=>new Date(t).toLocaleString('th-TH-u-ca-gregory',{year:'numeric',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
  function preset(){if($('#valvePeriod').value==='custom')return;const end=Date.now();$('#valveTo').value=inputTime(end);$('#valveFrom').value=inputTime(end-Number($('#valvePeriod').value)*3600000);}
  preset();$('#valveTo').max=inputTime(Date.now());$('#valveFrom').max=inputTime(Date.now());
  $('#valvePeriod').onchange=preset;
  [$('#valveFrom'),$('#valveTo')].forEach(el=>el.addEventListener('change',()=>$('#valvePeriod').value='custom'));
  $('#valveNow').onclick=()=>{const span=new Date($('#valveTo').value)-new Date($('#valveFrom').value);const now=Date.now();$('#valveTo').value=inputTime(now);$('#valveFrom').value=inputTime(now-(span>0?span:86400000));load();};
  $('form').onsubmit=e=>{e.preventDefault();load();};
  function draw(){
    const left=60,right=1070,top=22,bottom=325;
    let parts=[];
    for(let v=0;v<=100;v+=25){const y=bottom-v/100*(bottom-top);parts.push(`<line x1="${left}" x2="${right}" y1="${y}" y2="${y}" class="vh-grid"/><text x="48" y="${y+4}" text-anchor="end" class="vh-axis">${v}%</text>`);}
    if(payload){
      const begin=Date.parse(payload.start),end=Date.parse(payload.end),x=t=>left+(Date.parse(t)-begin)/(end-begin)*(right-left);
      for(let i=0;i<=4;i++){const t=begin+(end-begin)*i/4;parts.push(`<text x="${left+(right-left)*i/4}" y="353" text-anchor="${i===0?'start':i===4?'end':'middle'}" class="vh-axis">${dateLabel(t)}</text>`);}
      payload.series.forEach((s,i)=>{
        if(hidden.has(s.tag))return;let d='',pen=false,previous=null;
        for(const p of s.points){
          if(p.value===null){pen=false;previous=null;continue;}
          const t=Date.parse(p.time);if(previous!==null&&t-previous>payload.interval_seconds*1500)pen=false;
          d+=`${pen?'L':'M'}${x(p.time).toFixed(2)},${(bottom-p.value/100*(bottom-top)).toFixed(2)} `;pen=true;previous=t;
        }
        parts.push(`<path d="${d}" fill="none" stroke="${colors[i]}" stroke-width="2" vector-effect="non-scaling-stroke" class="vh-series"/>`);
      });
      if(!payload.valid_points)parts.push('<text x="550" y="175" text-anchor="middle" class="vh-empty">ไม่พบข้อมูลวาล์วที่ใช้ได้ในช่วงเวลานี้</text>');
      else if(payload.series.every(s=>hidden.has(s.tag)))parts.push('<text x="550" y="175" text-anchor="middle" class="vh-empty">เลือกวาล์วจากรายการด้านล่างเพื่อแสดงเส้น</text>');
    }else parts.push('<text x="550" y="175" text-anchor="middle" class="vh-empty">กำลังรอข้อมูลย้อนหลัง</text>');
    parts.push('<line id="valveCursor" y1="22" y2="325" stroke="#fff9" stroke-dasharray="4 4" visibility="hidden"/>');svg.innerHTML=parts.join('');
  }
  function renderLegend(){
    legend.replaceChildren();payload.series.forEach((s,i)=>{
      const label=document.createElement('label'),check=document.createElement('input'),swatch=document.createElement('i'),text=document.createElement('span');
      check.type='checkbox';check.checked=!hidden.has(s.tag);swatch.style.background=colors[i];text.textContent=s.label+(s.error?' · อ่านไม่ได้':!s.points.some(p=>p.value!==null)?' · ไม่มีข้อมูล':'');
      label.append(check,swatch,text);label.title=s.tag;legend.append(label);
      check.onchange=()=>{check.checked?hidden.delete(s.tag):hidden.add(s.tag);draw();tooltip.hidden=true;};
    });
  }
  async function load(){
    if(busy)return;
    const from=new Date($('#valveFrom').value),to=new Date($('#valveTo').value);
    if(!Number.isFinite(+from)||!Number.isFinite(+to)||from>=to||to>Date.now()+60000||to-from>732*86400000){status.textContent='กรุณาเลือกวัน–เวลาให้ถูกต้อง ช่วงไม่เกิน 2 ปี และไม่เกินเวลาปัจจุบัน';return;}
    busy=true;card.querySelectorAll('form input,form select').forEach(el=>el.disabled=true);$('#valveLoad').disabled=true;$('#valveNow').disabled=true;status.textContent='กำลังอ่านประวัติ PI ของวาล์วทั้ง 8 จุด…';tooltip.hidden=true;
    try{
      const response=await fetch('/api/valve-history?'+new URLSearchParams({start:from.toISOString(),end:to.toISOString()}));
      if(!(response.headers.get('content-type')||'').includes('application/json'))throw Error('กรุณาเปิด Dashboard Server รุ่นล่าสุดใหม่เพื่อใช้งานกราฟย้อนหลัง');
      const data=await response.json();if(!response.ok)throw Error(data.error||'อ่านประวัติ PI ไม่สำเร็จ');
      payload=data;loaded=true;renderLegend();draw();
      const ok=data.series.filter(s=>s.points.some(p=>p.value!==null)).length;
      status.textContent=`${dateLabel(data.start)} – ${dateLabel(data.end)} · ข้อมูล ${ok}/8 จุด · ความละเอียด ${data.interval_seconds<3600?data.interval_seconds/60+' นาที':data.interval_seconds/3600+' ชั่วโมง'} · PI Archive`;
    }catch(error){payload=null;legend.replaceChildren();draw();status.textContent=error.message;loaded=false;}
    finally{busy=false;card.querySelectorAll('form input,form select').forEach(el=>el.disabled=false);$('#valveLoad').disabled=false;$('#valveNow').disabled=false;}
  }
  svg.addEventListener('pointermove',e=>{
    if(!payload)return;const rect=svg.getBoundingClientRect(),px=(e.clientX-rect.left)/rect.width*1100;
    if(px<60||px>1070){tooltip.hidden=true;return;}
    const t=Date.parse(payload.start)+(px-60)/1010*(Date.parse(payload.end)-Date.parse(payload.start));
    const cursor=svg.querySelector('#valveCursor');cursor.setAttribute('x1',px);cursor.setAttribute('x2',px);cursor.setAttribute('visibility','visible');
    tooltip.replaceChildren();const heading=document.createElement('strong');heading.textContent=dateLabel(t);tooltip.append(heading);
    payload.series.forEach((s,i)=>{
      if(hidden.has(s.tag))return;
      let lo=0,hi=s.points.length;while(lo<hi){const mid=(lo+hi)>>1;if(Date.parse(s.points[mid].time)<t)lo=mid+1;else hi=mid;}
      const options=[s.points[lo],s.points[lo-1]].filter(Boolean).sort((a,b)=>Math.abs(Date.parse(a.time)-t)-Math.abs(Date.parse(b.time)-t));
      const p=options[0],value=p&&Math.abs(Date.parse(p.time)-t)<=payload.interval_seconds*1000?p.value:null;
      const row=document.createElement('div');row.style.setProperty('--series-color',colors[i]);row.textContent=s.label+': '+(value===null?'—':value.toFixed(2)+'%');tooltip.append(row);
    });
    tooltip.hidden=false;tooltip.style.left=Math.max(8,Math.min(e.clientX-rect.left+15,rect.width-tooltip.offsetWidth-8))+'px';tooltip.style.top='12px';
  });
  svg.addEventListener('pointerleave',()=>{tooltip.hidden=true;svg.querySelector('#valveCursor')?.setAttribute('visibility','hidden');});
  new MutationObserver(()=>{if(!host.hidden&&host.classList.contains('active')&&!loaded)load();}).observe(host,{attributes:true,attributeFilter:['hidden','class']});
  draw();if(!host.hidden&&host.classList.contains('active'))load();
})();
