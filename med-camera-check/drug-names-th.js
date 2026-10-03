/*
 * คำอ่านภาษาไทยของชื่อยาที่ใช้บ่อย
 * ใช้เมื่อยาไม่ได้กรอก "คำอ่านภาษาไทย" ไว้ — ถ้ากรอกไว้ ระบบจะใช้คำอ่านที่กรอกเสมอ
 * แก้ไข/เพิ่มคำได้ที่ตาราง WORDS ด้านล่าง (คีย์เป็นตัวพิมพ์เล็ก)
 */
(function () {
  "use strict";

  const WORDS = {
    // เพิ่มเติม: ยากระดูกและข้อ (3 ต.ค. 2026)
    glucosamine: "กลูโคซามีน", chondroitin: "คอนดรอยติน", diacerein: "ไดอะเซอรีน", risedronate: "ริเซโดรเนต",
    calcitriol: "แคลซิไตรออล", alfacalcidol: "อัลฟาแคลซิดอล", baclofen: "แบคโลเฟน", duloxetine: "ดูล็อกซิทีน",
    oxycodone: "ออกซีโคโดน", tizanidine: "ทิซานิดีน", parecoxib: "พาเรค็อกซิบ", ketorolac: "คีโตโรแลค", cefazolin: "เซฟาโซลิน",
    // ยาแก้ปวด ลดไข้ ต้านอักเสบ
    paracetamol: "พาราเซตามอล", acetaminophen: "อะเซตามิโนเฟน", ibuprofen: "ไอบูโพรเฟน",
    naproxen: "นาพรอกเซน", diclofenac: "ไดโคลฟีแนค", mefenamic: "เมเฟนามิก", celecoxib: "เซเลค็อกซิบ",
    etoricoxib: "อีทอริค็อกซิบ", piroxicam: "ไพร็อกซิแคม", meloxicam: "เมล็อกซิแคม", tramadol: "ทรามาดอล",
    codeine: "โคดีอีน", morphine: "มอร์ฟีน", aspirin: "แอสไพริน", orphenadrine: "ออร์เฟนาดรีน",
    tolperisone: "โทลเพอริโซน", eperisone: "อีเพอริโซน", methocarbamol: "เมโทคาร์บามอล",
    // ยาปฏิชีวนะ ยาต้านจุลชีพ
    amoxicillin: "อะม็อกซีซิลลิน", clavulanic: "คลาวูลานิก", clavulanate: "คลาวูลาเนต", ampicillin: "แอมพิซิลลิน",
    penicillin: "เพนิซิลลิน", dicloxacillin: "ไดคล็อกซาซิลลิน", cloxacillin: "คล็อกซาซิลลิน",
    cephalexin: "เซฟาเล็กซิน", cefalexin: "เซฟาเล็กซิน", cefixime: "เซฟิกซีม", cefdinir: "เซฟดิเนียร์",
    cefuroxime: "เซฟูร็อกซีม", cefaclor: "เซฟาคลอร์", ceftriaxone: "เซฟไตรอะโซน",
    azithromycin: "อะซิโทรมัยซิน", clarithromycin: "คลาริโทรมัยซิน", roxithromycin: "ร็อกซิโทรมัยซิน",
    erythromycin: "อีริโทรมัยซิน", doxycycline: "ด็อกซีไซคลิน", tetracycline: "เตตราไซคลิน",
    ciprofloxacin: "ซิโปรฟลอกซาซิน", levofloxacin: "ลีโวฟลอกซาซิน", norfloxacin: "นอร์ฟลอกซาซิน",
    ofloxacin: "ออฟลอกซาซิน", metronidazole: "เมโทรนิดาโซล", cotrimoxazole: "โคไตรม็อกซาโซล",
    "co-trimoxazole": "โคไตรม็อกซาโซล", sulfamethoxazole: "ซัลฟาเมท็อกซาโซล", trimethoprim: "ไตรเมโทพริม",
    nitrofurantoin: "ไนโตรฟูแรนโทอิน", clindamycin: "คลินดามัยซิน", fosfomycin: "ฟอสโฟมัยซิน",
    // ยาต้านไวรัส เชื้อรา พยาธิ วัณโรค เอชไอวี
    acyclovir: "อะไซโคลเวียร์", aciclovir: "อะไซโคลเวียร์", valacyclovir: "วาลาไซโคลเวียร์",
    oseltamivir: "โอเซลทามิเวียร์", favipiravir: "ฟาวิพิราเวียร์", fluconazole: "ฟลูโคนาโซล",
    ketoconazole: "คีโตโคนาโซล", itraconazole: "ไอทราโคนาโซล", clotrimazole: "โคลไตรมาโซล",
    griseofulvin: "กริซีโอฟูลวิน", albendazole: "อัลเบนดาโซล", mebendazole: "มีเบนดาโซล",
    ivermectin: "ไอเวอร์เม็กติน", praziquantel: "พราซิควอนเทล", isoniazid: "ไอโซไนอะซิด",
    rifampicin: "ไรแฟมพิซิน", ethambutol: "อีแทมบูทอล", pyrazinamide: "ไพราซินาไมด์",
    tenofovir: "ทีโนโฟเวียร์", efavirenz: "เอฟาวิเรนซ์", lamivudine: "ลามิวูดีน", emtricitabine: "เอ็มไตรซิตาบีน",
    dolutegravir: "โดลูเทกราเวียร์", zidovudine: "ซิโดวูดีน", nevirapine: "เนวิราพีน",
    // หัวใจ ความดัน ไขมัน เลือด
    amlodipine: "แอมโลดิปีน", nifedipine: "ไนเฟดิปีน", felodipine: "เฟโลดิปีน", diltiazem: "ดิลไทอะเซม",
    verapamil: "เวอราพามิล", enalapril: "อีนาลาพริล", lisinopril: "ไลซิโนพริล", ramipril: "รามิพริล",
    captopril: "แคปโตพริล", losartan: "โลซาร์แทน", valsartan: "วาลซาร์แทน", telmisartan: "เทลมิซาร์แทน",
    irbesartan: "เออร์บีซาร์แทน", candesartan: "แคนดีซาร์แทน", atenolol: "อะทีโนลอล",
    propranolol: "โพรพราโนลอล", metoprolol: "เมโทโพรลอล", bisoprolol: "ไบโซโพรลอล",
    carvedilol: "คาร์วีไดลอล", hydralazine: "ไฮดราลาซีน", doxazosin: "ด็อกซาโซซิน", prazosin: "พราโซซิน",
    hydrochlorothiazide: "ไฮโดรคลอโรไทอะไซด์", furosemide: "ฟูโรซีไมด์", spironolactone: "สไปโรโนแลกโทน",
    amiloride: "อะมิโลไรด์", simvastatin: "ซิมวาสแตติน", atorvastatin: "อะทอร์วาสแตติน",
    rosuvastatin: "โรสุวาสแตติน", pravastatin: "พราวาสแตติน", ezetimibe: "อีเซทิไมบ์", gemfibrozil: "เจมไฟโบรซิล",
    fenofibrate: "ฟีโนไฟเบรต", clopidogrel: "โคลพิโดเกรล", warfarin: "วาร์ฟาริน", rivaroxaban: "ริวาร็อกซาแบน",
    apixaban: "อะพิซาแบน", dabigatran: "ดาบิกาแทรน", enoxaparin: "อีนอกซาพาริน", heparin: "เฮพาริน",
    digoxin: "ไดจอกซิน", isosorbide: "ไอโซซอร์ไบด์", dinitrate: "ไดไนเตรต", mononitrate: "โมโนไนเตรต",
    nitroglycerin: "ไนโตรกลีเซอรีน", amiodarone: "อะมิโอดาโรน", tranexamic: "ทรานเอกซามิก", cilostazol: "ซิลอสตาซอล",
    // เบาหวาน ต่อมไร้ท่อ
    metformin: "เมทฟอร์มิน", glipizide: "กลิพิไซด์", glibenclamide: "ไกลเบนคลาไมด์", gliclazide: "กลิคลาไซด์",
    glimepiride: "กลิเมพิไรด์", pioglitazone: "ไพโอกลิทาโซน", sitagliptin: "ซิตากลิปติน",
    vildagliptin: "วิลดากลิปติน", linagliptin: "ลินากลิปติน", empagliflozin: "เอ็มพากลิโฟลซิน",
    dapagliflozin: "ดาพากลิโฟลซิน", insulin: "อินซูลิน", levothyroxine: "เลโวไทรอกซีน",
    methimazole: "เมทิมาโซล", propylthiouracil: "โพรพิลไทโอยูราซิล", prednisolone: "เพรดนิโซโลน",
    prednisone: "เพรดนิโซน", dexamethasone: "เดกซาเมทาโซน", hydrocortisone: "ไฮโดรคอร์ติโซน",
    allopurinol: "อัลโลพูรินอล", colchicine: "คอลชิซีน", febuxostat: "เฟบูโซสแตท", alendronate: "อะเลนโดรเนต",
    // ทางเดินอาหาร
    omeprazole: "โอเมพราโซล", pantoprazole: "แพนโทพราโซล", esomeprazole: "เอโซเมพราโซล",
    lansoprazole: "แลนโซพราโซล", rabeprazole: "ราบีพราโซล", ranitidine: "รานิทิดีน", famotidine: "ฟาโมทิดีน",
    domperidone: "ดอมเพอริโดน", metoclopramide: "เมโทโคลพราไมด์", ondansetron: "ออนแดนซีตรอน",
    simethicone: "ไซเมทิโคน", hyoscine: "ไฮออสซีน", butylbromide: "บิวทิลโบรไมด์", loperamide: "โลเพอราไมด์",
    bisacodyl: "ไบซาโคดิล", senna: "เซนนา", sennosides: "เซนโนไซด์", lactulose: "แล็กทูโลส",
    sucralfate: "ซูคราลเฟต", dimenhydrinate: "ไดเมนไฮดริเนต", mebeverine: "มีเบเวอรีน",
    // ภูมิแพ้ ทางเดินหายใจ
    chlorpheniramine: "คลอร์เฟนิรามีน", cetirizine: "เซทิริซีน", levocetirizine: "ลีโวเซทิริซีน",
    loratadine: "ลอราทาดีน", desloratadine: "เดสลอราทาดีน", fexofenadine: "เฟกโซเฟนาดีน",
    hydroxyzine: "ไฮดรอกซีซีน", dextromethorphan: "เดกซ์โทรเมทอร์แฟน", bromhexine: "บรอมเฮกซีน",
    ambroxol: "แอมบรอกซอล", carbocysteine: "คาร์โบซิสเทอีน", acetylcysteine: "อะเซทิลซิสเทอีน",
    guaifenesin: "ไกวเฟนิซิน", pseudoephedrine: "ซูโดอีเฟดรีน", phenylephrine: "ฟีนิลเอฟรีน",
    salbutamol: "ซัลบูทามอล", terbutaline: "เทอร์บูทาลีน", theophylline: "ธีโอฟิลลีน",
    montelukast: "มอนเทลูคาสท์", budesonide: "บูเดโซไนด์", fluticasone: "ฟลูติคาโซน",
    // ระบบประสาท จิตเวช
    diazepam: "ไดอะซีแพม", lorazepam: "ลอราซีแพม", alprazolam: "อัลปราโซแลม", clonazepam: "โคลนาซีแพม",
    amitriptyline: "อะมิทริปไทลีน", nortriptyline: "นอร์ทริปไทลีน", fluoxetine: "ฟลูออกซีทีน",
    sertraline: "เซอร์ทราลีน", escitalopram: "เอสซิตาโลแพรม", paroxetine: "พาร็อกซีทีน",
    trazodone: "ทราโซโดน", mirtazapine: "เมอร์ทาซาปีน", risperidone: "ริสเพอริโดน", haloperidol: "ฮาโลเพอริดอล",
    quetiapine: "เควไทอะพีน", olanzapine: "โอแลนซาปีน", perphenazine: "เพอร์เฟนาซีน",
    chlorpromazine: "คลอร์โพรมาซีน", gabapentin: "กาบาเพนติน", pregabalin: "พรีกาบาลิน",
    carbamazepine: "คาร์บามาซีพีน", phenytoin: "เฟนิโทอิน", phenobarbital: "ฟีโนบาร์บิทาล",
    valproate: "วาลโปรเอต", valproic: "วาลโปรอิก", levetiracetam: "ลีวีไทราซีแทม", topiramate: "โทพิราเมต",
    donepezil: "โดนีพีซิล", betahistine: "บีตาฮิสทีน", flunarizine: "ฟลูนาริซีน", cinnarizine: "ซินนาริซีน",
    // ทางเดินปัสสาวะ อื่น ๆ
    tamsulosin: "แทมซูโลซิน", finasteride: "ฟีนาสเตอไรด์", sildenafil: "ซิลเดนาฟิล", tadalafil: "ทาดาลาฟิล",
    oxybutynin: "ออกซีบิวทินิน", hydroxychloroquine: "ไฮดรอกซีคลอโรควิน", methotrexate: "เมโทเทร็กเซต",
    // วิตามิน เกลือแร่ และคำประกอบชื่อยา
    vitamin: "วิตามิน", folic: "โฟลิก", ferrous: "เฟอรัส", sulfate: "ซัลเฟต", sulphate: "ซัลเฟต",
    fumarate: "ฟูมาเรต", gluconate: "กลูโคเนต", calcium: "แคลเซียม", carbonate: "คาร์บอเนต",
    potassium: "โพแทสเซียม", sodium: "โซเดียม", chloride: "คลอไรด์", citrate: "ซิเตรต",
    bicarbonate: "ไบคาร์บอเนต", magnesium: "แมกนีเซียม", hydroxide: "ไฮดรอกไซด์", oxide: "ออกไซด์",
    aluminium: "อะลูมิเนียม", aluminum: "อะลูมิเนียม", zinc: "ซิงค์", thiamine: "ไทอะมีน",
    pyridoxine: "ไพริดอกซีน", cyanocobalamin: "ไซยาโนโคบาลามิน", ascorbic: "แอสคอร์บิก",
    multivitamin: "มัลติวิตามิน", acid: "แอซิด", hydrochloride: "ไฮโดรคลอไรด์", hcl: "ไฮโดรคลอไรด์",
    maleate: "มาลีเอต", besylate: "เบซิเลต", besilate: "เบซิเลต", tartrate: "ทาร์เทรต",
    succinate: "ซักซิเนต", mesylate: "เมซิเลต", phosphate: "ฟอสเฟต", acetate: "อะซิเตต",
    ors: "โอ อาร์ เอส", sr: "เอส อาร์", xr: "เอ็กซ์ อาร์", er: "อี อาร์", cr: "ซี อาร์", mr: "เอ็ม อาร์",
    plus: "พลัส", forte: "ฟอร์ต", tablet: "เม็ด", tablets: "เม็ด", tab: "เม็ด", capsule: "แคปซูล",
    capsules: "แคปซูล", cap: "แคปซูล", syrup: "น้ำเชื่อม", suspension: "ยาน้ำแขวนตะกอน"
  };

  // อ่านชื่อยาเป็นภาษาไทย: แทนเฉพาะคำที่รู้จัก ส่วนคำที่ไม่รู้จักคงไว้ให้เสียงไทยอ่านเอง
  function toThai(name) {
    const text = String(name || "").trim();
    if (!text) return "";
    return text
      .replace(/[A-Za-z][A-Za-z-]*/g, word => {
        const key = word.toLowerCase();
        if (WORDS[key]) return " " + WORDS[key] + " ";
        // คำที่มีขีด เช่น amoxicillin-clavulanate
        if (key.includes("-")) {
          const parts = key.split("-");
          if (parts.every(part => WORDS[part])) return " " + parts.map(part => WORDS[part]).join(" ") + " ";
        }
        return word;
      })
      .replace(/\s*\+\s*/g, " กับ ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function has(name) {
    return /[A-Za-z]/.test(String(name || "")) && toThai(name) !== String(name || "").trim();
  }

  window.DrugNamesTH = { toThai, has, words: WORDS };
})();
