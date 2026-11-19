/*
 * tariff.js — 한국전력 주택용 전력 요금 계산 코어 (외부 의존성 없음)
 *
 * ── 적용 기준 (2026-11-20 확인) ─────────────────────────────────────────────
 * 1) 기본요금·전력량요금: 한전 전기요금표 「주택용 전력」, 2023-11-09 시행분이 현행.
 *    - 저압: 200kWh 이하 910원 / 201~400 1,600원 / 400 초과 7,300원
 *            전력량 120.0 / 214.6 / 307.3 원/kWh
 *    - 고압: 730 / 1,260 / 6,060원, 전력량 105.0 / 174.0 / 242.3 원/kWh
 *    - 하계(7.1~8.31)는 단가가 같고 구간만 300 / 450kWh로 넓어진다.
 *    - 1,000kWh 초과분은 하계(7~8월)·동계(12~2월)에 슈퍼유저 요율
 *      (저압 736.2원, 고압 601.3원/kWh) 적용.
 *    출처: https://home.kepco.co.kr/kepco/front/html/CY/E/E/CYEEHP00101.html
 *          기본공급약관 제67조 및 별표1 (2026-04-01 시행), 법제처 생활법령 정보
 *          https://www.easylaw.go.kr/CSP/IssueQaRetrieve.laf?issueqaSeq=407
 *
 * 2) 기후환경요금: 9.0원/kWh (2023-01-01부터, 변경 공지 없음)
 *
 * 3) 연료비조정요금: 2026년 4분기(10~12월분) +5.0원/kWh.
 *    한전 2026-09-21 공지 「2026년 4분기 연료비조정단가 산정내역」
 *    (산정 필요단가 7.3원 → 상한 ±5원 적용해 5.0원 확정, 기본·전력량·기후환경요금 동결)
 *    https://www.kepco.co.kr/home/media/newsroom/notice/boardView.do?boardMngNo=14&boardNo=2759
 *    ※ 분기마다 바뀌므로 TARIFF.fuel 값을 갱신해야 한다.
 *
 * 4) 부가가치세 10% (전기요금계 기준, 원 미만 반올림)
 *    전력산업기반기금 2.7% (2025-07-01 사용분부터, 전기사업법 시행령 제36조 / 부칙)
 *    — 2024-07~2025-06은 3.2%, 그 전은 3.7%였다.
 *    청구금액 10원 미만 절사, 원 미만 절사 규칙은 한전 요금표 PDF 계산 예시를 따름.
 *
 * 5) 계산 순서: 기본요금 + 전력량요금 + 기후환경요금 + 연료비조정요금 = 전기요금계
 *    → 부가가치세(전기요금계×10%) + 기금(전기요금계×2.7%, 10원 미만 버림) 합산 → 10원 미만 절사
 *    검증: 저압·기타계절 300kWh = 57,760원, 450kWh = 108,050원 (한전·공개자료 게시값과 일치)
 *
 * ※ 복지할인·대가족·출산가구 할인, TV수신료, 검침일 차이에 따른 계절 안분은 반영하지 않는다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Tariff = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TARIFF = {
    effectiveFrom: '2023-11-09',
    checkedAt: '2026-11-20',
    climate: 9.0,
    fuel: 5.0,
    fuelPeriod: '2026년 10~12월분',
    fundRate: 0.027,
    vatRate: 0.10,
    minMonthly: 1000,
    superUserFrom: 1000,
    types: {
      low: {
        label: '주택용 저압',
        base: [910, 1600, 7300],
        rates: [120.0, 214.6, 307.3],
        superUser: 736.2
      },
      high: {
        label: '주택용 고압',
        base: [730, 1260, 6060],
        rates: [105.0, 174.0, 242.3],
        superUser: 601.3
      }
    },
    bounds: {
      other: [200, 400],
      summer: [300, 450],
      winter: [200, 400]
    }
  };

  function round10(n) {
    return Math.floor(n / 10 + 1e-9) * 10;
  }

  function tierBounds(season) {
    return TARIFF.bounds[season] || TARIFF.bounds.other;
  }

  /** 총 사용량이 속한 누진 단계(1~3). */
  function tierOf(kwh, season) {
    var b = tierBounds(season);
    if (kwh <= b[0]) return 1;
    if (kwh <= b[1]) return 2;
    return 3;
  }

  /**
   * 전력량요금(원). 구간별로 나눠 곱하고 원 미만은 버린다.
   * 하계·동계 1,000kWh 초과분은 슈퍼유저 요율을 적용한다.
   */
  function energyCharge(kwh, type, season) {
    if (!(kwh > 0)) return 0;
    var t = TARIFF.types[type] || TARIFF.types.low;
    var b = tierBounds(season);
    var superActive =
      (season === 'summer' || season === 'winter') && kwh > TARIFF.superUserFrom;
    var caps = [b[0], b[1], superActive ? TARIFF.superUserFrom : Infinity];
    var prev = 0;
    var sum = 0;
    for (var i = 0; i < 3; i++) {
      var seg = Math.min(kwh, caps[i]) - prev;
      if (seg > 0) sum += seg * t.rates[i];
      prev = caps[i];
      if (kwh <= caps[i]) break;
    }
    if (superActive) sum += (kwh - TARIFF.superUserFrom) * t.superUser;
    return Math.floor(sum + 1e-9);
  }

  /**
   * 한 달 청구액 전체.
   * @returns {{kwh:number,type:string,season:string,tier:number,
   *   base:number,energy:number,climate:number,fuel:number,
   *   subtotal:number,vat:number,fund:number,total:number}}
   */
  function computeBill(kwh, type, season, opts) {
    opts = opts || {};
    var climate = opts.climate != null ? opts.climate : TARIFF.climate;
    var fuel = opts.fuel != null ? opts.fuel : TARIFF.fuel;
    var k = Number(kwh);
    if (!isFinite(k) || k < 0) k = 0;
    var kind = TARIFF.types[type] ? type : 'low';
    var sea = TARIFF.bounds[season] ? season : 'other';

    var tier = tierOf(k, sea);
    var base = TARIFF.types[kind].base[tier - 1];
    var energy = energyCharge(k, kind, sea);
    var climateCharge = Math.floor(k * climate + 1e-9);
    var fuelCharge = Math.floor(k * fuel + 1e-9);
    var subtotal = base + energy + climateCharge + fuelCharge;
    if (subtotal < TARIFF.minMonthly) subtotal = TARIFF.minMonthly;
    var vat = Math.round(subtotal * TARIFF.vatRate + 1e-9);
    var fund = round10(subtotal * TARIFF.fundRate);
    var total = round10(subtotal + vat + fund);

    return {
      kwh: k,
      type: kind,
      season: sea,
      tier: tier,
      base: base,
      energy: energy,
      climate: climateCharge,
      fuel: fuelCharge,
      subtotal: subtotal,
      vat: vat,
      fund: fund,
      total: total
    };
  }

  /** 가전의 월 소비전력량(kWh). */
  function applianceKwh(watts, hoursPerDay, daysPerMonth) {
    var w = Number(watts) || 0;
    var h = Number(hoursPerDay) || 0;
    var d = Number(daysPerMonth) || 0;
    if (w < 0 || h < 0 || d < 0) return 0;
    return (w * h * d) / 1000;
  }

  /** 220V 기준 전류(A). */
  function amps(watts, voltage) {
    var v = Number(voltage) || 220;
    return v > 0 ? (Number(watts) || 0) / v : 0;
  }

  /**
   * 멀티탭 안전 판정.
   * 일반 멀티탭 2,800W(12.7A) / 고용량 4,000W(16A), 가정용 15A 차단기 3,300W 기준.
   * 안전: 정격 80%(2,240W) 이하 → safe
   * 주의: 2,240W 초과 ~ 2,800W → warn
   * 위험: 2,800W 초과 → danger
   */
  var LIMITS = {
    normalWatts: 2800,
    normalAmps: 12.7,
    highWatts: 4000,
    highAmps: 16,
    breaker15Watts: 3300,
    safeRatio: 0.8
  };

  function multitapLevel(watts) {
    var w = Number(watts) || 0;
    if (w <= 0) return 'empty';
    if (w <= LIMITS.normalWatts * LIMITS.safeRatio) return 'safe';
    if (w <= LIMITS.normalWatts) return 'warn';
    return 'danger';
  }

  function multitapReport(watts) {
    var w = Math.max(0, Number(watts) || 0);
    var a = amps(w);
    var level = multitapLevel(w);
    return {
      watts: w,
      amps: a,
      ampsPer220: LIMITS.normalWatts,
      level: level,
      overNormal: w > LIMITS.normalWatts,
      overHigh: w > LIMITS.highWatts,
      overBreaker15: w > LIMITS.breaker15Watts,
      normalRatio: w / LIMITS.normalWatts,
      highRatio: w / LIMITS.highWatts
    };
  }

  return {
    TARIFF: TARIFF,
    LIMITS: LIMITS,
    round10: round10,
    tierBounds: tierBounds,
    tierOf: tierOf,
    energyCharge: energyCharge,
    computeBill: computeBill,
    applianceKwh: applianceKwh,
    amps: amps,
    multitapLevel: multitapLevel,
    multitapReport: multitapReport
  };
});
