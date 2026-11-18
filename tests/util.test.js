"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const U = require("../js/util.js");

test("fechas: se aceptan las formas habituales de escribirlas", () => {
  assert.equal(U.parseDate("1/5/27"), "01/05/2027");
  assert.equal(U.parseDate("01-05-2027"), "01/05/2027");
  assert.equal(U.parseDate("2027-01-05"), "01/05/2027");
  assert.equal(U.parseDate("01052027"), "01/05/2027");
  assert.equal(U.parseDate("Jan 5, 2027"), "01/05/2027");
  assert.equal(U.parseDate("February 12, 2027"), "02/12/2027");
  assert.equal(U.parseDate("5 de enero de 2027"), "01/05/2027");
  assert.equal(U.parseDate("13/45/2027"), "");
  assert.equal(U.parseDate("02/30/2027"), "");
  assert.equal(U.parseDate("mañana"), "");
});

test("fechas: sumar días y meses, y formato del task de documentos", () => {
  assert.equal(U.addDays("12/30/2026", 3), "01/02/2027");
  assert.equal(U.addMonths("01/31/2027", 1), "02/28/2027");
  assert.equal(U.taskDate("07/09/2024"), "JUL/09/2024");
  assert.equal(U.taskDate(""), "");
});

test("hora de referencia", () => {
  assert.equal(U.parseTime("9"), "09:00");
  assert.equal(U.parseTime("930"), "09:30");
  assert.equal(U.parseTime("2pm"), "14:00");
  assert.equal(U.parseTime("12 am"), "00:00");
  assert.equal(U.parseTime("14:15"), "14:15");
  assert.equal(U.parseTime("25:00"), "");
});

test("dinero", () => {
  assert.equal(U.parseMoney("850.1"), "$850.10");
  assert.equal(U.parseMoney("$1,200"), "$1,200.00");
  assert.equal(U.parseMoney("0"), "$0.00");
  assert.equal(U.parseMoney("abc"), "");
});

test("nombres", () => {
  assert.deepEqual(U.splitName("Beatriz Diaz"), { nombres: "Beatriz", apellidos: "Diaz" });
  assert.deepEqual(U.splitName("Beatriz Diaz Perez"), { nombres: "Beatriz", apellidos: "Diaz Perez" });
  assert.deepEqual(U.splitName("Maria Elena Diaz Perez"), { nombres: "Maria Elena", apellidos: "Diaz Perez" });
  assert.deepEqual(U.splitName("Juan de la Cruz"), { nombres: "Juan", apellidos: "de la Cruz" });
  assert.equal(U.titleCase("VARONA DE LA PENA"), "Varona De La Pena");
  assert.equal(U.titleCase("o'neil-perez"), "O'Neil-Perez");
  assert.equal(U.initials("Rosa Mendez"), "RM");
  assert.equal(U.initials("Marta Gil Romero"), "MG");
});

test("hora de la llamada y año-mes de los archivos", () => {
  assert.equal(U.to12h("14:44"), "02:44");
  assert.equal(U.to12h("2:44pm"), "02:44");
  assert.equal(U.to12h("00:15"), "12:15");
  assert.equal(U.to12h("abc"), "");
  assert.equal(U.timeLabel("14:30"), "2:30 PM");
  assert.equal(U.timeLabel("09:00"), "9:00 AM");
  assert.equal(U.timeLabel("12:00"), "12:00 PM");
  const slots = U.halfHourSlots();
  assert.ok(slots.every((s) => /:(00|30)$/.test(s.v)), "solo :00 y :30");
  assert.equal(slots[0].v, "07:00");
  assert.equal(slots[slots.length - 1].v, "21:30");
  assert.ok(slots.some((s) => s.v === "09:00" && s.l === "09:00 · 9:00 AM"));
  assert.equal(U.yearMonth("3/20/26"), "2026 MAR");
  /* el task lleva la hora en punto o y media de antes; la nota, la exacta */
  assert.equal(U.floorSlot("09:13"), "09:00");
  assert.equal(U.floorSlot("09:32"), "09:30");
  assert.equal(U.floorSlot("09:30"), "09:30");
  assert.equal(U.floorSlot("14:59"), "14:30");
  assert.equal(U.floorSlot(""), "");
  assert.equal(U.parseClock("934"), "09:34");
  assert.equal(U.parseClock("2:13"), "14:13");
  assert.equal(U.parseClock("9:34am"), "09:34");
  assert.equal(U.parseSlot("9:34"), "09:30", "redondear sigue igual");
  assert.equal(U.yearMonth(""), "");
});

test("año de plan: desde octubre se vende el siguiente", () => {
  assert.equal(U.defaultPlanYear(new Date(2026, 10, 14)), "2027");
  assert.equal(U.defaultPlanYear(new Date(2027, 1, 1)), "2027");
});

test("archivo del equipo: se lee, se limpia y vuelve a escribirse igual", () => {
  const text = JSON.stringify({ app: "qagency-toolbox-team", version: 1, team: [
    { name: "  Ana   Torres ", ini: "di", agentIni: "li", npn: "1000-0001", tel: "(305) 555-0101", extra: "x" },
    { name: "Rosa Mendez" },
    { name: "rosa mendez", ini: "ZZ" },
    { name: "", ini: "XX" }
  ] });
  const r = U.parseTeam(text);
  assert.equal(r.error, undefined);
  assert.deepEqual(r.team, [
    { name: "Ana Torres", ini: "DI", agentIni: "LI", npn: "10000001", tel: "(305) 555-0101" },
    { name: "Rosa Mendez", ini: "RM", npn: "" }
  ]);
  assert.deepEqual(U.parseTeam(U.teamFile(r.team)).team, r.team);
  assert.equal(JSON.parse(U.teamFile(r.team)).app, "qagency-toolbox-team");
  /* también una lista sola, sin el sobre */
  assert.deepEqual(U.parseTeam('[{"name":"Rosa Mendez","ini":"RM"}]').team, [{ name: "Rosa Mendez", ini: "RM", npn: "" }]);
  /* agentIni igual a ini no se guarda */
  assert.deepEqual(U.parseTeam('[{"name":"Rosa Mendez","ini":"RM","agentIni":"RM"}]').team, [{ name: "Rosa Mendez", ini: "RM", npn: "" }]);
});

test("archivo del equipo: un archivo que no sirve da un mensaje y ninguna lista", () => {
  ["no es json", "{}", "[]", '{"team":[{"ini":"AB"}]}', '{"team":"Ana"}', "null", "42", '[{"name":5}]'].forEach((t) => {
    const r = U.parseTeam(t);
    assert.equal(r.team, undefined, t);
    assert.match(r.error, /archivo del equipo/, t);
  });
});

test("versiones: solo una más nueva cuenta como actualización", () => {
  assert.equal(U.newerVersion("1.10.0", "1.9.0"), true);
  assert.equal(U.newerVersion("2.0", "1.9.9"), true);
  assert.equal(U.newerVersion("1.9.1", "1.9"), true);
  assert.equal(U.newerVersion("1.9.0", "1.9.0"), false);
  assert.equal(U.newerVersion("1.9", "1.9.0"), false);
  assert.equal(U.newerVersion("1.8.9", "1.9.0"), false);
  ["", null, "v1.10", "1.10.0-beta", "abc", "1..2"].forEach((v) => assert.equal(U.newerVersion(v, "1.9.0"), false, String(v)));
});

test("parseBirth: una fecha de nacimiento con el año en dos cifras no queda en el futuro", () => {
  assert.equal(U.parseBirth("5/2/80"), "05/02/1980");
  assert.equal(U.parseBirth("5/2/12"), "05/02/2012");
  assert.equal(U.parseBirth("05/02/1980"), "05/02/1980");
  assert.equal(U.parseBirth("hola"), "");
});

test("archivo del equipo: la agencia de cada agente se guarda y se lee", () => {
  const r = U.parseTeam(JSON.stringify([
    { name: "Laura Gomez", ini: "LG", npn: "12345678", oficina: " ATH  Insurance " },
    { name: "Rosa Mendez", ini: "RM", npn: "87654321", oficina: "" }
  ]));
  assert.deepEqual(r.team, [
    { name: "Laura Gomez", ini: "LG", npn: "12345678", oficina: "ATH Insurance" },
    { name: "Rosa Mendez", ini: "RM", npn: "87654321" }
  ]);
  assert.deepEqual(U.parseTeam(U.teamFile(r.team)).team, r.team);
});

test("archivo del equipo: lleva los enlaces de SignWell, sin el nombre ni la oficina", () => {
  const team = [{ name: "Laura Gomez", ini: "LG", npn: "12345678" }];
  const links = { soa_en: " https://www.signwell.com/abc ", consent_qa_es: "", raro: "javascript:alert(1)" };
  const file = U.teamFile(team, links);
  const data = JSON.parse(file);
  assert.deepEqual(data.signLinks, { soa_en: "https://www.signwell.com/abc" });
  assert.equal(data.autor, undefined);
  assert.equal(data.oficina, undefined);
  const r = U.parseTeam(file);
  assert.deepEqual(r.team, team);
  assert.deepEqual(r.signLinks, { soa_en: "https://www.signwell.com/abc" });
  /* un archivo de antes, sin enlaces, sigue sirviendo */
  assert.deepEqual(U.parseTeam(U.teamFile(team)).signLinks, {});
  assert.deepEqual(U.parseTeam(JSON.stringify(team)).signLinks, {});
});
