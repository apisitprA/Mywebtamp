/* Paper-machine schematic, animated illustration and consistent tab navigation. */
(() => {
  const get=id=>document.getElementById(id),svg=document.querySelector('.vacuum-schematic'),panel=document.querySelector('.modern-diagram');
  if(!svg||!panel)return;
  const NS='http://www.w3.org/2000/svg';
  // Keep the existing tank, connected header, controls and instrument cards.
  const lower=document.createElementNS(NS,'g');lower.setAttribute('transform','translate(0 160)');
  const children=[...svg.children];
  children.forEach(el=>{
    if(el.tagName.toLowerCase()==='defs')return;
    if(el.tagName.toLowerCase()==='rect'&&el.getAttribute('fill')==='url(#draftGrid)'){el.setAttribute('height','780');return;}
    const y=Number(el.getAttribute('y'));
    // The old repeated top roller symbols and their section labels are replaced.
    if(el.tagName.toLowerCase()==='text'&&y===27){el.remove();return;}
    if(el.classList.contains('equip')&&y<130){el.remove();return;}
    if(el.tagName.toLowerCase()==='circle'&&Number(el.getAttribute('cy'))<130){el.remove();return;}
    if(el.tagName.toLowerCase()==='path'){
      const d=el.getAttribute('d')||'';
      if(d==='M30 43H1370'||/ 64v18| 91L| 88v42| 100v30/.test(d)){el.remove();return;}
    }
    lower.append(el);
  });
  svg.append(lower);svg.setAttribute('viewBox','0 0 1400 780');
  svg.setAttribute('aria-label','Paper Machine: Headbox, forming wire, couch, pick-up, three press sections, dryer and reel. Seven vacuum branches feed a common separator and turbo.');
  // Rotate only the impeller blades, not the casing, piping or instrumentation.
  const fan=lower.querySelector('g[transform="translate(1000 484)"]');
  if(fan){const rotor=document.createElementNS(NS,'g');rotor.classList.add('turbo-rotor');[...fan.children].filter(el=>el.hasAttribute('transform')).forEach(el=>rotor.append(el));fan.append(rotor);}
  const flow=document.createElementNS(NS,'g');flow.classList.add('vacuum-motion');
  flow.innerHTML=[100,300,500,700,900,1100,1300].map(x=>`<path d="M${x} 130V370"/>`).join('')+'<path d="M100 370H510V443 M1300 370H510 M710 484H930"/>';
  lower.append(flow);
  lower.querySelectorAll(".valve-gauge").forEach(g=>lower.append(g));
  const roller=(x,y,r=19)=>`<g transform="translate(${x} ${y})"><circle r="${r}" fill="#fff" stroke="#92adbd" stroke-width="2"/><g class="paper-roller"><path d="M-${r-4} 0H${r-4}M0 -${r-4}V${r-4}" stroke="#c0d2dd" stroke-width="2"/><circle r="4" fill="#62889f"/></g></g>`;
  const felt=(x)=>`<path d="M${x-48} 171L${x-30} 86H${x+32}L${x+48} 171Z" class="felt-track"/>${roller(x-30,86,8)}${roller(x+32,86,8)}${roller(x-48,171,8)}${roller(x+48,171,8)}`;
  const paper=document.createElementNS(NS,'g');paper.classList.add('paper-machine');
  paper.innerHTML=`
  <text x="32" y="30" class="machine-eyebrow">PAPER MACHINE · PM3</text><text x="1368" y="30" text-anchor="end" class="fine">ทิศทางการเดินกระดาษ →</text>
  <rect x="31" y="93" width="50" height="48" rx="5" fill="#e9f2f6" stroke="#9fbac9"/>
  <path d="M81 107L110 117L81 130Z" fill="#a4d0da"/>
  <text x="55" y="75" text-anchor="middle" class="machine-label">HEADBOX</text>
  <rect x="110" y="122" width="222" height="42" rx="20" fill="#f1f7fa" stroke="#bdd0dc"/>
  <path d="M126 127H313Q332 143 312 159H126Q108 143 126 127Z" class="felt-track"/>
  ${[130,190,250].map(x=>roller(x,144,13)).join('')}${roller(326,140,23)}
  <rect x="171" y="131" width="60" height="12" rx="3" fill="#a0bdcb"/>
  <text x="204" y="75" text-anchor="middle" class="machine-label">FORMING WIRE</text><text x="326" y="190" text-anchor="middle" class="fine">COUCH ROLL</text>
  <path d="M344 127L420 104L534 127L570 172H403Z" class="felt-track"/>
  ${roller(420,104,16)}${roller(453,141,21)}${roller(531,144,19)}${roller(405,172,9)}${roller(568,172,9)}
  <text x="487" y="75" text-anchor="middle" class="machine-label">PICK-UP</text>
  ${[720,870,1020].map((x,i)=>`${felt(x)}${roller(x,109,23)}${roller(x,157,23)}<rect x="${x-22}" y="190" width="44" height="10" rx="3" fill="#acc3ce"/><text x="${x}" y="65" text-anchor="middle" class="machine-label">PRESS ${i+1}</text>`).join('')}
  ${[1140,1194,1248].map(x=>roller(x,145,24)).join('')}
  <text x="1194" y="75" text-anchor="middle" class="machine-label">DRYER</text>
  ${roller(1343,134,26)}<rect x="1310" y="166" width="65" height="7" rx="3" fill="#bbcfd9"/>
  <text x="1343" y="75" text-anchor="middle" class="machine-label">REEL</text>
  <path d="M84 120H326L420 120L453 120L531 125L610 133H1053L1115 121H1273L1317 134" class="paper-web-base"/>
  <path d="M84 120H326L420 120L453 120L531 125L610 133H1053L1115 121H1273L1317 134" class="paper-web"/>
  <text x="1160" y="207" class="fine">Dryer / Reel แสดงลำดับกระบวนการ</text>
  <text x="1160" y="223" class="fine">ไม่มีการเพิ่มค่า PI ที่ไม่ได้เชื่อมต่อ</text>
  ${[[201,144,100],[326,164,300],[453,162,500],[531,163,700],[720,200,900],[870,200,1100],[1020,200,1300]].map(([x,y,to])=>`<path d="M${x} ${y}V232L${to} 278V290" class="process-connector"/><circle cx="${x}" cy="${y}" r="3" fill="#508eaa"/>`).join('')}
  `;
  svg.append(paper);
  const headerLabel=[...lower.querySelectorAll('text')].find(el=>el.textContent.includes('VACUUM COLLECTION'));if(headerLabel){headerLabel.setAttribute('x','1300');headerLabel.setAttribute('y','412');headerLabel.setAttribute('text-anchor','end');}
  const caption=document.querySelector('.diagram-top>strong');caption.innerHTML='PAPER MACHINE <span style="font-weight:400;color:#8a9eac"> / ระบบเดินกระดาษและสุญญากาศ</span>';
  const control=document.createElement('button');control.type='button';control.className='motion-control';control.textContent='พักภาพเคลื่อนไหว';control.setAttribute('aria-pressed','false');document.querySelector('.diagram-top').append(control);
  let paused=false;
  control.onclick=()=>{paused=!paused;control.setAttribute('aria-pressed',String(paused));control.textContent=paused?'เล่นภาพเคลื่อนไหว':'พักภาพเคลื่อนไหว';syncMotion();};
  const motionNote=document.createElement('span');motionNote.className='motion-note';document.querySelector('.diagram-footer').prepend(motionNote);
  function syncMotion(){
    const item=state.values['TPC3-SB_REEL.PV'];const raw=item?.Value;const status=typeof raw==='object'?raw?.Name:raw;
    const cached=document.querySelector('.subtitle').classList.contains('cache-mode');
    // Discrete RUN tags may retain an old change timestamp while still Good.
    // Use the continuously sampled motor/load signals as the freshness heartbeat.
    const stamp=Math.max(...['TPC3-SI2934.PV','TPC3-KWC2723OVL.PV'].map(tag=>Date.parse(state.values[tag]?.Timestamp||'')).filter(Number.isFinite));
    const fresh=Number.isFinite(stamp)&&Math.abs(Date.now()-stamp)<120000;
    const live=!state.historyMode&&!cached&&fresh;
    const run=item?.Good!==false&&!item?.Cached&&[1,'1','RUN',true].includes(typeof status==='string'?status.trim().toUpperCase():status);
    const speed=state.values['TPC3-SI2934.PV'];const turbo=speed?.Good!==false&&typeof speed?.Value==='number'&&speed.Value>0;
    panel.dataset.paperRunning=String(live&&run&&!paused);panel.dataset.turboRunning=String(live&&run&&turbo&&!paused);
    motionNote.textContent=paused?'ภาพเคลื่อนไหวพักอยู่':!live?'หยุดภาพ: ข้อมูลย้อนหลัง / สำรอง / ไม่สด':!run?'BREAK / STOP · หยุดภาพเคลื่อนไหว':'RUN · ภาพเคลื่อนไหวแสดงทิศทางการทำงาน';
  }
  const priorUpdate=updateHighlights;updateHighlights=function(...a){const r=priorUpdate(...a);syncMotion();return r;};
  setInterval(syncMotion,1000);syncMotion();
  const wrap=panel.closest('.process-wrap');
  const fullscreen=document.createElement('button');fullscreen.type='button';fullscreen.className='fullscreen-control';
  fullscreen.textContent='⛶ เต็มหน้าจอ';fullscreen.setAttribute('aria-label','ขยายระบบสุญญากาศ PM3 เต็มหน้าจอ');fullscreen.setAttribute('aria-pressed','false');
  document.querySelector('.diagram-top').append(fullscreen);
  function fitDiagram(){
    const active=document.fullscreenElement===wrap||wrap.classList.contains('diagram-expanded');
    fullscreen.textContent=active?'⛶ ออกจากเต็มหน้าจอ':'⛶ เต็มหน้าจอ';fullscreen.setAttribute('aria-pressed',String(active));
    if(active){const area=wrap.querySelector('.diagram-scroll');const width=Math.min(area.clientWidth,area.clientHeight*1400/780);panel.style.setProperty('--diagram-scale',String(width/1400));}
    else panel.style.removeProperty('--diagram-scale');
  }
  function closeFallback(){wrap.classList.remove('diagram-expanded');document.body.classList.remove('diagram-fullscreen-open');fitDiagram();}
  fullscreen.onclick=async()=>{
    if(document.fullscreenElement===wrap){await document.exitFullscreen();return;}
    if(wrap.classList.contains('diagram-expanded')){closeFallback();return;}
    try{if(!wrap.requestFullscreen)throw Error('Fullscreen unavailable');await wrap.requestFullscreen();}
    catch{wrap.classList.add('diagram-expanded');document.body.classList.add('diagram-fullscreen-open');}
    fitDiagram();
  };
  document.addEventListener('fullscreenchange',fitDiagram);window.addEventListener('resize',fitDiagram);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeFallback();});
  // Rebuild explicit buttons: earlier Performance code created a panel, but no button.
  const nav=document.querySelector('.top-tabs');nav.replaceChildren();
  const tabs=[['overview','ภาพรวมระบบ'],['optimization','แนะนำ Setpoint'],['charts','แนวโน้มการทำงาน'],['monitor','ข้อมูล PI Tags'],['performance','Turbo Performance']];
  const baseShow=showDashboardTab;
  showDashboardTab=function(name){
    if(!tabs.some(([key])=>key===name))name='overview';
    baseShow(name);
    document.querySelectorAll('.tab-panel').forEach(el=>{const active=el.dataset.panel===name;el.hidden=!active;el.classList.toggle('active',active);});
    if(name==='optimization')loadOptimization();
    if(name==='performance')window.tpcDashboard.renderPerformance?.();
  };
  window.tpcDashboard.showTab=name=>showDashboardTab(name);
  tabs.forEach(([name,label])=>{const button=document.createElement('button');button.className='top-tab';button.type='button';button.dataset.tab=name;button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-controls','tab-'+name);button.onclick=()=>showDashboardTab(name);nav.append(button);});
  get('perfCompare')?.remove();
  // Expose the performance page even with unavailable PI/model data; its placeholders remain visible.
  const opt=get('tab-optimization');opt.insertAdjacentHTML('afterbegin','<div class="analysis-heading"><div><span>SETPOINT ADVISOR</span><h2>ค่าตั้งที่แนะนำสำหรับการเดินเครื่อง</h2><p>เปรียบเทียบค่าปัจจุบันกับผลจำลอง และตรวจเงื่อนไขก่อนใช้งาน</p></div><div class="analysis-status">คำแนะนำเท่านั้น · ไม่เขียนค่าเข้า PI</div></div>');
  const optCard=opt.querySelector('.optimization-card');optCard.querySelector('h2').textContent='ผลจำลองการปรับ Setpoint';
  const statusBox=document.createElement('p');statusBox.id='advisorAvailability';statusBox.className='availability-note';statusBox.textContent='กำลังรอผลจากโมเดลของเกรดปัจจุบัน';optCard.prepend(statusBox);
  const originalLoadOptimization=loadOptimization;
  loadOptimization=async function(...args){await originalLoadOptimization(...args);const available=get('optCandidateKw').textContent.trim()!=='—'&&get('optSetpoints').querySelector('table');const hold=get('optGate').textContent.includes('HOLD');statusBox.textContent=available?(hold?'HOLD · เงื่อนไขการผลิตยังไม่ผ่าน ดูผลจำลองประกอบการตรวจสอบเท่านั้น':'ผลจำลองจากโมเดล · ตรวจข้อจำกัดการผลิตประกอบก่อนปรับค่า'):'ยังไม่มีผลแนะนำที่พร้อมแสดงสำหรับข้อมูลปัจจุบัน · ตรวจสถานะ PI และโมเดล';statusBox.classList.toggle('ready',Boolean(available)&&!hold);};
  const perf=get('tab-performance');if(perf)perf.classList.add('modern-performance');
  const snapshot=get('machineStatus');if(snapshot)get('tab-monitor').prepend(snapshot);
  showDashboardTab(localStorage.getItem('dashboardTab')||'overview');
})();
