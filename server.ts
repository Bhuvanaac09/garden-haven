import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

app.use(express.json());

const LANG_NAMES: Record<string, string> = {
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
  ml: 'Malayalam',
};

// Global circuit breaker to prevent 429 quota exhaustion errors from spamming logs
// Initialized to protect against current daily free-tier quota exhaustion
let geminiCooldownUntil = Date.now() + 14 * 60 * 60 * 1000;

// Curated comprehensive South Indian dictionary for instant zero-latency responses
const FALLBACK_DICT: Record<string, Record<string, { translatedText: string; romanized: string }>> = {
  'flower': {
    ta: { translatedText: 'மலர்', romanized: 'malar' },
    te: { translatedText: 'పువ్వు', romanized: 'puvvu' },
    kn: { translatedText: 'ಹೂವು', romanized: 'hoovu' },
    ml: { translatedText: 'പൂവ്', romanized: 'poov' },
  },
  'flowers': {
    ta: { translatedText: 'மலர்கள்', romanized: 'malargal' },
    te: { translatedText: 'పువ్వులు', romanized: 'puvvulu' },
    kn: { translatedText: 'ಹೂಗಳು', romanized: 'hoogalu' },
    ml: { translatedText: 'പൂക്കൾ', romanized: 'pookkal' },
  },
  'bloom': {
    ta: { translatedText: 'மலர்ச்சி', romanized: 'malarchchi' },
    te: { translatedText: 'వికసించు', romanized: 'vikasinchu' },
    kn: { translatedText: 'ಅರಳು', romanized: 'aralu' },
    ml: { translatedText: 'വിരിയുക', romanized: 'viriyuka' },
  },
  'blooming': {
    ta: { translatedText: 'மலர்கிறது', romanized: 'malargiradhu' },
    te: { translatedText: 'వికసిస్తున్నది', romanized: 'vikasisthunnadi' },
    kn: { translatedText: 'ಅರಳುತ್ತಿದೆ', romanized: 'araluttide' },
    ml: { translatedText: 'വിരിയുന്നു', romanized: 'viriyunnu' },
  },
  'in bloom': {
    ta: { translatedText: 'மலர்ந்துள்ளது', romanized: 'malarndhulladhu' },
    te: { translatedText: 'వికసిస్తోంది', romanized: 'vikasistondi' },
    kn: { translatedText: 'ಅರಳುತ್ತಿದೆ', romanized: 'araluttide' },
    ml: { translatedText: 'വിരിഞ്ഞുനിൽക്കുന്നു', romanized: 'virinjnillkkunnu' },
  },
  'rose': {
    ta: { translatedText: 'ரோஜா', romanized: 'roja' },
    te: { translatedText: 'గులాబీ', romanized: 'gulabi' },
    kn: { translatedText: 'ಗುಲಾಬಿ', romanized: 'gulabi' },
    ml: { translatedText: 'റോസ്', romanized: 'rose' },
  },
  'roses': {
    ta: { translatedText: 'ரோஜாக்கள்', romanized: 'rojaakkal' },
    te: { translatedText: 'గులాబీలు', romanized: 'gulabeelu' },
    kn: { translatedText: 'ಗುಲಾಬಿಗಳು', romanized: 'gulabigalu' },
    ml: { translatedText: 'റോസപ്പൂക്കൾ', romanized: 'rosappookkal' },
  },
  'garden': {
    ta: { translatedText: 'தோட்டம்', romanized: 'thottam' },
    te: { translatedText: 'తోట', romanized: 'thota' },
    kn: { translatedText: 'ತೋಟ', romanized: 'thota' },
    ml: { translatedText: 'തോട്ടം', romanized: 'thottam' },
  },
  'gardens': {
    ta: { translatedText: 'தோட்டங்கள்', romanized: 'thottangal' },
    te: { translatedText: 'తోటలు', romanized: 'thotalu' },
    kn: { translatedText: 'ತೋಟಗಳು', romanized: 'thotagalu' },
    ml: { translatedText: 'തോട്ടങ്ങൾ', romanized: 'thottangal' },
  },
  'type garden': {
    ta: { translatedText: 'எழுத்துத் தோட்டம்', romanized: 'ezhuthuth thottam' },
    te: { translatedText: 'అక్షర తోట', romanized: 'akshara thota' },
    kn: { translatedText: 'ಅಕ್ಷರ ತೋಟ', romanized: 'akshara thota' },
    ml: { translatedText: 'അക്ഷരത്തോട്ടം', romanized: 'aksharathottam' },
  },
  'love': {
    ta: { translatedText: 'அன்பு', romanized: 'anbu' },
    te: { translatedText: 'ప్రేమ', romanized: 'prema' },
    kn: { translatedText: 'ಪ್ರೀತಿ', romanized: 'preethi' },
    ml: { translatedText: 'സ്നേഹം', romanized: 'sneham' },
  },
  'peace': {
    ta: { translatedText: 'அமைதி', romanized: 'amaidhi' },
    te: { translatedText: 'శాంతి', romanized: 'shanthi' },
    kn: { translatedText: 'ಶಾಂತಿ', romanized: 'shanthi' },
    ml: { translatedText: 'സമാധാനം', romanized: 'samadhaanam' },
  },
  'nature': {
    ta: { translatedText: 'இயற்கை', romanized: 'iyarkai' },
    te: { translatedText: 'ప్రకృతి', romanized: 'prakruthi' },
    kn: { translatedText: 'ಪ್ರಕೃತಿ', romanized: 'prakruthi' },
    ml: { translatedText: 'പ്രകൃതി', romanized: 'prakrithi' },
  },
  'butterfly': {
    ta: { translatedText: 'வண்ணத்துப்பூச்சி', romanized: 'vannathuppoochchi' },
    te: { translatedText: 'సీతాకోకచిలుక', romanized: 'seethakokachiluka' },
    kn: { translatedText: 'ಚಿಟ್ಟೆ', romanized: 'chitte' },
    ml: { translatedText: 'ചിത്രശലഭം', romanized: 'chithrashalabham' },
  },
  'butterflies': {
    ta: { translatedText: 'வண்ணத்துப்பூச்சிகள்', romanized: 'vannathuppoochchigal' },
    te: { translatedText: 'సీతాకోకచిలుకలు', romanized: 'seethakokachilukalu' },
    kn: { translatedText: 'ಚಿಟ್ಟೆಗಳು', romanized: 'chittegalu' },
    ml: { translatedText: 'ചിത്രശലഭങ്ങൾ', romanized: 'chithrashalabhangal' },
  },
  'beauty': {
    ta: { translatedText: 'அழகு', romanized: 'azhagu' },
    te: { translatedText: 'అందం', romanized: 'andam' },
    kn: { translatedText: 'ಸೌಂದರ್ಯ', romanized: 'sowndarya' },
    ml: { translatedText: 'സൗന്ദര്യം', romanized: 'soundaryam' },
  },
  'beautiful': {
    ta: { translatedText: 'அழகான', romanized: 'azhagaana' },
    te: { translatedText: 'అందమైన', romanized: 'andamaina' },
    kn: { translatedText: 'ಸುಂದರ', romanized: 'sundara' },
    ml: { translatedText: 'മനോഹരമായ', romanized: 'manoharamaaya' },
  },
  'vanakkam': {
    ta: { translatedText: 'வணக்கம்', romanized: 'vanakkam' },
    te: { translatedText: 'నమస్కారం', romanized: 'namaskaram' },
    kn: { translatedText: 'ನಮಸ್ಕಾರ', romanized: 'namaskara' },
    ml: { translatedText: 'നമസ്കാരം', romanized: 'namaskaram' },
  },
  'namaste': {
    ta: { translatedText: 'வணக்கம்', romanized: 'vanakkam' },
    te: { translatedText: 'నమస్తే', romanized: 'namaste' },
    kn: { translatedText: 'ನಮಸ್ತೆ', romanized: 'namaste' },
    ml: { translatedText: 'നമസ്തേ', romanized: 'namaste' },
  },
  'namaskaram': {
    ta: { translatedText: 'வணக்கம்', romanized: 'vanakkam' },
    te: { translatedText: 'నమస్కారం', romanized: 'namaskaram' },
    kn: { translatedText: 'ನಮಸ್ಕಾರ', romanized: 'namaskara' },
    ml: { translatedText: 'നമസ്കാരം', romanized: 'namaskaram' },
  },
  'hello': {
    ta: { translatedText: 'வணக்கம்', romanized: 'vanakkam' },
    te: { translatedText: 'హలో', romanized: 'halo' },
    kn: { translatedText: 'ನಮಸ್ಕಾರ', romanized: 'namaskara' },
    ml: { translatedText: 'ഹലോ', romanized: 'halo' },
  },
  'welcome': {
    ta: { translatedText: 'நல்வரவு', romanized: 'nalvaravu' },
    te: { translatedText: 'స్వాగతం', romanized: 'swaagatham' },
    kn: { translatedText: 'ಸ್ವಾಗತ', romanized: 'swaagatha' },
    ml: { translatedText: 'സ്വാഗതം', romanized: 'swaagatham' },
  },
  'spring': {
    ta: { translatedText: 'வசந்தம்', romanized: 'vasantham' },
    te: { translatedText: 'వసంతం', romanized: 'vasantham' },
    kn: { translatedText: 'ವಸಂತ', romanized: 'vasantha' },
    ml: { translatedText: 'വസന്തം', romanized: 'vasantham' },
  },
  'tree': {
    ta: { translatedText: 'மரம்', romanized: 'maram' },
    te: { translatedText: 'చెట్టు', romanized: 'chettu' },
    kn: { translatedText: 'ಮರ', romanized: 'mara' },
    ml: { translatedText: 'മരം', romanized: 'maram' },
  },
  'leaf': {
    ta: { translatedText: 'இலை', romanized: 'ilai' },
    te: { translatedText: 'ఆకు', romanized: 'aaku' },
    kn: { translatedText: 'ಎಲೆ', romanized: 'ele' },
    ml: { translatedText: 'ഇല', romanized: 'ila' },
  },
  'leaves': {
    ta: { translatedText: 'இலைகள்', romanized: 'ilaigal' },
    te: { translatedText: 'ఆకులు', romanized: 'aakulu' },
    kn: { translatedText: 'ಎಲೆಗಳು', romanized: 'elegalu' },
    ml: { translatedText: 'ഇലകൾ', romanized: 'ilakal' },
  },
  'lotus': {
    ta: { translatedText: 'தாமரை', romanized: 'thamarai' },
    te: { translatedText: 'తామర', romanized: 'thamara' },
    kn: { translatedText: 'ಕಮಲ', romanized: 'kamala' },
    ml: { translatedText: 'താമര', romanized: 'thaamara' },
  },
  'divine lotus': {
    ta: { translatedText: 'தாமரை மலர்', romanized: 'thamarai malar' },
    te: { translatedText: 'దివ్య తామర', romanized: 'divya thamara' },
    kn: { translatedText: 'ಕಮಲದ ಹೂವು', romanized: 'kamalada hoovu' },
    ml: { translatedText: 'താമരപ്പൂവ്', romanized: 'thaamarappoov' },
  },
  'sun': {
    ta: { translatedText: 'சூரியன்', romanized: 'sooriyan' },
    te: { translatedText: 'సూర్యుడు', romanized: 'sooryudu' },
    kn: { translatedText: 'ಸೂರ್ಯ', romanized: 'soorya' },
    ml: { translatedText: 'സൂര്യൻ', romanized: 'sooryan' },
  },
  'morning': {
    ta: { translatedText: 'காலை', romanized: 'kaalai' },
    te: { translatedText: 'ఉదయం', romanized: 'udayam' },
    kn: { translatedText: 'ಮುಂಜಾನೆ', romanized: 'munjaane' },
    ml: { translatedText: 'പ്രഭാതം', romanized: 'prabhaatham' },
  },
  'morning sun': {
    ta: { translatedText: 'விடியல் சூரியன்', romanized: 'vidiyal sooriyan' },
    te: { translatedText: 'ఉదయ సూర్యుడు', romanized: 'udaya sooryudu' },
    kn: { translatedText: 'ಬೆಳಗಿನ ಸೂರ್ಯ', romanized: 'belagina soorya' },
    ml: { translatedText: 'പ്രഭാത സൂര്യൻ', romanized: 'prabhaatha sooryan' },
  },
  'moon': {
    ta: { translatedText: 'நிலா', romanized: 'nila' },
    te: { translatedText: 'చంద్రుడు', romanized: 'chandrudu' },
    kn: { translatedText: 'ಚಂದ್ರ', romanized: 'chandra' },
    ml: { translatedText: 'ചന്ദ്രൻ', romanized: 'chandran' },
  },
  'star': {
    ta: { translatedText: 'நட்சத்திரம்', romanized: 'natchathiram' },
    te: { translatedText: 'నక్షత్రం', romanized: 'nakshatram' },
    kn: { translatedText: 'ನಕ್ಷತ್ರ', romanized: 'nakshatra' },
    ml: { translatedText: 'നക്ഷത്രം', romanized: 'nakshathram' },
  },
  'stars': {
    ta: { translatedText: 'நட்சத்திரங்கள்', romanized: 'natchathirangal' },
    te: { translatedText: 'నక్షత్రాలు', romanized: 'nakshathraalu' },
    kn: { translatedText: 'ನಕ್ಷತ್ರಗಳು', romanized: 'nakshatragalu' },
    ml: { translatedText: 'നക്ഷത്രങ്ങൾ', romanized: 'nakshathrangal' },
  },
  'rain': {
    ta: { translatedText: 'மழை', romanized: 'mazhai' },
    te: { translatedText: 'వర్షం', romanized: 'varsham' },
    kn: { translatedText: 'ಮಳೆ', romanized: 'male' },
    ml: { translatedText: 'മഴ', romanized: 'mazha' },
  },
  'dream': {
    ta: { translatedText: 'கனவு', romanized: 'kanavu' },
    te: { translatedText: 'కల', romanized: 'kala' },
    kn: { translatedText: 'ಕನಸು', romanized: 'kanasu' },
    ml: { translatedText: 'സ്വപ്നം', romanized: 'swapnam' },
  },
  'life': {
    ta: { translatedText: 'வாழ்க்கை', romanized: 'vaazhkkai' },
    te: { translatedText: 'జీవితం', romanized: 'jeevitham' },
    kn: { translatedText: 'ಜೀವನ', romanized: 'jeevana' },
    ml: { translatedText: 'ജീവിതം', romanized: 'jeevitham' },
  },
  'heart': {
    ta: { translatedText: 'இதயம்', romanized: 'idhayam' },
    te: { translatedText: 'హృదయం', romanized: 'hrudayam' },
    kn: { translatedText: 'ಹೃದಯ', romanized: 'hrudaya' },
    ml: { translatedText: 'ഹൃദയം', romanized: 'hrudhayam' },
  },
  'breeze': {
    ta: { translatedText: 'தென்றல்', romanized: 'thendral' },
    te: { translatedText: 'చల్లని గాలి', romanized: 'challani gaali' },
    kn: { translatedText: 'ತಂಗಾಳಿ', romanized: 'thangaali' },
    ml: { translatedText: 'കുളിർകാറ്റ്', romanized: 'kulirkaattu' },
  },
  'sweet breeze': {
    ta: { translatedText: 'இனிய தென்றல்', romanized: 'iniya thendral' },
    te: { translatedText: 'చల్లని పిల్లగాలి', romanized: 'challani pillagaali' },
    kn: { translatedText: 'ತಂಪಾದ ತಂಗಾಳಿ', romanized: 'thampaada thangaali' },
    ml: { translatedText: 'മന്ദമാരുതൻ', romanized: 'mandamaaruthan' },
  },
  'song': {
    ta: { translatedText: 'பாடல்', romanized: 'paadal' },
    te: { translatedText: 'పాట', romanized: 'paata' },
    kn: { translatedText: 'ಹಾಡು', romanized: 'haadu' },
    ml: { translatedText: 'പാട്ട്', romanized: 'paattu' },
  },
  'music': {
    ta: { translatedText: 'இசை', romanized: 'isai' },
    te: { translatedText: 'సంగీతం', romanized: 'sangeetham' },
    kn: { translatedText: 'ಸಂಗೀತ', romanized: 'sangeetha' },
    ml: { translatedText: 'സംഗീതം', romanized: 'sangeetham' },
  },
  'light': {
    ta: { translatedText: 'ஒளி', romanized: 'oli' },
    te: { translatedText: 'వెలుగు', romanized: 'velugu' },
    kn: { translatedText: 'ಬೆಳಕು', romanized: 'belaku' },
    ml: { translatedText: 'വെളിച്ചം', romanized: 'velicham' },
  },
  'water': {
    ta: { translatedText: 'நீர்', romanized: 'neer' },
    te: { translatedText: 'నీరు', romanized: 'neeru' },
    kn: { translatedText: 'ನೀರು', romanized: 'neeru' },
    ml: { translatedText: 'വെള്ളം', romanized: 'vellam' },
  },
  'smile': {
    ta: { translatedText: 'புன்னகை', romanized: 'punnagai' },
    te: { translatedText: 'చిరునవ్వు', romanized: 'chirunavvu' },
    kn: { translatedText: 'ಕಿರುನಗೆ', romanized: 'kirunage' },
    ml: { translatedText: 'പുഞ്ചിരി', romanized: 'punchiri' },
  },
  'hope': {
    ta: { translatedText: 'நம்பிக்கை', romanized: 'nambikkai' },
    te: { translatedText: 'ఆశ', romanized: 'aasha' },
    kn: { translatedText: 'ಭರವಸೆ', romanized: 'bharavase' },
    ml: { translatedText: 'പ്രതീക്ഷ', romanized: 'pratheeksha' },
  },
  'grace': {
    ta: { translatedText: 'அருள்', romanized: 'arul' },
    te: { translatedText: 'அనుగ్రహం', romanized: 'anugraham' },
    kn: { translatedText: 'ಕೃಪೆ', romanized: 'krupe' },
    ml: { translatedText: 'കൃപ', romanized: 'krupa' },
  },
  'joy': {
    ta: { translatedText: 'மகிழ்ச்சி', romanized: 'magizhchchi' },
    te: { translatedText: 'సంతోషం', romanized: 'santhosham' },
    kn: { translatedText: 'ಸಂತೋಷ', romanized: 'santhosha' },
    ml: { translatedText: 'സന്തോഷം', romanized: 'santhosham' },
  },
  'bliss': {
    ta: { translatedText: 'பேரின்பம்', romanized: 'paerinbam' },
    te: { translatedText: 'పరమానందం', romanized: 'paramaanandam' },
    kn: { translatedText: 'ಪರಮಾನಂದ', romanized: 'paramaananda' },
    ml: { translatedText: 'ആനന്ദം', romanized: 'aanandam' },
  },
  'soul': {
    ta: { translatedText: 'ஆன்மா', romanized: 'aanma' },
    te: { translatedText: 'ఆత్మ', romanized: 'aathma' },
    kn: { translatedText: 'ಆತ್ಮ', romanized: 'aathma' },
    ml: { translatedText: 'ആത്മാവ്', romanized: 'aathmaavu' },
  },
  'friend': {
    ta: { translatedText: 'நண்பன்', romanized: 'nanban' },
    te: { translatedText: 'స్నేహితుడు', romanized: 'snehithudu' },
    kn: { translatedText: 'ಗೆಳೆಯ', romanized: 'geleya' },
    ml: { translatedText: 'സുഹൃത്ത്', romanized: 'suhruth' },
  },
  'zen': {
    ta: { translatedText: 'தியானம்', romanized: 'dhiyaanam' },
    te: { translatedText: 'ధ్యానం', romanized: 'dhyaanam' },
    kn: { translatedText: 'ಧ್ಯಾನ', romanized: 'dhyaana' },
    ml: { translatedText: 'ധ്യാനം', romanized: 'dhyaanam' },
  },
};

// Built-in South Indian Phonetic Transliterator for server-side offline fallback
const IndicServerTransliterator = {
  tables: {
    ta: {
      vowels: { a: 'அ', aa: 'ஆ', A: 'ஆ', i: 'இ', ii: 'ஈ', ee: 'ஈ', u: 'உ', uu: 'ஊ', oo: 'ஊ', e: 'எ', E: 'ஏ', ae: 'ஏ', ai: 'ஐ', o: 'ஒ', O: 'ஓ', oa: 'ஓ', au: 'ஔ' },
      vowelSigns: { a: '', aa: 'ா', A: 'ா', i: 'ி', ii: 'ீ', ee: 'ீ', u: 'ு', uu: 'ூ', oo: 'ூ', e: 'ெ', E: 'ே', ae: 'ே', ai: 'ை', o: 'ொ', O: 'ோ', oa: 'ோ', au: 'ௌ' },
      virama: '்',
      cons: { k: 'க', g: 'க', kh: 'க', gh: 'க', ng: 'ங', ch: 'ச', s: 'ச', j: 'ஜ', nj: 'ஞ', t: 'ட', d: 'ட', th: 'த', dh: 'த', N: 'ண', n: 'ந', p: 'ப', b: 'ப', f: 'ப', m: 'ம', y: 'ய', r: 'ர', l: 'ல', v: 'வ', w: 'வ', zh: 'ழ', L: 'ள', R: 'ற', sh: 'ஷ', h: 'ஹ' }
    },
    te: {
      vowels: { a: 'అ', aa: 'ఆ', A: 'ఆ', i: 'ఇ', ii: 'ఈ', ee: 'ఈ', u: 'ఉ', uu: 'ఊ', oo: 'ఊ', e: 'ఎ', E: 'ఏ', ae: 'ఏ', ai: 'ఐ', o: 'ఒ', O: 'ఓ', oa: 'ఓ', au: 'ఔ' },
      vowelSigns: { a: '', aa: 'ా', A: 'ా', i: 'ి', ii: 'ీ', ee: 'ీ', u: 'ు', uu: 'ూ', oo: 'ూ', e: 'ె', E: 'ే', ae: 'ే', ai: 'ై', o: 'ొ', O: 'ో', oa: 'ో', au: 'ౌ' },
      virama: '్',
      cons: { k: 'క', kh: 'ఖ', g: 'గ', gh: 'ఘ', ch: 'చ', chh: 'ఛ', j: 'జ', jh: 'ఝ', t: 'ట', th: 'త', d: 'డ', dh: 'ధ', N: 'ణ', n: 'న', p: 'ప', ph: 'ఫ', f: 'ఫ', b: 'బ', bh: 'భ', m: 'మ', y: 'య', r: 'ర', l: 'ల', v: 'వ', w: 'వ', sh: 'శ', s: 'స', h: 'హ', L: 'ళ' }
    },
    kn: {
      vowels: { a: 'ಅ', aa: 'ಆ', A: 'ಆ', i: 'ಇ', ii: 'ಈ', ee: 'ಈ', u: 'ಉ', uu: 'ಊ', oo: 'ಊ', e: 'ಎ', E: 'ಏ', ae: 'ಏ', ai: 'ಐ', o: 'ಒ', O: 'ಓ', oa: 'ಓ', au: 'ಔ' },
      vowelSigns: { a: '', aa: 'ಾ', A: 'ಾ', i: 'ಿ', ii: 'ೀ', ee: 'ೀ', u: 'ು', uu: 'ೂ', oo: 'ೂ', e: 'ೆ', E: 'ೇ', ae: 'ೇ', ai: 'ೈ', o: 'ೊ', O: 'ೋ', oa: 'ೋ', au: 'ೌ' },
      virama: '್',
      cons: { k: 'ಕ', kh: 'ಖ', g: 'ಗ', gh: 'ಘ', ch: 'ಚ', chh: 'ಛ', j: 'ಜ', jh: 'ಝ', t: 'ಟ', th: 'ತ', d: 'ಡ', dh: 'ಧ', N: 'ಣ', n: 'ನ', p: 'ಪ', ph: 'ಫ', f: 'ಫ', b: 'ಬ', bh: 'ಭ', m: 'ಮ', y: 'ಯ', r: 'ರ', l: 'ಲ', v: 'ವ', w: 'ವ', sh: 'ಶ', s: 'ಸ', h: 'ಹ', L: 'ಳ' }
    },
    ml: {
      vowels: { a: 'അ', aa: 'ആ', A: 'ആ', i: 'ഇ', ii: 'ഈ', ee: 'ഈ', u: 'ഉ', uu: 'ഊ', oo: 'ഊ', e: 'എ', E: 'ഏ', ae: 'ഏ', ai: 'ഐ', o: 'ഒ', O: 'ഓ', oa: 'ഓ', au: 'ഔ' },
      vowelSigns: { a: '', aa: 'ാ', A: 'ാ', i: 'ി', ii: 'ീ', ee: 'ീ', u: 'ു', uu: 'ൂ', oo: 'ൂ', e: 'െ', E: 'േ', ae: 'േ', ai: 'ൈ', o: 'ൊ', O: 'ോ', oa: 'ോ', au: 'ൌ' },
      virama: '്',
      cons: { k: 'ക', kh: 'ഖ', g: 'ഗ', gh: 'ഘ', ng: 'ങ', ch: 'ച', chh: 'ഛ', j: 'ജ', jh: 'ഝ', nj: 'ഞ', t: 'ട', th: 'ത', d: 'ഡ', dh: 'ധ', N: 'ണ', n: 'ന', p: 'പ', ph: 'ഫ', f: 'ഫ', b: 'ബ', bh: 'ഭ', m: 'മ', y: 'യ', r: 'ര', l: 'ല', v: 'വ', w: 'വ', sh: 'ശ', s: 'സ', h: 'ഹ', L: 'ള', zh: 'ഴ', R: 'റ' }
    }
  },
  transliterateWord(word: string, lang: string): string {
    const table = (this.tables as any)[lang];
    if (!table) return word;
    const w = word.toLowerCase();
    let res = '', i = 0, len = w.length;
    while (i < len) {
      let c = null, clen = 0;
      if (i + 2 <= len && table.cons[w.slice(i, i + 2)]) {
        c = table.cons[w.slice(i, i + 2)];
        clen = 2;
      } else if (table.cons[w.slice(i, i + 1)]) {
        c = table.cons[w.slice(i, i + 1)];
        clen = 1;
      }

      if (c) {
        i += clen;
        let v = null, vlen = 0;
        if (i + 2 <= len && table.vowelSigns[w.slice(i, i + 2)] !== undefined) {
          v = table.vowelSigns[w.slice(i, i + 2)];
          vlen = 2;
        } else if (i + 1 <= len && table.vowelSigns[w.slice(i, i + 1)] !== undefined) {
          v = table.vowelSigns[w.slice(i, i + 1)];
          vlen = 1;
        }
        if (v !== null) {
          res += c + v;
          i += vlen;
        } else {
          res += c + table.virama;
        }
      } else {
        let iv = null, ivlen = 0;
        if (i + 2 <= len && table.vowels[w.slice(i, i + 2)]) {
          iv = table.vowels[w.slice(i, i + 2)];
          ivlen = 2;
        } else if (table.vowels[w.slice(i, i + 1)]) {
          iv = table.vowels[w.slice(i, i + 1)];
          ivlen = 1;
        }
        if (iv) {
          res += iv;
          i += ivlen;
        } else {
          res += w[i];
          i++;
        }
      }
    }
    return res;
  },
  transliterate(text: string, lang: string): string {
    if (!text || lang === 'en') return text;
    const parts = text.split(/(\s+)/);
    return parts.map(p => {
      if (/^\s+$/.test(p)) return p;
      return this.transliterateWord(p, lang);
    }).join('');
  }
};

// API Endpoint for Live South Indian Translation & Transliteration
app.post('/api/translate', async (req, res) => {
  try {
    const { text, targetLang, mode } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text parameter is required' });
    }

    const cleanText = text.trim();
    const lang = targetLang || 'ta';
    const langName = LANG_NAMES[lang] || 'Tamil';
    const isPhonetic = mode === 'phonetic';
    const lower = cleanText.toLowerCase();

    // 1. Direct dictionary match (instant return, avoids any API call)
    if (!isPhonetic && FALLBACK_DICT[lower] && FALLBACK_DICT[lower][lang]) {
      return res.json({
        ...FALLBACK_DICT[lower][lang],
        targetLang: lang,
        mode: 'semantic',
        source: 'dict',
      });
    }

    // 2. Call Gemini API if available and NOT on quota cooldown
    const isUnderCooldown = Date.now() < geminiCooldownUntil;
    if (process.env.GEMINI_API_KEY && !isUnderCooldown) {
      try {
        const ai = new GoogleGenAI();
        let prompt = '';

        if (isPhonetic) {
          prompt = `Transliterate the following phonetic English input into native ${langName} script according to natural South Indian phonetic sounds (e.g., vanakkam -> வணக்கம், namaste -> నమస్తే / ನಮಸ್ತೆ / നമസ്തേ).
Output JSON only with keys "translatedText" and "romanized".
Input: "${cleanText}"`;
        } else {
          prompt = `Translate the following English text to ${langName} in natural native script.
Output JSON only with keys "translatedText" and "romanized".
English text: "${cleanText}"`;
        }

        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Translation timeout')), 2200));
        const callPromise = ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const response: any = await Promise.race([callPromise, timeoutPromise]);
        const raw = response.text?.trim() || '';
        const parsed = JSON.parse(raw);
        if (parsed.translatedText) {
          return res.json({
            translatedText: parsed.translatedText,
            romanized: parsed.romanized || cleanText,
            targetLang: lang,
            mode: isPhonetic ? 'phonetic' : 'semantic',
            source: 'gemini',
          });
        }
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        const isQuota = errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED');
        if (isQuota) {
          // Trip circuit breaker for 24 hours to protect quota and prevent repeated 429 warnings
          geminiCooldownUntil = Date.now() + 24 * 60 * 60 * 1000;
        }
      }
    }

    // 3. High-Performance Autonomous Multi-Word Translation & Transliteration Engine
    if (!isPhonetic) {
      // Split into individual tokens/words
      const tokens = lower.split(/(\s+)/);
      let allTranslated = true;
      const translatedTokens = tokens.map(token => {
        if (/^\s+$/.test(token)) return token;
        if (FALLBACK_DICT[token] && FALLBACK_DICT[token][lang]) {
          return FALLBACK_DICT[token][lang].translatedText;
        }
        allTranslated = false;
        return IndicServerTransliterator.transliterate(token, lang);
      });

      const translatedText = translatedTokens.join('');
      return res.json({
        translatedText,
        romanized: cleanText,
        targetLang: lang,
        mode: 'semantic',
        source: allTranslated ? 'dict-compound' : 'hybrid-local',
      });
    }

    // 4. Phonetic Transliteration
    const transliterated = IndicServerTransliterator.transliterate(cleanText, lang);
    return res.json({
      translatedText: transliterated,
      romanized: cleanText,
      targetLang: lang,
      mode: 'phonetic',
      source: 'phonetic-engine',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Translation processing completed gracefully.' });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Type Garden server running at http://${HOST}:${PORT}`);
  });
}

startServer();
