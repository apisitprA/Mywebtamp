/* Time-range zoom shared by PI archive charts. Refetches the selected range. */
(() => {
  window.TPCChartZoom = function(card, applyRange) {
    let range=null, original=null, history=[], busy=false, navigating=false, drag=null;
    const bar=document.createElement('div');bar.className='chart-zoom-tools';
    bar.innerHTML='<span>ลากเลือกช่วงบนกราฟเพื่อขยาย · ดับเบิลคลิกเพื่อซูมเข้า</span><button type="button" data-zoom="in">＋ ซูมเข้า 2×</button><button type="button" data-zoom="back">← ย้อนกลับ</button><button type="button" data-zoom="reset">คืนช่วงเดิม</button><span class="chart-zoom-notice" role="status" aria-live="polite"></span>';
    card.querySelector('.valve-history-status').before(bar);
    const button=name=>bar.querySelector(`[data-zoom="${name}"]`),notice=bar.querySelector('.chart-zoom-notice');
    function controls(){
      button('in').disabled=busy||navigating||!range||range[1]-range[0]<=60000;
      button('back').disabled=busy||navigating||!history.length;
      button('reset').disabled=busy||navigating||!history.length;
    }
    function clearDrag(){
      const previous=drag;drag=null;
      card.querySelectorAll('.chart-zoom-selection').forEach(el=>el.remove());
      if(previous?.svg.hasPointerCapture?.(previous.id))previous.svg.releasePointerCapture(previous.id);
    }
    async function navigate(next,action='zoom'){
      if(!range||busy||navigating)return;
      if(action==='zoom'){
        next=[Math.max(range[0],Math.floor(next[0]/60000)*60000),Math.min(range[1],Math.ceil(next[1]/60000)*60000)];
        if(next[1]-next[0]<60000||(next[0]===range[0]&&next[1]===range[1])){
          notice.textContent='เลือกช่วงกว้างขึ้น · ซูมได้ละเอียดสุด 1 นาที';return;
        }
      }
      const previous=range.slice();navigating=true;clearDrag();controls();notice.textContent='กำลังโหลดรายละเอียดช่วงที่เลือก…';
      try{
        if(await applyRange(next)){
          if(action==='back')history.pop();else if(action==='reset')history=[];else history.push(previous);
          notice.textContent=history.length?'ขยายช่วงเวลาแล้ว · กราฟและสถิติใช้ช่วงที่เลือก':'แสดงช่วงเดิมแล้ว';
        }else notice.textContent='โหลดช่วงที่เลือกไม่สำเร็จ กรุณาลองใหม่';
      }finally{navigating=false;controls();}
    }
    function zoomAt(center){if(range){const quarter=(range[1]-range[0])/4;navigate([center-quarter,center+quarter]);}}
    button('in').onclick=()=>{if(range)zoomAt((range[0]+range[1])/2);};
    button('back').onclick=()=>{if(history.length)navigate(history.at(-1).slice(),'back');};
    button('reset').onclick=()=>{if(original)navigate(original.slice(),'reset');};
    card.addEventListener('keydown',event=>{if(event.key==='Escape'&&drag){clearDrag();notice.textContent='ยกเลิกการเลือกช่วง';}});
    function attach(svg,{left,right,top,bottom,width=1100}){
      svg.classList.add('chart-zoom-surface');
      const px=event=>(event.clientX-svg.getBoundingClientRect().left)/svg.getBoundingClientRect().width*width;
      const clamp=x=>Math.max(left,Math.min(right,x));
      const time=x=>range[0]+(clamp(x)-left)/(right-left)*(range[1]-range[0]);
      svg.addEventListener('pointerdown',event=>{
        if(event.button!==0||event.isPrimary===false||!range||busy||navigating)return;
        const x=px(event);if(x<left||x>right)return;
        clearDrag();drag={svg,id:event.pointerId,x,screenX:event.clientX};
        svg.setPointerCapture?.(event.pointerId);notice.textContent='ลากถึงปลายช่วงแล้วปล่อย · Esc ยกเลิก';
      });
      svg.addEventListener('pointermove',event=>{
        if(drag?.svg!==svg||drag.id!==event.pointerId)return;
        let selection=svg.querySelector('.chart-zoom-selection');
        if(!selection){selection=document.createElementNS('http://www.w3.org/2000/svg','rect');selection.classList.add('chart-zoom-selection');svg.append(selection);}
        const x=clamp(px(event));selection.setAttribute('x',Math.min(x,drag.x));selection.setAttribute('width',Math.abs(x-drag.x));selection.setAttribute('y',top);selection.setAttribute('height',bottom-top);
        card.querySelectorAll('.valve-history-tooltip').forEach(el=>el.hidden=true);
      });
      svg.addEventListener('pointerup',event=>{
        if(drag?.svg!==svg||drag.id!==event.pointerId)return;
        const first=drag.x,last=clamp(px(event)),distance=Math.abs(event.clientX-drag.screenX);clearDrag();
        if(distance<8){notice.textContent='ลากเลือกช่วง หรือดับเบิลคลิกเพื่อซูมเข้า';return;}
        navigate([time(Math.min(first,last)),time(Math.max(first,last))]);
      });
      svg.addEventListener('pointercancel',clearDrag);
      svg.addEventListener('lostpointercapture',()=>{if(drag?.svg===svg)clearDrag();});
      svg.addEventListener('dblclick',event=>{if(!range||busy||navigating)return;const x=px(event);if(x>=left&&x<=right){event.preventDefault();zoomAt(time(x));}});
    }
    controls();
    return {
      attach,
      accept(next,preserve=false){range=next.slice();if(!preserve){original=range.slice();history=[];notice.textContent='';}controls();},
      setBusy(value){busy=value;if(value)clearDrag();controls();}
    };
  };
})();
