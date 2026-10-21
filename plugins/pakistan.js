/**
 * PAKISTAN — PK-specific commands (rates, cricket, tracking, holidays…)
 */
const config = require('../config');
const { getJSON, getText, pick, randInt } = require('../lib/helpers');

const P = () => config.PREFIX;

const PK_CITIES = ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Hyderabad', 'Sialkot', 'Gujranwala', 'Bahawalpur'];
const PK_FOOD = ['Biryani', 'Nihari', 'Haleem', 'Chapli Kabab', 'Sajji', 'Karahi', 'Paya', 'Haleem', 'Aloo Keema', 'Chana Chaat', 'Gol Gappay', 'Jalebi'];
const PK_TRAVEL = [
  ['Hunza', 'Gilgit-Baltistan — Attabad Lake, Rakaposhi, Baltit Fort. Best: April–October.'],
  ['Skardu', 'Gilgit-Baltistan — Shangrila, Deosai, Katpana desert. Best: May–September.'],
  ['Swat', 'KPK — Kalam, Malam Jabba, Mahodand Lake. Best: March–October.'],
  ['Murree', 'Punjab — Mall Road, Patriata, Kashmir Point. Best: all year (snow in Jan).'],
  ['Naran', 'KPK — Saif-ul-Malook, Babusar Top. Best: June–September.'],
  ['Gwadar', 'Balochistan — Hammerhead, Kund Malir. Best: November–February.'],
  ['Fairy Meadows', 'Gilgit — Nanga Parbat view. Best: May–September.'],
  ['Neelum Valley', 'AJK — Keran, Sharda, Arang Kel. Best: April–October.'],
];
const PK_QUIZ = [
  ['Pakistan ka sab se bara shehar?', 'Karachi'],
  ['Pakistan ki rajdhani?', 'Islamabad'],
  ['Sab se uncha pahad?', 'K2 (8611m)'],
  ['Pakistan kis saal azaad hua?', '1947 (14 August)'],
  ['Sab se lambi darya?', 'Indus (Sindh)'],
  ['Qaumi phool?', 'Chambeli (Jasmine)'],
  ['Qaumi jaanwar?', 'Markhor'],
  ['Sab se bara soobah (area)?', 'Balochistan'],
];

const handler = async (ctx) => {
  const { command, reply, arg } = ctx;

  switch (command) {
    /* ---------------- rates ---------------- */
    case 'dollar': case 'currency2': {
      try {
        const d = await getJSON('https://open.er-api.com/v6/latest/USD');
        const r = d.rates;
        return reply(`💵 *Currency rates (1 USD)*\n\n🇵🇰 PKR: *${r.PKR}*\n🇮🇳 INR: ${r.INR}\n🇦🇪 AED: ${r.AED}\n🇸🇦 SAR: ${r.SAR}\n🇬🇧 GBP: ${r.GBP}\n🇪🇺 EUR: ${r.EUR}\n\n_Updated: ${d.time_last_update_utc?.slice(5, 16)}_`);
      } catch {
        try {
          const c = await getJSON('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json');
          return reply(`💵 *1 USD*\n\n🇵🇰 PKR: *${c.usd.pkr}*\n🇦🇪 AED: ${c.usd.aed}\n🇸🇦 SAR: ${c.usd.sar}\n🇬🇧 GBP: ${c.usd.gbp}\n\n_${c.date}_`);
        } catch { return reply('❌ Currency rates nahi mile. Thori der baad try karo.'); }
      }
    }
    case 'gold': {
      try {
        const g = await getJSON('https://api.gold-api.com/price/XAU');
        const s = await getJSON('https://api.gold-api.com/price/XAG');
        const fx = await getJSON('https://open.er-api.com/v6/latest/USD');
        const pkr = fx.rates.PKR;
        const tolaG = (g.price / 31.1035) * 11.6638 * pkr;
        const tolaS = (s.price / 31.1035) * 11.6638 * pkr;
        return reply(`🪙 *Gold & Silver*\n\n🥇 Gold: $${Number(g.price).toFixed(2)}/oz\n   ≈ *PKR ${Math.round(tolaG).toLocaleString()} / tola*\n🥈 Silver: $${Number(s.price).toFixed(2)}/oz\n   ≈ *PKR ${Math.round(tolaS).toLocaleString()} / tola*\n\n_USD rate: ${pkr}_\n_International rate + customs/making charges alag hote hain._`);
      } catch { return reply('❌ Rates nahi mile. Thori der baad try karo.'); }
    }
    case 'petrol': {
      return reply(`⛽ *Petrol prices (Pakistan)*\n\nLive rates OGRA har 15 din update karta hai.\n\n📌 Current rates: https://www.ogra.org.pk\n\n_Apne shehar ke rate ke liye ${P()}news petrol try karo._`);
    }
    case 'psx': {
      try {
        const d = await getText('https://dps.psx.com.pk/indices');
        const m = /KSE100[^0-9]*([0-9,]+\.[0-9]+)/.exec(d);
        return reply(`📈 *PSX*\n\nKSE-100: *${m ? m[1] : 'live data unavailable'}*\n\n📊 Detail: https://dps.psx.com.pk`);
      } catch { return reply('❌ PSX data nahi mila. https://dps.psx.com.pk dekho.'); }
    }

    /* ---------------- cricket ---------------- */
    case 'pakcricket': {
      try {
        const d = await getJSON('https://api.cricapi.com/v1/currentMatches?apikey=&offset=0');
        return reply(`🏏 *Pakistan cricket*\n\nLive scores: https://www.espncricinfo.com/team/pakistan-7\n\n_PCb/PCB schedule ke liye ${P()}pknews cricket_`);
      } catch {
        return reply(`🏏 *Pakistan cricket*\n\n📊 Live score & schedule:\nhttps://www.espncricinfo.com/team/pakistan-7\n\n_PCB fixtures: https://www.pcb.com.pk_`);
      }
    }
    case 'psl': {
      return reply(`🏆 *PSL (Pakistan Super League)*\n\n6 teams: Karachi Kings, Lahore Qalandars, Islamabad United, Peshawar Zalmi, Quetta Gladiators, Multan Sultans.\n\n📊 Points table & fixtures: https://www.psl-t20.com\n\n_Season aam tor par Feb–March hota hai._`);
    }

    /* ---------------- tracking ---------------- */
    case 'track': {
      const no = (arg || '').replace(/\s/g, '');
      if (!no) return reply(`❌ Tracking number do. Example: ${P()}track 123456789`);
      return reply(`📦 *Courier tracking — ${no}*\n\n🚚 TCS: https://www.tcsexpress.com/track/${no}\n🚚 Leopards: https://www.leopardscourier.com/tracking/${no}\n🚚 M&P: https://www.mulphilog.com/tracking/${no}\n🚚 Pakistan Post: https://ep.gov.pk/track/${no}\n\n_Koi bhi link kholo — status dikh jayega._`);
    }
    case 'tcs': {
      const no = (arg || '').replace(/\s/g, '');
      if (!no) return reply(`❌ Tracking number do. Example: ${P()}tcs 123456789`);
      return reply(`📦 *TCS — ${no}*\n\n🔗 https://www.tcsexpress.com/track/${no}\n\n_Is link par status dekh lo._`);
    }
    case 'leopards': {
      const no = (arg || '').replace(/\s/g, '');
      if (!no) return reply(`❌ Tracking number do. Example: ${P()}leopards 123456789`);
      return reply(`📦 *Leopards — ${no}*\n\n🔗 https://www.leopardscourier.com/tracking/${no}`);
    }
    case 'echallan': {
      const no = (arg || '').replace(/\s/g, '');
      return reply(`🚗 *E-Challan check*\n\n${no ? `📌 Vehicle/CNIC: *${no}*\n\n` : ''}🔗 Punjab: https://echallan.punjab.gov.pk\n🔗 Sindh: https://echallan.sindhpolice.gov.pk\n🔗 ICT: https://ictp.traffic.pk\n\n_Number daal kar check karo._`);
    }
    case 'pta': {
      const imei = (arg || '').replace(/[^0-9]/g, '');
      return reply(`📱 *PTA device check*\n\n${imei ? `IMEI: *${imei}*\n\n` : ''}🔗 https://dirbs.pta.gov.pk/drs\n\n_IMEI dial karo: *#06# — phir site par daalo._`);
    }
    case 'siminfo': {
      const no = (arg || '').replace(/[^0-9]/g, '');
      const net = no.startsWith('030') || no.startsWith('031') || no.startsWith('032') ? 'Jazz / Zong / Warid' : no.startsWith('033') ? 'Ufone' : no.startsWith('034') ? 'Telenor' : no.startsWith('035') ? 'SCOM' : '—';
      return reply(`📶 *SIM info*\n\n${no ? `Number: ${no}\nNetwork: *${net}*\n` : ''}\n📌 Owner details PTA/SIM database se check hoti hain — public API nahi hai.`);
    }

    /* ---------------- daily life ---------------- */
    case 'pknews': {
      try {
        const xml = await getText('https://news.google.com/rss?hl=en-PK&gl=PK&ceid=PK:en');
        const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 6);
        const out = items.map((m, i) => {
          const t = (/<title>([\s\S]*?)<\/title>/.exec(m[1]) || [])[1] || '';
          return `${i + 1}. ${t.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').trim()}`;
        }).join('\n');
        return reply(`📰 *Pakistan news*\n\n${out}`);
      } catch { return reply('❌ News nahi mili.'); }
    }
    case 'pkholiday': {
      // nager.date has no PK data (204), so use the fixed national calendar.
      const list = [
        ['23 March', 'Pakistan Day'],
        ['1 May', 'Labour Day'],
        ['14 August', 'Independence Day'],
        ['6 September', 'Defence Day'],
        ['9 November', 'Iqbal Day'],
        ['25 December', 'Quaid-e-Azam Day'],
        ['Eid-ul-Fitr', 'Ramadan ke baad (chaand par depend)'],
        ['Eid-ul-Azha', 'Zil-Hijjah 10 (chaand par depend)'],
        ['12 Rabi-ul-Awwal', 'Eid Milad-un-Nabi (chaand par depend)'],
        ['9–10 Muharram', 'Ashura (chaand par depend)'],
      ];
      return reply(`🗓️ *Pakistan holidays*\n\n` + list.map((x) => `• *${x[0]}* — ${x[1]}`).join('\n') + `\n\n_Islamic dates chaand ke hisaab se badalti hain._`);
    }
    case 'loadshedding': case 'light': {
      const city = arg || 'Karachi';
      return reply(`💡 *Loadshedding — ${city}*\n\n📌 Schedule apne DISCO se check karo:\n• K-Electric: https://www.ke.com.pk\n• LESCO: https://lesco.gov.pk\n• IESCO: https://iesco.com.pk\n• GEPCO: https://gepco.com.pk\n• PESCO: https://pesco.gov.pk\n\n_Tip: ${P()}aqi ${city} — weather bhi dekh lo._`);
    }
    case 'aqi': {
      const city = arg || 'Karachi';
      try {
        const g = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
        const c = g.results?.[0];
        if (!c) throw new Error('no city');
        const a = await getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${c.latitude}&longitude=${c.longitude}&current=pm10,pm2_5,us_aqi`);
        const q = a.current;
        const lvl = q.us_aqi <= 50 ? '🟢 Good' : q.us_aqi <= 100 ? '🟡 Moderate' : q.us_aqi <= 150 ? '🟠 Unhealthy (sensitive)' : q.us_aqi <= 200 ? '🔴 Unhealthy' : '🟣 Very unhealthy';
        return reply(`🌫️ *Air quality — ${c.name}*\n\nAQI: *${Math.round(q.us_aqi)}* ${lvl}\nPM2.5: ${q.pm2_5} µg/m³\nPM10: ${q.pm10} µg/m³\n\n_Mask pehno agar AQI 150+ ho._`);
      } catch { return reply('❌ City nahi mili.'); }
    }
    case 'earthquake2': case 'quake': {
      try {
        const d = await getJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson');
        const q = (d.features || []).slice(0, 4);
        if (!q.length) return reply('✅ Is hafte koi bara zalzala nahi aaya.');
        return reply(`🌍 *Recent earthquakes*\n\n` + q.map((x) => `• M${x.properties.mag} — ${x.properties.place}\n  _${new Date(x.properties.time).toUTCString().slice(5, 22)}_`).join('\n'));
      } catch { return reply('❌ Earthquake data nahi mila. Thori der baad try karo.'); }
    }

    /* ---------------- PK content ---------------- */
    case 'pkfood': {
      const dish = arg || pick(PK_FOOD);
      return reply(`🍛 *${dish}*\n\n📌 Recipe: https://www.food.com/search?q=${encodeURIComponent(dish + ' pakistani')}\n📌 Video: YouTube par "${dish} recipe" search karo — ${P()}ytvideo <link> se dl bhi ho jayega.`);
    }
    case 'pktravel': {
      const t = arg ? PK_TRAVEL.find((x) => x[0].toLowerCase().includes(arg.toLowerCase())) || pick(PK_TRAVEL) : pick(PK_TRAVEL);
      return reply(`🏔️ *${t[0]}*\n\n${t[1]}\n\n📌 ${P()}pknews — travel updates ke liye`);
    }
    case 'k2': {
      return reply(`🏔️ *K2 — Chogori*\n\n📏 Height: 8,611 m (world #2)\n📍 Karakoram range, Gilgit-Baltistan\n🥇 First ascent: 1954 (Italian expedition)\n☠️ World's 2nd deadliest 8000er\n\n_Tip: ${P()}pktravel skardu — qareeb ke spots_`);
    }
    case 'pkquiz': {
      const [q, a] = pick(PK_QUIZ);
      return reply(`🇵🇰 *Pakistan Quiz*\n\n❓ ${q}\n\n||Jawab: ${a}||`);
    }
    case 'urduword': {
      const words = [['Chashm-e-bad-daur', 'Nazar-e-bad se bachane ki dua'], ['Dil-joi', 'Dil ko khush karna'], ['Khush-numa', 'Acha dikhne wala'], ['Sargarmi', 'Josh aur chusti'], ['Waqar', 'Azaamat aur sanjeedgi'], ['Faraaghat', 'Faarigh waqt'], ['Takhleeq', 'Nayi cheez banana'], ['Meharbani', 'Bhalai aur lutaf']];
      const w = pick(words);
      return reply(`📖 *Urdu lafz*\n\n*${w[0]}*\n_${w[1]}_`);
    }
    case 'azadi': {
      const target = new Date('2027-08-14T00:00:00+05:00');
      const days = Math.ceil((target - Date.now()) / 86400000);
      return reply(`🇵🇰 *Jashn-e-Azadi*\n\n14 August 1947 — Pakistan azaad hua.\n\n⏳ Agli 14 August: *${days} din baqi*\n\n_Quaid ka farman: “Kaam, kaam aur sirf kaam.”_`);
    }
    case 'polio': {
      return reply(`💉 *Polio campaign*\n\n📌 Apne area ke campaign dates ke liye:\n• NEOC: https://www.endpolio.com.pk\n• Helpline: 1166\n\n_Bachon ko hamesha polio drops pilao — ye mulk ki zimmedari hai._`);
    }
    case 'license': {
      return reply(`🪪 *Driving license (Punjab)*\n\n1. Learner permit: https://dlims.punjab.gov.pk\n2. Online test pass karo\n3. Learner 42 din baad permanent ke liye apply\n4. Fees: ~PKR 2,500 (learner + permanent)\n\n_Sindh: https://dls.sindh.gov.pk_`);
    }
    case 'visa': {
      const c = arg || '';
      if (!c) return reply(`❌ Country do. Example: ${P()}visa UAE`);
      return reply(`🛂 *Visa — ${c}*\n\n📌 Requirements generally: passport (6+ months), photo, bank statement, itinerary.\n🔗 Apply: search "official ${c} visa application"\n\n_${P()}pknews visa — latest updates_`);
    }
    default:
      return reply('❓ Unknown Pakistan command');
  }
};

module.exports = {
  commands: [
    'dollar', 'gold', 'petrol', 'psx', 'pakcricket', 'psl', 'track', 'tcs', 'leopards', 'echallan', 'pta',
    'siminfo', 'pknews', 'pkholiday', 'loadshedding', 'aqi', 'pkfood', 'pktravel', 'k2', 'pkquiz',
    'urduword', 'azadi', 'polio', 'license', 'visa',
    // extras that belong in this family
    'currency2', 'quake', 'earthquake2', 'light',
  ],
  category: '🇵🇰 PAKISTAN',
  handler,
};
