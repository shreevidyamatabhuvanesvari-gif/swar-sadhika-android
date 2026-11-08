/* Swar-Sadhika — Vedic Sanskrit Pronunciation Knowledge Base
 * Version 1.1.0. Model-independent, non-destructive structured orthographic analysis.
 * No audio synthesis, network access, external model, Worker or text rewriting.
 */

export const VEDIC_PRONUNCIATION_VERSION = "1.1.0";
export const UNICODE_REFERENCE_VERSION = "18.0.0";
const cp = hex => String.fromCodePoint(parseInt(hex, 16));
const codePointOf = character => "U+" + character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
const freezeList = list => Object.freeze(list.map(item => Object.freeze(item)));

export const SCRIPT_BLOCKS = freezeList([
  { id: "devanagari", name: "Devanagari", start: 0x0900, end: 0x097f, purpose: "Core Devanagari script" },
  { id: "devanagari-extended", name: "Devanagari Extended", start: 0xa8e0, end: 0xa8ff, purpose: "Samaveda cantillation, nasalization and editorial signs" },
  { id: "devanagari-extended-a", name: "Devanagari Extended-A", start: 0x11b00, end: 0x11b5f, purpose: "Manuscript signs and additional script characters" },
  { id: "vedic-extensions", name: "Vedic Extensions", start: 0x1cd0, end: 0x1cff, purpose: "Vedic tone, nasalization, visarga and chant signs" }
]);

const VOWEL_ROWS = [
  ["अ","short-a","ह्रस्व अ",1],["आ","long-aa","दीर्घ आ",2],["इ","short-i","ह्रस्व इ",1],["ई","long-ii","दीर्घ ई",2],
  ["उ","short-u","ह्रस्व उ",1],["ऊ","long-uu","दीर्घ ऊ",2],["ऋ","vocalic-r","ऋ स्वर",1],["ॠ","long-vocalic-r","दीर्घ ॠ स्वर",2],
  ["ऌ","vocalic-l","ऌ स्वर",1],["ॡ","long-vocalic-l","दीर्घ ॡ स्वर",2],["ए","e","ए स्वर",2],["ऐ","ai","ऐ स्वर",2],
  ["ओ","o","ओ स्वर",2],["औ","au","औ स्वर",2]
];
export const VOWELS = freezeList(VOWEL_ROWS.map(([character,id,label,teachingMatras]) => ({
  character,id,label,codePoint:codePointOf(character),category:"vowel",teachingMatras,
  inherent:character==="अ",pronunciationStatus:"script-identified; branch-specific realization may vary"
})));

const CONSONANT_GROUPS = [
  {place:"कण्ठ्य",id:"velar",characters:["क","ख","ग","घ","ङ"]},
  {place:"तालव्य",id:"palatal",characters:["च","छ","ज","झ","ञ"]},
  {place:"मूर्धन्य",id:"retroflex",characters:["ट","ठ","ड","ढ","ण"]},
  {place:"दन्त्य",id:"dental",characters:["त","थ","द","ध","न"]},
  {place:"ओष्ठ्य",id:"labial",characters:["प","फ","ब","भ","म"]},
  {place:"अन्तःस्थ",id:"approximant",characters:["य","र","ल","व"]},
  {place:"ऊष्म",id:"fricative",characters:["श","ष","स","ह"]}
];
export const CONSONANT_GROUPS_DATA = freezeList(CONSONANT_GROUPS.map(group=>({...group,characters:Object.freeze(group.characters.slice())})));
export const CONSONANTS = freezeList(CONSONANT_GROUPS.flatMap(group=>group.characters.map(character=>({
  character,codePoint:codePointOf(character),category:"consonant",place:group.place,placeId:group.id,
  aspiration:["ख","घ","छ","झ","ठ","ढ","थ","ध","फ","भ"].includes(character)?"महाप्राण":"अल्पप्राण/अन्य",
  pronunciationStatus:"basic articulation class; exact phonetic realization depends on context"
}))));
export const VEDIC_ADDITIONAL_CONSONANTS = freezeList([{
  character:"ळ",codePoint:"U+0933",label:"मूर्धन्य पार्श्विक वर्ण",category:"vedic-additional-consonant",
  note:"शाखा और पाठ-स्रोत से सत्यापन आवश्यक; इसे हर वैदिक पाठ में स्वतः लागू न करें।",pronunciationStatus:"branch-specific"
}]);

const VOWEL_SIGN_ROWS = [
  ["ा","आ की मात्रा","U+093E","आ"],["ि","इ की मात्रा","U+093F","इ"],["ी","ई की मात्रा","U+0940","ई"],
  ["ु","उ की मात्रा","U+0941","उ"],["ू","ऊ की मात्रा","U+0942","ऊ"],["ृ","ऋ की मात्रा","U+0943","ऋ"],
  ["ॄ","ॠ की मात्रा","U+0944","ॠ"],["ॢ","ऌ की मात्रा","U+0962","ऌ"],["ॣ","ॡ की मात्रा","U+0963","ॡ"],
  ["े","ए की मात्रा","U+0947","ए"],["ै","ऐ की मात्रा","U+0948","ऐ"],["ो","ओ की मात्रा","U+094B","ओ"],["ौ","औ की मात्रा","U+094C","औ"]
];
export const VOWEL_SIGNS = freezeList(VOWEL_SIGN_ROWS.map(([character,label,codePoint,vowel])=>({character,label,codePoint,vowel,category:"vowel-sign"})));

export const CORE_SCRIPT_SIGNS = freezeList([
  {character:"ँ",codePoint:"U+0901",name:"DEVANAGARI SIGN CANDRABINDU",category:"nasalization",note:"अनुनासिकता का चिह्न; अनुस्वार से अलग रखें।"},
  {character:"ं",codePoint:"U+0902",name:"DEVANAGARI SIGN ANUSVARA",category:"nasalization",note:"अनुस्वार; ध्वनि-संदर्भ को बिना प्रमाण एक निश्चित नासिक्य में न बदलें।"},
  {character:"ः",codePoint:"U+0903",name:"DEVANAGARI SIGN VISARGA",category:"visarga",note:"विसर्ग; संदर्भ और पाठ-परंपरा आवश्यक।"},
  {character:"ऀ",codePoint:"U+0900",name:"DEVANAGARI SIGN INVERTED CANDRABINDU",category:"special-nasalization",note:"विशिष्ट लिपि-चिह्न; वैदिक उपयोग का संदर्भ जाँचें।"},
  {character:"़",codePoint:"U+093C",name:"DEVANAGARI SIGN NUKTA",category:"orthographic-mark",note:"विस्तारित वर्ण-लेखन; स्वयं कोई सामान्य संस्कृत स्वर नहीं।"},
  {character:"्",codePoint:"U+094D",name:"DEVANAGARI SIGN VIRAMA",category:"virama",note:"व्यंजन का अंतर्निहित अ हटाता है; संयुक्ताक्षर में महत्त्वपूर्ण।"},
  {character:"ॐ",codePoint:"U+0950",name:"DEVANAGARI OM",category:"sacred-sign",note:"ओंकार का लिपि-चिह्न; सामान्य वर्ण-सूची से अलग।"},
  {character:"॑",codePoint:"U+0951",name:"DEVANAGARI STRESS SIGN UDATTA",category:"vedic-accent",accent:"udatta-name; contextual-reading-required",note:"Unicode नाम उदात्त है; वास्तविक उपयोग-पाठ और शाखा से सत्यापित करें।"},
  {character:"॒",codePoint:"U+0952",name:"DEVANAGARI STRESS SIGN ANUDATTA",category:"vedic-accent",accent:"anudatta",note:"अनुदात्त चिह्न; परंपरा-विशिष्ट व्यवहार सुरक्षित रखें।"},
  {character:"॓",codePoint:"U+0953",name:"DEVANAGARI GRAVE ACCENT",category:"accent-or-transliteration-mark",note:"Unicode चिह्न; हर स्थिति में वैदिक स्वराघात न मानें।"},
  {character:"॔",codePoint:"U+0954",name:"DEVANAGARI ACUTE ACCENT",category:"accent-or-transliteration-mark",note:"Unicode चिह्न; हर स्थिति में वैदिक स्वराघात न मानें।"},
  {character:"ऽ",codePoint:"U+093D",name:"DEVANAGARI SIGN AVAGRAHA",category:"avagraha",note:"संधि/स्वर-लोप का लेखन-संकेत; इसका नाम बोलकर न पढ़ें।"},
  {character:"।",codePoint:"U+0964",name:"DEVANAGARI DANDA",category:"punctuation",note:"पाठ-विराम; वाचन-अवधि संदर्भ पर निर्भर।"},
  {character:"॥",codePoint:"U+0965",name:"DEVANAGARI DOUBLE DANDA",category:"punctuation",note:"श्लोक/पाठ-खंड का विराम; स्वतः कोई संख्या नहीं।"},
  {character:"॰",codePoint:"U+0970",name:"DEVANAGARI ABBREVIATION SIGN",category:"editorial-mark",note:"संक्षेप-संकेत; सामान्य उच्चारण नहीं।"}
]);
export const DEVANAGARI_DIGITS = freezeList(Array.from({length:10},(_,number)=>({
  character:String.fromCodePoint(0x0966+number),value:number,codePoint:codePointOf(String.fromCodePoint(0x0966+number)),category:"digit"
})));

const VEDIC_ROWS = [
 ["1CD0","VEDIC TONE KARSHANA","samaveda-tone","samaveda","विशिष्ट सामवेदीय स्वर-चिह्न; सामान्य अक्षर नहीं।"],
 ["1CD1","VEDIC TONE SHARA","samaveda-tone","samaveda","सामवेदीय स्वरित-संबंधी चिह्न।"],
 ["1CD2","VEDIC TONE PRENKHA","samaveda-vibrato","samaveda","गायन में vibrato-संबंधी संकेत; इसे अक्षर की तरह न पढ़ें।"],
 ["1CD3","VEDIC SIGN NIHSHVASA","samaveda-breathing","samaveda","सामवेदीय पाठ-विभाजन संकेत; इसके बीच pause निषिद्ध हो सकता है।"],
 ["1CD4","VEDIC SIGN YAJURVEDIC MIDLINE SVARITA","yajurveda-accent","yajurveda","मध्यरेखा स्वरित; शाखा/पाण्डुलिपि से सत्यापन आवश्यक।"],
 ["1CD5","VEDIC TONE YAJURVEDIC AGGRAVATED INDEPENDENT SVARITA","yajurveda-accent","yajurveda","स्वतन्त्र स्वरित का विशेष रूप।"],
 ["1CD6","VEDIC TONE YAJURVEDIC INDEPENDENT SVARITA","yajurveda-accent","yajurveda","यजुर्वेदीय स्वतन्त्र स्वरित।"],
 ["1CD7","VEDIC TONE YAJURVEDIC KATHAKA INDEPENDENT SVARITA","yajurveda-accent","kathaka","काठक शाखा का स्वतन्त्र स्वरित।"],
 ["1CD8","VEDIC TONE CANDRA BELOW","vedic-tone-mark","branch-specific","स्वर-चिह्न; संदर्भ आवश्यक।"],
 ["1CD9","VEDIC TONE YAJURVEDIC KATHAKA INDEPENDENT SVARITA SCHROEDER","yajurveda-accent","kathaka","काठक पाठ का विशेष स्वरित चिह्न।"],
 ["1CDA","VEDIC TONE DOUBLE SVARITA","vedic-accent","branch-specific","द्वि-स्वरित; शाखा-विशिष्ट नियम आवश्यक।"],
 ["1CDB","VEDIC TONE TRIPLE SVARITA","vedic-accent","branch-specific","त्रि-स्वरित; शाखा-विशिष्ट नियम आवश्यक।"],
 ["1CDC","VEDIC TONE KATHAKA ANUDATTA","yajurveda-accent","kathaka","काठक अनुदात्त चिह्न।"],
 ["1CDD","VEDIC TONE DOT BELOW","vedic-tone-mark","branch-specific","स्वर-चिह्न; संदर्भ आवश्यक।"],
 ["1CDE","VEDIC TONE TWO DOTS BELOW","vedic-tone-mark","branch-specific","स्वर-चिह्न; संदर्भ आवश्यक।"],
 ["1CDF","VEDIC TONE THREE DOTS BELOW","vedic-tone-mark","branch-specific","स्वर-चिह्न; संदर्भ आवश्यक।"],
 ["1CE0","VEDIC TONE RIGVEDIC KASHMIRI INDEPENDENT SVARITA","rigveda-accent","rigveda-kashmiri","ऋग्वेदीय कश्मीरी स्वतन्त्र स्वरित।"],
 ["1CE1","VEDIC TONE ATHARVAVEDIC INDEPENDENT SVARITA","atharvaveda-accent","atharvaveda","अथर्ववेदीय स्वतन्त्र स्वरित।"],
 ["1CE2","VEDIC SIGN VISARGA SVARITA","visarga-accent","branch-specific","विसर्ग पर स्वराघात चिह्न।"],
 ["1CE3","VEDIC SIGN VISARGA UDATTA","visarga-accent","branch-specific","विसर्ग उदात्त।"],
 ["1CE4","VEDIC SIGN REVERSED VISARGA UDATTA","visarga-accent","branch-specific","विसर्ग उदात्त का उलटा रूप।"],
 ["1CE5","VEDIC SIGN VISARGA ANUDATTA","visarga-accent","branch-specific","विसर्ग अनुदात्त।"],
 ["1CE6","VEDIC SIGN REVERSED VISARGA ANUDATTA","visarga-accent","branch-specific","विसर्ग अनुदात्त का उलटा रूप।"],
 ["1CE7","VEDIC SIGN VISARGA UDATTA WITH TAIL","visarga-accent","branch-specific","पूँछ सहित विसर्ग उदात्त।"],
 ["1CE8","VEDIC SIGN VISARGA ANUDATTA WITH TAIL","visarga-accent","branch-specific","पूँछ सहित विसर्ग अनुदात्त।"],
 ["1CE9","VEDIC SIGN ANUSVARA ANTARGOMUKHA","vedic-nasalization","branch-specific","विशिष्ट वैदिक अनुस्वार।"],
 ["1CEA","VEDIC SIGN ANUSVARA BAHIRGOMUKHA","vedic-nasalization","branch-specific","विशिष्ट वैदिक अनुस्वार।"],
 ["1CEB","VEDIC SIGN ANUSVARA VAMAGOMUKHA","vedic-nasalization","branch-specific","विशिष्ट वैदिक अनुस्वार।"],
 ["1CEC","VEDIC SIGN ANUSVARA VAMAGOMUKHA WITH TAIL","vedic-nasalization","branch-specific","पूँछ सहित विशिष्ट वैदिक अनुस्वार।"],
 ["1CED","VEDIC SIGN TIRYAK","vedic-nasalization-mark","branch-specific","अनुस्वार-संबंधी तिर्यक् चिह्न।"],
 ["1CEE","VEDIC SIGN HEXIFORM LONG ANUSVARA","vedic-nasalization","branch-specific","दीर्घ अनुस्वार का विशेष रूप।"],
 ["1CEF","VEDIC SIGN LONG ANUSVARA","vedic-nasalization","branch-specific","दीर्घ अनुस्वार।"],
 ["1CF0","VEDIC SIGN RTHANG LONG ANUSVARA","vedic-nasalization","branch-specific","विशिष्ट दीर्घ अनुस्वार।"],
 ["1CF1","VEDIC SIGN ANUSVARA UBHAYATO MUKHA","vedic-nasalization","branch-specific","उभयतोमुख अनुस्वार।"],
 ["1CF2","VEDIC SIGN ARDHAVISARGA","visarga-mark","branch-specific","अर्धविसर्ग; संदर्भ से पहचानें।"],
 ["1CF3","VEDIC SIGN ROTATED ARDHAVISARGA","visarga-mark","branch-specific","परिवर्तित अर्धविसर्ग।"],
 ["1CF4","VEDIC SIGN CANDRA ABOVE","vedic-tone-mark","branch-specific","चन्द्र ऊपर स्वर-चिह्न।"],
 ["1CF5","VEDIC SIGN JIHVAMULIYA","visarga-allophone","branch-specific","जिह्वामूलीय; क-वर्ग के उपयुक्त संदर्भ में ही।"],
 ["1CF6","VEDIC SIGN UPADHMANIYA","visarga-allophone","branch-specific","उपध्मानीय; प-वर्ग के उपयुक्त संदर्भ में ही।"],
 ["1CF7","VEDIC SIGN ATIKRAMA","vedic-recitation-mark","branch-specific","विशिष्ट पाठ-चिह्न; सामान्य शब्द/विराम न मानें।"],
 ["1CF8","VEDIC TONE RING ABOVE","jaiminiya-accent","samaveda-jaiminiya","जैमिनीय सामवेद का स्वर-चिह्न।"],
 ["1CF9","VEDIC TONE DOUBLE RING ABOVE","jaiminiya-accent","samaveda-jaiminiya","जैमिनीय सामवेद का द्वि-वृत्त स्वर-चिह्न।"],
 ["1CFA","VEDIC SIGN DOUBLE ANUSVARA ANTARGOMUKHA","vedic-nasalization","branch-specific","द्वि-अन्तर्मुख अनुस्वार।"]
];
export const VEDIC_EXTENSIONS = freezeList(VEDIC_ROWS.map(([hex,name,category,tradition,note])=>({
  character:cp(hex),codePoint:"U+"+hex,name,category,tradition,note,
  pronunciationStatus:category.includes("accent")||category.includes("tone")?"requires-branch-context":"recognition-only-unless-source-verified"
})));

const DEVANAGARI_EXTENDED_ROWS = [
 ["A8E0","COMBINING DEVANAGARI DIGIT ZERO","samaveda-cantillation","सामवेदीय संयुक्त अंक; साधारण संख्या नहीं।"],
 ["A8E1","COMBINING DEVANAGARI DIGIT ONE","samaveda-cantillation","सामवेदीय संयुक्त अंक/स्वर-संकेत।"],
 ["A8E2","COMBINING DEVANAGARI DIGIT TWO","samaveda-cantillation","सामवेदीय संयुक्त अंक/स्वर-संकेत।"],
 ["A8E3","COMBINING DEVANAGARI DIGIT THREE","samaveda-cantillation","सामवेदीय संयुक्त अंक/स्वर-संकेत।"],
 ["A8E4","COMBINING DEVANAGARI DIGIT FOUR","samaveda-cantillation","सामवेदीय संयुक्त अंक।"],
 ["A8E5","COMBINING DEVANAGARI DIGIT FIVE","samaveda-cantillation","सामवेदीय संयुक्त अंक।"],
 ["A8E6","COMBINING DEVANAGARI DIGIT SIX","samaveda-cantillation","सामवेदीय संयुक्त अंक।"],
 ["A8E7","COMBINING DEVANAGARI DIGIT SEVEN","samaveda-cantillation","सामवेदीय संयुक्त अंक।"],
 ["A8E8","COMBINING DEVANAGARI DIGIT EIGHT","samaveda-cantillation","सामवेदीय संयुक्त अंक।"],
 ["A8E9","COMBINING DEVANAGARI DIGIT NINE","samaveda-cantillation","सामवेदीय संयुक्त अंक।"],
 ["A8EA","COMBINING DEVANAGARI LETTER A","samaveda-cantillation","सामवेदीय अक्षर-संकेत।"],
 ["A8EB","COMBINING DEVANAGARI LETTER U","samaveda-cantillation","सामवेदीय अक्षर-संकेत।"],
 ["A8EC","COMBINING DEVANAGARI LETTER KA","samaveda-cantillation","सामवेदीय अक्षर-संकेत।"],
 ["A8ED","COMBINING DEVANAGARI LETTER NA","samaveda-cantillation","सामवेदीय अक्षर-संकेत।"],
 ["A8EE","COMBINING DEVANAGARI LETTER PA","samaveda-cantillation","सामवेदीय अक्षर-संकेत।"],
 ["A8EF","COMBINING DEVANAGARI LETTER RA","samaveda-cantillation","सामवेदीय अक्षर-संकेत।"],
 ["A8F0","COMBINING DEVANAGARI LETTER VI","samaveda-cantillation","सामवेदीय अक्षर-संकेत।"],
 ["A8F1","COMBINING DEVANAGARI SIGN AVAGRAHA","samaveda-cantillation","सामवेदीय दीर्घीभाव/अवग्रह-संबंधी संकेत।"],
 ["A8F2","DEVANAGARI SIGN SPACING CANDRABINDU","nasalization","वैदिक चन्द्रबिन्दु का spacing रूप।"],
 ["A8F3","DEVANAGARI SIGN CANDRABINDU VIRAMA","nasalization","विशिष्ट वैदिक अनुनासिक चिह्न।"],
 ["A8F4","DEVANAGARI SIGN DOUBLE CANDRABINDU VIRAMA","nasalization","द्वि-चन्द्रबिन्दु वैदिक चिह्न।"],
 ["A8F5","DEVANAGARI SIGN CANDRABINDU TWO","nasalization","विशिष्ट वैदिक अनुनासिक चिह्न।"],
 ["A8F6","DEVANAGARI SIGN CANDRABINDU THREE","nasalization","विशिष्ट वैदिक अनुनासिक चिह्न।"],
 ["A8F7","DEVANAGARI SIGN CANDRABINDU AVAGRAHA","nasalization","अनुनासिक-अवग्रह संयुक्त संकेत।"],
 ["A8F8","DEVANAGARI SIGN PUSHPIKA","editorial-mark","पुष्पिका/पाण्डुलिपि placeholder; सामान्य ध्वनि नहीं।"],
 ["A8F9","DEVANAGARI GAP FILLER","editorial-mark","पाण्डुलिपि रिक्ति-भराव; सामान्य ध्वनि नहीं।"],
 ["A8FA","DEVANAGARI CARET","editorial-mark","पाठ-संपादन insertion संकेत।"],
 ["A8FB","DEVANAGARI HEADSTROKE","editorial-mark","पाण्डुलिपि-पाठ अनिश्चितता का संकेत।"],
 ["A8FC","DEVANAGARI SIGN SIDDHAM","invocation-sign","सिद्धम् मंगल-चिह्न; सामान्य अक्षर नहीं।"],
 ["A8FD","DEVANAGARI JAIN OM","religious-sign","जैन ओम् चिह्न; सामान्य ॐ से अलग।"],
 ["A8FE","DEVANAGARI LETTER AY","extended-vowel-letter","विस्तारित स्वर-वर्ण; सामान्य संस्कृत स्वर-सूची से अलग।"],
 ["A8FF","DEVANAGARI VOWEL SIGN AY","extended-vowel-sign","विस्तारित स्वर-मात्रा; सामान्य संस्कृत मात्रा-सूची से अलग।"]
];
export const DEVANAGARI_EXTENDED = freezeList(DEVANAGARI_EXTENDED_ROWS.map(([hex,name,category,note])=>({
  character:cp(hex),codePoint:"U+"+hex,name,category,note,
  pronunciationStatus:category==="editorial-mark"||category==="invocation-sign"||category==="religious-sign"?"not-spoken-as-a-letter":"requires-context"
})));

const DEVANAGARI_EXTENDED_A_ROWS = [
 ["11B00","DEVANAGARI HEAD MARK","manuscript-head-mark","पाण्डुलिपि का शीर्ष-चिह्न; ध्वनि नहीं।"],
 ["11B01","DEVANAGARI HEAD MARK WITH HEADSTROKE","manuscript-head-mark","शीर्ष-चिह्न का विस्तारित रूप; ध्वनि नहीं।"],
 ["11B02","DEVANAGARI SIGN BHALE","jain-manuscript-auspicious-sign","जैन पाण्डुलिपि का मंगल-चिह्न; वैदिक स्वराघात नहीं।"],
 ["11B03","DEVANAGARI SIGN BHALE WITH HOOK","jain-manuscript-auspicious-sign","जैन पाण्डुलिपि का मंगल-चिह्न; वैदिक स्वराघात नहीं।"],
 ["11B04","DEVANAGARI SIGN EXTENDED BHALE","jain-manuscript-auspicious-sign","जैन पाण्डुलिपि का मंगल-चिह्न; वैदिक स्वराघात नहीं।"],
 ["11B05","DEVANAGARI SIGN EXTENDED BHALE WITH HOOK","jain-manuscript-auspicious-sign","जैन पाण्डुलिपि का मंगल-चिह्न; वैदिक स्वराघात नहीं।"],
 ["11B06","DEVANAGARI SIGN WESTERN FIVE-LIKE BHALE","jain-manuscript-auspicious-sign","जैन पाण्डुलिपि का मंगल-चिह्न; वैदिक स्वराघात नहीं।"],
 ["11B07","DEVANAGARI SIGN WESTERN NINE-LIKE BHALE","jain-manuscript-auspicious-sign","जैन पाण्डुलिपि का मंगल-चिह्न; वैदिक स्वराघात नहीं।"],
 ["11B08","DEVANAGARI SIGN REVERSED NINE-LIKE BHALE","jain-manuscript-auspicious-sign","जैन पाण्डुलिपि का मंगल-चिह्न; वैदिक स्वराघात नहीं।"],
 ["11B09","DEVANAGARI SIGN MINDU","jain-manuscript-auspicious-sign","जैन पाण्डुलिपि का समाप्ति/मंगल-संकेत; संदर्भ से जाँचें।"],
 ["11B0A","DEVANAGARI LETTER ALTERNATE DDDA","sindhi-implosive-letter","सिंधी digitization का वैकल्पिक वर्ण; इसे वैदिक वर्ण न मानें।"]
];
export const DEVANAGARI_EXTENDED_A = freezeList(DEVANAGARI_EXTENDED_A_ROWS.map(([hex,name,category,note])=>({
  character:cp(hex),codePoint:"U+"+hex,name,category,note,
  pronunciationStatus:category==="sindhi-implosive-letter"?"non-sanskrit-extension":"recognition-only"
})));

export const PUNCTUATION_AND_NUMBERS = freezeList([
  {characters:["।","॥"],category:"danda-punctuation",note:"पाठ-विराम; अवधि संदर्भ/छन्द पर निर्भर।"},
  {characters:["०","१","२","३","४","५","६","७","८","९"],category:"devanagari-digits",note:"सामान्य देवनागरी अंक; मंत्र-पाठ में संख्या/प्लुत संदर्भ अलग जाँचें।"},
  {characters:["।","॥","॰","ऽ"],category:"sanskrit-editorial-signs",note:"विराम, अवग्रह और संपादकीय संकेत; इन्हें शब्द की तरह न बोलें।"},
  {characters:[",",";",":",".","?","!","(",")","[","]","{","}","—","–","“","”","‘","’","'","\""],category:"general-punctuation",note:"विराम/संपादन चिह्न; पाठ-तैयारी में सुरक्षित रखें।"}
]);
export const AKSHARA_RULES = freezeList([
  {id:"inherent-a",description:"व्यंजन में अंतर्निहित अ होता है, जब तक हलन्त या अन्य स्वर-मात्रा उसे बदल न दे।",status:"orthographic-rule"},
  {id:"virama-conjunct",description:"व्यंजन + हलन्त + व्यंजन को संयुक्ताक्षर-संयोग के रूप में पहचाना जाए।",status:"orthographic-rule"},
  {id:"nukta-consonant",description:"नुक्ता को उसके मूल व्यंजन से जुड़ा रखा जाए।",status:"orthographic-rule"},
  {id:"vowel-sign",description:"स्वर-मात्रा को उससे पहले के व्यंजन-अक्षर से जोड़ा जाए।",status:"orthographic-rule"},
  {id:"vedic-combining-mark",description:"वैदिक combining mark को उसके आधार अक्षर से अलग न किया जाए।",status:"orthographic-rule"},
  {id:"unknown-preservation",description:"अज्ञात/असमर्थित चिह्न को हटाया, बदला या उच्चारण-अनुमान से प्रतिस्थापित न किया जाए।",status:"safety-rule"}
]);

const WORD_SEEDS = [
 {text:"अग्निमीळे",category:"vedic-word",difficulty:["ळ","दीर्घ स्वर"],iast:"agnimīḷe",source:{work:"ऋग्वेद",mandala:1,sukta:1,mantra:1,edition:"शाकल पाठ; स्रोत-पुष्टि आवश्यक"},spellingStatus:"source-attested",pronunciationStatus:"requires-review",shakha:"rigveda-shakala"},
 {text:"दधिक्राव्णः",category:"vedic-word",difficulty:["व्यंजन-समूह","विसर्ग"],source:null,spellingStatus:"seed-for-review",pronunciationStatus:"requires-review"},
 {text:"ऋत्विजम्",category:"vedic-word",difficulty:["ऋ","त्व","व्यंजन-समूह"],source:null,spellingStatus:"seed-for-review",pronunciationStatus:"requires-review"},
 {text:"त्वष्टा",category:"vedic-word",difficulty:["त्व","ष्ट"],source:null,spellingStatus:"seed-for-review",pronunciationStatus:"requires-review"},
 {text:"बृहस्पतिः",category:"vedic-word",difficulty:["बृ","हस्","स्प"],source:null,spellingStatus:"seed-for-review",pronunciationStatus:"requires-review"},
 {text:"ब्रह्मणस्पतिः",category:"vedic-word",difficulty:["ब्रह्म","णस्","स्प"],source:null,spellingStatus:"seed-for-review",pronunciationStatus:"requires-review"},
 {text:"अङ्गिरसः",category:"vedic-word",difficulty:["ङ्ग","विसर्ग"],source:null,spellingStatus:"seed-for-review",pronunciationStatus:"requires-review"},
 {text:"हिरण्यगर्भः",category:"vedic-word",difficulty:["ण्य","र्भ","विसर्ग"],source:null,spellingStatus:"seed-for-review",pronunciationStatus:"requires-review"},
 {text:"वृत्रहन्",category:"vedic-word",difficulty:["ऋ","वृ","त्र"],source:null,spellingStatus:"seed-for-review",pronunciationStatus:"requires-review"},
 {text:"यज्ञेन",category:"vedic-word",difficulty:["ज्ञ"],source:null,spellingStatus:"seed-for-review",pronunciationStatus:"requires-review"},
 {text:"विश्वेदेवाः",category:"vedic-word",difficulty:["श्व","विसर्ग"],source:null,spellingStatus:"seed-for-review",pronunciationStatus:"requires-review"},
 {text:"त्रिष्टुप्",category:"vedic-metre",difficulty:["त्र","ष्ट","हलन्त"],source:null,spellingStatus:"seed-for-review",pronunciationStatus:"requires-review"},
 {text:"अनुष्टुप्",category:"vedic-metre",difficulty:["ष्ट","हलन्त"],source:null,spellingStatus:"seed-for-review",pronunciationStatus:"requires-review"},
 {text:"उष्णिक्",category:"vedic-metre",difficulty:["ष्ण","हलन्त"],source:null,spellingStatus:"seed-for-review",pronunciationStatus:"requires-review"},
 {text:"स्वधा",category:"vedic-word",difficulty:["स्व"],source:null,spellingStatus:"seed-for-review",pronunciationStatus:"requires-review"},
 {text:"नासत्यौ",category:"vedic-word",difficulty:["संयुक्त स्वर"],source:null,spellingStatus:"seed-for-review",pronunciationStatus:"requires-review"},
 {text:"पुरोहितम्",category:"vedic-word",difficulty:["स्वर-मात्रा","हलन्त-संदर्भ"],source:null,spellingStatus:"seed-for-review",pronunciationStatus:"requires-review"},
 {text:"रत्नधातमम्",category:"vedic-word",difficulty:["त्न","ध"],source:null,spellingStatus:"seed-for-review",pronunciationStatus:"requires-review"},
 {text:"गलेऽवलम्ब्य",category:"classical-stotra-word",difficulty:["अवग्रह","म्ब्य"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"भुजङ्गतुङ्गमालिकाम्",category:"classical-stotra-word",difficulty:["ङ्ग","तुङ्ग","हलन्त"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"डमड्डमड्डमन्निनाद",category:"classical-stotra-word",difficulty:["ड्ड","न्न"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"चण्डताण्डवम्",category:"classical-stotra-word",difficulty:["ण्ड","ण्डव"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"जटाकटाहसम्भ्रम",category:"classical-stotra-word",difficulty:["ट","टाह","म्भ्र"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"निलिम्पनिर्झरी",category:"classical-stotra-word",difficulty:["म्प","निर्झ"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"विलोलवीचिवल्लरी",category:"classical-stotra-word",difficulty:["वीचि","ल्ल"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"धगद्धगद्धगज्ज्वलल्ललाटपट्टपावके",category:"classical-stotra-word",difficulty:["द्ध","ज्ज्व","ल्ल","ट्ट"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"किशोरचन्द्रशेखरे",category:"classical-stotra-word",difficulty:["चन्द्र","शेख"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"धराधरेन्द्रनन्दिनी",category:"classical-stotra-word",difficulty:["द्रेन्द्र","न्द"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"स्फुरद्दिगन्त",category:"classical-stotra-word",difficulty:["स्फ","द्दि"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"कृपाकटाक्षधोरणी",category:"classical-stotra-word",difficulty:["कृ","क्ष"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"निरुद्धदुर्धरापदि",category:"classical-stotra-word",difficulty:["रुद्ध","र्ध"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"जटाभुजङ्गपिङ्गल",category:"classical-stotra-word",difficulty:["ङ्ग","ङ्गपिङ्ग"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"स्फुरत्फणामणिप्रभा",category:"classical-stotra-word",difficulty:["त्फ","णामणि"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"कदम्बकुङ्कुमद्रव",category:"classical-stotra-word",difficulty:["म्ब","ङ्कु","द्र"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"दिग्वधूमुखे",category:"classical-stotra-word",difficulty:["ग्व","धू"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"सिन्धुरस्फुरत्त्वगुत्तरीय",category:"classical-stotra-word",difficulty:["न्धु","स्फु","त्त्व"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"करालभालपट्टिका",category:"classical-stotra-word",difficulty:["भाल","ट्टि"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"धनञ्जयाहुतीकृत",category:"classical-stotra-word",difficulty:["ञ्ज","हू","कृत"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"प्रचण्डपञ्चसायके",category:"classical-stotra-word",difficulty:["ण्ड","ञ्च"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"},
 {text:"कुचाग्रचित्रपत्रकप्रकल्पनैकशिल्पिनि",category:"classical-stotra-word",difficulty:["ग्र","त्र","प्र","ल्प"],source:{work:"शिवताण्डव स्तोत्र",recension:"अभी निर्धारित नहीं",verse:null},spellingStatus:"variant-review-required",pronunciationStatus:"requires-review",shakha:"classical-sanskrit"}
];

export const PRONUNCIATION_DICTIONARY = freezeList(WORD_SEEDS.map((entry,index)=>({
  id:"pronunciation-"+String(index+1).padStart(4,"0"),
  text:entry.text,lookupKey:entry.text.normalize("NFC"),category:entry.category,
  difficulty:Object.freeze(entry.difficulty.slice()),iast:entry.iast||null,
  phonemeSequence:null,nativeSpeechText:null,accentPattern:null,shakha:entry.shakha||null,
  source:entry.source?Object.freeze({...entry.source}):null,
  verification:Object.freeze({spelling:entry.spellingStatus,pronunciation:entry.pronunciationStatus,accent:"not-verified"}),
  note:"शब्द-बीज/समीक्षा रिकॉर्ड; phonemeSequence और nativeSpeechText अनुमान से नहीं भरे गए।"
})));

const CHARACTER_INFO = new Map();
const VEDIC_INFO = new Map();
const WORD_INFO = new Map(PRONUNCIATION_DICTIONARY.map(entry=>[entry.lookupKey,entry]));
function addCharacter(character,info){CHARACTER_INFO.set(character,Object.freeze({character,codePoint:codePointOf(character),...info}));}
VOWELS.forEach(item=>addCharacter(item.character,{category:"vowel",label:item.label,teachingMatras:item.teachingMatras,pronunciationStatus:item.pronunciationStatus}));
CONSONANTS.forEach(item=>addCharacter(item.character,{category:"consonant",place:item.place,placeId:item.placeId,aspiration:item.aspiration,pronunciationStatus:item.pronunciationStatus}));
VEDIC_ADDITIONAL_CONSONANTS.forEach(item=>addCharacter(item.character,{category:item.category,label:item.label,note:item.note,pronunciationStatus:item.pronunciationStatus}));
VOWEL_SIGNS.forEach(item=>addCharacter(item.character,{category:"vowel-sign",label:item.label,vowel:item.vowel}));
CORE_SCRIPT_SIGNS.forEach(item=>addCharacter(item.character,{category:item.category,name:item.name,note:item.note,accent:item.accent||null}));
DEVANAGARI_DIGITS.forEach(item=>addCharacter(item.character,{category:"digit",value:item.value}));
VEDIC_EXTENSIONS.forEach(item=>{
  addCharacter(item.character,{category:item.category,name:item.name,tradition:item.tradition,note:item.note,pronunciationStatus:item.pronunciationStatus});
  VEDIC_INFO.set(item.character,item);
});
DEVANAGARI_EXTENDED.forEach(item=>{
  addCharacter(item.character,{category:item.category,name:item.name,note:item.note,pronunciationStatus:item.pronunciationStatus});
  if(item.category.includes("cantillation")||item.category==="nasalization") VEDIC_INFO.set(item.character,item);
});
DEVANAGARI_EXTENDED_A.forEach(item=>addCharacter(item.character,{category:item.category,name:item.name,note:item.note,pronunciationStatus:item.pronunciationStatus}));

function blockForCodePoint(codePoint){return SCRIPT_BLOCKS.find(block=>codePoint>=block.start&&codePoint<=block.end)||null;}
const CONSONANT_SET = new Set(CONSONANTS.map(item=>item.character).concat(VEDIC_ADDITIONAL_CONSONANTS.map(item=>item.character)));
const VOWEL_SET = new Set(VOWELS.map(item=>item.character));
const VOWEL_SIGN_SET = new Set(VOWEL_SIGNS.map(item=>item.character));
const VIRAMA = "्", NUKTA = "़";
const JOINERS = new Set(["‍","‌"]);
const MARK_SET = new Set([
  ...VOWEL_SIGN_SET,
  ...CORE_SCRIPT_SIGNS.filter(item=>["nasalization","special-nasalization","visarga","orthographic-mark","virama","vedic-accent","accent-or-transliteration-mark"].includes(item.category)).map(item=>item.character),
  ...VEDIC_EXTENSIONS.filter(item=>item.category.includes("accent")||item.category.includes("tone")||item.category.includes("nasalization")||item.category.includes("visarga")).map(item=>item.character),
  ...DEVANAGARI_EXTENDED.filter(item=>item.category.includes("cantillation")||item.category==="nasalization").map(item=>item.character),
  NUKTA
]);


export const VEDIC_PRONUNCIATION_CONTRACT_VERSION = "1.1.0";

const CONSONANT_FEATURE_BY_CHARACTER = new Map();
CONSONANT_GROUPS.forEach((group, groupIndex) => {
  group.characters.forEach((character, characterIndex) => {
    let feature;
    if (groupIndex <= 4) {
      if (characterIndex === 4) {
        feature = {placeId:group.id,place:group.place,manner:"nasal",voicing:"voiced",aspiration:"unaspirated",series:"fifth-nasal",evidenceLevel:"traditional-articulation-class"};
      } else {
        const series=[
          {voicing:"voiceless",aspiration:"unaspirated"},
          {voicing:"voiceless",aspiration:"aspirated"},
          {voicing:"voiced",aspiration:"unaspirated"},
          {voicing:"voiced",aspiration:"aspirated"}
        ][characterIndex];
        feature={placeId:group.id,place:group.place,manner:"stop",voicing:series.voicing,aspiration:series.aspiration,series:["first","second","third","fourth"][characterIndex],evidenceLevel:"traditional-articulation-class"};
      }
    } else if (groupIndex===5) {
      const places={"य":"palatal","र":"retroflex","ल":"dental","व":"labiodental-or-labial"};
      feature={placeId:places[character],manner:"approximant",voicing:"voiced",aspiration:"not-applicable",evidenceLevel:"traditional-articulation-class"};
    } else {
      const places={"श":"palatal","ष":"retroflex","स":"dental","ह":"glottal-or-context-dependent"};
      feature={placeId:places[character],manner:"fricative",voicing:character==="ह"?"context-dependent":"voiceless",aspiration:"not-applicable",evidenceLevel:character==="ह"?"requires-context-review":"traditional-articulation-class"};
    }
    CONSONANT_FEATURE_BY_CHARACTER.set(character,Object.freeze(feature));
  });
});
const VOWEL_INFO_BY_CHARACTER=new Map(VOWELS.map(item=>[item.character,item]));
const VOWEL_SIGN_INFO_BY_CHARACTER=new Map(VOWEL_SIGNS.map(item=>[item.character,item]));
const POSTPOSED_SIGN_CATEGORIES=new Set(["nasalization","special-nasalization","visarga","vedic-accent","accent-or-transliteration-mark"]);
const SHAKHA_ALIASES=Object.freeze({"shaakala":"rigveda-shakala","shakala":"rigveda-shakala","rigveda-shakala":"rigveda-shakala"});
function normalizeShakhaIdentifier(value){
  if(typeof value!=="string"||!value.trim())return null;
  const normalized=value.trim().toLowerCase();
  return SHAKHA_ALIASES[normalized]||normalized;
}
function getVowelFeature(character,source){
  const independent=VOWEL_INFO_BY_CHARACTER.get(character);
  if(independent)return Object.freeze({character,vowelId:independent.id,label:independent.label,length:independent.teachingMatras===1?"short":"long",teachingMatras:independent.teachingMatras,source,evidenceLevel:"orthographic-vowel-identity"});
  const sign=VOWEL_SIGN_INFO_BY_CHARACTER.get(character);
  if(sign){
    const vowel=VOWEL_INFO_BY_CHARACTER.get(sign.vowel);
    return Object.freeze({character,vowel:sign.vowel,vowelId:vowel?vowel.id:null,label:sign.label,length:vowel&&vowel.teachingMatras===1?"short":"long",teachingMatras:vowel?vowel.teachingMatras:null,source,evidenceLevel:"orthographic-vowel-sign"});
  }
  return null;
}
function analyzeOrthographicUnit(unit,unitIndex){
  const characters=Array.from(unit.text),consonants=[],signs=[],vowelSigns=[];
  let independentVowel=null;
  characters.forEach((character,localIndex)=>{
    const consonant=CONSONANT_FEATURE_BY_CHARACTER.get(character);
    if(consonant)consonants.push(Object.freeze({character,localCodePointIndex:localIndex,codePoint:codePointOf(character),...consonant}));
    const info=CHARACTER_INFO.get(character);
    if(info&&POSTPOSED_SIGN_CATEGORIES.has(info.category))signs.push(Object.freeze({character,codePoint:codePointOf(character),category:info.category,name:info.name||null,localCodePointIndex:localIndex}));
    const vowelSign=getVowelFeature(character,"vowel-sign");
    if(vowelSign&&VOWEL_SIGN_INFO_BY_CHARACTER.has(character))vowelSigns.push(vowelSign);
    if(localIndex===0&&VOWEL_INFO_BY_CHARACTER.has(character))independentVowel=getVowelFeature(character,"independent-vowel");
  });
  let vowelNucleus=null;
  if(vowelSigns.length)vowelNucleus=vowelSigns[vowelSigns.length-1];
  else if(independentVowel)vowelNucleus=independentVowel;
  else if(consonants.length&&characters[characters.length-1]!==VIRAMA){
    const inherent=VOWEL_INFO_BY_CHARACTER.get("अ");
    vowelNucleus=Object.freeze({character:null,vowel:"अ",vowelId:inherent.id,label:inherent.label,length:"short",teachingMatras:1,source:"inherent-vowel",evidenceLevel:"orthographic-inherent-vowel"});
  }
  return Object.freeze({
    index:unitIndex,text:unit.text,startCodePointIndex:unit.startCodePointIndex,endCodePointIndex:unit.endCodePointIndex,codePointLength:unit.codePointLength,
    consonants:Object.freeze(consonants),vowelNucleus,vowelSigns:Object.freeze(vowelSigns),postposedSigns:Object.freeze(signs),
    endsInVirama:characters[characters.length-1]===VIRAMA,
    phonemeSequence:null,phonemeSequenceStatus:"not-inferred",syllableBoundary:null,syllableBoundaryStatus:"not-inferred",
    analysisLevel:"orthographic-feature-analysis"
  });
}
export function analyzeAksharaPhonetics(text,options={}){
  if(typeof text!=="string")throw new TypeError("analyzeAksharaPhonetics() में text string आवश्यक है।");
  if(!options||typeof options!=="object"||Array.isArray(options))throw new TypeError("analyzeAksharaPhonetics() के options Object होने चाहिए।");
  const segmented=segmentDevanagariAksharas(text);
  const orthographicUnits=Object.freeze(segmented.map(analyzeOrthographicUnit));
  return Object.freeze({
    originalText:text,originalTextPreserved:true,analysisLevel:"orthographic-feature-analysis",orthographicUnits,
    aksharaCount:orthographicUnits.length,
    consonantFeatureCount:orthographicUnits.reduce((n,u)=>n+u.consonants.length,0),
    vowelNucleusCount:orthographicUnits.filter(u=>u.vowelNucleus).length,
    postposedSignCount:orthographicUnits.reduce((n,u)=>n+u.postposedSigns.length,0),
    phonemeSequence:null,phonemeSequenceStatus:"not-inferred",
    syllableBoundaries:Object.freeze([]),syllableBoundaryStatus:"not-inferred",
    ipa:null,ipaStatus:"not-inferred",shakha:normalizeShakhaIdentifier(options.shakha),
    note:"यह देवनागरी orthography से निकला structured feature analysis है; यह पूर्ण phonetic transcription, IPA या श्रव्य उच्चारण का प्रमाण नहीं है।"
  });
}
function tokenizePronunciationWords(text){
  const matcher=/[\u0900-\u097F\uA8E0-\uA8FF\u{11B00}-\u{11B0A}\u{1CD0}-\u{1CFA}]+/gu;
  return Array.from(text.matchAll(matcher),match=>{
    const startCodePointIndex=Array.from(text.slice(0,match.index)).length;
    const endUtf16Index=match.index+match[0].length;
    return Object.freeze({text:match[0],normalized:match[0].normalize("NFC"),startUtf16Index:match.index,endUtf16Index,startCodePointIndex,endCodePointIndex:startCodePointIndex+Array.from(match[0]).length});
  });
}
function candidateSequence(entry){
  const raw=entry&&entry.context&&entry.context.requiredSequence;
  if(!Array.isArray(raw)||!raw.length||raw.some(item=>typeof item!=="string"||!item.trim()))return [];
  return raw.map(item=>item.normalize("NFC").trim());
}
function findCandidateOccurrences(tokens,entry){
  const term=String(entry.term||"").normalize("NFC").trim();
  if(!term)return [];
  const matchType=entry.matchType||"exact";
  if(matchType==="exact")return tokens.filter(token=>token.normalized===term).map(token=>({first:token,last:token,termToken:token,sequence:[term]}));
  if(matchType!=="contextual-exact")return [];
  const sequence=candidateSequence(entry);
  if(!sequence.length||sequence.filter(item=>item===term).length!==1)return [];
  const matches=[];
  for(let start=0;start<=tokens.length-sequence.length;start++){
    let valid=true;
    for(let offset=0;offset<sequence.length;offset++){
      if(tokens[start+offset].normalized!==sequence[offset]){valid=false;break;}
    }
    if(valid){
      const termOffset=sequence.indexOf(term);
      matches.push({first:tokens[start],last:tokens[start+sequence.length-1],termToken:tokens[start+termOffset],sequence});
    }
  }
  return matches;
}
export function analyzePronunciationCandidates(text,candidates,options={}){
  if(typeof text!=="string")throw new TypeError("analyzePronunciationCandidates() में text string आवश्यक है।");
  if(!Array.isArray(candidates))throw new TypeError("Pronunciation candidates Array होना चाहिए।");
  if(!options||typeof options!=="object"||Array.isArray(options))throw new TypeError("analyzePronunciationCandidates() के options Object होने चाहिए।");
  const tokens=tokenizePronunciationWords(text),requestedShakha=normalizeShakhaIdentifier(options.shakha);
  const matches=[],contextRequired=[],rejected=[],conflicts=[],inactive=[],seenIds=new Set(),seenIdentities=new Set();
  candidates.forEach((entry,candidateIndex)=>{
    if(!entry||typeof entry!=="object"||Array.isArray(entry)||typeof entry.id!=="string"||!entry.id.trim()||typeof entry.term!=="string"||!entry.term.trim()){
      rejected.push(Object.freeze({candidateIndex,reason:"invalid-candidate-shape"}));return;
    }
    if(seenIds.has(entry.id)){conflicts.push(Object.freeze({id:entry.id,reason:"duplicate-candidate-id"}));return;}
    seenIds.add(entry.id);
    if(!entry.activation||entry.activation.enabled!==true||entry.activation.lookupEnabled!==true){
      inactive.push(Object.freeze({id:entry.id,reason:"candidate-lookup-disabled"}));return;
    }
    const scope=entry.scope||(entry.context&&entry.context.scope)||"general";
    const shakha=normalizeShakhaIdentifier(entry.context&&entry.context.shakha);
    if(!["general","shakha-specific"].includes(scope)||(scope==="shakha-specific"&&!shakha)||(scope==="general"&&shakha)){
      rejected.push(Object.freeze({id:entry.id,reason:"invalid-scope-or-shakha"}));return;
    }
    const identity=[
      entry.term.normalize("NFC"),entry.matchType||"exact",scope,shakha||"",
      candidateSequence(entry).join("|"),
      Array.isArray(entry.voiceLocales)?entry.voiceLocales.join("|"):"",
      entry.voiceProfile&&entry.voiceProfile.engine||"",
      entry.voiceProfile&&entry.voiceProfile.voiceURI||"",
      entry.voiceProfile&&entry.voiceProfile.locale||""
    ].join("\u0000");
    if(seenIdentities.has(identity)){conflicts.push(Object.freeze({id:entry.id,reason:"duplicate-candidate-identity"}));return;}
    seenIdentities.add(identity);
    const occurrences=findCandidateOccurrences(tokens,entry);
    if(!occurrences.length)return;
    if(scope==="shakha-specific"&&!requestedShakha){
      contextRequired.push(Object.freeze({id:entry.id,term:entry.term,requiredShakha:shakha,reason:"explicit-shakha-required",
        occurrences:Object.freeze(occurrences.map(item=>Object.freeze({startCodePointIndex:item.termToken.startCodePointIndex,endCodePointIndex:item.termToken.endCodePointIndex})))}));
      return;
    }
    if(scope==="shakha-specific"&&requestedShakha!==shakha){
      rejected.push(Object.freeze({id:entry.id,term:entry.term,reason:"shakha-mismatch",requiredShakha:shakha,requestedShakha}));return;
    }
    occurrences.forEach(item=>matches.push(Object.freeze({
      id:entry.id,term:entry.term,matchType:entry.matchType||"exact",scope,shakha,sequence:Object.freeze(item.sequence.slice()),
      startUtf16Index:item.first.startUtf16Index,endUtf16Index:item.last.endUtf16Index,
      startCodePointIndex:item.first.startCodePointIndex,endCodePointIndex:item.last.endCodePointIndex,
      termStartCodePointIndex:item.termToken.startCodePointIndex,termEndCodePointIndex:item.termToken.endCodePointIndex,
      candidateOnly:true,speechApplicationEnabled:Boolean(entry.speechApplication&&entry.speechApplication.enabled===true)
    })));
  });
  const ranges=new Map();
  matches.forEach(match=>{
    const key=String(match.startCodePointIndex)+":"+String(match.endCodePointIndex);
    const values=ranges.get(key)||[];values.push(match);ranges.set(key,values);
  });
  const conflictedIds=new Set();
  ranges.forEach((values,range)=>{
    if(values.length>1){
      values.forEach(item=>conflictedIds.add(item.id));
      conflicts.push(Object.freeze({range,reason:"overlapping-candidate-matches",candidateIds:Object.freeze(values.map(item=>item.id))}));
    }
  });
  const safeMatches=matches.filter(item=>!conflictedIds.has(item.id));
  return Object.freeze({
    originalText:text,originalTextPreserved:true,candidateCount:candidates.length,matchedCount:safeMatches.length,
    matches:Object.freeze(safeMatches),contextRequired:Object.freeze(contextRequired),rejected:Object.freeze(rejected),
    inactive:Object.freeze(inactive),conflicts:Object.freeze(conflicts),
    unmatchedCandidateCount:Math.max(0,candidates.length-safeMatches.length-contextRequired.length-rejected.length-inactive.length-conflicts.filter(item=>item.id).length),
    speechText:text,speechTextModified:false,
    note:"Candidate matching केवल lookup और analysis है; इससे Native TTS output बदलने की अनुमति नहीं मिलती।"
  });
}

export function getCharacterInfo(character){
  if(typeof character!=="string"||Array.from(character).length!==1) return Object.freeze({found:false,error:"एक Unicode code point वाला character दें।"});
  const known=CHARACTER_INFO.get(character);
  if(known) return Object.freeze({found:true,...known});
  const codePoint=character.codePointAt(0), block=blockForCodePoint(codePoint);
  if(block) return Object.freeze({found:false,character,codePoint:codePointOf(character),block:block.name,category:"unmapped-or-unassigned-block-codepoint",pronunciationStatus:"unknown-preserve-original"});
  if(/\p{M}/u.test(character)) return Object.freeze({found:false,character,codePoint:codePointOf(character),category:"unknown-combining-mark",pronunciationStatus:"unknown-preserve-original"});
  return Object.freeze({found:false,character,codePoint:codePointOf(character),category:"outside-pronunciation-inventory",pronunciationStatus:"not-analyzed"});
}

export function getVedicAccentInfo(mark){
  if(typeof mark!=="string"||Array.from(mark).length!==1) return null;
  const entry=VEDIC_INFO.get(mark);
  if(entry) return Object.freeze({character:entry.character,codePoint:entry.codePoint,name:entry.name,category:entry.category,tradition:entry.tradition||null,description:entry.note,readingPolicy:"context-and-shakha-required"});
  const core=CHARACTER_INFO.get(mark);
  if(core&&(core.category==="vedic-accent"||core.category==="accent-or-transliteration-mark")) return Object.freeze({...core,readingPolicy:"context-and-shakha-required"});
  return null;
}

export function findPronunciation(word,options={}){
  if(typeof word!=="string"||!word.trim()) return null;
  const entry=WORD_INFO.get(word.normalize("NFC"));
  if(!entry) return null;
  if(options&&options.shakha&&entry.shakha&&options.shakha!==entry.shakha) return null;
  return entry;
}

export function segmentDevanagariAksharas(text){
  if(typeof text!=="string") throw new TypeError("segmentDevanagariAksharas() में string आवश्यक है।");
  const characters=Array.from(text),output=[];
  let index=0;
  while(index<characters.length){
    const start=index;
    let current=characters[index++];
    if(CONSONANT_SET.has(current)){
      if(characters[index]===NUKTA) current+=characters[index++];
      while(characters[index]===VIRAMA){
        current+=characters[index++];
        while(JOINERS.has(characters[index])) current+=characters[index++];
        if(CONSONANT_SET.has(characters[index])){
          current+=characters[index++];
          if(characters[index]===NUKTA) current+=characters[index++];
        }else break;
      }
      while(index<characters.length&&MARK_SET.has(characters[index])&&characters[index]!==VIRAMA) current+=characters[index++];
    }else if(VOWEL_SET.has(current)){
      while(index<characters.length&&MARK_SET.has(characters[index])&&characters[index]!==VIRAMA) current+=characters[index++];
    }else if(MARK_SET.has(current)){
      while(index<characters.length&&MARK_SET.has(characters[index])) current+=characters[index++];
    }
    output.push(Object.freeze({text:current,startCodePointIndex:start,endCodePointIndex:index,codePointLength:index-start}));
  }
  return Object.freeze(output);
}

export function analyzeConjuncts(text){
  if(typeof text!=="string") throw new TypeError("analyzeConjuncts() में string आवश्यक है।");
  const characters=Array.from(text),found=[];
  for(let index=0;index<characters.length;index++){
    if(!CONSONANT_SET.has(characters[index])) continue;
    let cursor=index+1,cluster=characters[index];
    if(characters[cursor]===NUKTA) cluster+=characters[cursor++];
    while(characters[cursor]===VIRAMA){
      cluster+=characters[cursor++];
      while(JOINERS.has(characters[cursor])) cluster+=characters[cursor++];
      if(!CONSONANT_SET.has(characters[cursor])) break;
      cluster+=characters[cursor++];
      if(characters[cursor]===NUKTA) cluster+=characters[cursor++];
      found.push(Object.freeze({text:cluster,startCodePointIndex:index,endCodePointIndex:cursor,type:"consonant-conjunct"}));
      index=cursor-1;
    }
  }
  return Object.freeze(found);
}

export function analyzeMatras(text){
  if(typeof text!=="string") throw new TypeError("analyzeMatras() में string आवश्यक है।");
  const counts=Object.create(null),occurrences=[];
  for(const character of Array.from(text)){
    if(!VOWEL_SIGN_SET.has(character)) continue;
    counts[character]=(counts[character]||0)+1;
    occurrences.push(Object.freeze({character,info:CHARACTER_INFO.get(character)||null}));
  }
  return Object.freeze({total:occurrences.length,counts:Object.freeze({...counts}),occurrences:Object.freeze(occurrences)});
}

export function analyzeAccentMarks(text,options={}){
  if(typeof text!=="string") throw new TypeError("analyzeAccentMarks() में string आवश्यक है।");
  const characters=Array.from(text),occurrences=[];
  characters.forEach((character,codePointIndex)=>{
    const info=getVedicAccentInfo(character);
    if(info) occurrences.push(Object.freeze({...info,codePointIndex,previousCharacter:codePointIndex>0?characters[codePointIndex-1]:null,shakha:options.shakha||null,verifiedForShakha:Boolean(options.shakha&&info.tradition&&info.tradition===options.shakha)}));
  });
  return Object.freeze(occurrences);
}

function findWords(text){
  const matcher=/[\u0900-\u097F\uA8E0-\uA8FF\u{11B00}-\u{11B0A}\u{1CD0}-\u{1CFA}]+/gu;
  return Array.from(text.matchAll(matcher),match=>Object.freeze({text:match[0],start:match.index,dictionaryEntry:findPronunciation(match[0])}));
}

export function analyzeVedicText(text,options={}){
  if(typeof text!=="string") throw new TypeError("analyzeVedicText() में पाठ string होना चाहिए।");
  const characters=Array.from(text),characterCounts=Object.create(null),unclassifiedMarks=[],codePoints=[],vedicMarks=[],blockCounts=Object.create(null);
  characters.forEach((character,index)=>{
    const info=getCharacterInfo(character),key=info.category||"unknown";
    characterCounts[key]=(characterCounts[key]||0)+1;
    const record=Object.freeze({character,codePoint:codePointOf(character),index,category:key,known:info.found});
    codePoints.push(record);
    if(info.block) blockCounts[info.block]=(blockCounts[info.block]||0)+1;
    if(!info.found&&(info.category==="unknown-combining-mark"||info.category==="unmapped-or-unassigned-block-codepoint")) unclassifiedMarks.push(record);
    const accent=getVedicAccentInfo(character);
    if(accent) vedicMarks.push(Object.freeze({...accent,index}));
  });
  const words=findWords(text),knownWords=words.filter(item=>item.dictionaryEntry);
  const conjuncts=analyzeConjuncts(text),matras=analyzeMatras(text),accents=analyzeAccentMarks(text,options);
  const phoneticStructure=analyzeAksharaPhonetics(text,options);
  const hasVedicExtensions=characters.some(character=>{const point=character.codePointAt(0);return point>=0x1cd0&&point<=0x1cfa;});
  const hasSamavedaExtended=characters.some(character=>{const point=character.codePointAt(0);return point>=0xa8e0&&point<=0xa8f7;});
  return Object.freeze({
    originalText:text,originalCodePoints:Object.freeze(codePoints),codePointCount:characters.length,
    characterCounts:Object.freeze({...characterCounts}),blockCounts:Object.freeze({...blockCounts}),
    aksharas:phoneticStructure.orthographicUnits,phoneticStructure,
    phoneticStructureStatus:phoneticStructure.analysisLevel,
    vowels:Object.freeze(codePoints.filter(item=>item.category==="vowel")),
    consonants:Object.freeze(codePoints.filter(item=>item.category==="consonant"||item.category==="vedic-additional-consonant")),
    words:Object.freeze(words),knownDifficultWords:Object.freeze(knownWords),
    unlistedWords:Object.freeze(words.filter(item=>!item.dictionaryEntry)),
    conjuncts,matras,accentMarks:accents,vedicMarks:Object.freeze(vedicMarks),
    unclassifiedMarks:Object.freeze(unclassifiedMarks),hasVedicExtensions,hasSamavedaExtended,
    needsBranchContext:hasVedicExtensions||hasSamavedaExtended||accents.length>0,originalTextPreserved:true
  });
}

export function prepareVedicSpeech(text,options={}){
  if(typeof text!=="string") throw new TypeError("prepareVedicSpeech() में पाठ string होना चाहिए।");
  const analysis=analyzeVedicText(text,options);
  const hasAccentData=analysis.accentMarks.length>0||analysis.hasVedicExtensions||analysis.hasSamavedaExtended;
  const unresolvedMarks=analysis.unclassifiedMarks.length>0,blockedReasons=[];
  if(hasAccentData) blockedReasons.push("वैदिक/सामवेदीय चिह्न मौजूद हैं; चुने हुए Backend पर उनका ध्वनि-व्यवहार प्रमाणित नहीं है।");
  if(unresolvedMarks) blockedReasons.push("अज्ञात या unmapped combining/script marks मौजूद हैं; इन्हें हटाना या बदलना सुरक्षित नहीं है।");
  return Object.freeze({
    originalText:text,speechText:text,modified:false,safeToTransform:false,analysis,
    nativeTtsRecommendation:hasAccentData||unresolvedMarks?"not-certified-for-special-marks":"plain-text-still-requires-voice-review",
    requiresBranchContext:analysis.needsBranchContext,requiresAccentAwareBackend:hasAccentData,
    blockedReasons:Object.freeze(blockedReasons),
    policy:"मूल पाठ अक्षरशः सुरक्षित है। कोई उच्चारण-अनुमान, स्वर-चिह्न हटाना, मात्रा बदलना या शब्द प्रतिस्थापन नहीं किया गया।"
  });
}

export function getPronunciationDiagnostics(text,options={}){
  const analysis=analyzeVedicText(text,options);
  return Object.freeze({
    version:VEDIC_PRONUNCIATION_VERSION,unicodeVersion:UNICODE_REFERENCE_VERSION,generatedAt:new Date().toISOString(),
    codePointCount:analysis.codePointCount,wordCount:analysis.words.length,aksharaCount:analysis.aksharas.length,
    phoneticStructureStatus:analysis.phoneticStructureStatus,phonemeSequenceInferred:false,syllableBoundariesInferred:false,
    knownDifficultWordCount:analysis.knownDifficultWords.length,
    unlistedWordCount:analysis.unlistedWords.length,conjunctCount:analysis.conjuncts.length,matraCount:analysis.matras.total,
    accentMarkCount:analysis.accentMarks.length,unclassifiedMarkCount:analysis.unclassifiedMarks.length,
    requiresBranchContext:analysis.needsBranchContext,originalTextPreserved:analysis.originalTextPreserved,
    note:"यह लिपि/पाठ विश्लेषण है; यह ऑडियो गुणवत्ता या शुद्ध वैदिक उच्चारण का प्रमाण नहीं है।"
  });
}

export function getKnowledgeBaseCoverage(){
  return Object.freeze({
    unicodeVersion:UNICODE_REFERENCE_VERSION,scriptBlocks:SCRIPT_BLOCKS.length,coreVowels:VOWELS.length,
    coreConsonants:CONSONANTS.length,vedicAdditionalConsonants:VEDIC_ADDITIONAL_CONSONANTS.length,
    vowelSigns:VOWEL_SIGNS.length,coreScriptSigns:CORE_SCRIPT_SIGNS.length,devanagariDigits:DEVANAGARI_DIGITS.length,
    vedicExtensions:VEDIC_EXTENSIONS.length,devanagariExtended:DEVANAGARI_EXTENDED.length,
    devanagariExtendedAAssignedEntries:DEVANAGARI_EXTENDED_A.length,
    pronunciationDictionaryEntries:PRONUNCIATION_DICTIONARY.length,aksharaRules:AKSHARA_RULES.length,
    coverageNote:"सूचीबद्ध Unicode records पूर्ण हैं; शब्दकोश प्रारंभिक/विस्तारशील है, सभी वैदिक शब्दों की बंद या पूर्ण सूची नहीं।"
  });
}

export function selfTest(){
  const results=[],add=(id,passed,detail)=>results.push(Object.freeze({id,passed:Boolean(passed),detail:String(detail||"")}));
  add("CHAR-001-A-DETECTED",getCharacterInfo("अ").found&&getCharacterInfo("अ").category==="vowel"&&getCharacterInfo("अ").codePoint==="U+0905","वर्ण अ और उसका Unicode code point।");
  add("CHAR-002-FOURTEEN-VOWELS",VOWELS.length===14,"14 मूल स्वर-वर्ण।");
  add("CHAR-003-THIRTY-THREE-CONSONANTS",CONSONANTS.length===33,"33 मूल व्यंजन।");
  add("CHAR-004-VEDIC-LA",getCharacterInfo("ळ").category==="vedic-additional-consonant","ळ शाखा-सापेक्ष अतिरिक्त वर्ण के रूप में।");
  add("MAT-001-THIRTEEN-VOWEL-SIGNS",VOWEL_SIGNS.length===13,"13 स्वर-मात्राएँ; अ की पृथक मात्रा नहीं।");
  add("MAT-002-VIRAMA",getCharacterInfo("्").category==="virama","हलन्त/विराम की पहचान।");
  add("MAT-003-NASAL-DIFFERENCE",getCharacterInfo("ँ").character!==getCharacterInfo("ं").character,"चन्द्रबिन्दु और अनुस्वार अलग code points।");
  add("VED-001-43-VEDIC-EXTENSIONS",VEDIC_EXTENSIONS.length===43,"U+1CD0–U+1CFA के सभी 43 assigned चिह्न।");
  add("VED-002-32-DEVANAGARI-EXTENDED",DEVANAGARI_EXTENDED.length===32,"U+A8E0–U+A8FF के 32 code points।");
  add("VED-003-11-EXTENDED-A-ENTRIES",DEVANAGARI_EXTENDED_A.length===11,"U+11B00–U+11B0A के 11 assigned entries।");
  add("VED-004-PRENKHA",getVedicAccentInfo(cp("1CD2"))?.category==="samaveda-vibrato","Prenkha को vibrato-संबंधी Samaveda संकेत के रूप में।");
  add("VED-005-NIHSHVASA",getCharacterInfo(cp("1CD3")).category==="samaveda-breathing","Nihshvasa को breathing/passage sign के रूप में, अक्षर नहीं।");
  add("VED-006-JIHVAMULIYA",getVedicAccentInfo(cp("1CF5"))?.category==="visarga-allophone","जिह्वामूलीय का अलग रिकॉर्ड।");
  add("VED-007-UPADHMANIYA",getVedicAccentInfo(cp("1CF6"))?.category==="visarga-allophone","उपध्मानीय का अलग रिकॉर्ड।");
  add("VED-008-JAIN-MARK-NOT-VEDIC-TONE",getCharacterInfo(cp("11B02")).category==="jain-manuscript-auspicious-sign","Extended-A के जैन पाण्डुलिपि चिह्न को वैदिक स्वराघात न मानना।");
  add("VED-009-SINDHI-LETTER-NOT-VEDIC",getCharacterInfo(cp("11B0A")).category==="sindhi-implosive-letter","Alternate DDDA को सिंधी script extension के रूप में।");
  add("ACC-001-UDATTA",getVedicAccentInfo("॑")!==null,"U+0951 स्वर-चिह्न की पहचान।");
  add("ACC-002-ANUDATTA",getVedicAccentInfo("॒")!==null,"U+0952 स्वर-चिह्न की पहचान।");
  add("CONJ-001-NGA-GA",analyzeConjuncts("भुजङ्ग").some(item=>item.text.includes("ङ्ग")),"ङ्ग संयुक्ताक्षर पहचान।");
  add("CONJ-002-JJVA",analyzeConjuncts("जज्ज्वल").some(item=>item.text.includes("ज्ज")),"ज् + ज संयुक्ताक्षर पहचान।");
  add("WORD-001-AGNI-MILE",Boolean(findPronunciation("अग्निमीळे")),"ज्ञानकोश में वैदिक परीक्षण शब्द।");
  add("WORD-002-SHIVA-STOTRA",Boolean(findPronunciation("गलेऽवलम्ब्य")),"शिवताण्डव स्तोत्र परीक्षण शब्द।");
  add("TEXT-001-AVAGRAHA",analyzeVedicText("गलेऽवलम्ब्य").characterCounts.avagraha===1,"अवग्रह सुरक्षित पहचाना गया।");
  const pluta=analyzeVedicText("अ३");
  add("TEXT-002-PLUTA-DIGIT-PRESERVED",pluta.originalText==="अ३"&&pluta.originalCodePoints.length===2,"प्लुत-संदर्भ का अंक बिना अनुमान से हटाए सुरक्षित।");
  const source="अ॑ग्निमीळे भुजङ्ग॥ १२ ॥",prepared=prepareVedicSpeech(source);
  add("SAFE-001-ORIGINAL-PRESERVED",prepared.speechText===source&&prepared.modified===false,"वाचन-तैयारी में मूल पाठ अक्षरशः सुरक्षित।");
  add("SAFE-002-VEDIC-MARK-BLOCKED-FROM-CLAIM",prepared.requiresAccentAwareBackend===true&&prepared.nativeTtsRecommendation==="not-certified-for-special-marks","विशेष स्वर-चिह्न को प्रमाणित Native pronunciation घोषित नहीं किया।");
  const unknownMark="अ"+cp("1CFB"),unknownPrepared=prepareVedicSpeech(unknownMark);
  add("SAFE-003-UNMAPPED-CHAR-PRESERVED",unknownPrepared.speechText===unknownMark&&unknownPrepared.analysis.unclassifiedMarks.length===1,"Unmapped/reserved code point सुरक्षित और flagged।");
  const originalCodePoints=Array.from(source,codePointOf).join("|");
  const preparedCodePoints=Array.from(prepared.speechText,codePointOf).join("|");
  add("SAFE-004-CODEPOINT-SEQUENCE",originalCodePoints===preparedCodePoints,"मूल और तैयार पाठ की code-point sequence समान।");
  add("PUNCT-001-DANDA",getCharacterInfo("।").category==="punctuation","दण्ड की पहचान।");
  add("PUNCT-002-DOUBLE-DANDA",getCharacterInfo("॥").category==="punctuation","द्विदण्ड की पहचान।");
  add("DIAG-001-COVERAGE",getKnowledgeBaseCoverage().vedicExtensions===43&&getKnowledgeBaseCoverage().devanagariExtended===32,"कवरेज मेटाडेटा सूची से मेल खाता है।");

  const candidateFixtures=[
    {id:"bhujanga-conjunct",term:"भुजङ्ग",matchType:"exact",scope:"general",context:{scope:"general",shakha:null,requiredSequence:null},activation:{enabled:true,lookupEnabled:true},speechApplication:{enabled:false}},
    {id:"vijrimbhana-long-form",term:"विजृम्भणामधुव्रतम्",matchType:"exact",scope:"general",context:{scope:"general",shakha:null,requiredSequence:null},activation:{enabled:true,lookupEnabled:true},speechApplication:{enabled:false}},
    {id:"sadashivam-context",term:"सदाशिवं",matchType:"contextual-exact",scope:"general",context:{scope:"general",shakha:null,requiredSequence:["सदाशिवं","भजे"]},activation:{enabled:true,lookupEnabled:true},speechApplication:{enabled:false}},
    {id:"agnih-visarga",term:"अग्निः",matchType:"exact",scope:"shakha-specific",context:{scope:"shakha-specific",shakha:"shaakala",requiredSequence:null},activation:{enabled:true,lookupEnabled:true},speechApplication:{enabled:false}},
    {id:"devaam-anunasika",term:"देवाँ",matchType:"exact",scope:"shakha-specific",context:{scope:"shakha-specific",shakha:"shaakala",requiredSequence:null},activation:{enabled:true,lookupEnabled:true},speechApplication:{enabled:false}},
    {id:"nutanairuta-vowel-sequence",term:"नूतनैरुत",matchType:"exact",scope:"shakha-specific",context:{scope:"shakha-specific",shakha:"shaakala",requiredSequence:null},activation:{enabled:true,lookupEnabled:true},speechApplication:{enabled:false}}
  ];
  const sixAnalyses=candidateFixtures.map(candidate=>({candidate,result:analyzeAksharaPhonetics(candidate.term,{shakha:candidate.context.shakha||null})}));
  sixAnalyses.forEach(({candidate,result})=>{
    add("LEX-"+candidate.id.toUpperCase()+"-AKSHARA-ANALYSIS",
      result.originalTextPreserved&&result.orthographicUnits.length>0&&result.phonemeSequence===null,
      "Candidate का orthographic feature analysis; phoneme sequence अनुमानित नहीं।");
  });
  const candidateInputs=[["भुजङ्ग",{}],["विजृम्भणामधुव्रतम्",{}],["सदाशिवं भजे",{}],["अग्निः",{shakha:"shaakala"}],["देवाँ",{shakha:"rigveda-shakala"}],["नूतनैरुत",{shakha:"shaakala"}]];
  candidateInputs.forEach(([text,options],index)=>{
    const result=analyzePronunciationCandidates(text,[candidateFixtures[index]],options);
    add("LEX-CANDIDATE-"+String(index+1).padStart(2,"0")+"-MATCH",
      result.matches.length===1&&result.matches[0].candidateOnly&&result.speechText===text&&result.speechTextModified===false,
      "सटीक candidate mapping; speech text अपरिवर्तित।");
  });
  const missingShakha=analyzePronunciationCandidates("अग्निः",[candidateFixtures[3]],{});
  add("LEX-SHAKHA-REQUIRED",missingShakha.matches.length===0&&missingShakha.contextRequired.length===1,"शाखा-विशिष्ट candidate बिना स्पष्ट शाखा सक्रिय match नहीं होता।");
  const mismatchedShakha=analyzePronunciationCandidates("अग्निः",[candidateFixtures[3]],{shakha:"kathaka"});
  add("LEX-SHAKHA-MISMATCH",mismatchedShakha.matches.length===0&&mismatchedShakha.rejected.some(item=>item.reason==="shakha-mismatch"),"गलत शाखा पर candidate अस्वीकार।");
  const substringOnly=analyzePronunciationCandidates("भुजङ्गतुङ्ग",[candidateFixtures[0]],{});
  add("LEX-EXACT-TOKEN-ONLY",substringOnly.matches.length===0,"बड़े शब्द के भीतर substring match स्वीकार नहीं।");
  const contextualMismatch=analyzePronunciationCandidates("सदाशिवं नमः",[candidateFixtures[2]],{});
  add("LEX-CONTEXT-REQUIRED-SEQUENCE",contextualMismatch.matches.length===0,"Contextual candidate में निर्धारित पूरा शब्द-क्रम आवश्यक।");
  const visargaSegments=segmentDevanagariAksharas("अग्निः").map(item=>item.text);
  add("AKSHARA-VISARGA-ATTACHED",visargaSegments.includes("ग्निः")&&!visargaSegments.includes("ः"),"विसर्ग को पूर्ववर्ती अक्षर-खंड के साथ रखा गया।");
  const phoneticBhujanga=analyzeAksharaPhonetics("भुजङ्ग");
  const ngaFeature=phoneticBhujanga.orthographicUnits.flatMap(item=>item.consonants).find(item=>item.character==="ङ");
  add("PHONETIC-VELAR-NASAL",Boolean(ngaFeature&&ngaFeature.placeId==="velar"&&ngaFeature.manner==="nasal"),"ङ को कण्ठ्य अनुनासिक feature के रूप में पहचाना।");
  const phoneticRitva=analyzeAksharaPhonetics("विजृम्भणामधुव्रतम्");
  add("PHONETIC-R-VOWEL",phoneticRitva.orthographicUnits.some(item=>item.vowelNucleus&&item.vowelNucleus.vowelId==="vocalic-r"),"ऋ-मात्रा को vocalic-r vowel identity से पहचाना।");
  const nasalCompare=analyzeAksharaPhonetics("देवाँ");
  add("PHONETIC-CANDRABINDU",nasalCompare.orthographicUnits.some(item=>item.postposedSigns.some(mark=>mark.character==="ँ"&&mark.category==="nasalization")),"चन्द्रबिन्दु को अलग postposed nasalization sign के रूप में पहचाना।");
  const immutable=analyzeAksharaPhonetics("अ॑ग्निमीळे");
  add("PHONETIC-ORIGINAL-PRESERVED",immutable.originalText==="अ॑ग्निमीळे"&&immutable.phonemeSequence===null&&immutable.ipa===null,"विशेष चिह्नों सहित मूल पाठ सुरक्षित; IPA/phoneme अनुमान नहीं।");

  const failed=results.filter(item=>!item.passed);
  return Object.freeze({
    module:"vedic-sanskrit-pronunciation",version:VEDIC_PRONUNCIATION_VERSION,
    status:failed.length?"FAILED":"PASSED",total:results.length,passed:results.length-failed.length,failed:failed.length,
    tests:Object.freeze(results),failures:Object.freeze(failed),coverage:getKnowledgeBaseCoverage()
  });
}

export const VEDIC_PRONUNCIATION_API = Object.freeze({
  version:VEDIC_PRONUNCIATION_VERSION,unicodeVersion:UNICODE_REFERENCE_VERSION,
  getCharacterInfo,getVedicAccentInfo,findPronunciation,segmentDevanagariAksharas,
  analyzeConjuncts,analyzeMatras,analyzeAccentMarks,analyzeVedicText,prepareVedicSpeech,
  getPronunciationDiagnostics,getKnowledgeBaseCoverage,analyzeAksharaPhonetics,
  analyzePronunciationCandidates,selfTest
});
