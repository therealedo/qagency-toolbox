/* Q Agency Toolbox — catálogos y configuración.
   Todo lo que cambia con el tiempo (equipo, compañías, tasks, situaciones)
   vive en este archivo para poder actualizarlo sin tocar la lógica. */
(function (root) {
  "use strict";

  var VERSION = "1.1.0";

  /* Equipo por defecto. Cada persona puede editarlo en Ajustes; los cambios
     se guardan en su navegador.
       ini       iniciales que encabezan la nota y el task
       agentIni  iniciales con las que figura como agente en el reporte de
                 Cliq, si son distintas (Ana firma las notas como DI y
                 aparece como agente LI)
       npn       solo para quien figura como agente escritor */
  var TEAM = [
    { name: "Daniel Rivas", ini: "ER", npn: "10000004" },
    { name: "Rosa Mendez", ini: "FV", npn: "10000002" },
    { name: "Marta Gil Romero", ini: "LE", npn: "10000003" },
    { name: "Ana Torres", ini: "DI", agentIni: "LI", npn: "10000001" },
    { name: "My Access", ini: "MA", npn: "" },
    { name: "Pablo Ruiz", ini: "PD", npn: "" }
  ];

  var OFFICES = ["QAgency", "ATH Insurance"];

  /* Compañías: `re` reconoce el nombre dentro de un documento, `name` es como
     sale en la nota y `short` como sale en el reporte de Cliq. */
  var CARRIERS = {
    oc: [
      { re: /florida\s*blue|blue\s*cross|bluecare|blueselect|blueoptions|myblue/i, name: "FLORIDA BLUE", short: "FB" },
      { re: /ambetter|celtic|sunshine\s*health/i, name: "AMBETTER", short: "Ambetter" },
      { re: /\boscar\b/i, name: "OSCAR", short: "Oscar" },
      { re: /molina/i, name: "MOLINA", short: "Molina" },
      { re: /aetna/i, name: "AETNA CVS HEALTH", short: "Aetna" },
      { re: /cigna/i, name: "CIGNA", short: "Cigna" },
      { re: /unitedhealthcare|united\s*healthcare|\bUHC\b/i, name: "UNITED HEALTHCARE", short: "UHC" },
      { re: /avmed/i, name: "AVMED", short: "AvMed" },
      { re: /health\s*first/i, name: "HEALTH FIRST", short: "Health First" },
      { re: /wellpoint/i, name: "WELLPOINT", short: "Wellpoint" },
      { re: /amerihealth/i, name: "AMERIHEALTH CARITAS", short: "AmeriHealth" }
    ],
    mc: [
      { re: /humana/i, name: "HUMANA", short: "Humana" },
      { re: /aetna/i, name: "AETNA", short: "Aetna" },
      { re: /unitedhealthcare|united\s*healthcare|\bUHC\b|\bAARP\b/i, name: "UNITED HEALTHCARE", short: "UHC" },
      { re: /wellcare/i, name: "WELLCARE", short: "Wellcare" },
      { re: /devoted/i, name: "DEVOTED HEALTH", short: "Devoted" },
      { re: /care\s*plus/i, name: "CAREPLUS", short: "CarePlus" },
      { re: /preferred\s*care/i, name: "PREFERRED CARE PARTNERS", short: "Preferred Care" },
      { re: /simply\s*health/i, name: "SIMPLY HEALTHCARE", short: "Simply" },
      { re: /florida\s*blue|blue\s*cross|bluemedicare/i, name: "FLORIDA BLUE", short: "FB" },
      { re: /cigna|healthspring/i, name: "CIGNA", short: "Cigna" },
      { re: /molina/i, name: "MOLINA", short: "Molina" },
      { re: /freedom\s*health/i, name: "FREEDOM HEALTH", short: "Freedom" },
      { re: /optimum\s*health/i, name: "OPTIMUM HEALTHCARE", short: "Optimum" },
      { re: /doctors\s*health\s*care/i, name: "DOCTORS HEALTHCARE PLANS", short: "Doctors" },
      { re: /leon\s*health/i, name: "LEON HEALTH", short: "Leon" },
      { re: /healthsun/i, name: "HEALTHSUN", short: "HealthSun" },
      { re: /\bsolis\b/i, name: "SOLIS HEALTH PLANS", short: "Solis" },
      { re: /anthem/i, name: "ANTHEM", short: "Anthem" }
    ],
    supp: [
      { re: /florida\s*combined\s*life|\bFCL\b|bluedental|florida\s*blue/i, name: "FLORIDA BLUE (FCL)", short: "FB" },
      { re: /unitedhealthcare|united\s*healthcare|\bUHC\b|golden\s*rule/i, name: "UNITED HEALTHCARE", short: "UHC" },
      { re: /ameritas|primestar/i, name: "AMERITAS", short: "Ameritas" },
      { re: /humana/i, name: "HUMANA", short: "Humana" },
      { re: /delta\s*dental/i, name: "DELTA DENTAL", short: "Delta Dental" },
      { re: /cigna/i, name: "CIGNA", short: "Cigna" },
      { re: /aetna/i, name: "AETNA", short: "Aetna" },
      { re: /metlife/i, name: "METLIFE", short: "MetLife" },
      { re: /guardian/i, name: "GUARDIAN", short: "Guardian" },
      { re: /mutual\s*of\s*omaha/i, name: "MUTUAL OF OMAHA", short: "Mutual of Omaha" },
      { re: /manhattan\s*life/i, name: "MANHATTAN LIFE", short: "Manhattan Life" },
      { re: /solstice/i, name: "SOLSTICE", short: "Solstice" },
      { re: /dentaquest/i, name: "DENTAQUEST", short: "DentaQuest" },
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
    { id: "oc_cs", cat: "Marketplace (OC)", text: "FOLLOW UP CUSTOMER SERVICE", extra: "payment", hint: "Cliente con app concretadas. Lleva al final la referencia de pago" },
    { id: "oc_cs_dep", cat: "Marketplace (OC)", text: "FOLLOW UP CUSTOMER SERVICE DEP", hint: "Cliente solo dentro de la cobertura, no es principal en ningún plan adicional" },
    { id: "oc_quote", cat: "Marketplace (OC)", text: "MKPL QUOTE PENDING", hint: "Se realizó cotización" },
    { id: "oc_app_pending", cat: "Marketplace (OC)", text: "MKPL APP PENDING", hint: "Solo falta procesar: consent firmado" },
    { id: "oc_oe", cat: "Marketplace (OC)", text: "FOLLOW UP OPEN ENROLLMENT OC", hint: "Citas para OEP: cliente quiere renovar o new contactado interesado" },
    { id: "oc_docs", cat: "Marketplace (OC)", text: "FOLLOW UP DOCS BY {docFecha}", extra: "docs", hint: "Lleva la fecha tope de los documentos" },
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
    { v: "URGENT", hint: "Requiere atención inmediata" },
    { v: "REVIEW", hint: "Task que solo es de revisión (Medicaid)" }
  ];

  /* Reglas del documento TASK Q AGENCY, para mostrarlas junto al catálogo. */
  var TASK_RULES = [
    "Las observaciones adicionales van al final, después de la hora de referencia y sin paréntesis. Por ejemplo: URGENT.",
    "En FOLLOW UP CUSTOMER SERVICE se agrega al final una referencia de pago: PAYMENT, NO PAYMENT, PAYMENT NOT VERIFIED o NO PREMIUM.",
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
  var MODALIDADES = ["presencial", "telefónica", "Zoom", "en casa"];

  /* Secciones del formulario. Cada situación decide cuáles se muestran. */
  var S_FULL_OC = ["cliente", "hogar", "proceso", "plan", "costos", "pago", "docsreq", "agente", "network"];
  var S_PLAN_OC = ["cliente", "hogar", "proceso", "plan", "costos", "agente", "network"];
  var S_FULL_MC = ["cliente", "medicare", "proceso", "plan", "agente", "network"];
  var S_PLAN_MC = ["cliente", "medicare", "proceso", "plan", "network"];
  var S_FULL_SU = ["cliente", "proceso", "plan", "pago", "agente", "network"];
  var S_LIGHT = ["cliente", "proceso"];

  /* Situaciones (resultado de la gestión) por línea de negocio.
       estatus    lo que sale en la línea ESTATUS de la nota
       cierre     segunda frase de la narrativa; admite {plataforma}, {seg}
       pendiente / proximo   texto sugerido, siempre editable
       task       id del task por defecto
       report     true si la gestión se reporta en Cliq
       submission true si es una aplicación enviada: la nota termina con el
                  task y con «Se reporta en el botón rojo» */
  var LINES = {
    oc: {
      label: "Obamacare",
      code: "OC",
      product: "Seguro Médico del Mercado",
      gestiones: [
        { v: "nueva", label: "Nueva inscripción", proc: "App OC", motivo: "para realizar su aplicación de Seguro Médico del Mercado" },
        { v: "renovacion", label: "Renovación", proc: "Renew OC", motivo: "para la renovación de su Seguro Médico del Mercado" },
        { v: "cambio", label: "Cambio de vida", proc: "OC Life Change", motivo: "para reportar un cambio en su aplicación del Mercado" }
      ],
      outcomes: [
        { id: "enviada", label: "App enviada", desc: "Aplicación procesada y plan seleccionado",
          submission: true,
          estatus: "APLICACIÓN ENVIADA", cierre: "Se envía la aplicación en {plataforma} con los siguientes datos:",
          pendiente: "", proximo: "Seguimiento de servicio al cliente",
          task: "oc_cs", report: true, sections: S_FULL_OC },
        { id: "lista", label: "Lista para procesar", desc: "Consent firmado, solo falta procesar",
          estatus: "LISTA PARA PROCESAR - CONSENT FIRMADO", cierre: "Se recibe el consentimiento firmado. La aplicación queda lista para procesar con los siguientes datos:",
          pendiente: "Procesar la aplicación", proximo: "Procesar la aplicación en {plataforma}",
          task: "oc_app_pending", sections: S_PLAN_OC },
        { id: "consent", label: "Esperando consent", desc: "Se habló con el cliente, falta la firma",
          estatus: "EN ESPERA DEL CONSENT", cierre: "Se revisan las opciones con el cliente y se envía el consentimiento para firma.",
          pendiente: "Cliente debe firmar el consentimiento", proximo: "Procesar la aplicación al recibir el consent",
          task: "oc_consent", sections: S_PLAN_OC },
        { id: "cotizacion", label: "Cotización", desc: "Se cotizó, el cliente queda en decidir",
          estatus: "COTIZACIÓN REALIZADA", cierre: "Se realiza la cotización y se le explican las opciones al cliente.",
          pendiente: "Cliente debe confirmar el plan", proximo: "Contactar al cliente para definir el plan",
          task: "oc_quote", sections: S_PLAN_OC },
        { id: "docs", label: "Docs pendientes", desc: "El Mercado pide documentos",
          estatus: "DOCUMENTOS PENDIENTES", cierre: "Se le indica al cliente qué documentos debe enviar y la fecha tope.",
          pendiente: "Cliente debe enviar los documentos requeridos", proximo: "Subir los documentos al Mercado",
          task: "oc_docs", sections: ["cliente", "proceso", "plan", "docsreq", "network"] },
        { id: "pago", label: "Pago", desc: "Se gestiona o verifica el pago de la prima",
          estatus: "GESTIÓN DE PAGO", cierre: "",
          pendiente: "", proximo: "Seguimiento de servicio al cliente",
          task: "oc_cs", sections: ["cliente", "plan", "costos", "pago", "network"] },
        { id: "cita", label: "Cita OEP", desc: "Quiere renovar o está interesado; queda con cita",
          estatus: "CITA AGENDADA", cierre: "El cliente está interesado y se agenda cita{seg}.",
          pendiente: "Atender la cita", proximo: "Cita con el cliente",
          task: "oc_oe", sections: S_LIGHT },
        { id: "sincontacto", label: "Sin contacto", desc: "No contesta",
          estatus: "SIN CONTACTO", cierre: "",
          pendiente: "Lograr contacto con el cliente", proximo: "Volver a contactar al cliente",
          task: "oc_lost", sections: ["cliente", "proceso", "contacto"] },
        { id: "nointeresado", label: "No interesado", desc: "Prospecto o cliente inactivo por ahora",
          estatus: "NO INTERESADO POR EL MOMENTO", cierre: "El cliente indica que no está interesado por el momento.",
          pendiente: "", proximo: "Contactar más adelante para recuperar",
          task: "oc_inactive", sections: S_LIGHT },
        { id: "cancelada", label: "Cancelación", desc: "Se cancela o termina la póliza",
          estatus: "PÓLIZA CANCELADA", cierre: "La cancelación se realiza a solicitud del cliente con los siguientes datos:",
          pendiente: "", proximo: "Verificar que la cancelación se refleje en el sistema",
          task: "oc_cs", report: true, cancelled: true, sections: ["cliente", "proceso", "plan", "agente", "network"] }
      ],
      network: [
        { k: "consent", label: "Consent" },
        { k: "appsummary", label: "App Summary" },
        { k: "eligibility", label: "Eligibility Letter" },
        { k: "plans", label: "My Plans & Programs" },
        { k: "payment", label: "Comprobante de pago" }
      ]
    },

    mc: {
      label: "Medicare",
      code: "MC",
      product: "Medicare",
      gestiones: [
        { v: "nueva", label: "Solicitud nueva", proc: "App MC", motivo: "para realizar su aplicación de Medicare" },
        { v: "cambio", label: "Cambio de plan o compañía", proc: "App MC", suffix: "_Change", motivo: "para realizar un cambio de plan de Medicare" }
      ],
      outcomes: [
        { id: "enviada", label: "App enviada", desc: "Solicitud enviada en el portal de la compañía",
          submission: true,
          estatus: "SOLICITUD ENVIADA", cierre: "Se envía la solicitud en el portal de la compañía con los siguientes datos:",
          pendiente: "", proximo: "Seguimiento de mantenimiento",
          task: "mc_mant", report: true, sections: S_FULL_MC },
        { id: "soa", label: "SOA pendiente", desc: "Falta el Scope of Appointment firmado",
          estatus: "EN ESPERA DEL SOA", cierre: "Se envía el SOA para firma antes de revisar los planes.",
          pendiente: "Cliente debe firmar el SOA", proximo: "Atender al cliente al recibir el SOA",
          task: "mc_soa", sections: S_PLAN_MC },
        { id: "cita", label: "Cita AEP", desc: "Quiere cambiar o está interesado; queda con cita",
          estatus: "CITA AGENDADA", cierre: "El cliente está interesado y se agenda cita{seg}.",
          pendiente: "Atender la cita", proximo: "Cita con el cliente",
          task: "mc_oe", sections: S_PLAN_MC },
        { id: "sincambio", label: "Sin cambios", desc: "Se revisa y se queda con su plan actual",
          estatus: "SE MANTIENE EN SU PLAN", cierre: "Se revisan los beneficios para el próximo año y el cliente decide mantenerse en su plan actual.",
          pendiente: "", proximo: "Seguimiento de mantenimiento",
          task: "mc_mant", sections: ["cliente", "medicare", "plan", "network"] },
        { id: "interesado", label: "Interesado", desc: "Próximo a cumplir 65 o fuera del AEP",
          estatus: "INTERESADO", cierre: "El cliente está interesado en aplicar con la agencia.",
          pendiente: "", proximo: "Contactar al cliente cuando se abra su período de elección",
          task: "mc_fu", sections: ["cliente", "medicare", "proceso"] },
        { id: "sincontacto", label: "Sin contacto", desc: "No contesta",
          estatus: "SIN CONTACTO", cierre: "",
          pendiente: "Lograr contacto con el cliente", proximo: "Volver a contactar al cliente",
          task: "mc_lost", sections: ["cliente", "proceso", "contacto"] },
        { id: "nointeresado", label: "No interesado", desc: "Contactado para recuperar, no por ahora",
          estatus: "NO INTERESADO POR EL MOMENTO", cierre: "El cliente indica que no está interesado por el momento.",
          pendiente: "", proximo: "Contactar más adelante para recuperar",
          task: "mc_inactive", sections: S_LIGHT },
        { id: "cancelada", label: "Cancelación", desc: "Se cancela la solicitud o el plan",
          estatus: "SOLICITUD CANCELADA", cierre: "La cancelación se realiza a solicitud del cliente con los siguientes datos:",
          pendiente: "", proximo: "Verificar que la cancelación se refleje en el sistema",
          task: "mc_mant", report: true, cancelled: true, sections: ["cliente", "medicare", "proceso", "plan", "agente", "network"] }
      ],
      network: [
        { k: "soa", label: "SOA" },
        { k: "appsummary", label: "App Summary" },
        { k: "confirmation", label: "Confirmación" }
      ]
    },

    supp: {
      label: "Suplementario",
      code: "SUPP",
      product: "seguro suplementario",
      gestiones: [
        { v: "nueva", label: "Aplicación nueva", proc: "App", motivo: "para realizar su aplicación de {producto}" },
        { v: "renovacion", label: "Renovación", proc: "Renew", motivo: "para la renovación de su {producto}" },
        { v: "cambio", label: "Cambio de plan", proc: "App", suffix: "_Change", motivo: "para realizar un cambio en su {producto}" }
      ],
      outcomes: [
        { id: "enviada", label: "App enviada", desc: "Aplicación enviada a la compañía",
          submission: true,
          estatus: "APLICACIÓN ENVIADA", cierre: "Se envía la aplicación con los siguientes datos:",
          pendiente: "", proximo: "Seguimiento de servicio al cliente",
          task: "supp_cs", report: true, sections: S_FULL_SU },
        { id: "cotizacion", label: "Cotización", desc: "Se cotizó, el cliente queda en decidir",
          estatus: "COTIZACIÓN REALIZADA", cierre: "Se realiza la cotización y se le explican las opciones al cliente.",
          pendiente: "Cliente debe confirmar el plan", proximo: "Contactar al cliente para definir el plan",
          task: "supp_quote", sections: ["cliente", "proceso", "plan"] },
        { id: "pago", label: "Pago", desc: "Se gestiona o verifica el pago",
          estatus: "GESTIÓN DE PAGO", cierre: "",
          pendiente: "", proximo: "Seguimiento de servicio al cliente",
          task: "supp_cs", sections: ["cliente", "plan", "pago", "network"] },
        { id: "shortterm", label: "Renovar Short Term", desc: "Seguimiento para renovar un Short Term",
          estatus: "RENOVACIÓN PENDIENTE", cierre: "Se le explican al cliente las opciones para renovar.",
          pendiente: "Renovar el plan antes del vencimiento", proximo: "Contactar al cliente para renovar",
          task: "supp_st", sections: ["cliente", "proceso", "plan"] },
        { id: "cancelada", label: "Cancelación", desc: "Se cancela la póliza",
          estatus: "PÓLIZA CANCELADA", cierre: "La cancelación se realiza a solicitud del cliente con los siguientes datos:",
          pendiente: "", proximo: "Verificar que la cancelación se refleje en el sistema",
          task: "supp_cs", report: true, cancelled: true, sections: ["cliente", "proceso", "plan", "agente"] }
      ],
      productos: [
        { v: "Dental", note: "Seguro Dental" },
        { v: "Vision", note: "Seguro de Visión" },
        { v: "Dental + Vision", note: "Seguro Dental y de Visión" },
        { v: "Hospital", note: "Seguro de Hospitalización" },
        { v: "Accident", note: "Seguro de Accidentes" },
        { v: "Cancer", note: "Seguro de Cáncer" },
        { v: "Short Term", note: "Seguro Short Term" },
        { v: "Otro", note: "seguro suplementario" }
      ],
      network: [
        { k: "appsummary", label: "Aplicación" },
        { k: "consent", label: "Consent" },
        { k: "payment", label: "Comprobante de pago" }
      ]
    }
  };

  var api = {
    VERSION: VERSION, TEAM: TEAM, OFFICES: OFFICES, CARRIERS: CARRIERS, TASKS: TASKS, PAYMENT: PAYMENT,
    TASK_TAGS: TASK_TAGS, TASK_RULES: TASK_RULES,
    CHANNELS: CHANNELS, MODALIDADES: MODALIDADES, LINES: LINES
  };
  root.QA = root.QA || {};
  root.QA.config = api;
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})(typeof window !== "undefined" ? window : globalThis);
