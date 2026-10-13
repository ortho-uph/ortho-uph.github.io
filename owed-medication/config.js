/* ใส่ Web App URL (ลงท้ายด้วย /exec) ที่ได้จากการ Deploy owed-medication/apps-script/Code.gs
   ทั้งหน้าเจ้าหน้าที่และหน้าผู้ป่วยใช้ค่านี้ร่วมกัน */
const OWED_CONFIG = {
  // ที่อยู่ผู้ส่งบนจ่าหน้าซองพัสดุ (แก้ต่อเครื่องได้ในหน้าตั้งค่า)
  sender: 'ห้องยา โรงพยาบาลมหาวิทยาลัยพะเยา\n19 หมู่ 2 ต.แม่กา อ.เมืองพะเยา จ.พะเยา 56000\nโทร 054-466-666 ต่อ 7121',
  endpoint: 'https://script.google.com/macros/s/AKfycbysGMjVeRnig88FWLMU_p8D6oTYpXyh8BhEr0cezZHpweuXXc-vVMegMAejLTEDAY35/exec',
};
