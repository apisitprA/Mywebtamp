/* Existing IDs are moved, not duplicated, so PI/history/model bindings stay intact. */
(() => {
  'use strict';
  const get=id=>document.getElementById(id);
  const overview=get('tab-overview'),wrap=document.querySelector('.process-wrap'),panel=wrap.querySelector('.process-panel');
  if(!overview||!panel)return;
  document.querySelector('[data-tab="comparison"]')?.remove();
  get('tab-comparison')?.remove();
  if(localStorage.getItem('dashboardTab')==='comparison')showDashboardTab('overview');
  // Comparison is no longer a dashboard screen and should not request PI history.
  loadHistoricalComparison=async()=>{};
  const navLabels={overview:'ภาพรวมระบบ',optimization:'แนะนำ Setpoint',charts:'แนวโน้มการทำงาน',monitor:'ข้อมูล PI Tags',performance:'Turbo Performance'};
  document.querySelectorAll('.top-tab').forEach(el=>{if(navLabels[el.dataset.tab])el.textContent=navLabels[el.dataset.tab]});
  const baseTab=showDashboardTab;
  showDashboardTab=function(name){baseTab(name==='comparison'?'overview':name);document.querySelector('.top h1').textContent=navLabels[name]||'ภาพรวมระบบ';};
  showDashboardTab(localStorage.getItem('dashboardTab')||'overview');
  const bar=document.createElement('div');bar.className='overview-bar';
  bar.innerHTML='<div><h2>ระบบสุญญากาศ · PM3</h2><p>ดูค่าการทำงานและคำแนะนำของแต่ละจุดในแผนผังเดียว</p></div>';
  bar.append(get('snapshotToolbar'));overview.insertBefore(bar,wrap);
  const summary=get('processSummaryTable'),caption=panel.querySelector('.process-caption');
  const store={};panel.querySelectorAll('[id]').forEach(el=>store[el.id]=el);
  const branches=[
    ['2715','Suction Box','WIRE SECTION'],['2721','Couch Roll','WIRE SECTION'],
    ['2716','Pick-up High','PICK-UP'],['2717','Pick-up Low','PICK-UP'],
    ['2719','1st Press Felt','PRESS 01'],['2718','2nd Press Felt','PRESS 02'],['2720','3rd Press Felt','PRESS 03']
  ];
  const centers=branches.map((_,i)=>100+i*200);
  const valve=(x,id)=>`<g class="valve-gauge" data-valve="${id}" role="meter" aria-label="Valve ${id} opening" aria-valuemin="0" aria-valuemax="100"><g class="valve-symbol" aria-hidden="true"><rect x="${x-17}" y="253" width="53" height="35" rx="3" class="valve-mask"/><path d="M${x} 250V258 M${x} 282V300" class="valve-neck"/><path d="M${x-12} 258H${x+12}L${x} 270Z M${x-12} 282H${x+12}L${x} 270Z" class="valve-body"/><path d="M${x} 270H${x+27}V262" class="valve-stem"/><path d="M${x+17} 262A10 10 0 0 1 ${x+37} 262Z" class="valve-actuator"/></g><rect x="${x-72}" y="300" width="144" height="51" rx="9" fill="#fff" stroke="#d4e5ea"/><text x="${x-60}" y="315" class="valve-label">VALVE OPEN</text><text x="${x+60}" y="315" text-anchor="end" class="valve-percent">—</text><rect x="${x-60}" y="323" width="120" height="7" rx="3.5" fill="#e6eff2"/><rect class="valve-fill" x="${x-60}" y="323" width="0" height="7" rx="3.5" fill="#189e94"/><text x="${x-60}" y="343" class="valve-scale">0%</text><text x="${x+60}" y="343" text-anchor="end" class="valve-scale">100%</text></g>`;
  const equipment=(x,i)=>i===0?`<rect class="equip" x="${x-47}" y="58" width="94" height="30" rx="5"/>${[0,1,2,3,4,5,6].map(k=>`<path d="M${x-35+k*12} 64v18" stroke="#9ab5c5"/>`).join('')}<path class="pipe" d="M${x} 88v42"/>`:
    `<path d="M${x-45} 91L${x-25} 55H${x+25}L${x+45} 91Z" fill="none" stroke="#c1ced6" stroke-width="4"/>${[[-25,55],[25,55],[45,91],[-45,91]].map(([dx,y])=>`<circle cx="${x+dx}" cy="${y}" r="9" fill="#fff" stroke="#91a9b8" stroke-width="2"/>`).join('')}<rect class="equip" x="${x-20}" y="86" width="40" height="13" rx="4"/><path class="pipe" d="M${x} 100v30"/>`;
  const svg=`<svg class="vacuum-schematic" viewBox="0 0 1400 620" role="img" aria-label="แผนผังจุดดูด 7 จุด เชื่อมผ่านท่อร่วมไปถังแยกน้ำและ Turbo Vacuum พร้อมท่อน้ำซีลและปั๊มเสริม">
  <defs><marker id="flowArrow" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto"><path d="M0 0L5 3L0 6" fill="none" stroke="#508eaa" stroke-width="1.3"/></marker><pattern id="draftGrid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="#e7eef2"/></pattern></defs>
  <rect width="1400" height="620" fill="url(#draftGrid)"/>
  <path d="M30 43H1370" stroke="#dbe6ed" stroke-width="2" stroke-dasharray="5 5"/>
  ${centers.map((x,i)=>`<text x="${x}" y="27" text-anchor="middle" class="fine">${branches[i][2]}</text>${equipment(x,i)}<path class="pipe" d="M${x} 130V370"/>${valve(x,branches[i][0])}<path d="M${x} 343v16" class="pipe" marker-end="url(#flowArrow)"/><circle class="junction" cx="${x}" cy="370" r="5"/>`).join('')}
  <path class="pipe" d="M100 370H1300 M510 370V440"/>
  <text x="1020" y="394" class="fine">VACUUM COLLECTION HEADER · ท่อร่วมสุญญากาศ</text>
  <path class="pipe" d="M510 400v25" marker-end="url(#flowArrow)"/>
  <rect x="310" y="443" width="400" height="92" rx="27" fill="#f3f8fa" stroke="#9db6c5" stroke-width="2"/>
  <path d="M330 512H690" stroke="#64bfc2" stroke-width="2"/><path d="M331 518Q350 510 370 518T410 518T450 518T490 518T530 518T570 518T610 518T650 518T689 518" stroke="#b5dfe0" fill="none"/>
  <text x="510" y="479" text-anchor="middle" class="machine-label">WATER SEPARATOR TANK</text><text x="510" y="499" text-anchor="middle" class="fine">ถังแยกน้ำออกจากอากาศ</text>
  <path class="pipe" d="M710 484H930"/><path class="pipe" d="M810 484h50" marker-end="url(#flowArrow)"/><text x="794" y="467" class="fine">AIR TO TURBO</text>
  <g transform="translate(1000 484)"><circle r="60" fill="#eaf3f6" stroke="#9cb9c8" stroke-width="2"/><circle r="42" fill="#fff" stroke="#c8dbe4" stroke-width="2"/>${[0,60,120,180,240,300].map(a=>`<path transform="rotate(${a})" d="M0 -8Q-28 -32 -9 -36Q11 -36 12 -16Z" fill="#76a9b9"/>`).join('')}<circle r="12" fill="#235c74"/><path d="M-68 0h10M30 -52v-35h42" class="pipe"/><path d="M72 -87h25" class="pipe" marker-end="url(#flowArrow)"/><text x="20" y="-103" class="fine">AIR DISCHARGE</text><rect x="-44" y="60" width="88" height="9" rx="3" fill="#c5d6df"/></g>
  <path class="water" d="M410 536V574H270 M270 550V599 M270 550H200V574 M270 599H200V574 M200 574H156"/>
  <circle cx="235" cy="550" r="12" fill="#f2fafa" stroke="#64b1b6"/><path d="M230 544L241 550L230 556Z" fill="#64b1b6"/>
  <circle cx="235" cy="599" r="12" fill="#f2fafa" stroke="#64b1b6"/><path d="M230 593L241 599L230 605Z" fill="#64b1b6"/>
  <text x="292" y="557" class="fine">Extra Pump 1</text><text x="292" y="605" class="fine">Extra Pump 2</text>
  <text x="34" y="570" class="fine">SEALING WATER</text><text x="34" y="585" class="fine">Low flow · ไม่มีสัญญาณ PI</text>
  <path class="water" d="M650 536V574H865"/><text x="674" y="565" class="fine">DEAERATION LINE</text>
  <text x="525" y="603" class="fine">Pump / water status: ไม่ได้เชื่อมสัญญาณสถานะ</text>
  </svg>`;
  panel.replaceChildren();panel.className='process-panel modern-diagram';panel.insertAdjacentHTML('afterbegin',svg);
  branches.forEach(([id,name],i)=>{
    const card=document.createElement('article');card.className='branch-card';card.style.left=`${(centers[i]-86)/14}%`;
    card.innerHTML=`<header><h3>${name}</h3><span class="branch-tag">${id}</span></header>`;
    const readings=store['proc'+id];readings.className='live-chip branch-values';readings.removeAttribute('style');card.append(readings);
    const ai=store['ai'+id];ai.removeAttribute('style');ai.className='live-chip recommendation';card.append(ai);panel.append(card);
  });
  const turbo=document.createElement('div');turbo.className='turbo-instrument';turbo.innerHTML='<h3>TURBO VACUUM</h3><div class="turbo-stats"><div><label>VACUUM</label><strong data-mirror="procVacuum">— kPa</strong></div><div><label>MOTOR SPEED</label><strong data-mirror="infoSpeed">— rpm</strong></div><div><label>ACTUAL POWER</label><strong data-mirror="infoLoad">— kW</strong></div><div><label>PREDICTED POWER</label><strong data-mirror="procPrediction">— kW</strong></div></div>';
  const aiV=store.aiVacuum;aiV.removeAttribute('style');aiV.className='';turbo.append(aiV);panel.append(turbo);
  const scroll=document.createElement('div');scroll.className='diagram-scroll';wrap.append(scroll);scroll.append(panel);
  wrap.insertAdjacentHTML('afterbegin','<div class="diagram-top"><strong>PROCESS FLOW <span style="font-weight:400;color:#8a9eac"> /  ผังระบบสุญญากาศ</span></strong><div class="diagram-legend"><span>ACT ค่าจริง</span><span>SP ค่าตั้ง</span><span>AI คำแนะนำ</span></div></div>');
  const footer=document.createElement('div');footer.className='diagram-footer';footer.innerHTML='<span><strong>แผนผังแสดงการเชื่อมต่อ</strong> · ไม่ใช่แบบ P&ID สำหรับติดตั้ง</span>';footer.append(caption);wrap.append(footer);
  const details=document.createElement('div');details.className='overview-details';details.append(get('qualityPeriodCard'));const prediction=document.querySelector('.prediction-card');if(prediction)details.append(prediction);wrap.after(details);
  get('qualityPeriodCard').querySelector('h2').textContent='คุณภาพและสภาวะการผลิต';
  const technical=document.createElement('details');technical.className='technical-details';technical.innerHTML='<summary>ข้อมูลการเดินเครื่องเพิ่มเติม · Operating snapshot</summary>';technical.append(summary);
  // Keep original source values used by the existing PI rendering functions.
  const hidden=document.createElement('div');hidden.hidden=true;['procRun','procVacuum','procDryness'].forEach(id=>{if(store[id])hidden.append(store[id])});technical.append(hidden);details.after(technical);
  function updateBranches(){
    const v=tag=>state.values[tag]?.Value;
    branches.forEach(([id])=>{get('proc'+id).innerHTML=`<div class="reading-line actual"><span>ACT</span><strong>${format(v(`TPC3-PIC${id}.PV`))}<small>kPa</small></strong></div><div class="reading-line"><span>SP</span><strong>${format(v(`TPC3-PIC${id}.SV`))}<small>kPa</small></strong></div>`;});
  }
  function updateValveLevels(){
    branches.forEach(([id,name])=>{
      const gauge=panel.querySelector(`[data-valve="${id}"]`), item=state.values[`TPC3-PIC${id}.MV`];
      const valid=item?.Good!==false&&typeof item?.Value==='number'&&Number.isFinite(item.Value)&&item.Value>=0&&item.Value<=100;
      gauge.querySelector('.valve-fill').setAttribute('width',valid?item.Value*1.2:0);
      gauge.querySelector('.valve-percent').textContent=valid?format(item.Value)+'%':'—';
      gauge.setAttribute('aria-label',name+' · ระดับการเปิดวาล์ว');
      gauge.setAttribute('aria-valuetext',valid?format(item.Value)+'%':'ไม่มีข้อมูลที่ใช้ได้');
      if(valid)gauge.setAttribute('aria-valuenow',item.Value);else gauge.removeAttribute('aria-valuenow');
      gauge.classList.toggle('unavailable',!valid);
    });
  }
  for(const name of ['updateHighlights','updateProcessValues']){
    const original=window[name];window[name]=function(...args){const result=original(...args);updateBranches();updateValveLevels();return result;};
  }
  document.querySelectorAll('[data-mirror]').forEach(el=>{const source=get(el.dataset.mirror);if(!source)return;const sync=()=>el.textContent=source.textContent;new MutationObserver(sync).observe(source,{childList:true,subtree:true,characterData:true});sync();});
  updateBranches();updateValveLevels();
})();
