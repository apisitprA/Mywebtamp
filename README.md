# PI Dashboard

ชุดไฟล์สำหรับนำขึ้น GitHub และรัน dashboard บน Windows

## ใช้งานอีกเครื่อง
1. ติดตั้ง Python 64-bit และเลือก Add Python to PATH (ต้องเรียก python และ pythonw.exe ได้)
2. แตกไฟล์หรือ clone repository
3. เปิด setup_dashboard.bat เพื่อติดตั้ง dependencies ผ่านอินเทอร์เน็ต
4. เชื่อมเครือข่ายบริษัท/VPN และใช้บัญชี Windows ที่มีสิทธิ์ PI Web API
5. เปิด start_pi_dashboard.bat ระบบเรียก start_pi_dashboard_silent.vbs แล้วเปิด http://127.0.0.1:8096

ไฟล์ .bat/.vbs ต้นฉบับใช้ Python ที่อยู่ใน PATH ไม่ได้เลือก .venv อัตโนมัติ
โมเดล joblib ควรใช้ scikit-learn/joblib รุ่นเดียวกับตอนฝึก หากโหลดไม่ได้ต้องตรวจเวอร์ชันเครื่องต้นทาง
requirements.txt เป็นรายการ dependency ไม่ใช่ lockfile ที่ยืนยันความเข้ากันได้กับทุกโมเดล

## อัป GitHub
สร้าง Private repository แล้วอัปไฟล์ภายในโฟลเดอร์นี้ โดยรักษาโครงสร้าง output/ ไว้
ต้องรวมไฟล์ .gitignore ด้วย ไฟล์โมเดลที่ manifest อ้างถึงรวมมาแล้ว
หากอัปผ่านเว็บติดข้อจำกัดขนาดไฟล์ ให้ใช้ Git/GitHub Desktop และ Git LFS ตามขนาดไฟล์
GitHub เป็นที่เก็บโค้ด ชุดนี้ยังต้องรัน Python บน Windows; ไม่ใช่เว็บที่เปิดบน GitHub Pages ได้โดยตรง

## สิ่งที่รวม
- ตัวเปิด .bat และ .vbs ต้นฉบับ
- Python server, index.html, turbo-performance.js
- manifest และเฉพาะโมเดลที่ manifest อ้างถึงในทั้ง 3 โฟลเดอร์
- CSV ประกอบ optimization 5 ไฟล์
- setup_dashboard.bat, requirements.txt, .gitignore

ไม่รวมข้อมูล cache ของ PI, log, สถานะ retraining เก่า, โมเดลสำรอง, ข้อมูลฝึก หรือ KNIME
ถ้าไม่เชื่อม PI และยังไม่เคยมี cache เครื่องใหม่อาจแสดงว่าไม่มีข้อมูล ซึ่งเป็นพฤติกรรมที่คาดหมาย
หน้าเว็บใช้ Google Fonts; ไม่มีอินเทอร์เน็ตอาจแสดงฟอนต์สำรอง

การเชื่อมต่อ PI ใช้ค่าเริ่มต้นภายในบริษัทจากโค้ดเดิม เปลี่ยนได้ด้วย PI_WEB_API_URL และ PI_SERVER
ชุดนี้มีข้อมูลชื่อเซิร์ฟเวอร์ภายในและโมเดลโรงงาน จึงจัดไว้สำหรับ Private repository
ยังไม่ได้อัปโหลดขึ้น GitHub และยังไม่ได้ทดสอบ Live PI บนเครื่องปลายทาง
ตรวจครบเฉพาะไฟล์อ้างอิง, syntax Python, manifest-model paths และ ZIP integrity
