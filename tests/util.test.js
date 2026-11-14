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
  assert.equal(U.titleCase("DIAZ DE LA CRUZ"), "Diaz de la Cruz");
  assert.equal(U.titleCase("o'neil-perez"), "O'Neil-Perez");
  assert.equal(U.initials("Rosa Mendez"), "FV");
  assert.equal(U.initials("Marta Gil Romero"), "LE");
});

test("año de plan: desde octubre se vende el siguiente", () => {
  assert.equal(U.defaultPlanYear(new Date(2026, 10, 14)), "2027");
  assert.equal(U.defaultPlanYear(new Date(2027, 1, 1)), "2027");
});
