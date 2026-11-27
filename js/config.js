/* Q Agency Toolbox — catálogos y configuración.
   Todo lo que cambia con el tiempo (equipo, compañías, tasks, situaciones)
   vive en este archivo para poder actualizarlo sin tocar la lógica. */
(function (root) {
  "use strict";

  var VERSION = "1.33.1";
  /* De aquí la herramienta instalada lee el número de la última versión (y
     nada más). La política de seguridad de index.html solo permite esta
     dirección, y el actualizador de Windows usa el mismo repositorio. */
  var UPDATE_URL = "https://raw.githubusercontent.com/therealedo/qagency-toolbox/main/package.json";
  /* El ayudante de firma (tools/windows/signing-helper.ps1) escucha en este
     puerto de 127.0.0.1; la política de seguridad deja llegar solo ahí. */
  var HELPER_URL = "http://127.0.0.1:47815";
  /* El instalador de Windows registra este enlace: lo abre el botón
     Actualizar de arriba y corre el actualizador instalado. */
  var UPDATE_LINK = "qagency-toolbox-update:run";

  /* Equipo por defecto: vacío. El código es público, así que los nombres y
     los NPN del equipo no van aquí: cada persona importa en Ajustes el archivo
     del equipo (QAgency-Equipo.json) que comparte la oficina, y la lista se
     guarda en su navegador. Cada persona tiene:
       name      nombre como sale en Zoho
       ini       iniciales que encabezan la nota y el task
       agentIni  iniciales con las que figura como agente en el reporte de
                 Cliq, si son distintas de las de la nota
       npn       solo para quien figura como agente escritor
       tel       teléfono directo (opcional), para el SMS de Obamacare */
  var TEAM = [];

  var OFFICES = ["QAgency", "ATH Insurance"];
  /* Cómo se presenta cada oficina en el SMS: "Somos QAgency Insurance." */
  var OFFICE_NAMES = { "QAgency": "QAgency Insurance", "ATH Insurance": "ATH Insurance" };

  /* Compañías: `re` reconoce el nombre dentro de un documento, `name` es como
     sale en la nota, `short` como sale en el reporte de Cliq y en los nombres
     de archivo, y `display` como se le escribe al cliente en el SMS y el email.
     En Obamacare y Medicare, `option` marca la lista oficial de la agencia:
     es el texto de la opción en el formulario, y van primero y en el orden
     oficial. Las demás se siguen reconociendo en los documentos y salen como
     «Otra», con su nombre. `state` pide el estado en dos letras: BCBS of GA. */
  /* `tel`: el teléfono de Customer Service de la compañía (Obamacare), que va
     en el email al cliente. Las que no lo tienen hacen avisar al agente. */
  /* Blue Cross Blue Shield de otro estado ("Blue Cross and Blue Shield of
     NC", "BlueCross BlueShield of Texas"): BCBS of con su estado. La de
     Florida es Florida Blue. */
  var BCBS_OF = /\bBCBS\s+of\b|blue\s*cross\s*(?:and\s*|&\s*)?blue\s*shield\s+of\s+(?!florida\b|fl\b)/i;
  var BCBS_STATE = /\b(?:BCBS|Blue\s*Cross\s*(?:and\s*|&\s*)?Blue\s*Shield)\s+of\s+([A-Z]{2})\b/i;
  var CARRIERS = {
    oc: [
      { re: /florida\s*blue|blue\s*cross|bluecare|blueselect|blueoptions|myblue/i, name: "FLORIDA BLUE", display: "Florida Blue", short: "FB", option: "Florida Blue", tel: "(800) 352-2583" },
      { re: BCBS_OF, name: "BCBS OF", short: "BCBS of", display: "BCBS of", option: "BCBS of", state: BCBS_STATE },
      { re: /ambetter|celtic|sunshine\s*health/i, name: "AMBETTER", display: "Ambetter", short: "Ambetter", option: "Ambetter", tel: "(877) 687-1169" },
      { re: /wellpoint/i, name: "WELLPOINT", display: "Wellpoint", short: "Wellpoint", option: "Wellpoint" },
      { re: /unitedhealthcare|united\s*healthcare|\bUHC\b/i, name: "UNITED HEALTHCARE", display: "UnitedHealthcare", short: "UHC", option: "UHC", tel: "(888) 200-0405" },
      { re: /\boscar\b/i, name: "OSCAR", display: "Oscar", short: "Oscar", option: "Oscar", tel: "(855) OSCAR-55" },
      { re: /cigna/i, name: "CIGNA", display: "Cigna", short: "Cigna", option: "Cigna", tel: "(866) 494-2111" },
      { re: /molina/i, name: "MOLINA", display: "Molina", short: "Molina" },
      { re: /aetna/i, name: "AETNA CVS HEALTH", display: "Aetna CVS Health", short: "Aetna" },
      { re: /avmed/i, name: "AVMED", display: "AvMed", short: "AvMed" },
      { re: /health\s*first/i, name: "HEALTH FIRST", display: "Health First", short: "Health First" },
      { re: /amerihealth/i, name: "AMERIHEALTH CARITAS", display: "AmeriHealth Caritas", short: "AmeriHealth" }
    ],
    mc: [
      { re: /humana/i, name: "HUMANA", short: "Humana", option: "Humana" },
      { re: /unitedhealthcare|united\s*healthcare|\bUHC\b|\bAARP\b/i, name: "UNITED HEALTHCARE", short: "UHC", option: "UHC" },
      { re: /aetna/i, name: "AETNA", short: "Aetna", option: "Aetna" },
      { re: /florida\s*blue|blue\s*cross|bluemedicare/i, name: "FLORIDA BLUE", short: "FB", option: "Florida Blue" },
      { re: BCBS_OF, name: "BCBS OF", short: "BCBS of", display: "BCBS of", option: "BCBS of", state: BCBS_STATE },
      /* Healthspring ya no es parte de Cigna: "Cigna Healthspring" es Healthspring */
      { re: /(cigna[\s-]*)?health\s*spring/i, name: "HEALTHSPRING", short: "Healthspring", option: "Healthspring" },
      { re: /devoted/i, name: "DEVOTED HEALTH", short: "Devoted", option: "Devoted" },
      { re: /freedom\s*health/i, name: "FREEDOM HEALTH", short: "Freedom", option: "Freedom" },
      { re: /simply\s*health/i, name: "SIMPLY HEALTHCARE", short: "Simply", option: "Simply" },
      { re: /wellcare/i, name: "WELLCARE", short: "Wellcare" },
      { re: /care\s*plus/i, name: "CAREPLUS", short: "CarePlus" },
      { re: /preferred\s*care/i, name: "PREFERRED CARE PARTNERS", short: "Preferred Care" },
      { re: /cigna/i, name: "CIGNA", short: "Cigna" },
      { re: /molina/i, name: "MOLINA", short: "Molina" },
      { re: /optimum\s*health/i, name: "OPTIMUM HEALTHCARE", short: "Optimum" },
      { re: /doctors\s*health\s*care/i, name: "DOCTORS HEALTHCARE PLANS", short: "Doctors" },
      { re: /leon\s*health/i, name: "LEON HEALTH", short: "Leon" },
      { re: /healthsun/i, name: "HEALTHSUN", short: "HealthSun" },
      { re: /\bsolis\b/i, name: "SOLIS HEALTH PLANS", short: "Solis" },
      { re: /anthem/i, name: "ANTHEM", short: "Anthem" }
    ],
    supp: [
      { re: /florida\s*combined\s*life|\bFCL\b|bluedental|florida\s*blue/i, name: "FLORIDA BLUE (FCL)", short: "FB", display: "Florida Blue" },
      { re: /golden\s*rule|\bGR\b/i, name: "GOLDEN RULE", short: "GR" },
      { re: /unitedhealthcare|united\s*healthcare|\bUHC\b/i, name: "UNITED HEALTHCARE", short: "UHC", display: "UnitedHealthcare" },
      /* Allstate Health Solutions solo nombra a sus aseguradoras (Integon,
         National Health Insurance Company) */
      { re: /allstate|integon|national\s*health\s*insurance\s*company|national\s*general/i, name: "ALLSTATE", short: "Allstate" },
      { re: /usable/i, name: "USABLE LIFE", short: "USAble", display: "USAble Life" },
      { re: /occidental/i, name: "OCCIDENTAL", short: "Occidental" },
      /* las páginas de GeoBlue dicen "Blue Cross Blue Shield Global Solutions" */
      { re: /geo\s*blue|blue\s*cross\s*blue\s*shield\s*global|bcbs\s*global/i, name: "GEOBLUE", short: "Geoblue", display: "GeoBlue" },
      { re: /ameritas|primestar/i, name: "AMERITAS", short: "Ameritas" },
      { re: /humana/i, name: "HUMANA", short: "Humana" },
      { re: /delta\s*dental/i, name: "DELTA DENTAL", short: "Delta Dental" },
      { re: /cigna/i, name: "CIGNA", short: "Cigna" },
      { re: /aetna/i, name: "AETNA", short: "Aetna" },
      { re: /metlife/i, name: "METLIFE", short: "MetLife", display: "MetLife" },
      { re: /guardian/i, name: "GUARDIAN", short: "Guardian" },
      { re: /mutual\s*of\s*omaha/i, name: "MUTUAL OF OMAHA", short: "Mutual of Omaha", display: "Mutual of Omaha" },
      { re: /manhattan\s*life/i, name: "MANHATTAN LIFE", short: "Manhattan Life" },
      { re: /solstice/i, name: "SOLSTICE", short: "Solstice" },
      { re: /dentaquest/i, name: "DENTAQUEST", short: "DentaQuest", display: "DentaQuest" },
      { re: /spirit\s*dental/i, name: "SPIRIT DENTAL", short: "Spirit" }
    ]
  };

  /* Catálogo completo de tasks, en el orden y con las descripciones del
     documento TASK Q AGENCY (actualización 02/01/2026).
       extra    lleva un dato variable dentro del nombre
       review   admite REVIEW al final
       plain    no lleva "VER NOTA fecha (hora)"
       noOwner  tampoco lleva iniciales */
  var TASKS = [
    { id: "mc_mant", cat: "Medicare (MC)", text: "MC MANTENIMIENTO", hint: "App concretadas" },
    { id: "mc_mant_cmd", cat: "Medicare (MC)", text: "MC MANTENIMIENTO CMD", hint: "App concretadas con CMD = condiciones médicas diversas" },
    { id: "mc_fu", cat: "Medicare (MC)", text: "FOLLOW UP MC", hint: "Persona interesada próxima a cumplir 65 o interesada en aplicar con la agencia fuera del AEP" },
    { id: "mc_oe", cat: "Medicare (MC)", text: "FOLLOW UP OPEN ENROLLMENT MC", hint: "Citas para AEP: cliente quiere cambiar o seguimiento de un new contactado interesado" },
    { id: "mc_inactive", cat: "Medicare (MC)", text: "FOLLOW UP LEAD_INACTIVE CLIENT MC", hint: "Persona contactada para recuperar, no interesada por el momento" },
    { id: "mc_soa", cat: "Medicare (MC)", text: "SOA PENDING", hint: "El task se cierra cuando el SOA esté en el Network" },
    { id: "mc_lost", cat: "Medicare (MC)", text: "FOLLOW UP {metodo} MC {n}", extra: "contact", hint: "Se perdió contacto" },
    { id: "mc_pc", cat: "Medicare (MC)", text: "FOLLOW UP P&C", hint: "" },

    { id: "md_fu", cat: "Medicaid (MC)", text: "FOLLOW UP MEDICAID", review: true, hint: "Seguimiento para la renovación" },
    { id: "md_pending", cat: "Medicaid (MC)", text: "FOLLOW UP MEDICAID PENDING", review: true, hint: "En seguimiento para procesar" },
    { id: "md_fs", cat: "Medicaid (MC)", text: "FOLLOW UP MEDICAID_FOODSTAMPS", review: true, hint: "Beneficio médico y alimentos: en seguimiento o para procesar" },
    { id: "md_food", cat: "Medicaid (MC)", text: "FOLLOW UP FOODSTAMPS", review: true, hint: "En seguimiento o para procesar" },
    { id: "md_denied", cat: "Medicaid (MC)", text: "FOLLOW UP MEDICAID DENIED", review: true, hint: "Proceso denegado" },

    { id: "mo_pending", cat: "Medicaid (OC)", text: "MKPL APP MEDICAID PENDING", review: true, hint: "En seguimiento o para procesar: prospecto para OC" },
    { id: "mo_app", cat: "Medicaid (OC)", text: "MKPL APP MEDICAID", review: true, hint: "En seguimiento: prospecto para OC" },
    { id: "mo_denied", cat: "Medicaid (OC)", text: "MKPL APP MEDICAID DENIED", review: true, hint: "Proceso denegado, prospecto para OC" },
    { id: "mo_pending_dep", cat: "Medicaid (OC)", text: "MKPL APP MEDICAID PENDING DEP", review: true, hint: "Para procesar: familiar de un principal en OC no creado en Zoho" },
    { id: "mo_dep", cat: "Medicaid (OC)", text: "MKPL APP MEDICAID DEP", review: true, hint: "Seguimiento: familiar de un principal en OC no creado en Zoho" },
    { id: "mo_denied_dep", cat: "Medicaid (OC)", text: "MKPL APP MEDICAID DENIED DEP", review: true, hint: "Denegado, prospecto para OC" },
    { id: "mo_food_dep", cat: "Medicaid (OC)", text: "FOLLOW UP FOODSTAMPS DEP", review: true, hint: "En seguimiento o para procesar: beneficio de alimentos para familiar de un principal en OC" },
    { id: "mo_temp", cat: "Medicaid (OC)", text: "MKPL APP MEDICAID TEMPORARY", review: true, hint: "Casos de embarazo y personas recién llegadas" },

    { id: "supp_cs", cat: "Supp", text: "FOLLOW UP CUSTOMER SERVICE SUPP", hint: "" },
    { id: "supp_quote", cat: "Supp", text: "FOLLOW UP QUOTE SUPP", hint: "" },
    { id: "supp_st", cat: "Supp", text: "FOLLOW UP RENEWAL SHORT TERM", hint: "" },

    { id: "li_pending", cat: "Life Insurance", text: "LIFE INSURANCE PENDING", hint: "Interesado o con cita" },
    { id: "li_review", cat: "Life Insurance", text: "LIFE INSURANCE REVIEW", hint: "Seguimiento después del proceso, verificar si fue aceptado" },
    { id: "li_annuity", cat: "Life Insurance", text: "ANNUITY PENDING", hint: "" },
    { id: "li_ret", cat: "Life Insurance", text: "RETIREMENT PLAN PENDING", hint: "" },
    { id: "li_plan", cat: "Life Insurance", text: "PLAN DE RETIRO", hint: "" },

    { id: "oc_inactive", cat: "Marketplace (OC)", text: "FOLLOW UP LEAD_INACTIVE CLIENT OC", hint: "Contactados para prospecto, para recuperar, work, Medicaid" },
    { id: "oc_cs", cat: "Marketplace (OC)", text: "FOLLOW UP CUSTOMER SERVICE", extra: "payment", pay: true, hint: "Cliente con app concretadas. Lleva al final la referencia de pago" },
    { id: "oc_cs_dep", cat: "Marketplace (OC)", text: "FOLLOW UP CUSTOMER SERVICE DEP", hint: "Cliente solo dentro de la cobertura, no es principal en ningún plan adicional" },
    { id: "oc_quote", cat: "Marketplace (OC)", text: "MKPL QUOTE PENDING", hint: "Se realizó cotización" },
    { id: "oc_app_pending", cat: "Marketplace (OC)", text: "MKPL APP PENDING", hint: "Solo falta procesar: consent firmado" },
    { id: "oc_oe", cat: "Marketplace (OC)", text: "FOLLOW UP OPEN ENROLLMENT OC", hint: "Citas para OEP: cliente quiere renovar o new contactado interesado" },
    { id: "oc_docs", cat: "Marketplace (OC)", text: "FOLLOW UP DOCS BY {docFecha}", extra: "docs", pay: true, hint: "Lleva la fecha tope de los documentos y la referencia de pago" },
    { id: "oc_lost", cat: "Marketplace (OC)", text: "FOLLOW UP {metodo} OC {n}", extra: "contact", hint: "Se perdió contacto" },
    { id: "oc_consent", cat: "Marketplace (OC)", text: "FOLLOW UP CONSENT", hint: "" },

    { id: "tx_oe", cat: "Taxes", text: "FOLLOW UP OPEN ENROLLMENT TAX {taxYear}", extra: "tax", hint: "Interesado o con cita" },
    { id: "tx_pay", cat: "Taxes", text: "FOLLOW UP PAY PENDING TAX {taxYear}", extra: "tax", hint: "En espera del pago" },
    { id: "tx_consent", cat: "Taxes", text: "FOLLOW UP CONSENT TAX {taxYear}", extra: "tax", hint: "En espera de firma de documento" },
    { id: "tx_fu", cat: "Taxes", text: "FOLLOW UP TAX {taxYear}", extra: "tax", hint: "Proceso concretado" },

    { id: "in_home", cat: "Independientes", text: "HOME VISIT", plain: true, hint: "" },
    { id: "in_ref", cat: "Independientes", text: "REFERRAL 1", plain: true, noOwner: true, hint: "" },

    { id: "ad_aside", cat: "Admin (solo JI)", text: "LEAVE ASIDE", plain: true, noOwner: true, hint: "" },
    { id: "ad_deceased", cat: "Admin (solo JI)", text: "DECEASED", plain: true, noOwner: true, hint: "" },
    { id: "ad_agent", cat: "Admin (solo JI)", text: "AGENT", plain: true, noOwner: true, hint: "" },
    { id: "ad_alfonso", cat: "Admin (solo JI)", text: "AGENT ALFONSO", plain: true, noOwner: true, hint: "" }
  ];

  /* Etiquetas que se agregan al final del task, después de la hora y sin
     paréntesis. Las de pago son excluyentes entre sí. */
  var TASK_TAGS = [
    { v: "PAYMENT", group: "pago", hint: "Tiene prima y el pago está confirmado con el cliente" },
    { v: "NO PAYMENT", group: "pago", hint: "Tiene prima y no ha pagado" },
    { v: "PAYMENT NOT VERIFIED", group: "pago", hint: "Tiene prima; el cliente no contestó para confirmar" },
    { v: "NO PREMIUM", group: "pago", hint: "Revisado y no tiene prima" },
    { v: "CRONIC", hint: "Cliente con una condición crónica" },
    { v: "URGENT", hint: "Requiere atención inmediata" },
    { v: "REVIEW", hint: "Task que solo es de revisión (Medicaid)" }
  ];

  /* Etiquetas finales que se eligen en la nota (selección múltiple), en el
     orden en que se escriben: CRONIC URGENT. */
  var OBS_TAGS = ["CRONIC", "URGENT"];

  /* HHS poverty guidelines (Federal Register): [one person, each additional
     person]. Cost-sharing reductions for plan year Y use the guidelines of
     Y - 1 (2027 coverage uses 2026). */
  var FPL = {
    2025: { base: [15650, 5500], AK: [19550, 6880], HI: [17990, 6330] },
    2026: { base: [15960, 5680], AK: [19950, 7100], HI: [18360, 6530] }
  };

  /* The two digits after a silver plan's HIOS ID say its cost-sharing level:
     the same plan has one Summary of Benefits per level. */
  var CSR_VARIANTS = {
    "01": "Estándar",
    "02": "Sin costos compartidos (nativo americano)",
    "03": "Costos limitados (nativo americano)",
    "04": "CSR 73% AV",
    "05": "CSR 87% AV",
    "06": "CSR 94% AV"
  };

  /* Reglas del documento TASK Q AGENCY, para mostrarlas junto al catálogo. */
  var TASK_RULES = [
    "Las observaciones adicionales van al final, después de la hora de referencia y sin paréntesis. Por ejemplo: URGENT.",
    "En FOLLOW UP CUSTOMER SERVICE y FOLLOW UP DOCS se agrega al final una referencia de pago: PAYMENT, NO PAYMENT, PAYMENT NOT VERIFIED o NO PREMIUM.",
    "Los tasks de Medicaid que solo son de revisión llevan REVIEW al final.",
    "En todos los casos, revisar el procedimiento de llamadas."
  ];

  /* Referencia de pago que se agrega al final del task de customer service. */
  var PAYMENT = [
    { v: "PAYMENT", label: "Pago confirmado", hint: "Tiene prima y el pago está confirmado con el cliente" },
    { v: "NO PAYMENT", label: "Pendiente de pago", hint: "Tiene prima y no ha pagado" },
    { v: "PAYMENT NOT VERIFIED", label: "Pago no verificado", hint: "Tiene prima; el cliente no contestó para confirmar" },
    { v: "NO PREMIUM", label: "Sin prima", hint: "Revisado y no tiene prima" }
  ];

  var CHANNELS = ["Call", "Appointment", "Walk In"];

  /* Tasks que se ofrecen en la nota según la línea. Los demás (Medicaid,
     Life, Taxes…) están en la pestaña Tasks. */
  var LINE_TASK_CATS = { oc: ["Marketplace (OC)"], mc: ["Medicare (MC)"], supp: ["Supp"] };

  var PAY_METHODS = ["Tarjeta CC", "Cuenta de banco"];
  var CANCEL_REASONS = ["Demasiado caro", "Seguro por el trabajo", "Estatus migratorio", "Otro"];
  /* Cancelación de Obamacare: si la cobertura no llegó a empezar (CANCELLED)
     o si termina en un mes (TERMINATED), como dice el nombre del archivo. */
  var CANCEL_TYPES = [
    { v: "cancelled", l: "Cancelada", t: "La cobertura no llegó a empezar: renovación para el próximo año, o app cancelada antes de la fecha efectiva o sin pago" },
    { v: "terminated", l: "Terminada", t: "La cobertura termina en un mes: paso a Medicare o a un seguro del trabajo" }
  ];
  var PARENTESCOS = ["Titular", "Cónyuge", "Hijo/a", "Padre/Madre", "Hermano/a", "Otro"];
  /* Estatus en EE. UU. de cada persona del hogar. "Otro" pide escribirlo. */
  var ESTATUS = [{ v: "ciudadano", l: "Ciudadano" }, { v: "residente", l: "Residente" },
    { v: "permiso", l: "Permiso de trabajo" }, { v: "otro", l: "Otro" }];

  /* Documentos que puede pedir el Mercado por una inconsistencia (data
     matching issue), según healthcare.gov/help/how-do-i-resolve-an-inconsistency.
     label: cómo sale en la nota; file: cómo va en el nombre del archivo
     Docs Submitted; es / en: cómo sale en el email al cliente; docs: lo que
     se puede enviar, con el nombre que usa el Mercado. */
  var MKPL_DOCS = [
    { v: "income", label: "Ingresos", file: "Income", es: "Pruebas de Ingresos", en: "Proof of Income", docs: [
      "Pay stub", "W-2 and/or 1099", "1040 federal or state tax return (with Schedule 1 if filed)",
      "Self-employment ledger / Schedule C / profit and loss statement", "1040 SE with Schedule C, F, or SE",
      "Social Security Benefits Letter", "Unemployment Benefits Letter", "Statement of pension distribution",
      "Annuity statement", "Worker's compensation letter", "Interests and dividends income statement",
      "Letter from employer", "Written explanation form (Other)"] },
    { v: "immigration", label: "Estatus migratorio", file: "Immigration status", es: "Pruebas de Estatus Migratorio", en: "Proof of Immigration Status", docs: [
      "Permanent Resident Card, Green Card (I-551)", "Employment Authorization Card (I-766)",
      "Arrival/Departure Record (I-94/I-94A)", "Arrival/Departure Record in foreign passport (I-94)",
      "Notice of Action (I-797)", "USCIS Acknowledgement of Receipt (I-797C)", "Foreign passport",
      "Reentry Permit (I-327)", "Refugee Travel Document (I-571)",
      "Machine Readable Immigrant Visa (with temporary I-551 language)", "Temporary I-551 Stamp (on Passport or I-94/I-94A)",
      "Certificate of Eligibility for Nonimmigrant Student Status (I-20)",
      "Certificate of Eligibility for Exchange Visitor Status (DS-2019)",
      "Certification from HHS Office of Refugee Resettlement (ORR)", "ORR eligibility letter (if under 18)",
      "Document indicating withholding of removal", "Document of federally recognized Indian tribe or American Indian born in Canada"] },
    { v: "citizenship", label: "Ciudadanía", file: "Citizenship", es: "Pruebas de Ciudadanía", en: "Proof of Citizenship", docs: [
      "U.S. passport", "Certificate of Naturalization (N-550/N-570)", "Certificate of Citizenship (N-560/N-561)",
      "U.S. public birth certificate + photo ID", "Consular Report of Birth Abroad (FS-240) + photo ID",
      "State-issued enhanced driver's license", "Tribal document (enrollment card, CDIB, census or letterhead)",
      "Other U.S. record of birth + photo ID"] },
    { v: "ssn", label: "Seguro Social (SSN)", file: "SSN", es: "Pruebas de Seguro Social", en: "Proof of Social Security Number", docs: [
      "Social Security card", "1040 Tax Return", "W2 and/or 1099s", "Pay stub documentation",
      "Social Security Administration documentation", "1095 (A, B or C)", "W4 Withholding Allowance Certificate",
      "Unemployment Benefits Letter", "Military record", "U.S. Military ID card", "Military dependent's ID card",
      "Court Order Granting a Name Change", "Divorce decree"] },
    { v: "esi", label: "Cobertura del trabajo", file: "Job-based coverage", es: "Pruebas de Cobertura del Trabajo", en: "Proof of Job-Based Coverage", docs: [
      "Employer Coverage Tool + cover letter signed by employer", "Letter from employer",
      "Health insurance letter with coverage and expiration dates"] },
    { v: "medicaid", label: "Medicaid / CHIP", file: "Medicaid CHIP", es: "Pruebas de Medicaid / CHIP", en: "Proof of Medicaid / CHIP", docs: [
      "Letter from Medicaid/CHIP agency: not enrolled or eligible", "Letter from Medicaid agency: program is not qualifying coverage",
      "Letter describing recent coverage (Other)"] },
    { v: "medicare", label: "Medicare", file: "Medicare", es: "Pruebas de Medicare", en: "Proof of Medicare", docs: [
      "Letter from Medicare or SSA: not eligible for premium-free Part A", "Letter describing why not eligible for Part A (Other)"] },
    { v: "aian", label: "Indígena americano / nativo de Alaska", file: "American Indian status", es: "Pruebas de Indígena Americano / Nativo de Alaska", en: "Proof of American Indian / Alaska Native Status", docs: [
      "Tribal Enrollment/Membership card", "Document issued by Bureau of Indian Affairs (BIA)",
      "Certificate of Degree of Indian Blood", "Document from Indian Health Service (IHS)",
      "Authentic document from a federally recognized tribe", "Certificate of Indian status card", "I-872 American Indian Card"] },
    { v: "tricare", label: "TRICARE", file: "TRICARE", es: "Pruebas de TRICARE", en: "Proof of TRICARE", docs: [
      "Letter from TRICARE with end or un-enrollment date", "Letter from TRICARE confirming ineligibility",
      "Document showing life change that ends TRICARE eligibility", "Letter describing TRICARE enrollment (Other)"] },
    { v: "va", label: "VA", file: "VA coverage", es: "Pruebas de Cobertura de VA", en: "Proof of VA Coverage", docs: ["Letter from the VA with expiration date of coverage", "Letter describing no VA coverage (Other)"] },
    { v: "peace", label: "Peace Corps", file: "Peace Corps", es: "Pruebas de Peace Corps", en: "Proof of Peace Corps Coverage", docs: ["Letter from the Peace Corps with expiration date of coverage", "Letter describing no Peace Corps coverage (Other)"] }
  ];
  var MODALIDADES = ["presencial", "telefónica", "Zoom", "en casa"];

  /* Secciones del formulario. Cada situación decide cuáles se muestran. */
  var S_FULL_MC = ["cliente", "medicare", "proceso", "plan", "agente", "network"];
  var S_FULL_SU = ["cliente", "proceso", "plan", "pago", "agente", "network"];

  /* Situaciones (resultado de la gestión) por línea de negocio. El texto de
     la nota y del SMS para cada una está en notes.js.
       pendiente / proximo   texto sugerido, siempre editable
       task       id del task por defecto
       report     true si la gestión se reporta en Cliq
       submission true si es una aplicación enviada: la nota termina con
                  «Se reporta en el botón rojo»
       noSms      la situación no lleva mensaje para el cliente
       network    documentos de Network propios de la situación (si no, los
                  de la línea); `suffix` va al final del nombre del archivo

     Documentos de Network: `file` es el nombre con que se guarda el archivo,
     en el formato oficial de la agencia, sin el cliente delante ni el año y
     mes detrás. Admite {carrier} (la forma corta: FB) y {product}. `date`
     dice de dónde salen el año y el mes: note (fecha de la nota), effective
     (inicio de la cobertura), soa (firma del SOA), payment (fecha del pago),
     termination (fin de la cobertura) o plan (solo el año del plan).
     `tipoCancel` limita el documento a una cancelación (cancelled: la
     cobertura no llegó a empezar) o a una terminación (terminated).
     `perDoc` da un archivo por cada documento pedido que se marcó como
     enviado: {doc} es el `file` de MKPL_DOCS, con el nombre de pila delante
     si es de otra persona del hogar ("Yanet_Immigration status"). */
  var LINES = {
    oc: {
      label: "Obamacare",
      code: "OC",
      gestiones: [
        { v: "nueva", label: "Nueva inscripción", proc: "App OC" },
        { v: "renovacion", label: "Renovación", proc: "Renew OC" },
        { v: "cambio", label: "Cambio de vida", proc: "OC Life Change" }
      ],
      outcomes: [
        { id: "enviada", label: "App enviada", desc: "Aplicación procesada y plan seleccionado",
          submission: true, task: "oc_cs", report: true,
          sections: ["cliente", "proceso", "plan", "pago", "docsreq", "agente", "network"] },
        { id: "pendiente", label: "Pendiente", desc: "Cotización, consent por firmar o app lista para procesar",
          task: "oc_consent", noSms: true,
          sections: ["cliente", "proceso", "planes", "agente", "network"],
          network: [{ k: "consent", label: "Carta de consentimiento recibida", file: "OC_Consent {carrier}", date: "note" }] },
        { id: "cancelada", label: "Cancelación", desc: "Se cancela o termina la póliza",
          task: "oc_inactive", report: true, cancelled: true,
          sections: ["cliente", "cancelacion", "network"],
          network: [
            { k: "plans", label: "My Plans & Programs (CANCELLED)", file: "OC_My Plans & Programs {carrier}", date: "effective", suffix: " CANCELLED", tipoCancel: "cancelled" },
            { k: "plans", label: "My Plans & Programs (TERMINATED)", file: "OC_My Plans & Programs {carrier}", date: "termination", suffix: " TERMINATED", tipoCancel: "terminated" }
          ] }
      ],
      network: [
        { k: "appsummary", label: "App Summary", file: "OC_App Summary", date: "plan" },
        { k: "eligibility", label: "Eligibility Letter", file: "OC_EligibilityNotice", date: "plan" },
        { k: "plans", label: "My Plans & Programs", file: "OC_My Plans & Programs {carrier}", date: "effective" },
        { k: "payment", label: "Pago", file: "Payment Confirmation - OC_{carrier}", date: "payment" },
        { k: "consent", label: "Consent", file: "OC_Consent {carrier}", date: "note" },
        { k: "docsub", label: "Docs Submitted", file: "OC_Docs Submitted_{doc}", date: "note", perDoc: true }
      ]
    },

    mc: {
      label: "Medicare Advantage",
      code: "MC",
      gestiones: [
        { v: "nueva", label: "Solicitud nueva", proc: "App MC" },
        { v: "cambio", label: "Cambio de plan o compañía", proc: "App MC", suffix: "_Change" }
      ],
      outcomes: [
        { id: "enviada", label: "App enviada", desc: "Solicitud enviada en el portal de la compañía",
          submission: true, pendiente: "", proximo: "Seguimiento de mantenimiento",
          task: "mc_mant", report: true, sections: S_FULL_MC },
        { id: "sincambio", label: "Sin cambios", desc: "Se revisa y se queda con su plan actual",
          pendiente: "", proximo: "", noSms: true,
          /* el reporte va al canal NO CHANGE de Cliq; solo se guarda el SOA */
          task: "mc_mant", report: true, sections: ["cliente", "plan", "network"],
          network: [{ k: "soa", label: "SOA", file: "Medicare_SOA", date: "soa" }] }
      ],
      /* el SOA de una app o un cambio lleva la compañía; el de Sin cambios, no */
      network: [
        { k: "soa", label: "SOA", file: "Medicare_{carrier}_SOA", date: "soa" },
        { k: "appsummary", label: "App", file: "Medicare_{carrier}_App", date: "effective" }
      ]
    },

    supp: {
      label: "Suplementario",
      code: "SUPP",
      gestiones: [
        { v: "nueva", label: "Aplicación nueva", proc: "App" },
        { v: "renovacion", label: "Renovación", proc: "Renew" }
      ],
      outcomes: [
        { id: "enviada", label: "App enviada", desc: "Aplicación enviada a la compañía",
          submission: true, task: "supp_cs", report: true, sections: S_FULL_SU },
        { id: "cotizacion", label: "Cotización", desc: "Se cotizó, el cliente queda en decidir",
          task: "supp_quote", sections: ["cliente", "proceso", "plan"] }
      ],
      /* estados del pago que se ofrecen en Suplementario */
      pagos: ["PAYMENT", "NO PAYMENT"],
      /* v: lo que se elige; es: cómo se nombra en la nota; sms y smsEn: cómo
         se le nombra al cliente en español y en inglés; file: cómo va en el
         nombre del archivo y en el reporte de Cliq */
      productos: [
        { v: "Dental", es: "Dental", sms: "seguro dental", smsEn: "dental insurance", file: "Dental" },
        { v: "Vision", es: "Visión", sms: "seguro de visión", smsEn: "vision insurance", file: "Vision" },
        { v: "Dental + Vision", es: "Dental y Visión", sms: "seguro dental y de visión", smsEn: "dental and vision insurance", file: "Dental" },
        { v: "Hospital", es: "Hospital", sms: "seguro de hospital", smsEn: "hospital insurance", file: "Hospital" },
        { v: "Accident", es: "Accidente", sms: "seguro de accidentes", smsEn: "accident insurance", file: "Accident" },
        { v: "Cancer", es: "Cáncer", sms: "seguro de cáncer", smsEn: "cancer insurance", file: "Cancer" },
        { v: "Short Term", es: "Short Term", sms: "seguro Short Term", smsEn: "Short Term insurance", file: "Short Term" },
        { v: "Life", es: "Vida", sms: "seguro de vida", smsEn: "life insurance", file: "Life" },
        { v: "International", es: "Internacional", sms: "seguro internacional", smsEn: "international insurance", file: "International" },
        { v: "Discount Plan", es: "Plan de descuento", sms: "plan de descuento", smsEn: "discount plan", file: "Discount" },
        { v: "Otro", es: "", sms: "seguro", smsEn: "insurance", file: "Supp" }
      ],
      network: [
        { k: "appsummary", label: "Aplicación", file: "{product}_{carrier}", date: "effective" },
        { k: "payment", label: "Pago", file: "Payment Confirmation - {product}_{carrier}", date: "payment" },
        { k: "card", label: "ID card", file: "{product}_{carrier} - CARD", date: "effective" }
      ]
    }
  };

  var api = {
    VERSION: VERSION, UPDATE_URL: UPDATE_URL, HELPER_URL: HELPER_URL, UPDATE_LINK: UPDATE_LINK, TEAM: TEAM, OFFICES: OFFICES, OFFICE_NAMES: OFFICE_NAMES, CARRIERS: CARRIERS, TASKS: TASKS, PAYMENT: PAYMENT,
    TASK_TAGS: TASK_TAGS, OBS_TAGS: OBS_TAGS, TASK_RULES: TASK_RULES, FPL: FPL, CSR_VARIANTS: CSR_VARIANTS,
    CHANNELS: CHANNELS, MODALIDADES: MODALIDADES, LINES: LINES, LINE_TASK_CATS: LINE_TASK_CATS,
    PAY_METHODS: PAY_METHODS, CANCEL_REASONS: CANCEL_REASONS, CANCEL_TYPES: CANCEL_TYPES, PARENTESCOS: PARENTESCOS, ESTATUS: ESTATUS, MKPL_DOCS: MKPL_DOCS
  };
  root.QA = root.QA || {};
  root.QA.config = api;
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})(typeof window !== "undefined" ? window : globalThis);
