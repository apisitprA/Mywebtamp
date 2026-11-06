"""Signal catalogue and history groups for monitoring, no PI writes."""
from valve_history import read_series_history, VALVES

def signal(tag,label,unit,panel,**extra):
    return dict(tag=tag,label=label,unit=unit,panel=panel,**extra)

BRANCHES=[(tag.split('PIC')[1].split('.')[0],label) for tag,label in VALVES[:-1]]
GROUPS={
    'setpoints':[signal('TPC3-KWC2723_SP.PV','Turbo Vacuum SP','kPa','Setpoint ทั้ง 8 จุด',style='step')]+[
        signal(f'TPC3-PIC{n}.SV',label+' SP','kPa','Setpoint ทั้ง 8 จุด',style='step') for n,label in BRANCHES],
    'energy':[
        signal('TPC3-KWC2723OVL.PV','Turbo Power','kW','กำลังไฟ'),
        signal('TPC3-SI2934.PV','Motor Speed','rpm','รอบมอเตอร์'),
        signal('TPC3-CAL_PRODUCT.CPV','Production Rate','t/h','อัตราการผลิต')],
    'production':[
        signal('TPC3-CAL_PRODUCT.CPV','Production Rate','t/h','อัตราการผลิต'),
        signal('TPC3-SI2101.PV','Reel Speed','m/min','ความเร็วเดินกระดาษ'),
        signal('TPC3-BW1.PV','Basis Weight','gsm','น้ำหนักมาตรฐาน'),
        signal('TPC3-JW.PV','Jet/Wire Ratio','ratio','Jet/Wire Ratio'),
        signal('TPC3-FI2409.PV','Main Steam Flow','t/h','อัตราการใช้ไอน้ำ')],
    'quality':[
        signal('TPC3-DRYNESS.PV','Dryness Soft Sensor','%','Dryness',bounds=[0,100]),
        signal('TPC3-MP0.PV','Moisture Size Press','%','Moisture',bounds=[0,100]),
        signal('TPC3-BW1.PV','Basis Weight','gsm','น้ำหนักมาตรฐาน')],
    'temperature':[
        signal(f'TPC3-TI{n}.PV',label,'°C','อุณหภูมิ Turbo / Motor') for n,label in
        [(2708,'Front Bearing'),(2709,'Rear Bearing'),(2710,'Motor L1'),(2711,'Motor L2'),(2712,'Motor L3')]]}
for n,label in BRANCHES:
    GROUPS['controller_'+n]=[
        signal(f'TPC3-PIC{n}.SV',label+' SP','kPa',label+' · SP / Actual',style='step'),
        signal(f'TPC3-PIC{n}.PV',label+' Actual','kPa',label+' · SP / Actual'),
        signal(f'TPC3-PIC{n}.MV',label+' Valve','%',label+' · Valve',bounds=[0,100])]
GROUPS['controller_turbo']=[
    signal('TPC3-KWC2723_SP.PV','Turbo Vacuum SP','kPa','Turbo · SP / Blower Vacuum',style='step'),
    signal('TPC3-PIC2714.PV','Suction Blower Vacuum','kPa','Turbo · SP / Blower Vacuum'),
    signal('TPC3-PIC2714.MV','Diffuser Guide Vanes','%','Diffuser Guide Vanes',bounds=[0,100])]
GROUPS['dryer']=[signal(f'TPC3-PIC{n}.PV',label,'kPa','แรงดันไอน้ำ Dryer') for n,label in [(2401,'Cylinder 1'),(2402,'Cylinder 3'),(2403,'Cylinder 5'),(2404,'Cylinder 6'),(2405,'Group 2'),(2406,'Pre-Dryer / Group 3'),(2407,'Cylinder 26'),(2408,'Cylinder 27'),(2409,'Group 6'),(2410,'After-Dryer / Group 7')]]
CONTEXT=[signal('TPC3-SB_REEL.PV','RUN / BREAK','0/1','สถานะเดินเครื่อง',kind='status',style='step'),
         signal('TPC3-GRADE','Grade','','Grade',kind='category')]

def read_monitor_history(query,reader,now=None):
    group=query.get('group',['setpoints'])[0]
    if group not in GROUPS:return {'error':'Unknown monitor group'},400
    payload,status=read_series_history(query,reader,GROUPS[group]+CONTEXT,now)
    if status==200 and group=='energy':
        by_tag={s['tag']:s for s in payload['series']}
        rate={p['time']:p['value'] for p in by_tag['TPC3-CAL_PRODUCT.CPV']['points']}
        points=[]
        for point in by_tag['TPC3-KWC2723OVL.PV']['points']:
            r=rate.get(point['time']);kw=point['value']
            points.append({'time':point['time'],'value':kw/r if kw is not None and kw>=0 and r is not None and r>0 else None})
        payload['series'].append({**signal('derived:SEC','Specific Energy','kWh/t','พลังงานจำเพาะ'),'points':points,'error':None})
    payload['group']=group
    return payload,status
