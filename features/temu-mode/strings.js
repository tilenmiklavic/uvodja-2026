/* All Temu Mode copy in one place – edit freely. {n}, {x} … are placeholders filled in by temu-mode.js.
   The store is Slovenian-only (no translation layer), so the copy is in Slovene. */
export const S = {
  toggle: { on: "🎪 Temu Mode: VKLOP", off: "🎪 Temu Mode", label: "Temu Mode (šaljivi način trgovine)" },

  wheel: {
    title: "🎡 ZAVRTI ZA NAGRADO!",
    intro: "Samo zate, samo danes, samo v tem zavihku!",
    spin: "Zavrti! 🎰",
    segments: ["100 % POPUSTA", "Objem", "Nič, lol", "Zastonj zrak", "0,01 🪙 popusta", "Večna slava"],
    won: "🎉 ZADEL SI 100 % POPUSTA! 🎉",
    fine: "*100 % popusta na virtualni »daj pet«. Veljajo pogoji. Pogoji so vibe.",
    claim: "Prevzemi svoj nič 🎉",
    close: "Zapri",
  },

  countdown: {
    label: "⚡ PONUDBA SE KONČA ČEZ",
    resets: [
      "šalim se, podaljšano samo zate 😉",
      "ups, spet podaljšano. Kdo bi si mislil.",
      "ponudba je kot bumerang – vedno se vrne 🪃",
      "čas je družbeni konstrukt ⏳",
      "podaljšano, ker te imamo radi 💛",
    ],
  },

  badges: [
    { text: "Samo še 3!*", tip: "*v tem specifičnem vesolju" },
    { text: "🔥 1.248.392 ljudi to gleda prav zdaj", tip: "vsi so moja mama" },
    { text: "87 % prevzeli ljudje, ki zagotovo obstajajo", tip: "zagotovo. 100 %. ne sprašuj." },
    { text: "📈 Prodaja raste kot kvas", tip: "kvas je tudi na zalogi, mimogrede" },
    { text: "⭐ 4,99/5 (ocenil sem sam)", tip: "ocena je nepristranska, ker sem jo dal jaz" },
  ],

  fakePrice: { badge: "−99,99 %", note: "originalna cena določena z metom kocke" },

  toasts: {
    who: ["Darth V. z Zvezde smrti", "Sosedova mačka", "Nekdo v Ljubljani", "Tvoj bivši vodnik", "Stegovodja iz vzporednega vesolja",
      "Akela (nedvomno resnična oseba)", "Babica iz Šentjerneja", "Neznani pirat s Karibov", "Robot sesalec iz Kranja", "Duh preteklih taborov",
      "Kapitan Kljuka", "Jež iz okolice ognjišča", "Nekdo, ki še vedno išče papigo", "Oseba z 47 rutkami", "Čarovnik iz Ptuja",
      "Pingvin z Antarktike", "Tvoj notranji glas", "Golob z Prešernovega trga", "Nekdo, ki je zmagal v Bum-Baru", "Vesoljec iz Velenja",
      "Skavt, ki je pozabil spalko", "Tvoj alter ego"],
    did: ["je pravkar kupil/a {n} {item}", "je pravkar dal/a {item} v košarico", "RAZMIŠLJA o nakupu: {item}", "je pravkar 4× pogledal/a {item}",
      "je kupil/a {item} in zajokal/a od sreče", "je {item} podaril/a sosedovi mački"],
    items: ["nogavic", "čokolad", "hrenovk", "paketov bananic", "lizik", "napolitank", "rdečih pes", "tun", "čajev", "česnov"],
    singular: ["čokolado", "hrenovko", "napolitanko", "rdečo peso", "tuno", "česen", "skuto", "liziko"],
    close: "Skrij",
  },

  progress: {
    text: "Do BREZPLAČNEGA SKRIVNOSTNEGA DARILA 🎁 ti manjka še čisto malo:",
    steps: ["99,9", "99,95", "99,97", "99,98", "99,99", "99,995", "99,999", "99,9999"],
    reveal: "Darilo so bili prijatelji, ki smo jih spoznali na poti. 💛",
  },

  coupons: {
    banner: "🎁 Odklenil/a si SVEŽENJ KUPONOV za 1.000 zlatnikov!",
    open: "Pokaži kupone", hide: "Skrij kupone",
    terms: "1.000 kuponov po 1 zlatnik. Veljajo za nakupe nad 10.000 zlatnikov, samo ob torkih, ob polni luni.",
    coupon: "−1 🪙",
  },

  referral: {
    text: "Povabi 47 prijateljev in odkleni brezplačno darilo!",
    count: "Povabljenih prijateljev: 0.",
    hug: "(Nič hudega – zdaj smo mi tvoji prijatelji 💛)",
    share: "Deli s prijatelji 📣",
    shareTitle: "U Vodja 2026 – Trgovina",
    shareText: "Pridi v Piratsko trgovino! Imajo kolo sreče, ki VEDNO zadene 100 % popusta (na virtualni »daj pet«). 🎪",
    copied: "Povezava kopirana! Zdaj potrebuješ samo še 46 prijateljev.",
  },

  coin: {
    label: "Dnevna prijava – Skavtski kovanček",
    plus: "+1 Skavtski kovanček 🪙",
    streak: "Niz: {n} {days}",
    total: "Imaš {n} od {goal}.",
    togo: "Samo še {n} do nagrade!",
    already: "Danes si se že prijavil/a. Pridi jutri – nagrada bo tu čez približno 2.740 let.",
    note: "(Skavtski kovančki niso zlatniki in ne kupijo ničesar. Niti objema.)",
  },

  exit: {
    title: "ČAKAJ! 😱 Si prepričan/a?",
    text: "Tvoj 100-odstotni popust na virtualni »daj pet« bo ZA VEDNO POTEKEL!",
    stay: "No dobro, ostanem 🥺",
    leave: "Ne, hvala, rad/a plačam polno ceno in sem žalosten/na",
  },

  cartMissesYou: "Tvoja košarica te pogreša 🥺 Minilo je že {n} {sec}.", // {sec} = sekunda / sekundi / sekunde / sekund
};
