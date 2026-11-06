/* Shared time window and cursor for production monitoring and archive analysis. */
(() => {
  const host=document.getElementById('tab-charts');if(!host)return;
  const colors=['#45dbc3','#ffcb62','#6db0ff','#f38dbb','#b9a1ff','#ff9669','#b6dc6c','#edf3fa','#68d2ef','#d3b090'];
  const branches=[['2715','Suction Box'],['2721','Couch Roll'],['2716','Pick-up High'],['2717','Pick-up Low'],['2719','1st Press Felt'],['2718','2nd Press Felt'],['2720','3rd Press Felt'],['turbo','Turbo / Blower']];
  const card=document.createElement('article');card.className='valve-history-card monitor-workspace';card.id='monitorWorkspace';
  card.innerHTML=`<div class="valve-history-heading"><div><h2>Monitor & Analysis · Setpoint และกระบวนการ</h2><p>เลือกชุดสัญญาณ · ทุกกราฟใช้ช่วงเวลาเดียวกัน · SP เส้นประ / Actual เส้นทึบ</p></div><button type="button" class="monitor-export" disabled>ดาวน์โหลด CSV</button></div>
  <form class="valve-history-controls"><label>ชุดกราฟ<select id="monitorGroup"><option value="setpoints">Setpoint ทั้ง 8 จุด</option><optgroup label="SP เทียบ Actual + % Valve">${branches.map(([id,name])=>`<option value="controller_${id}">${name}</option>`).join('')}</optgroup><option value="energy">กำลังไฟ / รอบมอเตอร์ / พลังงานจำเพาะ</option><option value="production">การผลิต / ความเร็ว / ไอน้ำ</option><option value="quality">Dryness / Moisture / Basis Weight</option><option value="temperature">อุณหภูมิ Turbo / Motor</option><option value="dryer">แรงดันไอน้ำ Dryer</option></select></label>
  <label>ช่วงเวลา<select id="monitorPeriod"><option value="1">1 ชั่วโมง</option><option value="6" selected>6 ชั่วโมง</option><option value="24">24 ชั่วโมง</option><option value="168">7 วัน</option><option value="720">30 วัน</option><option value="17520">2 ปี</option><option value="custom">กำหนดเอง</option></select></label><label>ตั้งแต่<input id="monitorFrom" type="datetime-local" required></label><label>ถึง<input id="monitorTo" type="datetime-local" required></label><button type="submit">แสดงกราฟ</button><button type="button" id="monitorNow">ถึงเวลาปัจจุบัน</button></form>
  <div class="monitor-options"><label><input type="checkbox" id="monitorFollow"> ติดตามล่าสุด · ทุก 30 วินาที</label><span class="monitor-context">ชี้กราฟเพื่อดูเกรดและสถานะ ณ เวลานั้น</span></div>
  <div class="valve-history-status" role="status" aria-live="polite">เลือกชุดสัญญาณและช่วงเวลาที่ต้องการ</div><div class="monitor-plots"></div><div class="monitor-table-wrap"><table class="monitor-stats"><caption>สถิติจากจุดข้อมูลที่แสดงในช่วงที่เลือก</caption><thead><tr><th>สัญญาณ</th><th>หน่วย</th><th>ล่าสุดในช่วง</th><th>ต่ำสุด</th><th>สูงสุด</th><th>เฉลี่ย</th><th>ข้อมูลใช้ได้</th></tr></thead><tbody></tbody></table></div>
  <p class="valve-history-foot">ช่วงย้อนหลังยาวใช้จุดข้อมูลห่างขึ้นตามความละเอียดที่ระบุ สถิติไม่ใช่ค่าสูงสุด/ต่ำสุดทุกเหตุการณ์ใน PI · ช่องว่างคือข้อมูลขาดหาย/คุณภาพไม่ผ่าน · Specific Energy คำนวณ kW ÷ t/h เฉพาะอัตราผลิตมากกว่า 0</p>`;
  host.prepend(card);
  const $=s=>card.querySelector(s),status=$('.valve-history-status'),plots=$('.monitor-plots');
  let data=null,loaded=false,busy=false;const hidden=new Set();
  const format=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:2}):'—';
  const date=t=>new Date(t).toLocaleString('th-TH-u-ca-gregory',{year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  const inputTime=t=>{const d=new Date(t),pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;};
  function preset(){const hours=Number($('#monitorPeriod').value);if(!hours)return;const end=Date.now();$('#monitorTo').value=inputTime(end);$('#monitorFrom').value=inputTime(end-hours*3600000);}
  preset();$('#monitorPeriod').onchange=()=>{preset();$('#monitorFollow').checked=false;};
  ['#monitorFrom','#monitorTo'].forEach(sel=>$(sel).onchange=()=>{$('#monitorPeriod').value='custom';$('#monitorFollow').checked=false;});
  $('#monitorGroup').onchange=()=>{hidden.clear();load();};
  $('form').onsubmit=e=>{e.preventDefault();load();};
  function now(){const span=new Date($('#monitorTo').value)-new Date($('#monitorFrom').value),end=Date.now();$('#monitorTo').value=inputTime(end);$('#monitorFrom').value=inputTime(end-(span>0?span:21600000));load();}
  $('#monitorNow').onclick=now;$('#monitorFollow').onchange=()=>{if($('#monitorFollow').checked)now();};
  function closest(series,t){
    if(!series)return null;let lo=0,hi=series.points.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(Date.parse(series.points[mid].time)<t)lo=mid+1;else hi=mid;}
    const p=[series.points[lo],series.points[lo-1]].filter(Boolean).sort((a,b)=>Math.abs(Date.parse(a.time)-t)-Math.abs(Date.parse(b.time)-t))[0];
    return p&&Math.abs(Date.parse(p.time)-t)<=data.interval_seconds*1000?p.value:null;
  }
  function render(){
    plots.replaceChildren();const tbody=$('tbody');tbody.replaceChildren();if(!data)return;
    const groupNames=[...new Set(data.series.filter(s=>s.kind!=='category').map(s=>s.panel))];
    groupNames.sort((a,b)=>(a==='สถานะเดินเครื่อง')-(b==='สถานะเดินเครื่อง'));
    for(const name of groupNames){
      const series=data.series.filter(s=>s.panel===name),isStatus=series[0].kind==='status';
      const section=document.createElement('section');section.className='monitor-plot-section'+(isStatus?' monitor-run':'');
      const heading=document.createElement('h3');heading.textContent=name+' · '+series[0].unit;section.append(heading);
      const plot=document.createElement('div');plot.className='monitor-plot';plot.innerHTML='<svg viewBox="0 0 1100 280" preserveAspectRatio="none" role="img"></svg><div class="valve-history-tooltip" hidden></div>';section.append(plot);
      const svg=plot.querySelector('svg');if(isStatus)svg.setAttribute('viewBox','0 0 1100 140');svg.setAttribute('aria-label',heading.textContent);const tip=plot.querySelector('.valve-history-tooltip');
      const entries=series.filter(s=>!hidden.has(s.tag)),values=entries.flatMap(s=>s.points.filter(p=>typeof p.value==='number').map(p=>p.value));
      let min=0,max=1;if(values.length){min=values.reduce((a,b)=>Math.min(a,b));max=values.reduce((a,b)=>Math.max(a,b));const pad=Math.max((max-min)*.12,Math.abs(max)*.01,.1);min-=pad;max+=pad;}
      if(series.every(s=>s.bounds?.[0]===0&&s.bounds?.[1]===100)){min=0;max=100;}
      if(isStatus){min=0;max=1;}
      const start=Date.parse(data.start),end=Date.parse(data.end),x=t=>65+(Date.parse(t)-start)/(end-start)*1005,bottom=isStatus?90:230,y=v=>bottom-(v-min)/(max-min)*(bottom-20);
      let markup='';
      for(let i=0;i<=(isStatus?1:4);i++){const value=min+(max-min)*i/(isStatus?1:4),yy=y(value);markup+=`<line x1="65" x2="1070" y1="${yy}" y2="${yy}" class="vh-grid"/><text x="55" y="${yy+4}" text-anchor="end" class="vh-axis">${isStatus?(i?'RUN':'BREAK'):format(value)}</text>`;}
      for(let i=0;i<=4;i++)markup+=`<text x="${65+1005*i/4}" y="${isStatus?123:263}" text-anchor="${i===0?'start':i===4?'end':'middle'}" class="vh-axis">${date(start+(end-start)*i/4)}</text>`;
      for(const s of entries){let d='',pen=false,last=null;
        for(const p of s.points){if(p.value===null){pen=false;last=null;continue;}const time=Date.parse(p.time);if(last!==null&&time-last>data.interval_seconds*1500)pen=false;const xx=x(p.time).toFixed(2),yy=y(p.value).toFixed(2);d+=pen?(s.style==='step'?`H${xx}V${yy} `:`L${xx},${yy} `):`M${xx},${yy} `;pen=true;last=time;}
        const color=colors[data.series.indexOf(s)%colors.length];markup+=`<path class="monitor-series" d="${d}" fill="none" stroke="${color}" stroke-width="2" ${s.style==='step'&&!isStatus?'stroke-dasharray="7 3"':''} vector-effect="non-scaling-stroke"/>`;
      }
      if(!values.length)markup+='<text x="550" y="140" text-anchor="middle" class="vh-empty">ไม่มีข้อมูลที่ใช้ได้ / ยังไม่ได้เลือกเส้น</text>';
      markup+=`<line class="monitor-cursor" y1="20" y2="${bottom}" visibility="hidden" stroke="#fff9" stroke-dasharray="4 4"/>`;svg.innerHTML=markup;
      const legend=document.createElement('div');legend.className='valve-history-legend';section.append(legend);
      for(const s of series){const label=document.createElement('label'),check=document.createElement('input'),swatch=document.createElement('i'),text=document.createElement('span');check.type='checkbox';check.checked=!hidden.has(s.tag);swatch.style.background=colors[data.series.indexOf(s)%colors.length];text.textContent=s.label+(s.error?' · อ่านไม่ได้':!s.points.some(p=>p.value!==null)?' · ไม่มีข้อมูล':'');label.title=s.tag;label.append(check,swatch,text);legend.append(label);check.onchange=()=>{check.checked?hidden.delete(s.tag):hidden.add(s.tag);render();};}
      svg.addEventListener('pointermove',e=>{
        const rect=svg.getBoundingClientRect(),px=(e.clientX-rect.left)/rect.width*1100;if(px<65||px>1070)return;
        const t=start+(px-65)/1005*(end-start);card.querySelectorAll('.monitor-cursor').forEach(line=>{line.setAttribute('x1',px);line.setAttribute('x2',px);line.setAttribute('visibility','visible');});
        const grade=closest(data.series.find(s=>s.kind==='category'),t),run=closest(data.series.find(s=>s.kind==='status'),t);
        $('.monitor-context').textContent=date(t)+' · Grade '+(grade??'—')+' · '+(run===1?'RUN':run===0?'BREAK':'สถานะไม่พร้อม');
        tip.replaceChildren();const title=document.createElement('strong');title.textContent=date(t);tip.append(title);
        for(const s of entries){const row=document.createElement('div');row.style.setProperty('--series-color',colors[data.series.indexOf(s)%colors.length]);const v=closest(s,t);row.textContent=s.label+': '+(s.kind==='status'?(v===1?'RUN':v===0?'BREAK':'—'):format(v)+' '+s.unit);tip.append(row);}
        tip.hidden=false;tip.style.left=Math.max(8,Math.min(e.clientX-rect.left+12,rect.width-tip.offsetWidth-8))+'px';tip.style.top='10px';
      });
      svg.addEventListener('pointerleave',()=>{tip.hidden=true;card.querySelectorAll('.monitor-cursor').forEach(line=>line.setAttribute('visibility','hidden'));});plots.append(section);
    }
    for(const s of data.series.filter(s=>!s.kind)){const values=s.points.map(p=>p.value).filter(v=>typeof v==='number'),last=s.points.at(-1)?.value;const tr=document.createElement('tr');
      const cells=[s.label,s.unit,format(last),values.length?format(Math.min(...values)):'—',values.length?format(Math.max(...values)):'—',values.length?format(values.reduce((a,b)=>a+b,0)/values.length):'—',values.length+'/'+s.points.length];
      cells.forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td);});tbody.append(tr);
    }
  }
  async function load(){
    if(busy)return;const from=new Date($('#monitorFrom').value),to=new Date($('#monitorTo').value);
    if(!Number.isFinite(+from)||!Number.isFinite(+to)||from>=to||to>Date.now()+60000||to-from>732*86400000){status.textContent='กรุณาเลือกช่วงเวลาที่ถูกต้อง ไม่เกิน 2 ปี และไม่เกินเวลาปัจจุบัน';return;}
    busy=true;card.querySelectorAll('form input,form select,form button').forEach(el=>el.disabled=true);$('.monitor-export').disabled=true;status.textContent='กำลังอ่านข้อมูล PI Archive…';
    try{const response=await fetch('/api/monitor-history?'+new URLSearchParams({group:$('#monitorGroup').value,start:from.toISOString(),end:to.toISOString()}));if(!(response.headers.get('content-type')||'').includes('application/json'))throw Error('กรุณาเปิด Dashboard Server รุ่นล่าสุดใหม่');const result=await response.json();if(!response.ok)throw Error(result.error||'อ่านข้อมูล PI ไม่สำเร็จ');data=result;loaded=true;render();
      const n=data.series.filter(s=>s.points.some(p=>p.value!==null)).length;status.textContent=`${date(data.start)} – ${date(data.end)} · มีข้อมูล ${n}/${data.series.length} สัญญาณ · ความละเอียด ${data.interval_seconds<3600?data.interval_seconds/60+' นาที':data.interval_seconds/3600+' ชั่วโมง'} · ${$('#monitorFollow').checked?'ติดตามล่าสุด':'ประวัติที่เลือก'}`;$('.monitor-context').textContent='ชี้กราฟเพื่อดูเกรด สถานะ และค่าที่เวลาเดียวกัน';$('.monitor-export').disabled=false;
    }catch(error){data=null;loaded=false;plots.replaceChildren();$('tbody').replaceChildren();status.textContent=error.message;}
    finally{busy=false;card.querySelectorAll('form input,form select,form button').forEach(el=>el.disabled=false);}
  }
  $('.monitor-export').onclick=()=>{
    if(!data)return;const byTime=new Map();data.series.forEach((s,i)=>s.points.forEach(p=>{if(!byTime.has(p.time))byTime.set(p.time,Array(data.series.length).fill(''));byTime.get(p.time)[i]=p.value??'';}));
    const cell=v=>{if(typeof v==='string'&&/^[=+@-]/.test(v))v="'"+v;return '"'+String(v).replace(/"/g,'""')+'"';};
    const rows=[['Timestamp',...data.series.map(s=>s.label+' ['+s.unit+']')],...[...byTime].sort(([a],[b])=>a.localeCompare(b)).map(([time,values])=>[time,...values])];
    const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='PI_monitor_'+data.group+'_'+data.start.slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  new MutationObserver(()=>{if(!host.hidden&&host.classList.contains('active')&&!loaded)load();}).observe(host,{attributes:true,attributeFilter:['class','hidden']});
  setInterval(()=>{if($('#monitorFollow').checked&&!host.hidden&&host.classList.contains('active')&&!busy)now();},30000);
  if(!host.hidden&&host.classList.contains('active'))load();
})();
