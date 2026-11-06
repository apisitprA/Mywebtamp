"""Bounded, read-only PI archive endpoint for all mapped valve positions."""
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd

VALVES = [
    ('TPC3-PIC2715.MV', 'Suction Box'),
    ('TPC3-PIC2721.MV', 'Couch Roll'),
    ('TPC3-PIC2716.MV', 'Pick-up High'),
    ('TPC3-PIC2717.MV', 'Pick-up Low'),
    ('TPC3-PIC2719.MV', '1st Press Felt'),
    ('TPC3-PIC2718.MV', '2nd Press Felt'),
    ('TPC3-PIC2720.MV', '3rd Press Felt'),
    ('TPC3-PIC2714.MV', 'Diffuser Guide Vanes'),
]

def read_valve_history(query, reader, now=None):
    now = pd.Timestamp.now(tz='UTC') if now is None else pd.Timestamp(now)
    try:
        def timestamp(key):
            t = pd.Timestamp(query.get(key, [''])[0])
            if pd.isna(t): raise ValueError('missing time')
            if t.tzinfo is None: t = t.tz_localize('Asia/Bangkok')
            return t.tz_convert('UTC')
        start, end = timestamp('start'), timestamp('end')
        seconds = (end-start).total_seconds()
        if seconds <= 0 or seconds > 732*86400:
            raise ValueError('range')
        if end > now+pd.Timedelta('1min'):
            raise ValueError('future')
    except Exception:
        return {'error': 'เลือกเวลาเริ่มก่อนเวลาสิ้นสุด ช่วงไม่เกิน 2 ปี และไม่เกินเวลาปัจจุบัน'}, 400
    # Keep every returned series below 2,001 points; long periods are sampled more sparsely.
    steps=[60,300,900,1800,3600,7200,14400,21600,43200,86400]
    step=next(s for s in steps if seconds/s <= 2000)
    interval=f'{step}s'
    results={};errors={}
    def read(tag):
        items=reader(tag,start.isoformat(),end.isoformat(),interval)
        points=[]
        for item in items:
            value=item.get('Value')
            good=(item.get('Good') is True and not item.get('Questionable') and
                  isinstance(value,(int,float)) and not isinstance(value,bool) and
                  math.isfinite(value) and 0<=value<=100)
            stamp=pd.Timestamp(item.get('Timestamp'))
            if pd.isna(stamp) or stamp.tzinfo is None:continue
            if start<=stamp<=end:
                points.append({'time':stamp.isoformat(),'value':float(value) if good else None})
        points.sort(key=lambda p:p['time'])
        return points
    with ThreadPoolExecutor(max_workers=4) as pool:
        jobs={pool.submit(read,tag):tag for tag,_ in VALVES}
        for future in as_completed(jobs):
            tag=jobs[future]
            try:results[tag]=future.result()
            except Exception:errors[tag]='ไม่สามารถอ่านประวัติ PI ของจุดนี้ได้'
    series=[{'tag':tag,'label':label,'points':results.get(tag,[]),'error':errors.get(tag)} for tag,label in VALVES]
    good_count=sum(p['value'] is not None for s in series for p in s['points'])
    return {'start':start.isoformat(),'end':end.isoformat(),'interval_seconds':step,
            'source':'PI Archive','series':series,'valid_points':good_count,'errors':errors}, (200 if len(errors)<len(VALVES) else 502)
